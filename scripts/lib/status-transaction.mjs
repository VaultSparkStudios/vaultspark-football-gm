import { updateProjectStatus } from './write-project-status.mjs';

// A repair that needs no change must not publish a replacement or require a
// schema-valid write. The private sentinel releases canonical admission without
// committing; real mutator/validation/I/O errors keep their original semantics.
export function mutateStatusWhenNeeded(root, mutate) {
  const unchanged = {};
  let result;
  try {
    updateProjectStatus(root, draft => {
      result = mutate(draft);
      if (!result.write) throw unchanged;
    }, { touchLastUpdated: false });
  } catch (error) {
    if (error !== unchanged) throw error;
  }
  return result;
}
