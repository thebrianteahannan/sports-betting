/** The long read behind each parlay strategy, opened with More. */

const STACK_MORE = {
  "Prop ladder": [
    "Three overs on the same player and the same stat, at three lines. The site puts $5 on the top and middle rungs and sizes the bottom rung so its profit pays for those two $5 tickets.",
    "Example, a rebounds ladder: Over 3.5 at -166 is $17 to win $10.24. Over 4.5 at +140 is $5 to win $7. Over 5.5 at +280 is $5 to win $14. That is $27 in play.",
    "3 or fewer: you lose $27. Exactly 4: the bottom pays the other two, and you are up $0.24. Exactly 5: up $12.24. 6 or more: up $31.24.",
    "The ladder pays when the top rung lands more often than its price says. +280 needs 26.3%. The \"N of last 10\" on each rung is that check. A player who reached 6 in 4 of his last 10 is clearing the top more often than the price.",
  ],
  "Overlapping under": [
    "Two unders on the same number, one tight and one with room. The site sizes the higher under so its profit covers the $5 on the lower one.",
    "Example, a team total: Under 20.5 at -150 is $8 to win $5.33. Under 16.5 at +190 is $5 to win $9.50. That is $13 in play.",
    "16 or fewer: both cash, up $14.83. 17 to 20: the higher under pays for the lower one, up $0.33. 21 or more: you lose $13.",
    "This is a ladder turned upside down. The big payout comes from the tight under, so the bet is on a quiet night.",
  ],
  "Classic middle": [
    "An over on a low line and an under on a higher line of the same total. A finish between the two numbers wins both tickets. Anywhere else, one wins and one loses.",
    "Example: Over 222.5 at -140 is $5 to win $3.57. Under 230.5 at -140 is $5 to win $3.57. That is $10 in play.",
    "223 to 230: both win, up $7.14. 222 or lower, or 231 or higher: one wins and one loses, down $1.43.",
    "Break-even: the game has to land inside the gap about 1 time in 6, or 16.7%. A wider gap and shorter juice make that easier. The site keeps gaps of 3 to 8 points and leaves out either side priced past -170.",
  ],
  "Live middle": [
    "You bet a number before the game. During the game the line moves, and you take the other side at the new number. The space between the two numbers is the middle.",
    "Example: Under 47.5 at -110 before kickoff, $5 to win $4.55. After a fast start, the live total is 54.5, and you take Over 54.5 at -110 for $5.",
    "48 to 54: both win, up $9.09. Anything else: one wins and one loses, down $0.45.",
    "Break-even is under 5%, so a 7-point gap is a strong spot. The board this site reads is pre-game, so the live side is a ticket you watch for and place yourself.",
  ],
  "Key-number middle": [
    "An NFL middle built around 3 or 7. You take the favorite at -2.5 and the dog at +3.5 in the same game. If the favorite wins by exactly 3, both tickets cash.",
    "Example: favorite -2.5 at -125 is $5 to win $4. Dog +3.5 at -125 is $5 to win $4. That is $10 in play.",
    "A win by exactly 3: up $8. Any other result: down $1.",
    "Break-even is 1 game in 9, or 11.1%. NFL games land on exactly 3 about 15% of the time, and on 7 about 9%. At -200 on each side the break-even jumps to 33%, which is why the site leaves out either side past -220.",
  ],
  "Teaser": [
    "One parlay where every leg moves 6 points your way. In exchange, the payout drops to about -120 for two legs, and both legs have to win.",
    "Example: Chiefs -7.5 becomes -1.5, and Bills +1.5 becomes +7.5. $6 to win $5.",
    "-120 needs 54.5%, so each leg has to win about 73.9% of the time. The 6 points are worth that only when they cross 3 and 7. Moving a -13 favorite to -7 adds wins by 8 to 13, and none of those land as often as 3 or 7.",
  ],
  "Wong teaser": [
    "The teaser that crosses both key numbers. Take favorites of -7.5 to -8.5 down to -1.5 to -2.5, or dogs of +1.5 to +2.5 up to +7.5 to +8.5.",
    "Example: dog +2.5 becomes +8.5, and favorite -8.5 becomes -2.5. Two legs at -120, $6 to win $5.",
    "Each leg needs about 73.9%. Legs in these windows have historically covered near 75%, which is where the name and the edge come from. Stop at two legs. Each added leg needs 73.9% again.",
  ],
  "Pleaser": [
    "A teaser in reverse. Every line moves 6 points against you, and the payout jumps to about +600 for two legs.",
    "Example: favorite -2.5 becomes -8.5, and a second favorite -3 becomes -9. $5 to win $30.",
    "+600 needs 14.3%, so each leg needs about 37.8%. You give up the margins of 3 and 7, the two most common NFL finishes, so it cashes only on blowouts.",
  ],
  "Buying the hook": [
    "Paying extra juice to move a spread half a point across 3 or 7. The site lists the posted number and the bought number side by side.",
    "Example: favorite -3.5 at -110 is $5 to win $4.55. The same team at -2.5 at -135 is $5 to win $3.70.",
    "-110 needs 52.4%. -135 needs 57.4%. The half point is worth buying when the favorite wins by exactly 3 more than 5% of the time. Across 4, 5, 6, 8, or 9 the same half point lands too rarely to pay the juice.",
  ],
  "Dutching": [
    "Betting several players in the same \"who does it first\" market, sized so any of them scoring first pays about the same. You are betting on \"one of these guys.\"",
    "The site takes the most likely first touchdown scorers, adds them until their prices reach 100%, and splits about $15 across them. More goes on the likely scorers and $1 on each long shot. The stakes round to whole dollars, so the payouts drift apart.",
    "Example, 13 first-touchdown scorers for $16: if the +360 favorite scores first, you are down $2.20. A +700 pays you back even. A +1000 leaves you down $5. A +3000 long shot puts you up $15. Anyone else, a defense, or no touchdown loses all $16.",
    "The set adding to 99% is FanDuel's price, with its edge built in. The whole first-touchdown market adds to about 115%, so the real chance one of the 13 scores first is about 86%. That set costs about $2 per $16 on average. A dutch pays only when the set is under 100% after the edge, which takes a second book's prices.",
  ],
  "Arbitrage": [
    "Two books disagree enough that you can bet both sides and win either way.",
    "Example: Book A has Team X at +110 (47.6%). Book B has Team Y at -105 (51.2%). Together that is 98.8%, under 100%. $5 on X at +110 returns $10.50. $5.38 on Y at -105 also returns $10.50. You stake $10.38 and get back $10.50 either way, up $0.12.",
    "The profit is small, so the stakes have to be large to matter. Both tickets have to be accepted at those prices. If one book cuts the bet or moves the line first, the other ticket is a regular bet. This site reads FanDuel only, so the second book's side is one you find yourself.",
  ],
  "Low-hold shopping": [
    "The same bet at a better price somewhere else. It is the one strategy that improves every bet you already make.",
    "-105 needs 51.2% to break even. -115 needs 53.5%. $5 at -105 wins $4.76. At -115 it wins $4.35.",
    "Over 100 bets that win 52 times, the -105 bettor is up $7.62 and the -115 bettor is down $13.91. Same picks, $21.53 apart.",
  ],
  "Round robin": [
    "Every pair of your picks becomes its own 2-leg parlay. One miss kills only the pairs that used that leg.",
    "Example with three legs at -110: each pair pays +264, so $5 wins $13.22. Three pairs is $15 in play.",
    "All three hit: up $39.67. Two hit: one pair cashes, up $3.22. One or none: you lose $15. The same three legs as one $15 parlay pay $89.37 and only when all three hit.",
    "The site takes the spread nearest -110 from each game. With 10 games that is 45 pairs and $225, so pick the three or four sides you like.",
  ],
  "If-bet": [
    "The second ticket is placed only if the first one wins. You risk the first stake, not both.",
    "Example: $5 on A at -110. If A wins $4.55, place $5 on B at -110.",
    "A loses: down $5, and B is never placed. A wins and B wins: up $9.09. A wins and B loses: down $0.45.",
    "FanDuel does not post if-bets as one ticket, so A has to finish before B starts and you place B yourself.",
  ],
  "Reverse": [
    "Two if-bets at once: A then B, and B then A. Both openers are live, so $10 is at risk up front with $5 openers.",
    "Example with both at -110: both win, up $18.18. One wins and one loses: down $5.45. Both lose: down $10.",
    "Compared with one if-bet, you double the stake to not have to choose which leg goes first.",
  ],
  "Hedge": [
    "You already hold a ticket, and the price on the other side lets you lock a result.",
    "Example: $10 on Team A at +200 to win $20. Before the game, Team B is -150. $18 on B makes both results the same: A wins, up $2. B wins, up $2.",
    "Instead of up $20 or down $10, you take up $2 either way. Hedge when the locked number is one you want more than the swing.",
  ],
  "Parlay hedge": [
    "Four legs of a five-leg parlay have hit, and the last game has not started. A bet on the other side of the last leg can lock a profit.",
    "Example: $5 to win $100, with the last leg at +150. The other side is -170. $66.12 on it makes both results up $33.88.",
    "Letting it ride is worth about $36 on average at those prices. The lock costs about $2, the juice on the $66 ticket. You trade that $2 for never seeing $0.",
  ],
  "Future hedge": [
    "A long-shot future that is now a short price. The other side of the final locks a profit on the season.",
    "Example: $10 on a team at +2000 in March to win $200. They reach the final as -150, and the opponent is +130. $91.30 on the opponent makes both results up $108.70.",
    "You give up $91.30 of the $200 to make sure the season ends up $108.70.",
  ],
  "Cash-out": [
    "The book offers to buy your ticket back before it settles. Their offer is a hedge with their juice built in.",
    "Example: $5 parlay to win $100, with the last leg at -300. The book offers a $65 cash-out, which is up $60. Typing the hedge yourself, $30 on the other side at +250, locks up $70 either way.",
    "Take the cash-out only when it beats the hedge you could place yourself. It usually does not.",
  ],
  "Flat stake": [
    "The same dollars on every ticket, win or lose. A $500 bankroll at 1% is $5 a bet, every bet.",
    "Example: 100 bets at -110 that win 55 times: up $25. A run of 10 losses costs $50, 10% of the bankroll.",
    "The record then reflects the picks and the prices, not a bigger bet placed after a hot streak.",
  ],
  "Kelly": [
    "The stake grows with your edge. The formula: (chance × payout odds − chance of losing) ÷ payout odds, as a share of the bankroll.",
    "Example: a side you make 55% at even money is 10% of the bankroll at full Kelly. Half Kelly is 5%. On $500 that is $50 or $25. At -110 the same 55% is 5.5% full Kelly.",
    "Kelly trusts the 55%. If the real chance is 52%, full Kelly at even money should be 4%, and 10% is betting two and a half times too much. Half Kelly is the usual guard against a guessed edge.",
  ],
  "Martingale": [
    "Double the stake after every loss. The first win gets back every loss plus one unit.",
    "Example from $5: $5, $10, $20, $40, and so on. After 10 losses you are down $5,115, and the next bet is $5,120. A win at even money finishes the series up $5.",
    "At a coin flip, 10 straight losses happen once every 1,024 series. At -110, a $5,120 win pays $4,655, which does not cover the $5,115 already lost. The book's limits usually stop the doubling first.",
  ],
  "Paroli": [
    "Press only after a win. One unit, then two, then four. After three wins, or any loss, go back to one unit.",
    "Example at even money with $5: three wins in a row is up $35. Any loss along the way is down $5.",
    "No series loses more than one unit. Three wins in a row happen 1 time in 8 at a coin flip. The price on each bet is the same, so the edge comes from the picks.",
  ],
  "1-3-2-6": [
    "Four steps, moving only after a win: 1 unit, 3, 2, then 6. Any loss returns to 1.",
    "Example at even money with $5: lose the first, down $5. Win then lose, down $10. Win two then lose the third, up $10. Win three then lose the fourth, even. Win all four, up $60.",
    "Two wins lock a profit even if the third loses. The price on each bet is unchanged.",
  ],
  "Fibonacci": [
    "After a loss, the next stake is the last two stakes added: 1, 1, 2, 3, 5, 8. After a win, step back two.",
    "Example with $5 units: losses of $5, $5, $10, $15, and $25 are down $60. Then $40 wins, and you are down $20 and step back to $15.",
    "It climbs slower than doubling. Ten losses in a row are down $715, and the next stake is $445.",
  ],
  "Oscar's grind": [
    "Each series aims to finish up exactly one unit. After a loss, repeat the stake. After a win, raise by one unit, but never past what finishes the series up one.",
    "Example with $5: lose $5, lose $5, win $5, then win $10. The series ends up $5, and you start over.",
    "A long losing run is a stack of units you win back one at a time.",
  ],
  "Correlated stack": [
    "Two bets that rise and fall together, like a quarterback's passing yards and his receiver's yards. The site lists each as a $5 single.",
    "Example: QB Over 249.5 at -110 and WR Over 64.5 at -110. A big passing night cashes both, up $9.09. A bad one loses both, down $10. A split is down $0.45.",
    "The multiplied parlay price, +264, treats them as two unrelated games. FanDuel's same-game price is shorter because the book knows they move together. Two singles here are one opinion at double the stake.",
  ],
  "Side and the total": [
    "A side and a total that need the same game. A big favorite pulls away and the clock runs, so the under cashes with it. A close game stays live, so the dog and the over cash together.",
    "The site pairs favorites of 6.5 or more with the under, and dogs within 3 with the over, at $5 each.",
    "Example at -110 each: the script plays out, up $9.09. A split, down $0.45. The wrong script, down $10. The \"N of last 10\" on each leg is how often that team and that total have landed lately.",
  ],
  "Player and the total": [
    "A player's over with the game total. A receiver's yards need points, so his over pairs with the game over. The site lists each as a $5 single.",
    "Example at -110 each: a shootout cashes both, up $9.09. A split, down $0.45. A low-scoring game, down $10.",
    "A running back's rushing over often needs a lead and a running clock. That script pairs with the under, not the over.",
  ],
  "First touchdown and anytime": [
    "Two tickets on the same player: anytime touchdown and first touchdown. The site sizes the anytime ticket so its profit covers the $5 first-touchdown ticket.",
    "Example: anytime at -130 is $7 to win $5.38. First touchdown at +500 is $5 to win $25. That is $12 in play.",
    "He scores first: up $30.38. He scores later: up $0.38. No touchdown: down $12.",
    "The first-touchdown price is where the payout is. The anytime ticket keeps a later score from being a loss.",
  ],
  "Same-game yardage parlay": [
    "One ticket from one game. A quarterback's passing yards, one of his receivers, a running back, and the over or the back's touchdown. Every yardage line is low, a number that player cleared in at least 8 of his last 10 games.",
    "Example: $10 at +126 pays back $22.60. Every leg has to clear. One short leg and the $10 is gone.",
    "+126 needs to cash 44.2% of the time. Three legs cleared 8 times in 10 land together about 51% of the time if they were unrelated. They rise together, which pushes that higher.",
    "A big passing day lifts the receiver too, so FanDuel's same-game price is shorter than the multiplied price on this card. Build it on FanDuel and take that number.",
    "The site builds it from tonight's FanDuel alt lines, priced -150 to -500. The over goes in when both teams' recent games cleared it 8 times in 10. The back's touchdown goes in when his recent scoring beats FanDuel's price.",
  ],
  "Yardage and the spread": [
    "One ticket from one game. A quarterback's passing yards, one of his receivers, a running back, and the quarterback's team on the spread. Each yardage line is one that player cleared in at least 8 of his last 10. The spread is the alt line his team covered in 8 of its last 10.",
    "Example: $10 at +200 pays back $30. Every leg has to clear. One short leg and the $10 is gone.",
    "+200 needs to cash 33.3% of the time.",
    "Passing yards also pile up when a team is behind. The spread needs his team ahead. Both legs need the same game, the one where the throws build the lead.",
    "The site builds it from tonight's FanDuel alt lines, priced -150 to -500. A game where his team has no alt spread it covered 8 times in 10 is left off. FanDuel's same-game price is the one to take.",
  ],
  "Two touchdowns, one game": [
    "One ticket from one game: two players to score a touchdown. Each one is a player who has scored more often lately than FanDuel's price on him says.",
    "Example: two players at +110 each multiply to +341. $10 pays back $44.10. One of them kept out of the end zone and the $10 is gone.",
    "+341 needs to cash 22.7% of the time.",
    "Two scorers on the same team split that team's touchdowns. One from each side needs both offenses to score. FanDuel's same-game price is the one to take.",
    "The site builds it from tonight's FanDuel anytime prices, -250 to +300, and lists the three pairs per game where both players run furthest ahead of their prices.",
  ],
  "Three touchdowns, one game": [
    "One ticket from one game: three players to score a touchdown. Each one is a player who has scored more often lately than FanDuel's price on him says.",
    "Example: three players at +110 each multiply to +826. $10 pays back $92.61. One of the three kept out of the end zone and the $10 is gone.",
    "+826 needs to cash 10.8% of the time.",
    "Three scorers need a game with at least three touchdowns. Two or three from the same team split that team's touchdowns. FanDuel's same-game price is the one to take.",
    "The site builds it from tonight's FanDuel anytime prices, -250 to +300, and lists the three trios per game where the players run furthest ahead of their prices.",
  ],
  "Four touchdowns, one game": [
    "One ticket from one game: four players to score a touchdown. Each one is a player who has scored more often lately than FanDuel's price on him says.",
    "Example: four players at +110 each multiply to +1845. $10 pays back $194.48. One of the four kept out of the end zone and the $10 is gone.",
    "+1845 needs to cash 5.1% of the time.",
    "Four scorers need a game with at least four touchdowns, and some of them share a team's touchdowns. FanDuel's same-game price is the one to take.",
    "The site builds it from tonight's FanDuel anytime prices, -250 to +300, and lists the three groups of four per game where the players run furthest ahead of their prices.",
  ],
  "Five touchdowns, one game": [
    "One ticket from one game: five players to score a touchdown. Each one is a player who has scored more often lately than FanDuel's price on him says.",
    "Example: five players at +110 each multiply to +3984. $10 pays back $408.41. One of the five kept out of the end zone and the $10 is gone.",
    "+3984 needs to cash 2.4% of the time.",
    "Five scorers need a game with at least five touchdowns, and some of them share a team's touchdowns. FanDuel's same-game price is the one to take.",
    "The site builds it from tonight's FanDuel anytime prices, -250 to +300, and lists the three groups of five per game where the players run furthest ahead of their prices.",
  ],
};

