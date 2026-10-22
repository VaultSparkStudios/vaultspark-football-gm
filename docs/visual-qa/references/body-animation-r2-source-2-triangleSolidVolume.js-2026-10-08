// Test-support diagnostics for closed, outward-oriented triangle components.
// Ray quadrature measures the union, not the sum of overlapping allocations.
// It is an estimate for this mesh; it is not a tissue-density or anatomy model.
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);

export function inspectTriangleSolids(mesh,{stride=6,weldTolerance=1e-5}={}){
 if(!mesh||!Number.isInteger(stride)||stride<3||!Number.isFinite(weldTolerance)||weldTolerance<=0||mesh.vertices.length%stride||mesh.indices.length%3)throw Error('Invalid triangle mesh');
 if(!mesh.vertices.every(Number.isFinite)||!mesh.indices.every(i=>Number.isInteger(i)&&i>=0&&i<mesh.vertices.length/stride))throw Error('Invalid triangle coordinates or indices');
 const groups=mesh.parts.map(p=>({...p,components:[p,...mesh.parts.filter(q=>q.name===p.name+'-start'||q.name===p.name+'-end')]})).filter(p=>!/-start$|-end$/.test(p.name));
 const covered=new Uint8Array(mesh.indices.length),solids=[];
 for(const group of groups){
  const ids=new Map(),points=[],edges=new Map(),triangles=[];
  const weld=index=>{const p=Array.from(mesh.vertices.subarray(index*stride,index*stride+3)),key=p.map(v=>Math.round(v/weldTolerance)).join(',');if(!ids.has(key)){ids.set(key,points.length);points.push(p);}return ids.get(key);};
  let collapsedTriangles=0;
  for(const p of group.components){
   if(!Number.isInteger(p.firstIndex)||!Number.isInteger(p.indexCount)||p.firstIndex<0||p.indexCount<0||p.firstIndex%3||p.indexCount%3||p.firstIndex+p.indexCount>mesh.indices.length)throw Error('Invalid component range');
   for(let i=p.firstIndex;i<p.firstIndex+p.indexCount;i+=3){
    if(covered[i]++)throw Error('Overlapping component index ranges');covered[i+1]=covered[i+2]=1;
    const v=[mesh.indices[i],mesh.indices[i+1],mesh.indices[i+2]].map(weld),xyz=v.map(id=>points[id]);
    const normal=cross(sub(xyz[1],xyz[0]),sub(xyz[2],xyz[0]));
    if(new Set(v).size<3||Math.hypot(...normal)<1e-10){collapsedTriangles++;continue;}
    triangles.push({points:xyz,normal});
    for(const[a,b]of[[v[0],v[1]],[v[1],v[2]],[v[2],v[0]]]){const key=a<b?a+','+b:b+','+a,e=edges.get(key)||{count:0,balance:0};e.count++;e.balance+=a<b?1:-1;edges.set(key,e);}
   }
  }
  const boundaryEdges=[...edges.values()].filter(e=>e.count===1).length,nonmanifoldEdges=[...edges.values()].filter(e=>e.count>2).length,inconsistentEdges=[...edges.values()].filter(e=>e.count===2&&e.balance!==0).length;
  const origin=points[0]||[0,0,0];let signedVolume=0;
  for(const t of triangles){const[a,b,c]=t.points.map(p=>sub(p,origin));signedVolume+=dot(a,cross(b,c))/6;}
  solids.push({name:group.name,triangles,boundaryEdges,nonmanifoldEdges,inconsistentEdges,collapsedTriangles,signedVolume,closedOriented:triangles.length>0&&boundaryEdges===0&&nonmanifoldEdges===0&&inconsistentEdges===0&&signedVolume>0});
 }
 if(covered.some(v=>v!==1))throw Error('Unassigned mesh triangles');
 return{solids,weldTolerance,allComponentsClosedOriented:solids.length>0&&solids.every(p=>p.closedOriented),selfIntersectionsVerified:false};
}

