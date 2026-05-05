export function renderV5Card(container, status) {
  if (!container || !status) return;
  const set = (key, val, cls) => {
    const li = container.querySelector(`[data-key="${key}"] [data-value]`);
    if (!li) return;
    li.textContent = val;
    li.classList.remove("ok", "err", "warn");
    if (cls) li.classList.add(cls);
  };
  set("claude", status.claudeAvailable ? `available (${status.claudeVersion ?? "?"})` : `missing — ${status.claudeReason ?? "?"}`,
    status.claudeAvailable ? "ok" : "err");
  set("exec", status.execAllowed ? "allowed" : "disabled", status.execAllowed ? "ok" : "warn");
  set("loop", status.loopAllowed ? "allowed" : "disabled", status.loopAllowed ? "ok" : "warn");
  set("automerge", status.autoMergeAllowed ? "allowed" : "OFF (default)", status.autoMergeAllowed ? "warn" : "ok");
  set("notion", status.notionConfigured ? "configured" : "not configured", status.notionConfigured ? "ok" : "warn");
  set("n8n", status.n8nConfigured ? "configured" : "not configured", status.n8nConfigured ? "ok" : "warn");
  set("whatsapp", status.whatsappConfigured ? "configured" : "not configured", status.whatsappConfigured ? "ok" : "warn");

  const actions = container.querySelector("#v5-next-actions");
  if (actions) {
    actions.innerHTML = "";
    const items = Array.isArray(status.nextHumanActions) && status.nextHumanActions.length
      ? status.nextHumanActions
      : ["Tout est prêt côté V5."];
    for (const a of items) {
      const li = document.createElement("li");
      li.textContent = a;
      actions.appendChild(li);
    }
  }
}

export function summarizeV5({ claudeAvailable, notionConfigured, n8nConfigured, whatsappConfigured }) {
  const ok = [claudeAvailable, notionConfigured, n8nConfigured, whatsappConfigured].filter(Boolean).length;
  return { ok, total: 4, ready: ok === 4 };
}
