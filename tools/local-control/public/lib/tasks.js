import { redact } from "./redact.js";
import { applyDisabled, runWithState, REASONS } from "./buttonState.js";

export function classifyTaskReason(t) {
  if (!t) return { safe: false, label: "—", cls: "" };
  const cls = t.classification || "";
  if (cls === "blocked") return { safe: false, label: t.reason || "bloquée", cls: "task-reason-blocked" };
  if (cls === "trivial" || cls === "safe") {
    return { safe: true, label: t.reason || `safe : classification=${cls}`, cls: "task-reason-safe" };
  }
  return { safe: false, label: t.reason || `non auto-exécutable (classification=${cls || "?"})`, cls: "" };
}

export function computeRunDisabledReason({ task, settings, conn }) {
  if (conn === "auth-required") return REASONS.AUTH;
  if (conn === "offline") return REASONS.OFFLINE;
  if (!settings?.allowExec) return REASONS.EXEC;
  if (!task?.executable) return REASONS.TASK_NOT_EXECUTABLE;
  return null;
}

export function renderTasks(items, { api, confirmDanger, settings = null, conn = "connected" } = {}) {
  const tbody = document.querySelector("#tasks-table tbody");
  const filter = document.getElementById("task-filter");
  const classSel = document.getElementById("task-class");
  if (!tbody) return;

  const draw = () => {
    const f = (filter?.value || "").toLowerCase();
    const c = classSel?.value || "";
    tbody.innerHTML = "";
    items
      .filter((t) => !c || t.classification === c)
      .filter((t) => !f || (t.title || "").toLowerCase().includes(f) || (t.labels || []).join(",").toLowerCase().includes(f))
      .forEach((t) => tbody.appendChild(row(t, { api, confirmDanger, settings, conn })));
  };
  draw();
  filter?.addEventListener("input", draw);
  classSel?.addEventListener("change", draw);
}

function row(t, { api, confirmDanger, settings, conn }) {
  const tr = document.createElement("tr");
  const reason = classifyTaskReason(t);
  if (reason.cls === "task-reason-blocked") tr.classList.add("task-blocked");

  tr.innerHTML = `
    <td>#${t.issue}</td>
    <td>${escapeHtml(t.title || "")}</td>
    <td>${t.score ?? ""}</td>
    <td>${escapeHtml(t.classification || "")}</td>
    <td>${(t.labels || []).map(escapeHtml).join(", ")}</td>
    <td>${escapeHtml(t.risk || "")}</td>
    <td>${escapeHtml(t.autonomy || "")}</td>
    <td class="${reason.cls}">${escapeHtml(redact(reason.label))}</td>
  `;
  const td = document.createElement("td");
  const planBtn = document.createElement("button");
  planBtn.textContent = "Plan";
  applyDisabled(planBtn, conn === "auth-required" ? REASONS.AUTH : (conn === "offline" ? REASONS.OFFLINE : null));
  planBtn.addEventListener("click", () => runWithState(planBtn, async () => {
    const r = await api.post(`/api/tasks/${t.issue}/plan`, {});
    if (r?.runId) document.getElementById("log-run-select").dispatchEvent(new CustomEvent("subscribe", { detail: r.runId }));
  }).catch(() => {}));

  const runBtn = document.createElement("button");
  runBtn.textContent = "Run";
  runBtn.classList.add("primary");
  const runDisabledReason = computeRunDisabledReason({ task: t, settings, conn });
  applyDisabled(runBtn, runDisabledReason);
  if (!runDisabledReason) {
    runBtn.addEventListener("click", () => runWithState(runBtn, async () => {
      const ok = await confirmDanger({ title: `Exécuter #${t.issue} ?`, body: `Mode exec sur "${t.title}". Tape EXEC pour confirmer.`, magicWord: "EXEC" });
      if (!ok) throw new Error("annulé");
      const r = await api.post("/api/runner/start", { mode: "exec", issue: t.issue, allowExec: true, dryRun: false });
      if (r?.runId) document.getElementById("log-run-select").dispatchEvent(new CustomEvent("subscribe", { detail: r.runId }));
    }).catch(() => {}));
  }
  td.append(planBtn, " ", runBtn);
  tr.appendChild(td);
  return tr;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
