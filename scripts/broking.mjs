#!/usr/bin/env node
// broking-for-claude-code: the one CLI. Claude Code slash commands call this; so can you.
//
//   node scripts/broking.mjs <command> [args] [--flags] [--json]
//
// Run with no arguments (or `help`) for the command list.
//
// This system records the policy lifecycle, advice, claims, tasks and brokerage.
// It never touches client money. The broking trust account stays where it is.

import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { getDb, REPO_ROOT } from './lib/db.mjs';
import { parseCsv, pick } from './lib/csv.mjs';
import { table, money, price, isoDate, short, truncate, heading } from './lib/format.mjs';

// ---------------------------------------------------------------------------
// Argument parsing

const BOOL_FLAGS = new Set([
  'json', 'help', 'all', 'open', 'closed', 'dry-run', 'disclosed', 'csv', 'detail',
  'expired', 'unplaced', 'mine', 'breaches',
]);

function parseArgv(argv) {
  const args = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') {
      flags.help = true;
      continue;
    }
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      let name;
      let value;
      if (eq > -1) {
        name = a.slice(2, eq);
        value = a.slice(eq + 1);
      } else {
        name = a.slice(2);
        const next = argv[i + 1];
        if (BOOL_FLAGS.has(name) || next === undefined || next.startsWith('--')) value = true;
        else value = argv[++i];
      }
      flags[name] = value;
    } else {
      args.push(a);
    }
  }
  return { args, flags };
}

class CliError extends Error {
  constructor(message, code = 1) {
    super(message);
    this.code = code;
  }
}

const num = (v) => Number(v ?? 0);
const str = (v) => (v === true || v === undefined || v === null ? '' : String(v));
const pctText = (v) => (v === null || v === undefined ? '' : `${Number(v)}%`);

// ---------------------------------------------------------------------------
// Dates

