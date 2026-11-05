// odds.ts: exact chances from the dice, mirroring the formulas in rules.ts,
// and an analysis of the side to move's real options (shots, passes, through
// balls, dribbles, runs, pressing). The coach shows these to the model so it
// doesn't have to do hex geometry or probability in its head.
//
// Keep the formulas in step with rules.ts: when a rule changes, change it here too.

import {
  HEXES, attackGoal, GOAL, hexDist, segHex, segName, hexName, hexSegs,
  reach, passTargets, laneThreats, inHex, carrier, hexOf,
  type State, type Player, type TeamId,
} from "../engine/index.ts";
import { passNeed } from "../engine/index.ts";
import { targetHex, shapeOff, stepTowards } from "./shape.ts";

/** P(a + d6 > d + d6) and P(tie). */
export function duelOdds(a: number, d: number): { win: number; tie: number } {
  let win = 0, tie = 0;
  for (let i = 1; i <= 6; i++) for (let j = 1; j <= 6; j++) { if (a + i > d + j) win++; else if (a + i === d + j) tie++; }
  return { win: win / 36, tie: tie / 36 };
}

const majority = (s: State, h: number, team: TeamId, extra: Player[] = []) => {
  const ps = [...inHex(s, h), ...extra], mine = ps.filter(p => p.team === team).length;
  return mine > ps.length - mine ? 1 : 0;
};
export const goalDist = (team: TeamId, h: number) => Math.min(...attackGoal(team).map(g => hexDist(h, g)));
export const ownGoalDist = (team: TeamId, h: number) => Math.min(...GOAL[team].map(g => hexDist(h, g)));

/** Chance a ball from `from` to `to` gets past every opponent in (or near) the lane. */
/** The chance a pass of `dist` spots by a player with passing `pas` lands where it's aimed (rules 0.4). */
export function accuracy(pas: number, dist: number): number {
  const x = passNeed(dist) - pas;           // the d6 needs at least x
  return Math.max(0, Math.min(1, (7 - x) / 6));
}

/**
 * The chance a pass (or shot) gets to spot `to`: for passes, accuracy (it lands where it's aimed)
 * times getting past every opponent in the lane. Stray passes are counted as lost: sometimes a
 * teammate picks one up, so this errs on the safe side. `clear` is the lane part alone.
 */
export function laneSafety(s: State, p: Player, from: number, to: number, shot: boolean): { safe: number; threats: string[]; acc: number; clear: number } {
  const dist = hexDist(from, to), skill = shot ? p.st.sho : p.st.pas;
  const acc = shot ? 1 : accuracy(p.st.pas, dist);
  let safe = 1;
  const threats: string[] = [];
  for (const { p: x, react } of laneThreats(s, p.team, from, to)) {
    const a = skill + 1 - (dist >= 4 ? 1 : 0);
    const d = x.st.def - (react ? 1 : 0) + (x.role === "GK" && shot ? x.st.kee - x.st.def : 0);
    const cut = 1 - duelOdds(a, d).win - duelOdds(a, d).tie; // defender strictly higher
    safe *= 1 - cut;
    threats.push(`${x.id}${react ? "(reserve)" : ""} ${pct(cut)}`);
  }
  return { safe: safe * acc, threats, acc, clear: safe };
}

export const pct = (x: number) => `${Math.round(x * 100)}%`;

/**
 * Everything about one pass or shot from the ball's spot by its carrier `p` to
 * spot `to`: the chance it gets past the lane, who threatens it, and what waits
 * at the end (a teammate, a contest, an opponent, empty space, or the keeper).
 */
