export function createAuthorityEpochTracker(initialIdentity = "uninitialized") {
  let epoch = 0;
  let identity = String(initialIdentity);
  let staleResponsesDiscarded = 0;
  const sequences = new Map();

  function replaceAuthority(nextIdentity, { force = false } = {}) {
    const normalized = String(nextIdentity || "unknown");
    if (force || normalized !== identity) {
      identity = normalized;
      epoch += 1;
      sequences.clear();
    }
    return snapshot();
  }

  function begin(scope, key = "") {
    const normalizedScope = String(scope);
    const sequence = (sequences.get(normalizedScope) || 0) + 1;
    sequences.set(normalizedScope, sequence);
    return { epoch, identity, scope: normalizedScope, key: String(key), sequence };
  }

  function isCurrent(token, key = token?.key ?? "") {
    return Boolean(
      token &&
      token.epoch === epoch &&
      token.identity === identity &&
      token.key === String(key) &&
      sequences.get(token.scope) === token.sequence
    );
  }

  function commit(token, key, callback) {
    if (!isCurrent(token, key)) {
      staleResponsesDiscarded += 1;
      return false;
    }
    callback();
    return true;
  }

  function snapshot() {
    return { epoch, identity, staleResponsesDiscarded };
  }

  return { replaceAuthority, begin, isCurrent, commit, snapshot };
}
