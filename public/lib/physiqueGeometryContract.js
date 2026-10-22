// Artistic external anatomy profiles, not measured NFL tissue distributions.
// Both the mass solver and renderer use these normalized section landmarks.
// Widths interpolate with cubic smoothstep; integration is analytic over each
// segment, matching the rounded outlines used by the renderer.
export const REGIONAL_ANATOMY_VERSION = 'visual-regional-anatomy-v2';
export const TORSO_SECTION_VERSION = 'artistic-regional-sections-v1';
export const LIMB_SECTION_VERSION = 'artistic-limb-sections-v1';
const denseRows=(rows,min,max)=>Array.isArray(rows)&&rows.length>=min&&rows.length<=max
  &&Array.from({length:rows.length},(_,i)=>Object.hasOwn(rows,i)).every(Boolean);
const finiteTuple=row=>denseRows(row,3,3)&&Array.prototype.every.call(row,Number.isFinite);
// Physical breadth/depth sections around linked bone centers. Projections
// share one validated section authority and normalize by frontal peak size.
export function projectedLimbSections(frame,kind,projection='front') {
  if(frame?.limbSectionVersion!==LIMB_SECTION_VERSION || !['arm','leg'].includes(kind) || !['front','side'].includes(projection))return null;
  const sections=frame[kind==='arm'?'armSections':'legSections'],reference=frame[kind==='arm'?'upperArmWidth':'thighWidth'];
  const joint=frame[kind==='arm'?'upperArmShare':'upperLegShare']??(kind==='arm'?.53:.51);
  if(!Number.isFinite(joint)||joint<.45||joint>.58)return null;
  if(!Number.isFinite(reference)||reference<=0||reference>40||!denseRows(sections,5,5))return null;
  if(sections.some((s,i)=>!finiteTuple(s)||s[0]<0||s[0]>1
    ||s[1]<=0||s[1]>40||s[2]<=0||s[2]>40||(i&&s[0]<=sections[i-1][0]))
    ||sections[0][0]!==0||sections.at(-1)[0]!==1||Math.abs(sections[2][0]-joint)>1e-8
    ||Math.abs(Math.max(...sections.map(s=>s[1]))-reference)>1e-8)return null;
  return sections.map(s=>[s[0],s[projection==='front'?1:2]/reference]);
}
export const EXTENDED_BODY_MEASUREMENT_VERSION = 'extended-body-measurements-v1';
// Engineering support envelope, not athlete percentiles or biological limits.
export function bodyMeasurementBounds(frame) {
  return frame?.bodyMeasurementVersion === EXTENDED_BODY_MEASUREMENT_VERSION
    ? {height:[62,96],weight:[100,650],reach:[58,116],arm:[22,50],handSpan:[6,14]}
    : {height:[62,86],weight:[140,400],reach:[58,98],arm:[22,42],handSpan:[6,12]};
}
// Shared camera-independent skeleton for the current regional decoder.
// Soft-tissue width never locates a bone center. Legacy recipes retain their
// original geometry; malformed required dimensions retain renderer fallback.
export function measuredBodyRig(frame, {unit=6,floor=570}={}) {
  if(frame?.torsoSectionVersion!==TORSO_SECTION_VERSION || !Number.isFinite(unit) || unit<=0 || !Number.isFinite(floor))return null;
  if(frame?.measurementFit?.status==='unsupported')return null;
  const keys=['heightInches','torsoShare','armLengthInches','shoulderSpanInches'];
  if(keys.some(key=>!Number.isFinite(frame[key])))return null;
  const bounded=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
  const bounds=bodyMeasurementBounds(frame);
  const height=bounded(frame.heightInches,...bounds.height),skull=(9.4+(height-74)*.035)*unit;
  const torso=height*bounded(frame.torsoShare,.25,.36)*unit;
  // Unknown longitudinal hand length stays unknown in the saved frame;
  // presentation uses the existing explicit stature-based estimate.
  const handLength=bounded(Number.isFinite(frame.handLengthInches)?frame.handLengthInches:height*.1,4,12)*unit;
  const armLength=Math.max(2*unit, bounded(frame.armLengthInches,...bounds.arm)*unit-handLength);
  const legLength=height*unit-skull-1.5*unit-torso-2.5*unit;
  const anatomy=renderableIndividualAnatomy(frame);
  const hipHalf=anatomy.hipJointSpanInches!=null?anatomy.hipJointSpanInches*unit/2
    :anatomy.pelvicBreadthInches!=null?anatomy.pelvicBreadthInches*unit*.38:legLength*.075;
  const shoulderHalf=bounded(frame.shoulderSpanInches,12,24)*unit/2;
  const shoulderY=floor-height*unit+skull+1.5*unit,hipY=shoulderY+torso;
  return {version:'measured-body-rig-v1',unit,floor,height,skull,torso,handLength,armLength,legLength,
    shoulderHalf,hipHalf,shoulderY,hipY,upperArmShare:anatomy.upperArmShare??.53,upperLegShare:anatomy.upperLegShare??.51};
}
export function neutralMeasuredPose(frame, options={}) {
  const rig=measuredBodyRig(frame,options);if(!rig)return null;
  const {unit,shoulderY,hipY,shoulderHalf,hipHalf,armLength,handLength,legLength,upperArmShare,upperLegShare}=rig;
  const width=projectedTorsoSections(frame,'front',unit);
  const halfWidth=width?Math.max(...width.map(row=>row[1]/2)):shoulderHalf;
  const diameter=Number.isFinite(frame.upperArmWidth)?frame.upperArmWidth*unit:0;
  // A bounded relaxed abduction clears bulk without moving shoulder centers.
  const angle=Math.min(.65,Math.max(.08,Math.atan2(Math.max(0,halfWidth+diameter*.3-shoulderHalf),armLength*.65)));
  const p=(x,y,z=0)=>({x,y,z});
  const arms=[-1,1].map(side=>{
    const root=p(160+side*shoulderHalf,shoulderY);
    const joint=p(root.x+side*Math.sin(angle)*armLength*upperArmShare,root.y+Math.cos(angle)*armLength*upperArmShare);
    const foreAngle=angle+.08;
    const end=p(joint.x+side*Math.sin(foreAngle)*armLength*(1-upperArmShare),joint.y+Math.cos(foreAngle)*armLength*(1-upperArmShare));
    const hand=p(end.x+side*Math.sin(foreAngle)*handLength,end.y+Math.cos(foreAngle)*handLength);
    return {root,joint,end,hand};
  });
  const legs=[-1,1].map(side=>{const root=p(160+side*hipHalf,hipY);return {root,joint:p(root.x,hipY+legLength*upperLegShare),end:p(root.x,hipY+legLength)};});
  return {...rig,arms,legs};
}
// Product of two independently interpolated smoothstep dimensions. This is
// the exact integral used by both the mass proxy and the drawn cross-sections,
// not an empirical composition estimate.
export function torsoSectionIntegral(sections) {
  let integral=0;
  for(let i=1;i<sections.length;i++){
    const [t,a,b]=sections[i-1],[end,c,d]=sections[i],dw=c-a,dd=d-b;
    integral+=(end-t)*(a*b+(a*dd+b*dw)/2+13/35*dw*dd);
  }
  return integral;
}
export function projectedTorsoSections(frame,projection,unit=6) {
  const sections=frame?.torsoSections;
  if(frame?.torsoSectionVersion!==TORSO_SECTION_VERSION || !['front','side'].includes(projection)
    || !Number.isFinite(unit) || unit<=0 || !denseRows(sections,3,8)) return null;
  if(sections.some((s,i)=>!finiteTuple(s)
    || s[0]<0||s[0]>1||s[1]<=0||s[1]>50||s[2]<=0||s[2]>50
    || (i && s[0]<=sections[i-1][0])) || sections[0][0]!==0 || sections.at(-1)[0]!==1) return null;
  // Renderers share 1..40-inch chest limits. Conflicting optional section
  // endpoints must conceal the new controls and keep the torso fallback,
  // rather than sending inconsistent anchors to an empty surface path.
  const width=frame.chestWidthInches,depth=frame.chestDepthInches;
  if(![width,depth].every(v=>Number.isFinite(v)&&v>=1&&v<=40)
    || Math.abs(sections[0][1]-width)>1e-8 || Math.abs(sections[0][2]-depth)>1e-8)return null;
  // Canonicalize accepted sub-tolerance differences before unit conversion;
  // otherwise a tiny inch residual can exceed the path's pixel tolerance.
  const anchor=projection==='front'?width:depth,index=projection==='front'?1:2;
  return sections.map((s,i)=>[s[0],(i===0?anchor:s[index])*unit]);
}
// Incomplete/imported presentation DTOs need the same optional-field bounds
// for static geometry, IK and articulated surfaces. Invalid values conceal
// the new control and retain the legacy estimate; never mutate the DTO.
export function renderableIndividualAnatomy(frame) {
  const bounded = (key, lo, hi) => Number.isFinite(frame?.[key]) ? Math.max(lo, Math.min(hi, frame[key])) : undefined;
  return {
    upperArmShare: bounded('upperArmShare', .45, .58),
    upperLegShare: bounded('upperLegShare', .45, .58),
    pelvicBreadthInches: bounded('pelvicBreadthInches', 7, 15),
    hipJointSpanInches: bounded('hipJointSpanInches', 5, 12),
    footLengthInches: bounded('footLengthInches', 7, 16),
    footWidthInches: bounded('footWidthInches', 2.5, 6)
  };
}
export function limbSectionProfile(kind, variation = 0, jointShare) {
  const v = Math.max(-.12, Math.min(.12, Number.isFinite(variation) ? variation : 0));
  if (Number.isFinite(jointShare)) {
    const joint = Math.max(.45, Math.min(.58, jointShare));
    return kind === 'arm'
      ? [[0,.88],[joint*.32,1],[joint,.67],[joint+(1-joint)*.32,.77+v*.3],[1,.40]]
      : [[0,.90],[joint*.34,1],[joint,.61],[joint+(1-joint)*.34,.76+v*.3],[1,.30]];
  }
  return kind === 'arm'
    ? [[0, .88], [.16, 1], [.50, .67], [.66, .77 + v * .3], [1, .40]]
    : [[0, .90], [.17, 1], [.49, .61], [.66, .76 + v * .3], [1, .30]];
}
export function squaredProfileIntegral(sections) {
  let total = 0;
  for (let i = 1; i < sections.length; i++) {
    const [start, a] = sections[i - 1], [end, b] = sections[i];
    const delta = b - a;
    total += (end - start) * (a * a + a * delta + 13 / 35 * delta * delta);
  }
  return total;
}
