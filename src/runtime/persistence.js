const PERSISTENCE_KIND = String(process.env.VSFGM_PERSISTENCE || "file").toLowerCase();

function adapterDescriptor(kind, available, notes) {
  return { kind, available, notes };
}

export function getPersistenceDescriptor() {
  if (PERSISTENCE_KIND === "sqlite") {
    return adapterDescriptor(
      "sqlite",
      false,
      "SQLite adapter scaffold is registered but dependency wiring is not enabled in this build."
    );
  }
  if (PERSISTENCE_KIND === "postgres") {
    return adapterDescriptor(
      "postgres",
      false,
      "Postgres adapter scaffold is registered but dependency wiring is not enabled in this build."
    );
  }
  return adapterDescriptor("file", true, "File-backed persistence is active via save slots and rolling backups.");
}
