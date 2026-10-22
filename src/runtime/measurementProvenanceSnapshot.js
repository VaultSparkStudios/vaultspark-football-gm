// Only repeated measurement-provenance values are interned. Recorded numeric
// dimensions, appearance recipes and player identities remain in place. The
// explicit root format marker distinguishes references from legacy metadata.
export const MEASUREMENT_PROVENANCE_STORAGE='measurement-provenance-dictionary-v1';
const owns=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
function invalid(message) {
  const error=new Error(`Invalid measurement provenance encoding: ${message}`);
  error.reasonCode='SNAPSHOT_MEASUREMENT_PROVENANCE_ENCODING_INVALID';error.status=400;
  throw error;
}
function transformSnapshot(snapshot,transform) {
  const players=list=>!Array.isArray(list)?list:list.map(player=>{
    if(!object(player))return player;
    const next={...player};
    if(owns(player,'measurementProvenance')&&player.measurementProvenance!==undefined)next.measurementProvenance=transform(player.measurementProvenance);
    if(object(player.measurements)&&owns(player.measurements,'provenance')&&player.measurements.provenance!==undefined)next.measurements={...player.measurements,provenance:transform(player.measurements.provenance)};
    return next;
  });
  const league=snapshot.league;
  return {...snapshot,league:{...league,players:players(league.players),
    ...(Array.isArray(league.retiredPlayers)?{retiredPlayers:players(league.retiredPlayers)}:{}),
    ...(object(league.pendingDraft)&&Array.isArray(league.pendingDraft.available)?{pendingDraft:{...league.pendingDraft,available:players(league.pendingDraft.available)}}:{})}};
}
export function compactSnapshotMeasurementProvenance(snapshot) {
  if(snapshot.measurementProvenanceStorage!==undefined)return snapshot;
  const dictionary=[],ids=new Map();
  const compact=transformSnapshot(snapshot,value=>{
    const signature=JSON.stringify(value);
    if(signature===undefined)invalid('non-JSON metadata');
    if(!ids.has(signature)){ids.set(signature,dictionary.length);dictionary.push(JSON.parse(signature));}
    return ids.get(signature);
  });
  return {...compact,measurementProvenanceStorage:{version:MEASUREMENT_PROVENANCE_STORAGE,dictionary}};
}
export function expandSnapshotMeasurementProvenance(snapshot) {
  if(snapshot.measurementProvenanceStorage===undefined)return snapshot;
  const storage=snapshot.measurementProvenanceStorage;
  if(!object(storage)||storage.version!==MEASUREMENT_PROVENANCE_STORAGE||!Array.isArray(storage.dictionary)
    ||Object.keys(storage).some(key=>!['version','dictionary'].includes(key)))invalid('unsupported dictionary');
  for(const entry of storage.dictionary) {
    try {JSON.parse(JSON.stringify(entry));}
    catch {invalid('non-JSON dictionary entry');}
  }
  const expanded=transformSnapshot(snapshot,reference=>{
    if(!Number.isSafeInteger(reference)||reference<0||reference>=storage.dictionary.length)invalid('reference out of range');
    // Independent objects per player preserve mutable provenance behavior.
    // A shared dictionary must never make editing one person edit another.
    try {return JSON.parse(JSON.stringify(storage.dictionary[reference]));}
    catch {invalid('non-JSON dictionary entry');}
  });
  delete expanded.measurementProvenanceStorage;
  return expanded;
}
