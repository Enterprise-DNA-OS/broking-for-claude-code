<h1 align="center">Broking for Claude Code</h1>

<p align="center">
  <strong>The open-source insurance broker system that is just a database and Claude Code.</strong>
</p>

<p align="center">
  Created by <a href="https://www.enterprisedna.co"><strong>Enterprise DNA</strong></a>. Free and open source. Or installed and run for you.
</p>

<p align="center">
  <a href="#what-is-this">What is this</a> &bull;
  <a href="#why-no-front-end">Why no front end</a> &bull;
  <a href="#quick-start">Quick start</a> &bull;
  <a href="#the-commands">Commands</a> &bull;
  <a href="#compliance-checked-against-the-data">Compliance</a> &bull;
  <a href="#ten-questions-javln-cannot-answer">Ten questions</a> &bull;
  <a href="#instead-of-javln">Instead of JAVLN</a> &bull;
  <a href="#want-it-installed-and-run-for-you">Installed for you</a> &bull;
  <a href="#license">License</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node-20+-339933?style=flat-square" alt="Node 20+" />
  <img src="https://img.shields.io/badge/PostgreSQL-any-336791?style=flat-square" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/PGlite-embedded-3ecf8e?style=flat-square" alt="PGlite" />
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=flat-square" alt="MIT License" />
</p>

---

## What is this

