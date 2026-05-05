import { validateRunnerForm } from "./validate.js";

export function mountRunner(api, { confirmDanger }) {
  const form = document.getElementById("runner-form");
  const warn = document.getElementById("runner-warn");
  if (!form) return;

  const refreshWarn = () => {
    const data = readForm(form);
    const msgs = [];
    if (!data.dryRun) msgs.push("⚠ DRY-RUN désactivé : actions réelles.");
    if (data.allowAutoMerge) msgs.push("⚠ AUTO-MERGE activé : PR seront fusionnés automatiquement.");
    if (data.allowLoop) msgs.push("⚠ LOOP autorisé : runner continuera tant qu'il trouve des tâches.");
    warn.textContent = msgs.join(" ");
    warn.classList.toggle("hidden", msgs.length === 0);
  };
  form.addEventListener("change", refreshWarn);
  refreshWarn();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = readForm(form);
    const err = validateRunnerForm(data);
    if (err) { warn.textContent = "✗ " + err; warn.classList.remove("hidden"); return; }

    if (!data.dryRun || data.allowAutoMerge || data.allowLoop) {
      const word = data.allowAutoMerge ? "AUTOMERGE" : data.allowLoop ? "LOOP" : "EXEC";
      const ok = await confirmDanger({
        title: "Confirmation requise",
        body: `Mode ${data.mode}, dryRun=${data.dryRun}, autoMerge=${data.allowAutoMerge}, loop=${data.allowLoop}. Tape ${word} pour confirmer.`,
        magicWord: word,
      });
      if (!ok) return;
    }
    const r = await api.post("/api/runner/start", data);
    if (r?.runId) document.getElementById("log-run-select").dispatchEvent(new CustomEvent("subscribe", { detail: r.runId }));
  });

  document.querySelector('[data-action="stop-runner"]').addEventListener("click", () => api.post("/api/runner/stop", {}).catch(() => {}));
}

function readForm(form) {
  const fd = new FormData(form);
  return {
    mode: fd.get("mode") || "plan",
    issue: fd.get("issue") ? Number(fd.get("issue")) : null,
    maxPRs: Number(fd.get("maxPRs") || 3),
    maxMinutes: Number(fd.get("maxMinutes") || 20),
    dryRun: fd.get("dryRun") === "on",
    allowExec: fd.get("allowExec") === "on",
    allowLoop: fd.get("allowLoop") === "on",
    allowAutoMerge: fd.get("allowAutoMerge") === "on",
  };
}
