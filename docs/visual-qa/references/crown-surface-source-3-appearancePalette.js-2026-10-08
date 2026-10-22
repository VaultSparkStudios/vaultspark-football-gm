// Shared artistic lighting/pigment palette. No population sampling occurs here.
import {characterSkinStops} from './playerSurfaceLighting.js';
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
export function blendAppearanceColor(a,b,t) {
  const expand=v=>v.length===4?`#${[...v.slice(1)].map(c=>c+c).join('')}`:v;
  a=expand(a);b=expand(b);
  const parts=[1,3,5].map(offset=>Math.round(parseInt(a.slice(offset,offset+2),16)*(1-t)+parseInt(b.slice(offset,offset+2),16)*t));
  return `#${parts.map(v=>v.toString(16).padStart(2,'0')).join('')}`;
}
// Diffuse body materials share an albedo without assigning any new identity
// traits. Keep the broad highlight small so darker skin does not look metallic.
export function bodySkinStops(skin,lighting=null) {
  if(lighting)return characterSkinStops(skin,lighting);
  const shade=blendAppearanceColor(skin,'#241a19',.20);
  const highlight=blendAppearanceColor(skin,'#ffe9d4',.045);
  return `<stop stop-color="${shade}"/><stop offset=".28" stop-color="${skin}"/><stop offset=".56" stop-color="${highlight}"/><stop offset=".80" stop-color="${skin}"/><stop offset="1" stop-color="${shade}"/>`;
}
export function bodyClothStops(color) {
  const shade=blendAppearanceColor(color,'#172832',.12);
  const highlight=blendAppearanceColor(color,'#e0e5df',.035);
  return `<stop stop-color="${shade}"/><stop offset=".28" stop-color="${color}"/><stop offset=".56" stop-color="${highlight}"/><stop offset=".80" stop-color="${color}"/><stop offset="1" stop-color="${shade}"/>`;
}
export function appearanceSkinColor(a) {
  const base=blendAppearanceColor('#f0ceb4','#593629',a.complexion);
  if(a.version!=='portrait-identity-v3')return base;
  const undertone=clamp(Number(a.skinUndertone)||0,-1,1);
  return blendAppearanceColor(base,undertone<0?'#967894':'#bc704b',Math.abs(undertone)*.12);
}
export function appearanceHairColors(a,age) {
  const grayShare=clamp(((Number(age)||25)-(a.grayOnsetAge||38))/24,0,.65);
  const fiberGray=a.version==='portrait-identity-v3'&&a.detailVersion==='natural-appearance-detail-v1';
  const scalp=a.dyedHairColor||(fiberGray?a.hairColor:blendAppearanceColor(a.hairColor,'#c0beb7',grayShare));
  const natural=blendAppearanceColor(a.naturalHairColor||a.hairColor,'#c0beb7',grayShare);
  const face=a.dyedFacialHairColor|| (a.naturalFacialHairColor ? blendAppearanceColor(a.naturalFacialHairColor,'#c0beb7',grayShare) : a.version==='portrait-identity-v3'?natural:scalp);
  const brow=a.dyedBrowColor|| (a.naturalBrowColor ? blendAppearanceColor(a.naturalBrowColor,'#c0beb7',grayShare) : a.version==='portrait-identity-v3'?natural:scalp);
  return {scalp,face,brow,grayShare};
}
