/** Connessione finta per provare le stanze senza rete: registra ciò che il server le invia. */
export function fakeConn() {
  return {
    player: null,
    sent: [],
    closed: false,
    send(msg) { this.sent.push(msg); },
    close() { this.closed = true; },
    last(type) { return this.sent.findLast((m) => m.t === type); },
  };
}
