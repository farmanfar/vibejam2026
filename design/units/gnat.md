---
id: gnat
name: Gnat
faction: Big Bug
class: Assassin
tier: 1
hp: 1
attack: 1
range: 1
---

## Sprite Source

AnimTester title: `SMALL BUG`
Heuristic label: (top entry, partially cut off in red; appears to be ~12F)
Canvas: 20x28 px

## Animations

From AnimTester readout (tag — frame count):

- (heuristic, cut off) — 12F (likely death; top entry obscured)
- attack — 6F
- idle_move — 4F

> Top animation label is cut off; likely death based on frame count and red
> selection highlight. Verify label when screenshot is clarified.
> `idle_move` tag may be combined animation or display artifact.

## Abilities

**Infectious Bite.** On each attack, Gnat has a 50% chance to instantly
apply the maximum poison stack (5 stacks) to the target, bypassing the
normal 1-per-hit accumulation. Synergizes with poison-bounce mechanics
(Bloat Flyer's cascade, poison-triggered effects).

High-risk assassin: fragile (1 HP) but can rapidly contaminate priority
targets with full poison load if lucky.

## Rendering Notes

- Spawn: has `idle_move` — unclear if this is locomotion or resting state.
  Uses available animation to enter the lineup slot (per
  [README.md](README.md) spawn rules).
- Death: likely has `death` (12F top entry) → eligible for the roster.
  Confirm animation label when screenshot is clarified.
- Poison proc: on 50% RNG hit, animate poison application to target
  (visual indicator for 5-stack instant application, distinct from
  1-per-hit visual if present).
- Melee (range 1) — swarm attacker, low cost, high variance.
