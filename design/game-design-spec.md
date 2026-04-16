# Hired Swords — Game Design Spec

Locked in via grill session 2026-04-11. SAP economy baseline, differentiated through commanders, merchant types, and Underlords-style dual-tag system.

## Economy (SAP Baseline)

- **10 credits/round**, flat, no win/loss variance
- **Reroll:** 1 credit per reroll
- **Sell-back:** Flat 1 credit refund via merchant drag-to-sell zone
- **Loss penalty:** None — losses only cost strikes, not credits
- **Bonus income:** Some units generate bonus credits (unit ability). Some faction synergies also generate credits.
- **Currency:** "credits" everywhere. Code rename from `gold` pending.

## Team & Bench

- **5 slots open from stage 1** — fill the bench early, upgrade later (SAP-style)
- **No permadeath** — team persists between rounds intact
- **Full HP heal** every round — each round is a fresh fight

## Run Structure

- **Dynamic length:** Play rounds until 9 wins or 3 losses
- Minimum run: 9 rounds (perfect). Maximum: 11 rounds (9W-2L or similar).
- **3 strikes** elimination — simple, no partial-strike mechanics

## Star Levels

- **TFT duplicate combine:** 2 copies of same unit -> 2-star. 2x 2-star copies -> 3-star (4 copies total).
- **Stat bonus:** +1 HP / +1 ATK per star level (SAP flat scaling)
  - 1-star: base stats
  - 2-star: base + 1 HP, + 1 ATK
  - 3-star: base + 2 HP, + 2 ATK
- **Legendaries:** Cut for now. Can revisit after star system is stable.

## Unit Pool

- **Shrink to ~40-50 units** from current 98
- **Even faction distribution:** ~8-10 units per faction, spread across all tiers
- **5 factions:** Robot, Undead, Beast, Fantasy, Tribal
- **4-5 classes** (second tag axis, Underlords-style): e.g., Warrior, Mage, Ranger, Tank, Support
- Every unit has exactly one faction AND one class

## Synergies

### Faction Synergies (stat bonuses)
Thresholds at 2, 3, 4 units. Highest met threshold wins (no stacking).
- Robot: HP-focused
- Undead: ATK-focused
- Beast: Pure HP
- Fantasy: Balanced HP/ATK
- Tribal: Mixed ATK/HP

### Class Synergies (mechanical effects)
Thresholds at 2, 3, 4 units. Grant abilities, not just stats:
- **Warrior:** Armor (damage reduction)
- **Mage:** Splash damage
- **Ranger:** Double attack
- **Tank:** Taunt (absorb hits for back-line)
- **Support:** Heal allies

Exact class names and effects TBD during implementation planning.

### Threshold Floor
Commander synergy reduction never drops a threshold below 2. You always need at least 2 units to activate any synergy.

## Commanders

- **Random assignment** at run start
- **Each commander is unique** — not just stat sticks
- **Baseline ability:** Reduce synergy thresholds for specific faction/class (but never below 2)
- **Advanced commanders** may have entirely different mechanics (TBD)
- **Swap mechanic:** Every 3 wins, a merchant offers a different commander for 10 credits. Accept = lose current commander, gain new one. Decline = keep current.

## Merchants

- **Random each round**, merchant type weighted by player's current team composition
- **Mechanical effect:** Influences unit pool/odds in the shop (soft seeding — no hard guarantee of specific units)
- **Likelihood influenced by** player's units and active commander
- Merchant types TBD during implementation (e.g., Beast Merchant biases toward Beast units, Discount Merchant has cheaper rerolls, etc.)

## Battle System

- **Sequential front-to-front** (current system, keep it)
- **Add trigger abilities:** on-attack, on-hurt, on-faint, start-of-battle (SAP-style)
- **Position in line matters** — front units fight first, back units survive longer
- **Max 50 turns** per battle (prevents infinite loops)

## Shop

- **4 cards per roll** (keep current)
- **Tier gating by stage** (keep current ramp: stages 1-2 cap T1, 3-4 cap T2, etc.)
- **Combining:** Buying a duplicate of a unit you own auto-merges into higher star level (no extra bench slot consumed)
- **Shop phase = safe zone:** Sell via drag-to-merchant zone (1 credit flat), team management, rerolling — all before clicking Fight

## What's NOT In Scope (Yet)

- Legendary boss cards (cut for now)
- Interest mechanic (no bonus for saving credits)
- Win/loss streak bonuses
- Player-driven shop leveling (tier access stays stage-gated)
- Team size scaling (always 5 from stage 1)
- Settings scene (stub remains)
