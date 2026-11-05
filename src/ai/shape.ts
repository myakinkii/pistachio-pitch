// shape.ts: each player's target spot in his formation's mid-game shape, how far
// the side is from it, and the step that brings a player closer this turn.

import { FORMATIONS, hexAt, hexDist, mirror, segHex, reach, type State, type Player, type TeamId } from "../engine/index.ts";

/** A player's target spot in his formation's mid-game shape, for his side. */
export function targetHex(s: State, p: Player): number {
  const [q, r] = FORMATIONS[s.formation[p.team]].target[p.num - 1];
  const [mq, mr] = mirror(p.team, q, r);
  return hexAt(mq, mr)!;
}

/** Spots, in total, between a side's outfield players and their target spots. */
export function shapeOff(s: State, team: TeamId): number {
  return s.players.filter(p => p.team === team && p.role !== "GK").reduce((a, p) => a + hexDist(segHex(p.seg), targetHex(s, p)), 0);
}

/** The cheapest segment that brings p closer to spot `goal` within this turn's AP and his pace; null if none does. */
export function stepTowards(s: State, p: Player, goal: number): { seg: number; cost: number; d: number } | null {
  const now = hexDist(segHex(p.seg), goal);
  let best: { seg: number; cost: number; d: number } | null = null;
  for (const [seg, cost] of reach(s, p).cost) {
    const d = hexDist(segHex(seg), goal);
    if (d >= now) continue;
    if (!best || d < best.d || (d === best.d && (cost < best.cost || (cost === best.cost && seg < best.seg)))) best = { seg, cost, d };
  }
  return best;
}
