# Portraits for the sticker album

The pistachio portraits are drawn with code, the way claywork's sprites are: small
drawing primitives (`canvas.py`), the faces built from traits (`faces.py`), and
`portraits.py`, which draws every sticker of a season. Randomness is seeded, so
every run gives the same pictures.

## Setup and run

You need [uv](https://docs.astral.sh/uv/) (`curl -LsSf https://astral.sh/uv/install.sh | sh`,
or `brew install uv`). It sets up Python and Pillow by itself on the first run.

```sh
cd tools/art
uv run portraits.py        # season one (s1)
uv run portraits.py s1     # the same, naming the season
```

This writes:

- `data/seasons/s1-portraits.json`: every sticker's 32x32 portrait (palette and
  rows), plus a `placeholder` for empty roster spots. It's committed, so building
  the page never needs Python.
- `tools/art/out/s1-sheet.png`: a contact sheet with every sticker, number and
  name. Always look at it: valid is not the same as good.

## Changing the faces

A sticker's look lives in `data/seasons/s1.json` (`face` and `addons`), so most
changes are edits there, then a rerun. New traits or add-ons go in `faces.py`
**and** in `TRAITS` / `ADDONS` in `src/album/album.ts`, which checks the season
file (`npm test` catches a mismatch).

Shirts are drawn with the digits 1 to 9 instead of colours; the page fills them
in with the team's kit (hoops for the Kernels, stripes for the Shells, reversed
for keepers), so one portrait works for both teams.
