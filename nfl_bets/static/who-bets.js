/** "My Bets" pill over the member's name: the saved bet count, and a tap opens Build a bet. */

function whoBetsPaint() {
  const count = typeof saveList === "function" ? saveList().length : 0;
  document.querySelectorAll("button.find-mine-go").forEach((button) => {
    const text = `My Bets ${count}`;
    if (button.textContent !== text) button.innerHTML = `My Bets <b>${count}</b>`;
    button.setAttribute("aria-label", `My Bets, ${count}`);
  });
  const who = document.getElementById("who");
  if (!who || !who.querySelector("#member-profile")) return;
  let pill = who.querySelector(".who-bets");
  if (!pill) {
    pill = document.createElement("button");
    pill.type = "button";
    pill.className = "who-bets";
    pill.addEventListener("click", (event) => {
      event.stopPropagation();
      window.asking = true;
      if (window.goFull) goFull();
      if (window.birdMenu) birdMenu("find");
    });
    who.append(pill);
  }
  pill.hidden = !count;
  const text = `My Bets ${count}`;
  if (pill.textContent !== text) pill.innerHTML = `My Bets <b>${count}</b>`;
}

setInterval(whoBetsPaint, 1000);
