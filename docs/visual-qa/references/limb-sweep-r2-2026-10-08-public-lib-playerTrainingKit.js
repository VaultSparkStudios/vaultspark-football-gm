// One artistic kit for modern neutral and moving athletes. Hem position is a
// fraction of the saved hip-to-knee segment, not a new physical measurement.
export const TRAINING_KIT_COLOR='#466c80';
export const TRAINING_KIT_FAR_COLOR='#29495b';
export const TRAINING_SHORTS_SHARE=.48;
const n=v=>Math.round(v*100)/100;
export function trainingShortsPath(root,knee,thighWidth) {
  if(![root?.x,root?.y,knee?.x,knee?.y,thighWidth].every(Number.isFinite)||thighWidth<=0)return '';
  const dx=(knee.x-root.x)*TRAINING_SHORTS_SHARE,dy=(knee.y-root.y)*TRAINING_SHORTS_SHARE;
  const length=Math.hypot(dx,dy);if(!length)return '';
  const nx=-dy/length,ny=dx/length;
  const at=(t,w,side)=>`${n(root.x+dx*t+nx*w*.5*side)} ${n(root.y+dy*t+ny*w*.5*side)}`;
  const start=thighWidth*1.03,end=thighWidth*.82;
  return `M${at(0,start,1)} C${at(1/3,start,1)} ${at(2/3,start*.4+end*.6,1)} ${at(1,end,1)} Q${n(root.x+dx)} ${n(root.y+dy)} ${at(1,end,-1)} C${at(2/3,start*.4+end*.6,-1)} ${at(1/3,start,-1)} ${at(0,start,-1)} Q${n(root.x)} ${n(root.y)} ${at(0,start,1)}Z`;
}
export function trainingShortsYoke({x,y,waistHalf,hipHalf,thighWidth,upperLegLength}) {
  if(![x,y,waistHalf,hipHalf,thighWidth,upperLegLength].every(Number.isFinite))return '';
  const bottom=y+Math.min(20,upperLegLength*.18),outside=hipHalf+thighWidth*.49;
  return `M${n(x-waistHalf)} ${n(y-4)} Q${n(x)} ${n(y+2)} ${n(x+waistHalf)} ${n(y-4)} Q${n(x+outside)} ${n(y+4)} ${n(x+outside)} ${n(bottom)} H${n(x-outside)} Q${n(x-outside)} ${n(y+4)} ${n(x-waistHalf)} ${n(y-4)}Z`;
}
