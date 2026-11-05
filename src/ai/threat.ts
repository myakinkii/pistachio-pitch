// threat.ts: where the danger gathers. Three heat maps over the spots of the
// pitch, each with its focal points spelled out as text, so a human looking at
// the board and an LLM coach reading the prompt see the same thing.
//
//   ball threat     every option of the player with the ball (pass, through
//                   ball, dribble, shot) adds heat where it ends up: its chance
//                   of working times how dangerous that spot is
//   team threat     every outfield player of a side adds heat to the spots he
//                   can reach this turn at his pace, weighted by how dangerous
//                   each spot is
//   counter-threat  the team threat of the side without the ball: where they
//                   would strike if they won it back now
//
// "How dangerous a spot is" is the chance that a shot from there by that player
// beats the keeper where he stands (lanes ignored), with a sliver for progress
// up the pitch as a tie-breaker. Estimates, not rules: nothing in the engine
// depends on them.

import {
  HEXES, PASS_RANGE, attackGoal, hexDist, hexOf, carrier, other, hexName,
  type State, type Player, type TeamId,
} from "../engine/index.ts";
import { analyze, duelOdds, goalDist } from "./odds.ts";

export interface Heat { v: number; why: string }
const PROGRESS = 0.03;
export type HeatMap = Map<number, Heat>;

const shortName = (p: Player) => `${p.team === "K" ? "Kernel" : "Shell"} #${p.num}`;

/** How dangerous spot h is for `team`, for a player with shooting `sho`. */
export function danger(s: State, team: TeamId, h: number, sho: number): number {
  if (HEXES[h].kind !== "field") return 0;
  const keeper = s.players.find(p => p.team !== team && p.role === "GK");
  let shot = 0;
  for (const g of attackGoal(team)) {
    const d = hexDist(h, g);
    if (d > PASS_RANGE) continue;
    const gd = keeper ? hexDist(hexOf(keeper), g) : 9;
    const p = gd <= 1 ? duelOdds(sho - Math.max(0, d - 2), keeper!.st.kee + (gd === 0 ? 1 : 0)).win : 1;
    shot = Math.max(shot, p);
  }
  return shot + PROGRESS * Math.max(0, 1 - goalDist(team, h) / 12);
}

function add(m: HeatMap, h: number, v: number, why: string) {
  const cur = m.get(h);
  if (!cur) m.set(h, { v, why });
  else m.set(h, { v: cur.v + v, why: v > cur.v ? why : cur.why });
}

/** The options of the player with the ball, as heat where they end up. Empty if nobody has it. */
export function ballThreat(s: State): HeatMap {
  const m: HeatMap = new Map(), c = carrier(s);
  if (!c || c.team !== s.turn) return m;
  for (const o of analyze(s).all) {
    if (o.to === undefined || o.p === undefined || o.p <= 0) continue;
    const who = s.players.find(p => p.id === o.by) ?? c;
    const v = o.kind === "shot" ? o.p : o.p * danger(s, c.team, o.to, who.st.sho);
    const what = o.kind === "shot" ? `shot by ${shortName(c)}, goal ${pctOf(o.p)}`
      : o.kind === "pass" ? `pass to ${shortName(who)}, arrives ${pctOf(o.p)}`
      : o.kind === "through" ? `through ball for ${shortName(who)}, lane ${pctOf(o.p)}`
      : `${shortName(c)} dribbles there, keeps it ${pctOf(o.p)}`;
    add(m, o.to, v, what);
  }
  return m;
}

/** Where a side's players could hurt the opponent this turn, at their pace. */
export function teamThreat(s: State, team: TeamId): HeatMap {
  const spots = new Map<number, { v: number; best: number; who: Player[] }>();
  for (const p of s.players.filter(x => x.team === team && x.role !== "GK")) {
    const from = hexOf(p), pace = 1 + p.st.pac;
    for (const h of HEXES) {
      if (h.kind !== "field" || hexDist(from, h.id) > pace) continue;
      const v = danger(s, team, h.id, p.st.sho), shot = v - PROGRESS * Math.max(0, 1 - goalDist(team, h.id) / 12);
      if (shot < 0.05) continue;   // only spots you could actually score from
      const cur = spots.get(h.id) ?? { v: 0, best: 0, who: [] };
      cur.v += v; cur.best = Math.max(cur.best, shot); cur.who.push(p);
      spots.set(h.id, cur);
    }
  }
  const m: HeatMap = new Map();
  for (const [h, x] of spots) {
    const names = x.who.map(p => `#${p.num}`), team1 = x.who[0].team === "K" ? "Kernels" : "Shells";
    m.set(h, { v: x.v, why: `${team1} ${names.length > 1 ? names.slice(0, -1).join(", ") + " and " + names[names.length - 1] : names[0]} can get there this turn; best shot from there ${pctOf(x.best)}` });
  }
  return m;
}

/** The team threat of the side without the ball. */
export function counterThreat(s: State): HeatMap {
  const c = carrier(s);
  return teamThreat(s, c ? other(c.team) : other(s.turn));
}

const pctOf = (x: number) => `${Math.round(Math.max(0, x) * 100)}%`;

/** The hottest spots, best first. */
export function focal(m: HeatMap, n = 5): { hex: number; v: number; why: string }[] {
  return [...m.entries()].map(([hex, h]) => ({ hex, ...h })).sort((a, b) => b.v - a.v || a.hex - b.hex).slice(0, n);
}

/** A few lines for a coach: the focal points of all three maps. */
export function threatText(s: State, n = 3): string {
  const c = carrier(s), lines: string[] = [];
  const fmt = (title: string, m: HeatMap) => {
    const f = focal(m, n);
    if (f.length) lines.push(`${title}: ` + f.map(x => `spot ${hexName(x.hex)} (${x.why})`).join("; "));
  };
  if (c && c.team === s.turn) fmt("Ball threat", ballThreat(s));
  fmt(`${s.turn === "K" ? "Kernels" : "Shells"} threat`, teamThreat(s, s.turn));
  fmt(`Counter-threat if ${other(s.turn) === "K" ? "the Kernels" : "the Shells"} win it back`, teamThreat(s, other(s.turn)));
  return lines.join("\n");
}
