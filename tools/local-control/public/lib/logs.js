import { redact } from "./redact.js";
import { groupLines, formatGrouped } from "./logGroup.js";

export function mountLogs(api) {
  const view = document.getElementById("log-view");
  const select = document.getElementById("log-run-select");
  let currentEs = null;
  let buffer = [];

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
    buffer = [];
    appendLine(`— Subscribed to run ${runId} —`);
    setRunIdTag(runId);
    currentEs = api.subscribe(runId, {
      onLog: (data) => appendLine(redact(data?.line ?? data)),
      onStatus: (data) => appendLine(`[status] ${redact(JSON.stringify(data))}`),
      onDone: (data) => appendLine(`[done] ${redact(JSON.stringify(data))}`),
      onError: () => appendLine("[error] connexion SSE perdue"),
    });
  }

  function appendLine(line) {
    if (line == null) return;
    buffer.push(String(line));
    if (buffer.length > 500) buffer = buffer.slice(-500);
    const groups = groupLines(buffer);
    view.textContent = formatGrouped(groups);
    if (document.getElementById("log-autoscroll")?.checked) view.scrollTop = view.scrollHeight;
  }

  function setRunIdTag(runId) {
    let tag = document.getElementById("log-run-tag");
    if (!tag) {
      tag = document.createElement("span");
      tag.id = "log-run-tag";
      tag.className = "run-id-tag";
      document.querySelector(".logs-toolbar")?.appendChild(tag);
    }
    tag.textContent = runId ? `runId: ${runId}` : "";
  }

  select.addEventListener("change", () => subscribe(select.value));
  select.addEventListener("subscribe", (e) => { refreshRuns(); subscribe(e.detail); });

  document.querySelector('[data-action="copy-logs"]').addEventListener("click", async () => {
    const text = redact(view.textContent || "");
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text; document.body.appendChild(ta); ta.select();
        document.execCommand("copy"); document.body.removeChild(ta);
      }
    } catch {}
  });
  document.querySelector('[data-action="clear-logs"]').addEventListener("click", () => {
    buffer = [];
    view.textContent = "";
  });

  refreshRuns();
  setInterval(refreshRuns, 10000);
}
