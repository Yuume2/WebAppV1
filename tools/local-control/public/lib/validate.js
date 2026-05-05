export function validateRunnerForm(d) {
  if (!d) return "données manquantes";
  if (!["plan", "exec", "loop"].includes(d.mode)) return "mode invalide";
  if (d.mode === "exec" && !d.allowExec && !d.dryRun) return "exec requiert allowExec ou dryRun";
  if (d.mode === "loop" && !d.allowLoop) return "loop requiert allowLoop";
  if (d.allowAutoMerge && d.dryRun) return "auto-merge incompatible avec dry-run";
  if (!Number.isFinite(d.maxPRs) || d.maxPRs < 1 || d.maxPRs > 10) return "maxPRs hors bornes (1-10)";
  if (!Number.isFinite(d.maxMinutes) || d.maxMinutes < 1 || d.maxMinutes > 240) return "maxMinutes hors bornes (1-240)";
  if (d.issue != null && (!Number.isFinite(d.issue) || d.issue < 1)) return "issue invalide";
  return null;
}

export function validateSettings(s) {
  if (!s) return "données manquantes";
  if (s.maxPrsPerRun != null && (s.maxPrsPerRun < 1 || s.maxPrsPerRun > 10)) return "maxPrsPerRun hors bornes (1-10)";
  if (s.maxMinutes != null && (s.maxMinutes < 1 || s.maxMinutes > 240)) return "maxMinutes hors bornes (1-240)";
  if (s.staleDays != null && (s.staleDays < 0 || s.staleDays > 365)) return "staleDays hors bornes (0-365)";
  return null;
}

export function parseCsv(s) {
  return String(s || "").split(",").map((x) => x.trim()).filter(Boolean);
}
