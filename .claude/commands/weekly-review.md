---
description: The Monday review, written from three commands. The cycle, what is stuck, the claims board, and the five things that matter this week.
---

Run these three, in this order, and write the review from what they return. Do not write anything they do not support.

```
npm run broking -- renewals-due --days=60
npm run broking -- attention
npm run broking -- claims-open
```

Then write it in this shape, no more than a page:

1. **The week in one line.** Premium expiring inside thirty days, how much of it has been touched, and how much has not.
2. **The cycle.** Counts by band: expired, fourteen, thirty, sixty. Name every policy in the fourteen day band with no client contact. This is the section a principal reads first, because it is the one the Code is written about.
3. **The market.** Quotes owed to us, by insurer, with the days late. One line on any market that is consistently slow.
4. **Claims.** Open count, total reserved, and every claim where the client has not been told anything for a fortnight, named.
5. **The file.** Placements with no advice record, advice with no remuneration disclosure, endorsements the insurer has not confirmed, complaints past thirty days. Each with a count and the worst one named.
6. **Brokerage.** Earned this month against last, and anything accrued past sixty days.
7. **The five things to do this week.** Pick them yourself from the attention list weighted by premium at risk, and say why each one made the list.
8. **One thing to decide.** The single item that needs a person, not a process.

Add `npm run view -- week` and `npm run view -- renewals` if the operator wants pages to send on. They render the same numbers in the brokerage's brand.

Numbers come from the commands. If a number is not in the output, do not put it in the review.
