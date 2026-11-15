# What one Paste a bet costs

November 15, 2026. These figures are arithmetic from Google's published Gemini 3.8 Flash rates and from the token limits in the paste code. They are not a bill. This Mac has no Gemini key, so a paste here does not call Google and costs $0. The dollars below are the hosted site, where the computer is not a Mac and the picture goes to `gemini-3.8-flash`.

## One paste

A normal paste on the host is one request. The picture is one image. Google's model page sets the default image at 1,120 tokens. The instructions in the code are about 300 tokens. Together that input is $0.0011 at the paid rate through December 31, 2026.

The reply is billed on top, and thinking tokens are billed as output. The paste call does not set a thinking level, so Gemini 3.8 Flash uses its default, medium. A four-leg slip written out as the JSON the code asks for is about 200 tokens, which is $0.0008. That paste, with no extra thinking, is about $0.0018, or 0.2 cents.

The first call tells Google to stop at 8,192 output tokens. At $3.75 per million output tokens, filling that allowance costs $0.031. Add the picture and the instructions and the first call tops out at about 3.2 cents. A live paste on this key has not been metered, so the amount between 0.2 cents and 3.2 cents is whatever medium thinking uses on that screenshot. It is not a third number I can honestly print.

| Piece of one paste | Tokens | Through Dec 31, 2026 | From Jan 1, 2027 |
| --- | ---: | ---: | ---: |
| The picture | 1,120 | $0.00084 | $0.00168 |
| The instructions | about 300 | $0.00023 | $0.00045 |
| A four-leg reply, before extra thinking | about 200 | $0.00076 | $0.00151 |
| That short paste, picture plus reply |  | $0.0018 | $0.0036 |
| First call if it uses the whole 8,192 output tokens |  | $0.032 | $0.064 |

The rates are $0.75 per million input tokens and $3.75 per million output tokens through December 31, 2026. Both double on January 1, 2027. The free tier of the same model is listed as free of charge. A second call happens only when the first reply comes back empty. That second call does not set the 8,192 limit. The model allows 65,536 output tokens, which would be about $0.25 if a retry used the whole allowance. That is the hole in the ceiling, and it is not the normal paste.

## The account is Tier 1

Checked November 15, 2026, in Google AI Studio, project Default Gemini Project. The rate-limit page says Tier 1. Billing is on. This is the paid tier, so the free-tier price of $0 does not apply, and Google's pricing table says prompts on the paid tier are not used to improve its products.

Gemini 3.8 Flash on this project, category "Text-out models":

| Limit | What this project allows | Peak in the last 28 days |
| --- | ---: | ---: |
| Requests per minute | 1,000 | 4 |
| Input tokens per minute | 2,000,000 | 3,750 |
| Requests per day | 10,000 | 28 |

Search grounding for Gemini 3.1 and newer peaked at 28 requests in a day. The cap on that row is 1,500 a day. The usage page for the same 28 days shows a 100% success rate and no errors. The busiest days are about 30 requests. Input tokens on a busy day reach about 30,000. Output tokens reach about 20,000.

The bill for the whole Gemini API on this account, every model and every call, not paste by itself:

| Month | Total cost |
| --- | ---: |
| September 2026 | $24.20 |
| October 2026 | $24.02 |
| November 1–15, 2026 | $0.55 |

November's daily bars stay under about $0.10. Google says those costs can take a few hours to show, and sometimes longer than 24 hours. The same page is where to look again: [aistudio.google.com/rate-limit](https://aistudio.google.com/rate-limit) for the tier, and the billing page for the dollars. Tier 1 also carries a published spend cap of $250 a month and $10 every 10 minutes. Tier 2 raises the 10-minute limit to $200 after $100 has been paid and 3 days have passed.

## A thousand people

The count below is 1,000 people each pasting on the hosted site. Once a week is 4 pastes a month. Once a day is 30. Five times a day is 150. Each figure is one call, so a failed first read is extra.

| How often each person pastes | Pastes in a month | If each stays near 0.2 cents | If each first call hits 3.2 cents |
| --- | ---: | ---: | ---: |
| Once a week | 4,000 | $7 | $127 |
| Once a day | 30,000 | $55 | $954 |
| Five times a day | 150,000 | $273 | $4,768 |

The business-model note puts 1,000 paying subscribers at about $20,990 a month before expenses, on a mix of Rookie, Pro, and VIP. A daily paste at the 3.2 cent cap is $954 of that, about $0.95 of a $19.99 Pro month. A short daily paste is about $0.06 of that month. Five pastes a day at the cap is about $4.77, close to a quarter of Pro.

Set aside $1 a member per month and a daily paste is covered even at the cap. Five pastes a day at the cap is the point to limit how often Paste a bet runs, rather than to add that quarter onto every tier. The $200 line for AI, hosting, and data in the 100-subscriber example covers 100 people pasting daily at the cap, which is about $96, and leaves the rest of that $200 for hosting. It does not cover 1,000 people at the cap.

This Tier 1 project allows 10,000 Gemini 3.8 Flash requests a day and 1,000 a minute. One paste from each of 1,000 people is 1,000 requests, a tenth of the day. Ten pastes each is the whole day. They can all paste in the same minute once. A second thousand in that same minute is refused until the minute turns over. The $10 spend limit every 10 minutes still sits under the request cap if a paste runs to the 3.2 cent stop: about 300 of those full-size calls is $10. At the 0.2 cent end, the 1,000-a-minute request cap arrives first. The last 28 days never left the bottom of those charts.

## The parrot is a separate call

Ask Parlay the Parrot, on the hosted site, is another Gemini 3.8 Flash request. That call caps the reply at 640 tokens and can turn on Google Search. Search includes 5,000 requests a month across Gemini 3 models, then $14 per 1,000, with a daily cap of 1,500. The rate-limit page already shows that tool in use, 28 requests on the busiest day of the last 28, against the 1,500. Those dollars are inside the monthly bill above, and they are not in the paste table.

## Sources

Checked November 15, 2026. Gemini API pricing for `gemini-3.8-flash`. Gemini 3.8 Flash model page, default image resolution 1,120 tokens, default thinking level medium, maximum output 65,536 tokens. The tier, the 1,000 / 2,000,000 / 10,000 limits, the 28-day peaks, and the September, October, and November bills are from the Google AI Studio rate-limit, usage, and billing pages for Default Gemini Project, read the same day. The paste request is `readShot` in `slip-api.js`, called from `howsPost` in `hows-api.js`. The first call sets `maxOutputTokens` to 8,192. The retry does not.
