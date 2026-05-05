export const PRESETS = {
  "plan-next-task": "Plan la prochaine tâche exécutable (dry-run). Ne fais que planifier, ne lance aucune action.",
  "run-one-safe-task": "Run une seule tâche classifiée 'safe' ou 'trivial'. Stop après PR. Respecte allowExec.",
  "loop-safe-tasks": "Loop dry-run sur tasks 'safe'/'trivial' jusqu'à maxPRs. Aucune écriture réelle. Stop si question humaine ou erreur.",
  "resume-after-answer": "Resume depuis la dernière réponse humaine appliquée à GitHub. Reprend la task en attente.",
  "analyze-blockage": "Analyse pourquoi le runner est bloqué. Liste blockers et propose remédiation. Aucune action.",
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
