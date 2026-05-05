// WebAppV1 Local Control — UI app
// Talks to backend at same origin. Backend = tools/local-control/server.mjs.

import { ApiClient, AuthError, NetworkError } from "./lib/api.js";
import { redact } from "./lib/redact.js";
import { setMode, setLan, setAutoMerge } from "./lib/state.js";
import { mountTabs } from "./lib/tabs.js";
import { renderDashboard } from "./lib/dashboard.js";
import { renderTasks } from "./lib/tasks.js";
import { mountRunner } from "./lib/runner.js";
import { mountPrompt } from "./lib/prompt.js";
import { mountLogs } from "./lib/logs.js";
import { renderQuestions } from "./lib/questions.js";
import { mountSettings } from "./lib/settings.js";
import { confirmDanger } from "./lib/confirm.js";
import { renderOnboarding } from "./lib/onboarding.js";
import { runWithState } from "./lib/buttonState.js";
import { renderV5Card } from "./lib/v5.js";
import { renderAutopilotState, startAutopilot, stopAutopilot, resumeAutopilot, fetchAutopilotStatus } from "./lib/autopilot.js";
import {
  TokenStore, ConnState, readTokenFromUrl,
  classifyError, badgeLabel, badgeClass, shouldKeepPolling,
} from "./lib/auth-ui.js";

let lastSettings = null;
let lastNetwork = null;

const REFRESH_MS = 15000;
const tokenStore = new TokenStore(typeof localStorage !== "undefined" ? localStorage : null);

function bootstrapToken() {
  const { token, cleanedHref } = readTokenFromUrl(location.href);
  if (token) {
    tokenStore.set(token);
    history.replaceState(null, "", cleanedHref);
    return token;
  }
  return tokenStore.get();
}

const api = new ApiClient({ baseUrl: "", token: bootstrapToken() });
window.__api = api;

let connState = ConnState.UNKNOWN;
let pollTimer = null;
let lastLoggedState = null;

mountTabs();
mountLogs(api);
mountRunner(api, { confirmDanger });
mountPrompt(api);
mountSettings(api, { onChange: applySettingsToBadges });

function setConnState(next, errMsg) {
  connState = next;
  const dot = document.getElementById("conn-dot");
  dot.classList.toggle("ok", next === ConnState.CONNECTED);
  dot.classList.toggle("err", next === ConnState.OFFLINE || next === ConnState.AUTH_REQUIRED);
  const badge = document.getElementById("conn-badge");
  badge.textContent = badgeLabel(next);
  badge.classList.remove("ok", "err", "warn");
  const cls = badgeClass(next);
  if (cls) badge.classList.add(cls);

  const authPanel = document.getElementById("auth-panel");
  authPanel.classList.toggle("hidden", next !== ConnState.AUTH_REQUIRED);
  setActionsDisabled(next !== ConnState.CONNECTED);

  if (next === ConnState.AUTH_REQUIRED) {
    const title = document.getElementById("auth-title");
    title.textContent = api.token ? "Auth token invalide" : "Auth token required";
    const errEl = document.getElementById("auth-error");
    if (errMsg) { errEl.textContent = errMsg; errEl.classList.remove("hidden"); }
    else errEl.classList.add("hidden");
  }

  if (lastLoggedState !== next) {
    lastLoggedState = next;
    if (next === ConnState.AUTH_REQUIRED) log("⚠ auth required — paste your token");
    else if (next === ConnState.OFFLINE) log("⚠ backend offline — relancer `pnpm local:control`");
    else if (next === ConnState.CONNECTED) log("✓ connected");
  }

  if (shouldKeepPolling(next)) startPolling();
  else stopPolling();
}

function setActionsDisabled(disabled) {
  document.querySelectorAll('main button[data-needs="auth"], main button[type="submit"], main button[data-preset]')
    .forEach((b) => {
      b.disabled = !!disabled;
      if (disabled) b.setAttribute("data-disabled-reason", "Auth requise — colle ton token.");
      else b.removeAttribute("data-disabled-reason");
    });
}

function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(() => { refreshAll().catch(() => {}); }, REFRESH_MS);
}
function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

