import { STAGES, STAGE_DISPLAY } from './ladder.mjs';

// Selection guidance, never a lifecycle transition or a release approval.
export function deriveLifecycleFocus(project = {}, status = {}) {
  const recorded = project.ladderStage !== undefined ? project.ladderStage : status.ladderStage;
  const stage = STAGES.includes(recorded) ? recorded : null;
  const audience = project.audience || status.audience || 'unknown';
  const publicAudience = /^public/i.test(audience);
  const recordedHealth = status.health !== undefined ? status.health : project.health;
  const health = recordedHealth === undefined || recordedHealth === null ? 'unknown' : recordedHealth;
  const releaseTarget = status.releaseTarget !== undefined ? status.releaseTarget : project.releaseTarget !== undefined ? project.releaseTarget : null;
  const stageConflict = project.ladderStage !== undefined && status.ladderStage !== undefined && project.ladderStage !== status.ladderStage
    ? { registry: project.ladderStage, projectStatus: status.ladderStage } : null;
  let mode = 'resolve-stage';
  if (stage === 'F0') mode = 'concept-validation';
  else if (['V0', 'V1'].includes(stage)) mode = 'paused-or-archived';
  else if (publicAudience && ['FB', 'SB'].includes(stage)) mode = 'public-beta-hardening';
  else if (publicAudience && ['F3', 'S0'].includes(stage)) mode = 'release-readiness';
  else if (publicAudience && (stage === 'F2' || (stage === 'F1' && releaseTarget === 'public-beta'))) mode = 'beta-preparation';
  else if (['S1', 'S2'].includes(stage)) mode = publicAudience ? 'supported-release' : 'operator-readiness';
  else if (stage) mode = audience === 'internal' && ['F2', 'FB', 'F3', 'SB', 'S0'].includes(stage) ? 'operator-readiness' : 'core-product-building';
  const readiness = ['public-beta-hardening', 'release-readiness', 'beta-preparation', 'operator-readiness'].includes(mode);
  const areas = readiness ? [
    'core journeys and product correctness', 'onboarding and identity/access',
    'accessibility, mobile parity and every supported theme', 'performance and capacity',
    'security, privacy, data integrity and abuse controls', 'backup, recovery and rollback',
    'email and notifications where used', 'observability and actionable analytics',
    'feedback, support and issue triage', 'branding, legal, contact and rights/provenance',
    'human and agent access where applicable', 'staging, release evidence and truthful beta/release communication',
  ] : [];
  return { stage, recordedStage: recorded === undefined ? null : recorded, display: stage ? STAGE_DISPLAY[stage] : 'UNKNOWN', audience, health, releaseTarget, mode, readiness, areas, stageConflict,
    statusSource: status.health !== undefined ? 'project-status' : project.health !== undefined ? 'registry' : 'missing',
    stageSource: project.ladderStage !== undefined ? 'registry' : status.ladderStage !== undefined ? 'project-status' : 'missing',
  };
}

