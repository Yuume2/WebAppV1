import { redact } from "./redact.js";

export function mountLogs(api) {
  const view = document.getElementById("log-view");
  const select = document.getElementById("log-run-select");
  let currentEs = null;
  let currentRunId = null;

  async function refreshRuns() {
    try {
      const r = await api.get("/api/runs");
      const items = r.items || [];
      const keep = select.value;
      select.innerHTML = '<option value="">Run en direct</option>';
      items.slice(0, 30).forEach((run) => {
        const o = document.createElement("option");
        o.value = run.id;
        o.textContent = `${run.id.slice(0, 8)} — ${run.mode} — ${run.status}`;
        select.appendChild(o);
      });
      if (keep) select.value = keep;
    } catch {}
  }

  function subscribe(runId) {
    if (!runId) return;
    if (currentEs) { currentEs.close(); currentEs = null; }
    currentRunId = runId;
    appendLine(`— Subscribed to run ${runId} —`);
    currentEs = api.subscribe(runId, {
      onLog: (data) => appendLine(redact(data?.line ?? data)),
      onStatus: (data) => appendLine(`[status] ${redact(JSON.stringify(data))}`),
      onDone: (data) => appendLine(`[done] ${redact(JSON.stringify(data))}`),
      onError: () => appendLine("[error] connexion SSE perdue"),
    });
  }

  function appendLine(line) {
    if (line == null) return;
    view.textContent += String(line) + "\n";
    if (document.getElementById("log-autoscroll")?.checked) view.scrollTop = view.scrollHeight;
  }

  select.addEventListener("change", () => subscribe(select.value));
  select.addEventListener("subscribe", (e) => { refreshRuns(); subscribe(e.detail); });

  document.querySelector('[data-action="copy-logs"]').addEventListener("click", () => {
    navigator.clipboard?.writeText(view.textContent || "").catch(() => {});
  });
  document.querySelector('[data-action="clear-logs"]').addEventListener("click", () => { view.textContent = ""; });

  refreshRuns();
  setInterval(refreshRuns, 10000);
}
