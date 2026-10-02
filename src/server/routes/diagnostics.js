import { getPersistenceDescriptor } from "../../runtime/persistence.js";
import { clampQueryInt, readRequestBody } from "../httpHardening.js";

// Calibration, warehouse, observability, persistence, simulation jobs and QA.
// Split verbatim from the handleApi dispatcher in src/server.js. Mutable server
// state (the live session, lobby, speedrun and rewind ledgers) is read and
// written through the ctx accessors so a reassigned session is always current.
export async function handleDiagnosticsRoutes(req, res, url, ctx) {
  const { activeSimulationJob, createSimulationJob, parseJsonBody, sendJson, serverMetrics, simJobs, toInt } = ctx;

  if (req.method === "GET" && url.pathname === "/api/calibration") {
    sendJson(res, 200, {
      ok: true,
      profile: ctx.session.realismProfile,
      latestReport: ctx.session.lastCalibrationReport
    });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/warehouse") {
    const year = toInt(url.searchParams.get("year")) || ctx.session.currentYear;
    const teamId = url.searchParams.get("team");
    sendJson(res, 200, {
      ok: true,
      snapshot: ctx.session.getWarehouseSnapshot({ year, teamId: teamId ? String(teamId).toUpperCase() : null })
    });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/calibration/jobs") {
    const limit = clampQueryInt(url.searchParams.get("limit"), { min: 1, max: 200, fallback: 40 });
    sendJson(res, 200, { ok: true, jobs: ctx.session.listCalibrationJobs(limit) });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/calibration/jobs") {
    const body = parseJsonBody(await readRequestBody(req));
    if (body == null) {
      sendJson(res, 400, { ok: false, error: "Invalid JSON body." });
      return true;
    }
    const year = toInt(body.year) || ctx.session.currentYear;
    const samples = clampQueryInt(body.samples, { min: 1, max: 500, fallback: 20 });
    const label = body.label ? String(body.label) : "manual";
    const job = ctx.session.runAutoCalibrationJob({ year, samples, label });
    sendJson(res, 200, { ok: true, job });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/observability") {
    sendJson(res, 200, {
      ok: true,
      runtime: ctx.session.getObservability(),
      server: {
        ...serverMetrics,
        uptimeSeconds: Math.floor((Date.now() - serverMetrics.startedAt) / 1000)
      }
    });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/system/persistence") {
    sendJson(res, 200, { ok: true, persistence: getPersistenceDescriptor() });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/jobs/simulate") {
    const body = parseJsonBody(await readRequestBody(req));
    if (body == null) {
      sendJson(res, 400, { ok: false, error: "Invalid JSON body." });
      return true;
    }
    const seasons = Math.max(1, Math.min(200, toInt(body.seasons) || 10));
    // S86 [audit #7] — runtime parity with localApiRuntime: simulation jobs
    // advance the one shared session, so a concurrent job would double-advance
    // the save while both reported their own progress as complete.
    const running = activeSimulationJob();
    if (running) {
      sendJson(res, 409, {
        ok: false,
        reasonCode: "SIM_JOB_ALREADY_RUNNING",
        error: "A simulation job is already running.",
        job: running
      });
      return true;
    }
    const job = createSimulationJob(seasons);
    sendJson(res, 202, { ok: true, job });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/jobs/simulate") {
    const id = url.searchParams.get("id");
    if (!id) {
      sendJson(res, 200, {
        ok: true,
        jobs: [...simJobs.values()]
          .slice()
          .sort((a, b) => b.createdAt - a.createdAt)
          .slice(0, 30)
      });
      return true;
    }
    const job = simJobs.get(String(id));
    if (!job) {
      sendJson(res, 404, { ok: false, error: "Job not found." });
      return true;
    }
    // Mark fetched for TTL eviction
    if (job.status === "completed" || job.status === "failed") {
      job.fetchedAt = job.fetchedAt || Date.now();
    }
    sendJson(res, 200, { ok: true, job });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/qa/season") {
    const year = toInt(url.searchParams.get("year")) || ctx.session.currentYear;
    sendJson(res, 200, { ok: true, report: ctx.session.getQaReport(year) });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/realism/verify") {
    const seasons = clampQueryInt(url.searchParams.get("seasons"), { min: 1, max: 30, fallback: 12 });
    const report = ctx.session.runRealismVerification({ seasons });
    sendJson(res, 200, { ok: true, report });
    return true;
  }

  return false;
}
