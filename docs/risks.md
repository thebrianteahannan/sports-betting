# Risks and what to do about them

This is a FanDuel price desk that may later charge for access. It is not a casino and it does not send bets. These are the risks that matter for this kind of project, and the practical response to each. This is not legal advice. A lawyer licensed in the states where the site is offered should review a paid launch.

## The record can be sold as something it is not

Decided tickets are 83 wins and 219 losses, which is 27.5%. Many of those tickets are short-priced parlays. A −180 price needs about a 64% hit rate to break even before vig on a single bet. A 27.5% parlay record is not evidence of profit.

**Response.** Publish the full record on the same page as the picks: wins, losses, and the sample size. Do not say "locks," "guaranteed," "consistent value," or "reliable profit." Do not hide the losses tab. Say that FanDuel's same-game button can differ from the multiplied price.

## Readers can treat the board as a sportsbook

The cards show American odds and a $5 win figure. Someone can think the site took their bet.

**Response.** Keep the line that is already on the page: the desk does not send bets, and a reader who wants the ticket types it into their own FanDuel account. Do not add a deposit, a wallet, or a place-bet button.

## Age

Sports betting content is for adults. Offering the board, a subscription, or a marketing role to a minor creates its own legal and practical problem.

**Response.** Keep the 21+ line and 1-800-GAMBLER. Do not sign up, pay, or partner with anyone under 21. If the site later has accounts, check age before showing the board or taking money.

## Selling picks is regulated differently from running a book

Not taking bets does not mean a paid picks list is unrestricted. Some states limit tipster services, require registration, or treat paid predictions as gambling advertising.

**Response.** Before charging money, list the states the site will accept and have a lawyer check those rules. Until that review is done, do not take subscription payments. Do not buy ads that promise winnings.

## One sportsbook and one box-score source

Prices come from FanDuel's public pages. Results come from ESPN. If either source changes, blocks the pull, or lags, the board can be stale or wrong. A half, a quarter, a drive, or an ungraded spread can sit open after the game is over.

**Response.** Show the time of the last FanDuel pull on the card. Leave a line open when the box score does not settle it, which the desk already does. Do not fill that gap with a hand-entered result. When a pull fails, keep the last board and show that it is old rather than inventing prices.

## The archive can be wrong in public

The Mac grader and the website both write the archive. A stale write can drop a new ticket. A bad label can hide what the leg is, the way "Chelsea Gray" once omitted "1+ made threes."

**Response.** Keep the merge that refuses to drop a ticket the file already has. Name the player, the number, and the unit on every leg. Check a new card in the browser before treating the board as current.

## Money and trust, if a subscription starts

The screenshot math assumes people stay subscribed and that the picks are worth paying for. Churn, refunds, and ad cost can erase a $19.99 price. A public losing streak will produce refund demands.

**Response.** Do not forecast profit from member counts alone. Publish the record before the paywall. Keep a written refund rule. Separate operating cash from personal cash so upfront spend can be counted later. Do not spend subscription money as if the member count in a pitch is already real.

## Domain and hosting

Hostinger can warn that a domain change must be edited inside a site database. This desk does not store its address there. Supabase stores the board, the archive, and picks.

**Response.** Point the domain at the existing Node app. Open the new address and confirm `/api/board` loads. No database edit is required for the domain itself. Keep the Supabase keys in the host's environment, not in git.

## A hedge is not a locked profit

At −110 against −110, $1 on each side locks about a 9 cent loss. A parlay multiplies the vig. Both results profit only when two prices overlap, which FanDuel rarely offers.

**Response.** Keep the hedge, if it is shown, as a picture of that locked loss. Do not describe a hedge or a parlay as a way to get paid either way.

## Everyone betting the same card

Books limit accounts that all bet the same number. One daily slip that every member is told to hammer is a different product from a board with a record.

**Response.** Sell the cards and the graded record. Do not tell every member to place the same ticket.

## A model is not an edge

ESPN's public matchup predictor, and a price a few cents off, are reasons to read a number. They are not a measured edge over the vig.

**Response.** Keep the predictor labeled as ESPN's public model. Do not tell a reader that a flag means the book is wrong. Compare a paper record with 52.4% before anyone says a single −110 price is ahead of the vig. The parlay record is a separate number, and it is 27.5%.

## A processor can refuse the charge

Stripe and other processors often refuse gambling, and some refuse gambling advice. Describing the product as something else to get the charge through is its own problem.

**Response.** Tell the processor what the page is. If the application is refused, do not charge. Card numbers stay with the processor.

## FanDuel's name and data

The board says "FanDuel prices" because that is the source. The site is not FanDuel. Using their brand as if this were their product, or reselling their feed beyond what their terms allow, is a separate risk from the picks.

**Response.** Keep the wording as a price source. Do not put FanDuel in the domain. Do not imply the site is official or that a card was placed at FanDuel.
