// Explicit fictional kinship authority. A shared surname never creates a family.
// Background and visual resemblance have no connection to football ability.
export const FAMILY_IDENTITY_VERSION = 'player-family-v1';
const categories = new Set(['Black','White','Multiracial','PacificIslander','HispanicLatino','Asian','Indigenous','Undisclosed']);

export function resolvePlayerFamily(player) {
  const family = player?.profile?.family;
  if (family == null) return null;
  if (family.version !== FAMILY_IDENTITY_VERSION || typeof family.id !== 'string' || !family.id.length || family.id.length > 256
    || !categories.has(family.surveyCategory) || !Array.isArray(family.heritage) || family.heritage.length > 8
    || family.heritage.some(value => typeof value !== 'string' || !value.length || value.length > 120)
    || typeof family.appearanceSeed !== 'string' || !family.appearanceSeed.length || family.appearanceSeed.length > 512
    || !Array.isArray(family.complexionBand) || family.complexionBand.length !== 2
    || !family.complexionBand.every(Number.isFinite) || family.complexionBand[0] < 0 || family.complexionBand[1] > 1
    || family.complexionBand[0] > family.complexionBand[1]) {
    const error = new Error('Invalid player family identity');
    error.reasonCode = 'SNAPSHOT_VISUAL_IDENTITY_INVALID'; error.status = 400; throw error;
  }
  const anchorBand=family.anchorComplexionBand;
  if (!Array.isArray(anchorBand) || anchorBand.length!==2 || !anchorBand.every(Number.isFinite)
    || anchorBand[0]<0 || anchorBand[1]>1 || anchorBand[0]>anchorBand[1]) {
    const error=new Error('Invalid family anchor complexion');error.reasonCode='SNAPSHOT_VISUAL_IDENTITY_INVALID';error.status=400;throw error;
  }
  const identity = player?.profile?.identity;
  if (identity && (identity.surveyCategory !== family.surveyCategory
    || JSON.stringify(identity.heritage) !== JSON.stringify(family.heritage))) {
    const error = new Error('Player background disagrees with saved family identity');
    error.reasonCode = 'SNAPSHOT_VISUAL_IDENTITY_INVALID'; error.status = 400; throw error;
  }
  return {...family, heritage:[...family.heritage], complexionBand:[...family.complexionBand],anchorComplexionBand:[...anchorBand]};
}

export function familyFromPlayer(player, appearance, recipe=player?.profile?.appearanceRecipe) {
  const stored = resolvePlayerFamily(player);
  if (stored) return stored;
  const identity = player?.profile?.identity;
  if (!categories.has(identity?.surveyCategory) || !Array.isArray(identity.heritage) || !Number.isFinite(appearance?.complexion)) {
    throw new Error('A family anchor requires a generated identity and appearance');
  }
  const center = Math.max(.04, Math.min(.96, appearance.complexion));
  return resolvePlayerFamily({profile:{family:{version:FAMILY_IDENTITY_VERSION,
    id:`family:${player.id}`, surveyCategory:identity.surveyCategory, heritage:[...identity.heritage],
    appearanceSeed:String(player.profile.appearanceRecipe?.seed || player.profile.faceSeed || player.id),
    anchorComplexionBand:[...(recipe?.complexionBand || [0,1])],
    complexionBand:[Math.max(0,center-.065), Math.min(1,center+.065)]}}});
}
