-- Demo data for broking-for-claude-code.
-- Kauri Risk Brokers, a fictional New Zealand general insurance brokerage:
-- 4 brokers, 10 markets, 18 clients, 35 policies, a renewal cycle in flight,
-- quotes out to market, endorsements, claims, advice records and brokerage.
--
-- Deliberately messy, so the attention list has something to say:
--   a policy that expired nine days ago and is still marked in force
--   two policies inside fourteen days that nobody has contacted the client about
--   a renewal sitting in market past the date terms were due
--   two claims where the client has not been told anything for weeks
--   a claim notified to the insurer with no acknowledgement on file
--   two endorsements the insurer has never confirmed
--   two quotes the market owes and never sent
--   three policies placed with no advice record behind them
--   advice given to a private client with no remuneration disclosure
--   a complaint open past thirty days
--   brokerage accrued months ago and never reconciled
--   clients on cover that nobody has spoken to in six months
--
-- Dates are relative to current_date. Ids are derived from names with seed_uuid,
-- and every insert is ON CONFLICT DO NOTHING, so running it twice changes nothing.
--
-- No client money anywhere. Premium is what the client owes the insurer, brokerage
-- is what this business earns. The trust account stays where it is.

create or replace function seed_uuid(seed text) returns uuid language sql immutable as $$
  select (substr(m, 1, 8) || '-' || substr(m, 9, 4) || '-4' || substr(m, 13, 3)
          || '-8' || substr(m, 16, 3) || '-' || substr(m, 19, 12))::uuid
  from (select md5(seed) as m) s
$$;

-- Brokers --------------------------------------------------------------------

insert into brokers (id, full_name, code, email, phone, role, adviser_ref, active, started_on)
select seed_uuid('broker:' || v.full_name), v.full_name, v.code, v.email, v.phone, v.role, v.adviser_ref, true, current_date - v.days
from (values
  ('Hine Rawiri',  'HRA', 'hine@kauririsk.co.nz',  '021 555 0410', 'broker',            'FSP1041237', 2400),
  ('Grant Milne',  'GMI', 'grant@kauririsk.co.nz', '021 555 0411', 'principal',         'FSP1002884', 5100),
  ('Priya Nair',   'PNA', 'priya@kauririsk.co.nz', '021 555 0412', 'account executive', 'FSP1077419', 900),
  ('Tom Baxter',   'TBA', 'tom@kauririsk.co.nz',   '021 555 0413', 'claims broker',     'FSP1088250', 1500)
) as v(full_name, code, email, phone, role, adviser_ref, days)
on conflict do nothing;

-- Markets --------------------------------------------------------------------

insert into insurers (id, name, code, kind, underwriter_name, underwriter_email, claims_email, phone, strength_rating, agency_agreement_ref, default_brokerage_pct, active, notes)
select seed_uuid('insurer:' || v.name), v.name, v.code, v.kind, v.uw, v.uw_email, v.claims_email, v.phone, v.rating, v.agreement, v.pct, true, v.notes
from (values
  ('NZI',                      'NZI',  'insurer',              'Sione Faleolo',   'sione.faleolo@example.com',  'claims@example.com',        '09 555 0100', 'A+', 'AGY-NZI-2019',   17.5, 'Material damage and business interruption. Turnaround two to three days.'),
  ('Vero',                     'VER',  'insurer',              'Anna Kirkpatrick','anna.k@example.com',         'claims@example.com',        '09 555 0110', 'A+', 'AGY-VER-2017',   17.5, 'Broad appetite. Slow on contract works.'),
  ('QBE',                      'QBE',  'insurer',              'Daniel Osei',     'daniel.osei@example.com',    'nzclaims@example.com',      '09 555 0120', 'A+', 'AGY-QBE-2020',   15.0, 'Liability and motor fleet.'),
  ('Ando',                     'AND',  'insurer',              'Mele Tupou',      'mele.tupou@example.com',     'claims@example.com',        '09 555 0130', 'A-', 'AGY-AND-2021',   20.0, 'Fast on small commercial. Good with trades.'),
  ('Delta Insurance',          'DEL',  'underwriting agency',  'Richard Byrne',   'richard.byrne@example.com',  'claims@example.com',        '09 555 0140', 'A',  'AGY-DEL-2018',   20.0, 'Professional indemnity, cyber, statutory liability.'),
  ('Chubb',                    'CHB',  'insurer',              'Lauren Whitcombe','lauren.w@example.com',       'nz.claims@example.com',     '09 555 0150', 'AA', 'AGY-CHB-2016',   15.0, 'Larger commercial and directors and officers.'),
  ('Berkley Insurance',        'BER',  'insurer',              'Peter Lang',      'peter.lang@example.com',     'claims@example.com',        '09 555 0160', 'A+', 'AGY-BER-2022',   15.0, 'Marine cargo and hull.'),
  ('Rosser Underwriting',      'ROS',  'underwriting agency',  'Kate Rosser',     'kate@example.com',           'claims@example.com',        '09 555 0170', 'A-', 'AGY-ROS-2023',   22.5, 'Rural, lifestyle blocks and hard to place risks.'),
  ('IQumulate Premium Funding','IQU',  'premium funder',       'Funding desk',    'funding@example.com',        '',                          '09 555 0180', '',   'FUND-IQU-2021',   0.0, 'Referral only. This system records the referral, never the money.'),
  ('Hunter Premium Funding',   'HUN',  'premium funder',       'Funding desk',    'hunter@example.com',         '',                          '09 555 0190', '',   'FUND-HUN-2020',   0.0, 'Referral only.')
) as v(name, code, kind, uw, uw_email, claims_email, phone, rating, agreement, pct, notes)
on conflict do nothing;

-- Clients --------------------------------------------------------------------

insert into clients (id, name, client_type, trading_name, company_no, industry, email, phone, address, suburb, city, region, country, status, broker_id, client_since, headcount, engagement_signed_on, retail_client, notes)
select seed_uuid('client:' || v.name), v.name, v.client_type, v.trading_name, v.company_no, v.industry, v.email, v.phone, v.address, v.suburb, v.city, v.region, 'NZ', v.status,
       seed_uuid('broker:' || v.broker), current_date - v.since_days, v.headcount,
       case when v.engaged_days is null then null else current_date - v.engaged_days end, true, v.notes
from (values
  ('Kauri Joinery Ltd',                     'business',   'Kauri Joinery',    '9429041882301', 'Joinery manufacturing',   'accounts@example.co.nz', '07 555 0201', '18 Kahikatea Drive',  'Frankton',      'Hamilton',     'Waikato',         'active', 'Hine Rawiri', 2900, 34,  1100, 'Two sites. Spray booth is the underwriting question every year.'),
  ('Southern Cross Freight Ltd',            'business',   'SX Freight',       '9429038117420', 'Road transport',          'admin@example.co.nz',    '03 555 0202', '5 Kennaway Road',     'Woolston',      'Christchurch', 'Canterbury',      'active', 'Hine Rawiri', 3400, 62,  1460, 'Fleet of 22 units. Driver turnover drives the motor result.'),
  ('Tui Orchards Ltd',                      'business',   'Tui Orchards',     '9429030992114', 'Horticulture',            'office@example.co.nz',   '07 555 0203', '440 No 1 Road',       'Te Puke',       'Te Puke',      'Bay of Plenty',   'active', 'Priya Nair',  1900, 28,  900,  'Kiwifruit. Hail and windbreak losses are the pattern.'),
  ('Harbourview Apartments Body Corporate', 'business',   'Harbourview BC',   'BC-118420',     'Body corporate',          'bc@example.co.nz',       '09 555 0204', '12 Customs Street',   'City Centre',   'Auckland',     'Auckland',        'active', 'Grant Milne', 4100, 4,   1400, 'Forty two units. Committee decides at the AGM, so the renewal has to be early.'),
  ('Pemberton Legal Ltd',                   'business',   'Pemberton Legal',  '9429044820117', 'Law firm',                'admin@example.co.nz',    '04 555 0205', '99 The Terrace',      'Wellington',    'Wellington',   'Wellington',      'active', 'Grant Milne', 2600, 19,  980,  'Eleven partners. Professional indemnity is the whole conversation.'),
  ('Rangitoto Civil Ltd',                   'business',   'Rangitoto Civil',  '9429037718294', 'Civil construction',      'accounts@example.co.nz', '09 555 0206', '7 Tarndale Grove',    'Albany',        'Auckland',     'Auckland',        'active', 'Hine Rawiri', 1500, 47,  1200, 'Contract works on a project by project basis. Declarations are always late.'),
  ('Blue Duck Cafe Group Ltd',              'business',   'Blue Duck',        '9429045118820', 'Hospitality',             'hello@example.co.nz',    '09 555 0207', '250 Ponsonby Road',   'Ponsonby',      'Auckland',     'Auckland',        'active', 'Priya Nair',  700,  38,  null, 'Three sites, a fourth opening. No signed terms of engagement on file.'),
  ('Whangarei Marine Services Ltd',         'business',   'Whangarei Marine', '9429039920184', 'Marine services',         'office@example.co.nz',   '09 555 0208', '3 Port Road',         'Whangarei',     'Whangarei',    'Northland',       'active', 'Priya Nair',  2200, 16,  1300, 'Slipway and refit. Marine liability sits with a specialist market.'),
  ('Otago Dairy Partnership',               'business',   'Otago Dairy',      '9429031180224', 'Dairy farming',           'farm@example.co.nz',     '03 555 0209', '1284 Clutha Valley', 'Balclutha',     'Balclutha',    'Otago',           'active', 'Hine Rawiri', 3900, 9,   1550, 'Two farms, 940 cows. Effluent liability added after the last audit.'),
  ('Meridian Dental Ltd',                   'business',   'Meridian Dental',  '9429042288117', 'Dental practice',         'reception@example.co.nz','07 555 0210', '61 Devonport Road',   'Tauranga',      'Tauranga',     'Bay of Plenty',   'active', 'Priya Nair',  1200, 14,  760,  'Two surgeries. Equipment breakdown matters more than the building.'),
  ('Kirkwood Engineering Ltd',              'business',   'Kirkwood',         '9429035590112', 'Engineering',             'admin@example.co.nz',    '06 555 0211', '22 Pandora Road',     'Ahuriri',       'Napier',       'Hawke''s Bay',    'active', 'Hine Rawiri', 3100, 41,  1180, 'Structural steel. Products liability is the exposure nobody talks about.'),
  ('Aotea Packaging Ltd',                   'business',   'Aotea Packaging',  '9429046610330', 'Packaging manufacture',   'accounts@example.co.nz', '09 555 0212', '15 Springs Road',     'East Tamaki',   'Auckland',     'Auckland',        'active', 'Grant Milne', 1800, 55,  1010, 'Machinery breakdown claim history. Business interruption indemnity period is under review.'),
  ('Coastal Storage Ltd',                   'business',   'Coastal Storage',  '9429043381007', 'Self storage',            'office@example.co.nz',   '07 555 0213', '9 Newton Street',     'Mount Maunganui','Tauranga',    'Bay of Plenty',   'active', 'Priya Nair',  1000, 6,   870,  'Two hundred units. Goods of others is the cover that gets missed.'),
  ('Fern Ridge Vineyards Ltd',              'business',   'Fern Ridge',       '9429040012845', 'Viticulture',             'cellar@example.co.nz',   '03 555 0214', '88 Rapaura Road',     'Blenheim',      'Blenheim',     'Marlborough',     'active', 'Hine Rawiri', 2700, 22,  1330, 'Frost and hail. Stock in tank is the number that moves.'),
  ('Janet Whitmore',                        'individual', null,               null,            'Private client',          'janet.w@example.co.nz',  '021 555 0215','44 Rangitoto Avenue', 'Remuera',       'Auckland',     'Auckland',        'active', 'Priya Nair',  2000, 1,   1700, 'Home, contents and two vehicles. Referred by Pemberton Legal.'),
  ('Rob and Alice Ngatai',                  'individual', null,               null,            'Private client',          'ngatai@example.co.nz',   '021 555 0216','7 Te Rapa Road',      'Te Rapa',       'Hamilton',     'Waikato',         'active', 'Hine Rawiri', 480,  2,   null, 'Lifestyle block. No signed terms of engagement on file.'),
  ('Te Awa Health Trust',                   'business',   'Te Awa Health',    'CC-58810',      'Not for profit health',   'admin@example.co.nz',    '07 555 0217', '30 Amohia Street',    'Rotorua',       'Rotorua',      'Bay of Plenty',   'active', 'Grant Milne', 2300, 31,  1240, 'Charitable trust. Statutory liability and trustee cover matter to the board.'),
  ('Delacourt Property Ltd',                'business',   'Delacourt',        '9429034477201', 'Commercial property',     'property@example.co.nz', '04 555 0218', '110 Featherston St',  'Wellington',    'Wellington',   'Wellington',      'active', 'Grant Milne', 3300, 8,   1620, 'Four commercial buildings. Seismic rating drives the material damage rate.')
) as v(name, client_type, trading_name, company_no, industry, email, phone, address, suburb, city, region, status, broker, since_days, headcount, engaged_days, notes)
on conflict do nothing;

