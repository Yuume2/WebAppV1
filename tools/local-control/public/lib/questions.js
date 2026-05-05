import { redact } from "./redact.js";

export function renderQuestions(items, { api }) {
  const root = document.getElementById("questions-list");
  if (!root) return;
  root.innerHTML = "";
  if (!items.length) {
    root.innerHTML = '<p class="muted">Aucune question en attente.</p>';
    return;
  }
  items.filter((q) => !q.answeredAt).forEach((q) => root.appendChild(card(q, api)));
}

function card(q, api) {
  const el = document.createElement("div");
  el.className = "question";
  el.innerHTML = `
    <h4>#${q.issue} — Question</h4>
    <p>${escapeHtml(redact(q.question || ""))}</p>
    <div class="options">${(q.options || []).map((o) => `<span class="chip">${escapeHtml(o)}</span>`).join("")}</div>
    <p class="small muted">${q.recommendation ? "Reco Claude : " + escapeHtml(q.recommendation) : ""}</p>
    <textarea placeholder="Ta réponse…"></textarea>
    <div class="actions"><button class="primary">Envoyer</button></div>
  `;
  const ta = el.querySelector("textarea");
  el.querySelector("button").addEventListener("click", async () => {
    const answer = ta.value.trim();
    if (!answer) return;
    await api.post(`/api/questions/${encodeURIComponent(q.id)}/answer`, { answer });
    el.remove();
  });
  return el;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
