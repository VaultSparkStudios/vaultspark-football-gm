// Curated fictional family histories, not census/NFL conditional frequencies.
// Evidence, local-category limitations and recruitment assumptions are documented
// in docs/PLAYER_IDENTITY_RESEARCH_2026-10-06.md. Reporting labels stay separate.
export const FAMILY_HISTORY_MODEL_VERSION = "fictional-country-family-v1";
export const LOCAL_FAMILY_PREFERENCE = .75;

function freezeVocabulary(record) {
  return Object.freeze(Object.fromEntries(Object.entries(record).map(([key, value]) =>
    [key, Array.isArray(value) ? Object.freeze(value) : freezeVocabulary(value)])));
}

export const FAMILY_HERITAGE = freezeVocabulary({
  Black: ["African American", "Jamaican", "Haitian", "Nigerian", "Ghanaian", "Kenyan", "Afro-Latino", "Black British"],
  White: ["European American", "Irish", "British", "German", "Italian", "French", "Scandinavian", "Lebanese", "Iranian", "Egyptian"],
  PacificIslander: ["Samoan", "Tongan", "Native Hawaiian", "Fijian", "Cook Islands Māori", "Niuean", "Tokelauan", "Tuvaluan", "Chamorro"],
  HispanicLatino: ["Mexican", "Puerto Rican", "Dominican", "Cuban", "Central American", "South American", "Afro-Latino"],
  Asian: ["Korean", "Japanese", "Chinese", "Filipino", "Vietnamese", "Indian", "Pakistani", "Bangladeshi", "Thai", "Indonesian"],
  Indigenous: ["Native American", "First Nations", "Alaska Native", "Māori", "Aboriginal Australian", "Torres Strait Islander", "Indigenous Mexican"]
});

