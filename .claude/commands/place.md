---
description: Bind an accepted quote into a policy. Creates the policy period, closes the renewal, marks the expiring policy renewed, accrues the brokerage.
---

The operator will say "bind it", "we are on cover with Ando", or "place the Coastal Storage renewal".

1. Read the quote first: `npm run broking -- quote <ref>`. Confirm the premium, the excess and the terms out loud before you bind anything.
2. Get the policy number the insurer issued. Do not invent one. If the operator does not have it yet, add a task and stop.
3. Bind it:
```
npm run broking -- place <quote-ref> --policy-no="<insurer's policy number>" [--inception=YYYY-MM-DD] [--expiry=YYYY-MM-DD] [--brokerage=17.5] [--fee=250]
```
Inception defaults to the day the expiring policy ends. Expiry defaults to twelve months later.

4. The command does five things. Say which ones happened:
   - creates the new policy period, in force, linked back to the one it replaces
   - marks the expiring policy renewed
   - closes the renewal at stage bound
   - marks the other quotes on that renewal lost
   - accrues the brokerage and any broker fee to this month
5. If there is no advice record for the client in the last thirty days, the command says so. Write it before you move on: `/advice-record`. A placement with no advice record is the first thing a reviewer finds.
6. Confirm the sections carry over. `place` copies the summary, not the sections. If the cover changed, add the sections to the new policy.

Never bind on a verbal from the underwriter alone. The insurer reference goes in with `--insurer-ref=`.
