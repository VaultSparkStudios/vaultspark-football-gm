export class RNG {
  constructor(seed = Date.now()) {
    this.seed = seed >>> 0;
  }

  next() {
    this.seed = (1664525 * this.seed + 1013904223) >>> 0;
    return this.seed / 0x100000000;
  }

  int(min, max) {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  float(min, max) {
    return this.next() * (max - min) + min;
  }

  chance(probability) {
    return this.next() < probability;
  }

  pick(array) {
    return array[this.int(0, array.length - 1)];
  }

  shuffle(array) {
    const copy = [...array];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = this.int(0, i);
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  weightedPick(weightMap) {
    const entries = Object.entries(weightMap);
    const total = entries.reduce((sum, [, value]) => sum + value, 0);
    let roll = this.float(0, total);
    for (const [key, weight] of entries) {
      roll -= weight;
      if (roll <= 0) return key;
    }
    return entries[entries.length - 1][0];
  }
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function mean(values) {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * FNV-1a over a string key. Shared by every surface that needs a value derived
 * from an identity rather than drawn from a stream — the coaching market, the
 * press room's quote keys, staff and owner generation.
 */
export function fnv1a(key) {
  let value = 0x811c9dc5;
  const text = String(key);
  for (let i = 0; i < text.length; i += 1) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 0x01000193) >>> 0;
  }
  return value >>> 0;
}

/**
 * An RNG-shaped façade whose draws are *derived* from a seed key rather than
 * drawn from a mutable stream (S63). The paragraph below describes the defect
 * this replaced, not live debt. innovation-pack:ignore
 *
 * League normalizers and factories must not consume the session RNG stream — a
 * replayed save would desync. The previous answer to that constraint was a stub
 * returning a constant (`{ int: () => 76 }`), which is deterministic but also
 * makes every team identical. This keeps the guarantee and drops the constant:
 * same key, same sequence, forever; different keys, genuinely different values.
 *
 * Implements the subset of the RNG surface its callers use — `int`, `float`,
 * `pick`, `next`, `chance` — so it is a drop-in replacement.
 *
 * @param {string} seedKey — stable identity, e.g. `staff|${leagueId}|${teamId}`
 */
export function derivedRng(seedKey) {
  let cursor = 0;
  const draw = () => fnv1a(`${seedKey}#${cursor++}`);
  const unit = () => draw() / 0x1_0000_0000;
  return {
    int(min, max) {
      const low = Math.ceil(Number(min));
      const high = Math.floor(Number(max));
      if (!Number.isFinite(low) || !Number.isFinite(high) || high < low) return low || 0;
      return low + (draw() % (high - low + 1));
    },
    float(min = 0, max = 1) {
      const low = Number(min);
      const high = Number(max);
      if (!Number.isFinite(low) || !Number.isFinite(high)) return 0;
      return low + unit() * (high - low);
    },
    pick(items) {
      const list = Array.isArray(items) ? items : [];
      if (!list.length) return undefined;
      return list[draw() % list.length];
    },
    next: unit,
    chance(probability) {
      return unit() < Number(probability);
    }
  };
}
