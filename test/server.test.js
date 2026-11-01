import assert from 'node:assert/strict';
import { get } from 'node:http';
import { after, before, describe, it } from 'node:test';
import WebSocket from 'ws';
import { createGameServer } from '../server/index.js';

let game;
let port;

before(async () => {
  game = createGameServer();
  port = await game.listen(0, '127.0.0.1');
});
after(() => game.close());

/** Client di prova: accumula i messaggi e permette di attenderne uno per tipo. */
async function connect(options) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, options);
  const inbox = [];
  const waiters = [];
  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    const i = waiters.findIndex((w) => w.pred(msg));
    if (i >= 0) waiters.splice(i, 1)[0].resolve(msg);
    else inbox.push(msg);
  });
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  return {
    ws,
    send: (t, payload = {}) => ws.send(JSON.stringify({ t, ...payload })),
    next(pred = () => true, ms = 1000) {
      const match = (m) => (typeof pred === 'string' ? m.t === pred : pred(m));
      const i = inbox.findIndex(match);
      if (i >= 0) return Promise.resolve(inbox.splice(i, 1)[0]);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('timeout in attesa del messaggio')), ms);
        waiters.push({ pred: match, resolve: (m) => { clearTimeout(timer); resolve(m); } });
      });
    },
    close: () => ws.close(),
  };
}

function rawGet(path) {
  return new Promise((resolve, reject) => {
    get({ host: '127.0.0.1', port, path }, (res) => {
      res.resume();
      res.on('end', () => resolve(res));
    }).on('error', reject);
  });
}

describe('file statici', () => {
  it('serve la pagina principale e il contratto condiviso', async () => {
    const index = await rawGet('/');
    assert.equal(index.statusCode, 200);
    assert.match(index.headers['content-type'], /text\/html/);
    const shared = await rawGet('/shared/protocol.js');
    assert.equal(shared.statusCode, 200);
    assert.match(shared.headers['content-type'], /javascript/);
  });

  it('risponde alla verifica di salute', async () => {
    assert.equal((await rawGet('/healthz')).statusCode, 200);
  });

  it('nasconde i file ._ di macOS e blocca il path traversal', async () => {
    assert.equal((await rawGet('/._index.html')).statusCode, 404);
    assert.equal((await rawGet('/shared/%2e%2e/server/index.js')).statusCode, 404);
    assert.equal((await rawGet('/..%2fpackage.json')).statusCode, 404);
    assert.equal((await rawGet('/%00')).statusCode, 404);
  });
});

describe('multiplayer via WebSocket', () => {
  it('crea, entra, sceglie ruoli, è pronto e avvia la legislatura', async () => {
    const a = await connect();
    const b = await connect();
    try {
      a.send('create', { name: 'Luca' });
      await a.next('session');
      const { code } = await a.next('room');

      b.send('join', { code, name: 'Marta' });
      await b.next('session');
      assert.equal((await b.next('room')).players.length, 2);

      for (const [client, role] of [[a, 'presidente_consiglio'], [b, 'ministro_economia']]) {
        client.send('set_role', { role });
        client.send('set_party', { party: 'alleanza_civica' });
        client.send('ready', { ready: true });
      }
      await a.next((m) => m.t === 'room' && m.players.every((p) => p.ready));

      a.send('start');
      const started = await b.next((m) => m.t === 'room' && m.phase === 'playing');
      assert.equal(typeof started.game.crisis.title, 'string');
      assert.deepEqual(Object.keys(started.game.kpis).sort(), ['approval', 'budget', 'europe']);
      assert.ok(started.game.ticker.length >= 3);
    } finally {
      a.close();
      b.close();
    }
  });

  it('compone una legge in due e la presenta in aula', async () => {
    const a = await connect();
    const b = await connect();
    try {
      a.send('create', { name: 'Luca' });
      await a.next('session');
      const { code } = await a.next('room');
      b.send('join', { code, name: 'Marta' });
      await b.next('session');
      await b.next('room');
      for (const [client, role] of [[a, 'presidente_consiglio'], [b, 'ministro_economia']]) {
        client.send('set_role', { role });
        client.send('set_party', { party: 'alleanza_civica' });
        client.send('ready', { ready: true });
      }
      await a.next((m) => m.t === 'room' && m.players.every((p) => p.ready));
      a.send('start');
      await b.next((m) => m.t === 'room' && m.phase === 'playing');

      b.send('law_add', { articleId: 'tavolo-sindacati' });
      const edited = await a.next((m) => m.t === 'room' && m.game?.law.articleIds.length === 1);
      assert.deepEqual(edited.game.law.articleIds, ['tavolo-sindacati']);

      a.send('law_agree', { agree: true });
      b.send('law_agree', { agree: true });
      const agreed = await a.next((m) => m.t === 'room' && m.game?.law.agreed.length === 2);
      assert.equal(agreed.game.law.blocker, null);

      b.send('law_submit');
      assert.equal((await b.next('error')).code, 'NOT_HOST');
      a.send('law_submit');
      const done = await b.next((m) => m.t === 'room' && m.game?.stage === 'submitted');
      assert.deepEqual(done.game.law.articleIds, ['tavolo-sindacati']);
    } finally {
      a.close();
      b.close();
    }
  });

  it('restituisce errori leggibili e non cade con messaggi malformati', async () => {
    const a = await connect();
    try {
      a.ws.send('non json');
      assert.equal((await a.next('error')).code, 'BAD_REQUEST');
      a.ws.send(JSON.stringify({ nessun: 'tipo' }));
      assert.equal((await a.next('error')).code, 'BAD_REQUEST');
      a.send('join', { code: 'MAI-00', name: 'Luca' });
      assert.equal((await a.next('error')).code, 'ROOM_NOT_FOUND');
      a.send('set_role', { role: 'presidente_consiglio' });
      assert.equal((await a.next('error')).code, 'NOT_IN_ROOM');
    } finally {
      a.close();
    }
  });

  it('riprende la sessione dopo una disconnessione improvvisa', async () => {
    const a = await connect();
    a.send('create', { name: 'Luca' });
    const { token } = await a.next('session');
    const { code } = await a.next('room');
    a.ws.terminate();

    const again = await connect();
    try {
      again.send('resume', { token });
      await again.next('session');
      const room = await again.next('room');
      assert.equal(room.code, code);
      assert.equal(room.players[0].name, 'Luca');
    } finally {
      again.close();
    }
  });

  it('rifiuta i WebSocket che arrivano da un altro sito', async () => {
    await assert.rejects(
      connect({ headers: { Origin: 'http://sito-malevolo.example' } }),
      /403/,
    );
  });
});
