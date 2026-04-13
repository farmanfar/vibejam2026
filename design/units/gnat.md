---
id: gnat
name: Gnat
faction: Monster
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

**Infectious Bite (unique unit ability, interacts with Assassin class
poison).** Gnat is an Assassin, so her Assassin class mechanic normally
applies 1 poison stack per attack. Infectious Bite modifies that: on each
regular attack action, Gnat rolls a 50% chance. On proc, she applies **5
poison stacks** to the target instead of the class default of 1. On miss,
she applies the class default 1 stack. The proc **replaces** the class 1
stack — the two do not double-dip (a proc is 5, not 5+1).

Poison stacks on a unit cap at 5, so a successful proc against an
unpoisoned target fully loads them in one hit.

> **Faction reframe:** Gnat is a Monster (previously Big Bug in earlier
> drafts). She participates in Monster faction reanimate like any other
> Monster.

High-risk assassin: fragile (1 HP) but can rapidly contaminate priority
targets with full poison load if lucky. Synergizes with poison-bounce
mechanics (Toxic Cascade global rule, which bounces her 5-stack loads
through the enemy team on death).

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