-- Contacts -------------------------------------------------------------------

insert into contacts (id, client_id, full_name, role, email, phone, is_primary, notes)
select seed_uuid('contact:' || v.client || ':' || v.full_name), seed_uuid('client:' || v.client), v.full_name, v.role, v.email, v.phone, v.is_primary, v.notes
from (values
  ('Kauri Joinery Ltd',                     'Dave Ellery',      'Operations manager',    'dave@example.co.nz',    '027 555 0301', true,  'Signs off the schedule. Prefers a phone call.'),
  ('Kauri Joinery Ltd',                     'Sarah Ellery',     'Director',              'sarah@example.co.nz',   '027 555 0302', false, 'Decides on premium funding.'),
  ('Southern Cross Freight Ltd',            'Marcus Reid',      'Fleet manager',         'marcus@example.co.nz',  '027 555 0303', true,  'Sends the vehicle schedule as a spreadsheet.'),
  ('Tui Orchards Ltd',                      'Rangi Whata',      'Orchard manager',       'rangi@example.co.nz',   '027 555 0304', true,  ''),
  ('Harbourview Apartments Body Corporate', 'Fiona McBride',    'Body corporate chair',  'fiona@example.co.nz',   '027 555 0305', true,  'Committee meets the first Tuesday.'),
  ('Harbourview Apartments Body Corporate', 'Sanjay Rao',       'Building manager',      'sanjay@example.co.nz',  '027 555 0306', false, 'First call on any water damage.'),
  ('Pemberton Legal Ltd',                   'Charlotte Yee',    'Practice manager',      'charlotte@example.co.nz','027 555 0307', true, 'Wants the professional indemnity comparison in writing every year.'),
  ('Rangitoto Civil Ltd',                   'Wiremu Katene',    'Commercial manager',    'wiremu@example.co.nz',  '027 555 0308', true,  'Sends contract works declarations late. Chase at the twentieth.'),
  ('Blue Duck Cafe Group Ltd',              'Nadia Haddad',     'Owner',                 'nadia@example.co.nz',   '027 555 0309', true,  'New site opening. Cover needs to move with it.'),
  ('Whangarei Marine Services Ltd',         'Pete Sandford',    'General manager',       'pete@example.co.nz',    '027 555 0310', true,  ''),
  ('Otago Dairy Partnership',               'Bruce Halliday',   'Partner',               'bruce@example.co.nz',   '027 555 0311', true,  'Calving season means no calls in August.'),
  ('Meridian Dental Ltd',                   'Dr Amy Sutcliffe', 'Principal dentist',     'amy@example.co.nz',     '027 555 0312', true,  ''),
  ('Kirkwood Engineering Ltd',              'Tania Brooke',     'Finance manager',       'tania@example.co.nz',   '027 555 0313', true,  'Handles the premium funding paperwork.'),
  ('Aotea Packaging Ltd',                   'Simon Waterhouse', 'Plant manager',         'simon@example.co.nz',   '027 555 0314', true,  ''),
  ('Coastal Storage Ltd',                   'Jo Ferrier',       'Owner',                 'jo@example.co.nz',      '027 555 0315', true,  'One person business. Email is the only reliable channel.'),
  ('Fern Ridge Vineyards Ltd',              'Marc Delaunay',    'Winemaker',             'marc@example.co.nz',    '027 555 0316', true,  ''),
  ('Te Awa Health Trust',                   'Hemi Paora',       'Chief executive',       'hemi@example.co.nz',    '027 555 0317', true,  'Board papers go out ten days before the meeting.'),
  ('Delacourt Property Ltd',                'Gwen Prentice',    'Portfolio manager',     'gwen@example.co.nz',    '027 555 0318', true,  'Wants a schedule per building, not one summary.')
) as v(client, full_name, role, email, phone, is_primary, notes)
on conflict do nothing;

-- Policies -------------------------------------------------------------------
-- expiry_offset is days from today. Inception is a year before expiry.

insert into policies (id, policy_no, client_id, insurer_id, broker_id, class, cover_summary, status,
                      inception_on, expiry_on, sum_insured_cents, excess_cents, base_premium_cents,
                      brokerage_pct, broker_fee_cents, payment_method, funder, renewal_type, insurer_ref, placed_on, notes)
select seed_uuid('policy:' || v.policy_no), v.policy_no, seed_uuid('client:' || v.client), seed_uuid('insurer:' || v.insurer), seed_uuid('broker:' || v.broker),
       v.class, v.cover_summary, v.status,
       current_date + v.expiry_offset - 365, current_date + v.expiry_offset,
       v.sum_insured::bigint, v.excess::bigint, v.base_premium::bigint,
       v.brokerage_pct, v.broker_fee::bigint, v.payment_method,
       nullif(v.funder, ''), v.renewal_type, v.insurer_ref,
       current_date + v.expiry_offset - 365, v.notes
