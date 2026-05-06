// WebAppV1 Mission Control · app.js

import { ApiClient, AuthError } from "./lib/api.js";
import { redact } from "./lib/redact.js";
import { mountTabs } from "./lib/tabs.js";
import { renderQuestions } from "./lib/questions.js";
import { confirmDanger } from "./lib/confirm.js";
import { runWithState } from "./lib/buttonState.js";
import {
  TokenStore, ConnState, readTokenFromUrl,
  classifyError, shouldKeepPolling,
} from "./lib/auth-ui.js";
import {
  renderTopbar, renderStatusGrid, renderStatusBranch, renderDoctor, renderPhone,
  showToast, bindToggles, renderIntegrationSettings, mountSettingsNav, openSettingsSection,
} from "./lib/cockpit.js";
import {
  MISSION_MODES, DEFAULT_MODE_ID, findMode,
  renderModeRail, buildMissionState, renderMissionHero, renderMissionProgress,
  renderFullChecklist, renderNextTask, renderTaskBoard,
  renderLogSummary, appendLogLine, clearLogs,
  renderMissionResult, buildDiagnostic,
} from "./lib/mission.js";
import { startAutopilot, stopAutopilot, resumeAutopilot } from "./lib/autopilot.js";

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
let lastSettings = null;
let lastNetwork = null;
let lastV5 = null;
let lastBestTask = null;
let lastBestPrompt = null;
let lastDoctorSummary = null;
let lastReadiness = null;
let activeModeId = (typeof localStorage !== "undefined" && localStorage.getItem("missionMode")) || DEFAULT_MODE_ID;
let logSummary = { last: null, success: null, error: null };

mountTabs();
mountSettingsNav();
bindSettingsForm();
mountModeRail();
mountLogDrawer();

function setConnState(next, errMsg) {
  connState = next;
  renderTopbar({ conn: connStateToString(next), settings: lastSettings });
  const authPanel = document.getElementById("auth-panel");
  authPanel.classList.toggle("hidden", next !== ConnState.AUTH_REQUIRED);
  document.querySelectorAll('button[data-needs="auth"]').forEach((b) => {
    b.disabled = next !== ConnState.CONNECTED;
  });
  if (next === ConnState.AUTH_REQUIRED) {
    document.getElementById("auth-title").textContent = api.token ? "Token invalide" : "Auth requise";
    const errEl = document.getElementById("auth-error");
    if (errMsg) { errEl.textContent = errMsg; errEl.style.display = "block"; }
    else errEl.style.display = "none";
  }
  if (shouldKeepPolling(next)) startPolling(); else stopPolling();
}
function connStateToString(s) {
  if (s === ConnState.CONNECTED) return "connected";
  if (s === ConnState.AUTH_REQUIRED) return "auth-required";
  if (s === ConnState.OFFLINE) return "offline";
  return "unknown";
}
function startPolling() { if (!pollTimer) pollTimer = setInterval(() => { refreshAll().catch(() => {}); }, REFRESH_MS); }
function stopPolling() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }

async function refreshAll() {
  if (!api.token) { setConnState(ConnState.AUTH_REQUIRED); return; }
  try {
    const [dash, questions, settings, network, v5, readiness] = await Promise.all([
      api.get("/api/dashboard").catch(() => null),
      api.get("/api/questions").catch(() => ({ items: [] })),
      api.get("/api/settings"),
      api.get("/api/network").catch(() => null),
      api.get("/api/v5/status").catch(() => null),
      api.get("/api/v5/full-readiness").catch(() => null),
    ]);
    lastSettings = settings;
    lastNetwork = network;
    lastV5 = v5;
    lastReadiness = readiness;
    try {
      const apStatus = await api.get("/api/autopilot/status");
      lastLatestRun = apStatus?.latest ?? null;
      if (apStatus?.autopilot) lastV5 = { ...(lastV5 || {}), autopilot: apStatus.autopilot };
    } catch {}
    setConnState(ConnState.CONNECTED);
    renderStatusGrid({ conn: "connected", settings, v5, network });
    if (dash) renderStatusBranch(dash);
    renderDoctor(lastDoctorSummary);
    renderPhone(network);
    renderQuestions(questions.items || questions || [], { api });
    document.getElementById("questions-empty").style.display = (questions.items ?? questions ?? []).length ? "none" : "block";
    syncSettingsForm(settings);
    renderIntegrationSettings(v5);
    rerenderMission();
    api.get("/api/tasks/best").then((r) => {
      lastBestTask = r;
      renderNextTask(r);
      renderTaskBoard(r);
    }).catch(() => {});
    if (!autopilotEvents && (v5?.autopilot?.status === "running" || v5?.autopilot?.status === "waiting")) subscribeAutopilotEvents();
  } catch (e) {
    setConnState(classifyError(e), redact(String(e?.message || e)));
  }
}

