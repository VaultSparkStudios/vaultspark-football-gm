// Continuous external limb surface through saved bone centers. The Hermite
// centerline and elliptical sections are artistic skin geometry, not tissue
// composition measurements. Only wrist/ankle and proximal ends have caps.
// Tight bends compress the inner skin before it crosses the curvature center;
// neutral section dimensions remain exact. Posed girths/volume are not fixed.
const sub=(a,b)=>a.map((v,i)=>v-b[i]),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],unit=a=>{const n=Math.hypot(...a);if(n<1e-10)throw Error('Degenerate limb sweep');return a.map(v=>v/n);};
function section(rows,t){for(let i=1;i<rows.length;i++)if(t<=rows[i][0]){const a=rows[i-1],b=rows[i],q=Math.max(0,Math.min(1,(t-a[0])/(b[0]-a[0]))),s=q*q*(3-2*q);return[a[1]+(b[1]-a[1])*s,a[2]+(b[2]-a[2])*s];}return rows.at(-1).slice(1);}
export function createLimbSweepRecipe(sections,joint,{rows=40,columns=32}={}){
 if(!Number.isFinite(joint)||joint<=0||joint>=1||!Number.isInteger(rows)||rows<8||rows>96||!Number.isInteger(columns)||columns<8||columns>64)throw Error('Invalid limb sweep recipe');
 if(!Array.isArray(sections)||sections.length<2||sections.some((s,i)=>s.length!==3||!s.every(Number.isFinite)||s[1]<=0||s[2]<=0||(i&&s[0]<=sections[i-1][0]))||sections[0][0]!==0||sections.at(-1)[0]!==1)throw Error('Invalid limb sweep sections');
 const times=[...new Set([...Array.from({length:rows+1},(_,i)=>i/rows),...sections.map(s=>s[0]),joint])].sort((a,b)=>a-b),widths=times.map(t=>section(sections,t)),angles=Array.from({length:columns+1},(_,i)=>[Math.cos(i/columns*Math.PI*2),Math.sin(i/columns*Math.PI*2)]);
 return{joint,sections:sections.map(s=>s.slice()),times,widths,angles,columns,vertexCount:times.length*(columns+1)+2*(columns+2)};
}
export function limbSweepFrame(limb,joint,t,frontal=false){
 const upper=sub(limb.joint,limb.root).map(v=>v/joint),lower=sub(limb.end,limb.joint).map(v=>v/(1-joint)),middle=upper.map((v,i)=>(v+lower[i])/2),acceleration=upper.map((v,i)=>4*(lower[i]-v)),first=t<=joint,lo=first?0:joint,span=first?joint:1-joint,q=(t-lo)/span,a=first?limb.root:limb.joint,b=first?limb.joint:limb.end,ma=first?upper:middle,mb=first?middle:lower,aa=first?[0,0,0]:acceleration,ab=first?acceleration:[0,0,0];
 // Shared value, first derivative and acceleration make the join C2. Inner
 // skin compression therefore cannot jump at the bone's joint landmark.
 const center=[],tangent=[],second=[];for(let i=0;i<3;i++){const c0=a[i],c1=span*ma[i],c2=span*span*aa[i]/2,A=b[i]-c0-c1-c2,B=span*mb[i]-c1-2*c2,D=span*span*ab[i]-2*c2,c3=10*A-4*B+D/2,c4=-15*A+7*B-D,c5=6*A-3*B+D/2;center[i]=c0+q*(c1+q*(c2+q*(c3+q*(c4+q*c5))));tangent[i]=(c1+q*(2*c2+q*(3*c3+q*(4*c4+q*5*c5))))/span;second[i]=(2*c2+q*(6*c3+q*(12*c4+q*20*c5)))/(span*span);}
 const speed=Math.hypot(...tangent),d=unit(tangent),ref=Math.abs(d[0])<.9?[1,0,0]:[0,0,1],lateral=frontal?unit(cross(d,[0,0,1])):unit(ref.map((v,i)=>v-d[i]*dot(ref,d))),depth=unit(cross(lateral,d)),curvature=second.map((v,i)=>(v-d[i]*dot(second,d))/(speed*speed));
 return{center,d,lateral,depth,curvature,speed};
}
function skinSection(frame,width,depth,co,si){const radial=frame.lateral.map((v,k)=>v*width/2*co+frame.depth[k]*depth/2*si),derivative=frame.lateral.map((v,k)=>-v*width/2*si+frame.depth[k]*depth/2*co),bend=dot(frame.curvature,radial);let limit=1,slope=0;if(bend>.4){const exponential=Math.exp(-(bend-.4)/.2),bounded=.4+.2*(1-exponential);limit=bounded/bend;slope=(exponential*bend-bounded)/(bend*bend);}const angularScale=slope*dot(frame.curvature,derivative);return{offset:radial.map(v=>v*limit),around:derivative.map((v,k)=>v*limit+radial[k]*angularScale)};}
export function limbSweepPoint(recipe,limb,t,angle,frontal=false){const f=limbSweepFrame(limb,recipe.joint,t,frontal),[w,d]=section(recipe.sections,t),offset=skinSection(f,w,d,Math.cos(angle),Math.sin(angle)).offset;return f.center.map((v,i)=>v+offset[i]);}
export function writeLimbSweepVertices(target,offset,recipe,limb,frontal=false){
 const {times,widths,angles,columns}=recipe,stride=columns+1,frames=times.map(t=>limbSweepFrame(limb,recipe.joint,t,frontal));
 for(let r=0;r<times.length;r++){const f=frames[r],[w,d]=widths[r];for(let c=0;c<=columns;c++){const[co,si]=angles[c],i=offset+(r*stride+c)*6,skin=skinSection(f,w,d,co,si);for(let k=0;k<3;k++){target[i+k]=f.center[k]+skin.offset[k];target[i+3+k]=skin.around[k];}}}
 // Centered longitudinal differences follow the bent skin surface. Analytic
 // angular tangents retain smooth seam normals and avoid triangle faceting.
 for(let r=0;r<times.length;r++){const before=Math.max(0,r-1),after=Math.min(times.length-1,r+1);for(let c=0;c<=columns;c++){const i=offset+(r*stride+c)*6,ia=offset+(before*stride+c)*6,ib=offset+(after*stride+c)*6,along=[0,1,2].map(k=>target[ib+k]-target[ia+k]),around=[0,1,2].map(k=>target[i+3+k]),n=unit(cross(along,around));for(let k=0;k<3;k++)target[i+3+k]=n[k];}}
 for(let end=0;end<2;end++){const r=end?times.length-1:0,f=frames[r],sign=end?1:-1,base=offset+(times.length*stride+end*(columns+2))*6;for(let k=0;k<3;k++){target[base+k]=f.center[k];target[base+3+k]=sign*f.d[k];}for(let c=0;c<=columns;c++){const i=base+(c+1)*6,source=offset+(r*stride+c)*6;for(let k=0;k<3;k++){target[i+k]=target[source+k];target[i+3+k]=sign*f.d[k];}}}
 return target;
}
export function limbSweepIndices(recipe,startVertex=0){
 const {times,columns}=recipe,stride=columns+1,out=[];for(let r=0;r<times.length-1;r++)for(let c=0;c<columns;c++){const p=startVertex+r*stride+c,q=p+1,s=p+stride,t=s+1;out.push(p,s,q,q,s,t);}
 for(let end=0;end<2;end++){const center=startVertex+times.length*stride+end*(columns+2);for(let c=0;c<columns;c++)out.push(...(end?[center,center+c+2,center+c+1]:[center,center+c+1,center+c+2]));}return out;
}
