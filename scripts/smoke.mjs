#!/usr/bin/env node
// End-to-end smoke test on a throwaway embedded database.
// Runs migrate, seed, then every CLI command that matters, and asserts on the JSON.
// Passes on Windows and Linux. No network, no Postgres install.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = mkdtempSync(path.join(tmpdir(), 'broking-smoke-'));
const env = { ...process.env, DATA_DIR: dataDir };
delete env.DATABASE_URL; // the smoke test always runs embedded
delete env.BROKING_BROKER;

let step = 0;
function run(label, args, { json = true, expectFail = false } = {}) {
  step++;
  const argv = [path.join(root, 'scripts', args[0]), ...args.slice(1), ...(json ? ['--json'] : [])];
  const res = spawnSync(process.execPath, argv, { cwd: root, env, encoding: 'utf8' });
  const ok = expectFail ? res.status !== 0 : res.status === 0;
  if (!ok) {
    console.error(`\nFAIL step ${step} (${label}): exit ${res.status}\n--- stdout\n${res.stdout}\n--- stderr\n${res.stderr}`);
    process.exit(1);
  }
  console.log(`  ok  ${String(step).padStart(2)}  ${label}`);
  if (!json || expectFail) return { stdout: res.stdout, stderr: res.stderr };
  try {
    return JSON.parse(res.stdout);
  } catch {
    console.error(`\nFAIL step ${step} (${label}): output is not JSON\n${res.stdout}\n${res.stderr}`);
    process.exit(1);
  }
}

function assert(cond, msg) {
  if (!cond) {
    console.error(`\nFAIL assertion: ${msg}`);
    process.exit(1);
  }
}

const n = (v) => Number(v ?? 0);
// Local date, the same way the CLI computes "today". Never UTC: New Zealand is a day ahead of it.
const todayIso = (() => {
  const d = new Date();
  const pad = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
})();

