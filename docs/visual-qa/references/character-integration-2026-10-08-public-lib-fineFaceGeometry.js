import {blendAppearanceColor as blend} from './appearancePalette.js';
const number=value=>Math.round(value*100)/100;
const bounded=(a,key,fallback,low,high)=>Number.isFinite(a[key])?Math.max(low,Math.min(high,a[key])):fallback;
// Dimensionless artistic controls, not measured landmarks or ancestry models.
// One presentation boundary is shared by the front, side and moving heads.
export function fineFaceGeometry(appearance) {
  if (appearance?.fineFaceVersion !== 'fine-face-v1') return null;
  const value = (key, fallback, low, high) => Number.isFinite(appearance[key])
    ? Math.max(low, Math.min(high, appearance[key])) : fallback;
  return {
    nasalRootWidth: value('nasalRootWidth', 1, .75, 1.25),
    nasalWingWidth: value('nasalWingWidth', 1, .75, 1.25),
    upperLipScale: value('upperLipScale', 1, .65, 1.4),
    lowerLipScale: value('lowerLipScale', 1, .65, 1.4),
    chinProjection: value('chinProjection', 0, -.7, .7),
    foreheadSlope: value('foreheadSlope', 0, -.7, .7),
    browRidge: value('browRidge', .5, 0, 1)
  };
}

// Saved jaw and cheeks constrain the visible contour, rather than a hidden
// control point on an oval. These are artistic projections, not measurements.
export function fineFaceFrontLandmarks(a) {
  if(!fineFaceGeometry(a)||a.detailVersion!=='natural-appearance-detail-v1')return null;
  const width=59*bounded(a,'faceWidth',1,.88,1.10);
  return {width,jaw:Math.min(width*.97,47.5*bounded(a,'jawWidth',1,.8,1.16)),
    cheek:width*(.89+.07*bounded(a,'cheekFullness',1,.75,1.25)),
    cheekY:166-(bounded(a,'cheekbone',1,.75,1.25)-1)*18,
    chin:24.8*bounded(a,'chinWidth',1,.8,1.2)};
}

export function fineFaceFrontContour(a) {
  const landmarks=fineFaceFrontLandmarks(a);if(!landmarks)return null;
  const {width:w,jaw,cheek,cheekY,chin}=landmarks,length=bounded(a,'chinLength',1,.85,1.12);
  const chinY=241+(length-1)*22,jawY=208+(length-1)*8;
  const asym=bounded(a,'facialAsymmetry',0,-1,1)*1.8,n=number;
  return `M${n(160-w)} 113 C${n(155-w)} 82 ${n(160-w*.54)} 65 160 65 C${n(160+w*.54)} 65 ${n(165+w)} 82 ${n(160+w)} 113 C${n(160+w)} 136 ${n(160+cheek)} 151 ${n(160+cheek*.97)} ${n(cheekY)} C${n(160+cheek*.95)} ${n(cheekY+14)} ${n(160+jaw+asym)} ${n(jawY-10)} ${n(160+jaw+asym)} ${n(jawY)} Q${n(160+jaw+asym)} ${n(jawY+8)} ${n(160+chin)} ${n(chinY-10)} C${n(160+chin*.65)} ${n(chinY-2)} ${n(160+chin*.35+asym)} ${n(chinY)} ${n(160+asym)} ${n(chinY)} C${n(160-chin*.35+asym)} ${n(chinY)} ${n(160-chin*.65)} ${n(chinY-2)} ${n(160-chin)} ${n(chinY-10)} Q${n(160-jaw)} ${n(jawY+8)} ${n(160-jaw)} ${n(jawY)} C${n(160-jaw)} ${n(jawY-10)} ${n(160-cheek*.95)} ${n(cheekY+14)} ${n(160-cheek*.97)} ${n(cheekY)} C${n(160-cheek)} 151 ${n(160-w)} 136 ${n(160-w)} 113Z`;
}

