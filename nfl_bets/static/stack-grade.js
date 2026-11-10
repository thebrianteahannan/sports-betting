/** How well each parlay strategy is known to work, with its pros and cons. The order here is the rank. */

const STACK_TIER = {
  edge: ["Known edge", "#3dff6e"],
  risk: ["Risk control", "#6ec1ff"],
  pick: ["Needs a good pick", "#ffe14a"],
  lose: ["Known to lose", "#ff4d4d"],
};

const STACK_GRADE = {
  "Low-hold shopping": ["edge", "The most reliable edge in betting. Sharp bettors do this first.",
    ["Works on every bet you already make.", "-105 needs 51.2% to break even. -115 needs 53.5%. The same pick wins more money."],
    ["It takes accounts at two or more books. In Florida, Hard Rock is the only one.", "The gap is a few cents a bet. It adds up over hundreds of bets, not one night."]],
  "Arbitrage": ["edge", "A locked profit when both tickets go through. Books know it and fight it.",
    ["Both payouts match, so the score does not matter.", "The profit is set before kickoff."],
    ["It takes two books. In Florida, Hard Rock is the only one.", "Gaps are usually 1% to 3%. $100 in play makes $1 to $3.", "Books cut the stakes on accounts that arb."]],
  "Key-number middle": ["edge", "Known to pay when the line has moved across 3 and the juice is short.",
    ["NFL games land on exactly 3 about 15% of the time. At -125 a side, break-even is 11.1%.", "A miss costs $1 on $10 in play. A hit pays $8."],
    ["The line has to move after you bet. Most weeks it does not cross 3.", "At -200 a side, break-even jumps to 33%."]],
  "Live middle": ["edge", "Known to pay when a game swings the live number past your ticket.",
    ["A 7-point gap at -110 a side breaks even under 5%.", "The first ticket is already placed. The live side is a choice."],
    ["It needs a fast start or a big swing. Most games never open the gap.", "Live prices move in seconds, and this desk reads the pre-game board."]],
  "Wong teaser": ["edge", "The best-known teaser edge in NFL betting. Books raised the price to shrink it.",
    ["Both legs cross 3 and 7, the two margins NFL games land on most.", "A clear rule for which games qualify."],
    ["At -120 each leg has to hold 73.9% of the time. At -130 it is 75.2%.", "Only NFL sides qualify, and only a few games a week."]],
  "Kelly": ["risk", "The known best stake size when your edge is real. It does not make an edge.",
    ["It grows the bankroll fastest over many bets.", "A 55% side at even money is 10% at full Kelly, 5% at half."],
    ["It assumes your 55% is real. Guess high and it overbets.", "Full Kelly swings hard. Most who use it bet half or less."]],
  "Flat stake": ["risk", "The standard way to keep a bankroll alive. It does not change the price.",
    ["$5 stays $5, so one bad night costs one bet.", "The record shows whether the picks are good, not whether the stakes got lucky."],
    ["A losing pick at $5 is still a loss.", "A real edge grows slower than with Kelly."]],
  "Hedge": ["risk", "A sound way to lock a result you want. It costs the juice on the second ticket.",
    ["Turns a maybe into a set number.", "You choose the number you keep."],
    ["The second ticket pays the book's cut. At -110 that is about 4.5 cents a dollar.", "It gives up the full win the first ticket was worth."]],
  "Parlay hedge": ["risk", "Worth it when the last leg is plus money. Expensive when it is a big favorite.",
    ["Locks a profit on a parlay that is one leg away.", "A plus-money last leg makes the other side cheap."],
    ["A -300 last leg means the hedge eats most of the payout.", "It pays juice to give up the long-shot payout."]],
  "Future hedge": ["risk", "A sound way to lock a season-long ticket. The hedge price decides if it is worth it.",
    ["Turns a March long shot into a sure profit.", "The future already gained value. The hedge cashes some of it."],
    ["The hedge side pays juice.", "You give up the full future payout."]],
  "If-bet": ["risk", "A fair way to cut what is at risk. The price is the same as two singles.",
    ["Only the first ticket is at risk. A loss stops the chain.", "A win rolls into the second ticket without new money."],
    ["Each ticket still pays the book's cut.", "A first loss cancels the second bet, even if it would have won."]],
  "Paroli": ["risk", "A safe way to press a streak. It does not change the odds.",
    ["A loss costs one unit, never more.", "Three wins at even money turn one unit into eight."],
    ["Three straight coin flips land 1 time in 8.", "The picks still have to beat the price."]],
  "1-3-2-6": ["risk", "Paroli with a lock after two wins. It does not change the odds.",
    ["Two wins lock a profit even if the third loses.", "A first loss costs one unit."],
    ["A loss on the second bet costs 2 units.", "The picks still have to beat the price."]],
  "Reverse": ["risk", "Two if-bets in both orders. More at risk than one if-bet.",
    ["Either opener can start the chain.", "Both orders pay when both win."],
    ["Two units up front.", "Each leg pays the book's cut twice."]],
  "Buying the hook": ["pick", "Pays only on 3 and 7 in the NFL, and only when the book charges little for it.",
    ["Turns a push on exactly 3 into a win.", "NFL games land on 3 about 15% of the time."],
    ["Many books charge 20 cents or more for the half point. That often costs more than it gains.", "On 4, 5, 6, 8, and 9 the half point is rarely worth the juice."]],
  "Correlated stack": ["pick", "A real idea, mostly priced out. FanDuel's same-game price already counts the link.",
    ["One script, one opinion. When the script hits, every leg hits.", "Legs that rise together cash together more often than separate games."],
    ["The same-game price is shorter than the multiplied one.", "When the script misses, every leg misses."]],
  "Classic middle": ["pick", "Pays when two books disagree on the number. On one book's alt lines the gap is already priced in.",
    ["A hit wins both tickets.", "A miss costs only the juice."],
    ["An 8-point gap at -140 a side has to land inside 16.7% of the time.", "Alt lines charge more as the gap widens."]],
  "Side and the total": ["pick", "Good reasoning, not a known edge. It pays when the game script beats the price.",
    ["A favorite and the under can be the same game.", "It stops two tickets that need opposite games."],
    ["The book prices that link into the same-game ticket.", "One wrong read on the script loses both."]],
  "Player and the total": ["pick", "A check, not an edge. It stops you from stacking tickets that need different games.",
    ["Catches a receiver over paired with a game under.", "Picks the total that gives the player his plays."],
    ["Same-game prices already move with the link.", "The player and the game both have to beat their prices."]],
  "Prop ladder": ["pick", "Pays when the player clears the top rung more often than its price. Alt lines carry a bigger cut.",
    ["One big night pays every rung.", "The bottom rung softens a middling night."],
    ["Alt lines carry more juice than the main line.", "A short night loses all three tickets, $27 in the example."]],
  "Overlapping under": ["pick", "A ladder for quiet nights. The tight under has to land more often than its price.",
    ["A very quiet night pays both.", "The higher under covers the tight one in the gap."],
    ["Alt unders carry a bigger cut.", "A big night loses both."]],
  "Two touchdowns, one game": ["pick", "Pays when both scorers beat their prices. Two legs keep the same-game cut small.",
    ["Two legs, the fewest a same-game ticket takes.", "Each player has scored more lately than his price says."],
    ["Anytime prices carry one of the bigger cuts on the board.", "Two from the same team split that team's touchdowns."]],
  "Catches, yards, and a touchdown": ["pick", "Three different players, so the same-game cut is small. The touchdown is the payout.",
    ["Players who move together less get a price close to the multiplied one.", "A catches line asks for targets, not a big play."],
    ["Any one miss loses it.", "The touchdown leg is the long shot."]],
  "Same-game yardage parlay": ["pick", "Every leg is a line he clears most weeks. The same-game price shrinks the payout.",
    ["Every leg cleared in 8 of his last 10.", "One game, one script."],
    ["FanDuel's same-game price is shorter than the card's.", "Four legs give the book four cuts."]],
  "Yardage and the spread": ["pick", "Pays when the throws and the cover point to the same game.",
    ["The spread adds payout to short yardage prices."],
    ["Passing yards also come from playing from behind. That sinks the spread.", "Four legs give the book four cuts."]],
  "Yardage parlay, all 4 at 90%": ["pick", "The safest-looking ticket here. +52 needs 65.6%, so every leg has to beat its price.",
    ["Four legs at 90% land together about 66% of the time."],
    ["A $5 win is $2.60. One miss erases about two wins.", "Each 90% price already has the book's cut in it."]],
  "Yardage parlay, 3 legs at 90%": ["pick", "Three short legs carry the ticket. The fourth leg is the payout.",
    ["Three legs at 90% land together about 73% of the time."],
    ["The fourth leg decides it most nights.", "Four legs give the book four cuts."]],
  "Yardage parlay, 90% legs": ["pick", "Two short legs rarely miss together. The other legs decide it.",
    ["Two legs at 90% land together about 81% of the time."],
    ["The payout leg is the long shot.", "Four legs give the book four cuts."]],
  "Receptions parlay, 90% legs": ["pick", "A catch counts the same at 2 yards or 40, so the receiver needs targets, not a big play.",
    ["A short catch still counts.", "Two legs at 90% land together about 81% of the time."],
    ["A run-heavy game cuts his targets.", "Four legs give the book four cuts."]],
  "Yardage parlay, 85% legs": ["pick", "Two short legs rarely miss together. The other legs decide it.",
    ["Two legs at 85% land together about 72% of the time."],
    ["The payout leg is the long shot.", "Four legs give the book four cuts."]],
  "Yardage parlay, 75% legs": ["pick", "A longer price. The short legs miss together more often.",
    ["Two legs at 75% land together about 56% of the time.", "A bigger payout than the 85% and 90% versions."],
    ["Nearly half the time one short leg already lost it.", "Four legs give the book four cuts."]],
  "Dutching": ["pick", "Fair math, not an edge. It wins only when the set is underpriced.",
    ["Every winner in the set pays the same profit."],
    ["One book's prices usually add up to more than 100%.", "A winner outside the set loses every ticket."]],
  "Round robin": ["pick", "Softer than one big parlay, but every pair is its own parlay with its own cut.",
    ["One miss leaves the other pair alive.", "Three hits pays all three."],
    ["A 2-leg parlay at -110 gives the book about 8.9 cents a dollar, double a single.", "One miss kills two of three tickets."]],
  "First touchdown and anytime": ["pick", "First-touchdown boards carry one of the biggest cuts on the menu.",
    ["A first score pays both tickets.", "The anytime softens a later score."],
    ["The first-touchdown prices add up well past 100%.", "If he does not score, both lose."]],
  "Three touchdowns, one game": ["pick", "Each scorer has to beat his price, and the game needs three touchdowns.",
    ["Each player has scored more lately than his price says."],
    ["Three anytime prices, three cuts.", "Scorers on one team split that team's touchdowns."]],
  "Teaser": ["lose", "Known to lose unless it crosses 3 and 7. That version is the Wong teaser.",
    ["Both numbers move 6 points your way."],
    ["At -120 each leg has to hold 73.9% of the time.", "Points that do not cross 3 or 7 add few wins."]],
  "Four touchdowns, one game": ["lose", "Each extra leg adds the book's cut. At four scorers the cut outruns the picks.",
    ["A small stake pays a big number."],
    ["Four anytime prices, four cuts.", "The game needs four touchdowns, and teammates split them."]],
  "Five touchdowns, one game": ["lose", "The longest ticket on the page. +3984 needs to cash 2.4% of the time.",
    ["$10 pays back $408 when it hits."],
    ["Five anytime prices, five cuts.", "One scorer kept out of the end zone loses it."]],
  "Cash-out": ["lose", "Known to cost money. The buyback price keeps extra juice for the book.",
    ["One tap ends the sweat."],
    ["A hedge you place yourself usually pays more.", "The offer is the book's number, not the market's."]],
  "Pleaser": ["lose", "Known to lose. You sell 3 and 7 for a longer price.",
    ["A long price on two favorites."],
    ["Each leg moves 6 points the wrong way, across the margins NFL games land on most.", "It needs two blowouts."]],
  "Oscar's grind": ["lose", "A slow progression. It does not change the odds, and a long losing run is hard to climb out of.",
    ["A finished series is up one unit.", "Stakes rise slower than Martingale."],
    ["A losing run piles up units you win back one at a time.", "Every bet still pays the book's cut."]],
  "Fibonacci": ["lose", "Known to lose. Chasing losses slower is still chasing.",
    ["Climbs slower than doubling."],
    ["Ten losses in a row on a $5 start is $715 down, and the next stake is $445.", "Every bet still pays the book's cut."]],
  "Martingale": ["lose", "The best-known losing system. Over enough bets, the long losing streak shows up.",
    ["Most series end up one unit."],
    ["Ten losses in a row on a $5 start asks for $5,120.", "Books cap the stake before that bet."]],
};

