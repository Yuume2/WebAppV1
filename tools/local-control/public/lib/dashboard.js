import { redact } from "./redact.js";

export function renderDashboard(d) {
  if (!d) return;
  text("dash-branch", d.branch || "—");
  const gs = d.gitStatus || {};
  text("dash-git", gs.clean ? "clean" : `${(gs.files || []).length} modifié(s) — ahead ${gs.ahead || 0} / behind ${gs.behind || 0}`);

  const doc = d.doctor || {};
  text("dash-doctor", doc.ok ? `Phase ${doc.phase || "?"} OK` : "Bloqué");
  const ul = document.getElementById("dash-doctor-blockers");
  ul.innerHTML = "";
  (doc.blockers || []).forEach((b) => {
    const li = document.createElement("li");
    li.textContent = redact(b);
    ul.appendChild(li);
  });

  const mp = d.mainProtection || {};
  text("dash-protection", mp.enabled ? `${mp.type}` : "non configurée");
  text("dash-protection-checks", (mp.checks || []).join(", ") || "—");

  const pg = d.phaseGates || {};
  setChip("gate-1", pg.phase1);
  setChip("gate-2", pg.phase2);
  setChip("gate-3", pg.phase3);

  text("dash-issues", String(d.openIssues ?? "—"));
  text("dash-auto", String(d.autonomousTasks ?? "—"));
  text("dash-questions", String(d.pendingQuestions ?? "—"));
  text("dash-latest", d.latestRun?.status || "—");
  text("dash-latest-time", d.latestRun?.startedAt || "—");
}

function text(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}
function setChip(id, val) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove("ok", "blocked");
  if (val === "ok") el.classList.add("ok");
  if (val === "blocked") el.classList.add("blocked");
}
