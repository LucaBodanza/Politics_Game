import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { MAX_PLAYERS } from '../shared/protocol.js';
import { normalizeCode } from '../server/codes.js';
import { cleanName, GameError, RoomRegistry } from '../server/rooms.js';

function fakeConn() {
  return {
    player: null,
    sent: [],
    closed: false,
    send(msg) { this.sent.push(msg); },
    close() { this.closed = true; },
    last(type) { return this.sent.findLast((m) => m.t === type); },
  };
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function errorCode(fn) {
  try {
    fn();
  } catch (err) {
    assert.ok(err instanceof GameError, `errore inatteso: ${err}`);
    return err.code;
  }
  assert.fail('era atteso un errore');
}

describe('RoomRegistry', () => {
  let registry;
  const fresh = (opts) => (registry = new RoomRegistry(opts));
  afterEach(() => registry?.closeAll());

  it('crea una stanza con codice PAROLA-NN e il creatore come host', () => {
    const a = fakeConn();
    fresh().create(a, '  Luca  ');
    const room = a.last('room');
    assert.match(room.code, /^[A-Z]+-\d{2}$/);
    assert.equal(room.phase, 'lobby');
    assert.equal(room.hostId, a.player.id);
    assert.equal(room.players[0].name, 'Luca');
    assert.equal(a.last('session').token, a.player.token);
  });

  it('fa entrare un secondo giocatore e aggiorna entrambi', () => {
    fresh();
    const a = fakeConn();
    const b = fakeConn();
    registry.create(a, 'Luca');
    registry.join(b, a.last('room').code.toLowerCase(), 'Marta');
    assert.equal(a.last('room').players.length, 2);
    assert.equal(b.last('room').you, b.player.id);
    assert.equal(b.last('room').hostId, a.player.id);
  });

  it('trova la stanza anche se il codice è scritto in modo approssimativo', () => {
    fresh();
    const a = fakeConn();
    registry.create(a, 'Luca');
    const sloppy = a.last('room').code.toLowerCase().replace('-', ' ');
    const b = fakeConn();
    registry.join(b, sloppy, 'Marta');
    assert.equal(b.last('room').code, a.last('room').code);
  });

  it('rifiuta codice inesistente, nome vuoto o doppio, stanza piena', () => {
    fresh();
    const a = fakeConn();
    registry.create(a, 'Luca');
    const { code } = a.last('room');
    assert.equal(errorCode(() => registry.join(fakeConn(), 'NOPE-00', 'Marta')), 'ROOM_NOT_FOUND');
    assert.equal(errorCode(() => registry.join(fakeConn(), code, '   ')), 'BAD_NAME');
    assert.equal(errorCode(() => registry.join(fakeConn(), code, 'LUCA')), 'NAME_TAKEN');
    for (let i = 1; i < MAX_PLAYERS; i++) registry.join(fakeConn(), code, `Giocatore ${i}`);
    assert.equal(errorCode(() => registry.join(fakeConn(), code, 'Ultimo')), 'ROOM_FULL');
  });

  it('non permette di creare o entrare due volte dalla stessa connessione', () => {
    fresh();
    const a = fakeConn();
    registry.create(a, 'Luca');
    assert.equal(errorCode(() => registry.create(a, 'Luca')), 'ALREADY_IN_ROOM');
  });

  it('assegna ogni ruolo a un solo giocatore', () => {
    fresh();
    const a = fakeConn();
    const b = fakeConn();
    registry.create(a, 'Luca');
    registry.join(b, a.last('room').code, 'Marta');
    registry.setRole(a, 'presidente_consiglio');
    assert.equal(errorCode(() => registry.setRole(b, 'presidente_consiglio')), 'ROLE_TAKEN');
    assert.equal(errorCode(() => registry.setRole(b, 'ruolo_inventato')), 'BAD_ROLE');
    registry.setRole(b, 'ministro_economia');
    assert.equal(b.last('room').players[1].role, 'ministro_economia');
  });

  it('richiede ruolo e partito per dirsi pronti, e cambiarli annulla il "pronto"', () => {
    fresh();
    const a = fakeConn();
    registry.create(a, 'Luca');
    assert.equal(errorCode(() => registry.setReady(a, true)), 'NEED_ROLE_PARTY');
    registry.setRole(a, 'presidente_consiglio');
    registry.setParty(a, 'alleanza_civica');
    registry.setReady(a, true);
    assert.equal(a.last('room').players[0].ready, true);
    registry.setParty(a, 'verdi_futuro');
    assert.equal(a.last('room').players[0].ready, false);
  });

  it('avvia la legislatura solo se host e tutti pronti, poi chiude le iscrizioni', () => {
    fresh();
    const a = fakeConn();
    const b = fakeConn();
    registry.create(a, 'Luca');
    registry.join(b, a.last('room').code, 'Marta');
    for (const [conn, role] of [[a, 'presidente_consiglio'], [b, 'ministro_economia']]) {
      registry.setRole(conn, role);
      registry.setParty(conn, 'alleanza_civica');
    }
    registry.setReady(a, true);
    assert.equal(errorCode(() => registry.start(b)), 'NOT_HOST');
    assert.equal(errorCode(() => registry.start(a)), 'NOT_ALL_READY');
    registry.setReady(b, true);
    registry.start(a);
    assert.equal(b.last('room').phase, 'playing');
    assert.equal(errorCode(() => registry.setReady(a, false)), 'WRONG_PHASE');
    assert.equal(errorCode(() => registry.join(fakeConn(), a.last('room').code, 'Tardivo')), 'GAME_STARTED');
  });

  it("passa il ruolo di host al giocatore successivo quando l'host esce", () => {
    fresh();
    const a = fakeConn();
    const b = fakeConn();
    registry.create(a, 'Luca');
    registry.join(b, a.last('room').code, 'Marta');
    registry.leave(a);
    assert.equal(a.last('left').t, 'left');
    assert.equal(b.last('room').hostId, b.player.id);
    registry.leave(b);
    assert.equal(registry.roomCount, 0);
  });

  it('conserva il posto se ci si ricollega con il token entro il periodo di grazia', async () => {
    fresh({ graceMs: 50 });
    const a = fakeConn();
    registry.create(a, 'Luca');
    const { token } = a.last('session');
    const id = a.player.id;
    registry.detach(a);
    assert.equal(a.player, null);

    const again = fakeConn();
    registry.resume(again, token);
    assert.equal(again.player.id, id);
    assert.equal(again.last('room').players[0].connected, true);
    await wait(100);
    assert.equal(registry.roomCount, 1);
  });

  it('toglie il posto a chi resta disconnesso oltre il periodo di grazia', async () => {
    fresh({ graceMs: 30 });
    const a = fakeConn();
    const b = fakeConn();
    registry.create(a, 'Luca');
    registry.join(b, a.last('room').code, 'Marta');
    const { token } = b.last('session');
    registry.detach(b);
    await wait(80);
    assert.equal(a.last('room').players.length, 1);
    assert.equal(errorCode(() => registry.resume(fakeConn(), token)), 'SESSION_EXPIRED');
  });

  it('un nuovo collegamento con lo stesso token sostituisce il vecchio', () => {
    fresh();
    const a = fakeConn();
    registry.create(a, 'Luca');
    const second = fakeConn();
    registry.resume(second, a.last('session').token);
    assert.equal(a.closed, true);
    assert.equal(a.player, null);
    assert.equal(second.player.name, 'Luca');
  });
});

describe('cleanName', () => {
  it('normalizza spazi e caratteri invisibili', () => {
    assert.equal(cleanName('  On.\t Rossi ‮'), 'On. Rossi');
  });
  it('rifiuta valori non stringa e nomi troppo lunghi', () => {
    assert.throws(() => cleanName(42), GameError);
    assert.throws(() => cleanName('x'.repeat(21)), GameError);
  });
});

describe('normalizeCode', () => {
  it('porta in maiuscolo e ignora gli spazi ai bordi', () => {
    assert.equal(normalizeCode(' chigi-88 '), 'CHIGI-88');
  });

  it('accetta le varianti scritte a mano e riporta sempre PAROLA-NN', () => {
    for (const variant of [
      'chigi88', 'chigi 88', 'Chigi - 88', 'chigi_88', 'chigi.88',
      'Chigi–88', // trattino lungo
      'Chigi—88', // trattino lunghissimo
      'Chigi‑88', // trattino non divisibile
      '‎CHIGI-88‎', // caratteri invisibili aggiunti copiando da WhatsApp
    ]) {
      assert.equal(normalizeCode(variant), 'CHIGI-88', `variante: ${JSON.stringify(variant)}`);
    }
  });

  it('toglie gli accenti dalle parole', () => {
    assert.equal(normalizeCode('Quirinàle 12'), 'QUIRINALE-12');
    assert.equal(normalizeCode('QUIRINÀLE-12'), 'QUIRINALE-12');
  });

  it('restituisce null se non somiglia a un codice', () => {
    for (const bad of [
      '', '   ', 'chigi', '88', 'chigi-8', 'chigi-123', 'chigi-8x', '88-chigi',
      'chi gi-88', 'chigi-88; DROP TABLE', 'x'.repeat(100), '12345',
    ]) {
      assert.equal(normalizeCode(bad), null, `input: ${JSON.stringify(bad)}`);
    }
  });

  it('restituisce null per valori che non sono testo', () => {
    for (const bad of [undefined, null, 42, {}, ['CHIGI-88']]) {
      assert.equal(normalizeCode(bad), null);
    }
  });
});
