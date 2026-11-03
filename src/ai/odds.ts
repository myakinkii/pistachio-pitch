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
export function laneSafety(s: State, p: Player, from: number, to: number, shot: boolean): { safe: number; threats: string[] } {
  const dist = hexDist(from, to), skill = shot ? p.st.shoot : p.st.pass;
  let safe = 1;
  const threats: string[] = [];
  for (const { p: x, react } of laneThreats(s, p.team, from, to)) {
    const a = skill + 1 - (dist >= 4 ? 1 : 0);
    const d = x.st.tack - (react ? 1 : 0) + (x.role === "GK" && shot ? x.st.keep - x.st.tack : 0);
    const cut = 1 - duelOdds(a, d).win - duelOdds(a, d).tie; // defender strictly higher
    safe *= 1 - cut;
    threats.push(`${x.id}${react ? "(reserve)" : ""} ${pct(cut)}`);
  }
  return { safe, threats };
}

export const pct = (x: number) => `${Math.round(x * 100)}%`;

export interface Option { kind: string; cmd: string; text: string; score: number }

/**
 * The side to move's most useful options, best first within each kind.
 * score is a rough value used only for ordering: chance of success weighted by
 * how much closer it gets the ball to goal.
 */
export function analyze(s: State): { summary: string; options: Option[] } {
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
        const o = duelOdds(c.st.shoot - Math.max(0, dist - 3), keeper.st.keep + (gd === 0 ? 1 : -1));
        goal = o.win; save = `keeper ${gd === 0 ? "on that spot" : "next to it"}`;
      }
      const p = lane.safe * goal;
      opts.push({ kind: "shot", cmd: `#${c.num}>>${hexName(g)}`, score: p * 10,
        text: `shot #${c.num}>>${hexName(g)}: GOAL ${pct(p)} (${save}${lane.threats.length ? `; lane: ${lane.threats.join(", ")}` : ""})` });
    }
    // Passes to feet
    for (const m of mine.filter(x => x !== c && targets.has(hexOf(x)))) {
      const h = hexOf(m), lane = laneSafety(s, c, bh, h, false);
      const opp = inHex(s, h).filter(x => x.team !== team);
      let keep = lane.safe;
      if (opp.length) keep *= duelOdds(m.st.ctrl, opp[0].st.tack + majority(s, h, opp[0].team)).win;
      const g1 = goalDist(team, h);
      opts.push({ kind: "pass", cmd: `#${c.num}>#${m.num}`, score: keep * (g0 - g1 + 1),
        text: `pass #${c.num}>#${m.num} (to spot ${hexName(h)}, ${g1} from goal, ${g0 - g1 >= 0 ? "+" : ""}${g0 - g1}): arrives ${pct(keep)}${lane.threats.length ? `; lane: ${lane.threats.join(", ")}` : ""}${opp.length ? `; marked by ${opp.map(x => x.id).join(" ")}` : ""}` });
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
      opts.push({ kind: "through", cmd: `#${c.num}>${hexName(h)} then #${best.p.num}-${hexName(h)}`, score: ok * (g0 - goalDist(team, h) + 1) * 0.9,
        text: `through ball #${c.num}>${hexName(h)} (${goalDist(team, h)} from goal), then #${best.p.num}-${hexName(h)} for ${best.k} AP: lane ${pct(lane.safe)}${pounce.length ? `; DANGER reserves ${pounce.join(" ")} will pounce on it` : ""}` });
    }
    // Dribbles: spots closer to goal, with the chance of getting through every duel on the way
    const { cost, prev } = reach(s, c, Math.max(1, s.ap - 1));
    const bestBySpot = new Map<number, { seg: number; k: number; p: number }>();
    for (const [seg, k] of cost) {
      const h = segHex(seg);
      if (goalDist(team, h) >= g0) continue;
      let p = 1, last = bh;
      const path: number[] = [];
      for (let x = seg; x !== c.seg; x = prev.get(x)!) path.unshift(x);
      for (const step of path) {
        const sh = segHex(step);
        if (sh === last) continue;
        last = sh;
        for (const d of inHex(s, sh).filter(x => x.team !== team)) p *= duelOdds(c.st.drib, d.st.tack + majority(s, sh, d.team, [c])).win;
        const press = s.players.filter(x => x.team !== team && x.reserve > 0 && hexDist(hexOf(x), sh) === 1).length;
        for (let i = 0; i < press; i++) p *= duelOdds(c.st.drib, 3 + 1).win; // a press: a typical tackle 3, +1
      }
      const cur = bestBySpot.get(h);
      if (!cur || p > cur.p || (p === cur.p && k < cur.k)) bestBySpot.set(h, { seg, k, p });
    }
    for (const [h, { seg, k, p }] of bestBySpot) {
      const g1 = goalDist(team, h);
      opts.push({ kind: "dribble", cmd: `#${c.num}-${segName(seg)}`, score: p * (g0 - g1) * 1.1,
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
    // Defending: who can get to the carrier, and the odds of the tackle
    for (const m of mine) {
      const inIt = hexOf(m) === bh;
      const { cost } = reach(s, m, Math.max(0, s.ap - 1));
      const k = inIt ? 0 : Math.min(...hexSegs(bh).map(x => cost.get(x) ?? Infinity));
      if (k === Infinity || s.beaten.includes(m.id)) continue;
      const o = duelOdds(m.st.tack + majority(s, bh, team, inIt ? [] : [m]), c.st.drib);
      const seg = inIt ? m.seg : hexSegs(bh).filter(x => cost.get(x) === k).sort((a, b) => a - b)[0];
      opts.push({ kind: "press", cmd: inIt ? `#${m.num}x#${c.num}` : `#${m.num}-${segName(seg)} then #${m.num}x#${c.num}`, score: (o.win + o.tie * 0.5) * 6 + 1 - k * 0.2,
        text: `${inIt ? "tackle" : "close down and tackle"} ${inIt ? `#${m.num}x#${c.num}` : `#${m.num}-${segName(seg)} (${k} AP) then #${m.num}x#${c.num}`}: wins it ${pct(o.win)}, knocks it loose ${pct(o.tie)}` });
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

  const top: Option[] = [];
  for (const kind of ["shot", "pass", "through", "dribble", "run", "press", "reserve", "loose"]) {
    top.push(...opts.filter(o => o.kind === kind).sort((a, b) => b.score - a.score || a.cmd.localeCompare(b.cmd)).slice(0, kind === "shot" ? 3 : 5));
  }
  const best = opts.slice().sort((a, b) => b.score - a.score)[0];
  const summary = c
    ? c.team === team
      ? `You have the ball: #${c.num} on spot ${hexName(bh)}, ${goalDist(team, bh)} spots from the goal you attack.`
      : `They have the ball: ${c.id} on spot ${hexName(bh)}, ${ownGoalDist(team, bh)} spots from your goal.`
    : `The ball is loose on spot ${hexName(bh)}.`;
  return { summary: summary + (best ? ` Highest-value option: ${best.cmd}.` : ""), options: top };
}

