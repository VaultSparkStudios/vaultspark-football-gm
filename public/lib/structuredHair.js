import {blendAppearanceColor as blend} from './appearancePalette.js';
import {grayHairFiberAttributes} from './hairGrayFibers.js';

const bounded=(v,f,lo,hi)=>Number.isFinite(v)?Math.max(lo,Math.min(hi,v)):f;
const n=v=>Math.round(v*100)/100;
const hash=s=>{let h=2166136261;for(const c of String(s))h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;};
const point=(p,t)=>{
 const u=1-t;
 return [u*u*u*p[0][0]+3*u*u*t*p[1][0]+3*u*t*t*p[2][0]+t*t*t*p[3][0],u*u*u*p[0][1]+3*u*u*t*p[1][1]+3*u*t*t*p[2][1]+t*t*t*p[3][1]];
};

// Fitted illustration of arranged bundles, not a measured or demographic model.
// Loose curl controls are concealed by the arrangement. Saved cosmetic seed,
// length, pigment and strand thickness retain authority without gameplay RNG.
export function structuredHairBundles(a,seed,{projection='front',back=-34}={}) {
 const braid=a.hairstyle==='braids',count=projection==='front'?(braid?9:13):(braid?6:8);
 const length=bounded(a.hairLength,1,.8,1.2),breadth=59*bounded(a.faceWidth,1,.7,1.3);
 return Array.from({length:count},(_,i)=>{
  const t=i/(count-1),h=hash(`${seed}:arranged:${i}`),j=(h%101)/100-.5;
  let p;
  if(projection==='front'){
   const x=160+(2*t-1)*breadth*.83,rootY=53+Math.abs(2*t-1)*17;
   const outer=i<2||i>count-3;
   const endX=outer?160+(t<.5?-1:1)*(breadth+1+(i%2)*5):x+j*5;
   const endY=outer?126+(length-.8)*95+(h%19):braid?80+Math.abs(2*t-1)*5:101+(h%15)+(length-1)*12;
   p=[[x,rootY],[x-4+j*6,72],[endX+j*4,outer?110:braid?73:88],[endX,endY]];
  }else{
   const sx=back+5+(25-back-10)*t,sy=-2+Math.abs(2*t-1)*16;
   const endX=back+4+i*3,endY=braid?(i<2?65+(length-.8)*80:26+i*2*length):48+(i%4)*11*length;
   p=[[sx,sy],[sx-7,8],[endX-5,braid?23:38],[endX,endY]];
  }
  return {points:p,width:(projection==='front'?(braid?5.4:6.8):(braid?2.8:4.1))*(.88+(h%17)/70)*bounded(a.hairStrandWidth,1,.65,1.5),fiber:`arranged:${i}`};
 });
}

export function structuredHairMarkup(a,seed,{projection='front',back=-34,age=26}={}) {
 const braid=a.hairstyle==='braids',color=/^#[0-9a-f]{6}$/i.test(a.hairColor||'')?a.hairColor:'#29201b';
 const dark=blend(color,'#100e0d',.35),light=blend(color,'#e8d5ae',.24);
 const bundles=structuredHairBundles(a,seed,{projection,back}).map(({points:p,width:w,fiber})=>{
  const d=`M${p[0].map(n).join(' ')} C${p.slice(1).flat().map(n).join(' ')}`;
  const marks=[];
  const count=projection==='front'?24:15;
  for(let k=1;k<count;k++){
   const t=k/count,c=point(p,t),q=point(p,Math.min(1,t+.01));
   const dx=q[0]-c[0],dy=q[1]-c[1],norm=Math.hypot(dx,dy)||1,nx=-dy/norm,ny=dx/norm;
   const side=k%2?-1:1,r=w*(braid?.42:.24),advance=braid?2.2:.7;
   const start=[c[0]+nx*r*side,c[1]+ny*r*side],end=[c[0]-nx*r*side+dx/norm*advance,c[1]-ny*r*side+dy/norm*advance];
   marks.push(`<path d="M${start.map(n).join(' ')} Q${n(c[0]+nx*r*.2*side)} ${n(c[1]+ny*r*.2*side)} ${end.map(n).join(' ')}" stroke="${k%3?light:dark}" stroke-width="${n(braid?w*.17:w*.09)}" opacity="${braid?'.75':'.5'}"/>`);
  }
  const gray=grayHairFiberAttributes(a,age,seed,fiber);
  return `<g class="arranged-hair-bundle"><path d="${d}" stroke="${dark}" stroke-width="${n(w+1)}"/><path d="${d}" stroke="${color}" stroke-width="${n(w)}"/><path d="${d}" stroke="${light}" stroke-width="${n(w*.17)}" opacity=".35"/>${marks.join('')}${gray?`<path${gray} d="${d}" stroke-width="${n(w*.12)}" opacity=".8"/>`:''}</g>`;
 }).join('');
 return `<g class="structured-hair-bundles" data-arranged-flow="bundles-v1" data-projection="${projection}" fill="none" stroke-linecap="round" stroke-linejoin="round">${bundles}</g>`;
}
