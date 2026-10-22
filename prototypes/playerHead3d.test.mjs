import test from 'node:test';
import assert from 'node:assert/strict';
import{buildHeadMesh3d,headPoint3d,headAnatomy3d,hairControls3d,faceControls3d,hairMaterial3d,eyeLidPoint3d,scalpNormal3d}from './playerHead3d.mjs';
const colors={skin:'#8e634b',scalp:'#29221b',brow:'#29221b',beard:'#29221b',iris:'#624329',mouth:'#93604f'};

test('scalp offsets follow surface normals and clump endpoints meet their path instead of leaving blunt wires',()=>{
 for(const a of[{}, {faceLength:1.09,faceWidth:.88,headDepth:1.15}, {faceLength:.92,faceWidth:1.10,headDepth:.85}]){
  const g=headAnatomy3d(a);assert.deepEqual(scalpNormal3d(a,0,g.crownY),[0,1,0]);
  for(const angle of[-Math.PI,-2,-1,0,1,2,Math.PI])for(const y of[g.crownY+3,90,110]){
   const e=.001,n=scalpNormal3d(a,angle,y),du=headPoint3d(a,angle+e,y).map((v,i)=>v-headPoint3d(a,angle-e,y)[i]),dv=headPoint3d(a,angle,y+e).map((v,i)=>v-headPoint3d(a,angle,y-e)[i]);
   assert.ok(n.every(Number.isFinite));assert.ok(Math.abs(Math.hypot(...n)-1)<1e-9);
   for(const tangent of[du,dv])assert.ok(Math.abs(n.reduce((sum,v,i)=>sum+v*tangent[i],0))<1e-9,'offset is perpendicular to the actual scalp');
  }
 }
 for(const hairstyle of['crew','swept','long','locs','braids']){
  const a={hairstyle,hairTexture:'straight',hairDensity:.15},mesh=buildHeadMesh3d(a,colors,{identitySeed:'fitted-clumps'});
  for(const part of mesh.parts.filter(p=>p.name.startsWith('hair-lock-'))){
   const first=mesh.indices[part.firstIndex],rows=part.indexCount/(5*6),vertex=(r,c)=>Array.from(mesh.vertices.subarray((first+r*6+c)*10,(first+r*6+c)*10+3));
   for(const r of[0,rows])for(let c=1;c<=5;c++)assert.ok(vertex(r,c).every((v,i)=>Math.abs(v-vertex(r,0)[i])<1e-5),'clump root/tip cross-section closes');
   const middle=Math.floor(rows/2);assert.ok(Math.hypot(...vertex(middle,0).map((v,i)=>v-vertex(middle,2)[i]))>.1,'clumps retain internal volume');
   const center=[0,1,2].map(k=>Array.from({length:5},(_,c)=>vertex(middle,c)[k]).reduce((sum,v)=>sum+v,0)/5);
   for(let c=0;c<5;c++){
    const at=(first+middle*6+c)*10,radial=vertex(middle,c).map((v,i)=>v-center[i]),normal=mesh.vertices.subarray(at+3,at+6);
    assert.ok(radial.reduce((sum,v,i)=>sum+v*normal[i],0)>0,`clump normals face away from the centerline: ${hairstyle}/${part.name}/${c}`);
   }
  }
 }
 assert.throws(()=>scalpNormal3d({},NaN,100),/Invalid scalp/);
});

