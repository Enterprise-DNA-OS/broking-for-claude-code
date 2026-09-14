---
description: Brokerage earned by month, by insurer and by client, and how much of it has never been reconciled against an insurer statement.
---

This is the earnings ledger. It is not the trust account and it never holds client money. Say that if the operator asks it to reconcile premium.

1. `npm run broking -- commissions` for the month by month view, or `commissions --month=2026-08` for the detail behind one month.
2. Lead with three numbers: brokerage earned this month, brokerage earned in the last twelve months, and how much has been sitting accrued for more than sixty days.
3. Anything accrued past sixty days is money the insurer has probably already paid and nobody has matched. List those with the insurer and the policy so the operator can pull the statement.
4. When the operator has matched a statement:
   - `npm run broking -- commission invoice <policy> --ref="<statement reference>"`
   - `npm run broking -- commission receive <policy>`
5. Questions worth answering without being asked, because the vendor dashboard cannot:
   - which insurer takes longest between binding and paying
   - what a class of business earns per hour of the renewal work behind it
   - which clients earn less brokerage than the claims work they generate
   - what the book earns at the current rates against what it would earn if every rate matched the agency agreement

Never quote a brokerage figure the ledger does not hold. If the rate on a policy differs from the insurer's default, say so rather than averaging it away.
