import { KPI_MAX, KPI_MIN } from '../../shared/protocol.js';

export const clampKpi = (value) => Math.min(KPI_MAX, Math.max(KPI_MIN, Math.round(value)));

/**
 * Valuta gli obiettivi. "current" è il valore di oggi, "projected" quello dopo la legge in
 * composizione (di default uguale a oggi); "met" dice se l'obiettivo è raggiunto in quel caso.
 */
export function evaluateObjectives(kpis, objectives, projected = kpis) {
  return objectives.map(({ kpi, op, value }) => {
    const after = projected[kpi];
    return {
      kpi,
      op,
      value,
      current: kpis[kpi],
      projected: after,
      met: op === 'gte' ? after >= value : after <= value,
    };
  });
}
