# Balance Report

**Total battles:** ~85,100  |  **Duration:** 0.1min  |  **Seed base:** 0  |  **Pool:** 27 units

## Outlier units (avg win rate across all matchups, ±10% threshold)

| Unit | Tier | Class | Faction | Avg WR vs All | |
|---|---|---|---|---|---|
| archer_bandit | 4 | Assassin | Folk | 0.0% | ← under |
| minion_001 | 1 | Grunt | Robot | 3.7% | ← under |
| minion_002 | 1 | Grunt | Robot | 3.7% | ← under |
| minion_003 | 2 | Grunt | Robot | 3.7% | ← under |
| starter_warrior | 1 | Grunt | Folk | 3.7% | ← under |
| valiant | 1 | Knight | Folk | 7.2% | ← under |
| gnat | 1 | Assassin | Monster | 8.8% | ← under |
| snipper | 1 | Assassin | Monster | 8.8% | ← under |
| blaster_bot | 1 | Gunner | Robot | 10.8% | ← under |
| blood_king | 4 | Ancient | Folk | 81.0% | ← over |

## Synergy deltas (themed vs mixed control, side-swapped)

| Theme | Win Rate | Delta | Samples | |
|---|---|---|---|---|
| class:Ancient | 98.0% | 48.0 | 200 | ← flagged |
| class:Assassin | 31.5% | -18.5 | 200 | ← flagged |
| class:Knight | 96.0% | 46.0 | 200 | ← flagged |
| class:Gunner | 67.5% | 17.5 | 200 | ← flagged |
| class:Tank | 40.5% | -9.5 | 200 |  |
| class:Grunt | 69.0% | 19.0 | 200 | ← flagged |
| class:Berserker | 71.5% | 21.5 | 200 | ← flagged |
| faction:Robot | 70.5% | 20.5 | 200 | ← flagged |
| faction:Folk | 62.0% | 12.0 | 200 | ← flagged |
| faction:Monster | 17.0% | -33.0 | 200 | ← flagged |

## Merchant favor impact

| Merchant | Favor | WR with | WR without | Delta |
|---|---|---|---|---|
| Wandering Trader | faction:Robot | 45.5% | 44.5% | 1.0 |
| Skull Trader | faction:Monster | 49.5% | 46.8% | 2.8 |
| Fruit Vendor | faction:Folk | 49.0% | 47.8% | 1.3 |
| Bread Vendor | class:Knight | 56.3% | 43.0% | 13.3 |
| Fortune Teller | class:Ancient | 54.8% | 47.0% | 7.8 |
| Mushroom Dealer | class:Assassin | 44.5% | 42.5% | 2.0 |

## Files

- [unit-stats.csv](./unit-stats.csv)
- [unit-matchup-matrix.csv](./unit-matchup-matrix.csv)
- [class-synergy-report.md](./class-synergy-report.md)
- [faction-synergy-report.md](./faction-synergy-report.md)
- [merchant-impact-report.md](./merchant-impact-report.md)
- [raw-runs.jsonl](./raw-runs.jsonl) — matchup-matrix only