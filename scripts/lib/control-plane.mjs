// control-plane.mjs — S373 [SIL][S372 #2]. One answer to "is this repo Studio Ops".
//
// Three files each carried their own copy (check-protocol-skill-parity, fast-node,
// check-windows-hide) with two different rules, and the first fix to one of them
// misclassified VOID in S372. The two checkers import this. fast-node.mjs keeps an inline
// copy by design (it ships under safe-spawn and must import nothing local); a test holds
// that copy to this one.
//
// Two witnesses, either is enough:
//   skills-tree    plugins/studio-os/skills is a directory. The tracked skill sources
//                  live only in the control plane; a recipient has no such tree by design.
//   declared-slug  context/PROJECT_STATUS.json declares slug "studio-ops". This one sits
//                  outside every root a caller might be asserting, so a vanished plugins/
//                  cannot demote the control plane to a recipient and waive its checks.
//
// Deliberately NOT a witness: portfolio/PROJECT_REGISTRY.json. VOID tracks a copy of it,
// so its presence says nothing about which repo this is.
//
// No imports beyond node:fs and node:path: this file propagates to every sibling with
// its callers and must stand alone there.
import fs from 'node:fs';
import path from 'node:path';

export const CONTROL_PLANE_SLUG = 'studio-ops';

/**
 * @param {string} root repository root to classify
 * @returns {{ controlPlane: boolean, witness: 'skills-tree'|'declared-slug'|null }}
 */
export function controlPlaneIdentity(root) {
  if (typeof root !== 'string' || root === '') return { controlPlane: false, witness: null };
  try {
    if (fs.statSync(path.join(root, 'plugins', 'studio-os', 'skills')).isDirectory()) return { controlPlane: true, witness: 'skills-tree' };
  } catch { /* fall through to the second witness */ }
  try {
    const status = JSON.parse(fs.readFileSync(path.join(root, 'context', 'PROJECT_STATUS.json'), 'utf8'));
    if (status && status.slug === CONTROL_PLANE_SLUG) return { controlPlane: true, witness: 'declared-slug' };
  } catch { /* unreadable status is not a witness */ }
  return { controlPlane: false, witness: null };
}

export function isControlPlane(root) {
  return controlPlaneIdentity(root).controlPlane;
}

export default { controlPlaneIdentity, isControlPlane, CONTROL_PLANE_SLUG };
