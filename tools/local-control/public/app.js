// WebAppV1 Cockpit V5
// Talks to backend at same origin. Backend = tools/local-control/server.mjs.

import { ApiClient, AuthError, NetworkError } from "./lib/api.js";
import { redact } from "./lib/redact.js";
import { mountTabs } from "./lib/tabs.js";
import { renderTasks } from "./lib/tasks.js";
import { mountRunner } from "./lib/runner.js";
import { mountPrompt } from "./lib/prompt.js";
import { mountLogs } from "./lib/logs.js";
import { renderQuestions } from "./lib/questions.js";
import { confirmDanger } from "./lib/confirm.js";
import { runWithState } from "./lib/buttonState.js";
import {
  TokenStore, ConnState, readTokenFromUrl,
  classifyError, badgeLabel, badgeClass, shouldKeepPolling,
} from "./lib/auth-ui.js";
import {
  renderTopbar, renderStatusGrid, renderMetrics, renderAutopilot,
  renderPhone, showToast, bindToggles, renderDoctor, renderSelectedTask,
} from "./lib/cockpit.js";
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

// Tabs + secondary mounts
mountTabs();
mountLogs(api);
mountRunner(api, { confirmDanger });
mountPrompt(api);
bindSettingsForm();

function setConnState(next, errMsg) {
  connState = next;
  renderTopbar({ conn: connStateToString(next), settings: lastSettings, lan: lastNetwork?.lan });
  const authPanel = document.getElementById("auth-panel");
  authPanel.classList.toggle("hidden", next !== ConnState.AUTH_REQUIRED);
  setActionsDisabled(next !== ConnState.CONNECTED);

  if (next === ConnState.AUTH_REQUIRED) {
    const title = document.getElementById("auth-title");
    title.textContent = api.token ? "Token invalide" : "Auth requise";
    const errEl = document.getElementById("auth-error");
    if (errMsg) { errEl.textContent = errMsg; errEl.style.display = "block"; }
    else errEl.style.display = "none";
  }

  if (shouldKeepPolling(next)) startPolling();
  else stopPolling();
}

function connStateToString(s) {
  if (s === ConnState.CONNECTED) return "connected";
  if (s === ConnState.AUTH_REQUIRED) return "auth-required";
  if (s === ConnState.OFFLINE) return "offline";
  return "unknown";
}

function setActionsDisabled(disabled) {
  document.querySelectorAll('button[data-needs="auth"]').forEach((b) => {
    b.disabled = !!disabled;
    if (disabled) b.setAttribute("data-disabled-reason", "Auth requise.");
    else b.removeAttribute("data-disabled-reason");
  });
}

function startPolling() { if (!pollTimer) pollTimer = setInterval(() => { refreshAll().catch(() => {}); }, REFRESH_MS); }
function stopPolling() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }

async function refreshAll() {
  if (!api.token) {
    setConnState(ConnState.AUTH_REQUIRED);
    return;
  }
  try {
    const [dash, tasks, questions, settings, network, v5] = await Promise.all([
      api.get("/api/dashboard"),
      api.get("/api/tasks").catch(() => ({ items: [] })),
      api.get("/api/questions").catch(() => ({ items: [] })),
      api.get("/api/settings"),
      api.get("/api/network").catch(() => null),
      api.get("/api/v5/status").catch(() => null),
    ]);
    lastSettings = settings;
    lastNetwork = network;
    lastV5 = v5;
    setConnState(ConnState.CONNECTED);
    renderStatusGrid({ conn: "connected", settings, v5, network, dashboard: dash });
    renderMetrics(dash);
    renderAutopilot({ ap: v5?.autopilot ?? null, v5, settings });
    applyModeLabel();
    if (!autopilotEvents && (v5?.autopilot?.status === "running" || v5?.autopilot?.status === "waiting")) subscribeAutopilotEvents();
    renderDoctor(lastDoctorSummary);
    renderPhone(network);
    api.get("/api/tasks/best").then((r) => { lastBestTask = r; renderSelectedTask(r); }).catch(() => {});
    renderTasks(tasks.items || tasks || [], { api, confirmDanger, settings, conn: "connected" });
    renderQuestions(questions.items || questions || [], { api });
    syncSettingsForm(settings);
    const empty = document.getElementById("questions-empty");
    if (empty) empty.style.display = (questions.items ?? questions ?? []).length ? "none" : "block";
  } catch (e) {
    const next = classifyError(e);
    setConnState(next, redact(String(e?.message || e)));
  }
}

