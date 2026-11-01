import { randomInt, randomUUID } from 'node:crypto';
import {
  ERR, MAX_PLAYERS, MIN_PLAYERS, NAME_MAX, PARTIES, PHASES, ROLES, S2C,
} from '../shared/protocol.js';
import { generateCode, normalizeCode } from './codes.js';
import { generateGame, publicGame } from './game/state.js';

const ROLE_IDS = new Set(ROLES.map((r) => r.id));
const PARTY_IDS = new Set(PARTIES.map((p) => p.id));
// Caratteri di controllo e invisibili che permetterebbero nomi ingannevoli.
const HIDDEN_CHARS = /[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩]/g;

export class GameError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export function cleanName(raw) {
  const name = typeof raw === 'string'
    ? raw.replace(/\s+/g, ' ').replace(HIDDEN_CHARS, '').trim()
    : '';
  if (!name) throw new GameError(ERR.BAD_NAME, 'Inserisci il tuo nome.');
  if ([...name].length > NAME_MAX) {
    throw new GameError(ERR.BAD_NAME, `Il nome può avere al massimo ${NAME_MAX} caratteri.`);
  }
  return name;
}

/**
 * Registro delle stanze. Non conosce i WebSocket: ogni client è una "conn",
 * un oggetto { send(msg), close(), player } fornito dal livello di rete.
 */
export class RoomRegistry {
  #rooms = new Map(); // codice -> stanza
  #sessions = new Map(); // token -> giocatore

  constructor({
    graceMs = 60_000,
    idleMs = 600_000,
    maxRooms = 200,
    newGame = () => generateGame({ seed: randomInt(2 ** 32) }),
  } = {}) {
    this.graceMs = graceMs;
    this.idleMs = idleMs;
    this.maxRooms = maxRooms;
    this.newGame = newGame; // iniettabile nei test per avere partite prevedibili
  }

  get roomCount() {
    return this.#rooms.size;
  }