console.log(`smoke: data dir ${dataDir}`);
try {
  run('migrate', ['migrate.mjs'], { json: false });
  run('migrate again (idempotent)', ['migrate.mjs'], { json: false });
  run('seed', ['seed.mjs'], { json: false });
  run('seed again (idempotent)', ['seed.mjs'], { json: false });

  // ---- the book ------------------------------------------------------------

  const clients = run('clients', ['broking.mjs', 'clients']);
  assert(clients.length >= 18, `every active client is on the book (${clients.length})`);
  assert(clients.every((c) => c.status === 'active'), 'only active clients by default');
  assert(clients.some((c) => c.client_type === 'individual'), 'private clients as well as businesses');
  assert(n(clients[0].premium_cents) > n(clients[clients.length - 1].premium_cents), 'sorted by premium');
  assert(clients.some((c) => n(c.days_since_contact) > 180), 'the demo has clients nobody has spoken to');

  const byBroker = run('clients for one broker', ['broking.mjs', 'clients', '--broker=Hine']);
  assert(byBroker.length >= 4 && byBroker.every((c) => c.broker === 'Hine Rawiri'), 'one broker, their own clients');

  const card = run('client card', ['broking.mjs', 'client', 'Kauri Joinery']);
  assert(card.client.name === 'Kauri Joinery Ltd', 'resolved by partial name');
  assert(card.contacts.length >= 2, 'the client has contacts');
  assert(card.policies.length >= 3, 'the client has a programme, not one policy');
  assert(card.advice.length >= 2, 'the client has advice records');
  assert(card.notes.length >= 2, 'the client has contact history');
  assert(n(card.health.premium_cents) > 1000000, 'premium in force is real money');

  const ambiguous = run('an ambiguous client name lists the candidates and exits 1', ['broking.mjs', 'client', 'Ltd'], {
    json: false,
    expectFail: true,
  });
  assert(/matches \d+ clients/.test(ambiguous.stderr), 'it lists the candidates rather than guessing');

  const noSuch = run('an unknown client exits 1', ['broking.mjs', 'client', 'nobody at all'], { json: false, expectFail: true });
  assert(/No client matches/.test(noSuch.stderr), 'and says so plainly');

  // ---- policies ------------------------------------------------------------

  const policies = run('policies', ['broking.mjs', 'policies']);
  assert(policies.length >= 30, `the book has policies (${policies.length})`);
  assert(policies.every((p) => n(p.gross_premium_cents) >= n(p.base_premium_cents)), 'gross premium includes levies and GST');
  assert(policies.every((p) => n(p.brokerage_cents) <= n(p.base_premium_cents)), 'brokerage is a share of base premium');

  const byClass = run('policies by class', ['broking.mjs', 'policies', '--class=liability']);
  assert(byClass.length >= 4 && byClass.every((p) => /liability/.test(p.class)), 'class filter works');

  const expiring = run('policies expiring', ['broking.mjs', 'policies', '--expiring=30']);
  assert(expiring.length >= 5 && expiring.every((p) => n(p.days_to_expiry) <= 30), 'expiring filter works');

  const policy = run('policy card', ['broking.mjs', 'policy', 'POL-20008']);
  assert(policy.policy.client_name === 'Harbourview Apartments Body Corporate', 'resolved by policy number');
  assert(policy.covers.length >= 3, 'the policy has sections with their own limits');
  assert(policy.claims.length >= 1, 'the policy has a claim on it');
  assert(policy.renewal && policy.renewal.stage, 'the policy has a renewal in flight');
  assert(policy.commissions.length >= 1, 'brokerage is recorded against the policy');
  assert(n(policy.policy.levies_cents) > 0, 'the Fire and Emergency levy is on a property policy');

  // ---- the renewal cycle ---------------------------------------------------

  const cycle = run('renewals-due', ['broking.mjs', 'renewals-due']);
  assert(cycle.length >= 15, `the cycle has ninety days of renewals (${cycle.length})`);
  assert(cycle.every((r) => n(r.days_to_expiry) <= 90), 'nothing beyond ninety days');
  assert(cycle.some((r) => r.band === 'expired'), 'the demo has a policy that expired and is still on the book');
  assert(cycle.some((r) => r.band === '14 day'), 'and policies inside fourteen days');
  assert(cycle.some((r) => r.days_since_contact === null), 'and renewals nobody has contacted the client about');
  assert(cycle.every((r) => r.stage), 'every renewal has a stage');

  const band = run('renewals-due for one band', ['broking.mjs', 'renewals-due', '--band=14 day']);
  assert(band.length >= 3 && band.every((r) => r.band === '14 day'), 'band filter works');

  const thirty = run('renewals-due --days=30', ['broking.mjs', 'renewals-due', '--days=30']);
  assert(thirty.length < cycle.length && thirty.every((r) => n(r.days_to_expiry) <= 30), 'the days filter narrows it');

  const contacted = run('renewal contact', ['broking.mjs', 'renewal', 'contact', 'POL-20012', '--broker=Priya Nair']);
  assert(contacted.client_contacted_on, 'the contact date is recorded');
  const afterContact = run('the cycle picks the contact up', ['broking.mjs', 'renewals-due', '--band=14 day']);
  const coastal = afterContact.find((r) => r.policy_no === 'POL-20012');
  assert(coastal && coastal.days_since_contact === 0, 'the fourteen day gap is closed');

  run('renewal market', ['broking.mjs', 'renewal', 'market', 'POL-20012', '--terms-due=' + todayIso, '--broker=Priya Nair']);
  const marketed = run('the stage moved', ['broking.mjs', 'renewals-due', '--stage=in market']);
  assert(marketed.some((r) => r.policy_no === 'POL-20012'), 'the renewal is out to market');

  const badStage = run('an unknown renewal step exits 1', ['broking.mjs', 'renewal', 'sideways', 'POL-20012'], {
    json: false,
    expectFail: true,
  });
  assert(/is not a renewal step/.test(badStage.stderr), 'and lists the steps that exist');

  // ---- the market ----------------------------------------------------------

  const quotes = run('quotes', ['broking.mjs', 'quotes']);
  assert(quotes.length >= 6, `quotes are out to market (${quotes.length})`);
  assert(quotes.some((q) => n(q.days_late) > 0), 'the demo has terms the market owes us');

  const newQuote = run('quote new', [
    'broking.mjs', 'quote', 'new', 'Coastal Storage', '--insurer=Ando', '--class=material damage',
    '--policy=POL-20012', '--broker=Priya Nair', '--sum-insured=12400000', '--ref=Q-SMOKE1',
  ]);
  assert(newQuote.quote_ref === 'Q-SMOKE1' && newQuote.renewal_id, 'the quote attaches to the renewal');

  const received = run('quote receive', ['broking.mjs', 'quote', 'receive', 'Q-SMOKE1', '--premium=11900', '--brokerage=20']);
  assert(n(received.premium_cents) === 1190000 && received.status === 'received', 'the premium is stored in cents');

  run('quote present', ['broking.mjs', 'quote', 'present', 'Q-SMOKE1']);
  const presented = run('the renewal moved to presented', ['broking.mjs', 'renewals-due', '--stage=presented']);
  assert(presented.some((r) => r.policy_no === 'POL-20012'), 'presenting the quote moves the renewal');

  const placed = run('place', [
    'broking.mjs', 'place', 'Q-SMOKE1', '--policy-no=AND-MD-SMOKE', '--broker=Priya Nair', '--fee=200',
  ]);
  assert(placed.policy_no === 'AND-MD-SMOKE' && placed.status === 'in force', 'the policy is on risk');
  assert(n(placed.base_premium_cents) === 1190000, 'the quoted premium became the policy premium');
  assert(n(placed.brokerage_cents) === 238000, 'brokerage is twenty percent of base premium');
  assert(n(placed.levies_cents) > 0 && n(placed.gross_premium_cents) > n(placed.base_premium_cents), 'levies and GST are added');
  assert(placed.prior_policy_id, 'it points back at the policy it replaced');

  const prior = run('the expiring policy is marked renewed', ['broking.mjs', 'policy', 'POL-20012']);
  assert(prior.policy.status === 'renewed', 'the old period is closed off');
  assert(prior.renewal.stage === 'bound', 'the renewal is bound');

  const placeWithoutNumber = run('place without a policy number exits 1', ['broking.mjs', 'place', 'Q-26013'], {
    json: false,
    expectFail: true,
  });
  assert(/policy number/.test(placeWithoutNumber.stderr), 'it will not invent an insurer policy number');

  // ---- endorsements --------------------------------------------------------

  const endorsements = run('endorsements', ['broking.mjs', 'endorsements']);
  assert(endorsements.length >= 2, 'the demo has changes the insurer has not confirmed');
  assert(endorsements.every((e) => ['requested', 'with insurer'].includes(e.status)), 'only unconfirmed by default');

  const endorsed = run('endorse', [
    'broking.mjs', 'endorse', 'POL-20030', 'Add a new tenant fitout to building 2',
    '--effective=' + todayIso, '--premium=1200', '--kind=add cover', '--broker=Grant Milne',
  ]);
  assert(endorsed.status === 'requested', 'a new endorsement is not on risk yet');
  assert(n(endorsed.brokerage_adjustment_cents) === 18000, 'brokerage on the adjustment follows the policy rate');

  const confirmed = run('endorse confirm', ['broking.mjs', 'endorse', 'confirm', endorsed.endorsement_no, '--ref=CHB-EN-SMOKE']);
  assert(confirmed.status === 'confirmed' && confirmed.insurer_ref === 'CHB-EN-SMOKE', 'the insurer confirmed it');

  // ---- claims --------------------------------------------------------------

  const open = run('claims-open', ['broking.mjs', 'claims-open']);
  assert(open.length >= 6, `claims are open (${open.length})`);
  assert(open.some((c) => n(c.days_since_client_update) > 14), 'the demo has claims the client has heard nothing about');
  assert(open.every((c) => c.claim_no && c.client && c.status), 'every open claim has a client and a status');

  const claim = run('claim card', ['broking.mjs', 'claim', 'CLM-26004']);
  assert(claim.events.length >= 4, 'the claim has a history');
  assert(claim.claim.reserve_cents > 0, 'and a reserve');

  const newClaim = run('claim new', [
    'broking.mjs', 'claim', 'new', 'POL-20023', 'Fire in the paint store, workshop contents damaged',
    '--loss=' + todayIso, '--reserve=45000', '--broker=Tom Baxter',
  ]);
  assert(newClaim.status === 'notified' && n(newClaim.reserve_cents) === 4500000, 'the claim is notified with its reserve');
  assert(n(newClaim.excess_cents) > 0, 'the excess comes off the policy');

  run('claim event', ['broking.mjs', 'claim', 'event', newClaim.claim_no, 'insurer acknowledged', 'Claim number issued.']);
  const acknowledged = run('the event moved the status', ['broking.mjs', 'claim', newClaim.claim_no]);
  assert(acknowledged.claim.status === 'acknowledged', 'an acknowledgement moves the claim on');
  assert(acknowledged.events.length === 2, 'and is on the history');

  const updated = run('claim update', [
    'broking.mjs', 'claim', 'update', newClaim.claim_no, 'Told Tania the assessor is booked for Friday',
  ]);
  assert(String(updated.last_client_update_on).slice(0, 10) === todayIso, 'telling the client is recorded');

  const settled = run('claim settle', ['broking.mjs', 'claim', 'settle', newClaim.claim_no, '--amount=38400']);
  assert(n(settled.settled_cents) === 3840000 && settled.status === 'settled', 'settled at the amount agreed');
  assert(n(settled.reserve_cents) === 0, 'and the reserve is released');

  const closed = run('claim close', ['broking.mjs', 'claim', 'close', newClaim.claim_no]);
  assert(closed.closed_on, 'the claim is closed');
  const openAfter = run('the closed claim leaves the board', ['broking.mjs', 'claims-open']);
  assert(!openAfter.some((c) => c.claim_no === newClaim.claim_no), 'and off the open board');

  // ---- the advice record ---------------------------------------------------

  const advice = run('advice', ['broking.mjs', 'advice']);
  assert(advice.length >= 15, `advice records are on file (${advice.length})`);
  assert(advice.some((a) => !a.nature_and_scope), 'the demo has a record with no scope');
  assert(advice.some((a) => !a.remuneration_disclosed), 'and one with no remuneration disclosure');

  const missingFields = run('an advice record without the required fields exits 1', [
    'broking.mjs', 'advice-record', 'add', 'Coastal Storage', '--scope=Material damage only',
  ], { json: false, expectFail: true });
  assert(/--recommendation/.test(missingFields.stderr), 'it names the fields it needs');

  const written = run('advice-record add', [
    'broking.mjs', 'advice-record', 'add', 'Coastal Storage', '--policy=AND-MD-SMOKE',
    '--scope=Material damage only. No advice on liability or on business interruption.',
    '--recommendation=Renew with Ando and lift goods of others to 500k',
    '--reasons=Unit numbers have doubled and the limit has not moved in three years',
    '--alternatives=Vero quoted 8 percent dearer with the same limit',
    '--risks=Goods of others is a sub limit, not the sum insured',
    '--remuneration=20 percent of base premium plus a 200 dollar broker fee',
    '--broker=Priya Nair',
  ]);
  assert(written.remuneration_disclosed && written.disclosure_given_on, 'disclosure is recorded with the advice');
  assert(written.nature_and_scope && written.reasons, 'scope and reasons are recorded');

  // ---- brokerage -----------------------------------------------------------

  const commissions = run('commissions', ['broking.mjs', 'commissions']);
  assert(commissions.months.length >= 6, 'brokerage is spread across months');
  assert(n(commissions.stale.entries) >= 1, 'the demo has brokerage nobody has reconciled');

  const month = run('commissions for one month', ['broking.mjs', 'commissions', '--month=' + todayIso.slice(0, 7)]);
  assert(Array.isArray(month), 'a month returns its entries');

  const invoiced = run('commission invoice', ['broking.mjs', 'commission', 'invoice', 'AND-MD-SMOKE', '--ref=STM-SMOKE']);
  assert(invoiced.length >= 1 && invoiced.every((c) => c.status === 'invoiced'), 'brokerage is invoiced');
  const receivedComm = run('commission receive', ['broking.mjs', 'commission', 'receive', 'AND-MD-SMOKE']);
  assert(receivedComm.every((c) => c.status === 'received'), 'and reconciled');

  // ---- housekeeping --------------------------------------------------------

  const tasks = run('tasks', ['broking.mjs', 'tasks']);
  assert(tasks.length >= 8 && tasks.every((t) => t.status === 'open'), 'open tasks by default');
  const newTask = run('task add', [
    'broking.mjs', 'task', 'add', 'Chase Vero on the storm claim acknowledgement',
    '--client=Rangitoto Civil', '--due=' + todayIso, '--broker=Tom Baxter',
  ]);
  const doneTask = run('task done', ['broking.mjs', 'task', 'done', String(newTask.id).slice(0, 8)]);
  assert(doneTask.status === 'done' && doneTask.done_on, 'a task can be closed by its short id');

  const note = run('note', ['broking.mjs', 'note', 'Aotea Packaging', 'Rang Simon about the indemnity period', '--kind=call']);
  assert(String(note.happened_on).slice(0, 10) === todayIso, 'the contact is dated today');
  const quietAfter = run('the note clears the quiet flag', ['broking.mjs', 'clients']);
  const aotea = quietAfter.find((c) => c.client === 'Aotea Packaging Ltd');
  assert(n(aotea.days_since_contact) === 0, 'the client is no longer quiet');

  const complaints = run('complaints', ['broking.mjs', 'complaints']);
  assert(complaints.length >= 2, 'the demo has open complaints');
  assert(complaints.some((c) => n(c.days_open) > 30), 'one of them is past thirty days');
  const newComplaint = run('complaint new', [
    'broking.mjs', 'complaint', 'new', 'Meridian Dental', 'Says the renewal terms arrived too late to consider',
  ]);
  assert(newComplaint.acknowledged_on, 'a complaint is acknowledged the day it is logged');
  const resolved = run('complaint resolve', [
    'broking.mjs', 'complaint', 'resolve', String(newComplaint.id).slice(0, 8),
    'Apologised, moved the renewal review to ninety days out, confirmed in writing',
  ]);
  assert(resolved.status === 'resolved' && resolved.outcome, 'and closed with an outcome');

  const insurers = run('insurers', ['broking.mjs', 'insurers']);
  assert(insurers.length >= 8, 'the markets are on file');
  assert(insurers.some((i) => i.kind === 'underwriting agency'), 'agencies as well as insurers');
  assert(insurers.some((i) => i.kind === 'premium funder'), 'and premium funders, referral only');

  const brokers = run('brokers', ['broking.mjs', 'brokers']);
  assert(brokers.length >= 4 && brokers.every((b) => b.role), 'the team is on file with roles');

  // ---- attention and compliance --------------------------------------------

  const attention = run('attention', ['broking.mjs', 'attention']);
  const reasons = new Set(attention.map((a) => a.reason));
  assert(attention.length >= 20, `the attention list has substance (${attention.length})`);
  for (const reason of [
    'renewal_expired', 'renewal_no_contact', 'claim_no_update', 'claim_not_acknowledged',
    'endorsement_unconfirmed', 'complaint_overdue', 'advice_missing', 'remuneration_not_disclosed',
    'quote_chase', 'task_overdue', 'commission_unreconciled',
  ]) {
    assert(reasons.has(reason), `the attention list surfaces ${reason}`);
  }

  const compliance = run('compliance', ['broking.mjs', 'compliance']);
  assert(compliance.length >= 9, `every rule ran (${compliance.length})`);
  assert(compliance.every((r) => r.source && /clause|s |ss |regulation|standard/i.test(r.source)), 'every rule cites a source');
  const byKey = Object.fromEntries(compliance.map((r) => [r.key, r]));
  assert(byKey['renewal-contact'].breaches >= 1, 'it finds renewals inside fourteen days with no contact');
  assert(byKey['terms-of-engagement'].breaches >= 2, 'it finds clients with no terms of engagement');
  assert(byKey['remuneration-disclosure'].breaches >= 2, 'it finds advice with no remuneration disclosure');
  assert(byKey['advice-record'].breaches >= 2, 'it finds placements with no advice record');
  assert(byKey['nature-and-scope'].breaches >= 1, 'it finds advice with no scope');
  assert(byKey['claim-progress'].breaches >= 2, 'it finds claims the client has not been told about');
  assert(byKey['complaints'].breaches >= 1, 'it finds a complaint past its timeframe');
  assert(byKey['claim-progress'].rows[0].record.startsWith('CLM-'), 'and names the record');

  const oneRule = run('compliance for one rule', ['broking.mjs', 'compliance', 'renewal-contact']);
  assert(oneRule.length === 1 && oneRule[0].key === 'renewal-contact', 'a single rule can be run on its own');

  const stats = run('stats', ['broking.mjs', 'stats']);
  assert(n(stats.policies) >= 30 && n(stats.premium_cents) > 10000000, 'the book totals up');
  assert(n(stats.open_claims) >= 5 && n(stats.attention) >= 20, 'the cycle and the claims board total up');

  // ---- import --------------------------------------------------------------

  const clientsCsv = path.join(dataDir, 'clients.csv');
  writeFileSync(
    clientsCsv,
    'Client Name,Client Code,Client Type,Industry,Email,Phone,City,Broker\n' +
      'Waikato Cold Store Ltd,WCS-001,Business,Cold storage,office@example.co.nz,07 555 0999,Hamilton,Hine Rawiri\n' +
      '"Ngata, Robert",NGR-002,Individual,Private client,rob@example.co.nz,021 555 0998,Hamilton,Hine Rawiri\n',
  );
  const policiesCsv = path.join(dataDir, 'policies.csv');
  writeFileSync(
    policiesCsv,
    'Policy Number,Client Name,Class of Business,Insurer,Inception Date,Expiry Date,Gross Premium,Brokerage,Sum Insured,Excess,Status,Insurer Reference\n' +
      'WCS-MD-1001,Waikato Cold Store Ltd,material damage,NZI,01/07/2026,01/07/2027,"$24,150.00","$3,675.00","$4,200,000","$5,000",Current,NZI-MD-99001\n' +
      'NGR-HO-1002,"Ngata, Robert",home,Vero,15/03/2026,15/03/2027,"$1,840.00","$276.00","$980,000","$500",Current,VER-HO-99002\n',
  );
  const contactsCsv = path.join(dataDir, 'contacts.csv');
  writeFileSync(
    contactsCsv,
    'Client Name,Contact Name,Position,Email,Phone\n' +
      'Waikato Cold Store Ltd,Lisa Brownlee,Operations manager,lisa@example.co.nz,027 555 0997\n',
  );
  const claimsCsv = path.join(dataDir, 'claims.csv');
  writeFileSync(
    claimsCsv,
    'Claim Number,Policy Number,Date of Loss,Notified Date,Description,Status,Reserve,Paid,Insurer Claim Number\n' +
      'WCS-CLM-01,WCS-MD-1001,12/08/2026,13/08/2026,Refrigeration failure and stock spoilage,assessing,"$62,000","$0",NZI-CLM-99001\n',
  );

  const dryRun = run('import --dry-run writes nothing', [
    'broking.mjs', 'import', 'javln', `--clients=${clientsCsv}`, `--policies=${policiesCsv}`,
    `--contacts=${contactsCsv}`, `--claims=${claimsCsv}`, '--dry-run',
  ]);
  assert(n(dryRun.clients) === 2 && n(dryRun.policies) === 2, 'the dry run counts what it would create');
  const notThere = run('and really wrote nothing', ['broking.mjs', 'clients']);
  assert(!notThere.some((c) => c.client === 'Waikato Cold Store Ltd'), 'the dry run left the database alone');

  const imported = run('import', [
    'broking.mjs', 'import', 'javln', `--clients=${clientsCsv}`, `--policies=${policiesCsv}`,
    `--contacts=${contactsCsv}`, `--claims=${claimsCsv}`,
  ]);
  assert(n(imported.clients) === 2 && n(imported.policies) === 2 && n(imported.claims) === 1, 'everything came across');
  const importedClient = run('the imported client reads back', ['broking.mjs', 'client', 'Waikato Cold Store']);
  assert(importedClient.policies.length === 1, 'with its policy');
  assert(importedClient.contacts.length === 1, 'and its contact');
  assert(n(importedClient.policies[0].gross_premium_cents) === 2415000, 'money with a dollar sign and commas parses');
  assert(String(importedClient.policies[0].expiry_on).slice(0, 10) === '2027-07-01', 'DD/MM/YYYY dates parse');
  const importedIndividual = run('a quoted comma in a name survives', ['broking.mjs', 'client', 'Ngata, Robert']);
  assert(importedIndividual.client.client_type === 'individual', 'and the client type maps');

  const insightRun = run('an Insight shaped export goes through the same command', [
    'broking.mjs', 'import', 'insight', `--clients=${clientsCsv}`,
  ]);
  assert(n(insightRun.clients) === 0 && n(insightRun.clients_updated) === 2, 're-importing updates rather than duplicating');

  const missingFile = run('a missing import file fails loudly', [
    'broking.mjs', 'import', 'csv', `--clients=${path.join(dataDir, 'not-there.csv')}`,
  ], { json: false, expectFail: true });
  assert(/No clients file/.test(missingFile.stderr), 'it exits non zero rather than importing nothing quietly');

  // ---- export --------------------------------------------------------------

  const outFile = path.join(dataDir, 'dump.json');
  const dump = run('export', ['broking.mjs', 'export', `--out=${outFile}`]);
  assert(existsSync(outFile), 'the export file is on disk');
  const parsed = JSON.parse(readFileSync(outFile, 'utf8'));
  assert(parsed.policies.length === n(dump.counts.policies), 'the counts match the file');
  assert(parsed.advice_records.length >= 16, 'the export carries the advice records');
  assert(parsed.claim_events.length >= 25, 'and every claim event');
  assert(!Object.keys(parsed).some((t) => /trust|receipt|payment/.test(t)), 'there is no client money in the export');

  // ---- the branded HTML ------------------------------------------------------

  const views = run('npm run view', ['view.mjs'], { json: false });
  assert(/views[\\/]week\.html/.test(views.stdout) && /views[\\/]renewals\.html/.test(views.stdout), 'both views rendered');
  const weekHtml = readFileSync(path.join(root, 'views', 'week.html'), 'utf8');
  assert(weekHtml.includes('Needs a decision') && weekHtml.includes('Renewals inside thirty days'), 'the week view has its sections');
  assert(weekHtml.includes('Open claims') && weekHtml.includes('Out to market'), 'and the claims and market blocks');
  const renewalsHtml = readFileSync(path.join(root, 'views', 'renewals.html'), 'utf8');
  assert(renewalsHtml.includes('The cycle at a glance') && renewalsHtml.includes('Nobody has spoken to these clients'), 'the renewals view has its sections');

  const docs = run('npm run docs', ['docs.mjs'], { json: false });
  assert(/renewal-summary-letter/.test(docs.stdout), 'the renewal summary rendered');
  assert(/client-portfolio-schedule/.test(docs.stdout), 'the portfolio schedule rendered');
  assert(/claim-status-update/.test(docs.stdout), 'the claim status update rendered');
  const schedule = readFileSync(
    path.join(root, 'docs-out', 'client-portfolio-schedule', 'kauri-joinery-ltd.html'),
    'utf8',
  );
  assert(schedule.includes('Every policy in force') && schedule.includes('Sections and limits'), 'the schedule has its sections');
  assert(schedule.includes('What you pay and what we earn'), 'and discloses the remuneration');

  // ---- the human readable side -------------------------------------------------

  run('clients (text)', ['broking.mjs', 'clients'], { json: false });
  run('client (text)', ['broking.mjs', 'client', 'Harbourview'], { json: false });
  run('policies (text)', ['broking.mjs', 'policies'], { json: false });
  run('policy (text)', ['broking.mjs', 'policy', 'POL-20010'], { json: false });
  run('renewals-due (text)', ['broking.mjs', 'renewals-due'], { json: false });
  run('quotes (text)', ['broking.mjs', 'quotes', '--all'], { json: false });
  run('claims (text)', ['broking.mjs', 'claims', '--all'], { json: false });
  run('claims-open (text)', ['broking.mjs', 'claims-open'], { json: false });
  run('claim (text)', ['broking.mjs', 'claim', 'CLM-26003'], { json: false });
  run('endorsements (text)', ['broking.mjs', 'endorsements', '--all'], { json: false });
  run('commissions (text)', ['broking.mjs', 'commissions'], { json: false });
  run('advice (text)', ['broking.mjs', 'advice'], { json: false });
  run('insurers (text)', ['broking.mjs', 'insurers'], { json: false });
  run('brokers (text)', ['broking.mjs', 'brokers'], { json: false });
  run('tasks (text)', ['broking.mjs', 'tasks', '--all'], { json: false });
  run('complaints (text)', ['broking.mjs', 'complaints', '--all'], { json: false });
  run('attention (text)', ['broking.mjs', 'attention'], { json: false });
  run('compliance (text)', ['broking.mjs', 'compliance'], { json: false });
  run('stats (text)', ['broking.mjs', 'stats'], { json: false });
  run('help', ['broking.mjs', 'help'], { json: false });
  run('an unknown command exits 1', ['broking.mjs', 'nonsense'], { json: false, expectFail: true });

  console.log(`\n${step} checks, PASS`);
} finally {
  if (existsSync(dataDir)) {
    try {
      rmSync(dataDir, { recursive: true, force: true });
    } catch {
      // Windows can hold the handle briefly; a leftover temp dir is harmless.
    }
  }
}
