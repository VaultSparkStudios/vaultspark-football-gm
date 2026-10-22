import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {playerAppearance,playerFrame} from '../src/domain/playerIdentity.js';
import {ensurePlayerVisualIdentity} from '../src/domain/playerVisualIdentity.js';
import {HAIR_STYLE_RULES} from '../public/lib/portraitAppearanceContract.js';

test('legacy SVG legal grooming pairs and selected appearance interactions render at readable size',async({page})=>{
 test.setTimeout(240000);
 const phase=process.env.COMBINATION_CAPTURE_PHASE||'combinations-full';
 const before=phase==='long-hair-before';
 const partedBefore=phase==='parted-hair-before';
 const arrangedBefore=phase==='structured-hair-before';
 if(phase==='whole-head-before')for(const name of ['playerPortraitFace','playerSideAppearance','fineFaceGeometry','portraitSurfaceLighting','longHairFlow'])await page.route(`**/lib/${name}.js*`,async route=>route.fulfill({contentType:'text/javascript',body:await fs.readFile(`.cache/whole-head-before/${name}.js`,'utf8')}));
 if(arrangedBefore)for(const name of ['playerPortraitFace','playerSideAppearance'])await page.route(`**/lib/${name}.js*`,async route=>route.fulfill({contentType:'text/javascript',body:await fs.readFile(`.cache/structured-hair-before/${name}.js`,'utf8')}));
 if(before||partedBefore)for(const name of ['playerPortraitFace','playerSideAppearance'])await page.route(`**/lib/${name}.js*`,async route=>route.fulfill({contentType:'text/javascript',body:await fs.readFile(`.cache/${before?'long':'parted'}-hair-before/${name}.js`,'utf8')}));
 await page.goto('/');
 await expect(page.locator('#setupStatus')).toContainText('Ready',{timeout:30000});
 await page.emulateMedia({reducedMotion:'reduce'});
 const p=ensurePlayerVisualIdentity({id:'combination-fixture',name:'Combination fixture',age:26,heightInches:75,weightLbs:235,ratings:{strength:82},profile:{faceSeed:'combination-fixture'}},{newPlayer:true});
 const a={...playerAppearance(p),facialHair:'clean',hairColor:'#181a1c',naturalHairColor:'#181a1c',dyedHairColor:null};
 const make=(name,appearance,age=26)=>({...p,name,age,visualFrame:playerFrame(p),appearance:{...a,...appearance}});
 const render=players=>page.evaluate(async players=>{
  // Exercise the retained SVG component explicitly, independently of modern PNG heads.
   const portraitModule=await import('/lib/playerPortraitFace.js');
   const buildPlayerPortraitSvg=portraitModule.buildLegacyPlayerPortraitSvg||portraitModule.buildPlayerPortraitSvg;
  let gallery=document.getElementById('combinationCoverage');
  if(!gallery){gallery=document.createElement('section');gallery.id='combinationCoverage';document.body.replaceChildren(gallery);}
  gallery.style.cssText='display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;padding:12px;max-width:620px;margin:auto;background:var(--surface);color:var(--ink-strong)';
  gallery.replaceChildren();
  for(const [i,player] of players.entries()){
   const card=document.createElement('article');
   card.innerHTML=buildPlayerPortraitSvg(player,{headOnly:true,idSuffix:`-combination-${i}`});
   card.querySelector('svg').style.cssText='display:block;width:100%;max-width:306px;height:auto;margin:auto';
   const label=document.createElement('p');label.textContent=player.name;label.style.cssText='margin:4px 0;font:12px/1.3 sans-serif';card.append(label);gallery.append(card);
  }
 },players);
 const report={kind:'provisional-combination-coverage',limits:'48 legal pairs receive render validity checks and saved galleries, plus eight interaction fixtures. Capture availability is not proof of inspection, population calibration or complete naturalism certification.',legalPairs:[],captures:[]};
 await page.setViewportSize({width:1440,height:1000});
 for(const [hairstyle,rule] of Object.entries(HAIR_STYLE_RULES))for(const hairTexture of rule.textures){
  await render([make(`${hairstyle}/${hairTexture}`,{hairstyle,hairTexture})]);
  const markup=await page.locator('#combinationCoverage svg').evaluate(svg=>svg.outerHTML);
  expect(markup).not.toMatch(/NaN|Infinity|undefined/);
  if(hairstyle==='long')expect(/data-long-flow-version="(?:clumped-v1|continuous-locks-v2)"/.test(markup)).toBe(!before&&!['hair-review-baseline'].includes(phase));
  if(hairstyle==='long'&&phase.startsWith('whole-head-')&&phase!=='whole-head-before')expect(markup).toContain('data-long-flow-version="continuous-locks-v2"');
  if(['swept','side-part'].includes(hairstyle)&&phase.startsWith('parted-hair-'))expect(markup.includes('data-parted-flow="rounded-v1"')).toBe(!partedBefore);
  if(['locs','braids'].includes(hairstyle)&&phase.startsWith('structured-hair-'))expect(markup.includes('data-arranged-flow="bundles-v1"')).toBe(!arrangedBefore);
  expect(await page.locator('#combinationCoverage .portrait-eye').count()).toBe(2);
  const png=await page.locator('#combinationCoverage svg').screenshot();
  report.legalPairs.push({hairstyle,hairTexture,textureVisible:rule.textureVisible,sha256:crypto.createHash('sha256').update(png).digest('hex')});
 }
 expect(report.legalPairs).toHaveLength(48);
 const legalCases=report.legalPairs.map(({hairstyle,hairTexture})=>make(`${hairstyle}/${hairTexture}`,{hairstyle,hairTexture}));
 const cases=[
  make('Pale / black coils / full beard',{complexion:.05,skinUndertone:-1,hairstyle:'coils',hairTexture:'coily',facialHair:'full-beard',eyeColor:'#8ca8be',hairDensity:1,hairLength:2}),
  make('Deep / blond straight long / mustache',{complexion:.98,skinUndertone:1,hairstyle:'long',hairTexture:'straight',hairColor:'#ceb779',naturalHairColor:'#ceb779',facialHair:'mustache',eyeColor:'#4a6642',hairLength:2}),
  make('Sparse red waves / goatee',{complexion:.35,hairstyle:'waves',hairTexture:'wavy',hairColor:'#a14f2a',naturalHairColor:'#a14f2a',facialHair:'goatee',hairDensity:.25,hairline:1}),
  make('Zero density / full natural beard',{complexion:.65,hairstyle:'long',hairTexture:'curly',hairDensity:0,facialHair:'full-beard'}),
  make('Purple locs / natural dark beard',{complexion:.5,hairstyle:'locs',hairTexture:'coily',hairColor:'#8558c8',dyedHairColor:'#8558c8',facialHair:'short-beard',hairLength:2}),
  make('Gray receding / age42 artistic fixture',{complexion:.3,hairstyle:'receding',hairTexture:'straight',grayOnsetAge:28,facialHair:'stubble'},42),
  make('Shaved / narrow jaw / broad nose',{complexion:.85,hairstyle:'shaved',hairTexture:'coily',jawWidth:.8,noseWidth:1.2,lipWidth:1.15,eyeAperture:.7,facialHair:'clean'}),
  make('Braids / wide chin / tilted eyes',{complexion:.15,hairstyle:'braids',hairTexture:'wavy',chinWidth:1.2,eyeTilt:2,asymmetry:1,facialHair:'goatee',hairLength:.5})
 ];
 await fs.mkdir('output/playwright',{recursive:true});
 for(const [kind,fixtures] of [['legal',legalCases],['interaction',cases]])for(const [viewport,width,height] of [['desktop',1440,1000],['mobile',390,844]]){
  const count=viewport==='desktop'?4:2;
  for(let offset=0;offset<fixtures.length;offset+=count){
   await render(fixtures.slice(offset,offset+count));
   await page.setViewportSize({width,height});
   await page.locator('#combinationCoverage').evaluate((g,cols)=>g.style.gridTemplateColumns=`repeat(${cols},minmax(0,1fr))`,viewport==='desktop'?2:1);
   for(const theme of ['dark','light']){
    await page.evaluate(async t=>(await import('/lib/themeCustomizer.js')).applyTheme(t),theme);
    const box=await page.locator('#combinationCoverage').boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(width);
    expect(box.y+box.height).toBeLessThanOrEqual(height);
    const file=`output/playwright/s117-${phase}-${kind}-${offset}-${viewport}-${theme}.png`;
    await page.screenshot({path:file});report.captures.push({file,kind,viewport,width,height,theme,cases:fixtures.slice(offset,offset+count).map(c=>c.name)});
   }
  }
 }
 expect(report.captures.filter(c=>c.kind==='legal')).toHaveLength(72);
 await fs.writeFile(`output/playwright/s117-${phase}.json`,JSON.stringify(report,null,2));
});
