// Proprietary shared character geometry. Projects saved traits without sampling.
// One saved-trait mesh supplies every camera view; all dimensions are artistic.
import {characterSurfaceLightingGlsl} from './playerSurfaceLighting.js';
const clamp=(v,l,h)=>Math.max(l,Math.min(h,v));
const smooth=t=>t*t*(3-2*t);
const value=(a,k,d,l=.7,h=1.3)=>Number.isFinite(a[k])?clamp(a[k],l,h):d;
const gaussian=(x,y,cx,cy,rx,ry)=>Math.exp(-.5*(((x-cx)/rx)**2+((y-cy)/ry)**2));
const normalize=v=>{const m=Math.hypot(...v)||1;return v.map(x=>x/m);};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const subtract=(a,b)=>a.map((v,i)=>v-b[i]);
const rgb=c=>[1,3,5].map(i=>parseInt(c.slice(i,i+2),16)/255);
const hash=s=>{let h=2166136261;for(const c of s)h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;};
const fiberThreshold=s=>{let h=hash(s);h=Math.imul(h^(h>>>16),0x7feb352d);h=Math.imul(h^(h>>>15),0x846ca68b);return((h^(h>>>16))>>>0)/4294967296;};
const mixColor=(a,b,t)=>'#'+rgb(a).map((v,i)=>Math.round(255*(v*(1-t)+rgb(b)[i]*t)).toString(16).padStart(2,'0')).join('');

export function hairControls3d(a={}){
 const texture=['straight','wavy','curly','coily'].includes(a.hairTexture)?a.hairTexture:'straight';
 const continuous=a.hairTextureVersion==='continuous-hair-texture-v1'&&Number.isFinite(a.hairTexturePosition);
 const position=continuous?clamp(a.hairTexturePosition,0,3):['straight','wavy','curly','coily'].indexOf(texture);
 const blend=values=>{const i=Math.min(2,Math.floor(position)),t=smooth(position-i);return values[i]*(1-t)+values[i+1]*t;};
 return{...(continuous?{continuous,position,radial:smooth(clamp(position-1,0,1)),curl:blend([.08,3,4,2.5]),cycles:blend([1,1,2.5,5]),radius:blend([.65,.65,1.25,1.25])}:{}),style:a.hairstyle||'buzz',texture,length:value(a,'hairLength',1,.5,2),density:value(a,'hairDensity',.8,0,1),
  hairline:value(a,'hairline',.3,0,1),part:value(a,'hairPart',.5,.1,.9),width:value(a,'hairStrandWidth',1,.65,1.5),
  curvature:value(a,'hairCurvature',1,.65,1.45),wave:value(a,'hairWaveScale',1,.65,1.5),variation:value(a,'hairStrandVariation',.25,0,.5)};
}

export function faceControls3d(a={}){
 return{length:value(a,'faceLength',1,.92,1.09),eyeTilt:value(a,'eyeTilt',0,-2,2),crease:value(a,'eyelidCrease',.6,.2,1),
  browWeight:value(a,'browWeight',1,.75,1.35),browArch:value(a,'browArch',1,.7,1.35),browAngle:value(a,'browAngle',0,-2,2),
  lipCurve:value(a,'lipCurve',0,-1,1),asymmetry:value(a,'facialAsymmetry',0,-1,1),
  chinProjection:value(a,'chinProjection',0,-.7,.7),foreheadSlope:value(a,'foreheadSlope',0,-.7,.7),
  irisShade:value(a,'irisShade',0,-.25,.25),irisInnerMix:value(a,'irisInnerMix',.2,0,.65),irisPattern:value(a,'irisPattern',.5,.1,1)};
}

export function hairMaterial3d(a={},colors={},identitySeed){
 const seed=typeof identitySeed==='string'&&identitySeed?identitySeed:String(a.seed||a.hairSeed||a.version||'prototype');
 const supportsFibers=a.version==='portrait-identity-v3'&&a.detailVersion==='natural-appearance-detail-v1';
 return{grayShare:supportsFibers&&!a.dyedHairColor&&Number.isFinite(colors.grayShare)?clamp(colors.grayShare,0,.65):0,
  textureCode:hairControls3d(a).position??Math.max(0,['straight','wavy','curly','coily'].indexOf(a.hairTexture)),dyed:!!a.dyedHairColor,
  patternSeed:(hash(seed)%100000)/997};
}

