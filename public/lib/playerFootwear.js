const n = value => Math.round(value * 100) / 100;
// External shoe silhouette at the shared six-pixels-per-inch scale. Its
// height stays 2.5 inches so ground/ankle constraints remain unchanged.
export function buildIndividualFootwear(frame, ankle, { view = 'side', fill = '#243640' } = {}) {
  if (!Number.isFinite(frame?.footLengthInches) || !Number.isFinite(frame?.footWidthInches)) return null;
  const length = Math.max(7, Math.min(16, frame.footLengthInches)) * 6;
  const width = Math.max(2.5, Math.min(6, frame.footWidthInches)) * 6;
  const left = view === 'front' ? -width / 2 : -length * .25;
  const right = view === 'front' ? width / 2 : length * .75;
  return `<path class="individual-footwear" data-foot-length="${n(length / 6)}" data-foot-width="${n(width / 6)}" d="M${n(ankle.x+left)} ${n(ankle.y-3)} Q${n(ankle.x)} ${n(ankle.y-8)} ${n(ankle.x+right*.75)} ${n(ankle.y+4)} L${n(ankle.x+right)} ${n(ankle.y+10)} V${n(ankle.y+15)} H${n(ankle.x+left)}Z" fill="${fill}"/>`;
}
