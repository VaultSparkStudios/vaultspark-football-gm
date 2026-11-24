#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { getSecret, redact } from "./lib/secrets.mjs";

const API_ROOT = "https://api.cloudflare.com/client/v4";
const GRAPHQL_URL = `${API_ROOT}/graphql`;

function valueAfter(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
}

function normalizeSince(value, now = new Date()) {
  if (value) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) throw new Error("--since must be an ISO date or timestamp");
    return parsed.toISOString();
  }
  return new Date(now.getTime() - 7 * 86_400_000).toISOString();
}

async function jsonRequest(url, { token, fetchImpl, method = "GET", body = null }) {
  const response = await fetchImpl(url, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body ? { "content-type": "application/json" } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15_000)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false || payload.errors?.length) {
    const errors = (payload.errors || []).map((entry) => entry.message || String(entry)).join("; ");
    throw new Error(`Cloudflare request failed (HTTP ${response.status})${errors ? `: ${errors}` : ""}`);
  }
  return payload;
}

export function buildAnalyticsReport({ host, since, rows = [], observedAt = new Date().toISOString() }) {
  const byPath = new Map();
  for (const row of rows) {
    const requestPath = row?.dimensions?.requestPath || "/";
    const count = Number(row?.count || 0);
    byPath.set(requestPath, (byPath.get(requestPath) || 0) + count);
  }
  const paths = [...byPath.entries()]
    .map(([requestPath, pageLoads]) => ({ requestPath, pageLoads }))
    .sort((a, b) => b.pageLoads - a.pageLoads || a.requestPath.localeCompare(b.requestPath));
  const pageLoads = paths.reduce((sum, entry) => sum + entry.pageLoads, 0);
  // Web Analytics counts page loads that ran its beacon, so crawlers that do
  // not execute scripts are already excluded; the dashboard's raw "requests"
  // and "visits" are not. The landing-to-game ratio answers "visits but no
  // runs": how many landing views became a game page load.
  const loadsAt = (...candidates) => paths.filter((entry) => candidates.includes(entry.requestPath)).reduce((sum, entry) => sum + entry.pageLoads, 0);
  const landingLoads = loadsAt("/", "/index.html");
  const gameLoads = loadsAt("/game.html", "/game");
  const funnel = {
    landingLoads,
    gameLoads,
    landingToGame: landingLoads > 0 ? Math.round((gameLoads / landingLoads) * 1000) / 1000 : null,
    note: "Human page loads only (beacon-executing browsers). Game sessions, franchises founded and first games come from the Gridiron Census: GET /community/v1/pulse."
  };
  return {
    schemaVersion: "1.0",
    kind: "cloudflare-web-analytics-aggregate-proof",
    host,
    window: { since, observedAt },
    aggregate: { pageLoads, paths },
    funnel,
    conclusions: {
      reportingVerified: pageLoads > 0,
      engagementVerified: false,
      retentionVerified: false,
      cohortVerified: false
    },
    privacy: {
      granularity: "aggregate page path counts only",
      personalDataStored: false
    },
    capability: {
      used: "cloudflare.deploy",
      leastPrivilegeAnalyticsReadRecommended: true
    }
  };
}

export async function collectCloudflareWebAnalytics({
  token,
  host,
  since,
  fetchImpl = fetch,
  now = new Date()
}) {
  if (!token) throw new Error("Cloudflare analytics credential is missing");
  if (!/^[a-z0-9.-]+$/i.test(host || "")) throw new Error("host must be a DNS hostname");
  const sinceIso = normalizeSince(since, now);
  const zoneName = host.replace(/^staging\./, "");
  const zonePayload = await jsonRequest(
    `${API_ROOT}/zones?name=${encodeURIComponent(zoneName)}&status=active&per_page=1`,
    { token, fetchImpl }
  );
  const accountTag = zonePayload?.result?.[0]?.account?.id;
  if (!accountTag) throw new Error(`Cloudflare zone/account authority not found for ${zoneName}`);

  const query = `query WebAnalytics($accountTag: string!, $filter: AccountRumPageloadEventsAdaptiveGroupsFilter_InputObject!) {
    viewer {
      accounts(filter: { accountTag: $accountTag }) {
        rumPageloadEventsAdaptiveGroups(filter: $filter, limit: 1000, orderBy: [date_ASC]) {
          count
          dimensions { date requestPath }
        }
      }
    }
  }`;
  const analyticsPayload = await jsonRequest(GRAPHQL_URL, {
    token,
    fetchImpl,
    method: "POST",
    body: {
      query,
      variables: {
        accountTag,
        filter: { datetime_geq: sinceIso, requestHost: host }
      }
    }
  });
  const rows = analyticsPayload?.data?.viewer?.accounts?.[0]?.rumPageloadEventsAdaptiveGroups || [];
  return buildAnalyticsReport({ host, since: sinceIso, rows, observedAt: now.toISOString() });
}

export async function main(args = process.argv.slice(2)) {
  const host = valueAfter(args, "--host") || "playfranchisearchitect.com";
  const since = valueAfter(args, "--since");
  const output = valueAfter(args, "--output");
  const token = getSecret("CLOUDFLARE_STUDIO_TOKEN", "cloudflare.deploy")
    || getSecret("CLOUDFLARE_API_TOKEN", "cloudflare.deploy");
  const report = await collectCloudflareWebAnalytics({ token, host, since });
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (output) {
    const target = path.resolve(output);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, serialized, "utf8");
    console.log(redact(`Cloudflare Web Analytics proof: ${report.aggregate.pageLoads} aggregate page load(s); wrote ${path.relative(process.cwd(), target)}`));
  } else {
    process.stdout.write(redact(serialized));
  }
  return report;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    console.error(redact(`Cloudflare Web Analytics proof: ERROR — ${error.message}`));
    process.exitCode = 1;
  });
}
