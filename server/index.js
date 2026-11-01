import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer as createHttpServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { extname, join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WebSocketServer } from 'ws';
import { C2S, ERR, S2C } from '../shared/protocol.js';
import { GameError, RoomRegistry } from './rooms.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CLIENT_DIR = join(ROOT, 'client');
const SHARED_DIR = join(ROOT, 'shared');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
};

const HEARTBEAT_MS = 30_000;
const RATE_WINDOW_MS = 5_000;
const RATE_MAX_MESSAGES = 40;

/** Trova il file statico richiesto, o null. Blocca path traversal e file nascosti (._*, .env...). */
async function resolveStatic(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;

  const isShared = decoded.startsWith('/shared/');
  const base = isShared ? SHARED_DIR : CLIENT_DIR;
  let rel = isShared ? decoded.slice('/shared/'.length) : decoded.slice(1);
  if (rel === '' || rel.endsWith('/')) rel += 'index.html';

  const full = join(base, rel);
  if (!full.startsWith(base + sep)) return null;
  if (relative(base, full).split(sep).some((part) => part.startsWith('.'))) return null;

  try {
    const info = await stat(full);
    return info.isFile() ? { full, size: info.size } : null;
  } catch {
    return null;
  }
}

async function handleHttp(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  let pathname;
  try {
    pathname = new URL(req.url, 'http://localhost').pathname;
  } catch {
    res.writeHead(400).end();
    return;
  }
  if (pathname === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }).end('ok');
    return;
  }
  const file = await resolveStatic(pathname);
  if (!file) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Non trovato');
    return;
  }
  res.writeHead(200, {
    'Content-Type': MIME[extname(file.full).toLowerCase()] ?? 'application/octet-stream',
    'Content-Length': file.size,
    'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  const stream = createReadStream(file.full);
  stream.on('error', () => res.destroy());
  stream.pipe(res);
}

/** I browser inviano sempre Origin sui WebSocket: accettiamo solo il nostro stesso sito. */
function sameOrigin(req) {
  const { origin } = req.headers;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

function rejectUpgrade(socket, status, text) {
  socket.write(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}

function dispatch(registry, conn, msg) {
  switch (msg.t) {
    case C2S.CREATE: return registry.create(conn, msg.name);
    case C2S.JOIN: return registry.join(conn, msg.code, msg.name);
    case C2S.RESUME: return registry.resume(conn, msg.token);
    case C2S.SET_ROLE: return registry.setRole(conn, msg.role);
    case C2S.SET_PARTY: return registry.setParty(conn, msg.party);
    case C2S.READY: return registry.setReady(conn, msg.ready);
    case C2S.START: return registry.start(conn);
    case C2S.LAW_ADD: return registry.lawAdd(conn, msg.articleId);
    case C2S.LAW_REMOVE: return registry.lawRemove(conn, msg.articleId);
    case C2S.LAW_AGREE: return registry.lawAgree(conn, msg.agree);
    case C2S.LAW_SUBMIT: return registry.lawSubmit(conn);
    case C2S.LEAVE: return registry.leave(conn);
    default: throw new GameError(ERR.BAD_REQUEST, 'Messaggio non riconosciuto.');
  }
}

export function createGameServer({ registry = new RoomRegistry() } = {}) {
  const http = createHttpServer(handleHttp);
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });

  http.on('upgrade', (req, socket, head) => {
    let pathname;
    try {
      pathname = new URL(req.url, 'http://localhost').pathname;
    } catch {
      rejectUpgrade(socket, 400, 'Bad Request');
      return;
    }
    if (pathname !== '/ws') {
      rejectUpgrade(socket, 404, 'Not Found');
    } else if (!sameOrigin(req)) {
      rejectUpgrade(socket, 403, 'Forbidden');
    } else {
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
    }
  });

  wss.on('connection', (ws) => {
    const conn = {
      player: null,
      send: (msg) => {
        if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
      },
      close: () => ws.close(4000, 'sostituita da un nuovo collegamento'),
    };
    const fail = (code, message) => conn.send({ t: S2C.ERROR, code, message });

    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    let windowStart = Date.now();
    let count = 0;
    ws.on('message', (data, isBinary) => {
      const now = Date.now();
      if (now - windowStart > RATE_WINDOW_MS) {
        windowStart = now;
        count = 0;
      }
      if (++count > RATE_MAX_MESSAGES) {
        ws.close(1008, 'troppi messaggi');
        return;
      }
      let msg;
      try {
        if (isBinary) throw new Error('binario');
        msg = JSON.parse(data.toString());
      } catch {
        fail(ERR.BAD_REQUEST, 'Messaggio illeggibile.');
        return;
      }
      if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') {
        fail(ERR.BAD_REQUEST, 'Messaggio non valido.');
        return;
      }
      try {
        dispatch(registry, conn, msg);
      } catch (err) {
        if (err instanceof GameError) {
          fail(err.code, err.message);
        } else {
          console.error(err);
          fail(ERR.BAD_REQUEST, 'Errore interno del server.');
        }
      }
    });

    ws.on('close', () => registry.detach(conn));
    ws.on('error', () => {}); // ogni errore è seguito da 'close'
  });

  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, HEARTBEAT_MS);
  heartbeat.unref();

  return {
    registry,
    listen(port = 0, host = '0.0.0.0') {
      return new Promise((resolve, reject) => {
        http.once('error', reject);
        http.listen(port, host, () => {
          http.off('error', reject);
          resolve(http.address().port);
        });
      });
    },
    close() {
      clearInterval(heartbeat);
      registry.closeAll();
      for (const ws of wss.clients) ws.terminate();
      return new Promise((resolve) => {
        http.close(() => resolve());
        http.closeAllConnections();
      });
    },
  };
}

function lanAddresses() {
  return Object.values(networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i.address);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const game = createGameServer();
  const port = await game.listen(Number(process.env.PORT) || 3000);
  console.log('Lex & Order in ascolto');
  console.log(`  Locale:       http://localhost:${port}`);
  for (const ip of lanAddresses()) console.log(`  Rete locale:  http://${ip}:${port}`);

  const shutdown = async () => {
    await game.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