// An absent local option means a diaspora-family draw, not an impossible person.
// Local histories are descriptive vocabulary, not citizenship or tribal status.
// Legacy survey labels do not define physiology or constrain football ratings.
export const COUNTRY_FAMILY_HERITAGE = freezeVocabulary({
  "United States": { Black: ["African American", "Jamaican", "Haitian", "Nigerian"], White: ["European American", "Irish", "German", "Italian", "Lebanese", "Iranian"], PacificIslander: ["Native Hawaiian", "Samoan", "Tongan", "Chamorro"], HispanicLatino: ["Mexican", "Puerto Rican", "Dominican", "Cuban"], Asian: ["Chinese", "Filipino", "Indian", "Korean", "Japanese", "Vietnamese"], Indigenous: ["Native American", "Alaska Native"] },
  Canada: { Black: ["Black Canadian", "Jamaican", "Haitian", "Nigerian"], White: ["French Canadian", "British", "Irish"], Asian: ["Indian", "Chinese", "Filipino", "Pakistani"], Indigenous: ["First Nations", "Métis", "Inuit"] },
  Nigeria: { Black: ["Nigerian", "Igbo", "Yoruba", "Hausa"] },
  Australia: { White: ["British", "Irish", "Italian", "Greek"], Asian: ["Chinese", "Indian", "Vietnamese", "Filipino"], PacificIslander: ["Samoan", "Tongan", "Fijian"], Indigenous: ["Aboriginal Australian", "Torres Strait Islander"] },
  "American Samoa": { PacificIslander: ["Samoan", "Tongan", "Tokelauan"], Asian: ["Filipino", "Chinese"] },
  "United Kingdom": { Black: ["Black British", "Jamaican", "Nigerian", "Ghanaian"], White: ["English", "Scottish", "Welsh", "Irish"], Asian: ["Indian", "Pakistani", "Bangladeshi", "Chinese"] },
  Germany: { Black: ["Black German", "Ghanaian", "Nigerian"], White: ["German", "Turkish", "Polish", "Italian"], Asian: ["Vietnamese", "Indian", "Chinese"] },
  Jamaica: { Black: ["Jamaican"], Asian: ["Chinese", "Indian"] },
  Mexico: { HispanicLatino: ["Mexican", "Afro-Mexican"], Black: ["Afro-Mexican"], White: ["Mexican", "Spanish"], Indigenous: ["Indigenous Mexican"], Asian: ["Chinese", "Japanese"] },
  "New Zealand": { White: ["New Zealand European", "British", "Irish"], PacificIslander: ["Samoan", "Tongan", "Cook Islands Māori", "Niuean", "Fijian", "Tokelauan", "Tuvaluan"], Indigenous: ["Māori"], Asian: ["Chinese", "Indian", "Filipino"] },
  Tonga: { PacificIslander: ["Tongan", "Samoan", "Fijian"] },
  Ireland: { White: ["Irish"], Black: ["Black Irish", "Nigerian"], Asian: ["Indian", "Chinese"] },
  Austria: { White: ["Austrian", "German", "Turkish", "Bosnian"] },
  Brazil: { Black: ["Afro-Brazilian"], White: ["Brazilian", "Portuguese", "Italian", "German"], Asian: ["Japanese Brazilian", "Chinese Brazilian"], Indigenous: ["Indigenous Brazilian"] },
  Cameroon: { Black: ["Cameroonian"] },
  Ghana: { Black: ["Ghanaian", "Akan", "Ewe"] },
  "Côte d’Ivoire": { Black: ["Ivorian"] },
  Liberia: { Black: ["Liberian"] },
  "South Africa": { Black: ["Black South African", "Zulu", "Xhosa", "Sotho"], White: ["Afrikaner", "British South African"], Asian: ["Indian South African", "Chinese South African"] },
  Zimbabwe: { Black: ["Zimbabwean", "Shona", "Ndebele"], White: ["British Zimbabwean"] },
  Guinea: { Black: ["Guinean"] },
  "South Korea": { Asian: ["Korean"] },
  Japan: { Asian: ["Japanese", "Korean", "Chinese"] },
  China: { Asian: ["Chinese", "Han Chinese", "Hui Chinese"] },
  Taiwan: { Asian: ["Taiwanese", "Han Taiwanese"], Indigenous: ["Indigenous Taiwanese"] },
  "Hong Kong": { Asian: ["Hong Kong Chinese", "Chinese", "Indian", "Filipino"] },
  Italy: { White: ["Italian"], Black: ["Black Italian", "Nigerian"], Asian: ["Chinese", "Indian"] },
  Denmark: { White: ["Danish"], Black: ["Black Danish"], Asian: ["Pakistani", "Indian"] },
  Belgium: { White: ["Flemish", "Walloon"], Black: ["Congolese Belgian"], Asian: ["Chinese", "Indian"] },
  Netherlands: { White: ["Dutch"], Black: ["Afro-Surinamese", "Afro-Caribbean Dutch"], Asian: ["Indonesian", "Chinese", "Indian"] },
  Greece: { White: ["Greek"], Black: ["Black Greek", "Nigerian"] },
  Haiti: { Black: ["Haitian"] },
  Bahamas: { Black: ["Bahamian"] },
  "Dominican Republic": { HispanicLatino: ["Dominican"], Black: ["Afro-Dominican"], White: ["Dominican", "Spanish"] },
  "Puerto Rico": { HispanicLatino: ["Puerto Rican"], Black: ["Afro-Puerto Rican"], White: ["Puerto Rican", "Spanish"] },
  Panama: { HispanicLatino: ["Panamanian"], Black: ["Afro-Panamanian"], Indigenous: ["Indigenous Panamanian"] },
  Belize: { Black: ["Belizean Creole", "Garifuna"], HispanicLatino: ["Belizean", "Central American"], Indigenous: ["Maya"] },
  "Saint Lucia": { Black: ["Saint Lucian"] },
  Egypt: { White: ["Egyptian", "Lebanese"], Black: ["Nubian", "Sudanese"], Asian: ["Indian", "Chinese"] },
  India: { Asian: ["Indian", "Punjabi", "Tamil", "Bengali", "Gujarati"] },
  Philippines: { Asian: ["Filipino", "Chinese Filipino"] },
  France: { White: ["French", "Algerian", "Moroccan", "Tunisian"], Black: ["Black French", "Senegalese", "Ivorian", "Haitian"], Asian: ["Vietnamese", "Chinese"] },
  Argentina: { HispanicLatino: ["Argentine"], White: ["Argentine", "Italian", "Spanish"], Black: ["Afro-Argentine"], Indigenous: ["Indigenous Argentine"] },
  Kenya: { Black: ["Kenyan", "Kikuyu", "Luo", "Kalenjin"], Asian: ["Indian Kenyan"] },
  Senegal: { Black: ["Senegalese", "Wolof", "Serer"] },
  Pakistan: { Asian: ["Pakistani", "Punjabi", "Sindhi", "Pashtun"] },
  Sweden: { White: ["Swedish", "Finnish", "Iranian"], Black: ["Black Swedish", "Somali"], Indigenous: ["Sámi"] }
});

export function familyHeritageOptions(country, category) {
  return {
    local: COUNTRY_FAMILY_HERITAGE[country]?.[category] || [],
    diaspora: FAMILY_HERITAGE[category] || [],
    localPreference: LOCAL_FAMILY_PREFERENCE
  };
}
