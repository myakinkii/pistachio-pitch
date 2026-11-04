# faces.py: pistachio portraits (32x32) layered from traits.
#
# A face is a dict of traits (see TRAITS); add-ons are drawn on top. The shirt
# uses digit characters that the page maps to the team's kit at render time:
#   1 shirt  2 shirt shade  3 hoop  4 hoop shade  5 stripe  6 stripe shade
#   7 hoop and stripe  8 the same, shaded  9 collar
# Kernels wear hoops and Shells stripes, so one portrait works for both teams.
# Keep TRAITS in step with TRAITS in src/album/album.ts.
import random
from canvas import Canvas

TRAITS = {
    'shell': ['plain', 'roasted', 'pale'],
    'crack': ['left', 'right', 'wide', 'none'],
    'eyes': ['dots', 'wide', 'sleepy', 'wink', 'squint'],
    'brows': ['none', 'angry', 'bushy', 'raised'],
    'mouth': ['smile', 'grin', 'gap', 'oh', 'smirk', 'flat', 'tongue'],
    'hair': ['bald', 'shiny', 'buzz', 'mohawk', 'afro', 'ponytail', 'long', 'spikes', 'side',
             'mullet', 'bun', 'curtains', 'topknot'],
    'hairColor': ['dark', 'blond', 'red', 'blue'],
    'facial': ['none', 'moustache', 'beard', 'goatee', 'stubble', 'sideburns'],
    'marks': ['scar', 'freckles', 'blush'],
}
ADDONS = ['goggles', 'specs', 'shades', 'sweatband', 'plaster', 'armband', 'earring']

PALETTE = {
    'O': '#2a1f16',                                   # outline
    'G': '#8fbf3a', 'g': '#5f8a22',                   # kernel through the crack
    'e': '#16110c', 'w': '#ffffff', 'm': '#6b2a1c', 't': '#fbf6e8',
    'P': '#e98a7a', 'p': '#c96a5a',                   # blush, plaster, tongue
    'H': '#2b1b12', 'h': '#4a3222',                   # dark hair
    'B': '#f3dc6a', 'b': '#c9a93a',                   # blond
    'R': '#b3402a', 'r': '#7e2a1a',                   # red (hair, bands)
    'V': '#3c5fa8', 'v': '#24407a',                   # blue (hair, goggle strap)
    'X': '#111111', 'x': '#8ad0e8',                   # frames, lenses
    'Y': '#e8c13a', 'y': '#a88620',                   # gold: earring, armband
    'u': '#9a8560',                                   # stubble
}
SHELLS = {'plain': ('#e3cf9e', '#c4a86e', '#f5e8c4'), 'roasted': ('#cfa86a', '#a77f45', '#e6c890'),
          'pale': ('#efe3c0', '#d4c193', '#fbf4dd')}
HAIR = {'dark': ('H', 'h'), 'blond': ('B', 'b'), 'red': ('R', 'r'), 'blue': ('V', 'v')}
FACE = ('S', 's', 'L', 'O')
SKIN = ('S', 's', 'L')


def palette(shell):
    s, sh, li = SHELLS[shell]
    return {**PALETTE, 'S': s, 's': sh, 'L': li}


def shirt(c):
    for y in range(22, 32):
        for x in range(32):
            if ((x - 16) / 13) ** 2 + ((y - 33) / 9) ** 2 > 1:
                continue
            shade = ((x - 20) / 9) ** 2 + ((y - 33) / 8) ** 2 <= 1
            hoop = y in (28, 29)
            stripe = 14 <= x <= 18
            code = 1 + (2 if hoop else 0) + (4 if stripe else 0)
            code = {1: 1, 3: 3, 5: 5, 7: 7}[code] + (1 if shade else 0)
            c.px(x, y, str(code))
    c.rect(14, 23, 18, 25, '9')


