-- broking-for-claude-code: core schema.
-- A general insurance brokerage: clients, contacts, insurers, policies and their
-- sections, quotes, renewals as a workflow, endorsements, claims and their events,
-- tasks, advice records, complaints and a brokerage ledger.
--
-- Runs unchanged on PGlite (embedded) and on Postgres / Supabase.
-- Money is stored in cents. Premium is what the client pays. Brokerage is what the
-- brokerage earns. Client money never touches this database: the broking trust
-- account stays in the accounting system that already holds it.

create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end
$$;

-- Brokers -------------------------------------------------------------------
-- The people. A broker gives advice, an account executive services the book, a
-- claims broker runs claims, the principal signs off.

create table if not exists brokers (
  id            uuid primary key default gen_random_uuid(),
  full_name     text not null,
  code          text,
  email         text,
  phone         text,
  role          text not null default 'broker',
  adviser_ref   text,
  active        boolean not null default true,
  started_on    date,
  external_ref  text unique,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index if not exists brokers_name_lower_idx on brokers (lower(full_name));

-- Clients -------------------------------------------------------------------
-- Businesses and individuals. headcount decides whether the small business
-- remuneration disclosure rule applies. engagement_signed_on is the terms of
-- engagement the Code requires before anyone acts.

create table if not exists clients (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null,
  client_type          text not null default 'business',
  trading_name         text,
  company_no           text,
  industry             text,
  email                text,
  phone                text,
  address              text,
  suburb               text,
  city                 text,
  region               text,
  country              text not null default 'NZ',
  status               text not null default 'active',
  broker_id            uuid references brokers(id) on delete set null,
  client_since         date,
  headcount            integer,
  engagement_signed_on date,
  retail_client        boolean not null default true,
  external_ref         text unique,
  notes                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create unique index if not exists clients_name_lower_idx on clients (lower(name));
create index if not exists clients_broker_idx on clients (broker_id);

create table if not exists contacts (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id) on delete cascade,
  full_name   text not null,
  role        text,
  email       text,
  phone       text,
  is_primary  boolean not null default false,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists contacts_client_idx on contacts (client_id);

-- Insurers ------------------------------------------------------------------
-- Insurers, underwriting agencies, Lloyd's coverholders and premium funders.

create table if not exists insurers (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  code                  text,
  kind                  text not null default 'insurer',
  underwriter_name      text,
  underwriter_email     text,
  claims_email          text,
  phone                 text,
  strength_rating       text,
  agency_agreement_ref  text,
  default_brokerage_pct numeric(5,2) not null default 0,
  active                boolean not null default true,
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create unique index if not exists insurers_name_lower_idx on insurers (lower(name));

-- Policies ------------------------------------------------------------------
-- One row per policy period. A renewal creates the next row and points back at
-- the one it replaced, so the history of a risk is a chain you can walk.

create table if not exists policies (
  id                   uuid primary key default gen_random_uuid(),
  policy_no            text not null,
  client_id            uuid not null references clients(id) on delete cascade,
  insurer_id           uuid references insurers(id) on delete set null,
  broker_id            uuid references brokers(id) on delete set null,
  class                text not null,
  cover_summary        text,
  status               text not null default 'in force',
  inception_on         date not null,
  expiry_on            date not null,
  sum_insured_cents    bigint not null default 0,
  excess_cents         bigint not null default 0,
  base_premium_cents   bigint not null default 0,
  levies_cents         bigint not null default 0,
  gst_cents            bigint not null default 0,
  gross_premium_cents  bigint not null default 0,
  brokerage_pct        numeric(5,2) not null default 0,
  brokerage_cents      bigint not null default 0,
  broker_fee_cents     bigint not null default 0,
  payment_method       text not null default 'direct',
  funder               text,
  renewal_type         text not null default 'invited',
  prior_policy_id      uuid references policies(id) on delete set null,
  placed_from_quote_id uuid,
  placed_on            date,
  insurer_ref          text,
  notes                text,
  external_ref         text unique,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create unique index if not exists policies_no_lower_idx on policies (lower(policy_no));
create index if not exists policies_client_idx on policies (client_id);
create index if not exists policies_expiry_idx on policies (expiry_on);

-- Covers: the sections inside a policy, each with its own limit and excess.

create table if not exists covers (
  id                uuid primary key default gen_random_uuid(),
  policy_id         uuid not null references policies(id) on delete cascade,
  section           text not null,
  description       text,
  sum_insured_cents bigint not null default 0,
  excess_cents      bigint not null default 0,
  limit_note        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists covers_policy_idx on covers (policy_id);

-- Renewals ------------------------------------------------------------------
-- A renewal is a workflow row with stages, not a date on a policy. One per
-- policy period being renewed.

create table if not exists renewals (
  id                    uuid primary key default gen_random_uuid(),
  policy_id             uuid not null references policies(id) on delete cascade,
  due_on                date not null,
  stage                 text not null default 'not started',
  broker_id             uuid references brokers(id) on delete set null,
  invited_on            date,
  client_contacted_on   date,
  terms_due_on          date,
  presented_on          date,
  instructed_on         date,
  bound_on              date,
  closed_on             date,
  premium_last_cents    bigint not null default 0,
  premium_offered_cents bigint not null default 0,
  new_policy_id         uuid references policies(id) on delete set null,
  outcome               text,
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create unique index if not exists renewals_policy_idx on renewals (policy_id);

-- Quotes --------------------------------------------------------------------
-- What you asked the market for and what came back. A quote that is accepted
-- becomes a policy through `place`.

create table if not exists quotes (
  id                uuid primary key default gen_random_uuid(),
  quote_ref         text,
  client_id         uuid not null references clients(id) on delete cascade,
  insurer_id        uuid references insurers(id) on delete set null,
  policy_id         uuid references policies(id) on delete set null,
  renewal_id        uuid references renewals(id) on delete set null,
  purpose           text not null default 'new business',
  class             text not null,
  requested_on      date not null default current_date,
  due_on            date,
  received_on       date,
  status            text not null default 'requested',
  premium_cents     bigint not null default 0,
  brokerage_pct     numeric(5,2) not null default 0,
  excess_cents      bigint not null default 0,
  sum_insured_cents bigint not null default 0,
  terms             text,
  decline_reason    text,
  lost_reason       text,
  broker_id         uuid references brokers(id) on delete set null,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create unique index if not exists quotes_ref_lower_idx on quotes (lower(quote_ref));
create index if not exists quotes_client_idx on quotes (client_id);

-- Endorsements --------------------------------------------------------------
-- Mid term changes. A change instructed and not confirmed by the insurer is the
-- gap that turns into an uninsured loss.

create table if not exists endorsements (
  id                         uuid primary key default gen_random_uuid(),
  endorsement_no             text not null,
  policy_id                  uuid not null references policies(id) on delete cascade,
  kind                       text not null default 'change',
  effective_on               date not null,
  requested_on               date not null default current_date,
  confirmed_on               date,
  description                text not null,
  status                     text not null default 'requested',
  premium_adjustment_cents   bigint not null default 0,
  brokerage_adjustment_cents bigint not null default 0,
  insurer_ref                text,
  broker_id                  uuid references brokers(id) on delete set null,
  notes                      text,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);
create unique index if not exists endorsements_no_lower_idx on endorsements (lower(endorsement_no));
create index if not exists endorsements_policy_idx on endorsements (policy_id);

-- Claims --------------------------------------------------------------------

create table if not exists claims (
  id                    uuid primary key default gen_random_uuid(),
  claim_no              text not null,
  policy_id             uuid not null references policies(id) on delete cascade,
  client_id             uuid not null references clients(id) on delete cascade,
  insurer_id            uuid references insurers(id) on delete set null,
  insurer_claim_ref     text,
  class                 text,
  loss_on               date not null,
  notified_on           date not null default current_date,
  description           text not null,
  status                text not null default 'notified',
  reserve_cents         bigint not null default 0,
  excess_cents          bigint not null default 0,
  settled_cents         bigint not null default 0,
  settled_on            date,
  closed_on             date,
  last_client_update_on date,
  last_insurer_update_on date,
  broker_id             uuid references brokers(id) on delete set null,
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create unique index if not exists claims_no_lower_idx on claims (lower(claim_no));
create index if not exists claims_policy_idx on claims (policy_id);

create table if not exists claim_events (
  id          uuid primary key default gen_random_uuid(),
  claim_id    uuid not null references claims(id) on delete cascade,
  happened_on date not null default current_date,
  kind        text not null,
  note        text,
  actor       text,
  created_at  timestamptz not null default now()
);
create index if not exists claim_events_claim_idx on claim_events (claim_id);

-- Tasks ---------------------------------------------------------------------

create table if not exists tasks (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  kind        text not null default 'follow up',
  client_id   uuid references clients(id) on delete cascade,
  policy_id   uuid references policies(id) on delete cascade,
  claim_id    uuid references claims(id) on delete cascade,
  renewal_id  uuid references renewals(id) on delete cascade,
  due_on      date,
  status      text not null default 'open',
  broker_id   uuid references brokers(id) on delete set null,
  done_on     date,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists tasks_status_idx on tasks (status, due_on);

-- Advice records ------------------------------------------------------------
-- What was recommended, why, what else was considered, what was disclosed and
-- when. This is the record a regulator asks for and the one a claim dispute
-- turns on.

create table if not exists advice_records (
  id                      uuid primary key default gen_random_uuid(),
  client_id               uuid not null references clients(id) on delete cascade,
  policy_id               uuid references policies(id) on delete set null,
  renewal_id              uuid references renewals(id) on delete set null,
  broker_id               uuid references brokers(id) on delete set null,
  given_on                date not null default current_date,
  method                  text not null default 'meeting',
  nature_and_scope        text,
  needs_and_circumstances text,
  recommendation          text,
  reasons                 text,
  alternatives_considered text,
  risks_disclosed         text,
  limitations             text,
  disclosure_stage        text not null default 'advice given',
  disclosure_given_on     date,
  remuneration_disclosed  boolean not null default false,
  remuneration_note       text,
  client_confirmed_on     date,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create index if not exists advice_client_idx on advice_records (client_id);
create index if not exists advice_policy_idx on advice_records (policy_id);

-- Brokerage ledger ----------------------------------------------------------
-- What the brokerage earned and whether it has landed. Not client money, not a
-- trust account, not a receivables ledger. Earnings only.

create table if not exists commissions (
  id            uuid primary key default gen_random_uuid(),
  policy_id     uuid references policies(id) on delete cascade,
  client_id     uuid references clients(id) on delete set null,
  insurer_id    uuid references insurers(id) on delete set null,
  kind          text not null default 'brokerage',
  earned_on     date not null default current_date,
  period_month  date not null,
  amount_cents  bigint not null default 0,
  gst_cents     bigint not null default 0,
  status        text not null default 'accrued',
  invoice_ref   text,
  received_on   date,
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists commissions_month_idx on commissions (period_month);
create index if not exists commissions_policy_idx on commissions (policy_id);

-- Complaints ----------------------------------------------------------------

create table if not exists complaints (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid references clients(id) on delete set null,
  policy_id       uuid references policies(id) on delete set null,
  claim_id        uuid references claims(id) on delete set null,
  received_on     date not null default current_date,
  about           text not null,
  channel         text,
  status          text not null default 'open',
  acknowledged_on date,
  last_update_on  date,
  resolved_on     date,
  outcome         text,
  broker_id       uuid references brokers(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Client notes --------------------------------------------------------------

create table if not exists client_notes (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id) on delete cascade,
  policy_id   uuid references policies(id) on delete set null,
  kind        text not null default 'note',
  happened_on date not null default current_date,
  body        text not null,
  created_by  text,
  created_at  timestamptz not null default now()
);
create index if not exists client_notes_client_idx on client_notes (client_id, happened_on desc);

-- updated_at triggers -------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'brokers', 'clients', 'contacts', 'insurers', 'policies', 'covers', 'renewals',
    'quotes', 'endorsements', 'claims', 'tasks', 'advice_records', 'commissions', 'complaints'
  ] loop
    execute format('drop trigger if exists set_updated_at_%1$s on %1$s', t);
    execute format('create trigger set_updated_at_%1$s before update on %1$s for each row execute function set_updated_at()', t);
  end loop;
end
$$;

-- Views ---------------------------------------------------------------------

-- The heartbeat. Everything expiring inside ninety days, banded the way a
-- brokerage runs its renewal cycle: sixty, thirty, fourteen, expired.
create or replace view v_renewals_due as
select
  p.id                                    as policy_id,
  p.policy_no,
  c.id                                    as client_id,
  c.name                                  as client,
  c.client_type,
  p.class,
  coalesce(i.name, 'not placed')          as insurer,
  coalesce(b.full_name, 'unassigned')     as broker,
  b.id                                    as broker_id,
  p.inception_on,
  p.expiry_on,
  (p.expiry_on - current_date)            as days_to_expiry,
  case
    when p.expiry_on < current_date            then 'expired'
    when p.expiry_on <= current_date + 14      then '14 day'
    when p.expiry_on <= current_date + 30      then '30 day'
    when p.expiry_on <= current_date + 60      then '60 day'
    else '90 day'
  end                                     as band,
  coalesce(r.stage, 'not started')        as stage,
  r.id                                    as renewal_id,
  r.client_contacted_on,
  case when r.client_contacted_on is null then null
       else (current_date - r.client_contacted_on) end as days_since_contact,
  r.terms_due_on,
  p.renewal_type,
  p.payment_method,
  p.gross_premium_cents,
  p.brokerage_cents,
  coalesce(r.premium_offered_cents, 0)    as premium_offered_cents,
  (select count(*) from quotes q where q.renewal_id = r.id)                        as quotes,
  (select count(*) from claims cl where cl.policy_id = p.id and cl.closed_on is null) as open_claims
from policies p
join clients c on c.id = p.client_id
left join insurers i on i.id = p.insurer_id
left join brokers b on b.id = p.broker_id
left join renewals r on r.policy_id = p.id
where p.status in ('in force', 'bound')
  and p.expiry_on <= current_date + 90;

-- Every claim still open, with how long since anyone told the client anything.
create or replace view v_claims_open as
select
  cl.id                                as claim_id,
  cl.claim_no,
  c.id                                 as client_id,
  c.name                               as client,
  p.policy_no,
  p.class,
  coalesce(i.name, '')                 as insurer,
  coalesce(cl.insurer_claim_ref, '')   as insurer_ref,
  coalesce(b.full_name, 'unassigned')  as broker,
  b.id                                 as broker_id,
  cl.status,
  cl.loss_on,
  cl.notified_on,
  (current_date - cl.notified_on)      as days_open,
  cl.last_client_update_on,
  case when cl.last_client_update_on is null then (current_date - cl.notified_on)
       else (current_date - cl.last_client_update_on) end as days_since_client_update,
  cl.reserve_cents,
  cl.excess_cents,
  cl.settled_cents,
  (select count(*) from claim_events e where e.claim_id = cl.id)          as events,
  (select max(e.happened_on) from claim_events e where e.claim_id = cl.id) as last_event_on,
  cl.description
from claims cl
join clients c on c.id = cl.client_id
join policies p on p.id = cl.policy_id
left join insurers i on i.id = cl.insurer_id
left join brokers b on b.id = cl.broker_id
where cl.closed_on is null
  and cl.status <> 'withdrawn';

-- One row per client: what is on cover, what it earns, what is open, how long
-- since anyone spoke to them.
create or replace view v_client_health as
select
  c.id                                as client_id,
  c.name                              as client,
  c.client_type,
  c.status,
  coalesce(b.full_name, 'unassigned') as broker,
  coalesce(c.city, '')                as city,
  coalesce(c.industry, '')            as industry,
  c.headcount,
  c.engagement_signed_on,
  (select count(*) from policies p where p.client_id = c.id and p.status = 'in force') as policies_in_force,
  (select coalesce(sum(p.gross_premium_cents), 0) from policies p where p.client_id = c.id and p.status = 'in force') as premium_cents,
  (select coalesce(sum(p.brokerage_cents + p.broker_fee_cents), 0) from policies p where p.client_id = c.id and p.status = 'in force') as brokerage_cents,
  (select min(p.expiry_on) from policies p where p.client_id = c.id and p.status = 'in force') as next_expiry_on,
  (select count(*) from claims cl where cl.client_id = c.id and cl.closed_on is null) as open_claims,
  (select count(*) from claims cl where cl.client_id = c.id and cl.notified_on >= current_date - 1095) as claims_3y,
  (select coalesce(sum(cl.settled_cents), 0) from claims cl where cl.client_id = c.id and cl.notified_on >= current_date - 1095) as claims_paid_3y_cents,
  (select max(n.happened_on) from client_notes n where n.client_id = c.id) as last_contact_on,
  (select current_date - max(n.happened_on) from client_notes n where n.client_id = c.id) as days_since_contact,
  (select max(a.given_on) from advice_records a where a.client_id = c.id) as last_advice_on,
  (select count(*) from complaints x where x.client_id = c.id and x.status in ('open', 'investigating')) as open_complaints
from clients c
left join brokers b on b.id = c.broker_id;

-- Brokerage earned by month, and how much of it has actually landed.
create or replace view v_commission_month as
select
  to_char(period_month, 'YYYY-MM')  as month,
  period_month,
  count(*)                          as entries,
  coalesce(sum(amount_cents), 0)    as total_cents,
  coalesce(sum(gst_cents), 0)       as gst_cents,
  coalesce(sum(case when status = 'accrued'     then amount_cents else 0 end), 0) as accrued_cents,
  coalesce(sum(case when status = 'invoiced'    then amount_cents else 0 end), 0) as invoiced_cents,
  coalesce(sum(case when status = 'received'    then amount_cents else 0 end), 0) as received_cents,
  coalesce(sum(case when status = 'written off' then amount_cents else 0 end), 0) as written_off_cents,
  coalesce(sum(case when kind = 'brokerage'  then amount_cents else 0 end), 0) as brokerage_cents,
  coalesce(sum(case when kind = 'broker fee' then amount_cents else 0 end), 0) as fees_cents,
  coalesce(sum(case when kind = 'endorsement' then amount_cents else 0 end), 0) as endorsement_cents
from commissions
group by period_month;

-- Everything that wants a decision this week, worst first.
create or replace view v_attention_due as
select 'renewal_no_contact' as reason,
       p.policy_no as label,
       c.name as client,
       coalesce(b.full_name, 'unassigned') as broker,
       (p.expiry_on - current_date) as days,
       p.gross_premium_cents as amount_cents,
       'Expires ' || to_char(p.expiry_on, 'DD Mon') || ', nobody has contacted the client' as detail
from policies p
join clients c on c.id = p.client_id
left join brokers b on b.id = p.broker_id
left join renewals r on r.policy_id = p.id
where p.status in ('in force', 'bound')
  and p.renewal_type <> 'closed'
  and p.expiry_on >= current_date
  and p.expiry_on <= current_date + 30
  and (r.id is null or r.client_contacted_on is null)

union all
select 'renewal_expired',
       p.policy_no,
       c.name,
       coalesce(b.full_name, 'unassigned'),
       (current_date - p.expiry_on),
       p.gross_premium_cents,
       'Expired ' || to_char(p.expiry_on, 'DD Mon') || ' and still marked in force'
from policies p
join clients c on c.id = p.client_id
left join brokers b on b.id = p.broker_id
where p.status in ('in force', 'bound')
  and p.expiry_on < current_date

union all
select 'renewal_stuck',
       p.policy_no,
       c.name,
       coalesce(b.full_name, 'unassigned'),
       (current_date - r.terms_due_on),
       p.gross_premium_cents,
       'In market since ' || to_char(coalesce(r.invited_on, r.created_at::date), 'DD Mon') || ', terms were due ' || to_char(r.terms_due_on, 'DD Mon')
from renewals r
join policies p on p.id = r.policy_id
join clients c on c.id = p.client_id
left join brokers b on b.id = p.broker_id
where r.stage in ('in market', 'reviewing')
  and r.terms_due_on is not null
  and r.terms_due_on < current_date
  and r.closed_on is null

union all
select 'claim_no_update',
       cl.claim_no,
       c.name,
       coalesce(b.full_name, 'unassigned'),
       case when cl.last_client_update_on is null then (current_date - cl.notified_on)
            else (current_date - cl.last_client_update_on) end,
       cl.reserve_cents,
       'Claim at "' || cl.status || '" and the client has not been told anything'
from claims cl
join clients c on c.id = cl.client_id
left join brokers b on b.id = cl.broker_id
where cl.closed_on is null
  and cl.status <> 'withdrawn'
  and case when cl.last_client_update_on is null then (current_date - cl.notified_on)
           else (current_date - cl.last_client_update_on) end > 14

union all
select 'claim_not_acknowledged',
       cl.claim_no,
       c.name,
       coalesce(b.full_name, 'unassigned'),
       (current_date - cl.notified_on),
       cl.reserve_cents,
       'Notified to ' || coalesce(i.name, 'the insurer') || ' and no acknowledgement on file'
from claims cl
join clients c on c.id = cl.client_id
left join insurers i on i.id = cl.insurer_id
left join brokers b on b.id = cl.broker_id
where cl.closed_on is null
  and cl.status = 'notified'
  and cl.notified_on < current_date - 5

union all
select 'endorsement_unconfirmed',
       e.endorsement_no,
       c.name,
       coalesce(b.full_name, 'unassigned'),
       (current_date - e.requested_on),
       e.premium_adjustment_cents,
       'Cover changed on ' || to_char(e.effective_on, 'DD Mon') || ' and the insurer has not confirmed it'
from endorsements e
join policies p on p.id = e.policy_id
join clients c on c.id = p.client_id
left join brokers b on b.id = e.broker_id
where e.status in ('requested', 'with insurer')
  and e.requested_on < current_date - 7

union all
select 'quote_chase',
       coalesce(q.quote_ref, 'quote'),
       c.name,
       coalesce(b.full_name, 'unassigned'),
       (current_date - q.due_on),
       q.sum_insured_cents,
       coalesce(i.name, 'The market') || ' owes terms on ' || q.class
from quotes q
join clients c on c.id = q.client_id
left join insurers i on i.id = q.insurer_id
left join brokers b on b.id = q.broker_id
where q.status = 'requested'
  and q.due_on is not null
  and q.due_on < current_date

union all
select 'advice_missing',
       p.policy_no,
       c.name,
       coalesce(b.full_name, 'unassigned'),
       (current_date - coalesce(p.placed_on, p.inception_on)),
       p.gross_premium_cents,
       'Placed ' || to_char(coalesce(p.placed_on, p.inception_on), 'DD Mon') || ' with no advice record'
from policies p
join clients c on c.id = p.client_id
left join brokers b on b.id = p.broker_id
where p.status in ('in force', 'bound')
  and coalesce(p.placed_on, p.inception_on) >= current_date - 120
  and not exists (select 1 from advice_records a where a.policy_id = p.id)
  and not exists (
    select 1 from advice_records a
    where a.client_id = p.client_id
      and a.given_on between coalesce(p.placed_on, p.inception_on) - 30 and coalesce(p.placed_on, p.inception_on) + 30
  )

union all
select 'remuneration_not_disclosed',
       coalesce(p.policy_no, 'advice ' || to_char(a.given_on, 'DD Mon')),
       c.name,
       coalesce(b.full_name, 'unassigned'),
       (current_date - a.given_on),
       coalesce(p.brokerage_cents, 0),
       'Advice given to a ' || case when c.client_type = 'individual' then 'private client' else 'small business' end || ' with no remuneration disclosure'
from advice_records a
join clients c on c.id = a.client_id
left join policies p on p.id = a.policy_id
left join brokers b on b.id = a.broker_id
where not a.remuneration_disclosed
  and (c.client_type = 'individual' or coalesce(c.headcount, 0) < 20)

union all
select 'complaint_overdue',
       'complaint',
       coalesce(c.name, 'unknown client'),
       coalesce(b.full_name, 'unassigned'),
       (current_date - x.received_on),
       0,
       'Received ' || to_char(x.received_on, 'DD Mon') || ' about ' || x.about
from complaints x
left join clients c on c.id = x.client_id
left join brokers b on b.id = x.broker_id
where x.status in ('open', 'investigating')
  and x.received_on < current_date - 30

union all
select 'task_overdue',
       t.title,
       coalesce(c.name, ''),
       coalesce(b.full_name, 'unassigned'),
       (current_date - t.due_on),
       0,
       'Due ' || to_char(t.due_on, 'DD Mon')
from tasks t
left join clients c on c.id = t.client_id
left join brokers b on b.id = t.broker_id
where t.status = 'open'
  and t.due_on is not null
  and t.due_on < current_date

union all
select 'commission_unreconciled',
       coalesce(p.policy_no, 'brokerage'),
       coalesce(c.name, ''),
       coalesce(b.full_name, 'unassigned'),
       (current_date - m.earned_on),
       m.amount_cents,
       'Earned ' || to_char(m.earned_on, 'DD Mon') || ' from ' || coalesce(i.name, 'the insurer') || ' and never reconciled'
from commissions m
left join policies p on p.id = m.policy_id
left join clients c on c.id = m.client_id
left join insurers i on i.id = m.insurer_id
left join brokers b on b.id = p.broker_id
where m.status = 'accrued'
  and m.earned_on < current_date - 60

union all
select 'client_quiet',
       coalesce(c.trading_name, c.name),
       c.name,
       coalesce(b.full_name, 'unassigned'),
       coalesce((select current_date - max(n.happened_on) from client_notes n where n.client_id = c.id), 999),
       (select coalesce(sum(p.gross_premium_cents), 0) from policies p where p.client_id = c.id and p.status = 'in force'),
       'On cover and nobody has spoken to them'
from clients c
left join brokers b on b.id = c.broker_id
where c.status = 'active'
  and exists (select 1 from policies p where p.client_id = c.id and p.status = 'in force')
  and coalesce((select current_date - max(n.happened_on) from client_notes n where n.client_id = c.id), 999) > 180;
