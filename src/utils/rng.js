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
 * Avalanche finalizer (murmur3's `fmix32`).
 *
 * S102 — FNV-1a is a fine *table* hash and a poor *seed* hash: evaluated over a
 * set of short, near-identical keys, which is exactly what a per-team,
 * per-role, per-cursor seed key is, its output stays clustered and neighbouring
 * keys land on neighbouring values. Measured over 32 sibling team keys drawing
 * a pair from a 16-item pool, where 256 combinations predict about 30 distinct
 * pairs:
 *
 *     `hash % n` (pre-S102)         13 / 32 distinct
 *     high bits, raw FNV            16 / 32 distinct
 *     high bits, avalanched         31 / 32 distinct  (this)
 *
 * The finalizer costs three multiplies and turns the derived source into one
 * that behaves like a hash of independent keys. It is applied only inside
 * `derivedRng`; `fnv1a` itself is unchanged, because other callers use it as a
 * plain content hash where the distribution across sibling keys does not
 * matter.
 */
function avalanche(value) {
  let h = value >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
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
  const draw = () => avalanche(fnv1a(`${seedKey}#${cursor++}`));
  const unit = () => draw() / 0x1_0000_0000;
  return {
    // S102 — range reduction must come off the HIGH bits.
    //
    // `int` and `pick` both used `draw() % n`, which keeps only the low bits of
    // the hash, and FNV-1a's low bits are its weakest: the final multiply gives
    // them very little of the input to depend on. For any power-of-two `n` the
    // modulus reduces to a bit mask, so near-identical keys — which is exactly
    // what a per-team, per-role seed key is — collide hard. Measured on the
    // 16-name pools with 32 team keys: 13 distinct head-coach names where 256
    // combinations and 32 draws predict about 30. Scaling `unit()` uses the
    // high bits instead and is the standard correction; it is still fully
    // deterministic, so replays and saves are unaffected in kind, only in the
    // particular values a key derives.
    int(min, max) {
      const low = Math.ceil(Number(min));
      const high = Math.floor(Number(max));
      if (!Number.isFinite(low) || !Number.isFinite(high) || high < low) return low || 0;
      const span = high - low + 1;
      return low + Math.min(span - 1, Math.floor(unit() * span));
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
      return list[Math.min(list.length - 1, Math.floor(unit() * list.length))];
    },
    next: unit,
    chance(probability) {
      return unit() < Number(probability);
    }
  };
}
