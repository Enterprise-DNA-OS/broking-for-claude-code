---
description: Draft the claim progress update for the client, written from the claim history. Saved to drafts/. Never sends anything.
---

The operator will name a claim or a client ("update Fiona on the water damage claim").

1. `npm run broking -- claim <number>`. Read every event, oldest to newest, before writing a word.
2. Write it to `drafts/claim-<claim-no>-<date>.md` in this shape:
   - **Where it is.** Status in plain words, not the status field. "The assessor has been and we are waiting on their report" beats "assessing".
   - **What has happened since we last wrote.** Take the events after the last `client updated` event. If there are none, say that honestly: the position has not moved and here is who we are chasing.
   - **What we are waiting on and from whom.** Name the insurer and the person if the record has one.
   - **What we need from you.** Only what an event or an open task actually asks for.
   - **What happens next and when.** A date, not "in due course".
3. Never state a settlement figure that is not in the record, and never predict an outcome. If the reserve is an estimate, call it an estimate.
4. Print the path. Do not send it. A person sends it.
5. After the operator sends it, log it: `npm run broking -- claim update <claim> "<what you told them>"`. That is what clears it off the attention list and evidences clause 7.1(a) of the Insurance Brokers Code of Practice.

For every open claim at once, `npm run docs -- claim-status-update` renders the branded version in the brokerage's colours.