def shell(c, crack, salted, rnd):
    c.ellipse(16, 13, 9.5, 11.5, 'O')
    c.ellipse(16, 13, 8.5, 10.5, 'S')
    c.ellipse(19.5, 15, 6, 9, 's', only=('S',))
    c.ellipse(12.5, 8, 2.5, 3.5, 'L', only=('S',))
    if crack != 'none':
        side = -1 if crack == 'left' else 1
        n = 7 if crack == 'wide' else 5
        for i, y in enumerate(range(3, 3 + n)):
            x0 = 16 + side * (1 + i // 2)
            c.px(x0, y, 'O')
            c.px(x0 + side, y, 'G')
            c.px(x0 + 2 * side, y, 'g' if i > 1 else 'G')
            c.px(x0 + 3 * side, y, 'O')
            if crack == 'wide' and i > 2:
                c.px(x0 + 2 * side, y, 'G')
                c.px(x0 + 3 * side, y, 'g')
                c.px(x0 + 4 * side, y, 'O')
    if salted:  # a few grains of salt, away from the eyes and mouth
        spots = [(x, y) for x in range(10, 16) for y in range(5, 10)] + [(x, y) for x in range(18, 23) for y in range(20, 22)]
        for x, y in rnd.sample(spots, 4):
            if c.get(x, y) in SKIN:
                c.px(x, y, 'w')


def eyes(c, kind):
    for i, ex in enumerate((13, 18)):
        if kind == 'dots':
            c.rect(ex, 12, ex + 1, 14, 'e'); c.px(ex, 12, 'w')
        elif kind == 'wide':
            c.rect(ex - 1, 11, ex + 1, 14, 'w'); c.rect(ex, 12, ex + 1, 14, 'e'); c.px(ex, 12, 'w')
        elif kind == 'sleepy':
            c.rect(ex - 1, 12, ex + 1, 12, 'O'); c.rect(ex, 13, ex + 1, 13, 'e')
        elif kind == 'wink':
            if i == 0:
                c.rect(ex, 12, ex + 1, 14, 'e'); c.px(ex, 12, 'w')
            else:
                c.px(ex - 1, 13, 'O'); c.rect(ex, 12, ex + 1, 12, 'O'); c.px(ex + 2, 13, 'O')
        elif kind == 'squint':
            c.rect(ex - 1, 13, ex + 1, 13, 'e')


def brows(c, kind, col):
    if kind == 'angry':
        for x, y in [(12, 9), (13, 10), (14, 10), (18, 10), (19, 10), (20, 9)]:
            c.px(x, y, col)
    elif kind == 'bushy':
        c.rect(12, 9, 15, 10, col); c.rect(17, 9, 20, 10, col)
    elif kind == 'raised':
        c.rect(12, 9, 14, 9, col); c.rect(17, 8, 19, 8, col)


def mouth(c, kind):
    if kind == 'smile':
        c.rect(14, 18, 18, 18, 'm'); c.px(13, 17, 'm'); c.px(19, 17, 'm')
    elif kind == 'grin':
        c.rect(13, 17, 19, 19, 'm'); c.rect(14, 17, 18, 17, 't')
    elif kind == 'gap':
        c.rect(13, 17, 19, 19, 'm'); c.rect(14, 17, 18, 17, 't'); c.px(16, 17, 'm')
    elif kind == 'oh':
        c.rect(15, 17, 17, 19, 'm')
    elif kind == 'smirk':
        c.rect(15, 18, 18, 18, 'm'); c.px(19, 17, 'm')
    elif kind == 'flat':
        c.rect(14, 18, 18, 18, 'm')
    elif kind == 'tongue':
        c.rect(14, 18, 18, 18, 'm'); c.rect(15, 19, 16, 20, 'P'); c.px(16, 20, 'p')


def hair(c, kind, col, dk):
    cap = FACE + ('G', 'g')
    if kind == 'shiny':
        c.ellipse(13, 5, 3, 1.5, 'L'); c.px(12, 4, 'w'); c.px(13, 4, 'w')
    elif kind == 'buzz':
        c.ellipse(16, 6, 8.5, 4, dk, only=cap); c.ellipse(16, 9, 8, 2.2, 'S', only=(dk,))
        for x in range(9, 24, 2):
            c.px(x, 5 + (x % 3 == 0), col)
    elif kind == 'mohawk':
        for x in range(14, 19):
            for y in (range(0, 6) if 15 <= x <= 17 else range(1, 6)):
                c.px(x, y, col if x < 17 else dk)
    elif kind == 'afro':
        c.ellipse(16, 6, 12, 7, col); c.ellipse(20, 7, 7, 5, dk, only=(col,))
        c.ellipse(16, 13, 8.5, 6, 'S', only=(col, dk)); c.ellipse(19.5, 15, 6, 4, 's', only=('S',))
    elif kind == 'ponytail':
        c.ellipse(16, 5, 9, 4.5, col); c.ellipse(16, 8, 8, 2, 'S', only=(col,)); c.rect(24, 4, 26, 6, 'R')
        for y in range(6, 17):
            c.px(27 - (y > 12), y, col); c.px(26 - (y > 12), y, dk)
    elif kind == 'long':
        c.ellipse(16, 6, 9.5, 5, col); c.ellipse(16, 9, 8, 2, 'S', only=(col,))
        for y in range(6, 20):
            c.px(6, y, col); c.px(7, y, dk); c.px(25, y, dk); c.px(26, y, col)
    elif kind == 'spikes':  # uneven, swept spikes
        for x, top in [(9, 3), (12, 1), (15, 0), (18, 1), (21, 2), (23, 4)]:
            for y in range(top, 6):
                w = (y - top) // 2
                c.rect(x - w, y, x + w, y, col if x < 18 else dk)
        c.ellipse(16, 6, 8.5, 2.8, col, only=cap); c.ellipse(16, 8.5, 7.5, 1.5, 'S', only=(col,))
    elif kind == 'side':
        c.ellipse(16, 5.5, 9, 4, col); c.ellipse(16, 8.5, 8, 1.8, 'S', only=(col,))
        c.line(11, 3, 13, 7, 'L'); c.rect(18, 7, 24, 8, col); c.px(24, 9, col)
    elif kind == 'mullet':  # short on top, long at the back, down to the shoulders
        c.ellipse(16, 5.5, 9, 4, col); c.ellipse(16, 8.5, 8, 1.8, 'S', only=(col,))
        for y in range(7, 25):
            spread = 0 if y < 16 else (y - 15) // 3
            for x in range(25, 27 + spread):
                c.px(x, y, dk if x == 25 else col)
            for x in range(5 - spread, 8):
                c.px(x, y, col if x < 7 else dk)
    elif kind == 'bun':
        c.ellipse(16, 5, 8.5, 3.5, col); c.ellipse(16, 8, 8, 1.6, 'S', only=(col,))
        c.ellipse(16, 1.5, 3, 2, col); c.px(17, 1, dk)
    elif kind == 'curtains':
        c.ellipse(16, 5, 9, 4.5, col); c.ellipse(16, 9, 7.5, 2.2, 'S', only=(col,))
        for y in range(4, 10):
            c.px(16, y, 'S' if y > 5 else dk)
        c.rect(9, 8, 11, 10, col); c.rect(21, 8, 23, 10, col)
    elif kind == 'topknot':
        c.ellipse(16, 6, 8.5, 3, dk, only=cap); c.ellipse(16, 8.6, 8, 1.8, 'S', only=(dk,))
        c.rect(15, 0, 17, 3, col); c.rect(14, 3, 18, 3, 'R')


def facial(c, kind, col, dk):
    if kind == 'moustache':
        c.rect(13, 16, 19, 16, col); c.px(12, 17, col); c.px(20, 17, col)
    elif kind == 'beard':
        c.ellipse(16, 19, 7.5, 4.5, col, only=FACE + ('m', 't', 'P', 'p')); c.rect(14, 18, 18, 18, 'm')
    elif kind == 'goatee':
        c.rect(15, 20, 17, 22, col); c.px(16, 23, dk)
    elif kind == 'stubble':  # a soft shadow along the jaw, around the mouth
        c.ellipse(16, 19.5, 7, 3.8, 'u', only=SKIN)
    elif kind == 'sideburns':
        c.rect(8, 10, 9, 16, col); c.rect(23, 10, 24, 16, col)


def marks(c, kinds):
    for k in kinds:
        if k == 'scar':
            c.line(19, 9, 21, 15, 'r'); c.px(19, 11, 'P'); c.px(21, 13, 'P')
        elif k == 'freckles':
            for x, y in [(10, 15), (12, 16), (11, 17), (20, 16), (22, 15), (21, 17)]:
                c.px(x, y, 'h' if c.get(x, y) == 's' else 's')
        elif k == 'blush':
            c.rect(10, 16, 11, 16, 'P'); c.rect(21, 16, 22, 16, 'P')


def addon(c, kind):
    if kind == 'goggles':
        c.rect(7, 11, 25, 11, 'V'); c.rect(7, 15, 25, 15, 'v')
        for ex in (11, 18):
            c.rect(ex, 10, ex + 4, 16, 'X'); c.rect(ex + 1, 11, ex + 3, 15, 'x'); c.px(ex + 1, 11, 'w')
            c.rect(ex + 2, 13, ex + 3, 14, 'e')
        c.rect(16, 12, 17, 12, 'X')
    elif kind == 'specs':
        for ex in (12, 17):
            c.rect(ex, 11, ex + 3, 15, 'X'); c.rect(ex + 1, 12, ex + 2, 14, 'x'); c.rect(ex + 1, 13, ex + 2, 14, 'e')
        c.px(16, 12, 'X')
    elif kind == 'shades':
        c.rect(10, 11, 22, 14, 'X'); c.rect(11, 12, 14, 12, 'x'); c.rect(18, 12, 21, 12, 'x')
        c.rect(15, 14, 17, 14, 'S')
    elif kind == 'sweatband':
        c.rect(8, 7, 24, 7, 'w'); c.rect(8, 8, 24, 8, 'R')
    elif kind == 'plaster':
        c.rect(12, 15, 20, 16, 'P'); c.rect(15, 15, 17, 16, 'w')
    elif kind == 'armband':
        c.rect(3, 27, 7, 30, 'Y'); c.rect(3, 30, 7, 30, 'y'); c.px(5, 28, 'O')
    elif kind == 'earring':
        c.px(24, 15, 'Y'); c.px(25, 16, 'Y'); c.px(24, 17, 'y')


def draw(face, addons=(), seed=0):
    """Rows of a 32x32 portrait and its palette (without the kit digits)."""
    col, dk = HAIR[face.get('hairColor', 'dark')]
    c = Canvas(32, 32)
    shirt(c)
    shell(c, face.get('crack', 'right'), face.get('salted', False), random.Random(seed))
    eyes(c, face.get('eyes', 'dots'))
    brows(c, face.get('brows', 'none'), col)
    mouth(c, face.get('mouth', 'smile'))
    hair(c, face.get('hair', 'bald'), col, dk)
    facial(c, face.get('facial', 'none'), col, dk)
    marks(c, face.get('marks', []))
    for a in addons:
        addon(c, a)
    rows = c.rows()
    used = set(''.join(rows))
    pal = {k: v for k, v in palette(face.get('shell', 'plain')).items() if k in used}
    return rows, pal
