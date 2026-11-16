function editStake(button) {
  const bet = button.closest(".rec-bet, #rec-open");
  if (!bet) return;
  const input = document.createElement("input");
  input.type = "number";
  input.className = "stake";
  input.min = "1";
  input.max = "100000";
  input.step = "1";
  input.setAttribute("aria-label", "Bet size");
  input.value = button.textContent.replace(/[^0-9.]/g, "") || "5";
  button.replaceWith(input);
  input.focus();
  input.select();
  const finish = () => {
    if (!input.isConnected) return;
    const amount = Number(input.value);
    const stake = Number.isFinite(amount) && amount > 0 ? Math.round(Math.min(amount, 100000) * 100) / 100 : 5;
    bet.dataset.stake = String(stake);
    const row = (window.recTickets || [])[Number(bet.dataset.rec)];
    const price = Number(row && row.ticket && row.ticket.american);
    const copy = bet.querySelector(".rec-copy");
    if (copy && window.recWin) copy.innerHTML = recWin(price, stake);
  };
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") { event.preventDefault(); input.blur(); }
    if (event.key === "Escape") { input.value = button.textContent; input.blur(); }
  });
  input.addEventListener("blur", finish);
}

function editTrayStake(button) {
  const pay = button.closest("i.pay");
  if (!pay || !button.closest(".find-ticket")) return;
  const input = document.createElement("input");
  input.type = "number";
  input.className = "stake";
  input.min = "1";
  input.max = "100000";
  input.step = "1";
  input.setAttribute("aria-label", "Bet size");
  input.value = button.textContent.replace(/[^0-9.]/g, "") || "5";
  button.replaceWith(input);
  input.focus();
  input.select();
  const finish = () => {
    if (!input.isConnected) return;
    const amount = Number(input.value);
    if (typeof parlayStakeSet === "function") parlayStakeSet(amount);
    else window.parlayStake = Number.isFinite(amount) && amount > 0 ? Math.round(Math.min(amount, 100000) * 100) / 100 : 5;
    if (typeof paintParlay === "function") paintParlay();
  };
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") { event.preventDefault(); input.blur(); }
    if (event.key === "Escape") { input.value = button.textContent; input.blur(); }
  });
  input.addEventListener("blur", finish);
}

document.addEventListener("click", (event) => {
  const stake = event.target.closest(".rec-copy button.stake");
  if (stake) editStake(stake);
  const tray = event.target.closest(".find-ticket .pay button.stake");
  if (tray) editTrayStake(tray);
});
