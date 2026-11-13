// The release inventory is declared independently of observed reports. A removed
// capture must fail coverage rather than silently redefining the expected set.
export const RESPONSIVE_VIEWPORTS = Object.freeze([
  Object.freeze({ name: 'mobile', width: 390, height: 844 }),
  Object.freeze({ name: 'tablet', width: 768, height: 1024 }),
  Object.freeze({ name: 'desktop', width: 1440, height: 1000 })
]);
export const RESPONSIVE_THEMES = Object.freeze(['dark', 'light']);
export const RESPONSIVE_CAPTURE_BOUND_MS = 8 * 60 * 1000;
export const RESPONSIVE_TABS = Object.freeze([
  ['overviewTab', 'overview'], ['calendarTab', 'league'], ['rosterTab', 'roster'],
  ['depthTab', 'depth'], ['transactionsTab', 'trades'], ['faTab', 'free-agency'],
  ['contractsTab', 'contracts'], ['scoutingTab', 'scouting'], ['draftTab', 'draft'],
  ['historyTab', 'history'], ['statsTab', 'stats'], ['boardroomTab', 'boardroom'], ['settingsTab', 'settings']
].map(([id, label]) => Object.freeze({ id, label })));
export const RESPONSIVE_TAB_LABELS = Object.freeze(RESPONSIVE_TABS.map((tab) => tab.label));
export const LAZY_STYLE_SURFACES = Object.freeze(['tutorial-skip', 'tutorial-identity', 'tutorial-pressure', 'tutorial-first-call', 'tutorial-receipt', 'advisor', 'dynasty-timeline', 'first-debrief', 'moment-card', 'return-digest']);
const FULL_SURFACES = Object.freeze([
  ...LAZY_STYLE_SURFACES.filter((name) => name !== 'return-digest'),
  'game-dialog', 'draft-trade-review', 'architect-objective', 'setup', 'return-digest',
  'gm-persona', 'cap-pressure', 'trophy-road', 'sim-watch-reel', 'progression-receipt',
  'room-watch', 'integrity-receipt', 'architect-cut', 'guide-modal', 'rival-coaching',
  'roster-window', 'waiver-identity', 'mentorship', 'draft-market', 'hall-ballot',
  'franchise-legends', 'decision-archive', 'co-gm-brief', 'architect-signature',
  'exact-command-center', 'exact-command-target', 'prediction-receipt',
  'agent-negotiation', 'hof-ceremony', 'facility-capital', 'gist-authentication',
  ...RESPONSIVE_TAB_LABELS.map((label) => `game-${label}`)
]);

export function selectResponsiveViewports(value) {
  if (value === undefined) return [...RESPONSIVE_VIEWPORTS];
  const viewport = RESPONSIVE_VIEWPORTS.find((entry) => entry.name === value);
  if (!viewport) throw new Error('EVIDENCE_VIEWPORT must be mobile, tablet or desktop when supplied.');
  return [viewport];
}

export function selectResponsiveScope(value) {
  if (value === undefined) return 'full';
  if (value !== 'full' && value !== 'lazy-style') throw new Error('EVIDENCE_SCOPE must be full or lazy-style when supplied.');
  return value;
}

export function expectedResponsiveNames(viewport, { scope = 'full' } = {}) {
  const profile = RESPONSIVE_VIEWPORTS.find((entry) => entry.name === viewport);
  if (!profile) throw new Error('Unknown responsive viewport.');
  if (!['full', 'lazy-style'].includes(scope)) throw new Error('Unknown responsive scope.');
  // Lazy-style iterations still capture setup and the first-run dialog before
  // entering their narrower fixture path; retain those existing four frames.
  const surfaces = scope === 'lazy-style' ? [...LAZY_STYLE_SURFACES, 'setup', 'game-dialog'] : [
    ...FULL_SURFACES,
    ...(viewport === 'mobile' ? ['game-loop'] : []),
    ...(viewport !== 'desktop' ? ['nav-drawer'] : [])
  ];
  const names = RESPONSIVE_THEMES.flatMap((theme) => surfaces.map((surface) => `${viewport}-${surface}-${theme}`));
  if (scope === 'full') names.push(`${viewport}-sim-watch-authority`);
  return names.sort();
}

export function responsiveCaptureFailures(records, requiredNames) {
  const failures = [];
  const seen = new Set();
  for (const record of records) {
    if (!record || typeof record.name !== 'string') { failures.push('malformed capture record'); continue; }
    if (seen.has(record.name)) failures.push(`${record.name}: duplicate capture`);
    seen.add(record.name);
    if (!requiredNames.includes(record.name)) failures.push(`${record.name}: unexpected capture`);
    if (record.overflowX !== false) failures.push(`${record.name}: horizontal overflow or missing overflow evidence`);
    if (!Number.isFinite(record.bodyContrast) || record.bodyContrast < 4.5) failures.push(`${record.name}: body contrast below 4.5:1 or missing`);
    for (const [key, label] of [['undersizedControls', 'undersized controls'], ['policyViolations', 'CSP violations'], ['styleFailures', 'style failures']]) {
      if (record[key] !== undefined && (!Array.isArray(record[key]) || record[key].length)) failures.push(`${record.name}: ${label}`);
    }
    if (!Array.isArray(record.undersizedControls)) failures.push(`${record.name}: missing control-size evidence`);
    if (record.name.endsWith('-sim-watch-authority')) {
      const receipt = record.visualGameReceipt;
      if (record.file !== undefined || receipt?.schemaVersion !== '1.0' || receipt?.kind !== 'deterministic-visual-game-receipt'
        || !receipt.gameId || receipt.terminal?.gameId !== receipt.gameId || receipt.terminal?.accepted !== true
        || !(receipt.terminal.playCount > 0) || !(receipt.terminal.impactCount > 0)
        || !Array.isArray(receipt.attempts) || !receipt.attempts.length) failures.push(`${record.name}: missing Sim-Watch runtime authority`);
    }
  }
  failures.push(...requiredNames.filter((name) => !seen.has(name)).map((name) => `${name}: required capture missing`));
  return failures;
}

export function stableResponsiveJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableResponsiveJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableResponsiveJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
