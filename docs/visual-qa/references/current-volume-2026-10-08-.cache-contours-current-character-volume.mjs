import fs from 'node:fs';import crypto from 'node:crypto';
import {createPlayerCharacterModel} from '../../public/lib/playerCharacter3d.js';
import {playerFrame,playerAppearance} from '../../src/domain/playerIdentity.js';
import {estimateTriangleUnionVolume} from '../../test-support/appearance/triangleSolidVolume.js';
const fixture=JSON.parse(fs.readFileSync('test/fixtures/player-head-pole-case.json'));
const digest=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const cases=[];
for(const weightLbs of [180,240,350,500]){
 const person=structuredClone(fixture.player);Object.assign(person,{heightInches:80,weightLbs});person.appearance=playerAppearance(person);person.visualFrame=playerFrame(person);
 const original=JSON.stringify(person),model=createPlayerCharacterModel(person),state=model.update(),body=state.mesh,skin=model.head.parts.find(p=>p.name==='skin'),placement=state.placement;
 const vertices=Array.from(body.vertices),indices=[],parts=[];
 for(const part of body.parts){if(/^foot-\d-sole/.test(part.name))continue;const firstIndex=indices.length;indices.push(...body.indices.subarray(part.firstIndex,part.firstIndex+part.indexCount));parts.push({...part,firstIndex});}
 const headMap=new Map(),headVertex=index=>{
  if(headMap.has(index))return headMap.get(index);const v=model.head.vertices.subarray(index*10,index*10+6),id=vertices.length/6,crownHeight=151-model.head.anatomy.crownY;
  for(let k=0;k<3;k++)vertices.push(placement.origin[k]+placement.scale*(placement.axes[k]*v[0]+placement.axes[k+3]*(v[1]-crownHeight)+placement.axes[k+6]*v[2]));
  for(let k=0;k<3;k++)vertices.push(placement.axes[k]*v[3]+placement.axes[k+3]*v[4]+placement.axes[k+6]*v[5]);
  headMap.set(index,id);return id;
 };
 const firstIndex=indices.length;for(let i=skin.firstIndex;i<skin.firstIndex+skin.indexCount;i++)indices.push(headVertex(model.head.indices[i]));parts.push({name:'actual-head-skin',firstIndex,indexCount:indices.length-firstIndex});
 const mesh={vertices:new Float64Array(vertices),indices:new Uint32Array(indices),parts,units:'inches'},target=weightLbs*.45359237*1000/16.387064;
 const estimates=[];for(const axis of [0,2]){const value=estimateTriangleUnionVolume(mesh,{resolution:96,axis});estimates.push({axis,resolution:value.resolution,unionVolume:value.unionVolume,grossVolume:value.grossVolume,residual:value.unionVolume/target-1,invalidRays:value.invalidRays,negativeWindingRays:value.negativeWindingRays,componentCount:value.componentCount});}
 if(JSON.stringify(person)!==original)throw Error('Diagnostic changed person');
 cases.push({heightInches:80,weightLbs,targetArtisticVolumeInches3:target,estimates});model.dispose();
}
const report={schemaVersion:1,recordedAt:new Date().toISOString(),scope:'Current production neutral body plus actual complete-head skin shell; no external soles. Artistic 1kg/litre proxy, not measured tissue. Open eye/lid/ear details and hair are excluded; shader apertures are not solid booleans. This is not complete rendered-body or physical-mass acceptance.',sourceHashes:Object.fromEntries(['public/lib/playerBody3d.js','public/lib/playerBodyAnimation3d.js','public/lib/playerCharacter3d.js','public/lib/playerHead3d.js','src/domain/playerMeasurements.js','test-support/appearance/triangleSolidVolume.js','.cache/contours/current-character-volume.mjs'].map(p=>[p,digest(p)])),cases,wholeUnionMassVerified:false,fullVisualAcceptance:false};
fs.writeFileSync('.cache/contours/current-character-volume.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(cases));
