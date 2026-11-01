// Icone semplici, disegnate a mano: stringhe fisse del progetto, mai testo preso dagli utenti.
const OPEN = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">';

// Cerchio di dodici stelle, come nella bandiera europea.
function starRing() {
  let dots = '';
  for (let i = 0; i < 12; i++) {
    const angle = (i * Math.PI) / 6;
    const x = (12 + 7.5 * Math.cos(angle)).toFixed(2);
    const y = (12 + 7.5 * Math.sin(angle)).toFixed(2);
    dots += `<circle cx="${x}" cy="${y}" r="1.15" fill="currentColor" stroke="none"/>`;
  }
  return dots;
}

const SHAPES = {
  approval: '<circle cx="9" cy="8" r="3.2"/><path d="M3 19.5c0-3.2 2.6-5.5 6-5.5s6 2.3 6 5.5"/><circle cx="17.2" cy="9.2" r="2.5"/><path d="M16.5 14.2c2.6.2 4.5 1.9 4.5 4.8"/>',
  budget: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.8"/><path d="M6 9.5v.01M18 14.5v.01"/>',
  europe: starRing(),
};

export function icon(name) {
  const template = document.createElement('template');
  template.innerHTML = `${OPEN}${SHAPES[name] ?? ''}</svg>`;
  return template.content.firstElementChild;
}
