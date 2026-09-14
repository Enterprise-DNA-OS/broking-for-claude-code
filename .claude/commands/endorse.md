---
description: A mid term change. Instruct it, track it, and confirm it when the insurer writes back. An unconfirmed endorsement is cover the client thinks they have.
---

The operator will say "add the new site", "put the bank on as mortgagee", "they bought two more utes", "the sum insured needs to go up".

1. Find the policy first: `npm run broking -- policy <number>`. Read the sections so the change is described against the right one.
2. Instruct it:
```
npm run broking -- endorse <policy> "<exactly what changed, in the client's words>" --effective=YYYY-MM-DD [--kind="add cover"] [--premium=420]
```
Kinds: add cover, remove cover, increase sum insured, decrease sum insured, change of address, vehicle change, interested party, cancellation.

3. Say the sentence that matters out loud: **the change is not on risk until the insurer confirms it.** Give the operator the confirm command and the date it becomes urgent.
4. When the insurer writes back:
```
npm run broking -- endorse confirm <number> --ref="<insurer reference>"
```
That accrues the brokerage adjustment as well.

5. `npm run broking -- endorsements` is the list of everything waiting. Anything over seven days gets named individually with the underwriter to chase.
6. If the effective date has passed and the endorsement is still unconfirmed, that is the top of the attention list, not a housekeeping item. Say so.
