import test from 'node:test';
import assert from 'node:assert/strict';
import{buildHeadMesh3d,headPoint3d,headAnatomy3d,hairControls3d}from './playerHead3d.mjs';
const colors={skin:'#8e634b',scalp:'#29221b',brow:'#29221b',beard:'#29221b',iris:'#624329',mouth:'#93604f'};
test('shared anatomical surface has finite indexed geometry and outward normals',()=>{
 for(const a of[{hairstyle:'shaved'},{faceWidth:1.1,jawWidth:1.16,chinWidth:.8,chinLength:.85,hairstyle:'locs'},{faceWidth:.88,jawWidth:.8,chinWidth:1.2,chinLength:1.12,hairstyle:'coils'}]){
  const before=structuredClone(a),mesh=buildHeadMesh3d(a,colors),vertexCount=mesh.vertices.length/10;
  assert.ok(mesh.indices.every(i=>i<vertexCount));assert.equal(mesh.indices.length%3,0);assert.equal(mesh.vertices.length%10,0);
  for(let i=0;i<mesh.vertices.length;i+=10){assert.ok(mesh.vertices.subarray(i,i+10).every(Number.isFinite));assert.ok(Math.abs(Math.hypot(...mesh.vertices.subarray(i+3,i+6))-1)<1e-5);}
  const front=mesh.vertices.subarray((32*97+48)*10,(32*97+48)*10+6);assert.ok(front[5]>.5,'front skin points toward front camera');
  assert.deepEqual(a,before);assert.ok(mesh.vertices.byteLength+mesh.indices.byteLength<1_300_000,'bounded prototype mesh payload');
 }
});
test('pigment changes do not alter geometry; saved anatomical changes do',()=>{
 const a={faceWidth:1,jawWidth:1,hairstyle:'shaved'},first=buildHeadMesh3d(a,colors),second=buildHeadMesh3d(a,{...colors,skin:'#e2bea1',iris:'#67899c'});
 for(let i=0;i<first.vertices.length;i+=10)assert.deepEqual(first.vertices.subarray(i,i+6),second.vertices.subarray(i,i+6));
 assert.deepEqual(first.indices,second.indices);
 assert.notDeepEqual(headPoint3d(a,.7,166),headPoint3d({...a,faceWidth:1.1},.7,166));
 const narrow=headAnatomy3d({...a,noseWidth:.7}),wide=headAnatomy3d({...a,noseWidth:1.3});assert.ok(wide.noseWidth>narrow.noseWidth);
});
test('shared surface width has continuous tangents across authored stations',()=>{
 const a={hairstyle:'shaved'},g=headAnatomy3d(a),e=.0001;
 for(const[y]of g.stations.slice(1,-1)){
  const x=v=>headPoint3d(a,Math.PI/2,v)[0];
  const left=(x(y)-x(y-e))/e,right=(x(y+e)-x(y))/e;
  assert.ok(Math.abs(left-right)<.0002,`no horizontal normal discontinuity at ${y}`);
 }
});
test('invalid tessellation cannot allocate an unbounded prototype',()=>{
 for(const options of[{rings:Infinity},{rings:1000000},{rings:1.5},{slices:0},{slices:1000000}])assert.throws(()=>buildHeadMesh3d({},colors,options),/bounded range/);
});
test('facial relief meets both side boundaries with continuous values and tangents',()=>{
 const e=.00001;
 for(const a of[{}, {faceWidth:.88,cheekFullness:1.25,noseWidth:1.3}, {faceWidth:1.1,cheekFullness:.75,browRidge:1}])for(const side of[-1,1])for(const y of[130,141,166,180,194,208,228]){
  const angle=side*Math.PI/2,p=t=>headPoint3d(a,t,y)[2];
  const center=p(angle),left=p(angle-e),right=p(angle+e);
  assert.ok(Math.abs(left-right)<.002,`position continuous at ${angle}/${y}`);
  const dl=(center-left)/e,dr=(right-center)/e;
  assert.ok(Math.abs(dl-dr)<.02,`angular tangent continuous at ${angle}/${y}`);
 }
});

test('all styles and textures produce bounded finite meshes without changing skin anatomy',()=>{
 const styles=['buzz','fade','crew','short-curls','coils','locs','braids','waves','side-part','swept','long','shaved','receding','afro'];
 const skin=buildHeadMesh3d({hairstyle:'shaved'},colors).vertices.subarray(0,65*97*10);
 for(const hairstyle of styles)for(const hairTexture of ['straight','wavy','curly','coily']){
  const mesh=buildHeadMesh3d({hairstyle,hairTexture,hairLength:2,hairDensity:1,hairStrandWidth:1.5},colors);
  assert.deepEqual(mesh.vertices.subarray(0,skin.length),skin);
  assert.ok(mesh.vertices.every(Number.isFinite));assert.ok(mesh.indices.every(i=>i<mesh.vertices.length/10));
  assert.ok(mesh.vertices.byteLength+mesh.indices.byteLength<1_650_000);
 }
});

test('hair controls independently affect the mesh, preserve natural anatomy and restore exactly',()=>{
 const base={seed:'stable-person',hairstyle:'long',hairTexture:'curly',hairLength:1,hairDensity:.8,hairPart:.4,hairStrandWidth:1,hairCurvature:1,hairWaveScale:1,hairStrandVariation:.25,hairline:.3};
 const original=buildHeadMesh3d(base,colors),skin=original.vertices.subarray(0,65*97*10);
 for(const[key,v]of Object.entries({hairLength:2,hairDensity:.2,hairPart:.8,hairStrandWidth:1.5,hairCurvature:1.45,hairWaveScale:1.5,hairStrandVariation:.5,hairline:1,hairTexture:'straight'})){
  const changed=buildHeadMesh3d({...base,[key]:v},colors);
  assert.deepEqual(changed.vertices.subarray(0,skin.length),skin,key+' cannot alter anatomy');
  assert.notDeepEqual(changed.vertices,original.vertices,key+' visibly changes geometry');
 }
 assert.deepEqual(buildHeadMesh3d(JSON.parse(JSON.stringify(base)),colors),original);
 assert.equal(buildHeadMesh3d({...base,hairDensity:0},colors).parts.some(x=>x.name==='scalp-hair'),false);
 const bounded=hairControls3d({hairLength:Infinity,hairDensity:NaN,hairline:2,hairPart:-5});
 assert.equal(bounded.length,1);assert.equal(bounded.density,.8);assert.equal(bounded.hairline,1);assert.equal(bounded.part,.1);
});

test('rounded crown meets the next station without a conical pole or normal seam',()=>{
 const a={},g=headAnatomy3d(a),x=y=>headPoint3d(a,Math.PI/2,y)[0];
 assert.ok(x(65.01)>x(65.04)*.45,'near-pole breadth grows approximately with square root');
 const e=.0001,y=g.stations[1][0];assert.ok(Math.abs((x(y)-x(y-e))/e-(x(y+e)-x(y))/e)<.0002);
});
