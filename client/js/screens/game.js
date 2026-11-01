import { C2S, KPI_MAX, KPI_MIN, KPIS, OBJECTIVE_OPS } from '/shared/protocol.js';
import { isGood, playerRow } from '../components.js';
import { icon } from '../icons.js';
import { h } from '../ui.js';
import { createLawEditor } from './law-editor.js';

const KPI_LABEL = Object.fromEntries(KPIS.map((kpi) => [kpi.id, kpi.label]));

/**
 * Una barra di stato: icona, nome, valore e barra accessibile (role="meter").
 * Con una legge in composizione mostra anche dove andrebbe l'indicatore (freccia e tratto colorato).
 */
function createMeter(kpi) {
  const valueEl = h('span', { class: 'meter-value' });
  const fill = h('div', { class: 'meter-fill' });
  const segment = h('div', { class: 'meter-delta', hidden: true });
  const track = h('div', {
    class: 'meter-track',
    role: 'meter',
    'aria-label': kpi.label,
    'aria-valuemin': KPI_MIN,
    'aria-valuemax': KPI_MAX,
  }, fill, segment);

  return {
    el: h('div', { class: `meter meter-${kpi.id}` },
      h('span', { class: 'meter-icon' }, icon(kpi.id)),
      h('div', { class: 'meter-body' },
        h('div', { class: 'meter-head' }, h('span', null, kpi.label), valueEl),
        track)),
    set(current, projected) {
      const delta = projected - current;
      const good = isGood(kpi, delta);
      valueEl.replaceChildren(String(current), ...(delta === 0 ? [] : [
        h('span', { class: `meter-change ${good ? 'is-good' : 'is-bad'}` }, ` → ${projected}`),
      ]));
      track.setAttribute('aria-valuenow', current);
      track.setAttribute(
        'aria-valuetext',
        delta === 0 ? `${current} su ${KPI_MAX}` : `${current} su ${KPI_MAX}; con la legge in composizione ${projected}`,
      );
      fill.style.width = `${current}%`;
      segment.hidden = delta === 0;
      segment.className = `meter-delta ${good ? 'is-good' : 'is-bad'}`;
      segment.style.left = `${Math.min(current, projected)}%`;
      segment.style.width = `${Math.abs(delta)}%`;
    },
  };
}

function objectiveRow(objective) {
  const change = objective.projected === objective.current ? '' : ` → ${objective.projected}`;
  return h('li', { class: objective.met ? 'objective is-met' : 'objective' },
    h('span', { class: 'objective-mark', 'aria-hidden': 'true' }, objective.met ? '✓' : '○'),
    h('span', { class: 'flex-1' },
      `${KPI_LABEL[objective.kpi]} ${OBJECTIVE_OPS[objective.op]} ${objective.value}`,
      h('span', { class: 'muted' }, ` · ora ${objective.current}${change}`)),
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

// Il cruscotto: barre di stato, crisi con obiettivi, editor della legge, governo e notiziario.
export function createGame({ net }) {
  const meters = new Map(KPIS.map((kpi) => [kpi.id, createMeter(kpi)]));
  const editor = createLawEditor({ net });
  const ticker = createTicker();
  const kicker = h('p', { class: 'eyebrow' });
  const title = h('h1', { class: 'title-serif crisis-title' });
  const briefing = h('p', { class: 'crisis-briefing' });
  const objectives = h('ul', { class: 'objectives' });
  const objectivesNote = h('p', { class: 'hint !text-left', hidden: true }, 'Le frecce mostrano l\'effetto della legge in composizione.');
  const round = h('span', { class: 'muted text-sm' });
  const players = h('ul', { class: 'players-grid' });

  const el = h('section', { class: 'screen screen-top game' },
    h('div', { class: 'hud', role: 'group', 'aria-label': 'Stato del Paese' },
      [...meters.values()].map((meter) => meter.el)),
    h('article', { class: 'frame' },
      h('div', { class: 'crisis' },
        h('div', null, kicker, title, briefing),
        h('div', null,
          h('h2', { class: 'title-serif frame-title' }, 'Obiettivi della legislatura'),
          objectivesNote,
          objectives))),
    editor.el,
    h('div', { class: 'frame' },
      h('div', { class: 'flex items-baseline justify-between mb-3' },
        h('h2', { class: 'title-serif frame-title !mb-0' }, 'Il governo'),
        round),
      players,
      h('div', { class: 'mt-4' },
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
      for (const [id, meter] of meters) meter.set(game.kpis[id], game.law.projected[id]);
      objectivesNote.hidden = game.law.articleIds.length === 0;
      objectives.replaceChildren(...game.objectives.map(objectiveRow));
      players.replaceChildren(...room.players.map((p) => playerRow(p, room)));
      editor.update(room);
      ticker.set(game.ticker);
    },
  };
}
