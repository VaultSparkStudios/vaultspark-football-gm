import test from 'node:test';
import assert from 'node:assert/strict';

const TOKEN = 'vsfgm_gist_token';
function storage({ read = false, write = false, remove = false, initial = {} } = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem(key) { if (read) throw new Error('denied read'); return data.get(key) ?? null; },
    setItem(key, value) { if (write) throw new Error('quota'); data.set(key, value); },
    removeItem(key) { if (remove) throw new Error('denied removal'); data.delete(key); }
  };
}
let serial = 0;
async function withStorage(local, session, run) {
  const previous = Object.fromEntries(['localStorage', 'sessionStorage'].map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  try {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: local });
    Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: session });
    const module = await import(`../public/lib/gistCredentials.js?resilience=${serial++}`);
    await run(module);
  } finally {
    for (const [key, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}

test('denied storage methods keep token and Gist target usable for the tab', async () => {
  await withStorage(storage({ read: true, write: true, remove: true }), storage({ read: true, write: true, remove: true }), async m => {
    assert.equal(m.getSavedToken(), '');
    assert.equal(m.getSavedGistId(), '');
    assert.equal(m.saveToken('tab-credential').ok, true);
    assert.equal(m.getSavedToken(), 'tab-credential');
    m.saveGistId('cloud-target');
    assert.equal(m.getSavedGistId(), 'cloud-target');
    m.saveToken('');
    m.saveGistId('');
    assert.equal(m.getSavedToken(), '');
    assert.equal(m.getSavedGistId(), '');
  });
});

test('migration retains token in memory when session quota is exhausted and removes legacy storage', async () => {
  const local = storage({ initial: { [TOKEN]: 'legacy-credential' } });
  await withStorage(local, storage({ write: true }), m => {
    assert.equal(m.getSavedToken(), 'legacy-credential');
    assert.equal(local.getItem(TOKEN), null);
    assert.equal(m.getSavedToken(), 'legacy-credential');
  });
});

test('denied legacy reads still attempt cleanup and cannot mask a session credential', async () => {
  let removed = false;
  const local = { getItem() { throw new Error('denied'); }, removeItem() { removed = true; } };
  await withStorage(local, storage({ initial: { [TOKEN]: 'session-credential' } }), m => {
    assert.equal(m.getSavedToken(), 'session-credential');
    assert.equal(removed, true);
  });
});

test('legacy cleanup failure cannot abort a session credential read', async () => {
  await withStorage(storage({ remove: true }), storage({ initial: { [TOKEN]: 'session-credential' } }), m => {
    assert.equal(m.getSavedToken(), 'session-credential');
  });
});

test('clearing tab memory does not resurrect readable storage after denied removals', async () => {
  await withStorage(storage({ remove: true, initial: { vsfgm_gist_id: 'old-target' } }), storage({ remove: true, initial: { [TOKEN]: 'old-credential' } }), m => {
    assert.equal(m.getSavedToken(), 'old-credential');
    m.saveToken('');
    m.saveGistId('');
    assert.equal(m.getSavedToken(), '');
    assert.equal(m.getSavedGistId(), '');
  });
});
