import { KPIS } from '../../shared/protocol.js';
import { CRISES } from './catalog.js';
import { clampKpi, evaluateObjectives } from './kpi.js';
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
  return { seed, round: 1, crisis, kpis };
}

/** La parte dello stato che i giocatori possono vedere: niente seme, niente dati interni. */
export function publicGame(game) {
  const { id, kicker, title, briefing } = game.crisis;
  return {
    round: game.round,
    crisis: { id, kicker, title, briefing },
    kpis: { ...game.kpis },
    objectives: evaluateObjectives(game.kpis, game.crisis.objectives),
    ticker: buildTicker(game),
  };
}
