const MIN_PASSPHRASE_LENGTH = 12;
const DEFAULT_ITERATIONS = 210_000;
const AUTH_CONTEXT = "franchise-architect-football:gist-save:v2\n";

function cryptoApi() {
  if (!globalThis.crypto?.subtle || typeof globalThis.crypto.getRandomValues !== "function") {
    throw new Error("Passphrase authentication requires Web Crypto in this browser.");
  }
  return globalThis.crypto;
}

function passphraseValue(passphrase) {
  const value = typeof passphrase === "string" ? passphrase : "";
  if (value.length < MIN_PASSPHRASE_LENGTH) {
    throw new Error(`Save passphrase must be at least ${MIN_PASSPHRASE_LENGTH} characters.`);
  }
  return value;
}

function encode64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decode64(value, label) {
  try {
    return Uint8Array.from(atob(String(value || "")), (character) => character.charCodeAt(0));
  } catch {
    throw new Error(`Cloud save ${label} metadata is malformed.`);
  }
}

async function keyFor(passphrase, salt, iterations) {
  const api = cryptoApi();
  const material = await api.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphraseValue(passphrase)),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return api.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    material,
    { name: "HMAC", hash: "SHA-256", length: 256 },
    false,
    ["sign", "verify"]
  );
}

function messageFor(serialized) {
  return new TextEncoder().encode(`${AUTH_CONTEXT}${serialized}`);
}

export async function buildPassphraseAuthentication(serialized, passphrase) {
  const api = cryptoApi();
  const salt = api.getRandomValues(new Uint8Array(16));
  const key = await keyFor(passphrase, salt, DEFAULT_ITERATIONS);
  const tag = new Uint8Array(await api.subtle.sign("HMAC", key, messageFor(serialized)));
  return {
    scheme: "pbkdf2-hmac-sha256",
    kdf: { name: "PBKDF2", hash: "SHA-256", iterations: DEFAULT_ITERATIONS, salt: encode64(salt) },
    mac: { name: "HMAC", hash: "SHA-256", tag: encode64(tag) }
  };
}

export async function verifyPassphraseAuthentication(serialized, authentication, passphrase) {
  const iterations = Number(authentication?.kdf?.iterations);
  if (
    authentication?.scheme !== "pbkdf2-hmac-sha256" ||
    authentication.kdf?.name !== "PBKDF2" || authentication.kdf?.hash !== "SHA-256" ||
    authentication.mac?.name !== "HMAC" || authentication.mac?.hash !== "SHA-256" ||
    !Number.isInteger(iterations) || iterations < 100_000 || iterations > 2_000_000
  ) {
    throw new Error("Cloud save uses unsupported or malformed passphrase authentication metadata.");
  }
  const salt = decode64(authentication.kdf.salt, "salt");
  const tag = decode64(authentication.mac.tag, "authentication tag");
  if (salt.length < 16 || tag.length !== 32) {
    throw new Error("Cloud save passphrase authentication metadata is malformed.");
  }
  const key = await keyFor(passphrase, salt, iterations);
  if (!(await cryptoApi().subtle.verify("HMAC", key, tag, messageFor(serialized)))) {
    throw new Error("Cloud save authentication failed — the passphrase is wrong or the save metadata/content was modified.");
  }
}
