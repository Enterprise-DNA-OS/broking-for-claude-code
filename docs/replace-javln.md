# Moving off JAVLN

Switch in a day. Export the book, run one command, check four numbers. This page says exactly
which export to run, which columns matter, what maps, and what does not carry over.

Insight and WinBEAT exports go through the same command with `insight` or `winbeat` in place of
`javln`. Any other broker system works with `csv`, which accepts the same column aliases.

---

## 1. Get the export out of the incumbent

You need four files. Run them from the reporting or export area of the broker system, or build the
report and save it as CSV. Ask your account manager for a data extract if the reports are locked
down: the data is yours.

| File | What it is | The report to run |
|---|---|---|
| `clients.csv` | Every client with their code, address and servicing broker | The client or insured listing, all records, not just active |
| `policies.csv` | Every policy period with dates, insurer, premium and brokerage | The policy register or policy listing, all statuses, with expiry dates |
| `contacts.csv` | Contact people against each client | The client contacts report |
| `claims.csv` | Claims with dates, status, reserve and paid | The claims register, all statuses, at least three years back |

Export all statuses, not just current. A cancelled policy from two years ago is the record that
explains a gap in cover, and the seven year retention rule applies to it.

## 2. Columns that matter

Headers are matched case insensitively against a list of aliases, so most exports work unchanged.
These are the ones that carry the weight.

**Clients.** Client Name (or Client, Insured, Insured Name), Client Code (or Client Ref, Client
Number, Account), Client Type, NZBN or ABN, Industry or Occupation, Email, Phone, Address, Suburb,
City, Region, Broker (or Account Executive, Adviser, Servicing Broker).

**Policies.** Policy Number (or Policy No, Policy Reference), Client Name or Client Code, Class (or
Class of Business, Product, Cover Type, Risk Type), Insurer (or Underwriter, Market), Inception Date
(or Effective Date, Start Date), Expiry Date (or Renewal Date, End Date), Gross Premium (or Total
Premium, Premium), Base Premium (or Net Premium), Brokerage (or Commission), Brokerage % (or
Commission %), Broker Fee, Sum Insured (or Total Sum Insured, Limit), Excess, Status, Insurer
Reference, Payment Method.

**Contacts.** Client Name or Client Code, Contact Name, Role or Position, Email, Phone.

**Claims.** Claim Number, Policy Number, Date of Loss (or Loss Date, Incident Date), Notified Date,
Description, Status, Reserve (or Estimate, Outstanding), Paid (or Settled), Excess, Insurer Claim
Number.

Dates in DD/MM/YYYY are read correctly. Money with a dollar sign and commas is read correctly.

## 3. Run it

```bash
npm install
npm run migrate

npm run broking -- import javln \
  --clients=clients.csv \
  --policies=policies.csv \
  --contacts=contacts.csv \
  --claims=claims.csv \
  --dry-run
```

The dry run writes nothing. It prints the counts it would create and every row it would skip, with
the reason. Read the skipped list before you do anything else. The usual cause is a client name in
the policy file that does not match the client file, often by a comma or a "Ltd".

Then drop `--dry-run`.

## 4. Check four numbers

```bash
npm run broking -- clients
npm run broking -- policies --all
npm run broking -- renewals-due --days=365
npm run broking -- claims --all
```

Compare the policy count and the total premium against the incumbent's own report. If the premium
is out by roughly thirteen percent, the export gave you premium excluding GST in one file and
including it in another. If a whole class is missing, that class was a separate register in the
incumbent and needs its own export.

Then tidy the markets: `npm run broking -- insurers --all`. Imports create an insurer for every
distinct spelling, so "QBE", "QBE Insurance" and "Q.B.E." arrive as three. Merge them before anyone
starts working.

## 5. What maps

| In JAVLN | Here |
|---|---|
| Client | `clients`, with type, industry, address and servicing broker |
| Client contacts | `contacts`, one row per person |
| Policy | `policies`, one row per policy period, with the premium build and the brokerage |
| Insurer or market | `insurers`, with agency agreement reference and default brokerage rate |
| Renewal date | `policies.expiry_on`, and the renewal workflow is built from it |
| Claim | `claims`, with reserve, excess, settled and status |
| Broker or account executive | `brokers` |
| Brokerage and commission | `commissions`, an earnings ledger by month |

## 6. What does not carry over

Say all of this out loud to whoever signs off the switch.

- **Advice records.** No broker management system exports the reasoning behind a recommendation,
  because most of them do not hold it as a field. These start again from the next renewal. That is
  usually an improvement, because the new records have scope, reasons, alternatives, risks and
  remuneration in separate fields that a reviewer can read.
- **Policy sections and limits.** Most exports carry one sum insured per policy. The `covers` table
  holds a section per row with its own limit and excess. Add them at the renewal, when somebody is
  reading the schedule anyway.
- **Documents.** PDFs, schedules, wordings and email attachments stay where they are. Keep the
  incumbent read only for the retention period, or bulk export the document store to a folder you
  control and reference it from the client notes.
- **Correspondence and diary notes.** Notes can be imported through a fifth CSV if the incumbent
  exports them, but most do not. Import the last twelve months if you can get them.
- **Trust accounting.** Deliberately. Premium receipts, the trust account and the reconciliation
  stay in the system that holds them today. This system holds the policy lifecycle, the advice, the
  claims and the brokerage the business earns. That boundary is the point, not a gap.
- **Insurer integrations and quote feeds.** A direct connection into an insurer's rating engine is
  the incumbent's own arrangement. Quotes are recorded here, not requested from here.
- **Report definitions.** Every report the brokerage built inside the incumbent stays there. Ask
  for the same answer in plain language instead, and if you want it every week, `/new-view` turns it
  into a page.

## 7. Run both for a fortnight

Keep the incumbent live and read only for two weeks. Work the renewal cycle here, keep placing in
the incumbent if you want to, and compare the two on the Friday. The check that matters is
`renewals-due --days=60` against whatever renewal list the incumbent prints. If both lists agree,
you are done.

## 8. When you cancel

Take a full export first, then `npm run broking -- export --out=pre-cancellation.json`, and keep
both somewhere you control. Seven years of records is the retention rule in both countries, and it
applies whether or not you still pay the vendor.
