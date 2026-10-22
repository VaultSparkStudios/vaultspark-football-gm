// The profile API projects the canonical appearance/frame model. Rendering
// never samples the simulation RNG or loads the engine into the UI boot graph.
import { HAIR_STYLE_RULES } from "./portraitAppearanceContract.js";
import { grayHairFiberAttributes } from './hairGrayFibers.js';
import { hairPartPosition, hairFiberAttributes, hairFiberShapeScale } from './hairArrangement.js';
import { fineFaceFrontDetails, fineFaceFrontContour, fineFaceEyeContours, fineFaceFrontLandmarks } from './fineFaceGeometry.js';
import { portraitSurfaceLighting } from './portraitSurfaceLighting.js';
import { longHairFlowPath, longHairFrontOutline } from './longHairFlow.js';
import { croppedHairVolume } from './croppedHairVolume.js';
import { structuredHairMarkup } from './structuredHair.js';
import { partedHairFrontOutline, partedHairFrontFiber } from './partedHairFlow.js';
import {continuousHairCoordinate,interpolateHairTexture,continuousHairStrandPath,continuousHairStrandUse} from './continuousHairTexture.js';
import { portraitEyeSurface } from './portraitEyeSurface.js';

import { appearanceSkinColor, appearanceHairColors, blendAppearanceColor as blend, bodySkinStops } from './appearancePalette.js';
import {tryPlayerHeadImage} from './playerHeadImage.js';

export { appearanceSkinColor } from './appearancePalette.js';

function fnv1a(value) {
  let hash = 2166136261;
  for (const character of String(value)) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return hash >>> 0;
}
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

const escape = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const n = value => Number(value.toFixed(2));
function detailedHairTexture(a, id, silhouette, textureSeed) {
  if (!HAIR_STYLE_RULES[a.hairstyle]?.textureVisible) return "";
  if (a.fineFaceVersion === 'fine-face-v1' && a.detailVersion === 'natural-appearance-detail-v1' && ['swept','side-part'].includes(a.hairstyle)) return partedHairTexture(a,id,silhouette,textureSeed);
  if (a.fineFaceVersion === 'fine-face-v1' && a.detailVersion === 'natural-appearance-detail-v1' && a.hairstyle === 'long') return longHairTexture(a,id,silhouette,textureSeed);
  if (a.detailVersion === 'natural-appearance-detail-v1' && ['buzz','fade','waves'].includes(a.hairstyle)) {
    return closeHairTexture(a,id,silhouette,textureSeed);
  }
  if (a.detailVersion === "natural-appearance-detail-v1" && ["crew", "short-curls", "coils", "afro"].includes(a.hairstyle)) {
    return croppedHairTexture(a, id, silhouette, textureSeed);
  }
  const marks = [];
  const coily = a.hairTexture === "coily", curly = a.hairTexture === "curly";
  const rows = coily ? 7 : curly ? 4 : 1;
  const columns = coily ? 21 : curly ? 13 : 23;
  const fine = a.detailVersion === "natural-appearance-detail-v1";
  const bounded = (key, fallback, lo, hi) => Number.isFinite(a[key]) ? clamp(a[key], lo, hi) : fallback;
  const curve = bounded("hairCurvature", 1, .65, 1.45), wave = bounded("hairWaveScale", 1, .65, 1.5);
  const wrap = (x, y, fiber) => {
    const scale=hairFiberShapeScale(a,textureSeed,fiber);
    if (fine) marks.push(`<g transform="translate(${n(x)} ${n(y)}) scale(${n(curve*scale)} ${n(wave*scale)}) translate(${n(-x)} ${n(-y)})">${marks.pop()}</g>`);
  };
  for (let row = 0; row < rows; row++) for (let i = 0; i < columns; i++) {
    const gray = grayHairFiberAttributes(a, a.renderAge, textureSeed, `loose:${row}:${i}`);
    const variation = fnv1a(`${textureSeed}:hair:${row}:${i}`);
    const fiber = hairFiberAttributes(a, textureSeed, `loose:${row}:${i}`, (coily ? .8 : 1) * bounded("hairStrandWidth", 1, .65, 1.5));
    const x = 92 + i * (coily ? 7 : curly ? 11 : 6) + (variation % 7 - 3), y = 44 + row * (coily ? 10 : 17) + Math.abs(columns / 2 - i) * .6 + ((variation >>> 4) % 7 - 3);
    marks.push(coily ? `<path${gray}${fiber} d="M${n(x - 1)} ${n(y)} q${n(2 + variation % 3)} -3 3 1 q-1 4 -3 1" opacity="${n(.45 + variation % 5 * .1)}"/>`
      : curly ? `<path${gray}${fiber} d="M${n(x)} ${n(y)} q-6 -5 -5 3 q0 7 6 5 q6 -3 2 -8" transform="rotate(${variation % 80 - 40} ${n(x)} ${n(y)})" opacity="${n(.4 + variation % 6 * .1)}"/>`
        : a.hairTexture === "wavy" ? `<path${gray}${fiber} d="M${n(x)} ${n(y)} q-7 9 0 18 t0 18 t0 18 t0 18"/>`
          : `<path${gray}${fiber} d="M${n(x)} ${n(y)} q-2 28 3 66"/>`);
    wrap(x, y, `loose:${row}:${i}`);
  }
  if (a.hairstyle === "long") for (const side of [-1, 1]) for (let i = 0; i < 5; i++) {
    const gray = grayHairFiberAttributes(a, a.renderAge, textureSeed, `long:${side}:${i}`);
    const fiber=hairFiberAttributes(a,textureSeed,`long:${side}:${i}`,bounded("hairStrandWidth",1,.65,1.5));
    const x = side < 0 ? 91 + i * 4 : 214 + i * 4;
    marks.push(a.hairTexture === "straight" ? `<path${gray}${fiber} d="M${x} 115 q${side * 4} 60 0 115"/>`
      : a.hairTexture === "wavy" ? `<path${gray}${fiber} d="M${x} 115 q${side * 6} 12 0 24 t0 24 t0 24 t0 24"/>`
        : `<path${gray}${fiber} d="M${x} 115 ${Array.from({ length: 7 }, () => `q${coily ? 4 : 7} -3 2 ${coily ? 8 : 12} q-${coily ? 5 : 8} 5 -2 ${coily ? 6 : 8}`).join(" ")}"/>`);
    wrap(x, 115, `long:${side}:${i}`);
  }
  return `<defs><clipPath id="${id}-hair-clip">${silhouette}</clipPath></defs><g class="portrait-hair-texture" data-texture="${a.hairTexture}" clip-path="url(#${id}-hair-clip)" fill="none" stroke="url(#${id}-hair-light)" stroke-width="${fine ? n((coily ? .8 : 1) * bounded("hairStrandWidth", 1, .65, 1.5)) : coily ? .8 : 1}" opacity=".36">${marks.join("")}</g>`;
}

function partedHairTexture(a,id,silhouette,seed) {
  const width=Number.isFinite(a.hairStrandWidth)?clamp(a.hairStrandWidth,.65,1.5):1;
  const marks=[];
  for(const side of [-1,1])for(let i=0;i<32;i++){
    const fiber=`parted:${side}:${i}`,d=partedHairFrontFiber(a,side,i/31,hairFiberShapeScale(a,seed,fiber));
    marks.push(`<path${grayHairFiberAttributes(a,a.renderAge,seed,fiber)}${hairFiberAttributes(a,seed,fiber,.9*width)} d="${d}" opacity="${i%5===0?'.85':'.65'}"/>`);
  }
  return `<defs><clipPath id="${id}-hair-clip">${silhouette}</clipPath></defs><g class="portrait-hair-texture" data-parted-flow="rounded-v1" data-texture="${a.hairTexture}" clip-path="url(#${id}-hair-clip)" fill="none" stroke="url(#${id}-hair-light)" stroke-width="${n(.9*width)}" stroke-linecap="round">${marks.join('')}</g>`;
}

