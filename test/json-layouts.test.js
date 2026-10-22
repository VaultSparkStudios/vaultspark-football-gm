import test from 'node:test';
import assert from 'node:assert/strict';
import { packJsonLayouts, unpackJsonLayouts } from '../src/adapters/persistence/jsonLayouts.js';
import { decodeSnapshot, encodeSnapshot, LEGACY_ENCODED_PREFIX, ENCODED_PREFIX } from '../src/adapters/persistence/snapshotCodec.js';

async function gzip(value, prefix) {
  const stream = new Blob([JSON.stringify(value)]).stream().pipeThrough(new CompressionStream('gzip'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  return prefix + btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''));
}

test('JSON layout roundtrip retains heterogeneous records, missing/null fields, arrays and precision', () => {
  const rows = Array.from({ length: 80 }, (_, i) => ({ id: `P${i}`, geometry: { frame: .12345678912345678 + i, dimensions: [i, null, { id: 'nested' }] },
    ...(i % 2 ? { empty: {} } : { optional: null }), marker: { format: 'json-layouts-v1', data: [0, 1], layouts: [] } }));
  const packed = packJsonLayouts(rows);
  assert.deepEqual(unpackJsonLayouts(packed), rows);
  assert.ok(packed.layouts.length < rows.length, 'repeated keys are shared without altering values');
});

test('JSON layouts preserve reserved own keys without changing prototypes', () => {
  const data = JSON.parse('{"__proto__":{"polluted":true},"constructor":4,"prototype":null}');
  const decoded = unpackJsonLayouts(packJsonLayouts(data));
  assert.deepEqual(decoded, data);
  assert.equal(Object.getPrototypeOf(decoded), Object.prototype);
  assert.equal({}.polluted, undefined);
});

test('malformed dictionaries, tags and arities fail closed', async () => {
  const invalid = [
    { format: 'other', layouts: [], data: null },
    { format: 'json-layouts-v1', layouts: [['id', 'id']], data: [1, 1, 2] },
    { format: 'json-layouts-v1', layouts: [[4]], data: [1, 1] },
    { format: 'json-layouts-v1', layouts: [['id']], data: [2, 1] },
    { format: 'json-layouts-v1', layouts: [['id']], data: [1] },
    { format: 'json-layouts-v1', layouts: [], data: {} },
    { format: 'json-layouts-v1', layouts: [], data: [] }
  ];
  for (const value of invalid) {
    assert.throws(() => unpackJsonLayouts(value), /Invalid JSON layout/);
    await assert.rejects(decodeSnapshot(await gzip(value, ENCODED_PREFIX)), /Invalid JSON layout/);
  }
});

test('legacy gzip and plain JSON remain readable while new encoding retains serializer semantics', async () => {
  const legacy = { league: { players: [] }, unknown: { format: 'json-layouts-v1', layouts: [], data: [] } };
  assert.deepEqual(await decodeSnapshot(await gzip(legacy, LEGACY_ENCODED_PREFIX)), legacy);
  assert.deepEqual(await decodeSnapshot(JSON.stringify(legacy)), legacy);
  const data = { date: new Date('2026-10-06T00:00:00Z'), missing: undefined, items: [undefined, NaN, Infinity],
    rows: Array.from({ length: 1000 }, (_, i) => ({ id: i, precise: .12345678912345678, alive: true, note: 'repeated record' })) };
  const original = JSON.stringify(data);
  const encoded = await encodeSnapshot(data);
  assert.ok(encoded.startsWith(ENCODED_PREFIX));
  assert.equal(JSON.stringify(await decodeSnapshot(encoded)), original);
  assert.equal(JSON.stringify(data), original, 'encoding does not mutate its input');
});