// Midpoint quadrature on the projected bounding rectangle, exact ray crossings
// through the triangle planes. Half-open projected triangle edges prevent two
// triangles on a shared edge from double-counting one crossing.
export function estimateTriangleUnionVolume(mesh,{resolution=128,axis=2,stride=6,weldTolerance=1e-5}={}){
 if(!Number.isInteger(resolution)||resolution<8||resolution>1024||![0,1,2].includes(axis))throw Error('Invalid volume quadrature');
 const inspected=inspectTriangleSolids(mesh,{stride,weldTolerance});
 if(!inspected.allComponentsClosedOriented)throw Error('Union estimate requires closed outward-oriented components');
 const u=(axis+1)%3,v=(axis+2)%3,triangles=inspected.solids.flatMap(s=>s.triangles);
 const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
 for(const t of triangles)for(const p of t.points)for(let k=0;k<3;k++){lo[k]=Math.min(lo[k],p[k]);hi[k]=Math.max(hi[k],p[k]);}
 const du=(hi[u]-lo[u])/resolution,dv=(hi[v]-lo[v])/resolution;
 if(!(du>0&&dv>0))throw Error('Degenerate volume bounds');
 const bins=Array.from({length:resolution*resolution},()=>[]);
 const cell=(p,k,step)=>Math.max(0,Math.min(resolution-1,Math.floor((p-lo[k])/step)));
 for(const t of triangles){
  if(Math.abs(t.normal[axis])<1e-12)continue;
  const minU=Math.min(...t.points.map(p=>p[u])),maxU=Math.max(...t.points.map(p=>p[u])),minV=Math.min(...t.points.map(p=>p[v])),maxV=Math.max(...t.points.map(p=>p[v]));
  for(let y=cell(minV,v,dv);y<=cell(maxV,v,dv);y++)for(let x=cell(minU,u,du);x<=cell(maxU,u,du);x++)bins[y*resolution+x].push(t);
 }
 const edge=(a,b,x,y)=>(b[u]-a[u])*(y-a[v])-(b[v]-a[v])*(x-a[u]);
 const topLeft=(a,b)=>b[v]>a[v]||(b[v]===a[v]&&b[u]<a[u]);
 let totalLength=0,invalidRays=0,negativeWindingRays=0;
 for(let y=0;y<resolution;y++)for(let x=0;x<resolution;x++){
  const px=lo[u]+(x+.5)*du,py=lo[v]+(y+.5)*dv,events=[];
  for(const t of bins[y*resolution+x]){
   let[a,b,c]=t.points;if(edge(a,b,c[u],c[v])<0)[b,c]=[c,b];
   const edgeTolerance=Math.abs(edge(a,b,c[u],c[v]))*1e-12;
   const inside=[[a,b],[b,c],[c,a]].every(([p,q])=>{const e=edge(p,q,px,py);return e>edgeTolerance||(Math.abs(e)<=edgeTolerance&&topLeft(p,q));});
   if(!inside)continue;
   const p=t.points[0],z=p[axis]-(t.normal[u]*(px-p[u])+t.normal[v]*(py-p[v]))/t.normal[axis];
   events.push({z,delta:t.normal[axis]<0?1:-1});
  }
  events.sort((a,b)=>a.z-b.z);let winding=0,last=events[0]?.z??0,length=0,negative=false;
  for(let i=0;i<events.length;){const z=events[i].z;if(winding>0)length+=z-last;let delta=0;while(i<events.length&&Math.abs(events[i].z-z)<1e-9)delta+=events[i++].delta;winding+=delta;if(winding<0)negative=true;last=z;}
  if(winding!==0)invalidRays++;if(negative)negativeWindingRays++;totalLength+=length;
 }
 const unionVolume=totalLength*du*dv,grossVolume=inspected.solids.reduce((n,p)=>n+p.signedVolume,0);
 return{resolution,axis,units:mesh.units,unionVolume,grossVolume,overlapVolume:grossVolume-unionVolume,invalidRays,negativeWindingRays,componentCount:inspected.solids.length,selfIntersectionsVerified:false,components:inspected.solids.map(({triangles,...p})=>p)};
}
