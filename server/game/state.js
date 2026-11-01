import { KPIS, MAX_LAW_ARTICLES, STAGES } from '../../shared/protocol.js';
import { ARTICLES, publicArticle } from './articles.js';
import { CRISES } from './catalog.js';
import { clampKpi } from './kpi.js';
import { projectLaw, submitBlocker } from './law.js';
import { buildTicker } from './news.js';
import { createRng } from './rng.js';

const START_JITTER = 3;

/** Stato iniziale di una partita: crisi e indicatori di partenza, tutto derivato dal seme. */
export function generateGame({ seed, crises = CRISES }) {
  const rng = createRng(seed);
  const crisis = rng.pick(crises);
  const kpis = Object.fromEntries(
    KPIS.map(({ id }) => [id, clampKpi(crisis.kpiStart[id] + rng.int(-START_JITTER, START_JITTER))]),
  );
  return {
    seed,
    round: 1,
    stage: STAGES.DRAFTING,
    crisis,
    kpis,
    law: { articleIds: [], agreed: [] },
  };
}

/**
 * La parte dello stato che i giocatori possono vedere: niente seme, niente dati interni.
 * "connectedIds" serve a dire se tutti i giocatori collegati hanno dato il consenso.
 */
export function publicGame(game, connectedIds = []) {
  const { id, kicker, title, briefing } = game.crisis;
  const projection = projectLaw(game);
  return {
    round: game.round,
    stage: game.stage,
    crisis: { id, kicker, title, briefing },
    kpis: { ...game.kpis },
    objectives: projection.objectives,
    law: {
      articleIds: [...game.law.articleIds],
      agreed: [...game.law.agreed],
      max: MAX_LAW_ARTICLES,
      projected: projection.kpis,
      finalBudget: projection.finalBudget,
      covered: projection.covered,
      blocker: submitBlocker(game, connectedIds),
    },
    catalog: ARTICLES.map((article) => publicArticle(article, game.crisis)),
    ticker: buildTicker(game),
  };
}
