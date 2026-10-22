// Saved presentation phase animates actual lids; no football/randomness calls.
import {tryPlayerHeadImage} from './playerHeadImage.js';
const mounted=new WeakMap();let active=0;
export function portraitBlinkPose(seconds,delay=0){
 if(!Number.isFinite(seconds)||!Number.isFinite(delay))return 0;
 const phase=((seconds+delay)%5.6+5.6)%5.6;
 if(phase<5.28)return 0;
 const amount=phase<5.40?(phase-5.28)/.12:phase<5.48?1:1-(phase-5.48)/.12;
 return Math.max(0,Math.min(1,Math.round(amount*4)/4));
}
export function portraitMotionDiagnostics(){return{mounted:active};}
export function mountPlayerPortraitMotion(root,player){
 mounted.get(root)?.();
 const image=root.querySelector('.player-portrait-card .player-shared-head-image');
 if(!image||typeof IntersectionObserver==='undefined')return()=>{};
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 const delay=Number.isFinite(player?.appearance?.blinkDelay)?player.appearance.blinkDelay:0;
 const neutral=image.getAttribute('href');
 let disposed=false,visible=false,handle=null,previous=null,elapsed=0,pose=0;
 image.dataset.blinkPose='0';active++;
 const paint=value=>{if(value===pose)return;const projection=value===0?{src:neutral}:tryPlayerHeadImage(player,{blink:value});if(!projection)return;pose=value;image.setAttribute('href',projection.src);image.dataset.blinkPose=String(value);};
 const stop=()=>{if(handle!=null)cancelAnimationFrame(handle);handle=null;previous=null;};
 const frame=time=>{
  handle=null;if(disposed||!image.isConnected||!visible||reduced.matches||document.hidden)return;
  if(previous!=null)elapsed+=Math.min(100,time-previous)/1000;previous=time;
  paint(portraitBlinkPose(elapsed,delay));handle=requestAnimationFrame(frame);
 };
 const sync=()=>{stop();if(disposed)return;if(reduced.matches||!visible||document.hidden)paint(0);else handle=requestAnimationFrame(frame);};
 const cleanup=()=>{if(disposed)return;disposed=true;stop();intersection.disconnect();mutation.disconnect();reduced.removeEventListener('change',sync);document.removeEventListener('visibilitychange',sync);mounted.delete(root);active--;};
 const intersection=new IntersectionObserver(entries=>{visible=entries[0]?.isIntersecting===true;sync();});
 const mutation=new MutationObserver(()=>{if(!image.isConnected)cleanup();});
 intersection.observe(image);mutation.observe(document.body,{childList:true,subtree:true});
 reduced.addEventListener('change',sync);document.addEventListener('visibilitychange',sync);
 mounted.set(root,cleanup);return cleanup;
}