export function lifecycleSkillOverlay(skill, focus) {
  const fullAssessment = ['arc', 'audit'].includes(skill);
  const workSelection = ['arc', 'audit', 'implement', 'go'].includes(skill);
  const instructions = [`Lifecycle focus: ${focus.display} · ${focus.mode} · health ${focus.health}.`];
  if (workSelection && /^(degraded|critical|blocked|unhealthy|failing|red|amber|yellow|at-risk)$/i.test(String(focus.health))) instructions.push('Current health calls for stabilization: use the actual health evidence to rank regressions, security/data failures and broken journeys ahead of new breadth. A health label alone is not proof of a defect or permission to expand scope.');
  if (focus.health === 'unknown') instructions.push('Current health is unknown: collect or label missing status evidence rather than assuming a healthy baseline.');
  if (focus.stageConflict) instructions.push('Registry and local lifecycle stages conflict: use the registry stage for selection, surface the disagreement and reconcile through the lifecycle owner; do not silently rewrite labels.');
  if (focus.mode === 'resolve-stage') instructions.push('Stage is missing or invalid: resolve the authoritative lifecycle record before asserting readiness; descriptive developmentPhase and a live URL do not establish a stage.');
  if (focus.mode === 'paused-or-archived') instructions.push('Work only within the requested paused/archive outcome; do not revive or start a launch-hardening arc implicitly.');
  if (focus.readiness) {
    instructions.push('Use docs/STAGE_DIRECTED_WORK.md. Assess applicable readiness areas with current evidence; missing, stale, failing and exempt are distinct. Preserve the project medium and existing release gates.');
    if (workSelection) instructions.push('Prioritize demonstrated launch blockers, core-journey failures and user-reported defects before speculative features; retain features necessary for beta value. Stay within the selected outcomes.');
    if (fullAssessment) instructions.push('Record a readiness matrix, stage/status provenance and why each selected item matters at this stage in the audit sidecar; rank by severity, launch dependency and user impact.');
    if (['implement', 'go'].includes(skill)) instructions.push('Re-read stage/status before planning; bind each selected outcome to its readiness area and acceptance proof. A changed stage triggers a plan review, not silent scope expansion.');
    if (skill === 'closeout') instructions.push('Report readiness areas proved and remaining gaps with release-source evidence. Completion of an arc is not beta launch approval.');
  } else if (focus.mode === 'supported-release') {
    instructions.push('Prioritize regressions, reliability, support/feedback and measured user outcomes; a separate beta track never relabels a supported stable release.');
  } else if (focus.mode === 'core-product-building') instructions.push('Prioritize core value and working journeys; apply hardening required by the actual change without treating the entire project as launch-ready.');
  return {
    extraSignals: [`Stage ${focus.display}`, `Work focus ${focus.mode}`, `Health ${focus.health}`],
    successBarAdditions: fullAssessment && focus.readiness ? ['Audit includes current stage/status provenance and evidence per applicable readiness area.'] : [],
    axisWeightDeltas: focus.readiness && focus.audience !== 'internal' ? { 'ui-ux-feedback': 2, security: 2, 'speed-organization-efficiency': 2, 'observability-honesty': 2 } : {},
    promptOverlay: instructions.join(' '),
  };
}

// Optional versioned assessment extension: old audits stay readable; stage-directed
// audits cannot claim coverage with a missing matrix or an unsupported pass.
export function validateLifecycleAuditAssessment(audit) {
  if (!audit?.lifecycleFocus) return [];
  const focus = audit.lifecycleFocus;
  const derived = deriveLifecycleFocus({ ladderStage: focus.stage, audience: focus.audience }, { releaseTarget: focus.releaseTarget });
  if (!derived.readiness) return [];
  const errors = [];
  const rows = Array.isArray(audit.readinessAssessment) ? audit.readinessAssessment : [];
  const states = new Set(['pass', 'fail', 'partial', 'unknown', 'stale', 'not-applicable', 'exempt']);
  if (!focus.stageSource || !focus.statusSource) errors.push('/lifecycleFocus must name stage/status provenance');
  for (const area of derived.areas) {
    const matching = rows.filter((row) => row?.area === area);
    if (matching.length !== 1) { errors.push(`/readinessAssessment ${area}: requires one assessment`); continue; }
    const row = matching[0];
    if (!states.has(row.status)) errors.push(`/readinessAssessment ${area}: invalid state`);
    if (!row.owner || !row.nextAcceptanceCheck) errors.push(`/readinessAssessment ${area}: owner and nextAcceptanceCheck required`);
    if (['not-applicable', 'exempt'].includes(row.status) && !row.reason) errors.push(`/readinessAssessment ${area}: reason required`);
    if (row.status === 'pass' && (!row.evidence || !row.sourceRevision || !Number.isFinite(Date.parse(row.observedAt)))) errors.push(`/readinessAssessment ${area}: pass requires evidence, sourceRevision and observedAt`);
  }
  for (const item of audit.items || []) {
    if (!item.readinessArea || !item.stageRationale) errors.push(`/items/${item.slug || item.id}: readinessArea and stageRationale required`);
  }
  return errors;
}
