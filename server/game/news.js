// Il notiziario è fatto di titoli fissi della crisi più titoli che reagiscono allo stato del Paese.

export function buildTicker(game) {
  return [...game.crisis.headlines, ...kpiHeadlines(game.kpis)];
}

// TODO(human): fai reagire il notiziario agli indicatori (kpis.approval, kpis.budget, kpis.europe, tutti 0-100).
// Sotto c'è una sola regola d'esempio. Aggiungine per budget ed europe e decidi tu le soglie
// (da quanto in giù è "allarme"? e in su, c'è anche un titolo di "euforia"?), il tono e il testo.
// Ricorda che "europe" è una pressione: più è alta, peggio è. Restituisci un array di frasi.
export function kpiHeadlines(kpis) {
  const headlines = [];
  if (kpis.approval < 30) {
    headlines.push('TG Capitale: sondaggio-shock, il governo ai minimi storici di gradimento');
  }
  return headlines;
}