Broking for Claude Code does the job you pay JAVLN for, as a Postgres database and a set of Claude Code commands. There is no web front end. You open the folder in [Claude Code](https://claude.com/claude-code) and ask for what you want in plain language. It runs the right query, and it can answer questions the JAVLN dashboard cannot.

It is built for a small general insurance brokerage: clients and their contacts, insurers and underwriting agencies, policies with their sections and limits, the renewal cycle at sixty, thirty and fourteen days, quotes out to market, placements, mid term endorsements, claims and their whole history, advice records, complaints, tasks and the brokerage ledger. The words are the words a broker already uses.

**Client money is not in here.** No trust account, no premium receipts, no reconciliation of client funds. That stays in the system that holds it today, under the Insurance Intermediaries Act 1994 in New Zealand and Division 7.8 of the Corporations Act 2001 in Australia. This records the policy lifecycle, the advice, the claims, the tasks and the brokerage the business earns. That boundary is deliberate.

```
/renewals-due                     sixty, thirty, fourteen, expired, and who has not been contacted
/client "Kauri Joinery"           everything on one client, including the gaps in the file
/policy POL-20008                 sections, limits, endorsements, claims, advice, brokerage
/quote                            ask the market, record what came back, chase what is owed
/place Q-26014 --policy-no=...    bind it, close the renewal, accrue the brokerage
/endorse POL-20005 "add site 4"   instruct a change, and chase the insurer until it is confirmed
/claim new POL-20023 "fire..."    notify, log every step, tell the client, settle, close
/claims-open                      the board, sorted by how long the client has heard nothing
/advice-record                    what you recommended, why, what else you looked at, what you disclosed
/commissions                      brokerage by month, and what the insurer never paid
/compliance                       the Code and the Act, run against your own records
/attention                        everything that wants a decision this week
/weekly-review                    the Monday review, written from three commands
```

One policy period is one row. One claim event is one row. One conversation is one advice record. The questions that decide whether a brokerage keeps its licence and its clients are questions about those rows.

## Why no front end

- The front end was only ever there because the database was hard to talk to. That is no longer true.
- Your data sits in plain Postgres tables you own. Any tool can read them. No export, no lock-in.
- No seats, no tiers, no add-ons. Read [docs/why-no-front-end.md](docs/why-no-front-end.md) for the honest trade-offs too.

## Quick start

Sixty seconds, no database install (an embedded Postgres runs inside Node):

```bash
git clone https://github.com/Enterprise-DNA-OS/broking-for-claude-code.git
cd broking-for-claude-code
npm install
npm run demo
```

`npm run demo` creates the database, loads Kauri Risk Brokers (a demo New Zealand brokerage with four brokers, ten markets, eighteen clients, thirty five policies, a renewal cycle in flight, quotes out, claims open and a deliberately imperfect file), then prints the renewal cycle, the attention list and the compliance check.

Then open the folder in Claude Code and type:

```
/renewals-due
```

Try `/attention`, `/client "Harbourview"`, `/claims-open`, `/compliance`, `/weekly-review`. When you are ready for real data, delete `.data/` and start with `/import`, or add clients one at a time with `add client`.

Fill in the "Who this is for" block in [CLAUDE.md](CLAUDE.md) so drafts come out in your voice, and put your brokerage name and colours in [brand.json](brand.json) so the documents and views come out with your name on them.

### Use it with your own Postgres or Supabase

Copy `.env.example` to `.env`, set `DATABASE_URL`, then `npm run migrate`. Same commands, shared data, no per-seat fee. A team shares one database: each person clones the repo, points at the same `DATABASE_URL`, sets `BROKING_BROKER` to their own name, and works in their own Claude Code.

## The commands

| Command | What it does |
|---|---|
| `/renewals-due` | The cycle. Sixty, thirty, fourteen, expired, and who has not been contacted. |
| `/client` | One client in full: contacts, policies, claims, advice records, tasks, notes. |
| `/policy` | One policy: sections and limits, the premium build, endorsements, claims, advice, brokerage. |
| `/quote` | Ask the market, record what came back, present it, or mark it declined or lost. |
| `/place` | Bind an accepted quote. Creates the policy, closes the renewal, accrues the brokerage. |
| `/endorse` | A mid term change, instructed and then chased until the insurer confirms it. |
| `/claim` | Notify a loss, log what the insurer did, record what you told the client, settle, close. |
| `/claims-open` | The claims board, sorted by how long since anyone told the client anything. |
| `/commissions` | Brokerage by month and by insurer, and what has never been reconciled. |
| `/advice-record` | The record of advice: scope, recommendation, reasons, alternatives, disclosure. |
| `/attention` | Everything that wants a decision this week, worst first. |
| `/weekly-review` | The Monday review, written from three commands. |
| `/draft-renewal-letter` | The renewal summary for the client, saved to `drafts/`. Never sends. |
| `/draft-claim-update` | The claim progress update for the client, saved to `drafts/`. Never sends. |
| `/log` | A call, a meeting, a task, a task done, a complaint. The small entries that keep it true. |
| `/compliance` | The Code and the Act, run against your records, each rule with its source. |
| `/import` | Bring the book across from JAVLN, Insight, WinBEAT or a plain CSV. |
| `/customise` | Add a field, rename a stage, change a rule, in plain language. Writes and applies the migration. |
| `/new-view` | Add a read-only HTML dashboard from a description. |

Everything the commands do, the CLI does: `npm run broking -- help`. Any command takes `--json`.

### Documents and views, in your brand

```bash
npm run docs    # renewal summaries, portfolio schedules, claim status updates, as HTML
npm run view    # the week and the renewal cycle, as read-only HTML dashboards
```

Both read [brand.json](brand.json), so your brokerage name, logo and colours are one file away. Documents land in `docs-out/`, views in `views/`. Print either to PDF from the browser. `/new-view` adds a view, `documents.json` adds a document.

## Compliance, checked against the data

`/compliance` runs the rules in [docs/compliance.md](docs/compliance.md) against your records and reports what is breached. Each rule cites its source, with the clause or section number.

1. Contact the client at least fourteen days before expiry (Insurance Brokers Code of Practice 2022, clause 7.2(a)).
2. Terms of engagement in writing before you act (Code, clause 4.2(a)).
3. Disclose what you earn to individuals and small business, with the advice (Code, clause 6.1).
4. An advice record for every placement (FMC Act 2013 ss 431I to 431P and FAP licence standard condition 1; Corporations Act 2001 s 912A(1)(a) and s 961B).
5. Record the nature and scope of the advice, and its limits (FMC Act 2013 s 431J; Code of Professional Conduct for Financial Advice Services, standard 4).
6. Record the reasons the advice is suitable (Code of Professional Conduct, standard 3).
7. Disclosure at the point the advice is given (FMC Regulations 2014, regs 229C to 229F).
8. Keep clients informed on the progress of a claim (Insurance Brokers Code of Practice, clause 7.1(a)).
9. Complaints acknowledged, updated every ten business days, resolved inside thirty (Code, clauses 9.2(b) and 9.4(b); ASIC RG 271).
10. Keep the records seven years (Tax Administration Act 1994 s 22; Corporations Act 2001 ss 988A to 988E).

Nothing there is legal advice. It is the rule book you point the system at, and you change it to match your licence and your jurisdiction. This is the feature the incumbent puts behind its top tier.

## Ten questions JAVLN cannot answer

Every one of these is answered by the demo data today. Yours will be different, and that is the point.

1. Which clients pay us less brokerage than the claims work they generate, and which of those renew inside ninety days?
2. Which insurer is slowest between a submission going out and terms coming back, by class of business?
3. Which policies have carried the same sum insured across three renewals while the premium moved more than fifteen percent?
4. What would the book earn if every brokerage rate matched the agency agreement, against what it actually earns?
5. Which placements were bound with no advice record written in the thirty days around them, and who wrote them?
6. Which clients are on cover and have not been spoken to in six months, ranked by premium at risk?
7. How many days sit between an insurer's last move on a claim and the client being told, by broker?
8. Which classes of business earn the most per renewal, once you count the quotes we asked for and lost?
9. Which endorsements went effective before the insurer confirmed them, and for how many days was the client uncovered on paper?
10. If a broker left tomorrow, which clients, expiring premium and open claims move, and how many of those renew inside sixty days?

## Your first hour: ten things to ask for

Open the folder in Claude Code and say these in your own words. Each one changes the system to fit your brokerage.

1. "We contact clients ninety days out, not sixty. Change the bands and the compliance check."
2. "Add a seismic rating and a construction year to every property policy, and show them on the renewal summary."
3. "Our renewal stages are Review, Submission, Terms, Presented, Bound. Rename them everywhere."
4. "Put our logo and colours on the documents, and change the business name to ours."
5. "Add a binder reference to policies. We write three classes under a binder and they price differently."
6. "Add a rule to `/compliance`: no policy bound without a signed proposal on file."
7. "Build me a view for the Monday meeting: the fourteen day band, the claims nobody has updated, and brokerage against last month."
8. "Our professional indemnity clients need a claims made explainer in every renewal letter. Add it."
9. "Track continuing professional development hours per adviser and warn me in November."
10. "Write me a command that drafts the submission email to an underwriter from the policy and the claims history."

`/customise` writes the migration, applies it, updates every command that touches the change, and runs the tests.

## Instead of JAVLN

Export the book, run one command, and the history comes with you. Step by step, with what maps and what does not: [docs/replace-javln.md](docs/replace-javln.md).

```bash
npm run broking -- import javln --clients=clients.csv --policies=policies.csv --contacts=contacts.csv --claims=claims.csv --dry-run
npm run broking -- import javln --clients=clients.csv --policies=policies.csv --contacts=contacts.csv --claims=claims.csv
```

Insight and WinBEAT exports go through the same command with `insight` or `winbeat` in place of `javln`. Any other system works with `csv`.

## Architecture

```
broking-for-claude-code/
  CLAUDE.md                  how the brokerage wants this run (routing table + house rules)
  brand.json                 your brokerage name, logo and colours on every document and view
  views.json                 the HTML dashboards npm run view renders
  documents.json             the paperwork npm run docs renders
  .claude/commands/          the slash commands
  scripts/broking.mjs        the CLI the commands drive
  scripts/view.mjs           read-only HTML dashboards from the SQL views
  scripts/docs.mjs           the documents, one HTML file per record
  scripts/lib/db.mjs         one adapter: DATABASE_URL (pg) or embedded PGlite
  supabase/migrations/       plain SQL schema, tables and views
  supabase/seed.sql          demo data
  docs/compliance.md         the rules /compliance checks, each with its source
  docs/replace-javln.md      moving off the incumbent
  exports/                   whole database dumps
  drafts/                    letters and updates written for a person to send
```

## Built with Claude Code

This repository was built with Claude Code as the primary development tool, from the schema to the commands, and it is meant to be extended the same way. Ask for a new command and it writes one.

## Contributing

Issues and pull requests are welcome. Keep the shape: plain SQL, a small CLI, a slash command per recurring job, no front end, and no client money.

## Want it installed and run for you?

Enterprise DNA installs Broking for Claude Code for your brokerage, migrates your JAVLN data, connects it to the rest of your tools, and runs it for you as part of **Omni**, our managed Command Center. One setup fee, then a monthly retainer.

- Book a call: https://calendly.com/sam-mckay/discovery-call
- Read more: https://enterprisedna.co/omni/instead-of/javln

## License

MIT. Copyright (c) 2026 Enterprise DNA.
