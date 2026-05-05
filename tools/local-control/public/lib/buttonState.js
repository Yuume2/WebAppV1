// Pure helpers for button state. Tested in node.
// Not coupled to DOM — apply* functions take an element-like object with
// classList.add/remove, removeAttribute, setAttribute, and disabled.

export const REASONS = Object.freeze({
  AUTH: "Auth requise — colle ton token.",
  EXEC: "Désactivé : settings.allowExec = false.",
  LOOP: "Désactivé : settings.allowLoop = false.",
  AUTOMERGE: "Désactivé : settings.allowAutoMerge = false.",
  OFFLINE: "Backend offline.",
  ACTIVE_RUN: "Un run est déjà actif.",
  TASK_BLOCKED: "Task bloquée — voir raison.",
  TASK_NOT_EXECUTABLE: "Task non exécutable (classification non safe).",
});

export function computeDisabledReason({ need, conn, settings, hasActiveRun, taskExecutable }) {
  if (conn === "auth-required") return REASONS.AUTH;
  if (conn === "offline") return REASONS.OFFLINE;
  if (need === "exec" && !(settings?.allowExec)) return REASONS.EXEC;
  if (need === "loop" && !(settings?.allowLoop)) return REASONS.LOOP;
  if (need === "automerge" && !(settings?.allowAutoMerge)) return REASONS.AUTOMERGE;
  if (need === "task-run" && !taskExecutable) return REASONS.TASK_NOT_EXECUTABLE;
  if (hasActiveRun && (need === "exec" || need === "loop" || need === "task-run")) return REASONS.ACTIVE_RUN;
  return null;
}

export function applyDisabled(btn, reason) {
  if (!btn) return;
  if (reason) {
    btn.disabled = true;
    btn.setAttribute("data-disabled-reason", reason);
    btn.setAttribute("title", reason);
  } else {
    btn.disabled = false;
    btn.removeAttribute("data-disabled-reason");
    btn.removeAttribute("title");
  }
}

export function setLoading(btn) {
  if (!btn) return;
  btn.classList.remove("is-success", "is-error");
  btn.classList.add("is-loading");
  btn.disabled = true;
}
export function setSuccess(btn) {
  if (!btn) return;
  btn.classList.remove("is-loading", "is-error");
  btn.classList.add("is-success");
  btn.disabled = false;
  setTimeout(() => btn.classList.remove("is-success"), 1500);
}
export function setError(btn, msg) {
  if (!btn) return;
  btn.classList.remove("is-loading", "is-success");
  btn.classList.add("is-error");
  btn.disabled = false;
  if (msg) btn.setAttribute("title", msg);
}

export async function runWithState(btn, fn) {
  setLoading(btn);
  try {
    const r = await fn();
    setSuccess(btn);
    return r;
  } catch (e) {
    setError(btn, String(e?.message || e));
    throw e;
  }
}
