// Shared artistic torso envelope. Curved sidewalls retain the saved endpoint
// sections and the same integrated elliptical volume as the solver's taper.
// The shoulder garment cap is above that span, outside the volume estimate.
const n=value=>Math.round(value*100)/100;
export function torsoSurfacePath({x=0,y=0,length,chest,waist,neck,sections,neckOpening=false}) {
  if (![x,y,length,chest,waist,neck].every(Number.isFinite)
    || length<=0 || chest<=0 || waist<=0 || neck<=0) return null;
  const cap=Math.min(8,length*.06),neckHalf=Math.min(neck/2,chest*.4);
  // The opening occupies only the garment cap above the integrated torso.
  // Its lowest point touches y; every measured section below y is unchanged.
  const close=neckOpening?` Q${n(x)} ${n(y+cap)} ${n(x-neckHalf)} ${n(y-cap)}Z`:'Z';
  if(sections){
    if(!Array.isArray(sections)||sections.length<3||sections.length>8
      || sections.some((s,i)=>!Array.isArray(s)||s.length!==2||!s.every(Number.isFinite)||s[0]<0||s[0]>1||s[1]<=0||(i&&s[0]<=sections[i-1][0]))
      || sections[0][0]!==0||sections.at(-1)[0]!==1
      || Math.abs(sections[0][1]-chest)>1e-8||Math.abs(sections.at(-1)[1]-waist)>1e-8)return null;
    const wall=(side,points)=>points.slice(1).map((s,i)=>{
      const a=points[i],dy=(s[0]-a[0])*length;
      // Zero width slope at each anatomical section gives a smooth regional
      // surface. Linear y preserves the solver's longitudinal coordinate.
      return `C${n(x+side*a[1]/2)} ${n(y+a[0]*length+dy/3)} ${n(x+side*s[1]/2)} ${n(y+s[0]*length-dy/3)} ${n(x+side*s[1]/2)} ${n(y+s[0]*length)}`;
    }).join(' ');
    return `M${n(x-neckHalf)} ${n(y-cap)} Q${n(x-chest*.43)} ${n(y-cap)} ${n(x-chest/2)} ${n(y)} ${wall(-1,sections)} H${n(x+waist/2)} ${wall(1,[...sections].reverse())} Q${n(x+chest*.43)} ${n(y-cap)} ${n(x+neckHalf)} ${n(y-cap)}${close}`;
  }
  const ratio=waist/chest,curve=.9*Math.min(1,ratio);
  if(!Number.isFinite(ratio))return null;
  // q(t)=1+(r-1)t+a*t(1-t)(1-2t)+c*t(1-t). The antisymmetric
  // chest/abdominal contour vanishes at both measured endpoint sections.
  // Solve integral(q²)=(1+r+r²)/3. Stable quadratic root keeps c near 0:
  // c²/30 + c*(1+r)/6 + a*(1-r)/30 + a²/210 = 0.
  const b=(1+ratio)/6,d=curve*(1-ratio)/30+curve*curve/210;
  const correction=-2*d/(b+Math.sqrt(b*b-4*d/30));
  const startSlope=ratio-1+curve+correction,endSlope=ratio-1+curve-correction;
  const first=chest*(1+startSlope/3),second=chest*(ratio-endSlope/3);
  return `M${n(x-neckHalf)} ${n(y-cap)} Q${n(x-chest*.43)} ${n(y-cap)} ${n(x-chest/2)} ${n(y)} C${n(x-first/2)} ${n(y+length/3)} ${n(x-second/2)} ${n(y+length*2/3)} ${n(x-waist/2)} ${n(y+length)} H${n(x+waist/2)} C${n(x+second/2)} ${n(y+length*2/3)} ${n(x+first/2)} ${n(y+length/3)} ${n(x+chest/2)} ${n(y)} Q${n(x+chest*.43)} ${n(y-cap)} ${n(x+neckHalf)} ${n(y-cap)}${close}`;
}
export function torsoSurfaceMarkup(dimensions,{projection,fill,stroke,id,neckOpening=false}={}) {
  const path=torsoSurfacePath({...dimensions,neckOpening});
  if (!path || !['front','side'].includes(projection)) return '';
  // Fill/stroke are renderer-owned colors/resource IDs, never player strings.
  const base=`<path class="player-torso-surface" data-envelope="${dimensions.sections?'artistic-regional-sections-v1':'volume-preserving-curve-v1'}" data-projection="${projection}" data-chest="${n(dimensions.chest)}" data-waist="${n(dimensions.waist)}" data-torso-length="${n(dimensions.length)}" d="${path}" fill="${fill}"${stroke?` stroke="${stroke}" stroke-width=".7"`:''}/>`;
  if(!id || !/^[a-zA-Z0-9_-]+$/.test(id))return base;
  const {x=0,y=0,length,chest,waist,neck}=dimensions;
  const left=x-chest/2,right=x+chest/2,bottom=y+length;
  const surface=`${id}-torso`,lightX=x-chest*.16;
  const cap=Math.min(8,length*.06),neckHalf=Math.min(neck/2,chest*.4);
  const collar=`M${n(x-neckHalf)} ${n(y-cap)} Q${n(x)} ${n(y+cap)} ${n(x+neckHalf)} ${n(y-cap)}`;
  // A matte cloth layer softens the underlying presentation gradient. Broad
  // diffuse light, small folds and a faint weave belong to the garment, not
  // inferred muscle or fat. All material marks stay in the solved envelope.
  const fold=(d,opacity=.17)=>`<path d="${d}" fill="none" stroke="#172f3b" stroke-opacity="${opacity}" stroke-width="${n(Math.max(.65,chest*.009))}"/>`;
  return `${base}<defs>
    <clipPath id="${surface}-clip"><path d="${path}"/></clipPath>
    <linearGradient id="${surface}-cross" gradientUnits="userSpaceOnUse" x1="${n(left)}" y1="${n(y)}" x2="${n(right)}" y2="${n(y)}"><stop stop-color="#07151b" stop-opacity=".12"/><stop offset=".25" stop-color="#fff4df" stop-opacity=".025"/><stop offset=".55" stop-color="#fff4df" stop-opacity=".045"/><stop offset="1" stop-color="#07151b" stop-opacity=".14"/></linearGradient>
    <radialGradient id="${surface}-chest" gradientUnits="userSpaceOnUse" cx="${n(lightX)}" cy="${n(y+length*.28)}" r="${n(chest*.65)}" gradientTransform="translate(0 ${n(y+length*.28)}) scale(1 ${n(length/chest*.7)}) translate(0 ${n(-y-length*.28)})"><stop stop-color="#fff4df" stop-opacity=".045"/><stop offset="1" stop-color="#fff4df" stop-opacity="0"/></radialGradient>
    <pattern id="${surface}-weave" patternUnits="userSpaceOnUse" width="3" height="3"><path d="M0 .5 H3 M.5 0 V3" fill="none" stroke="#edf0e5" stroke-opacity=".028" stroke-width=".45"/></pattern>
  </defs><g class="player-torso-form" data-torso-form="matte-cloth-v2" clip-path="url(#${surface}-clip)" pointer-events="none">
    <path d="${path}" fill="#3d6270" fill-opacity=".62"/>
    <path d="${path}" fill="url(#${surface}-cross)"/><path d="${path}" fill="url(#${surface}-chest)"/><path d="${path}" fill="url(#${surface}-weave)"/>
    ${fold(`M${n(left+chest*.12)} ${n(y+length*.15)} Q${n(left+chest*.23)} ${n(y+length*.19)} ${n(left+chest*.29)} ${n(y+length*.28)}`)}
    ${fold(`M${n(right-chest*.08)} ${n(y+length*.18)} Q${n(right-chest*.18)} ${n(y+length*.27)} ${n(right-chest*.20)} ${n(y+length*.35)}`,.13)}
    ${fold(`M${n(x-waist*.43)} ${n(bottom-length*.12)} Q${n(x-waist*.26)} ${n(bottom-length*.16)} ${n(x-waist*.11)} ${n(bottom-length*.13)}`,.20)}
    ${fold(`M${n(x+waist*.14)} ${n(bottom-length*.06)} Q${n(x+waist*.29)} ${n(bottom-length*.1)} ${n(x+waist*.43)} ${n(bottom-length*.07)}`)}
    ${fold(`M${n(x-waist*.43)} ${n(bottom-length*.035)} Q${n(x)} ${n(bottom-length*.055)} ${n(x+waist*.43)} ${n(bottom-length*.035)}`,.24)}
  </g>${neckOpening?`<path class="player-training-collar" d="${collar}" fill="none" stroke="#819fa7" stroke-width="1.4" stroke-linecap="round"/>`:''}`;
}
