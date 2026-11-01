import { C2S, KPI_MAX, KPI_MIN, KPIS, OBJECTIVE_OPS } from '/shared/protocol.js';
import { playerRow } from '../components.js';
import { icon } from '../icons.js';
import { h } from '../ui.js';

const KPI_LABEL = Object.fromEntries(KPIS.map((kpi) => [kpi.id, kpi.label]));

/** Una barra di stato: icona colorata, nome, valore e barra accessibile (role="meter"). */
function createMeter(kpi) {
  const valueEl = h('span', { class: 'meter-value' });
  const fill = h('div', { class: 'meter-fill' });
  const track = h('div', {
    class: 'meter-track',
    role: 'meter',
    'aria-label': kpi.label,
    'aria-valuemin': KPI_MIN,
    'aria-valuemax': KPI_MAX,
  }, fill);

  return {
    el: h('div', { class: `meter meter-${kpi.id}` },
      h('span', { class: 'meter-icon' }, icon(kpi.id)),
      h('div', { class: 'meter-body' },
        h('div', { class: 'meter-head' }, h('span', null, kpi.label), valueEl),
        track)),
    set(value) {
      valueEl.textContent = String(value);
      track.setAttribute('aria-valuenow', value);
      track.setAttribute('aria-valuetext', `${value} su ${KPI_MAX}`);
      fill.style.width = `${value}%`;
    },
  };
}

function objectiveRow(objective) {
  return h('li', { class: objective.met ? 'objective is-met' : 'objective' },
    h('span', { class: 'objective-mark', 'aria-hidden': 'true' }, objective.met ? '✓' : '○'),
    h('span', { class: 'flex-1' },
      `${KPI_LABEL[objective.kpi]} ${OBJECTIVE_OPS[objective.op]} ${objective.value}`,
      h('span', { class: 'muted' }, ` · ora ${objective.current}`)),
    h('span', { class: objective.met ? 'pill pill-ok' : 'pill pill-wait' },
      objective.met ? 'Raggiunto' : 'Da raggiungere'));
}

/** Notiziario a scorrimento: due copie identiche in fila, così l'anello non ha stacchi. */
function createTicker() {
  const track = h('div', { class: 'ticker-track' });
  const el = h('section', { class: 'ticker', 'aria-label': 'Ultime notizie' },
    h('span', { class: 'ticker-label' }, 'Ultime notizie'),
    h('div', { class: 'ticker-window' }, track));
  let shown = '';

  return {
    el,
    set(headlines) {
      const key = headlines.join('\n');
      if (key === shown) return; // ridisegnare farebbe ripartire lo scorrimento da capo
      shown = key;
      const copy = (hidden) => h('ul', { class: 'ticker-list', 'aria-hidden': hidden ? 'true' : null },
        headlines.map((text) => h('li', null, text)));
      track.replaceChildren(copy(false), copy(true));
      track.style.setProperty('--ticker-duration', `${Math.max(40, Math.round(key.length * 0.16))}s`);
    },
  };
}

// La partita vera (editor di legge, voto, effetti) arriva con i prossimi moduli.
export function createGame({ net }) {
  const meters = new Map(KPIS.map((kpi) => [kpi.id, createMeter(kpi)]));
  const ticker = createTicker();
  const kicker = h('p', { class: 'eyebrow' });
  const title = h('h1', { class: 'title-serif crisis-title' });
  const briefing = h('p', { class: 'crisis-briefing' });
  const objectives = h('ul', { class: 'objectives' });
  const round = h('span', { class: 'muted text-sm' });
  const players = h('ul', { class: 'grid grid-cols-1 gap-3 m-0 p-0 list-none' });

  const el = h('section', { class: 'screen screen-top game' },
    h('div', { class: 'hud', role: 'group', 'aria-label': 'Stato del Paese' },
      [...meters.values()].map((meter) => meter.el)),
    h('div', { class: 'game-grid' },
      h('div', { class: 'grid grid-cols-1 gap-5 content-start' },
        h('article', { class: 'frame' },
          kicker,
          title,
          briefing,
          h('h2', { class: 'title-serif frame-title' }, 'Obiettivi della legislatura'),
          objectives),
        h('div', { class: 'frame' },
          h('h2', { class: 'title-serif frame-title' }, 'Editor di legge'),
          h('p', { class: 'muted m-0' }, 'Il tavolo di stesura, con gli articoli da combinare, arriva con il Modulo 3.'))),
      h('div', { class: 'grid grid-cols-1 gap-5 content-start' },
        h('div', { class: 'frame' },
          h('div', { class: 'flex items-baseline justify-between mb-3' },
            h('h2', { class: 'title-serif frame-title !mb-0' }, 'Il governo'),
            round),
          players),
        h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => net.send(C2S.LEAVE) }, 'Esci dalla partita'))),
    ticker.el);

  return {
    el,
    update(room) {
      const { game } = room;
      if (!game) return;
      kicker.textContent = game.crisis.kicker;
      title.textContent = game.crisis.title;
      briefing.textContent = game.crisis.briefing;
      round.textContent = `Turno ${game.round}`;
      for (const [id, meter] of meters) meter.set(game.kpis[id]);
      objectives.replaceChildren(...game.objectives.map(objectiveRow));
      players.replaceChildren(...room.players.map((p) => playerRow(p, room)));
      ticker.set(game.ticker);
    },
  };
}