function closeHairTexture(a,id,silhouette,textureSeed) {
  const modern=a.fineFaceVersion==='fine-face-v1';
  const continuous=modern?continuousHairStrandPath(a,0,0,1):null,reference=`${id}-close-continuous-strand`;
  const safe=(key,fallback,lo,hi)=>Number.isFinite(a[key])?clamp(a[key],lo,hi):fallback;
  const curve=safe('hairCurvature',1,.65,1.45),wave=safe('hairWaveScale',1,.65,1.5);
  const width=safe('hairStrandWidth',1,.65,1.5);
  const marks=Array.from({length:modern?(a.hairstyle==='waves'?250:a.hairstyle==='buzz'?1100:700):(a.hairstyle==='waves'?190:430)},(_,i)=>{
    const h=fnv1a(`${textureSeed}:close-hair:${i}`),x=92+h%137,y=53+((h>>>9)%93);
    const angle=(h>>>18)%50-25;
    // Closely cut fibers stay short. Texture never draws long parallel bars
    // through the forehead, and wave ridges are clipped to the scalp itself.
    const scale=hairFiberShapeScale(a,textureSeed,`close:${i}`);
    const length=(a.hairstyle==='waves'?4.8:modern?3.2:1.8)*wave*scale;
    const bend=(a.hairTexture==='coily'?1.6:a.hairTexture==='curly'?1.2:a.hairTexture==='wavy'?.7:.15)*curve*scale;
    const d=continuous?'':(modern&&(a.hairTexture==='coily'||a.hairTexture==='curly')
      ? `M${x} ${y} q${n(-bend)} ${n(-length*.65)} ${n(length*.5)} ${n(-length*.4)} q${n(bend)} ${n(length*.55)} ${n(-length*.2)} ${n(length*.7)}`
      : `M${x} ${y} q${n(bend)} ${n(-length*.6)} ${n(length)} ${n(-length*.25)}`);
    if(modern){
      // Stubble is dark fiber material against the scalp, not an embossed
      // pale pattern. A smaller highlight preserves pigment and gray fibers.
      const transform=`rotate(${angle} ${x} ${y})`;
      const pigment=grayHairFiberAttributes(a,a.renderAge,textureSeed,`close:${i}`)||` stroke="${blend(a.hairColor,'#e1d5c0',.16)}"`;
      if(continuous)return continuousHairStrandUse(reference,x,y,length,scale,` stroke="${blend(a.hairColor,'#100d0b',.2)}" stroke-width="${n(.65*width/length)}" opacity="${n(.3+h%11*.02)}"`,transform)+continuousHairStrandUse(reference,x,y,length,scale,pigment+` stroke-width="${n(.28*width/length)}" opacity=".35"`,transform);
      return `<path d="${d}" transform="${transform}" stroke="${blend(a.hairColor,'#100d0b',.2)}" stroke-width="${n(.65*width*scale)}" opacity="${n(.3+h%11*.02)}"/><path${pigment}${hairFiberAttributes(a,textureSeed,`close:${i}`,.28*width)} d="${d}" transform="${transform}" opacity=".35"/>`;
    }
    return `<path${grayHairFiberAttributes(a, a.renderAge, textureSeed, `close:${i}`)}${hairFiberAttributes(a,textureSeed,`close:${i}`,.55*width)} d="${d}" transform="rotate(${angle} ${x} ${y})" opacity="${n(.25+h%11*.045)}"/>`;
  }).join('');
  const ridges=a.hairstyle==='waves'?Array.from({length:9},(_,i)=>{
    const y=57+i*6*wave;
    return `<path d="M91 ${n(y+16)} Q157 ${n(y-15*curve)} 229 ${n(y+13)}" stroke-width="${n((modern?.9:.55)*width)}" opacity="${modern?'.65':'.26'}"/>`;
  }).join(''):'';
  return `<defs><clipPath id="${id}-hair-clip">${silhouette}</clipPath>${continuous?`<path id="${reference}" d="${continuous}"/>`:''}</defs><g class="portrait-hair-texture" data-texture="${a.hairTexture}" data-close-strands="true" clip-path="url(#${id}-hair-clip)" fill="none" stroke="url(#${id}-hair-light)" stroke-width="${n(.55*width)}" stroke-linecap="round">${ridges}${marks}</g>`;
}

function croppedHairCrown(a, textureSeed) {
  const [rx, ry, cy] = {crew:[61,32,92], "short-curls":[66,45,98], coils:[69,48,99], afro:[83,72,102]}[a.hairstyle];
  const tight = a.hairTexture === "coily", straight = a.hairTexture === "straight";
  const modern=a.fineFaceVersion==='fine-face-v1';
  const ripple = a.hairstyle === "crew" ? .8 : modern ? (tight ? 3.2 : 4.8) : tight ? 1.5 : 2.7;
  const points = Array.from({length:49},(_,i)=>{
    const angle=Math.PI+i*Math.PI/48;
    const variation=fnv1a(`${textureSeed}:crown:${modern?Math.floor(i/3):i}`)%1000/999-.5;
    const radius=(interpolateHairTexture(a,[modern?4.8:2.7,modern?4.8:2.7,modern?4.8:2.7,modern?3.2:1.5])??ripple)*variation*(interpolateHairTexture(a,[.35,1,1,1])??(straight?.35:1))*(continuousHairCoordinate(a)!==null&&a.hairstyle==='crew'?.8/(modern?4.8:2.7):1);
    return [160+(rx+radius)*Math.cos(angle),cy+(ry+radius)*Math.sin(angle)];
  });
  let path=`M${n(points[0][0])} ${n(points[0][1])}`;
  for(let i=1;i<points.length-1;i++) {
    const p=points[i],q=points[i+1];
    path+=` Q${n(p[0])} ${n(p[1])} ${n((p[0]+q[0])/2)} ${n((p[1]+q[1])/2)}`;
  }
  const end=points.at(-1);
  path+=` L${n(end[0])} ${n(end[1])}`;
  return a.hairstyle === "afro"
    ? `${path} Q247 128 231 146 L214 112 Q211 83 166 83 Q120 80 110 121 L98 146 Q77 131 ${n(points[0][0])} ${n(points[0][1])}Z`
    : `${path} Q226 117 220 138 L208 112 Q200 84 166 83 Q125 80 111 118 L100 138 Q95 113 ${n(points[0][0])} ${n(points[0][1])}Z`;
}

function croppedHairTexture(a,id,silhouette,textureSeed) {
  const modern=a.fineFaceVersion==='fine-face-v1';
  const continuous=modern?continuousHairStrandPath(a,0,0,1):null,reference=`${id}-cropped-continuous-strand`;
  const safe=(key,fallback,lo,hi)=>Number.isFinite(a[key])?clamp(a[key],lo,hi):fallback;
  const curvature=safe('hairCurvature',1,.65,1.45),wave=safe('hairWaveScale',1,.65,1.5);
  const coily=a.hairTexture==='coily',curly=a.hairTexture==='curly';
  const marks=Array.from({length:modern?(a.hairstyle==='afro'?1800:1400):(a.hairstyle==='afro'?500:340)},(_,i)=>{
    const h=fnv1a(`${textureSeed}:cropped-strand:${i}`);
    const x=72+(h%1009)/1009*177,y=20+((h>>>11)%997)/997*123;
    const scale=hairFiberShapeScale(a,textureSeed,`cropped:${i}`);
    const radius=(interpolateHairTexture(a,[1.1,1.1,2.8,1.35])??(coily?1.35:curly?2.8:1.1))*curvature*(.7+(h%17)/28)*scale;
    const dy=(interpolateHairTexture(a,[9,9,5,3])??(coily?3:curly?5:9))*wave*scale;
    const turn=((h>>>4)%75)-37;
    const d=continuous?'':(coily||curly
      ? `M${n(x-radius)} ${n(y)} c${n(-radius*.5)} ${n(-dy*.6)} ${n(radius*1.8)} ${n(-dy*.7)} ${n(radius*2)} 0 c${n(radius*.3)} ${n(dy*.5)} ${n(-radius*.8)} ${n(dy*.8)} ${n(-radius*1.5)} ${n(dy*.3)}`
      : `M${n(x)} ${n(y)} q${n(a.hairTexture==='wavy'?-radius*2:-radius*.3)} ${n(dy*.5)} ${n(radius)} ${n(dy)}`);
    if(modern){
      const width=safe('hairStrandWidth',1,.65,1.5),transform=`rotate(${turn} ${n(x)} ${n(y)})`;
      // Layer small shaded locks so curls have material depth instead of
      // identical bright rings printed on one flat hair-colored surface.
      const pigment=grayHairFiberAttributes(a,a.renderAge,textureSeed,`cropped:${i}`)||` stroke="${blend(a.hairColor,'#e1d5c0',.12+(h%7)*.015)}"`;
      if(continuous)return continuousHairStrandUse(reference,x,y,dy,scale,` stroke="${blend(a.hairColor,'#100d0b',.15+(h%7)*.01)}" stroke-width="${n((interpolateHairTexture(a,[1.3,1.3,1.3,1]))*width/dy)}" opacity="${n(.25+(h%13)/50)}"`,transform)+continuousHairStrandUse(reference,x,y,dy,scale,pigment+` stroke-width="${n(interpolateHairTexture(a,[.45,.45,.45,.35])*width/dy)}" opacity="${n(.2+(h%13)/55)}"`,transform);
      return `<path d="${d}" transform="${transform}" stroke="${blend(a.hairColor,'#100d0b',.15+(h%7)*.01)}" stroke-width="${n((interpolateHairTexture(a,[1.3,1.3,1.3,1])??(coily?1:1.3))*width*scale)}" opacity="${n(.25+(h%13)/50)}"/><path${pigment}${hairFiberAttributes(a,textureSeed,`cropped:${i}`,(interpolateHairTexture(a,[.45,.45,.45,.35])??(coily?.35:.45))*width)} d="${d}" transform="${transform}" opacity="${n(.2+(h%13)/55)}"/>`;
    }
    return `<path${grayHairFiberAttributes(a, a.renderAge, textureSeed, `cropped:${i}`)}${hairFiberAttributes(a,textureSeed,`cropped:${i}`,(coily?.65:.85)*safe('hairStrandWidth',1,.65,1.5))} d="${d}" transform="rotate(${turn} ${n(x)} ${n(y)})" opacity="${n(.28+(h%13)/20)}"/>`;
  }).join('');
  const volume=croppedHairVolume(a,textureSeed,{id,clip:`${id}-hair-clip`,x:72,y:20,width:177,height:123});
  return `<defs><clipPath id="${id}-hair-clip">${silhouette}</clipPath>${continuous?`<path id="${reference}" d="${continuous}"/>`:''}</defs>${volume}<g class="portrait-hair-texture" data-texture="${a.hairTexture}" data-cropped-strands="true" clip-path="url(#${id}-hair-clip)" fill="none" stroke="url(#${id}-hair-light)" stroke-width="${n((interpolateHairTexture(a,modern?[1.1,1.1,1.1,.85]:[.85,.85,.85,.65])??(modern?(coily?.85:1.1):(coily?.65:.85)))*safe('hairStrandWidth',1,.65,1.5))}" stroke-linecap="round" opacity="${modern?'.9':'.54'}">${marks}</g>`;
}

