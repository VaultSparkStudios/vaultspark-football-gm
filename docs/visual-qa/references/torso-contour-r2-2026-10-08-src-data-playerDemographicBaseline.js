// Survey categories reproduce the source contract; they are not physiological
// classes and must never be used in rating, injury, personality or GM formulas.
export const PLAYER_DEMOGRAPHIC_BASELINE = Object.freeze({
  version: "tides-2023-fictional-identity-v1",
  sourceYear: 2023,
  sourceUrl: "https://www.tidesport.org/_files/ugd/326b62_f8ae68d67f744fdbba5962c84b43f3bf.pdf",
  sourceTable: "Table 1, PDF page 46",
  // Counts, rather than the rounded percentages summing to 100.2.
  surveyWeights: Object.freeze({
    Black: 821, White: 375, Multiracial: 167, Undisclosed: 136,
    PacificIslander: 27, HispanicLatino: 7, Asian: 2, Indigenous: 1
  }),
  // Design approximation. 61 distinct international-born active players over
  // the 2025 season is NOT a measured opening-day snapshot percentage.
  internationalBirthShare: 0.04,
  birthplaceSourceUrl: "https://operations.nfl.com/programs-initiatives/international-growth/international-player-pathway",
  countryWeightEvidence: "illustrative football-pathway prior; not measured country frequencies",
  // Country/territory coverage with established pathways plus a worldwide tail.
  internationalCountries: Object.freeze({
    Canada: 18, Nigeria: 14, Australia: 10, "American Samoa": 9,
    "United Kingdom": 6, Germany: 5, Jamaica: 4, Mexico: 3,
    "New Zealand": 2, Tonga: 2, Ireland: 2, Austria: 2,
    Brazil: 1, Cameroon: 1, Ghana: 1, "Côte d’Ivoire": 1,
    Liberia: 1, "South Africa": 1, Zimbabwe: 1, Guinea: 1,
    "South Korea": 1, Japan: 1, China: 1, Taiwan: 1,
    "Hong Kong": 1, Italy: 1, Denmark: 1, Belgium: 1,
    Netherlands: 1, Greece: 1, Haiti: 1, Bahamas: 1,
    "Dominican Republic": 1, "Puerto Rico": 1, Panama: 1,
    Belize: 1, "Saint Lucia": 1, Egypt: 1,
    India: 0.4, Philippines: 0.4, France: 0.4, Argentina: 0.4,
    Kenya: 0.4, Senegal: 0.4, Pakistan: 0.4, Sweden: 0.4
  })
});

export const DEMOGRAPHIC_LABELS = Object.freeze({
  Black: "Black", White: "White", Multiracial: "Multiracial",
  Undisclosed: "Not disclosed", PacificIslander: "Pacific Islander",
  HispanicLatino: "Hispanic / Latino", Asian: "Asian", Indigenous: "Indigenous"
});
