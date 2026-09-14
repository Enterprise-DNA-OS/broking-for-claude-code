---
description: The renewal cycle. What expires in sixty, thirty and fourteen days, where each one has got to, and who has not been spoken to. The heartbeat of the brokerage.
---

The operator wants to know what is coming up. Arguments might be a number of days ("60"), a broker ("Hine"), a band ("14 day"), or nothing at all.

1. Run `npm run broking -- renewals-due [--days=90] [--broker=] [--band=] [--stage=]`. With no argument it covers ninety days and everybody.
2. Lead with the two numbers that matter: how much premium is inside thirty days, and how many of those policies nobody has contacted the client about.
3. Present it in the bands the command returns, worst first, and say what each band means:
   - **Expired.** Cover has run out and the policy is still marked in force. Stop and deal with these before anything else.
   - **14 day.** The Insurance Brokers Code of Practice, clause 7.2(a), wants the client contacted well before, and at least fourteen days prior to, expiry. Anything in this band with no contact is a Code problem, not a workload problem.
   - **30 day.** Terms should be in hand or the market should have them.
   - **60 and 90 day.** Review and submission window. This is where a renewal is won or lost.
4. Inside each band, sort by premium, not by date. The largest client with no contact is the first call.
5. For anything at stage "in market" past its terms due date, name the insurer and the days waiting. That is a chase, not a wait.
6. End with the five renewals to work today and one line each on why.

Next steps to offer, in the words a broker uses:
- `renewal contact <policy>` after you have spoken to them
- `renewal market <policy> --terms-due=YYYY-MM-DD` when the submission goes out
- `quote new <client> --insurer= --class= --policy=<policy>` for each market approached
- `/draft-renewal-letter <policy>` for the summary that goes to the client

Never move a renewal stage the operator has not told you happened.
