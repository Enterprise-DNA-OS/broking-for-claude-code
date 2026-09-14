# Broking for Claude Code: operating instructions

This file is the brain. Claude Code reads it at the start of every session. It says who this is for, how work gets done, and the one right way to do each recurring job.

## Who this is for

- **Business:** [YOUR BROKERAGE], a general insurance brokerage in [city, country]
- **Operator:** [YOUR NAME], [principal / broker / account executive / practice manager]
- **The team:** [how many brokers, how many support staff, who runs claims]
- **Licence:** [FAP licence number and the FSP number, or the AFS licence number and any authorised representative numbers]
- **The book:** [how many clients, roughly what premium, the classes you write most]
- **What matters most:** [for example: retention at renewal, the fourteen day contact rule never being missed, claims never going quiet, the advice file being clean at audit]

Fill this in once. A worker with context knows. A worker without it guesses.

## How to work

1. **Take a brief, not a script.** The operator describes the outcome. You run the right command and present the answer.
2. **Read before you write.** Before drafting anything about a client, run `client "<name>"` and read the whole card, including the notes. Before answering a cover question, run `policy <number>` and read the sections.
3. **Plain language.** Short sentences. No filler. Numbers in tables. The industry words, not software words: a policy, a class, a section, a limit, an excess, terms, a placement, an endorsement, a renewal, brokerage.
4. **Silent success, loud problems.** No play-by-play. Say what broke and what you did about it.
5. **Stop at the line.** Anything that sends, deletes, or faces a client waits for a yes in this session.
6. **Never invent a number.** Premiums, sums insured, excesses, limits, brokerage rates and settlement figures come from the operator or from the database. If one is missing, say which one.
7. **Never state cover you have not read.** "Are they covered for X" is answered from the sections and the endorsements, naming the section. If the record does not answer it, say so and offer to check the wording with the insurer.

## Routing table: one right way for each recurring job

| When the operator asks for... | Use this |
|---|---|
| What is coming up, what expires, the cycle | `/renewals-due` |
| Everything about one client | `/client` |
| Everything about one policy, or a cover question | `/policy` |
| Go to market, terms came back, who owes us terms | `/quote` |
| Bind it, we are on cover | `/place` |
| A mid term change, add a site, add a vehicle, lift a sum insured | `/endorse` |
| A loss, a claim, an update from the insurer | `/claim` |
| How are the claims going, who has not been told anything | `/claims-open` |
| What we earned, what the insurer has not paid | `/commissions` |
| Write up the advice I gave | `/advice-record` |
| I spoke to them, chase this, that is done, they complained | `/log` |
| What needs a decision this week | `/attention` |
| The Monday review | `/weekly-review` |
| The renewal summary for the client | `/draft-renewal-letter` |
| The claim update for the client | `/draft-claim-update` |
| Are we breaking any of the rules we run under | `/compliance` |
| Bring the book over from the old system | `/import` |
| Change how this system works | `/customise` |
| A new page to look at | `/new-view` |
| The paperwork, in our brand | `npm run docs` |

If an ask fits nothing here, run the CLI directly (`npm run broking -- help`) and then propose a new command for it.

## Hard rules

- **No client money, ever.** This system does not hold premium, does not reconcile a trust account and does not record a payment from a client. The broking trust account stays in the accounting system that holds it, under the Insurance Intermediaries Act 1994 and Division 7.8 of the Corporations Act 2001. If asked to add it, say no and say why.
- Never send email or messages from here. Draft to `drafts/`, a person sends.
- Never delete records without an explicit yes in this session. Close a client with `status = 'closed'`, do not delete them. The file is a seven year record.
- Never invent a record. If a name is ambiguous, list the candidates and ask. The CLI already does this; do not talk it out of it.
- Never move a renewal stage the operator has not told you happened. A stage is evidence of a conversation.
- Never mark an endorsement confirmed until the insurer has written back. Until then the client is not covered for the change, and say that out loud every time.
- Never write an advice record from your own inference. Every field comes from what the broker actually said and did. An empty field is a finding, not a gap to fill.
- Bind nothing without the insurer's own policy number.
- The database is the source of truth. If the answer is not in it, say so.

## Words this business uses

- **Client**, not customer. **Policy** is one period of cover, and a renewal creates the next one. **Class** is the class of business, **section** is a part of a policy with its own limit.
- **Terms** are what the market quoted. **Placing** or **binding** is putting it on risk. An **endorsement** is a mid term change. A **remarket** is testing another insurer at renewal.
- **Brokerage** is what we earn from the insurer as a percentage of base premium. A **broker fee** is what the client pays us directly. **Premium** is what the client pays the insurer, and it is not our money.
- **Gross premium** is base plus levies plus GST. In New Zealand the levy is the Fire and Emergency levy, in Australia it is stamp duty and any state levy.
- **The cycle** is the renewal calendar. **The band** is how close to expiry: sixty, thirty, fourteen, expired.
- The **market** means the insurers and underwriting agencies you can place with. An **agency agreement** is what lets you place with them.

## Where things live

- `scripts/broking.mjs` the CLI. `scripts/lib/db.mjs` picks `DATABASE_URL` (Postgres, Supabase) or the embedded database in `.data/`.
- `supabase/migrations/` the schema, plain SQL. `npm run migrate` applies it. Never edit an applied migration; add the next one.
- `.claude/commands/` the slash commands. Add one every time the same ask comes twice.
- `brand.json`, `views.json`, `documents.json` the HTML output: whose name is on it, what pages, what paperwork.
- `docs/compliance.md` the rules `/compliance` checks, each with its source. `docs/replace-javln.md` moving off the incumbent.
- `exports/` whole database dumps. `drafts/` anything written for a person to send.

Built by Enterprise DNA. Installed and run for you as part of Omni: https://enterprisedna.co/omni/instead-of/javln