function rerenderMission() {
  const m = findMode(activeModeId);
  const customMax = Number(document.getElementById("mode-custom-value")?.value || 5);
  const state = buildMissionState({
    mode: activeModeId,
    settings: lastSettings,
    v5: lastV5,
    ap: lastV5?.autopilot ?? null,
    fullReadiness: lastReadiness,
    customMax,
  });
  renderMissionHero(state);
  const ap = lastV5?.autopilot ?? lastLatestRun ?? null;
  renderMissionProgress(ap);
  renderMissionResult(ap);
  if (m.full) renderFullChecklist(lastReadiness, openChecklistAction);
  else document.getElementById("full-checklist-card")?.classList.add("hidden");
}

let lastLatestRun = null;

function openChecklistAction(action) {
  if (action === "open-settings-safety") return openSettingsSection("safety");
  if (action === "open-settings-integrations") return openSettingsSection("integrations");
  if (action === "run-doctor") return runDoctor();
  if (action === "install-claude") return showToast("Installe Claude Code CLI puis relance le cockpit.", "info");
  if (action === "open-github-protection") { window.open("https://github.com/Yuume2/WebAppV1/settings/branches", "_blank", "noopener"); return; }
  showToast(`Action: ${action}`, "info");
}

function mountModeRail() {
  renderModeRail(activeModeId, (id) => {
    activeModeId = id;
    try { localStorage.setItem("missionMode", id); } catch {}
    renderModeRail(activeModeId, (next) => mountModeRail()); // re-render selection
    rerenderMission();
  });
  document.getElementById("mode-custom-value")?.addEventListener("input", () => rerenderMission());
}

function bindSettingsForm() {
  const form = document.getElementById("settings-form");
  if (!form) return;
  bindToggles(form);
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const data = new FormData(form);
    const body = {};
    for (const k of ["maxPrsPerRun", "maxMinutes", "maxErrors", "staleDays"]) {
      const v = data.get(k);
      if (v != null && v !== "") body[k] = Number(v);
    }
    const pi = data.get("preferredIssue");
    body.preferredIssue = pi == null || pi === "" ? null : Number(pi);
    for (const k of ["dryRunDefault", "allowExec", "allowLoop", "allowAutoMerge", "lanEnabled"]) {
      body[k] = !!data.get(k);
    }
    for (const k of ["allowedRisk", "allowedAutonomy"]) {
      const v = String(data.get(k) ?? "").trim();
      if (v) body[k] = v.split(",").map((s) => s.trim()).filter(Boolean);
    }
    try {
      await api.put("/api/settings", body);
      showToast("Settings enregistrés", "ok");
      await refreshAll();
    } catch (e) {
      showToast("Erreur : " + redact(String(e?.message || e)), "err");
    }
  });
}

function syncSettingsForm(settings) {
  if (!settings) return;
  const form = document.getElementById("settings-form");
  if (!form) return;
  for (const [k, v] of Object.entries(settings)) {
    const el = form.elements[k];
    if (!el) continue;
    if (el.type === "checkbox") el.checked = !!v;
    else if (Array.isArray(v)) el.value = v.join(", ");
    else el.value = v ?? "";
  }
  bindToggles(form);
}

// Auth
document.getElementById("auth-form")?.addEventListener("submit", (ev) => {
  ev.preventDefault();
  const input = document.getElementById("auth-token-input");
  const t = (input.value || "").trim();
  if (!t) return;
  api.setToken(t);
  input.value = "";
  setConnState(ConnState.UNKNOWN);
  refreshAll();
});
document.getElementById("auth-retry")?.addEventListener("click", () => { setConnState(ConnState.UNKNOWN); refreshAll(); });