async function refreshAll() {
  if (!api.token) {
    setConnState(ConnState.AUTH_REQUIRED);
    renderOnboarding({ conn: "auth-required", settings: lastSettings, network: lastNetwork });
    return;
  }
  try {
    const [dash, tasks, questions, settings, network, v5] = await Promise.all([
      api.get("/api/dashboard"),
      api.get("/api/tasks?limit=50"),
      api.get("/api/questions"),
      api.get("/api/settings"),
      api.get("/api/network").catch(() => null),
      api.get("/api/v5/status").catch(() => null),
    ]);
    lastSettings = settings;
    lastNetwork = network;
    renderDashboard(dash);
    renderTasks(tasks.items || [], { api, confirmDanger, settings, conn: "connected" });
    renderQuestions(questions.items || [], { api });
    applySettingsToBadges(settings);
    renderOnboarding({ conn: "connected", settings, network });
    if (v5) renderV5Card(document.getElementById("v5-card"), v5);
    renderAutopilotState(document.getElementById("autopilot-card"), v5?.autopilot ?? null, v5);
    setConnState(ConnState.CONNECTED);
  } catch (e) {
    const next = classifyError(e);
    setConnState(next, redact(String(e?.message || e)));
    const simple = next === ConnState.AUTH_REQUIRED ? "auth-required" : next === ConnState.OFFLINE ? "offline" : "connected";
    renderOnboarding({ conn: simple, settings: lastSettings, network: lastNetwork });
  }
}

function applySettingsToBadges(s) {
  if (!s) return;
  setMode(s.dryRunDefault ? "dry" : "live");
  setLan(!!s.lanEnabled);
  setAutoMerge(!!s.allowAutoMerge);
  const modeBadge = document.getElementById("mode-badge");
  modeBadge.textContent = s.dryRunDefault ? "DRY-RUN" : "LIVE";
  modeBadge.classList.toggle("dry", s.dryRunDefault);
  modeBadge.classList.toggle("live", !s.dryRunDefault);
  document.getElementById("lan-badge").classList.toggle("hidden", !s.lanEnabled);
  document.getElementById("automerge-badge").classList.toggle("hidden", !s.allowAutoMerge);
}

function log(line) {
  const view = document.getElementById("log-view");
  if (!view) return;
  view.textContent += line + "\n";
  if (document.getElementById("log-autoscroll")?.checked) view.scrollTop = view.scrollHeight;
}

const refreshBtn = document.querySelector('[data-action="refresh"]');
refreshBtn.addEventListener("click", () => runWithState(refreshBtn, refreshAll).catch(() => {}));

const doctorBtn = document.querySelector('[data-action="doctor"]');
doctorBtn.addEventListener("click", () => runWithState(doctorBtn, async () => {
  const r = await api.post("/api/doctor/run", {});
  if (r?.runId) document.getElementById("log-run-select").dispatchEvent(new CustomEvent("subscribe", { detail: r.runId }));
}).catch((e) => setConnState(classifyError(e), redact(String(e?.message || e)))));

const scoreBtn = document.querySelector('[data-action="score"]');
scoreBtn.addEventListener("click", () => runWithState(scoreBtn, () => api.post("/api/tasks/score", {})).catch(() => {}));

const queueBtn = document.querySelector('[data-action="queue"]');
queueBtn.addEventListener("click", () => runWithState(queueBtn, refreshAll).catch(() => {}));

const planNextBtn = document.querySelector('[data-action="plan-next"]');
planNextBtn.addEventListener("click", () => runWithState(planNextBtn, async () => {
  const r = await api.post("/api/runner/start", { mode: "plan", dryRun: true });
  if (r?.runId) document.getElementById("log-run-select").dispatchEvent(new CustomEvent("subscribe", { detail: r.runId }));
}).catch((e) => setConnState(classifyError(e), redact(String(e?.message || e)))));
document.querySelector('[data-action="reload-tasks"]').addEventListener("click", () => refreshAll());