// Settings form binding
function bindSettingsForm() {
  const form = document.getElementById("settings-form");
  if (!form) return;
  bindToggles(form);
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const data = new FormData(form);
    const body = {};
    for (const k of ["maxPrsPerRun", "maxMinutes", "staleDays"]) {
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

// Auth form
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
document.getElementById("auth-retry")?.addEventListener("click", () => {
  setConnState(ConnState.UNKNOWN);
  refreshAll();
});

// Workflow step buttons → existing endpoints
async function callStep(action, payload = {}) {
  const map = {
    "doctor": () => api.post("/api/doctor/run", {}),
    "score": () => api.post("/api/tasks/score", {}).catch(() => api.get("/api/tasks")),
    "queue": () => refreshAll(),
    "plan-next": () => api.post("/api/runner/start", { mode: "plan", dryRun: true }),
    "reload-tasks": () => refreshAll(),
  };
  const fn = map[action];
  if (!fn) return;
  return fn();
}

document.querySelectorAll('[data-action="doctor"]').forEach((b) => {
  b.addEventListener("click", () => runWithState(b, async () => {
    const r = await callStep("doctor");
    if (r?.runId) document.getElementById("log-run-select")?.dispatchEvent(new CustomEvent("subscribe", { detail: r.runId }));
    showToast("Doctor lancé", "ok");
  }).catch((e) => showToast(redact(String(e?.message || e)), "err")));
});

document.querySelectorAll('[data-action="score"]').forEach((b) => {
  b.addEventListener("click", () => runWithState(b, async () => { await callStep("score"); showToast("Tâches rechargées", "ok"); }).catch(() => {}));
});
document.querySelectorAll('[data-action="queue"]').forEach((b) => {
  b.addEventListener("click", () => runWithState(b, refreshAll).catch(() => {}));
});
document.querySelectorAll('[data-action="reload-tasks"]').forEach((b) => {
  b.addEventListener("click", () => runWithState(b, refreshAll).catch(() => {}));
});
document.querySelectorAll('[data-action="plan-next"]').forEach((b) => {
  b.addEventListener("click", () => runWithState(b, async () => {
    const r = await callStep("plan-next");
    if (r?.runId) document.getElementById("log-run-select")?.dispatchEvent(new CustomEvent("subscribe", { detail: r.runId }));
    showToast("Plan next lancé", "ok");
  }).catch((e) => showToast(redact(String(e?.message || e)), "err")));
});

document.querySelectorAll('[data-action="doctor-summary"]').forEach((b) => {
  b.addEventListener("click", () => runWithState(b, async () => {
    const r = await api.get("/api/doctor/summary");
    if (r?.ok && r.summary) {
      lastDoctorSummary = r.summary;
      renderDoctor(r.summary);
      showToast(r.summary.ok ? "Doctor green" : `Doctor ${r.summary.failed?.length ? "red" : "warn"}`, r.summary.ok ? "ok" : "warn");
    } else {
      showToast(r?.reason ?? "Doctor failed", "err");
    }
  }).catch((e) => showToast(redact(String(e?.message || e)), "err")));
});

document.querySelectorAll('[data-action="refresh-task"]').forEach((b) => {
  b.addEventListener("click", () => runWithState(b, async () => {
    const r = await api.get("/api/tasks/best");
    lastBestTask = r;
    renderSelectedTask(r);
    showToast(r?.ok ? `#${r.best?.number} sélectionnée` : (r?.reason ?? "aucune task"), r?.ok ? "ok" : "warn");
  }).catch((e) => showToast(redact(String(e?.message || e)), "err")));
});

document.querySelectorAll('[data-action="prepare-best"]').forEach((b) => {
  b.addEventListener("click", () => runWithState(b, async () => {
    if (!lastBestTask?.best?.number) { showToast("Aucune task sélectionnée", "warn"); return; }
    const r = await api.post("/api/v5/prepare-run", { issue: lastBestTask.best.number, mode: "plan" });
    lastBestPrompt = r?.prompt ?? null;
    const promptEl = document.getElementById("selected-task-prompt");
    if (promptEl) {
      promptEl.textContent = lastBestPrompt ?? "";
      promptEl.classList.toggle("hidden", !lastBestPrompt);
    }
    const copyBtn = document.querySelector('[data-action="copy-best-prompt"]');
    if (copyBtn) copyBtn.disabled = !lastBestPrompt;
    showToast(`Prepared #${lastBestTask.best.number}`, "ok");
  }).catch((e) => showToast(redact(String(e?.message || e)), "err")));
});

document.querySelectorAll('[data-action="copy-best-prompt"]').forEach((b) => {
  b.addEventListener("click", () => {
    if (!lastBestPrompt) return showToast("Prepare d'abord", "warn");
    navigator.clipboard?.writeText(lastBestPrompt).then(() => showToast("Prompt copié — colle dans yu", "ok")).catch(() => {});
  });
});

document.querySelectorAll('[data-action="scroll-logs"]').forEach((b) => {
  b.addEventListener("click", () => {
    document.querySelector('[data-tab="workspace"]')?.click();
    document.getElementById("logs-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
});

// V5 prompt block
let lastV5Prompt = null;
document.querySelector('[data-action="v5-prepare"]')?.addEventListener("click", async (ev) => {
  const btn = ev.currentTarget;
  await runWithState(btn, async () => {
    const issue = Number(document.getElementById("v5-issue-prepare")?.value);
    if (!Number.isInteger(issue) || issue <= 0) { showToast("Numéro d'issue invalide", "warn"); return; }
    const r = await api.post("/api/v5/prepare-run", { issue, mode: "plan" });
    lastV5Prompt = r?.prompt ?? null;
    const view = document.getElementById("v5-prompt-view");
    if (view) {
      view.textContent = lastV5Prompt ?? "";
      view.classList.toggle("hidden", !lastV5Prompt);
    }
    showToast(`Prepared #${issue}`, "ok");
  }).catch((e) => showToast(redact(String(e?.message || e)), "err"));
});
document.querySelector('[data-action="v5-copy-prompt"]')?.addEventListener("click", () => {
  if (!lastV5Prompt) return showToast("Prepare d'abord", "warn");
  navigator.clipboard?.writeText(lastV5Prompt).then(() => showToast("Prompt copié", "ok")).catch(() => {});
});
document.querySelector('[data-action="v5-resume"]')?.addEventListener("click", async (ev) => {
  await runWithState(ev.currentTarget, async () => {
    const r = await api.post("/api/resume", {});
    showToast(r?.canResume ? `Resume OK pour #${r.issue}` : `Bloqué : ${r?.reason ?? "?"}`, r?.canResume ? "ok" : "warn");
  }).catch((e) => showToast(redact(String(e?.message || e)), "err"));
});

// Autopilot CTAs
function autopilotModeLabel(s) {
  if (!s?.allowExec) return { label: "prompt-only", detail: "— flippe allowExec dans Settings pour exec réel." };
  if (!s?.allowLoop) return { label: "run-one", detail: "— une PR puis stop." };
  return { label: `loop max ${s.maxPrsPerRun ?? 2}`, detail: "— enchaîne jusqu'au budget PR/erreurs/temps." };
}

function applyModeLabel() {
  const m = autopilotModeLabel(lastSettings);
  const lbl = document.getElementById("autopilot-mode-label");
  const det = document.getElementById("autopilot-mode-detail");
  if (lbl) lbl.textContent = m.label;
  if (det) det.textContent = m.detail;
}

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
        renderAutopilot({ ap, v5: lastV5, settings: lastSettings });
      } catch {}
    });
    autopilotEvents.addEventListener("log", (e) => {
      try {
        const log = JSON.parse(e.data);
        const view = document.getElementById("log-view");
        if (view) { view.textContent += `[${log.stream}] ${log.chunk}`; if (document.getElementById("log-autoscroll")?.checked) view.scrollTop = view.scrollHeight; }
      } catch {}
    });
  } catch { /* ignore */ }
}

