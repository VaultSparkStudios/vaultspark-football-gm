import {test,expect} from '@playwright/test';import fs from 'node:fs/promises';
test('physical head camera preserves ordinary portraits and complete blink restoration',async({page})=>{
 const fixtures=JSON.parse(await fs.readFile('docs/visual-qa/references/production-head-anatomy-fixtures-2026-10-08.json','utf8'));
 await page.route('**/lib/head-before-physical.mjs',r=>r.fulfill({path:'docs/visual-qa/references/player-head-before-physical-camera-2026-10-08.js',contentType:'text/javascript'}));
 await page.goto('/');await expect(page.locator('#setupStatus')).toContainText('Ready');
 const report=await page.evaluate(async fixtures=>{
  const before=await import('/lib/head-before-physical.mjs'),after=await import('/lib/playerHead3d.js'),{appearanceHairColors,appearanceSkinColor,blendAppearanceColor}=await import('/lib/appearancePalette.js');
  let pixels=0;for(const fine of[true,false])for(const style of['shaved','buzz','fade','crew','waves','short-curls','coils','afro','side-part','swept','long','locs','braids','receding']){
   const p=fixtures.players[0],a={...p.appearance,...(!fine?{fineFaceVersion:undefined}:{}),hairstyle:style},hair=appearanceHairColors(a,p.age),skin=appearanceSkinColor(a),colors={skin,scalp:hair.scalp,brow:hair.brow,beard:hair.face,grayShare:hair.grayShare,iris:a.eyeColor,mouth:blendAppearanceColor(skin,'#8e4948',.35)},results=[];
   for(const module of[before,after]){const c=document.createElement('canvas');c.width=240;c.height=300;const renderer=module.createHeadRenderer3d(c),mesh=module.buildHeadMesh3d(a,colors,{headOnly:true,identitySeed:p.id}),frames=[];
    for(const angle of[0,Math.PI/4,Math.PI/2])for(const blink of[0,.5,1]){renderer.draw(mesh,a,colors,angle,{blink,fitSkull:true});frames.push(c.toDataURL());}
    renderer.dispose();results.push(frames);
   }
   if(results[0].some((v,i)=>v!==results[1][i]))throw Error('Standalone pixels changed '+style+' '+fine);pixels+=results[0].length;
  }
  return{ordinaryHeadPixelComparisons:pixels,legacyAndModern:true,shaderCameraDefaultPreserved:true};
 },fixtures);
 await fs.writeFile('output/playwright/character-head-compat.json',JSON.stringify(report,null,2)+'\n');
});