from (values
  ('POL-20001', 'Kauri Joinery Ltd',                     'NZI',                 'Hine Rawiri', 'material damage',       'Buildings, plant and stock at two sites',              'in force',   9,   1420000000, 250000, 1840000, 17.5, 25000, 'premium funded', 'IQumulate Premium Funding', 'invited', 'NZI-MD-88213', 'Spray booth protections warranted.'),
  ('POL-20002', 'Kauri Joinery Ltd',                     'NZI',                 'Hine Rawiri', 'business interruption', 'Gross profit, indemnity period 12 months',             'in force',   9,   480000000,  0,      620000,  17.5, 0,     'premium funded', 'IQumulate Premium Funding', 'invited', 'NZI-BI-88214', ''),
  ('POL-20003', 'Kauri Joinery Ltd',                     'QBE',                 'Hine Rawiri', 'general liability',     'Public and products liability, 5m limit',              'in force',   43,  500000000,  100000, 385000,  15.0, 0,     'direct',         '',                          'invited', 'QBE-GL-40119', ''),
  ('POL-20004', 'Southern Cross Freight Ltd',            'QBE',                 'Hine Rawiri', 'motor fleet',           '22 units, agreed value, goods in transit extension',   'in force',   52,  1980000000, 250000, 2940000, 15.0, 45000, 'premium funded', 'Hunter Premium Funding',    'invited', 'QBE-MF-22841', 'Two at fault claims this period. Rate will move.'),
  ('POL-20005', 'Blue Duck Cafe Group Ltd',              'Ando',                'Priya Nair',  'general liability',     'Public liability 2m, three sites',                     'in force',   12,  200000000,  50000,  212000,  20.0, 15000, 'direct',         '',                          'invited', 'AND-GL-91002', 'Fourth site is not on the schedule yet.'),
  ('POL-20006', 'Blue Duck Cafe Group Ltd',              'Ando',                'Priya Nair',  'material damage',       'Fit out, plant and stock, three sites',                'in force',   12,  310000000,  100000, 448000,  20.0, 0,     'direct',         '',                          'invited', 'AND-MD-91003', ''),
  ('POL-20007', 'Tui Orchards Ltd',                      'Rosser Underwriting', 'Priya Nair',  'rural',                 'Orchard structures, packhouse plant, hail extension',  'in force',   26,  760000000,  500000, 1290000, 22.5, 30000, 'direct',         '',                          'invited', 'ROS-RU-10442', 'Hail extension is the reason this sits with an agency.'),
  ('POL-20008', 'Harbourview Apartments Body Corporate', 'Vero',                'Grant Milne', 'material damage',       'Forty two units, common property, reinstatement',      'in force',   58,  8900000000, 500000, 7420000, 17.5, 90000, 'premium funded', 'IQumulate Premium Funding', 'invited', 'VER-MD-70118', 'Seismic assessment on file, 78 percent NBS.'),
  ('POL-20009', 'Harbourview Apartments Body Corporate', 'Vero',                'Grant Milne', 'general liability',     'Body corporate liability 5m, office bearers 1m',       'in force',   58,  500000000,  100000, 340000,  17.5, 0,     'direct',         '',                          'invited', 'VER-GL-70119', ''),
  ('POL-20010', 'Pemberton Legal Ltd',                   'Delta Insurance',     'Grant Milne', 'professional indemnity','Civil liability 5m any one claim and in the aggregate','in force',   21,  500000000,  250000, 2180000, 20.0, 40000, 'direct',         '',                          'invited', 'DEL-PI-33210', 'Eleven partners. Notification of circumstances clause matters here.'),
  ('POL-20011', 'Pemberton Legal Ltd',                   'Delta Insurance',     'Grant Milne', 'cyber',                 'Cyber liability 1m, incident response included',       'in force',   21,  100000000,  100000, 640000,  20.0, 0,     'direct',         '',                          'invited', 'DEL-CY-33211', ''),
  ('POL-20012', 'Coastal Storage Ltd',                   'Ando',                'Priya Nair',  'material damage',       'Buildings, two hundred units, goods of others 250k',   'in force',   5,   1180000000, 250000, 1120000, 20.0, 20000, 'direct',         '',                          'invited', 'AND-MD-55771', 'Goods of others limit has not moved in three years.'),
  ('POL-20013', 'Rangitoto Civil Ltd',                   'Vero',                'Hine Rawiri', 'contract works',        'Annual contract works, 4m any one contract',           'in force',   38,  400000000,  250000, 2760000, 17.5, 55000, 'premium funded', 'Hunter Premium Funding',    'invited', 'VER-CW-61840', 'Declarations due monthly. They are always late.'),
  ('POL-20014', 'Rangitoto Civil Ltd',                   'QBE',                 'Hine Rawiri', 'general liability',     'Public liability 10m, contractual liability extension','in force',   38,  1000000000, 250000, 1420000, 15.0, 0,     'premium funded', 'Hunter Premium Funding',    'invited', 'QBE-GL-61841', ''),
  ('POL-20015', 'Rangitoto Civil Ltd',                   'QBE',                 'Hine Rawiri', 'commercial motor',      'Nine utes and two trucks',                             'in force',   38,  62000000,   100000, 486000,  15.0, 0,     'premium funded', 'Hunter Premium Funding',    'invited', 'QBE-CM-61842', ''),
  ('POL-20016', 'Whangarei Marine Services Ltd',         'Berkley Insurance',   'Priya Nair',  'marine cargo',          'Marine liability and vessels in care custody control', 'in force',   70,  340000000,  250000, 1640000, 15.0, 35000, 'direct',         '',                          'invited', 'BER-MA-20031', ''),
  ('POL-20017', 'Whangarei Marine Services Ltd',         'Ando',                'Priya Nair',  'material damage',       'Slipway, workshop, plant and tools',                   'in force',   70,  520000000,  100000, 720000,  20.0, 0,     'direct',         '',                          'invited', 'AND-MD-20032', ''),
  ('POL-20018', 'Otago Dairy Partnership',               'Rosser Underwriting', 'Hine Rawiri', 'rural',                 'Dwellings, sheds, plant, milk contamination',          'in force',   84,  1240000000, 250000, 1810000, 22.5, 30000, 'direct',         '',                          'invited', 'ROS-RU-77120', 'Effluent liability added after the regional council audit.'),
  ('POL-20019', 'Meridian Dental Ltd',                   'Ando',                'Priya Nair',  'material damage',       'Fit out, two surgeries, equipment breakdown',          'in force',   95,  290000000,  100000, 424000,  20.0, 15000, 'direct',         '',                          'invited', 'AND-MD-33902', ''),
  ('POL-20020', 'Janet Whitmore',                        'Vero',                'Priya Nair',  'home',                  'Home, sum insured basis, natural disaster included',   'in force',   -9,  198000000,  50000,  318000,  17.5, 0,     'direct',         '',                          'invited', 'VER-HO-90014', 'Expired and never renewed. This is the one that keeps a principal awake.'),
  ('POL-20021', 'Janet Whitmore',                        'Vero',                'Priya Nair',  'contents',              'Contents 180k, specified jewellery 42k',               'in force',   110, 22200000,   50000,  96000,   17.5, 0,     'direct',         '',                          'invited', 'VER-CO-90015', ''),
  ('POL-20022', 'Janet Whitmore',                        'Vero',                'Priya Nair',  'private motor',         'Two vehicles, agreed value',                           'in force',   110, 14500000,   50000,  184000,  17.5, 0,     'direct',         '',                          'invited', 'VER-PM-90016', ''),
  ('POL-20023', 'Kirkwood Engineering Ltd',              'NZI',                 'Hine Rawiri', 'material damage',       'Workshop, plant, stock, machinery breakdown',          'in force',   30,  980000000,  250000, 1560000, 17.5, 30000, 'premium funded', 'IQumulate Premium Funding', 'invited', 'NZI-MD-44810', ''),
  ('POL-20024', 'Kirkwood Engineering Ltd',              'QBE',                 'Hine Rawiri', 'general liability',     'Public and products liability 10m',                    'in force',   30,  1000000000, 250000, 940000,  15.0, 0,     'premium funded', 'IQumulate Premium Funding', 'invited', 'QBE-GL-44811', 'Products liability is the real exposure. Structural steel.'),
  ('POL-20025', 'Aotea Packaging Ltd',                   'Chubb',               'Grant Milne', 'material damage',       'Plant, buildings, machinery breakdown 2m',             'in force',   132, 2240000000, 500000, 3180000, 15.0, 45000, 'premium funded', 'IQumulate Premium Funding', 'invited', 'CHB-MD-11220', ''),
  ('POL-20026', 'Aotea Packaging Ltd',                   'Chubb',               'Grant Milne', 'business interruption', 'Gross profit 4.2m, indemnity period 18 months',        'in force',   132, 420000000,  0,      1420000, 15.0, 0,     'premium funded', 'IQumulate Premium Funding', 'invited', 'CHB-BI-11221', 'Indemnity period under review after the last breakdown.'),
  ('POL-20027', 'Fern Ridge Vineyards Ltd',              'Rosser Underwriting', 'Hine Rawiri', 'rural',                 'Winery buildings, tanks, stock in tank, frost',        'in force',   156, 1680000000, 500000, 2340000, 22.5, 40000, 'direct',         '',                          'invited', 'ROS-RU-88410', ''),
  ('POL-20028', 'Te Awa Health Trust',                   'Delta Insurance',     'Grant Milne', 'statutory liability',   'Statutory liability 1m, employment disputes 500k',     'in force',   178, 100000000,  100000, 520000,  20.0, 20000, 'direct',         '',                          'invited', 'DEL-SL-66201', ''),
  ('POL-20029', 'Te Awa Health Trust',                   'Vero',                'Grant Milne', 'material damage',       'Clinic building, contents, medical equipment',         'in force',   178, 640000000,  100000, 780000,  17.5, 0,     'direct',         '',                          'invited', 'VER-MD-66202', ''),
  ('POL-20030', 'Delacourt Property Ltd',                'Chubb',               'Grant Milne', 'material damage',       'Four commercial buildings, reinstatement',             'in force',   204, 5600000000, 500000, 4920000, 15.0, 80000, 'premium funded', 'Hunter Premium Funding',    'invited', 'CHB-MD-30014', 'Building 3 is 62 percent NBS. Loading applies.'),
  ('POL-20031', 'Delacourt Property Ltd',                'Chubb',               'Grant Milne', 'business interruption', 'Loss of rents, indemnity period 24 months',            'in force',   204, 890000000,  0,      1180000, 15.0, 0,     'premium funded', 'Hunter Premium Funding',    'invited', 'CHB-BI-30015', ''),
  ('POL-20032', 'Rob and Alice Ngatai',                  'Rosser Underwriting', 'Hine Rawiri', 'rural',                 'Lifestyle block, dwelling, sheds, two horses',         'in force',   241, 168000000,  100000, 286000,  22.5, 0,     'direct',         '',                          'invited', 'ROS-RU-51120', ''),
  ('POL-20033', 'Southern Cross Freight Ltd',            'NZI',                 'Hine Rawiri', 'material damage',       'Depot, workshop, plant, stock',                        'in force',   286, 720000000,  250000, 1080000, 17.5, 0,     'direct',         '',                          'invited', 'NZI-MD-22842', ''),
  ('POL-20034', 'Tui Orchards Ltd',                      'QBE',                 'Priya Nair',  'general liability',     'Public and products liability 5m, export extension',   'in force',   304, 500000000,  100000, 412000,  15.0, 0,     'direct',         '',                          'invited', 'QBE-GL-10443', ''),
  ('POL-20035', 'Aotea Packaging Ltd',                   'QBE',                 'Grant Milne', 'general liability',     'Public and products liability 10m, food grade goods',  'in force',   268, 1000000000, 250000, 880000,  15.0, 0,     'direct',         '',                          'invited', 'QBE-GL-11222', 'Placed mid term after the new line went in. No advice record was written.')
) as v(policy_no, client, insurer, broker, class, cover_summary, status, expiry_offset, sum_insured, excess, base_premium, brokerage_pct, broker_fee, payment_method, funder, renewal_type, insurer_ref, notes)
on conflict do nothing;