document.getElementById("auth-form").addEventListener("submit", (ev) => {
  ev.preventDefault();
  const input = document.getElementById("auth-token-input");
  const t = (input.value || "").trim();
  if (!t) return;
  api.setToken(t);
  input.value = "";
  setConnState(ConnState.UNKNOWN);
  refreshAll();
});
document.getElementById("auth-retry").addEventListener("click", () => {
  setConnState(ConnState.UNKNOWN);
  refreshAll();
});

let lastV5Prompt = null;

document.querySelector('[data-action="v5-prepare"]')?.addEventListener("click", async () => {
  const issue = Number(document.getElementById("v5-issue").value);
  if (!Number.isInteger(issue) || issue <= 0) { log("⚠ v5: enter an issue number first"); return; }
  try {
    const r = await api.post("/api/v5/prepare-run", { issue, mode: "plan" });
    lastV5Prompt = r?.prompt ?? null;
    const view = document.getElementById("v5-prompt-view");
    view.textContent = lastV5Prompt ?? "";
    view.classList.toggle("hidden", !lastV5Prompt);
    log(`✓ v5: prepared run ${r?.runId ?? "?"} for issue #${issue} (ready=${r?.ready})`);
  } catch (e) { log(`⚠ v5 prepare failed: ${redact(String(e?.message || e))}`); }
});

document.querySelector('[data-action="v5-copy-prompt"]')?.addEventListener("click", () => {
  if (!lastV5Prompt) { log("⚠ v5: prepare a run first"); return; }
  navigator.clipboard?.writeText(lastV5Prompt).then(() => log("✓ v5 prompt copied")).catch(() => {});
});

document.querySelector('[data-action="v5-resume"]')?.addEventListener("click", async () => {
  try {
    const r = await api.post("/api/resume", {});
    if (r?.canResume) log(`✓ v5: can resume run ${r.runId} for issue #${r.issue}`);
    else log(`⚠ v5: resume blocked — ${r?.reason ?? "unknown"}`);
  } catch (e) { log(`⚠ v5 resume failed: ${redact(String(e?.message || e))}`); }
});

document.getElementById("autopilot-start")?.addEventListener("click", async (ev) => {
  const btn = ev.currentTarget;
  await runWithState(btn, async () => {
    const issueRaw = document.getElementById("v5-issue")?.value;
    const issue = issueRaw ? Number(issueRaw) : null;
    const mode = (lastSettings?.allowExec) ? "exec" : "plan";
    const r = await startAutopilot(api, { mode, issue: Number.isInteger(issue) && issue > 0 ? issue : null });
    if (r?.run) {
      const card = document.getElementById("autopilot-card");
      const promptEl = card.querySelector("#autopilot-prompt");
      if (r.prompt && promptEl) { promptEl.textContent = r.prompt; promptEl.classList.remove("hidden"); }
      log(`✓ autopilot started — issue=${r.run.issue ?? "?"} mode=${r.run.mode}`);
    } else {
      log(`⚠ autopilot: ${r?.reason ?? "failed to start"}`);
    }
    refreshAll().catch(() => {});
  }).catch((e) => log(`⚠ autopilot start failed: ${redact(String(e?.message || e))}`));
});

document.getElementById("autopilot-stop")?.addEventListener("click", async (ev) => {
  const btn = ev.currentTarget;
  await runWithState(btn, async () => {
    const r = await stopAutopilot(api);
    log(r?.ok ? "✓ autopilot stopped" : `⚠ autopilot: ${r?.reason ?? "stop failed"}`);
    refreshAll().catch(() => {});
  }).catch((e) => log(`⚠ autopilot stop failed: ${redact(String(e?.message || e))}`));
});

document.getElementById("autopilot-resume")?.addEventListener("click", async (ev) => {
  const btn = ev.currentTarget;
  await runWithState(btn, async () => {
    const r = await resumeAutopilot(api);
    log(r?.ok ? "✓ autopilot resumed" : `⚠ autopilot: ${r?.reason ?? "resume failed"}`);
    refreshAll().catch(() => {});
  }).catch((e) => log(`⚠ autopilot resume failed: ${redact(String(e?.message || e))}`));
});

setConnState(api.token ? ConnState.UNKNOWN : ConnState.AUTH_REQUIRED);
refreshAll();
