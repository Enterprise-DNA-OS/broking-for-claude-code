#!/usr/bin/env node
// Loads supabase/seed.sql: Kauri Risk Brokers, a demo New Zealand general insurance
// brokerage with four brokers, ten markets, eighteen clients, a book of policies and
// a renewal cycle, claims and advice records in flight.
// Every row has a derived id and inserts with ON CONFLICT DO NOTHING, so re-running is harmless.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { getDb, REPO_ROOT } from './lib/db.mjs';

export async function seed(db) {
  const sql = readFileSync(path.join(REPO_ROOT, 'supabase', 'seed.sql'), 'utf8');
  await db.exec(sql);
  const [c] = await db.query(`
    select (select count(*) from clients)        as clients,
           (select count(*) from contacts)       as contacts,
           (select count(*) from insurers)       as insurers,
           (select count(*) from policies)       as policies,
           (select count(*) from covers)         as covers,
           (select count(*) from renewals)       as renewals,
           (select count(*) from quotes)         as quotes,
           (select count(*) from endorsements)   as endorsements,
           (select count(*) from claims)         as claims,
           (select count(*) from claim_events)   as claim_events,
           (select count(*) from tasks)          as tasks,
           (select count(*) from advice_records) as advice_records,
           (select count(*) from commissions)    as commissions,
           (select count(*) from complaints)     as complaints,
           (select count(*) from client_notes)   as client_notes
  `);
  return Object.fromEntries(Object.entries(c).map(([k, v]) => [k, Number(v)]));
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const db = await getDb();
  try {
    const n = await seed(db);
    console.log(
      `seed: ${n.clients} clients, ${n.contacts} contacts, ${n.insurers} markets, ${n.policies} policies ` +
        `(${n.covers} sections), ${n.renewals} renewals, ${n.quotes} quotes, ${n.endorsements} endorsements, ` +
        `${n.claims} claims (${n.claim_events} events), ${n.advice_records} advice records, ` +
        `${n.commissions} brokerage entries, ${n.complaints} complaints, ${n.tasks} tasks, ${n.client_notes} notes`,
    );
  } finally {
    await db.close();
  }
}