document.getElementById("autopilot-start")?.addEventListener("click", async (ev) => {
  await runWithState(ev.currentTarget, async () => {
    const issueRaw = document.getElementById("v5-issue")?.value;
    const issue = issueRaw ? Number(issueRaw) : null;
    const mode = !lastSettings?.allowExec ? "plan" : (lastSettings?.allowLoop ? "loop" : "exec");
    const r = await startAutopilot(api, { mode, issue: Number.isInteger(issue) && issue > 0 ? issue : null });
    if (r?.ok && r.launched) subscribeAutopilotEvents();
    if (r?.run) {
      const promptEl = document.getElementById("autopilot-prompt");
      if (r.prompt && promptEl) { promptEl.textContent = r.prompt; promptEl.classList.remove("hidden"); }
      showToast(r.ok ? `Autopilot · #${r.run.issue ?? "?"}` : `${r.reason}`, r.ok ? "ok" : "warn");
    } else {
      showToast(r?.reason ?? "Échec", "err");
    }
    refreshAll().catch(() => {});
  }).catch((e) => showToast(redact(String(e?.message || e)), "err"));
});

document.getElementById("autopilot-stop")?.addEventListener("click", async (ev) => {
  await runWithState(ev.currentTarget, async () => {
    const r = await stopAutopilot(api);
    showToast(r?.ok ? "Autopilot arrêté" : (r?.reason ?? "—"), r?.ok ? "ok" : "warn");
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

setConnState(api.token ? ConnState.UNKNOWN : ConnState.AUTH_REQUIRED);
refreshAll();
