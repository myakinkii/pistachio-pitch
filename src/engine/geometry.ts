// geometry.ts: the pitch. Flat-top hexes in odd-q offset coordinates (q, r),
// each split into six segments k = 0..5 pointing at angle 30 + 60k degrees
// (screen coordinates, y down). Segment letters run clockwise from the top:
// a = k4, b = k5, c = k0, d = k1, e = k2, f = k3.
//
// Everything the rules use is integer maths, so a replay gives the same result
// in every JavaScript engine. Floating point only appears in pixelOf(), which
// is for drawing.

export type TeamId = "K" | "S"; // Kernels defend the top goal, Shells the bottom one
export type Cut = "top" | "bottom" | "left" | "right" | null;
export type Kind = "field" | "goal";

export interface Hex {
  id: number;        // index into HEXES
  num: number;       // spot number shown on the board (1..121)
  q: number; r: number;
  kind: Kind;
  goalOf: TeamId | null; // the team that defends this goal hex
  cut: Cut;          // hexes cut by a goal line or touchline
}

const hexes: Hex[] = [];
const byQR = new Map<string, number>();
function add(q: number, r: number, kind: Kind = "field", goalOf: TeamId | null = null, cut: Cut = null) {
  const id = hexes.length;
  hexes.push({ id, num: 0, q, r, kind, goalOf, cut });
  byQR.set(q + "," + r, id);
}

// The playing area between the goal lines.
for (let q = 0; q < 7; q++) for (let r = 0; r <= (q & 1 ? 10 : 11); r++) add(q, r);
// Goals: the keeper's full hex plus a half hex either side, flush on the goal line.
add(3, -1, "goal", "K"); add(2, -1, "goal", "K", "top"); add(4, -1, "goal", "K", "top");
add(3, 11, "goal", "S"); add(2, 12, "goal", "S", "bottom"); add(4, 12, "goal", "S", "bottom");
// Ends of the 6-yard box beside the goal, and the corner halves on the goal line.
add(1, -1); add(5, -1); add(1, 11); add(5, 11);
add(0, -1, "field", null, "top"); add(6, -1, "field", null, "top");
add(0, 12, "field", null, "bottom"); add(6, 12, "field", null, "bottom");
// Touchline corridors: outer columns keep only their four inner segments.
for (let r = -1; r <= 11; r++) { add(-1, r, "field", null, "left"); add(7, r, "field", null, "right"); }

// Spot numbers: zigzag rows of 9 (r, then q), so 1a is the top-left corner flag.
hexes.slice().sort((a, b) => a.r - b.r || a.q - b.q).forEach((h, i) => { h.num = i + 1; });

export const HEXES: readonly Hex[] = hexes;
export const NUM_HEXES = hexes.length;
export const NSEG = NUM_HEXES * 6;
export const hexAt = (q: number, r: number): number | undefined => byQR.get(q + "," + r);
const byNum = new Map(hexes.map(h => [h.num, h.id]));
export const hexByNum = (n: number): number | undefined => byNum.get(n);

// Integer centre coordinates: X in units of R/2, Y in units of (hex height)/6.
// Real distance squared is proportional to 3X^2 + Y^2.
export const cx = (h: number) => 3 * hexes[h].q;
export const cy = (h: number) => 6 * hexes[h].r + 3 * (hexes[h].q & 1);
const CENT_OFF: readonly [number, number][] = [[1, 1], [0, 2], [-1, 1], [-1, -1], [0, -2], [1, -1]];
export const segX = (s: number) => cx(segHex(s)) + CENT_OFF[s % 6][0];
export const segY = (s: number) => cy(segHex(s)) + CENT_OFF[s % 6][1];

