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
import {
  TokenStore, ConnState, readTokenFromUrl,
  classifyError, badgeLabel, badgeClass, shouldKeepPolling,
} from "./lib/auth-ui.js";

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
  document.querySelectorAll('main button[data-action], main button[type="submit"], main button[data-preset]')
    .forEach((b) => { b.disabled = !!disabled; });
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
    return;
  }
  try {
    const [dash, tasks, questions, settings] = await Promise.all([
      api.get("/api/dashboard"),
      api.get("/api/tasks?limit=50"),
      api.get("/api/questions"),
      api.get("/api/settings"),
    ]);
    renderDashboard(dash);
    renderTasks(tasks.items || [], { api, confirmDanger });
    renderQuestions(questions.items || [], { api });
    applySettingsToBadges(settings);
    setConnState(ConnState.CONNECTED);
  } catch (e) {
    const next = classifyError(e);
    if (next === ConnState.AUTH_REQUIRED && lastLoggedState !== ConnState.AUTH_REQUIRED) {
      // log only on transition
    }
    setConnState(next, redact(String(e?.message || e)));
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

document.querySelector('[data-action="refresh"]').addEventListener("click", () => refreshAll());
document.querySelector('[data-action="doctor"]').addEventListener("click", async () => {
  try {
    const r = await api.post("/api/doctor/run", {});
    if (r?.runId) document.getElementById("log-run-select").dispatchEvent(new CustomEvent("subscribe", { detail: r.runId }));
  } catch (e) { setConnState(classifyError(e), redact(String(e?.message || e))); }
});
document.querySelector('[data-action="score"]').addEventListener("click", () => api.post("/api/tasks/score", {}).catch(() => {}));
document.querySelector('[data-action="queue"]').addEventListener("click", () => refreshAll());
document.querySelector('[data-action="plan-next"]').addEventListener("click", async () => {
  try {
    const r = await api.post("/api/runner/start", { mode: "plan", dryRun: true });
    if (r?.runId) document.getElementById("log-run-select").dispatchEvent(new CustomEvent("subscribe", { detail: r.runId }));
  } catch (e) { setConnState(classifyError(e), redact(String(e?.message || e))); }
});
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

setConnState(api.token ? ConnState.UNKNOWN : ConnState.AUTH_REQUIRED);
refreshAll();
