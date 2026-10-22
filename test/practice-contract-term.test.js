import test from 'node:test';
import assert from 'node:assert/strict';
import {resolvePracticeContractTerm} from '../src/domain/practiceContractTerm.js';
import {canonicalFootballGame} from '../src/domain/footballGameReference.js';

function fixture(){
 const teams=['AFC','NFC'].flatMap((conference)=>Array.from({length:8},(_,i)=>({id:`${conference[0]}${i+1}`,conference})));
 const gameArchive=[];
 const game=(homeTeamId,awayTeamId,round,conference)=>{
  const reference=canonicalFootballGame({year:2026,seasonType:'playoffs',round,label:round==='super-bowl'?round:`${conference.toLowerCase()}-${round}`,homeTeamId,awayTeamId});
  gameArchive.push({...reference,homeScore:20,awayScore:10,winnerId:homeTeamId});
 };
 for(const conference of ['AFC','NFC']){
  const prefix=conference[0];
  for(const [home,away]of [[2,7],[3,6],[4,5]])game(`${prefix}${home}`,`${prefix}${away}`,'wildcard',conference);
  for(const [home,away]of [[1,4],[2,3]])game(`${prefix}${home}`,`${prefix}${away}`,'divisional',conference);
  game(`${prefix}1`,`${prefix}2`,'conference',conference);
 }
 game('A1','N1','super-bowl');
 gameArchive.push({...canonicalFootballGame({year:2026,week:18,homeTeamId:'A8',awayTeamId:'N8'}),homeScore:20,awayScore:10,winnerId:'A8'});
 return {teams,gameArchive,history:[]};
}

test('weekly contract term follows club final, elimination or proved nonparticipation without changing any state',()=>{
 const league=fixture(),before=structuredClone(league);
 for(const [teamId,end,proof]of [['A1',24,'completed-final'],['A2',22,'playoff-elimination'],['A7',20,'playoff-elimination'],['A8',19,'completed-bracket-nonparticipant']]){
  const result=resolvePracticeContractTerm(league,{teamId,year:2026});assert.equal(result.ok,true);assert.equal(result.endsAfterMedicalWeek,end);assert.equal(result.proof,proof);
 }
 assert.deepEqual(league,before);
});

test('a final participant or documented playoff loser needs no guessed regular game or population-wide bracket completion',()=>{
 const league=fixture();league.gameArchive=league.gameArchive.filter(g=>g.round==='super-bowl'||g.round==='wildcard'&&g.awayTeamId==='A7');
 assert.equal(resolvePracticeContractTerm(league,{teamId:'A1',year:2026}).endsAfterMedicalWeek,24);
 assert.equal(resolvePracticeContractTerm(league,{teamId:'A7',year:2026}).endsAfterMedicalWeek,20);
 assert.equal(resolvePracticeContractTerm(league,{teamId:'A8',year:2026}).ok,false);
});

test('nonparticipants require a connected complete bracket and proved final regular game; missing evidence stays unproved',()=>{
 for(const change of [
  l=>l.gameArchive.splice(0,1),
  l=>l.gameArchive.pop(),
  l=>{const game=l.gameArchive.find(g=>g.label==='afc-conference');Object.assign(game,canonicalFootballGame({...game,homeTeamId:'A4'}),{winnerId:'A4'});},
  l=>l.teams.find(t=>t.id==='A2').conference='NFC'
 ]){
  const league=fixture();change(league);assert.equal(resolvePracticeContractTerm(league,{teamId:'A8',year:2026}).reasonCode,'PRACTICE_CONTRACT_TERM_UNPROVED');
 }
});

test('duplicate identical result is inert but contradictory scores, finals and post-elimination appearances do not establish an end',()=>{
 const league=fixture();league.gameArchive.push({...league.gameArchive[0]});assert.equal(resolvePracticeContractTerm(league,{teamId:'A8',year:2026}).ok,true);
 const contradiction=fixture();contradiction.gameArchive.push({...contradiction.gameArchive[0],homeScore:21});assert.equal(resolvePracticeContractTerm(contradiction,{teamId:'A1',year:2026}).ok,false);
 const finals=fixture();const final=finals.gameArchive.find(g=>g.round==='super-bowl');finals.gameArchive.push({...canonicalFootballGame({...final,homeTeamId:'A2'}),homeScore:20,awayScore:10,winnerId:'A2'});assert.equal(resolvePracticeContractTerm(finals,{teamId:'A1',year:2026}).ok,false);
 const later=fixture();later.gameArchive.push({...canonicalFootballGame({year:2026,homeTeamId:'A7',awayTeamId:'A2',seasonType:'playoffs',round:'conference',label:'afc-conference'}),homeScore:20,awayScore:10,winnerId:'A7'});assert.equal(resolvePracticeContractTerm(later,{teamId:'A7',year:2026}).ok,false);
});

test('retained canonical history final supports terminal proof, while malformed, historical, future and unknown sources do not',()=>{
 const league=fixture(),final=league.gameArchive.find(g=>g.round==='super-bowl');league.gameArchive=league.gameArchive.filter(g=>g!==final);league.history=[{year:2026,superBowl:final}];
 assert.equal(resolvePracticeContractTerm(league,{teamId:'A1',year:2026}).endsAfterMedicalWeek,24);
 for(const options of [{teamId:'A1',year:2025},{teamId:'UNKNOWN',year:2026},{teamId:'A1',year:2021},{teamId:'A1',year:2201}])assert.equal(resolvePracticeContractTerm(league,options).ok,false);
 league.history[0].superBowl.gameId='not-a-game';assert.equal(resolvePracticeContractTerm(league,{teamId:'A1',year:2026}).ok,false);
});

test('neither final participant can bypass an earlier loss, while a legitimate final loser still has the final-game term',()=>{
 for(const teamId of ['A1','N1']){
  const league=fixture(),opponent=`${teamId[0]}2`,conference=teamId[0]==='A'?'afc':'nfc';
  const early=canonicalFootballGame({year:2026,homeTeamId:opponent,awayTeamId:teamId,seasonType:'playoffs',round:'wildcard',label:`${conference}-wildcard`});
  league.gameArchive.push({...early,homeScore:20,awayScore:10,winnerId:opponent});
  const before=structuredClone(league);
  assert.equal(resolvePracticeContractTerm(league,{teamId,year:2026}).ok,false);assert.deepEqual(league,before);
 }
 assert.equal(resolvePracticeContractTerm(fixture(),{teamId:'N1',year:2026}).endsAfterMedicalWeek,24);
});
