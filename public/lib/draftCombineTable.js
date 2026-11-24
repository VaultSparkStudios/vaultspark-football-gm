// The scouting combine results table (S133: loaded on demand from tabDraft.js).
import { state } from "./appState.js";
import { escapeHtml } from "./appCore.js";

export function renderCombineResults() {
  const table = document.getElementById("combineResultsTable");
  if (!table) return;
  const results = state.dashboard?.combineResults || [];
  if (!results.length) {
    table.innerHTML = `<div class="narrative-empty">No combine data. Run the combine above.</div>`;
    return;
  }
  const sorted = [...results].sort((a, b) => (b.grade || 0) - (a.grade || 0));
  // The drills a scout reads first; a dash where the position did not run it.
  const drill = (p, key, digits) => {
    const value = Number(p.events?.[key]);
    return Number.isFinite(value) ? value.toFixed(digits) : "—";
  };
  table.innerHTML = `<table class="data-table"><thead><tr>
    <th>Name</th><th>Pos</th><th>Scout OVR</th><th title="40-yard dash, seconds">40</th><th title="Vertical jump, inches">Vert</th><th title="Bench press reps at 225 lb">Bench</th><th>Grade</th><th>Tier</th>
  </tr></thead><tbody>` +
  sorted.map((p) => {
    const g = p.grade ?? 0;
    const cls = g >= 78 ? "combine-grade-elite" : g >= 65 ? "combine-grade-good" : g >= 50 ? "combine-grade-avg" : "combine-grade-poor";
    const tier = g >= 78 ? "Elite" : g >= 65 ? "Good" : g >= 50 ? "Average" : "Poor";
    return `<tr>
      <td>${escapeHtml(p.name || p.id || "")}</td>
      <td>${escapeHtml(p.position || p.pos || "")}</td>
      <td>${escapeHtml(String(p.overall ?? "—"))}</td>
      <td>${escapeHtml(drill(p, "fortyYard", 2))}</td>
      <td>${escapeHtml(drill(p, "verticalJump", 1))}</td>
      <td>${escapeHtml(drill(p, "benchPress", 0))}</td>
      <td class="${cls}">${escapeHtml(String(p.grade ?? "—"))}</td>
      <td class="${cls}">${tier}</td>
    </tr>`;
  }).join("") + `</tbody></table>`;
}
