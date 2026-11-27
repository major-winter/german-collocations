# Roadmap

Ranked by daily value per unit of work: what makes a learner come back
tomorrow, against what it costs to build and to run on the 1 GB / 1 CPU
VM. One line per candidate. Status: `idea`, `proposed`, `approved`,
`built`, `shipped` (with the decision number once logged). Keep it
short; drop what no longer ranks.

Last ranked: 2026-11-27 (product-builder, propose mode).

## Ranked

1. **"Passt das zusammen?" for adjective + noun** (*schwerer Regen* →
   Nicht typisch, *starker Regen*). The check (#70) is the app's
   differentiator and today answers only verb + noun; adjective + noun is
   the other classic interference error (*heavy rain*, *high chance*,
   *big costs*). Size **M**. Builds on #70 and the #54 data; no migration
   expected. Status: `approved` (2026-11-27, logDice rule), spec
   `docs/superpowers/specs/2026-11-27-adjective-noun-check-design.md`.
2. **Check results lead somewhere**: each suggestion in the check card
   opens that chip with its examples, and a verb the lab does not know
   (*Entscheidung trefen*) says "Verb nicht erkannt" instead of a plain
   search. Size **S**. Builds on #70 (UI audit, "left for later").
   Status: `idea`.
3. **Per-word page title and description** (`Entscheidung – typische
   Verbindungen | Wortnetz`), so a browser tab, the history and a shared
   link name the word. Size **S**. No dependency. Status: `idea`.
4. **Prepositional verb–noun check** (*an einer Sitzung teilnehmen*,
   *in Frage stellen*), from the lab's `obl` pairs. Size **M**. Builds on
   #70; needs contraction handling (*zur*, *im*). Status: `idea`.
5. **Long chip lists collapse on phones** ("mehr …" after the top 5).
   Size **S**. A ranking/UX call (UI audit, "left for later"). Status:
   `idea`.

## Gated (decision #71, baseline started 2026-11-27 under #72)

- **A1: browser-only saved list** ("Merken" on chips and check results,
  `/liste`, JSON backup, web app manifest). Size **L**. Gated: the A0
  baseline runs 2–4 weeks from 2026-11-27 (earliest 2026-12-11), then the
  user sets the A threshold from the `usage_counts` query in #72.
  Status: `idea`.
- **B: gap-fill practice on saved object pairs.** Size **L**. Gated by
  A1's measured repeat use. Status: `idea`.

## Shipped recently

- Verb–noun check "Passt das zusammen?" (#70).
- Usage baseline, Impressum and Datenschutz (#72).