function stackMore(history, name) {
  const text = STACK_MORE[name];
  const lead = history && history.querySelector(":scope > span");
  if (!text || !lead || lead.querySelector(".stack-more-go")) return;
  const go = document.createElement("button");
  go.type = "button";
  go.className = "stack-more-go";
  go.textContent = "More";
  go.style.cssText = "display: inline; text-transform: none; letter-spacing: 0; min-height: 0; height: auto; line-height: inherit; vertical-align: baseline; background: none; border: 0; padding: 0; box-shadow: none; margin-left: 0.4em; color: #3dff6e; font: inherit; font-weight: 700; cursor: pointer; text-decoration: underline;";
  lead.append(go);
  history.style.whiteSpace = "normal";
  history.style.minWidth = "0";
  history.style.flexShrink = "1";
  history.querySelectorAll(":scope > *").forEach((node) => { node.style.whiteSpace = "normal"; });
  go.addEventListener("click", (event) => {
    event.stopPropagation();
    const open = history.nextElementSibling && history.nextElementSibling.classList.contains("stack-more") ? history.nextElementSibling : null;
    if (open) { open.remove(); go.textContent = "More"; return; }
    const box = document.createElement("div");
    box.className = "stack-more";
    box.style.cssText = "display: block; flex: 1 1 100%; min-width: 0; white-space: normal; margin: 0.45rem 0 0.25rem; color: #c9d4dd; font-size: 0.95em; line-height: 1.45;";
    text.forEach((line) => { const para = document.createElement("p"); para.style.margin = "0 0 0.55em"; para.textContent = line; box.append(para); });
    box.addEventListener("click", (inner) => inner.stopPropagation());
    history.after(box);
    go.textContent = "Less";
  });
}

