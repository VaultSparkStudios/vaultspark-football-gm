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
