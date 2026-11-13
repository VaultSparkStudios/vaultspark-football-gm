// Bind delegation without loading the staff renderer on the initial game path.
import { presentActionError } from "./appCore.js";

export function initCoachingMarketPanel(onAction) {
  const node = document.getElementById("coachingMarketPanel");
  if (!node || node.dataset.wired === "1") return;
  node.dataset.wired = "1";
  node.addEventListener("click", (event) => {
    const button = event.target.closest("[data-coach-action]");
    if (!button || button.disabled) return;
    const controls = [...node.querySelectorAll("[data-coach-action]")].map((control) => [control, control.disabled]);
    const restore = () => controls.forEach(([control, disabled]) => {
      if (control.isConnected) control.disabled = disabled;
    });
    controls.forEach(([control]) => { control.disabled = true; });
    try {
      const result = onAction({ action: button.dataset.coachAction, role: button.dataset.role,
        candidateId: button.dataset.candidate || null });
      Promise.resolve(result).catch(presentActionError).finally(restore);
    } catch (error) {
      restore();
      presentActionError(error);
    }
  });
}