function stackTicket(set, stack) {
  const legs = stack.bets || [];
  if (legs.length < 2 || typeof findRank !== "function" || set.querySelector(".stack-ticket")) return;
  if (stackApart(stack)) {
    const apart = document.createElement("p");
    apart.className = "stack-ticket";
    apart.style.cssText = "display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.2rem 0.7rem; margin: 0 0 0.45rem; font-size: 1.02rem; font-weight: 800;";
    apart.innerHTML = `<i style="font-style: normal; color: #f4f7fb">${legs.length} separate ${legs[0].kind === "Parlay" ? "parlays" : "bets"}</i><i style="font-style: normal; color: #3dff6e">$${legs.reduce((sum, leg) => sum + (Number(leg.stake) || 0), 0)} in play</i>`;
    const head = set.querySelector(".stack-set-name");
    if (head) head.after(apart); else set.prepend(apart);
    const make = document.createElement("button");
    make.type = "button";
    make.className = "stack-build";
    make.textContent = "Build it";
    make.setAttribute("aria-label", "Load these legs into the parlay you are building");
    make.style.cssText = "position: absolute; top: 0.42rem; right: 0.42rem; z-index: 2; width: auto; min-height: 0; margin: 0; padding: 0.3rem 0.65rem; border: 1px solid #3dff6e; border-radius: 8px; background: transparent; color: #3dff6e; font-size: 0.82rem; font-weight: 800; cursor: pointer;";
    make.addEventListener("click", (event) => { event.stopPropagation(); stackBuild(stack, 0, stackTitle(set)); });
    set.style.position = "relative";
    if (head) head.style.paddingRight = "5rem";
    set.append(make);
    return;
  }
  const dec = legs.reduce((p, leg) => p * (1 + findRank(leg.odds)), 1);
  const price = dec >= 2 ? Math.round((dec - 1) * 100) : Math.round(-100 / (dec - 1));
  const tag = price > 0 ? `+${price}` : String(price);
  const games = legs.map((leg) => String(leg.game || stack.game || ""));
  const same = games.length > 1 && games.every(Boolean) && new Set(games).size === 1;
  const line = document.createElement("p");
  line.className = "stack-ticket";
  line.style.cssText = "display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.2rem 0.7rem; margin: 0 2.2rem 0.45rem 0; font-size: 1.02rem; font-weight: 800;";
  line.innerHTML = [`<i style="font-style: normal; color: #f4f7fb">${legs.length}-leg parlay</i>`, `<i style="font-style: normal; color: #3dff6e">${esc(tag)}</i>`, findPct(price) && `<i style="font-style: normal; color: #e7c15a">${esc(findPct(price))}</i>`, findCash(price) && `<i style="font-style: normal; color: #3dff6e">${esc(`$5 profits ${findCash(price)}`)}</i>`, same && `<i style="font-style: normal; color: #04140c; background: #e7c15a; border-radius: 999px; padding: 0.05rem 0.45rem; font-size: 11px; letter-spacing: 0.03em; text-transform: uppercase">Same game</i>`].filter(Boolean).join("");
  const share = document.createElement("button");
  share.type = "button";
  share.className = "share-bet";
  share.dataset.share = "rec";
  const ticket = { title: `${legs.length}-leg parlay`, american: price, impliedPct: findPct(price), game: stack.game || "", legs: legs.map((leg) => ({ label: leg.label || "", odds: leg.odds, market: leg.kind || "", match: leg.game || stack.game || "" })) };
  share.dataset.shareId = String((window.recTickets = window.recTickets || []).push({ ticket, name: stackName(stack) }) - 1);
  share.setAttribute("aria-label", "Share this bet");
  share.style.cssText = "position: absolute; top: 0.42rem; right: 0.42rem; z-index: 2;";
  const build = document.createElement("button");
  build.type = "button";
  build.className = "stack-build";
  build.textContent = "Build it";
  build.setAttribute("aria-label", "Load these legs into the parlay you are building");
  build.style.cssText = "position: absolute; top: 0.42rem; right: 2.9rem; z-index: 2; width: auto; min-height: 0; margin: 0; padding: 0.3rem 0.65rem; border: 1px solid #3dff6e; border-radius: 8px; background: transparent; color: #3dff6e; font-size: 0.82rem; font-weight: 800; cursor: pointer;";
  build.addEventListener("click", (event) => { event.stopPropagation(); stackBuild(stack, 0, stackTitle(set)); });
  set.style.position = "relative";
  const title = set.querySelector(".stack-set-name");
  if (title) { title.style.paddingRight = "7.6rem"; title.after(line); } else set.prepend(line);
  set.append(build, share);
}

