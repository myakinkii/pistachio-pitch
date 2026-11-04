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
an extra slot) and 6 legendaries (a face with add-ons, and a perk). Packs hold 4
stickers; each is common, rare or legendary at 80/17/3, then any sticker of that
tier with equal chance. After 20 packs a player has about 38 stickers (76%); a
full album takes about 120 packs. The maths, tables and revenue figures are in
[gacha.md](gacha.md). Slots and perks are text for now; perk costs
are `null` until the engine decides them.

## Season file

```json
{
  "season": "s1", "title": "Season One",
  "pack": { "cards": 4, "rates": { "common": 0.8, "rare": 0.17, "legendary": 0.03 } },
  "stickers": [
    { "no": 1, "id": "s1-001", "tier": "common", "kind": "face", "name": "Shelldon Roast", "pos": "GK",
      "face": { "hair": "shiny", "facial": "moustache", "mouth": "smirk" } },
    { "no": 33, "id": "s1-033", "tier": "rare", "kind": "face", "name": "Mags Mittens", "pos": "GK",
      "face": { "...": "..." }, "addons": ["specs"],
      "bonus": { "type": "slot", "line": "keeper", "text": "Extra keeper slot" } },
    { "no": 45, "id": "s1-045", "tier": "legendary", "kind": "face", "name": "Captain Husk", "pos": "CB",
      "face": { "...": "..." }, "addons": ["armband"],
      "bonus": { "type": "perk", "name": "Iron Husk", "text": "…", "cost": null } }
  ]
}
```

- `no` and `id` are unique; `tier` is `common`, `rare` or `legendary`; `pos` is a
  build from `data/builds.json`, and the sticker shows that build's stats.
- `face` traits (all optional): `shell`, `crack`, `eyes`, `brows`, `mouth`,
  `hair`, `hairColor`, `facial`, `marks` (a list), `salted` (true or false). The
  values are listed in `TRAITS` in `src/album/album.ts`.
- `addons`: drawn into the portrait (`goggles`, `specs`, `shades`, `sweatband`,
  `plaster`, `armband`, `earring`).
- `bonus`: `{type: "slot", line, text}` or `{type: "perk", name, text, cost}`.
- Planned, accepted by the loader but not used yet: add-on stickers,
  `{"kind": "addon", "addon": "goggles", ...}`, to put on any rostered pistachio.

## Saved album

In localStorage under `pp-album-s1`, checked when the page loads (unknown
stickers are dropped, roster spots must hold owned stickers):

```json
{ "v": 1, "season": "s1", "seed": "k3x9qa", "rng": 123456789, "packs": 21,
  "owned": { "s1-001": 3, "s1-033": 1 },
  "roster": { "team": "K", "formation": "4-4-2", "spots": ["s1-001", null, "…"] },
  "settings": { "cards": 4, "rates": { "common": 0.8, "rare": 0.17, "legendary": 0.03 } } }
```

`rng` is the generator's state: the same seed and settings always give the same
packs. The Lab tab can change the settings, open many packs at once, and start
over with a chosen seed.
