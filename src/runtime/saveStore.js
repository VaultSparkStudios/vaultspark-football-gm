import { defaultFileSaveStore } from "../adapters/persistence/fileSaveStore.js";
export { isBackupSlot, safeSlotName } from "../adapters/persistence/saveStoreShared.js";

export const listSaveSlots = defaultFileSaveStore.listSaveSlots;
export const listBackupSlots = defaultFileSaveStore.listBackupSlots;
export const saveSessionToSlot = defaultFileSaveStore.saveSessionToSlot;
export const saveRollingBackup = defaultFileSaveStore.saveRollingBackup;
export const loadSessionFromSlot = defaultFileSaveStore.loadSessionFromSlot;
export const deleteSaveSlot = defaultFileSaveStore.deleteSaveSlot;
