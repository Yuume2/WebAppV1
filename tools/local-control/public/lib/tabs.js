export function mountTabs() {
  const tabs = document.getElementById("tabs");
  if (!tabs) return;
  tabs.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-tab]");
    if (!btn) return;
    const target = btn.getAttribute("data-tab");
    document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("active", b === btn));
    document.querySelectorAll("main .pane").forEach((p) => p.classList.toggle("active", p.getAttribute("data-pane") === target));
    if (location.hash !== "#" + target) history.replaceState(null, "", "#" + target);
  });
  const fromHash = (location.hash || "").replace("#", "");
  if (fromHash) {
    const btn = tabs.querySelector(`button[data-tab="${fromHash}"]`);
    if (btn) btn.click();
  }
}