// Mission CTA
async function runDoctor() {
  try {
    const r = await api.get("/api/doctor/summary");
    if (r?.ok && r.summary) {
      lastDoctorSummary = r.summary;
      renderDoctor(r.summary);
      logSummary.last = "Doctor finished";
      logSummary.success = r.summary.ok ? "Doctor green" : null;
      logSummary.error = r.summary.failed?.length ? `Doctor failed: ${r.summary.failed.join(", ")}` : null;
      renderLogSummary(logSummary);
      showToast(r.summary.ok ? "Doctor green" : "Doctor warn/red", r.summary.ok ? "ok" : "warn");
    } else {
      showToast(r?.reason ?? "Doctor failed", "err");
    }
  } catch (e) { showToast(redact(String(e?.message || e)), "err"); }
}

document.querySelectorAll('[data-action="doctor-summary"]').forEach((b) => {
  b.addEventListener("click", () => runWithState(b, runDoctor).catch(() => {}));
});

document.getElementById("mission-cta")?.addEventListener("click", async (ev) => {
  const btn = ev.currentTarget;
  await runWithState(btn, async () => {
    const m = findMode(activeModeId);
    const ap = lastV5?.autopilot;
    if (ap?.status === "waiting") {
      const r = await resumeAutopilot(api);
      showToast(r?.ok ? "Autopilot relancé" : (r?.reason ?? "—"), r?.ok ? "ok" : "warn");
      refreshAll().catch(() => {});
      return;
    }
    if (ap?.status === "completed" && ap.lastPR?.url) {
      window.open(ap.lastPR.url, "_blank", "noopener");
      return;
    }
    if (m.full && lastReadiness && !lastReadiness.ready) {
      openSettingsSection("safety");
      showToast("Configure les items requis avant Full autopilot", "warn");
      return;
    }
    if (m.requiresExec && !lastSettings?.allowExec) { openSettingsSection("safety"); showToast("Active allowExec", "warn"); return; }
    if (m.requiresLoop && !lastSettings?.allowLoop) { openSettingsSection("safety"); showToast("Active allowLoop", "warn"); return; }
    const customMax = Number(document.getElementById("mode-custom-value")?.value || 5);
    const targetMax = m.custom ? customMax : m.maxPrs;
    if (lastSettings && lastSettings.maxPrsPerRun !== targetMax) {
      try { await api.put("/api/settings", { maxPrsPerRun: targetMax }); } catch {}
    }
    const apMode = m.mode;
    const r = await startAutopilot(api, { mode: apMode, issue: null });
    if (r?.run && r.prompt) {
      lastBestPrompt = r.prompt;
      navigator.clipboard?.writeText(r.prompt).catch(() => {});
      showToast(`Prompt copié pour #${r.run.issue ?? "?"}`, "ok");
    } else if (r?.ok) {
      showToast(r.launched ? "Mission lancée" : "Mission préparée", "ok");
      subscribeAutopilotEvents();
    } else {
      showToast(r?.reason ?? "Échec", "err");
    }
    refreshAll().catch(() => {});
  }).catch((e) => showToast(redact(String(e?.message || e)), "err"));
});

document.getElementById("autopilot-stop")?.addEventListener("click", async (ev) => {
  await runWithState(ev.currentTarget, async () => {
    const r = await stopAutopilot(api);
    showToast(r?.ok ? "Autopilot stoppé" : (r?.reason ?? "—"), r?.ok ? "ok" : "warn");
    refreshAll().catch(() => {});
  }).catch((e) => showToast(redact(String(e?.message || e)), "err"));
});
document.getElementById("autopilot-resume")?.addEventListener("click", async (ev) => {
  await runWithState(ev.currentTarget, async () => {
    const r = await resumeAutopilot(api);
    showToast(r?.ok ? "Autopilot relancé" : (r?.reason ?? "—"), r?.ok ? "ok" : "warn");
    refreshAll().catch(() => {});
  }).catch((e) => showToast(redact(String(e?.message || e)), "err"));
});

