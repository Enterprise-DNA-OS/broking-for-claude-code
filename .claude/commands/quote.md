---
description: The market. Ask for terms, record what came back, present it to the client, or mark it declined or lost. Also the chase list for terms the market owes.
---

The operator will say something like "get terms from Ando for the Blue Duck liability", "NZI came back at 21,400", or "who owes us terms".

**Reading.** `npm run broking -- quotes [--status= --client= --insurer= --all]`. Sort the answer by how late the terms are, not by date asked. Anything past its due date is a phone call today, and say which underwriter to call.

**Asking the market.**
```
npm run broking -- quote new "<client>" --insurer="<market>" --class="<class>" [--policy=<policy being renewed>] [--due=YYYY-MM-DD] [--sum-insured=]
```
Pass `--policy` whenever this is a renewal or a remarket, so the quote attaches to the renewal and shows on the cycle.

**Recording what came back.**
```
npm run broking -- quote receive <ref> --premium=21400 --brokerage=17.5 --excess=2500 --terms="<what is different from expiring>"
```
The terms field is the one that matters at claim time. Record what changed: sub limits, exclusions, retroactive dates, excess structure. Never write "as expiring" unless the underwriter said those words.

**Presenting.** `quote present <ref>` moves the renewal to presented. Before the client instructs, write the advice record: `/advice-record`. A comparison presented with no record of why is the gap a complaint opens with.

**Not proceeding.** `quote decline <ref> "<the market's reason>"` when the insurer said no. `quote lose <ref> "<why we did not take it>"` when we said no. Keep both. A declined market this year is the reason you go somewhere else next year.

Then `/place` to bind.
