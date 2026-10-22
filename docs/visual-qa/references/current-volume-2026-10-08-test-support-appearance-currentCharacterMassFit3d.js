// Current-renderer research adapter. This is not a runtime tissue model.
// The actual head skin shell is transformed through the character authority;
// open eye/ear/lid surfaces, hair and external soles are explicitly excluded.
import {createPlayerCharacterModel,characterHeadPlacement} from '../../public/lib/playerCharacter3d.js';
import {buildPlayerBodyMesh3d} from '../../public/lib/playerBody3d.js';
import {estimateTriangleUnionVolume} from './triangleSolidVolume.js';

export function createCurrentCharacterVolumeProxy(player){
 const model=createPlayerCharacterModel(player);if(!model)return null;
 const skin=model.head.parts.find(p=>p.name==='skin');let disposed=false;
 return{
  build({bulkScale=1,mode='neutral',phase=0}={}){
   if(disposed)throw Error('Disposed character volume proxy');
   const body=buildPlayerBodyMesh3d(model.person,{bulkScale,includeSkull:false,mode,phase});
   const placement=characterHeadPlacement(body.pose,model.head.anatomy),vertices=Array.from(body.vertices),indices=[],parts=[];
   for(const part of body.parts){
    if(/^foot-\d-sole/.test(part.name))continue;
    const firstIndex=indices.length;indices.push(...body.indices.subarray(part.firstIndex,part.firstIndex+part.indexCount));parts.push({...part,firstIndex});
   }
   const headMap=new Map(),headVertex=index=>{
    if(headMap.has(index))return headMap.get(index);
    const v=model.head.vertices.subarray(index*10,index*10+6),id=vertices.length/6,crownHeight=151-model.head.anatomy.crownY;
    // Production's physical camera subtracts local crown height first.
    for(let k=0;k<3;k++)vertices.push(placement.origin[k]+placement.scale*(placement.axes[k]*v[0]+placement.axes[k+3]*(v[1]-crownHeight)+placement.axes[k+6]*v[2]));
    for(let k=0;k<3;k++)vertices.push(placement.axes[k]*v[3]+placement.axes[k+3]*v[4]+placement.axes[k+6]*v[5]);
    headMap.set(index,id);return id;
   };
   const firstIndex=indices.length;for(let i=skin.firstIndex;i<skin.firstIndex+skin.indexCount;i++)indices.push(headVertex(model.head.indices[i]));
   parts.push({name:'actual-head-skin',firstIndex,indexCount:indices.length-firstIndex});
   return{vertices:new Float64Array(vertices),indices:new Uint32Array(indices),parts,units:'inches',pose:body.pose,placement,excluded:{externalSoles:true,headDetailParts:model.head.parts.filter(p=>p.name!=='skin').map(p=>p.name),shaderAperturesNotBoolean:true},wholeRenderedMassVerified:false};
  },
  dispose(){if(disposed)return;disposed=true;model.dispose();}
 };
}

export function fitCurrentCharacterVolumeProxy(player,{resolution=64,axis=2,tolerance=.004,maxIterations=10}={}){
 const weight=player?.visualFrame?.weightLbs;
 if(!Number.isFinite(weight)||weight<=0||!Number.isFinite(tolerance)||tolerance<=0||tolerance>.05||!Number.isInteger(maxIterations)||maxIterations<1||maxIterations>20)throw Error('Invalid current character fit');
 const proxy=createCurrentCharacterVolumeProxy(player);if(!proxy)return null;
 const targetVolumeInches3=weight*.45359237*1000/16.387064,iterations=[];let bulkScale=1,mesh,volume;
 try{
  for(let i=0;i<maxIterations;i++){
   mesh=proxy.build({bulkScale});volume=estimateTriangleUnionVolume(mesh,{resolution,axis});
   if(volume.invalidRays||volume.negativeWindingRays)throw Error('Inconsistent current character rays');
   const residual=volume.unionVolume/targetVolumeInches3-1;iterations.push({bulkScale,volumeInches3:volume.unionVolume,residual});
   if(Math.abs(residual)<=tolerance)break;
   bulkScale=Math.max(.3,Math.min(3,bulkScale*Math.sqrt(targetVolumeInches3/volume.unionVolume)));
  }
  const last=iterations.at(-1);
  return{mesh,bulkScale:last.bulkScale,targetVolumeInches3,volume,residual:last.residual,converged:Math.abs(last.residual)<=tolerance,iterations,densityKgPerLitre:1,scope:'current body and actual head-skin shell under artistic density; source section breadth/depth are scaled estimates in this experiment',fixedSkeleton:true,wholeRenderedMassVerified:false,runtimeAdoptionAccepted:false};
 }finally{proxy.dispose();}
}