test('moving lids close on the same globe, preserve attached folds and match encoded GPU deformation',()=>{
 for(const a of[{}, {eyeAperture:.7,eyeTilt:-2,faceLength:.92,facialAsymmetry:-1}, {eyeAperture:1.2,eyeTilt:2,faceLength:1.09,facialAsymmetry:1}]){
  const original=structuredClone(a),g=headAnatomy3d(a),mesh=buildHeadMesh3d({...a,hairstyle:'shaved'},colors);
  for(const side of[-1,1])for(const u of[0,.1,.25,.5,.75,.9,1]){
   assert.deepEqual(eyeLidPoint3d(a,side,-1,u,0,1),eyeLidPoint3d(a,side,1,u,0,1),'upper and lower margins meet on full closure');
   for(const lid of[-1,1]){
    const open=eyeLidPoint3d(a,side,lid,u,1,0);assert.deepEqual(eyeLidPoint3d(a,side,lid,u,1,1),open,'outer fold remains attached');
   }
  }
  for(const part of mesh.parts.filter(p=>p.name.startsWith('eye-lid-'))){
   const start=mesh.indices[part.firstIndex],side=Number(part.name.match(/^eye-lid-(-?1)-(-?1)$/)[1]);
   for(let row=0;row<=3;row++)for(let col=0;col<=12;col++){
    const at=(start+row*13+col)*10,p=mesh.vertices.subarray(at,at+3),m=mesh.vertices[at+9];
    const lid=m<8.5?-1:1,w=Math.max(0,Math.min(1,(m-(m<8.5?8:9))*5));
    const ex=p[0]-side*g.eyeOffset,tilt=side*ex*g.faceControls.eyeTilt*.1;
    const ey=141+(151-p[1]-141)/g.faceControls.length-(141+side*g.faceControls.asymmetry*.8)-tilt;
    const aperture=3.4*(a.eyeAperture??1)*Math.sqrt(Math.max(0,1-(Math.abs(ex)/10)**1.6));
    for(const blink of[0,.5,1]){
     const closed=ey-lid*aperture*w*blink;
     const posed=[p[0],p[1]+lid*aperture*w*blink*g.faceControls.length,p[2]+w*(Math.sqrt(Math.max(.01,121-ex*ex-(closed*g.faceControls.length)**2))-Math.sqrt(Math.max(.01,121-ex*ex-(ey*g.faceControls.length)**2)))];
     const edgeScale=Math.sqrt(Math.max(0,1-(ex/11)**2));
     const progress=Math.max(0,Math.min(1,(Math.abs(closed)-aperture-.8*edgeScale)/Math.max(.001,1.4*edgeScale))),fold=Math.max(0,Math.min(1,w/.15));
     const contact=blink*fold*fold*(3-2*fold)*(1-progress*progress*(3-2*progress));
     const globe=mesh.eyeDepths[side<0?0:1]+Math.sqrt(Math.max(.01,121-ex*ex-(closed*g.faceControls.length)**2))+.45+.8*blink;
     posed[2]+=contact*Math.max(0,globe-posed[2]);
     const expected=eyeLidPoint3d(a,side,lid,col/12,row/3,blink);
     assert.ok(posed.every((v,i)=>Math.abs(v-expected[i])<.00006),'encoded shader positions match continuous lid surface');
    }
   }
  }
  assert.deepEqual(a,original);
 }
 assert.throws(()=>eyeLidPoint3d({},0,-1,.5,0),/Invalid eyelid/);
 assert.throws(()=>eyeLidPoint3d({},1,-1,.5,0,NaN),/Invalid eyelid/);
});

test('separate eye surfaces retain outward normals and saved spacing/aperture in extreme face forms',()=>{
 for(const traits of[{}, {eyeSpacing:.88,eyeAperture:.7,faceLength:.92,eyeTilt:-2,facialAsymmetry:-1}, {eyeSpacing:1.10,eyeAperture:1.2,faceLength:1.09,eyeTilt:2,facialAsymmetry:1}]){
  const a={hairstyle:'shaved',...traits},mesh=buildHeadMesh3d(a,colors);
  const eyes=mesh.parts.filter(p=>p.name.startsWith('eye-globe-'));assert.equal(eyes.length,2);
  for(const part of eyes){
   const start=mesh.indices[part.firstIndex],side=Number(part.name.match(/^eye-globe-(-?1)$/)[1]);
   const origin=[side*mesh.anatomy.eyeOffset,10-side*mesh.anatomy.faceControls.asymmetry*.8*mesh.anatomy.faceControls.length,mesh.eyeDepths[side<0?0:1]];
   for(let row=1;row<5;row++)for(let col=1;col<12;col++){
    const at=(start+row*13+col)*10,p=mesh.vertices.subarray(at,at+3),n=mesh.vertices.subarray(at+3,at+6);
    assert.equal(mesh.vertices[at+9],7);assert.ok(n[2]>0,'exposed eye normal faces forward');
    const radial=p.map((v,i)=>v-origin[i]);assert.ok(radial.reduce((sum,v,i)=>sum+v*n[i],0)>1,'eye normal faces away from globe center');
   }
   assert.ok(Math.abs(Math.abs(origin[0])-mesh.anatomy.eyeOffset)<1e-5,'eye spacing uses saved anatomy');
  }
  assert.deepEqual(buildHeadMesh3d(JSON.parse(JSON.stringify(a)),colors),mesh);
 }
});

