export function confirmDanger({ title = "Confirmer", body = "", magicWord = "CONFIRMER" }) {
  return new Promise((resolve) => {
    const dlg = document.getElementById("confirm-dialog");
    if (!dlg) { resolve(window.confirm(title + "\n" + body)); return; }
    document.getElementById("confirm-title").textContent = title;
    document.getElementById("confirm-body").textContent = body;
    const input = document.getElementById("confirm-input");
    input.value = "";
    input.placeholder = "Tape: " + magicWord;
    const okBtn = document.getElementById("confirm-ok");
    const onClose = () => {
      dlg.removeEventListener("close", onClose);
      resolve(dlg.returnValue === "ok" && input.value === magicWord);
    };
    dlg.addEventListener("close", onClose);
    okBtn.disabled = true;
    input.oninput = () => { okBtn.disabled = input.value !== magicWord; };
    dlg.showModal();
  });
}
