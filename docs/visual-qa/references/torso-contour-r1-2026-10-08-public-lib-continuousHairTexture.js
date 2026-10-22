// Artistic saved texture coordinate, shared by GPU and SVG projections.
// Named labels are summaries; neither ancestry nor football ratings enter here.
export function continuousHairCoordinate(a={}) {
 return a.hairTextureVersion==='continuous-hair-texture-v1'&&Number.isFinite(a.hairTexturePosition)
  ?Math.max(0,Math.min(3,a.hairTexturePosition)):null;
}
export function interpolateHairTexture(a,values) {
 const p=continuousHairCoordinate(a);if(p===null)return null;
 const i=Math.min(2,Math.floor(p)),t=p-i,w=t*t*(3-2*t);
 return values[i]*(1-w)+values[i+1]*w;
}
// A fixed-topology short strand keeps small coordinate changes continuous.
// Projection lengths are artistic; strand thickness remains a separate field.
export function continuousHairStrandPath(a,x,y,length,scale=1) {
 const p=continuousHairCoordinate(a);if(p===null)return null;
 const bound=(v,d,lo,hi)=>Number.isFinite(v)?Math.max(lo,Math.min(hi,v)):d;
 const curve=bound(a.hairCurvature,1,.65,1.45),wave=bound(a.hairWaveScale,1,.65,1.5);
 // Individual residual changes lateral strand width, while length owns its
 // endpoint. This decomposition permits an exact anisotropic SVG instance.
 const shape=bound(scale,1,.5,1.5),amplitude=interpolateHairTexture(a,[.025,.15,.28,.17])*length*curve;
 const cycles=interpolateHairTexture(a,[.1,1,2.5,5])*wave;
 const radial=interpolateHairTexture(a,[0,0,1,1]);
 const n=v=>Math.round(v*10000)/10000;
 const point=t=>{const angle=t*Math.PI*2*cycles,envelope=Math.sin(Math.PI*t);return[x+amplitude*shape*envelope*Math.sin(angle),y+length*t+radial*amplitude*envelope*Math.cos(angle)];};
 const first=point(0);let d=`M${n(first[0])} ${n(first[1])}`;
 for(let i=1;i<=32;i++){const q=point(i/32);d+=` L${n(q[0])} ${n(q[1])}`;}return d;
}
export function continuousHairStrandUse(reference,x,y,length,scale,attributes='',transform='') {
 const n=v=>Math.round(v*10000)/10000;
 const shape=Number.isFinite(scale)?Math.max(.5,Math.min(1.5,scale)):1;
 return `<use${attributes} href="#${reference}" transform="${transform} translate(${n(x)} ${n(y)}) scale(${n(length*shape)} ${n(length)})"/>`;
}