-- Levies, GST, gross premium and brokerage, computed once from the base premium.
-- Fire and Emergency levy applies to the property classes. GST is 15 percent.
update policies set
  levies_cents = case when class in ('material damage', 'business interruption', 'rural', 'contract works', 'home', 'contents')
                      then round(base_premium_cents * 0.0106)::bigint else 0 end
where levies_cents = 0 and base_premium_cents > 0;

update policies set
  gst_cents = round((base_premium_cents + levies_cents) * 0.15)::bigint
where gst_cents = 0 and base_premium_cents > 0;

update policies set
  gross_premium_cents = base_premium_cents + levies_cents + gst_cents
where gross_premium_cents = 0 and base_premium_cents > 0;

update policies set
  brokerage_cents = round(base_premium_cents * brokerage_pct / 100)::bigint
where brokerage_cents = 0 and base_premium_cents > 0;

-- Covers: the sections inside the bigger policies -----------------------------

insert into covers (id, policy_id, section, description, sum_insured_cents, excess_cents, limit_note)
select seed_uuid('cover:' || v.policy_no || ':' || v.section), seed_uuid('policy:' || v.policy_no), v.section, v.description, v.sum_insured::bigint, v.excess::bigint, v.limit_note
from (values
  ('POL-20001', 'Buildings',                  'Two workshops, Frankton',                       860000000, 250000, 'Reinstatement'),
  ('POL-20001', 'Plant and machinery',        'CNC, spray booth, dust extraction',             420000000, 250000, 'Reinstatement'),
  ('POL-20001', 'Stock',                      'Timber, hardware, work in progress',            140000000, 100000, 'Declared value'),
  ('POL-20008', 'Common property',            'Structure, lifts, roof, car park',             7800000000, 500000, 'Reinstatement, seismic sub limit applies'),
  ('POL-20008', 'Body corporate contents',    'Foyer, gym, shared plant',                       300000000, 250000, 'Reinstatement'),
  ('POL-20008', 'Loss of rents',              'Twelve months',                                  800000000, 0,      'Indemnity period 12 months'),
  ('POL-20013', 'Contract works',             'Any one contract',                               400000000, 250000, 'Includes existing structures 500k'),
  ('POL-20013', 'Plant and equipment',        'Owned and hired in plant',                        88000000, 100000, ''),
  ('POL-20030', 'Building 1 Featherston St',  '1974, 91 percent NBS',                          2100000000, 500000, 'Reinstatement'),
  ('POL-20030', 'Building 2 Willis St',       '1988, 88 percent NBS',                          1600000000, 500000, 'Reinstatement'),
  ('POL-20030', 'Building 3 Vivian St',       '1966, 62 percent NBS',                          1200000000, 1000000,'Reinstatement, earthquake excess 5 percent'),
  ('POL-20030', 'Building 4 Ghuznee St',      '2004, 100 percent NBS',                          700000000, 500000, 'Reinstatement'),
  ('POL-20027', 'Winery buildings',           'Barrel hall, cellar door, crush pad',            820000000, 500000, 'Reinstatement'),
  ('POL-20027', 'Tanks and plant',            'Stainless, presses, bottling line',              460000000, 500000, 'Reinstatement'),
  ('POL-20027', 'Stock in tank',              'Declared monthly, peak March to May',            400000000, 250000, 'Declared value, peak season endorsement')
) as v(policy_no, section, description, sum_insured, excess, limit_note)
on conflict do nothing;

-- Renewals in flight ----------------------------------------------------------

insert into renewals (id, policy_id, due_on, stage, broker_id, invited_on, client_contacted_on, terms_due_on, presented_on, instructed_on, premium_last_cents, premium_offered_cents, notes)
select seed_uuid('renewal:' || v.policy_no), p.id, p.expiry_on, v.stage, seed_uuid('broker:' || v.broker),
       case when v.invited is null then null else current_date - v.invited end,
       case when v.contacted is null then null else current_date - v.contacted end,
       case when v.terms_due is null then null else current_date - v.terms_due end,
       case when v.presented is null then null else current_date - v.presented end,
       case when v.instructed is null then null else current_date - v.instructed end,
       p.gross_premium_cents, v.offered::bigint, v.notes
from (values
  ('POL-20001', 'in market',   'Hine Rawiri', 44, 21, 4,    null, null, 0,       'NZI holding for the spray booth report. Terms were due four days ago.'),
  ('POL-20002', 'in market',   'Hine Rawiri', 44, 21, 4,    null, null, 0,       'Goes with the material damage.'),
  ('POL-20007', 'presented',   'Priya Nair',  40, 18, -6,   3,    null, 1420000, 'Rosser held the rate. Hail extension unchanged.'),
  ('POL-20010', 'instructed',  'Grant Milne', 52, 30, -12,  9,    2,    2340000, 'Client instructed to bind. Waiting on the closing.'),
  ('POL-20011', 'instructed',  'Grant Milne', 52, 30, -12,  9,    2,    690000,  'Goes with the professional indemnity.'),
  ('POL-20012', 'not started', 'Priya Nair',  null, null, null, null, null, 0,   'Five days out and nothing has happened.'),
  ('POL-20023', 'reviewing',   'Hine Rawiri', 26, 12, -4,   null, null, 0,       'Waiting on updated plant values from Tania.'),
  ('POL-20024', 'reviewing',   'Hine Rawiri', 26, 12, -4,   null, null, 0,       ''),
  ('POL-20013', 'in market',   'Hine Rawiri', 33, 15, -3,   null, null, 0,       'Three markets approached. Contract works is hardening.'),
  ('POL-20014', 'in market',   'Hine Rawiri', 33, 15, -3,   null, null, 0,       ''),
  ('POL-20004', 'reviewing',   'Hine Rawiri', 21, 9,  -10,  null, null, 0,       'Two at fault claims. Expect a rate rise and an excess move.'),
  ('POL-20008', 'reviewing',   'Grant Milne', 30, 14, -14,  null, null, 0,       'Committee wants terms two weeks before the AGM.')
) as v(policy_no, stage, broker, invited, contacted, terms_due, presented, instructed, offered, notes)
join policies p on p.id = seed_uuid('policy:' || v.policy_no)
on conflict do nothing;

-- Quotes ----------------------------------------------------------------------

insert into quotes (id, quote_ref, client_id, insurer_id, policy_id, renewal_id, purpose, class, requested_on, due_on, received_on, status,
                    premium_cents, brokerage_pct, excess_cents, sum_insured_cents, terms, decline_reason, lost_reason, broker_id, notes)
select seed_uuid('quote:' || v.quote_ref), v.quote_ref, seed_uuid('client:' || v.client),
       seed_uuid('insurer:' || v.insurer),
       case when v.policy_no = '' then null else seed_uuid('policy:' || v.policy_no) end,
       r.id,
       v.purpose, v.class,
       current_date - v.requested, current_date - v.due,
       case when v.received is null then null else current_date - v.received end,
       v.status, v.premium::bigint, v.brokerage_pct, v.excess::bigint, v.sum_insured::bigint,
       nullif(v.terms, ''), nullif(v.decline_reason, ''), nullif(v.lost_reason, ''),
       seed_uuid('broker:' || v.broker), v.notes
from (values
  ('Q-26011', 'Kauri Joinery Ltd',        'NZI',                 'POL-20001', 'renewal',      'material damage',        18, 4,   null, 'requested', 0,       17.5, 250000, 1480000000, '',                                                     '', '', 'Hine Rawiri', 'Chased twice. Underwriter wants the spray booth report.'),
  ('Q-26012', 'Rangitoto Civil Ltd',      'Vero',                'POL-20013', 'renewal',      'contract works',         25, 11,  null, 'requested', 0,       17.5, 250000, 400000000,  '',                                                     '', '', 'Hine Rawiri', 'Eleven days past the date they said. Chase or go elsewhere.'),
  ('Q-26013', 'Tui Orchards Ltd',         'Rosser Underwriting', 'POL-20007', 'renewal',      'rural',                  40, 20,  18,   'presented', 1420000, 22.5, 500000, 780000000,  'Hail extension unchanged, excess held at 5k.',         '', '', 'Priya Nair',  ''),
  ('Q-26014', 'Pemberton Legal Ltd',      'Delta Insurance',     'POL-20010', 'renewal',      'professional indemnity', 52, 30,  26,   'accepted',  2340000, 20.0, 250000, 500000000,  'Limit held at 5m. Retroactive date unchanged.',        '', '', 'Grant Milne', 'Client instructed. Closing to follow.'),
  ('Q-26015', 'Pemberton Legal Ltd',      'Chubb',               'POL-20010', 'remarket',     'professional indemnity', 52, 30,  24,   'lost',      2620000, 15.0, 500000, 500000000,  'Higher excess, wider exclusions.',                     '', 'Dearer and a wider exclusion on M and A work.', 'Grant Milne', 'Kept on file as the comparison for the advice record.'),
  ('Q-26016', 'Blue Duck Cafe Group Ltd', 'Ando',                'POL-20005', 'renewal',      'general liability',      12, 2,   null, 'requested', 0,       20.0, 50000,  200000000,  '',                                                     '', '', 'Priya Nair',  'Fourth site needs to go on the schedule before terms.'),
  ('Q-26017', 'Coastal Storage Ltd',      'Vero',                '',          'new business', 'material damage',        9,  -5,  null, 'requested', 0,       17.5, 250000, 1240000000, '',                                                     '', '', 'Priya Nair',  'Testing the market on goods of others.'),
  ('Q-26018', 'Kirkwood Engineering Ltd', 'NZI',                 'POL-20023', 'renewal',      'material damage',        26, -1,  null, 'requested', 0,       17.5, 250000, 1020000000, '',                                                     '', '', 'Hine Rawiri', 'Waiting on the updated plant schedule.'),
  ('Q-26019', 'Te Awa Health Trust',      'Delta Insurance',     '',          'new business', 'cyber',                  16, 6,   4,    'received',  480000,  20.0, 100000, 50000000,   'Cyber 500k, incident response, 24 hour hotline.',      '', '', 'Grant Milne', 'Board asked for it after the sector alert.'),
  ('Q-26020', 'Fern Ridge Vineyards Ltd',  'Berkley Insurance',  '',          'new business', 'marine cargo',           22, 12,  10,   'declined',  0,       15.0, 0,      0,          '',                                                     'Outside appetite for bulk wine in flexitanks.', '', 'Hine Rawiri', 'Declined. Try the London market next.'),
  ('Q-26021', 'Delacourt Property Ltd',   'Vero',                'POL-20030', 'remarket',     'material damage',        60, 40,  35,   'received',  5140000, 17.5, 500000, 5600000000, 'Seismic loading on building 3, otherwise as expiring.','', '', 'Grant Milne', 'Held for the renewal review.'),
  ('Q-26022', 'Southern Cross Freight Ltd','Ando',               'POL-20004', 'remarket',     'motor fleet',            20, 6,   null, 'requested', 0,       20.0, 250000, 1980000000, '',                                                     '', '', 'Hine Rawiri', 'Second market on the fleet after the claims run.')
) as v(quote_ref, client, insurer, policy_no, purpose, class, requested, due, received, status, premium, brokerage_pct, excess, sum_insured, terms, decline_reason, lost_reason, broker, notes)
left join renewals r on v.policy_no <> '' and r.policy_id = seed_uuid('policy:' || v.policy_no)
on conflict do nothing;

