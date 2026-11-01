import { C2S } from '/shared/protocol.js';
import { playerRow } from '../components.js';
import { h } from '../ui.js';

// Segnaposto: la partita vera (crisi, editor di legge, voto) arriva con i prossimi moduli.
export function createGame({ net }) {
  const list = h('ul', { class: 'grid gap-3 m-0 p-0 list-none' });

  const el = h('section', { class: 'screen' },
    h('p', { class: 'eyebrow' }, "Fase 1 · Il decreto d'emergenza"),
    h('h1', { class: 'title-serif logo' }, 'Legislatura avviata'),
    h('div', { class: 'frame menu-card !max-w-xl' },
      h('p', { class: 'm-0 muted' },
        'La crisi, le barre di stato e il notiziario arrivano con il Modulo 2. Per ora la squadra è al completo e il collegamento resta attivo.'),
      list),
    h('button', {
      class: 'btn btn-ghost btn-sm',
      type: 'button',
      onclick: () => net.send(C2S.LEAVE),
    }, 'Esci dalla partita'));

  return {
    el,
    update(room) {
      list.replaceChildren(...room.players.map((p) => playerRow(p, room)));
    },
  };
}
