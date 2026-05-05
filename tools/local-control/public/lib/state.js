export const state = {
  mode: "dry",
  lan: false,
  autoMerge: false,
  currentRun: null,
};

export function setMode(m) { state.mode = m === "live" ? "live" : "dry"; }
export function setLan(b) { state.lan = !!b; }
export function setAutoMerge(b) { state.autoMerge = !!b; }
export function setCurrentRun(id) { state.currentRun = id || null; }