-- Endorsements ----------------------------------------------------------------

insert into endorsements (id, endorsement_no, policy_id, kind, effective_on, requested_on, confirmed_on, description, status,
                          premium_adjustment_cents, brokerage_adjustment_cents, insurer_ref, broker_id, notes)
select seed_uuid('endorsement:' || v.endorsement_no), v.endorsement_no, seed_uuid('policy:' || v.policy_no), v.kind,
       current_date - v.effective, current_date - v.requested,
       case when v.confirmed is null then null else current_date - v.confirmed end,
       v.description, v.status, v.premium_adj::bigint, v.brokerage_adj::bigint, nullif(v.insurer_ref, ''), seed_uuid('broker:' || v.broker), v.notes
from (values
  ('END-26001', 'POL-20005', 'add cover',             10, 19,  null, 'Add the fourth site at 118 Great North Road to the liability schedule', 'with insurer', 42000,  8400,  '',              'Priya Nair',  'Nineteen days with the insurer. The site is trading.'),
  ('END-26002', 'POL-20015', 'vehicle change',        6,  11,  null, 'Add two Ford Rangers, remove one Hilux',                                'requested',    18000,  2700,  '',              'Hine Rawiri', 'Vehicles are on the road now.'),
  ('END-26003', 'POL-20001', 'increase sum insured',  45, 52,  48,   'Increase plant sum insured by 380k after the CNC purchase',             'confirmed',    64000,  11200, 'NZI-EN-88301',  'Hine Rawiri', ''),
  ('END-26004', 'POL-20030', 'interested party',      70, 76,  73,   'Note the bank as first mortgagee on building 4',                        'confirmed',    0,      0,     'CHB-EN-30099',  'Grant Milne', ''),
  ('END-26005', 'POL-20008', 'change of address',     120,124, 121,  'Correct the situation address for the car park title',                  'confirmed',    0,      0,     'VER-EN-70220',  'Grant Milne', ''),
  ('END-26006', 'POL-20018', 'add cover',             38, 44,  41,   'Add effluent liability 250k after the regional council audit',          'confirmed',    58000,  13050, 'ROS-EN-77188',  'Hine Rawiri', ''),
  ('END-26007', 'POL-20027', 'increase sum insured',  22, 27,  25,   'Peak season stock in tank up to 5.2m for March to May',                 'confirmed',    112000, 25200, 'ROS-EN-88477',  'Hine Rawiri', ''),
  ('END-26008', 'POL-20013', 'add cover',             14, 20,  17,   'Note the Waikeria contract, value 2.1m, on the annual declaration',     'confirmed',    88000,  15400, 'VER-EN-61901',  'Hine Rawiri', 'Declaration arrived six days late as usual.')
) as v(endorsement_no, policy_no, kind, effective, requested, confirmed, description, status, premium_adj, brokerage_adj, insurer_ref, broker, notes)
on conflict do nothing;

-- Claims -----------------------------------------------------------------------

insert into claims (id, claim_no, policy_id, client_id, insurer_id, insurer_claim_ref, class, loss_on, notified_on, description, status,
                    reserve_cents, excess_cents, settled_cents, settled_on, closed_on, last_client_update_on, last_insurer_update_on, broker_id, notes)
select seed_uuid('claim:' || v.claim_no), v.claim_no, p.id, p.client_id, p.insurer_id, nullif(v.insurer_ref, ''), p.class,
       current_date - v.loss, current_date - v.notified, v.description, v.status,
       v.reserve::bigint, v.excess::bigint, v.settled::bigint,
       case when v.settled_days is null then null else current_date - v.settled_days end,
       case when v.closed is null then null else current_date - v.closed end,
       case when v.client_update is null then null else current_date - v.client_update end,
       case when v.insurer_update is null then null else current_date - v.insurer_update end,
       seed_uuid('broker:' || v.broker), v.notes
from (values
  ('CLM-26001', 'POL-20004', 'QBE-CLM-77120', 36, 34, 'Rear end collision on State Highway 1 near Rakaia. Unit 14, third party vehicle written off.', 'assessing',          4800000, 250000, 0,       null, null, 26,   9,  'Tom Baxter', 'Assessor appointed. Nobody has told Marcus anything since the assessor visit.'),
  ('CLM-26002', 'POL-20013', '',              12, 9,  'Storm damage to formwork and a partly built retaining wall at the Silverdale site.',           'notified',           2600000, 250000, 0,       null, null, 7,    null,'Tom Baxter', 'Notified to Vero nine days ago. No acknowledgement on file.'),
  ('CLM-26003', 'POL-20007', 'ROS-CLM-10880', 66, 61, 'Hail through blocks 3 and 4. Fruit loss and structure damage to two shelter belts.',           'settlement offered', 8400000, 500000, 0,       null, null, 5,    4,  'Tom Baxter', 'Offer received. Client considering. Loss adjuster report on file.'),
  ('CLM-26004', 'POL-20008', 'VER-CLM-70441', 126,120,'Water damage from a failed riser on level 6. Four units affected, common property soaked.',    'assessing',          15600000,500000, 0,       null, null, 20,   11, 'Tom Baxter', 'Twenty days since the committee heard anything. They will ask at the AGM.'),
  ('CLM-26005', 'POL-20010', 'DEL-CLM-33455', 60, 45, 'Notification of circumstances. Conveyancing file, alleged missed easement.',                   'information requested',3000000,250000, 0,      null, null, 3,    2,  'Grant Milne', 'Circumstance only. No claim made yet. Insurer has the file note.'),
  ('CLM-26006', 'POL-20017', 'AND-CLM-20180', 240,238,'Fire in the paint store. Workshop contents and two boats under refit.',                       'settled',            0,       100000, 34200000, 96,  92,   96,   96, 'Tom Baxter', 'Settled and closed. Good result, twelve weeks end to end.'),
  ('CLM-26007', 'POL-20019', 'AND-CLM-33990', 300,296,'Theft of a handpiece set and an intraoral scanner from surgery 2.',                           'declined',           0,       100000, 0,       null, 260,  262,  262,'Tom Baxter', 'Declined. No forced entry and the alarm was not set. Client accepted the reason.'),
  ('CLM-26008', 'POL-20024', 'QBE-CLM-44980', 20, 15, 'Third party alleges a fabricated bracket failed on site. Products liability notification.',    'acknowledged',       1200000, 250000, 0,       null, null, 8,    6,  'Tom Baxter', 'Early. Statement being taken from the fabricator.'),
  ('CLM-26009', 'POL-20018', 'ROS-CLM-77444', 214,210,'Milk contamination after a wash cycle fault. Two vat loads dumped.',                          'settled',            0,       250000, 4180000, 150, 146,  150,  150,'Tom Baxter', 'Settled and closed.'),
  ('CLM-26010', 'POL-20030', 'CHB-CLM-30221', 5,  3,  'Glazing failure on the Vivian Street frontage after high winds.',                             'notified',           480000,  500000, 0,       null, null, 2,    null,'Tom Baxter', 'Under the excess most likely. Notified anyway.'),
  ('CLM-26011', 'POL-20025', 'CHB-CLM-11330', 410,405,'Machinery breakdown on the corrugator. Business interruption ran nine days.',                 'settled',            0,       500000, 21800000, 300, 296,  300,  300,'Tom Baxter', 'Settled. The reason the indemnity period is under review.')
) as v(claim_no, policy_no, insurer_ref, loss, notified, description, status, reserve, excess, settled, settled_days, closed, client_update, insurer_update, broker, notes)
join policies p on p.id = seed_uuid('policy:' || v.policy_no)
on conflict do nothing;

