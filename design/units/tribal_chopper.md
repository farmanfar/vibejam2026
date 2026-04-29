---
id: tribal_chopper
name: Chopper
faction: Folk
class: Berserker
tier: 2
hp: 2
attack: 3
range: 1
---

## Sprite Source

AnimTester title: `TRIBE WARRIOR`
Heuristic label: `TRIBE WARRIOR` (green ASEPRITE tag)
Canvas: 62x63 px

## Animations

From AnimTester readout (tag — frame count):

- tribe_warrior — 16F (heuristic)
- death — 16F
- walk — 12F
- attack — 11F
- idle — 6F

> Directional variants (walk_down/up, attack_down/up, idle_down/up) exist in
> source (top-down sprite design) but are not used. Using base animations only.

## Abilities

**Bloodlust.** Whenever Tribal Chopper kills an enemy with a **regular
attack action**, she immediately takes one bonus attack against the next
frontmost enemy. The bonus attack does NOT chain: a kill from the bonus
attack does not grant another bonus. Only kills from regular attack actions
trigger Bloodlust. On her next regular action, another kill triggers a
fresh bonus (bonuses are per-regular-action, not per-battle).

Execution order: regular attack → kill → bonus attack (single, no chain) →
next unit in slot order takes its action.

High-risk high-reward attacker. Synergizes with Folk tribe (which buffs
from deaths/sacrifices) — kills fuel attack chains, which can snowball
against low-HP frontlines, but the no-chain rule prevents runaway loops.

## Rendering Notes

- Spawn: has `walk` — uses `walk` locomotion (12F) to enter the lineup slot
  from off-screen (per [README.md](README.md) spawn rules).
- Death: has `death` → eligible for the roster, plays `death` (16F) on KO.
- Melee (range 1) — charges into front-line combat, aggressive stance.
