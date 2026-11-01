// Contratto condiviso tra server e client: costanti, tipi di messaggio, ruoli e partiti.
// Ruoli e partiti sono segnaposto: il design definitivo arriva con i moduli successivi.

export const MIN_PLAYERS = 1;
export const MAX_PLAYERS = 6;
export const NAME_MAX = 20;

export const PHASES = Object.freeze({
  LOBBY: 'lobby',
  PLAYING: 'playing',
});

// Messaggi client -> server
export const C2S = Object.freeze({
  CREATE: 'create',
  JOIN: 'join',
  RESUME: 'resume',
  SET_ROLE: 'set_role',
  SET_PARTY: 'set_party',
  READY: 'ready',
  START: 'start',
  LEAVE: 'leave',
  LAW_ADD: 'law_add',
  LAW_REMOVE: 'law_remove',
  LAW_AGREE: 'law_agree',
  LAW_SUBMIT: 'law_submit',
});

// Messaggi server -> client
export const S2C = Object.freeze({
  SESSION: 'session',
  ROOM: 'room',
  LEFT: 'left',
  ERROR: 'error',
});

export const ERR = Object.freeze({
  BAD_REQUEST: 'BAD_REQUEST',
  BAD_NAME: 'BAD_NAME',
  NAME_TAKEN: 'NAME_TAKEN',
  ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
  ROOM_FULL: 'ROOM_FULL',
  GAME_STARTED: 'GAME_STARTED',
  ALREADY_IN_ROOM: 'ALREADY_IN_ROOM',
  NOT_IN_ROOM: 'NOT_IN_ROOM',
  WRONG_PHASE: 'WRONG_PHASE',
  BAD_ROLE: 'BAD_ROLE',
  BAD_PARTY: 'BAD_PARTY',
  ROLE_TAKEN: 'ROLE_TAKEN',
  NEED_ROLE_PARTY: 'NEED_ROLE_PARTY',
  NOT_HOST: 'NOT_HOST',
  NOT_ALL_READY: 'NOT_ALL_READY',
  TOO_FEW_PLAYERS: 'TOO_FEW_PLAYERS',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  SERVER_FULL: 'SERVER_FULL',
  WRONG_STAGE: 'WRONG_STAGE',
  ARTICLE_UNKNOWN: 'ARTICLE_UNKNOWN',
  ALREADY_IN_LAW: 'ALREADY_IN_LAW',
  NOT_IN_LAW: 'NOT_IN_LAW',
  LAW_FULL: 'LAW_FULL',
  EMPTY_LAW: 'EMPTY_LAW',
  NO_COVERAGE: 'NO_COVERAGE',
  NEEDS_AGREEMENT: 'NEEDS_AGREEMENT',
});

export const ROLES = Object.freeze([
  { id: 'presidente_consiglio', label: 'Presidente del Consiglio' },
  { id: 'ministro_economia', label: "Ministro dell'Economia" },
  { id: 'leader_opposizione', label: "Leader dell'Opposizione" },
  { id: 'capogruppo_maggioranza', label: 'Capogruppo di Maggioranza' },
  { id: 'capogruppo_opposizione', label: "Capogruppo dell'Opposizione" },
  { id: 'ministro_lavoro', label: 'Ministro del Lavoro' },
]);

export const PARTIES = Object.freeze([
  { id: 'alleanza_civica', label: 'Alleanza Civica', color: '#2f5fa8' },
  { id: 'fronte_progressista', label: 'Fronte Progressista', color: '#b5382f' },
  { id: 'verdi_futuro', label: 'Verdi per il Futuro', color: '#3f8f5a' },
  { id: 'centro_liberale', label: 'Centro Liberale', color: '#c9962f' },
]);

// Indicatori di stato del Paese, tutti su scala 0-100 (come nelle barre del riferimento UI).
// "europe" è una pressione: più è alta, peggio è.
export const KPI_MIN = 0;
export const KPI_MAX = 100;
// "better" dice in che direzione un indicatore migliora (serve a colorare gli effetti).
export const KPIS = Object.freeze([
  { id: 'approval', label: 'Gradimento pubblico', short: 'Gradimento', better: 'up' },
  { id: 'budget', label: 'Budget nazionale', short: 'Budget', better: 'up' },
  { id: 'europe', label: 'Pressione europea', short: 'Pressione UE', better: 'down' },
]);

// Fasi della partita: prima si scrive la legge, poi la si presenta in aula.
export const STAGES = Object.freeze({ DRAFTING: 'drafting', SUBMITTED: 'submitted' });

// Tipi di articolo (dal documento di visione): spese, coperture finanziarie, misure di favore.
export const ARTICLE_KINDS = Object.freeze([
  { id: 'spesa', label: 'Spesa' },
  { id: 'copertura', label: 'Copertura' },
  { id: 'favore', label: 'Misura di favore' },
]);

export const MAX_LAW_ARTICLES = 6;
// Una legge è "coperta" se dopo i suoi effetti il budget non scende sotto questa soglia
// (l'idea dell'art. 81 della Costituzione: ogni nuova spesa deve avere i mezzi per essere pagata).
export const MIN_FINAL_BUDGET = 0;

// Un obiettivo confronta un indicatore con una soglia: "gte" = almeno, "lte" = al massimo.
export const OBJECTIVE_OPS = Object.freeze({ gte: '≥', lte: '≤' });
