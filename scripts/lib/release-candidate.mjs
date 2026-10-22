// Candidate-scoped release evidence. Historical repository health is advisory.
export function releaseCandidateVerdict({sha, requiredWorkflows, runs = [], independentProof} = {}) {
  const findings = [];
  if (!/^[a-f0-9]{40}$/.test(sha || '')) findings.push('exact candidate SHA missing');
  if (!Array.isArray(requiredWorkflows) || !requiredWorkflows.length || requiredWorkflows.some(w => typeof w !== 'string' || !w) || new Set(requiredWorkflows).size !== requiredWorkflows.length) findings.push('required workflow contract missing or malformed');
  if (findings.length) return {ok:false, lane:null, findings};
  const checks = requiredWorkflows.map(workflow => {
    const matches = runs.filter(r => r.headSha === sha && r.workflow === workflow).sort((a,b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || (b.attempt || 1) - (a.attempt || 1));
    const run = matches[0];
    if (!run) return {workflow, state:'missing'};
    if (!Number.isFinite(Date.parse(run.createdAt))) return {workflow, state:'unknown'};
    if (run.status !== 'completed') return {workflow, state:'pending'};
    if (run.conclusion === 'success') return {workflow, state:'passed', runId:run.id};
    if (run.budgetRejection === true && run.zeroStep === true) return {workflow, state:'budget-unrun', runId:run.id};
    return {workflow, state:'failed', runId:run.id};
  });
  const contradictions = checks.filter(c => ['failed','pending','unknown'].includes(c.state));
  if (contradictions.length) return {ok:false, lane:null, checks, findings:contradictions.map(c => `${c.workflow}: ${c.state}`)};
  if (checks.every(c => c.state === 'passed')) return {ok:true, lane:'hosted-exact-sha', checks, findings:[]};
  if (independentProof?.ok === true && independentProof.expectedSha === sha) return {ok:true, lane:'independent-exact-sha', checks, findings:[]};
  return {ok:false, lane:null, checks, findings:['candidate checks did not run; verified policy-approved exact-SHA independent proof required']};
}

export function releaseIdentityRequirements({action = 'promote', identityChanged = false, protectedSurface = false} = {}) {
  return {separateObeliskApproval:false, authenticatedJourney:identityChanged || action === 'launch' || action === 'identity-change', accessRegression:protectedSurface, ownerCoordination:identityChanged};
}
