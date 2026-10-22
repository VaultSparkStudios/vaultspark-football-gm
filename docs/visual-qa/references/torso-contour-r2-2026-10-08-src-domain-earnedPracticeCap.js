import { retainedElevationCap } from './standardElevations.js';
import { retainedInjurySalaryClaimCap } from './injurySalaryClaims.js';
import { retainedAdmittedInjuryCap } from './admittedInjuryPayroll.js';

// Paid practice compensation stays with its payer after the player's active
// contract is traded. It is current-year salary, separate from dead bonus money.
export function retainedPracticeCap(ledger = {}) {
  const amount = ledger.earnedPracticeCurrentYear ?? 0;
  if (!Number.isSafeInteger(amount) || amount < 0) throw new TypeError('Invalid retained practice salary');
  return amount;
}

// Read-only cap total. Trade retention below mutates only the practice base;
// elevation receipts remain a separate cents ledger with their original payer.
export function retainedRosterCompensationCap(ledger = {}) {
  return retainedPracticeCap(ledger) + retainedElevationCap(ledger) + retainedInjurySalaryClaimCap(ledger) + retainedAdmittedInjuryCap(ledger);
}

export function transferableCapHit(contract) {
  return contract.capHit - (contract.practiceEarnedCharge || 0);
}

export function retainPracticeChargeOnTrade(league, player) {
  const amount = player.contract.practiceEarnedCharge || 0;
  if (!amount) return;
  league.capLedger ||= {};
  const ledger = league.capLedger[player.teamId] ||= {};
  ledger.earnedPracticeCurrentYear = retainedPracticeCap(ledger) + amount;
  player.contract = { ...player.contract, capHit: transferableCapHit(player.contract) };
  delete player.contract.practiceEarnedCharge;
}
