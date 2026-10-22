import {blendAppearanceColor as blend} from './appearancePalette.js';
const n=value=>Math.round(value*100)/100;

// Contact shadows and moist lid margins are presentation, not new anatomy or
// pigment. The saved eye contours and iris remain the sole identity inputs.
export function portraitEyeSurface({a,x,y,side,form,eyeId,iris,skin,skinLight,skinShade,tilt=0}) {
 const contact=blend(skinShade,'#211a19',.48);
 const fold=form.crease;
 return `<g class="portrait-eye" data-eye-surface="lid-contact-v1" style="transform-origin:${x}px ${n(y)}px"><g transform="rotate(${n(side*tilt)} ${x} ${n(y)})"><defs><clipPath id="${eyeId}"><path d="${form.shape}"/></clipPath><linearGradient id="${eyeId}-sclera" x2="0" y2="1"><stop stop-color="#858680"/><stop offset=".35" stop-color="#cecfc6"/><stop offset=".75" stop-color="#e4e1d6"/><stop offset="1" stop-color="#bdb2a4"/></linearGradient></defs>
  <path d="${form.shape}" fill="url(#${eyeId}-sclera)"/>
  <g clip-path="url(#${eyeId})">${iris}<circle cx="${x}" cy="${n(y)}" r="1.85" fill="#171b20"/><path d="${form.upper}" fill="none" stroke="${contact}" stroke-width="2.4" opacity=".38"/><circle cx="${n(x-1.2)}" cy="${n(y-1.6)}" r=".5" fill="#fff9ec" opacity=".85"/></g>
  <path d="${form.upper}" fill="none" stroke="${contact}" stroke-width="1.25" stroke-linecap="round"/>
  <path d="${form.lower}" fill="none" stroke="${blend(skin,'#a26861',.16)}" stroke-width="1.1" opacity=".8"/>
  <path d="${form.lower}" transform="translate(0 .7)" fill="none" stroke="${skinLight}" stroke-width=".6" opacity=".5"/>
  <path class="portrait-eyelid-crease" d="${fold}" fill="none" stroke="${contact}" stroke-width=".8" opacity="${n(.22+Math.max(.2,Math.min(1,Number(a.eyelidCrease)||.5))*.22)}"/>
  <ellipse class="portrait-tear-duct" cx="${form.ductX}" cy="${form.ductY}" rx="1" ry=".65" fill="${blend(skin,'#b96761',.3)}"/>
 </g></g>`;
}