function stackApart(stack) {
  const legs = stack.bets || [];
  return legs.length > 1 && legs.some((leg) => leg.kind === "Parlay" || /^(First touchdown|Anytime$|Higher under|Lower under|Low side|High side|Covers a win|Also covers|The posted number|The hook)/.test(leg.rung || ""));
}

function stackTitle(set) {
  const name = ((set && set.closest(".rec-strategy")) || { dataset: {} }).dataset.name || "";
  const no = name && typeof STACKS !== "undefined" ? STACKS.findIndex((row) => row[0] === name) + 1 : 0;
  return name ? `${no ? `ST-${String(no).padStart(2, "0")} ` : ""}${name}` : "";
}

function stackLabel(set) {
  const text = stackTitle(set);
  if (!text || set.querySelector(":scope > .stack-set-st")) return;
  const name = set.closest(".rec-strategy").dataset.name, row = STACKS.find((item) => item[0] === name) || [], rank = STACK_RANK[name] || [];
  const tag = document.createElement("button");
  tag.type = "button"; tag.className = "stack-set-st"; tag.textContent = text; tag.setAttribute("aria-expanded", "false");
  tag.addEventListener("click", (event) => {
    event.stopPropagation();
    const open = set.querySelector(":scope > .stack-set-about"), about = open || document.createElement("p");
    if (open) open.remove(); else { about.className = "stack-set-about"; about.textContent = [row[1], rank[1]].filter(Boolean).join(" "); tag.after(about); }
    tag.classList.toggle("on", !open); tag.setAttribute("aria-expanded", String(!open));
  });
  set.prepend(tag);
}

