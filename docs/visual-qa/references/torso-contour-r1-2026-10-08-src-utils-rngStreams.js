import { RNG } from "./rng.js";

function hash32(input) {
  const text = String(input || "");
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export class RNGStreams {
  constructor(baseSeed = Date.now(), RNGClass = RNG) {
    this.baseSeed = baseSeed >>> 0;
    this.RNGClass = RNGClass;
    this.streamSeeds = {};
    this.streams = new Map();
  }

  stream(name = "default") {
    const key = String(name || "default");
    if (this.streams.has(key)) return this.streams.get(key);
    const seed = (this.baseSeed ^ hash32(key)) >>> 0;
    this.streamSeeds[key] = seed;
    const rng = new this.RNGClass(seed);
    this.streams.set(key, rng);
    return rng;
  }

  toSnapshot() {
    const streamSeeds = {};
    for (const [key, rng] of this.streams.entries()) {
      streamSeeds[key] = rng.seed;
    }
    return {
      baseSeed: this.baseSeed,
      streamSeeds: { ...this.streamSeeds, ...streamSeeds }
    };
  }

  static fromSnapshot(snapshot, RNGClass = RNG) {
    const state = snapshot || {};
    const instance = new RNGStreams(state.baseSeed || Date.now(), RNGClass);
    for (const [name, seed] of Object.entries(state.streamSeeds || {})) {
      instance.streamSeeds[name] = seed >>> 0;
      instance.streams.set(name, new RNGClass(seed >>> 0));
    }
    return instance;
  }
}
