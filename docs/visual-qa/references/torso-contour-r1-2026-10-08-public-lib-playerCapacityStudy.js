// Artistic capacity demonstrations, not measured workouts or fitted physiology.
// Bone lengths and body dimensions always come from the shared measured frame.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const physical=(player,key)=>(clamp(Number.isFinite(player?.ratings?.[key])?player.ratings[key]:70,40,99)-40)/59;
const smooth=t=>t*t*(3-2*t);
const point=(x,y)=>({x,y});

export function enduranceStudy(player,profile,elapsedSeconds){
 const seconds=Math.max(0,Number.isFinite(elapsedSeconds)?elapsedSeconds:0);
 const stamina=physical(player,'stamina'),limit=.10+.55*(1-stamina);
 const t=clamp((seconds-8)/52,0,1),fatigue=limit*smooth(t);
 // Integral of the cadence reduction keeps belt/feet continuous as pace fades.
 const integral=t*t*t-.5*t*t*t*t;
 const fatigueIntegral=limit*(52*integral+Math.max(0,seconds-60));
 return {seconds,fatigue,cadence:profile.cadence*(1-.20*fatigue),
  strideFraction:profile.strideFraction,
  cycles:profile.cadence*(seconds-.20*fatigueIntegral),
  paceFraction:1-.20*fatigue,
  stage:seconds<8?'Settling into pace':seconds<60?'Sustained effort':'Continuing effort'};
}

export function solveStrengthStudy(player,dimensions,phase,{solveLimb}){
 const {floor,skull,torso,legLength,armLength,handLength,profile,upperLegShare,upperArmShare}=dimensions;
 const p=((Number.isFinite(phase)?phase:0)%1+1)%1,strength=physical(player,'strength');
 const depth=p<.42?smooth(p/.42):p<.52?1:p<.92?1-smooth((p-.52)/.40):0;
 const hip=point(160+legLength*.03*depth,floor-15-legLength*(.92-.20*depth));
 const lean=(4+15*depth)*Math.PI/180;
 const shoulder=point(hip.x+Math.sin(lean)*torso,hip.y-Math.cos(lean)*torso);
 const transverse=(limb,depth)=>Object.fromEntries(Object.entries(limb).map(([key,value])=>[key,value&&typeof value==='object'?{...value,z:depth}:value]));
 const legs=[-1,1].map(side=>{const limb={...solveLimb(hip,point(160+side*legLength*.10,floor-15),legLength*upperLegShare,legLength*(1-upperLegShare),-1),contact:true};return dimensions.rig?transverse(limb,side*dimensions.rig.hipHalf):limb;});
 const arms=[-1,1].map(side=>{
  const visualOffset=dimensions.rig?0:side*3;
  const root=point(shoulder.x+visualOffset,shoulder.y);
  const target=point(shoulder.x+armLength*.20+visualOffset,shoulder.y+armLength*.60);
  const arm=solveLimb(root,target,armLength*upperArmShare,armLength*(1-upperArmShare),-1);
  const limb={...arm,hand:point(arm.end.x,arm.end.y+handLength)};return dimensions.rig?transverse(limb,side*dimensions.rig.shoulderHalf):limb;
 });
 const duration=4.8-1.8*strength;
 const drill={duration,stage:p<.42?'Lowering':p<.52?'Bottom hold':p<.92?'Driving upward':'Standing reset',
  resistanceDisplay:.06+.14*strength};
 return {version:'artistic-resistance-squat-v1',mode:'strength',phase:p,profile,drill,hip,shoulder,legs,arms,
  floor,skull,torso,lean,legLength,armLength,handLength,flight:false,beltOffset:0};
}
