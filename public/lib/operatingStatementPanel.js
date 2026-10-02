import { state } from "./appState.js";
import { escapeHtml, fmtMoney } from "./appCore.js";

// S113 — the Boardroom's operating statement: gate revenue against staff costs,
// with the cash runway that already drives owner heat. Read-only.
export function renderOperatingStatement(statement = state.dashboard?.operatingStatement) {
  const panel = document.getElementById("operatingStatementPanel");
  if (!panel) return;
  if (!statement) { panel.hidden = true; return; }
  panel.hidden = false;
  const runwayPct = Math.max(4, Math.min(100, Math.round((statement.runwayYears / Math.max(0.1, statement.targetRunwayYears)) * 100)));
  const line = (label, value, tone = "") => `<div class="statement-line ${tone}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
  panel.innerHTML = `
    <div class="franchise-command-head">
      <div><span class="brand-kicker">Operating Statement · season to date</span><h3>Where the money stands</h3></div>
      <span class="statement-status ${escapeHtml(statement.status)}">${escapeHtml(statement.status === "healthy" ? "Healthy" : statement.status === "watch" ? "Watch" : "Under pressure")}</span>
    </div>
    <div class="statement-grid">
      <div class="statement-col">
        ${line("Gate revenue", fmtMoney(statement.revenueYtd))}
        ${line("Staff costs", `−${fmtMoney(statement.staffCostsYtd)}`)}
        ${line("Net operating", fmtMoney(statement.netOperatingYtd), statement.netOperatingYtd >= 0 ? "positive" : "negative")}
        ${statement.revenueRank ? line("League revenue rank", `${statement.revenueRank} of ${statement.leagueTeams}`) : ""}
      </div>
      <div class="statement-col">
        ${line("Operating cash", fmtMoney(statement.cash))}
        ${line("Next year's football costs", fmtMoney(statement.annualObligations))}
        ${line("Facility upkeep (in costs)", fmtMoney(statement.facilityUpkeep))}
        <div class="statement-runway" aria-label="Cash runway ${escapeHtml(String(statement.runwayYears))} years against a target of ${escapeHtml(String(statement.targetRunwayYears))}">
          <div class="statement-line"><span>Cash runway</span><strong>${escapeHtml(String(statement.runwayYears))} yrs / target ${escapeHtml(String(statement.targetRunwayYears))}</strong></div>
          <div class="lens-bar"><span style="width:${runwayPct}%"></span></div>
        </div>
      </div>
    </div>
    <p class="small">${escapeHtml(statement.verdict)}${statement.ownerHeatFromFinances ? ` Adds ${escapeHtml(String(statement.ownerHeatFromFinances))} owner heat.` : ""}</p>
    <p class="small muted">${escapeHtml(statement.note)}</p>`;
}
