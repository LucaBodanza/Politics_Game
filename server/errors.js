/** Errore "di gioco": ha un codice stabile (per il client) e un messaggio in italiano (per le persone). */
export class GameError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
