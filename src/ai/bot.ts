// bot.ts: a simple, deterministic coach that needs no model. It picks one
// command at a time from the current state (no randomness of its own), so
// bot-vs-bot matches are reproducible and make good test fixtures.

import {
  HEXES, attackGoal, hexDist, cy, segHex, hexSegs,
  reach, passTargets, laneThreats, inHex, carrier, hexOf,
  type State, type Command, type Player, type TeamId,
} from "../engine/index.ts";

const forward = (t: TeamId, h: number) => (t === "K" ? cy(h) : -cy(h));
const goalDist = (t: TeamId, h: number) => Math.min(...attackGoal(t).map(g => hexDist(h, g)));

export function botCommand(s: State): Command {
  const team = s.turn, mine = s.players.filter(p => p.team === team);
  const c = carrier(s);
  if (s.ap <= 0) return { t: "end" };

  if (c && c.team === team) {
    const bh = s.ball.hex;
    // Shoot when close and the lane is clear enough: aim at the goal spot farthest from the keeper.
    if (goalDist(team, bh) <= 3) {
      const gk = s.players.find(p => p.team !== team && p.role === "GK")!;
      const shots = attackGoal(team).filter(g => hexDist(bh, g) <= 5)
        .map(g => ({ g, threats: laneThreats(s, team, bh, g).length, gk: hexDist(hexOf(gk), g) }))
        .sort((a, b) => a.threats - b.threats || b.gk - a.gk || a.g - b.g);
      if (shots.length && shots[0].threats <= 1) return { t: "shot", p: c.num, hex: shots[0].g };
    }
    // Pass forward to a free teammate with a clear lane.
    const targets = new Set(passTargets(s, c));
    const passes = mine.filter(m => m !== c && targets.has(hexOf(m)))
      .filter(m => !inHex(s, hexOf(m)).some(x => x.team !== team) && laneThreats(s, team, bh, hexOf(m)).length === 0)
      .map(m => ({ m, gain: forward(team, hexOf(m)) - forward(team, bh) }))
      .sort((a, b) => b.gain - a.gain || a.m.num - b.m.num);
    if (passes.length && passes[0].gain >= 6) return { t: "pass", p: c.num, to: passes[0].m.num };
    // Dribble forwards, avoiding hexagons with opponents, keeping one AP back.
    const { cost } = reach(s, c, Math.max(1, Math.min(3, s.ap - 1)));
    let best: number | null = null, bestScore = forward(team, bh) * 10;
    for (const [seg, k] of cost) {
      const h = segHex(seg);
      if (h === bh || inHex(s, h).some(x => x.team !== team)) continue;
      const score = forward(team, h) * 10 - goalDist(team, h) * 5 - k;
      if (score > bestScore) { bestScore = score; best = seg; }
    }
    if (best !== null) return { t: "move", p: c.num, seg: best };
    // Make a run: the nearest teammate moves up into open space to offer a pass.
    if (s.ap >= 3) {
      const runner = mine.filter(m => m !== c && m.role !== "GK")
        .sort((a, b) => hexDist(hexOf(a), bh) - hexDist(hexOf(b), bh) || a.num - b.num)
        .find(m => forward(team, hexOf(m)) <= forward(team, bh) + 12);
      if (runner) {
        const r = reach(s, runner, 2).cost;
        let rb: number | null = null, rs = forward(team, hexOf(runner));
        for (const [seg] of r) {
          const h = segHex(seg);
          if (inHex(s, h).some(x => x.team !== team) || hexDist(h, bh) > 4) continue;
          if (forward(team, h) > rs) { rs = forward(team, h); rb = seg; }
        }
        if (rb !== null) return { t: "move", p: runner.num, seg: rb };
      }
    }
    // Keep the ball moving: any free teammate with a clear lane, most advanced first.
    if (passes.length && passes[0].gain >= -6) return { t: "pass", p: c.num, to: passes[0].m.num };
    return reserveOrEnd(s, mine);
  }

  const bh = s.ball.hex;
  // Tackle the carrier if someone is already next to him.
  if (c) {
    const tackler = mine.filter(m => hexOf(m) === bh && !s.beaten.includes(m.id)).sort((a, b) => b.st.tack - a.st.tack || a.num - b.num)[0];
    if (tackler) return { t: "tackle", p: tackler.num, target: c.num };
  }
  // Otherwise send the closest outfield player who can reach the ball's hexagon, leaving 1 AP to act.
  const chasers = mine.filter(m => (m.role !== "GK" || hexDist(hexOf(m), bh) <= 1) && (hexOf(m) !== bh || !c))
    .map(m => {
      const { cost } = reach(s, m, c ? s.ap - 1 : s.ap);
      const segs = hexSegs(bh).filter(x => cost.has(x)).sort((a, b) => cost.get(a)! - cost.get(b)! || a - b);
      return { m, seg: segs[0], k: segs.length ? cost.get(segs[0])! : Infinity };
    })
    .filter(x => x.seg !== undefined && (c ? s.ap - x.k >= 1 : true))
    .sort((a, b) => a.k - b.k || a.m.num - b.m.num);
  if (chasers.length) return { t: "move", p: chasers[0].m.num, seg: chasers[0].seg };
  // Close in on the ball with the nearest player when nobody can reach it this turn.
  const near = mine.filter(m => m.role !== "GK" && hexOf(m) !== bh)
    .sort((a, b) => hexDist(hexOf(a), bh) - hexDist(hexOf(b), bh) || a.num - b.num)[0];
  if (near && s.ap > 2 && hexDist(hexOf(near), bh) > 1) {
    const { cost } = reach(s, near, Math.min(3, s.ap - 2));
    let best: number | null = null, bd = hexDist(hexOf(near), bh);
    for (const [seg] of cost) { const d = hexDist(segHex(seg), bh); if (d < bd) { bd = d; best = seg; } }
    if (best !== null) return { t: "move", p: near.num, seg: best };
  }
  return reserveOrEnd(s, mine);
}

/** Spend what's left on reserves for the players nearest the ball, then end the turn. */
function reserveOrEnd(s: State, mine: Player[]): Command {
  const bh = s.ball.hex;
  const r = mine.filter(m => m.reserve < 2 && HEXES[hexOf(m)].kind === "field")
    .sort((a, b) => hexDist(hexOf(a), bh) - hexDist(hexOf(b), bh) || a.num - b.num)[0];
  if (s.ap > 0 && r && hexDist(hexOf(r), bh) <= 3) return { t: "reserve", p: r.num };
  return { t: "end" };
}

/** Play the side to move's whole turn with the bot. Returns the notation of what was played. */
export function botTurn(m: { state: State; play(c: Command): { text: string } }, limit = 40): string[] {
  const team = m.state.turn, no = m.state.turnNo, out: string[] = [];
  while (!m.state.over && m.state.turn === team && m.state.turnNo === no && out.length < limit) {
    out.push(m.play(botCommand(m.state)).text);
  }
  if (!m.state.over && m.state.turn === team && m.state.turnNo === no) out.push(m.play({ t: "end" }).text);
  return out;
}