export function fineFaceEyeContours(a,x,y,side) {
  if(!fineFaceGeometry(a)||a.detailVersion!=='natural-appearance-detail-v1')return null;
  const aperture=bounded(a,'eyeAperture',1,.7,1.2),crease=bounded(a,'eyelidCrease',.5,.2,1);
  const inner=x-side*10,outer=x+side*11,n=number;
  const upper=`M${n(inner)} ${n(y+.7)} C${n(inner+side*4)} ${n(y-6.8*aperture)} ${n(outer-side*5)} ${n(y-7.2*aperture)} ${n(outer)} ${n(y-.4)}`;
  const lower=`M${n(outer)} ${n(y-.4)} C${n(outer-side*3)} ${n(y+3.5*aperture)} ${n(inner+side*4)} ${n(y+3.8*aperture)} ${n(inner)} ${n(y+.7)}`;
  return {shape:upper+lower.replace(/^M[^C]+/,' ')+`Z`,upper,lower,
    crease:`M${n(inner+side*1.5)} ${n(y-2)} C${n(inner+side*5)} ${n(y-7.9*aperture-crease*3)} ${n(outer-side*5)} ${n(y-8.1*aperture-crease*3)} ${n(outer-side)} ${n(y-2)}`,
    ductX:n(inner+side*.9),ductY:n(y+.55)};
}

export function fineFaceSideEyeContours(a,y) {
  if(!fineFaceFrontLandmarks(a))return null;
  const aperture=bounded(a,'eyeAperture',1,.7,1.2),n=number;
  const upper=`M15 ${n(y)} Q19 ${n(y-3.5*aperture)} 24 ${n(y)}`;
  return {upper,shape:upper+` Q20 ${n(y+2.6*aperture)} 15 ${n(y)}Z`};
}

function reliefNoseMarkup({root,wing,nose,tip,noseY,skinLight,skinShade,id}) {
  const n=number;
  const bridge=`M${n(160-root*.85)} 145 C${n(160-root*.65)} 157 ${n(160-wing*.48)} ${n(noseY-7)} ${n(160-wing*.72)} ${n(noseY-1)} Q160 ${n(noseY+5)} ${n(160+wing*.72)} ${n(noseY-1)} C${n(160+wing*.48)} ${n(noseY-7)} ${n(160+root*.65)} 157 ${n(160+root*.85)} 145Z`;
  const shade=blend(skinShade,'#271912',.35);
  return `<g class="portrait-nose portrait-fine-nose" data-nose-form="nasal-relief-v3"><defs>
    <linearGradient id="${id}-nasal-bridge"><stop stop-color="${skinShade}" stop-opacity="0"/><stop offset=".18" stop-color="${skinLight}" stop-opacity=".35"/><stop offset=".42" stop-color="${skinLight}" stop-opacity=".18"/><stop offset=".8" stop-color="${skinShade}" stop-opacity=".45"/><stop offset="1" stop-color="${skinShade}" stop-opacity="0"/></linearGradient>
    <radialGradient id="${id}-nasal-tip" cx=".35" cy=".2" r=".8"><stop stop-color="${skinLight}" stop-opacity=".7"/><stop offset=".4" stop-color="${skinLight}" stop-opacity=".18"/><stop offset="1" stop-color="${skinShade}" stop-opacity=".28"/></radialGradient>
    <radialGradient id="${id}-nasal-cast"><stop stop-color="${shade}" stop-opacity=".6"/><stop offset=".45" stop-color="${shade}" stop-opacity=".28"/><stop offset="1" stop-color="${shade}" stop-opacity="0"/></radialGradient>
    <radialGradient id="${id}-nasal-side"><stop stop-color="${skinShade}" stop-opacity=".4"/><stop offset="1" stop-color="${skinShade}" stop-opacity="0"/></radialGradient></defs>
    <ellipse cx="${n(160+wing*.48)}" cy="${n(noseY-12)}" rx="${n(wing*.7)}" ry="${n((noseY-145)*.6)}" fill="url(#${id}-nasal-side)"/>
    <path d="${bridge}" fill="url(#${id}-nasal-bridge)"/>
    <ellipse cx="${n(160+wing*.25)}" cy="${n(noseY+5.5)}" rx="${n(wing*1.2)}" ry="4.5" fill="url(#${id}-nasal-cast)"/>
    <path d="M${n(160-wing)} ${n(noseY+1)} C${n(160-wing*1.12)} ${n(noseY-5)} ${n(160-wing*.5)} ${n(noseY-6)} ${n(160-nose*.48*tip)} ${n(noseY-4)} Q160 ${n(noseY-8*tip)} ${n(160+nose*.48*tip)} ${n(noseY-4)} C${n(160+wing*.5)} ${n(noseY-6)} ${n(160+wing*1.12)} ${n(noseY-5)} ${n(160+wing)} ${n(noseY+1)} Q160 ${n(noseY+9*tip)} ${n(160-wing)} ${n(noseY+1)}Z" fill="url(#${id}-nasal-tip)"/>
    ${[-1,1].map(side=>`<path d="M${n(160+side*wing*.86)} ${n(noseY+2.2)} Q${n(160+side*wing*.66)} ${n(noseY+.3)} ${n(160+side*wing*.44)} ${n(noseY+2.3)}" fill="none" stroke="${shade}" stroke-width="1.8" stroke-linecap="round" opacity=".85"/>`).join('')}
    <path d="M159 ${n(noseY+3)} Q160 ${n(noseY+5.5)} 161 ${n(noseY+3)}" fill="none" stroke="${skinLight}" stroke-width=".6" opacity=".45"/></g>`;
}

