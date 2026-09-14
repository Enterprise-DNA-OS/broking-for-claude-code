---
description: Record what happened. A call, a meeting, an email, a task to chase, or a task done. The small entries that make the renewal cycle and the claims board true.
---

The operator will say "spoke to Dave about the spray booth", "chase NZI on Friday", "that is done".

**A contact.**
```
npm run broking -- note "<client>" "<what was said and what was agreed>" [--kind=call|meeting|email|note] [--on=YYYY-MM-DD] [--policy=<policy>]
```
This is what "client last spoken to" reads from, and what stops a client showing up on the quiet list. Write what was agreed, not that a call happened.

**A renewal conversation** is a note plus a stage. If the conversation was about a renewal, also run `npm run broking -- renewal contact <policy>`. That is the entry the fourteen day Code check looks for.

**A task.**
```
npm run broking -- task add "<what and for whom>" [--client= --policy= --claim= --due=YYYY-MM-DD --broker=]
npm run broking -- task done <id>
```
Default due date is a week out. Give it a real one if the operator said a day.

**A complaint.** Anything the client says they are unhappy about goes in as a complaint, even if it feels small.
```
npm run broking -- complaint new "<client>" "<what they said, in their words>" [--policy= --claim=]
npm run broking -- complaint update <id>
npm run broking -- complaint resolve <id> "<what was decided and why>"
```
Logging it starts the clock the Code runs on: acknowledge promptly, update at least every ten business days, resolve inside thirty calendar days.

Never write a note the operator did not say. If a detail is missing, ask for it.