// Neighbour across edge k (direction 30 + 60k degrees) in odd-q offset coordinates.
const NB_EVEN: readonly [number, number][] = [[1, 0], [0, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const NB_ODD: readonly [number, number][] = [[1, 1], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, 0]];
export const HEX_NBR: readonly (number | undefined)[][] = hexes.map(h =>
  (h.q & 1 ? NB_ODD : NB_EVEN).map(([dq, dr]) => hexAt(h.q + dq, h.r + dr)));

export const segHex = (s: number) => Math.floor(s / 6);
export const LETTERS = ["c", "d", "e", "f", "a", "b"] as const; // by k
const K_OF: Record<string, number> = { c: 0, d: 1, e: 2, f: 3, a: 4, b: 5 };

/** Segments beyond a goal line or touchline. */
export function segOutside(s: number): boolean {
  const h = hexes[segHex(s)], k = s % 6;
  switch (h.cut) {
    case "top": return k >= 3;
    case "bottom": return k <= 2;
    case "left": return k === 2 || k === 3;
    case "right": return k === 5 || k === 0;
    default: return false;
  }
}
export const segExists = (s: number) => s >= 0 && s < NSEG && !segOutside(s);
export const segIsGoal = (s: number) => hexes[segHex(s)].kind === "goal";

/** Edge-adjacent segments: the two beside it in the same hex and the one across its outer edge. */
export function segNbrs(s: number): number[] {
  const h = segHex(s), k = s % 6;
  const out = [h * 6 + (k + 1) % 6, h * 6 + (k + 5) % 6];
  const n = HEX_NBR[h][k];
  if (n !== undefined) out.push(n * 6 + (k + 3) % 6);
  return out.filter(segExists);
}
export const hexSegs = (h: number) => [0, 1, 2, 3, 4, 5].map(k => h * 6 + k).filter(segExists);

export function hexDist(a: number, b: number): number {
  const ca = cube(a), cb = cube(b);
  return Math.max(Math.abs(ca[0] - cb[0]), Math.abs(ca[1] - cb[1]), Math.abs(ca[2] - cb[2]));
}
function cube(id: number): [number, number, number] {
  const { q, r } = hexes[id];
  const x = q, z = r - (q - (q & 1)) / 2;
  return [x, -x - z, z];
}
export const hexNbrs = (h: number) => HEX_NBR[h].filter((n): n is number => n !== undefined);

// Coordinates as text: "50d" for a segment, "50" for a spot.
export const segName = (s: number) => `${hexes[segHex(s)].num}${LETTERS[s % 6]}`;
export const hexName = (h: number) => String(hexes[h].num);
export function parseSeg(t: string): number | null {
  const m = /^(\d+)([a-f])$/.exec(t);
  if (!m) return null;
  const h = hexByNum(Number(m[1]));
  if (h === undefined) return null;
  const s = h * 6 + K_OF[m[2]];
  return segExists(s) ? s : null;
}
export function parseHex(t: string): number | null {
  if (!/^\d+$/.test(t)) return null;
  const h = hexByNum(Number(t));
  return h === undefined ? null : h;
}

// Landmarks.
export const CENTER = hexAt(3, 5)!;
export const GOAL: Record<TeamId, number[]> = {
  K: hexes.filter(h => h.goalOf === "K").map(h => h.id),
  S: hexes.filter(h => h.goalOf === "S").map(h => h.id),
};
export const KEEPER_HEX: Record<TeamId, number> = { K: hexAt(3, -1)!, S: hexAt(3, 11)! };
export const PENALTY_SPOT: Record<TeamId, number> = { K: hexAt(3, 1)!, S: hexAt(3, 9)! };
export const CENTRE_RING = new Set(hexNbrs(CENTER));
export const other = (t: TeamId): TeamId => (t === "K" ? "S" : "K");
export const attackGoal = (t: TeamId) => GOAL[other(t)];

// The penalty area, used by zone colours and (later) fouls.
const AMBER = new Set(["1,-1", "2,0", "3,0", "4,0", "5,-1", "1,11", "2,11", "3,10", "4,11", "5,11"]);
const YELLOW = new Set(["0,-1", "6,-1", "0,12", "6,12", "0,0", "1,0", "2,1", "3,1", "4,1", "5,0", "6,0",
  "0,11", "1,10", "2,10", "3,9", "4,10", "5,10", "6,11", "0,1", "6,1", "0,10", "6,10"]);
const PEN_REF = ["2,0", "4,0", "2,11", "4,11"].map(k => byQR.get(k)!).concat(GOAL.K, GOAL.S);

export type Zone = "goal" | "sixyard" | "box" | "flank" | "centre" | "circle" | "mid";
export function zoneOf(h: number): Zone {
  const x = hexes[h], key = x.q + "," + x.r;
  if (x.kind === "goal") return "goal";
  if (h === CENTER) return "centre";
  if (CENTRE_RING.has(h)) return "circle";
  if (AMBER.has(key)) return "sixyard";
  if (YELLOW.has(key)) return "box";
  if (Math.min(...PEN_REF.map(g => hexDist(h, g))) <= 3 && x.q >= 1 && x.q <= 5) return "box";
  if (x.q <= 0 || x.q >= 6) return "flank";
  return "mid";
}
// Single segments coloured unlike their hex (top half; the bottom half is mirrored a<->d, b<->c, e<->f).
const SEG_TOP: Record<string, [string, Zone]> = {
  "0,1": ["def", "flank"], "6,1": ["bcd", "flank"],
  "1,2": ["cdef", "mid"], "5,2": ["bcde", "mid"],
  "2,3": ["abcdef", "mid"], "4,3": ["abcdef", "mid"],
  "0,2": ["bc", "mid"], "0,3": ["bc", "mid"], "0,4": ["bc", "mid"], "0,5": ["bc", "mid"],
  "6,2": ["ef", "mid"], "6,3": ["ef", "mid"], "6,4": ["ef", "mid"], "6,5": ["ef", "mid"],
};
const FLIP: Record<string, string> = { a: "d", b: "c", c: "b", d: "a", e: "f", f: "e" };
const SEG_ZONE = new Map<string, { lets: string; zone: Zone }>();
for (const [qr, [lets, zone]] of Object.entries(SEG_TOP)) {
  const [q, r] = qr.split(",").map(Number);
  SEG_ZONE.set(qr, { lets, zone });
  SEG_ZONE.set(q + "," + (q & 1 ? 10 - r : 11 - r), { lets: [...lets].map(l => FLIP[l]).join(""), zone });
}
export function segZone(s: number): Zone {
  const h = hexes[segHex(s)];
  const o = SEG_ZONE.get(h.q + "," + h.r);
  return o && o.lets.includes(LETTERS[s % 6]) ? o.zone : zoneOf(h.id);
}
/** Inside a team's own penalty area (6-yard box included). */
export const inBoxOf = (h: number, t: TeamId) => {
  const z = zoneOf(h);
  return (z === "box" || z === "sixyard" || z === "goal") && (t === "K" ? cy(h) < cy(CENTER) : cy(h) > cy(CENTER));
};

/** Pixel position of a hex centre, for drawing (R = hex radius). */
export function pixelOf(h: number, R = 40): { x: number; y: number } {
  const HH = Math.sqrt(3) * R;
  return { x: cx(h) * R / 2, y: cy(h) * HH / 6 };
}
