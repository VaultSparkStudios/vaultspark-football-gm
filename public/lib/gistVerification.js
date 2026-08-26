import { verifyPassphraseAuthentication } from "./gistAuthentication.js";

const METADATA_SCHEMA_VERSION = 2;

function checksum(serialized) {
  const value = String(serialized);
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function corruptionCheckPasses(serialized, stamp) {
  const value = String(serialized);
  return stamp?.algo === "fnv1a32" && stamp.length === value.length && stamp.checksum === checksum(value);
}

function corruptionError() {
  return new Error(
    "Cloud save failed its corruption check — the synced data may be damaged or truncated. " +
      "Your local saves are unaffected; re-export from the device that has the good copy."
  );
}

export async function verifySyncMetadata(serialized, metadata, passphrase = "") {
  const supplied = typeof passphrase === "string" && passphrase.length > 0;
  // Version 1 was an unkeyed checksum: useful for damage, never authentication.
  if (metadata?.algo === "fnv1a32") {
    if (!corruptionCheckPasses(serialized, metadata)) throw corruptionError();
    if (supplied) throw new Error("This legacy cloud save has no passphrase authentication metadata.");
    return "corruption-checked";
  }
  if (metadata?.schemaVersion !== METADATA_SCHEMA_VERSION) {
    throw new Error("Cloud save uses unsupported or malformed verification metadata.");
  }
  if (!corruptionCheckPasses(serialized, metadata.corruptionDetection)) throw corruptionError();
  if (!metadata.authentication) {
    if (supplied) throw new Error("This cloud save was not exported with passphrase authentication.");
    return "corruption-checked";
  }
  if (!supplied) {
    throw new Error("This cloud save is passphrase-authenticated. Enter its save passphrase to import it.");
  }
  await verifyPassphraseAuthentication(serialized, metadata.authentication, passphrase);
  return "authenticated";
}