function longHairTexture(a,id,silhouette,seed) {
  const part=120+80*(hairPartPosition(a) ?? .5);
  const strandWidth=Number.isFinite(a.hairStrandWidth)?clamp(a.hairStrandWidth,.65,1.5):1;
  const strands=[];
  for(const side of [-1,1])for(let i=0;i<26;i++) {
    const h=fnv1a(`${seed}:flow:${side}:${i}`),t=i/25;
    const x=side<0?86+t*27:207+t*25,y=55+t*12;
    const residual=hairFiberShapeScale(a,seed,`flow:${side}:${i}`);
    const end=223+(h%15)-7;
    const flow=longHairFlowPath(a,seed,`flow:${side}:${i}`,x,112,x+side*2,end,residual).replace(/^M/,'L');
    const d=`M${n(part+side*t*8)} ${n(43+t*7)} C${n(x+side*4)} ${n(y)} ${n(x-side*8)} 82 ${n(x)} 112 ${flow}`;
    const broad=i%4===0;
    if(i%6===0)strands.push(`<path d="${d}" stroke="${blend(a.hairColor,'#100e0c',.28)}" stroke-width="${n(6*strandWidth)}" opacity=".65"/>`);
    strands.push(`<path d="${d}" stroke="${blend(a.hairColor,broad?'#17100c':'#efe2c8',.12)}" stroke-width="${n((broad?2.6:.65)*strandWidth)}" opacity="${broad?'.25':'.28'}"/>`);
    strands.push(`<path${grayHairFiberAttributes(a,a.renderAge,seed,`flow:${side}:${i}`)}${hairFiberAttributes(a,seed,`flow:${side}:${i}`,.5*strandWidth)} d="${d}" opacity=".4"/>`);
  }
  return `<defs><clipPath id="${id}-hair-clip">${silhouette}</clipPath></defs><g class="portrait-hair-texture" data-long-flow="true" data-long-flow-version="continuous-locks-v2" data-texture="${a.hairTexture}" clip-path="url(#${id}-hair-clip)" fill="none" stroke="url(#${id}-hair-light)" stroke-linecap="round">${strands.join('')}</g>`;
}

function irisMarkup(a, x, y, eyeId) {
  if (a.detailVersion !== "natural-appearance-detail-v1") return `<circle cx="${x}" cy="${n(y)}" r="4.2" fill="${a.eyeColor}"/>`;
  const safe = (key, fallback, lo, hi) => Number.isFinite(a[key]) ? clamp(a[key], lo, hi) : fallback;
  const shade = safe("irisShade", 0, -.25, .25);
  const color = blend(a.eyeColor, shade < 0 ? "#171b20" : "#dfd5ba", Math.abs(shade));
  const inner = safe("irisInnerMix", .2, 0, .65), pattern = safe("irisPattern", .3, 0, 1);
  const sculpted=a.fineFaceVersion==='fine-face-v1';
  const rays = Array.from({ length: 24 }, (_, i) => {
    const angle = i * Math.PI / 12;
    const innerRadius = 2.1 + (i % 3) * .15;
    return `<path d="M${n(x + Math.cos(angle) * innerRadius)} ${n(y + Math.sin(angle) * innerRadius)} L${n(x + Math.cos(angle) * 4.3)} ${n(y + Math.sin(angle) * 4.3)}"/>`;
  }).join("");
  // Pigment and radial detail remain independent of the saved eyelid shape.
  return `<g class="portrait-iris-detail"><defs><radialGradient id="${eyeId}-iris"><stop stop-color="${blend(color, "#a27843", inner)}"/><stop offset="${sculpted?'.25':'.4'}" stop-color="${blend(color, "#a27843", inner)}"/><stop offset=".68" stop-color="${color}"/><stop offset=".9" stop-color="${blend(color, "#dfd5ba", .08)}"/><stop offset="1" stop-color="${blend(color, "#171b20", .28)}"/></radialGradient></defs><circle cx="${x}" cy="${n(y)}" r="${sculpted?'5.15':'4.6'}" fill="url(#${eyeId}-iris)"/><g fill="none" stroke="${blend(color, "#e9d4ae", .45)}" stroke-width=".2" opacity="${n(pattern * .65)}">${rays}</g><circle cx="${x}" cy="${n(y)}" r="${sculpted?'5':'4.45'}" fill="none" stroke="${blend(color, '#171b20', .45)}" stroke-width=".25"/></g>`;
}