function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  const pad = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addYears(iso, n) {
  const d = new Date(`${iso}T00:00:00`);
  d.setFullYear(d.getFullYear() + n);
  const pad = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseDate(v, what = 'date') {
  if (!v || v === true) return null;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const lower = s.toLowerCase();
  if (lower === 'today') return today();
  if (lower === 'yesterday') return addDays(today(), -1);
  if (lower === 'tomorrow') return addDays(today(), 1);
  // Broking exports in New Zealand and Australia write DD/MM/YYYY, so the first
  // number is the day unless the second one is too big to be a month.
  const slash = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (slash) {
    const a = Number(slash[1]);
    const b = Number(slash[2]);
    const [day, month] = b > 12 ? [b, a] : [a, b];
    const year = slash[3].length === 2 ? `20${slash[3]}` : slash[3];
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw new CliError(`"${v}" is not a ${what}. Use YYYY-MM-DD.`);
  return isoDate(d);
}

function parseMoney(v) {
  if (v === undefined || v === null || v === '' || v === true) return 0;
  const n = Number(String(v).replace(/[^0-9.-]/g, ''));
  if (Number.isNaN(n)) throw new CliError(`"${v}" is not an amount.`);
  return Math.round(n * 100);
}

function parsePct(v) {
  if (v === undefined || v === null || v === '' || v === true) return 0;
  const n = Number(String(v).replace(/[^0-9.-]/g, ''));
  if (Number.isNaN(n)) throw new CliError(`"${v}" is not a percentage.`);
  return n;
}

// ---------------------------------------------------------------------------
// Lookups: full id, first 4+ characters of an id, exact code, name or number,
// then contains. One hit wins. Several hits list the candidates and exit 1.

const RESOLVERS = {
  client: {
    from: 'clients c left join brokers b on b.id = c.broker_id',
    cols: 'c.*, b.full_name as broker_name',
    exact: 'lower(c.name) = lower($1) or lower(c.trading_name) = lower($1) or lower(c.company_no) = lower($1) or lower(c.external_ref) = lower($1)',
    fuzzy: 'c.name ilike $1 or c.trading_name ilike $1 or c.city ilike $1',
    label: (r) => `${r.name}${r.city ? ` (${r.city})` : ''}${r.status === 'active' ? '' : `, ${r.status}`}`,
    order: 'c.name',
    listing: 'clients --all',
  },
  broker: {
    from: 'brokers c',
    cols: 'c.*',
    exact: 'lower(c.full_name) = lower($1) or lower(c.code) = lower($1) or lower(c.email) = lower($1)',
    fuzzy: 'c.full_name ilike $1 or c.code ilike $1',
    label: (r) => `${r.full_name} (${r.role})`,
    order: 'c.full_name',
    listing: 'brokers',
  },
  insurer: {
    from: 'insurers c',
    cols: 'c.*',
    exact: 'lower(c.name) = lower($1) or lower(c.code) = lower($1)',
    fuzzy: 'c.name ilike $1 or c.code ilike $1 or c.underwriter_name ilike $1',
    label: (r) => `${r.name} (${r.kind})`,
    order: 'c.name',
    listing: 'insurers --all',
  },
  policy: {
    from: 'policies c join clients cl on cl.id = c.client_id left join insurers i on i.id = c.insurer_id left join brokers b on b.id = c.broker_id',
    cols: 'c.*, cl.name as client_name, cl.client_type, cl.headcount, i.name as insurer_name, i.claims_email, b.full_name as broker_name',
    exact: 'lower(c.policy_no) = lower($1) or lower(c.insurer_ref) = lower($1) or lower(c.external_ref) = lower($1)',
    fuzzy: 'c.policy_no ilike $1 or cl.name ilike $1 or c.class ilike $1',
    label: (r) => `${r.policy_no}  ${r.client_name} ${r.class} (expires ${isoDate(r.expiry_on)})`,
    order: 'c.expiry_on',
    listing: 'policies --all',
  },
  quote: {
    from: 'quotes c join clients cl on cl.id = c.client_id left join insurers i on i.id = c.insurer_id',
    cols: 'c.*, cl.name as client_name, i.name as insurer_name',
    exact: 'lower(c.quote_ref) = lower($1)',
    fuzzy: 'c.quote_ref ilike $1 or cl.name ilike $1',
    label: (r) => `${r.quote_ref || short(r.id)}  ${r.client_name} ${r.class} (${r.status})`,
    order: 'c.requested_on desc',
    listing: 'quotes --all',
  },
  claim: {
    from: 'claims c join clients cl on cl.id = c.client_id join policies p on p.id = c.policy_id left join insurers i on i.id = c.insurer_id left join brokers b on b.id = c.broker_id',
    cols: 'c.*, cl.name as client_name, p.policy_no, i.name as insurer_name, i.claims_email, b.full_name as broker_name',
    exact: 'lower(c.claim_no) = lower($1) or lower(c.insurer_claim_ref) = lower($1)',
    fuzzy: 'c.claim_no ilike $1 or cl.name ilike $1',
    label: (r) => `${r.claim_no}  ${r.client_name} (${r.status})`,
    order: 'c.notified_on desc',
    listing: 'claims --all',
  },
  endorsement: {
    from: 'endorsements c join policies p on p.id = c.policy_id join clients cl on cl.id = p.client_id',
    cols: 'c.*, p.policy_no, cl.name as client_name',
    exact: 'lower(c.endorsement_no) = lower($1)',
    fuzzy: 'c.endorsement_no ilike $1 or cl.name ilike $1 or p.policy_no ilike $1',
    label: (r) => `${r.endorsement_no}  ${r.client_name} ${r.policy_no} (${r.status})`,
    order: 'c.requested_on desc',
    listing: 'endorsements --all',
  },
  task: {
    from: 'tasks c left join clients cl on cl.id = c.client_id',
    cols: 'c.*, cl.name as client_name',
    exact: 'lower(c.title) = lower($1)',
    fuzzy: 'c.title ilike $1 or cl.name ilike $1',
    label: (r) => `${short(r.id)}  ${truncate(r.title, 50)} (${r.status})`,
    order: 'c.due_on',
    listing: 'tasks --all',
  },
  complaint: {
    from: 'complaints c left join clients cl on cl.id = c.client_id',
    cols: 'c.*, cl.name as client_name',
    exact: 'lower(c.about) = lower($1)',
    fuzzy: 'c.about ilike $1 or cl.name ilike $1',
    label: (r) => `${short(r.id)}  ${r.client_name || 'unknown'} (${r.status}, received ${isoDate(r.received_on)})`,
    order: 'c.received_on desc',
    listing: 'complaints --all',
  },
  advice: {
    from: 'advice_records c join clients cl on cl.id = c.client_id left join policies p on p.id = c.policy_id',
    cols: 'c.*, cl.name as client_name, p.policy_no',
    exact: "lower(coalesce(p.policy_no, '')) = lower($1)",
    fuzzy: 'cl.name ilike $1',
    label: (r) => `${short(r.id)}  ${r.client_name} ${isoDate(r.given_on)}${r.policy_no ? ` (${r.policy_no})` : ''}`,
    order: 'c.given_on desc',
    listing: 'advice',
  },
};

const ID_RE = /^[0-9a-f]{4,8}(-[0-9a-f-]*)?$/i;

async function resolve(db, kind, q, { optional = false } = {}) {
  const spec = RESOLVERS[kind];
  q = String(q ?? '').trim();
  if (!q || q === 'true') {
    if (optional) return null;
    throw new CliError(`Give me a ${kind} name, number or id.`);
  }
  const select = `select ${spec.cols} from ${spec.from}`;
  let rows = [];
  if (ID_RE.test(q)) {
    rows = await db.query(`${select} where c.id::text like $1 order by ${spec.order}`, [q.toLowerCase() + '%']);
    if (rows.length === 1) return rows[0];
  }
  if (!rows.length) rows = await db.query(`${select} where ${spec.exact} order by ${spec.order}`, [q]);
  if (rows.length === 1) return rows[0];
  if (!rows.length) rows = await db.query(`${select} where ${spec.fuzzy} order by ${spec.order}`, [`%${q}%`]);
  if (rows.length === 1) return rows[0];
  if (!rows.length) {
    if (optional) return null;
    throw new CliError(`No ${kind} matches "${q}". Run \`${spec.listing}\` to see what exists.`);
  }
  throw new CliError(
    `"${q}" matches ${rows.length} ${kind}s. Use a number, an id, or a longer name:\n` +
      rows.map((r) => `  ${short(r.id)}  ${spec.label(r)}`).join('\n'),
  );
}

// The broker doing the work: --broker, BROKING_BROKER, or the only active broker.
async function whoIs(db, flags, { optional = true } = {}) {
  const named = flags.broker || process.env.BROKING_BROKER;
  if (named && named !== true) return resolve(db, 'broker', named);
  const rows = await db.query("select * from brokers where active order by full_name");
  if (rows.length === 1) return rows[0];
  if (optional) return null;
  if (!rows.length) throw new CliError('No brokers on file. Add one: add broker "<name>"');
  throw new CliError(
    'Several brokers work here. Pass --broker= (or set BROKING_BROKER):\n' +
      rows.map((r) => `  ${r.code || short(r.id)}  ${r.full_name}`).join('\n'),
  );
}

// ---------------------------------------------------------------------------
// Reads

async function cmdClients(db, args, flags) {
  const q = args.join(' ').trim();
  const where = [];
  const params = [];
  if (!flags.all) where.push("h.status = 'active'");
  if (flags.status && flags.status !== true) {
    params.push(String(flags.status));
    where.push(`h.status = $${params.length}`);
  }
  if (flags.broker && flags.broker !== true) {
    const b = await resolve(db, 'broker', flags.broker);
    params.push(b.full_name);
    where.push(`h.broker = $${params.length}`);
  }
  if (q) {
    params.push(`%${q}%`);
    where.push(`(h.client ilike $${params.length} or h.city ilike $${params.length} or h.industry ilike $${params.length})`);
  }
  const rows = await db.query(
    `select * from v_client_health h ${where.length ? 'where ' + where.join(' and ') : ''} order by premium_cents desc`,
    params,
  );
  const text =
    heading(`Clients (${rows.length})`) +
    '\n' +
    table(rows, [
      { key: 'client', label: 'Client', width: 34 },
      { key: 'client_type', label: 'Type', width: 10 },
      { key: 'broker', label: 'Broker', width: 14 },
      { key: 'policies_in_force', label: 'Policies', align: 'right' },
      { key: 'premium_cents', label: 'Premium', align: 'right', format: (v) => money(v) },
      { key: 'brokerage_cents', label: 'Brokerage', align: 'right', format: (v) => money(v) },
      { key: 'next_expiry_on', label: 'Next expiry', format: (v) => isoDate(v) },
      { key: 'open_claims', label: 'Claims', align: 'right' },
      { key: 'days_since_contact', label: 'Last spoke', align: 'right', format: (v) => (v === null ? 'never' : `${v}d`) },
    ]);
  return { text, json: rows };
}

async function cmdClient(db, args) {
  const client = await resolve(db, 'client', args.join(' '));
  const [health] = await db.query('select * from v_client_health where client_id = $1', [client.id]);
  const contacts = await db.query('select * from contacts where client_id = $1 order by is_primary desc, full_name', [client.id]);
  const policies = await db.query(
    `select p.*, i.name as insurer_name, (p.expiry_on - current_date) as days_to_expiry
     from policies p left join insurers i on i.id = p.insurer_id
     where p.client_id = $1 order by p.status, p.expiry_on`,
    [client.id],
  );
  const claims = await db.query(
    `select c.*, p.policy_no from claims c join policies p on p.id = c.policy_id
     where c.client_id = $1 order by c.notified_on desc limit 8`,
    [client.id],
  );
  const advice = await db.query(
    `select a.*, p.policy_no from advice_records a left join policies p on p.id = a.policy_id
     where a.client_id = $1 order by a.given_on desc limit 6`,
    [client.id],
  );
  const notes = await db.query('select * from client_notes where client_id = $1 order by happened_on desc limit 8', [client.id]);
  const openTasks = await db.query(
    "select * from tasks where client_id = $1 and status = 'open' order by due_on",
    [client.id],
  );
  const [brokerage] = await db.query(
    `select coalesce(sum(amount_cents), 0) as year_cents
     from commissions where client_id = $1 and earned_on >= current_date - 365`,
    [client.id],
  );

  const lines = [];
  lines.push(heading(`${client.name}${client.trading_name ? ` (${client.trading_name})` : ''}`));
  lines.push(`  ${client.client_type === 'individual' ? 'Private client' : client.industry || 'Business'}${client.headcount ? `, ${client.headcount} staff` : ''}`);
  lines.push(`  ${[client.address, client.suburb, client.city].filter(Boolean).join(', ')}`);
  lines.push(`  Broker ${client.broker_name || 'unassigned'}. Client since ${isoDate(client.client_since) || 'unknown'}.`);
  lines.push(
    `  Terms of engagement: ${client.engagement_signed_on ? `signed ${isoDate(client.engagement_signed_on)}` : 'NOT ON FILE'}`,
  );
  lines.push(
    `  ${num(health?.policies_in_force)} policies in force, ${money(health?.premium_cents)} premium, ${money(health?.brokerage_cents)} brokerage a year. ${money(brokerage?.year_cents)} earned in the last twelve months.`,
  );
  if (contacts.length) {
    lines.push(heading('Contacts'));
    lines.push(
      table(contacts, [
        { key: 'full_name', label: 'Name', width: 24 },
        { key: 'role', label: 'Role', width: 22 },
        { key: 'email', label: 'Email', width: 28 },
        { key: 'phone', label: 'Phone', width: 14 },
        { key: 'is_primary', label: 'Primary', format: (v) => (v ? 'yes' : '') },
      ]),
    );
  }
  lines.push(heading('Policies'));
  lines.push(
    table(policies, [
      { key: 'policy_no', label: 'Policy', width: 12 },
      { key: 'class', label: 'Class', width: 22 },
      { key: 'insurer_name', label: 'Insurer', width: 20 },
      { key: 'status', label: 'Status', width: 10 },
      { key: 'expiry_on', label: 'Expires', format: (v) => isoDate(v) },
      { key: 'days_to_expiry', label: 'In', align: 'right', format: (v) => (num(v) < 0 ? `${-num(v)}d ago` : `${v}d`) },
      { key: 'gross_premium_cents', label: 'Premium', align: 'right', format: (v) => money(v) },
      { key: 'brokerage_cents', label: 'Brokerage', align: 'right', format: (v) => money(v) },
    ]),
  );
  if (claims.length) {
    lines.push(heading('Claims'));
    lines.push(
      table(claims, [
        { key: 'claim_no', label: 'Claim', width: 12 },
        { key: 'policy_no', label: 'Policy', width: 12 },
        { key: 'loss_on', label: 'Loss', format: (v) => isoDate(v) },
        { key: 'status', label: 'Status', width: 20 },
        { key: 'reserve_cents', label: 'Reserve', align: 'right', format: (v) => money(v) },
        { key: 'settled_cents', label: 'Settled', align: 'right', format: (v) => (num(v) ? money(v) : '') },
        { key: 'description', label: 'What happened', width: 44, format: (v) => truncate(v, 44) },
      ]),
    );
  }
  lines.push(heading('Advice records'));
  lines.push(
    advice.length
      ? table(advice, [
          { key: 'given_on', label: 'Given', format: (v) => isoDate(v) },
          { key: 'policy_no', label: 'Policy', width: 12 },
          { key: 'method', label: 'How', width: 8 },
          { key: 'recommendation', label: 'Recommendation', width: 50, format: (v) => truncate(v, 50) },
          { key: 'remuneration_disclosed', label: 'Remuneration', format: (v) => (v ? 'disclosed' : 'NOT DISCLOSED') },
        ])
      : '  (none on file)',
  );
  if (openTasks.length) {
    lines.push(heading('Open tasks'));
    lines.push(
      table(openTasks, [
        { key: 'id', label: 'Id', format: (v) => short(v) },
        { key: 'due_on', label: 'Due', format: (v) => isoDate(v) },
        { key: 'title', label: 'What', width: 60 },
      ]),
    );
  }
  if (notes.length) {
    lines.push(heading('Recent contact'));
    for (const n of notes) lines.push(`  ${isoDate(n.happened_on)}  ${n.kind.padEnd(8)} ${truncate(n.body, 92)}`);
  }
  return {
    text: lines.join('\n'),
    json: { client, health, contacts, policies, claims, advice, tasks: openTasks, notes },
  };
}

async function cmdPolicies(db, args, flags) {
  const where = [];
  const params = [];
  const q = args.join(' ').trim();
  if (q) {
    const client = await resolve(db, 'client', q);
    params.push(client.id);
    where.push(`p.client_id = $${params.length}`);
  }
  if (!flags.all) where.push("p.status in ('in force', 'bound', 'quoted')");
  if (flags.status && flags.status !== true) {
    params.push(String(flags.status));
    where.push(`p.status = $${params.length}`);
  }
  if (flags.class && flags.class !== true) {
    params.push(`%${flags.class}%`);
    where.push(`p.class ilike $${params.length}`);
  }
  if (flags.insurer && flags.insurer !== true) {
    const i = await resolve(db, 'insurer', flags.insurer);
    params.push(i.id);
    where.push(`p.insurer_id = $${params.length}`);
  }
  if (flags.expiring && flags.expiring !== true) {
    params.push(Number(flags.expiring));
    where.push(`p.expiry_on <= current_date + $${params.length}::int`);
  }
  const rows = await db.query(
    `select p.*, c.name as client, i.name as insurer, b.full_name as broker,
            (p.expiry_on - current_date) as days_to_expiry
     from policies p
     join clients c on c.id = p.client_id
     left join insurers i on i.id = p.insurer_id
     left join brokers b on b.id = p.broker_id
     ${where.length ? 'where ' + where.join(' and ') : ''}
     order by p.expiry_on`,
    params,
  );
  const premium = rows.reduce((a, r) => a + num(r.gross_premium_cents), 0);
  const brokerage = rows.reduce((a, r) => a + num(r.brokerage_cents) + num(r.broker_fee_cents), 0);
  const text =
    heading(`Policies (${rows.length}, ${money(premium)} premium, ${money(brokerage)} brokerage)`) +
    '\n' +
    table(rows, [
      { key: 'policy_no', label: 'Policy', width: 12 },
      { key: 'client', label: 'Client', width: 30 },
      { key: 'class', label: 'Class', width: 22 },
      { key: 'insurer', label: 'Insurer', width: 18 },
      { key: 'status', label: 'Status', width: 9 },
      { key: 'expiry_on', label: 'Expires', format: (v) => isoDate(v) },
      { key: 'days_to_expiry', label: 'In', align: 'right', format: (v) => (num(v) < 0 ? `${-num(v)}d ago` : `${v}d`) },
      { key: 'gross_premium_cents', label: 'Premium', align: 'right', format: (v) => money(v) },
      { key: 'brokerage_cents', label: 'Brokerage', align: 'right', format: (v) => money(v) },
    ]);
  return { text, json: rows };
}

async function cmdPolicy(db, args) {
  const p = await resolve(db, 'policy', args.join(' '));
  const covers = await db.query('select * from covers where policy_id = $1 order by section', [p.id]);
  const endorsements = await db.query('select * from endorsements where policy_id = $1 order by effective_on desc', [p.id]);
  const claims = await db.query('select * from claims where policy_id = $1 order by notified_on desc', [p.id]);
  const advice = await db.query('select * from advice_records where policy_id = $1 order by given_on desc', [p.id]);
  const [renewal] = await db.query('select * from renewals where policy_id = $1', [p.id]);
  const quotes = await db.query(
    'select q.*, i.name as insurer_name from quotes q left join insurers i on i.id = q.insurer_id where q.policy_id = $1 order by q.requested_on desc',
    [p.id],
  );
  const commissions = await db.query('select * from commissions where policy_id = $1 order by earned_on desc', [p.id]);
  const prior = p.prior_policy_id
    ? (await db.query('select policy_no, inception_on, expiry_on, gross_premium_cents from policies where id = $1', [p.prior_policy_id]))[0]
    : null;

  const lines = [];
  lines.push(heading(`${p.policy_no}  ${p.client_name}  ${p.class}`));
  lines.push(`  ${p.cover_summary || ''}`);
  lines.push(`  ${p.insurer_name || 'not placed'}${p.insurer_ref ? ` (${p.insurer_ref})` : ''}, broker ${p.broker_name || 'unassigned'}`);
  lines.push(`  ${isoDate(p.inception_on)} to ${isoDate(p.expiry_on)}, status ${p.status}, renewal ${p.renewal_type}`);
  lines.push(`  Sum insured ${money(p.sum_insured_cents)}, excess ${price(p.excess_cents)}`);
  lines.push(
    `  Premium ${money(p.base_premium_cents)} base + ${money(p.levies_cents)} levies + ${money(p.gst_cents)} GST = ${money(p.gross_premium_cents)} gross`,
  );
  lines.push(
    `  Brokerage ${pctText(p.brokerage_pct)} = ${money(p.brokerage_cents)}${num(p.broker_fee_cents) ? ` plus a ${money(p.broker_fee_cents)} broker fee` : ''}`,
  );
  lines.push(`  Paid ${p.payment_method}${p.funder ? ` through ${p.funder}` : ''}`);
  if (prior) lines.push(`  Renewed from ${prior.policy_no} (${money(prior.gross_premium_cents)} last year)`);
  if (p.notes) lines.push(`  Note: ${p.notes}`);

  if (covers.length) {
    lines.push(heading('Sections'));
    lines.push(
      table(covers, [
        { key: 'section', label: 'Section', width: 28 },
        { key: 'description', label: 'What', width: 44, format: (v) => truncate(v, 44) },
        { key: 'sum_insured_cents', label: 'Sum insured', align: 'right', format: (v) => money(v) },
        { key: 'excess_cents', label: 'Excess', align: 'right', format: (v) => price(v) },
        { key: 'limit_note', label: 'Basis', width: 40 },
      ]),
    );
  }
  if (renewal) {
    lines.push(heading('Renewal'));
    lines.push(
      `  Stage ${renewal.stage}, due ${isoDate(renewal.due_on)}, client last contacted ${renewal.client_contacted_on ? isoDate(renewal.client_contacted_on) : 'NEVER'}`,
    );
    if (renewal.terms_due_on) lines.push(`  Terms due ${isoDate(renewal.terms_due_on)}`);
    if (num(renewal.premium_offered_cents)) lines.push(`  Offered ${money(renewal.premium_offered_cents)} against ${money(renewal.premium_last_cents)} expiring`);
    if (renewal.notes) lines.push(`  ${renewal.notes}`);
  }
  if (quotes.length) {
    lines.push(heading('Quotes'));
    lines.push(
      table(quotes, [
        { key: 'quote_ref', label: 'Ref', width: 10 },
        { key: 'insurer_name', label: 'Market', width: 20 },
        { key: 'purpose', label: 'Purpose', width: 12 },
        { key: 'status', label: 'Status', width: 11 },
        { key: 'requested_on', label: 'Asked', format: (v) => isoDate(v) },
        { key: 'received_on', label: 'Back', format: (v) => isoDate(v) },
        { key: 'premium_cents', label: 'Premium', align: 'right', format: (v) => (num(v) ? money(v) : '') },
      ]),
    );
  }
  if (endorsements.length) {
    lines.push(heading('Endorsements'));
    lines.push(
      table(endorsements, [
        { key: 'endorsement_no', label: 'Number', width: 11 },
        { key: 'effective_on', label: 'Effective', format: (v) => isoDate(v) },
        { key: 'kind', label: 'Kind', width: 20 },
        { key: 'status', label: 'Status', width: 13 },
        { key: 'description', label: 'What changed', width: 52, format: (v) => truncate(v, 52) },
        { key: 'premium_adjustment_cents', label: 'Premium', align: 'right', format: (v) => (num(v) ? money(v) : '') },
      ]),
    );
  }
  if (claims.length) {
    lines.push(heading('Claims'));
    lines.push(
      table(claims, [
        { key: 'claim_no', label: 'Claim', width: 12 },
        { key: 'loss_on', label: 'Loss', format: (v) => isoDate(v) },
        { key: 'status', label: 'Status', width: 20 },
        { key: 'reserve_cents', label: 'Reserve', align: 'right', format: (v) => money(v) },
        { key: 'settled_cents', label: 'Settled', align: 'right', format: (v) => (num(v) ? money(v) : '') },
      ]),
    );
  }
  lines.push(heading('Advice records'));
  lines.push(
    advice.length
      ? advice.map((a) => `  ${isoDate(a.given_on)}  ${truncate(a.recommendation, 96)}`).join('\n')
      : '  NONE ON FILE. A placement with no advice record is the gap a regulator opens with.',
  );
  if (commissions.length) {
    lines.push(heading('Brokerage'));
    lines.push(
      table(commissions, [
        { key: 'earned_on', label: 'Earned', format: (v) => isoDate(v) },
        { key: 'kind', label: 'Kind', width: 12 },
        { key: 'amount_cents', label: 'Amount', align: 'right', format: (v) => money(v) },
        { key: 'status', label: 'Status', width: 12 },
        { key: 'invoice_ref', label: 'Statement', width: 22 },
      ]),
    );
  }
  return { text: lines.join('\n'), json: { policy: p, covers, renewal, quotes, endorsements, claims, advice, commissions } };
}

async function cmdRenewalsDue(db, args, flags) {
  const days = flags.days && flags.days !== true ? Number(flags.days) : 90;
  const where = [`days_to_expiry <= $1`];
  const params = [days];
  if (flags.broker && flags.broker !== true) {
    const b = await resolve(db, 'broker', flags.broker);
    params.push(b.full_name);
    where.push(`broker = $${params.length}`);
  }
  if (flags.band && flags.band !== true) {
    params.push(String(flags.band));
    where.push(`band = $${params.length}`);
  }
  if (flags.stage && flags.stage !== true) {
    params.push(String(flags.stage));
    where.push(`stage = $${params.length}`);
  }
  const rows = await db.query(
    `select * from v_renewals_due where ${where.join(' and ')} order by days_to_expiry`,
    params,
  );
  const bands = ['expired', '14 day', '30 day', '60 day', '90 day'];
  const lines = [];
  const premium = rows.reduce((a, r) => a + num(r.gross_premium_cents), 0);
  const brokerage = rows.reduce((a, r) => a + num(r.brokerage_cents), 0);
  lines.push(heading(`Renewals inside ${days} days (${rows.length}, ${money(premium)} premium, ${money(brokerage)} brokerage at risk)`));
  for (const band of bands) {
    const group = rows.filter((r) => r.band === band);
    if (!group.length) continue;
    const noContact = group.filter((r) => r.days_since_contact === null).length;
    lines.push(`\n  ${band.toUpperCase()}  ${group.length} policies, ${money(group.reduce((a, r) => a + num(r.gross_premium_cents), 0))}${noContact ? `, ${noContact} with no client contact` : ''}`);
    lines.push(
      table(group, [
        { key: 'policy_no', label: 'Policy', width: 12 },
        { key: 'client', label: 'Client', width: 30 },
        { key: 'class', label: 'Class', width: 22 },
        { key: 'insurer', label: 'Insurer', width: 18 },
        { key: 'expiry_on', label: 'Expires', format: (v) => isoDate(v) },
        { key: 'days_to_expiry', label: 'In', align: 'right', format: (v) => (num(v) < 0 ? `${-num(v)}d ago` : `${v}d`) },
        { key: 'stage', label: 'Stage', width: 14 },
        { key: 'days_since_contact', label: 'Spoke', align: 'right', format: (v) => (v === null ? 'NEVER' : `${v}d ago`) },
        { key: 'quotes', label: 'Qs', align: 'right' },
        { key: 'gross_premium_cents', label: 'Premium', align: 'right', format: (v) => money(v) },
        { key: 'broker', label: 'Broker', width: 13 },
      ]),
    );
  }
  return { text: lines.join('\n'), json: rows };
}

async function cmdQuotes(db, args, flags) {
  const where = [];
  const params = [];
  if (!flags.all) where.push("q.status in ('requested', 'received', 'presented')");
  if (flags.status && flags.status !== true) {
    params.push(String(flags.status));
    where.push(`q.status = $${params.length}`);
  }
  if (flags.client && flags.client !== true) {
    const c = await resolve(db, 'client', flags.client);
    params.push(c.id);
    where.push(`q.client_id = $${params.length}`);
  }
  if (flags.insurer && flags.insurer !== true) {
    const i = await resolve(db, 'insurer', flags.insurer);
    params.push(i.id);
    where.push(`q.insurer_id = $${params.length}`);
  }
  const rows = await db.query(
    `select q.*, c.name as client, i.name as insurer, b.full_name as broker,
            case when q.due_on is null then null else (current_date - q.due_on) end as days_late
     from quotes q
     join clients c on c.id = q.client_id
     left join insurers i on i.id = q.insurer_id
     left join brokers b on b.id = q.broker_id
     ${where.length ? 'where ' + where.join(' and ') : ''}
     order by q.due_on nulls last, q.requested_on`,
    params,
  );
  const text =
    heading(`Quotes (${rows.length})`) +
    '\n' +
    table(rows, [
      { key: 'quote_ref', label: 'Ref', width: 10 },
      { key: 'client', label: 'Client', width: 28 },
      { key: 'class', label: 'Class', width: 22 },
      { key: 'insurer', label: 'Market', width: 20 },
      { key: 'purpose', label: 'Purpose', width: 12 },
      { key: 'status', label: 'Status', width: 11 },
      { key: 'requested_on', label: 'Asked', format: (v) => isoDate(v) },
      { key: 'days_late', label: 'Owed', align: 'right', format: (v) => (v === null ? '' : num(v) > 0 ? `${v}d late` : `in ${-num(v)}d`) },
      { key: 'premium_cents', label: 'Premium', align: 'right', format: (v) => (num(v) ? money(v) : '') },
    ]);
  return { text, json: rows };
}

async function cmdQuoteShow(db, q) {
  const lines = [];
  lines.push(heading(`${q.quote_ref || short(q.id)}  ${q.client_name}  ${q.class}`));
  lines.push(`  ${q.insurer_name || 'market not named'}, ${q.purpose}, status ${q.status}`);
  lines.push(`  Asked ${isoDate(q.requested_on)}${q.due_on ? `, due ${isoDate(q.due_on)}` : ''}${q.received_on ? `, back ${isoDate(q.received_on)}` : ''}`);
  if (num(q.premium_cents)) lines.push(`  Premium ${money(q.premium_cents)} at ${pctText(q.brokerage_pct)} brokerage, excess ${price(q.excess_cents)}`);
  if (num(q.sum_insured_cents)) lines.push(`  Sum insured ${money(q.sum_insured_cents)}`);
  if (q.terms) lines.push(`  Terms: ${q.terms}`);
  if (q.decline_reason) lines.push(`  Declined: ${q.decline_reason}`);
  if (q.lost_reason) lines.push(`  Lost: ${q.lost_reason}`);
  if (q.notes) lines.push(`  Note: ${q.notes}`);
  return { text: lines.join('\n'), json: q };
}

async function cmdClaims(db, args, flags) {
  const where = [];
  const params = [];
  if (!flags.all) where.push('cl.closed_on is null');
  if (flags.status && flags.status !== true) {
    params.push(String(flags.status));
    where.push(`cl.status = $${params.length}`);
  }
  if (flags.client && flags.client !== true) {
    const c = await resolve(db, 'client', flags.client);
    params.push(c.id);
    where.push(`cl.client_id = $${params.length}`);
  }
  const rows = await db.query(
    `select cl.*, c.name as client, p.policy_no, i.name as insurer, b.full_name as broker,
            (current_date - cl.notified_on) as days_open
     from claims cl
     join clients c on c.id = cl.client_id
     join policies p on p.id = cl.policy_id
     left join insurers i on i.id = cl.insurer_id
     left join brokers b on b.id = cl.broker_id
     ${where.length ? 'where ' + where.join(' and ') : ''}
     order by cl.notified_on desc`,
    params,
  );
  const text =
    heading(`Claims (${rows.length})`) +
    '\n' +
    table(rows, [
      { key: 'claim_no', label: 'Claim', width: 12 },
      { key: 'client', label: 'Client', width: 30 },
      { key: 'policy_no', label: 'Policy', width: 12 },
      { key: 'loss_on', label: 'Loss', format: (v) => isoDate(v) },
      { key: 'status', label: 'Status', width: 20 },
      { key: 'days_open', label: 'Open', align: 'right', format: (v) => `${v}d` },
      { key: 'reserve_cents', label: 'Reserve', align: 'right', format: (v) => money(v) },
      { key: 'settled_cents', label: 'Settled', align: 'right', format: (v) => (num(v) ? money(v) : '') },
      { key: 'insurer', label: 'Insurer', width: 18 },
    ]);
  return { text, json: rows };
}

async function cmdClaimsOpen(db, args, flags) {
  const where = [];
  const params = [];
  if (flags.broker && flags.broker !== true) {
    const b = await resolve(db, 'broker', flags.broker);
    params.push(b.full_name);
    where.push(`broker = $${params.length}`);
  }
  const rows = await db.query(
    `select * from v_claims_open ${where.length ? 'where ' + where.join(' and ') : ''} order by days_since_client_update desc`,
    params,
  );
  const stale = rows.filter((r) => num(r.days_since_client_update) > 14);
  const lines = [];
  lines.push(
    heading(
      `Open claims (${rows.length}, ${money(rows.reduce((a, r) => a + num(r.reserve_cents), 0))} reserved, ${stale.length} where the client has not been told anything for a fortnight)`,
    ),
  );
  lines.push(
    table(rows, [
      { key: 'claim_no', label: 'Claim', width: 12 },
      { key: 'client', label: 'Client', width: 30 },
      { key: 'class', label: 'Class', width: 20 },
      { key: 'status', label: 'Status', width: 20 },
      { key: 'days_open', label: 'Open', align: 'right', format: (v) => `${v}d` },
      { key: 'days_since_client_update', label: 'Client told', align: 'right', format: (v) => `${v}d ago` },
      { key: 'reserve_cents', label: 'Reserve', align: 'right', format: (v) => money(v) },
      { key: 'insurer', label: 'Insurer', width: 18 },
      { key: 'broker', label: 'Broker', width: 13 },
    ]),
  );
  if (stale.length) {
    lines.push('\n  Overdue updates (Insurance Brokers Code of Practice 7.1(a): keep clients informed in a timely manner)');
    for (const r of stale) lines.push(`    ${r.claim_no}  ${r.client}: ${r.days_since_client_update} days since anyone told them anything`);
  }
  return { text: lines.join('\n'), json: rows };
}

async function cmdClaimShow(db, claim) {
  const events = await db.query('select * from claim_events where claim_id = $1 order by happened_on desc, created_at desc', [claim.id]);
  const lines = [];
  lines.push(heading(`${claim.claim_no}  ${claim.client_name}  ${claim.policy_no}`));
  lines.push(`  ${claim.description}`);
  lines.push(`  Loss ${isoDate(claim.loss_on)}, notified ${isoDate(claim.notified_on)}, status ${claim.status}`);
  lines.push(`  ${claim.insurer_name || 'insurer not named'}${claim.insurer_claim_ref ? ` (${claim.insurer_claim_ref})` : ''}, broker ${claim.broker_name || 'unassigned'}`);
  lines.push(`  Reserve ${money(claim.reserve_cents)}, excess ${price(claim.excess_cents)}${num(claim.settled_cents) ? `, settled ${money(claim.settled_cents)} on ${isoDate(claim.settled_on)}` : ''}`);
  lines.push(`  Client last updated ${claim.last_client_update_on ? isoDate(claim.last_client_update_on) : 'NEVER'}`);
  if (claim.closed_on) lines.push(`  Closed ${isoDate(claim.closed_on)}`);
  if (claim.notes) lines.push(`  Note: ${claim.notes}`);
  lines.push(heading('History'));
  lines.push(
    events.length
      ? table(events, [
          { key: 'happened_on', label: 'When', format: (v) => isoDate(v) },
          { key: 'kind', label: 'What', width: 24 },
          { key: 'actor', label: 'Who', width: 20 },
          { key: 'note', label: 'Note', width: 66, format: (v) => truncate(v, 66) },
        ])
      : '  (no events yet)',
  );
  return { text: lines.join('\n'), json: { claim, events } };
}

async function cmdEndorsements(db, args, flags) {
  const where = [];
  const params = [];
  if (!flags.all) where.push("e.status in ('requested', 'with insurer')");
  if (flags.policy && flags.policy !== true) {
    const p = await resolve(db, 'policy', flags.policy);
    params.push(p.id);
    where.push(`e.policy_id = $${params.length}`);
  }
  if (flags.status && flags.status !== true) {
    params.push(String(flags.status));
    where.push(`e.status = $${params.length}`);
  }
  const rows = await db.query(
    `select e.*, p.policy_no, c.name as client, b.full_name as broker,
            (current_date - e.requested_on) as days_waiting
     from endorsements e
     join policies p on p.id = e.policy_id
     join clients c on c.id = p.client_id
     left join brokers b on b.id = e.broker_id
     ${where.length ? 'where ' + where.join(' and ') : ''}
     order by e.requested_on`,
    params,
  );
  const text =
    heading(`Endorsements (${rows.length})`) +
    '\n' +
    table(rows, [
      { key: 'endorsement_no', label: 'Number', width: 11 },
      { key: 'client', label: 'Client', width: 28 },
      { key: 'policy_no', label: 'Policy', width: 12 },
      { key: 'kind', label: 'Kind', width: 20 },
      { key: 'effective_on', label: 'Effective', format: (v) => isoDate(v) },
      { key: 'status', label: 'Status', width: 13 },
      { key: 'days_waiting', label: 'Waiting', align: 'right', format: (v) => `${v}d` },
      { key: 'premium_adjustment_cents', label: 'Premium', align: 'right', format: (v) => (num(v) ? money(v) : '') },
      { key: 'description', label: 'What changed', width: 46, format: (v) => truncate(v, 46) },
    ]);
  return { text, json: rows };
}

async function cmdCommissions(db, args, flags) {
  if (flags.month && flags.month !== true) {
    const month = String(flags.month).slice(0, 7);
    const rows = await db.query(
      `select m.*, p.policy_no, c.name as client, i.name as insurer
       from commissions m
       left join policies p on p.id = m.policy_id
       left join clients c on c.id = m.client_id
       left join insurers i on i.id = m.insurer_id
       where to_char(m.period_month, 'YYYY-MM') = $1
       order by m.amount_cents desc`,
      [month],
    );
    const total = rows.reduce((a, r) => a + num(r.amount_cents), 0);
    const text =
      heading(`Brokerage ${month} (${rows.length} entries, ${money(total)})`) +
      '\n' +
      table(rows, [
        { key: 'earned_on', label: 'Earned', format: (v) => isoDate(v) },
        { key: 'client', label: 'Client', width: 30 },
        { key: 'policy_no', label: 'Policy', width: 12 },
        { key: 'insurer', label: 'Insurer', width: 18 },
        { key: 'kind', label: 'Kind', width: 12 },
        { key: 'amount_cents', label: 'Amount', align: 'right', format: (v) => money(v) },
        { key: 'status', label: 'Status', width: 12 },
        { key: 'invoice_ref', label: 'Statement', width: 22 },
      ]);
    return { text, json: rows };
  }
  const rows = await db.query('select * from v_commission_month order by period_month desc limit 18');
  const outstanding = await db.query(
    `select coalesce(sum(amount_cents), 0) as cents, count(*) as entries
     from commissions where status in ('accrued', 'invoiced')`,
  );
  const stale = await db.query(
    `select coalesce(sum(amount_cents), 0) as cents, count(*) as entries
     from commissions where status = 'accrued' and earned_on < current_date - 60`,
  );
  const text =
    heading('Brokerage by month') +
    '\n' +
    table(rows, [
      { key: 'month', label: 'Month' },
      { key: 'entries', label: 'Entries', align: 'right' },
      { key: 'brokerage_cents', label: 'Brokerage', align: 'right', format: (v) => money(v) },
      { key: 'fees_cents', label: 'Fees', align: 'right', format: (v) => money(v) },
      { key: 'endorsement_cents', label: 'Endorsements', align: 'right', format: (v) => money(v) },
      { key: 'total_cents', label: 'Total', align: 'right', format: (v) => money(v) },
      { key: 'received_cents', label: 'Received', align: 'right', format: (v) => money(v) },
      { key: 'accrued_cents', label: 'Still accrued', align: 'right', format: (v) => money(v) },
    ]) +
    `\n\n  ${money(outstanding[0].cents)} across ${outstanding[0].entries} entries has not been received.` +
    `\n  ${money(stale[0].cents)} across ${stale[0].entries} entries has been sitting accrued for more than sixty days.`;
  return { text, json: { months: rows, outstanding: outstanding[0], stale: stale[0] } };
}

async function cmdAdvice(db, args, flags) {
  const where = [];
  const params = [];
  if (flags.client && flags.client !== true) {
    const c = await resolve(db, 'client', flags.client);
    params.push(c.id);
    where.push(`a.client_id = $${params.length}`);
  }
  if (flags.days && flags.days !== true) {
    params.push(Number(flags.days));
    where.push(`a.given_on >= current_date - $${params.length}::int`);
  }
  const rows = await db.query(
    `select a.*, c.name as client, c.client_type, c.headcount, p.policy_no, b.full_name as broker
     from advice_records a
     join clients c on c.id = a.client_id
     left join policies p on p.id = a.policy_id
     left join brokers b on b.id = a.broker_id
     ${where.length ? 'where ' + where.join(' and ') : ''}
     order by a.given_on desc`,
    params,
  );
  const text =
    heading(`Advice records (${rows.length})`) +
    '\n' +
    table(rows, [
      { key: 'id', label: 'Id', format: (v) => short(v) },
      { key: 'given_on', label: 'Given', format: (v) => isoDate(v) },
      { key: 'client', label: 'Client', width: 28 },
      { key: 'policy_no', label: 'Policy', width: 12 },
      { key: 'method', label: 'How', width: 8 },
      { key: 'recommendation', label: 'Recommendation', width: 52, format: (v) => truncate(v, 52) },
      { key: 'nature_and_scope', label: 'Scope', format: (v) => (v ? 'yes' : 'MISSING') },
      { key: 'disclosure_given_on', label: 'Disclosed', format: (v) => (v ? isoDate(v) : 'MISSING') },
      { key: 'remuneration_disclosed', label: 'Remuneration', format: (v) => (v ? 'yes' : 'NO') },
    ]);
  return { text, json: rows };
}

async function cmdAdviceShow(db, a) {
  const lines = [];
  lines.push(heading(`Advice to ${a.client_name}${a.policy_no ? ` on ${a.policy_no}` : ''}, ${isoDate(a.given_on)}`));
  const field = (label, value) => lines.push(`\n  ${label}\n    ${value ? String(value).replace(/\n/g, '\n    ') : 'NOT RECORDED'}`);
  field('Nature and scope', a.nature_and_scope);
  field('Needs and circumstances', a.needs_and_circumstances);
  field('Recommendation', a.recommendation);
  field('Reasons', a.reasons);
  field('Alternatives considered', a.alternatives_considered);
  field('Risks disclosed', a.risks_disclosed);
  field('Limitations', a.limitations);
  lines.push(`\n  Given by ${a.broker_id ? short(a.broker_id) : 'unknown'} in a ${a.method}.`);
  lines.push(`  Disclosure ${a.disclosure_given_on ? `given ${isoDate(a.disclosure_given_on)}` : 'NOT RECORDED'}.`);
  lines.push(`  Remuneration ${a.remuneration_disclosed ? `disclosed: ${a.remuneration_note || 'no note'}` : 'NOT DISCLOSED'}.`);
  lines.push(`  Client confirmed ${a.client_confirmed_on ? isoDate(a.client_confirmed_on) : 'not recorded'}.`);
  return { text: lines.join('\n'), json: a };
}

async function cmdInsurers(db, args, flags) {
  const rows = await db.query(
    `select i.*,
            (select count(*) from policies p where p.insurer_id = i.id and p.status = 'in force') as policies,
            (select coalesce(sum(p.gross_premium_cents), 0) from policies p where p.insurer_id = i.id and p.status = 'in force') as premium_cents,
            (select coalesce(sum(p.brokerage_cents), 0) from policies p where p.insurer_id = i.id and p.status = 'in force') as brokerage_cents,
            (select count(*) from claims c where c.insurer_id = i.id and c.closed_on is null) as open_claims
     from insurers i ${flags.all ? '' : 'where i.active'} order by premium_cents desc`,
  );
  const text =
    heading(`Markets (${rows.length})`) +
    '\n' +
    table(rows, [
      { key: 'name', label: 'Market', width: 28 },
      { key: 'kind', label: 'Kind', width: 20 },
      { key: 'underwriter_name', label: 'Underwriter', width: 20 },
      { key: 'strength_rating', label: 'Rating', width: 6 },
      { key: 'default_brokerage_pct', label: 'Brokerage', align: 'right', format: (v) => pctText(v) },
      { key: 'policies', label: 'Policies', align: 'right' },
      { key: 'premium_cents', label: 'Premium', align: 'right', format: (v) => money(v) },
      { key: 'brokerage_cents', label: 'Earns us', align: 'right', format: (v) => money(v) },
      { key: 'open_claims', label: 'Claims', align: 'right' },
      { key: 'agency_agreement_ref', label: 'Agency', width: 16 },
    ]);
  return { text, json: rows };
}

async function cmdBrokers(db, args, flags) {
  const rows = await db.query(
    `select b.*,
            (select count(*) from clients c where c.broker_id = b.id and c.status = 'active') as clients,
            (select count(*) from policies p where p.broker_id = b.id and p.status = 'in force') as policies,
            (select coalesce(sum(p.brokerage_cents + p.broker_fee_cents), 0) from policies p where p.broker_id = b.id and p.status = 'in force') as brokerage_cents,
            (select count(*) from v_renewals_due r where r.broker_id = b.id and r.days_to_expiry <= 30) as renewals_30
     from brokers b ${flags.all ? '' : 'where b.active'} order by brokerage_cents desc`,
  );
  const text =
    heading(`The team (${rows.length})`) +
    '\n' +
    table(rows, [
      { key: 'full_name', label: 'Name', width: 20 },
      { key: 'role', label: 'Role', width: 18 },
      { key: 'adviser_ref', label: 'Adviser ref', width: 12 },
      { key: 'clients', label: 'Clients', align: 'right' },
      { key: 'policies', label: 'Policies', align: 'right' },
      { key: 'brokerage_cents', label: 'Brokerage', align: 'right', format: (v) => money(v) },
      { key: 'renewals_30', label: 'Renewals 30d', align: 'right' },
    ]);
  return { text, json: rows };
}

async function cmdTasks(db, args, flags) {
  const where = [];
  const params = [];
  if (!flags.all) where.push("t.status = 'open'");
  if (flags.broker && flags.broker !== true) {
    const b = await resolve(db, 'broker', flags.broker);
    params.push(b.id);
    where.push(`t.broker_id = $${params.length}`);
  }
  const rows = await db.query(
    `select t.*, c.name as client, p.policy_no, cl.claim_no, b.full_name as broker,
            case when t.due_on is null then null else (current_date - t.due_on) end as days_late
     from tasks t
     left join clients c on c.id = t.client_id
     left join policies p on p.id = t.policy_id
     left join claims cl on cl.id = t.claim_id
     left join brokers b on b.id = t.broker_id
     ${where.length ? 'where ' + where.join(' and ') : ''}
     order by t.due_on nulls last`,
    params,
  );
  const text =
    heading(`Tasks (${rows.length}, ${rows.filter((r) => num(r.days_late) > 0 && r.status === 'open').length} overdue)`) +
    '\n' +
    table(rows, [
      { key: 'id', label: 'Id', format: (v) => short(v) },
      { key: 'due_on', label: 'Due', format: (v) => isoDate(v) },
      { key: 'days_late', label: 'Late', align: 'right', format: (v) => (v === null ? '' : num(v) > 0 ? `${v}d` : '') },
      { key: 'title', label: 'What', width: 54 },
      { key: 'client', label: 'Client', width: 26 },
      { key: 'kind', label: 'Kind', width: 10 },
      { key: 'status', label: 'Status', width: 7 },
      { key: 'broker', label: 'Owner', width: 13 },
    ]);
  return { text, json: rows };
}

async function cmdComplaints(db, args, flags) {
  const where = [];
  if (!flags.all) where.push("x.status in ('open', 'investigating')");
  const rows = await db.query(
    `select x.*, c.name as client, p.policy_no, cl.claim_no, b.full_name as broker,
            (current_date - x.received_on) as days_open,
            case when x.last_update_on is null then null else (current_date - x.last_update_on) end as days_since_update
     from complaints x
     left join clients c on c.id = x.client_id
     left join policies p on p.id = x.policy_id
     left join claims cl on cl.id = x.claim_id
     left join brokers b on b.id = x.broker_id
     ${where.length ? 'where ' + where.join(' and ') : ''}
     order by x.received_on`,
  );
  const text =
    heading(`Complaints (${rows.length})`) +
    '\n' +
    table(rows, [
      { key: 'id', label: 'Id', format: (v) => short(v) },
      { key: 'received_on', label: 'Received', format: (v) => isoDate(v) },
      { key: 'days_open', label: 'Open', align: 'right', format: (v) => `${v}d` },
      { key: 'client', label: 'Client', width: 30 },
      { key: 'about', label: 'About', width: 60, format: (v) => truncate(v, 60) },
      { key: 'status', label: 'Status', width: 13 },
      { key: 'acknowledged_on', label: 'Acknowledged', format: (v) => (v ? isoDate(v) : 'NO') },
      { key: 'days_since_update', label: 'Last update', align: 'right', format: (v) => (v === null ? 'NEVER' : `${v}d ago`) },
    ]) +
    '\n\n  Code timeframes: acknowledge promptly, update the complainant at least every ten business days,' +
    '\n  resolve inside thirty calendar days (Insurance Brokers Code of Practice 9.2(b) and 9.4(b)).';
  return { text, json: rows };
}

const ATTENTION_ORDER = [
  'renewal_expired',
  'renewal_no_contact',
  'claim_no_update',
  'claim_not_acknowledged',
  'endorsement_unconfirmed',
  'complaint_overdue',
  'advice_missing',
  'remuneration_not_disclosed',
  'renewal_stuck',
  'quote_chase',
  'task_overdue',
  'commission_unreconciled',
  'client_quiet',
];

const ATTENTION_LABEL = {
  renewal_expired: 'Expired and still on the book',
  renewal_no_contact: 'Renewal inside thirty days with no client contact',
  claim_no_update: 'Claim where the client has not been told anything',
  claim_not_acknowledged: 'Claim notified and never acknowledged',
  endorsement_unconfirmed: 'Cover changed and the insurer has not confirmed it',
  complaint_overdue: 'Complaint past thirty days',
  advice_missing: 'Placed with no advice record',
  remuneration_not_disclosed: 'Advice given with no remuneration disclosure',
  renewal_stuck: 'Renewal stuck in market past the date terms were due',
  quote_chase: 'Quote the market owes us',
  task_overdue: 'Task overdue',
  commission_unreconciled: 'Brokerage accrued and never reconciled',
  client_quiet: 'Client on cover nobody has spoken to',
};

async function cmdAttention(db, args, flags) {
  const where = [];
  const params = [];
  if (flags.broker && flags.broker !== true) {
    const b = await resolve(db, 'broker', flags.broker);
    params.push(b.full_name);
    where.push(`broker = $${params.length}`);
  }
  const rows = await db.query(
    `select * from v_attention_due ${where.length ? 'where ' + where.join(' and ') : ''}`,
    params,
  );
  rows.sort((a, b) => {
    const d = ATTENTION_ORDER.indexOf(a.reason) - ATTENTION_ORDER.indexOf(b.reason);
    return d !== 0 ? d : num(b.days) - num(a.days);
  });
  const lines = [heading(`Needs a decision this week (${rows.length})`)];
  for (const reason of ATTENTION_ORDER) {
    const group = rows.filter((r) => r.reason === reason);
    if (!group.length) continue;
    lines.push(`\n  ${ATTENTION_LABEL[reason]} (${group.length})`);
    lines.push(
      table(group, [
        { key: 'label', label: 'Record', width: 26 },
        { key: 'client', label: 'Client', width: 30 },
        { key: 'days', label: 'Days', align: 'right' },
        { key: 'amount_cents', label: 'Value', align: 'right', format: (v) => (num(v) ? money(v) : '') },
        { key: 'broker', label: 'Broker', width: 13 },
        { key: 'detail', label: 'Detail', width: 62, format: (v) => truncate(v, 62) },
      ]),
    );
  }
  return { text: lines.join('\n'), json: rows };
}

async function cmdStats(db) {
  const [s] = await db.query(`
    select (select count(*) from clients where status = 'active')                         as clients,
           (select count(*) from policies where status = 'in force')                      as policies,
           (select coalesce(sum(gross_premium_cents), 0) from policies where status = 'in force') as premium_cents,
           (select coalesce(sum(brokerage_cents + broker_fee_cents), 0) from policies where status = 'in force') as brokerage_cents,
           (select count(*) from v_renewals_due where days_to_expiry between 0 and 30)    as renewals_30,
           (select count(*) from v_renewals_due where days_to_expiry between 0 and 60)    as renewals_60,
           (select count(*) from v_renewals_due where days_to_expiry < 0)                 as expired,
           (select count(*) from v_claims_open)                                           as open_claims,
           (select coalesce(sum(reserve_cents), 0) from v_claims_open)                    as reserves_cents,
           (select count(*) from v_claims_open where days_since_client_update > 14)       as stale_claims,
           (select count(*) from quotes where status = 'requested')                       as quotes_out,
           (select count(*) from endorsements where status in ('requested', 'with insurer')) as endorsements_open,
           (select count(*) from tasks where status = 'open' and due_on < current_date)   as tasks_overdue,
           (select count(*) from complaints where status in ('open', 'investigating'))    as complaints_open,
           (select count(*) from v_attention_due)                                         as attention
  `);
  const retention = await db.query(
    `select coalesce(sum(amount_cents), 0) as cents from commissions where earned_on >= date_trunc('year', current_date)::date`,
  );
  const text = [
    heading('The book'),
    `  ${s.clients} active clients, ${s.policies} policies in force`,
    `  ${money(s.premium_cents)} premium placed, ${money(s.brokerage_cents)} brokerage a year`,
    `  ${money(retention[0].cents)} brokerage earned so far this calendar year`,
    heading('The cycle'),
    `  ${s.renewals_30} renewals inside thirty days, ${s.renewals_60} inside sixty`,
    `  ${s.expired} expired and still marked in force`,
    `  ${s.quotes_out} quotes out to market, ${s.endorsements_open} endorsements waiting on an insurer`,
    heading('Claims'),
    `  ${s.open_claims} open, ${money(s.reserves_cents)} reserved`,
    `  ${s.stale_claims} where the client has not been told anything for a fortnight`,
    heading('Housekeeping'),
    `  ${s.tasks_overdue} tasks overdue, ${s.complaints_open} complaints open`,
    `  ${s.attention} items on the attention list`,
  ].join('\n');
  return { text, json: s };
}

// ---------------------------------------------------------------------------
// Compliance: the rules in docs/compliance.md, run against the data.

const COMPLIANCE_RULES = [
  {
    key: 'renewal-contact',
    title: 'Contact the client at least fourteen days before expiry',
    source: 'Insurance Brokers Code of Practice 2022, clause 7.2(a)',
    sql: `select p.policy_no as record, c.name as client, (p.expiry_on - current_date) as days,
                 'Expires ' || to_char(p.expiry_on, 'DD Mon') || ' and no contact is recorded' as detail
          from policies p
          join clients c on c.id = p.client_id
          left join renewals r on r.policy_id = p.id
          where p.status in ('in force', 'bound') and p.renewal_type <> 'closed'
            and p.expiry_on >= current_date and p.expiry_on <= current_date + 14
            and (r.id is null or r.client_contacted_on is null)
          order by p.expiry_on`,
  },
  {
    key: 'terms-of-engagement',
    title: 'Terms of engagement in writing before you act',
    source: 'Insurance Brokers Code of Practice 2022, clause 4.2(a)',
    sql: `select coalesce(c.trading_name, c.name) as record, c.name as client,
                 (current_date - c.client_since) as days,
                 'On cover with no signed terms of engagement' as detail
          from clients c
          where c.status = 'active'
            and c.engagement_signed_on is null
            and exists (select 1 from policies p where p.client_id = c.id and p.status = 'in force')
          order by c.name`,
  },
  {
    key: 'remuneration-disclosure',
    title: 'Disclose what you earn to individuals and small business',
    source: 'Insurance Brokers Code of Practice 2022, clauses 6.1(a) to 6.1(c)',
    sql: `select coalesce(p.policy_no, 'advice ' || to_char(a.given_on, 'YYYY-MM-DD')) as record,
                 c.name as client, (current_date - a.given_on) as days,
                 'Advice given with no remuneration disclosure on file' as detail
          from advice_records a
          join clients c on c.id = a.client_id
          left join policies p on p.id = a.policy_id
          where not a.remuneration_disclosed
            and (c.client_type = 'individual' or coalesce(c.headcount, 0) < 20)
          order by a.given_on`,
  },
  {
    key: 'advice-record',
    title: 'An advice record for every placement',
    source: 'FMC Act 2013 ss 431I to 431P and FAP licence standard condition 1; Corporations Act 2001 s 912A(1)(a)',
    sql: `select p.policy_no as record, c.name as client,
                 (current_date - coalesce(p.placed_on, p.inception_on)) as days,
                 'Placed ' || to_char(coalesce(p.placed_on, p.inception_on), 'DD Mon YYYY') || ' with no advice record' as detail
          from policies p
          join clients c on c.id = p.client_id
          where p.status in ('in force', 'bound')
            and coalesce(p.placed_on, p.inception_on) >= current_date - 365
            and not exists (select 1 from advice_records a where a.policy_id = p.id)
            and not exists (
              select 1 from advice_records a
              where a.client_id = p.client_id
                and a.given_on between coalesce(p.placed_on, p.inception_on) - 30 and coalesce(p.placed_on, p.inception_on) + 30
            )
          order by coalesce(p.placed_on, p.inception_on) desc`,
  },
  {
    key: 'nature-and-scope',
    title: 'Record the nature and scope of the advice, and its limits',
    source: 'FMC Act 2013 s 431J; Code of Professional Conduct for Financial Advice Services, standard 4',
    sql: `select coalesce(p.policy_no, 'advice ' || to_char(a.given_on, 'YYYY-MM-DD')) as record,
                 c.name as client, (current_date - a.given_on) as days,
                 'No nature and scope recorded on the advice' as detail
          from advice_records a
          join clients c on c.id = a.client_id
          left join policies p on p.id = a.policy_id
          where coalesce(a.nature_and_scope, '') = ''
          order by a.given_on desc`,
  },
  {
    key: 'reasonable-grounds',
    title: 'Record the reasons the advice is suitable',
    source: 'Code of Professional Conduct for Financial Advice Services, standard 3',
    sql: `select coalesce(p.policy_no, 'advice ' || to_char(a.given_on, 'YYYY-MM-DD')) as record,
                 c.name as client, (current_date - a.given_on) as days,
                 'No reasons recorded behind the recommendation' as detail
          from advice_records a
          join clients c on c.id = a.client_id
          left join policies p on p.id = a.policy_id
          where coalesce(a.reasons, '') = ''
          order by a.given_on desc`,
  },
  {
    key: 'disclosure-points',
    title: 'Disclosure given at the point the advice is given',
    source: 'Financial Markets Conduct Regulations 2014, regulations 229C to 229F',
    sql: `select coalesce(p.policy_no, 'advice ' || to_char(a.given_on, 'YYYY-MM-DD')) as record,
                 c.name as client, (current_date - a.given_on) as days,
                 'No disclosure date recorded against the advice' as detail
          from advice_records a
          join clients c on c.id = a.client_id
          left join policies p on p.id = a.policy_id
          where a.disclosure_given_on is null
          order by a.given_on desc`,
  },
  {
    key: 'claim-progress',
    title: 'Keep clients informed on the progress of a claim',
    source: 'Insurance Brokers Code of Practice 2022, clause 7.1(a)',
    sql: `select claim_no as record, client, days_since_client_update as days,
                 'Claim at "' || status || '" and the client has heard nothing' as detail
          from v_claims_open
          where days_since_client_update > 14
          order by days_since_client_update desc`,
  },
  {
    key: 'complaints',
    title: 'Acknowledge, update every ten business days, resolve inside thirty',
    source: 'Insurance Brokers Code of Practice 2022, clauses 9.2(b) and 9.4(b); ASIC RG 271',
    sql: `select 'complaint ' || to_char(x.received_on, 'DD Mon') as record, coalesce(c.name, 'unknown client') as client,
                 (current_date - x.received_on) as days,
                 case
                   when x.acknowledged_on is null then 'Never acknowledged'
                   when x.received_on < current_date - 30 then 'Open past thirty calendar days'
                   else 'No update to the complainant in the last fourteen days'
                 end as detail
          from complaints x
          left join clients c on c.id = x.client_id
          where x.status in ('open', 'investigating')
            and (x.acknowledged_on is null
                 or x.received_on < current_date - 30
                 or coalesce(x.last_update_on, x.received_on) < current_date - 14)
          order by x.received_on`,
  },
];

async function cmdCompliance(db, args, flags) {
  const only = args[0];
  const results = [];
  for (const rule of COMPLIANCE_RULES) {
    if (only && rule.key !== only) continue;
    const rows = await db.query(rule.sql);
    results.push({ ...rule, breaches: rows.length, rows });
  }
  const [oldest] = await db.query(
    `select min(inception_on) as oldest_policy, max(expiry_on) as newest_expiry, count(*) as policies from policies`,
  );
  const lines = [heading('Compliance check')];
  lines.push(
    table(
      results.map((r) => ({ rule: r.title, breaches: r.breaches, worst: r.rows[0] ? `${r.rows[0].record} (${r.rows[0].days}d)` : '', source: r.source })),
      [
        { key: 'rule', label: 'Rule', width: 56 },
        { key: 'breaches', label: 'Breaches', align: 'right' },
        { key: 'worst', label: 'Worst', width: 30 },
        { key: 'source', label: 'Source', width: 74 },
      ],
    ),
  );
  for (const r of results.filter((x) => x.breaches)) {
    lines.push(`\n  ${r.title}  (${r.source})`);
    for (const row of r.rows.slice(0, 12)) {
      lines.push(`    ${String(row.record).padEnd(24)} ${String(row.client || '').padEnd(32)} ${row.detail}`);
    }
    if (r.rows.length > 12) lines.push(`    ... and ${r.rows.length - 12} more`);
  }
  lines.push(
    `\n  Records: ${oldest.policies} policies from ${isoDate(oldest.oldest_policy)}. Nothing in this repo deletes a record.` +
      '\n  Keep them seven years (Tax Administration Act 1994 s 22; Corporations Act 2001 ss 988A to 988E).' +
      '\n  Client money is not in this system. The broking trust account stays where it is.' +
      '\n  Nothing here is legal advice. The rules are the ones docs/compliance.md records, with their sources.',
  );
  return { text: lines.join('\n'), json: results.map(({ key, title, source, breaches, rows }) => ({ key, title, source, breaches, rows })) };
}

// ---------------------------------------------------------------------------
// Writes

const QUOTE_VERBS = new Set(['new', 'receive', 'present', 'decline', 'lose']);

async function cmdQuote(db, args, flags) {
  const [verb, ...rest] = args;
  if (!verb) throw new CliError('quote new|receive|present|decline|lose <...>, or `quotes` for the list.');
  if (!QUOTE_VERBS.has(verb)) return cmdQuoteShow(db, await resolve(db, 'quote', args.join(' ')));

  if (verb === 'new') {
    const client = await resolve(db, 'client', rest.join(' '));
    if (!flags.insurer || flags.insurer === true) throw new CliError('Which market? --insurer="NZI"');
    const insurer = await resolve(db, 'insurer', flags.insurer);
    const policy = flags.policy && flags.policy !== true ? await resolve(db, 'policy', flags.policy) : null;
    const cls = flags.class && flags.class !== true ? String(flags.class) : policy ? policy.class : null;
    if (!cls) throw new CliError('Which class? --class="material damage"');
    const broker = await whoIs(db, flags);
    const renewal = policy ? (await db.query('select * from renewals where policy_id = $1', [policy.id]))[0] : null;
    const [{ count }] = await db.query('select count(*) as count from quotes');
    const ref = flags.ref && flags.ref !== true ? String(flags.ref) : `Q-${new Date().getFullYear() % 100}${String(Number(count) + 1).padStart(4, '0')}`;
    const [row] = await db.query(
      `insert into quotes (quote_ref, client_id, insurer_id, policy_id, renewal_id, purpose, class, requested_on, due_on,
                           sum_insured_cents, excess_cents, broker_id, notes)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) returning *`,
      [
        ref, client.id, insurer.id, policy?.id ?? null, renewal?.id ?? null,
        flags.purpose && flags.purpose !== true ? String(flags.purpose) : policy ? 'renewal' : 'new business',
        cls,
        parseDate(flags.on) || today(),
        parseDate(flags.due) || addDays(today(), 10),
        parseMoney(flags['sum-insured']),
        parseMoney(flags.excess),
        broker?.id ?? null,
        str(flags.note),
      ],
    );
    return {
      text: `${ref}: asked ${insurer.name} for ${cls} terms for ${client.name}. Due ${isoDate(row.due_on)}.`,
      json: row,
    };
  }

  const quote = await resolve(db, 'quote', rest.join(' ') || flags.ref);

  if (verb === 'receive') {
    const premium = parseMoney(flags.premium);
    if (!premium) throw new CliError('What did they quote? --premium=12450');
    const [row] = await db.query(
      `update quotes set status = 'received', received_on = $2, premium_cents = $3,
              brokerage_pct = case when $4 = 0 then brokerage_pct else $4 end,
              excess_cents = case when $5 = 0 then excess_cents else $5 end,
              terms = coalesce($6, terms)
       where id = $1 returning *`,
      [quote.id, parseDate(flags.on) || today(), premium, parsePct(flags.brokerage), parseMoney(flags.excess), flags.terms && flags.terms !== true ? String(flags.terms) : null],
    );
    return { text: `${quote.quote_ref}: ${quote.insurer_name} quoted ${money(premium)} for ${quote.client_name}.`, json: row };
  }
  if (verb === 'present') {
    const [row] = await db.query(
      `update quotes set status = 'presented' where id = $1 returning *`, [quote.id],
    );
    if (quote.renewal_id) {
      await db.query(
        `update renewals set stage = 'presented', presented_on = $2, premium_offered_cents = $3 where id = $1`,
        [quote.renewal_id, parseDate(flags.on) || today(), num(quote.premium_cents)],
      );
    }
    return { text: `${quote.quote_ref}: presented to ${quote.client_name}. Write the advice record before they instruct: advice-record add "${quote.client_name}"`, json: row };
  }
  if (verb === 'decline') {
    const reason = rest.slice(1).join(' ') || str(flags.reason);
    const [row] = await db.query(
      `update quotes set status = 'declined', decline_reason = $2 where id = $1 returning *`,
      [quote.id, reason || 'no reason given'],
    );
    return { text: `${quote.quote_ref}: ${quote.insurer_name} declined. ${reason}`, json: row };
  }
  if (verb === 'lose') {
    const reason = rest.slice(1).join(' ') || str(flags.reason);
    const [row] = await db.query(
      `update quotes set status = 'lost', lost_reason = $2 where id = $1 returning *`,
      [quote.id, reason || 'no reason given'],
    );
    return { text: `${quote.quote_ref}: not taken. ${reason}`, json: row };
  }
  return cmdQuoteShow(db, quote);
}

async function cmdPlace(db, args, flags) {
  const quote = await resolve(db, 'quote', args.join(' '));
  if (!num(quote.premium_cents)) throw new CliError(`${quote.quote_ref} has no premium yet. Run: quote receive ${quote.quote_ref} --premium=...`);
  const policyNo = flags['policy-no'] && flags['policy-no'] !== true ? String(flags['policy-no']) : null;
  if (!policyNo) throw new CliError('What is the policy number the insurer issued? --policy-no="NZI-MD-90210"');
  const prior = quote.policy_id ? (await db.query('select * from policies where id = $1', [quote.policy_id]))[0] : null;
  const inception = parseDate(flags.inception) || (prior ? isoDate(prior.expiry_on) : today());
  const expiry = parseDate(flags.expiry) || addYears(inception, 1);
  const brokeragePct = parsePct(flags.brokerage) || num(quote.brokerage_pct);
  const base = num(quote.premium_cents);
  const client = await resolve(db, 'client', quote.client_id);
  const broker = await whoIs(db, flags);
  const levies = ['material damage', 'business interruption', 'rural', 'contract works', 'home', 'contents'].includes(quote.class)
    ? Math.round(base * 0.0106)
    : 0;
  const gst = Math.round((base + levies) * 0.15);
  const brokerage = Math.round((base * brokeragePct) / 100);
  const fee = parseMoney(flags.fee);

  const [policy] = await db.query(
    `insert into policies (policy_no, client_id, insurer_id, broker_id, class, cover_summary, status,
                           inception_on, expiry_on, sum_insured_cents, excess_cents, base_premium_cents,
                           levies_cents, gst_cents, gross_premium_cents, brokerage_pct, brokerage_cents,
                           broker_fee_cents, payment_method, funder, prior_policy_id, placed_from_quote_id, placed_on, insurer_ref, notes)
     values ($1, $2, $3, $4, $5, $6, 'in force', $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
     returning *`,
    [
      policyNo, client.id, quote.insurer_id, broker?.id ?? prior?.broker_id ?? null, quote.class,
      str(flags.cover) || prior?.cover_summary || quote.terms || '', inception, expiry,
      num(quote.sum_insured_cents) || num(prior?.sum_insured_cents), num(quote.excess_cents) || num(prior?.excess_cents),
      base, levies, gst, base + levies + gst, brokeragePct, brokerage, fee,
      str(flags['payment-method']) || prior?.payment_method || 'direct',
      str(flags.funder) || prior?.funder || null,
      prior?.id ?? null, quote.id, today(), str(flags['insurer-ref']) || null, str(flags.note) || null,
    ],
  );
  await db.query("update quotes set status = 'accepted', policy_id = $2 where id = $1", [quote.id, policy.id]);
  await db.query("update quotes set status = 'lost', lost_reason = coalesce(lost_reason, 'placed elsewhere') where renewal_id = $1 and id <> $2 and status in ('requested', 'received', 'presented')", [quote.renewal_id, quote.id]);
  if (prior) await db.query("update policies set status = 'renewed' where id = $1", [prior.id]);
  if (quote.renewal_id) {
    await db.query(
      `update renewals set stage = 'bound', bound_on = $2, closed_on = $2, new_policy_id = $3, outcome = 'renewed' where id = $1`,
      [quote.renewal_id, today(), policy.id],
    );
  }
  await db.query(
    `insert into commissions (policy_id, client_id, insurer_id, kind, earned_on, period_month, amount_cents, gst_cents, status, note)
     values ($1, $2, $3, 'brokerage', $4, date_trunc('month', $4::date)::date, $5, $6, 'accrued', $7)`,
    [policy.id, client.id, quote.insurer_id, today(), brokerage, Math.round(brokerage * 0.15), `Brokerage on ${policyNo}`],
  );
  if (fee) {
    await db.query(
      `insert into commissions (policy_id, client_id, insurer_id, kind, earned_on, period_month, amount_cents, gst_cents, status, note)
       values ($1, $2, $3, 'broker fee', $4, date_trunc('month', $4::date)::date, $5, $6, 'accrued', $7)`,
      [policy.id, client.id, quote.insurer_id, today(), fee, Math.round(fee * 0.15), `Broker fee on ${policyNo}`],
    );
  }
  const hasAdvice = await db.query('select 1 from advice_records where client_id = $1 and given_on >= current_date - 30', [client.id]);
  const warn = hasAdvice.length
    ? ''
    : `\n  No advice record in the last thirty days for ${client.name}. Write one: advice-record add "${client.name}" --policy=${policyNo} --scope="..." --recommendation="..." --reasons="..."`;
  return {
    text:
      `${policyNo}: ${quote.class} placed with ${quote.insurer_name} for ${client.name}.\n` +
      `  ${isoDate(inception)} to ${isoDate(expiry)}, ${money(base + levies + gst)} gross, ${money(brokerage)} brokerage${fee ? ` plus a ${money(fee)} fee` : ''}.` +
      warn,
    json: policy,
  };
}

const RENEWAL_STAGES = ['not started', 'reviewing', 'in market', 'terms received', 'presented', 'instructed', 'bound', 'lapsed', 'not renewed'];

async function cmdRenewal(db, args, flags) {
  const [verb, ...rest] = args;
  if (!verb) throw new CliError('renewal start|contact|market|terms|present|instruct|lapse <policy>');
  const policy = await resolve(db, 'policy', rest.join(' '));
  let [renewal] = await db.query('select * from renewals where policy_id = $1', [policy.id]);
  if (!renewal) {
    const broker = await whoIs(db, flags);
    [renewal] = await db.query(
      `insert into renewals (policy_id, due_on, stage, broker_id, premium_last_cents)
       values ($1, $2, 'reviewing', $3, $4) returning *`,
      [policy.id, isoDate(policy.expiry_on), broker?.id ?? policy.broker_id ?? null, num(policy.gross_premium_cents)],
    );
  }
  const on = parseDate(flags.on) || today();
  const set = [];
  const params = [renewal.id];
  const push = (frag, value) => {
    params.push(value);
    set.push(`${frag} = $${params.length}`);
  };
  let message;
  switch (verb) {
    case 'start':
      push('stage', 'reviewing');
      push('invited_on', on);
      message = 'review started';
      break;
    case 'contact':
      push('client_contacted_on', on);
      if (renewal.stage === 'not started') push('stage', 'reviewing');
      message = 'client contacted';
      break;
    case 'market':
      push('stage', 'in market');
      push('invited_on', renewal.invited_on ? isoDate(renewal.invited_on) : on);
      push('terms_due_on', parseDate(flags['terms-due']) || addDays(on, 10));
      message = 'out to market';
      break;
    case 'terms':
      push('stage', 'terms received');
      message = 'terms received';
      break;
    case 'present':
      push('stage', 'presented');
      push('presented_on', on);
      if (flags.premium) push('premium_offered_cents', parseMoney(flags.premium));
      message = 'presented to the client';
      break;
    case 'instruct':
      push('stage', 'instructed');
      push('instructed_on', on);
      message = 'client instructed. Bind it with `place <quote-ref> --policy-no=...`';
      break;
    case 'lapse':
      push('stage', 'lapsed');
      push('closed_on', on);
      push('outcome', rest.length > 1 ? rest.slice(1).join(' ') : str(flags.reason) || 'lapsed');
      message = 'marked lapsed';
      break;
    default:
      throw new CliError(`"${verb}" is not a renewal step. Use ${['start', 'contact', 'market', 'terms', 'present', 'instruct', 'lapse'].join(', ')}.`);
  }
  if (flags.note && flags.note !== true) push('notes', String(flags.note));
  const [row] = await db.query(`update renewals set ${set.join(', ')} where id = $1 returning *`, params);
  return { text: `${policy.policy_no} (${policy.client_name}): ${message}. Stage is now ${row.stage}, expiry ${isoDate(policy.expiry_on)}.`, json: row };
}

async function cmdEndorse(db, args, flags) {
  if (args[0] === 'confirm') {
    const e = await resolve(db, 'endorsement', args.slice(1).join(' '));
    const [row] = await db.query(
      `update endorsements set status = 'confirmed', confirmed_on = $2, insurer_ref = coalesce($3, insurer_ref) where id = $1 returning *`,
      [e.id, parseDate(flags.on) || today(), flags.ref && flags.ref !== true ? String(flags.ref) : null],
    );
    if (num(e.brokerage_adjustment_cents)) {
      const [p] = await db.query('select * from policies where id = $1', [e.policy_id]);
      await db.query(
        `insert into commissions (policy_id, client_id, insurer_id, kind, earned_on, period_month, amount_cents, gst_cents, status, note)
         values ($1, $2, $3, 'endorsement', $4, date_trunc('month', $4::date)::date, $5, $6, 'accrued', $7)`,
        [p.id, p.client_id, p.insurer_id, today(), num(e.brokerage_adjustment_cents), Math.round(num(e.brokerage_adjustment_cents) * 0.15), `Brokerage on ${e.endorsement_no}`],
      );
    }
    return { text: `${e.endorsement_no}: confirmed by the insurer. Cover on ${e.policy_no} is now on risk as changed.`, json: row };
  }
  const policy = await resolve(db, 'policy', args[0]);
  const description = args.slice(1).join(' ') || str(flags.description);
  if (!description) throw new CliError('What changed? endorse <policy> "add the fourth site to the schedule" --effective=2026-09-01');
  const broker = await whoIs(db, flags);
  const [{ count }] = await db.query('select count(*) as count from endorsements');
  const no = flags.number && flags.number !== true ? String(flags.number) : `END-${new Date().getFullYear() % 100}${String(Number(count) + 1).padStart(4, '0')}`;
  const premium = parseMoney(flags.premium);
  const brokeragePct = num(policy.brokerage_pct);
  const brokerage = flags.brokerage ? parseMoney(flags.brokerage) : Math.round((premium * brokeragePct) / 100);
  const [row] = await db.query(
    `insert into endorsements (endorsement_no, policy_id, kind, effective_on, requested_on, description, status,
                               premium_adjustment_cents, brokerage_adjustment_cents, broker_id, notes)
     values ($1, $2, $3, $4, $5, $6, 'requested', $7, $8, $9, $10) returning *`,
    [
      no, policy.id, str(flags.kind) || 'change',
      parseDate(flags.effective) || today(), today(), description,
      premium, brokerage, broker?.id ?? policy.broker_id ?? null, str(flags.note) || null,
    ],
  );
  return {
    text:
      `${no}: instructed on ${policy.policy_no} (${policy.client_name}), effective ${isoDate(row.effective_on)}.\n` +
      `  ${description}\n` +
      `  Not on risk until the insurer confirms it. Confirm with: endorse confirm ${no} --ref=<insurer reference>`,
    json: row,
  };
}

const CLAIM_EVENT_KINDS = [
  'notified', 'insurer acknowledged', 'assessor appointed', 'information requested',
  'information sent', 'client updated', 'settlement offered', 'payment made', 'declined', 'reopened', 'closed',
];

const CLAIM_VERBS = new Set(['new', 'event', 'update', 'settle', 'close']);

async function cmdClaim(db, args, flags) {
  const [verb, ...rest] = args;
  if (!verb) throw new CliError('claim new|event|update|settle|close <...>, or `claim <number>` to read one.');
  if (!CLAIM_VERBS.has(verb)) return cmdClaimShow(db, await resolve(db, 'claim', args.join(' ')));

  if (verb === 'new') {
    const policy = await resolve(db, 'policy', rest[0]);
    const description = rest.slice(1).join(' ') || str(flags.description);
    if (!description) throw new CliError('What happened? claim new <policy> "storm damage to the retaining wall" --loss=2026-09-02');
    const broker = await whoIs(db, flags);
    const [{ count }] = await db.query('select count(*) as count from claims');
    const no = flags.number && flags.number !== true ? String(flags.number) : `CLM-${new Date().getFullYear() % 100}${String(Number(count) + 1).padStart(3, '0')}`;
    const [row] = await db.query(
      `insert into claims (claim_no, policy_id, client_id, insurer_id, class, loss_on, notified_on, description,
                           status, reserve_cents, excess_cents, last_client_update_on, broker_id, notes)
       values ($1, $2, $3, $4, $5, $6, $7, $8, 'notified', $9, $10, $7, $11, $12) returning *`,
      [
        no, policy.id, policy.client_id, policy.insurer_id, policy.class,
        parseDate(flags.loss) || today(), parseDate(flags.on) || today(), description,
        parseMoney(flags.reserve), parseMoney(flags.excess) || num(policy.excess_cents),
        broker?.id ?? policy.broker_id ?? null, str(flags.note) || null,
      ],
    );
    await db.query(
      `insert into claim_events (claim_id, happened_on, kind, note, actor) values ($1, $2, 'notified', $3, $4)`,
      [row.id, isoDate(row.notified_on), `Notified to ${policy.insurer_name || 'the insurer'}.`, broker?.full_name || 'the brokerage'],
    );
    return {
      text:
        `${no}: notified on ${policy.policy_no} (${policy.client_name}), loss ${isoDate(row.loss_on)}.\n` +
        `  Send it to ${policy.claims_email || 'the insurer'}. Excess ${price(row.excess_cents)}.\n` +
        `  The Code wants the client kept informed: log every update with \`claim update ${no} "<what you told them>"\`.`,
      json: row,
    };
  }

  const claim = await resolve(db, 'claim', rest[0] || flags.claim);

  if (verb === 'event') {
    const kind = rest[1];
    if (!kind) throw new CliError(`Which event? One of: ${CLAIM_EVENT_KINDS.join(', ')}`);
    const note = rest.slice(2).join(' ') || str(flags.note);
    const on = parseDate(flags.on) || today();
    const broker = await whoIs(db, flags);
    const [row] = await db.query(
      `insert into claim_events (claim_id, happened_on, kind, note, actor) values ($1, $2, $3, $4, $5) returning *`,
      [claim.id, on, kind, note || null, str(flags.actor) || broker?.full_name || 'the brokerage'],
    );
    const statusFor = {
      'insurer acknowledged': 'acknowledged',
      'assessor appointed': 'assessing',
      'information requested': 'information requested',
      'settlement offered': 'settlement offered',
      declined: 'declined',
    }[kind];
    if (statusFor) await db.query('update claims set status = $2 where id = $1', [claim.id, statusFor]);
    if (kind === 'client updated') await db.query('update claims set last_client_update_on = $2 where id = $1', [claim.id, on]);
    if (kind === 'insurer acknowledged') await db.query('update claims set last_insurer_update_on = $2 where id = $1', [claim.id, on]);
    return { text: `${claim.claim_no}: ${kind}${note ? `. ${note}` : ''}`, json: row };
  }
  if (verb === 'update') {
    const note = rest.slice(1).join(' ') || str(flags.note);
    if (!note) throw new CliError('What did you tell the client? claim update <claim> "the assessor has been and the report is due Friday"');
    const on = parseDate(flags.on) || today();
    const broker = await whoIs(db, flags);
    await db.query(
      `insert into claim_events (claim_id, happened_on, kind, note, actor) values ($1, $2, 'client updated', $3, $4)`,
      [claim.id, on, note, str(flags.actor) || broker?.full_name || 'the brokerage'],
    );
    const [row] = await db.query('update claims set last_client_update_on = $2 where id = $1 returning *', [claim.id, on]);
    return { text: `${claim.claim_no}: client updated ${on}. ${note}`, json: row };
  }
  if (verb === 'settle') {
    const amount = parseMoney(flags.amount);
    if (!amount) throw new CliError('How much? claim settle <claim> --amount=34200');
    const on = parseDate(flags.on) || today();
    const [row] = await db.query(
      `update claims set status = 'settled', settled_cents = $2, settled_on = $3, reserve_cents = 0 where id = $1 returning *`,
      [claim.id, amount, on],
    );
    await db.query(
      `insert into claim_events (claim_id, happened_on, kind, note, actor) values ($1, $2, 'payment made', $3, $4)`,
      [claim.id, on, `Settled at ${money(amount)}.`, str(flags.actor) || claim.insurer_name || 'the insurer'],
    );
    return { text: `${claim.claim_no}: settled at ${money(amount)} on ${on}. Close it with \`claim close ${claim.claim_no}\`.`, json: row };
  }
  if (verb === 'close') {
    const on = parseDate(flags.on) || today();
    const [row] = await db.query('update claims set closed_on = $2 where id = $1 returning *', [claim.id, on]);
    await db.query(
      `insert into claim_events (claim_id, happened_on, kind, note, actor) values ($1, $2, 'closed', $3, $4)`,
      [claim.id, on, str(flags.note) || 'Closed.', 'the brokerage'],
    );
    return { text: `${claim.claim_no}: closed ${on}.`, json: row };
  }
  return cmdClaimShow(db, claim);
}

async function cmdAdviceRecord(db, args, flags) {
  const [verb, ...rest] = args;
  if (verb === 'add') {
    const client = await resolve(db, 'client', rest.join(' '));
    const policy = flags.policy && flags.policy !== true ? await resolve(db, 'policy', flags.policy) : null;
    const broker = await whoIs(db, flags);
    const missing = ['scope', 'recommendation', 'reasons'].filter((k) => !flags[k] || flags[k] === true);
    if (missing.length) {
      throw new CliError(
        `An advice record needs ${missing.map((m) => `--${m}=`).join(' ')}.\n` +
          '  --scope        what the advice covers and what it does not\n' +
          '  --recommendation  what you told them to do\n' +
          '  --reasons      why it is suitable for this client\n' +
          '  optional: --needs= --alternatives= --risks= --limitations= --disclosed --remuneration="17.5% plus a $250 fee"',
      );
    }
    const [row] = await db.query(
      `insert into advice_records (client_id, policy_id, broker_id, given_on, method, nature_and_scope,
                                   needs_and_circumstances, recommendation, reasons, alternatives_considered,
                                   risks_disclosed, limitations, disclosure_given_on, remuneration_disclosed,
                                   remuneration_note, client_confirmed_on)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) returning *`,
      [
        client.id, policy?.id ?? null, broker?.id ?? null,
        parseDate(flags.on) || today(), str(flags.method) || 'meeting',
        String(flags.scope), str(flags.needs) || null, String(flags.recommendation), String(flags.reasons),
        str(flags.alternatives) || null, str(flags.risks) || null, str(flags.limitations) || null,
        flags.disclosed || flags.remuneration ? parseDate(flags.on) || today() : null,
        Boolean(flags.remuneration && flags.remuneration !== true) || flags.disclosed === true,
        str(flags.remuneration) || null,
        parseDate(flags.confirmed),
      ],
    );
    const gaps = [];
    if (!row.disclosure_given_on) gaps.push('no disclosure date');
    if (!row.remuneration_disclosed) gaps.push('no remuneration disclosure');
    if (!row.alternatives_considered) gaps.push('no alternatives recorded');
    return {
      text:
        `Advice recorded for ${client.name}${policy ? ` on ${policy.policy_no}` : ''}, ${isoDate(row.given_on)}.` +
        (gaps.length ? `\n  Gaps a reviewer will find: ${gaps.join(', ')}.` : ''),
      json: row,
    };
  }
  if (!verb) return cmdAdvice(db, [], flags);
  const a = await resolve(db, 'advice', args.join(' '));
  return cmdAdviceShow(db, a);
}

async function cmdTask(db, args, flags) {
  const [verb, ...rest] = args;
  if (verb === 'add') {
    const title = rest.join(' ') || str(flags.title);
    if (!title) throw new CliError('task add "chase NZI for the renewal terms" --client="Kauri Joinery" --due=2026-09-20');
    const client = flags.client && flags.client !== true ? await resolve(db, 'client', flags.client) : null;
    const policy = flags.policy && flags.policy !== true ? await resolve(db, 'policy', flags.policy) : null;
    const claim = flags.claim && flags.claim !== true ? await resolve(db, 'claim', flags.claim) : null;
    const broker = await whoIs(db, flags);
    const [row] = await db.query(
      `insert into tasks (title, kind, client_id, policy_id, claim_id, due_on, broker_id, note)
       values ($1, $2, $3, $4, $5, $6, $7, $8) returning *`,
      [
        title, str(flags.kind) || 'follow up',
        client?.id ?? policy?.client_id ?? claim?.client_id ?? null,
        policy?.id ?? null, claim?.id ?? null,
        parseDate(flags.due) || addDays(today(), 7), broker?.id ?? null, str(flags.note) || null,
      ],
    );
    return { text: `Task ${short(row.id)} added, due ${isoDate(row.due_on)}: ${title}`, json: row };
  }
  if (verb === 'done') {
    const t = await resolve(db, 'task', rest.join(' '));
    const [row] = await db.query(
      `update tasks set status = 'done', done_on = $2, note = coalesce($3, note) where id = $1 returning *`,
      [t.id, parseDate(flags.on) || today(), str(flags.note) || null],
    );
    return { text: `Done: ${t.title}`, json: row };
  }
  return cmdTasks(db, args, flags);
}

async function cmdNote(db, args, flags) {
  const clientQuery = args[0];
  const body = args.slice(1).join(' ') || str(flags.note);
  if (!clientQuery || !body) throw new CliError('note <client> "<what happened>" [--kind=call --on=YYYY-MM-DD]');
  const client = await resolve(db, 'client', clientQuery);
  const policy = flags.policy && flags.policy !== true ? await resolve(db, 'policy', flags.policy) : null;
  const broker = await whoIs(db, flags);
  const [row] = await db.query(
    `insert into client_notes (client_id, policy_id, kind, happened_on, body, created_by)
     values ($1, $2, $3, $4, $5, $6) returning *`,
    [client.id, policy?.id ?? null, str(flags.kind) || 'note', parseDate(flags.on) || today(), body, broker?.full_name || 'the brokerage'],
  );
  return { text: `${client.name}: logged. ${body}`, json: row };
}

async function cmdComplaintShow(db, x) {
  const lines = [];
  lines.push(heading(`Complaint ${short(x.id)}  ${x.client_name || 'unknown client'}`));
  lines.push(`  Received ${isoDate(x.received_on)} by ${x.channel || 'unknown channel'}, ${x.status}`);
  lines.push(`  About: ${x.about}`);
  lines.push(`  Acknowledged ${x.acknowledged_on ? isoDate(x.acknowledged_on) : 'NOT YET'}, last update ${x.last_update_on ? isoDate(x.last_update_on) : 'NEVER'}`);
  if (x.resolved_on) lines.push(`  Resolved ${isoDate(x.resolved_on)}: ${x.outcome || 'no outcome recorded'}`);
  lines.push('  Code timeframes: acknowledge promptly, update at least every ten business days, resolve inside thirty calendar days.');
  return { text: lines.join('\n'), json: x };
}

async function cmdComplaint(db, args, flags) {
  const [verb, ...rest] = args;
  if (verb === 'new') {
    const client = await resolve(db, 'client', rest[0]);
    const about = rest.slice(1).join(' ') || str(flags.about);
    if (!about) throw new CliError('complaint new <client> "<what they are unhappy about>"');
    const broker = await whoIs(db, flags);
    const [row] = await db.query(
      `insert into complaints (client_id, policy_id, claim_id, received_on, about, channel, status, acknowledged_on, last_update_on, broker_id)
       values ($1, $2, $3, $4, $5, $6, 'open', $4, $4, $7) returning *`,
      [
        client.id,
        flags.policy && flags.policy !== true ? (await resolve(db, 'policy', flags.policy)).id : null,
        flags.claim && flags.claim !== true ? (await resolve(db, 'claim', flags.claim)).id : null,
        parseDate(flags.on) || today(), about, str(flags.channel) || 'email', broker?.id ?? null,
      ],
    );
    return {
      text:
        `Complaint ${short(row.id)} logged for ${client.name}, received ${isoDate(row.received_on)}.\n` +
        `  Acknowledged today. Update the complainant at least every ten business days and resolve inside thirty calendar days.`,
      json: row,
    };
  }
  if (verb && !['update', 'resolve'].includes(verb)) {
    return { ...(await cmdComplaintShow(db, await resolve(db, 'complaint', args.join(' ')))) };
  }
  const x = verb ? await resolve(db, 'complaint', rest[0]) : null;
  if (verb === 'update') {
    const [row] = await db.query('update complaints set last_update_on = $2, status = $3 where id = $1 returning *', [
      x.id, parseDate(flags.on) || today(), 'investigating',
    ]);
    return { text: `Complaint ${short(x.id)}: complainant updated ${isoDate(row.last_update_on)}.`, json: row };
  }
  if (verb === 'resolve') {
    const outcome = rest.slice(1).join(' ') || str(flags.outcome);
    if (!outcome) throw new CliError('complaint resolve <id> "<what was decided and why>"');
    const [row] = await db.query(
      `update complaints set status = 'resolved', resolved_on = $2, last_update_on = $2, outcome = $3 where id = $1 returning *`,
      [x.id, parseDate(flags.on) || today(), outcome],
    );
    return { text: `Complaint ${short(x.id)}: resolved ${isoDate(row.resolved_on)}. ${outcome}`, json: row };
  }
  return cmdComplaints(db, args, flags);
}

async function cmdCommission(db, args, flags) {
  const [verb, ...rest] = args;
  if (verb === 'invoice') {
    const policy = await resolve(db, 'policy', rest.join(' '));
    const rows = await db.query(
      `update commissions set status = 'invoiced', invoice_ref = coalesce($2, invoice_ref)
       where policy_id = $1 and status = 'accrued' returning *`,
      [policy.id, flags.ref && flags.ref !== true ? String(flags.ref) : null],
    );
    return { text: `${policy.policy_no}: ${rows.length} brokerage entries marked invoiced, ${money(rows.reduce((a, r) => a + num(r.amount_cents), 0))}.`, json: rows };
  }
  if (verb === 'receive') {
    const policy = await resolve(db, 'policy', rest.join(' '));
    const rows = await db.query(
      `update commissions set status = 'received', received_on = $2
       where policy_id = $1 and status in ('accrued', 'invoiced') returning *`,
      [policy.id, parseDate(flags.on) || today()],
    );
    return { text: `${policy.policy_no}: ${rows.length} brokerage entries reconciled, ${money(rows.reduce((a, r) => a + num(r.amount_cents), 0))}.`, json: rows };
  }
  return cmdCommissions(db, args, flags);
}

async function cmdAdd(db, args, flags) {
  const [what, ...rest] = args;
  const name = rest.join(' ').trim() || str(flags.name);
  if (!what) throw new CliError('add client|contact|insurer|broker|policy "<name>" [--flags]');
  if (!name) throw new CliError(`add ${what} "<name>" [--flags]`);

  if (what === 'client') {
    const broker = flags.broker && flags.broker !== true ? await resolve(db, 'broker', flags.broker) : await whoIs(db, flags);
    const [row] = await db.query(
      `insert into clients (name, client_type, trading_name, company_no, industry, email, phone, address, suburb, city, region,
                            status, broker_id, client_since, headcount, engagement_signed_on, notes)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) returning *`,
      [
        name, str(flags.type) || 'business', str(flags['trading-name']) || null, str(flags.company) || null,
        str(flags.industry) || null, str(flags.email) || null, str(flags.phone) || null, str(flags.address) || null,
        str(flags.suburb) || null, str(flags.city) || null, str(flags.region) || null,
        str(flags.status) || 'active', broker?.id ?? null, parseDate(flags.since) || today(),
        flags.headcount && flags.headcount !== true ? Number(flags.headcount) : null,
        parseDate(flags.engaged), str(flags.note) || null,
      ],
    );
    return {
      text:
        `Added client ${name}.` +
        (row.engagement_signed_on ? '' : '\n  No terms of engagement on file. The Code wants them in writing before you act (clause 4.2(a)).'),
      json: row,
    };
  }
  if (what === 'contact') {
    if (!flags.client || flags.client === true) throw new CliError('add contact "<name>" --client="<client>" [--role= --email= --phone=]');
    const client = await resolve(db, 'client', flags.client);
    const [row] = await db.query(
      `insert into contacts (client_id, full_name, role, email, phone, is_primary, notes)
       values ($1, $2, $3, $4, $5, $6, $7) returning *`,
      [client.id, name, str(flags.role) || null, str(flags.email) || null, str(flags.phone) || null, Boolean(flags.primary), str(flags.note) || null],
    );
    return { text: `Added ${name} at ${client.name}.`, json: row };
  }
  if (what === 'insurer') {
    const [row] = await db.query(
      `insert into insurers (name, code, kind, underwriter_name, underwriter_email, claims_email, phone,
                             strength_rating, agency_agreement_ref, default_brokerage_pct, notes)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning *`,
      [
        name, str(flags.code) || null, str(flags.kind) || 'insurer', str(flags.underwriter) || null,
        str(flags['underwriter-email']) || null, str(flags['claims-email']) || null, str(flags.phone) || null,
        str(flags.rating) || null, str(flags.agreement) || null, parsePct(flags.brokerage), str(flags.note) || null,
      ],
    );
    return { text: `Added market ${name}.`, json: row };
  }
  if (what === 'broker') {
    const [row] = await db.query(
      `insert into brokers (full_name, code, email, phone, role, adviser_ref, started_on)
       values ($1, $2, $3, $4, $5, $6, $7) returning *`,
      [name, str(flags.code) || null, str(flags.email) || null, str(flags.phone) || null, str(flags.role) || 'broker', str(flags['adviser-ref']) || null, parseDate(flags.started) || today()],
    );
    return { text: `Added ${name} (${row.role}).`, json: row };
  }
  if (what === 'policy') {
    if (!flags.client || flags.client === true) throw new CliError('add policy "<policy number>" --client= --class= --insurer= --inception= --expiry= --premium=');
    const client = await resolve(db, 'client', flags.client);
    const insurer = flags.insurer && flags.insurer !== true ? await resolve(db, 'insurer', flags.insurer) : null;
    const broker = await whoIs(db, flags);
    const inception = parseDate(flags.inception) || today();
    const base = parseMoney(flags.premium);
    const pct = parsePct(flags.brokerage) || num(insurer?.default_brokerage_pct);
    const levies = ['material damage', 'business interruption', 'rural', 'contract works', 'home', 'contents'].includes(str(flags.class))
      ? Math.round(base * 0.0106)
      : 0;
    const gst = Math.round((base + levies) * 0.15);
    const [row] = await db.query(
      `insert into policies (policy_no, client_id, insurer_id, broker_id, class, cover_summary, status, inception_on, expiry_on,
                             sum_insured_cents, excess_cents, base_premium_cents, levies_cents, gst_cents, gross_premium_cents,
                             brokerage_pct, brokerage_cents, broker_fee_cents, payment_method, insurer_ref, placed_on, notes)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $8, $21) returning *`,
      [
        name, client.id, insurer?.id ?? null, broker?.id ?? null, str(flags.class) || 'material damage',
        str(flags.cover) || null, str(flags.status) || 'in force', inception,
        parseDate(flags.expiry) || addYears(inception, 1),
        parseMoney(flags['sum-insured']), parseMoney(flags.excess), base, levies, gst, base + levies + gst,
        pct, Math.round((base * pct) / 100), parseMoney(flags.fee), str(flags['payment-method']) || 'direct',
        str(flags['insurer-ref']) || null, str(flags.note) || null,
      ],
    );
    return { text: `Added policy ${name} for ${client.name}, ${money(row.gross_premium_cents)} gross, ${money(row.brokerage_cents)} brokerage.`, json: row };
  }
  throw new CliError(`"${what}" is not something you can add. Use client, contact, insurer, broker or policy.`);
}

// ---------------------------------------------------------------------------
// Import and export

const SOURCES = {
  javln: {
    label: 'JAVLN',
    client: {
      name: ['Client Name', 'Client', 'Insured', 'Insured Name', 'Name', 'ClientName'],
      ref: ['Client Code', 'Client Ref', 'Client Number', 'ClientId', 'Code', 'Account'],
      type: ['Client Type', 'Type', 'Entity Type'],
      company: ['NZBN', 'ABN', 'Company Number', 'Registration Number'],
      industry: ['Industry', 'Occupation', 'Business Type'],
      email: ['Email', 'Email Address', 'Client Email'],
      phone: ['Phone', 'Telephone', 'Mobile', 'Contact Number'],
      address: ['Address', 'Street Address', 'Address Line 1', 'Postal Address'],
      suburb: ['Suburb'],
      city: ['City', 'Town'],
      region: ['Region', 'State'],
      broker: ['Broker', 'Account Executive', 'Adviser', 'Servicing Broker', 'Owner'],
    },
    policy: {
      number: ['Policy Number', 'Policy No', 'PolicyNumber', 'Policy Reference'],
      client: ['Client Name', 'Client', 'Insured', 'Client Code', 'Insured Name'],
      class: ['Class', 'Class of Business', 'Product', 'Cover Type', 'Risk Type', 'Policy Type'],
      insurer: ['Insurer', 'Underwriter', 'Market', 'Insurance Company', 'Company'],
      inception: ['Inception Date', 'Effective Date', 'Start Date', 'From', 'Inception'],
      expiry: ['Expiry Date', 'Renewal Date', 'End Date', 'To', 'Expiry'],
      premium: ['Gross Premium', 'Total Premium', 'Premium', 'Annual Premium', 'Premium Incl'],
      base: ['Base Premium', 'Net Premium', 'Premium Excl'],
      brokerage: ['Brokerage', 'Commission', 'Brokerage Amount', 'Commission Amount'],
      brokeragePct: ['Brokerage %', 'Commission %', 'Brokerage Rate'],
      fee: ['Broker Fee', 'Fee', 'Policy Fee'],
      sumInsured: ['Sum Insured', 'Total Sum Insured', 'Limit', 'Limit of Liability'],
      excess: ['Excess', 'Deductible'],
      status: ['Status', 'Policy Status'],
      ref: ['Insurer Reference', 'Insurer Policy Number', 'Underwriter Reference'],
      broker: ['Broker', 'Account Executive', 'Adviser', 'Servicing Broker'],
      payment: ['Payment Method', 'Funded', 'Premium Funding'],
    },
    contact: {
      client: ['Client Name', 'Client', 'Insured', 'Client Code'],
      name: ['Contact Name', 'Name', 'Full Name', 'Contact'],
      role: ['Role', 'Position', 'Title', 'Job Title'],
      email: ['Email', 'Email Address'],
      phone: ['Phone', 'Mobile', 'Telephone'],
    },
    claim: {
      number: ['Claim Number', 'Claim No', 'ClaimNumber', 'Claim Reference'],
      policy: ['Policy Number', 'Policy No', 'PolicyNumber'],
      loss: ['Date of Loss', 'Loss Date', 'Incident Date', 'Event Date'],
      notified: ['Notified Date', 'Date Notified', 'Reported Date', 'Lodged'],
      description: ['Description', 'Details', 'Loss Description', 'Circumstances'],
      status: ['Status', 'Claim Status'],
      reserve: ['Reserve', 'Estimate', 'Outstanding'],
      settled: ['Paid', 'Settled', 'Settlement', 'Amount Paid'],
      excess: ['Excess', 'Deductible'],
      ref: ['Insurer Claim Number', 'Insurer Reference', 'Claim Ref'],
    },
  },
};
SOURCES.insight = { ...SOURCES.javln, label: 'Insight' };
SOURCES.winbeat = { ...SOURCES.javln, label: 'WinBEAT' };
SOURCES.csv = { ...SOURCES.javln, label: 'a plain CSV' };

function readCsv(file, what) {
  const full = path.isAbsolute(file) ? file : path.resolve(process.cwd(), file);
  if (!existsSync(full)) throw new CliError(`No ${what} file at ${full}`);
  return parseCsv(readFileSync(full, 'utf8'));
}

async function cmdImport(db, args, flags) {
  const source = (args[0] || 'csv').toLowerCase();
  const map = SOURCES[source];
  if (!map) throw new CliError(`Unknown source "${source}". Use javln, insight, winbeat or csv.`);
  if (!flags.clients && !flags.policies) throw new CliError('import javln --clients=clients.csv [--policies=policies.csv] [--contacts=contacts.csv] [--claims=claims.csv] [--dry-run]');
  const dry = Boolean(flags['dry-run']);
  const made = { clients: 0, clients_updated: 0, contacts: 0, insurers: 0, brokers: 0, policies: 0, claims: 0, skipped: [] };

  // A dry run writes nothing, so rows it would have created have to be remembered
  // or every policy looks like it belongs to a client that does not exist.
  const pendingClients = new Set();
  const pendingPolicies = new Set();

  const findClient = async (label) => {
    if (!label) return null;
    const rows = await db.query(
      'select * from clients where lower(name) = lower($1) or lower(coalesce(external_ref, \'\')) = lower($1) or lower(coalesce(trading_name, \'\')) = lower($1)',
      [label],
    );
    if (rows[0]) return rows[0];
    if (dry && pendingClients.has(label.toLowerCase())) return { id: null, name: label, broker_id: null, pending: true };
    return null;
  };
  const findPolicy = async (label) => {
    if (!label) return null;
    const rows = await db.query('select * from policies where lower(policy_no) = lower($1)', [label]);
    if (rows[0]) return rows[0];
    if (dry && pendingPolicies.has(label.toLowerCase())) return { id: null, policy_no: label, pending: true };
    return null;
  };
  const ensureBroker = async (label) => {
    if (!label) return null;
    const rows = await db.query('select * from brokers where lower(full_name) = lower($1) or lower(coalesce(code, \'\')) = lower($1)', [label]);
    if (rows[0]) return rows[0];
    if (dry) {
      made.brokers++;
      return null;
    }
    const [row] = await db.query('insert into brokers (full_name) values ($1) returning *', [label]);
    made.brokers++;
    return row;
  };
  const ensureInsurer = async (label) => {
    if (!label) return null;
    const rows = await db.query('select * from insurers where lower(name) = lower($1) or lower(coalesce(code, \'\')) = lower($1)', [label]);
    if (rows[0]) return rows[0];
    if (dry) {
      made.insurers++;
      return null;
    }
    const [row] = await db.query('insert into insurers (name) values ($1) returning *', [label]);
    made.insurers++;
    return row;
  };

  if (flags.clients && flags.clients !== true) {
    for (const r of readCsv(String(flags.clients), 'clients')) {
      const name = pick(r, ...map.client.name);
      if (!name) {
        made.skipped.push(`client row with no name (headers: ${Object.keys(r).slice(0, 6).join(', ')})`);
        continue;
      }
      const broker = await ensureBroker(pick(r, ...map.client.broker));
      const existing = await findClient(name) || await findClient(pick(r, ...map.client.ref));
      if (existing) {
        made.clients_updated++;
        continue;
      }
      made.clients++;
      if (dry) {
        pendingClients.add(name.toLowerCase());
        const code = pick(r, ...map.client.ref);
        if (code) pendingClients.add(code.toLowerCase());
        continue;
      }
      const typeRaw = pick(r, ...map.client.type).toLowerCase();
      await db.query(
        `insert into clients (name, client_type, company_no, industry, email, phone, address, suburb, city, region, broker_id, external_ref)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) on conflict do nothing`,
        [
          name,
          /person|individual|private/.test(typeRaw) ? 'individual' : 'business',
          pick(r, ...map.client.company) || null,
          pick(r, ...map.client.industry) || null,
          pick(r, ...map.client.email) || null,
          pick(r, ...map.client.phone) || null,
          pick(r, ...map.client.address) || null,
          pick(r, ...map.client.suburb) || null,
          pick(r, ...map.client.city) || null,
          pick(r, ...map.client.region) || null,
          broker?.id ?? null,
          pick(r, ...map.client.ref) || null,
        ],
      );
    }
  }

  if (flags.contacts && flags.contacts !== true) {
    for (const r of readCsv(String(flags.contacts), 'contacts')) {
      const clientName = pick(r, ...map.contact.client);
      const name = pick(r, ...map.contact.name);
      const client = await findClient(clientName);
      if (!client || !name) {
        made.skipped.push(`contact "${name || '(no name)'}" for unknown client "${clientName}"`);
        continue;
      }
      made.contacts++;
      if (dry) continue;
      await db.query(
        `insert into contacts (client_id, full_name, role, email, phone) values ($1, $2, $3, $4, $5)`,
        [client.id, name, pick(r, ...map.contact.role) || null, pick(r, ...map.contact.email) || null, pick(r, ...map.contact.phone) || null],
      );
    }
  }

  if (flags.policies && flags.policies !== true) {
    for (const r of readCsv(String(flags.policies), 'policies')) {
      const policyNo = pick(r, ...map.policy.number);
      const clientName = pick(r, ...map.policy.client);
      const client = await findClient(clientName);
      if (!policyNo || !client) {
        made.skipped.push(`policy "${policyNo || '(no number)'}" for unknown client "${clientName}"`);
        continue;
      }
      const existing = await findPolicy(policyNo);
      if (existing) continue;
      const insurer = await ensureInsurer(pick(r, ...map.policy.insurer));
      const broker = await ensureBroker(pick(r, ...map.policy.broker));
      made.policies++;
      if (dry) {
        pendingPolicies.add(policyNo.toLowerCase());
        continue;
      }
      const inception = parseDate(pick(r, ...map.policy.inception)) || today();
      const expiry = parseDate(pick(r, ...map.policy.expiry)) || addYears(inception, 1);
      const gross = parseMoney(pick(r, ...map.policy.premium));
      const base = parseMoney(pick(r, ...map.policy.base)) || Math.round(gross / 1.15);
      const brokerage = parseMoney(pick(r, ...map.policy.brokerage));
      const pctRaw = parsePct(pick(r, ...map.policy.brokeragePct));
      const statusRaw = pick(r, ...map.policy.status).toLowerCase();
      await db.query(
        `insert into policies (policy_no, client_id, insurer_id, broker_id, class, status, inception_on, expiry_on,
                               sum_insured_cents, excess_cents, base_premium_cents, gross_premium_cents,
                               brokerage_pct, brokerage_cents, broker_fee_cents, payment_method, insurer_ref, placed_on, external_ref)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $7, $18) on conflict do nothing`,
        [
          policyNo, client.id, insurer?.id ?? null, broker?.id ?? null,
          (pick(r, ...map.policy.class) || 'unclassified').toLowerCase(),
          /cancel/.test(statusRaw) ? 'cancelled' : /lapse/.test(statusRaw) ? 'lapsed' : /expire/.test(statusRaw) ? 'expired' : 'in force',
          inception, expiry,
          parseMoney(pick(r, ...map.policy.sumInsured)), parseMoney(pick(r, ...map.policy.excess)),
          base, gross || base,
          pctRaw || (base ? Math.round((brokerage / base) * 1000) / 10 : 0),
          brokerage, parseMoney(pick(r, ...map.policy.fee)),
          /fund/.test(pick(r, ...map.policy.payment).toLowerCase()) ? 'premium funded' : 'direct',
          pick(r, ...map.policy.ref) || null,
          `${source}:${policyNo}`,
        ],
      );
    }
  }

  if (flags.claims && flags.claims !== true) {
    for (const r of readCsv(String(flags.claims), 'claims')) {
      const claimNo = pick(r, ...map.claim.number);
      const policyNo = pick(r, ...map.claim.policy);
      const policy = await findPolicy(policyNo);
      if (!claimNo || !policy) {
        made.skipped.push(`claim "${claimNo || '(no number)'}" for unknown policy "${policyNo}"`);
        continue;
      }
      const existing = await db.query('select id from claims where lower(claim_no) = lower($1)', [claimNo]);
      if (existing.length) continue;
      made.claims++;
      if (dry) continue;
      const loss = parseDate(pick(r, ...map.claim.loss)) || today();
      await db.query(
        `insert into claims (claim_no, policy_id, client_id, insurer_id, class, loss_on, notified_on, description,
                             status, reserve_cents, settled_cents, excess_cents, insurer_claim_ref, broker_id)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) on conflict do nothing`,
        [
          claimNo, policy.id, policy.client_id, policy.insurer_id, policy.class, loss,
          parseDate(pick(r, ...map.claim.notified)) || loss,
          pick(r, ...map.claim.description) || 'imported claim, no description in the export',
          (pick(r, ...map.claim.status) || 'notified').toLowerCase(),
          parseMoney(pick(r, ...map.claim.reserve)), parseMoney(pick(r, ...map.claim.settled)),
          parseMoney(pick(r, ...map.claim.excess)), pick(r, ...map.claim.ref) || null, policy.broker_id,
        ],
      );
    }
  }

  const text =
    `${dry ? 'Dry run. ' : ''}Imported from ${map.label}:\n` +
    `  clients    ${made.clients} new, ${made.clients_updated} already here\n` +
    `  contacts   ${made.contacts}\n` +
    `  markets    ${made.insurers} created\n` +
    `  brokers    ${made.brokers} created\n` +
    `  policies   ${made.policies}\n` +
    `  claims     ${made.claims}\n` +
    (made.skipped.length
      ? `  skipped    ${made.skipped.length}\n${made.skipped.slice(0, 10).map((s) => `    ${s}`).join('\n')}\n`
      : '') +
    '\n  Check it with `clients`, `policies --all` and `renewals-due --days=365`.\n' +
    '  Advice records, covers and claim histories are not in most exports. Read docs/replace-javln.md for what does not carry over.';
  return { text, json: made };
}

async function cmdExport(db, args, flags) {
  const tables = [
    'brokers', 'clients', 'contacts', 'insurers', 'policies', 'covers', 'renewals', 'quotes',
    'endorsements', 'claims', 'claim_events', 'tasks', 'advice_records', 'commissions', 'complaints', 'client_notes',
  ];
  const dump = {};
  for (const t of tables) dump[t] = await db.query(`select * from ${t}`);
  const dir = path.join(REPO_ROOT, 'exports');
  mkdirSync(dir, { recursive: true });
  const file = flags.out && flags.out !== true ? String(flags.out) : path.join(dir, `broking-${today()}.json`);
  writeFileSync(file, JSON.stringify(dump, null, 2));
  const counts = Object.fromEntries(tables.map((t) => [t, dump[t].length]));
  return {
    text: `Wrote ${path.relative(REPO_ROOT, file)}\n  ${tables.map((t) => `${t} ${dump[t].length}`).join(', ')}`,
    json: { file, counts },
  };
}

// ---------------------------------------------------------------------------

const HELP = `broking-for-claude-code

Reads
  clients [q] [--broker= --status= --all]        the book: premium, brokerage, next expiry, last contact
  client <name|id>                               one client: contacts, policies, claims, advice, notes
  policies [client] [--class= --insurer= --expiring=60 --all]
  policy <number|id>                             one policy: sections, renewal, quotes, endorsements, claims, advice
  renewals-due [--days=90 --broker= --band= --stage=]   the cycle, banded 60 / 30 / 14 / expired
  quotes [--status= --client= --insurer= --all]  what is out to market and who owes us terms
  quote <ref>                                    one quote
  claims [--status= --client= --all] | claims-open      the claims board
  claim <number>                                 one claim with its whole history
  endorsements [--policy= --status= --all]       mid term changes, and which are not confirmed
  commissions [--month=YYYY-MM]                  brokerage by month, and what has not landed
  advice [--client= --days=]                     the advice records, and the gaps in them
  advice-record <id|policy>                      one advice record in full
  insurers [--all] | brokers [--all]             markets and the team
  tasks [--broker= --all] | complaints [--all]
  attention [--broker=]                          everything that wants a decision this week
  compliance [rule]                              the rules in docs/compliance.md, run against the data
  stats                                          the book, the cycle, claims, housekeeping

The renewal cycle
  renewal start <policy>                         open the review
  renewal contact <policy> [--on=]               record that you spoke to the client
  renewal market <policy> [--terms-due=]         out to market
  renewal terms <policy>                         terms are in
  renewal present <policy> [--premium=]          presented to the client
  renewal instruct <policy>                      the client said yes
  renewal lapse <policy> "why"                   it did not renew

Placing
  quote new <client> --insurer= --class= [--policy= --due= --sum-insured=]
  quote receive <ref> --premium= [--brokerage= --excess= --terms=]
  quote present <ref> | quote decline <ref> "why" | quote lose <ref> "why"
  place <quote-ref> --policy-no= [--inception= --expiry= --brokerage= --fee=]
  endorse <policy> "<what changed>" --effective= [--kind= --premium=]
  endorse confirm <number> [--ref=]

Claims
  claim new <policy> "<what happened>" [--loss= --reserve= --excess=]
  claim event <claim> <kind> ["note"]            kinds: ${CLAIM_EVENT_KINDS.slice(0, 5).join(', ')} ...
  claim update <claim> "<what you told the client>"
  claim settle <claim> --amount= | claim close <claim>

The record
  advice-record add <client> --scope= --recommendation= --reasons= [--policy= --alternatives= --risks= --limitations= --remuneration=]
  note <client> "<what happened>" [--kind=call --on=]
  task add "<what>" [--client= --policy= --claim= --due=] | task done <id>
  complaint new <client> "<about>" | complaint update <id> | complaint resolve <id> "<outcome>"
  commission invoice <policy> --ref= | commission receive <policy>
  add client|contact|insurer|broker|policy "<name>" [--flags]

Moving in and out
  import javln|insight|winbeat|csv --clients=<csv> [--policies= --contacts= --claims=] [--dry-run]
  export [--out=file.json]

Money in dollars: --premium=12450.50 means $12,450.50. Percentages are numbers: --brokerage=17.5.
Any command takes --json. Ids shorten to their first 8 characters. Names match case-insensitively.
No client money lives here. The broking trust account stays in the system that already holds it.
`;

const COMMANDS = {
  clients: cmdClients,
  client: cmdClient,
  policies: cmdPolicies,
  policy: cmdPolicy,
  'renewals-due': cmdRenewalsDue,
  renewals: cmdRenewalsDue,
  renewal: cmdRenewal,
  quotes: cmdQuotes,
  quote: cmdQuote,
  place: cmdPlace,
  endorse: cmdEndorse,
  endorsements: cmdEndorsements,
  claims: cmdClaims,
  'claims-open': cmdClaimsOpen,
  claim: cmdClaim,
  commissions: cmdCommissions,
  commission: cmdCommission,
  advice: cmdAdvice,
  'advice-record': cmdAdviceRecord,
  insurers: cmdInsurers,
  markets: cmdInsurers,
  brokers: cmdBrokers,
  tasks: cmdTasks,
  task: cmdTask,
  note: cmdNote,
  complaints: cmdComplaints,
  complaint: cmdComplaint,
  attention: cmdAttention,
  compliance: cmdCompliance,
  stats: cmdStats,
  add: cmdAdd,
  import: cmdImport,
  export: cmdExport,
};

async function main() {
  const { args, flags } = parseArgv(process.argv.slice(2));
  const [command, ...rest] = args;
  if (!command || command === 'help' || flags.help) {
    process.stdout.write(HELP);
    return 0;
  }
  const fn = COMMANDS[command];
  if (!fn) {
    process.stderr.write(`Unknown command "${command}".\n\n${HELP}`);
    return 1;
  }
  const db = await getDb();
  try {
    const result = await fn(db, rest, flags);
    if (flags.json) process.stdout.write(JSON.stringify(result.json, null, 2) + '\n');
    else process.stdout.write(result.text.replace(/^\n/, '') + '\n');
    return 0;
  } catch (e) {
    if (e instanceof CliError) {
      process.stderr.write(`${e.message}\n`);
      return e.code;
    }
    if (/relation "?\w+"? does not exist/.test(e.message)) {
      process.stderr.write('The database has no tables yet. Run: npm run migrate\n');
      return 1;
    }
    throw e;
  } finally {
    await db.close();
  }
}

process.exitCode = await main();
