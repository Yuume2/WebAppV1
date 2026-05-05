// Renders the onboarding card on dashboard. Pure DOM update.

export function renderOnboarding({ conn, settings, network }) {
  setRow("server", connServerLabel(conn), connServerCls(conn));
  const authState = conn === "connected" ? { label: settings?.authTokenSet === false ? "ouverte (no token)" : "OK", cls: "ok" }
    : conn === "auth-required" ? { label: "token requis", cls: "warn" }
    : { label: "—", cls: "" };
  setRow("auth", authState.label, authState.cls);
  const lan = network?.lan ? "LAN" : "local";
  setRow("mode", lan, network?.lan ? "warn" : "ok");
  const dryRun = settings?.dryRunDefault ? "DRY-RUN" : "LIVE";
  setRow("dryrun", dryRun, settings?.dryRunDefault ? "ok" : "warn");
  renderPhone(network);
}

function connServerLabel(c) {
  if (c === "connected") return "connecté";
  if (c === "auth-required") return "token requis";
  if (c === "offline") return "offline";
  return "—";
}
function connServerCls(c) {
  if (c === "connected") return "ok";
  if (c === "auth-required") return "warn";
  if (c === "offline") return "err";
  return "";
}

function setRow(key, value, cls) {
  const li = document.querySelector(`#onboarding-list li[data-key="${key}"]`);
  if (!li) return;
  li.classList.remove("ok", "warn", "err");
  if (cls) li.classList.add(cls);
  const v = li.querySelector("[data-value]");
  if (v) v.textContent = value;
}

function renderPhone(network) {
  const local = document.getElementById("phone-local");
  const lan = document.getElementById("phone-lan");
  const hint = document.getElementById("phone-hint");
  if (!local || !lan) return;
  local.textContent = network?.localUrl || "http://127.0.0.1:8787";
  if (network?.lanUrl) {
    lan.textContent = network.lanUrl;
    if (hint) hint.textContent = "Ouvre cette URL sur ton téléphone (même Wi-Fi).";
  } else if (network?.lanEnabled) {
    lan.textContent = "IP LAN inconnue";
    if (hint) hint.textContent = "Lance ipconfig getifaddr en0 puis relance avec pnpm local:control:lan.";
  } else {
    lan.textContent = "désactivé";
    if (hint) hint.textContent = "Active LAN dans Settings + relance avec pnpm local:control:lan.";
  }
}

// Pure data computation, exported for tests.
export function computeOnboardingState({ conn, settings, network }) {
  return {
    server: connServerLabel(conn),
    auth: conn === "connected" ? "OK" : conn === "auth-required" ? "token requis" : "—",
    mode: network?.lan ? "LAN" : "local",
    dryRun: settings?.dryRunDefault ? "DRY-RUN" : "LIVE",
    localUrl: network?.localUrl || null,
    lanUrl: network?.lanUrl || null,
    lanHint: !network?.lanEnabled ? "lan-disabled" : (!network?.lanUrl ? "ip-unknown" : "ready"),
  };
}
