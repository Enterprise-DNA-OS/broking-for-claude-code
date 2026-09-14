---
description: Bring the book across from JAVLN, Insight, WinBEAT or a plain clients and policies CSV. One command, matched on client name and policy number.
---

1. Read `docs/replace-javln.md` first. It says exactly which report to run in the incumbent and which columns matter.
2. Always dry run before you write. Report the counts and the skipped rows.

```
npm run broking -- import javln --clients=clients.csv --policies=policies.csv --contacts=contacts.csv --claims=claims.csv --dry-run
npm run broking -- import javln --clients=clients.csv --policies=policies.csv --contacts=contacts.csv --claims=claims.csv
```

`insight`, `winbeat` and `csv` are the other sources. They accept the same column aliases, which covers most exports and any report printed to CSV.

3. Column names are matched case insensitively against a list of aliases per field. If a column is skipped, tell the operator the header it saw and add the alias to `SOURCES` in `scripts/broking.mjs` rather than editing their file.
4. Insurers and brokers named in the files are created if they do not exist. Check them afterwards with `insurers --all` and `brokers --all`, and merge duplicates before anyone starts working.
5. What does not come across, and say all of it out loud:
   - **advice records.** No broker system exports the reasoning. These are rebuilt going forward, from the next renewal.
   - **policy sections and limits.** Most exports carry one sum insured per policy. Add the sections on the renewal, when someone is reading the schedule anyway.
   - **claim histories.** The claim comes across, the correspondence does not.
   - **documents.** PDFs stay where they are. Keep the incumbent read only until they are moved.
6. After the import, check four things and report them: `clients`, `policies --all`, `renewals-due --days=365` and `claims --all`. A policy count that does not match the incumbent is the first thing to chase, and the usual cause is a client name that differs by a comma.
