import {buildPlayerBodyMesh3d} from './playerBody3d.js';
import {estimateTriangleUnionVolume} from './triangleSolidVolume.js';

// Test-support experimental fitting, not a frame decoder or a runtime requirement.
// Existing saves, measured bone centers and simulation random streams are fixed.
export function fitPlayerBodyMeshMass(player,{resolution=128,tolerance=.003,maxIterations=8}={}){
 const weight=player?.visualFrame?.weightLbs;
 if(!Number.isFinite(weight)||weight<=0)throw Error('Mass fit requires supported frame weight');
 if(!Number.isFinite(tolerance)||tolerance<=0||tolerance>.05||!Number.isInteger(maxIterations)||maxIterations<1||maxIterations>20)throw Error('Invalid mass fit controls');
 const targetVolumeInches3=weight*.45359237*1000/16.387064,iterations=[];let bulkScale=1,mesh,volume;
 for(let i=0;i<maxIterations;i++){
  mesh=buildPlayerBodyMesh3d(player,{bulkScale});if(!mesh)return null;
  volume=estimateTriangleUnionVolume(mesh,{resolution});
  if(volume.invalidRays||volume.negativeWindingRays)throw Error('Inconsistent volume rays');
  const residual=volume.unionVolume/targetVolumeInches3-1;
  iterations.push({bulkScale,unionVolumeInches3:volume.unionVolume,residual});
  if(Math.abs(residual)<=tolerance)break;
  bulkScale=Math.max(.3,Math.min(3,bulkScale*Math.sqrt(targetVolumeInches3/volume.unionVolume)));
 }
 // Report the scale actually rendered, not the unexecuted next estimate.
 bulkScale=iterations.at(-1).bulkScale;
 return{mesh,bulkScale,targetVolumeInches3,volume,residual:iterations.at(-1).residual,converged:Math.abs(iterations.at(-1).residual)<=tolerance,iterations,densityKgPerLitre:1,densityStatus:'artistic-proxy-not-measured-tissue',scope:'modeled-clay-components',selfIntersectionsVerified:false};
}
