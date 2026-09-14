# The rules a general insurance brokerage lives under

This file is the rule book `/compliance` checks the database against. Each rule has a name,
the source it comes from, what a breach looks like in the data, the query that finds it and
the command that fixes it. `npm run broking -- compliance` runs all of them.

Nothing here is legal advice. These are the rules the brokerage has told this system to enforce.
Read them, change them to match your own licence conditions and your own jurisdiction, and keep
the sources current. When a rule changes, change the rule and the check together.

The sources are New Zealand and Australian. New Zealand brokers giving regulated financial advice
work under the Financial Markets Conduct Act 2013 as amended by the Financial Services Legislation
Amendment Act 2019, a financial advice provider licence and its standard conditions, the disclosure
regulations, and the Code of Professional Conduct for Financial Advice Services. Australian brokers
work under an Australian financial services licence, the Corporations Act 2001, and the Insurance
Brokers Code of Practice. Most brokerages in both countries subscribe to the Code.

## What this system does not do

**Client money never touches this database.** No premium receipts, no trust account, no
reconciliation of client funds, no payments to insurers. That sits in the accounting system that
already holds it, under the Insurance Intermediaries Act 1994 in New Zealand and Division 7.8 of
the Corporations Act 2001 in Australia. This system records the policy lifecycle, the advice, the
tasks, the claims and the brokerage the business earns. If someone asks it to hold client money,
the answer is no, and the reason is that a broking trust account is a regulated obligation with an
auditor attached, not a table.

---

## 1. Contact the client at least fourteen days before expiry

