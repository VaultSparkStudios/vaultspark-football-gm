// Experimental artistic relief, not measured anatomy or a calibrated model.
// Pure functions let browser pixels and geometry probes share one candidate.
const bound=(a,k,d,l,h)=>Number.isFinite(a[k])?Math.max(l,Math.min(h,a[k])):d;
const bell=(x,y,cx,cy,rx,ry)=>Math.exp(-.5*(((x-cx)/rx)**2+((y-cy)/ry)**2));
export function candidateFaceDepth(a,x,y,view='front'){
 const width=59*bound(a,'faceWidth',1,.88,1.10);
 const cheek=bound(a,'cheekFullness',1,.75,1.25),bone=bound(a,'cheekbone',1,.75,1.25);
 const ridge=bound(a,'browRidge',.5,0,1),eyes=26*bound(a,'eyeSpacing',1,.88,1.10);
 const nose=9*bound(a,'noseWidth',1,.7,1.3)*bound(a,'nasalWingWidth',1,.75,1.25);
 const noseY=180+(bound(a,'noseLength',1,.7,1.3)-1)*30;
 if(view==='side'){
  // Independent side relief estimate; not a projection of a scanned 3D head.
  const sx=(x+8)/(width*.75),sy=(y-48)/55;
  let z=26*Math.sqrt(Math.max(.03,1-sx*sx*.72-sy*sy*.74));
  z+=6*cheek*bell(x,y,4,59-(bone-1)*9,13,10);
  z-=5*bell(x,y,19,44,8,5);
  z+=3*ridge*bell(x,y,16,37,10,3);
  z-=3*bell(x,y,6,76,15,9);
  z+=3*bell(x,y,18,90,10,6);
  return z;
 }
 const fx=(x-160)/width,fy=(y-151)/101;
 let z=38*Math.sqrt(Math.max(.03,1-fx*fx*.80-fy*fy*.72));
 for(const side of[-1,1]){
  z-=5.5*bell(x,y,160+side*eyes,141,14,8);
  z+=3.4*ridge*bell(x,y,160+side*eyes,129,16,4);
  z+=6*cheek*bell(x,y,160+side*width*.57,166-(bone-1)*18,17,11);
  z-=3.5*bell(x,y,160+side*width*.64,195,14,18);
 }
 z+=8*bound(a,'noseBridge',1,.7,1.3)*bell(x,y,160,163,4*bound(a,'nasalRootWidth',1,.75,1.25),17);
 z+=12*bound(a,'noseTip',1,.75,1.25)*bell(x,y,160,noseY-2,nose*.62,6);
 z+=3*bell(x,y,160,199,21,11);
 z-=2*bell(x,y,160,214,18,3);
 z+=4*bell(x,y,160,228,19*bound(a,'chinWidth',1,.8,1.2),8);
 return z;
}
export function candidateFaceNormal(a,x,y,view='front'){
 const e=.5,dx=(candidateFaceDepth(a,x+e,y,view)-candidateFaceDepth(a,x-e,y,view))/(2*e);
 const dy=(candidateFaceDepth(a,x,y+e,view)-candidateFaceDepth(a,x,y-e,view))/(2*e);
 const len=Math.hypot(dx,dy,1);return[-dx/len,-dy/len,1/len];
}
const linear=v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4;
const srgb=v=>v<=.0031308?v*12.92:1.055*v**(1/2.4)-.055;
export function candidateFaceRaster(a,skin,view='front',resolution=192){
 const box=view==='side'?{x:-48,y:-7,width:99,height:114}:{x:83,y:57,width:154,height:191};
 const width=resolution,height=Math.round(resolution*box.height/box.width),pixels=new Uint8ClampedArray(width*height*4);
 const base=[1,3,5].map(i=>linear(parseInt(skin.slice(i,i+2),16)/255));
 const light=[-.47,-.42,.776],length=Math.hypot(...light);light.forEach((v,i)=>light[i]=v/length);
 for(let row=0;row<height;row++)for(let col=0;col<width;col++){
  const x=box.x+(col+.5)*box.width/width,y=box.y+(row+.5)*box.height/height;
  const normal=candidateFaceNormal(a,x,y,view),dot=Math.max(0,normal.reduce((s,v,i)=>s+v*light[i],0));
  const illumination=.36+.67*dot,specular=.012*Math.max(0,normal[0]*-.24+normal[1]*-.22+normal[2]*.945)**28;
  const at=(row*width+col)*4;
  for(let c=0;c<3;c++)pixels[at+c]=Math.round(255*srgb(Math.min(1,base[c]*illumination+specular)));
  pixels[at+3]=255;
 }
 return{box,width,height,pixels};
}