// Mission result actions
document.body.addEventListener("click", async (ev) => {
  const rb = ev.target.closest("[data-result-action]");
  if (rb) {
    ev.preventDefault();
    const ap = lastV5?.autopilot ?? lastLatestRun ?? null;
    const action = rb.dataset.resultAction;
    if (action === "open-pr" && ap?.prUrl) { window.open(ap.prUrl, "_blank", "noopener"); return; }
    if (action === "copy-diagnostic") {
      navigator.clipboard?.writeText(buildDiagnostic(ap)).then(() => showToast("Diagnostic copié", "ok")).catch(() => {});
      return;
    }
    if (action === "open-logs") {
      document.querySelector('[data-tab="workspace"]')?.click();
      return;
    }
    if (action === "reset") {
      await runWithState(rb, async () => {
        const r = await api.post("/api/autopilot/reset", {});
        showToast(r?.ok ? "Run reset" : (r?.reason ?? "—"), r?.ok ? "ok" : "warn");
        await refreshAll();
      }).catch((e) => showToast(redact(String(e?.message || e)), "err"));
      return;
    }
    if (action === "retry") {
      await runWithState(rb, async () => {
        const issue = ap?.issue ?? null;
        await api.post("/api/autopilot/reset", {}).catch(() => {});
        const r = await startAutopilot(api, { mode: "exec", issue });
        showToast(r?.ok ? "Retry lancé" : (r?.reason ?? "—"), r?.ok ? "ok" : "warn");
        await refreshAll();
      }).catch((e) => showToast(redact(String(e?.message || e)), "err"));
      return;
    }
    return;
  }
  // Best task actions
  const btn = ev.target.closest("[data-best-action]");
  if (!btn) return;
  if (!lastBestTask?.best?.number) return;
  const action = btn.dataset.bestAction;
  if (action === "prepare") {
    await runWithState(btn, async () => {
      const r = await api.post("/api/v5/prepare-run", { issue: lastBestTask.best.number, mode: "plan" });
      lastBestPrompt = r?.prompt ?? null;
      const copyBtn = document.querySelector('[data-best-action="copy"]');
      if (copyBtn) copyBtn.disabled = !lastBestPrompt;
      showToast(`Prepared #${lastBestTask.best.number}`, "ok");
    }).catch((e) => showToast(redact(String(e?.message || e)), "err"));
  } else if (action === "copy") {
    if (!lastBestPrompt) return showToast("Prepare d'abord", "warn");
    navigator.clipboard?.writeText(lastBestPrompt).then(() => showToast("Prompt copié", "ok")).catch(() => {});
  } else if (action === "open" && lastBestTask.best.url) {
    window.open(lastBestTask.best.url, "_blank", "noopener");
  }
});

// Log drawer
function mountLogDrawer() {
  const drawer = document.getElementById("log-drawer");
  document.getElementById("log-drawer-toggle")?.addEventListener("click", () => drawer.classList.toggle("open"));
  document.querySelectorAll('[data-action="copy-logs"]').forEach((b) => {
    b.addEventListener("click", () => {
      const text = document.getElementById("log-view")?.textContent ?? "";
      navigator.clipboard?.writeText(text).then(() => showToast("Logs copiés", "ok"));
    });
  });
  document.querySelectorAll('[data-action="clear-logs"]').forEach((b) => {
    b.addEventListener("click", () => { clearLogs(); showToast("Logs vidés"); });
  });
}

// SSE autopilot
let autopilotEvents = null;
function subscribeAutopilotEvents() {
  if (autopilotEvents) { try { autopilotEvents.close(); } catch {} autopilotEvents = null; }
  if (!api.token) return;
  const url = `/api/autopilot/events?token=${encodeURIComponent(api.token)}`;
  try {
    autopilotEvents = new EventSource(url);
    autopilotEvents.addEventListener("state", (e) => {
      try {
        const ap = JSON.parse(e.data);
        lastV5 = { ...(lastV5 || {}), autopilot: ap };
        rerenderMission();
        if (ap?.currentStep) {
          logSummary.last = `Étape: ${ap.currentStep}`;
          renderLogSummary(logSummary);
        }
        if (ap?.lastPR) {
          logSummary.success = `PR #${ap.lastPR.number}`;
          renderLogSummary(logSummary);
        }
      } catch {}
    });
    autopilotEvents.addEventListener("log", (e) => {
      try {
        const log = JSON.parse(e.data);
        appendLogLine(`[${log.stream}] ${log.chunk}`);
      } catch {}
    });
  } catch { /* ignore */ }
}

setConnState(api.token ? ConnState.UNKNOWN : ConnState.AUTH_REQUIRED);
refreshAll();
