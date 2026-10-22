// Proprietary experimental character geometry. Not a production decoder.
// One saved-trait mesh supplies every camera view; all dimensions are artistic.
const clamp=(v,l,h)=>Math.max(l,Math.min(h,v));
const value=(a,k,d,l=.7,h=1.3)=>Number.isFinite(a[k])?clamp(a[k],l,h):d;
const gaussian=(x,y,cx,cy,rx,ry)=>Math.exp(-.5*(((x-cx)/rx)**2+((y-cy)/ry)**2));
const normalize=v=>{const m=Math.hypot(...v)||1;return v.map(x=>x/m);};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const subtract=(a,b)=>a.map((v,i)=>v-b[i]);
const rgb=c=>[1,3,5].map(i=>parseInt(c.slice(i,i+2),16)/255);
const hash=s=>{let h=2166136261;for(const c of s)h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;};

export function headAnatomy3d(a={}){
 const g={width:59*value(a,'faceWidth',1,.88,1.10),jaw:47.5*value(a,'jawWidth',1,.8,1.16),
  chin:24.8*value(a,'chinWidth',1,.8,1.2),chinY:241+(value(a,'chinLength',1,.85,1.12)-1)*22,
  eyeOffset:26*value(a,'eyeSpacing',1,.88,1.10),eyeY:141,
  noseY:180+(value(a,'noseLength',1)-1)*30,noseWidth:9*value(a,'noseWidth',1)*value(a,'nasalWingWidth',1,.75,1.25),
  skullDepth:55*value(a,'headDepth',1,.85,1.15),brow:value(a,'browRidge',.5,0,1)};
 g.stations=[[65,0],[82,g.width*.65],[108,g.width],[150,g.width*.99],[176,g.width*.94],[208,g.jaw],[231,g.chin],[g.chinY,0]];
 return g;
}
function breadthAt(g,y){
 const stations=g.stations;
 for(let i=1;i<stations.length;i++)if(y<=stations[i][0]){
  const[p,w]=stations[i-1],[q,z]=stations[i],t=clamp((y-p)/(q-p),0,1);
  const before=stations[Math.max(0,i-2)],after=stations[Math.min(stations.length-1,i+1)];
  const first=(z-before[1])/(q-before[0]),last=(after[1]-w)/(after[0]-p);
  return Math.max(0,(2*t*t*t-3*t*t+1)*w+(t*t*t-2*t*t+t)*(q-p)*first+(-2*t*t*t+3*t*t)*z+(t*t*t-t*t)*(q-p)*last);
 }return 0;
}
export function headPoint3d(a,angle,y){
 return headPointWithAnatomy(a,headAnatomy3d(a),angle,y);
}
function headPointWithAnatomy(a,g,angle,y){
 const w=breadthAt(g,y),s=Math.sin(angle),c=Math.cos(angle),x=w*s;
 const middle=(65+g.chinY)/2,vertical=(y-middle)/((g.chinY-65)/2);
 const jawShift=18*clamp((y-208)/(g.chinY-208),0,1);
 let z=jawShift+g.skullDepth*Math.sqrt(Math.max(0,1-vertical*vertical))*c;
 const transition=clamp(c*3,0,1),face=transition*transition*(3-2*transition),base=z;
 if(face){
  for(const side of[-1,1]){
   z-=5.5*gaussian(x,y,side*g.eyeOffset,141,14,8);
   z+=1.6*gaussian(x,y,side*g.eyeOffset,141,9,3.4);
   z+=.9*gaussian(x,y,side*g.eyeOffset,137.5,10,1.4)+.6*gaussian(x,y,side*g.eyeOffset,144,10,1.4);
   z+=3.5*g.brow*gaussian(x,y,side*g.eyeOffset,130,16,4);
   z+=5*value(a,'cheekFullness',1,.75,1.25)*gaussian(x,y,side*g.width*.57,166-(value(a,'cheekbone',1)-1)*18,17,11);
   z-=2.5*gaussian(x,y,side*g.width*.64,194,14,17);
  }
  z+=9*value(a,'noseBridge',1)*gaussian(x,y,0,163,4*value(a,'nasalRootWidth',1,.75,1.25),17);
  z+=18*value(a,'noseTip',1,.75,1.25)*gaussian(x,y,0,g.noseY-2,g.noseWidth*.62,6);
  z+=3*gaussian(x,y,0,199,20,10)-2*gaussian(x,y,0,214,18,3)+4*gaussian(x,y,0,227,g.chin*.7,8);
  z+=1.3*value(a,'upperLipScale',1,.65,1.4)*gaussian(x,y,0,201,17,1.6)+1.8*value(a,'lowerLipScale',1,.65,1.4)*gaussian(x,y,0,208,15,2);
  z=base+(z-base)*face;
 }
 return[x,(151-y),z];
}
// A single connected surface with numerical tangent normals; camera transforms
// never reconstruct the person or use simulation RNG.
export function buildHeadMesh3d(a,colors,{rings=64,slices=96}={}){
 if(!Number.isInteger(rings)||rings<16||rings>96||!Number.isInteger(slices)||slices<24||slices>128)throw Error('Prototype tessellation outside bounded range');
 const g=headAnatomy3d(a),vertices=[],indices=[],parts=[];
 const point=(angle,y)=>headPointWithAnatomy(a,g,angle,y);
 const addSurface=(name,surface,color,rows,columns,material=0)=>{
  const begin=indices.length,base=vertices.length/10;
  const sample=(u,v)=>{
   const p=surface(u,v),e=.0001;
   const du=subtract(surface(u+e,v),surface(u-e,v)),dv=subtract(surface(u,v+e),surface(u,v-e));
   let normal=normalize(cross(dv,du));if(normal.every(x=>x===0))normal=[0,1,0];
   return [...p,...normal,...rgb(color),material];
  };
  for(let r=0;r<=rows;r++)for(let c=0;c<=columns;c++)vertices.push(...sample(c/columns,r/rows));
  for(let r=0;r<rows;r++)for(let c=0;c<columns;c++){
   const p=base+r*(columns+1)+c,q=p+1,s=p+columns+1,t=s+1;indices.push(p,s,q,q,s,t);
  }parts.push({name,firstIndex:begin,indexCount:indices.length-begin});
 };
 const head=(u,v)=>point((u-.5)*Math.PI*2,65+clamp(v,0,1)*(g.chinY-65));
 addSurface('skin',head,colors.skin,rings,slices);
 const ellipsoid=(center,axes)=>(u,v)=>{const t=u*2*Math.PI,p=v*Math.PI;return[center[0]+axes[0]*Math.sin(p)*Math.sin(t),center[1]+axes[1]*Math.cos(p),center[2]+axes[2]*Math.sin(p)*Math.cos(t)];};
 for(const side of[-1,1]){
  addSurface(`ear-${side}`,ellipsoid([side*(g.width+2),1,0],[7*value(a,'earSize',1),15*value(a,'earShape',1),8]),colors.skin,24,32);
  addSurface(`ear-inner-${side}`,ellipsoid([side*(g.width+4),1,6],[3.2,9,2]),colors.skin,16,24);
 }
 addSurface('neck',(u,v)=>{const angle=u*2*Math.PI,radius=23+clamp(v,0,1)*9;return[Math.sin(angle)*radius,-65-v*78,-4+Math.cos(angle)*radius];},colors.skin,12,40);
 addSurface('training-top',ellipsoid([0,-156,-5],[77,33,39]),colors.jersey||'#19364c',20,48,2);
 const hair=a.hairstyle||'buzz';
 if(hair!=='shaved'){
  const height={buzz:1,fade:3,crew:7,waves:2,'short-curls':10,coils:10,afro:20,'side-part':9,swept:13,long:10,locs:6,braids:4,receding:1}[hair]||3;
  const hairSurface=(u,v)=>{
   const angle=(u-.5)*Math.PI*2;
   const front=Math.max(0,Math.cos(angle));
   const border=hair==='receding'?94-front*18:125-front*39+value(a,'hairline',0,0,1)*6;
   const y=65+v*(border-65),p=point(angle,y);
   const lift=height*(.45+.55*Math.sin(Math.PI*v));
   const normal=normalize([p[0],p[1],p[2]]);
   return p.map((x,i)=>x+normal[i]*lift);
  };
  addSurface('scalp-hair',hairSurface,colors.scalp,32,80,1);
  // Surface strands follow the same crown, grouped into varying lengths.
  const count=['locs','braids'].includes(hair)?24:['coils','afro','short-curls'].includes(hair)?220:100;
  for(let i=0;i<count;i++){
   const h=hash(`${a.version}:${a.faceWidth}:${a.hairTexture}:${i}`),u=(h%1009)/1009,v=((h>>>10)%997)/997;
   const p=hairSurface(u,v),radius=['locs','braids'].includes(hair)?2.7:['afro','coils','short-curls'].includes(hair)?2.1:.5;
   const length=['locs','long'].includes(hair)?24+((h>>>18)%25):2.5+((h>>>18)%9);
   if(['coils','afro','short-curls'].includes(hair))addSurface(`hair-lock-${i}`,ellipsoid(p,[radius,radius*1.3,radius]),colors.scalp,5,7,1);
   else{
    const normal=normalize([p[0],p[1],p[2]]),hanging=['locs','long'].includes(hair),end=hanging?[p[0]*1.18,p[1]-length*1.7,p[2]*1.06]:p.map((x,k)=>x+normal[k]*length*.15);
    const tangent=normalize(subtract(end,p)),axis=normalize(cross(tangent,[0,0,1])),other=normalize(cross(tangent,axis));
    addSurface(`hair-lock-${i}`,(u,v)=>{const t=u*2*Math.PI,rad=radius*(1-.3*v);return p.map((x,k)=>x+(end[k]-x)*v+rad*(axis[k]*Math.cos(t)+other[k]*Math.sin(t)));},colors.scalp,8,7,1);
   }
  }
 }
 const data=new Float32Array(vertices);
 if(data.some(x=>!Number.isFinite(x)))throw Error('Non-finite head mesh');
 if(data.length/10>65535)throw Error('Prototype exceeds 16-bit vertex budget');
 return{version:'shared-head-3d-prototype-v2',anatomy:g,vertices:data,indices:new Uint16Array(indices),parts,triangles:indices.length/3};
}

