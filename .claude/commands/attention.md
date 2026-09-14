---
description: Everything that wants a decision this week, in one list, worst first: expired cover, renewals nobody has started, claims the client has heard nothing about, changes the insurer never confirmed.
---

1. `npm run broking -- attention [--broker=]`.
2. Present it in the order the command returns, because that order is severity, not date:
   - **Expired and still on the book.** Cover has run out. Nothing else matters until these are answered.
   - **Renewal inside thirty days with no client contact.** A Code problem at fourteen days, clause 7.2(a).
   - **Claim where the client has not been told anything.** Clause 7.1(a).
   - **Claim notified and never acknowledged.** The insurer has it and has not opened it.
   - **Cover changed and the insurer has not confirmed it.** The client thinks they are covered.
   - **Complaint past thirty days.** Clause 9.4(b).
   - **Placed with no advice record.** The file has a hole in it.
   - **No remuneration disclosure.** Clause 6.1.
   - **Renewal stuck in market, quotes owed, tasks overdue, brokerage never reconciled, clients nobody has spoken to.**
3. For each group: the count, the worst example by days, and one next command. Five lines, then offer to expand. Do not print forty rows.
4. Name individually anything over thirty days. That is not a backlog, it is something that has been forgotten.
5. End with the single item you would do first and why. Usually it is the expired policy or the oldest silent claim.

`npm run view -- week` renders the same list as a page in the operator's brand, if they want to send it to a principal.
