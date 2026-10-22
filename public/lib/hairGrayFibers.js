import { appearanceHairColors } from './appearancePalette.js';

// Artistic visible fibers, using the existing saved onset and aging curve.
// Individual thresholds stay fixed as age increases; no gameplay RNG is read.
export function grayHairFiberAttributes(appearance, age, seed, fiber) {
  if (appearance?.version !== 'portrait-identity-v3'
    || appearance?.detailVersion !== 'natural-appearance-detail-v1'
    || appearance.dyedHairColor) return '';
  const share = appearanceHairColors(appearance, age).grayShare;
  if (!(share > 0)) return '';
  let hash = 2166136261;
  for (const character of `${seed}:gray-fiber:${fiber}`) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  // Avalanche adjacent fiber labels; raw FNV tails can cluster one-digit IDs.
  hash = Math.imul(hash ^ (hash >>> 16), 0x7feb352d);
  hash = Math.imul(hash ^ (hash >>> 15), 0x846ca68b);
  hash ^= hash >>> 16;
  if ((hash >>> 0) / 4294967296 >= share) return '';
  return ' data-gray-fiber="true" stroke="#e2ded4"';
}
