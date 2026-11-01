import { C2S } from '/shared/protocol.js';
import { session } from './storage.js';

export const TOKEN_KEY = 'lex.token';

/** Collegamento WebSocket con riconnessione automatica e ripresa della sessione. */
export function createNet() {
  const handlers = new Map();
  let ws = null;
  let attempts = 0;
  let timer = null;

  const emit = (type, payload) => {
    for (const fn of handlers.get(type) ?? []) fn(payload);
  };

  function send(type, payload = {}) {
    if (ws?.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify({ t: type, ...payload }));
    return true;
  }

  function open() {
    clearTimeout(timer);
    const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${scheme}://${location.host}/ws`);
    ws.addEventListener('open', () => {
      attempts = 0;
      emit('status', { connected: true });
      const token = session.get(TOKEN_KEY);
      if (token) send(C2S.RESUME, { token });
    });
    ws.addEventListener('message', (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }
      if (msg && typeof msg.t === 'string') emit(msg.t, msg);
    });
    ws.addEventListener('close', () => {
      emit('status', { connected: false });
      timer = setTimeout(open, Math.min(1000 * 2 ** attempts++, 8000));
    });
  }

  // Tornando sulla scheda (telefoni che bloccano lo schermo) riprova subito.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && ws?.readyState === WebSocket.CLOSED) open();
  });

  return {
    start: open,
    send,
    on(type, fn) {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type).add(fn);
      return () => handlers.get(type).delete(fn);
    },
  };
}
