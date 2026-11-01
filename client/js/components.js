import { PARTIES, ROLES } from '/shared/protocol.js';
import { h, initials } from './ui.js';

export const ROLE_LABEL = Object.fromEntries(ROLES.map((r) => [r.id, r.label]));
const PARTY_BY_ID = Object.fromEntries(PARTIES.map((p) => [p.id, p]));

function statusPill(player, room) {
  if (!player.connected) return h('span', { class: 'pill pill-off' }, 'Disconnesso');
  // A partita iniziata "pronto" non ha più senso: conta solo se si è collegati.
  if (room.phase !== 'lobby') return h('span', { class: 'pill pill-ok' }, 'In linea');
  return player.ready
    ? h('span', { class: 'pill pill-ok' }, 'Pronto')
    : h('span', { class: 'pill pill-wait' }, 'In attesa');
}

/** Riga di un giocatore, usata in sala d'attesa e nella schermata di gioco. */
export function playerRow(player, room) {
  const party = PARTY_BY_ID[player.party];
  const details = [
    ROLE_LABEL[player.role] ?? 'Ruolo da scegliere',
    party?.label ?? 'Partito da scegliere',
  ].join(' · ');
  return h('li', { class: 'player-row' },
    h('span', { class: 'avatar', style: `--c:${party?.color ?? '#5b6b86'}`, 'aria-hidden': 'true' }, initials(player.name)),
    h('div', { class: 'min-w-0 flex-1' },
      h('p', { class: 'm-0 font-semibold truncate' },
        player.name,
        player.id === room.hostId ? h('span', { class: 'tag' }, 'Host') : null,
        player.id === room.you ? h('span', { class: 'tag tag-you' }, 'Tu') : null),
      h('p', { class: 'm-0 text-sm muted truncate' }, details)),
    statusPill(player, room));
}