export function passOdds(s: State, p: Player, to: number) {
  const team = p.team, from = s.ball.hex, shot = attackGoal(team).includes(to);
  const lane = laneSafety(s, p, from, to, shot);
  const here = inHex(s, to).filter(x => x !== p);
  const mates = here.filter(x => x.team === team), opps = here.filter(x => x.team !== team);
  let arrive = lane.safe, goal: number | undefined, keeper = "";
  if (shot) {
    const gk = s.players.find(x => x.team !== team && x.role === "GK")!;
    const gd = hexDist(hexOf(gk), to), dist = hexDist(from, to);
    let g = 1;
    if (gd <= 1) { g = duelOdds(p.st.sho - Math.max(0, dist - 2), gk.st.kee + (gd === 0 ? 1 : 0)).win; keeper = gd === 0 ? "the keeper is on that spot" : "the keeper is next to it"; }
    else keeper = "the keeper can’t reach it";
    goal = lane.safe * g;
  } else if (opps.length && mates.length) {
    arrive *= duelOdds(mates[0].st.dri + edge(mates[0], opps[0]), opps[0].st.def + majority(s, to, opps[0].team) + edge(opps[0], mates[0])).win;
  } else if (opps.length) arrive = 0;
  return { shot, lane: lane.clear, acc: lane.acc, threats: lane.threats, arrive, goal, keeper, mates: mates.map(x => x.id), opps: opps.map(x => x.id) };
}
/** The PHY edge in duels: +1 for the physically stronger of the two. */
const edge = (a: Player, b: Player) => (a.st.phy > b.st.phy ? 1 : 0);

export interface Option {
  kind: string; cmd: string; text: string; score: number;
  to?: number;   // the spot it ends up on (attacking options)
  p?: number;    // the chance it works
  by?: string;   // the player who ends up on `to` with the ball
}

/**
 * The side to move's most useful options, best first within each kind.
 * score is a rough value used only for ordering: chance of success weighted by
 * how much closer it gets the ball to goal.
 */
