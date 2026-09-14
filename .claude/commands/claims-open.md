---
description: The claims board. Every open claim, how long it has been open, how long since anyone told the client anything, and what is reserved.
---

1. `npm run broking -- claims-open [--broker=]`.
2. Lead with the number the principal cares about: how many open claims have had no client update in more than fourteen days, and the worst one in days.
3. Present in three groups, not one long list:
   - **Nobody has told the client.** Over fourteen days since the last update. Name each one with the client, the days, and one line on what you would tell them.
   - **Waiting on the insurer.** Notified and never acknowledged, or an information request outstanding. Name the market and the days.
   - **Moving.** Everything else, in a table, with reserve and status.
4. Total the reserves and say it in one line. That number is the brokerage's exposure to a bad month.
5. Offer to write the updates: `/draft-claim-update <claim>` drafts one to `drafts/`, and `npm run docs -- claim-status-update` renders the branded version for every open claim at once.

Log the update in the system after it is sent, with `claim update <claim> "<what you told them>"`. A draft that never gets logged still shows as overdue next week.