function stackFind(people, games, label, match, leg) {
  const low = label.toLowerCase(), plain = (text) => String(text || "").toLowerCase().replace(/[()+]/g, "").replace(/\bspread\b/g, "").replace(/\s+/g, " ").trim();
  const person = people.filter((row) => row.name && low.startsWith(String(row.name).toLowerCase())).sort((a, b) => b.name.length - a.name.length)[0];
  const game = games.find((row) => row.match === match) || {};
  const live = (person && (person.bets || []).find((row) => String(row.label || "").toLowerCase() === low)) || people.flatMap((row) => row.bets || []).find((row) => row.match === match && plain(row.label) === plain(label));
  const bet = live || { label, odds: Number(leg.odds), market: leg.rung || leg.kind || "", match, sport: game.sport || "", kickoff: game.kickoff || "" };
  return { bet, found: Boolean(live), person: person && label.startsWith(person.name) ? person : null };
}

function stackBuild(stack, tries = 0, title = "") {
  if (typeof parlayLeg === "undefined") return;
  const board = [...document.querySelectorAll(".find-board")].find((node) => node.querySelector(".find-tray"));
  if (!board && window.paintFind && !tries) paintFind();
  if ((!board || !(board.people || []).length) && tries < 40) { setTimeout(() => stackBuild(stack, tries + 1, title), 200); return; }
  const people = (board && board.people) || [];
  const games = (window.state && state.board && state.board.games) || [];
  if (typeof saveLeave === "function") saveLeave();
  window.saveStacksOpen = false;
  const legsOf = (leg) => {
    const label = String(leg.label || ""), match = leg.game || stack.game || "";
    if (leg.kind !== "Parlay") return [stackFind(people, games, label, match, leg)];
    const places = String(match).split(" · "), parts = label.split(" and ").map((part, at) => stackFind(people, games, part, places[at] || match, leg));
    return parts.length > 1 && parts.every((part) => part.found) ? parts : [stackFind(people, games, label, match, leg)];
  };
  const fill = (found) => {
    parlayLeg.clear();
    parlayPick.clear();
    found.forEach(({ bet, person }) => { parlayLeg.set(parlayKey(bet), bet); if (person && parlayPick.size < 8) parlayPick.set(person.key, person); });
  };
  if (stackApart(stack) && typeof saveStore === "function") {
    const group = { id: `g${Date.now()}`, name: title || stackName(stack), briefs: [{ kind: "strategy", about: ((typeof STACKS !== "undefined" && STACKS.find((row) => String(title).endsWith(row[0]))) || [])[1] || "", read: stack.read || "", legs: (stack.bets || []).map(({ label, odds, kind, rung, job, hits, games }) => ({ label, odds, kind, rung, job, hits, games })) }] };
    const made = (stack.bets || []).slice(0, 6).map((leg, at) => { fill(legsOf(leg)); return { id: `p${Date.now()}${at}`, at: Date.now(), legs: [...parlayLeg.values()], picks: [...parlayPick.values()].map(({ bets, ...rest }) => rest), group, stake: Number(leg.stake) || 5, from: Object.fromEntries([...parlayLeg.keys()].map((key) => [key, "Strategies"])) }; });
    fill([]);
    saveStore([...made, ...saveList()]);
    saveOpen(made[0].id);
  } else {
    fill((stack.bets || []).slice(0, 8).flatMap(legsOf));
    if (typeof betFromSay === "function") betFromSay("Strategies", true);
    paintParlay();
  }
  const tray = board && board.querySelector(".find-tray:not([hidden])");
  if (!tray) return;
  const fold = tray.querySelector(".find-fold");
  if (tray.classList.contains("find-shut") && fold) fold.click();
  let box = tray.parentElement;
  while (box && box !== document.body && !(box.scrollHeight > box.clientHeight && /auto|scroll/.test(getComputedStyle(box).overflowY))) box = box.parentElement;
  (box && box !== document.body ? box : window).scrollTo({ top: 0, behavior: "smooth" });
}