export function analyze(s: State): { summary: string; options: Option[]; all: Option[] } {
  const team = s.turn, c = carrier(s), opts: Option[] = [];
  const mine = s.players.filter(p => p.team === team);
  const bh = s.ball.hex;
  const keeper = s.players.find(p => p.team !== team && p.role === "GK")!;

  if (c && c.team === team) {
    const g0 = goalDist(team, bh), targets = new Set(passTargets(s, c));
    // Shots
    for (const g of attackGoal(team).filter(x => targets.has(x))) {
      const lane = laneSafety(s, c, bh, g, true);
      const gd = hexDist(hexOf(keeper), g), dist = hexDist(bh, g);
      let goal = 1, save = "keeper can't reach it";
      if (gd <= 1) {
        const o = duelOdds(c.st.sho - Math.max(0, dist - 2), keeper.st.kee + (gd === 0 ? 1 : 0));
        goal = o.win; save = `keeper ${gd === 0 ? "on that spot" : "next to it"}`;
      }
      const p = lane.safe * goal;
      opts.push({ kind: "shot", cmd: `#${c.num}>>${hexName(g)}`, score: p * 10, to: g, p, by: c.id,
        text: `shot #${c.num}>>${hexName(g)}: GOAL ${pct(p)} (${save}${lane.threats.length ? `; lane: ${lane.threats.join(", ")}` : ""})` });
    }
    // Passes to feet
    for (const m of mine.filter(x => x !== c && targets.has(hexOf(x)))) {
      const h = hexOf(m), lane = laneSafety(s, c, bh, h, false);
      const opp = inHex(s, h).filter(x => x.team !== team);
      let keep = lane.safe;
      if (opp.length) keep *= duelOdds(m.st.dri + edge(m, opp[0]), opp[0].st.def + majority(s, h, opp[0].team) + edge(opp[0], m)).win;
      const g1 = goalDist(team, h);
      opts.push({ kind: "pass", cmd: `#${c.num}>#${m.num}`, score: keep * (g0 - g1 + 1), to: h, p: keep, by: m.id,
        text: `pass #${c.num}>#${m.num} (to spot ${hexName(h)}, ${g1} from goal, ${g0 - g1 >= 0 ? "+" : ""}${g0 - g1}): arrives ${pct(keep)} (on target ${pct(lane.acc)})${lane.threats.length ? `; lane: ${lane.threats.join(", ")}` : ""}${opp.length ? `; marked by ${opp.map(x => x.id).join(" ")}` : ""}` });
    }
    // Through balls: an empty spot closer to goal that a teammate can reach this turn after the pass
    for (const h of [...targets].filter(x => HEXES[x].kind === "field" && inHex(s, x).length === 0 && goalDist(team, x) < g0)) {
      const lane = laneSafety(s, c, bh, h, false);
      if (lane.safe < 0.5) continue;
      let best: { p: Player; k: number } | null = null;
      for (const m of mine.filter(x => x !== c && x.role !== "GK")) {
        const { cost } = reach(s, m, Math.max(0, s.ap - 1));
        const k = Math.min(...hexSegs(h).map(x => cost.get(x) ?? Infinity));
        if (k < Infinity && (!best || k < best.k)) best = { p: m, k };
      }
      if (!best) continue;
      const pounce = s.players.filter(x => x.team !== team && x.reserve > 0 && hexDist(hexOf(x), h) <= 1).map(x => x.id);
      const ok = lane.safe * (pounce.length ? 0.1 : 1);
      opts.push({ kind: "through", cmd: `#${c.num}>${hexName(h)} then #${best.p.num}-${hexName(h)}`, score: ok * (g0 - goalDist(team, h) + 1) * 0.9, to: h, p: ok, by: best.p.id,
        text: `through ball #${c.num}>${hexName(h)} (${goalDist(team, h)} from goal), then #${best.p.num}-${hexName(h)} for ${best.k} AP: gets there ${pct(lane.safe)} (on target ${pct(lane.acc)})${pounce.length ? `; DANGER reserves ${pounce.join(" ")} will pounce on it` : ""}` });
    }
    // Dribbles: spots closer to goal, with the chance of getting through every duel on the way
    const { cost, path: pathTo } = reach(s, c, Math.max(1, s.ap - 1));
    const bestBySpot = new Map<number, { seg: number; k: number; p: number }>();
    for (const [seg, k] of cost) {
      const h = segHex(seg);
      if (goalDist(team, h) >= g0) continue;
      let p = 1, last = bh;
      const path = pathTo(seg);
      for (const step of path) {
        const sh = segHex(step);
        if (sh === last) continue;
        last = sh;
        for (const d of inHex(s, sh).filter(x => x.team !== team)) p *= duelOdds(c.st.dri + edge(c, d), d.st.def + majority(s, sh, d.team, [c]) + edge(d, c)).win;
        const press = s.players.filter(x => x.team !== team && x.reserve > 0 && hexDist(hexOf(x), sh) === 1).length;
        for (let i = 0; i < press; i++) p *= duelOdds(c.st.dri, 3 + 1).win; // a press: a typical defender 3, +1
      }
      const cur = bestBySpot.get(h);
      if (!cur || p > cur.p || (p === cur.p && k < cur.k)) bestBySpot.set(h, { seg, k, p });
    }
    for (const [h, { seg, k, p }] of bestBySpot) {
      const g1 = goalDist(team, h);
      opts.push({ kind: "dribble", cmd: `#${c.num}-${segName(seg)}`, score: p * (g0 - g1) * 1.1, to: h, p, by: c.id,
        text: `dribble #${c.num}-${segName(seg)} (${k} AP, to spot ${hexName(h)}, ${g1} from goal): keeps it ${pct(p)}` });
    }
    // Runs: teammates moving into open space ahead of the ball, within passing range
    for (const m of mine.filter(x => x !== c && x.role !== "GK")) {
      const { cost: rc } = reach(s, m, Math.min(3, Math.max(0, s.ap - 2)));
      let best: { seg: number; k: number; g: number } | null = null;
      for (const [seg, k] of rc) {
        const h = segHex(seg);
        if (inHex(s, h).some(x => x.team !== team) || hexDist(h, bh) > 5 || hexDist(h, bh) < 1) continue;
        const g = goalDist(team, h);
        if (g < goalDist(team, hexOf(m)) && g < g0 + 1 && (!best || g < best.g || (g === best.g && k < best.k))) best = { seg, k, g };
      }
      if (best) {
        const lane = laneSafety(s, c, bh, segHex(best.seg), false);
        opts.push({ kind: "run", cmd: `#${m.num}-${segName(best.seg)}`, score: lane.safe * (g0 - best.g + 1) * 0.5,
          text: `run #${m.num}-${segName(best.seg)} (${best.k} AP, to spot ${hexName(segHex(best.seg))}, ${best.g} from goal): then a pass to him arrives ${pct(lane.safe)}` });
      }
    }
  } else if (c) {
    // Defending. Tackling one-on-one is usually a bad bet (a forward dribbles 4, most players tackle 2-3),
    // so the options also offer doubling up for the majority bonus, and blocking his passing lanes.
    const reachTo = (m: Player, budget: number) => {
      if (hexOf(m) === bh) return { k: 0, seg: m.seg };
      const { cost } = reach(s, m, Math.max(0, budget));
      const segs = hexSegs(bh).filter(x => cost.has(x)).sort((a, b) => cost.get(a)! - cost.get(b)! || a - b);
      return segs.length ? { k: cost.get(segs[0])!, seg: segs[0] } : null;
    };
    const fresh = mine.filter(m => !s.beaten.includes(m.id));
    for (const m of fresh) {
      const r = reachTo(m, s.ap - 1);
      if (!r) continue;
      const inIt = r.k === 0;
      const o = duelOdds(m.st.def + majority(s, bh, team, inIt ? [] : [m]) + edge(m, c), c.st.dri + edge(c, m));
      opts.push({ kind: "press", cmd: inIt ? `#${m.num}x#${c.num}` : `#${m.num}-${segName(r.seg)} then #${m.num}x#${c.num}`,
        score: (o.win + o.tie * 0.5) * 6 + 0.5 - r.k * 0.35,
        text: `${inIt ? "tackle" : "close down and tackle"} ${inIt ? `#${m.num}x#${c.num}` : `#${m.num}-${segName(r.seg)} (${r.k} AP) then #${m.num}x#${c.num}`}: wins it ${pct(o.win)}, knocks it loose ${pct(o.tie)}` });
    }
    // Double up: a second player into the spot first, then the better tackler goes in with +1.
    const helpers = fresh.map(m => ({ m, r: reachTo(m, s.ap - 2) })).filter(x => x.r && x.r.k > 0) as { m: Player; r: { k: number; seg: number } }[];
    const inSpot = fresh.filter(m => hexOf(m) === bh);
    const pairs: { a: Player; b: Player; cmds: string[]; k: number }[] = [];
    for (const t of inSpot) for (const h of helpers) pairs.push({ a: t, b: h.m, cmds: [`#${h.m.num}-${segName(h.r.seg)}`, `#${t.num}x#${c.num}`], k: h.r.k });
    for (const h1 of helpers) for (const h2 of helpers) {
      if (h1.m === h2.m || h1.r.seg === h2.r.seg || h1.r.k + h2.r.k + 1 > s.ap || h1.m.st.def < h2.m.st.def) continue;
      pairs.push({ a: h1.m, b: h2.m, cmds: [`#${h2.m.num}-${segName(h2.r.seg)}`, `#${h1.m.num}-${segName(h1.r.seg)}`, `#${h1.m.num}x#${c.num}`], k: h1.r.k + h2.r.k });
    }
    for (const pr of pairs) {
      const extra = [pr.a, pr.b].filter(x => hexOf(x) !== bh);
      const maj = majority(s, bh, team, extra);
      if (!maj) continue;
      const o = duelOdds(pr.a.st.def + 1 + edge(pr.a, c), c.st.dri + edge(c, pr.a));
      opts.push({ kind: "double", cmd: pr.cmds.join(" then "), score: (o.win + o.tie * 0.5) * 6 - pr.k * 0.4,
        text: `double up: ${pr.cmds.join(", ")} (${pr.k + 1} AP): with the majority, wins it ${pct(o.win)}, knocks it loose ${pct(o.tie)}` });
    }
    // Block the lane: step into the line of his best forward passes, so the pass can be cut out.
    const theirTargets = s.players.filter(x => x.team === c.team && x !== c && hexDist(bh, hexOf(x)) <= 5)
      .map(x => ({ x, gain: ownGoalDist(team, bh) - ownGoalDist(team, hexOf(x)) }))
      .filter(t => t.gain >= 1).sort((a, b) => b.gain - a.gain || a.x.num - b.x.num).slice(0, 3);
    for (const { x: t, gain } of theirTargets) {
      const th = hexOf(t);
      if (laneThreats(s, c.team, bh, th).some(z => !z.react)) continue; // already covered
      let best: { m: Player; seg: number; k: number } | null = null;
      for (const m of mine.filter(z => z.role !== "GK")) {
        const { cost } = reach(s, m, Math.min(3, s.ap));
        for (const [seg, k] of cost) {
          if (best && k >= best.k) continue;
          const old = m.seg; m.seg = seg;
          const blocks = laneThreats(s, c.team, bh, th).some(z => z.p === m && !z.react);
          m.seg = old;
          if (blocks) best = { m, seg, k };
        }
      }
      if (best) opts.push({ kind: "block", cmd: `#${best.m.num}-${segName(best.seg)}`, score: gain * 0.6 + 0.5 - best.k * 0.2,
        text: `block the pass to ${t.id} (${gain} spots nearer your goal): #${best.m.num}-${segName(best.seg)} (${best.k} AP) stands in that lane` });
    }
    // Reserve spots: players next to the ball
    const near = mine.filter(m => hexDist(hexOf(m), bh) <= 1 && m.reserve < 2).map(m => `#${m.num}+`);
    if (near.length) opts.push({ kind: "reserve", cmd: near.join(" "), score: 0.5, text: `reserves next to the ball (they press his next dribble and pounce on loose balls): ${near.join(" ")}` });
  } else {
    for (const m of mine) {
      const { cost } = reach(s, m);
      const k = Math.min(...hexSegs(bh).map(x => cost.get(x) ?? Infinity));
      if (k < Infinity) opts.push({ kind: "loose", cmd: `#${m.num}-${hexName(bh)}`, score: 10 - k, text: `win the loose ball: #${m.num}-${hexName(bh)} (${k} AP)` });
    }
  }

  // Shape: moves that bring players towards their target spots in the formation's mid-game shape.
  // Worth more the further the side is out of shape, and early in each half (after kick-offs).
  const off = shapeOff(s, team), half = Math.floor(s.maxTurns / 2);
  const intoHalf = s.turnNo <= half ? s.turnNo : s.turnNo - half;
  // Only with the ball: the target shapes are attacking shapes, and pushing up without it opens gaps.
  // (Measured: shape moves without the ball made the advisor lose to one without them.)
  const weight = (off > 10 ? 1.4 : off > 4 ? 1 : 0.6) * (intoHalf <= 6 ? 1.3 : 1);
  if (c && c.team === team) for (const m of mine) {
    if (m.role === "GK" || m.id === s.ball.owner) continue;
    const t = targetHex(s, m), d0 = hexDist(hexOf(m), t);
    if (d0 === 0) continue;
    const st = stepTowards(s, m, t);
    if (!st) continue;
    opts.push({ kind: "shape", cmd: `#${m.num}-${segName(st.seg)}`, score: 0.5 * (d0 - st.d) * weight - 0.15 * st.cost,
      text: `shape #${m.num}-${segName(st.seg)} (${m.role}, ${st.cost} AP): ${d0} → ${st.d} spots from his target spot ${hexName(t)}` });
  }

  const top: Option[] = [];
  for (const kind of ["shot", "pass", "through", "dribble", "run", "double", "press", "block", "shape", "reserve", "loose"]) {
    top.push(...opts.filter(o => o.kind === kind).sort((a, b) => b.score - a.score || a.cmd.localeCompare(b.cmd)).slice(0, kind === "shot" ? 3 : 5));
  }
  const best = opts.slice().sort((a, b) => b.score - a.score)[0];
  const summary = c
    ? c.team === team
      ? `You have the ball: #${c.num} on spot ${hexName(bh)}, ${goalDist(team, bh)} spots from the goal you attack.`
      : `They have the ball: ${c.id} on spot ${hexName(bh)}, ${ownGoalDist(team, bh)} spots from your goal.`
    : `The ball is loose on spot ${hexName(bh)}.`;
  return { summary: summary + (best ? ` Highest-value option: ${best.cmd}.` : ""), options: top, all: opts };
}

