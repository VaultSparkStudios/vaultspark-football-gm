import { PLAYER_DEMOGRAPHIC_BASELINE } from "../data/playerDemographicBaseline.js";

// Fictional country/family-history preferences, informed by the country and
// pathway coverage in PLAYER_IDENTITY_RESEARCH_2026-10-06.md. These numerical
// affinities are creative assumptions, not measured NFL conditional shares.
// Positive support preserves diaspora/mixed families. Fitting retains both the
// dated league survey marginal and the separately declared birthplace prior.
export const COUNTRY_IDENTITY_MODEL_VERSION = "fictional-joint-country-v3";
const GROUPS = Object.freeze({
  african: { countries: ["Nigeria", "Cameroon", "Ghana", "Côte d’Ivoire", "Liberia", "Zimbabwe", "Guinea", "Kenya", "Senegal"], affinity: { Black: 18, White: .2, Multiracial: 2, Asian: .3, PacificIslander: .2, HispanicLatino: .5, Indigenous: .2 } },
  caribbean: { countries: ["Jamaica", "Haiti", "Bahamas", "Saint Lucia"], affinity: { Black: 12, White: .6, Multiracial: 3, Asian: .5, PacificIslander: .2, HispanicLatino: 2, Indigenous: .3 } },
  european: { countries: ["United Kingdom", "Germany", "Ireland", "Austria", "Italy", "Denmark", "Belgium", "Netherlands", "Greece", "France", "Sweden"], affinity: { White: 7, Black: 1.5, Multiracial: 2, Asian: 2, PacificIslander: .3, HispanicLatino: 1, Indigenous: .3 } },
  pacific: { countries: ["American Samoa", "Tonga"], affinity: { PacificIslander: 180, Multiracial: 7, Asian: 5, White: .4, Black: .2, HispanicLatino: .5, Indigenous: 1 } },
  eastAsian: { countries: ["South Korea", "Japan", "China", "Taiwan", "Hong Kong", "Philippines"], affinity: { Asian: 900, Multiracial: 4, White: .6, Black: .3, PacificIslander: 4, HispanicLatino: .5, Indigenous: .3 } },
  southAsian: { countries: ["India", "Pakistan"], affinity: { Asian: 900, Multiracial: 3, White: .4, Black: .3, PacificIslander: .2, HispanicLatino: .4, Indigenous: .3 } },
  latinAmerican: { countries: ["Mexico", "Dominican Republic", "Puerto Rico", "Panama", "Belize", "Argentina"], affinity: { HispanicLatino: 100, Multiracial: 5, Black: 2, White: 2, Asian: 1, PacificIslander: .3, Indigenous: 6 } }
});
const INDIVIDUAL = Object.freeze({
  Canada: { White: 3, Black: 2, Multiracial: 3, Asian: 8, Indigenous: 18 },
  Australia: { White: 5, PacificIslander: 8, Asian: 8, Multiracial: 3, Indigenous: 12 },
  "New Zealand": { White: 3, PacificIslander: 30, Asian: 8, Multiracial: 5, Indigenous: 12 },
  // Local census labels are not the NFL's survey labels. Brazilian birth does
  // not imply Hispanic identity; preserve diaspora support without that boost.
  Brazil: { Black: 4, White: 4, Multiracial: 8, Asian: 2, Indigenous: 8, HispanicLatino: 1 },
  "South Africa": { Black: 7, White: 3, Multiracial: 5, Asian: 3 },
  Egypt: { White: 2, Black: 3, Multiracial: 4, Asian: 2 }
});

export function buildCountryIdentityDistribution(baseline = PLAYER_DEMOGRAPHIC_BASELINE) {
  const countries = ["United States", ...Object.keys(baseline.internationalCountries)];
  const categories = Object.keys(baseline.surveyWeights);
  const surveyTotal = Object.values(baseline.surveyWeights).reduce((sum, n) => sum + n, 0);
  const countryTotal = Object.values(baseline.internationalCountries).reduce((sum, n) => sum + n, 0);
  const categoryMarginals = categories.map(category => baseline.surveyWeights[category] / surveyTotal);
  const countryMarginals = countries.map(country => country === "United States" ? 1 - baseline.internationalBirthShare : baseline.internationalBirthShare * baseline.internationalCountries[country] / countryTotal);
  if (![...categoryMarginals, ...countryMarginals].every(value => Number.isFinite(value) && value > 0)) throw new Error("Demographic margins must be finite and positive");
  const joint = countries.map((country, row) => {
    const preferences = INDIVIDUAL[country] || Object.values(GROUPS).find(group => group.countries.includes(country))?.affinity || {};
    return categories.map((category, column) => countryMarginals[row] * categoryMarginals[column] * (preferences[category] || 1));
  });
  let error = Infinity;
  for (let iteration = 0; iteration < 500 && error > 1e-12; iteration++) {
    for (let row = 0; row < countries.length; row++) {
      const scale = countryMarginals[row] / joint[row].reduce((sum, value) => sum + value, 0);
      joint[row] = joint[row].map(value => value * scale);
    }
    for (let column = 0; column < categories.length; column++) {
      const sum = joint.reduce((total, row) => total + row[column], 0);
      const scale = categoryMarginals[column] / sum;
      for (const row of joint) row[column] *= scale;
    }
    error = Math.max(...joint.map((row, index) => Math.abs(row.reduce((sum, value) => sum + value, 0) - countryMarginals[index])));
  }
  if (error > 1e-10 || joint.flat().some(value => !Number.isFinite(value) || value <= 0)) throw new Error("Country/identity calibration did not converge");
  return { version: COUNTRY_IDENTITY_MODEL_VERSION, countries, categories, joint, categoryMarginals, countryMarginals, maxMarginError: error };
}

const MODEL = buildCountryIdentityDistribution();
export function birthplaceWeightsForCategory(category) {
  const column = MODEL.categories.indexOf(category);
  if (column < 0) throw new Error(`Unknown fictional survey category: ${category}`);
  return Object.fromEntries(MODEL.countries.map((country, row) => [country, MODEL.joint[row][column]]));
}
