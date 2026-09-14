---
description: One policy in full: sections and limits, the premium build, the renewal, quotes in the market, endorsements, claims, advice records and brokerage.
---

1. Run `npm run broking -- policy <number>`. A policy number, an insurer reference or a client name all resolve.
2. Read the sections before you answer anything about cover. A limit is what the covers table says it is, not what the class implies.
3. When the operator asks "are they covered for X", answer from the sections and the endorsements, and say which section you are reading. If nothing in the record answers it, say so and offer to check the wording with the insurer.
4. Flag these without being asked:
   - an endorsement that is not confirmed by the insurer, with how many days it has been waiting
   - no advice record behind the placement
   - a sum insured that has not changed across renewals while the premium has
   - an excess that differs from the sections underneath it
5. On the premium, always show the build: base, levies, GST, gross. Brokerage is what the brokerage earns, separately, and a broker fee is what the client pays us directly.

Follow ons: `endorse <policy> "<what changed>" --effective=` to instruct a change, `claim new <policy> "<what happened>"` to notify a loss, `renewal contact <policy>` after a renewal conversation.
