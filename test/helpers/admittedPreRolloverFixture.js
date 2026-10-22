import {fixture as postseasonFixture} from './admittedPostseasonFixture.js';
export function fixture({retired=false,weeks=3}={}){
 const {s,l,p}=postseasonFixture({retired,weeks:weeks+5});
 const result=s.advanceWeek();if(!result.ok)throw new Error('Actual completed playoff fixture required');
 s.phase='offseason';s.currentWeek=19;
 return {s,l,p};
}