function reliefLipMarkup({lipHalf,curve,upper,lower,seam,skinLight,skinShade,lip,id}) {
  const n=number;
  const y=204,corner=lipHalf*.15;
  return `<g class="portrait-lips portrait-fine-lips" data-lip-form="rounded-relief-v1"><defs>
    <linearGradient id="${id}-lip-upper" x2="0" y2="1"><stop stop-color="${blend(lip,skinShade,.2)}"/><stop offset=".75" stop-color="${blend(lip,skinShade,.5)}"/><stop offset="1" stop-color="${skinShade}"/></linearGradient>
    <radialGradient id="${id}-lip-lower" cx=".4" cy=".25" r=".85"><stop stop-color="${blend(lip,skinLight,.27)}"/><stop offset=".6" stop-color="${lip}"/><stop offset="1" stop-color="${blend(lip,skinShade,.35)}"/></radialGradient>
    <radialGradient id="${id}-mouth-relief"><stop stop-color="${skinShade}" stop-opacity=".42"/><stop offset="1" stop-color="${skinShade}" stop-opacity="0"/></radialGradient>
    <linearGradient id="${id}-philtrum" x2="1"><stop stop-color="${skinShade}" stop-opacity="0"/><stop offset=".45" stop-color="${skinShade}" stop-opacity=".25"/><stop offset="1" stop-color="${skinShade}" stop-opacity="0"/></linearGradient></defs>
    <path d="M156 189 Q158 194 ${n(160-corner)} ${n(y-upper-curve)} L${n(160+corner)} ${n(y-upper-curve)} Q162 194 164 189Z" fill="url(#${id}-philtrum)"/>
    <ellipse cx="161" cy="${n(y+lower+3)}" rx="${n(lipHalf*.8)}" ry="3.5" fill="url(#${id}-mouth-relief)"/>
    <path d="M${n(160-lipHalf)} ${y} C${n(160-lipHalf*.65)} ${n(y-upper*.35-curve)} ${n(160-lipHalf*.3)} ${n(y-upper-curve)} ${n(160-corner)} ${n(y-upper*.72-curve)} Q160 ${n(y-upper*.35)} ${n(160+corner)} ${n(y-upper*.72-curve)} C${n(160+lipHalf*.3)} ${n(y-upper-curve)} ${n(160+lipHalf*.65)} ${n(y-upper*.35-curve)} ${n(160+lipHalf)} ${y} Q160 ${n(seam)} ${n(160-lipHalf)} ${y}Z" fill="url(#${id}-lip-upper)" opacity=".85"/>
    <path d="M${n(160-lipHalf)} ${y} Q160 ${n(seam)} ${n(160+lipHalf)} ${y} C${n(160+lipHalf*.6)} ${n(y+lower*.65)} ${n(160+lipHalf*.35)} ${n(y+lower)} 160 ${n(y+lower)} C${n(160-lipHalf*.35)} ${n(y+lower)} ${n(160-lipHalf*.6)} ${n(y+lower*.65)} ${n(160-lipHalf)} ${y}Z" fill="url(#${id}-lip-lower)" opacity=".87"/>
    <path d="M${n(160-lipHalf)} ${y} Q160 ${n(seam)} ${n(160+lipHalf)} ${y}" fill="none" stroke="${blend(skinShade,'#2b171a',.4)}" stroke-width=".95" opacity=".85"/>
    <path d="M${n(160-lipHalf*.35)} ${n(y+lower*.38)} Q160 ${n(y+lower*.62)} ${n(160+lipHalf*.35)} ${n(y+lower*.38)}" fill="none" stroke="${skinLight}" stroke-width=".65" opacity=".34"/></g>`;
}