export function headAnatomy3d(a={}){
 const face=faceControls3d(a),toY=y=>141+(y-141)*face.length;
 const g={width:59*value(a,'faceWidth',1,.88,1.10),jaw:47.5*value(a,'jawWidth',1,.8,1.16),
  chin:31*value(a,'chinWidth',1,.8,1.2),chinY:241+(value(a,'chinLength',1,.85,1.12)-1)*22,
  eyeOffset:26*value(a,'eyeSpacing',1,.88,1.10),eyeY:141,
  noseY:180+(value(a,'noseLength',1)-1)*30,noseWidth:9*value(a,'noseWidth',1)*value(a,'nasalWingWidth',1,.75,1.25),
  skullDepth:55*value(a,'headDepth',1,.85,1.15),brow:value(a,'browRidge',.5,0,1),mouthWidth:20*value(a,'lipWidth',1,.85,1.15)};
 g.faceControls=face;g.crownY=toY(65);g.nominalChinY=g.chinY;g.nominalNoseY=g.noseY;
 g.stations=[[65,0],[82,g.width*.65],[108,g.width],[150,g.width*.99],[176,g.width*.94],[208,g.jaw],[231,g.chin],[g.chinY,0]].map(([y,w])=>[toY(y),w]);
 g.chinY=toY(g.chinY);g.noseY=toY(g.noseY);
 return g;
}
function breadthAt(g,y){
 const stations=g.stations;
 for(let i=1;i<stations.length;i++)if(y<=stations[i][0]){
  const[p,w]=stations[i-1],[q,z]=stations[i],t=clamp((y-p)/(q-p),0,1);
  const before=stations[Math.max(0,i-2)],after=stations[Math.min(stations.length-1,i+1)];
  const first=(z-before[1])/(q-before[0]),last=(after[1]-w)/(after[0]-p);
  if(i===1){
   // A rounded crown has a vertical silhouette tangent at the pole, rather
   // than the conical tip produced by finite-slope interpolation from zero.
   const k=last*(q-p)/z-.5;
   return z*Math.sqrt(t)*(1+k*(t-1));
  }
  if(i===stations.length-1){
   // Match the incoming tangent and close a rounded underside, rather than
   // the finite-slope cone that makes clean chins and beards pointed.
   const remaining=1-t,k=-first*(q-p)/w-.5;
   return w*Math.sqrt(remaining)*(1+k*(remaining-1));
  }
  return Math.max(0,(2*t*t*t-3*t*t+1)*w+(t*t*t-2*t*t+t)*(q-p)*first+(-2*t*t*t+3*t*t)*z+(t*t*t-t*t)*(q-p)*last);
 }return 0;
}
export function headPoint3d(a,angle,y){
 return headPointWithAnatomy(a,headAnatomy3d(a),angle,y);
}
function headPointWithAnatomy(a,g,angle,y){
 const w=breadthAt(g,y),s=Math.sin(angle),c=Math.cos(angle);
 const ny=141+(y-141)/g.faceControls.length,f=g.faceControls;
 const x=w*s*(1-.055*Math.exp(-(((ny-128)/16)**2))+.04*Math.exp(-(((ny-202)/16)**2)));
 const middle=(g.crownY+g.chinY)/2,vertical=(y-middle)/((g.chinY-g.crownY)/2);
 const jawT=clamp((ny-208)/(g.nominalChinY-208),0,1),jawShift=18*jawT*jawT*(3-2*jawT);
 let z=jawShift+g.skullDepth*Math.sqrt(Math.max(0,1-vertical*vertical))*c;
 const transition=clamp(c*3,0,1),face=transition*transition*(3-2*transition),base=z;
 if(face){
  z-=4.8*gaussian(x,ny,0,163,g.width*.92,53);
  for(const side of[-1,1]){
   const ex=x-side*g.eyeOffset,ey=ny-(141+side*f.asymmetry*.8)-side*ex*f.eyeTilt*.1;
   const aperture=value(a,'eyeAperture',1,.7,1.2);
   z-=5.2*gaussian(ex,ey,0,0,13,8);
   const rim=(ex/15)**2+(ey/10)**2;
   z+=.8*Math.exp(-(((rim-1)/.7)**2));
   z+=1.1*gaussian(ex,ey,0,-4.3*aperture,10,1.4)+.8*gaussian(ex,ey,0,4.3*aperture,10,1.6);
   z-=f.crease*.9*gaussian(ex,ey,0,-6.0*aperture,10,.9);
   const browY=130-f.browArch*2+side*ex*f.browAngle*.07+ex*ex*.015;
   z+=3.5*g.brow*gaussian(x,ny,side*g.eyeOffset,browY,16,4);
   z+=5.5*value(a,'cheekbone',1)*(1+side*f.asymmetry*.1)*gaussian(x,ny,side*g.width*.61,159,15,10);
   z+=4.5*value(a,'cheekFullness',1,.75,1.25)*gaussian(x,ny,side*g.width*.52,177,16,13);
   z-=3.8*gaussian(x,ny,side*g.width*.72,194,13,15)+3*gaussian(x,ny,side*g.width*.83,128,13,16);
   z+=4.8*value(a,'jawWidth',1,.8,1.16)*gaussian(x,ny,side*g.jaw*.87,210,11,12);
  }
  z+=9*value(a,'noseBridge',1)*gaussian(x,ny,0,159,6.8*value(a,'nasalRootWidth',1,.75,1.25),19);
  z+=14*value(a,'noseTip',1,.75,1.25)*gaussian(x,ny,0,g.nominalNoseY-2,g.noseWidth*.72,5.5);
  for(const side of[-1,1])z+=5*gaussian(x,ny,side*g.noseWidth*.74,g.nominalNoseY+1,g.noseWidth*.48,4.3);
  z+=2.8*gaussian(x,ny,0,g.nominalNoseY+6,2.8,3)-1.3*gaussian(x,ny,0,g.nominalNoseY+11,5,4);
  z+=f.foreheadSlope*5*gaussian(x,ny,0,105,50,24)+f.chinProjection*6*gaussian(x,ny,0,228,g.chin*.8,9);
  z+=2.6*gaussian(x,ny,0,199,g.mouthWidth,12)-.9*gaussian(x,ny,0,216,16,5)+4.5*gaussian(x,ny,0,228,g.chin*.85,10);
  z-=1.2*gaussian(x,ny,0,192,2,6);
  // Shallow bilateral folds separate the muzzle from the cheeks; they are
  // relief on the same surface, rather than dark lines painted on the face.
  for(const side of[-1,1])z-=1.1*gaussian(x,ny,side*(g.noseWidth+5+(ny-185)*.24),198,2.5,12);
  const lipY=ny-f.lipCurve*(x/g.mouthWidth)**2*2;
  z+=2.8*value(a,'upperLipScale',1,.65,1.4)*(gaussian(x,lipY,-4,202,g.mouthWidth*.40,1.6)+gaussian(x,lipY,4,202,g.mouthWidth*.40,1.6))*.65;
  z+=3.0*value(a,'lowerLipScale',1,.65,1.4)*gaussian(x,lipY,0,207,g.mouthWidth*.70,1.9)-.9*gaussian(x,lipY,0,204,g.mouthWidth*.8,.8);
  z=base+(z-base)*face;
 }
 return[x,(151-y),z];
}
function eyeLidPointWithAnatomy(a,g,side,lid,u,v,blink){
 // Globe and lid share lateral sample locations. Different x grids leave
 // gaps between their polygonal envelopes in oblique/profile projections.
 const ex=(clamp(u,0,1)*2-1)*10,w=1-clamp(v,0,1);
 const aperture=4.3*value(a,'eyeAperture',1,.7,1.2)*Math.sqrt(Math.max(0,1-(Math.abs(ex)/10)**1.6));
 const centerY=141+side*g.faceControls.asymmetry*.8,tilt=side*ex*g.faceControls.eyeTilt*.1;
 const outer=lid*(aperture+2.6*Math.sqrt(Math.max(0,1-(ex/11)**2)));
 const open=lid*aperture*w+outer*(1-w),ey=open-lid*aperture*w*clamp(blink,0,1);
 const centerActualY=141+(centerY-141)*g.faceControls.length;
 const at=(x,y)=>headPointWithAnatomy(a,g,Math.asin(clamp(x/breadthAt(g,y),-.95,.95)),y);
 const centerDepth=at(side*g.eyeOffset,centerActualY)[2]-10;
 const outerY=141+(centerY+tilt+outer-141)*g.faceControls.length;
 const attachedDepth=at(side*g.eyeOffset+ex,outerY)[2];
 const globeDepth=centerDepth+Math.sqrt(Math.max(.01,121-ex*ex-(ey*g.faceControls.length)**2))+.45;
 const actualY=141+(centerY+tilt+ey-141)*g.faceControls.length,blended=w*globeDepth+(1-w)*attachedDepth;
 const edgeScale=Math.sqrt(Math.max(0,1-(ex/11)**2));
 const contact=clamp(blink,0,1)*smooth(clamp(w/.15,0,1))*(1-smooth(clamp((Math.abs(ey)-aperture-.8*edgeScale)/Math.max(.001,1.4*edgeScale),0,1)));
 // The closing shell has lateral clearance too: front-only z padding cannot
 // cover the globe's near silhouette when the camera is in true profile.
 return[side*g.eyeOffset+ex+ex/11*.15*clamp(blink,0,1)*w,151-actualY,blended+contact*Math.max(0,globeDepth+.8*clamp(blink,0,1)-blended)];
}
function eyelidGridV(a,u,v){
 const ex=(clamp(u,0,1)*2-1)*10;
 const aperture=4.3*value(a,'eyeAperture',1,.7,1.2)*Math.sqrt(Math.max(0,1-(Math.abs(ex)/10)**1.6));
 const outer=aperture+2.6*Math.sqrt(Math.max(0,1-(ex/11)**2));
 // Globe rows lie at -1,-.6,-.2,.2,.6,1 of its aperture. Each lid
 // includes those same vertical knots plus the shared meeting margin and
 // an outer skin attachment, so closing triangles cover the globe envelope.
 const knots=[0,aperture*.2/outer,aperture*.6/outer,aperture/outer,1];
 const position=clamp(v,0,1)*4,index=Math.min(3,Math.floor(position));
 return knots[index]+(knots[index+1]-knots[index])*(position-index);
}
function headNormalWithAnatomy(a,g,angle,y){
 if(y<=g.crownY+.001)return[0,1,0];
 const e=.001,du=subtract(headPointWithAnatomy(a,g,angle+e,y),headPointWithAnatomy(a,g,angle-e,y));
 const dv=subtract(headPointWithAnatomy(a,g,angle,Math.min(g.chinY,y+e)),headPointWithAnatomy(a,g,angle,Math.max(g.crownY,y-e)));
 return normalize(cross(dv,du));
}
export function scalpNormal3d(a,angle,y){
 if(![angle,y].every(Number.isFinite))throw Error('Invalid scalp sample');
 const g=headAnatomy3d(a);return headNormalWithAnatomy(a,g,angle,clamp(y,g.crownY,g.chinY));
}
export function eyeLidPoint3d(a,side,lid,u,v,blink=0){
 if(![-1,1].includes(side)||![-1,1].includes(lid)||![u,v,blink].every(Number.isFinite))throw Error('Invalid eyelid pose');
 return eyeLidPointWithAnatomy(a,headAnatomy3d(a),side,lid,u,v,blink);
}
// A single connected surface with numerical tangent normals; camera transforms
// never reconstruct the person or use simulation RNG.
export function buildHeadMesh3d(a,colors,{rings=64,slices=96,identitySeed,headOnly=false}={}){
 if(!Number.isInteger(rings)||rings<16||rings>96||!Number.isInteger(slices)||slices<24||slices>128)throw Error('Prototype tessellation outside bounded range');
 const g=headAnatomy3d(a),vertices=[],indices=[],parts=[],eyeDepths=[];
 const point=(angle,y)=>headPointWithAnatomy(a,g,angle,y);
 const addSurface=(name,surface,color,rows,columns,material=0,normalSign=1)=>{
  const begin=indices.length,base=vertices.length/10;
  const sample=(u,v)=>{
   const p=surface(u,v),e=.0001;
   const du=subtract(surface(u+e,v),surface(u-e,v)),dv=subtract(surface(u,v+e),surface(u,v-e));
   let normal=normalize(cross(dv,du)).map(x=>x*normalSign);if(normal.every(x=>x===0))normal=[0,1,0];
   return [...p,...normal,...rgb(typeof color==='function'?color(u,v):color),typeof material==='function'?material(u,v):material];
  };
  for(let r=0;r<=rows;r++)for(let c=0;c<=columns;c++)vertices.push(...sample(c/columns,r/rows));
  for(let r=0;r<rows;r++)for(let c=0;c<columns;c++){
   const p=base+r*(columns+1)+c,q=p+1,s=p+columns+1,t=s+1;indices.push(p,s,q,q,s,t);
  }parts.push({name,firstIndex:begin,indexCount:indices.length-begin});
 };
 const head=(u,v)=>point((u-.5)*Math.PI*2,g.crownY+clamp(v,0,1)*(g.chinY-g.crownY));
 addSurface('skin',head,colors.skin,rings,slices);
 for(const side of[-1,1]){
  const centerY=141+side*g.faceControls.asymmetry*.8,actualY=141+(centerY-141)*g.faceControls.length;
  const angle=Math.asin(clamp(side*g.eyeOffset/breadthAt(g,actualY),-.95,.95));
  const centerDepth=point(angle,actualY)[2]-10;eyeDepths.push(centerDepth);
  addSurface(`eye-globe-${side}`,(u,v)=>{
   const ex=(clamp(u,0,1)*2-1)*10,ey=(clamp(v,0,1)*2-1)*4.3*value(a,'eyeAperture',1,.7,1.2)*Math.sqrt(Math.max(0,1-(Math.abs(ex)/10)**1.6));
   const nominalY=centerY+side*ex*g.faceControls.eyeTilt*.1+ey,y=141+(nominalY-141)*g.faceControls.length;
   return[side*g.eyeOffset+ex,151-y,centerDepth+Math.sqrt(Math.max(.01,121-ex*ex-(ey*g.faceControls.length)**2))];
  },'#dedbd3',5,12,7);
  for(const lid of[-1,1])addSurface(`eye-lid-${side}-${lid}`,(u,v)=>eyeLidPointWithAnatomy(a,g,side,lid,u,eyelidGridV(a,u,v),0),colors.skin,4,12,(u,v)=>(lid<0?8:9)+(1-eyelidGridV(a,u,v))*.2,lid);
 }
 const ellipsoid=(center,axes)=>(u,v)=>{const t=u*2*Math.PI,p=v*Math.PI;return[center[0]+axes[0]*Math.sin(p)*Math.sin(t),center[1]+axes[1]*Math.cos(p),center[2]+axes[2]*Math.sin(p)*Math.cos(t)];};
 for(const side of[-1,1]){
  const size=value(a,'earSize',1),shape=value(a,'earShape',1);
  // Saved size/shape scale a folded auricle, rather than two overlapping pills.
  // These cartilage dimensions remain artistic, not observed measurements.
  // Rotate the folded auricle toward the viewing hemisphere. The base
  // overlaps the lateral skull; front and profile resolve the same cartilage.
  // Dimensions and inclination are artistic, not anthropometric observations.
  const inclination=.56,cs=Math.cos(inclination),sn=Math.sin(inclination);
  const at=(x,y,z)=>[side*(g.width-1+(x*cs-z*sn)*size),-4+y*size*shape,(z*cs+x*sn)*size-1];
  addSurface(`ear-${side}`,(u,v)=>{
   const t=u*2*Math.PI,r=clamp(v,0,1),sy=Math.cos(t),sz=Math.sin(t);
   return at(1.7+1.8*r*r,21*r*sy,8.5*r*sz*(1+.13*sy));
  },(u,v)=>mixColor(colors.skin,'#38231e',.18*(1-clamp(v,0,1))**2),16,24,3,side);
  const ridge=(name,start,end,inner)=>addSurface(name,(u,v)=>{
   const t=start+(end-start)*v,phi=-u*2*Math.PI;
   const y=(inner?13.2:19.5)*Math.cos(t),z=(inner?4.7:7.8)*Math.sin(t)*(1+.13*Math.cos(t));
   const r=(inner?.8:1.15)*(inner?Math.sin(Math.PI*clamp(v,0,1))*.65+.35:1);
   return at((inner?2.45:3.5)+r*Math.cos(phi),y+r*Math.sin(phi)*Math.cos(t),z+r*Math.sin(phi)*Math.sin(t));
  },colors.skin,inner?16:24,6,3,side);
  ridge(`ear-helix-${side}`,0,2*Math.PI,false);
  ridge(`ear-antihelix-${side}`,-.3,Math.PI*1.35,true);
  addSurface(`ear-concha-${side}`,ellipsoid(at(1.9,1,1),[.12*size,7.2*size*shape,3.1*size]),mixColor(colors.skin,'#38231e',.20),12,16,3);
  addSurface(`ear-tragus-${side}`,ellipsoid(at(3.6,-1,4.2),[1.1*size,3.2*size*shape,1.7*size]),colors.skin,8,12,3);
 }
 if(!headOnly){
  addSurface('neck',(u,v)=>{const angle=u*2*Math.PI,radius=23+clamp(v,0,1)*9;return[Math.sin(angle)*radius,-65-v*78,-4+Math.cos(angle)*radius];},colors.skin,10,40,4);
  addSurface('training-top',ellipsoid([0,-156,-5],[77,33,39]),colors.jersey||'#19364c',20,48,2);
 }
 const controls=hairControls3d(a),hair=controls.style,material=hairMaterial3d(a,colors,identitySeed);
 if(hair!=='shaved'&&controls.density>0){
  const height=({buzz:1,fade:5,crew:9,waves:2,'short-curls':11,coils:13,afro:24,'side-part':11,swept:15,long:10,locs:5,braids:2,receding:2}[hair]||3)*controls.length;
  const parted=['side-part','swept','long'].includes(hair),grouped=['locs','braids'].includes(hair),clustered=['afro','coils','short-curls'].includes(hair);
  const seed=typeof identitySeed==='string'&&identitySeed?identitySeed:String(a.seed||a.hairSeed||a.version||'prototype');
  const frontBorder=angle=>{
   const front=Math.max(0,Math.cos(angle));
   // Recession affects the temples and crown independently of a style label.
   const recession=(hair==='receding'?14:0)+controls.hairline*8;
   const rootVariation=(Math.sin(angle*31+material.patternSeed)*.40+Math.sin(angle*53-material.patternSeed)*.22)*controls.density;
   return 132-front*42-recession*front+Math.abs(Math.sin(angle))*controls.hairline*4+rootVariation;
  };
  const hairSurface=(u,v)=>{
   const rawAngle=(u-.5)*Math.PI*2;
   const angle=controls.continuous?Math.atan2(Math.sin(rawAngle),Math.cos(rawAngle)):rawAngle;
   const border=141+(frontBorder(angle)-141)*g.faceControls.length;
   const y=g.crownY+clamp(v,0,1)*(border-g.crownY),p=point(angle,y);
   const close=['buzz','waves','receding','braids','locs'].includes(hair);
   const fade=hair==='fade'?Math.pow(1-clamp(v,0,1),1.4):1;
   const partAngle=(controls.part-.5)*1.8,partDip=parted?1-.72*Math.exp(-(((angle-partAngle)/.11)**2))*Math.sin(Math.PI*v):1;
   const curlVolume=(controls.continuous?controls.radial:['curly','coily'].includes(controls.texture)?1:0)&&!close&&!grouped?
    (1+Math.sin(angle*17+v*21)*Math.sin(v*27))*1.6*controls.curvature*(controls.continuous?controls.radial:1):0;
   const edge=clamp((1-clamp(v,0,1))/.18,0,1),edgeBlend=edge*edge*(3-2*edge);
   const crownVolume=hair==='afro'?.95+.12*Math.sin(Math.PI*v):.4+.6*Math.sin(Math.PI*v);
   let lift=((close?.55:1.8)+(height*crownVolume*(clustered?.55:1)+curlVolume)*fade*partDip*(.55+.45*controls.density))*(.08+.92*edgeBlend);
   if(controls.continuous&&!close&&!clustered&&!grouped){
    // A combed crown has a fuller swept side and a shorter opposing side.
    // Keep the support volume beneath rooted locks instead of a uniform cap.
    const sweep=parted?smooth(clamp((angle-partAngle+.18)/.55,0,1)): .5;
    const forelock=Math.max(0,Math.cos(angle))*Math.sin(Math.PI*v);
    // Asymmetry belongs to the front sweep. A symmetric rear joins both
    // duplicated azimuth endpoints, including their surface derivatives.
    const frontBlend=smooth(clamp((Math.cos(angle)+.45)/1.45,0,1));
    const volume=parted?.7+frontBlend*(.45+.5*sweep+.22*forelock-.7):.78+.12*forelock;
    const ridges=Math.sin(angle*13+v*16+material.patternSeed)*.55*Math.sin(Math.PI*v);
    lift=Math.max(.08,lift*volume+ridges*edgeBlend);
   }
   const normal=headNormalWithAnatomy(a,g,angle,y);
   return p.map((x,i)=>x+normal[i]*lift);
  };
  addSurface('scalp-hair',hairSurface,colors.scalp,32,80,(u,v)=>{
   // Local coverage softens the hairline and fade without changing skin.
   // Encoded in the existing scalp material range, fixed to the saved head.
   const edge=smooth(clamp((1-v)/.075,0,1)),fade=hair==='fade'?smooth(clamp((1-v)/.38,0,1)):1;
   const baseCoverage=smooth(clamp(controls.density/.35,0,1));
   return 5+.4*(1-baseCoverage*edge*fade);
  });
  if(controls.continuous&&hair==='long'){
   // Loose hair occupies a connected back/side curtain beneath the fine locks.
   // Leave the facial aperture open; the saved length sets the hanging extent.
   addSurface('hair-lock-curtain',(u,v)=>{
    const angle=1.12+u*(Math.PI*2-2.24),root=hairSurface(.5+angle/(Math.PI*2),.60);
    const fall=smooth(clamp(v/.30,0,1)),wave=Math.sin(angle*22+v*10+material.patternSeed)*.65*controls.curvature;
    const radius=g.width+5+Math.sin(Math.PI*v)*3+wave;
    const depth=g.skullDepth+4+wave;
    const tipVariation=.96+.04*Math.sin(angle*7+material.patternSeed);
    return [root[0]*(1-fall)+Math.sin(angle)*radius*fall,root[1]-v*140*controls.length*tipVariation,
     root[2]*(1-fall)+Math.cos(angle)*depth*fall];
   },colors.scalp,24,64,6);
  }
  // Stable rooted fibers/locks. Texture controls curvature, while grooming
  // controls arrangement and length; facial shape is absent from the seed.
  const count=Math.round((hair==='locs'?72:grouped?28:clustered?280:240)*controls.density);
  for(let i=0;i<count;i++){
   const h=hash(`${seed}:fiber:${i}`),u=hair==='locs'||clustered?(i*.61803398875)%1:grouped?(i+.5)/count:(h%1009)/1009,v=hair==='braids'?.10:hair==='locs'||clustered?.06+((i+.5)/count)*.90:.04+((h>>>10)%997)/997*.96;
   const p=hairSurface(u,v),angle=(u-.5)*Math.PI*2,border=141+(frontBorder(angle)-141)*g.faceControls.length;
   const rootY=g.crownY+v*(border-g.crownY),normal=headNormalWithAnatomy(a,g,angle,rootY);
   const residual=1+controls.variation*(((h>>>18)%101)/50-1);
   const combed=controls.continuous&&['side-part','swept','crew'].includes(hair);
   const radius=(hair==='long'?1.9:hair==='locs'?5.5:grouped?4.5:combed?2.1:parted?.65:controls.continuous?controls.radius:['curly','coily'].includes(controls.texture)?1.25:.65)*controls.width*residual;
   const hanging=['locs','long'].includes(hair),braid=hair==='braids';
   const textured=controls.continuous||['curly','coily'].includes(controls.texture);
   const length=(hair==='locs'?72:hair==='long'?(controls.continuous?145:92):braid?24:hair==='afro'?18:hair==='coils'?12:hair==='short-curls'?9:parted?16:5)*controls.length*residual;
   const side=u<controls.part?-1:1;
   const axis=normalize(cross(normal,Math.abs(normal[1])>.9?[1,0,0]:[0,1,0])),other=normalize(cross(normal,axis));
   const rawCenter=t=>{
    if(braid){const progress=v+(1-v)*t,q=hairSurface(u,progress),y=g.crownY+progress*(border-g.crownY),n=headNormalWithAnatomy(a,g,angle,y);return q.map((x,k)=>x+n[k]*2.2+axis[k]*Math.sin(t*Math.PI*12)*.65);}
    const curl=hair==='locs'?.7:controls.continuous?controls.curl:controls.texture==='straight'?.08:controls.texture==='wavy'?3:controls.texture==='curly'?4:2.5;
    const cycles=hair==='locs'?1.2:(controls.continuous?controls.cycles:controls.texture==='coily'?5:controls.texture==='curly'?2.5:1)*controls.wave;
    const bend=Math.sin(t*Math.PI)*curl*(hair==='locs'?1:controls.curvature);
    if(hanging){
     // Roots lift briefly before gravity bends the loose lock down. Locs stay
     // thicker; loose long hair has flatter, more closely fitted clumps.
     if(hair==='long'){
      // Loose hair sweeps away from the facial aperture and collects beside
      // the skull. Independent straight downward fibers obscured the face
      // and left an implausibly sparse curtain instead of a fitted volume.
      const c1=p.map((x,k)=>x+normal[k]*8+[side*15,8,-12][k]);
      const c2=[side*(g.width+7),p[1]-length*.55,Math.min(p[2],0)-7],tip=[side*(g.width+4),p[1]-length,Math.min(p[2],-3)];
      const w=1-t;
      return p.map((x,k)=>w*w*w*x+3*w*w*t*c1[k]+3*w*t*t*c2[k]+t*t*t*tip[k]+axis[k]*bend*Math.sin(t*Math.PI*2*cycles)+other[k]*bend*Math.cos(t*Math.PI*2*cycles));
     }
     const front=Math.max(0,Math.cos(angle)),rootSide=Math.sin(angle)<0?-1:1;
     const endAngle=angle*(1-front*.8)+rootSide*1.25*front*.8;
     const q=hairSurface(.5+endAngle/(Math.PI*2),.90);
     const c1=p.map((x,k)=>x+normal[k]*6),c2=q.map((x,k)=>x+(k===1?4:0));
     const tip=q.map((x,k)=>x+[rootSide*length*.07,-length*.65,0][k]),w=1-t;
     return p.map((x,k)=>w*w*w*x+3*w*w*t*c1[k]+3*w*t*t*c2[k]+t*t*t*tip[k]+axis[k]*bend*Math.sin(t*Math.PI*2*cycles)+other[k]*bend*Math.cos(t*Math.PI*2*cycles));
    }
    if(!controls.continuous&&textured&&!parted)return p.map((x,k)=>x+normal[k]*length*t*.55+axis[k]*bend*Math.sin(t*Math.PI*2*cycles)+other[k]*bend*Math.cos(t*Math.PI*2*cycles));
    // Short and swept hair follows the scalp instead of radial spikes. The
    // residual offset gives volume without detaching the hairline roots.
    const travel=Math.min(.25,length/160,v*.8),q=hairSurface(u+side*t*travel*(parted?1:.3),v-t*travel);
    const fitted=q.map((x,k)=>x+normal[k]*Math.sin(Math.PI*t)*Math.min(2.2,length*.15)+axis[k]*bend*Math.sin(t*Math.PI*2*cycles)*.35);
    if(controls.continuous&&!parted){const radial=p.map((x,k)=>x+normal[k]*length*t*.55+axis[k]*bend*Math.sin(t*Math.PI*2*cycles)+other[k]*bend*Math.cos(t*Math.PI*2*cycles));return fitted.map((x,k)=>x*(1-controls.radial)+radial[k]*controls.radial);}
    return fitted;
   };
   const centers=new Map(),center=t=>{if(!centers.has(t))centers.set(t,rawCenter(t));return centers.get(t);};
   const graying=fiberThreshold(`${seed}:gray-fiber:${i}`)<material.grayShare;
   const fiberColor=graying?'#e2ded4':mixColor(colors.scalp,(h&1)?'#e2c8ac':'#0c1014',((h>>>8)%100)/100*(clustered?.05:combed?.09:.16));
   if(clustered){
    // Occupied overlapping curl groups replace isolated radial wire paths.
    // Saved width/curvature/length retain separate shape authority.
    const r=(hair==='afro'?7:hair==='coils'?5:4.2)*controls.width*residual;
    const center=p.map((x,k)=>x+normal[k]*r*.15);
    const puff=ellipsoid(center,[r,r*(.75+.25*controls.curvature),r*.85]);
    addSurface(`hair-lock-${i}`,(u,v)=>{
     const q=puff(u,v),angle=u*Math.PI*2;
     const ripple=1+.09*Math.sin(angle*3+v*Math.PI*5+material.patternSeed)*controls.curvature;
     return q.map((x,k)=>center[k]+(x-center[k])*ripple);
    },fiberColor,6,8,1);
    continue;
   }
   addSurface(`hair-lock-${i}`,(u,v)=>{
    const p=center(v),t=-u*2*Math.PI,progress=clamp(v,0,1);
    const ahead=center(Math.min(1,progress+.001)),behind=center(Math.max(0,progress-.001)),velocity=subtract(ahead,behind).map(x=>x/.002),acceleration=ahead.map((x,k)=>(x-2*p[k]+behind[k])/.000001);
    const curvatureCross=Math.hypot(...cross(velocity,acceleration)),curveRadius=curvatureCross>.000001?Math.hypot(...velocity)**3/curvatureCross:Infinity;
    const rad=Math.min(radius,curveRadius*.35)*Math.sqrt(Math.max(0,Math.sin(Math.PI*progress)))*(1-.45*progress);
    // Cross-sections follow each curved path. A stable reference avoids the
    // fixed-root frame that turned downward locks into flat wire shapes.
    const tangent=normalize(subtract(ahead,behind));
    const ref=hanging||textured||braid?axis:normal;
    let transverse=cross(tangent,ref);if(Math.hypot(...transverse)<.000001)transverse=cross(tangent,other);
    const across=normalize(transverse),depth=normalize(cross(tangent,across));
    const flat=hair==='long'?.32:parted?.35:1;
    return p.map((x,k)=>x+rad*(across[k]*Math.cos(t)+depth[k]*Math.sin(t)*flat));
   },fiberColor,hanging||textured||braid?12:8,5,1);
 }
 }
 // Facial hair follows the saved skin surface, with bounded rooted fibers and
 // separate grooming silhouettes. No face dimensions enter the random seed.
 const beardStyle=['stubble','mustache','goatee','short-beard','full-beard'].includes(a.facialHair)?a.facialHair:'clean';
 if(beardStyle!=='clean'){
  const modernBeard=a.facialPigmentVersion==='facial-pigment-v1';
  const seed=typeof identitySeed==='string'&&identitySeed?identitySeed:String(a.seed||a.hairSeed||a.version||'prototype');
  const count=beardStyle==='mustache'?48:64,length=({stubble:.65,mustache:2.5,goatee:4,'short-beard':3,'full-beard':7})[beardStyle];
  let beardSurface=null;
  const spread=beardStyle==='goatee'?.36:beardStyle==='short-beard'?1.30:1.43;
  const lipBorder=(x,upper)=>{
   const ratio=x/g.mouthWidth,span=Math.sqrt(Math.max(0,1-ratio*ratio));
   const cupid=.66+.30*Math.exp(-(((Math.abs(ratio)-.26)/.23)**2));
   const height=4.5*value(a,'lipFullness',1,.75,1.25)*value(a,upper?'upperLipScale':'lowerLipScale',1,.65,1.4)*.72*span*(upper?cupid:1);
   return 141+(204+g.faceControls.lipCurve*ratio*ratio*2+(upper?-height-.7:height+.7)-141)*g.faceControls.length;
  };

  // A fitted volume gives longer grooming a silhouette in every camera.
  // The cheek line stays outside the lip aperture; roots taper into skin.
  if(['goatee','short-beard','full-beard'].includes(beardStyle)){
   beardSurface=(u,v)=>{
    const angle=(u-.5)*2*spread,side=Math.abs(Math.sin(angle));
    const growthEdge=modernBeard?Math.sin(angle*19+material.patternSeed)*.55:0;
    const upper=(beardStyle==='goatee'?213:212-(beardStyle==='short-beard'?19:30)*smooth(clamp((side-.45)/.55,0,1)))+growthEdge;
    const tipEdge=modernBeard?Math.sin(angle*23+material.patternSeed)*.7+Math.sin(angle*57-material.patternSeed)*.25:0;
    const lower=g.nominalChinY-4-side*2+tipEdge,nominalY=upper+(lower-upper)*v;
    const y=141+(nominalY-141)*g.faceControls.length,p=point(angle,y),normal=headNormalWithAnatomy(a,g,angle,y);
    const edge=Math.pow(Math.max(0,Math.sin(Math.PI*u)),.45),root=smooth(clamp(v/.18,0,1));
    const relief=.18*Math.sin(angle*53+nominalY*.19);
    const lift=(.18+root*(length*(.30+.70*Math.sin(Math.PI*v*.78))+relief))*edge;
    const result=p.map((x,k)=>x+normal[k]*lift+(k===1?-length*.45*v*v*edge:0));
    if(Math.abs(result[0])<g.mouthWidth)result[1]=Math.min(result[1],151-lipBorder(result[0],false));
    return result;
   };
   addSurface('beard-volume',beardSurface,(u,v)=>mixColor(colors.skin,mixColor(colors.beard,'#0c1014',.08*(1-v)),smooth(clamp(v/(modernBeard?.18:.09),0,1))*smooth(clamp(Math.min(u,1-u)/(modernBeard?.12:.06),0,1))),20,32,modernBeard?(u,v)=>10+.4*(1-smooth(clamp(v/.16,0,1))*smooth(clamp(Math.min(u,1-u)/.10,0,1))):6);
  }
  if(beardStyle!=='stubble')for(const side of[-1,1]){
   addSurface('mustache-volume-'+side,(u,v)=>{
    const start=modernBeard?1.1:3.3;
    const x=side*(start+u*(g.mouthWidth*(modernBeard?.94:.90)-start));
    const nominalY=modernBeard?193+u*4-Math.sin(Math.PI*u)*2+v*7*Math.sqrt(Math.max(0,1-u)):194.0+u*1.5+v*3;
    const y=141+(nominalY-141)*g.faceControls.length,w=breadthAt(g,y),angle=Math.asin(clamp(x/w,-.96,.96));
    const p=point(angle,y),normal=headNormalWithAnatomy(a,g,angle,y);
    const lift=.12+Math.pow(Math.max(0,Math.sin(Math.PI*u)*Math.sin(Math.PI*v)),.6)*Math.min(3,length*.65);
    const result=p.map((x,k)=>x+normal[k]*lift);
    if(Math.abs(result[0])<g.mouthWidth)result[1]=Math.max(result[1],151-lipBorder(result[0],true));
    return result;
   },(u,v)=>mixColor(colors.skin,colors.beard,smooth(clamp(Math.min(u,1-u)/.12,0,1))*smooth(clamp(Math.min(v,1-v)/.18,0,1))),10,24,modernBeard?(u,v)=>10+.4*(1-smooth(clamp(Math.min(u,1-u)/.12,0,1))*smooth(clamp(Math.min(v,1-v)/.18,0,1))):6);
  }
  for(let i=0;i<count;i++){
   const h=hash(`${seed}:beard-fiber:${i}`),side=i%2?-1:1,t=fiberThreshold(`${seed}:beard-root:${i}`),q=((h>>>8)%1009)/1009;
   const mustache=beardStyle==='mustache'||(beardStyle!=='stubble'&&i%4===0);
   let x,y;
   if(mustache){x=side*((modernBeard?2:4)+t*g.mouthWidth*(modernBeard?.75:.65));y=modernBeard?193+t*4-Math.sin(Math.PI*t)*2+q*7*Math.sqrt(1-t):194+t*1.5+q*3;}
   else if(beardStyle==='goatee'){x=side*(2+t*12);y=214+q*20;}
   else if(i%3===0){x=side*g.width*(.50+t*.28);y=(beardStyle==='short-beard'?198:183)+q*16;}
   else{y=214+q*20;x=side*breadthAt(g,141+(y-141)*g.faceControls.length)*(.18+t*.72);}
   const actualY=141+(y-141)*g.faceControls.length,w=breadthAt(g,actualY),angle=Math.asin(clamp(x/w,-.96,.96));
   const root=beardSurface&&!mustache?beardSurface(.5+side*(.03+t*.46),q):point(angle,actualY),e=.001,du=subtract(point(angle+e,actualY),point(angle-e,actualY)),dv=subtract(point(angle,actualY+e),point(angle,actualY-e));
   const normal=normalize(cross(dv,du)),axis=normalize(cross(normal,[0,1,0])),other=normalize(cross(normal,axis));
   const residual=.72+t*.56,radius=beardStyle==='stubble'?.22:.38;
   const pigment=mixColor(colors.beard,(h&1)?'#e2c8ac':'#0c1014',q*.12);
   addSurface(`beard-fiber-${i}`,(u,v)=>{
    const phi=-u*2*Math.PI,t=clamp(v,0,1),r=radius*(1-t*.65),bend=Math.sin(t*Math.PI)*.28;
    const extension=length*residual*t*(beardSurface&&!mustache?.18:.65);
    const fiber=root.map((p,k)=>p+normal[k]*(.3+extension)+(k===1?-extension:0)+axis[k]*(Math.cos(phi)*r+bend)+other[k]*Math.sin(phi)*r);
    // Trim the lower mustache edge above the upper lip for every length;
    // a full-beard length must not make its mustache cover the mouth.
    if(Math.abs(fiber[0])<g.mouthWidth&&beardStyle!=='stubble')fiber[1]=mustache?Math.max(fiber[1],151-lipBorder(fiber[0],true)):Math.min(fiber[1],151-lipBorder(fiber[0],false));
    return fiber;
   },pigment,4,3,modernBeard?10:6);
  }
 }
 const data=new Float32Array(vertices);
 if(data.some(x=>!Number.isFinite(x)))throw Error('Non-finite head mesh');
 if(data.length/10>65535)throw Error('Prototype exceeds 16-bit vertex budget');
 return{version:'shared-head-3d-v1',anatomy:g,eyeDepths,hairControls:controls,hairMaterial:material,vertices:data,indices:new Uint16Array(indices),parts,triangles:indices.length/3};
}