**Source.** Insurance Brokers Code of Practice 2022, clause 7.2(a): "We will contact our client
well before and at least fourteen (14) days prior to the client's insurance cover expiry date to
engage them on the next steps to be taken prior to the expiry of the policy, in accordance with
the terms of engagement."
[niba.com.au/code-of-practice](https://niba.com.au/code-of-practice).
The Insurance Brokers Code Compliance Committee publishes good practice guidance on renewal
timeframes at [insurancebrokerscode.com.au](https://insurancebrokerscode.com.au/resources/meeting-renewal-timeframes-guidance-for-good-practice/).

**What it means for a broker.** Fourteen days is the floor, not the plan. Commercial renewals go
to market at sixty to ninety days. The rule this system enforces is the floor, and the sixty and
thirty day bands are how you never get near it.

**Breach in the data.** A policy in force, expiring inside fourteen days, with no renewal row or a
renewal row where `client_contacted_on` is null.

```sql
select p.policy_no, c.name as client, (p.expiry_on - current_date) as days_to_expiry
from policies p
join clients c on c.id = p.client_id
left join renewals r on r.policy_id = p.id
where p.status in ('in force', 'bound')
  and p.renewal_type <> 'closed'
  and p.expiry_on between current_date and current_date + 14
  and (r.id is null or r.client_contacted_on is null)
order by p.expiry_on;
```

**Command.** `npm run broking -- renewals-due --band="14 day"` lists them. `renewal contact <policy>`
records the conversation once it has happened.

---

## 2. Terms of engagement in writing before you act

**Source.** Insurance Brokers Code of Practice 2022, clause 4.2(a): if a prospective client agrees
to engage us, "we will provide information in writing setting out the terms of engaging us before
we begin to act on their behalf". Clause 4.2(b) says the terms cover the scope of services, whether
advice is based on personal circumstances, how quotations will be sought, and the remuneration we
will earn.

**What it means for a broker.** The client who has been on the book for eleven years without a
signed engagement is the one who disputes the scope at claim time. This is a one time fix per
client.

**Breach in the data.** An active client with a policy in force and no `engagement_signed_on`.

```sql
select c.name, c.client_since, (current_date - c.client_since) as days_on_the_book
from clients c
where c.status = 'active'
  and c.engagement_signed_on is null
  and exists (select 1 from policies p where p.client_id = c.id and p.status = 'in force')
order by c.client_since;
```

**Command.** `npm run broking -- clients` and the client card both print "Terms of engagement:
NOT ON FILE".

---

## 3. Disclose what you earn to individuals and small business

**Source.** Insurance Brokers Code of Practice 2022, clause 6.1(a) to 6.1(c). For an individual or
a small business, disclose the dollar amount of commission, any non monetary remuneration from
insurers, any fees payable by the client, and whether any commission is kept if the policy is
cancelled. Clause 6.1(c): the information is provided "at the same time and by the same means as
our advice to our client". A small business is one employing fewer than 100 people if it
manufactures goods, and fewer than 20 otherwise. In New Zealand the equivalent sits in the
Financial Markets Conduct Regulations 2014, subpart 5A, which requires fees, commissions and
conflicts to be disclosed when the nature and scope of the advice is known and again when the
advice is given.

**Breach in the data.** An advice record with `remuneration_disclosed` false where the client is an
individual or has a headcount under twenty.

```sql
select c.name as client, a.given_on, coalesce(p.policy_no, '') as policy
from advice_records a
join clients c on c.id = a.client_id
left join policies p on p.id = a.policy_id
where not a.remuneration_disclosed
  and (c.client_type = 'individual' or coalesce(c.headcount, 0) < 20)
order by a.given_on;
```

**Command.** `npm run broking -- advice` prints NO in the remuneration column. The renewal summary
document and the portfolio schedule both carry the brokerage figure, so the disclosure goes out
with the advice rather than after it.

---

## 4. An advice record for every placement

**Source.** New Zealand: Financial Markets Conduct Act 2013 sections 431I to 431P, inserted by the
Financial Services Legislation Amendment Act 2019, and standard condition 1 of a financial advice
provider licence: "You must create in a timely manner and maintain adequate records in relation to
your financial advice service." The Financial Markets Authority's record keeping information sheet
for financial advice providers says records must be kept for at least seven years and be available
for the FMA to inspect: [fma.govt.nz](https://www.fma.govt.nz/library/guidance-library/).
Australia: Corporations Act 2001 section 912A(1)(a), the obligation to provide financial services
efficiently, honestly and fairly, and section 961B, the duty to act in the best interests of the
client, which the Code restates at clause 5.3(a).
[legislation.gov.au](https://www.legislation.gov.au/C2004A00818/latest/text).

**What it means for a broker.** If the advice is not written down, it did not happen. A file with
a policy schedule and no record of the conversation behind it cannot answer the only question that
matters in a dispute: why this cover, from this insurer, at this limit.

**Breach in the data.** A policy placed in the last twelve months with no advice record against it
and none for that client within thirty days either side of the placement.

```sql
select p.policy_no, c.name as client, coalesce(p.placed_on, p.inception_on) as placed
from policies p
join clients c on c.id = p.client_id
where p.status in ('in force', 'bound')
  and coalesce(p.placed_on, p.inception_on) >= current_date - 365
  and not exists (select 1 from advice_records a where a.policy_id = p.id)
  and not exists (
    select 1 from advice_records a
    where a.client_id = p.client_id
      and a.given_on between coalesce(p.placed_on, p.inception_on) - 30
                         and coalesce(p.placed_on, p.inception_on) + 30
  )
order by placed desc;
```

**Command.** `place` warns when there is no recent advice record for the client. `/advice-record`
writes one.

---

## 5. Record the nature and scope of the advice, and its limits

**Source.** Financial Markets Conduct Act 2013 section 431J: a person must not give financial
advice unless they have taken reasonable steps to ensure the client understands the nature and
scope of the advice being given, including any limitations on it. Code of Professional Conduct for
Financial Advice Services, standard 4, "ensure that the client understands the financial advice",
and standard 1, "treat clients fairly".
[fma.govt.nz](https://www.fma.govt.nz/library/guidance-library/code-of-professional-conduct-for-financial-advice-services/).

**What it means for a broker.** The limits are the point. "I advised on the material damage and
business interruption, I did not advise on the fleet or on directors and officers" is the sentence
that decides who carries an uninsured loss.

**Breach in the data.** An advice record with an empty `nature_and_scope`.

```sql
select c.name as client, a.given_on, coalesce(p.policy_no, '') as policy
from advice_records a
join clients c on c.id = a.client_id
left join policies p on p.id = a.policy_id
where coalesce(a.nature_and_scope, '') = ''
order by a.given_on desc;
```

**Command.** `npm run broking -- advice` prints MISSING in the scope column.

---

## 6. Record the reasons the advice is suitable

**Source.** Code of Professional Conduct for Financial Advice Services, standard 3, "give financial
advice that is suitable": the advice must be suitable for the client having regard to its nature
and scope, and there must be reasonable grounds for it, meaning the grounds a prudent person
engaged in giving financial advice would consider appropriate in the same circumstances. Financial
Markets Conduct Act 2013 section 431L, the duty to exercise care, diligence and skill.

**Breach in the data.** An advice record with no `reasons`.

```sql
select c.name as client, a.given_on, a.recommendation
from advice_records a
join clients c on c.id = a.client_id
where coalesce(a.reasons, '') = ''
order by a.given_on desc;
```

**Command.** `advice-record <id>` prints NOT RECORDED against every empty field.

---

## 7. Disclosure at the point the advice is given

**Source.** Financial Markets Conduct Regulations 2014, subpart 5A, regulations 229C to 229G:
publicly available information about the financial advice service, information when the nature and
scope of the advice is known, information when the advice is given, and information if a complaint
is received. Regulation 229G exempts you from repeating information the client already has and
that has not materially changed.
[legislation.govt.nz](https://www.legislation.govt.nz/regulation/public/2014/0326/latest/whole.html).

**What it means for a broker.** Four moments, not one document. The website disclosure covers the
first. The scope, fees and conflicts disclosure covers the second and third. The complaints and
dispute resolution information covers the fourth.

**Breach in the data.** An advice record with no `disclosure_given_on`, or a complaint with no
record that the complaints process was given to the complainant.

```sql
select c.name as client, a.given_on, coalesce(p.policy_no, '') as policy
from advice_records a
join clients c on c.id = a.client_id
left join policies p on p.id = a.policy_id
where a.disclosure_given_on is null
order by a.given_on desc;
```

**Command.** `npm run broking -- advice` prints MISSING in the disclosed column.

---

## 8. Keep clients informed on the progress of a claim

**Source.** Insurance Brokers Code of Practice 2022, clause 7.1(a): "We will keep clients informed
in a timely manner regarding the progress of their claim." Clause 7.1(b): notify the client of the
insurer's response as soon as it is reasonably practical. Clause 7.1(c): act as claims advocate if
a claim is unreasonably denied or reduced.

**What it means for a broker.** A silent claim is the most common complaint a brokerage receives.
Fourteen days is the threshold this system uses. Set it shorter if your terms of engagement promise
shorter.

**Breach in the data.** An open claim where the last client update, or the notification date if
there has never been one, is more than fourteen days ago.

```sql
select claim_no, client, status, days_since_client_update, reserve_cents
from v_claims_open
where days_since_client_update > 14
order by days_since_client_update desc;
```

**Command.** `npm run broking -- claims-open` counts the days. `/draft-claim-update` writes the
update to `drafts/`. `claim update <claim> "<what you told them>"` records it.

---

## 9. Complaints: acknowledge, update every ten business days, resolve inside thirty

**Source.** Insurance Brokers Code of Practice 2022, clause 9.3(a): promptly acknowledge receipt of
a complaint and provide information about the internal dispute resolution process and timeframes.
Clause 9.2(b): keep the complainant informed about progress at least every ten business days.
Clause 9.4(b): resolve a complaint within thirty calendar days from the date it is received, and if
you cannot, write to the complainant with the reasons and their right to take it to the Australian
Financial Complaints Authority. ASIC Regulatory Guide 271 sets the same thirty day maximum for
internal dispute resolution. In New Zealand a financial service provider must belong to an approved
dispute resolution scheme under the Financial Service Providers (Registration and Dispute
Resolution) Act 2008, and regulation 229F requires the complaints information to be given when a
complaint is received.

**Breach in the data.** An open complaint that was never acknowledged, or is past thirty days, or
has had no update to the complainant in the last fourteen days.

```sql
select coalesce(c.name, 'unknown client') as client, x.received_on,
       (current_date - x.received_on) as days_open, x.acknowledged_on, x.last_update_on
from complaints x
left join clients c on c.id = x.client_id
where x.status in ('open', 'investigating')
  and (x.acknowledged_on is null
       or x.received_on < current_date - 30
       or coalesce(x.last_update_on, x.received_on) < current_date - 14)
order by x.received_on;
```

**Command.** `npm run broking -- complaints`. `complaint update <id>` records an update,
`complaint resolve <id> "<outcome>"` closes it with the reasons.

---

## 10. Keep the records for seven years

**Source.** New Zealand: Tax Administration Act 1994 section 22 for business records, and the
Financial Markets Authority's record keeping information sheet for financial advice providers,
which sets seven years for records of the financial advice service.
[legislation.govt.nz](https://www.legislation.govt.nz/act/public/1994/0166/latest/whole.html).
Australia: Corporations Act 2001 sections 988A to 988E, financial records retained for seven years.

**What it means here.** Nothing in this repo deletes anything. Policies, claims, advice records,
complaints and notes are kept. Close a client with `status = 'closed'` rather than deleting the
row, so the history stays with you. Back the database up somewhere you control.

```sql
select min(inception_on) as oldest_policy, max(expiry_on) as newest_expiry, count(*) as policies
from policies;
```

**Command.** `npm run broking -- export` writes the whole database to a single JSON file.

---

## Adding your own rule

Copy the shape: a name in plain words, the source with a link and a clause number, what the breach
looks like in the data, the SQL, and the command. Then tell Claude Code to add it to `/compliance`,
which means adding it to `COMPLIANCE_RULES` in `scripts/broking.mjs` as well as here. If the rule
needs a column that does not exist yet, use `/customise` to add it first.

Rules worth adding once you know your own licence: conflicts of interest registered and reviewed
(Code clause 5.3(d) and (e), Financial Markets Conduct Act 2013 section 431K), continuing
professional development per adviser (Code of Professional Conduct standard 9), binder and cover
holder authorities in date, professional indemnity cover in place for the brokerage itself, and any
condition your own licence carries.
