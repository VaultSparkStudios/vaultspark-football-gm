// The playing style each stored archetype stands for, in the words a scout
// would use. The archetype shaped the player's ratings when he was created
// (playerFactory.js), so the label describes how he actually plays rather than
// decorating him. Derived on demand: nothing is saved, old saves gain it.
//
// The runtime projects { label, craft } onto every player DTO, so the browser
// never declares this table (and the boot bundle does not carry it).
const PLAYING_STYLES = Object.freeze({
  QB: { Pocket: "pocket passer", FieldGeneral: "field general", Scrambler: "scrambling quarterback" },
  RB: { Power: "power back", Elusive: "elusive back", Receiving: "receiving back" },
  WR: { DeepThreat: "deep threat", RouteRunner: "route runner", Possession: "possession receiver" },
  TE: { Blocking: "blocking tight end", Vertical: "seam-stretching tight end", Balanced: "two-way tight end" },
  OL: { PassProtect: "pass protector", PowerRun: "road grader", Balanced: "balanced lineman" },
  DL: { PassRush: "pass rusher", RunStop: "run stuffer", Hybrid: "versatile lineman" },
  LB: { Coverage: "coverage linebacker", Mike: "middle linebacker", Edge: "edge linebacker" },
  DB: { Man: "man-coverage defender", Zone: "zone defender", BallHawk: "ball hawk" },
  K: { PowerLeg: "big-leg kicker", Accurate: "accurate kicker" },
  P: { Directional: "directional punter", Power: "big-leg punter" }
});

const STYLE_CRAFT = Object.freeze({
  "pocket passer": "reading coverage from the pocket and delivering on time",
  "field general": "getting the offense into the right play and protecting the football",
  "scrambling quarterback": "extending plays with his legs and throwing on the move",
  "power back": "running through contact and finishing runs falling forward",
  "elusive back": "making the first tackler miss and turning small creases into big gains",
  "receiving back": "catching the ball out of the backfield and winning in space",
  "deep threat": "running past coverage and taking the top off a defense",
  "route runner": "creating separation with clean breaks and timing",
  "possession receiver": "reliable hands on third down and winning contested catches",
  "blocking tight end": "sealing the edge in the run game and helping in protection",
  "seam-stretching tight end": "attacking the middle of the field down the seam",
  "two-way tight end": "blocking on one snap and running a route on the next",
  "pass protector": "keeping the quarterback clean on passing downs",
  "road grader": "moving defenders off the ball in the run game",
  "balanced lineman": "holding up in both pass protection and the run game",
  "pass rusher": "getting after the quarterback",
  "run stuffer": "holding the point of attack and taking away the run",
  "versatile lineman": "lining up across the front and doing a bit of everything",
  "coverage linebacker": "carrying tight ends and backs in coverage",
  "middle linebacker": "reading the play, filling gaps and making tackles",
  "edge linebacker": "setting the edge and rushing off it",
  "man-coverage defender": "staying on his receiver's hip in man coverage",
  "zone defender": "reading the quarterback and closing on throws in zone",
  "ball hawk": "finding the football and taking it away",
  "big-leg kicker": "making long field goals",
  "accurate kicker": "making the kicks he is supposed to make",
  "directional punter": "placing punts where returners cannot hurt the defense",
  "big-leg punter": "flipping the field with distance"
});

/** { label, craft } for a player's archetype, or null when it has no style. */
export function playingStyleFor(position, archetype) {
  const label = PLAYING_STYLES[position]?.[archetype] || null;
  return label ? { label, craft: STYLE_CRAFT[label] } : null;
}
