// Shared measured body views; the face renderer is also used by frontal motion.
import { limbSectionProfile, renderableIndividualAnatomy, projectedTorsoSections, neutralMeasuredPose } from './physiqueGeometryContract.js';
import { profiledLimbSurface } from './profiledLimbSurface.js';
import { buildIndividualFootwear } from './playerFootwear.js';
import { playerHandMarkup, estimatedPalmBreadth } from './playerHand.js';
import { appearanceSkinColor, blendAppearanceColor as blend, bodySkinStops, bodyClothStops } from './appearancePalette.js';
import { buildPlayerSideHead } from './playerSideAppearance.js';
import { buildPlayerPortraitSvg } from './playerPortraitFace.js';
import { torsoSurfaceMarkup } from './torsoSurface.js';
import { trainingShortsPath, trainingShortsYoke, TRAINING_KIT_COLOR } from './playerTrainingKit.js';
export { buildPlayerPortraitSvg } from './playerPortraitFace.js';
export { appearanceSkinColor } from './appearancePalette.js';
export { buildPlayerMotionSvg, mountPlayerMovement, buildPlayerMovementControls } from './playerMotion.js';
function fnv1a(value) {
  let hash = 2166136261;
  for (const character of String(value)) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return hash >>> 0;
}
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

const escape = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const n = value => Number(value.toFixed(2));
// A common six-pixels-per-inch camera exposes stature and frame differences.
// The relaxed pose shows arm length; the separate reach reference uses the
// same reference scale for every player. No camera auto-fit by body.
function profiledLimbPath(x0, y0, x1, y1, diameter, sections, shoulderCap = false, contour = null) {
  if(contour){
    const path=profiledLimbSurface({x:x0,y:y0},{x:x1,y:y1},diameter,contour.kind,contour.variation,[0,1],contour.jointShare,contour.direction);
    const start=path.match(/^M([^ ]+) ([^ ]+)/);
    return shoulderCap?path.slice(0,-1)+` Q${n(x0)} ${n(y0-diameter*.32)} ${start[1]} ${start[2]}Z`:path;
  }
  const point = ([t, ratio], side) => ({ x: x0 + (x1 - x0) * t + side * diameter * ratio / 2, y: y0 + (y1 - y0) * t, t });
  const left = sections.map(s => point(s, -1)), right = sections.map(s => point(s, 1)).reverse();
  const curve = (from, to) => {
    const centerDrift = (x1 - x0) * (to.t - from.t), height = to.y - from.y;
    return `C${n(from.x + centerDrift / 3)} ${n(from.y + height / 3)} ${n(to.x - centerDrift / 3)} ${n(to.y - height / 3)} ${n(to.x)} ${n(to.y)}`;
  };
  return `M${n(left[0].x)} ${n(left[0].y)} ${left.slice(1).map((p,i)=>curve(left[i],p)).join(' ')} L${n(right[0].x)} ${n(right[0].y)} ${right.slice(1).map((p,i)=>curve(right[i],p)).join(' ')}${shoulderCap?` Q${n(x0)} ${n(y0-diameter*.32)} ${n(left[0].x)} ${n(left[0].y)}`:''}Z`;
}
export function buildPlayerPhysiqueSvg(player, { idSuffix = "", view = "front" } = {}) {
  const rawFrame = player?.visualFrame, a = player?.appearance;
  const craft = a?.fineFaceVersion === 'fine-face-v1';
  const f = rawFrame ? { ...rawFrame, ...renderableIndividualAnatomy(rawFrame) } : rawFrame;
  if (!f || !a) return '<div class="portrait-unavailable">Physique unavailable</div>';
  const unit = 6, floor = 570;
  const neutral=craft?neutralMeasuredPose(f,{unit,floor}):null;
  const top = floor - f.heightInches * unit;
  // The portrait's viewport includes hair clearance. Scale the actual skull
  // (65..240), not that empty clearance, to the athlete's head height.
  const skullHeight = (9.4 + (f.heightInches - 74) * .035) * unit;
  const headScale = skullHeight / 175;
  const headHeight = 270 * headScale, headWidth = 220 * headScale;
  const headTop = top - 65 * headScale;
  const shoulderY = top + skullHeight + 9;
  const hipY = shoulderY + f.heightInches * f.torsoShare * unit;
  const shoulder = (f.chestWidthInches != null ? f.chestWidthInches / 2 : f.shoulderSpanInches / 2 + (f.upperArmWidth - 3) * .45) * unit;
  const frontSections=craft?projectedTorsoSections(f,'front',unit):null;
  const waist = frontSections ? frontSections.at(-1)[1]/2 : shoulder * f.waistRatio;
  const neck = f.neckDiameterInches != null ? f.neckDiameterInches * unit : f.neckWidth * .65;
  const skin = appearanceSkinColor(a);
  const skinShade = blend(skin, "#241a19", .25);
  const kneeY = hipY + (floor - hipY - (f.upperLegShare == null ? 0 : 15)) * (f.upperLegShare ?? .51);
  const thigh = f.thighWidth * unit;
  const armWidth = f.upperArmWidth * unit;
  const handWidth = craft ? estimatedPalmBreadth(f.handSizeInches,unit) : f.handSizeInches * 2.1;
  const handHeight = (f.handLengthInches ?? f.heightInches * .10) * unit;
  const armBottom = shoulderY + f.armLengthInches * unit;
  const armSections = limbSectionProfile('arm', f.limbShapeVariation, f.upperArmShare);
  const legSections = limbSectionProfile('leg', f.limbShapeVariation, f.upperLegShare);
  const contour=(kind,direction)=>craft?{kind,direction,variation:f.limbShapeVariation,jointShare:kind==='arm'?f.upperArmShare:f.upperLegShare}:null;
  // Training shorts bridge waist and independently spaced upper thighs. A
  // narrow waist must not expose trouser-colored slivers above the hem.
  const hipHalf = f.hipJointSpanInches != null ? f.hipJointSpanInches * unit / 2
    : f.pelvicBreadthInches != null ? f.pelvicBreadthInches * unit * .38 : null;
  const hipCover = hipHalf == null ? null : Math.max(waist + 3, hipHalf + thigh * .48);
  // Instance names only scope SVG resources; they never seed identity detail.
  const id = `physique-${fnv1a(`${player.id || player.name}:${JSON.stringify(f)}:${JSON.stringify(a)}:${idSuffix}`)}`;
  const measuredLimb=(limb,kind,direction,fill,projection='front')=>{
    const split=kind==='arm'?neutral.upperArmShare:neutral.upperLegShare,diameter=kind==='arm'?armWidth:thigh;
    const project=p=>projection==='side'?{x:160+(p.z??0),y:p.y}:p;
    const root=project(limb.root),joint=project(limb.joint),end=project(limb.end);
    // One world-space material spans both bones; per-path bounding boxes
    // otherwise restart the gradient and expose a seam at each joint.
    const material=`${id}-rig-${projection}-${kind}-${n(limb.root.x)}`;
    const low=Math.min(root.x,joint.x,end.x)-diameter/2,high=Math.max(root.x,joint.x,end.x)+diameter/2;
    const gradient=`<defs><linearGradient id="${material}" gradientUnits="userSpaceOnUse" x1="${n(low)}" y1="0" x2="${n(high)}" y2="0">${bodySkinStops(skin)}</linearGradient></defs>`;
    const paths=[[root,joint,[0,split],'upper'],[joint,end,[split,1],'lower']].map(([a,b,range,segment])=>{
      let path=profiledLimbSurface(a,b,diameter,kind,f.limbShapeVariation,range,split,direction);
      if(kind==='arm'&&segment==='upper'){
        const length=Math.hypot(b.x-a.x,b.y-a.y),start=path.match(/^M([^ ]+) ([^ ]+)/);
        path=path.slice(0,-1)+` Q${n(a.x-(b.x-a.x)/length*diameter*.32)} ${n(a.y-(b.y-a.y)/length*diameter*.32)} ${start[1]} ${start[2]}Z`;
      }
      return path;
    }).join(' ');
    // Paint both subpaths together, avoiding an antialiased dark hairline
    // along a shared joint edge while retaining the exact bone surfaces.
    return gradient+`<path class="physique-${kind}" data-rig="measured-body-rig-v1" data-segment="joined" d="${paths}" fill="url(#${material})"/>`;
  };
  if (view === "side") {
    // A silhouette exposes the model's solved depth without presenting it as
    // a recorded circumference, body-fat measurement or anatomical scan.
    const depth = (f.chestDepthInches != null ? f.chestDepthInches : shoulder / unit * 1.4) * unit;
    const sideSections=craft?projectedTorsoSections(f,'side',unit):null;
    const waistDepth = sideSections ? sideSections.at(-1)[1] : depth * f.waistRatio;
    const armEnd = neutral?neutral.arms[1].end.y:armBottom-handHeight;
    return `<svg class="player-physique-side-svg" viewBox="0 0 320 620" role="img" aria-label="${escape(player.name || "Player")} side silhouette, estimated anatomy" data-height="${escape(f.heightInches)}" data-weight="${escape(f.weightLbs)}" data-chest-depth="${escape(n(depth / unit))}">
      <defs><linearGradient id="${id}-side">${craft?bodySkinStops(skin):`<stop stop-color="${skinShade}"/><stop offset=".55" stop-color="${skin}"/><stop offset="1" stop-color="${skinShade}"/>`}</linearGradient>${craft?`<linearGradient id="${id}-shorts">${bodyClothStops(TRAINING_KIT_COLOR)}</linearGradient>`:''}</defs>
      <rect width="320" height="620" rx="12" fill="#14232c"/>
      <path d="M32 54 V570 H294" stroke="#779099" stroke-width="1" opacity=".6" fill="none"/>
      ${[24, 48, 72, 84].map(inches => `<path d="M28 ${floor - inches * unit} H37" stroke="#a5b8bf"/><text x="24" y="${floor - inches * unit + 3}" text-anchor="end" fill="#c2d0d5" font-size="9" font-family="system-ui">${inches}″</text>`).join("")}
      <path d="M39 ${n(top)} H276" stroke="#c2d0d5" stroke-dasharray="3 4" opacity=".3"/>
      <g class="physique-side-athlete" fill="url(#${id}-side)">
        <path d="M${n(160 - Math.min(neck/2,skullHeight*.17))} ${n(top + skullHeight - 5)} H${n(160 + Math.min(neck/2,skullHeight*.17))} Q${n(160+neck/2)} ${n(shoulderY)} ${n(160+neck/2)} ${n(shoulderY+9)} H${n(160-neck/2)} Q${n(160-neck/2)} ${n(shoulderY)} ${n(160-Math.min(neck/2,skullHeight*.17))} ${n(top+skullHeight-5)}Z"/>
        ${neutral?measuredLimb(neutral.legs[1],'leg',-1,`url(#${id}-side)`,'side'):`<path class="physique-leg" d="${profiledLimbPath(160,hipY,160,floor-15,thigh,legSections,false,contour('leg',-1))}"/>`}${craft?`\n        <path class="player-training-shorts" d="${trainingShortsPath({x:160,y:hipY},{x:160,y:kneeY},thigh)}" fill="url(#${id}-shorts)"/>`:''}
        ${sideSections?`<path class="player-training-pelvis" d="${trainingShortsYoke({x:160,y:hipY,waistHalf:waistDepth/2,hipHalf:0,thighWidth:thigh,upperLegLength:kneeY-hipY})}" fill="url(#${id}-shorts)"/>`:''}${craft ? torsoSurfaceMarkup({x:160,y:shoulderY,length:hipY-shoulderY,chest:depth,waist:waistDepth,neck,sections:sideSections},{projection:'side',fill:'#466c80',id:`${id}-side`}) : `<path d="M${n(160 - neck / 2)} ${n(shoulderY - 5)} Q${n(160 - depth / 2)} ${n(shoulderY + 8)} ${n(160 - depth * .43)} ${n(shoulderY + (hipY - shoulderY) * .45)} Q${n(160 - waistDepth * .4)} ${n(hipY - 18)} ${n(160 - waistDepth / 2)} ${n(hipY)} Q160 ${n(hipY + 17)} ${n(160 + waistDepth / 2)} ${n(hipY)} Q${n(160 + waistDepth / 2)} ${n(hipY - 22)} ${n(160 + depth / 2)} ${n(shoulderY + (hipY - shoulderY) * .3)} Q${n(160 + depth / 2)} ${n(shoulderY + 10)} ${n(160 + neck / 2)} ${n(shoulderY - 5)}Z" fill="#466c80"/>`}
        ${neutral?measuredLimb(neutral.arms[1],'arm',-1,`url(#${id}-side)`,'side'):`<path class="physique-arm" d="${profiledLimbPath(160,shoulderY,160,armEnd,armWidth,armSections,craft,contour('arm',-1))}" stroke="#8aa3a7" stroke-width="1"/>`}
        ${craft ? `<g transform="translate(160 ${n(armEnd)})${neutral?` scale(1 ${n((neutral.arms[1].hand.y-armEnd)/handHeight)})`:''}">${playerHandMarkup({width:handWidth,length:handHeight,wristWidth:armWidth*.40,fill:`url(#${id}-side)`,shade:skinShade})}</g>` : `<path d="M${n(160-handWidth*.3)} ${n(armEnd)} Q${n(160-handWidth*.45)} ${n(armBottom-4)} 160 ${n(armBottom+2)} Q${n(160+handWidth*.4)} ${n(armBottom)} ${n(160+handWidth*.3)} ${n(armEnd)}Z"/>`}
        ${buildIndividualFootwear(f,{x:160,y:floor-15},{view:'side'}) ?? `<path d="M${n(160 - thigh * .28)} ${floor - 17} Q${n(160 + thigh * .3)} ${floor - 20} ${n(160 + thigh * .7)} ${floor - 4} L${n(160 + thigh * .7)} ${floor} H${n(160 - thigh * .3)}Z"/>`}
        ${buildPlayerSideHead(player,{x:160,y:top,height:skullHeight,idSuffix:`-${id}-static`})}
      </g>
      <text x="160" y="603" text-anchor="middle" fill="#c2d0d5" font-size="10" font-family="system-ui">Side silhouette · estimated depth</text>
    </svg>`;
  }
  const arm = side => {
    if(neutral){const limb=neutral.arms[side===-1?0:1],angle=-Math.atan2(limb.hand.x-limb.end.x,limb.hand.y-limb.end.y)*180/Math.PI;
      return measuredLimb(limb,'arm',-side,`url(#${id}-skin)`)+`<g transform="translate(${n(limb.end.x)} ${n(limb.end.y)}) rotate(${n(angle)}) scale(${-side} 1)">${playerHandMarkup({width:handWidth,length:handHeight,wristWidth:armWidth*.40,fill:`url(#${id}-skin)`,shade:skinShade})}</g>`;
    }
    const x = 160 + side * (shoulder + armWidth * .12);
    const elbowX = x + side * 6, wristX = x + side * 10;
    const elbowY = shoulderY + (armBottom - shoulderY - handHeight) * (f.upperArmShare ?? .53);
    if(!craft) return `<path class="physique-arm" d="${profiledLimbPath(x,shoulderY,wristX,armBottom-handHeight,armWidth,armSections)}" fill="url(#${id}-skin)"/>
      <path d="M${n(wristX - handWidth * .32)} ${n(armBottom - handHeight)} Q${n(wristX - handWidth * .65)} ${n(armBottom - handHeight * .66)} ${n(wristX - handWidth * .35)} ${n(armBottom - 4)} Q${n(wristX)} ${n(armBottom + 5)} ${n(wristX + handWidth * .32)} ${n(armBottom - 3)} L${n(wristX + handWidth * .46)} ${n(armBottom - handHeight * .48)} Q${n(wristX + handWidth * .62)} ${n(armBottom - handHeight * .72)} ${n(wristX + handWidth * .3)} ${n(armBottom - handHeight)}Z" fill="url(#${id}-skin)"/>
      <path d="M${n(wristX - side * handWidth * .2)} ${n(armBottom - handHeight * .65)} l${n(side * handWidth * .2)} ${n(handHeight * .3)} M${n(wristX)} ${n(armBottom - 15)} v12 M${n(wristX + 3)} ${n(armBottom - 13)} v10" stroke="${skinShade}" stroke-width="1" opacity=".5" fill="none"/>
      <path d="M${n(x - side * armWidth * .22)} ${n(shoulderY + 26)} Q${n(elbowX - side * armWidth * .28)} ${n(elbowY - 20)} ${n(elbowX)} ${n(elbowY)}" stroke="${skinShade}" stroke-opacity="${n(.1 + f.muscleDefinition * .35)}" stroke-width="2" fill="none"/>`;
    return `<path class="physique-arm" d="${profiledLimbPath(x,shoulderY,wristX,armBottom-handHeight,armWidth,armSections,craft,contour('arm',-side))}" fill="url(#${id}-skin)"/>
      <g transform="translate(${n(wristX)} ${n(armBottom-handHeight)}) scale(${-side} 1)">${playerHandMarkup({width:handWidth,length:handHeight,wristWidth:armWidth*.40,fill:`url(#${id}-skin)`,shade:skinShade})}</g>
      <path d="M${n(x - side * armWidth * .22)} ${n(shoulderY + 26)} Q${n(elbowX - side * armWidth * .28)} ${n(elbowY - 20)} ${n(elbowX)} ${n(elbowY)}" stroke="${skinShade}" stroke-opacity="${n(.1 + f.muscleDefinition * .35)}" stroke-width="2" fill="none"/>`;
  };
  const leg = side => {
    if(neutral){const limb=neutral.legs[side===-1?0:1];return measuredLimb(limb,'leg',-side,`url(#${id}-skin)`)
      +`<path class="player-training-shorts" d="${trainingShortsPath(limb.root,limb.joint,thigh)}" fill="url(#${id}-shorts)"/>`
      +(buildIndividualFootwear(f,limb.end,{view:'front',fill:'#26333b'})??`<path class="estimated-rig-footwear" d="M${n(limb.end.x-thigh*.18)} ${n(limb.end.y-4)} Q${n(limb.end.x)} ${n(limb.end.y-8)} ${n(limb.end.x+thigh*.18)} ${n(limb.end.y-4)} L${n(limb.end.x+thigh*.26+3)} ${n(limb.end.y+12)} Q${n(limb.end.x)} ${n(limb.end.y+17)} ${n(limb.end.x-thigh*.26-3)} ${n(limb.end.y+12)}Z" fill="#26333b"/>`);}
    const x = 160 + side * (hipHalf ?? waist * .52);
    const ankleX = x + side * 4;
    return `<path class="physique-leg" d="${profiledLimbPath(x,hipY,ankleX,floor-15,thigh,legSections,false,contour('leg',-side))}" fill="url(#${id}-${craft?'skin':'pants'})"/>
      ${craft?`<path class="player-training-shorts" d="${trainingShortsPath({x,y:hipY},{x:x+(ankleX-x)*(f.upperLegShare??.51),y:kneeY},thigh)}" fill="url(#${id}-shorts)"/>`:`<path d="M${n(x - side * thigh * .22)} ${n(hipY + 30)} Q${n(x)} ${n(kneeY + 14)} ${n(ankleX - side * thigh * .12)} ${floor - 17}" stroke="#8c9da5" opacity=".5" stroke-width="2" fill="none"/>`}
      ${buildIndividualFootwear(f,{x:ankleX,y:floor-15},{view:'front',fill:'#26333b'}) ?? `<path d="M${n(ankleX - thigh * .18)} ${floor - 19} Q${n(ankleX)} ${floor - 23} ${n(ankleX + thigh * .18)} ${floor - 19} L${n(ankleX + thigh * .26 + 3)} ${floor - 3} Q${n(ankleX)} ${floor + 2} ${n(ankleX - thigh * .26 - 3)} ${floor - 3}Z" fill="#26333b"/>
      <path d="M${n(ankleX - thigh * .26 - 3)} ${floor - 2} Q${n(ankleX)} ${floor + 2} ${n(ankleX + thigh * .26 + 3)} ${floor - 2}" stroke="#dce6e7" stroke-width="3" fill="none"/>`}`;
  };
  // Reuse the same facial geometry and age/grooming layer as the portrait.
  const head = buildPlayerPortraitSvg(player, { headOnly: true, idSuffix: `-${id}-head` })
    .replace('<svg class="player-portrait-svg"', `<svg x="${n(160 - headWidth / 2)}" y="${n(headTop)}" width="${n(headWidth)}" height="${n(headHeight)}" class="physique-head"`);
  const reach = f.wingspanInches * 2;
  return `<svg class="player-physique-svg" viewBox="0 0 320 620" role="img" aria-label="${escape(player.name || "Player")} physique, ${escape(f.heightInches)} inches, ${escape(f.weightLbs)} pounds" data-height="${escape(f.heightInches)}" data-weight="${escape(f.weightLbs)}" data-arm-length="${escape(f.armLengthInches)}">
    <defs><linearGradient id="${id}-skin">${craft?bodySkinStops(skin):`<stop stop-color="${skinShade}"/><stop offset=".45" stop-color="${skin}"/><stop offset="1" stop-color="${skinShade}"/>`}</linearGradient>
      <linearGradient id="${id}-shirt"><stop stop-color="#203e4b"/><stop offset=".5" stop-color="#39616a"/><stop offset="1" stop-color="#203e4b"/></linearGradient>
      <linearGradient id="${id}-pants">${craft?bodyClothStops('#9caeb4'):`<stop stop-color="#8c9da5"/><stop offset=".35" stop-color="#b9c3c7"/><stop offset=".7" stop-color="#c9d1d3"/><stop offset="1" stop-color="#91a1a8"/>`}</linearGradient>${craft?`<linearGradient id="${id}-shorts">${bodyClothStops(TRAINING_KIT_COLOR)}</linearGradient>`:''}</defs>
    <rect width="320" height="620" rx="12" fill="#14232c"/>
    <path d="M32 54 V570 H294" stroke="#779099" stroke-width="1" opacity=".6" fill="none"/>
    ${[24, 48, 72, 84].map(inches => `<path d="M28 ${floor - inches * unit} H37" stroke="#a5b8bf"/><text x="24" y="${floor - inches * unit + 3}" text-anchor="end" fill="#c2d0d5" font-size="9" font-family="system-ui">${inches}″</text>`).join("")}
    <path d="M39 ${n(top)} H276" stroke="#c2d0d5" stroke-dasharray="3 4" opacity=".3"/>
    <g class="physique-athlete">${leg(-1)}${leg(1)}${arm(-1)}${arm(1)}
      <path d="${craft ? trainingShortsYoke({x:160,y:hipY,waistHalf:waist,hipHalf:hipHalf??waist*.52,thighWidth:thigh,upperLegLength:kneeY-hipY}) : hipCover == null ? `M${n(160 - waist)} ${n(hipY - 15)} Q160 ${n(hipY - 4)} ${n(160 + waist)} ${n(hipY - 15)} L${n(160 + waist + 3)} ${n(hipY + 30)} L160 ${n(hipY + 37)} L${n(160 - waist - 3)} ${n(hipY + 30)}Z` : `M${n(160-waist)} ${n(hipY-15)} Q160 ${n(hipY-4)} ${n(160+waist)} ${n(hipY-15)} Q${n(160+hipCover)} ${n(hipY-5)} ${n(160+hipCover)} ${n(hipY+30)} L160 ${n(hipY+37)} L${n(160-hipCover)} ${n(hipY+30)} Q${n(160-hipCover)} ${n(hipY-5)} ${n(160-waist)} ${n(hipY-15)}Z`}" fill="${craft?`url(#${id}-shorts)`:'#26333b'}"/>
      <path d="M${n(160 - neck / 2)} ${n(top + skullHeight - 10)} V${n(shoulderY + 13)} Q160 ${n(shoulderY + 21)} ${n(160 + neck / 2)} ${n(shoulderY + 13)} V${n(top + skullHeight - 10)}Z" fill="url(#${id}-skin)"/>
      ${craft ? torsoSurfaceMarkup({x:160,y:shoulderY,length:hipY-shoulderY,chest:shoulder*2,waist:waist*2,neck,sections:frontSections},{projection:'front',fill:`url(#${id}-shirt)`,id:`${id}-front`}) : `<path d="M${n(160 - shoulder - armWidth * .28)} ${n(shoulderY + 22)} Q${n(160 - shoulder - armWidth*.35)} ${n(shoulderY+5)} ${n(160-shoulder*.86)} ${n(shoulderY-2)} Q${n(160-neck)} ${n(shoulderY-10)} ${n(160-neck*.75)} ${n(shoulderY)} Q160 ${n(shoulderY+11)} ${n(160+neck*.75)} ${n(shoulderY)} Q${n(160+neck)} ${n(shoulderY-10)} ${n(160+shoulder*.86)} ${n(shoulderY-2)} Q${n(160+shoulder+armWidth*.35)} ${n(shoulderY+5)} ${n(160+shoulder+armWidth*.28)} ${n(shoulderY+22)} L${n(160+shoulder-3)} ${n(shoulderY+31)} Q${n(160+shoulder*.95)} ${n(shoulderY+(hipY-shoulderY)*.65)} ${n(160+waist)} ${n(hipY-9)} Q160 ${n(hipY+1)} ${n(160-waist)} ${n(hipY-9)} Q${n(160-shoulder*.95)} ${n(shoulderY+(hipY-shoulderY)*.65)} ${n(160-shoulder+3)} ${n(shoulderY+31)}Z" fill="url(#${id}-shirt)"/>`}
      <path d="M${n(160 - neck * .75)} ${n(shoulderY)} Q160 ${n(shoulderY + 21)} ${n(160 + neck * .75)} ${n(shoulderY)}" fill="none" stroke="#c2d0d5" stroke-width="3"/>
      ${craft?'':`<path d="M${n(160 - shoulder * .6)} ${n(shoulderY + 34)} Q160 ${n(shoulderY + 51)} ${n(160 + shoulder * .6)} ${n(shoulderY + 34)} M160 ${n(shoulderY + 40)} v30" fill="none" stroke="#13242f" stroke-width="2" opacity="${n(.2 + f.muscleDefinition * .4)}"/>`}
      <text x="160" y="${n(shoulderY + (hipY - shoulderY) * .6)}" text-anchor="middle" fill="#dce6e7" font-size="32" font-weight="800" font-family="system-ui">${escape(player.jerseyNumber ?? "")}</text>${head}
    </g>
    <path d="M${n(160 - reach / 2)} 593 H${n(160 + reach / 2)} M${n(160 - reach / 2)} 589 v8 M${n(160 + reach / 2)} 589 v8" stroke="#a5b8bf" fill="none"/>
    <text x="160" y="611" text-anchor="middle" fill="#c2d0d5" font-size="10" font-family="system-ui">Reach reference · ${escape(n(f.wingspanInches))}″</text>
  </svg>`;
}
