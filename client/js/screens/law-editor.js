import { ARTICLE_KINDS, C2S, STAGES } from '/shared/protocol.js';
import { effectChips } from '../components.js';
import { h, toast } from '../ui.js';

const KIND_LABEL = Object.fromEntries(ARTICLE_KINDS.map((kind) => [kind.id, kind.label]));
const FILTERS = [{ id: 'tutti', label: 'Tutti' }, ...ARTICLE_KINDS];

/**
 * Editor della legge: a sinistra il catalogo degli articoli (trascinabili), a destra il testo
 * condiviso. Il client non applica nessuna regola: manda intenzioni e mostra ciò che il server decide.
 */
export function createLawEditor({ net }) {
  const send = (type, payload) => {
    if (!net.send(type, payload)) toast('Connessione assente: riprovo a collegarmi…', 'error');
  };

  const filter = { kind: 'tutti', text: '' };
  const tiles = new Map(); // id articolo -> { el, addBtn, kind, haystack }
  let built = false;
  let iAgree = false;

  // ---- Catalogo ----
  function applyFilter() {
    let shown = 0;
    for (const tile of tiles.values()) {
      const visible = (filter.kind === 'tutti' || tile.kind === filter.kind)
        && (!filter.text || tile.haystack.includes(filter.text));
      tile.el.hidden = !visible;
      if (visible) shown++;
    }
    noMatch.hidden = shown > 0;
  }

  const search = h('input', {
    type: 'search',
    class: 'field',
    placeholder: 'Cerca un articolo…',
    'aria-label': 'Cerca un articolo',
    oninput: (event) => {
      filter.text = event.target.value.trim().toLowerCase();
      applyFilter();
    },
  });
  const kindButtons = FILTERS.map((item) => h('button', {
    class: 'btn btn-sm chip-btn',
    type: 'button',
    'data-kind': item.id,
    'aria-pressed': item.id === 'tutti' ? 'true' : 'false',
    onclick: () => {
      filter.kind = item.id;
      for (const button of kindButtons) button.setAttribute('aria-pressed', String(button.dataset.kind === item.id));
      applyFilter();
    },
  }, item.label));
  const articleList = h('ul', { class: 'article-list' });
  const noMatch = h('p', { class: 'hint', hidden: true }, 'Nessun articolo corrisponde alla ricerca.');

  function buildTile(article) {
    const addBtn = h('button', {
      class: 'btn btn-sm',
      type: 'button',
      'aria-label': `Aggiungi alla legge: ${article.title}`,
      onclick: () => send(C2S.LAW_ADD, { articleId: article.id }),
    }, 'Aggiungi');
    const el = h('li', { class: 'article', draggable: 'true' },
      h('div', { class: 'article-meta' },
        h('span', { class: `kind kind-${article.kind}` }, KIND_LABEL[article.kind]),
        article.relevant ? h('span', { class: 'topic' }, 'In tema') : null),
      h('h3', { class: 'article-title' }, article.title),
      h('p', { class: 'article-text' }, article.text),
      h('div', { class: 'article-foot' },
        h('div', { class: 'chips' }, effectChips(article.effect)),
        addBtn));
    el.addEventListener('dragstart', (event) => {
      event.dataTransfer.setData('text/plain', article.id);
      event.dataTransfer.effectAllowed = 'copy';
    });
    tiles.set(article.id, { el, addBtn, kind: article.kind, haystack: `${article.title} ${article.text}`.toLowerCase() });
    return el;
  }

  // ---- Legge in composizione ----
  const countEl = h('span', { class: 'muted text-sm' });
  const emptyLaw = h('p', { class: 'law-empty' }, 'Trascina qui un articolo, oppure premi «Aggiungi».');
  const lawList = h('ol', { class: 'law-list' });
  const drop = h('div', { class: 'law-drop' }, emptyLaw, lawList);
  const coverEl = h('p', { class: 'cover', role: 'status' });
  const consentList = h('ul', { class: 'consent' });
  const agreeBtn = h('button', { class: 'btn', type: 'button', onclick: () => send(C2S.LAW_AGREE, { agree: !iAgree }) });
  const submitBtn = h('button', { class: 'btn btn-primary', type: 'button', onclick: () => send(C2S.LAW_SUBMIT) }, 'Presenta in aula');
  const hint = h('p', { class: 'hint', 'aria-live': 'polite' });
  const submitted = h('div', { class: 'submitted', hidden: true },
    h('strong', null, 'Legge presentata in aula'),
    h('span', { class: 'muted' }, 'Il testo è chiuso. Il voto dei parlamentari arriva con il Modulo 4.'));

  // Trascinamento: l'alternativa da tastiera e da telefono è il pulsante «Aggiungi».
  drop.addEventListener('dragover', (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    drop.classList.add('is-over');
  });
  drop.addEventListener('dragleave', () => drop.classList.remove('is-over'));
  drop.addEventListener('drop', (event) => {
    event.preventDefault();
    drop.classList.remove('is-over');
    const articleId = event.dataTransfer.getData('text/plain');
    if (articleId) send(C2S.LAW_ADD, { articleId });
  });

  function lawRow(article, index, open) {
    return h('li', { class: 'article law-article' },
      h('div', { class: 'article-meta' },
        h('span', { class: 'art-number' }, `Art. ${index + 1}`),
        h('span', { class: `kind kind-${article.kind}` }, KIND_LABEL[article.kind])),
      h('h3', { class: 'article-title' }, article.title),
      h('div', { class: 'article-foot' },
        h('div', { class: 'chips' }, effectChips(article.effect)),
        open ? h('button', {
          class: 'btn btn-sm',
          type: 'button',
          'aria-label': `Rimuovi Art. ${index + 1}: ${article.title}`,
          onclick: () => send(C2S.LAW_REMOVE, { articleId: article.id }),
        }, 'Rimuovi') : null));
  }

  const el = h('section', { class: 'editor' },
    h('div', { class: 'frame' },
      h('h2', { class: 'title-serif frame-title' }, 'Articoli disponibili'),
      h('div', { class: 'catalog-tools' },
        search,
        h('div', { class: 'kind-filter', role: 'group', 'aria-label': 'Filtra per tipo' }, kindButtons)),
      articleList,
      noMatch),
    h('div', { class: 'frame law' },
      h('div', { class: 'flex items-baseline justify-between mb-3' },
        h('h2', { class: 'title-serif frame-title !mb-0' }, 'Legge in composizione'),
        countEl),
      submitted,
      drop,
      coverEl,
      h('h3', { class: 'label mt-4' }, 'Consenso dei giocatori'),
      consentList,
      h('div', { class: 'law-actions' }, agreeBtn, submitBtn),
      hint));

  function update(room) {
    const { game } = room;
    if (!game) return;
    const open = game.stage === STAGES.DRAFTING;
    const { law } = game;

    // Il catalogo non cambia durante la partita: si costruisce una volta sola, poi si aggiornano gli stati.
    if (!built) {
      articleList.replaceChildren(...game.catalog.map(buildTile));
      built = true;
      applyFilter();
    }
    const byId = new Map(game.catalog.map((article) => [article.id, article]));
    const inLaw = new Set(law.articleIds);
    const full = inLaw.size >= law.max;
    for (const [id, tile] of tiles) {
      const used = inLaw.has(id);
      tile.el.classList.toggle('is-in-law', used);
      tile.el.draggable = open && !used && !full;
      tile.addBtn.disabled = !open || used || full;
      tile.addBtn.textContent = used ? 'Inserito' : 'Aggiungi';
    }

    lawList.replaceChildren(...law.articleIds.map((id, index) => lawRow(byId.get(id), index, open)));
    emptyLaw.hidden = inLaw.size > 0;
    countEl.textContent = `${inLaw.size} / ${law.max} articoli`;
    submitted.hidden = open;

    const shownBudget = Math.min(100, law.finalBudget);
    coverEl.className = law.covered ? 'cover cover-ok' : 'cover cover-bad';
    if (inLaw.size === 0) coverEl.textContent = 'Nessun articolo: la legge non ha ancora effetti.';
    else if (law.covered) coverEl.textContent = `Copertura assicurata: budget finale ${shownBudget}.`;
    else coverEl.textContent = `Manca la copertura: il budget finale sarebbe ${shownBudget}, sotto zero. Aggiungi una copertura o togli una spesa.`;

    const agreed = new Set(law.agreed);
    iAgree = agreed.has(room.you);
    consentList.replaceChildren(...room.players.map((player) => h('li', { class: agreed.has(player.id) ? 'consent-item is-agreed' : 'consent-item' },
      h('span', { 'aria-hidden': 'true' }, agreed.has(player.id) ? '✓' : '○'),
      player.name,
      player.connected ? null : h('span', { class: 'muted' }, '(offline)'),
      h('span', { class: 'sr-only' }, agreed.has(player.id) ? 'd\'accordo' : 'non ancora d\'accordo'))));

    const isHost = room.you === room.hostId;
    const host = room.players.find((player) => player.id === room.hostId);
    agreeBtn.hidden = !open;
    agreeBtn.disabled = inLaw.size === 0;
    agreeBtn.textContent = iAgree ? 'Ritira il mio consenso' : 'Sono d\'accordo con il testo';
    submitBtn.hidden = !open || !isHost;
    submitBtn.disabled = Boolean(law.blocker);

    if (!open) {
      hint.textContent = '';
    } else if (law.blocker?.code === 'NEEDS_AGREEMENT') {
      const waiting = room.players.filter((player) => player.connected && !agreed.has(player.id));
      hint.textContent = `In attesa del consenso di: ${waiting.map((player) => player.name).join(', ')}.`;
    } else if (law.blocker) {
      hint.textContent = law.blocker.message;
    } else {
      hint.textContent = isHost
        ? 'Tutti d\'accordo: puoi presentare la legge in aula.'
        : `Tutti d'accordo: ora tocca a ${host?.name ?? 'chi ha creato la stanza'} presentarla.`;
    }
  }

  return { el, update };
}
