// Proprietary artistic torso interpolation. Saved breadth/depth landmarks
// remain exact; this surface is not an empirical tissue or mass model.
export function createTorsoProfile(sections,length,neckDiameter){
 if(!Number.isFinite(length)||length<=0||!Number.isFinite(neckDiameter)||neckDiameter<=0||!Array.isArray(sections)||sections.length<2||sections.some((r,i)=>r.length!==3||!r.every(Number.isFinite)||r[1]<=0||r[2]<=0||(i&&r[0]<=sections[i-1][0]))||sections[0][0]!==0||sections.at(-1)[0]!==1)throw Error('Invalid torso landmarks');
 const rows=[[-1.5,neckDiameter*.72,neckDiameter*.72],...sections.map(([t,w,d])=>[t*length,w,d])];
 // Shape-preserving cubic slopes avoid artificial flat bands at every
 // measured landmark, while disallowing overshoot between dimensions.
 const slopes=[1,2].map(channel=>{
  const h=rows.slice(1).map((r,i)=>r[0]-rows[i][0]),delta=h.map((v,i)=>(rows[i+1][channel]-rows[i][channel])/v),m=[0];
  for(let i=1;i<rows.length-1;i++){
   const a=delta[i-1],b=delta[i];m.push(a*b<=0?0:(3*(h[i-1]+h[i]))/((2*h[i]+h[i-1])/a+(h[i]+2*h[i-1])/b));
  }
  m.push(0);return m;
 });
 return{rows,slopes,length};
}
export function sampleTorsoProfile(profile,y){
 const {rows,slopes}=profile;
 if(y<=rows[0][0])return rows[0].slice(1);if(y>=rows.at(-1)[0])return rows.at(-1).slice(1);
 let i=1;while(y>rows[i][0])i++;
 const a=rows[i-1],b=rows[i],h=b[0]-a[0],t=(y-a[0])/h;
 return[1,2].map((c,j)=>(2*t**3-3*t*t+1)*a[c]+(t**3-2*t*t+t)*h*slopes[j][i-1]+(-2*t**3+3*t*t)*b[c]+(t**3-t*t)*h*slopes[j][i]);
}
