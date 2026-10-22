import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {startStaticClientHost,configureClient,createClientLeague,readClient,assertRuntime,saveSlot,waitGameReady} from './helpers/static-client.js';
let host;
test.beforeAll(async()=>{host=await startStaticClientHost();});
test.afterAll(async()=>{await host?.close();});
for(const worker of [true,false])test(`built ${worker?'worker':'in-page'} pays regular clearance and preserves it through named restoration`,async({page})=>{
 test.setTimeout(180000);
 const raw=await fs.readFile('.cache/regular-clearance-before-snapshot.json');
 const baseline=JSON.parse(await fs.readFile('.cache/regular-clearance-loss-before.json','utf8'));
 expect(crypto.createHash('sha256').update(raw).digest('hex')).toBe(baseline.beforeSnapshotSha256);
 const playerId=baseline.playerId;
 await configureClient(page,worker);await createClientLeague(page,host.origin,{seed:117,year:2026,team:'BUF',mode:'play'});await assertRuntime(page,worker);
 const result=await page.evaluate(async snapshot=>{
  const {api}=await import('./lib/appState.js');
  await api('/api/snapshot/import',{method:'POST',body:{snapshot}});
  await api('/api/advance-week',{method:'POST',body:{count:1}});
  await (await import('./lib/gameFlow.js')).loadState();
  return (await api('/api/snapshot/export')).snapshot;
 },JSON.parse(raw));
 expect(result.currentWeek).toBe(3);
 const retained=result.league.players.find(p=>p.id===playerId),row=retained.elevationInjuryPay.payroll.find(r=>r.week===2);
 expect(retained.injury).toBeNull();expect(row.additionalCents).toBe(baseline.missingCents);
 expect(row.practiceCents).toBe(baseline.practiceBaseCents);expect(row.practiceCents+row.additionalCents).toBe(row.payCents);
 expect(result.league.capLedger.BUF.elevationInjuryCharges.find(r=>r.playerId===playerId&&r.week===2).amountCents).toBe(row.additionalCents);
 const slot=`regular-clearance-${worker?'worker':'in-page'}`;await saveSlot(page,slot);
 await page.evaluate(async()=>{
  const {api}=await import('./lib/appState.js');
  await api('/api/new-league',{method:'POST',body:{seed:118,startYear:2026,controlledTeamId:'MIA',mode:'play'}});
  await (await import('./lib/gameFlow.js')).loadState();
 });
 expect((await readClient(page,'/api/state')).controlledTeamId).toBe('MIA');
 await page.locator('[data-testid="tab-settings"]').click();await expect(page.locator('#settingsTab')).not.toHaveAttribute('aria-busy','true');
 await page.locator('#saveSlotInput').fill(slot);await page.locator('#loadBtn').click();
 await expect.poll(async()=>(await readClient(page,'/api/state')).controlledTeamId).toBe('BUF');
 await expect(page.locator('#statusChip')).toContainText('Ready');await page.reload();await waitGameReady(page);await assertRuntime(page,worker);
 const restored=(await readClient(page,'/api/snapshot/export')).snapshot;
 expect(restored.currentWeek).toBe(3);
 expect(restored.league.players.find(p=>p.id===playerId).elevationInjuryPay).toEqual(retained.elevationInjuryPay);
 expect(restored.league.capLedger.BUF.elevationInjuryCharges).toEqual(result.league.capLedger.BUF.elevationInjuryCharges);
 const manifest=JSON.parse(await fs.readFile('static/deploy-manifest.json','utf8'));
 await fs.mkdir('.cache/regular-injury-accrual-client',{recursive:true});
 await fs.writeFile(`.cache/regular-injury-accrual-client/${worker?'worker':'in-page'}.json`,JSON.stringify({worker,playerId,artifactDigest:manifest.artifactFingerprint.digest,
  sourceSnapshotSha256:baseline.beforeSnapshotSha256,actualRegularAdvance:true,namedSaveReplacementLoadReload:true,week:2,
  additionalCents:row.additionalCents,practiceCents:row.practiceCents,originalPayer:row.teamId,missingCents:0,
  scope:'Controlled injury fixture, real regular runtime command and restoration; not full NFL policy or visual acceptance.'},null,2)+'\n');
});