function hairMarkup(a, id, textureSeed) {
  const part = ['side-part','swept','long'].includes(a.hairstyle) ? hairPartPosition(a) : null;
  let partMarkup = '';
  const cap = "M99 137 Q91 71 118 59 Q162 34 200 64 Q227 89 221 138 L209 112 Q201 84 166 82 Q121 79 110 118 Z";
  const fills = {
    buzz: `<path d="${cap}" opacity=".70"/>`,
    fade: `<path d="${cap}" opacity=".35"/><path d="M103 104 Q100 61 135 52 Q184 40 213 79 L210 102 Q161 80 103 104Z"/>`,
    crew: `<path d="${cap}"/><path d="M109 80 L112 57 L120 64 L132 49 L144 58 L158 46 L170 54 L184 50 L200 66 L207 89Z"/>`,
    "short-curls": `<path d="${cap}"/><path d="M103 88 Q96 70 111 67 Q108 49 127 53 Q133 37 147 48 Q160 32 175 46 Q190 36 201 53 Q220 48 220 70 Q233 75 218 94 Q169 76 103 99Z"/>`,
    coils: `<path d="${cap}"/><path d="M100 93 Q87 78 102 67 Q94 49 114 48 Q112 32 133 39 Q146 25 158 38 Q174 25 186 39 Q211 30 213 52 Q233 51 228 73 Q239 91 221 104 L210 91 Q153 73 100 106Z"/>`,
    afro: `<path d="M94 150 Q66 128 79 104 Q60 84 81 67 Q68 40 98 39 Q105 16 129 24 Q150 5 171 22 Q204 8 215 32 Q245 25 248 55 Q267 74 247 95 Q265 120 231 148 L214 110 Q217 73 167 72 Q112 68 110 119Z"/>`,
    waves: `<path d="${cap}"/><path d="M109 82 Q159 52 208 85 M107 92 Q159 65 212 96 M105 102 Q158 77 212 106" stroke="url(#${id}-hair-light)" fill="none" stroke-width="2"/>`,
    "side-part": `<path d="${cap}"/><path d="M104 92 Q99 54 140 48 Q186 35 214 71 Q169 58 130 82Z"/><path d="M188 54 Q174 65 177 90" stroke="url(#${id}-skin)" stroke-width="2" fill="none"/>`,
    swept: `<path d="${cap}"/><path d="M96 100 Q78 65 118 47 Q162 19 213 51 Q189 75 138 77 Q119 85 96 100Z"/>`,
    long: `<path d="M105 141 Q80 99 96 67 Q113 37 159 41 Q211 34 230 83 L237 229 Q218 256 206 231 L206 115 Q207 77 164 80 Q114 76 110 119 L114 234 Q90 254 79 224Z"/>`,
    receding: `<path d="M98 143 Q91 103 110 78 L119 82 Q108 112 110 145Z M207 144 L211 111 L205 81 Q230 102 222 145Z"/><path d="M134 62 Q160 46 186 64 L184 69 Q160 56 137 69Z" opacity=".65"/>`,
    shaved: "",
    locs: `<path d="${cap}"/>` + Array.from({ length: 11 }, (_, i) => `<path d="M${108 + i * 10} ${68 + Math.abs(5 - i) * 3} Q${100 + i * 11} 100 ${100 + i * 12} ${i === 0 || i === 10 ? 181 : 112 + (i % 3) * 5}" stroke-width="8"/>`).join(""),
    braids: `<path d="${cap}"/>` + Array.from({ length: 7 }, (_, i) => `<path d="M${119 + i * 13} 67 Q${105 + i * 17} 89 ${108 + i * 17} 113" stroke="#000" stroke-opacity=".35" stroke-width="5"/><path d="M${119 + i * 13} 67 Q${105 + i * 17} 89 ${108 + i * 17} 113"${grayHairFiberAttributes(a,a.renderAge,textureSeed,`braid:${i}`)||` stroke="url(#${id}-hair-light)"`} stroke-width="2" stroke-dasharray="2 2"/>`).join("") + `<path d="M105 115 Q93 132 96 178 M216 115 Q228 132 224 178" fill="none" stroke-width="6" stroke-dasharray="4 1"/>`
  };
  if (a.detailVersion === "natural-appearance-detail-v1") {
    const half=59*a.faceWidth;
    const thickness={buzz:1,fade:4,waves:2}[a.hairstyle]??1;
    // Close cuts follow the same rounded skull as the modern face, with a
    // small cut-specific offset rather than a flattened cap above it.
    const outer=a.fineFaceVersion==='fine-face-v1'
      ?`M${n(160-half-2)} 139 L${n(160-half-thickness)} 113 C${n(155-half-thickness)} ${82-thickness} ${n(160-half*.54)} ${65-thickness} 160 ${65-thickness} C${n(160+half*.54)} ${65-thickness} ${n(165+half+thickness)} ${82-thickness} ${n(160+half+thickness)} 113 L${n(160+half+2)} 140`
      :`M${n(160-half-2)} 139 C${n(152-half)} 105 ${n(152-half)} 78 ${n(160-half*.7)} 65 C${n(160-half*.35)} 51 ${n(160+half*.4)} 51 ${n(160+half*.78)} 69 C${n(170+half)} 86 ${n(167+half)} 115 ${n(160+half+2)} 140`;
    const fittedCap=`${outer} L${n(160+half*.83)} 119 C${n(160+half*.8)} 96 ${n(160+half*.48)} 85 162 84 C${n(160-half*.45)} 82 ${n(160-half*.8)} 98 ${n(160-half*.85)} 119Z`;
    fills.buzz=`<path d="${fittedCap}" opacity=".6"/>`;
    fills.fade=`<path d="${fittedCap}" fill="url(#${id}-fade-depth)"/>`;
    fills.waves=`<path d="${fittedCap}"/>`;
    // Rounded thinning temples and scattered crown fibers replace the old
    // detached rectangular side patches and solid strip across a bald crown.
    fills.receding=`<path d="M${n(160-half-2)} 140 C${n(152-half)} 116 ${n(155-half)} 94 ${n(160-half*.83)} 83 Q${n(160-half*.7)} 81 ${n(160-half*.75)} 93 C${n(160-half*.86)} 110 ${n(160-half*.8)} 126 ${n(160-half*.82)} 142Z M${n(160+half+2)} 140 C${n(168+half)} 116 ${n(165+half)} 94 ${n(160+half*.83)} 83 Q${n(160+half*.7)} 81 ${n(160+half*.75)} 93 C${n(160+half*.86)} 110 ${n(160+half*.8)} 126 ${n(160+half*.82)} 142Z" opacity=".75"/>`+Array.from({length:64},(_,i)=>{
      const h=fnv1a(`${textureSeed}:receding:${i}`),x=139+h%44,y=62+(h>>>8)%13;
      return `<path${grayHairFiberAttributes(a, a.renderAge, textureSeed, `receding:${i}`)} d="M${x} ${y} q${n((h%7-3)*.4)} -3 ${n((h%5-2)*.5)} -4" fill="none" stroke-width=".6" opacity="${n(.15+h%7*.06)}"/>`;
    }).join('');
    if (["crew", "short-curls", "coils", "afro"].includes(a.hairstyle)) {
      fills[a.hairstyle]=`<path d="${croppedHairCrown(a,textureSeed)}"/>`;
    }
    // A parted crown and uneven hanging ends break the solid helmet outline.
    // The persisted cosmetic recipe still supplies color, density and texture.
    fills.long = `<path d="M104 138 C89 118 84 86 99 65 C116 42 147 36 166 43 C195 36 220 58 226 86 C230 126 229 173 235 224 Q231 238 225 234 L220 239 L214 231 L209 233 C207 195 212 158 206 119 C206 94 190 78 171 76 Q158 82 147 82 C128 85 115 98 111 119 L112 227 L108 235 L103 230 L98 235 L91 228 Q86 235 82 224 C91 185 96 160 104 138Z"/><path d="M165 44 Q153 58 150 79" fill="none" stroke="url(#${id}-hair-light)" stroke-width="1.4" opacity=".6"/>`;
    if(a.fineFaceVersion==='fine-face-v1') fills.long=`<path d="${longHairFrontOutline(a,textureSeed)}"/>`;
    if(a.fineFaceVersion==='fine-face-v1' && ['swept','side-part'].includes(a.hairstyle)) fills[a.hairstyle]=`<path d="${partedHairFrontOutline(a)}"/>`;
    fills.locs = `<path d="M99 132 C93 105 97 73 116 60 Q154 39 190 54 Q219 70 221 123 L211 104 Q207 81 175 80 Q132 72 112 113Z"/>` + Array.from({length:11},(_,i)=>{
      const seed=fnv1a(`${textureSeed}:lock:${i}`),x=108+i*10, end=i===0||i===10?178:105+seed%14;
      const d=`M${x} ${65+Math.abs(5-i)*2} C${x-5} 82 ${x-3+(seed%5)} 96 ${100+i*12} ${end}`;
      const gray=grayHairFiberAttributes(a,a.renderAge,textureSeed,`lock:${i}`);
      return `<path d="${d}" fill="none" stroke-width="${6+seed%3}"/>${gray?`<path${gray} d="${d}" fill="none" stroke-width=".8"/>`:''}`;
    }).join("");
  }
  if(a.fineFaceVersion==='fine-face-v1' && a.detailVersion==='natural-appearance-detail-v1' && ['locs','braids'].includes(a.hairstyle)) {
    const half=59*(Number.isFinite(a.faceWidth)?clamp(a.faceWidth,.7,1.3):1);
    const cap=`M${n(160-half)} 127 C${n(151-half)} 94 ${n(155-half)} 69 ${n(160-half*.68)} 59 C137 43 185 45 ${n(160+half*.72)} 63 Q${n(170+half)} 83 ${n(160+half)} 127 L${n(160+half*.83)} 106 Q196 77 163 81 Q127 77 ${n(160-half*.83)} 108Z`;
    fills[a.hairstyle]=`<path d="${cap}"/>`+structuredHairMarkup(a,textureSeed,{age:a.renderAge});
  }
  if (part !== null) {
    // Part placement is a grooming control. Older cuts keep their exact paths.
    if (a.hairstyle === 'side-part') fills['side-part'] = fills['side-part'].replace(/<path d="M188 54[^>]*\/>/, '');
    if (a.hairstyle === 'long') fills.long = fills.long.replace(/<path d="M165 44[^>]*\/>/, '');
    const px=120+80*part, top=a.hairstyle==='long'?44:a.hairstyle==='swept'?41:53;
    partMarkup = `<path class="portrait-hair-part" data-hair-part="${part}" d="M${n(px+4)} ${top} Q${n(px-5)} ${top+12} ${n(px-4)} 80" stroke="url(#${id}-skin)" stroke-width="1.5" fill="none"/>`;
  }
  const textured = !["shaved", "receding", "locs", "braids", "afro"].includes(a.hairstyle);
  const texture = textured ? Array.from({ length: 16 }, (_, i) => {
    const x = 110 + i * 6;
    const y = 73 + Math.abs(8 - i) * 1.3;
    return a.hairTexture === "coily" || a.hairTexture === "curly"
      ? `<path d="M${x} ${y + 7} q-4 -6 1 -9 q7 0 3 7"/>`
      : `<path d="M${x} ${y + 14} q${a.hairTexture === "wavy" ? -6 : -2} -12 2 -20"/>`;
  }).join("") : "";
  const longStyle = ["long", "locs", "afro"].includes(a.hairstyle);
  const enhanced = a.version === "portrait-identity-v3";
  const length = enhanced ? !HAIR_STYLE_RULES[a.hairstyle]?.lengthVisible ? 1
    : clamp(1 + ((a.hairLength ?? 1) - 1) * (longStyle ? .08 : .12), .94, a.hairstyle === "afro" ? 1.04 : longStyle ? 1.08 : 1.12)
    : longStyle ? a.hairLength || 1 : 1;
  const silhouette = fills[a.hairstyle] ?? fills.buzz;
  const detail = enhanced ? detailedHairTexture(a, id, silhouette, textureSeed) : `<g fill="none" stroke="url(#${id}-hair-light)" stroke-width="1" opacity=".4">${texture}</g>`;
  const rim = a.detailVersion === "natural-appearance-detail-v1" && a.fineFaceVersion !== 'fine-face-v1';
  // Light the composited silhouette, avoiding outlines at internal joins
  // between the cap, locks and cut-specific paths.
  return `${rim ? `<defs><filter id="${id}-hair-rim" x="-10%" y="-10%" width="120%" height="120%"><feDropShadow dx="0" dy="0" stdDeviation=".6" flood-color="#a6b1bb" flood-opacity=".5"/></filter></defs>` : ""}<g class="portrait-scalp-hair" data-hair-color="${a.hairColor}" ${rim ? `filter="url(#${id}-hair-rim)"` : ""}transform="translate(0 ${n((a.hairline || 0) * 4)}) translate(160 80) scale(1 ${n(length)}) translate(-160 -80)" opacity="${n(a.hairDensity ?? 1)}" fill="${enhanced ? `url(#${id}-hair-depth)` : a.hairColor}" stroke="${a.hairColor}" stroke-linecap="round">${silhouette}${detail}${partMarkup}</g>`;
}

export function buildPlayerPortraitSvg(player, options = {}) {
  const image=tryPlayerHeadImage(player,{blink:options.blink??0});
  if(!image)return buildLegacyPlayerPortraitSvg(player,options);
  const a=player.appearance;
  const head=`<image class="player-shared-head-image" x="50" y="0" width="220" height="440" href="${image.src}"/>`;
  if(options.headOnly)return `<svg class="player-portrait-svg" viewBox="50 0 220 270" overflow="visible" role="img" aria-label="${escape(player.name||'Player')} portrait" data-head-renderer="${image.renderer}" data-hairstyle="${escape(a.hairstyle)}" data-hair-texture="${escape(a.hairTexture)}">${head}</svg>`;
  const legacy=buildLegacyPlayerPortraitSvg(player,{...options,sharedHeadLighting:true});
  const marker='<g transform="translate(0 ';
  const cut=legacy.lastIndexOf(marker);
  if(cut<0)return legacy;
  return legacy.slice(0,cut).replace('<svg class="player-portrait-svg"',`<svg class="player-portrait-svg" data-head-renderer="${image.renderer}"`)+head+'</g></svg>';
}
export function buildLegacyPlayerPortraitSvg(player, { headOnly = false, idSuffix = "", sharedHeadLighting = false } = {}) {
  const originalAppearance = player?.appearance;
  const f = player?.visualFrame;
  if (!originalAppearance || !f) return '<div class="portrait-unavailable">Portrait unavailable</div>';
  const age = clamp(Number(player?.age) || 23, 18, 60);
  const grayShare = clamp((age - (originalAppearance.grayOnsetAge || 38)) / 24, 0, .65);
  const fiberGray=originalAppearance.version==='portrait-identity-v3'&&originalAppearance.detailVersion==='natural-appearance-detail-v1';
  const a = { ...originalAppearance, renderAge: age, hairColor: originalAppearance.dyedHairColor || (fiberGray?originalAppearance.hairColor:blend(originalAppearance.hairColor, "#c0beb7", grayShare)) };
  const enhanced = a.version === "portrait-identity-v3";
  const feature = (key, fallback) => enhanced && Number.isFinite(a[key]) ? a[key] : fallback;
  const pigments = appearanceHairColors(originalAppearance, age);
  const faceHairColor = pigments.face, browColor = pigments.brow;
  const id = `athlete-${fnv1a(player?.profile?.faceSeed || player?.id || player?.name || "anonymous")}${idSuffix}`;
  // Resource suffixes isolate gradients/clips, never cosmetic variation.
  // The fallback uses immutable appearance channels when a DTO omits profile.
  const textureSeed = player?.profile?.appearanceRecipe?.seed
    || [a.version, a.faceWidth, a.jawWidth, a.faceLength, a.noseWidth, a.blinkDelay].join(":");
  const skin = appearanceSkinColor(a);
  const surfaceLighting = portraitSurfaceLighting(a, {id,skin});
  const skinLight = blend(skin, "#fff0d9", .17);
  const skinShade = blend(skin, "#241a19", .32);
  const lip = blend(skin, "#8a4550", a.fineFaceVersion==='fine-face-v1'&&a.detailVersion==='natural-appearance-detail-v1' ? .42 : .30);
  const landmarks=fineFaceFrontLandmarks(a);
  const faceWidth = n(59 * a.faceWidth), jaw = n(landmarks?.jaw ?? 43 * a.jawWidth);
  const asymmetry = feature("facialAsymmetry", 0) * 1.8;
  const cheek = 1 + (feature("cheekFullness", 1) - 1) * .18;
  const chin = 16 * feature("chinWidth", 1), chinY = 241 + (feature("chinLength", 1) - 1) * 22;
  let face = enhanced ? `M${n(160 - faceWidth)} 113 Q${n(155 - faceWidth)} 70 160 65 Q${n(165 + faceWidth)} 69 ${n(160 + faceWidth)} 113 L${n(159 + faceWidth * cheek)} 165 Q${n(159 + jaw + asymmetry)} 219 ${n(160 + chin)} ${n(chinY - 11)} Q${n(160 + asymmetry)} ${n(chinY)} ${n(160 - chin)} ${n(chinY - 12)} Q${n(160 - jaw)} 216 ${n(160 - faceWidth * cheek)} 165Z`
    : `M${160 - faceWidth} 113 Q${155 - faceWidth} 70 160 65 Q${165 + faceWidth} 69 ${160 + faceWidth} 113 L${159 + faceWidth} 165 Q${159 + jaw} 219 176 230 Q160 241 144 229 Q${160 - jaw} 216 ${160 - faceWidth} 165Z`;
  if(a.detailVersion === 'natural-appearance-detail-v1') {
    const chinHalf=chin*1.35;
    // Continuous temple/cheek/jaw transitions avoid the straight triangular
    // lower face while retaining each stored jaw, cheek and chin channel.
    face=`M${n(160-faceWidth)} 113 C${n(155-faceWidth)} 82 128 65 160 65 C192 65 ${n(165+faceWidth)} 82 ${n(160+faceWidth)} 113 C${n(160+faceWidth)} 137 ${n(160+faceWidth*cheek)} 160 ${n(160+faceWidth*.85)} 182 Q${n(160+jaw+asymmetry)} 219 ${n(160+chinHalf)} ${n(chinY-11)} Q${n(160+asymmetry)} ${n(chinY)} ${n(160-chinHalf)} ${n(chinY-11)} Q${n(160-jaw)} 219 ${n(160-faceWidth*.85)} 182 C${n(160-faceWidth*cheek)} 160 ${n(160-faceWidth)} 137 ${n(160-faceWidth)} 113Z`;
  }
  face = fineFaceFrontContour(a) || face;
  const eyeOffset = n(26 * a.eyeSpacing);
  const nose = n((a.fineFaceVersion==='fine-face-v1' && a.detailVersion==='natural-appearance-detail-v1' ? 14 : 11) * a.noseWidth);
  // Bust portraits keep a readable head, but use the full-body measurement
  // camera for relative chest/neck size. Older recipes retain their framing.
  const measuredBust = a.detailVersion === 'natural-appearance-detail-v1'
    && Number.isFinite(f.heightInches) && Number.isFinite(f.chestWidthInches) && Number.isFinite(f.neckDiameterInches);
  const bustUnit = 175 / (9.4 + (f.heightInches - 74) * .035);
  const shoulder = n(measuredBust ? f.chestWidthInches * bustUnit / 2 : f.shoulderWidth * 1.32), waist = n(shoulder * f.waistRatio);
  const neck = n(measuredBust ? f.neckDiameterInches * bustUnit / 2 : f.neckWidth * 1.25), top = n(measuredBust ? 240 + 1.5 * bustUnit : 280 - (f.torsoLength - 65) * .35);
  const skinNeckHalf = measuredBust ? neck : neck / 2;
  const skinNeckTop = measuredBust ? Math.min(skinNeckHalf, jaw * .82) : skinNeckHalf;
  const neckShape=`M${n(160-skinNeckTop)} 217 Q${n(160-skinNeckTop)} ${n(top-26)} ${n(160-skinNeckHalf)} ${n(top-16)} Q160 ${n(top+8)} ${n(160+skinNeckHalf)} ${n(top-16)} Q${n(160+skinNeckTop)} ${n(top-26)} ${n(160+skinNeckTop)} 217Z`;
  const neckMarkup=sharedHeadLighting&&measuredBust?`<path class="player-measured-neck" d="${neckShape}" fill="url(#${id}-skin)"/><path d="${neckShape}" fill="url(#${id}-neck-occlusion)"/>`:measuredBust?`<path d="${neckShape}" fill="url(#${id}-skin)"/><path d="M${n(160-skinNeckTop)} 225 Q160 245 ${n(160+skinNeckTop)} 225" fill="none" stroke="${skinShade}" stroke-width="6" opacity=".25"/>`:`<path d="M${160-skinNeckHalf} 217 L${160-skinNeckHalf-5} ${top-16} Q160 ${top+8} ${160+skinNeckHalf+5} ${top-16} L${160+skinNeckHalf} 217Z" fill="url(#${id}-skin)"/>
      <path d="M${160-skinNeckHalf} 225 Q160 252 ${160+skinNeckHalf} 225" fill="none" stroke="${skinShade}" stroke-width="6" opacity=".35"/>`;
  const jersey = ["#173f52", "#294c43", "#454663", "#633a39", "#51422c"][fnv1a(`jersey:${player?.teamId || "FA"}`) % 5];
  const eye = x => {
    if (!enhanced) return `<g class="portrait-eye" style="transform-origin:${x}px 141px"><path d="M${x - 10} 141 Q${x} 133 ${x + 10} 141 Q${x} 148 ${x - 10} 141Z" fill="#dedbd3"/><circle cx="${x}" cy="141" r="4.4" fill="${a.eyeColor}"/><circle cx="${x}" cy="141" r="2.1" fill="#171b20"/><circle cx="${x - 1.2}" cy="139.4" r=".85" fill="#fff"/><path d="M${x - 11} 141 Q${x} 132 ${x + 11} 141" fill="none" stroke="${skinShade}" stroke-width="1.8"/></g>`;
    const side = x < 160 ? -1 : 1, aperture = feature("eyeAperture", 1), y = 141 + side * asymmetry * .3;
    const eyeForm = fineFaceEyeContours(a,x,y,side);
    const eyePath = eyeForm?.shape || `M${n(x - 10)} ${n(y)} Q${n(x)} ${n(y - 8 * aperture)} ${n(x + 10)} ${n(y)} Q${n(x)} ${n(y + 7 * aperture)} ${n(x - 10)} ${n(y)}Z`;
    const eyeId = `${id}-eye-${side}`;
    if(eyeForm)return portraitEyeSurface({a,x,y,side,form:eyeForm,eyeId,iris:irisMarkup(a,x,y,eyeId),skin,skinLight,skinShade,tilt:feature('eyeTilt',0)});
    if (a.detailVersion === 'natural-appearance-detail-v1') {
      return `<g class="portrait-eye" style="transform-origin:${x}px ${n(y)}px"><g transform="rotate(${n(side * feature('eyeTilt', 0))} ${x} ${n(y)})"><defs><clipPath id="${eyeId}"><path d="${eyePath}"/></clipPath><linearGradient id="${eyeId}-sclera" x2="0" y2="1"><stop stop-color="#a6a39d"/><stop offset=".4" stop-color="#e2ddd3"/><stop offset=".85" stop-color="#eee7da"/><stop offset="1" stop-color="#c0b4a5"/></linearGradient></defs><path d="${eyePath}" fill="url(#${eyeId}-sclera)"/><g clip-path="url(#${eyeId})">${irisMarkup(a,x,y,eyeId)}<circle cx="${x}" cy="${n(y)}" r="${eyeForm?'2.1':'1.65'}" fill="#171b20"/><path d="M${n(x-11)} ${n(y)} Q${x} ${n(y-8.5*aperture)} ${n(x+11)} ${n(y)}" fill="none" stroke="#171b20" stroke-width="1.8" opacity=".2"/><circle cx="${n(x-1.2)}" cy="${n(y-1.6)}" r=".7" fill="#fff" opacity=".9"/></g><path d="${eyeForm?.upper || `M${n(x-10.5)} ${n(y)} Q${x} ${n(y-8.5*aperture)} ${n(x+10.5)} ${n(y)}`}" fill="none" stroke="${skinShade}" stroke-width="1.2"/><path d="${eyeForm?.lower || `M${n(x-9)} ${n(y+.6)} Q${x} ${n(y+7*aperture)} ${n(x+9)} ${n(y+.6)}`}" fill="none" stroke="${blend(skin,skinLight,.6)}" stroke-width=".65" opacity=".65"/><path class="portrait-eyelid-crease" d="${eyeForm?.crease || `M${n(x-9)} ${n(y-3)} Q${x} ${n(y-8*aperture-feature('eyelidCrease',.5)*4)} ${n(x+9)} ${n(y-3)}`}" fill="none" stroke="${skinShade}" stroke-width=".8" opacity="${n(.15+feature('eyelidCrease',.5)*.25)}"/>${eyeForm?`<ellipse class="portrait-tear-duct" cx="${eyeForm.ductX}" cy="${eyeForm.ductY}" rx="1.15" ry=".8" fill="${blend(skin,'#b96761',.22)}"/>`:''}</g></g>`;
    }
    return `<g class="portrait-eye" style="transform-origin:${x}px ${n(y)}px"><g transform="rotate(${n(side * feature("eyeTilt", 0))} ${x} ${n(y)})"><defs><clipPath id="${eyeId}"><path d="${eyePath}"/></clipPath></defs><path d="${eyePath}" fill="#dedbd3"/><g clip-path="url(#${eyeId})">${irisMarkup(a, x, y, eyeId)}<circle cx="${x}" cy="${n(y)}" r="2" fill="#171b20"/><circle cx="${n(x - 1.2)}" cy="${n(y - 1.6)}" r=".75" fill="#fff"/></g><path d="M${n(x - 10.5)} ${n(y)} Q${x} ${n(y - 8.5 * aperture)} ${n(x + 10.5)} ${n(y)}" fill="none" stroke="${skinShade}" stroke-width="1.5"/><path class="portrait-eyelid-crease" d="M${n(x - 9)} ${n(y - 3)} Q${x} ${n(y - 8 * aperture - feature("eyelidCrease", .5) * 4)} ${n(x + 9)} ${n(y - 3)}" fill="none" stroke="${skinShade}" stroke-width=".8" opacity="${n(.15 + feature("eyelidCrease", .5) * .25)}"/></g></g>`;
  };
  const facial = {
    clean: "", stubble: `<path d="M112 185 Q120 219 145 230 Q160 237 177 229 Q201 215 207 185" fill="none" stroke-width="9" opacity=".18"/>`,
    mustache: `<path d="M141 194 Q151 186 160 192 Q169 186 179 194 L173 198 Q160 195 147 198Z"/>`,
    goatee: `<path d="M145 212 Q160 218 175 212 L171 230 Q160 237 149 230Z"/><path d="M145 194 Q160 188 175 194" fill="none" stroke-width="4"/>`,
    "short-beard": `<path d="M108 174 Q118 205 143 216 Q160 224 178 216 Q204 199 212 174 Q208 214 177 232 Q160 242 144 232 Q113 214 108 174Z"/>`,
    "full-beard": `<path d="M108 166 Q116 198 141 214 Q160 224 180 212 Q204 196 212 166 Q216 217 181 249 Q160 264 138 248 Q103 217 108 166Z"/>`
  };
  // Only the optional new detail recipe changes grooming rendering. Existing
  // saved face recipes retain their original beard shapes and shading.
  const naturalDetail = a.detailVersion === "natural-appearance-detail-v1";
  if (naturalDetail) {
    const mustache = `<path d="M140 194 Q149 187 160 192 Q171 187 180 194 L176 199 Q166 198 160 196 Q154 198 144 199Z"/>`;
    facial.stubble = `<path d="M110 178 Q119 213 144 229 Q160 237 178 229 Q201 213 210 178" fill="none" stroke-width="7" opacity=".24"/>`
      + Array.from({ length: 100 }, (_, i) => {
        const seed = fnv1a(`${textureSeed}:stubble:${i}`), x = 112 + seed % 96, y = 179 + (seed >>> 8) % 53;
        if (Math.abs(x - 160) < 25 && y < 211) return "";
        return `<path d="M${x} ${y} l${n((seed % 3 - 1) * .35)} 1.8" fill="none" stroke-width=".9" stroke-linecap="round" opacity=".5"/>`;
      }).join("");
    const left=n(160-faceWidth*.88),right=n(160+faceWidth*.88);
    facial['short-beard'] = `<path d="M${left} 173 C${left+6} 184 127 191 138 195 Q139 201 143 213 Q160 224 178 213 Q182 202 183 195 C196 189 ${right-5} 180 ${right} 173 C${right+1} 200 196 222 179 234 Q160 247 141 234 C121 223 ${left-1} 201 ${left} 173Z"/>${mustache}`;
    facial['full-beard'] = `<path d="M${left} 168 C${left+5} 180 126 188 138 194 Q140 202 144 214 Q160 224 177 213 Q181 202 183 194 C197 187 ${right-4} 178 ${right} 168 C${right+4} 195 ${right+2} 222 192 241 Q180 258 161 259 Q142 259 128 242 C${left-2} 225 ${left-4} 194 ${left} 168Z"/>${mustache}`;
    if(surfaceLighting) {
      // Follow cheeks and jaw, leaving a rounded mouth opening rather than a
      // triangular skin cutout. Keep exterior beard length outside the skull.
      const close=`M${left} 173 C${left+6} 185 130 193 142 199 Q143 205 148 209 Q160 214 173 209 Q177 205 178 199 C193 193 ${right-5} 183 ${right} 173`;
      facial['short-beard']=`<path d="${close} C${right+1} 199 196 222 179 234 Q160 244 141 234 C122 224 ${left-1} 202 ${left} 173Z"/>${mustache}`;
      facial['full-beard']=`<path d="${close} C${right+5} 197 ${right+1} 224 189 241 Q177 257 160 258 Q141 257 128 240 C${left-2} 222 ${left-3} 194 ${left} 173Z"/>${mustache}`;
    }
  }
  const beardShape=facial[a.facialHair] || "";
  const texturedBeard=naturalDetail && ['short-beard','full-beard'].includes(a.facialHair);
  const beardStrands=texturedBeard?Array.from({length:surfaceLighting?300:130},(_,i)=>{
    const seed=fnv1a(`${textureSeed}:beard:${i}`),x=107+seed%106,y=178+(seed>>>8)%81;
    return `<path d="M${x} ${y} q${n((x-160)*.025)} 2.4 ${n((x-160)*.035)} ${3+seed%3}"/>`;
  }).join(''):'';
  const beardFringe=naturalDetail&&surfaceLighting&&a.facialHair==='full-beard'?Array.from({length:85},(_,i)=>{
    const seed=fnv1a(`${textureSeed}:beard-edge:${i}`),angle=.13+i*(Math.PI-.26)/84;
    const x=160+50*Math.cos(angle),y=178+79*Math.sin(angle),length=1.2+seed%5*.45;
    return `<path d="M${n(x)} ${n(y-1)} l${n(Math.cos(angle)*length)} ${n(Math.sin(angle)*length)}" opacity="${n(.20+(seed%7)*.06)}"/>`;
  }).join(''):'';
  const facialMarkup = `${texturedBeard?`<defs><linearGradient id="${id}-beard-depth" x2=".5" y2="1"><stop stop-color="${blend(faceHairColor,skin,surfaceLighting ? .55 : .25)}"${surfaceLighting?' stop-opacity=".35"':''}/><stop offset=".35" stop-color="${faceHairColor}"/><stop offset="1" stop-color="${blend(faceHairColor,'#131212',.2)}"/></linearGradient><clipPath id="${id}-beard-clip">${beardShape}</clipPath></defs>`:''}<g class="portrait-facial-hair" fill="${texturedBeard?`url(#${id}-beard-depth)`:faceHairColor}" stroke="${faceHairColor}"${naturalDetail?' stroke-width=".5"':''}>${beardShape}${texturedBeard?`<g class="portrait-beard-strands" clip-path="url(#${id}-beard-clip)" fill="none" stroke="${blend(faceHairColor,skinLight,.32)}" stroke-width=".65" stroke-linecap="round" opacity=".45">${beardStrands}</g>`:''}</g>`;
  const fringeMarkup=beardFringe?`<g class="portrait-beard-edge-fibers" fill="none" stroke="${faceHairColor}" stroke-width=".65" stroke-linecap="round">${beardFringe}</g>`:'';
  const exteriorBeard = naturalDetail && a.facialHair === "full-beard";
  const earHeight = n((a.fineFaceVersion==='fine-face-v1' && naturalDetail ? 22 : 18) * feature("earShape", 1));
  // Surface lighting follows saved landmarks, rather than drawing cheek outlines.
  // The gradients are bounded layers; no new identity or simulation randomness.
  const cheeks = naturalDetail ? `<g class="portrait-cheeks portrait-face-surfaces"><ellipse cx="150" cy="111" rx="${n(faceWidth*.7)}" ry="31" fill="url(#${id}-surface-light)" opacity=".36"/>${[-1,1].map(side=>`<ellipse cx="${n(160+side*eyeOffset)}" cy="${n(143+side*asymmetry*.3)}" rx="18" ry="${n(11*feature('eyeAperture',1))}" fill="url(#${id}-surface-shadow)" opacity=".35"/><ellipse cx="${n(160+side*faceWidth*.57)}" cy="${n(166-(feature('cheekbone',1)-1)*18)}" rx="${n(22*feature('cheekFullness',1))}" ry="19" fill="url(#${id}-surface-light)" opacity="${side<0?'.65':'.3'}"/><ellipse cx="${n(160+side*faceWidth*.64)}" cy="190" rx="${n(19/feature('cheekFullness',1))}" ry="25" fill="url(#${id}-surface-shadow)" opacity=".3"/>`).join('')}<ellipse cx="158" cy="222" rx="${n(jaw*.56)}" ry="12" fill="url(#${id}-surface-light)" opacity=".4"/><ellipse cx="160" cy="214" rx="${n(jaw*.42)}" ry="5" fill="url(#${id}-surface-shadow)" opacity=".3"/></g>` : enhanced ? `<g class="portrait-cheeks"><ellipse cx="128" cy="${n(165 - (feature("cheekbone", 1) - 1) * 18)}" rx="${n(19 * feature("cheekFullness", 1))}" ry="24" fill="${skinLight}" opacity=".16"/><ellipse cx="192" cy="${n(165 - (feature("cheekbone", 1) - 1) * 18)}" rx="${n(17 * feature("cheekFullness", 1))}" ry="23" fill="${skinShade}" opacity=".06"/><path d="M116 ${n(161 - (feature("cheekbone", 1) - 1) * 18)} Q120 178 ${n(135 + (feature("cheekFullness", 1) - 1) * 12)} 182 M204 ${n(161 - (feature("cheekbone", 1) - 1) * 18)} Q200 178 ${n(185 - (feature("cheekFullness", 1) - 1) * 12)} 182" fill="none" stroke="${skinShade}" stroke-width="1.4" opacity=".19"/></g>`
    : `<ellipse cx="128" cy="165" rx="19" ry="30" fill="${skinLight}" opacity=".16"/><path d="M116 161 Q120 178 135 182 M204 161 Q200 178 185 182" fill="none" stroke="${skinShade}" stroke-width="2" opacity=".22"/>`;
  const browY = 128, browControl = n(128 - 7 * feature("browArch", 1)), browAngle = feature("browAngle", 0);
  const browPath = enhanced ? `M${n(147 - eyeOffset)} ${n(browY + browAngle)} Q${n(160 - eyeOffset)} ${browControl} ${n(171 - eyeOffset)} ${n(127 - browAngle)} M${n(149 + eyeOffset)} ${n(127 + browAngle)} Q${n(160 + eyeOffset)} ${browControl} ${n(173 + eyeOffset)} ${n(browY - browAngle)}`
    : `M${147 - eyeOffset} 128 Q${160 - eyeOffset} 121 ${171 - eyeOffset} 127 M${149 + eyeOffset} 127 Q${160 + eyeOffset} 121 ${173 + eyeOffset} 128`;
  const browFibers = naturalDetail ? [-1,1].map(side=>Array.from({length:32},(_,i)=>{
    const seed=fnv1a(`${textureSeed}:brow:${side}:${i}`),t=(i+.5)/32;
    const x0=side<0?147-eyeOffset:149+eyeOffset,x1=side<0?171-eyeOffset:173+eyeOffset;
    const y0=side<0?browY+browAngle:127+browAngle,y1=side<0?127-browAngle:browY-browAngle;
    const x=x0*(1-t)*(1-t)+2*(160+side*eyeOffset)*t*(1-t)+x1*t*t;
    const y=y0*(1-t)*(1-t)+2*browControl*t*(1-t)+y1*t*t;
    const length=(1.2+(seed%7)*.13)*a.browWeight;
    return `<path d="M${n(x)} ${n(y+length*.45)} q${n(side*.55)} ${n(-length*.65)} ${n(side*.9)} ${n(-length)}"/>`;
  }).join('')).join('') : '';
  const browMarkup=naturalDetail?`<g class="portrait-brows" fill="none" stroke="${browColor}" stroke-linecap="round"><path d="${browPath}" stroke-width="${n(2.1*a.browWeight)}" opacity=".55"/><g stroke-width=".65" opacity=".8">${browFibers}</g></g>`:`<path class="portrait-brows" d="${browPath}" fill="none" stroke="${browColor}" stroke-width="${n(3*a.browWeight)}" stroke-linecap="round"/>`;
  const earMarkup=naturalDetail?[-1,1].map(side=>{
    const x=160+side*(faceWidth+2),rx=9*a.earSize;
    return `<g class="portrait-ear"><ellipse cx="${n(x)}" cy="151" rx="${n(rx)}" ry="${earHeight}" fill="${skin}"/><ellipse cx="${n(x)}" cy="151" rx="${n(rx*.65)}" ry="${n(earHeight*.72)}" fill="url(#${id}-surface-shadow)" opacity=".65"/><path d="M${n(x+side*rx*.3)} ${n(151-earHeight*.5)} Q${n(x-side*rx*.6)} 149 ${n(x+side*rx*.05)} ${n(151+earHeight*.4)}" fill="none" stroke="${skinLight}" stroke-width="1.2" opacity=".45"/></g>`;
  }).join(''):`<ellipse cx="${160-faceWidth-2}" cy="151" rx="${n(9*a.earSize)}" ry="${earHeight}" fill="${skin}"/><ellipse cx="${160+faceWidth+2}" cy="151" rx="${n(9*a.earSize)}" ry="${earHeight}" fill="${skinShade}"/>`;
  const noseY = 180 + (feature("noseLength", 1) - 1) * 30;
  const noseMarkup = naturalDetail ? `<g class="portrait-nose"><path d="M${n(160-3*feature('noseBridge',1))} 146 Q${n(157-nose*.2)} ${n(noseY-12)} ${n(160-nose*.7)} ${n(noseY)} Q160 ${n(noseY+8)} ${n(160+nose*.75)} ${n(noseY)} Q${n(165+nose*.2)} ${n(noseY-12)} ${n(160+3*feature('noseBridge',1))} 146Z" fill="url(#${id}-nose-shade)"/><ellipse cx="${n(160+asymmetry*.3)}" cy="${n(noseY-1)}" rx="${n(nose*.6*feature('noseTip',1))}" ry="${n(3.5*feature('noseTip',1))}" fill="${skinLight}" opacity=".32"/><path d="M${n(160-nose*.86)} ${n(noseY+3)} Q${n(160-nose*.65)} ${n(noseY+1)} ${n(160-nose*.35)} ${n(noseY+3)} M${n(160+nose*.35)} ${n(noseY+3)} Q${n(160+nose*.65)} ${n(noseY+1)} ${n(160+nose*.86)} ${n(noseY+3)}" fill="none" stroke="${skinShade}" stroke-width="1.25" stroke-linecap="round" opacity=".65"/></g>` : enhanced ? `<g class="portrait-nose"><path d="M${n(160 - 2 * feature("noseBridge", 1))} 147 L${n(160 - nose / 2 + asymmetry * .3)} ${n(noseY - 3)} Q${n(160 - nose)} ${n(noseY + 4)} 155 ${n(noseY + 6)} M${n(160 + 4 * feature("noseBridge", 1))} 147 L${n(160 + nose / 2 + asymmetry * .3)} ${n(noseY - 3)} Q${n(160 + nose)} ${n(noseY + 4)} 166 ${n(noseY + 6)}" fill="none" stroke="${skinShade}" stroke-opacity=".35" stroke-width="1.4"/><ellipse cx="${n(160 + asymmetry * .3)}" cy="${n(noseY)}" rx="${n(nose * .65 * feature("noseTip", 1))}" ry="${n(4 * feature("noseTip", 1))}" fill="${skinLight}" opacity=".27"/><path d="M${n(160 - nose)} ${n(noseY + 5)} q5 -3 9 0 M${n(160 + nose)} ${n(noseY + 5)} q-5 -3 -9 0" fill="none" stroke="${skinShade}" stroke-width="1.5"/></g>`
    : `<path d="M158 147 L${160 - nose / 2} 177 Q${160 - nose} 184 155 186 M164 147 L${160 + nose / 2} 177 Q${160 + nose} 184 166 186" fill="none" stroke="${skinShade}" stroke-opacity=".45" stroke-width="1.5"/>
        <ellipse cx="160" cy="180" rx="${n(nose * .65)}" ry="4" fill="${skinLight}" opacity=".25"/>
        <path d="M${160 - nose} 185 q5 -3 9 0 M${160 + nose} 185 q-5 -3 -9 0" fill="none" stroke="${skinShade}" stroke-width="1.8"/>`;
  const lipHalf = 20 * feature("lipWidth", 1), curve = feature("lipCurve", 0);
  const lipMarkup = enhanced ? `<g class="portrait-lips"><path d="M${n(160 - lipHalf)} 204 Q151 ${n(201 - a.lipFullness - curve)} 160 ${n(202 + curve)} Q169 ${n(201 - a.lipFullness - curve)} ${n(160 + lipHalf)} 204 Q160 ${n(204 + a.lipFullness * 5)} ${n(160 - lipHalf)} 204" fill="${lip}" opacity=".75"/><path d="M${n(160 - lipHalf)} 204 Q160 ${n((a.expression === "warm" ? 208 : 204) + curve)} ${n(160 + lipHalf)} 204" fill="none" stroke="${skinShade}" stroke-width="1.1"/></g>`
    : `<path d="M140 204 Q151 ${n(201 - a.lipFullness)} 160 202 Q169 ${n(201 - a.lipFullness)} 180 204 Q160 ${n(204 + a.lipFullness * 5)} 140 204" fill="${lip}" opacity=".75"/>
        <path d="M140 204 Q160 ${a.expression === "warm" ? 208 : 204} 180 204" fill="none" stroke="${skinShade}" stroke-width="1.3"/>`;
  const fineDetails = fineFaceFrontDetails(a, { nose, noseY, lipHalf, curve, skinLight, skinShade, lip, id });
  return `<svg class="player-portrait-svg" viewBox="${headOnly ? "50 0 220 270" : "0 0 320 440"}" role="img" aria-label="${escape(player?.name || "Player")} portrait" data-hairstyle="${escape(a.hairstyle)}" data-hair-texture="${escape(a.hairTexture)}" style="--portrait-blink-delay:-${n(a.blinkDelay)}s">
    <defs>
      <radialGradient id="${id}-bg" cx="40%" cy="25%" r="85%"><stop stop-color="#496370"/><stop offset="1" stop-color="#101e2a"/></radialGradient>
      <linearGradient id="${id}-skin" x1="0" x2="1" y2="${sharedHeadLighting?'0':'.3'}">${sharedHeadLighting?bodySkinStops(skin,{}):`<stop stop-color="${skinShade}"/><stop offset=".32" stop-color="${skinLight}"/><stop offset=".7" stop-color="${skin}"/><stop offset="1" stop-color="${skinShade}"/>`}</linearGradient>${sharedHeadLighting?`<linearGradient id="${id}-neck-occlusion" gradientUnits="userSpaceOnUse" x1="160" y1="225" x2="160" y2="${n(top-16)}"><stop stop-color="#15131a" stop-opacity=".23"/><stop offset="1" stop-color="#15131a" stop-opacity="0"/></linearGradient>`:''}${naturalDetail ? `
      <radialGradient id="${id}-surface-light"><stop stop-color="${skinLight}"/><stop offset="1" stop-color="${skinLight}" stop-opacity="0"/></radialGradient><radialGradient id="${id}-surface-shadow"><stop stop-color="${skinShade}"/><stop offset="1" stop-color="${skinShade}" stop-opacity="0"/></radialGradient>
      <linearGradient id="${id}-nose-shade"><stop stop-color="${skinShade}" stop-opacity=".45"/><stop offset=".46" stop-color="${skinLight}" stop-opacity=".25"/><stop offset="1" stop-color="${skinShade}" stop-opacity=".32"/></linearGradient>` : ''}
      <linearGradient id="${id}-jersey" x2=".8" y2="1"><stop stop-color="${blend(jersey, "#fff", .13)}"/><stop offset=".55" stop-color="${jersey}"/><stop offset="1" stop-color="${blend(jersey, "#000", .35)}"/></linearGradient>
      <linearGradient id="${id}-hair-light"><stop stop-color="${blend(a.hairColor, "#ddd", a.fineFaceVersion==='fine-face-v1'&&surfaceLighting ? .42 : .27)}"/><stop offset="1" stop-color="${a.fineFaceVersion==='fine-face-v1'&&surfaceLighting ? blend(a.hairColor,'#ddd',.18) : a.hairColor}"/></linearGradient>
      ${enhanced ? `<radialGradient id="${id}-hair-depth" cx="35%" cy="25%" r="85%"><stop stop-color="${blend(a.hairColor, "#fff", .09)}"/><stop offset=".6" stop-color="${a.hairColor}"/><stop offset="1" stop-color="${blend(a.hairColor, "#10100f", .24)}"/></radialGradient>` : ""}${naturalDetail ? `<linearGradient id="${id}-fade-depth" x2="0" y2="1"><stop stop-color="${a.hairColor}"/><stop offset=".42" stop-color="${a.hairColor}"/><stop offset=".78" stop-color="${a.hairColor}" stop-opacity=".5"/><stop offset="1" stop-color="${a.hairColor}" stop-opacity=".08"/></linearGradient>` : ""}
      ${surfaceLighting?.defs || ''}${fineDetails && !naturalDetail ? `<linearGradient id="${id}-nose-shade"><stop stop-color="${skinShade}" stop-opacity=".45"/><stop offset=".46" stop-color="${skinLight}" stop-opacity=".25"/><stop offset="1" stop-color="${skinShade}" stop-opacity=".32"/></linearGradient>` : ''}<clipPath id="${id}-face"><path d="${face}"/></clipPath>
    </defs>
    ${headOnly ? "" : `<rect width="320" height="440" rx="18" fill="url(#${id}-bg)"/><path d="M0 370 L320 160 M0 408 L320 198" stroke="#fff" stroke-opacity=".04" stroke-width="32"/>`}
    <g class="${headOnly ? "physique-face" : "portrait-athlete"}">
      ${headOnly ? "" : `<path d="M${160 - shoulder} ${top + 25} Q${160 - shoulder * .65} ${top - 1} ${160 - neck} ${top - 18} L${160 + neck} ${top - 18} Q${160 + shoulder * .65} ${top - 1} ${160 + shoulder} ${top + 25} L${160 + waist} 440 L${160 - waist} 440Z" fill="url(#${id}-jersey)"/>
      ${neckMarkup}
      <path d="M${160 - neck - 4} ${top - 17} Q160 ${top + 38} ${160 + neck + 4} ${top - 17}" fill="none" stroke="#dce6e7" stroke-width="7" opacity=".8"/>
      <path d="M${160 - shoulder + 15} ${top + 34} l22 8 M${160 + shoulder - 15} ${top + 34} l-22 8" stroke="#dce6e7" stroke-width="9" opacity=".65"/>
      <path d="M${160 - shoulder * .65} ${top + 51} Q160 ${top + 81} ${160 + shoulder * .65} ${top + 51} M160 ${top + 55} v48" fill="none" stroke="#06121c" stroke-opacity="${n(.12 + f.muscleDefinition * .14)}" stroke-width="3"/>
      <text x="160" y="${top + 115}" text-anchor="middle" font-family="system-ui,sans-serif" font-size="54" font-weight="800" fill="#dce6e7" opacity=".85">${escape(player?.jerseyNumber ?? "")}</text>`}
      <g transform="translate(0 ${n((a.faceLength - 1) * -60)}) scale(1 ${n(a.faceLength)})">
        ${earMarkup}
        <path d="${face}" fill="${surfaceLighting?.fill || `url(#${id}-skin)`}"/>
        ${surfaceLighting ? `<g clip-path="url(#${id}-face)">${surfaceLighting.surfaces}</g>` : ''}${exteriorBeard ? facialMarkup : ""}
        <g clip-path="url(#${id}-face)">${surfaceLighting ? '' : cheeks}
        ${a.freckles ? Array.from({ length: 13 }, (_, i) => `<circle cx="${121 + i * 6}" cy="${160 + (i % 3) * 3}" r=".85" fill="${skinShade}" opacity=".35"/>`).join("") : ""}
        ${a.mole ? `<circle cx="${n(a.mole.x)}" cy="${n(a.mole.y)}" r="1.3" fill="${skinShade}" opacity=".8"/>` : ""}
        ${naturalDetail && !exteriorBeard ? facialMarkup : ""}
        ${eye(160 - eyeOffset)}${eye(160 + eyeOffset)}
        ${fineDetails?.planes || ''}${browMarkup}
        ${fineDetails?.nose || noseMarkup}
        ${fineDetails?.lips || lipMarkup}
        <path d="M149 218 Q160 221 171 218" fill="none" stroke="${skinShade}" opacity=".18"/>
        ${age >= 30 ? `<path d="M120 150 l-7 2 M200 150 l7 2 M140 107 Q160 103 180 107" stroke="${skinShade}" opacity="${n((age - 28) / 120)}" fill="none"/>` : ""}
        ${naturalDetail ? "" : facialMarkup}</g>${fringeMarkup}
        ${hairMarkup(a, id, textureSeed)}
      </g>
    </g>
  </svg>`;
}
