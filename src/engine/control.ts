// control.ts: who controls which segments of the pitch. Visual for now (the
// page's control overlay); no rule depends on it yet.
//
//   - a spot with players of only one side: that side controls all its segments
//   - a spot with both sides: each player controls his own segment, plus the
//     empty segments either side of him in the spot; an empty segment claimed
//     by both sides is contested and belongs to nobody
//   - empty spots are neutral

import { NUM_HEXES, hexSegs, segHex, type TeamId } from "./geometry.ts";
import type { State } from "./rules.ts";

export function control(s: State): Map<number, TeamId> {
  const out = new Map<number, TeamId>();
  const byHex: { K: number[]; S: number[] }[] = Array.from({ length: NUM_HEXES }, () => ({ K: [], S: [] }));
  for (const p of s.players) byHex[segHex(p.seg)][p.team].push(p.seg);
  byHex.forEach((h, id) => {
    if (!h.K.length && !h.S.length) return;
    const segs = hexSegs(id);
    if (!h.S.length || !h.K.length) { const t: TeamId = h.K.length ? "K" : "S"; for (const x of segs) out.set(x, t); return; }
    const occupied = new Set([...h.K, ...h.S]), claims = new Map<number, Set<TeamId>>();
    for (const t of ["K", "S"] as TeamId[]) for (const seg of h[t]) {
      out.set(seg, t);
      const k = seg % 6;
      for (const n of [id * 6 + (k + 1) % 6, id * 6 + (k + 5) % 6]) {
        if (!segs.includes(n) || occupied.has(n)) continue;
        if (!claims.has(n)) claims.set(n, new Set());
        claims.get(n)!.add(t);
      }
    }
    for (const [n, who] of claims) if (who.size === 1) out.set(n, [...who][0]);
  });
  return out;
}
