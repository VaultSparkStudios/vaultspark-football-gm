// Artistic scene lighting shared by the 3D head and measured SVG surfaces.
// Pigment is albedo, not a new identity trait or a demographic observation.
const LIGHT=[-.5,.6,1],HIGHLIGHT=[-.2,.3,1];
const normalized=v=>{const length=Math.hypot(...v);return v.map(c=>c/length);};
const light=normalized(LIGHT),highlight=normalized(HIGHLIGHT);
const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
export const characterSurfaceLightingGlsl=`
vec3 characterSurfaceLight(vec3 pigment,vec3 N,float wetness){
 float diffuse=max(0.,dot(N,normalize(vec3(-.5,.6,1.0))));
 vec3 lit=pow(pigment,vec3(2.2))*(.32+.78*diffuse)+vec3(mix(.007,.12,wetness))*pow(max(0.,dot(N,normalize(vec3(-.2,.3,1.0)))),mix(32.,80.,wetness));
 return pow(lit,vec3(1.0/2.2));
}
// Current shared character materials use a broad key, a weaker opposite fill
// and a restrained skin sheen. These are scene/art controls, not new traits.
// The original function remains the legacy/SVG lighting contract.
vec3 characterNaturalSurfaceLight(vec3 pigment,vec3 N,float wetness,float skin,float occlusion){
 vec3 key=normalize(vec3(-.65,.75,1.)),fill=normalize(vec3(.8,.25,.65));
 float diffuse=max(0.,dot(N,key)),fillDiffuse=max(0.,dot(N,fill));
 float wrap=max(0.,(dot(N,key)+.25)/1.25);
 float irradiance=.16+.82*mix(diffuse,wrap,skin*.32)+.18*fillDiffuse;
 vec3 albedo=pow(clamp(pigment,0.,1.),vec3(2.2));
 float reflection=pow(max(0.,dot(N,normalize(key+vec3(0.,0.,1.)))),mix(24.,100.,wetness));
 float fresnel=.028+.972*pow(1.-clamp(N.z,0.,1.),5.);
 float sheen=mix(.006+.016*skin,.19,wetness)*reflection;
 vec3 lit=albedo*irradiance*occlusion+vec3(sheen)*(1.+fresnel*.35);
 return pow(clamp(lit,0.,1.),vec3(1./2.2));
}`;
export function characterSurfaceColor(pigment,normal,{occlusion=1}={}){
 if(!/^#[0-9a-f]{6}$/i.test(pigment)||normal?.length!==3||normal.some(v=>!Number.isFinite(v))||Math.hypot(...normal)===0||!Number.isFinite(occlusion)||occlusion<0||occlusion>1)throw Error('Invalid character material');
 const N=normalized(normal),diffuse=Math.max(0,dot(N,light)),specular=.007*Math.max(0,dot(N,highlight))**32;
 return '#'+[1,3,5].map(i=>{
  const albedo=parseInt(pigment.slice(i,i+2),16)/255;
  return Math.round(255*Math.min(1,((albedo**2.2*(.32+.78*diffuse)+specular)*occlusion)**(1/2.2))).toString(16).padStart(2,'0');
 }).join('');
}
export function characterSkinStops(skin,{crossNormal=[1,0],occlusion=1}={}){
 if(crossNormal?.length!==2||crossNormal.some(v=>!Number.isFinite(v))||Math.hypot(...crossNormal)===0)throw Error('Invalid skin section');
 const [nx,ny]=normalized(crossNormal);
 // Screen y points down. Camera-space normals point up, as in the head.
 // Dense samples retain the curved cross-section rather than a metallic band.
 return [0,.03,.10,.20,.35,.50,.65,.80,.90,.97,1].map(offset=>{
  const lateral=offset*2-1,z=Math.sqrt(Math.max(0,1-lateral*lateral));
  return `<stop offset="${offset}" stop-color="${characterSurfaceColor(skin,[nx*lateral,-ny*lateral,z],{occlusion})}"/>`;
 }).join('');
}
