// One saved person, one cached measured body, one complete shared head.
// Character views use the same physical camera/depth and lighting pipeline.
import {createPlayerBodyAnimation3d} from './playerBodyAnimation3d.js';
import {createBodyRenderer3d} from './playerBody3d.js';
import {buildHeadMesh3d,createHeadRenderer3d} from './playerHead3d.js';
import {appearanceSkinColor,appearanceHairColors,blendAppearanceColor} from './appearancePalette.js';
const sub=(a,b)=>a.map((v,i)=>v-b[i]),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),mul=(a,s)=>a.map(v=>v*s),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],unit=a=>mul(a,1/Math.hypot(...a));
let activeModels=0,activeViews=0;
export function characterRendererDiagnostics(){return{activeModels,activeViews};}
export function characterHeadPlacement(pose,anatomy){
 const up=unit(sub(pose.shoulder,pose.hip)),down=mul(up,-1),reference=Math.abs(down[0])<.9?[1,0,0]:[0,0,1],lateral=unit(sub(reference,mul(down,dot(reference,down)))),forward=unit(cross(lateral,up));
 return{axes:[...lateral,...up,...forward],origin:pose.shoulder.map((v,i)=>v+up[i]*(1.5+pose.skullHeight)),scale:pose.skullHeight/(anatomy.chinY-anatomy.crownY)};
}
export function createPlayerCharacterModel(player){
 const person=structuredClone(player),body=createPlayerBodyAnimation3d(person,{includeSkull:false});if(!body)return null;
 const a=person.appearance,hair=appearanceHairColors(a,person.age),skin=appearanceSkinColor(a),colors={skin,scalp:hair.scalp,brow:hair.brow,beard:hair.face,grayShare:hair.grayShare,iris:a.eyeColor,mouth:blendAppearanceColor(skin,'#8e4948',.35)};
 const head=buildHeadMesh3d(a,colors,{headOnly:true,identitySeed:person.id});let disposed=false;activeModels++;
 return{person,head,colors,diagnostics:{bodyConstructionCount:1,headConstructionCount:1,wholeUnionMassVerified:false},matchesPlayer:p=>body.matchesPlayer(p)&&p?.id===person.id&&p?.age===person.age,update(options){if(disposed)throw Error('Disposed character model');const mesh=body.update(options);return{mesh,placement:characterHeadPlacement(mesh.pose,head.anatomy)};},dispose(){if(disposed)return;disposed=true;body.dispose();activeModels--;}};
}
export function createPlayerCharacterView(canvas,model){
 let body,head,disposed=false;
 try{body=createBodyRenderer3d(canvas,{skinColor:model.colors.skin});head=createHeadRenderer3d(canvas,{transparent:true});activeViews++;}catch(error){body?.dispose();head?.dispose();throw error;}
 return{draw({mode='neutral',phase=0,angle=0,viewBox=[0,0,320,620],floor=570,blink=0}={}){
  if(disposed)throw Error('Disposed character view');if(viewBox.length!==4||!viewBox.every(Number.isFinite)||viewBox[2]<=0||viewBox[3]<=0||!Number.isFinite(floor))throw Error('Invalid character camera');
  const state=model.update({mode,phase}),span=viewBox[3]/6,margin=(viewBox[1]+viewBox[3]-floor)/6,extent=[viewBox[2]/12,viewBox[3]/12],centerX=(viewBox[0]+viewBox[2]/2-160)/6;
  body.draw(state.mesh,angle,{verticalSpanInches:span,floorMarginInches:margin,extent,centerX});
  head.draw(model.head,model.person.appearance,model.colors,angle,{blink,clear:false,physical:{...state.placement,extent,centerY:span/2-margin,centerX}});
  return{pose:state.mesh.pose,placement:state.placement,extent,centerX,centerY:span/2-margin};
 },dispose(){if(disposed)return;disposed=true;body.dispose();head.dispose();activeViews--;}};
}
export function mountPlayerCharacterViews(root,player){
 if(player?.appearance?.fineFaceVersion!=='fine-face-v1')return null;
 const targets=[...root.querySelectorAll('.player-physique-svg,.player-physique-side-svg,.player-motion-svg')];if(!targets.length)return null;
 let model;try{model=createPlayerCharacterModel(player);}catch{return null;}if(!model)return null;
 const views=new Map(),failed=new WeakSet();let disposed=false;
 const attach=svg=>{
  const fallback=svg.querySelector('.physique-athlete,.physique-side-athlete,[data-motion-content]');if(!fallback)return null;
  const foreign=document.createElementNS('http://www.w3.org/2000/svg','foreignObject'),canvas=document.createElement('canvas');canvas.dataset.playerCharacter3d='';canvas.setAttribute('aria-hidden','true');canvas.style.cssText='width:100%;height:100%;display:block;pointer-events:none';foreign.style.pointerEvents='none';foreign.append(canvas);
  let view;try{view=createPlayerCharacterView(canvas,model);}catch{return null;}
  const jersey=document.createElementNS('http://www.w3.org/2000/svg','text');jersey.textContent=player.jerseyNumber??'';jersey.setAttribute('text-anchor','middle');jersey.setAttribute('fill','#dce6e7');jersey.setAttribute('font-size','32');jersey.setAttribute('font-weight','800');jersey.setAttribute('font-family','system-ui');jersey.dataset.characterJersey='';
  const entry={view,canvas,foreign,fallback,svg,jersey};fallback.after(foreign);foreign.after(jersey);views.set(svg,entry);return entry;
 };
 const restore=entry=>{entry.view.dispose();entry.foreign.remove();entry.jersey.remove();entry.fallback.style.display='';delete entry.svg.dataset.characterRenderer;views.delete(entry.svg);};
 const draw=(svg,options={})=>{
  if(disposed||!svg?.isConnected||failed.has(svg))return false;let entry=views.get(svg)||attach(svg);if(!entry){failed.add(svg);return false;}
  try{
   const box=svg.getAttribute('viewBox').trim().split(/\s+/).map(Number),width=512,height=Math.round(width*box[3]/box[2]);
   if(entry.canvas.width!==width||entry.canvas.height!==height){entry.canvas.width=width;entry.canvas.height=height;}
   for(const[key,value]of Object.entries({x:box[0],y:box[1],width:box[2],height:box[3]}))entry.foreign.setAttribute(key,String(value));
   const state=entry.view.draw({...options,viewBox:box}),angle=options.angle??0,center=state.pose.shoulder.map((v,i)=>v+(state.pose.hip[i]-v)*.60),x=160+(center[0]*Math.cos(angle)+center[2]*Math.sin(angle))*6,y=(options.floor??570)-center[1]*6;
   entry.jersey.setAttribute('x',String(x));entry.jersey.setAttribute('y',String(y));entry.jersey.style.display=Math.cos(angle)>.85?'':'none';
   entry.fallback.style.display='none';svg.dataset.characterRenderer='shared-3d';return true;
  }catch{restore(entry);failed.add(svg);return false;}
 };
 // Static canvases are independent GPU views of the same cached person.
 for(const svg of targets.filter(s=>!s.classList.contains('player-motion-svg')))draw(svg,{angle:svg.classList.contains('player-physique-side-svg')?Math.PI/2:0});
 return{drawMotion(svg,{mode,phase,floor}){return draw(svg,{mode,phase,floor,angle:mode==='cut'?0:Math.PI/2});},diagnostics:model.diagnostics,dispose(){if(disposed)return;disposed=true;for(const entry of [...views.values()])restore(entry);model.dispose();}};
}
