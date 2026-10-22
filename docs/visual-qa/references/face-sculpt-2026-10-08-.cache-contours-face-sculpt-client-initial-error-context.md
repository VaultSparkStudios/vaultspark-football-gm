# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: player-character-client.spec.js >> built worker saves one character through named replacement/load/reload
- Location: tests-ui\player-character-client.spec.js:4:33

# Error details

```
Test timeout of 180000ms exceeded.
```

```
Error: expect(locator).toContainText(expected) failed

Locator: locator('#statusChip')
Expected substring: "Ready"
Received string:    "Loading..."
Timeout: 60000ms

Call log:
  - Expect "toContainText" with timeout 60000ms
  - waiting for locator('#statusChip')
    7 × locator resolved to <span class="chip" id="statusChip" data-testid="status-chip">Loading...</span>
      - unexpected value "Loading..."

```

```yaml
- status "Opening franchise":
  - text: Opening Contract
  - heading "Building Your Franchise Command Deck" [level=2]
  - paragraph: Loading the league, your owner mandate, and the first decision that will define this franchise.
```

# Test source

```ts
  47  | 
  48  | export async function configureClient(page, worker) {
  49  |   await page.addInitScript((useWorker) => {
  50  |     localStorage.setItem("vsfgm:runtime-mode", "client");
  51  |     if (useWorker) localStorage.removeItem("vsfgm:runtime-worker");
  52  |     else localStorage.setItem("vsfgm:runtime-worker", "off");
  53  |     const postMessage = Worker.prototype.postMessage;
  54  |     const addListener = Worker.prototype.addEventListener;
  55  |     const removeListener = Worker.prototype.removeEventListener;
  56  |     const observed = new WeakSet();
  57  |     const requests = new WeakMap();
  58  |     const listeners = new WeakMap();
  59  |     const count = (field) => {
  60  |       const key = "test:worker-recovery-wire";
  61  |       const totals = JSON.parse(sessionStorage.getItem(key) || "{}");
  62  |       totals[field] = (totals[field] || 0) + 1;
  63  |       sessionStorage.setItem(key, JSON.stringify(totals));
  64  |     };
  65  |     Worker.prototype.addEventListener = function (type, listener, options) {
  66  |       if (type !== "message" || typeof listener !== "function") return addListener.call(this, type, listener, options);
  67  |       let callbacks = listeners.get(this);
  68  |       if (!callbacks) { callbacks = new WeakMap(); listeners.set(this, callbacks); }
  69  |       let wrapped = callbacks.get(listener);
  70  |       if (!wrapped) {
  71  |         wrapped = (event) => {
  72  |           const gate = globalThis.__checkpointGate;
  73  |           const request = requests.get(this)?.get(event.data?.id);
  74  |           if (gate?.active && event.data?.type === "response" && request?.type === "recovery-capture") {
  75  |             // Keep the actual completed worker response. Release delivers it
  76  |             // exactly once to the real page transport, with no fabricated data.
  77  |             gate.held += 1;
  78  |             gate.deliveries.push(() => listener.call(this, event));
  79  |             return;
  80  |           }
  81  |           return listener.call(this, event);
  82  |         };
  83  |         callbacks.set(listener, wrapped);
  84  |       }
  85  |       return addListener.call(this, type, wrapped, options);
  86  |     };
  87  |     Worker.prototype.removeEventListener = function (type, listener, options) {
  88  |       return removeListener.call(this, type, type === "message" ? listeners.get(this)?.get(listener) || listener : listener, options);
  89  |     };
  90  |     Worker.prototype.postMessage = function (message, ...rest) {
  91  |       if (!observed.has(this)) {
  92  |         observed.add(this);
  93  |         requests.set(this, new Map());
  94  |         addListener.call(this, "message", (event) => {
  95  |           const data = event.data;
  96  |           if (!["response", "response-error"].includes(data?.type)) return;
  97  |           requests.get(this).delete(data.id);
  98  |           const snapshot = data.response?.payload?.snapshot || data.response?.snapshot;
  99  |           if (snapshot && typeof snapshot === "object") count("rawSnapshotResponses");
  100 |         });
  101 |       }
  102 |       if (["request", "recovery-capture", "recovery-restore"].includes(message?.type)) requests.get(this).set(message.id, { type: message.type, path: message.path });
  103 |       if (message?.type === "recovery-capture") count("captureRequests");
  104 |       if (message?.type === "recovery-restore") count("restoreRequests");
  105 |       if ((message?.snapshot && typeof message.snapshot === "object") ||
  106 |           (message?.body?.snapshot && typeof message.body.snapshot === "object")) count("rawSnapshotRequests");
  107 |       if (message?.type === "request" && message.path === "/api/snapshot/export") count("snapshotExportRequests");
  108 |       if (message?.type === "request" && message.path === "/api/snapshot/import") count("snapshotImportRequests");
  109 |       if (message?.type === "request" && message.method === "POST") {
  110 |         const key = "test:observed-client-commands";
  111 |         const rows = JSON.parse(sessionStorage.getItem(key) || "[]");
  112 |         // Recovery imports contain a full snapshot. Observability must not
  113 |         // duplicate that payload into the very storage whose quota we test.
  114 |         rows.push({ path: message.path });
  115 |         sessionStorage.setItem(key, JSON.stringify(rows));
  116 |       }
  117 |       return postMessage.call(this, message, ...rest);
  118 |     };
  119 |   }, worker);
  120 | }
  121 | 
  122 | export async function waitSetupReady(page) {
  123 |   // The source HTML says Ready before its module starts; only populated client
  124 |   // diagnostics prove that setup initialization has settled.
  125 |   await expect(page.locator("#setupStatus")).toHaveAttribute("data-diagnostics", /^Ready \| client/, { timeout: 30_000 });
  126 |   await expect(page.locator("#activeLeagueText")).not.toContainText("Checking");
  127 |   await expect(page.locator("#runtimeModeSelect")).toHaveValue("client");
  128 | }
  129 | 
  130 | export async function prepareClientSetup(page, origin, scenario = CLIENT_SCENARIO) {
  131 |   await page.goto(origin);
  132 |   await waitSetupReady(page);
  133 |   const details = page.locator("details:has(#seedInput)");
  134 |   if (await details.getAttribute("open") === null) await details.locator(":scope > summary").click();
  135 |   await page.locator("#seedInput").fill(String(scenario.seed));
  136 |   await page.locator("#startYearInput").fill(String(scenario.year));
  137 |   await page.locator("#teamSelect").selectOption(scenario.team);
  138 |   await page.locator("#modeInput").selectOption(scenario.mode);
  139 |   await expect(page.locator("#seedInput")).toHaveValue(String(scenario.seed));
  140 |   await expect(page.locator("#teamSelect")).toHaveValue(scenario.team);
  141 |   await expect(page.locator("#startYearInput")).toHaveValue(String(scenario.year));
  142 |   await expect(page.locator("#modeInput")).toHaveValue(scenario.mode);
  143 | }
  144 | 
  145 | export async function waitGameReady(page) {
  146 |   await expect(page).toHaveURL(/\/game(?:\?.*)?$/, { timeout: 60_000 });
> 147 |   await expect(page.locator("#statusChip")).toContainText("Ready", { timeout: 60_000 });
      |                                             ^ Error: expect(locator).toContainText(expected) failed
  148 |   await expect(page.locator("#gameBootOverlay")).toHaveCount(0);
  149 | }
  150 | 
  151 | export async function readClient(page, route) {
  152 |   return page.evaluate(async (route) => {
  153 |     const { createApiClient } = await import("./lib/api/createApiClient.js");
  154 |     return createApiClient()(route);
  155 |   }, route);
  156 | }
  157 | 
  158 | export async function readIdentity(page) {
  159 |   return page.evaluate(async () => {
  160 |     const { createApiClient } = await import("./lib/api/createApiClient.js");
  161 |     const api = createApiClient();
  162 |     const dashboard = await api("/api/state");
  163 |     const key = "test:worker-recovery-wire";
  164 |     const totals = JSON.parse(sessionStorage.getItem(key) || "{}");
  165 |     totals.explicitSnapshotReads = (totals.explicitSnapshotReads || 0) + 1;
  166 |     sessionStorage.setItem(key, JSON.stringify(totals));
  167 |     const { snapshot } = await api("/api/snapshot/export");
  168 |     return { franchiseId: dashboard.franchiseId, team: snapshot.controlledTeamId,
  169 |       startYear: snapshot.startYear, year: snapshot.currentYear, week: snapshot.currentWeek,
  170 |       mode: snapshot.mode, rngSeed: snapshot.rngSeed };
  171 |   });
  172 | }
  173 | 
  174 | export async function assertRuntime(page, worker) {
  175 |   expect(await page.evaluate(async () => {
  176 |     const runtime = await import("./lib/api/createApiClient.js");
  177 |     await runtime.warmLocalRuntime();
  178 |     return { mode: runtime.getRuntimeMode(), kind: runtime.getLocalRuntimeKind() };
  179 |   })).toEqual({ mode: "client", kind: worker ? "worker" : "in-page" });
  180 | }
  181 | 
  182 | export async function createClientLeague(page, origin, scenario = CLIENT_SCENARIO) {
  183 |   await prepareClientSetup(page, origin, scenario);
  184 |   await page.locator("#createLeagueBtn").click();
  185 |   await waitGameReady(page);
  186 |   const identity = await readIdentity(page);
  187 |   expect(identity).toMatchObject({ franchiseId: `fa-${scenario.seed}-${scenario.team}`, team: scenario.team, startYear: scenario.year, year: scenario.year, week: 1, mode: scenario.mode });
  188 |   await expect(page.locator("#tutSkipBtn")).toBeVisible();
  189 |   await page.locator("#tutSkipBtn").click();
  190 |   await expect(page.locator(".tutorial-overlay")).toHaveCount(0);
  191 |   return identity;
  192 | }
  193 | 
  194 | export async function advanceClientWeek(page) {
  195 |   const dashboard = await readClient(page, "/api/state");
  196 |   await page.locator("#advanceWeekBtn").click();
  197 |   if (dashboard.gmDecisionQueue.length) {
  198 |     const choice = page.locator("#gmDecisionOptions .gm-decision-option").first();
  199 |     await expect(choice).toBeVisible();
  200 |     await choice.click();
  201 |   }
  202 |   if (!dashboard.controlledOnBye) {
  203 |     await expect(page.locator("#halftimeAdjustModal .tactic-skip-btn")).toBeVisible();
  204 |     await page.locator("#halftimeAdjustModal .tactic-skip-btn").click();
  205 |     await expect(page.locator("#commitArchitectPlanBtn")).toBeVisible();
  206 |     await page.locator("#commitArchitectPlanBtn").click();
  207 |   }
  208 |   await expect.poll(async () => (await readIdentity(page)).week, { timeout: 30_000 }).toBe(dashboard.currentWeek + 1);
  209 |   await expect(page.locator("#statusChip")).toContainText("Ready", { timeout: 30_000 });
  210 |   const decline = page.locator("#firstDebriefDecline");
  211 |   if (await decline.isVisible()) await decline.click();
  212 |   return readIdentity(page);
  213 | }
  214 | 
  215 | export async function saveSlot(page, slot) {
  216 |   await page.locator('[data-testid="tab-settings"]').click();
  217 |   await expect(page.locator("#settingsTab")).not.toHaveAttribute("aria-busy", "true");
  218 |   await expect(page.locator("#saveListText")).toBeVisible();
  219 |   // Settings hydration replaces the default field once; wait for its data
  220 |   // load before choosing the explicit slot the test means to save.
  221 |   await expect(page.locator("#saveSlotInput")).toBeVisible();
  222 |   await page.locator("#saveSlotInput").fill(slot);
  223 |   await expect(page.locator("#saveSlotInput")).toHaveValue(slot);
  224 |   await page.locator("#saveBtn").click();
  225 |   await expect.poll(async () => (await readClient(page, "/api/saves")).slots.some((save) => save.slot === slot)).toBe(true);
  226 |   await expect(page.locator("#statusChip")).toContainText("Ready");
  227 | }
  228 | 
  229 | export async function openSetup(page) {
  230 |   await page.locator("#backSetupBtn").click();
  231 |   await expect(page).toHaveURL(/\/$/);
  232 |   await waitSetupReady(page);
  233 | }
  234 | 
  235 | export async function revealTable(page, table) {
  236 |   const details = page.locator(`details:has(${table})`);
  237 |   if (await details.count() && await details.getAttribute("open") === null) await details.locator(":scope > summary").click();
  238 | }
  239 | 
  240 | export async function installCheckpointFault(page) {
  241 |   await page.evaluate(({ checkpointKey, pendingKey }) => {
  242 |     const setItem = Storage.prototype.setItem;
  243 |     globalThis.__checkpointFault = { reject: false, rejectPending: false, rejected: 0 };
  244 |     Storage.prototype.setItem = function (key, value) {
  245 |       if (this === sessionStorage && ((key === checkpointKey && globalThis.__checkpointFault.reject) ||
  246 |           (key === pendingKey && globalThis.__checkpointFault.rejectPending))) {
  247 |         globalThis.__checkpointFault.rejected += 1;
```