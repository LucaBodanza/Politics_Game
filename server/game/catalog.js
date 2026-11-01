import { readFileSync } from 'node:fs';
import { KPI_MAX, KPI_MIN, KPIS, OBJECTIVE_OPS } from '../../shared/protocol.js';

const KPI_IDS = KPIS.map((k) => k.id);
const HEADLINE_MAX = 140;

const isText = (value) => typeof value === 'string' && value.trim() !== '';
const inRange = (value) => Number.isFinite(value) && value >= KPI_MIN && value <= KPI_MAX;

/** Controlla il catalogo e, se qualcosa non va, lancia un errore che dice dove. */
export function validateCrises(list) {
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error('crises.json: deve essere un elenco non vuoto di crisi');
  }
  const seen = new Set();
  list.forEach((crisis, index) => {
    const where = `crises.json, crisi #${index + 1}${crisis?.id ? ` (${crisis.id})` : ''}`;
    const fail = (problem) => {
      throw new Error(`${where}: ${problem}`);
    };

    if (!isText(crisis?.id) || !/^[a-z0-9-]+$/.test(crisis.id)) fail('"id" mancante o non valido (solo a-z, 0-9, trattino)');
    if (seen.has(crisis.id)) fail('"id" duplicato');
    seen.add(crisis.id);
    for (const field of ['kicker', 'title', 'briefing']) {
      if (!isText(crisis[field])) fail(`"${field}" mancante`);
    }
    if (!Array.isArray(crisis.tags) || !crisis.tags.every(isText)) fail('"tags" deve essere un elenco di testi');

    for (const id of KPI_IDS) {
      if (!inRange(crisis.kpiStart?.[id])) fail(`"kpiStart.${id}" deve essere un numero tra ${KPI_MIN} e ${KPI_MAX}`);
    }

    if (!Array.isArray(crisis.objectives) || crisis.objectives.length < 1 || crisis.objectives.length > 4) {
      fail('servono da 1 a 4 "objectives"');
    }
    for (const objective of crisis.objectives) {
      if (!KPI_IDS.includes(objective?.kpi)) fail(`obiettivo con "kpi" sconosciuto: ${objective?.kpi}`);
      if (!(objective.op in OBJECTIVE_OPS)) fail(`obiettivo con "op" non valido: ${objective.op}`);
      if (!inRange(objective.value)) fail(`obiettivo con "value" fuori scala: ${objective.value}`);
    }

    if (!Array.isArray(crisis.headlines) || crisis.headlines.length < 3) fail('servono almeno 3 "headlines"');
    for (const headline of crisis.headlines) {
      if (!isText(headline) || headline.length > HEADLINE_MAX) fail(`titolo vuoto o oltre ${HEADLINE_MAX} caratteri: "${headline}"`);
    }
  });
  return list;
}

export const CRISES = validateCrises(
  JSON.parse(readFileSync(new URL('../data/crises.json', import.meta.url), 'utf8')),
);
