import { randomInt } from 'node:crypto';

// Parole a tema romano: corte, senza accenti, facili da dettare a voce.
export const CODE_WORDS = Object.freeze([
  'CHIGI', 'COLONNA', 'QUIRINALE', 'VIMINALE', 'MADAMA', 'CAMERA', 'SENATO',
  'FARNESINA', 'CAMPIDOGLIO', 'PINCIO', 'TEVERE', 'APPIA', 'FORO', 'CELIO',
  'AVENTINO', 'ESQUILINO', 'PALATINO', 'GIANICOLO', 'TRITONE',
]);

// Formato PAROLA-NN (es. CHIGI-88): 19 parole x 90 numeri = 1710 combinazioni.
export function generateCode(taken) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const word = CODE_WORDS[randomInt(CODE_WORDS.length)];
    const code = `${word}-${randomInt(10, 100)}`;
    if (!taken.has(code)) return code;
  }
  throw new Error('Nessun codice stanza libero');
}

// Una parola, un separatore facoltativo (spazi, qualsiasi trattino, _ o .) e due cifre.
const CODE_SHAPE = /^([A-Z]+)[\s\p{Pd}−_.]*(\d{2})$/u;

/**
 * Riporta ciò che l'utente ha scritto alla forma canonica PAROLA-NN, o null se non somiglia
 * a un codice. Perdona maiuscole, spazi, trattino mancante o "lungo", accenti e i caratteri
 * invisibili che WhatsApp aggiunge copiando. Controlla solo la forma, non la lista delle
 * parole: un codice già in uso resta valido anche se la lista cambia.
 */
export function normalizeCode(input) {
  if (typeof input !== 'string' || input.length > 40) return null;
  const text = input
    .normalize('NFD')
    .replace(/[\p{M}\p{Cf}]/gu, '')
    .toUpperCase()
    .trim();
  const match = CODE_SHAPE.exec(text);
  return match ? `${match[1]}-${match[2]}` : null;
}