insert into claim_events (id, claim_id, happened_on, kind, note, actor)
select seed_uuid('claim_event:' || v.claim_no || ':' || v.seq), seed_uuid('claim:' || v.claim_no), current_date - v.days, v.kind, v.note, v.actor
from (values
  ('CLM-26001', 1, 34, 'notified',              'Notified to QBE with the driver statement and photographs.',        'Tom Baxter'),
  ('CLM-26001', 2, 32, 'insurer acknowledged',  'Claim number issued.',                                              'QBE'),
  ('CLM-26001', 3, 28, 'assessor appointed',    'Assessor booked for the Rakaia yard.',                              'QBE'),
  ('CLM-26001', 4, 26, 'client updated',        'Told Marcus the assessor was coming.',                              'Tom Baxter'),
  ('CLM-26001', 5, 9,  'information requested', 'Insurer wants the maintenance record for unit 14.',                 'QBE'),
  ('CLM-26002', 1, 9,  'notified',              'Notified to Vero with site photographs and the weather report.',    'Tom Baxter'),
  ('CLM-26002', 2, 7,  'client updated',        'Told Wiremu it was lodged.',                                        'Tom Baxter'),
  ('CLM-26003', 1, 61, 'notified',              'Notified with the orchard map and the hail report.',                'Tom Baxter'),
  ('CLM-26003', 2, 58, 'insurer acknowledged',  'Loss adjuster appointed.',                                          'Rosser Underwriting'),
  ('CLM-26003', 3, 40, 'information sent',      'Sent three years of tray counts for the affected blocks.',          'Tom Baxter'),
  ('CLM-26003', 4, 6,  'settlement offered',    'Offer of 84k less the excess.',                                     'Rosser Underwriting'),
  ('CLM-26003', 5, 5,  'client updated',        'Rangi has the offer and the adjuster report.',                      'Tom Baxter'),
  ('CLM-26004', 1, 120,'notified',              'Notified with the plumber report and unit list.',                   'Tom Baxter'),
  ('CLM-26004', 2, 116,'assessor appointed',    'Building assessor and a restoration contractor attended.',          'Vero'),
  ('CLM-26004', 3, 74, 'information requested', 'Insurer wants the maintenance history for the riser.',              'Vero'),
  ('CLM-26004', 4, 20, 'client updated',        'Told Fiona the assessment was still open.',                         'Tom Baxter'),
  ('CLM-26004', 5, 11, 'information sent',      'Sent the body corporate maintenance schedule.',                     'Tom Baxter'),
  ('CLM-26005', 1, 45, 'notified',              'Circumstance notified under the professional indemnity policy.',    'Grant Milne'),
  ('CLM-26005', 2, 44, 'insurer acknowledged',  'Noted as a circumstance, no reserve set.',                          'Delta Insurance'),
  ('CLM-26005', 3, 3,  'client updated',        'Charlotte updated. No claim made against the firm yet.',            'Grant Milne'),
  ('CLM-26006', 1, 238,'notified',              'Fire brigade attended. Notified same day.',                         'Tom Baxter'),
  ('CLM-26006', 2, 150,'payment made',          'Interim payment of 120k.',                                          'Ando'),
  ('CLM-26006', 3, 96, 'payment made',          'Final settlement 342k less excess.',                                'Ando'),
  ('CLM-26006', 4, 92, 'closed',                'Closed.',                                                           'Tom Baxter'),
  ('CLM-26008', 1, 15, 'notified',              'Products liability notification with the fabrication drawings.',    'Tom Baxter'),
  ('CLM-26008', 2, 13, 'insurer acknowledged',  'Claim number issued, solicitor instructed.',                        'QBE'),
  ('CLM-26008', 3, 8,  'client updated',        'Told Tania a statement would be needed from the fabricator.',       'Tom Baxter'),
  ('CLM-26010', 1, 3,  'notified',              'Notified with the glazier quote.',                                  'Tom Baxter'),
  ('CLM-26010', 2, 2,  'client updated',        'Told Gwen it is likely under the excess.',                          'Tom Baxter')
) as v(claim_no, seq, days, kind, note, actor)
on conflict do nothing;

-- Tasks --------------------------------------------------------------------------

insert into tasks (id, title, kind, client_id, policy_id, claim_id, due_on, status, broker_id, done_on, note)
select seed_uuid('task:' || v.title), v.title, v.kind,
       case when v.client = '' then null else seed_uuid('client:' || v.client) end,
       case when v.policy_no = '' then null else seed_uuid('policy:' || v.policy_no) end,
       case when v.claim_no = '' then null else seed_uuid('claim:' || v.claim_no) end,
       current_date - v.due, v.status, seed_uuid('broker:' || v.broker),
       case when v.done is null then null else current_date - v.done end, v.note
from (values
  ('Chase NZI for the Kauri Joinery renewal terms',            'chase',    'Kauri Joinery Ltd',                     'POL-20001', '',          4,   'open', 'Hine Rawiri', null, 'Third chase. Escalate to the branch manager.'),
  ('Get the spray booth protection report from Dave',          'document', 'Kauri Joinery Ltd',                     'POL-20001', '',          11,  'open', 'Hine Rawiri', null, 'Underwriter will not price without it.'),
  ('Add the fourth Blue Duck site to the schedule',            'change',   'Blue Duck Cafe Group Ltd',              'POL-20005', '',          8,   'open', 'Priya Nair',  null, 'Site is trading. Cover is not confirmed.'),
  ('Book the Harbourview renewal meeting before the AGM',      'meeting',  'Harbourview Apartments Body Corporate', 'POL-20008', '',          2,   'open', 'Grant Milne', null, 'Committee meets the first Tuesday.'),
  ('Send Coastal Storage the goods of others options',         'advice',   'Coastal Storage Ltd',                   'POL-20012', '',          6,   'open', 'Priya Nair',  null, 'Limit has not moved in three years.'),
  ('Chase Vero on the Rangitoto storm claim acknowledgement',  'chase',    'Rangitoto Civil Ltd',                   '',          'CLM-26002', 3,   'open', 'Tom Baxter',  null, 'Nine days, no claim number.'),
  ('Update Fiona on the Harbourview water damage claim',       'update',   'Harbourview Apartments Body Corporate', '',          'CLM-26004', 6,   'open', 'Tom Baxter',  null, 'Twenty days since the last word.'),
  ('Collect the Rangitoto contract works declaration',         'document', 'Rangitoto Civil Ltd',                   'POL-20013', '',          -4,  'open', 'Hine Rawiri', null, 'Due on the twentieth every month.'),
  ('Write the Pemberton advice record for the renewal',        'advice',   'Pemberton Legal Ltd',                   'POL-20010', '',          -2,  'open', 'Grant Milne', null, 'Comparison of Delta and Chubb terms.'),
  ('Review the Aotea indemnity period with Simon',             'advice',   'Aotea Packaging Ltd',                   'POL-20026', '',          -14, 'open', 'Grant Milne', null, 'Eighteen months may be short after the corrugator loss.'),
  ('Send the Delacourt building schedule per building',        'document', 'Delacourt Property Ltd',                'POL-20030', '',          -21, 'open', 'Grant Milne', null, 'Gwen wants one page per building.'),
  ('Confirm the Kirkwood plant values',                        'document', 'Kirkwood Engineering Ltd',              'POL-20023', '',          9,   'done','Hine Rawiri', 7,    'Received and loaded.'),
  ('Bind the Pemberton professional indemnity renewal',        'placement','Pemberton Legal Ltd',                   'POL-20010', '',          -1,  'open', 'Grant Milne', null, 'Instructed two days ago.'),
  ('File the Whangarei fire claim settlement paperwork',       'admin',    'Whangarei Marine Services Ltd',         '',          'CLM-26006', 90,  'done','Tom Baxter',  88,   ''),
  ('Ask Otago Dairy about the second dwelling',                'advice',   'Otago Dairy Partnership',               'POL-20018', '',          30,  'done','Hine Rawiri', 28,   'Added at the last endorsement.')
) as v(title, kind, client, policy_no, claim_no, due, status, broker, done, note)
on conflict do nothing;

-- Advice records -------------------------------------------------------------------

insert into advice_records (id, client_id, policy_id, broker_id, given_on, method, nature_and_scope, needs_and_circumstances,
                            recommendation, reasons, alternatives_considered, risks_disclosed, limitations,
                            disclosure_stage, disclosure_given_on, remuneration_disclosed, remuneration_note, client_confirmed_on)
select seed_uuid('advice:' || v.policy_no || ':' || v.given), seed_uuid('client:' || v.client),
       case when v.policy_no = '' then null else seed_uuid('policy:' || v.policy_no) end,
       seed_uuid('broker:' || v.broker), current_date - v.given, v.method,
       nullif(v.scope, ''), nullif(v.needs, ''), nullif(v.recommendation, ''), nullif(v.reasons, ''),
       nullif(v.alternatives, ''), nullif(v.risks, ''), nullif(v.limitations, ''),
       'advice given',
       case when v.disclosed_on is null then null else current_date - v.disclosed_on end,
       v.remuneration_disclosed, nullif(v.remuneration_note, ''),
       case when v.confirmed is null then null else current_date - v.confirmed end