// One score out of 10 per strategy, in the same order as STACK_GRADE.
const STACK_SCORE = [9.5, 9, 8.5, 8, 7.5, 7, 7, 6, 6, 5.5, 5.5, 5, 5, 4.5, 4.5, 4.5, 4.5, 4, 4, 4, 3.5, 3.5, 3.5, 3.5, 3, 3, 3, 3, 3, 2.5, 2.5, 2.5, 2.5, 2, 2, 1.5, 1.5, 1, 1, 1, 1, 0.5, 0.5];

Object.keys(STACK_GRADE).forEach((name, at) => { if (STACK_RANK[name]) STACK_RANK[name][0] = at + 1; STACK_GRADE[name].score = STACK_SCORE[at]; });

function stackGrade(block, name) {
  const grade = STACK_GRADE[name];
  if (!grade || block.querySelector(".stack-grade")) return;
  const [tier, say, pros, cons] = grade;
  const [label, color] = STACK_TIER[tier];
  const tag = document.createElement("span");
  tag.className = "stack-grade-tag";
  tag.textContent = label;
  tag.style.color = color;
  tag.style.borderColor = color;
  const score = document.createElement("span");
  score.className = "stack-score";
  score.title = `Rated ${grade.score} out of 10`;
  score.innerHTML = `<i><i style="width: ${grade.score * 10}%; background: ${color}"></i></i><b style="color: ${color}">${grade.score.toFixed(1)}</b>/10`;
  const no = block.querySelector("h3 .rec-no");
  if (no) no.after(score, tag);
  const box = document.createElement("div");
  box.className = "stack-grade";
  box.style.borderLeftColor = color;
  const lead = document.createElement("p");
  lead.textContent = say;
  box.append(lead);
  [["Pros", pros], ["Cons", cons]].forEach(([head, items]) => {
    const title = document.createElement("b");
    title.textContent = head;
    const list = document.createElement("ul");
    items.forEach((text) => { const item = document.createElement("li"); item.textContent = text; list.append(item); });
    box.append(title, list);
  });
  box.addEventListener("click", (event) => event.stopPropagation());
  const history = block.querySelector(":scope > .rec-history");
  if (history) history.after(box); else block.append(box);
}

window.stackGrade = stackGrade;
