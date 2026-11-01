import { ERR, PHASES, S2C } from '/shared/protocol.js';
import { createNet, TOKEN_KEY } from './net.js';
import { createGame } from './screens/game.js';
import { createLobby } from './screens/lobby.js';
import { createMenu } from './screens/menu.js';
import { session } from './storage.js';
import { h, toast } from './ui.js';

const app = document.getElementById('app');
const banner = document.getElementById('conn-banner');
const net = createNet();

// Un link tipo /?codice=CHIGI-88 apre direttamente la finestra d'ingresso.
let prefillCode = new URLSearchParams(location.search).get('codice') ?? '';
let view = null;
let lastRoom = null;

function show(name, build) {
  if (view?.name === name) return view;
  view = { name, ...build() };
  app.replaceChildren(view.el);
  view.mounted?.();
  return view;
}

function showMenu() {
  lastRoom = null;
  show('menu', () => {
    const menu = createMenu({ net, prefillCode });
    prefillCode = '';
    return menu;
  });
}

function showLoading() {
  show('loading', () => ({
    el: h('section', { class: 'screen' },
      h('p', { class: 'eyebrow' }, 'Un attimo'),
      h('p', { class: 'tagline' }, 'Riconnessione alla legislatura…')),
  }));
}

net.on('status', ({ connected }) => {
  banner.hidden = connected;
  if (!connected && view?.name === 'loading') showMenu();
});

net.on(S2C.SESSION, ({ token }) => session.set(TOKEN_KEY, token));

net.on(S2C.ROOM, (room) => {
  lastRoom = room;
  const target = room.phase === PHASES.LOBBY ? 'lobby' : 'game';
  const current = show(target, () => (target === 'lobby' ? createLobby({ net }) : createGame({ net })));
  current.update(room);
  if (location.search) history.replaceState(null, '', location.pathname);
});

net.on(S2C.LEFT, () => {
  session.del(TOKEN_KEY);
  showMenu();
});

net.on(S2C.ERROR, (msg) => {
  if (msg.code === ERR.SESSION_EXPIRED) {
    session.del(TOKEN_KEY);
    showMenu();
    return;
  }
  if (view?.name === 'loading') showMenu();
  // Se un'azione è stata rifiutata, riallinea i controlli allo stato reale della stanza.
  if (lastRoom && view?.update) view.update(lastRoom);
  if (!view?.onError?.(msg)) toast(msg.message, 'error');
});

if (session.get(TOKEN_KEY)) showLoading();
else showMenu();
net.start();