from (values
  ('Kauri Joinery Ltd',                     'POL-20001', 'Hine Rawiri', 372, 'meeting',
   'Advice on material damage and business interruption for both sites. Motor and personal lines are outside this advice.',
   'Two workshops, plant replaced in the last two years, gross profit 4.8m, no losses in five years.',
   'Renew with NZI on a reinstatement basis, plant sum insured lifted to 4.2m, indemnity period held at 12 months.',
   'NZI held the rate and kept the spray booth protections as warranted rather than excluded. The alternative loaded the excess.',
   'Vero quoted 12 percent dearer with a 10k excess. Ando declined the spray booth.',
   'Underinsurance if plant values are not reviewed annually. Average clause applies.',
   'No advice given on the vehicle fleet or on directors and officers cover.',
   372, true, 'Brokerage 17.5 percent of base premium plus a 250 dollar broker fee, disclosed in the recommendation letter.', 370),
  ('Kauri Joinery Ltd',                     'POL-20003', 'Hine Rawiri', 338, 'email',
   'Advice on public and products liability only.',
   'Joinery installed on commercial sites. Contractual liability required by two main contractors.',
   'Renew with QBE at a 5m limit with the contractual liability extension.',
   'The two main contracts require 5m and contractual liability. QBE is the only market that gave both at this price.',
   'Ando quoted 2m only.',
   'A claim from work completed before the retroactive date would not be covered.',
   'No advice on statutory liability.',
   338, true, 'Brokerage 15 percent of base premium.', 336),
  ('Southern Cross Freight Ltd',            'POL-20004', 'Hine Rawiri', 329, 'meeting',
   'Advice on the commercial motor fleet and goods in transit.',
   '22 units, 18 drivers, two at fault claims in the last period.',
   'Renew with QBE on agreed value with the goods in transit extension at 250k.',
   'The claims history closed two markets. QBE held the excess at 2,500 where the alternative wanted 5,000.',
   'Ando quoted with a 5,000 excess and a driver age loading.',
   'Excess doubles for drivers under 25. Goods in transit is limited to 250k any one conveyance.',
   'No advice on the depot material damage, which sits on a separate policy.',
   329, true, 'Brokerage 15 percent plus a 450 dollar broker fee.', 327),
  ('Harbourview Apartments Body Corporate', 'POL-20008', 'Grant Milne', 302, 'meeting',
   'Advice to the body corporate committee on material damage, loss of rents and body corporate liability.',
   'Forty two units, 1974 building, seismic assessment at 78 percent NBS, sinking fund in place.',
   'Renew with Vero at full reinstatement, loss of rents held at 12 months, office bearers liability at 1m.',
   'Vero is the only market that held the seismic sub limit at the full sum insured on a 78 percent NBS building.',
   'NZI applied an earthquake sub limit of 60 percent of the sum insured. QBE declined.',
   'An earthquake sub limit would leave the body corporate exposed for the difference. Sum insured is a valuation from 2024.',
   'No advice on individual owners contents or on landlords cover inside units.',
   302, true, 'Brokerage 17.5 percent plus a 900 dollar broker fee, disclosed to the committee in writing.', 298),
  ('Pemberton Legal Ltd',                   'POL-20010', 'Grant Milne', 338, 'meeting',
   'Advice on professional indemnity and cyber for the firm.',
   'Eleven partners, conveyancing and commercial, fee income 6.4m, one circumstance notified in the last three years.',
   'Renew with Delta at 5m any one claim and in the aggregate, retroactive date unchanged, and add cyber at 1m.',
   'Delta held the retroactive date, which no other market offered. Losing the retroactive date would strand the prior work.',
   'Chubb quoted 12 percent dearer with a wider exclusion on mergers and acquisitions work.',
   'Claims made basis. A circumstance not notified inside the period is not covered later.',
   'No advice on directors and officers cover for the incorporated entity.',
   338, true, 'Brokerage 20 percent plus a 400 dollar broker fee.', 335),
  ('Rangitoto Civil Ltd',                   'POL-20013', 'Hine Rawiri', 320, 'meeting',
   'Advice on annual contract works and the associated liability programme.',
   'Civil contractor, contracts to 4m, six live sites, monthly declarations.',
   'Renew the annual contract works with Vero at 4m any one contract and hold liability at 10m with QBE.',
   'An annual policy costs less than project cover at this volume, and the main contracts require 10m liability.',
   'Project by project cover priced 22 percent higher across the last twelve months of contracts.',
   'Cover follows the declaration. A contract not declared is not covered.',
   'No advice on plant hire liability or on the workers themselves.',
   320, true, 'Brokerage 17.5 percent on contract works, 15 percent on liability, plus a 550 dollar broker fee.', 318),
  ('Otago Dairy Partnership',               'POL-20018', 'Hine Rawiri', 274, 'meeting',
   'Advice on the rural programme including milk contamination and effluent liability.',
   'Two farms, 940 cows, effluent system upgraded after the council audit.',
   'Renew with Rosser and add effluent liability at 250k.',
   'The council audit created an exposure that the standard liability section excludes.',
   'No other agency would write effluent liability on a two farm operation.',
   'Contamination cover is limited to 2 vat loads any one event.',
   'No advice on farm vehicles or on the partners personal insurance.',
   274, true, 'Brokerage 22.5 percent plus a 300 dollar broker fee.', 272),
  ('Delacourt Property Ltd',                'POL-20030', 'Grant Milne', 158, 'meeting',
   'Advice on the four building material damage and loss of rents programme.',
   'Four commercial buildings, Wellington CBD, one at 62 percent NBS, tenants on net leases.',
   'Renew with Chubb, hold reinstatement on all four, accept the earthquake loading on building 3.',
   'The loading is cheaper than the sub limit the alternative markets applied to a 62 percent NBS building.',
   'Vero quoted with a 40 percent earthquake sub limit on building 3.',
   'Loss of rents runs 24 months. A longer rebuild on building 3 would exceed it.',
   'No advice on the tenants own cover or on the seismic strengthening programme.',
   158, true, 'Brokerage 15 percent plus an 800 dollar broker fee.', 155),
  ('Whangarei Marine Services Ltd',         'POL-20016', 'Priya Nair',  288, 'phone',
   'Advice on marine liability and vessels in care, custody and control.',
   'Slipway and refit yard, up to nine vessels on the hard at once, largest 24 metres.',
   'Renew with Berkley at 3.4m for vessels in care, custody and control.',
   'The largest vessel on the hard this year is worth 2.8m. Three point four million gives headroom.',
   'Vero would not write care, custody and control above 1m.',
   'Cover stops at the yard boundary. Sea trials need a separate note.',
   'No advice on the workshop building, which sits on a separate policy.',
   288, true, 'Brokerage 15 percent plus a 350 dollar broker fee.', 286),
  ('Te Awa Health Trust',                   'POL-20028', 'Grant Milne', 174, 'meeting',
   'Advice to the board on statutory liability and employment disputes cover.',
   'Charitable trust, 31 staff, health services under contract to the district.',
   'Renew with Delta at 1m statutory liability and 500k employment disputes.',
   'The trust carries health and safety duties as a PCBU and has no reserves to meet a fine or a defence cost.',
   'No other agency offered employment disputes at this size.',
   'Fines for reckless conduct are not insurable. Defence costs are.',
   'No advice on trustee indemnity beyond the statutory liability section.',
   174, true, 'Brokerage 20 percent plus a 200 dollar broker fee.', 171),
  ('Meridian Dental Ltd',                   'POL-20019', 'Priya Nair',  262, 'email',
   'Advice on the practice material damage and equipment breakdown.',
   'Two surgeries, chairs and an intraoral scanner replaced last year.',
   'Renew with Ando and add equipment breakdown at the full plant value.',
   'A chair out of service for a week costs more than the annual premium for the extension.',
   'Vero quoted without equipment breakdown.',
   'Theft cover requires the alarm to be set. It was not set at the last loss.',
   'No advice on professional indemnity, which the practice holds through its association.',
   262, true, 'Brokerage 20 percent plus a 150 dollar broker fee.', 260),
  ('Tui Orchards Ltd',                      'POL-20007', 'Priya Nair',  340, 'meeting',
   'Advice on the orchard programme including hail.',
   'Twenty two canopy hectares, two packhouse chillers, hail damage in two of the last five seasons.',
   'Renew with Rosser and keep the hail extension.',
   'Two hail events in five years. The extension has already paid for itself twice.',
   'The mainstream markets exclude hail on kiwifruit entirely.',
   'Hail is limited to structures and shelter. Fruit loss is on a declared basis.',
   'No advice on crop income protection.',
   340, true, 'Brokerage 22.5 percent plus a 300 dollar broker fee.', 338),
  ('Janet Whitmore',                        'POL-20021', 'Priya Nair',  254, 'phone',
   'Advice on home, contents and private motor.',
   'Owner occupied, jewellery collection valued in 2023, two vehicles.',
   'Renew contents at 180k with jewellery specified at 42k.',
   'Unspecified jewellery is capped at 2,500 an item. Four items are worth more than that.',
   '',
   'Items not specified are capped. A valuation older than three years may be challenged.',
   '',
   254, false, '', null),
  ('Rob and Alice Ngatai',                  'POL-20032', 'Hine Rawiri', 124, 'phone',
   'Advice on the lifestyle block programme.',
   'Ten hectares, dwelling, two sheds, two horses, no commercial activity.',
   'Place with Rosser on a lifestyle block wording.',
   'A standard house policy excludes the sheds and the horses.',
   '',
   'Horses are covered for accidental death only, not for illness.',
   '',
   null, false, '', null),
  ('Coastal Storage Ltd',                   'POL-20012', 'Priya Nair',  272, 'email',
   '',
   'Two hundred storage units, goods of others limit 250k, no losses.',
   'Renew with Ando as expiring.',
   'Rate held.',
   '',
   '',
   '',
   272, true, 'Brokerage 20 percent plus a 200 dollar broker fee.', null),
  ('Fern Ridge Vineyards Ltd',              'POL-20027', 'Hine Rawiri', 210, 'meeting',
   'Advice on the winery programme including stock in tank and frost.',
   'Barrel hall, crush pad, bottling line, peak stock in tank 5.2m in autumn.',
   'Renew with Rosser and endorse the peak season stock in tank for March to May.',
   'Stock in tank triples in autumn. A flat sum insured is either wasteful or short.',
   'Vero offered a flat declared value only.',
   'Frost is excluded on fruit on the vine. Only the structures and the stock are covered.',
   'No advice on crop insurance or on the cellar door liability.',
   210, true, 'Brokerage 22.5 percent plus a 400 dollar broker fee.', 208)
) as v(client, policy_no, broker, given, method, scope, needs, recommendation, reasons, alternatives, risks, limitations, disclosed_on, remuneration_disclosed, remuneration_note, confirmed)
on conflict do nothing;

-- Brokerage ledger ------------------------------------------------------------------
-- Earned when the policy was placed. Older than ninety days it has been reconciled,
-- between sixty five and ninety days it is still sitting there, newer than that it is
-- on the current statement.

