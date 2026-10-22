// Queue admission is synchronous. Age never proves that a writer has died.
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';

const pause = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

export function acquirePendingQueueLock(file, { timeoutMs = 20_000, pollMs = 50, resourceName = 'PENDING_PROPAGATION' } = {}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs < 0 || !Number.isFinite(pollMs) || pollMs <= 0) throw new Error('Invalid queue lock wait');
  const guard = `${file}.reclaim`;
  const owner = { schemaVersion: 1, token: crypto.randomUUID(), pid: process.pid, host: os.hostname() };
  const encoded = JSON.stringify(owner) + '\n';
  const deadline = Date.now() + timeoutMs;
  let reason = 'admission guard held (never automatically recovered)';
  const read = () => { try { return fs.readFileSync(file, 'utf8'); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } };
  const underGuard = (fn) => {
    let fd;
    try { fd = fs.openSync(guard, 'wx', 0o600); }
    catch (e) {
      // Windows may report delete-pending exclusive files as EPERM/EACCES.
      // Treat inaccessible admission as busy, never as permission to bypass it.
      if (['EEXIST', 'EPERM', 'EACCES'].includes(e.code)) return { admitted: false, code: e.code };
      throw e;
    }
    try { fs.writeFileSync(fd, encoded); return { admitted: true, value: fn() }; }
    finally { fs.closeSync(fd); fs.unlinkSync(guard); }
  };
  for (;;) {
    const attempt = underGuard(() => {
      const prior = read();
      if (prior !== null) {
        let identity;
        try { identity = JSON.parse(prior); } catch { /* legacy/unknown stays held */ }
        let dead = false;
        if (identity?.schemaVersion === 1 && typeof identity.token === 'string' && identity.token.length > 0
          && identity.host === owner.host && Number.isSafeInteger(identity.pid) && identity.pid > 0) {
          try { process.kill(identity.pid, 0); reason = `live owner pid ${identity.pid}`; }
          catch (e) { dead = e.code === 'ESRCH'; reason = dead ? 'dead owner' : 'owner liveness unknown'; }
        } else reason = 'legacy, foreign or unverified owner; explicit recovery required';
        if (!dead) return false;
        // Every conforming acquisition/recovery holds this guard: no successor can
        // replace the inspected owner between its inspection and unlink.
        fs.unlinkSync(file);
      }
      fs.writeFileSync(file, encoded, { flag: 'wx', mode: 0o600 });
      return true;
    });
    if (attempt.admitted && attempt.value) break;
    if (!attempt.admitted) reason = `admission guard held (${attempt.code}; never automatically recovered)`;
    if (Date.now() >= deadline) throw new Error(`${resourceName} lock busy: ${reason} (${file})`);
    pause(Math.min(pollMs, Math.max(1, deadline - Date.now())));
  }
  const assertHeld = () => { if (read() !== encoded) throw new Error(`${resourceName} lock ownership changed`); };
  const release = () => {
    const releaseDeadline = Date.now() + timeoutMs;
    for (;;) {
      const attempt = underGuard(() => {
        if (read() !== encoded) return false;
        fs.unlinkSync(file);
        return true;
      });
      if (attempt.admitted) return attempt.value;
      if (Date.now() >= releaseDeadline) throw new Error(`${resourceName} release blocked by admission guard (${guard})`);
      pause(pollMs);
    }
  };
  return { assertHeld, release, owner };
}
