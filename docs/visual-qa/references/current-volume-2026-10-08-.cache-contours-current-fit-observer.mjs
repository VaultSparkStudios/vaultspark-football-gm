import fs from 'node:fs';import crypto from 'node:crypto';import assert from 'node:assert/strict';
import {fitCurrentCharacterVolumeProxy} from '../../test-support/appearance/currentCharacterMassFit3d.js';
import {estimateTriangleUnionVolume} from '../../test-support/appearance/triangleSolidVolume.js';
import {playerFrame,playerAppearance} from '../../src/domain/playerIdentity.js';
const fixture=JSON.parse(fs.readFileSync('test/fixtures/player-head-pole-case.json')),cases=[];
for(const weightLbs of [180,240,350,500]){
 const p=structuredClone(fixture.player);Object.assign(p,{heightInches:80,weightLbs});p.appearance=playerAppearance(p);p.visualFrame=playerFrame(p);const before=JSON.stringify(p),start=performance.now();
 const fit=fitCurrentCharacterVolumeProxy(p,{resolution:64,tolerance:.003,maxIterations:10}),cpuMs=performance.now()-start;
 const checks=[0,2].map(axis=>{const v=estimateTriangleUnionVolume(fit.mesh,{resolution:128,axis});return{axis,resolution:128,unionVolume:v.unionVolume,residual:v.unionVolume/fit.targetVolumeInches3-1,invalidRays:v.invalidRays,negativeWindingRays:v.negativeWindingRays};});
 assert.equal(fit.converged,true);assert.ok(checks.every(c=>!c.invalidRays&&!c.negativeWindingRays));assert.equal(JSON.stringify(p),before);
 cases.push({heightInches:80,weightLbs,bulkScale:fit.bulkScale,iterations:fit.iterations,fitResidual:fit.residual,cpuMs,checks,excluded:fit.mesh.excluded});
}
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const inputs=['test-support/appearance/currentCharacterMassFit3d.js','test-support/appearance/triangleSolidVolume.js','test/current-character-mass-fit.test.js','.cache/contours/current-fit-observer.mjs'];
const result={schemaVersion:1,recordedAt:new Date().toISOString(),scope:'Selected current neutral body/actual head-skin artistic-volume fits; no runtime adoption, anatomical mass, all-phase preservation or true-error bound.',inputs:Object.fromEntries(inputs.map(p=>[p,hash(p)])),cases,wholeRenderedMassVerified:false,runtimeAdoptionAccepted:false};
fs.writeFileSync('.cache/contours/current-character-fit-observer.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(cases.map(({excluded,...c})=>c)));
