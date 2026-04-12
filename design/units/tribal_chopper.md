---
id: tribal_chopper
name: Tribal Chopper
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

**Bloodlust.** Whenever Tribal Chopper kills an enemy unit, it immediately
gains a bonus attack action. The execution order is: kill enemy → bonus attack
→ next enemy attacks Tribal Chopper → normal turn cycle resumes.

High-risk high-reward attacker. Synergizes with Folk tribe (which buffs from
deaths/sacrifices) — kills fuel attack chains, which can snowball if facing
low-health enemies.

## Rendering Notes

- Spawn: has `walk` — uses `walk` locomotion (12F) to enter the lineup slot
  from off-screen (per [README.md](README.md) spawn rules).
- Death: has `death` → eligible for the roster, plays `death` (16F) on KO.
- Melee (range 1) — charges into front-line combat, aggressive stance.
