// Proprietary measured body for the dossier's shared character renderer.
// Inches and saved bone centers define one camera-independent mesh. Complete
// anatomical craft and union-mass calibration remain unverified.
import {neutralMeasuredPose,renderableIndividualAnatomy,projectedLimbSections,projectedTorsoSections} from './physiqueGeometryContract.js';
import {buildHeadMesh3d} from './playerHead3d.js';
import {solvePlayerMotion} from './playerMotion.js';
import {estimatedPalmBreadth} from './playerHand.js';
import {characterSurfaceLightingGlsl} from './playerSurfaceLighting.js';
import {createLimbSweepRecipe,writeLimbSweepVertices,limbSweepIndices} from './playerLimbSweep3d.js';
import {createTorsoProfile,sampleTorsoProfile} from './playerTorsoSurface3d.js';
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
 const vertices=[],indices=[],parts=[],sweeps=[];
 const surface=(name,point,center,rows=24,columns=32)=>{
  const startVertex=vertices.length/6,firstIndex=indices.length;
  const differential=(u,v)=>{const e=.0001,p=point(u,v),du=sub(point(u+e,v),point(u-e,v)),dv=sub(point(u,v+e),point(u,v-e));return{p,n:cross(dv,du),out:sub(p,center(u,v))};};
  const probe=differential(.23,.51),orientation=dot(probe.n,probe.out)<0?-1:1;
  // Collapsed cap centers and ellipsoid poles have no differential cross
  // product. Their explicit center supplies the outward limiting direction;
  // a global up normal would remain fixed while the articulated part rotates.
  for(let r=0;r<=rows;r++)for(let c=0;c<=columns;c++){const {p,n,out}=differential(c/columns,r/rows),normal=Math.hypot(...n)<1e-10&&Math.hypot(...out)>=1e-10?unit(out):mul(unit(n),orientation);vertices.push(...p,...normal);}
  for(let r=0;r<rows;r++)for(let c=0;c<columns;c++){const p=startVertex+r*(columns+1)+c,q=p+1,s=p+columns+1,t=s+1;indices.push(...(orientation===1?[p,s,q,q,s,t]:[p,q,s,q,t,s]));}
  parts.push({name,firstIndex,indexCount:indices.length-firstIndex,startVertex,vertexCount:vertices.length/6-startVertex});
 };
 const ellipsoid=(name,center,axes,b)=>surface(name,(u,v)=>{const theta=u*2*Math.PI,phi=clamp(v,0,1)*Math.PI;return add(center,add(mul(b.lateral,axes[0]*Math.sin(phi)*Math.cos(theta)),add(mul(b.d,axes[1]*Math.cos(phi)),mul(b.depth,axes[2]*Math.sin(phi)*Math.sin(theta)))));},()=>center,16,32);
 const tube=(name,start,end,sections,rows=24,frontal=false,providedBasis=null)=>{
  const b=providedBasis??basis(sub(end,start),frontal),at=t=>add(start,mul(sub(end,start),clamp(t,0,1)));
  surface(name,(u,v)=>{const t=clamp(v,0,1),[w,d]=sample(sections,t),angle=u*2*Math.PI;return add(at(t),add(mul(b.lateral,w/2*Math.cos(angle)),mul(b.depth,d/2*Math.sin(angle))));},(u,v)=>at(v),rows,32);
  for(const [label,t,sign]of[['start',0,-1],['end',1,1]]){
   const [w,d]=sample(sections,t),center=at(t);
   surface(name+'-'+label,(u,v)=>add(center,add(mul(b.lateral,w/2*clamp(v,0,1)*Math.cos(u*2*Math.PI)),mul(b.depth,d/2*clamp(v,0,1)*Math.sin(u*2*Math.PI)))),()=>sub(center,mul(b.d,sign)),1,32);
  }
  return b;
 };
 const torsoBasis=basis(sub(pose.hip,pose.shoulder));
 const up=unit(sub(pose.shoulder,pose.hip)),neckTop=add(pose.shoulder,mul(up,3));
 const forward=unit(cross(torsoBasis.lateral,up)),pelvis=f.torsoSections.at(-1),torsoLength=Math.hypot(...sub(pose.hip,pose.shoulder));
 const torsoProfile=createTorsoProfile(f.torsoSections,torsoLength,f.neckDiameterInches),torsoRows=torsoProfile.rows;
 const torsoY=v=>{const q=clamp(v,0,1)*(torsoRows.length-1),i=Math.min(torsoRows.length-2,Math.floor(q));return torsoRows[i][0]+(torsoRows[i+1][0]-torsoRows[i][0])*(q-i);};
 const torsoAt=y=>add(pose.shoulder,mul(up,-y));
 // One skin/garment envelope removes the internal shoulder-level cap.
 // Every saved section is an emitted ring, including the chest landmark.
 surface('torso',(u,v)=>{const y=torsoY(v),[w,d]=sampleTorsoProfile(torsoProfile,y);return add(torsoAt(y),add(mul(torsoBasis.lateral,w/2*Math.cos(u*2*Math.PI)),mul(forward,d/2*Math.sin(u*2*Math.PI))));},(u,v)=>torsoAt(torsoY(v)),(torsoRows.length-1)*12,32);
 for(const [label,y,sign]of[['start',-1.5,1],['end',torsoLength,-1]]){
  const [w,d]=sampleTorsoProfile(torsoProfile,y),center=torsoAt(y);
  surface('torso-'+label,(u,v)=>add(center,add(mul(torsoBasis.lateral,w/2*clamp(v,0,1)*Math.cos(u*2*Math.PI)),mul(forward,d/2*clamp(v,0,1)*Math.sin(u*2*Math.PI)))),()=>sub(center,mul(up,sign)),1,32);
 }
 ellipsoid('pelvic-envelope',add(pose.hip,mul(up,-1)),[pelvis[1]/2,Math.min(3.5,f.heightInches*.04),pelvis[2]/2],{d:up,lateral:torsoBasis.lateral,depth:forward});
 tube('neck',pose.shoulder,neckTop,[[0,f.neckDiameterInches,f.neckDiameterInches],[1,f.neckDiameterInches*.70,f.neckDiameterInches*.70]],12);
 const frontal=pose.mode==='neutral'||pose.mode==='cut';
 for(const kind of ['arm','leg'])for(const [i,l]of pose[kind==='arm'?'arms':'legs'].entries()){
  const sections=f[kind==='arm'?'armSections':'legSections'],joint=kind==='arm'?f.upperArmShare:f.upperLegShare;
  const recipe=createLimbSweepRecipe(sections,joint),name=`${kind}-${i}-sweep`,startVertex=vertices.length/6,firstIndex=indices.length,surfaceVertices=new Float32Array(recipe.vertexCount*6);
  writeLimbSweepVertices(surfaceVertices,0,recipe,l,frontal);vertices.push(...surfaceVertices);indices.push(...limbSweepIndices(recipe,startVertex));parts.push({name,firstIndex,indexCount:indices.length-firstIndex,startVertex,vertexCount:recipe.vertexCount});sweeps.push({name,kind,side:i,startVertex,recipe});
  if(kind==='arm'){
   const root=sample(sections,0),rootBasis=basis(sub(l.joint,l.root),frontal);
   // A deltoid's bulk falls below the shoulder joint rather than forming
   // a symmetric ball above it. These offsets are artistic contour choices;
   // the measured arm sweep, joint center and maximum breadth remain fixed.
   ellipsoid(`arm-${i}-root`,add(l.root,mul(rootBasis.d,root[0]*.22)),[root[0]/2,root[0]*.36,root[1]/2],rootBasis);
   const b=basis(sub(l.hand,l.end),frontal),palmWidth=estimatedPalmBreadth(f.handSizeInches,1);
   if((frontal&&i===1)||(!frontal&&i===0)){b.lateral=mul(b.lateral,-1);b.depth=mul(b.depth,-1);}
   // One capped palm includes the wrist transition and finger webs. Depth
   // and relaxed finger curl are artistic estimates, not measured tissue.
   const wrist=sample(sections,1);
   tube(`hand-${i}-palm`,l.end,add(l.end,mul(b.d,pose.handLength*.63)),[[0,...wrist],[.25,palmWidth*.85,palmWidth*.28],[2/3,palmWidth,palmWidth*.25],[1,palmWidth*.90,palmWidth*.20]],24,frontal,b);
   ellipsoid(`hand-${i}-thenar`,add(l.end,add(mul(b.d,pose.handLength*.30),mul(b.lateral,-palmWidth*.24))),[palmWidth*.25,pose.handLength*.23,palmWidth*.18],b);
   for(const [finger,offset,tip]of[[0,-.32,.91],[1,0,1],[2,.22,.96],[3,.41,.84]]){
    const start=add(l.end,add(mul(b.d,pose.handLength*.52),mul(b.lateral,palmWidth*offset))),length=pose.handLength*(tip-.52),mid=add(start,mul(b.d,length/2));
    surface(`hand-${i}-finger-${finger}`,(u,v)=>{
     const t=clamp(v,0,1),angle=u*Math.PI*2,r=(t===0||t===1)?0:Math.sqrt(Math.max(0,Math.sin(Math.PI*t)))*(1-.15*t),curl=palmWidth*.045*Math.sin(Math.PI*t)**2;
     const center=add(start,add(mul(b.d,length*t),mul(b.depth,curl)));
     return add(center,add(mul(b.lateral,palmWidth*.09*r*Math.cos(angle)),mul(b.depth,palmWidth*.075*r*Math.sin(angle))));
    },()=>mid,24,24);
   }
   const thumbAxis=unit(add(mul(b.d,.75),mul(b.lateral,-.65))),thumbCenter=add(l.end,add(mul(b.d,pose.handLength*.37),mul(b.lateral,-palmWidth*.57)));
   ellipsoid(`hand-${i}-thumb`,thumbCenter,[palmWidth*.13,pose.handLength*.15,palmWidth*.12],basis(thumbAxis,frontal));
  }else{
   const length=f.footLengthInches,width=f.footWidthInches;
   if(![length,width].every(Number.isFinite))return null;
   const footSections=[[0,0,0],[.18,width*.65,2.25],[.32,width*.75,2.5],[.66,width,1.3],[.87,width*.9,1.1],[1,0,0]];
   const footCenter=t=>{const [,height]=sample(footSections,t);return add(l.end,[0,-2.5+height/2,length*(t-.27)]);};
   surface(`foot-${i}`,(u,v)=>{const t=clamp(v,0,1),[w,h]=sample(footSections,t);return add(footCenter(t),[w/2*Math.cos(u*2*Math.PI),h/2*Math.sin(u*2*Math.PI),0]);},(u,v)=>footCenter(clamp(v,0,1)),32,32);
   // The external sole retains the anatomical footprint and floor contact.
   // It is not part of the biological mass proxy.
   tube(`foot-${i}-sole`,add(l.end,[0,-2.39,-length*.27]),add(l.end,[0,-2.39,length*.73]),footSections.map(([t,w])=>[t,w,w?Math.min(.22,w/width*.4):0]),32);
   const ankle=sample(sections,1);
   tube(`ankle-${i}`,l.end,add(l.end,[0,-.8,0]),[[0,...ankle],[1,Math.min(width,ankle[0]),Math.min(length*.28,ankle[1])]],6);
  }
 }
 if(options.includeSkull!==false){
 const colors={skin:'#8e634b',scalp:'#29221b',brow:'#29221b',beard:'#29221b',iris:'#624329',mouth:'#93604f'};
 const head=buildHeadMesh3d({...a,hairstyle:'shaved',facialHair:'clean'},colors,{rings:32,slices:48,headOnly:true}),skin=head.parts.find(p=>p.name==='skin'),base=vertices.length/6,scale=pose.skullHeight/(head.anatomy.chinY-head.anatomy.crownY),top=add(pose.shoulder,mul(up,1.5+pose.skullHeight));
 const crownY=151-head.anatomy.crownY,headDepth=forward,headVertices=33*49;
 for(let i=0;i<headVertices*10;i+=10){const v=head.vertices.subarray(i,i+6),p=add(top,add(mul(torsoBasis.lateral,v[0]*scale),add(mul(up,(v[1]-crownY)*scale),mul(headDepth,v[2]*scale)))),n=add(mul(torsoBasis.lateral,v[3]),add(mul(up,v[4]),mul(headDepth,v[5])));vertices.push(...p,...unit(n));}
 const firstIndex=indices.length;for(let i=skin.firstIndex;i<skin.firstIndex+skin.indexCount;i++)indices.push(base+head.indices[i]);parts.push({name:'skull-skin',firstIndex,indexCount:indices.length-firstIndex,startVertex:base,vertexCount:headVertices});
 }
 if(vertices.length/6>=65535||vertices.some(v=>!Number.isFinite(v)))throw Error('Body mesh outside bounded finite budget');
 return{vertices:new Float32Array(vertices),indices:new Uint16Array(indices),parts,sweeps,pose,units:'inches',status:'measured-surface-full-craft-and-union-fit-open',provenance:{handDepth:'artistic palm .20-.28 estimated breadth; wrist uses saved distal sections',fingerCurl:'artistic relaxed .045 palm breadth; longest fingertip stays measured',externalParts:['foot-0-sole','foot-1-sole'],footHeight:'artistic2.5in; anatomical placeholder distinct from footwear',headScale:'same physical skull-height fit as dossier',grossPartsOverlap:true,wholeUnionMassVerified:false}};
}
export function armSleeveDrawRanges(part,sweep){
 const {times,columns,joint}=sweep.recipe;
 const ring=times.findLastIndex(t=>t<=joint*.26),sleeveCount=ring*columns*6,sideCount=(times.length-1)*columns*6,capCount=columns*3;
 if(ring<0||part.indexCount!==sideCount+capCount*2)throw Error('Invalid sleeve topology');
 return[{firstIndex:part.firstIndex,indexCount:sleeveCount,kit:true},{firstIndex:part.firstIndex+sleeveCount,indexCount:sideCount-sleeveCount,kit:false},{firstIndex:part.firstIndex+sideCount,indexCount:capCount,kit:true},{firstIndex:part.firstIndex+sideCount+capCount,indexCount:capCount,kit:false}];
}
export function createBodyDrawPlan(mesh){
 const arms=new Map(mesh.sweeps.filter(s=>s.kind==='arm').map(s=>[s.name,s])),draws=[];
 const append=(firstIndex,indexCount,material,leg=null)=>{
  if(!indexCount)return;const previous=draws.at(-1);
  // Merge only adjacent indices with identical shader inputs. This keeps
  // triangle order, depth ties and material boundaries exactly unchanged.
  if(previous&&previous.material===material&&previous.leg===leg&&previous.firstIndex+previous.indexCount===firstIndex)previous.indexCount+=indexCount;
  else draws.push({firstIndex,indexCount,material,leg});
 };
 for(const part of mesh.parts){
  if(part.name==='skull-skin')continue;
  const sleeve=arms.get(part.name);
  if(sleeve){for(const r of armSleeveDrawRanges(part,sleeve))append(r.firstIndex,r.indexCount,r.kit?'kit':'skin');continue;}
  const leg=part.name.match(/^leg-(\d)-(upper|sweep)/),kit=part.name.startsWith('torso')||part.name.startsWith('shoulder-yoke')||part.name==='pelvic-envelope'||/^arm-\d-root$/.test(part.name);
  append(part.firstIndex,part.indexCount,kit?'kit':/^foot-\d-sole/.test(part.name)?'sole':part.name.startsWith('foot-')?'shoe':'skin',leg?Number(leg[1]):null);
 }
 return draws;
}
export function createBodyRenderer3d(canvas,{verticalSpanInches=160,floorMarginInches=8,skinColor=null,kitColor='#236072'}={}){
 if(!Number.isFinite(verticalSpanInches)||verticalSpanInches<=0||!Number.isFinite(floorMarginInches)||floorMarginInches<0||floorMarginInches>=verticalSpanInches/2)throw Error('Invalid physical body camera');
 const gl=canvas.getContext('webgl',{alpha:!!skinColor,antialias:!skinColor,premultipliedAlpha:false,preserveDrawingBuffer:true});if(!gl)throw Error('WebGL unavailable');
 const shader=(kind,text)=>{const s=gl.createShader(kind);gl.shaderSource(s,text);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
 const vs=shader(gl.VERTEX_SHADER,'attribute vec3 p;attribute vec3 n;uniform vec2 rotation;uniform vec2 extent;uniform float centerY;uniform float centerX;uniform vec3 boneRoot;uniform vec3 boneAxis;varying float segmentT;varying vec3 normal;void main(){vec3 q=vec3(p.x*rotation.x+p.z*rotation.y,p.y,-p.x*rotation.y+p.z*rotation.x);normal=vec3(n.x*rotation.x+n.z*rotation.y,n.y,-n.x*rotation.y+n.z*rotation.x);segmentT=dot(p-boneRoot,boneAxis);gl_Position=vec4((q.x-centerX)/extent.x,(q.y-centerY)/extent.y,-q.z/100.,1.);}');
 const fs=shader(gl.FRAGMENT_SHADER,`precision highp float;varying vec3 normal;varying float segmentT;uniform vec3 pigment;uniform vec3 kit;uniform float shorts;${characterSurfaceLightingGlsl}void main(){vec3 color=shorts>.5&&segmentT<.43?kit:pigment;gl_FragColor=vec4(characterSurfaceLight(color,normalize(normal),0.),1.);}`);
 const program=gl.createProgram();gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
 const vb=gl.createBuffer(),ib=gl.createBuffer(),drawPlans=new WeakMap();let disposed=false,vertexBytes=0,uploadedIndices=null;
 const locations=new Map(),location=name=>{if(!locations.has(name))locations.set(name,gl.getUniformLocation(program,name));return locations.get(name);};
 const rgb=color=>{if(!/^#[0-9a-f]{6}$/i.test(color))throw Error('Invalid body pigment');return[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)/255);};
 const skin=skinColor?rgb(skinColor):[.60,.61,.58],kit=rgb(kitColor),shoe=rgb('#263841'),sole=rgb('#82929c');
 return{draw(mesh,angle=0,camera={}){
  if(disposed||!Number.isFinite(angle)||gl.isContextLost())throw Error('Invalid body renderer');
  const span=camera.verticalSpanInches??verticalSpanInches,margin=camera.floorMarginInches??floorMarginInches,cx=camera.centerX??0;
  if(![span,margin,cx].every(Number.isFinite)||span<=0||margin<0||margin>=span/2)throw Error('Invalid body camera');
  gl.viewport(0,0,canvas.width,canvas.height);gl.clearColor(skinColor?0:.065,skinColor?0:.10,skinColor?0:.12,skinColor?0:1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.enable(gl.DEPTH_TEST);gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER,vb);if(vertexBytes!==mesh.vertices.byteLength){gl.bufferData(gl.ARRAY_BUFFER,mesh.vertices,gl.DYNAMIC_DRAW);vertexBytes=mesh.vertices.byteLength;}else gl.bufferSubData(gl.ARRAY_BUFFER,0,mesh.vertices);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib);if(uploadedIndices!==mesh.indices){gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,mesh.indices,gl.STATIC_DRAW);uploadedIndices=mesh.indices;}
  for(const[name,offset]of[['p',0],['n',12]]){const at=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(at);gl.vertexAttribPointer(at,3,gl.FLOAT,false,24,offset);}
  const extent=camera.extent??[span/2*canvas.width/canvas.height,span/2];if(extent.length!==2||!extent.every(v=>Number.isFinite(v)&&v>0))throw Error('Invalid body extent');
  gl.uniform2f(location('rotation'),Math.cos(angle),Math.sin(angle));gl.uniform2fv(location('extent'),extent);gl.uniform1f(location('centerY'),span/2-margin);gl.uniform1f(location('centerX'),cx);gl.uniform3fv(location('kit'),kit);gl.uniform3f(location('boneRoot'),0,0,0);gl.uniform3f(location('boneAxis'),0,0,0);gl.uniform1f(location('shorts'),0);
  if(!skinColor){gl.uniform3fv(location('pigment'),skin);gl.drawElements(gl.TRIANGLES,mesh.indices.length,gl.UNSIGNED_SHORT,0);}
  else{
   let plan=drawPlans.get(mesh);if(!plan){plan=createBodyDrawPlan(mesh);drawPlans.set(mesh,plan);}
   for(const draw of plan){
    gl.uniform3fv(location('pigment'),draw.material==='kit'?kit:draw.material==='shoe'?shoe:draw.material==='sole'?sole:skin);gl.uniform1f(location('shorts'),draw.leg!==null?1:0);
    if(draw.leg!==null){const l=mesh.pose.legs[draw.leg],axis=sub(l.joint,l.root),length2=dot(axis,axis);gl.uniform3fv(location('boneRoot'),l.root);gl.uniform3fv(location('boneAxis'),mul(axis,1/length2));}
    gl.drawElements(gl.TRIANGLES,draw.indexCount,gl.UNSIGNED_SHORT,draw.firstIndex*2);
   }
  }
  if(gl.getError()!==gl.NO_ERROR)throw Error('Body WebGL draw failed');
 },dispose(){if(disposed)return;disposed=true;gl.deleteBuffer(vb);gl.deleteBuffer(ib);gl.deleteProgram(program);gl.deleteShader(vs);gl.deleteShader(fs);}};
}
