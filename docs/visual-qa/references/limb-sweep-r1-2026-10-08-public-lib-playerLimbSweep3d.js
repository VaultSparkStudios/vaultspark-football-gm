// Continuous external limb surface through saved bone centers. The Hermite
// centerline and elliptical sections are artistic skin geometry, not tissue
// composition measurements. Only wrist/ankle and proximal ends have caps.
const sub=(a,b)=>a.map((v,i)=>v-b[i]),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],unit=a=>{const n=Math.hypot(...a);if(n<1e-10)throw Error('Degenerate limb sweep');return a.map(v=>v/n);};
function section(rows,t){for(let i=1;i<rows.length;i++)if(t<=rows[i][0]){const a=rows[i-1],b=rows[i],q=Math.max(0,Math.min(1,(t-a[0])/(b[0]-a[0]))),s=q*q*(3-2*q);return[a[1]+(b[1]-a[1])*s,a[2]+(b[2]-a[2])*s];}return rows.at(-1).slice(1);}
export function createLimbSweepRecipe(sections,joint,{rows=40,columns=32}={}){
 if(!Number.isFinite(joint)||joint<=0||joint>=1||!Number.isInteger(rows)||rows<8||rows>96||!Number.isInteger(columns)||columns<8||columns>64)throw Error('Invalid limb sweep recipe');
 if(!Array.isArray(sections)||sections.length<2||sections.some((s,i)=>s.length!==3||!s.every(Number.isFinite)||s[1]<=0||s[2]<=0||(i&&s[0]<=sections[i-1][0]))||sections[0][0]!==0||sections.at(-1)[0]!==1)throw Error('Invalid limb sweep sections');
 const times=[...new Set([...Array.from({length:rows+1},(_,i)=>i/rows),...sections.map(s=>s[0]),joint])].sort((a,b)=>a-b),widths=times.map(t=>section(sections,t)),angles=Array.from({length:columns+1},(_,i)=>[Math.cos(i/columns*Math.PI*2),Math.sin(i/columns*Math.PI*2)]);
 return{joint,times,widths,angles,columns,vertexCount:times.length*(columns+1)+2*(columns+2)};
}
export function limbSweepFrame(limb,joint,t,frontal=false){
 const upper=sub(limb.joint,limb.root).map(v=>v/joint),lower=sub(limb.end,limb.joint).map(v=>v/(1-joint)),middle=upper.map((v,i)=>(v+lower[i])/2),first=t<=joint,lo=first?0:joint,span=first?joint:1-joint,q=(t-lo)/span,a=first?limb.root:limb.joint,b=first?limb.joint:limb.end,ma=first?upper:middle,mb=first?middle:lower;
 const q2=q*q,q3=q2*q,h=[2*q3-3*q2+1,q3-2*q2+q,-2*q3+3*q2,q3-q2],dh=[(6*q2-6*q)/span,3*q2-4*q+1,(-6*q2+6*q)/span,3*q2-2*q];
 const center=a.map((v,i)=>h[0]*v+h[1]*span*ma[i]+h[2]*b[i]+h[3]*span*mb[i]),tangent=a.map((v,i)=>dh[0]*v+dh[1]*ma[i]+dh[2]*b[i]+dh[3]*mb[i]),d=unit(tangent),ref=Math.abs(d[0])<.9?[1,0,0]:[0,0,1],lateral=frontal?unit(cross(d,[0,0,1])):unit(ref.map((v,i)=>v-d[i]*dot(ref,d))),depth=unit(cross(lateral,d));
 return{center,d,lateral,depth};
}
export function writeLimbSweepVertices(target,offset,recipe,limb,frontal=false){
 const {times,widths,angles,columns}=recipe,stride=columns+1,frames=times.map(t=>limbSweepFrame(limb,recipe.joint,t,frontal));
 for(let r=0;r<times.length;r++){const f=frames[r],[w,d]=widths[r];for(let c=0;c<=columns;c++){const[co,si]=angles[c],i=offset+(r*stride+c)*6;for(let k=0;k<3;k++)target[i+k]=f.center[k]+f.lateral[k]*w/2*co+f.depth[k]*d/2*si;}}
 // Centered longitudinal differences follow the bent skin surface. Analytic
 // angular tangents retain smooth seam normals and avoid triangle faceting.
 for(let r=0;r<times.length;r++){const f=frames[r],[w,d]=widths[r],before=Math.max(0,r-1),after=Math.min(times.length-1,r+1);for(let c=0;c<=columns;c++){const[co,si]=angles[c],i=offset+(r*stride+c)*6,ia=offset+(before*stride+c)*6,ib=offset+(after*stride+c)*6,along=[0,1,2].map(k=>target[ib+k]-target[ia+k]),around=f.lateral.map((v,k)=>-v*w/2*si+f.depth[k]*d/2*co),n=unit(cross(along,around));for(let k=0;k<3;k++)target[i+3+k]=n[k];}}
 for(let end=0;end<2;end++){const r=end?times.length-1:0,f=frames[r],sign=end?1:-1,base=offset+(times.length*stride+end*(columns+2))*6;for(let k=0;k<3;k++){target[base+k]=f.center[k];target[base+3+k]=sign*f.d[k];}for(let c=0;c<=columns;c++){const i=base+(c+1)*6,source=offset+(r*stride+c)*6;for(let k=0;k<3;k++){target[i+k]=target[source+k];target[i+3+k]=sign*f.d[k];}}}
 return target;
}
export function limbSweepIndices(recipe,startVertex=0){
 const {times,columns}=recipe,stride=columns+1,out=[];for(let r=0;r<times.length-1;r++)for(let c=0;c<columns;c++){const p=startVertex+r*stride+c,q=p+1,s=p+stride,t=s+1;out.push(p,s,q,q,s,t);}
 for(let end=0;end<2;end++){const center=startVertex+times.length*stride+end*(columns+2);for(let c=0;c<columns;c++)out.push(...(end?[center,center+c+2,center+c+1]:[center,center+c+1,center+c+2]));}return out;
}
