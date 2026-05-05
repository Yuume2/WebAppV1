const PRESETS = {
  "plan-next-task": "Plan la prochaine tâche exécutable. Mode dry-run.",
  "run-one-safe-task": "Run une seule tâche classifiée 'safe' ou 'trivial'. Stop après PR.",
  "loop-safe-tasks": "Loop tasks 'safe'/'trivial' jusqu'à maxPRs. Stop si question humaine ou erreur.",
  "resume-after-answer": "Resume depuis la dernière réponse Notion appliquée à GitHub.",
  "analyze-blockage": "Analyse pourquoi le runner est bloqué. Liste blockers et propose remédiation.",
};

export function mountPrompt(api) {
  const ta = document.getElementById("prompt-text");
  const send = document.getElementById("prompt-send");
  const clear = document.getElementById("prompt-clear");
  document.querySelectorAll("[data-preset]").forEach((b) => {
    b.addEventListener("click", () => {
      const k = b.getAttribute("data-preset");
      ta.value = PRESETS[k] || "";
    });
  });
  send.addEventListener("click", async () => {
    if (!ta.value.trim()) return;
    const r = await api.post("/api/prompt", { prompt: ta.value, preset: null });
    if (r?.runId) document.getElementById("log-run-select").dispatchEvent(new CustomEvent("subscribe", { detail: r.runId }));
  });
  clear.addEventListener("click", () => (ta.value = ""));
}
