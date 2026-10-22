// Relaxed hand in wrist-local coordinates. Its longest fingertip ends exactly
// at the supplied length; the pose/skeleton remains the measurement authority.
// NFL hand size is spread thumb-to-pinky span. The closed palm breadth is an
// explicitly artistic estimate, not another recorded measurement. Keep units
// shared with the skeleton rather than the old unexplained 2.1 pixel factor.
export function estimatedPalmBreadth(spanInches, pixelsPerInch = 6) {
  const span=Number.isFinite(spanInches)?Math.max(6,Math.min(12,spanInches)):9;
  const unit=Number.isFinite(pixelsPerInch)?Math.max(1,Math.min(20,pixelsPerInch)):6;
  return span * .38 * unit;
}
export function playerHandMarkup({width,length,wristWidth,fill,shade}) {
  const n=v=>Math.round(v*100)/100;
  const p=(x,y)=>`${n(x*width)} ${n(y*length)}`;
  const wrist=wristWidth/2;
  // Palm, thenar pad, thumb and four relaxed fingers. Width describes the palm
  // at its knuckles; thumb projection is outside that breadth. The middle
  // finger reaches length exactly, and the wrist joins the limb's .40 section.
  const outline=`M${n(-wrist)} 0 C${p(-.42,.10)} ${p(-.50,.23)} ${p(-.48,.34)} C${p(-.62,.32)} ${p(-.79,.42)} ${p(-.77,.49)} Q${p(-.74,.56)} ${p(-.65,.52)} L${p(-.48,.43)} C${p(-.49,.57)} ${p(-.49,.73)} ${p(-.44,.81)} Q${p(-.40,.88)} ${p(-.34,.84)} L${p(-.29,.66)} L${p(-.25,.91)} Q${p(-.21,.97)} ${p(-.14,.94)} L${p(-.10,.69)} L${p(-.065,.97)} Q${p(-.04,1)} ${p(.025,1)} Q${p(.09,1)} ${p(.12,.96)} L${p(.16,.68)} L${p(.21,.89)} Q${p(.27,.94)} ${p(.33,.89)} C${p(.39,.77)} ${p(.49,.54)} ${p(.50,.39)} C${p(.50,.25)} ${p(.42,.12)} ${n(wrist)} 0Z`;
  return `<g class="player-hand-anatomy" data-hand-form="relaxed-palm-v2" data-palm-breadth="${n(width)}" data-palm-authority="artistic-estimate" data-hand-length="${n(length)}" fill="${fill}"><path d="${outline}"/><path d="M${p(-.42,.38)} Q${p(-.14,.47)} ${p(.31,.37)} M${p(-.34,.56)} Q${p(.07,.60)} ${p(.40,.51)} M${p(-.31,.12)} Q${p(0,.16)} ${p(.30,.12)}" fill="none" stroke="${shade}" stroke-width=".6" stroke-linecap="round" opacity=".22"/></g>`;
}
