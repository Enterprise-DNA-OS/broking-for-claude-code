---
description: One client, everything on them: contacts, every policy, claims, the advice records behind the programme, open tasks and the last time anyone spoke to them.
---

1. Run `npm run broking -- client "<name>"`. Partial names work. If it lists candidates, ask which one rather than guessing.
2. Read the whole card before you say anything, including the notes at the bottom. The last three notes usually explain the current state better than the tables do.
3. Present it in this order:
   - **Who they are and what they pay.** Premium in force, brokerage a year, policies, next expiry.
   - **What is exposed.** Policies expiring inside sixty days, open claims, anything at "not started".
   - **The record.** Advice records against the programme, and any policy with none behind it. Say so plainly if terms of engagement are not on file.
   - **What is open.** Tasks, complaints, endorsements the insurer has not confirmed.
4. Never summarise cover in your own words when the client card shows the sections. Read `policy <number>` and quote the sums insured and excesses as they are recorded.
5. If the client has not been spoken to in more than ninety days, say it in one line with the date of the last contact.

Follow ons: `policy <number>` for one policy, `/advice-record` to write up advice given, `log` to record a call, `/draft-renewal-letter` for the renewal summary, `npm run docs -- client-portfolio-schedule` for the branded schedule.
