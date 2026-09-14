---
description: Write the record of advice: what was recommended, why it is suitable, what else was considered, what was disclosed and when. The record a regulator asks for and a claim dispute turns on.
---

The operator will say "write up the Pemberton renewal advice" or "record what I told them".

1. Read the client and the quotes first: `client "<name>"` and `policy <number>`. The alternatives you list have to be the quotes that are actually on file.
2. Ask for anything you do not have. Never invent a reason, an alternative or a disclosure. If the operator cannot say why the recommendation is suitable, that is the finding, not a gap to fill.
3. Write it:
```
npm run broking -- advice-record add "<client>" --policy=<policy> \
  --scope="what this advice covers and what it does not" \
  --recommendation="what you told them to do" \
  --reasons="why it is suitable for this client's circumstances" \
  --needs="their situation, exposures and what they told you they need" \
  --alternatives="the other markets and terms considered, and why not" \
  --risks="the risks, exclusions and limits you told them about" \
  --limitations="what you did not advise on" \
  --remuneration="17.5 percent of base premium plus a 250 dollar broker fee"
```
4. Each field maps to a rule. Say which one when you ask for it:
   - **scope and limitations** are section 431J of the Financial Markets Conduct Act 2013 and standard 4 of the Code of Professional Conduct for Financial Advice Services: reasonable steps so the client understands the nature and scope of the advice, including its limits.
   - **reasons** are standard 3: reasonable grounds for the advice.
   - **alternatives** are how you show the recommendation was a choice, not the only market you called.
   - **remuneration** is clause 6.1 of the Insurance Brokers Code of Practice: disclose what you earn to individuals and small business, at the same time and by the same means as the advice.
5. `npm run broking -- advice [--client=]` lists the records and marks the gaps. `advice-record <id>` prints one in full.
6. After writing, tell the operator which gaps a reviewer would still find.

The record is written at the time the advice is given, not reconstructed later. If it is being written after the fact, say so in the reasons field.