  create(conn, rawName) {
    this.#assertFree(conn);
    const name = cleanName(rawName);
    if (this.#rooms.size >= this.maxRooms) {
      throw new GameError(ERR.SERVER_FULL, 'Il server è pieno, riprova tra poco.');
    }
    const room = {
      code: generateCode(new Set(this.#rooms.keys())),
      phase: PHASES.LOBBY,
      hostId: null,
      players: new Map(),
      game: null,
      idleTimer: null,
    };
    this.#rooms.set(room.code, room);
    room.hostId = this.#seat(room, conn, name).id;
    this.#broadcast(room);
  }

  join(conn, rawCode, rawName) {
    this.#assertFree(conn);
    const name = cleanName(rawName);
    const code = normalizeCode(rawCode);
    const room = code ? this.#rooms.get(code) : undefined;
    if (!room) throw new GameError(ERR.ROOM_NOT_FOUND, 'Nessuna stanza con questo codice.');
    if (room.phase !== PHASES.LOBBY) {
      throw new GameError(ERR.GAME_STARTED, 'La legislatura è già iniziata.');
    }
    if (room.players.size >= MAX_PLAYERS) {
      throw new GameError(ERR.ROOM_FULL, 'La stanza è al completo.');
    }
    const lower = name.toLocaleLowerCase('it');
    if ([...room.players.values()].some((p) => p.name.toLocaleLowerCase('it') === lower)) {
      throw new GameError(ERR.NAME_TAKEN, 'Esiste già un giocatore con questo nome.');
    }
    this.#seat(room, conn, name);
    this.#broadcast(room);
  }

  resume(conn, token) {
    this.#assertFree(conn);
    const player = typeof token === 'string' ? this.#sessions.get(token) : undefined;
    if (!player) throw new GameError(ERR.SESSION_EXPIRED, 'La sessione è scaduta.');
    const old = player.conn;
    if (old && old !== conn) {
      old.player = null;
      old.close?.();
    }
    clearTimeout(player.graceTimer);
    clearTimeout(player.room.idleTimer);
    player.conn = conn;
    conn.player = player;
    conn.send({ t: S2C.SESSION, token: player.token, playerId: player.id });
    this.#broadcast(player.room);
  }

  /** Chiamato dal livello di rete quando il socket si chiude. */
  detach(conn) {
    const player = conn.player;
    if (!player || player.conn !== conn) return;
    conn.player = null;
    player.conn = null;
    const { room } = player;
    if (room.phase === PHASES.LOBBY) {
      // In sala d'attesa chi sparisce perde il posto dopo il periodo di grazia.
      player.graceTimer = setTimeout(() => this.#drop(player), this.graceMs).unref();
    }
    this.#broadcast(room);
    this.#armIdle(room);
  }

  setRole(conn, roleId) {
    const { player, room } = this.#context(conn, PHASES.LOBBY);
    if (!ROLE_IDS.has(roleId)) throw new GameError(ERR.BAD_ROLE, 'Ruolo non valido.');
    const holder = [...room.players.values()].find((p) => p.role === roleId);
    if (holder && holder !== player) {
      throw new GameError(ERR.ROLE_TAKEN, `Il ruolo è già di ${holder.name}.`);
    }
    player.role = roleId;
    player.ready = false;
    this.#broadcast(room);
  }

  setParty(conn, partyId) {
    const { player, room } = this.#context(conn, PHASES.LOBBY);
    if (!PARTY_IDS.has(partyId)) throw new GameError(ERR.BAD_PARTY, 'Partito non valido.');
    player.party = partyId;
    player.ready = false;
    this.#broadcast(room);
  }

  setReady(conn, value) {
    const { player, room } = this.#context(conn, PHASES.LOBBY);
    if (typeof value !== 'boolean') throw new GameError(ERR.BAD_REQUEST, 'Richiesta non valida.');
    if (value && (!player.role || !player.party)) {
      throw new GameError(ERR.NEED_ROLE_PARTY, 'Scegli ruolo e partito prima di dirti pronto.');
    }
    player.ready = value;
    this.#broadcast(room);
  }

  start(conn) {
    const { player, room } = this.#context(conn, PHASES.LOBBY);
    if (room.hostId !== player.id) {
      throw new GameError(ERR.NOT_HOST, 'Solo chi ha creato la stanza può avviare la legislatura.');
    }
    const players = [...room.players.values()];
    if (players.length < MIN_PLAYERS) {
      throw new GameError(ERR.TOO_FEW_PLAYERS, `Servono almeno ${MIN_PLAYERS} giocatori.`);
    }
    if (!players.every((p) => p.conn && p.ready)) {
      throw new GameError(ERR.NOT_ALL_READY, 'Non tutti i giocatori sono pronti.');
    }
    room.phase = PHASES.PLAYING;
    room.game = this.newGame();
    this.#broadcast(room);
  }

  leave(conn) {
    const { player } = this.#context(conn);
    conn.send({ t: S2C.LEFT });
    conn.player = null;
    player.conn = null;
    this.#drop(player);
  }

  /** Chiude tutte le stanze e i relativi timer (usato negli arresti e nei test). */
  closeAll() {
    for (const room of [...this.#rooms.values()]) this.#destroy(room);
  }

  #assertFree(conn) {
    if (conn.player) throw new GameError(ERR.ALREADY_IN_ROOM, 'Sei già in una stanza.');
  }

  #context(conn, phase) {
    const player = conn.player;
    if (!player) throw new GameError(ERR.NOT_IN_ROOM, 'Non sei in nessuna stanza.');
    if (phase && player.room.phase !== phase) {
      throw new GameError(ERR.WRONG_PHASE, 'Azione non disponibile in questa fase.');
    }
    return { player, room: player.room };
  }

  #seat(room, conn, name) {
    const player = {
      id: randomUUID().slice(0, 8),
      token: randomUUID(),
      name,
      role: null,
      party: null,
      ready: false,
      conn,
      room,
      graceTimer: null,
    };
    room.players.set(player.id, player);
    this.#sessions.set(player.token, player);
    clearTimeout(room.idleTimer);
    conn.player = player;
    conn.send({ t: S2C.SESSION, token: player.token, playerId: player.id });
    return player;
  }

  #drop(player) {
    const { room } = player;
    clearTimeout(player.graceTimer);
    this.#sessions.delete(player.token);
    room.players.delete(player.id);
    if (room.players.size === 0) {
      this.#destroy(room);
      return;
    }
    if (room.hostId === player.id) {
      const remaining = [...room.players.values()];
      room.hostId = (remaining.find((p) => p.conn) ?? remaining[0]).id;
    }
    this.#broadcast(room);
  }

  #armIdle(room) {
    if ([...room.players.values()].some((p) => p.conn)) return;
    clearTimeout(room.idleTimer);
    room.idleTimer = setTimeout(() => this.#destroy(room), this.idleMs).unref();
  }

  #destroy(room) {
    clearTimeout(room.idleTimer);
    for (const player of room.players.values()) {
      clearTimeout(player.graceTimer);
      this.#sessions.delete(player.token);
    }
    this.#rooms.delete(room.code);
  }

  #snapshot(room, viewer) {
    return {
      t: S2C.ROOM,
      code: room.code,
      phase: room.phase,
      hostId: room.hostId,
      you: viewer.id,
      minPlayers: MIN_PLAYERS,
      maxPlayers: MAX_PLAYERS,
      game: room.game ? publicGame(room.game) : null,
      players: [...room.players.values()].map((p) => ({
        id: p.id,
        name: p.name,
        role: p.role,
        party: p.party,
        ready: p.ready,
        connected: p.conn !== null,
      })),
    };
  }

  #broadcast(room) {
    for (const player of room.players.values()) {
      player.conn?.send(this.#snapshot(room, player));
    }
  }
}
