# Gacha maths

How packs are drawn and what that means for players and revenue. The album
itself (files, schemas, saved state) is in [album.md](album.md). Every number
here can be checked with `node src/cli.ts album simulate` and the Lab tab.

## The targets

- **Spend:** a typical player spends $10–20 a season on about 20 packs, so a
  pack costs **$0.50–1.00**.
- **Feel:** after those 20 packs the album should be **about 70–80% full**:
  close enough to keep going, far enough to want more packs (or, later, trades).
- **Completing** takes many more packs and is driven by the legendaries.

## How a pack is drawn

Every sticker in a pack is drawn on its own, in two steps:

1. A tier, by the rates: common 80%, rare 17%, legendary 3%.
2. A sticker of that tier, every sticker of the tier with the same chance.

So on one draw, the chance of one particular sticker is:

| Tier | Stickers | Rate | Chance of one particular sticker |
|---|---|---|---|
| Common | 32 | 80% | 0.80 ÷ 32 = **2.5%** |
| Rare | 12 | 17% | 0.17 ÷ 12 ≈ **1.4%** |
| Legendary | 6 | 3% | 0.03 ÷ 6 = **0.5%** |

Draws are independent, so:

- a pack can hold the same sticker twice;
- nothing guarantees a rare: a pack of 4 has no rare or legendary 0.8⁴ ≈ **41%**
  of the time, and at least one legendary 1 − 0.97⁴ ≈ **11.5%** of the time;
- on average a pack holds 3.2 commons, 0.68 rares and 0.12 legendaries.

Real Panini packs usually avoid duplicates within a pack, and many gacha games
guarantee a rare per pack. Both would be small changes in `openPack`
(`src/album/album.ts`) if we want that feel; neither is in yet.

### Seeds

Packs come from the engine's seeded generator (`src/engine/rng.ts`), whose state
is saved in the album and moves on with every sticker (two numbers each: one for
the tier, one for the sticker). The same seed and settings always give the same
packs in the same order; opening 20 at once in the Lab gives the same stickers as
20 one by one. Changing the stickers per pack or the rates part of the way
through changes every pack after that.

For real money, packs must be rolled on a server with a seed the player never
sees: anything rolled or stored in the browser can be replayed or edited.

## The formulas

With **N** stickers in a tier and **d** draws of that tier, the expected number
of different stickers collected is

    N × (1 − (1 − 1/N)^d)

where d = packs × stickers a pack × the tier's rate. Collecting all N of a tier
takes on average **N × H(N)** draws of it (H(N) = 1 + 1/2 + … + 1/N, about
ln N + 0.58): the coupon collector's problem. A whole album takes longer than
its slowest tier, because all tiers have to finish; the simulation gives that.

## Season one: 50 stickers (32 / 12 / 6), 4 a pack

Expected stickers collected:

| Packs | Commons (of 32) | Rares (of 12) | Legendaries (of 6) | All (of 50) |
|---|---|---|---|---|
| 10 | 20.4 | 5.4 | 1.2 | 27.0 (54%) |
| **20** | **27.8** | **8.3** | **2.1** | **38.3 (77%)** |
| 40 | 31.5 | 10.9 | 3.5 | 45.8 (92%) |
| 60 | 31.9 | 11.7 | 4.4 | 48.0 (96%) |

Simulated, 1,000 players after 20 packs: mean 37.9, 10% of players below 35,
10% above 41, nobody complete. That's 80 stickers for about 38 different ones,
so about 42 duplicates each.

Packs to complete, on average:

| | Draws needed | Packs |
|---|---|---|
| All commons | 32 × H(32) ≈ 130 | 41 |
| All rares | 12 × H(12) ≈ 37 | 55 |
| All legendaries | 6 × H(6) ≈ 14.7 | 123 |
| **The whole album** (2,000 players simulated) | | **mean 127, median 113** (10% of players within 66, 10% need over 205) |

### With 5 stickers a pack

| Packs | All (of 50) |
|---|---|
| 10 | 30.7 (61%) |
| 20 | 41.3 (83%) |
| 40 | 47.2 (94%) |

The whole album: mean 102 packs, median 91. Five a pack fills the album faster
than the 70–80% target after 20 packs, so season one uses four.

## Revenue

| | Packs | At $0.50 a pack | At $1.00 a pack |
|---|---|---|---|
| Typical player | 20 | $10 | $20 |
| Completing alone (median) | 113 | $57 | $113 |
| Completing alone (unlucky 10%) | 205+ | $103+ | $205+ |

Completing alone is a whale's path, and the last legendaries are the whole cost.
Ways to soften it, none built yet:

- **Pity:** a legendary guaranteed after N packs without one.
- **Duplicate exchange:** for example 10 duplicates for any missing sticker.
- **Trading** between players.

## Tuning

- Harder: more stickers in a tier, lower rates for rare and legendary.
- Easier: more stickers a pack (moves completion more than any price change), or
  fewer stickers.
- Check a change with `node src/cli.ts album simulate --packs 20 --cards 4`, or in
  the Lab tab against your own album.

## Before charging money

Publish the drop rates. In Germany, paid random items count towards USK age
ratings; Belgium treats paid loot boxes as gambling, so they are effectively
banned there. Check the current rules for every market before launch.

## Earlier design: 66 stickers, 5 a pack

The first sketch had 6 teams × 11 players = 66 stickers (44 / 16 / 6) at 5 a
pack: about 50 different stickers (76%) after 20 packs, with legendaries taking
about 98 packs to complete. Season one went to 50 stickers at 4 a pack for the
same feel.
