import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
test('shared current person shader keeps pigment order and bounded skin/cloth/eye response',async({page})=>{
 await page.goto('/');await expect(page.locator('#setupStatus')).toContainText('Ready');
 const report=await page.evaluate(async()=>{
  const {characterSurfaceLightingGlsl}=await import('/lib/playerSurfaceLighting.js');
  const canvas=document.createElement('canvas');canvas.width=canvas.height=8;
  const gl=canvas.getContext('webgl',{antialias:false,preserveDrawingBuffer:true});if(!gl)throw Error('No WebGL');
  const shaders=[],compile=(kind,source)=>{const s=gl.createShader(kind);shaders.push(s);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
  const program=gl.createProgram();
  gl.attachShader(program,compile(gl.VERTEX_SHADER,'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}'));
  gl.attachShader(program,compile(gl.FRAGMENT_SHADER,`precision highp float;uniform vec3 pigment;uniform vec3 normal;uniform vec3 material;${characterSurfaceLightingGlsl}void main(){gl_FragColor=vec4(characterNaturalSurfaceLight(pigment,normalize(normal),material.x,material.y,material.z),1.);}`));
  gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);
  const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
  const at=gl.getAttribLocation(program,'p');gl.enableVertexAttribArray(at);gl.vertexAttribPointer(at,2,gl.FLOAT,false,0,0);
  const draw=(color,normal,wetness=0,skin=1,occlusion=1)=>{
   gl.uniform3fv(gl.getUniformLocation(program,'pigment'),color);gl.uniform3fv(gl.getUniformLocation(program,'normal'),normal);gl.uniform3f(gl.getUniformLocation(program,'material'),wetness,skin,occlusion);
   gl.drawArrays(gl.TRIANGLES,0,6);const pixel=new Uint8Array(4);gl.readPixels(4,4,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);if(gl.getError()!==gl.NO_ERROR)throw Error('GL error');return [...pixel];
  };
  const normals=[[0,0,1],[-1,0,0],[1,0,0],[0,1,0],[0,-1,0],[0,0,-1],[-.65,.75,1]],colors=['#382420','#593629','#8e634b','#c38e6e','#f0ceb4'];
  const rgb=s=>[1,3,5].map(i=>parseInt(s.slice(i,i+2),16)/255),rows=[];
  try{
   for(const normal of normals)for(const [kind,wetness,skin]of [['skin',0,1],['cloth',0,0],['eye',1,0]]){
    let previous=null;for(const color of colors){const pixel=draw(rgb(color),normal,wetness,skin),scaled=draw(rgb(color),normal.map(v=>v*17),wetness,skin),shadow=draw(rgb(color),normal,wetness,skin,.65);
     if(pixel[3]!==255||pixel.slice(0,3).some(v=>v===0||v===255))throw Error('Pigment clipped '+color+' '+kind);
     if(pixel.some((v,i)=>Math.abs(v-scaled[i])>1))throw Error('Normal scale changed material');
     if(shadow.slice(0,3).some((v,i)=>v>pixel[i]))throw Error('Occlusion brightened material');
     if(previous&&pixel.slice(0,3).some((v,i)=>v<=previous[i]))throw Error('Pigment ordering lost');
     rows.push({normal,kind,color,pixel,shadow});previous=pixel;
    }
   }
   return{rows,shaderCompiled:true,glErrors:0,scope:'105 controlled GPU material swatches, not biological or full character visual acceptance'};
  }finally{gl.deleteBuffer(buffer);gl.deleteProgram(program);shaders.forEach(s=>gl.deleteShader(s));}
 });
 expect(report.rows).toHaveLength(105);await fs.mkdir('output/playwright',{recursive:true});await fs.writeFile('output/playwright/person-material-swatches.json',JSON.stringify(report,null,2)+'\n');
});
