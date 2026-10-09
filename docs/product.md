# What the desk does

The betting desk is a FanDuel price board. It reads public FanDuel prices, builds a few parlays, and keeps a record of what those tickets did. It is for adults 21 and older. The footer tells the reader to call 1-800-GAMBLER.

A Mac pulls FanDuel about every 10 minutes and grades finished legs from ESPN box scores. Supabase holds the public board, the archive, and saved picks. The Hostinger site serves the pages and reads that store. The desk does not have a FanDuel login and does not send a bet.

## What it does today

**Today's bets.** The page leads with Today's Best Bet and Bet of the Week, then the strategy cards: Near −180, Four at 85% each, Safest near +250, and Which stack hits more. Each card shows the Eastern date and time, the legs, the implied price, and what a $5 bet would win at the multiplied price. A same-game parlay can price differently on FanDuel's own button because the legs are correlated.

**Live counts.** While a game is on, a graded prop shows the current count, such as "46 of 200 passing yards." A won leg gets a green check. A lost leg gets a red X. A leg that is still open gets a gold circle.

**Build a bet.** Its own tab. The reader picks leagues, a prop type, 2 to 4 legs, and a game or the best game in that pick. The desk returns the shortest FanDuel player-prop parlay that fits. It skips yes/no markets, "combine" markets, and team spreads unless the reader is on the strategy cards.

**Swipe.** The current cards are offered one at a time. Swipe right or press Like to keep a suggestion. Swipe left or press Pass to skip it. Undo puts the last card back. Likes and passes stay in that browser. A like does not place a bet.

**Stars.** A ticket can be rated 1 to 5. A bet that was already marked good shows as 1 star until the rating is changed. Tapping the filled star again clears it.

**Open, Wins, and Losses.** Every offered ticket is archived. Open bets can be filtered by league, card, leg count, live or not started, a leg already won, prop type, and game. Exact means every leg fits the league or prop, not just one leg. Matching legs are marked in gold. Losses include a note on the miss and a short list of patterns seen so far, including college receiving yards, lines that finished well short, lines that finished one short, and parlays killed by one miss.

**Price history.** Each card can be opened to see earlier versions of that same card since it was first offered.

## What it does not do

- It does not place, send, or cash a bet.
- It does not log into FanDuel or hold a reader's sportsbook balance.
- It does not guarantee a win, a profit, or a hedge with no way to lose.
- It does not call a ticket a lock or a 100% play.
- It does not take subscription payments or show ads. A free membership is required to open the board. That membership stores the name, email, password hash, star ratings, and saved picks. Payments come later.
- It does not compare prices across sportsbooks. The book on the board is FanDuel.
- It does not settle every line. Halves, quarters, drives, and some spreads stay open when the box score does not decide them. There is no Won, Lost, or Push button. Nothing on the card is settled by hand.
- It does not invent a reason a leg lost beyond the count versus the line.

## Where it is

The working board is the Mac desk and the Hostinger site, which updates when `main` is pushed. A public domain can point at that site. The app does not store its own web address in Supabase, so a domain change does not require a database edit.

As of October 9, 2026 the archive has 420 tickets: 83 wins, 219 losses, and 118 still open. The win rate on decided tickets is 27.5%.

## What it is for next

The intended product is still a price desk, not a sportsbook. The near-term job is to keep the board honest: current FanDuel prices, a full record, and filters so a reader can narrow the open tickets.

Every account is a free membership for now. Signing in opens the board and keeps that person's star ratings and saved picks. A paid membership is only a later step, and only if the page keeps showing the real record, including losses. The intended offer is access to the daily board, player-prop parlays, the build tool, and the graded history. It is not a promise that the picks will win.

The desk stays 21+. It is not a product for minors, and it is not a partnership, a marketing job, or a payday for anyone under 21. A later paid account asks for a date of birth and refuses the account when the person is under 21. The free membership does not ask that yet.

Before a charge, the site still needs terms of service, a privacy policy, a refund and cancellation policy, and a line that past results do not promise future results. The page already says 21+ and 1-800-GAMBLER. A card processor has to be told what the product is. A refusal is a stop. Card numbers stay with the processor.
