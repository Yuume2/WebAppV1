import { redact } from "./redact.js";

export function renderTasks(items, { api, confirmDanger }) {
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
      .forEach((t) => tbody.appendChild(row(t, { api, confirmDanger })));
  };
  draw();
  filter?.addEventListener("input", draw);
  classSel?.addEventListener("change", draw);
}

function row(t, { api, confirmDanger }) {
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td>#${t.issue}</td>
    <td>${escapeHtml(t.title || "")}</td>
    <td>${t.score ?? ""}</td>
    <td>${escapeHtml(t.classification || "")}</td>
    <td>${(t.labels || []).map(escapeHtml).join(", ")}</td>
    <td>${escapeHtml(t.risk || "")}</td>
    <td>${escapeHtml(t.autonomy || "")}</td>
    <td>${escapeHtml(redact(t.reason || ""))}</td>
  `;
  const td = document.createElement("td");
  const planBtn = document.createElement("button");
  planBtn.textContent = "Plan";
  planBtn.addEventListener("click", async () => {
    const r = await api.post(`/api/tasks/${t.issue}/plan`, {});
    if (r?.runId) document.getElementById("log-run-select").dispatchEvent(new CustomEvent("subscribe", { detail: r.runId }));
  });
  const runBtn = document.createElement("button");
  runBtn.textContent = "Run";
  runBtn.classList.add("primary");
  runBtn.disabled = !t.executable;
  if (t.executable) {
    runBtn.addEventListener("click", async () => {
      const ok = await confirmDanger({ title: `Exécuter #${t.issue} ?`, body: `Mode exec sur "${t.title}". Tape EXEC pour confirmer.`, magicWord: "EXEC" });
      if (!ok) return;
      const r = await api.post("/api/runner/start", { mode: "exec", issue: t.issue, allowExec: true, dryRun: false });
      if (r?.runId) document.getElementById("log-run-select").dispatchEvent(new CustomEvent("subscribe", { detail: r.runId }));
    });
  }
  td.append(planBtn, " ", runBtn);
  tr.appendChild(td);
  return tr;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
