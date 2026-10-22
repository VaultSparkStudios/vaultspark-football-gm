import {blendAppearanceColor as blend} from './appearancePalette.js';
import {fineFaceGeometry,fineFaceFrontLandmarks} from './fineFaceGeometry.js';

const n=value=>Math.round(value*100)/100;
const bounded=(a,key,fallback,low,high)=>Number.isFinite(a[key])?Math.max(low,Math.min(high,a[key])):fallback;

// A single upper-left key explains the front/profile planes. Surface estimates
// follow saved landmarks; they do not measure tissue, normals or ancestry.
function directionalFacePlanes(a,{id,skin,view},fine) {
  const light=blend(skin,'#ffe8cf',.18),shade=blend(skin,'#21191d',.48);
  const reflected=blend(skin,'#627985',.13);
  const defs=`<linearGradient id="${id}-skin-form" x1="0" y1=".1" x2="1" y2=".45"><stop stop-color="${blend(skin,shade,.16)}"/><stop offset=".26" stop-color="${light}"/><stop offset=".55" stop-color="${skin}"/><stop offset=".84" stop-color="${blend(skin,shade,.32)}"/><stop offset="1" stop-color="${reflected}"/></linearGradient><radialGradient id="${id}-plane-key" cx=".4" cy=".35" r=".65"><stop stop-color="${light}" stop-opacity=".5"/><stop offset=".5" stop-color="${light}" stop-opacity=".19"/><stop offset="1" stop-color="${light}" stop-opacity="0"/></radialGradient><linearGradient id="${id}-plane-side"><stop stop-color="${shade}" stop-opacity="0"/><stop offset=".35" stop-color="${shade}" stop-opacity=".12"/><stop offset=".8" stop-color="${shade}" stop-opacity=".35"/><stop offset="1" stop-color="${reflected}" stop-opacity=".15"/></linearGradient><radialGradient id="${id}-plane-cheek" cx=".6" cy=".35" r=".65"><stop stop-color="${shade}" stop-opacity=".3"/><stop offset=".5" stop-color="${shade}" stop-opacity=".12"/><stop offset="1" stop-color="${shade}" stop-opacity="0"/></radialGradient><radialGradient id="${id}-plane-contact" cx=".5" cy=".3" r=".7"><stop stop-color="${shade}" stop-opacity=".42"/><stop offset=".5" stop-color="${shade}" stop-opacity=".19"/><stop offset="1" stop-color="${shade}" stop-opacity="0"/></radialGradient><linearGradient id="${id}-plane-jaw" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${shade}" stop-opacity="0"/><stop offset=".55" stop-color="${shade}" stop-opacity=".28"/><stop offset="1" stop-color="${shade}" stop-opacity=".08"/></linearGradient>`;
  if(view==='side') {
    const cheek=bounded(a,'cheekFullness',1,.75,1.25),bone=bounded(a,'cheekbone',1,.75,1.25),cy=59-(bone-1)*9;
    return {defs,fill:`url(#${id}-skin-form)`,surfaces:`<g class="side-face-form-lighting" data-surface-model="directional-plane-v1"><path d="M-31 12 C-25 3 -7 0 8 8 Q20 19 20 32 Q1 27 -22 36Z" fill="url(#${id}-plane-key)"/><path d="M-10 44 Q3 37 17 46 Q24 ${n(cy-3)} 20 ${n(cy+4)} Q${n(-3*cheek)} ${n(cy+8)} -16 ${n(cy+3)}Z" fill="url(#${id}-plane-key)"/><path d="M-14 ${n(cy+1)} Q5 ${n(cy+3)} 20 ${n(cy+6)} Q16 80 4 87 Q-9 84 -18 70Z" fill="url(#${id}-plane-cheek)"/><path d="M-31 42 Q-17 44 -9 59 Q-3 69 -1 83 Q4 94 17 97 L-10 104 Q-36 83 -31 42Z" fill="url(#${id}-plane-side)"/><path d="M10 35 Q20 31 28 39 L26 49 Q13 49 10 43Z" fill="url(#${id}-plane-contact)" opacity="${n(.55+fine.browRidge*.35)}"/><path d="M-18 84 Q-1 90 17 87 L28 91 Q9 105 -11 100Z" fill="url(#${id}-plane-jaw)"/><path d="M10 82 Q17 79 26 83 Q27 90 19 94 Q9 94 8 87Z" fill="url(#${id}-plane-key)"/></g>`};
  }
  const {width:w,jaw,cheekY,chin}=fineFaceFrontLandmarks(a);
  const fullness=bounded(a,'cheekFullness',1,.75,1.25),eyes=26*bounded(a,'eyeSpacing',1,.88,1.1);
  const cheeks=[-1,1].map(side=>{
    const cx=160+side*w*.54,spread=19*fullness;
    return `<path d="M${n(cx-side*spread*.65)} ${n(cheekY-10)} Q${n(cx+side*spread*.35)} ${n(cheekY-18)} ${n(cx+side*spread)} ${n(cheekY-7)} L${n(cx+side*spread*.9)} ${n(cheekY+5)} Q${n(cx)} ${n(cheekY+8)} ${n(cx-side*spread*.6)} ${n(cheekY+3)}Z" fill="url(#${id}-plane-key)" opacity="${side<0?'.85':'.32'}"/><path d="M${n(cx-side*spread*.55)} ${n(cheekY+4)} Q${n(cx+side*spread*.3)} ${n(cheekY+8)} ${n(cx+side*spread*.95)} ${n(cheekY+4)} Q${n(160+side*jaw*.93)} 201 ${n(160+side*jaw*.65)} 213 Q${n(cx-side*spread*.55)} 207 ${n(cx-side*spread*.55)} ${n(cheekY+4)}Z" fill="url(#${id}-plane-cheek)" opacity="${side<0?'.6':'.9'}"/>`;
  }).join('');
  return {defs,fill:`url(#${id}-skin-form)`,surfaces:`<g class="portrait-face-form-lighting" data-surface-model="directional-plane-v1"><path d="M${n(160-w*.7)} 82 Q145 67 167 77 Q184 91 178 113 Q155 121 ${n(160-w*.8)} 111Z" fill="url(#${id}-plane-key)"/><path d="M171 45 Q${n(160+w)} 87 ${n(160+w+4)} 129 L${n(160+w+5)} 181 Q${n(160+jaw+5)} 222 ${n(160+chin*.65)} 241 Q176 220 178 201 Q185 183 176 165 Q183 144 177 127 Q185 105 171 45Z" fill="url(#${id}-plane-side)"/>${[-1,1].map(side=>{const x=160+side*eyes;return `<path d="M${n(x-16)} 130 Q${n(x)} ${n(121-fine.browRidge*3)} ${n(x+16)} 131 L${n(x+14)} 143 Q${n(x)} 147 ${n(x-15)} 141Z" fill="url(#${id}-plane-contact)" opacity="${n(.6+fine.browRidge*.3)}"/><path d="M${n(x-13)} 148 Q${n(x)} 152 ${n(x+13)} 148 Q${n(x+8)} 158 ${n(x-9)} 156Z" fill="url(#${id}-plane-key)" opacity=".45"/>`;}).join('')}${cheeks}<path d="M${n(160-jaw*.95)} 208 Q160 238 ${n(160+jaw*.95)} 208 L${n(160+jaw)} 227 Q160 254 ${n(160-jaw)} 227Z" fill="url(#${id}-plane-jaw)"/><path d="M${n(160-chin*.75)} 218 Q160 214 ${n(160+chin*.75)} 218 Q${n(160+chin*.65)} 231 158 234 Q${n(160-chin*.9)} 231 ${n(160-chin*.75)} 218Z" fill="url(#${id}-plane-key)"/><ellipse cx="162" cy="213" rx="${n(chin*.8)}" ry="4" fill="url(#${id}-plane-contact)" opacity=".4"/></g>`};
}

