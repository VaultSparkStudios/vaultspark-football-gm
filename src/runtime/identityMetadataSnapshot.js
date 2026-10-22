// Lossless interning of repeated fictional-name provenance. Appearance seeds,
// family identity and all player facts remain in their original locations.
export const IDENTITY_METADATA_STORAGE='player-naming-metadata-v1';
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const keys=['namingCohort','namingContext'];
function invalid(message){const error=new Error(`Invalid identity metadata encoding: ${message}`);error.reasonCode='SNAPSHOT_IDENTITY_METADATA_INVALID';error.status=400;throw error;}
function transform(snapshot,convert){
  const players=list=>!Array.isArray(list)?list:list.map(player=>{
    if(!object(player?.profile?.identity))return player;
    const identity={...player.profile.identity};
    for(const key of keys)if(Object.hasOwn(identity,key)&&identity[key]!==undefined)identity[key]=convert(identity[key]);
    return{...player,profile:{...player.profile,identity}};
  });
  const league=snapshot.league;
  return{...snapshot,league:{...league,players:players(league.players),
    ...(Array.isArray(league.retiredPlayers)?{retiredPlayers:players(league.retiredPlayers)}:{}),
    ...(object(league.pendingDraft)&&Array.isArray(league.pendingDraft.available)?{pendingDraft:{...league.pendingDraft,available:players(league.pendingDraft.available)}}:{})}};
}
export function compactSnapshotIdentityMetadata(snapshot){
  if(snapshot.identityMetadataStorage!==undefined)return snapshot;
  const dictionary=[],ids=new Map();
  const packed=transform(snapshot,value=>{
    const signature=JSON.stringify(value);if(signature===undefined)invalid('non-JSON metadata');
    if(!ids.has(signature)){ids.set(signature,dictionary.length);dictionary.push(JSON.parse(signature));}
    return ids.get(signature);
  });
  return{...packed,identityMetadataStorage:{version:IDENTITY_METADATA_STORAGE,dictionary}};
}
export function expandSnapshotIdentityMetadata(snapshot){
  const storage=snapshot.identityMetadataStorage;if(storage===undefined)return snapshot;
  if(!object(storage)||storage.version!==IDENTITY_METADATA_STORAGE||!Array.isArray(storage.dictionary)
    ||Object.keys(storage).some(key=>!['version','dictionary'].includes(key)))invalid('unsupported dictionary');
  const expanded=transform(snapshot,reference=>{
    if(!Number.isSafeInteger(reference)||reference<0||reference>=storage.dictionary.length)invalid('reference out of range');
    try{return JSON.parse(JSON.stringify(storage.dictionary[reference]));}catch{invalid('non-JSON dictionary entry');}
  });
  delete expanded.identityMetadataStorage;return expanded;
}
