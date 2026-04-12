---
id: dagger_mush
name: Robo Dagger
faction: Robot
class: Assassin
tier: 2
hp: 4
attack: 1
range: 1
---

## Sprite Source

AnimTester title: `DAGGER MUSH`
Canvas: 144x80 px (VERT)

**STATUS: BUGGED** — canvas dimensions (144x80) do not conform to standard grid
(192x192); tag-derived frame fallback applied. Error noted: `ASEPRITE CANVAS
192X192 DID NOT DIVIDE AIR ATTACK.PNG USED TAG-DERIVE`.

## Animations

From AnimTester readout (tag — frame count):

- air attack — NF (red-flagged; frame count unclear from screenshot; see error)
- death — 12F
- attacks — 10F
- run — 8F
- throw — 7F
- run fast — 6F
- idle — 5F
- all — 2F
- damaged — 2F

## Abilities

**Ricochet Volley.** When Robo Dagger becomes the active fighter (enters combat
at the front of the lineup), she immediately throws a dagger at the **last
(backmost) enemy** in the opposing row, dealing **1 damage** using the `air attack`
animation. This is a startup ability — automatic on entry, no cost, guaranteed
chip damage to the back row.

After the opening volley, Robo Dagger fights normally using the `throw` animation
(7F) for regular attacks, dealing her base 1 damage per hit to the targeted enemy.

Tier 2 ranged poke unit. Low HP (4), low damage (1), but the startup back-row
damage makes her useful for whittling down high-priority targets (supports, mages)
before engaging the frontline. Synergizes with comps that benefit from persistent
chip damage or back-row pressure.

## Rendering Notes

- **Spawn:** animations unclear from screenshot (top entry is red-flagged and
  hard to read). Likely uses standard spawn priority once clarity is achieved
  (check for `appear` → `jump`/`fall` → `run`/`walk`/`idle`).
- **Death:** has `death` (12F) → roster eligible, plays `death` animation on KO.
- **Startup ability:** uses `air attack` animation (frame count TBD) to trigger
  the ricochet volley at back-row target on entry. This plays immediately before
  normal combat begins.
- **Attack animation:** uses `throw` (7F) for regular attacks. Render as a
  throwing-dagger motion hitting the targeted enemy.
- **Mobility:** `run` (8F), `run fast` (6F) — possibly a sprint/charge state.
- **Damage feedback:** `damaged` (2F) — brief hit animation when taking damage.
- **Red-flagged entry:** top animation (possibly `air attack`) is hard to read in
  screenshot; needs clarification once sprite is finalized.
