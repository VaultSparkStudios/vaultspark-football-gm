import { createHash } from 'node:crypto';
import path from 'node:path';

export function goalKey(goal) {
  if (typeof goal?.threadId !== 'string' || !goal.threadId.trim() || !Number.isSafeInteger(goal.createdAt) || goal.createdAt <= 0) {
    throw new Error('Native goal threadId and createdAt (epoch seconds) are required; prompt text is not an identity');
  }
  return createHash('sha256').update(JSON.stringify([goal.threadId, goal.createdAt])).digest('hex');
}

export function assessArcBinding(goal, receipt, project) {
  const key = goalKey(goal);
  if (receipt === null) return { action: 'start-new-arc', key, completionProven: false };
  if (receipt?.schemaVersion !== 1 || receipt.key !== key || receipt.threadId !== goal.threadId || receipt.createdAt !== goal.createdAt || receipt.project !== project ||
      !Number.isSafeInteger(receipt.session) || receipt.session < 1 || !/^[a-f0-9]{40}$/.test(receipt.startHead || '') ||
      !Number.isFinite(Date.parse(receipt.sessionStart)) || Date.parse(receipt.sessionStart) < goal.createdAt * 1000) {
    throw new Error('Arc goal binding is corrupt, foreign, or predates this goal; investigate without borrowing prior-session completion');
  }
  return { action: 'resume-current-arc', key, session: receipt.session, startHead: receipt.startHead, sessionStart: receipt.sessionStart, completionProven: false };
}

export function bindArcGoal(goal, lockText, project) {
  const fields = Object.fromEntries(String(lockText).split(/\r?\n/).filter(line => line.includes(':')).map(line => {
    const at = line.indexOf(':'); return [line.slice(0, at).trim(), line.slice(at + 1).trim()];
  }));
  const receipt = { schemaVersion: 1, key: goalKey(goal), threadId: goal.threadId, createdAt: goal.createdAt,
    project, session: Number(fields.session_id), startHead: fields.start_head, sessionStart: fields.session_start };
  if (fields.agent !== 'codex') throw new Error('Binding requires this goal’s Codex session lock');
  if (String(fields.project || '').toLowerCase() !== path.basename(project).toLowerCase()) {
    throw new Error('Session lock project does not match the goal checkout; investigate foreign lock');
  }
  assessArcBinding(goal, receipt, project);
  return receipt;
}
