// Lossless JSON representation: repeated object key layouts are stored once.
// Arrays have tag0; objects have a positive one-based dictionary tag. Primitive
// values are unchanged. The outer compressed-format prefix prevents collisions
// with user fields or arrays in legacy JSON saves.
export function packJsonLayouts(value) {
  const layouts = [], ids = new Map();
  function pack(value, depth = 0) {
    if (depth > 512) throw new Error('JSON layout depth exceeds512');
    if (Array.isArray(value)) return [0, ...value.map(entry => pack(entry, depth + 1))];
    if (value === null || typeof value !== 'object') return value;
    const keys = Object.keys(value);
    const signature = JSON.stringify(keys);
    if (!ids.has(signature)) {
      ids.set(signature, layouts.length + 1);
      layouts.push(keys);
    }
    return [ids.get(signature), ...keys.map(key => pack(value[key], depth + 1))];
  }
  const data = pack(value);
  return { format: 'json-layouts-v1', layouts, data };
}

export function unpackJsonLayouts(envelope) {
  const invalid = () => { throw new Error('Invalid JSON layout save encoding.'); };
  if (!envelope || envelope.format !== 'json-layouts-v1' || !Array.isArray(envelope.layouts)
    || !Object.hasOwn(envelope, 'data') || Object.keys(envelope).some(key => !['format', 'layouts', 'data'].includes(key))) invalid();
  const layouts = envelope.layouts;
  for (const keys of layouts) {
    if (!Array.isArray(keys) || keys.some(key => typeof key !== 'string') || new Set(keys).size !== keys.length) invalid();
  }
  function unpack(value, depth = 0) {
    if (depth > 512) invalid();
    if (!Array.isArray(value)) {
      if (value !== null && typeof value === 'object') invalid();
      return value;
    }
    const tag = value[0];
    if (!Number.isInteger(tag) || tag < 0 || tag > layouts.length) invalid();
    if (tag === 0) return value.slice(1).map(entry => unpack(entry, depth + 1));
    const keys = layouts[tag - 1];
    if (value.length !== keys.length + 1) invalid();
    return Object.fromEntries(keys.map((key, index) => [key, unpack(value[index + 1], depth + 1)]));
  }
  return unpack(envelope.data);
}
