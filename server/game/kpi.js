import { KPI_MAX, KPI_MIN } from '../../shared/protocol.js';

export const clampKpi = (value) => Math.min(KPI_MAX, Math.max(KPI_MIN, Math.round(value)));

/** Aggiunge a ogni obiettivo il valore attuale dell'indicatore e se è già raggiunto. */
export function evaluateObjectives(kpis, objectives) {
  return objectives.map(({ kpi, op, value }) => {
    const current = kpis[kpi];
    return { kpi, op, value, current, met: op === 'gte' ? current >= value : current <= value };
  });
}
