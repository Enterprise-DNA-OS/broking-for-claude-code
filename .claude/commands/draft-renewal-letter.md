---
description: Draft the renewal summary that goes to the client, written from the record. Saved to drafts/. Never sends anything.
---

The operator will name a policy or a client ("write up the Harbourview renewal").

1. Read everything first:
   - `npm run broking -- policy <number>` for the sections, the premium build, the endorsements and the renewal stage
   - `npm run broking -- client "<name>"` for the other policies and the claims
   - `npm run broking -- quotes --client="<name>"` for what the market said
2. Write it to `drafts/renewal-<policy-no>-<date>.md` with these sections, and nothing that is not in the record:
   - **What is expiring.** Policy number, insurer, class, dates, premium.
   - **What is covered.** Every section with its sum insured and excess, as recorded. No paraphrasing of limits.
   - **What changed this year.** Endorsements, with effective dates.
   - **Claims.** Every claim in the period with its status and what was paid. Say plainly if the claims record will affect the rate.
   - **What we recommend.** Only if there is an advice record. If there is not, stop and write one first with `/advice-record`.
   - **What we earn.** The brokerage rate and any broker fee, in dollars. Clause 6.1 of the Insurance Brokers Code of Practice wants this given at the same time as the advice for individuals and small business.
   - **What we need from you, and by when.** Tied to the expiry date.
3. Match the voice in the "Who this is for" block in `CLAUDE.md`. Short sentences. No adjectives about the market.
4. Print the path and the first few lines. Do not send it. A person sends it.

For the branded version, `npm run docs -- renewal-summary-letter` renders every policy expiring inside sixty days as HTML in the brokerage's colours, ready to print to PDF.
