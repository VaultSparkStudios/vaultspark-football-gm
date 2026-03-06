import { CONTRACT_RULES } from "../config.js";
import { clamp } from "../utils/rng.js";

const MIN_SALARY = CONTRACT_RULES.minSalary;

function rounded(value) {
  return Math.max(0, Math.round(value));
}

export function normalizeContract(contract = {}) {
  const yearsRemaining = clamp(Number(contract.yearsRemaining || 1), 0, 10);
  const voidYears = clamp(Number(contract.voidYears || 0), 0, 4);
  const salary = rounded(contract.salary ?? contract.capHit ?? MIN_SALARY);
  const baseSalary = rounded(contract.baseSalary ?? salary * 0.82);
  const signingBonus = rounded(contract.signingBonus ?? salary - baseSalary);
  const guaranteed = rounded(contract.guaranteed ?? baseSalary * 0.45 + signingBonus);
  const capYears = Math.max(1, yearsRemaining + voidYears);
  const capHit = rounded(contract.capHit ?? baseSalary + signingBonus / capYears);
  const deadCapRemaining = rounded(contract.deadCapRemaining ?? signingBonus + guaranteed * 0.35);
  return {
    salary,
    yearsRemaining,
    voidYears,
    capHit,
    baseSalary,
    signingBonus,
    guaranteed,
    deadCapRemaining,
    restructureCount: Number(contract.restructureCount || 0),
    franchiseTagYear: Number(contract.franchiseTagYear || 0),
    optionYear: contract.optionYear === true
  };
}

export function buildContract({
  overall,
  years,
  salary,
  minSalary = MIN_SALARY,
  maxSalary = CONTRACT_RULES.maxSalary,
  rng
}) {
  const safeYears = clamp(Number(years || rng?.int(1, 4) || 3), 1, CONTRACT_RULES.maxYears);
  const computedSalary =
    salary ??
    clamp(Math.round(overall * overall * 580 + (rng ? rng.int(-900_000, 1_200_000) : 0)), minSalary, maxSalary);

  const signingBonusShare = 0.18 + (rng ? rng.float(0, 0.14) : 0.1);
  const signingBonus = rounded(computedSalary * signingBonusShare);
  const baseSalary = rounded(computedSalary - signingBonus);
  const guaranteed = rounded(baseSalary * 0.42 + signingBonus);
  const capHit = rounded(baseSalary + signingBonus / safeYears);
  const deadCapRemaining = rounded(signingBonus + guaranteed * 0.35);

  return normalizeContract({
    salary: computedSalary,
    yearsRemaining: safeYears,
    baseSalary,
    signingBonus,
    guaranteed,
    capHit,
    deadCapRemaining,
    restructureCount: 0
  });
}

export function advanceContractYear(contract) {
  const normalized = normalizeContract(contract);
  if (normalized.yearsRemaining <= 0) return normalized;
  const yearsRemaining = normalized.yearsRemaining - 1;
  const bonusProration = normalized.signingBonus / Math.max(1, normalized.yearsRemaining);
  const deadCapRemaining = rounded(Math.max(0, normalized.deadCapRemaining - bonusProration));
  if (yearsRemaining <= 0) {
    return normalizeContract({
      salary: 0,
      yearsRemaining: 0,
      capHit: 0,
      baseSalary: 0,
      signingBonus: 0,
      guaranteed: 0,
      deadCapRemaining: 0,
      restructureCount: normalized.restructureCount
    });
  }
  const capHit = rounded(normalized.baseSalary + normalized.signingBonus / yearsRemaining);
  return normalizeContract({
    ...normalized,
    yearsRemaining,
    capHit,
    deadCapRemaining
  });
}

export function computeReleaseDeadCap(contract, { june1 = false } = {}) {
  const normalized = normalizeContract(contract);
  const immediate = rounded(
    normalized.signingBonus / Math.max(1, normalized.yearsRemaining) + normalized.guaranteed * 0.24
  );
  if (june1 && normalized.yearsRemaining > 1) {
    return {
      currentYearDeadCap: rounded(immediate * 0.55),
      nextYearDeadCap: rounded(immediate * 0.45)
    };
  }
  return { currentYearDeadCap: immediate, nextYearDeadCap: 0 };
}

export function restructureContract(contract, rng) {
  const normalized = normalizeContract(contract);
  if (normalized.yearsRemaining <= 1) return normalizeContract(normalized);
  const convertRatio = 0.24 + (rng ? rng.float(0, 0.18) : 0.3);
  const converted = rounded(normalized.baseSalary * convertRatio);
  const newBase = rounded(Math.max(MIN_SALARY * 0.7, normalized.baseSalary - converted));
  const newBonus = rounded(normalized.signingBonus + converted);
  const years = normalized.yearsRemaining;
  const newCapHit = rounded(newBase + newBonus / years);
  const deadCapRemaining = rounded(normalized.deadCapRemaining + converted * 0.72);
  return normalizeContract({
    ...normalized,
    baseSalary: newBase,
    signingBonus: newBonus,
    capHit: newCapHit,
    deadCapRemaining,
    restructureCount: normalized.restructureCount + 1
  });
}

export function applyFranchiseTag(contract, { year, salary = null } = {}) {
  const normalized = normalizeContract(contract);
  const tagSalary = rounded(
    salary ??
      Math.max(normalized.salary * 1.2, normalized.capHit * 1.35, 18_000_000)
  );
  return normalizeContract({
    ...normalized,
    salary: tagSalary,
    baseSalary: tagSalary,
    guaranteed: tagSalary,
    yearsRemaining: 1,
    voidYears: normalized.voidYears,
    capHit: tagSalary,
    franchiseTagYear: Number(year || 0),
    optionYear: false
  });
}

export function applyFifthYearOption(contract, { salary = null } = {}) {
  const normalized = normalizeContract(contract);
  const optionSalary = rounded(
    salary ?? Math.max(normalized.salary * 1.15, normalized.capHit * 1.2, 7_500_000)
  );
  return normalizeContract({
    ...normalized,
    salary: optionSalary,
    baseSalary: optionSalary,
    yearsRemaining: Math.max(1, normalized.yearsRemaining) + 1,
    optionYear: true
  });
}
