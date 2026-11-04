// tempo.ts: how fast a formation can develop and get the ball into a scoring
// position. Three measures, all without dice:
//
//   development  AP and turns to move every player from his kick-off spot to his
//                target spot (each player moves at most 1 + PAC spots a turn, the
//                side has `ap` AP a turn to share)
//   chain        the fewest passes from the keeper to a teammate on or next to
//                the opponent's penalty spot, against the opponent's shape, and
//                the chance every pass on that chain gets through
//   coverage     how the shape covers the pitch: width and depth, and the gaps
//                between its lines (defence, midfield, attack)

import {
  newState, HEXES, hexAt, hexDist, mirror, other, segHex, cx, cy, PENALTY_SPOT, FORMATIONS, BUILDS, PASS_RANGE,
  type State, type TeamId,
} from "../engine/index.ts";
import { laneSafety } from "./odds.ts";

export type Shape = "kickoff" | "target";
const LINE: Record<string, "D" | "M" | "F"> = { CB: "D", FB: "D", WB: "D", DM: "M", CM: "M", WM: "M", W: "F", ST: "F", TS: "F" };

/** Both sides standing in a shape of their formation (target shapes from formations.json; kick-off as lined up). */
export function shapes(fK: string, fS: string, shape: Record<TeamId, Shape> = { K: "target", S: "target" }): State {
  const s = newState({ formation: { K: fK, S: fS } });
  for (const team of ["K", "S"] as TeamId[]) {
    const f = FORMATIONS[team === "K" ? fK : fS];
    f.slots.forEach(([, q0, r0], i) => {
      const [q, r] = shape[team] === "target" ? f.target[i] : [q0, r0];
      const [mq, mr] = mirror(team, q, r);
      s.players.find(p => p.team === team && p.num === i + 1)!.seg = hexAt(mq, mr)! * 6 + (team === "K" ? 1 : 4);
    });
  }
  return s;
}

export interface Development {
  players: { num: number; pos: string; spots: number; turns: number }[];
  ap: number;      // total AP: one per spot moved on an empty pitch
  turns: number;   // at least: the shared AP pool, and the slowest player's pace
  slowest: string; // who sets the pace limit
}
/** Kick-off shape to target shape, on an empty pitch. */
export function development(formation: string, apPerTurn = 7): Development {
  const f = FORMATIONS[formation];
  const players = f.slots.map(([pos, q, r], i) => {
    const spots = hexDist(hexAt(q, r)!, hexAt(...f.target[i])!);
    return { num: i + 1, pos, spots, turns: Math.ceil(spots / (1 + BUILDS[pos].pac)) };
  });
  const ap = players.reduce((a, p) => a + p.spots, 0);
  const slow = players.reduce((a, p) => (p.turns > a.turns ? p : a), players[0]);
  return { players, ap, turns: Math.max(Math.ceil(ap / apPerTurn), slow.turns), slowest: `#${slow.num} ${slow.pos}` };
}

export interface Chain { passes: number; path: number[]; safe: number; reached: boolean }
/**
 * The keeper's way to the opponent's box: passes between teammates (up to the
 * passing range, 1 AP each) to someone on or next to the opponent's penalty spot.
 * Among the chains with the fewest passes, the one most likely to get through.
 * If nobody is near the spot, `reached` is false and the chain ends at the
 * player closest to it.
 */
export function chain(s: State, team: TeamId): Chain {
  const mine = s.players.filter(p => p.team === team);
  const gk = mine.find(p => p.role === "GK")!, spot = PENALTY_SPOT[other(team)];
  const hex = (n: number) => segHex(mine.find(p => p.num === n)!.seg);
  let goal = mine.filter(p => p !== gk && hexDist(segHex(p.seg), spot) <= 1).map(p => p.num);
  const reached = goal.length > 0;
  if (!reached) {
    const best = Math.min(...mine.filter(p => p !== gk).map(p => hexDist(segHex(p.seg), spot)));
    goal = mine.filter(p => p !== gk && hexDist(segHex(p.seg), spot) === best).map(p => p.num);
  }
  // breadth-first by number of passes, keeping the safest way to each player
  const best = new Map<number, { passes: number; safe: number; path: number[] }>([[gk.num, { passes: 0, safe: 1, path: [gk.num] }]]);
  let frontier = [gk.num];
  for (let k = 1; frontier.length && k <= 10; k++) {
    const next = new Map<number, { passes: number; safe: number; path: number[] }>();
    for (const a of frontier) {
      const from = best.get(a)!, pa = mine.find(p => p.num === a)!;
      for (const b of mine) {
        if (b === pa || best.has(b.num) || hexDist(hex(a), segHex(b.seg)) > PASS_RANGE) continue;
        const safe = from.safe * laneSafety(s, pa, hex(a), segHex(b.seg), false).safe;
        const cur = next.get(b.num);
        if (!cur || safe > cur.safe) next.set(b.num, { passes: k, safe, path: [...from.path, b.num] });
      }
    }
    for (const [n, v] of next) best.set(n, v);
    const done = goal.map(n => best.get(n)).filter(Boolean).sort((x, y) => y!.safe - x!.safe)[0];
    if (done) return { ...done, reached };
    frontier = [...next.keys()];
  }
  return { passes: Infinity, path: [], safe: 0, reached };
}

export interface Coverage {
  width: number;                          // columns spanned by outfield players
  depth: number;                          // rows (in spots) from the deepest to the highest outfield player
  lines: { line: "D" | "M" | "F"; at: number; width: number }[]; // average height (spots from own goal line) and width of each line
  gaps: number[];                         // spots between consecutive lines
}
/** How a side's shape covers the pitch, in spots, measured from its own goal line. */
export function coverage(s: State, team: TeamId): Coverage {
  const out = s.players.filter(p => p.team === team && p.role !== "GK");
  // height in spots from the own goal line: integer Y units are 6 to a spot
  const up = (h: number) => (team === "K" ? cy(h) + 6 : 72 - cy(h)) / 6;
  const col = (h: number) => cx(h) / 3;
  const span = (xs: number[]) => Math.max(...xs) - Math.min(...xs);
  const lines = (["D", "M", "F"] as const).map(line => {
    const ps = out.filter(p => LINE[p.role] === line);
    if (!ps.length) return null;
    return { line, at: round(ps.reduce((a, p) => a + up(segHex(p.seg)), 0) / ps.length), width: span(ps.map(p => col(segHex(p.seg)))) };
  }).filter((x): x is NonNullable<typeof x> => !!x);
  return {
    width: span(out.map(p => col(segHex(p.seg)))),
    depth: round(span(out.map(p => up(segHex(p.seg))))),
    lines,
    gaps: lines.slice(1).map((l, i) => round(l.at - lines[i].at)),
  };
}
const round = (x: number) => Math.round(x * 10) / 10;

/** Everything about one matchup, both ways. */
export function tempo(fK: string, fS: string, apPerTurn = 7) {
  const s = shapes(fK, fS);
  return {
    K: { development: development(fK, apPerTurn), chain: chain(s, "K"), coverage: coverage(s, "K") },
    S: { development: development(fS, apPerTurn), chain: chain(s, "S"), coverage: coverage(s, "S") },
  };
}
export const spotNum = (h: number) => HEXES[h].num;
