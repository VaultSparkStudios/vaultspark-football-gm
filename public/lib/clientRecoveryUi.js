import {
  getLocalRuntime,
  getRuntimeMode,
  getLocalSessionRecoveryStatus,
} from "./api/createApiClient.js";

export async function flushLocalSessionCheckpoint() {
  if (getRuntimeMode() !== "client") return;
  const runtime = await getLocalRuntime();
  await runtime.flush?.();
}

async function restorePreviousLocalCheckpoint() {
  const runtime = await getLocalRuntime();
  if (!runtime.restorePreviousCheckpoint) throw new Error("No browser checkpoint is available.");
  await runtime.restorePreviousCheckpoint();
}

/** A checkpoint retry never repeats the player's already-applied command. */
export function mountClientRecoveryUi({ onCheckpointReady = null, onOpenSaves = null } = {}) {
  if (document.getElementById("clientRecoveryNotice")) return;
  if (!onOpenSaves && document.getElementById("saveSlotInput")) onOpenSaves = () => {
    document.querySelector('[data-testid="tab-settings"]')?.click();
    const input = document.getElementById("saveSlotInput");
    input?.scrollIntoView({ block: "center" });
    input?.focus({ preventScroll: true });
  };
  const panel = document.createElement("aside");
  panel.id = "clientRecoveryNotice";
  panel.className = "client-recovery-notice";
  panel.hidden = true;
  panel.setAttribute("role", "status");
  const message = document.createElement("p");
  const retry = document.createElement("button");
  retry.id = "retryClientCheckpointBtn";
  retry.textContent = "Retry checkpoint";
  const saves = document.createElement("button");
  saves.id = "openRecoverySavesBtn";
  saves.textContent = "Open saves and export";
  saves.hidden = !onOpenSaves;
  saves.addEventListener("click", () => onOpenSaves?.());
  const dismiss = document.createElement("button");
  dismiss.textContent = "Dismiss notice";
  let acknowledgedInterruption = false;
  dismiss.addEventListener("click", () => { acknowledgedInterruption = true; render(); });
  const note = document.createElement("small");
  note.textContent = "Browser checkpoints recover this tab after a reload. Save a slot or export your franchise before closing the tab.";
  const actions = document.createElement("div");
  actions.className = "client-recovery-actions";
  actions.append(retry, saves, dismiss);
  panel.append(message, actions, note);
  document.body.append(panel);

  function render(status = getLocalSessionRecoveryStatus()) {
    const failed = ["unsaved", "recovery-required"].includes(status.status);
    if (!status.interruptedJob) acknowledgedInterruption = false;
    panel.hidden = !failed && !status.backgroundRunning && (!status.interruptedJob || acknowledgedInterruption);
    message.textContent = status.message || (status.backgroundRunning
      ? "Simulation is still running. Keep this tab open until it finishes and its checkpoint is ready."
      : "Your action was applied, but this tab's recovery checkpoint is not ready. Keep the tab open and retry the checkpoint.");
    retry.hidden = (status.status === "recovery-required" && !status.dirty) || !failed;
    saves.hidden = !onOpenSaves || !failed;
    dismiss.hidden = failed || status.backgroundRunning || !status.interruptedJob;
  }
  retry.addEventListener("click", async () => {
    retry.disabled = true;
    try {
      await flushLocalSessionCheckpoint();
      await onCheckpointReady?.();
    } catch (error) {
      panel.hidden = false;
      message.textContent = `Checkpoint is still unavailable. ${error.message}`;
    } finally { retry.disabled = false; }
  });
  window.addEventListener("vsfgm:session-recovery", (event) => render(event.detail));
  render();
}

/** Keep the dashboard hidden until its franchise authority has been restored. */
export function showClientRecoveryBootError(error) {
  const overlay = document.getElementById("gameBootOverlay");
  const card = overlay?.querySelector(".game-boot-card");
  if (!card) return;
  overlay.setAttribute("role", "alert");
  overlay.setAttribute("aria-label", "Franchise recovery required");
  const title = document.createElement("h2");
  title.textContent = "Your franchise could not open";
  const message = document.createElement("p");
  message.textContent = error?.message || "The browser checkpoint could not be restored.";
  const actions = document.createElement("div");
  actions.className = "client-recovery-actions";
  const retry = document.createElement("button");
  retry.textContent = "Try opening again";
  retry.addEventListener("click", () => window.location.reload());
  actions.append(retry);
  const canRestorePrevious = getLocalSessionRecoveryStatus().canRestorePrevious;
  if (canRestorePrevious) {
    const restore = document.createElement("button");
    restore.id = "restorePreviousCheckpointBtn";
    restore.textContent = "Restore last checkpoint";
    restore.addEventListener("click", async () => {
      restore.disabled = true;
      try {
        await restorePreviousLocalCheckpoint();
        window.location.reload();
      } catch (failure) {
        message.textContent = `The last checkpoint could not be restored. ${failure.message}`;
        restore.disabled = false;
      }
    });
    actions.append(restore);
  }
  const saves = document.createElement("a");
  saves.href = new URL("./index.html", document.baseURI).toString();
  saves.textContent = "Open saved franchises";
  actions.append(saves);
  const detail = document.createElement("p");
  detail.textContent = canRestorePrevious
    ? "Restoring the last checkpoint discards changes made after it. Saved slots and exports remain separate recovery options."
    : "Open saved franchises to choose a saved slot or a backup.";
  card.replaceChildren(title, message, actions, detail);
}
