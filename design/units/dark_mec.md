---
id: dark_mec
name: Dark Mech
faction: Robot
class: Tank
tier: 2
hp: 4
attack: 1
range: 1
---

## Sprite Source

AnimTester title: `DARK MEC`
Canvas: 32x39 px (5F GRID R8)

Small, compact mech sprite. Non-standard canvas size (32x39 is much smaller than
typical units), but loads cleanly without errors from Aseprite.

## Animations

From AnimTester readout (tag — frame count):

- dark mec — 7F (red, possibly a group/compound animation)
- walk — 6F
- att high — 5F (red)
- down — 6F
- attack low — 6F
- up — 4F
- hit — 2F
- death — 8F

## Abilities

**Reactive Armor.** Dark Mech has a **10% chance to negate all damage** when
attacked. This is a passive proc — on each hit received, roll 1d10; on a result
of 1 (10% chance), the damage is completely blocked. The blocked hit plays the
`hit` animation (2F) normally, but no HP is deducted.

Tier 2 tank unit. Moderate HP (4), low damage (1), but the evasion proc makes
him harder to burst down and rewards keeping him alive. Synergizes with comps
that value durability and proc-based mechanics (other random-trigger abilities).

## Rendering Notes

- **Spawn:** no explicit `appear`, `jump`, `fall`, `run`, or `walk` in standard
  names. Has `walk` (6F) which is a locomotion animation. Per CLAUDE.md spawn
  priority, may use `walk` as fallback entry (priority 3) if no higher-priority
  spawn anims are found.
- **Death:** has `death` (8F) → roster eligible, plays `death` animation on KO.
- **Attack animations:** `att high` (5F, red) and `attack low` (6F) — two attack
  states, suggesting high/low stance variants. Likely swaps between these; clarify
  which is primary or if they alternate.
- **Stance system:** `down` (6F), `up` (4F) — possible stance/posture states (low
  guard, high guard). May relate to the high/low attack variants.
- **Damage received:** `hit` (2F) — brief feedback when taking damage. Plays even
  when Reactive Armor procs (visual feedback without HP loss).
- **Red-flagged entries:** `dark mec` (group indicator), `att high` — review
  once sprite is finalized.