test('facial grooming adds bounded surface-rooted fibers without rerolling skin or pigments into anatomy',()=>{
 const base={hairstyle:'shaved',faceLength:1.09,faceWidth:.88,jawWidth:.8},clean=buildHeadMesh3d(base,colors),skin=clean.parts[0];
 const last=Math.max(...clean.indices.subarray(skin.firstIndex,skin.firstIndex+skin.indexCount))+1;
 for(const facialHair of['stubble','mustache','goatee','short-beard','full-beard']){
  const a={...base,facialHair},saved=structuredClone(a),mesh=buildHeadMesh3d(a,colors,{identitySeed:'same-person'});
  assert.deepEqual(mesh.vertices.subarray(0,last*10),clean.vertices.subarray(0,last*10),'grooming cannot change skin anatomy');
  assert.ok(mesh.parts.filter(p=>p.name.startsWith('beard-fiber-')).length>=32);
  for(let i=0;i<mesh.vertices.length;i+=10){assert.ok(mesh.vertices.subarray(i,i+10).every(Number.isFinite));assert.ok(Math.abs(Math.hypot(...mesh.vertices.subarray(i+3,i+6))-1)<1e-5);}
  const dyed=buildHeadMesh3d(a,{...colors,beard:'#b13173'},{identitySeed:'same-person'});
  assert.deepEqual(dyed.indices,mesh.indices);
  for(let i=0;i<mesh.vertices.length;i+=10)assert.deepEqual(dyed.vertices.subarray(i,i+6),mesh.vertices.subarray(i,i+6));
  assert.deepEqual(a,saved);assert.deepEqual(buildHeadMesh3d(JSON.parse(JSON.stringify(a)),colors,{identitySeed:'same-person'}),mesh);
 }
 for(const hairTexture of['straight','wavy','curly','coily']){
  const mesh=buildHeadMesh3d({hairstyle:'long',hairTexture,hairLength:2,hairDensity:1,facialHair:'full-beard'},colors);
  assert.ok(mesh.vertices.byteLength+mesh.indices.byteLength<1_650_000,'full hair plus beard retains existing payload ceiling');
  assert.ok(mesh.indices.every(i=>i<mesh.vertices.length/10));
 }
});

test('individual graying is monotonic pigment-only and dye preserves the natural recipe',()=>{
 const a={version:'portrait-identity-v3',detailVersion:'natural-appearance-detail-v1',seed:'saved-gray-person',hairstyle:'crew'},original=structuredClone(a);
 const meshes=[0,.2,.65].map(grayShare=>buildHeadMesh3d(a,{...colors,grayShare}));
 const grayParts=mesh=>new Set(mesh.parts.filter(p=>p.name.startsWith('hair-lock-')&&Math.abs(mesh.vertices[mesh.indices[p.firstIndex]*10+6]-226/255)<1e-6).map(p=>p.name));
 const younger=grayParts(meshes[1]),older=grayParts(meshes[2]);
 assert.ok(younger.size>0&&older.size>younger.size);assert.ok([...younger].every(p=>older.has(p)),'aging retains each already-gray fiber');
 for(const changed of meshes.slice(1)){
  assert.deepEqual(changed.indices,meshes[0].indices);
  for(let i=0;i<changed.vertices.length;i+=10)assert.deepEqual(changed.vertices.subarray(i,i+6),meshes[0].vertices.subarray(i,i+6),'aging cannot reroll anatomy or strands');
 }
 const dyed=buildHeadMesh3d({...a,dyedHairColor:'#a5317d'},{...colors,scalp:'#a5317d',grayShare:.65});
 assert.equal(dyed.hairMaterial.grayShare,0);assert.equal(grayParts(dyed).size,0);
 assert.deepEqual(a,original);assert.deepEqual(buildHeadMesh3d(JSON.parse(JSON.stringify(a)),{...colors,grayShare:.65}),meshes[2]);
 const other=buildHeadMesh3d({...a,seed:'another-person'},{...colors,grayShare:.65});assert.notDeepEqual(grayParts(other),older,'gray arrangement belongs to the individual');
 for(const grayShare of[NaN,Infinity,-1])assert.equal(hairMaterial3d(a,{grayShare}).grayShare,0);
 assert.equal(hairMaterial3d({...a,version:'legacy'},{grayShare:.65}).grayShare,0,'legacy palette aging is not applied twice');
 const recipe={...a};delete recipe.seed;
 const first=buildHeadMesh3d(recipe,{...colors,grayShare:.65},{identitySeed:'saved-id-1'}),second=buildHeadMesh3d(recipe,{...colors,grayShare:.65},{identitySeed:'saved-id-2'});
 assert.notDeepEqual(first.vertices,second.vertices,'real DTOs without a hair seed use explicit saved identity');
 assert.deepEqual(buildHeadMesh3d(JSON.parse(JSON.stringify(recipe)),{...colors,grayShare:.65},{identitySeed:'saved-id-1'}),first);
});

