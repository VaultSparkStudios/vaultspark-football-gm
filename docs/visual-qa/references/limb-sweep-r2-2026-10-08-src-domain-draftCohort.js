// The reserve is a simulation design choice, not an observed NFL rookie count.
// Preserve the former256-prospect/224-base-pick design while ensuring added
// declared picks cannot consume its entire unsigned cohort.
export const DRAFT_COHORT_POLICY = Object.freeze({
  version: 'declared-picks-plus-undrafted-v1',
  minimumPoolSize: 256,
  undraftedReserve: 32
});

export function draftCohortSize(selectionCount) {
  if (!Number.isSafeInteger(selectionCount) || selectionCount < 0 ||
    !Number.isSafeInteger(selectionCount + DRAFT_COHORT_POLICY.undraftedReserve))
    throw new TypeError('Invalid draft selection capacity');
  return Math.max(DRAFT_COHORT_POLICY.minimumPoolSize,selectionCount+DRAFT_COHORT_POLICY.undraftedReserve);
}

export function validateDraftCohortPolicy(cohort) {
  if (!cohort || Object.entries(DRAFT_COHORT_POLICY).some(([key,value])=>cohort[key]!==value) ||
    !Number.isSafeInteger(cohort.generatedCount) || cohort.generatedCount<DRAFT_COHORT_POLICY.minimumPoolSize)
    throw new TypeError('Unsupported or invalid draft cohort policy');
}
