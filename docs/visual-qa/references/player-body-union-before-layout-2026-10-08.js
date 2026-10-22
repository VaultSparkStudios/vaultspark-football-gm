// Proprietary measured-body surface experiment. Inches and saved bone centers
// define one camera-independent mesh. This is not yet the production dossier.
import {neutralMeasuredPose,renderableIndividualAnatomy,projectedLimbSections,projectedTorsoSections} from './physiqueGeometryContract.js';
import {buildHeadMesh3d} from './playerHead3d.js';
import {solvePlayerMotion} from './playerMotion.js';
import {estimatedPalmBreadth} from './playerHand.js';
import {characterSurfaceLightingGlsl} from './playerSurfaceLighting.js';
const clamp=(x,l,h)=>Math.max(l,Math.min(h,x));
const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),mul=(a,s)=>a.map(v=>v*s);
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=a=>{const length=Math.hypot(...a);if(length<1e-10)return[0,1,0];return mul(a,1/length);};
const smooth=t=>t*t*(3-2*t);
function sample(rows,t){for(let i=1;i<rows.length;i++)if(t<=rows[i][0]){const a=rows[i-1],b=rows[i],s=smooth(clamp((t-a[0])/(b[0]-a[0]),0,1));return[a[1]+(b[1]-a[1])*s,a[2]+(b[2]-a[2])*s];}return rows.at(-1).slice(1);}
function basis(axis,frontal=false){const d=unit(axis),reference=Math.abs(d[0])<.9?[1,0,0]:[0,0,1],lateral=frontal?unit(cross(d,[0,0,1])):unit(sub(reference,mul(d,dot(reference,d))));return{d,lateral,depth:unit(cross(lateral,d))};}
export function resolveBodySurfacePose(player,{mode='neutral',phase=0}={}){
 const f=player?.visualFrame;if(!f||f.measurementFit?.status==='unsupported')return null;
 if(mode==='neutral'){
  const p=neutralMeasuredPose(f,{unit:1,floor:0});if(!p)return null;
  const at=p=>[p.x-160,-p.y,p.z??0],limb=l=>Object.fromEntries(['root','joint','end','hand'].filter(k=>l[k]).map(k=>[k,at(l[k])]));
  return{mode,phase:0,shoulder:[0,-p.shoulderY,0],hip:[0,-p.hipY,0],arms:p.arms.map(limb),legs:p.legs.map(limb),skullHeight:p.skull,handLength:p.handLength};
 }
 if(!['run','acceleration','cut','jump','strength','endurance'].includes(mode)||!Number.isFinite(phase))throw Error('Invalid body pose');
 const p=solvePlayerMotion(player,{mode,phase});if(!p)return null;
 const at=q=>mode==='cut'?[(q.x-160)/6,(p.floor-q.y)/6,(q.z??0)/6]:[(q.z??0)/6,(p.floor-q.y)/6,(q.x-160)/6];
 const limb=l=>Object.fromEntries(['root','joint','end','hand'].filter(k=>l[k]).map(k=>[k,at(l[k])]));
 return{mode,phase,shoulder:at(p.shoulder),hip:at(p.hip),arms:p.arms.map(limb),legs:p.legs.map(limb),skullHeight:p.skull/6,handLength:p.handLength/6};
}
export function buildPlayerBodyMesh3d(player,options={}){
 const pose=resolveBodySurfacePose(player,options);if(!pose)return null;
 const f={...player.visualFrame,...renderableIndividualAnatomy(player.visualFrame)},a=player.appearance;
 if(!a||!projectedTorsoSections(f,'front',1)||!projectedLimbSections(f,'arm')||!projectedLimbSections(f,'leg'))return null;
 const bulkScale=options.bulkScale??1;
 if(!Number.isFinite(bulkScale)||bulkScale<.3||bulkScale>3)throw Error('Invalid regional bulk scale');
 // Offline experimental mass fitting adjusts soft-tissue profiles only.
 // Pose, skull, neck, hands and feet retain the original measurement authority.
 for(const key of ['torsoSections','armSections','legSections'])f[key]=f[key].map(([t,w,d])=>[t,w*bulkScale,d*bulkScale]);
 const vertices=[],indices=[],parts=[];
 const surface=(name,point,center,rows=24,columns=32)=>{
  const startVertex=vertices.length/6,firstIndex=indices.length;
  const differential=(u,v)=>{const e=.0001,p=point(u,v),du=sub(point(u+e,v),point(u-e,v)),dv=sub(point(u,v+e),point(u,v-e));return{p,n:cross(dv,du),out:sub(p,center(u,v))};};
  const probe=differential(.23,.51),orientation=dot(probe.n,probe.out)<0?-1:1;
  for(let r=0;r<=rows;r++)for(let c=0;c<=columns;c++){const {p,n}=differential(c/columns,r/rows);vertices.push(...p,...mul(unit(n),orientation));}
  for(let r=0;r<rows;r++)for(let c=0;c<columns;c++){const p=startVertex+r*(columns+1)+c,q=p+1,s=p+columns+1,t=s+1;indices.push(...(orientation===1?[p,s,q,q,s,t]:[p,q,s,q,t,s]));}
  parts.push({name,firstIndex,indexCount:indices.length-firstIndex,startVertex,vertexCount:vertices.length/6-startVertex});
 };
 const ellipsoid=(name,center,axes,b)=>surface(name,(u,v)=>{const theta=u*2*Math.PI,phi=clamp(v,0,1)*Math.PI;return add(center,add(mul(b.lateral,axes[0]*Math.sin(phi)*Math.cos(theta)),add(mul(b.d,axes[1]*Math.cos(phi)),mul(b.depth,axes[2]*Math.sin(phi)*Math.sin(theta)))));},()=>center,16,32);
 const tube=(name,start,end,sections,rows=24,frontal=false)=>{
  const b=basis(sub(end,start),frontal),at=t=>add(start,mul(sub(end,start),clamp(t,0,1)));
  surface(name,(u,v)=>{const t=clamp(v,0,1),[w,d]=sample(sections,t),angle=u*2*Math.PI;return add(at(t),add(mul(b.lateral,w/2*Math.cos(angle)),mul(b.depth,d/2*Math.sin(angle))));},(u,v)=>at(v),rows,32);
  for(const [label,t,sign]of[['start',0,-1],['end',1,1]]){
   const [w,d]=sample(sections,t),center=at(t);
   surface(name+'-'+label,(u,v)=>add(center,add(mul(b.lateral,w/2*clamp(v,0,1)*Math.cos(u*2*Math.PI)),mul(b.depth,d/2*clamp(v,0,1)*Math.sin(u*2*Math.PI)))),()=>sub(center,mul(b.d,sign)),1,32);
  }
  return b;
 };
 const torsoBasis=tube('torso',pose.shoulder,pose.hip,f.torsoSections,36);
 const up=unit(sub(pose.shoulder,pose.hip)),neckTop=add(pose.shoulder,mul(up,3));
 const forward=unit(cross(torsoBasis.lateral,up)),chest=f.torsoSections[0],pelvis=f.torsoSections.at(-1);
 surface('shoulder-yoke',(u,v)=>{const t=clamp(v,0,1),blend=smooth(t),width=f.neckDiameterInches*.72+(chest[1]-f.neckDiameterInches*.72)*blend,depth=f.neckDiameterInches*.72+(chest[2]-f.neckDiameterInches*.72)*blend,center=add(pose.shoulder,mul(up,1.5*(1-t)));return add(center,add(mul(torsoBasis.lateral,width/2*Math.cos(u*2*Math.PI)),mul(forward,depth/2*Math.sin(u*2*Math.PI))));},(u,v)=>add(pose.shoulder,mul(up,1.5*(1-clamp(v,0,1)))),12,32);
 for(const [label,t,sign]of[['start',0,1],['end',1,-1]]){
  const center=add(pose.shoulder,mul(up,1.5*(1-t))),width=t?chest[1]:f.neckDiameterInches*.72,depth=t?chest[2]:f.neckDiameterInches*.72;
  surface('shoulder-yoke-'+label,(u,v)=>add(center,add(mul(torsoBasis.lateral,width/2*clamp(v,0,1)*Math.cos(u*2*Math.PI)),mul(forward,depth/2*clamp(v,0,1)*Math.sin(u*2*Math.PI)))),()=>sub(center,mul(up,sign)),1,32);
 }
 ellipsoid('pelvic-envelope',add(pose.hip,mul(up,-1)),[pelvis[1]/2,Math.min(3.5,f.heightInches*.04),pelvis[2]/2],{d:up,lateral:torsoBasis.lateral,depth:forward});
 tube('neck',pose.shoulder,neckTop,[[0,f.neckDiameterInches,f.neckDiameterInches],[1,f.neckDiameterInches*.70,f.neckDiameterInches*.70]],12);
 const frontal=pose.mode==='neutral'||pose.mode==='cut';
 for(const kind of ['arm','leg'])for(const [i,l]of pose[kind==='arm'?'arms':'legs'].entries()){
  const sections=f[kind==='arm'?'armSections':'legSections'],joint=kind==='arm'?f.upperArmShare:f.upperLegShare;
  for(const [name,start,end,lo,hi]of[['upper',l.root,l.joint,0,joint],['lower',l.joint,l.end,joint,1]]){
   const rows=[lo,...sections.map(s=>s[0]).filter(t=>t>lo&&t<hi),hi].map(t=>[(t-lo)/(hi-lo),...sample(sections,t)]);
   tube(`${kind}-${i}-${name}`,start,end,rows,20,frontal);
  }
  const jointSize=sample(sections,joint),jointAxes=[jointSize[0]/2,Math.min(jointSize[0],jointSize[1])*.28,jointSize[1]/2];
  ellipsoid(`${kind}-${i}-joint`,l.joint,jointAxes,basis(sub(l.end,l.root),frontal));
  if(kind==='arm'){
   const root=sample(sections,0),rootBasis=basis(sub(l.joint,l.root),frontal);
   ellipsoid(`arm-${i}-root`,l.root,[root[0]/2,root[0]*.275,root[1]/2],rootBasis);
   const b=basis(sub(l.hand,l.end),frontal),palmWidth=estimatedPalmBreadth(f.handSizeInches,1);
   if((frontal&&i===1)||(!frontal&&i===0)){b.lateral=mul(b.lateral,-1);b.depth=mul(b.depth,-1);}
   // Explicit illustrative depth, not an observed hand thickness. The tip
   // and wrist remain the actual solved skeletal endpoints.
   ellipsoid(`hand-${i}-palm`,add(l.end,mul(b.d,pose.handLength*.30)),[palmWidth/2,pose.handLength*.30,palmWidth*.14],b);
   for(const [finger,offset,tip]of[[0,-.32,.91],[1,0,1],[2,.22,.96],[3,.41,.84]]){
    const start=add(l.end,add(mul(b.d,pose.handLength*.53),mul(b.lateral,palmWidth*offset))),length=pose.handLength*(tip-.53);
    ellipsoid(`hand-${i}-finger-${finger}`,add(start,mul(b.d,length/2)),[palmWidth*.105,length/2,palmWidth*.09],b);
   }
   const thumbAxis=unit(add(mul(b.d,.75),mul(b.lateral,-.65))),thumbCenter=add(l.end,add(mul(b.d,pose.handLength*.37),mul(b.lateral,-palmWidth*.57)));
   ellipsoid(`hand-${i}-thumb`,thumbCenter,[palmWidth*.13,pose.handLength*.15,palmWidth*.12],basis(thumbAxis,frontal));
   const wrist=sample(sections,1);
   tube(`wrist-${i}`,l.end,add(l.end,mul(b.d,pose.handLength*.25)),[[0,...wrist],[1,palmWidth*.87,palmWidth*.28*.87]],6,frontal);
  }else{
   const length=f.footLengthInches,width=f.footWidthInches;
   if(![length,width].every(Number.isFinite))return null;
   const footSections=[[0,0,0],[.18,width*.65,2.25],[.32,width*.75,2.5],[.66,width,1.3],[.87,width*.9,1.1],[1,0,0]];
   const footCenter=t=>{const [,height]=sample(footSections,t);return add(l.end,[0,-2.5+height/2,length*(t-.27)]);};
   surface(`foot-${i}`,(u,v)=>{const t=clamp(v,0,1),[w,h]=sample(footSections,t);return add(footCenter(t),[w/2*Math.cos(u*2*Math.PI),h/2*Math.sin(u*2*Math.PI),0]);},(u,v)=>footCenter(clamp(v,0,1)),32,32);
   const ankle=sample(sections,1);
   tube(`ankle-${i}`,l.end,add(l.end,[0,-.8,0]),[[0,...ankle],[1,Math.min(width,ankle[0]),Math.min(length*.28,ankle[1])]],6);
  }
 }
 const colors={skin:'#8e634b',scalp:'#29221b',brow:'#29221b',beard:'#29221b',iris:'#624329',mouth:'#93604f'};
 const head=buildHeadMesh3d({...a,hairstyle:'shaved',facialHair:'clean'},colors,{rings:32,slices:48,headOnly:true}),skin=head.parts.find(p=>p.name==='skin'),base=vertices.length/6,scale=pose.skullHeight/(head.anatomy.chinY-head.anatomy.crownY),top=add(pose.shoulder,mul(up,1.5+pose.skullHeight));
 const crownY=151-head.anatomy.crownY,headDepth=forward,headVertices=33*49;
 for(let i=0;i<headVertices*10;i+=10){const v=head.vertices.subarray(i,i+6),p=add(top,add(mul(torsoBasis.lateral,v[0]*scale),add(mul(up,(v[1]-crownY)*scale),mul(headDepth,v[2]*scale)))),n=add(mul(torsoBasis.lateral,v[3]),add(mul(up,v[4]),mul(headDepth,v[5])));vertices.push(...p,...unit(n));}
 const firstIndex=indices.length;for(let i=skin.firstIndex;i<skin.firstIndex+skin.indexCount;i++)indices.push(base+head.indices[i]);parts.push({name:'skull-skin',firstIndex,indexCount:indices.length-firstIndex,startVertex:base,vertexCount:headVertices});
 if(vertices.length/6>=65535||vertices.some(v=>!Number.isFinite(v)))throw Error('Body mesh outside bounded finite budget');
 return{vertices:new Float32Array(vertices),indices:new Uint16Array(indices),parts,pose,units:'inches',status:'surface-experiment-not-production-or-union-fit',provenance:{handDepth:'artistic .28 palm breadth',footHeight:'artistic2.5in; anatomical placeholder distinct from footwear',headScale:'same physical skull-height fit as dossier',grossPartsOverlap:true,wholeUnionMassVerified:false}};
}
export function createBodyRenderer3d(canvas,{verticalSpanInches=160,floorMarginInches=8}={}){
 if(!Number.isFinite(verticalSpanInches)||verticalSpanInches<=0||!Number.isFinite(floorMarginInches)||floorMarginInches<0||floorMarginInches>=verticalSpanInches/2)throw Error('Invalid physical body camera');
 const gl=canvas.getContext('webgl',{alpha:false,antialias:true,preserveDrawingBuffer:true});if(!gl)throw Error('WebGL unavailable');
 const shader=(kind,text)=>{const s=gl.createShader(kind);gl.shaderSource(s,text);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
 const vs=shader(gl.VERTEX_SHADER,'attribute vec3 p;attribute vec3 n;uniform vec2 rotation;uniform vec2 extent;uniform float floorMargin;varying vec3 normal;void main(){vec3 q=vec3(p.x*rotation.x+p.z*rotation.y,p.y,-p.x*rotation.y+p.z*rotation.x);normal=vec3(n.x*rotation.x+n.z*rotation.y,n.y,-n.x*rotation.y+n.z*rotation.x);gl_Position=vec4(q.x/extent.x,(q.y-(extent.y-floorMargin))/extent.y,-q.z/100.,1.);}');
 const fs=shader(gl.FRAGMENT_SHADER,`precision highp float;varying vec3 normal;${characterSurfaceLightingGlsl}void main(){gl_FragColor=vec4(characterSurfaceLight(vec3(.60,.61,.58),normalize(normal),0.),1.);}`);
 const program=gl.createProgram();gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
 const vb=gl.createBuffer(),ib=gl.createBuffer();let disposed=false;
 return{draw(mesh,angle=0){if(disposed||!Number.isFinite(angle))throw Error('Invalid body renderer');gl.viewport(0,0,canvas.width,canvas.height);gl.clearColor(.065,.10,.12,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.enable(gl.DEPTH_TEST);gl.useProgram(program);gl.bindBuffer(gl.ARRAY_BUFFER,vb);gl.bufferData(gl.ARRAY_BUFFER,mesh.vertices,gl.STATIC_DRAW);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,mesh.indices,gl.STATIC_DRAW);for(const[name,offset]of[['p',0],['n',12]]){const at=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(at);gl.vertexAttribPointer(at,3,gl.FLOAT,false,24,offset);}gl.uniform2f(gl.getUniformLocation(program,'rotation'),Math.cos(angle),Math.sin(angle));gl.uniform2f(gl.getUniformLocation(program,'extent'),verticalSpanInches/2*canvas.width/canvas.height,verticalSpanInches/2);gl.uniform1f(gl.getUniformLocation(program,'floorMargin'),floorMarginInches);gl.drawElements(gl.TRIANGLES,mesh.indices.length,gl.UNSIGNED_SHORT,0);if(gl.getError()!==gl.NO_ERROR)throw Error('Body WebGL draw failed');},dispose(){if(disposed)return;disposed=true;gl.deleteBuffer(vb);gl.deleteBuffer(ib);gl.deleteProgram(program);gl.deleteShader(vs);gl.deleteShader(fs);}};
}
