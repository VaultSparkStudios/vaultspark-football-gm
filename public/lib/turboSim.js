/**
 * Turbo Sim — 100-Year Fast-Forward Mode
 *
 * Runs N seasons in rapid succession via the /api/advance-season endpoint,
 * displaying a live progress ribbon and surfacing summary milestones.
 *
 * Usage:
 *   const sim = new TurboSim({ seasons: 10, onProgress, onMilestone, onComplete, onError });
 *   await sim.start();
 *   sim.abort(); // cancel mid-run
 */

export class TurboSim {
  constructor({ seasons = 10, onProgress, onMilestone, onComplete, onError, callApi }) {
    this.seasons = Math.min(Math.max(1, seasons), 100);
    this.onProgress = onProgress || (() => {});
    this.onMilestone = onMilestone || (() => {});
    this.onComplete = onComplete || (() => {});
    this.onError = onError || (() => {});
    this.callApi = callApi; // function(method, params) → Promise<result>
    this._aborted = false;
    this._completed = 0;
    this.summaries = [];
  }

  abort() {
    this._aborted = true;
  }

  async start() {
    this._aborted = false;
    this._completed = 0;
    this.summaries = [];

    for (let i = 0; i < this.seasons; i++) {
      if (this._aborted) break;

      try {
        const result = await this.callApi("advance-season", {});
        this._completed++;
        const summary = this._extractSummary(result);
        this.summaries.push(summary);

        this.onProgress({
          completed: this._completed,
          total: this.seasons,
          pct: Math.round((this._completed / this.seasons) * 100),
          latest: summary
        });

        this._checkMilestones(summary, i);

        // Yield to UI thread between seasons
        await new Promise((r) => setTimeout(r, 0));
      } catch (err) {
        this.onError(err);
        return;
      }
    }

    this.onComplete({
      completed: this._completed,
      aborted: this._aborted,
      summaries: this.summaries,
      highlights: this._buildHighlights()
    });
  }

  _extractSummary(result) {
    const year = result?.year ?? result?.state?.currentYear ?? "?";
    const champion = result?.champion ?? result?.state?.history?.seasons?.at(-1)?.champion ?? "—";
    const sbMvp = result?.sbMvp ?? "—";
    const mvp = result?.mvp ?? result?.state?.history?.seasons?.at(-1)?.awards?.mvp ?? "—";
    const record = result?.controlledTeamRecord ?? "—";
    return { year, champion, sbMvp, mvp, record };
  }

  _checkMilestones(summary, idx) {
    const { year, champion } = summary;
    // Dynasty alert: same champion 3+ seasons in a row
    if (this.summaries.length >= 3) {
      const last3 = this.summaries.slice(-3);
      const allSame = last3.every((s) => s.champion === champion && champion !== "—");
      if (allSame) {
        this.onMilestone({ type: "dynasty", team: champion, year,
          message: `${champion} wins their 3rd consecutive Super Bowl — dynasty confirmed.` });
      }
    }
    // Decade marker
    if (idx > 0 && idx % 10 === 9) {
      this.onMilestone({ type: "decade", year,
        message: `Decade complete — ${this.summaries.slice(-10).map((s) => s.champion).filter(Boolean).join(", ")} claimed titles over the last 10 seasons.` });
    }
  }

  _buildHighlights() {
    if (!this.summaries.length) return [];
    const highlights = [];

    // Most frequent champion
    const freq = {};
    for (const s of this.summaries) {
      if (s.champion && s.champion !== "—") freq[s.champion] = (freq[s.champion] || 0) + 1;
    }
    const topTeam = Object.entries(freq).sort((a, b) => b[1] - a[1])[0];
    if (topTeam) {
      highlights.push({ type: "top-dynasty", team: topTeam[0], titles: topTeam[1],
        label: `Most Dominant Franchise: ${topTeam[0]} (${topTeam[1]} titles)` });
    }

    // Unique champions
    const unique = new Set(Object.keys(freq));
    highlights.push({ type: "parity", count: unique.size,
      label: `League Parity: ${unique.size} different champions over ${this.summaries.length} seasons` });

    return highlights;
  }
}

// ── Progress bar renderer (pure DOM, no framework dependency) ─────────────────

export function renderTurboProgressBar(container, progress) {
  const { completed, total, pct, latest } = progress;
  container.innerHTML = `
    <div class="turbo-progress">
      <div class="turbo-bar-track">
        <div class="turbo-bar-fill" style="width:${pct}%"></div>
      </div>
      <div class="turbo-stats">
        <span class="turbo-count">Season <strong>${completed}</strong> of <strong>${total}</strong></span>
        <span class="turbo-pct">${pct}%</span>
      </div>
      ${latest ? `
      <div class="turbo-latest">
        <span class="turbo-season-label">Season ${latest.year || "?"}</span>
        <span class="turbo-champion">${latest.champion || "—"}</span>
        <span class="turbo-record">${latest.record || ""}</span>
      </div>` : ""}
    </div>
  `;
}

export function renderTurboHighlights(container, result) {
  const rows = result.highlights.map((h) =>
    `<div class="turbo-highlight-row">
       <span class="turbo-highlight-label">${h.label}</span>
     </div>`
  ).join("");

  const champRows = (result.summaries || []).slice(0, 20).map((s) =>
    `<div class="turbo-summary-row">
       <span class="turbo-yr">Season ${s.year}</span>
       <span class="turbo-champ">${s.champion}</span>
       <span class="turbo-rec">${s.record}</span>
     </div>`
  ).join("");

  container.innerHTML = `
    <div class="turbo-complete">
      <div class="turbo-headline">${result.aborted ? "Simulation Stopped" : "Simulation Complete"}</div>
      <div class="turbo-sub">${result.completed} season${result.completed !== 1 ? "s" : ""} simulated</div>
      <div class="turbo-highlights">${rows}</div>
      <div class="turbo-log-header">Season Results</div>
      <div class="turbo-log">${champRows}</div>
    </div>
  `;
}
