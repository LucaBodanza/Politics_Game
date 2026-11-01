import { C2S, NAME_MAX } from '/shared/protocol.js';
import { local } from '../storage.js';
import { h, toast } from '../ui.js';

const NAME_KEY = 'lex.name';

export function createMenu({ net, prefillCode = '' }) {
  const nameInput = h('input', {
    id: 'player-name',
    class: 'field',
    type: 'text',
    maxlength: NAME_MAX,
    autocomplete: 'nickname',
    placeholder: 'Es. On. Rossi',
    value: local.get(NAME_KEY) ?? '',
  });
  const codeInput = h('input', {
    id: 'join-code',
    class: 'field field-code',
    type: 'text',
    maxlength: 24,
    autocomplete: 'off',
    autocapitalize: 'characters',
    spellcheck: 'false',
    placeholder: 'CHIGI-88',
    'aria-describedby': 'join-error',
    value: prefillCode,
  });
  const joinError = h('p', { id: 'join-error', class: 'form-error', role: 'alert', hidden: true });

  const send = (type, payload) => {
    if (!net.send(type, payload)) toast('Connessione assente: riprovo a collegarmi…', 'error');
  };

  function readName() {
    const name = nameInput.value.trim();
    if (!name) {
      toast('Inserisci prima il tuo nome.', 'error');
      nameInput.focus();
      return null;
    }
    local.set(NAME_KEY, name);
    return name;
  }

  function showJoinError(message) {
    joinError.textContent = message;
    joinError.hidden = false;
  }

  const joinDialog = h('dialog', { class: 'dlg', 'aria-labelledby': 'join-title' },
    h('form', {
      class: 'dlg-body',
      onsubmit: (event) => {
        event.preventDefault();
        const code = codeInput.value.trim();
        if (!code) return showJoinError('Inserisci il codice invito.');
        joinError.hidden = true;
        return send(C2S.JOIN, { code, name: nameInput.value.trim() });
      },
    },
    h('h2', { id: 'join-title', class: 'title-serif dlg-title' }, 'Unisciti alla legislatura'),
    h('div', null,
      h('label', { for: 'join-code', class: 'label' }, 'Codice invito'),
      codeInput),
    joinError,
    h('button', { class: 'btn btn-primary', type: 'submit' }, 'Entra'),
    h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => joinDialog.close() }, 'Annulla')));

  const creditsDialog = h('dialog', { class: 'dlg', 'aria-labelledby': 'credits-title' },
    h('div', { class: 'dlg-body' },
      h('h2', { id: 'credits-title', class: 'title-serif dlg-title' }, 'Crediti'),
      h('p', null, 'Lex & Order: un gioco di simulazione politica da giocare con gli amici.'),
      h('p', null, 'Gli sfondi e le immagini di riferimento sono segnaposto generati con AI.'),
      h('button', { class: 'btn btn-primary', type: 'button', onclick: () => creditsDialog.close() }, 'Chiudi')));

  function openJoin() {
    if (!readName()) return;
    joinError.hidden = true;
    joinDialog.showModal();
    codeInput.focus();
    codeInput.select();
  }

  const el = h('section', { class: 'screen' },
    h('p', { class: 'eyebrow' }, 'Palazzo Chigi · Piazza Colonna'),
    h('h1', { class: 'title-serif logo' }, 'Lex & Order'),
    h('p', { class: 'tagline' }, 'La Repubblica dei Co-op'),
    h('div', { class: 'frame menu-card' },
      h('div', null,
        h('label', { for: 'player-name', class: 'label' }, 'Il tuo nome'),
        nameInput),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onclick: () => {
          const name = readName();
          if (name) send(C2S.CREATE, { name });
        },
      }, 'Crea partita'),
      h('button', { class: 'btn', type: 'button', onclick: openJoin }, 'Unisciti a partita'),
      h('button', {
        class: 'btn btn-ghost',
        type: 'button',
        'aria-disabled': 'true',
        onclick: () => toast('Opzioni e audio arriveranno nei prossimi moduli.'),
      }, 'Opzioni & Audio', h('span', { class: 'soon' }, 'presto')),
      h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => creditsDialog.showModal() }, 'Crediti')),
    h('p', { class: 'mode-chip' }, 'Modalità · Co-op'),
    joinDialog,
    creditsDialog);

  return {
    el,
    // Aperto da un link con ?codice=… : se il nome è già noto si va dritti al codice.
    mounted() {
      if (!prefillCode) return;
      if (local.get(NAME_KEY)) {
        openJoin();
      } else {
        toast('Inserisci il tuo nome, poi premi «Unisciti a partita».');
        nameInput.focus();
      }
    },
    // Gli errori del server durante l'ingresso vanno mostrati dentro la finestra aperta.
    onError(message) {
      if (!joinDialog.open) return false;
      showJoinError(message.message);
      return true;
    },
  };
}
