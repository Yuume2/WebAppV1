// WebAppV1 Local Control — UI app
// Talks to backend at same origin. Backend = tools/local-control/server.mjs (Claude A).
// All long-running ops return a runId; UI subscribes via SSE.

import { ApiClient } from "./lib/api.js";
import { redact } from "./lib/redact.js";
import { state, setMode, setLan, setAutoMerge } from "./lib/state.js";
import { mountTabs } from "./lib/tabs.js";
import { renderDashboard } from "./lib/dashboard.js";
import { renderTasks } from "./lib/tasks.js";
import { mountRunner } from "./lib/runner.js";
import { mountPrompt } from "./lib/prompt.js";
import { mountLogs } from "./lib/logs.js";
import { renderQuestions } from "./lib/questions.js";
import { mountSettings } from "./lib/settings.js";
import { confirmDanger } from "./lib/confirm.js";

const TOKEN_KEY = "localControlToken";
function bootstrapToken() {
  const url = new URL(location.href);
  const fromUrl = url.searchParams.get("token");
  if (fromUrl) {
    try { localStorage.setItem(TOKEN_KEY, fromUrl); } catch {}
    url.searchParams.delete("token");
    history.replaceState(null, "", url.toString());
    return fromUrl;
  }
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

const api = new ApiClient({ baseUrl: "", token: bootstrapToken() });
window.__api = api;

mountTabs();
mountLogs(api);
mountRunner(api, { confirmDanger });
mountPrompt(api);
mountSettings(api, { onChange: applySettingsToBadges });

async function refreshAll() {
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
    setConn(true);
  } catch (e) {
    setConn(false);
    log("⚠ refresh failed: " + redact(String(e.message || e)));
  }
}

function setConn(ok) {
  document.getElementById("conn-dot").classList.toggle("ok", !!ok);
  document.getElementById("conn-dot").classList.toggle("err", !ok);
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

document.querySelector('[data-action="refresh"]').addEventListener("click", refreshAll);
document.querySelector('[data-action="doctor"]').addEventListener("click", async () => {
  const r = await api.post("/api/doctor/run", {});
  if (r?.runId) document.getElementById("log-run-select").dispatchEvent(new CustomEvent("subscribe", { detail: r.runId }));
});
document.querySelector('[data-action="score"]').addEventListener("click", () => api.post("/api/tasks/score", {}).catch(() => {}));
document.querySelector('[data-action="queue"]').addEventListener("click", () => refreshAll());
document.querySelector('[data-action="plan-next"]').addEventListener("click", async () => {
  const r = await api.post("/api/runner/start", { mode: "plan", dryRun: true });
  if (r?.runId) document.getElementById("log-run-select").dispatchEvent(new CustomEvent("subscribe", { detail: r.runId }));
});
document.querySelector('[data-action="reload-tasks"]').addEventListener("click", refreshAll);

refreshAll();
setInterval(refreshAll, 15000);