STACKS.push(["Same-game yardage parlay", "One ticket. A quarterback, his receiver, and a back, each on a line he clears most weeks, plus the over or a touchdown.", [
  ["Same-game parlay", "Passing yards", "The quarterback's alt line he cleared in 8 of his last 10."],
  ["Same-game parlay", "Receiving yards", "One of his receivers, on a line he clears most weeks."],
  ["Same-game parlay", "Rushing yards", "A back from either team, same test."],
  ["Same-game parlay", "The over or a touchdown", "In only when the history beats FanDuel's price."],
]]);
STACK_RANK["Same-game yardage parlay"] = [31, "Every leg is a line he cleared in 8 of his last 10. FanDuel's same-game price is shorter than the card's, because the legs rise together."];
STACKS.push(["Yardage and the spread", "One ticket. A quarterback, his receiver, and a back, each on a line he clears most weeks, plus his team on a spread it covers most weeks.", [
  ["Same-game parlay", "Passing yards", "The quarterback's alt line he cleared in 8 of his last 10."],
  ["Same-game parlay", "Receiving yards", "One of his receivers, on a line he clears most weeks."],
  ["Same-game parlay", "Rushing yards", "A back from either team, same test."],
  ["Same-game parlay", "The spread", "The quarterback's team, on an alt line it covered in 8 of its last 10."],
]]);
STACK_RANK["Yardage and the spread"] = [32, "Passing yards also come from playing from behind. The spread needs the lead. Take it when the throws and the cover point to the same game."];
STACKS.push(["Two touchdowns, one game", "One ticket. Two players in the same game to score a touchdown, each one scoring more often lately than his price says.", [
  ["Same-game parlay", "Anytime touchdown", "The first scorer."],
  ["Same-game parlay", "Anytime touchdown", "The second scorer. Both have to score."],
]]);
STACK_RANK["Two touchdowns, one game"] = [33, "Each player has scored more often lately than FanDuel's price says. Two from the same team split one team's touchdowns."];
STACKS.push(["Three touchdowns, one game", "One ticket. Three players in the same game to score a touchdown, each one scoring more often lately than his price says.", [
  ["Same-game parlay", "Anytime touchdown", "The first scorer."],
  ["Same-game parlay", "Anytime touchdown", "The second scorer."],
  ["Same-game parlay", "Anytime touchdown", "The third scorer. All three have to score."],
]]);
STACK_RANK["Three touchdowns, one game"] = [34, "Each player has scored more often lately than FanDuel's price says. Three scorers need at least three touchdowns in the game."];
STACKS.push(["Four touchdowns, one game", "One ticket. Four players in the same game to score a touchdown, each one scoring more often lately than his price says.", [
  ["Same-game parlay", "Anytime touchdown", "The first scorer."],
  ["Same-game parlay", "Anytime touchdown", "The second scorer."],
  ["Same-game parlay", "Anytime touchdown", "The third scorer."],
  ["Same-game parlay", "Anytime touchdown", "The fourth scorer. All four have to score."],
]]);
STACK_RANK["Four touchdowns, one game"] = [35, "Each player has scored more often lately than FanDuel's price says. Four scorers need at least four touchdowns in the game."];
STACKS.push(["Five touchdowns, one game", "One ticket. Five players in the same game to score a touchdown, each one scoring more often lately than his price says.", [
  ["Same-game parlay", "Anytime touchdown", "The first scorer."],
  ["Same-game parlay", "Anytime touchdown", "The second scorer."],
  ["Same-game parlay", "Anytime touchdown", "The third scorer."],
  ["Same-game parlay", "Anytime touchdown", "The fourth scorer."],
  ["Same-game parlay", "Anytime touchdown", "The fifth scorer. All five have to score."],
]]);
STACK_RANK["Five touchdowns, one game"] = [36, "Each player has scored more often lately than FanDuel's price says. Five scorers need at least five touchdowns in the game."];
window.STACK_BUILD.push("Same-game yardage parlay", "Yardage and the spread", "Two touchdowns, one game", "Three touchdowns, one game", "Four touchdowns, one game", "Five touchdowns, one game");

