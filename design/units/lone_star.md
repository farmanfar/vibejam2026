---
id: lone_star
name: Lone Star
faction: Folk
class: Knight
tier: 2
hp: 3
attack: 1
range: 2
---

## Sprite Source

AnimTester title: `STRANDED HERO 04`
Heuristic label: `ASEPRITE` (canvas metadata error: 192x192 canvas did not divide correctly for sprite pack)
Canvas: 64x65 px

## Animations

**STATUS: ALL BROKEN — marked with "R" prefix, need reprocessing**

From AnimTester readout (tag — frame count):

- move — 8F (broken)
- run — 8F (broken)
- roll — 6F (broken)
- slash — 5F (broken)
- chop — 4F (broken)

> All animations flagged with "R" prefix in AnimTester. Canvas packing issue
> noted in heuristic metadata (192x192 canvas did not divide correctly).
> Entire sprite requires reprocessing before use.

## Abilities

Ranged support attacker. Low damage (1 attack) but range 2 lets it position
safely behind the front line. Folk faction synergy pending — mechanics TBD
until sprite issues resolved.

## Rendering Notes

- Spawn: has `move` and `run` → uses `move` (8F) as primary locomotion, falls
  back to `run` if needed (per [README.md](README.md) spawn rules).
- Death: not visible in animation list — **death animation is missing**.
  Sprite cannot be used until a `death` anim is added.
- Melee/ranged hybrid: `slash` and `chop` suggest close-range interactions,
  but range 2 stat indicates ranged positioning. Rendering approach TBD.
