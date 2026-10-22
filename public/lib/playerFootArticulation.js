// Swing-foot pitch follows the saved ankle/knee pose. Contact keeps a flat
// sole; low-clearance swing limits pitch so the toe/heel cannot enter the floor.
export function playerFootFrame(leg,frame,mode='neutral') {
  let pitch=0;
  if(mode!=='neutral'&&leg.contact===false){
    const shin=Math.atan2(leg.joint[2]-leg.end[2],leg.joint[1]-leg.end[1]);
    const clearance=Math.max(0,leg.end[1]-2.5),length=frame.footLengthInches;
    const toeLimit=Math.asin(Math.min(1,clearance/(length*.73))),heelLimit=Math.asin(Math.min(1,clearance/(length*.27)));
    pitch=Math.max(-Math.min(.5,heelLimit),Math.min(.6,toeLimit,shin*.5));
  }
  const c=Math.cos(pitch),s=Math.sin(pitch);
  return{lateral:[1,0,0],d:[0,c,s],depth:[0,-s,c],pitch};
}
