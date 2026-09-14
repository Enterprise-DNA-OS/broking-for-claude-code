---
description: Check the book against the rules a general insurance brokerage lives under, each with its source, and report what is breached, what is close, and what to do about it.
---

1. Run `npm run broking -- compliance`. It runs every rule in `docs/compliance.md` against the data and returns the count, the worst example and the source for each. `compliance <rule-key>` runs one.
2. Read `docs/compliance.md` before you interpret anything. Each rule records the source, what a breach looks like in the data, the SQL and the command.
3. Present as a table first: rule, breaches, worst example in days, source. Order by severity, breached first.
4. Then, for each breached rule, the records and the fix the operator can approve:
   - **No client contact inside fourteen days of expiry.** Draft the renewal letter to `drafts/`, then `renewal contact <policy>` once it goes.
   - **No terms of engagement.** Name the client and the date they came on the book. This one gets fixed once and stays fixed.
   - **No remuneration disclosure.** Add it to the advice record and to the next renewal letter.
   - **No advice record behind a placement.** `/advice-record` for each, oldest first.
   - **No nature and scope, or no reasons.** One field each on an existing record. Ask the broker what they told the client.
   - **Claim with no client update in a fortnight.** `/draft-claim-update`, then log it.
   - **Complaint past thirty days, never acknowledged, or no update in ten business days.** This is the one that ends up at the dispute resolution scheme. Handle it first.
5. If a rule in `docs/compliance.md` is out of date, say so and stop. Do not guess at law. The operator confirms the rule, then you update the doc and the check together.
6. Two boundaries to repeat whenever they come up. Client money is not in this system and never will be: the broking trust account stays in the accounting system that holds it. And nothing here is legal advice. The doc records the rules the brokerage has told the system to enforce, with their sources.

Sources the checks cite: the Insurance Brokers Code of Practice 2022 (clauses 4.2, 6.1, 7.1, 7.2, 9.2 and 9.4), the Financial Markets Conduct Act 2013 sections 431I to 431P, the Financial Markets Conduct Regulations 2014 regulations 229C to 229F, the Code of Professional Conduct for Financial Advice Services standards 3, 4 and 5, the financial advice provider licence standard conditions, and the Corporations Act 2001 sections 912A and 961B.
