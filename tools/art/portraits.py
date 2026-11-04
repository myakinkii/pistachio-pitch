# portraits.py: draw every sticker of a season into data/seasons/<season>-portraits.json,
# plus a contact sheet in out/ to look at. Run from this folder: uv run portraits.py [s1]
import json, os, sys
from PIL import Image, ImageDraw
from faces import draw, TRAITS, ADDONS

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, '..', '..', 'data', 'seasons')
KIT = {'1': '#9fcb3a', '2': '#7fa82c', '3': '#9c2e6b', '4': '#7d2556', '5': '#9fcb3a', '6': '#7fa82c',
       '7': '#9c2e6b', '8': '#7d2556', '9': '#9c2e6b'}   # Kernels, for the preview only
TIER_BG = {'common': (52, 60, 46), 'rare': (40, 56, 92), 'legendary': (96, 70, 24)}
PLACEHOLDER = {'hair': 'bald', 'eyes': 'dots', 'mouth': 'flat', 'crack': 'none'}


def check(s):
    f = s.get('face', {})
    for k, v in f.items():
        if k == 'salted':
            continue
        allowed = TRAITS.get(k)
        vals = v if k == 'marks' else [v]
        if allowed is None or any(x not in allowed for x in vals):
            raise SystemExit(f"{s['id']}: unknown trait {k}={v}")
    for a in s.get('addons', []):
        if a not in ADDONS:
            raise SystemExit(f"{s['id']}: unknown add-on {a}")


def render(rows, pal, scale, bg):
    img = Image.new('RGB', (32 * scale, 32 * scale), bg)
    full = {**pal, **KIT}
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch in full:
                col = tuple(int(full[ch][i:i + 2], 16) for i in (1, 3, 5))
                img.paste(col, (x * scale, y * scale, (x + 1) * scale, (y + 1) * scale))
    return img


def main(season='s1'):
    src = json.load(open(os.path.join(DATA, f'{season}.json')))
    out, tiles = {}, []
    for s in src['stickers']:
        check(s)
        rows, pal = draw(s.get('face', {}), s.get('addons', []), seed=s['no'])
        out[s['id']] = {'pal': pal, 'rows': rows}
        tiles.append((s, rows, pal))
    rows, pal = draw(PLACEHOLDER)
    out['placeholder'] = {'pal': pal, 'rows': rows}
    with open(os.path.join(DATA, f'{season}-portraits.json'), 'w') as f:
        json.dump(out, f, separators=(',', ':'))
        f.write('\n')
    # contact sheet: ten a row, number and name under each
    scale, cols, pad, lab = 5, 10, 10, 26
    T = 32 * scale
    sheet = Image.new('RGB', (pad + cols * (T + pad), pad + (len(tiles) + cols - 1) // cols * (T + lab + pad)), (24, 24, 24))
    d = ImageDraw.Draw(sheet)
    for i, (s, rows, pal) in enumerate(tiles):
        x, y = pad + i % cols * (T + pad), pad + i // cols * (T + lab + pad)
        sheet.paste(render(rows, pal, scale, TIER_BG[s['tier']]), (x, y))
        d.text((x, y + T + 3), f"{s['no']} {s['pos']}", fill=(200, 200, 200))
        d.text((x, y + T + 13), s['name'][:26], fill=(240, 240, 240))
    os.makedirs(os.path.join(HERE, 'out'), exist_ok=True)
    sheet.save(os.path.join(HERE, 'out', f'{season}-sheet.png'))
    print(f"{len(tiles)} portraits -> data/seasons/{season}-portraits.json, tools/art/out/{season}-sheet.png")


if __name__ == '__main__':
    main(*sys.argv[1:])
