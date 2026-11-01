import { C2S, PARTIES, ROLES } from '/shared/protocol.js';
import { playerRow, ROLE_LABEL } from '../components.js';
import { copyText, h, toast } from '../ui.js';

export function createLobby({ net }) {
  let code = '';
  let iAmReady = false;

  const send = (type, payload) => {
    if (!net.send(type, payload)) toast('Connessione assente: riprovo a collegarmi…', 'error');
  };

  async function copy(text, okMessage) {
    const ok = await copyText(text);
    toast(ok ? okMessage : 'Copia non riuscita: seleziona il testo a mano.', ok ? 'info' : 'error');
  }

  const codeEl = h('p', { class: 'code-badge' });
  const countEl = h('span', { class: 'muted text-sm' });
  const list = h('ul', { class: 'grid grid-cols-1 gap-3 m-0 p-0 list-none' });

  const roleSelect = h('select', {
    id: 'role',
    class: 'field',
    onchange: (event) => send(C2S.SET_ROLE, { role: event.target.value }),
  },
  h('option', { value: '', disabled: true }, 'Scegli un ruolo…'),
  ...ROLES.map((role) => h('option', { value: role.id }, role.label)));

  const partySelect = h('select', {
    id: 'party',
    class: 'field',
    onchange: (event) => send(C2S.SET_PARTY, { party: event.target.value }),
  },
  h('option', { value: '', disabled: true }, 'Scegli un partito…'),
  ...PARTIES.map((party) => h('option', { value: party.id }, party.label)));

  const readyBtn = h('button', { class: 'btn', type: 'button', onclick: () => send(C2S.READY, { ready: !iAmReady }) });
  const readyHint = h('p', { class: 'hint' });
  const startBtn = h('button', { class: 'btn btn-primary btn-lg', type: 'button', onclick: () => send(C2S.START) }, 'Avvia la legislatura');
  const startHint = h('p', { class: 'hint', 'aria-live': 'polite' });

  const el = h('section', { class: 'screen' },
    h('div', { class: 'w-full max-w-5xl flex items-center justify-between gap-4' },
      h('div', null,
        h('p', { class: 'eyebrow' }, 'Palazzo Chigi'),
        h('h1', { class: 'title-serif logo !text-left !text-4xl' }, "Sala d'attesa")),
      h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => send(C2S.LEAVE) }, 'Esci')),
    h('div', { class: 'w-full max-w-5xl grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] items-start' },
      h('div', { class: 'grid grid-cols-1 gap-5' },
        h('div', { class: 'frame grid gap-3' },
          h('span', { class: 'label !mb-0' }, 'Codice invito'),
          codeEl,
          h('div', { class: 'grid grid-cols-2 gap-3' },
            h('button', { class: 'btn btn-sm', type: 'button', onclick: () => copy(code, 'Codice copiato.') }, 'Copia codice'),
            h('button', {
              class: 'btn btn-sm',
              type: 'button',
              onclick: () => copy(`${location.origin}/?codice=${encodeURIComponent(code)}`, 'Link copiato.'),
            }, 'Copia link')),
          h('p', { class: 'hint' }, 'Manda il codice o il link ai tuoi amici.')),
        h('div', { class: 'frame grid gap-4' },
          h('h2', { class: 'title-serif frame-title !mb-0' }, 'La tua scheda'),
          h('div', null,
            h('label', { for: 'role', class: 'label' }, 'Ruolo politico'),
            roleSelect),
          h('div', null,
            h('label', { for: 'party', class: 'label' }, 'Partito'),
            partySelect),
          readyBtn,
          readyHint)),
      h('div', { class: 'grid grid-cols-1 gap-5' },
        h('div', { class: 'frame' },
          h('div', { class: 'flex items-baseline justify-between mb-3' },
            h('h2', { class: 'title-serif frame-title !mb-0' }, 'Giocatori'),
            countEl),
          list),
        h('div', { class: 'grid gap-2' }, startBtn, startHint))));

  function update(room) {
    const me = room.players.find((p) => p.id === room.you);
    const host = room.players.find((p) => p.id === room.hostId);
    if (!me || !host) return;

    code = room.code;
    iAmReady = me.ready;
    codeEl.textContent = room.code;
    countEl.textContent = `${room.players.length} / ${room.maxPlayers}`;
    list.replaceChildren(...room.players.map((p) => playerRow(p, room)));

    // I ruoli già presi da altri restano visibili ma non selezionabili.
    for (const option of roleSelect.options) {
      if (!option.value) continue;
      const holder = room.players.find((p) => p.role === option.value);
      const taken = holder && holder.id !== room.you;
      option.disabled = Boolean(taken);
      option.textContent = ROLE_LABEL[option.value] + (taken ? ` · ${holder.name}` : '');
    }
    roleSelect.value = me.role ?? '';
    partySelect.value = me.party ?? '';

    const canBeReady = Boolean(me.role && me.party);
    readyBtn.textContent = me.ready ? 'Annulla «pronto»' : 'Sono pronto';
    readyBtn.disabled = !canBeReady;
    readyBtn.classList.toggle('btn-primary', canBeReady && !me.ready);
    readyHint.textContent = canBeReady ? '' : 'Scegli ruolo e partito per dichiararti pronto.';

    const isHost = me.id === room.hostId;
    const waiting = room.players.filter((p) => !p.connected || !p.ready);
    const enough = room.players.length >= room.minPlayers;
    startBtn.hidden = !isHost;
    startBtn.disabled = !(enough && waiting.length === 0);
    if (!isHost) startHint.textContent = `In attesa che ${host.name} avvii la legislatura.`;
    else if (!enough) startHint.textContent = `Servono almeno ${room.minPlayers} giocatori.`;
    else if (waiting.length) startHint.textContent = `In attesa di: ${waiting.map((p) => p.name).join(', ')}.`;
    else startHint.textContent = 'Tutti pronti: puoi iniziare.';
  }

  return { el, update };
}