export function createHeadRenderer3d(canvas,{transparent=false}={}){
 // Production PNGs render at twice their SVG dimensions and are resampled at
 // display size. Single-sample depth avoids MSAA edge contributions from the
 // underlying globe at a closed skin seam; opacity is verified by removal.
 const gl=canvas.getContext('webgl',{antialias:false,alpha:transparent,premultipliedAlpha:false,preserveDrawingBuffer:true});if(!gl)throw Error('WebGL unavailable');
 const vertex=`attribute vec3 p;attribute vec3 n;attribute vec3 c;attribute float m;
 uniform vec2 rotation;uniform vec2 extent;uniform vec2 eyeDepths;uniform float blinkPose;uniform vec4 features;uniform vec4 eyeForm;uniform float faceScale;uniform vec3 cameraFit;varying vec3 normal;varying vec3 color;varying vec3 local;varying float material;
 void main(){vec3 posed=p,posedNormal=n;
 if(m>7.5&&m<9.5){
  float lid=m<8.5?-1.:1.,w=clamp((m-(m<8.5?8.:9.))*5.,0.,1.);float side=p.x<0.?-1.:1.;
  bool meetingMargin=blinkPose>=1.&&w>.999;
  if(meetingMargin)w=1.;
  float ex=p.x-side*features.x,tilt=side*ex*eyeForm.x*.1;
  float ey=141.+(151.-p.y-141.)/faceScale-(141.+side*eyeForm.z*.8)-tilt;
  float aperture=4.3*features.y*sqrt(max(0.,1.-pow(abs(ex)/10.,1.6)));
  float closed=meetingMargin?0.:ey-lid*aperture*w*blinkPose;
  posed.y+=lid*aperture*w*blinkPose*faceScale;
  // Both margins resolve the same saved center explicitly at full closure;
  // subtracting rounded open vertices leaves a tiny raster-visible seam.
  if(meetingMargin)posed.y=10.-(side*eyeForm.z*.8+tilt)*faceScale;
  posed.z+=w*(sqrt(max(.01,121.-ex*ex-closed*closed*faceScale*faceScale))-sqrt(max(.01,121.-ex*ex-ey*ey*faceScale*faceScale)));
  float radiusDepth=sqrt(max(.01,121.-ex*ex-closed*closed*faceScale*faceScale));
  float edgeScale=sqrt(max(0.,1.-ex*ex/121.));
  float contact=blinkPose*smoothstep(0.,.15,w)*(1.-smoothstep(0.,max(.001,1.4*edgeScale),abs(closed)-aperture-.8*edgeScale));
  posed.z+=contact*max(0.,(side<0.?eyeDepths.x:eyeDepths.y)+radiusDepth+.45+.8*blinkPose-posed.z);
  posed.x+=ex/11.*.15*blinkPose*w;
  vec3 sphere=normalize(vec3(ex,-closed*faceScale,radiusDepth));
  posedNormal=normalize(mix(n,sphere,max(blinkPose*w,contact)));
 }
 float cs=rotation.x,sn=rotation.y;vec3 q=vec3(posed.x*cs+posed.z*sn,posed.y,-posed.x*sn+posed.z*cs);
 normal=vec3(posedNormal.x*cs+posedNormal.z*sn,posedNormal.y,-posedNormal.x*sn+posedNormal.z*cs);local=posed;color=c;material=m;
 gl_Position=vec4(q.x*cameraFit.x/extent.x,(q.y*cameraFit.x+cameraFit.y)/extent.y,-q.z/180.0,1.0);}`;
 const fragment=`precision highp float;varying vec3 normal;varying vec3 color;varying vec3 local;varying float material;
 uniform vec3 iris;uniform vec3 brow;uniform vec3 beard;uniform vec4 features;uniform vec3 mouth;uniform float beardStyle;uniform vec2 nose;
 uniform vec4 eyeForm;uniform vec3 browForm;uniform vec3 irisForm;uniform vec3 lipForm;uniform float faceScale;
 uniform vec4 skinMarks;
 uniform vec2 rotation;
 uniform vec3 hairMaterial;uniform float clayMode;uniform float blinkPose;
 float oval(vec2 p,vec2 c,vec2 r){vec2 q=(p-c)/r;return dot(q,q);}
 ${characterSurfaceLightingGlsl}
 void main(){vec3 pigment=color;vec3 eyeNormal=normal;float wetness=0.;vec2 xy=vec2(local.x,141.0+(151.0-local.y-141.0)/faceScale);
 if(clayMode<.5&&(material<.5||(material>6.5&&material<7.5))&&local.z>-8.0){
 if(skinMarks.x>.5){
  vec2 cell=floor(xy/3.4);float spot=fract(sin(dot(cell,vec2(12.9898,78.233)))*43758.5453);
  float cheekDelta=(xy.y-170.)/14.;float cheek=exp(-cheekDelta*cheekDelta)*smoothstep(12.,20.,abs(xy.x))*(1.-smoothstep(44.,54.,abs(xy.x)));
  float dotShape=1.-smoothstep(.12,.32,length(fract(xy/3.4)-vec2(.5)));
  pigment*=1.-.18*step(.73,spot)*dotShape*cheek;
 }
 if(skinMarks.w>.5){float mole=1.-smoothstep(.8,1.2,length(xy-skinMarks.yz));pigment=mix(pigment,vec3(.23,.14,.10),mole*.65);}
 for(int i=0;i<2;i++){float s=i==0?-1.0:1.0;vec2 center=vec2(s*features.x,141.0+s*eyeForm.z*.8);
 vec2 e=xy-center;e.y-=s*e.x*eyeForm.x*.1;
 float aperture=4.3*features.y;float almond=max(0.,1.-pow(abs(e.x)/10.,1.6));
 float lid=abs(e.y)/(aperture*sqrt(almond)+.03);
 // The socket is an opening in the skin, not a decal over a solid skull.
 // Closing lids are separate opaque geometry and retain the same aperture.
 // Leave a skin rim beneath the lid attachment; the globe and the sampled
 // lid polygons must not expose an unsealed corner of the cutout.
 if(material<.5&&abs(e.x)<9.0&&lid<.9)discard;
 if(abs(e.x)<10.5&&lid<1.18)pigment=mix(pigment,brow,.38);
 if(material>6.5&&material<7.5&&s*local.x>0.){
  if(abs(e.x)>=10.0||lid>=1.)discard;
  pigment=mix(vec3(.64,.61,.57),vec3(.88,.86,.81),1.-min(1.,abs(e.x)/10.));
  // Curved corneal normal and lid shadow share the eye coordinates in both cameras.
  vec2 surface=vec2(e.x/11.,-e.y*faceScale/11.);float depth=sqrt(max(.01,1.-dot(surface,surface)));
  vec3 cornea=normalize(vec3(surface,depth));
  eyeNormal=vec3(cornea.x*rotation.x+cornea.z*rotation.y,cornea.y,-cornea.x*rotation.y+cornea.z*rotation.x);
  wetness=1.;pigment*=.82+.18*smoothstep(-aperture,aperture*.3,e.y);
  float ir=length(e/vec2(4.1,4.3));
  if(ir<1.0){
   float angle=0.;if(dot(e,e)>.00000001)angle=atan(e.y,e.x);
   float rays=.5+.5*sin(angle*23.+ir*11.);
   vec3 shade=clamp(iris*(1.+irisForm.x),0.,1.);
   vec3 inner=mix(shade,vec3(.47,.28,.10),irisForm.y);
   pigment=mix(inner,shade,smoothstep(.30,.75,ir))*(.80+.20*rays*irisForm.z);
   pigment*=mix(.55,1.,1.-smoothstep(.82,1.,ir));
   if(ir<.34)pigment=vec3(.025,.023,.021);
  }
  if(oval(e,vec2(-.8,-1.0),vec2(.45,.6))<1.0)pigment=vec3(.97);
 }
 float crease=e.y+aperture+1.6;float creaseAlpha=(1.-smoothstep(.3,.8,abs(crease)))*eyeForm.y*max(0.,1.-abs(e.x)/11.);
 if(abs(e.x)<11.&&e.y<0.)pigment=mix(pigment,brow,.18*creaseAlpha);
 float browY=130.-browForm.y*2.+s*e.x*browForm.z*.07+e.x*e.x*.015;
 float browTaper=sqrt(max(0.,1.-pow(e.x/14.,2.)));
 float browEdge=abs(xy.y-browY)/(1.8*browForm.x*browTaper+.03);
 if(abs(e.x)<14.&&browEdge<1.)pigment=mix(pigment,brow,(.60+.28*fract(sin(xy.x*17.+xy.y*3.)*213.1))*(1.-smoothstep(.55,1.,browEdge)));
 }
 vec2 lip=xy-vec2(0.,204.);float lipX=lip.x/features.z;lip.y-=lipForm.x*lipX*lipX*2.;
 float lipSpan=sqrt(max(0.,1.-lipX*lipX));
 float cupid=.66+.30*exp(-pow((abs(lipX)-.26)/.23,2.));
 float lipHeight=features.w*(lip.y<0.?lipForm.y*cupid*.72:lipForm.z*.72)*lipSpan;
 float lipEdge=1.-smoothstep(max(0.,lipHeight-.65),lipHeight+.25,abs(lip.y));
 float lipMask=lipEdge*(1.-smoothstep(.88,1.,abs(lipX)));
 pigment=mix(pigment,mouth,.56*lipMask);
 float seam=.12+.34*lipX*lipX;
 pigment*=1.-.32*(1.-smoothstep(.10,.45,abs(lip.y-seam)))*(1.-smoothstep(.82,1.,abs(lipX)));
 float nostril=min(oval(xy,vec2(-nose.y*.66,nose.x+4.),vec2(2.5,1.0)),oval(xy,vec2(nose.y*.66,nose.x+4.),vec2(2.5,1.0)));
 pigment*=1.-.46*(1.-smoothstep(.25,1.35,nostril));
 if(beardStyle>0.0){float grain=fract(sin(dot(xy,vec2(12.9898,78.233)))*43758.5453);float coverage=beardStyle<1.5?.18:.12;
 float cheekEdge=smoothstep(193.,211.,xy.y)+smoothstep(20.,45.,abs(xy.x))*smoothstep(174.,194.,xy.y);
 float mouthClear=smoothstep(.7,1.2,oval(xy,vec2(0.,203.),vec2(features.z+2.,9.)));
 float mustache=(1.-smoothstep(.75,1.1,oval(xy,vec2(0.,197.),vec2(features.z*.88,3.))))*smoothstep(2.5,5.,abs(xy.x));
 float chin=(1.-smoothstep(12.,19.,abs(xy.x)))*smoothstep(208.,214.,xy.y);
 float region=clamp(cheekEdge,0.,1.)*mouthClear;
 if(beardStyle>1.5&&beardStyle<2.5)region=mustache;
 if(beardStyle>2.5&&beardStyle<3.5)region=max(mustache,chin);
 if(beardStyle>3.5)region=max(region,mustache);
 if(beardStyle>3.5&&beardStyle<4.5)region*=smoothstep(186.,200.,xy.y);
 pigment=mix(pigment,beard,region*coverage*(.75+.25*grain)*smoothstep(-8.,14.,local.z));}
 }
 if(clayMode<.5&&material>7.5&&material<9.5){float side=xy.x<0.?-1.:1.;float ex=xy.x-side*features.x;
  float seamY=xy.y-(141.+side*eyeForm.z*.8)-side*ex*eyeForm.x*.1;
  pigment*=1.-.18*(1.-smoothstep(.08,.38,abs(seamY)))*smoothstep(.65,1.,blinkPose);
 }
 bool hair=(material>.5&&material<1.5)||(material>4.5&&material<6.5);
 if(material>9.5&&material<10.5&&clayMode<.5){
  // Rooted density and curved strands break up the solid beard shell. The
  // pattern is fixed in head coordinates, never in camera or screen pixels.
  float coverage=clamp(1.-(material-10.)/.4,0.,1.);
  vec2 follicle=floor(xy*3.2);
  float grain=fract(sin(dot(follicle,vec2(12.9898,78.233))+hairMaterial.z)*43758.5453);
  if(grain>coverage)discard;
  float flow=xy.x*3.7+sin(xy.y*.18+xy.x*.08+hairMaterial.z)*1.7;
  float strand=.5+.5*sin(flow);
  pigment*=.76+.20*strand+.08*grain;
 }
 if(hair&&clayMode<.5){
  float azimuth=0.;if(dot(local.xz,local.xz)>.000001)azimuth=atan(local.x,local.z);
  float flow=azimuth*180.+local.y*.25+sin(local.y*.22)*hairMaterial.y*1.2;
  if(material>5.5&&material<6.5)flow=local.x*5.7+sin(local.y*.28+local.x*.07)*1.4;
  float fiber=.5+.5*sin(flow);
  if(material<1.5)fiber=.5+.5*fract(sin(dot(local,vec3(7.31,11.73,5.17)))*231.17);
  pigment*=material>5.5?.83+.17*fiber:.94+.06*fiber;
  if(material>4.5&&material<5.5){
   float coverage=clamp(1.-(material-5.)/.4,0.,1.);
   vec3 cellPosition=floor(local*2.4);
   float pore=fract(sin(dot(cellPosition,vec3(12.9898,78.233,39.425))+hairMaterial.z)*43758.5453);
   if(pore>coverage)discard;
   float cell=floor(azimuth*98.);float threshold=fract(sin(cell*12.9898+19.73+hairMaterial.z)*43758.5453);
   float gray=step(threshold,hairMaterial.x)*step(.0001,hairMaterial.x);
   pigment=mix(pigment,vec3(.886,.871,.831)*(.94+.06*fiber),gray);
  }
 }
 if(clayMode>.5){pigment=vec3(.58,.57,.55);wetness=0.;}
 vec3 N=normalize(mix(normal,eyeNormal,wetness));
 gl_FragColor=vec4(characterSurfaceLight(pigment,N,wetness),1.0);}`;
 const shader=(kind,source)=>{const s=gl.createShader(kind);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
 const program=gl.createProgram(),vs=shader(gl.VERTEX_SHADER,vertex),fs=shader(gl.FRAGMENT_SHADER,fragment);gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
 const buffer=gl.createBuffer(),indexBuffer=gl.createBuffer();let disposed=false,uploaded=null;
 const location=k=>gl.getUniformLocation(program,k);
 const draw=(mesh,a,colors,angle=0,{blink=0,clay=false,fitSkull=false}={})=>{
  if(!Number.isFinite(angle)||!Number.isFinite(blink))throw Error('Non-finite presentation pose');
  if(disposed)throw Error('Disposed renderer');if(gl.isContextLost())throw Error('WebGL context lost');gl.viewport(0,0,canvas.width,canvas.height);gl.clearColor(transparent?0:.065,transparent?0:.10,transparent?0:.12,transparent?0:1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.enable(gl.DEPTH_TEST);gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,indexBuffer);if(uploaded!==mesh){gl.bufferData(gl.ARRAY_BUFFER,mesh.vertices,gl.STATIC_DRAW);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,mesh.indices,gl.STATIC_DRAW);uploaded=mesh;}
  for(const[name,size,offset]of[['p',3,0],['n',3,12],['c',3,24],['m',1,36]]){const at=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(at);gl.vertexAttribPointer(at,size,gl.FLOAT,false,40,offset);}
  gl.uniform2f(location('rotation'),Math.cos(angle),Math.sin(angle));gl.uniform2f(location('extent'),110,110*canvas.height/canvas.width);gl.uniform1f(location('clayMode'),clay?1:0);
  const fit=fitSkull?175/(mesh.anatomy.chinY-mesh.anatomy.crownY):1;
  gl.uniform3f(location('cameraFit'),fit,fitSkull?110*canvas.height/canvas.width-65-fit*(151-mesh.anatomy.crownY):10,0);
  for(const key of['iris','brow','beard','mouth'])gl.uniform3fv(location(key),rgb(colors[key]));
  gl.uniform4f(location('features'),mesh.anatomy.eyeOffset,value(a,'eyeAperture',1,.7,1.2),mesh.anatomy.mouthWidth,4.5*value(a,'lipFullness',1,.75,1.25));gl.uniform1f(location('blinkPose'),clamp(blink,0,1));gl.uniform2fv(location('eyeDepths'),mesh.eyeDepths);
  const f=mesh.anatomy.faceControls;
  gl.uniform2f(location('nose'),mesh.anatomy.nominalNoseY,mesh.anatomy.noseWidth);
  gl.uniform1f(location('faceScale'),f.length);
  gl.uniform4f(location('eyeForm'),f.eyeTilt,f.crease,f.asymmetry,0);
  gl.uniform3f(location('browForm'),f.browWeight,f.browArch,f.browAngle);
  gl.uniform3f(location('irisForm'),f.irisShade,f.irisInnerMix,f.irisPattern);
  gl.uniform3f(location('hairMaterial'),mesh.hairMaterial.grayShare,['locs','braids'].includes(a.hairstyle)?0:mesh.hairMaterial.textureCode,mesh.hairMaterial.patternSeed);
  gl.uniform3f(location('lipForm'),f.lipCurve,value(a,'upperLipScale',1,.65,1.4),value(a,'lowerLipScale',1,.65,1.4));
  const mole=a.mole&&Number.isFinite(a.mole.x)&&Number.isFinite(a.mole.y);
  gl.uniform4f(location('skinMarks'),a.freckles===true?1:0,mole?clamp(a.mole.x,122,198)-160:0,mole?clamp(a.mole.y,155,195):0,mole?1:0);
  gl.uniform1f(location('beardStyle'),({clean:0,stubble:1,mustache:2,goatee:3,'short-beard':4,'full-beard':5})[a.facialHair]??0);
  gl.drawElements(gl.TRIANGLES,mesh.indices.length,gl.UNSIGNED_SHORT,0);if(gl.getError()!==gl.NO_ERROR)throw Error('WebGL draw error');
  return{triangles:mesh.triangles,meshBytes:mesh.vertices.byteLength+mesh.indices.byteLength};
 };
 return{draw,dispose(){if(disposed)return;disposed=true;gl.deleteBuffer(buffer);gl.deleteBuffer(indexBuffer);gl.deleteProgram(program);gl.deleteShader(vs);gl.deleteShader(fs);},readPixels(){const pixels=new Uint8Array(canvas.width*canvas.height*4);gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return pixels;}};
}
