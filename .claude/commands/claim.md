---
description: Notify a loss, log what the insurer did, record what you told the client, settle and close. One claim, its whole history in one place.
---

The operator will say "there has been a fire at Kirkwood", "the assessor has been", "Vero has offered 84k", "tell me about CLM-26004".

**Reading one.** `npm run broking -- claim <number>`. Read the whole history before answering. The last event is rarely the whole story.

**Notifying a loss.**
```
npm run broking -- claim new <policy> "<what happened, where, when, what was damaged>" --loss=YYYY-MM-DD [--reserve=45000] [--excess=2500]
```
Take the description from the client, not from your own summary. The command prints the insurer's claims address and the excess.

**Logging what happened.**
```
npm run broking -- claim event <claim> "insurer acknowledged" ["note"]
npm run broking -- claim event <claim> "assessor appointed"
npm run broking -- claim event <claim> "information requested" "the maintenance record for unit 14"
```
Kinds: notified, insurer acknowledged, assessor appointed, information requested, information sent, client updated, settlement offered, payment made, declined, reopened, closed. Several of them move the claim status on their own.

**Telling the client.** This is the one that keeps the brokerage out of trouble.
```
npm run broking -- claim update <claim> "<exactly what you told them>"
```
The Insurance Brokers Code of Practice, clause 7.1(a), says keep clients informed in a timely manner about the progress of their claim. `claims-open` counts the days since the last update and `/attention` lists anything past a fortnight.

**Finishing.** `claim settle <claim> --amount=` then `claim close <claim>`.

If the insurer declines, log the event and read the policy sections back before you accept it. Clause 7.1(c) of the Code says a broker acts as claims advocate when a claim is unreasonably denied. Offer to draft the challenge to `drafts/`.
