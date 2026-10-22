// Versioned artistic arrangement, not population frequencies or measured fibers.
// Legacy heads return no additional attributes, retaining their exact rendering.
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const n = value => Math.round(value * 100) / 100;
const hash = value => {
  let h = 2166136261;
  for (const c of String(value)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15;
  return h >>> 0;
};
export function hairPartPosition(appearance) {
  return appearance?.hairArrangementVersion === 'hair-arrangement-v1' && Number.isFinite(appearance.hairPart)
    ? clamp(appearance.hairPart, .1, .9) : null;
}
export function hairFiberAttributes(appearance, seed, fiber, baseWidth) {
  if (appearance?.hairArrangementVersion !== 'hair-arrangement-v1') return '';
  const amount = Number.isFinite(appearance.hairStrandVariation) ? clamp(appearance.hairStrandVariation, 0, .5) : 0;
  const residual = (hash(`${seed}:fiber-width:${fiber}`) % 1009) / 504 - 1;
  return ` data-fiber-variation="${amount}" stroke-width="${n(baseWidth * (1 + amount * residual))}"`;
}
export function hairFiberShapeScale(appearance, seed, fiber) {
  if (appearance?.hairArrangementVersion !== 'hair-arrangement-v1') return 1;
  const amount = Number.isFinite(appearance.hairStrandVariation) ? clamp(appearance.hairStrandVariation, 0, .5) : 0;
  // Shape residuals use a different channel from width; no fitted correlation
  // or common worldwide strand distribution is claimed.
  const residual = (hash(`${seed}:fiber-shape:${fiber}`) % 1009) / 504 - 1;
  return 1 + amount * residual;
}