test('mirrored ear shell and cartilage have outward normals and saved proportions',()=>{
 const base={hairstyle:'shaved'},mesh=buildHeadMesh3d(base,colors);
 for(const side of[-1,1]){
  for(const name of[`ear-helix-${side}`,`ear-antihelix-${side}`]){
   const part=mesh.parts.find(p=>p.name===name),offset=mesh.indices[part.firstIndex]*10;
   assert.ok(mesh.vertices[offset+3]*side>.9,'outer cartilage normal faces away from the skull');
  }
  const part=mesh.parts.find(p=>p.name===`ear-${side}`),start=mesh.indices[part.firstIndex];
  const offset=(start+8*25+6)*10;
  assert.ok(mesh.vertices[offset+3]*side>.9,'mirrored shell normal remains outward');
 }
 const skin=mesh.parts[0],last=Math.max(...mesh.indices.subarray(skin.firstIndex,skin.firstIndex+skin.indexCount))+1;
 for(const traits of[{earSize:.7,earShape:1.3},{earSize:1.3,earShape:.7},{earSize:Infinity,earShape:NaN}]){
  const changed=buildHeadMesh3d({...base,...traits},colors);
  assert.deepEqual(changed.vertices.subarray(0,last*10),mesh.vertices.subarray(0,last*10),'ear traits preserve face anatomy');
  assert.deepEqual(changed.indices,mesh.indices);
  assert.ok(changed.vertices.every(Number.isFinite));
 }
 const small=buildHeadMesh3d({...base,earSize:.7},colors),large=buildHeadMesh3d({...base,earSize:1.3},colors);
 assert.notDeepEqual(small.vertices,large.vertices);
});
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

test('shared face length transforms crown, jaw, nose and hair anchors without changing horizontal breadth',()=>{
 const shorter=headAnatomy3d({faceLength:.92}),longer=headAnatomy3d({faceLength:1.09});
 for(const g of[shorter,longer]){
  assert.equal(g.crownY,141+(65-141)*g.faceControls.length);
  assert.equal(g.noseY,141+(g.nominalNoseY-141)*g.faceControls.length);
  assert.equal(g.chinY,141+(g.nominalChinY-141)*g.faceControls.length);
  assert.ok(g.stations.every((s,i)=>!i||s[0]>g.stations[i-1][0]));
 }
 assert.ok(longer.chinY-longer.crownY>shorter.chinY-shorter.crownY);
 assert.equal(shorter.width,longer.width);
 for(const y of[82,108,141,180,208,231]){
  const p=(length)=>headPoint3d({faceLength:length},.7,141+(y-141)*length);
  assert.ok(Math.abs(p(.92)[0]-p(1.09)[0])<1e-9);
  assert.ok(Math.abs(p(.92)[2]-p(1.09)[2])<1e-9,'same normalized shared surface at matching anatomical station');
 }
});

test('saved facial controls alter anatomy while iris detail remains pigment-only and deterministic',()=>{
 const base={hairstyle:'shaved'},mesh=buildHeadMesh3d(base,colors);
 for(const[key,v]of Object.entries({faceLength:1.09,eyeTilt:2,eyelidCrease:1,browArch:1.35,browAngle:2,lipCurve:1,facialAsymmetry:1,chinProjection:.7,foreheadSlope:.7})){
  const changed=buildHeadMesh3d({...base,[key]:v},colors);
  assert.notDeepEqual(changed.vertices,mesh.vertices,key);
  assert.deepEqual(changed.indices,mesh.indices,'trait variation retains topology');
 }
 for(const[key,v]of Object.entries({irisShade:.25,irisInnerMix:.65,irisPattern:1})){
  const changed=buildHeadMesh3d({...base,[key]:v},colors);assert.deepEqual(changed.vertices,mesh.vertices,key+' cannot reshape the person');
 }
 const traits={...base,faceLength:1.09,facialAsymmetry:1,chinProjection:-.7};
 assert.deepEqual(buildHeadMesh3d(JSON.parse(JSON.stringify(traits)),colors),buildHeadMesh3d(traits,colors));
});

test('new face controls remain bounded and surface joins stay continuous at extreme values',()=>{
 const keys=Object.keys(faceControls3d());
 const malformed={faceLength:NaN,eyeTilt:Infinity,eyelidCrease:Infinity,facialAsymmetry:Infinity,irisShade:Infinity};
 assert.ok(keys.every(k=>Number.isFinite(faceControls3d(malformed)[k])));
 for(const a of[{faceLength:.92,eyeTilt:-2,facialAsymmetry:-1,chinProjection:-.7,foreheadSlope:-.7},{faceLength:1.09,eyeTilt:2,facialAsymmetry:1,chinProjection:.7,foreheadSlope:.7}]){
  const g=headAnatomy3d(a),e=.00001;
  for(const[y]of g.stations.slice(1,-1)){
   const x=t=>headPoint3d(a,Math.PI/2,t)[0];assert.ok(Math.abs((x(y)-x(y-e))/e-(x(y+e)-x(y))/e)<.0002);
  }
  for(const side of[-1,1])for(const y of[130,141,166,180,208,228]){
   const angle=side*Math.PI/2,p=t=>headPoint3d(a,t,y)[2];
   assert.ok(Math.abs((p(angle)-p(angle-e))/e-(p(angle+e)-p(angle))/e)<.02);
  }
 }
});
