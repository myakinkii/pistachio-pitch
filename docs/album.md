# The sticker album

A season is a Panini-style album: a fixed set of numbered stickers, opened in
free packs (for now). Every sticker is a pistachio with its own look; owning it
fills its slot, and lets you put it in your roster. Nothing in the album changes
how matches play: no rules version or squad data changes.

- `data/seasons/s1.json`: the season, edited by hand.
- `data/seasons/s1-portraits.json`: the portraits, generated (see `tools/art/`).
- `src/album/`: the logic as pure functions (no dependencies, seeded like the engine).
- `web/src/lib/album.ts` and `AlbumDialog.vue`, `StickerCard.vue`: the page.
  Open it with the button under Display, the `A` key, or `#album` in the address.
- `node src/cli.ts album simulate [--packs 20] [--players 1000] [--cards 4]`: odds.

## Season one

50 stickers: 32 commons (a face), 12 rares (a face with an add-on drawn in, and
an unlock) and 6 legendaries (a face with add-ons, and a perk). Every sticker
also has an archetype (see "Builds and the budget" below). Packs hold 4
stickers; each is common, rare or legendary at 80/17/3, then any sticker of that
tier with equal chance. After 20 packs a player has about 38 stickers (76%); a
full album takes about 120 packs. The maths, tables and revenue figures are in
[gacha.md](gacha.md). Perks are text for now: what they do comes with the engine.

## Builds and the budget

A team has one pool of points. The formation's templates (`data/builds.json`)
spend 18 a player, 198 for eleven; season one's pool is **208** (`squad.pool` in
the season file), so there are 10 points to spend on better cards.

A sticker's `build` is an **archetype**: a suggested way to spend points on his
position (a sweeper keeper, a ball-playing centre-back, a false nine). Put him
on a spot of that position and the Roster tab can use his build instead of the
template. His build only fits his own position; anywhere else he plays the
template.

- **Commons** spend exactly 18: a different shape, the same cost.
- **Rares** spend 19 or 20, and their unlock lets one stat go up to 6 for 1 more
  point. The unlock belongs to the spot the card is on, and moves with the card.
- **Legendaries** spend 20 or 21 (still 5 at most) and bring a perk, which costs
  2 more points to apply (with his build or the template).

On a fitting spot, with build (and unlock or perk) in use, a rare costs 2 or 3
points over the template and a legendary 4 or 5. Putting every rare and
legendary a player owns on a fitting spot of a formation costs over 198:

| | Extra points (median) | Most players |
|---|---|---|
| After 20 packs | +18 | +12 to +24 |
| After 40 packs | +24 | +19 to +30 |
| The full album | +31 to +35 (9 or 10 premium spots) | |

With 10 points over the templates, a typical player can field about half of
their premium options, so choosing which ones still matters. Raise
`squad.pool` and the choice fades; lower it and premium cards get rarer on the
pitch.

So better cards don't give free stats: they cost more of the pool, and the
squad can go over budget. The Roster tab shows what's spent and left, negative
included ("fix before playing"); fixing it, by editing stats by hand, comes with
the engine side. The maths is `squadBudget()` in `src/album/album.ts`, so the
engine and match files can use the same rules later.

## Season file

```json
{
  "season": "s1", "title": "Season One",
  "squad": { "pool": 208 },
  "pack": { "cards": 4, "rates": { "common": 0.8, "rare": 0.17, "legendary": 0.03 } },
  "stickers": [
    { "no": 1, "id": "s1-001", "tier": "common", "kind": "face", "name": "Shelldon Roast", "pos": "GK",
      "style": "Shot-stopper", "build": { "pac": 2, "sho": 1, "pas": 3, "dri": 1, "def": 2, "phy": 4, "kee": 5 },
      "face": { "hair": "shiny", "facial": "moustache", "mouth": "smirk" } },
    { "no": 33, "id": "s1-033", "tier": "rare", "kind": "face", "name": "Mags Mittens", "pos": "GK",
      "style": "Reflex keeper", "build": { "pac": 2, "sho": 1, "pas": 3, "dri": 1, "def": 2, "phy": 4, "kee": 6 },
      "face": { "...": "..." }, "addons": ["specs"],
      "bonus": { "type": "unlock", "what": "cap", "max": 6, "cost": 1, "text": "Unlock: one stat up to 6, for 1 point" } },
    { "no": 45, "id": "s1-045", "tier": "legendary", "kind": "face", "name": "Captain Husk", "pos": "CB",
      "face": { "...": "..." }, "addons": ["armband"],
      "bonus": { "type": "perk", "name": "Iron Husk", "text": "…", "cost": 2 } }
  ]
}
```

- `no` and `id` are unique; `tier` is `common`, `rare` or `legendary`; `pos` is a
  build from `data/builds.json`.
- `style` and `build`: the archetype's name and stats (`pac sho pas dri def phy
  kee`; `kee` is 0 except for keepers). Stats are 1 to 5, or up to the unlock's
  `max` for one stat of a rare. A common's add up to 18; others' at least 18.
  The sticker shows them, marked ▲▼ where they differ from the template.
- `face` traits (all optional): `shell`, `crack`, `eyes`, `brows`, `mouth`,
  `hair`, `hairColor`, `facial`, `marks` (a list), `salted` (true or false). The
  values are listed in `TRAITS` in `src/album/album.ts`.
- `addons`: drawn into the portrait (`goggles`, `specs`, `shades`, `sweatband`,
  `plaster`, `armband`, `earring`).
- `bonus`: `{type: "unlock", what: "cap", max, cost, text}` (rares) or
  `{type: "perk", name, text, cost}` (legendaries); `cost` is in points.
- `squad.pool`: the team's points for the roster (198 if left out).
- Planned, accepted by the loader but not used yet: add-on stickers,
  `{"kind": "addon", "addon": "goggles", ...}`, to put on any rostered pistachio.

## Saved album

In localStorage under `pp-album-s1`, checked when the page loads (unknown
stickers are dropped, roster spots must hold owned stickers):

```json
{ "v": 1, "season": "s1", "seed": "k3x9qa", "rng": 123456789, "packs": 21,
  "owned": { "s1-001": 3, "s1-033": 1 },
  "roster": { "team": "K", "formation": "4-4-2", "spots": ["s1-001", null, "…"], "builds": [true, false, "…"], "perks": [false, "…"] },
  "settings": { "cards": 4, "rates": { "common": 0.8, "rare": 0.17, "legendary": 0.03 } } }
```

`builds` and `perks` say which spots use their sticker's build instead of the
template, and apply his perk (albums saved before they existed read as all `false`). `rng` is the generator's state: the same seed and settings always give the same
packs. The Lab tab can change the settings, open many packs at once, and start
over with a chosen seed.
