import { validateSettings, parseCsv } from "./validate.js";

export function mountSettings(api, { onChange } = {}) {
  const form = document.getElementById("settings-form");
  if (!form) return;

  load().catch(() => {});

  async function load() {
    const s = await api.get("/api/settings");
    fill(form, s);
    onChange?.(s);
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = read(form);
    const err = validateSettings(data);
    if (err) { alert("✗ " + err); return; }
    const r = await api.post("/api/settings", data);
    if (r) { fill(form, r); onChange?.(r); }
  });
}

function fill(form, s) {
  if (!s) return;
  form.maxPrsPerRun.value = s.maxPrsPerRun ?? "";
  form.maxMinutes.value = s.maxMinutes ?? "";
  form.staleDays.value = s.staleDays ?? "";
  form.preferredIssue.value = s.preferredIssue ?? "";
  form.dryRunDefault.checked = !!s.dryRunDefault;
  form.allowExec.checked = !!s.allowExec;
  form.allowLoop.checked = !!s.allowLoop;
  form.allowAutoMerge.checked = !!s.allowAutoMerge;
  form.lanEnabled.checked = !!s.lanEnabled;
  form.allowedRisk.value = (s.allowedRisk || []).join(",");
  form.allowedAutonomy.value = (s.allowedAutonomy || []).join(",");
}

function read(form) {
  const out = {
    dryRunDefault: form.dryRunDefault.checked,
    allowExec: form.allowExec.checked,
    allowLoop: form.allowLoop.checked,
    allowAutoMerge: form.allowAutoMerge.checked,
    lanEnabled: form.lanEnabled.checked,
    allowedRisk: parseCsv(form.allowedRisk.value),
    allowedAutonomy: parseCsv(form.allowedAutonomy.value),
  };
  const n = (v) => (v === "" || v == null ? undefined : Number(v));
  if (n(form.maxPrsPerRun.value) != null) out.maxPrsPerRun = n(form.maxPrsPerRun.value);
  if (n(form.maxMinutes.value) != null) out.maxMinutes = n(form.maxMinutes.value);
  if (n(form.staleDays.value) != null) out.staleDays = n(form.staleDays.value);
  out.preferredIssue = form.preferredIssue.value === "" ? null : Number(form.preferredIssue.value);
  return out;
}
