// Animation foundation for the dossier's measured character. Construct once,
// retain local rigid parts and sweep continuous limbs through saved centers.
// Swept component and intersecting union volumes are not proven invariant
// under articulation. Full anatomical craft and mass accounting remain open.
import {buildPlayerBodyMesh3d,resolveBodySurfacePose} from './playerBody3d.js';
import {estimatedPalmBreadth} from './playerHand.js';
import {writeLimbSweepVertices} from './playerLimbSweep3d.js';
import {playerFootFrame} from './playerFootArticulation.js';
const sub=(a,b)=>a.map((v,i)=>v-b[i]),add=(a,b)=>a.map((v,i)=>v+b[i]),mul=(a,s)=>a.map(v=>v*s);
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=a=>{const n=Math.hypot(...a);if(n<1e-10)throw Error('Degenerate body part frame');return mul(a,1/n);};
function basis(axis,frontal=false){const d=unit(axis),ref=Math.abs(d[0])<.9?[1,0,0]:[0,0,1],lateral=frontal?unit(cross(d,[0,0,1])):unit(sub(ref,mul(d,dot(ref,d))));return{d,lateral,depth:unit(cross(lateral,d))};}
const frame=(origin,b)=>({origin,axes:[b.lateral,b.d,b.depth]});
function partFrames(pose,f){
 const frames=new Map(),up=unit(sub(pose.shoulder,pose.hip)),tb=basis(sub(pose.hip,pose.shoulder)),torso=frame(pose.shoulder,{lateral:tb.lateral,d:up,depth:unit(cross(tb.lateral,up))});
 for(const name of['torso','shoulder-yoke','pelvic-envelope','neck','skull-skin'])frames.set(name,torso);
 const frontal=pose.mode==='neutral'||pose.mode==='cut';
 for(const kind of['arm','leg'])for(const[i,l]of pose[kind==='arm'?'arms':'legs'].entries()){
  if(kind==='leg'){
   const foot=playerFootFrame(l,f,pose.mode),world=frame(l.end,foot);frames.set(`foot-${i}`,world);frames.set(`foot-${i}-sole`,world);frames.set(`ankle-${i}`,world);continue;
  }
  frames.set(`arm-${i}-root`,frame(l.root,basis(sub(l.joint,l.root),frontal)));
  const b=basis(sub(l.hand,l.end),frontal);frames.set(`wrist-${i}`,frame(l.end,b));
  if((frontal&&i===1)||(!frontal&&i===0)){b.lateral=mul(b.lateral,-1);b.depth=mul(b.depth,-1);}
  const hand=frame(l.end,b);frames.set(`hand-${i}-palm`,hand);frames.set(`hand-${i}-thenar`,hand);for(let j=0;j<4;j++)frames.set(`hand-${i}-finger-${j}`,hand);
  const palm=estimatedPalmBreadth(f.handSizeInches,1),axis=unit(add(mul(b.d,.75),mul(b.lateral,-.65))),center=add(l.end,add(mul(b.d,pose.handLength*.37),mul(b.lateral,-palm*.57)));
  frames.set(`hand-${i}-thumb`,frame(center,basis(axis,frontal)));
 }
 return frames;
}
const authority=player=>JSON.stringify({appearance:player?.appearance,visualFrame:player?.visualFrame,ratings:player?.ratings});
export function createPlayerBodyAnimation3d(player,{bulkScale=1,includeSkull=true}={}){
 const snapshot=structuredClone(player),key=authority(snapshot),mesh=buildPlayerBodyMesh3d(snapshot,{bulkScale,includeSkull});if(!mesh)return null;
 const rest=mesh.vertices.slice(),local=new Float64Array(rest.length),frames=partFrames(mesh.pose,snapshot.visualFrame);
 const sweptNames=new Set(mesh.sweeps.map(s=>s.name));
 const blocks=mesh.parts.filter(part=>!sweptNames.has(part.name)).map(part=>{const name=part.name.replace(/-(start|end)$/,''),f=frames.get(name);if(!f)throw Error('Unbound body surface '+name);
  const start=part.startVertex*6,end=(part.startVertex+part.vertexCount)*6;
  for(let i=start;i<end;i+=6){const p=sub(Array.from(rest.subarray(i,i+3)),f.origin),n=Array.from(rest.subarray(i+3,i+6));for(let j=0;j<3;j++){local[i+j]=dot(p,f.axes[j]);local[i+3+j]=dot(n,f.axes[j]);}}
  return{name,start,end};
 });
 let disposed=false;const check=()=>{if(disposed)throw Error('Disposed body animation');};
 return{
  // Call at person/physical-state changes, not inside every animation frame.
  matchesPlayer(p){check();return authority(p)===key;},
  update({mode='neutral',phase=0}={}){
   check();const pose=resolveBodySurfacePose(snapshot,{mode,phase});if(!pose)throw Error('Unsupported animation pose');
   if(mode==='neutral')mesh.vertices.set(rest);
   else{
    const fs=partFrames(pose,snapshot.visualFrame);
    for(const block of blocks){const f=fs.get(block.name),a=f.axes;
     for(let i=block.start;i<block.end;i+=6)for(let j=0;j<3;j++){
      mesh.vertices[i+j]=f.origin[j]+a[0][j]*local[i]+a[1][j]*local[i+1]+a[2][j]*local[i+2];
      mesh.vertices[i+3+j]=a[0][j]*local[i+3]+a[1][j]*local[i+4]+a[2][j]*local[i+5];
     }
    }
    for(const sweep of mesh.sweeps)writeLimbSweepVertices(mesh.vertices,sweep.startVertex*6,sweep.recipe,pose[sweep.kind==='arm'?'arms':'legs'][sweep.side],pose.mode==='neutral'||pose.mode==='cut');
   }
   mesh.pose=pose;mesh.status='cached-articulated-measured-surface';return mesh;
  },
  diagnostics:{constructionCount:1,vertexCount:mesh.vertices.length/6,triangleCount:mesh.indices.length/3,bulkScale,rigidExtremitiesAndTorso:true,continuousLimbSweeps:true,wholeUnionMassVerified:false},
  dispose(){if(disposed)return;disposed=true;local.fill(0);rest.fill(0);mesh.vertices.fill(0);}
 };
}
