import {
  ERR, KPIS, MAX_LAW_ARTICLES, MIN_FINAL_BUDGET, STAGES,
} from '../../shared/protocol.js';
import { GameError } from '../errors.js';
import { ARTICLE_BY_ID, articleEffect } from './articles.js';
import { clampKpi, evaluateObjectives } from './kpi.js';

/** Effetto della legge in composizione sugli indicatori, senza ancora applicarlo. */
export function projectLaw(game) {
  const raw = Object.fromEntries(KPIS.map(({ id }) => [id, game.kpis[id]]));
  for (const articleId of game.law.articleIds) {
    const effect = articleEffect(ARTICLE_BY_ID.get(articleId), game.crisis);
    for (const { id } of KPIS) raw[id] += effect[id];
  }
  const kpis = Object.fromEntries(KPIS.map(({ id }) => [id, clampKpi(raw[id])]));
  return {
    kpis,
    finalBudget: raw.budget, // non limitato a 0-100: serve a capire se la legge è coperta
    covered: raw.budget >= MIN_FINAL_BUDGET,
    objectives: evaluateObjectives(game.kpis, game.crisis.objectives, kpis),
  };
}

function assertDrafting(game) {
  if (game.stage !== STAGES.DRAFTING) {
    throw new GameError(ERR.WRONG_STAGE, 'La legge è già stata presentata in aula.');
  }
}

// Ogni modifica al testo azzera i consensi: chi era d'accordo deve rileggere.
function touch(game) {
  game.law.agreed = [];
}

export function addArticle(game, articleId) {
  assertDrafting(game);
  if (typeof articleId !== 'string' || !ARTICLE_BY_ID.has(articleId)) {
    throw new GameError(ERR.ARTICLE_UNKNOWN, 'Articolo sconosciuto.');
  }
  if (game.law.articleIds.includes(articleId)) {
    throw new GameError(ERR.ALREADY_IN_LAW, 'Questo articolo è già nella legge.');
  }
  if (game.law.articleIds.length >= MAX_LAW_ARTICLES) {
    throw new GameError(ERR.LAW_FULL, `Una legge può avere al massimo ${MAX_LAW_ARTICLES} articoli.`);
  }
  game.law.articleIds.push(articleId);
  touch(game);
}

export function removeArticle(game, articleId) {
  assertDrafting(game);
  const index = game.law.articleIds.indexOf(articleId);
  if (index === -1) throw new GameError(ERR.NOT_IN_LAW, 'Questo articolo non è nella legge.');
  game.law.articleIds.splice(index, 1);
  touch(game);
}

export function setAgreement(game, playerId, agree) {
  assertDrafting(game);
  if (typeof agree !== 'boolean') throw new GameError(ERR.BAD_REQUEST, 'Richiesta non valida.');
  if (agree && game.law.articleIds.length === 0) {
    throw new GameError(ERR.EMPTY_LAW, 'Non si può essere d\'accordo con una legge vuota.');
  }
  const others = game.law.agreed.filter((id) => id !== playerId);
  game.law.agreed = agree ? [...others, playerId] : others;
}

/** Perché la legge non si può ancora presentare (o null se si può). Una sola fonte per server e client. */
export function submitBlocker(game, connectedIds) {
  if (game.stage !== STAGES.DRAFTING) {
    return { code: ERR.WRONG_STAGE, message: 'La legge è già stata presentata in aula.' };
  }
  if (game.law.articleIds.length === 0) {
    return { code: ERR.EMPTY_LAW, message: 'Aggiungi almeno un articolo alla legge.' };
  }
  if (!projectLaw(game).covered) {
    return { code: ERR.NO_COVERAGE, message: 'Manca la copertura finanziaria: con questi articoli il budget scenderebbe sotto zero.' };
  }
  if (!connectedIds.every((id) => game.law.agreed.includes(id))) {
    return { code: ERR.NEEDS_AGREEMENT, message: 'Non tutti i giocatori collegati sono d\'accordo.' };
  }
  return null;
}

export function submitLaw(game, connectedIds) {
  const blocker = submitBlocker(game, connectedIds);
  if (blocker) throw new GameError(blocker.code, blocker.message);
  game.stage = STAGES.SUBMITTED;
}
