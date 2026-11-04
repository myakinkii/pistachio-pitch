// influence.ts: who would get to each spot first. Like influence in Go, it turns
// the empty parts of the pitch into territory. Visual and analytical only: no
// rule depends on it.
//
// For every spot on the pitch, each side's arrival is its quickest player's:
// spots to cover divided by his pace (1 + PAC spots a turn), so a quicker player
// gets there first even within the same turn. The earlier side owns the spot;
// a dead heat is contested. Spots
// with players in them belong to whoever stands there (see control.ts), so this
// map covers the empty ones. Distances are straight hex distances: an estimate
// that ignores bodies in the way and the AP pool, which is what makes it cheap
// enough to draw every turn.

import { HEXES, hexDist, segHex, type TeamId } from "./geometry.ts";
import type { State } from "./rules.ts";

export interface Reach { turns: number; spots: number; by: string }
export interface Influence { owner: TeamId | null; K: Reach | null; S: Reach | null }

export function influence(s: State): Map<number, Influence> {
  const occupied = new Set(s.players.map(p => segHex(p.seg)));
  const out = new Map<number, Influence>();
  for (const h of HEXES) {
    if (h.kind !== "field" || occupied.has(h.id)) continue;
    const best: Record<TeamId, Reach | null> = { K: null, S: null };
    const pace: Record<TeamId, number> = { K: 1, S: 1 };
    for (const p of s.players) {
      const spots = hexDist(segHex(p.seg), h.id), v = 1 + p.st.pac, b = best[p.team];
      // earlier arrival (spots / pace, compared exactly), then fewer spots
      if (!b || spots * pace[p.team] < b.spots * v || (spots * pace[p.team] === b.spots * v && spots < b.spots)) {
        best[p.team] = { turns: Math.ceil(spots / v), spots, by: p.id }; pace[p.team] = v;
      }
    }
    const k = best.K!, sh = best.S!, tk = k.spots * pace.S, ts = sh.spots * pace.K;   // compare k.spots/pace.K with sh.spots/pace.S
    const owner = tk !== ts ? (tk < ts ? "K" : "S") : null;
    out.set(h.id, { owner, K: k, S: sh });
  }
  return out;
}

/** Spots each side would get to first (empty spots only). */
export function territory(s: State): Record<TeamId, number> {
  const n: Record<TeamId, number> = { K: 0, S: 0 };
  for (const v of influence(s).values()) if (v.owner) n[v.owner]++;
  return n;
}