insert into commissions (id, policy_id, client_id, insurer_id, kind, earned_on, period_month, amount_cents, gst_cents, status, invoice_ref, received_on, note)
select seed_uuid('commission:brokerage:' || p.policy_no), p.id, p.client_id, p.insurer_id, 'brokerage',
       coalesce(p.placed_on, p.inception_on),
       date_trunc('month', coalesce(p.placed_on, p.inception_on))::date,
       p.brokerage_cents, round(p.brokerage_cents * 0.15)::bigint,
       case
         when coalesce(p.placed_on, p.inception_on) < current_date - 90 then 'received'
         when coalesce(p.placed_on, p.inception_on) < current_date - 60 then 'accrued'
         else 'invoiced'
       end,
       'STM-' || to_char(coalesce(p.placed_on, p.inception_on), 'YYYYMM') || '-' || upper(substr(p.policy_no, 5, 5)),
       case when coalesce(p.placed_on, p.inception_on) < current_date - 90
            then coalesce(p.placed_on, p.inception_on) + 45 else null end,
       'Brokerage on ' || p.policy_no
from policies p
where p.brokerage_cents > 0
on conflict do nothing;

insert into commissions (id, policy_id, client_id, insurer_id, kind, earned_on, period_month, amount_cents, gst_cents, status, invoice_ref, received_on, note)
select seed_uuid('commission:fee:' || p.policy_no), p.id, p.client_id, p.insurer_id, 'broker fee',
       coalesce(p.placed_on, p.inception_on),
       date_trunc('month', coalesce(p.placed_on, p.inception_on))::date,
       p.broker_fee_cents, round(p.broker_fee_cents * 0.15)::bigint,
       case when coalesce(p.placed_on, p.inception_on) < current_date - 90 then 'received' else 'invoiced' end,
       'FEE-' || to_char(coalesce(p.placed_on, p.inception_on), 'YYYYMM') || '-' || upper(substr(p.policy_no, 5, 5)),
       case when coalesce(p.placed_on, p.inception_on) < current_date - 90
            then coalesce(p.placed_on, p.inception_on) + 30 else null end,
       'Broker fee on ' || p.policy_no
from policies p
where p.broker_fee_cents > 0
on conflict do nothing;

insert into commissions (id, policy_id, client_id, insurer_id, kind, earned_on, period_month, amount_cents, gst_cents, status, invoice_ref, received_on, note)
select seed_uuid('commission:endorsement:' || e.endorsement_no), e.policy_id, p.client_id, p.insurer_id, 'endorsement',
       e.confirmed_on, date_trunc('month', e.confirmed_on)::date,
       e.brokerage_adjustment_cents, round(e.brokerage_adjustment_cents * 0.15)::bigint,
       case when e.confirmed_on < current_date - 90 then 'received' else 'accrued' end,
       'END-' || to_char(e.confirmed_on, 'YYYYMM'),
       case when e.confirmed_on < current_date - 90 then e.confirmed_on + 40 else null end,
       'Brokerage on ' || e.endorsement_no
from endorsements e
join policies p on p.id = e.policy_id
where e.confirmed_on is not null and e.brokerage_adjustment_cents > 0
on conflict do nothing;

-- Complaints ---------------------------------------------------------------------------

insert into complaints (id, client_id, policy_id, claim_id, received_on, about, channel, status, acknowledged_on, last_update_on, resolved_on, outcome, broker_id)
select seed_uuid('complaint:' || v.ref), seed_uuid('client:' || v.client),
       case when v.policy_no = '' then null else seed_uuid('policy:' || v.policy_no) end,
       case when v.claim_no = '' then null else seed_uuid('claim:' || v.claim_no) end,
       current_date - v.received, v.about, v.channel, v.status,
       case when v.acknowledged is null then null else current_date - v.acknowledged end,
       case when v.last_update is null then null else current_date - v.last_update end,
       case when v.resolved is null then null else current_date - v.resolved end,
       nullif(v.outcome, ''), seed_uuid('broker:' || v.broker)
from (values
  ('C-2601', 'Harbourview Apartments Body Corporate', 'POL-20008', 'CLM-26004', 41, 'The committee says nobody has updated them on the water damage claim since the assessor attended.', 'email', 'investigating', 39, 22, null, '', 'Grant Milne'),
  ('C-2602', 'Meridian Dental Ltd',                   'POL-20019', 'CLM-26007', 240, 'Unhappy the theft claim was declined and says the alarm requirement was never explained.',        'phone', 'resolved',      238, 214, 212, 'Explained the alarm warranty and pointed to the advice record and the policy schedule. Client accepted the reason. Added an alarm reminder to the renewal checklist.', 'Grant Milne'),
  ('C-2603', 'Blue Duck Cafe Group Ltd',              'POL-20005', '',          12, 'Says the fourth site should already be on cover and it has taken too long.',                        'phone', 'open',          11,  9,   null, '', 'Priya Nair')
) as v(ref, client, policy_no, claim_no, received, about, channel, status, acknowledged, last_update, resolved, outcome, broker)
on conflict do nothing;

-- Client notes ---------------------------------------------------------------------------

insert into client_notes (id, client_id, policy_id, kind, happened_on, body, created_by)
select seed_uuid('note:' || v.client || ':' || v.seq), seed_uuid('client:' || v.client),
       case when v.policy_no = '' then null else seed_uuid('policy:' || v.policy_no) end,
       v.kind, current_date - v.days, v.body, v.created_by
from (values
  ('Kauri Joinery Ltd',                     1, 'POL-20001', 'call',    21,  'Dave confirmed the plant list. Spray booth report is with the fire engineer.',                 'Hine Rawiri'),
  ('Kauri Joinery Ltd',                     2, 'POL-20001', 'email',   9,   'Chased NZI for terms. Underwriter is waiting on the report.',                                  'Hine Rawiri'),
  ('Southern Cross Freight Ltd',            1, 'POL-20004', 'meeting', 9,   'Renewal review with Marcus. Two at fault claims discussed. He accepts a rate rise.',           'Hine Rawiri'),
  ('Southern Cross Freight Ltd',            2, '',          'call',    34,  'Notified the Rakaia collision.',                                                              'Tom Baxter'),
  ('Tui Orchards Ltd',                      1, 'POL-20007', 'call',    18,  'Rangi has the renewal terms and the hail claim offer. Deciding on both together.',            'Priya Nair'),
  ('Harbourview Apartments Body Corporate', 1, 'POL-20008', 'meeting', 14,  'Committee wants terms two weeks before the AGM. Water damage claim raised again.',            'Grant Milne'),
  ('Pemberton Legal Ltd',                   1, 'POL-20010', 'meeting', 30,  'Renewal presentation. Delta held the retroactive date, Chubb did not. Charlotte instructed.',  'Grant Milne'),
  ('Rangitoto Civil Ltd',                   1, 'POL-20013', 'call',    15,  'Wiremu says three sites are live that are not on the declaration yet.',                       'Hine Rawiri'),
  ('Blue Duck Cafe Group Ltd',              1, 'POL-20005', 'call',    9,   'Nadia unhappy the fourth site is not confirmed. Escalated to Ando.',                          'Priya Nair'),
  ('Whangarei Marine Services Ltd',         1, 'POL-20016', 'email',   64,  'Sent the vessel schedule for the renewal review.',                                            'Priya Nair'),
  ('Otago Dairy Partnership',               1, 'POL-20018', 'call',    44,  'Bruce confirmed the effluent upgrade is signed off by the council.',                          'Hine Rawiri'),
  ('Meridian Dental Ltd',                   1, 'POL-20019', 'email',   88,  'Sent the equipment breakdown explainer after the declined theft claim.',                      'Priya Nair'),
  ('Kirkwood Engineering Ltd',              1, 'POL-20023', 'call',    12,  'Tania sending the updated plant values this week.',                                           'Hine Rawiri'),
  ('Aotea Packaging Ltd',                   1, 'POL-20026', 'meeting', 210, 'Post loss review on the corrugator. Indemnity period may be short at 18 months.',             'Grant Milne'),
  ('Coastal Storage Ltd',                   1, 'POL-20012', 'email',   205, 'Sent the schedule. Jo has not replied.',                                                      'Priya Nair'),
  ('Fern Ridge Vineyards Ltd',              1, 'POL-20027', 'call',    27,  'Marc confirmed peak stock in tank at 5.2m for this autumn.',                                  'Hine Rawiri'),
  ('Janet Whitmore',                        1, 'POL-20020', 'email',   198, 'Sent the renewal invitation for the home policy. No reply.',                                   'Priya Nair'),
  ('Rob and Alice Ngatai',                  1, 'POL-20032', 'call',    124, 'Placed the lifestyle block cover. Explained the horse exclusion.',                            'Hine Rawiri'),
  ('Te Awa Health Trust',                   1, 'POL-20028', 'meeting', 34,  'Board asked about cyber after the sector alert. Quote requested from Delta.',                 'Grant Milne'),
  ('Delacourt Property Ltd',                1, 'POL-20030', 'email',   40,  'Sent the Vero remarket for comparison. Gwen wants one schedule per building.',                'Grant Milne'),
  ('Kauri Joinery Ltd',                     3, '',          'note',    120, 'Sarah asked about premium funding for next year.',                                            'Hine Rawiri'),
  ('Pemberton Legal Ltd',                   2, '',          'call',    3,   'Updated Charlotte on the conveyancing circumstance. No claim yet.',                           'Grant Milne'),
  ('Harbourview Apartments Body Corporate', 2, '',          'email',   22,  'Acknowledged the committee complaint about claim updates.',                                   'Grant Milne'),
  ('Southern Cross Freight Ltd',            3, '',          'call',    26,  'Told Marcus the assessor had been to the yard.',                                             'Tom Baxter'),
  ('Tui Orchards Ltd',                      2, '',          'call',    5,   'Rangi has the hail settlement offer and the adjuster report.',                                'Tom Baxter'),
  ('Rangitoto Civil Ltd',                   2, '',          'call',    7,   'Told Wiremu the storm claim is lodged with Vero.',                                           'Tom Baxter')
) as v(client, seq, policy_no, kind, days, body, created_by)
on conflict do nothing;
