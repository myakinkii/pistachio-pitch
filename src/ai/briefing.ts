// briefing.ts: what the formation lab shows, in words, for the coach prompt.
// The side to move gets three sections:
//
//   SHAPE      its formation, how far each player is from his target spot, and
//              moves that bring the furthest ones back (legal commands with AP)
//   THREATS    the focal points of the heat maps: where its attack can strike,
//              where the opponent's can (with the ball, or on the break), and who
//              can cover each danger spot this turn
//   TERRITORY  segments controlled, empty spots reached first, and the passing
//              chain from the ball (or the keeper) to the box
//
// Every command it suggests is one the engine would accept in this position.

import {
  FORMATIONS, HEXES, hexDist, segHex, segName, hexSegs, reach, carrier, other, control, territory,
  type State, type TeamId, type Player,
} from "../engine/index.ts";
import { ballThreat, teamThreat, focal, type HeatMap } from "./threat.ts";
import { chain } from "./tempo.ts";
import { targetHex, stepTowards } from "./shape.ts";
export { targetHex };

const teamName = (t: TeamId) => (t === "K" ? "Kernels" : "Shells");
const spot = (h: number) => HEXES[h].num;

export function shapeBriefing(s: State): string {
  const team = s.turn, f = s.formation[team], ball = s.ball.owner;
  const mine = s.players.filter(p => p.team === team && p.role !== "GK");
  const off = mine.map(p => ({ p, t: targetHex(s, p), d: hexDist(segHex(p.seg), targetHex(s, p)) }));
  const total = off.reduce((a, x) => a + x.d, 0);
  const lines = [`Formation ${f} (${FORMATIONS[f].style}). Your outfield players are ${total} spots in total from their target shape${total ? "" : ": the shape is in place"}.`];
  const far = off.filter(x => x.d > 0 && x.p.id !== ball).sort((a, b) => b.d - a.d || a.p.num - b.p.num).slice(0, 5);
  const moves = far.map(x => {
    const st = stepTowards(s, x.p, x.t);
    return st ? `#${x.p.num}-${segName(st.seg)} (${x.p.role}: ${x.d} → ${st.d} spots from his target ${spot(x.t)}, ${st.cost} AP)` : null;
  }).filter(Boolean);
  if (moves.length) lines.push(`Moves that rebuild the shape: ${moves.join("; ")}`);
  return lines.join("\n");
}

/** Who of `team` can get to spot h this turn, cheapest first. */
function coverFor(s: State, team: TeamId, h: number): string | null {
  let best: { p: Player; seg: number; cost: number } | null = null;
  for (const p of s.players.filter(x => x.team === team && x.role !== "GK")) {
    const { cost } = reach(s, p);
    for (const seg of hexSegs(h)) {
      const c = segHex(p.seg) === h ? 0 : cost.get(seg);
      if (c === undefined) continue;
      if (!best || c < best.cost || (c === best.cost && p.num < best.p.num)) best = { p, seg: c === 0 ? p.seg : seg, cost: c };
    }
  }
  if (!best) return null;
  return best.cost === 0 ? `#${best.p.num} is already there (a reserve on him helps)` : `#${best.p.num}-${segName(best.seg)} covers it (${best.cost} AP)`;
}

export function threatBriefing(s: State): string {
  const team = s.turn, opp = other(team), c = carrier(s), lines: string[] = [];
  const list = (m: HeatMap, n: number, withCover: boolean) => focal(m, n).map(x =>
    `spot ${spot(x.hex)} (${x.why})${withCover ? `: ${coverFor(s, team, x.hex) ?? "nobody of yours can get there this turn"}` : ""}`).join("; ");
  if (c && c.team === team) {
    const b = list(ballThreat(s), 3, false);
    if (b) lines.push(`Where your attack can strike now (ball threat): ${b}.`);
    const t = list(teamThreat(s, team), 3, false);
    if (t) lines.push(`Where your players can get to shooting spots this turn: ${t}.`);
    const k = list(teamThreat(s, opp), 3, true);
    if (k) lines.push(`If you lose it, the ${teamName(opp)} would strike here: ${k}.`);
  } else if (c) {
    // their carrier's options, as if it were their turn
    const theirs = structuredClone(s);
    theirs.turn = opp; theirs.ap = theirs.apPerTurn;
    const b = list(ballThreat(theirs), 3, true);
    if (b) lines.push(`Where ${c.id} can hurt you next turn (their ball threat): ${b}.`);
    const t = list(teamThreat(s, opp), 2, true);
    if (t) lines.push(`Other danger from the ${teamName(opp)}: ${t}.`);
    const w = list(teamThreat(s, team), 2, false);
    if (w) lines.push(`If you win it back, your danger is at: ${w}.`);
  } else {
    const t = list(teamThreat(s, team), 2, false), k = list(teamThreat(s, opp), 2, true);
    if (t) lines.push(`Your danger spots: ${t}.`);
    if (k) lines.push(`Their danger spots: ${k}.`);
  }
  return lines.join("\n") || "No shooting spots within reach for either side this turn.";
}

export function territoryBriefing(s: State): string {
  const team = s.turn, opp = other(team), c = carrier(s);
  const ctl = [...control(s).values()], terr = territory(s);
  const mine = ctl.filter(x => x === team).length, theirs = ctl.filter(x => x === opp).length;
  const from = c && c.team === team ? c : undefined;
  const ch = chain(s, team, from?.num);
  const start = from ? `#${from.num} on the ball` : "your keeper";
  const chainText = ch.passes === Infinity ? `no passing chain from ${start} to their box`
    : `${start} reaches their box in ${ch.passes} pass${ch.passes === 1 ? "" : "es"} (${ch.path.map(n => `#${n}`).join(" > ")}), ${Math.round(ch.safe * 100)}% of them all getting through${ch.reached ? "" : ", though nobody is next to their penalty spot yet"}`;
  return `You control ${mine} segments, they control ${theirs}; you would get first to ${terr[team]} empty spots, they to ${terr[opp]}.\nTempo: ${chainText}.`;
}

/** All three, as prompt sections. */
export function briefing(s: State): string {
  return `=== SHAPE ===\n${shapeBriefing(s)}\n\n=== THREATS ===\n${threatBriefing(s)}\n\n=== TERRITORY ===\n${territoryBriefing(s)}`;
}