[[85, 37, "+59", "$15.88", "63.0%", "-600", "72%"], [90, 38, "+37", "$13.72", "72.9%", "-900", "81%"], [75, 39, "+137", "$23.70", "42.2%", "-300", "56%"]].forEach(([pct, rank, price, back, need, odds, both]) => {
  const name = `Yardage parlay, ${pct}% legs`;
  STACKS.push([name, `One ticket. A quarterback, his receiver, and a back, with at least two of them priced ${pct}% or higher, plus the over or a touchdown.`, [
    ["Same-game parlay", "Passing yards", `The quarterback's alt line he cleared in 8 of his last 10, priced ${pct}% or higher when it can be.`],
    ["Same-game parlay", "Receiving yards", "One of his receivers, same test."],
    ["Same-game parlay", "Rushing yards", "A back from either team, same test."],
    ["Same-game parlay", "The over or a touchdown", "In only when the history beats FanDuel's price."],
  ]]);
  STACK_RANK[name] = [rank, `Two legs at ${pct}% land together about ${both} of the time. The payout comes from the other legs.`];
  STACK_MORE[name] = [
    `The same-game yardage parlay with at least two of the yardage legs priced ${pct}% or higher on FanDuel. Every yardage line is still one the player cleared in at least 8 of his last 10.`,
    `Example: three legs at ${odds} multiply to ${price}. $10 pays back ${back}. One short leg and the $10 is gone.`,
    `${price} needs to cash ${need} of the time.`,
    "The over goes in when both teams' recent games cleared it 8 times in 10. The back's touchdown goes in when his recent scoring beats FanDuel's price. That leg is where most of the payout comes from.",
    "FanDuel's same-game price is shorter than the multiplied price on this card. Build it on FanDuel and take that number.",
  ];
  window.STACK_BUILD.push(name);
});