// Shared studio lighting for the saved individual head, never a new face seed.
// Key, fill and reflected light model surface form; base pigmentation remains
// authoritative. These are artistic projections, not measured 3D normals.
export function portraitSurfaceLighting(a,{id,skin,view='front'}={}) {
  const fine=fineFaceGeometry(a);
  if(!fine)return null;
  const material=a.detailVersion==='natural-appearance-detail-v1';
  if(material)return directionalFacePlanes(a,{id,skin,view},fine);
  const shadow=blend(skin,'#21191d',material?.56:.46),cool=blend(skin,'#364750',.20);
  const light=blend(skin,'#ffe8cf',material?.14:.23),warm=blend(skin,'#bc7260',material?.10:.07);
  const defs=`<radialGradient id="${id}-skin-form" cx="${view==='side'?'.76':'.35'}" cy=".28" r=".85"><stop stop-color="${light}"/><stop offset=".40" stop-color="${skin}"/><stop offset=".72" stop-color="${warm}"/><stop offset=".94" stop-color="${cool}"/><stop offset="1" stop-color="${shadow}"/></radialGradient><radialGradient id="${id}-form-light"><stop stop-color="${light}" stop-opacity=".50"/><stop offset=".55" stop-color="${light}" stop-opacity=".14"/><stop offset="1" stop-color="${light}" stop-opacity="0"/></radialGradient><radialGradient id="${id}-form-shadow"><stop stop-color="${shadow}" stop-opacity=".40"/><stop offset=".55" stop-color="${shadow}" stop-opacity=".12"/><stop offset="1" stop-color="${shadow}" stop-opacity="0"/></radialGradient><linearGradient id="${id}-malar" x1="0" y1="0" x2=".8" y2="1"><stop stop-color="${light}" stop-opacity=".32"/><stop offset=".38" stop-color="${light}" stop-opacity=".06"/><stop offset=".65" stop-color="${shadow}" stop-opacity=".08"/><stop offset="1" stop-color="${shadow}" stop-opacity="0"/></linearGradient><radialGradient id="${id}-orbit" cx=".6" cy=".2" r=".75"><stop stop-color="${shadow}" stop-opacity=".6"/><stop offset=".5" stop-color="${shadow}" stop-opacity=".2"/><stop offset="1" stop-color="${shadow}" stop-opacity="0"/></radialGradient>`;
  if(view==='side') {
    const cheek=bounded(a,'cheekFullness',1,.75,1.25);
    return {defs,fill:`url(#${id}-skin-form)`,surfaces:`<g class="side-face-form-lighting" data-surface-model="landmark-relief-v3"><path d="M-9 48 C3 42 18 49 21 57 C25 69 9 78 -3 75 C${n(-14*cheek)} 69 -19 56 -9 48Z" fill="url(#${id}-malar)"/><path d="M-19 61 C-3 66 9 70 12 84 Q5 94 -7 96 Q-25 90 -19 61Z" fill="url(#${id}-form-shadow)"/><path d="M10 34 Q20 29 29 39 L26 52 Q15 54 8 47Z" fill="url(#${id}-orbit)" opacity="${n(.6+fine.browRidge*.4)}"/><ellipse cx="15" cy="89" rx="13" ry="9" fill="url(#${id}-form-light)"/><path d="M12 64 Q27 65 30 75 Q26 90 10 87 Q5 75 12 64Z" fill="url(#${id}-malar)"/><ellipse cx="13" cy="22" rx="18" ry="19" fill="url(#${id}-form-light)"/></g>`};
  }
  const landmarks=fineFaceFrontLandmarks(a);
  const width=landmarks?.width ?? 59*bounded(a,'faceWidth',1,.88,1.10),jaw=landmarks?.jaw ?? 43*bounded(a,'jawWidth',1,.8,1.16);
  const cheekY=165-(bounded(a,'cheekbone',1,.75,1.25)-1)*18;
  const cheekWidth=23*bounded(a,'cheekFullness',1,.75,1.25);
  const eyes=26*bounded(a,'eyeSpacing',1,.88,1.1);
  // Individual orbital, malar and jaw planes under a consistent key light.
  // These are artistic surface estimates, never ancestry or measured normals.
  const socketDepth=.55+fine.browRidge*.32;
  const malar=[-1,1].map(side=>{
    const x=160+side*width*.48;
    return `<path d="M${n(x-side*cheekWidth*.6)} ${n(cheekY-15)} C${n(x+side*cheekWidth*.4)} ${n(cheekY-22)} ${n(x+side*cheekWidth)} ${n(cheekY-9)} ${n(x+side*cheekWidth)} ${n(cheekY+8)} C${n(x+side*cheekWidth*.7)} ${n(cheekY+28)} ${n(x-side*cheekWidth*.6)} ${n(cheekY+35)} ${n(x-side*cheekWidth*.8)} ${n(cheekY+10)} Q${n(x-side*cheekWidth)} ${n(cheekY-2)} ${n(x-side*cheekWidth*.6)} ${n(cheekY-15)}Z" fill="url(#${id}-malar)" opacity="${side<0?'.9':'.65'}"/><path d="M${n(x+side*14)} ${n(cheekY+5)} Q${n(x+side*24)} ${n(cheekY+26)} ${n(160+side*jaw*.8)} 213 Q${n(x-side*12)} 210 ${n(x-side*10)} ${n(cheekY+25)}Z" fill="url(#${id}-form-shadow)" opacity="${side<0?'.35':'.7'}"/>`;
  }).join('');
  return {defs,fill:`url(#${id}-skin-form)`,surfaces:`<g class="portrait-face-form-lighting" data-surface-model="landmark-relief-v3"><ellipse cx="${n(160-width*.27)}" cy="102" rx="${n(width*.67)}" ry="33" fill="url(#${id}-form-light)"/><ellipse cx="${n(160+width*.82)}" cy="159" rx="${n(width*.42)}" ry="62" fill="url(#${id}-form-shadow)"/>${[-1,1].map(side=>{const x=160+side*eyes;return `<path d="M${n(x-20)} 136 Q${n(x-13)} ${n(119-fine.browRidge*3)} ${n(x+5)} 126 Q${n(x+22)} 127 ${n(x+22)} 142 Q${n(x+13)} 157 ${n(x-6)} 153 Q${n(x-20)} 150 ${n(x-20)} 136Z" fill="url(#${id}-orbit)" opacity="${n(socketDepth*(side<0?.8:1))}"/><path d="M${n(x-16)} 149 Q${n(x)} 156 ${n(x+17)} 148 Q${n(x+13)} 160 ${n(x-12)} 158Z" fill="url(#${id}-form-light)"/>`;}).join('')}${malar}<path d="M142 181 Q160 187 178 181 C194 197 187 213 175 218 Q160 223 145 217 C132 209 128 194 142 181Z" fill="url(#${id}-malar)" opacity=".6"/><ellipse cx="160" cy="237" rx="${n(jaw*.82)}" ry="11" fill="url(#${id}-form-shadow)" opacity=".35"/><ellipse cx="157" cy="225" rx="${n(jaw*.53)}" ry="12" fill="url(#${id}-form-light)"/><ellipse cx="161" cy="214" rx="${n(jaw*.37)}" ry="4" fill="url(#${id}-form-shadow)" opacity=".55"/></g>`};
}