export function createHeadRenderer3d(canvas){
 const gl=canvas.getContext('webgl',{antialias:true,alpha:false,preserveDrawingBuffer:true});if(!gl)throw Error('WebGL unavailable');
 const vertex=`attribute vec3 p;attribute vec3 n;attribute vec3 c;attribute float m;
 uniform vec2 rotation;uniform vec2 extent;varying vec3 normal;varying vec3 color;varying vec3 local;varying float material;
 void main(){float cs=rotation.x,sn=rotation.y;vec3 q=vec3(p.x*cs+p.z*sn,p.y,-p.x*sn+p.z*cs);
 normal=vec3(n.x*cs+n.z*sn,n.y,-n.x*sn+n.z*cs);local=p;color=c;material=m;
 gl_Position=vec4(q.x/extent.x,(q.y+10.0)/extent.y,-q.z/180.0,1.0);}`;
 const fragment=`precision highp float;varying vec3 normal;varying vec3 color;varying vec3 local;varying float material;
 uniform vec3 iris;uniform vec3 brow;uniform vec3 beard;uniform vec4 features;uniform vec3 mouth;uniform float beardStyle;uniform vec2 nose;
 float oval(vec2 p,vec2 c,vec2 r){vec2 q=(p-c)/r;return dot(q,q);}
 void main(){vec3 pigment=color;vec2 xy=vec2(local.x,151.0-local.y);
 if(material<.5&&local.z>28.0){
 for(int i=0;i<2;i++){float s=i==0?-1.0:1.0;vec2 center=vec2(s*features.x,141.0);
 float eye=oval(xy,center,vec2(10.0,2.8*features.y));
 if(eye<1.15)pigment=mix(pigment,brow,.48);
 if(eye<1.0){pigment=vec3(.83,.81,.76);float ir=oval(xy,center,vec2(3.1,3.5));if(ir<1.0)pigment=iris*(.8+.2*sin(xy.x*9.0));if(ir<.16)pigment=vec3(.035);if(oval(xy,center+vec2(-.8,-1.1),vec2(.55))<1.0)pigment=vec3(.93);}
 float eyebrow=oval(xy,center+vec2(0.,-9.0),vec2(13.,1.5));if(eyebrow<1.0)pigment=mix(pigment,brow,.7+.25*fract(sin(xy.x*17.)*213.1));
 }
 float lips=oval(xy,vec2(0.,204.),vec2(features.z,features.w));if(lips<1.0)pigment=mix(pigment,mouth,.72);
 if(abs(xy.y-204.0)<.6&&abs(xy.x)<features.z)pigment*=.43;
 float nostril=min(oval(xy,vec2(-nose.y*.66,nose.x+4.),vec2(2.3,1.3)),oval(xy,vec2(nose.y*.66,nose.x+4.),vec2(2.3,1.3)));if(nostril<1.0)pigment*=.4;
 if(beardStyle>0.0){float grain=fract(sin(dot(xy,vec2(12.9898,78.233)))*43758.5453);float coverage=beardStyle>.7?.80:.22;
 float cheekEdge=smoothstep(193.,211.,xy.y)+smoothstep(20.,45.,abs(xy.x))*smoothstep(174.,194.,xy.y);
 float mouthClear=smoothstep(.7,1.2,oval(xy,vec2(0.,203.),vec2(features.z+2.,9.)));
 pigment=mix(pigment,beard,clamp(cheekEdge,0.,1.)*mouthClear*coverage*(.75+.25*grain));}
 }
 vec3 N=normalize(normal);vec3 L=normalize(vec3(-.5,.6,1.0));float diffuse=max(0.,dot(N,L));
 vec3 lit=pow(pigment,vec3(2.2))*(.32+.78*diffuse)+vec3(.007)*pow(max(0.,dot(N,normalize(vec3(-.2,.3,1.0)))),32.0);
 gl_FragColor=vec4(pow(lit,vec3(1.0/2.2)),1.0);}`;
 const shader=(kind,source)=>{const s=gl.createShader(kind);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
 const program=gl.createProgram(),vs=shader(gl.VERTEX_SHADER,vertex),fs=shader(gl.FRAGMENT_SHADER,fragment);gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
 const buffer=gl.createBuffer(),indexBuffer=gl.createBuffer();let disposed=false,uploaded=null;
 const location=k=>gl.getUniformLocation(program,k);
 const draw=(mesh,a,colors,angle=0,{blink=0}={})=>{
  if(!Number.isFinite(angle)||!Number.isFinite(blink))throw Error('Non-finite presentation pose');
  if(disposed)throw Error('Disposed renderer');gl.viewport(0,0,canvas.width,canvas.height);gl.clearColor(.065,.10,.12,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.enable(gl.DEPTH_TEST);gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,indexBuffer);if(uploaded!==mesh){gl.bufferData(gl.ARRAY_BUFFER,mesh.vertices,gl.STATIC_DRAW);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,mesh.indices,gl.STATIC_DRAW);uploaded=mesh;}
  for(const[name,size,offset]of[['p',3,0],['n',3,12],['c',3,24],['m',1,36]]){const at=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(at);gl.vertexAttribPointer(at,size,gl.FLOAT,false,40,offset);}
  gl.uniform2f(location('rotation'),Math.cos(angle),Math.sin(angle));gl.uniform2f(location('extent'),110,110*canvas.height/canvas.width);
  for(const key of['iris','brow','beard','mouth'])gl.uniform3fv(location(key),rgb(colors[key]));
  gl.uniform4f(location('features'),mesh.anatomy.eyeOffset,value(a,'eyeAperture',1,.7,1.2)*(1-.94*clamp(blink,0,1)),20*value(a,'lipWidth',1),4.5*value(a,'lipFullness',1,.75,1.25));
  gl.uniform2f(location('nose'),mesh.anatomy.noseY,mesh.anatomy.noseWidth);
  gl.uniform1f(location('beardStyle'),a.facialHair==='clean'?0:a.facialHair==='stubble'?.4:1);
  gl.drawElements(gl.TRIANGLES,mesh.indices.length,gl.UNSIGNED_SHORT,0);if(gl.getError()!==gl.NO_ERROR)throw Error('WebGL draw error');
  return{triangles:mesh.triangles,meshBytes:mesh.vertices.byteLength+mesh.indices.byteLength};
 };
 return{draw,dispose(){if(disposed)return;disposed=true;gl.deleteBuffer(buffer);gl.deleteBuffer(indexBuffer);gl.deleteProgram(program);gl.deleteShader(vs);gl.deleteShader(fs);},readPixels(){const pixels=new Uint8Array(canvas.width*canvas.height*4);gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return pixels;}};
}