export function fineFaceFrontDetails(a, { nose, noseY, lipHalf, curve, skinLight, skinShade, lip, id }) {
  const f = fineFaceGeometry(a);
  if (!f) return null;
  const n = value => Math.round(value * 100) / 100;
  const bridge = Number.isFinite(a.noseBridge) ? Math.max(.7, Math.min(1.3, a.noseBridge)) : 1;
  const tip = Number.isFinite(a.noseTip) ? Math.max(.75, Math.min(1.25, a.noseTip)) : 1;
  const root = 3 * bridge * f.nasalRootWidth;
  const wing = nose * f.nasalWingWidth;
  const fullness = Number.isFinite(a.lipFullness) ? Math.max(.75, Math.min(1.25, a.lipFullness)) : 1;
  const upper = (3 + fullness) * f.upperLipScale;
  const lower = fullness * 5 * f.lowerLipScale;
  const seam=204+(a.expression==='warm'?2:0)+curve*.35;
  const sculptedNose=a.detailVersion==='natural-appearance-detail-v1'
    ?reliefNoseMarkup({root,wing,nose,tip,noseY,skinLight,skinShade,id}):null;
  const noseShadow=`<radialGradient id="${id}-nose-form-shadow"><stop stop-color="${skinShade}" stop-opacity=".32"/><stop offset="1" stop-color="${skinShade}" stop-opacity="0"/></radialGradient><radialGradient id="${id}-nose-form-light"><stop stop-color="${skinLight}" stop-opacity=".38"/><stop offset="1" stop-color="${skinLight}" stop-opacity="0"/></radialGradient>`;
  return {
    nose: sculptedNose || `<g class="portrait-nose portrait-fine-nose"><defs>${noseShadow}</defs><ellipse cx="${n(160+root*1.25)}" cy="${n((146+noseY)/2)}" rx="${n(root*2.2)}" ry="${n((noseY-143)/2)}" fill="url(#${id}-nose-form-shadow)"/><ellipse cx="${n(160-root*.35)}" cy="${n((148+noseY)/2)}" rx="${n(root*1.3)}" ry="${n((noseY-149)/2)}" fill="url(#${id}-nose-form-light)"/><ellipse cx="160" cy="${n(noseY+4)}" rx="${n(wing*1.1)}" ry="3.5" fill="url(#${id}-nose-form-shadow)"/><ellipse cx="${n(159-wing*.08)}" cy="${n(noseY-1)}" rx="${n(nose*.72*tip)}" ry="${n(5*tip)}" fill="url(#${id}-nose-form-light)"/>${[-1,1].map(side=>`<ellipse cx="${n(160+side*wing*.62)}" cy="${n(noseY+3)}" rx="${n(wing*.22)}" ry="1.25" fill="${skinShade}" opacity=".65"/>`).join('')}<path d="M${n(160-wing*.94)} ${n(noseY+2)} Q${n(160-wing)} ${n(noseY-3)} ${n(160-wing*.66)} ${n(noseY-4)} M${n(160+wing*.66)} ${n(noseY-4)} Q${n(160+wing)} ${n(noseY-3)} ${n(160+wing*.94)} ${n(noseY+2)}" fill="none" stroke="${skinShade}" opacity=".30" stroke-width=".7"/></g>`,
    lips: a.detailVersion==='natural-appearance-detail-v1'
      ?reliefLipMarkup({lipHalf,curve,upper,lower,seam,skinLight,skinShade,lip,id})
      :`<g class="portrait-lips portrait-fine-lips"><path d="M${n(160-lipHalf)} 204 C${n(160-lipHalf*.65)} ${n(204-upper*.45-curve)} ${n(160-lipHalf*.28)} ${n(204-upper-curve)} ${n(160-lipHalf*.15)} ${n(204-upper*.75-curve)} Q160 ${n(202+curve*.4)} ${n(160+lipHalf*.15)} ${n(204-upper*.75-curve)} C${n(160+lipHalf*.28)} ${n(204-upper-curve)} ${n(160+lipHalf*.65)} ${n(204-upper*.45-curve)} ${n(160+lipHalf)} 204 Q160 ${n(seam)} ${n(160-lipHalf)} 204Z" fill="${blend(lip,skinShade,.22)}" opacity=".92"/><path d="M${n(160-lipHalf)} 204 Q160 ${n(seam)} ${n(160+lipHalf)} 204 Q160 ${n(204+lower)} ${n(160-lipHalf)} 204Z" fill="${blend(lip,skinLight,.10)}" opacity=".90"/><path d="M${n(160-lipHalf)} 204 Q160 ${n(seam)} ${n(160+lipHalf)} 204" fill="none" stroke="${blend(skinShade,lip,.35)}" opacity=".85" stroke-width=".85"/><path d="M${n(160-lipHalf*.45)} ${n(204+lower*.40)} Q160 ${n(204+lower*.68)} ${n(160+lipHalf*.4)} ${n(204+lower*.40)}" fill="none" stroke="${skinLight}" opacity=".35" stroke-width=".65"/></g>`,
    // Projection and forehead slope are profile-only; frontal lighting shows
    // the brow plane without pretending to measure sagittal displacement.
    planes: `<g class="portrait-fine-brow-plane" fill="${skinShade}" opacity="${n(.03+f.browRidge*.13)}"><ellipse cx="134" cy="125" rx="17" ry="${n(2+f.browRidge*5)}"/><ellipse cx="186" cy="125" rx="17" ry="${n(2+f.browRidge*5)}"/></g>`+(a.detailVersion==='natural-appearance-detail-v1'?`<g class="portrait-perioral-form" data-material="facial-contact-v1"><defs><linearGradient id="${id}-perioral" x2="1"><stop stop-color="${skinShade}" stop-opacity="0"/><stop offset=".5" stop-color="${skinShade}" stop-opacity=".26"/><stop offset="1" stop-color="${skinShade}" stop-opacity="0"/></linearGradient></defs>${[-1,1].map(side=>`<path d="M${n(160+side*wing*.96)} ${n(noseY+4)} Q${n(160+side*(lipHalf+5))} ${n(noseY+12)} ${n(160+side*(lipHalf+5))} 207 Q${n(160+side*(lipHalf+2))} 208 ${n(160+side*lipHalf)} 204 Q${n(160+side*(lipHalf+1))} ${n(noseY+13)} ${n(160+side*wing*.76)} ${n(noseY+5)}Z" fill="url(#${id}-perioral)"/>`).join('')}</g>`:'')
  };
}
