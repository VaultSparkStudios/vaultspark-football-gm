import {fixture as regularFixture} from './regularMedicalFixture.js';
import {createPostseasonState} from '../../src/engine/seasonSimulator.js';
export function fixture({retired=false,weeks=3}={}){
 const {s,l,p}=regularFixture({retired});
 p.injury.weeksRemaining=weeks;s.phase='postseason';s.currentWeek=19;
 // The original payer is out of this bracket; admission is independent of
 // employment and surviving clubs. This is a controlled boundary fixture.
 const payer=l.teams.find(team=>team.id==='BUF');payer.season={...payer.season,wins:0,losses:17,ties:0};
 s.postseasonState=createPostseasonState({league:l,year:2027});
 return {s,l,p};
}
