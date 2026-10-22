import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import crypto from 'node:crypto';import {pathToFileURL} from 'node:url';
import {createLimbSweepRecipe,writeLimbSweepVertices} from '../public/lib/playerLimbSweep3d.js';
import {resolveBodySurfacePose} from '../public/lib/playerBody3d.js';import {playerFrame,playerAppearance} from '../src/domain/playerIdentity.js';
const primary=JSON.parse(await fs.readFile('docs/visual-qa/PLAYER_BODY_BATCHING_2026-10-08.json','utf8')),row=primary.frozenSources.find(r=>r.original==='public/lib/playerLimbSweep3d.js'),bytes=await fs.readFile('docs/visual-qa/'+row.file);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),row.sha256);
const before=await import(pathToFileURL(path.resolve('docs/visual-qa/'+row.file))),fixture=JSON.parse(await fs.readFile('test/fixtures/player-head-pole-case.json','utf8')).player;
test('scalar limb writer preserves every Float32 position and normal of the frozen bend-safe surface',()=>{
 for(const [height,weight]of [[62,100],[62,650],[96,100],[96,650],[80,180],[80,350],[74,225]]){
  const p=structuredClone(fixture);p.heightInches=height;p.weightLbs=weight;p.appearance=playerAppearance(p);p.visualFrame=playerFrame(p);
  for(const mode of ['neutral','run','acceleration','cut','jump','strength','endurance'])for(const phase of [0,.125,.275,.4,.75,1]){
   const pose=resolveBodySurfacePose(p,{mode,phase}),frontal=mode==='neutral'||mode==='cut';
   for(const kind of ['arm','leg']){const recipe=createLimbSweepRecipe(p.visualFrame[kind+'Sections'],p.visualFrame[kind==='arm'?'upperArmShare':'upperLegShare']);
    for(const limb of pose[kind==='arm'?'arms':'legs']){const a=new Float32Array(recipe.vertexCount*6+12),b=a.slice();a.fill(123);b.fill(123);before.writeLimbSweepVertices(a,6,recipe,limb,frontal);writeLimbSweepVertices(b,6,recipe,limb,frontal);assert.deepEqual(new Uint8Array(b.buffer),new Uint8Array(a.buffer),`${height}/${weight}/${mode}/${phase}/${kind}`);assert.equal(b[0],123);assert.equal(b.at(-1),123);}
   }
  }
 }
});
