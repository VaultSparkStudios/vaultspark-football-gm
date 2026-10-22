import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildHeadMesh3d} from '../public/lib/playerHead3d.js';
const colors={skin:'#8e634b',scalp:'#29221b',brow:'#29221b',beard:'#29221b',iris:'#624329',mouth:'#93604f'};
const values=(mesh,part)=>Array.from(new Set(mesh.indices.subarray(part.firstIndex,part.firstIndex+part.indexCount))).map(i=>Array.from(mesh.vertices.subarray(i*10,i*10+10)));
test('all supported style/texture combinations remain finite and within the existing maximum head-mesh budget',()=>{
 for(const hairstyle of['shaved','buzz','fade','crew','waves','short-curls','coils','afro','side-part','swept','long','locs','braids','receding'])for(const hairTexture of['straight','wavy','curly','coily']){
  const a={hairstyle,hairTexture,hairDensity:1,hairLength:2,hairStrandWidth:1.5,hairCurvature:1.45,hairWaveScale:1.5,facialHair:'full-beard'},raw=structuredClone(a);
  const mesh=buildHeadMesh3d(a,colors,{identitySeed:'max-scalp-proof',headOnly:true});
  assert.deepEqual(a,raw);assert.ok(mesh.vertices.every(Number.isFinite));assert.ok(mesh.vertices.byteLength+mesh.indices.byteLength<1650000,hairstyle+' '+hairTexture);assert.ok(mesh.vertices.length/10<65535);
 }
});
test('braids and locs preserve concealed loose texture while saved thickness still changes their physical volume',()=>{
 for(const hairstyle of['locs','braids']){
  const a={hairstyle,hairTexture:'straight',hairCurvature:.65,hairWaveScale:.65,hairDensity:.8};
  const base=buildHeadMesh3d(a,colors,{identitySeed:'arranged-proof',headOnly:true});
  const treatment=buildHeadMesh3d({...a,hairTexture:'coily',hairCurvature:1.45,hairWaveScale:1.5},colors,{identitySeed:'arranged-proof',headOnly:true});
  assert.deepEqual(base.vertices,treatment.vertices);assert.deepEqual(base.indices,treatment.indices);
  const thick=buildHeadMesh3d({...a,hairStrandWidth:1.5},colors,{identitySeed:'arranged-proof',headOnly:true});assert.notDeepEqual(base.vertices,thick.vertices);
 }
});
test('scalp coverage tapers at the hairline and fade; sparse coverage is separate from strand counts',()=>{
 const sample=(density,hairstyle='side-part')=>{const m=buildHeadMesh3d({hairstyle,hairDensity:density},colors,{identitySeed:'coverage-proof',headOnly:true});return{mesh:m,rows:values(m,m.parts.find(p=>p.name==='scalp-hair'))};};
 const sparse=sample(.1),dense=sample(.9),fade=sample(.9,'fade');
 const coverage=row=>1-(row[9]-5)/.4;
 assert.ok(Math.max(...dense.rows.map(coverage))>.999);assert.ok(Math.max(...sparse.rows.map(coverage))<.3);
 assert.ok(Math.min(...dense.rows.map(coverage))<.001);assert.ok(fade.rows.filter(r=>coverage(r)<.5).length>dense.rows.filter(r=>coverage(r)<.5).length);
 assert.ok(dense.mesh.parts.filter(p=>p.name.startsWith('hair-lock-')).length>sparse.mesh.parts.filter(p=>p.name.startsWith('hair-lock-')).length);
 for(const row of [...sparse.rows,...dense.rows,...fade.rows])assert.ok(row[9]>=5&&row[9]<=5.400001,'Encoded scalp remains distinct from skin, eyes and beard');
 const empty=buildHeadMesh3d({hairstyle:'afro',hairDensity:0},colors,{headOnly:true});assert.ok(!empty.parts.some(p=>p.name==='scalp-hair'||p.name.startsWith('hair-lock-')));
});
test('scalp refinement preserves every skin, ear, eye and beard mesh part against the frozen production baseline',async()=>{
 const source=fs.readFileSync(new URL('../docs/visual-qa/references/production-scalp-before-2026-10-08.js',import.meta.url),'utf8').replace("'./playerSurfaceLighting.js'",JSON.stringify(new URL('../public/lib/playerSurfaceLighting.js',import.meta.url).href));
 const baseline=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 // Preserve the historical scalp-only change against its immutable after
 // authority. The later accepted face/chin work has a different contract.
 const afterSource=fs.readFileSync(new URL('../docs/visual-qa/references/face-naturalism-before-playerHead3d.js-2026-10-08',import.meta.url),'utf8').replace("'./playerSurfaceLighting.js'",JSON.stringify(new URL('../public/lib/playerSurfaceLighting.js',import.meta.url).href));
 const after=await import('data:text/javascript;base64,'+Buffer.from(afterSource).toString('base64'));
 for(const hairstyle of['shaved','fade','side-part','long','locs','braids']){
  const a={hairstyle,hairTexture:'coily',facialHair:'full-beard',faceLength:1.09,faceWidth:.88};
  const old=baseline.buildHeadMesh3d(a,colors,{identitySeed:'same-person',headOnly:true}),current=after.buildHeadMesh3d(a,colors,{identitySeed:'same-person',headOnly:true});
  assert.deepEqual(current.anatomy,old.anatomy);assert.deepEqual(current.eyeDepths,old.eyeDepths);
  for(const p of current.parts.filter(p=>p.name!=='scalp-hair'&&!p.name.startsWith('hair-lock-')))assert.deepEqual(values(current,p),values(old,old.parts.find(q=>q.name===p.name)),p.name);
 }
});

test('current scalp styles preserve all current non-hair geometry and saved appearance',()=>{
 const base={hairstyle:'shaved',hairTexture:'coily',facialHair:'full-beard',faceLength:1.09,faceWidth:.88};
 const old=buildHeadMesh3d(base,colors,{identitySeed:'same-person',headOnly:true});
 for(const hairstyle of['shaved','fade','side-part','long','locs','braids']){
  const a={...base,hairstyle},saved=structuredClone(a),current=buildHeadMesh3d(a,colors,{identitySeed:'same-person',headOnly:true});
  assert.deepEqual(a,saved);assert.deepEqual(current.anatomy,old.anatomy);assert.deepEqual(current.eyeDepths,old.eyeDepths);
  for(const p of current.parts.filter(p=>p.name!=='scalp-hair'&&!p.name.startsWith('hair-lock-')))assert.deepEqual(values(current,p),values(old,old.parts.find(q=>q.name===p.name)),p.name);
 }
});
