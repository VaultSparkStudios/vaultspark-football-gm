import { state, api } from './appState.js';
import { teamName, runAction } from './appCore.js';
import { loadState, loadRoster, loadFreeAgency, loadDepthChart, loadCalendar, loadTransactionLog } from './gameFlow.js';
import { setSelectedDesignationPlayer, clearStandardElevationPreview, renderRoster } from './tabRoster.js';

let bound = false;
export function bindRosterActions() {
  if (bound) return;
  bound = true;
  document.getElementById('rosterTable').addEventListener('click', event => {
    const select = event.target.closest('button[data-designation-select]');
    if (select) { setSelectedDesignationPlayer(select.dataset.designationSelect); renderRoster(); return; }
    const button = event.target.closest('button[data-act]');
    if (!button) return;
    const teamId = (document.getElementById('rosterTeamSelect').value || state.dashboard?.controlledTeamId || 'BUF').toUpperCase();
    runAction(() => applyRosterMove({ teamId, playerId: button.dataset.id, act: button.dataset.act }),
      'Reviewing roster move...', { key: 'roster-move', controls: [button] });
  });
  document.getElementById('cancelStandardElevationBtn').addEventListener('click', clearStandardElevationPreview);
  document.getElementById('confirmStandardElevationBtn').addEventListener('click', event => {
    runAction(confirmGameElevation, 'Declaring game elevation...', { key: 'roster-move', controls: [event.currentTarget] });
  });
}

const money = cents => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);


function renderElevationPreview(preview) {
  state.elevationPreview = preview;
  const game = preview.game, pay = preview.compensation;
  const period = game.seasonType === 'regular' ? `${game.year} Week ${game.week}` : `${game.year} ${game.round.replaceAll('-', ' ')}`;
  document.getElementById('standardElevationTitle').textContent = `${preview.playerName} · Game elevation`;
  const salary = pay.minimumCents === pay.maximumCents ? money(pay.minimumCents)
    : `${money(pay.minimumCents)}–${money(pay.maximumCents)} depending on the game outcome`;
  const lines = [
    `${period} · ${teamName(game.awayTeamId)} at ${teamName(game.homeTeamId)}`,
    `${game.seasonType === 'regular' ? 'Game salary' : 'Postseason benefit'}: ${salary}. Additional cap charge: ${money(pay.additionalCapCents)}.`,
    `Practice contract remains ${money(preview.elevation.weeklyPracticeCents)}/week. Returns to practice after this game.`,
    game.seasonType === 'regular' ? `Regular elevations remaining after confirmation: ${preview.remainingAfterDeclaration} of 3 for this club.`
      : 'The three-game regular-season elevation limit does not apply to playoff games.'
  ];
  document.getElementById('standardElevationSummary').replaceChildren(...lines.map(text => {
    const paragraph = document.createElement('p'); paragraph.textContent = text; return paragraph;
  }));
  const card = document.getElementById('standardElevationCard'); card.hidden = false;
  document.getElementById('confirmStandardElevationBtn').disabled = Boolean(preview.unchanged);
  card.scrollIntoView({ block: 'start' });
}

export async function applyRosterMove({ teamId, playerId, act }) {
  if (act === 'elevate') {
    clearStandardElevationPreview();
    const preview = await api('/api/roster/elevation-preview', { method: 'POST', body: { teamId, playerId } });
    const currentTeamId = (document.getElementById('rosterTeamSelect').value || state.dashboard?.controlledTeamId).toUpperCase();
    if (currentTeamId !== teamId || !state.roster.some(player => player.id === playerId)) return;
    setSelectedDesignationPlayer(playerId); renderElevationPreview(preview); return;
  }
  if (act === 'release') await api('/api/release', { method: 'POST', body: { teamId, playerId } });
  if (act === 'ps') await api('/api/practice-squad', { method: 'POST', body: { teamId, playerId, moveToPractice: true } });
  if (act === 'active') await api('/api/practice-squad', { method: 'POST', body: { teamId, playerId, moveToPractice: false } });
  await Promise.all([loadState(), loadRoster(), loadFreeAgency(), loadDepthChart(), loadCalendar(), loadTransactionLog()]);
}

export async function confirmGameElevation() {
  const preview = state.elevationPreview;
  if (!preview) return;
  await api('/api/roster/elevation', { method: 'POST', body: {
    teamId: preview.teamId, playerId: preview.playerId, expectedGameId: preview.game.gameId
  } });
  clearStandardElevationPreview();
  await Promise.all([loadState(), loadRoster(), loadDepthChart(), loadCalendar(), loadTransactionLog()]);
}