STACKS.push(["Receptions parlay, 90% legs", "One ticket. A quarterback's passing yards, his receiver's catches, and a back's rushing yards, with at least two of them priced 90% or higher, plus the over or a touchdown.", [
  ["Same-game parlay", "Passing yards", "The quarterback's alt line he cleared in 8 of his last 10, priced 90% or higher when it can be."],
  ["Same-game parlay", "Receptions", "One of his receivers, on 3 or more catches he reached in 8 of his last 10."],
  ["Same-game parlay", "Rushing yards", "A back from either team, same test."],
  ["Same-game parlay", "The over or a touchdown", "In only when the history beats FanDuel's price."],
]]);
STACK_RANK["Receptions parlay, 90% legs"] = [40, "A catch counts the same at 2 yards or 40. The receiver needs the targets, not the big play."];
STACK_MORE["Receptions parlay, 90% legs"] = [
  "ST-38 with the receiver on catches instead of yards. At least two of the legs are priced 90% or higher on FanDuel. Every line is one the player reached in at least 8 of his last 10, and the catch count starts at 3.",
  "Example: three legs at -900 multiply to +37. $10 pays back $13.72. One short leg and the $10 is gone.",
  "+37 needs to cash 72.9% of the time.",
  "The back's touchdown goes in when his recent scoring beats FanDuel's price. That leg is where most of the payout comes from.",
  "FanDuel's same-game price is shorter than the multiplied price on this card. Build it on FanDuel and take that number.",
];
STACKS.push(["Yardage parlay, 3 legs at 90%", "One ticket. A quarterback, his receiver, and a back, all three priced 90% or higher, plus the over or a touchdown.", [
  ["Same-game parlay", "Passing yards", "The quarterback's alt line priced 90% or higher, one he cleared in 8 of his last 10."],
  ["Same-game parlay", "Receiving yards", "One of his receivers, same test."],
  ["Same-game parlay", "Rushing yards", "A back from either team, same test."],
  ["Same-game parlay", "The over or a touchdown", "In only when the history beats FanDuel's price."],
]]);
STACK_RANK["Yardage parlay, 3 legs at 90%"] = [41, "Three legs at 90% land together about 73% of the time. The fourth leg is the payout."];
STACK_MORE["Yardage parlay, 3 legs at 90%"] = [
  "Every yardage leg is priced 90% or higher on FanDuel and is a line the player cleared in at least 8 of his last 10. The fourth leg is the over or the back's touchdown.",
  "Example: three legs at -900 and a touchdown at +105 multiply to +181. $10 pays back $28.12. One short leg and the $10 is gone.",
  "+181 needs to cash 35.6% of the time. The three short legs land together about 73%, so the touchdown has to land about 49% of the time with them.",
  "FanDuel's same-game price is shorter than the multiplied price on this card. Build it on FanDuel and take that number.",
];
STACKS.push(["Yardage parlay, all 4 at 90%", "One ticket. A quarterback, his receiver, a back, and a low over, every leg priced 90% or higher.", [
  ["Same-game parlay", "Passing yards", "The quarterback's alt line priced 90% or higher, one he cleared in 8 of his last 10."],
  ["Same-game parlay", "Receiving yards", "One of his receivers, same test."],
  ["Same-game parlay", "Rushing yards", "A back from either team, same test."],
  ["Same-game parlay", "The over", "A low alt total priced 90% or higher that both teams' recent games cleared 8 times in 10."],
]]);
STACK_RANK["Yardage parlay, all 4 at 90%"] = [42, "Four legs at 90% land together about 66% of the time. +52 needs 65.6%, so every leg has to clear more often than its price."];
STACK_MORE["Yardage parlay, all 4 at 90%"] = [
  "Every leg is priced 90% or higher on FanDuel. The three yardage lines are ones the players cleared in at least 8 of their last 10. The fourth is a low alternate total that both teams' recent games cleared 8 times in 10.",
  "Example: four legs at -900 multiply to +52. $10 pays back $15.24. One short leg and the $10 is gone.",
  "+52 needs to cash 65.6% of the time. Four legs at exactly 90% land together 65.6%, so the profit comes from legs that clear more often than their price.",
  "FanDuel's same-game price is shorter than the multiplied price on this card. Build it on FanDuel and take that number.",
];
window.STACK_BUILD.push("Receptions parlay, 90% legs", "Yardage parlay, 3 legs at 90%", "Yardage parlay, all 4 at 90%");

STACKS.push(["Catches, yards, and a touchdown", "One ticket, three players. A back's catches, a receiver's yards on his main line, and a third player to score.", [
  ["Same-game parlay", "Back receptions", "A back over his catch line, in when his recent games beat FanDuel's price."],
  ["Same-game parlay", "Receiver yards", "A different pass catcher over his main yardage line, same test."],
  ["Same-game parlay", "Anytime touchdown", "A third pass catcher at +150 to +500, scoring more often lately than his price says."],
]]);
STACK_RANK["Catches, yards, and a touchdown"] = [43, "Three different players, so FanDuel's same-game cut is small. The touchdown is the payout."];
STACK_MORE["Catches, yards, and a touchdown"] = [
  "Three legs on three players in one game: a back's receptions, a receiver's yards on his main line, and a third player to score. Each leg is in only when the player's recent games beat FanDuel's price.",
  "Example: a back over 1.5 catches at -138, a receiver over 47.5 yards at -113, and a tight end to score at +300 multiply to +1200. $10 pays back $130.03.",
  "+1200 needs to cash 7.7% of the time.",
  "FanDuel's same-game price on that ticket was +1154, $125.40 back on $10. Three different players move together less than a quarterback and his receiver, so FanDuel took $4.63 off the multiplied payout.",
];
window.STACK_BUILD.push("Catches, yards, and a touchdown");

function stackOrder(board) {
  const sort = window.stackSort || "rank";
  board.querySelectorAll("[data-stack-sort]").forEach((button) => button.classList.toggle("on", button.dataset.stackSort === sort));
  const filters = board.querySelector(".rec-filters");
  if (!filters) return;
  const rank = (block) => (STACK_RANK[block.dataset.name] || [99])[0];
  const no = (block) => Number(String(block.dataset.card || "").replace("stack", "")) || 99;
  const key = { rank: (a, b) => rank(a) - rank(b), st: (a, b) => no(a) - no(b), bets: (a, b) => Number(b.dataset.shown || 0) - Number(a.dataset.shown || 0) || rank(a) - rank(b) }[sort];
  filters.after(...[...board.querySelectorAll(":scope > .rec-strategy")].sort(key));
  const focus = board.querySelector(":scope > .rec-strategy.rec-focus");
  if (focus) filters.after(focus);
}

window.stackMore = stackMore;
window.stackTicket = stackTicket;
window.stackBuild = stackBuild;
window.stackOrder = stackOrder;
window.stackLabel = stackLabel;
