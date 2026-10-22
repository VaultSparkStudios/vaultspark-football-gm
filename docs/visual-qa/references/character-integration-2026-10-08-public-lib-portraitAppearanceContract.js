// Appearance/grooming design rules, not demographic probabilities. Structured
// braids/locs hide the loose-strand texture; shaved scalps have no scalp hair.
const all = ["straight", "wavy", "curly", "coily"];
const rule = (textures = all, textureVisible = true, lengthVisible = true) => Object.freeze({ textures: Object.freeze([...textures]), textureVisible, lengthVisible });
export const HAIR_STYLE_RULES = Object.freeze({
  buzz: rule(), fade: rule(), crew: rule(), "short-curls": rule(["curly", "coily"]),
  coils: rule(["coily"]), afro: rule(["curly", "coily"]),
  waves: rule(["wavy", "curly", "coily"]), "side-part": rule(), swept: rule(), long: rule(),
  locs: rule(all, false), braids: rule(all, false),
  receding: rule(all, false, false), shaved: rule(all, false, false)
});
export function resolveStyledTexture(style, texture) {
  const allowed = HAIR_STYLE_RULES[style]?.textures || all;
  return allowed.includes(texture) ? texture : allowed[0];
}
