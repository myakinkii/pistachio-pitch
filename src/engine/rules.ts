// rules.ts: the state of a match and how commands change it.
//
// One side acts at a time, spending action points (AP). Commands only state
// intent; contests are resolved the moment they happen, with dice and both
// players' stats:
//   - a dribble step into a hexagon with opponents: dribbling against tackling
//   - a pass or shot: each opponent in the lane may cut it out, then the ball
//     arrives (control, reception duel, loose, or lost) or the keeper saves it
//   - a tackle: tackling against dribbling
// The defending side acts through reserves: AP put on a player during their own
// turn, fired automatically when the opponent contests the ball within reach.
// Losing the ball through your own action is a turnover and ends your turn.

import {
  HEXES, CENTER, CENTRE_RING, KEEPER_HEX, GOAL, attackGoal, other, hexAt,
  segHex, segNbrs, segExists, segIsGoal, hexSegs, hexDist, hexNbrs, cx, cy, segX, segY,
  segName, hexName, type TeamId,
} from "./geometry.ts";
import { Dice, seedState } from "./rng.ts";

export const RULES_VERSION = "0.1";
export const PASS_RANGE = 5;
export const MAX_RESERVE = 2;

export type Role = "GK" | "D" | "M" | "F";
export interface Stats { pass: number; drib: number; tack: number; shoot: number; ctrl: number; keep: number }
export interface Player { id: string; team: TeamId; num: number; role: Role; seg: number; reserve: number; st: Stats }
export interface State {
  rules: string;
  seed: string;
  rng: number;
  apPerTurn: number;
  maxTurns: number;
  turnNo: number;        // 1-based, counts both sides' turns
  turn: TeamId;
  ap: number;
  firstKick: TeamId;
  score: Record<TeamId, number>;
  ball: { hex: number; owner: string | null };
  players: Player[];
  beaten: string[];      // players who lost a tackle this turn and can't tackle again until next turn
  over: boolean;
}
export interface Options { seed?: string; ap?: number; turns?: number; firstKick?: TeamId }

export type Command =
  | { t: "move"; p: number; seg?: number; hex?: number }
  | { t: "pass"; p: number; hex?: number; to?: number }
  | { t: "shot"; p: number; hex: number }
  | { t: "tackle"; p: number; target: number }
  | { t: "reserve"; p: number }
  | { t: "end"; timeout?: boolean };

/** What happened, in order. Formatted into the notation's {...} results and into commentary. */
export type Ev =
  | { e: "duel"; kind: "dribble" | "press" | "tackle" | "receive"; att: string; def: string; a: number; d: number; out: "win" | "tie" | "lose" }
  | { e: "stopped"; pid: string; at: number }
  | { e: "pickup"; pid: string; hex: number }
  | { e: "intercept"; pid: string; a: number; d: number; react: boolean }
  | { e: "lane"; pid: string; a: number; d: number; react: boolean }   // a lane threat that failed
  | { e: "received"; pid: string }
  | { e: "loose"; hex: number }
  | { e: "lost"; pid: string }
  | { e: "saved"; pid: string; a: number; d: number }
  | { e: "parried"; pid: string; a: number; d: number; hex: number }
  | { e: "beaten"; pid: string; a: number; d: number }
  | { e: "goal"; team: TeamId; pid: string; hex: number }
  | { e: "react"; pid: string; seg: number }      // a reserve fired: the player stepped in
  | { e: "turnover" }
  | { e: "endturn"; timeout: boolean }
  | { e: "halftime" }
  | { e: "fulltime" }
  | { e: "kickoff"; team: TeamId };

export class RuleError extends Error {}

// ---------- setup ----------

const ROLE_STATS: Record<Role, Stats> = {
  GK: { pass: 2, drib: 1, tack: 2, shoot: 1, ctrl: 3, keep: 4 },
  D: { pass: 3, drib: 2, tack: 4, shoot: 2, ctrl: 3, keep: 0 },
  M: { pass: 4, drib: 3, tack: 3, shoot: 3, ctrl: 4, keep: 0 },
  F: { pass: 3, drib: 4, tack: 2, shoot: 4, ctrl: 3, keep: 0 },
};
// role, x fraction of the width, y fraction of the team's own half
const FORM: readonly [Role, number, number][] = [
  ["GK", .5, 0],
  ["D", .08, .24], ["D", .35, .18], ["D", .65, .18], ["D", .92, .24],
  ["M", .08, .56], ["M", .35, .5], ["M", .65, .5], ["M", .92, .56],
  ["F", .36, .8], ["F", .64, .8],
];
const HALF_Y = cy(CENTER); // 33: the halfway line in integer Y units
const WIDTH_X = 18;        // columns 0..6

/** Put both teams in kick-off positions; `kick` takes the kick-off. */
function lineUp(state: State, kick: TeamId) {
  const used = new Set<number>([CENTER, ...CENTRE_RING]);
  const players: Player[] = [];
  for (const team of ["K", "S"] as TeamId[]) {
    const face = team === "K" ? 1 : 4; // segment pointing at the opponents' goal
    FORM.forEach(([role, fx, fy], i) => {
      const num = i + 1;
      let hex: number, seg: number;
      if (num === 1) { hex = KEEPER_HEX[team]; seg = hex * 6 + face; }
      else if (team === kick && num === 10) { hex = CENTER; seg = hex * 6 + (team === "K" ? 4 : 1); }
      else if (team === kick && num === 11) { hex = team === "K" ? hexAt(2, 5)! : hexAt(2, 6)!; seg = hex * 6 + face; }
      else {
        const X = fx * WIDTH_X, Y = team === "K" ? fy * HALF_Y : 2 * HALF_Y - fy * HALF_Y;
        let best = -1, bd = Infinity;
        for (const h of HEXES) {
          if (h.kind !== "field" || h.cut || used.has(h.id)) continue;
          const dx = cx(h.id) - X, dy = cy(h.id) - Y, d = 3 * dx * dx + dy * dy;
          if (d < bd) { bd = d; best = h.id; }
        }
        hex = best; used.add(best); seg = hex * 6 + face;
      }
      const old = state.players.find(p => p.team === team && p.num === num);
      players.push({ id: team + num, team, num, role, seg, reserve: 0, st: old ? old.st : { ...ROLE_STATS[role] } });
    });
  }
  state.players = players;
  state.beaten = [];
  state.ball = { hex: CENTER, owner: kick + "10" };
  state.turn = kick;
  state.ap = state.apPerTurn;
}

export function newState(opts: Options = {}): State {
  const seed = opts.seed ?? "pistachio";
  const s: State = {
    rules: RULES_VERSION, seed, rng: seedState(seed),
    apPerTurn: opts.ap ?? 7, maxTurns: opts.turns ?? 40,
    turnNo: 1, turn: "K", ap: 0, firstKick: opts.firstKick ?? "K",
    score: { K: 0, S: 0 }, ball: { hex: CENTER, owner: null }, players: [], beaten: [], over: false,
  };
  lineUp(s, s.firstKick);
  return s;
}

// ---------- queries ----------

export const playerById = (s: State, id: string | null) => (id ? s.players.find(p => p.id === id) : undefined);
export const playerOf = (s: State, team: TeamId, num: number) => s.players.find(p => p.team === team && p.num === num);
export const hexOf = (p: Player) => segHex(p.seg);
export const inHex = (s: State, h: number) => s.players.filter(p => hexOf(p) === h).sort((a, b) => a.num - b.num || a.id.localeCompare(b.id));
export const carrier = (s: State) => playerById(s, s.ball.owner);
function occupied(s: State) { const m = new Map<number, Player>(); for (const p of s.players) m.set(p.seg, p); return m; }

export function canEnter(p: Player, seg: number): boolean {
  if (!segExists(seg)) return false;
  if (segIsGoal(seg)) return p.role === "GK" && HEXES[segHex(seg)].goalOf === p.team;
  return true;
}

/** Segments the player can reach with `ap` steps: cost and the previous segment of the cheapest path. */
export function reach(s: State, p: Player, ap = s.ap): { cost: Map<number, number>; prev: Map<number, number> } {
  const occ = occupied(s), cost = new Map([[p.seg, 0]]), prev = new Map<number, number>(), queue = [p.seg];
  const carrying = s.ball.owner === p.id;
  while (queue.length) {
    const cur = queue.shift()!, c = cost.get(cur)!;
    if (c >= ap) continue;
    for (const n of segNbrs(cur)) {
      if (cost.has(n) || occ.has(n) || !canEnter(p, n)) continue;
      if (carrying && HEXES[segHex(n)].goalOf === p.team && segHex(n) !== segHex(cur)) continue;
      cost.set(n, c + 1); prev.set(n, cur); queue.push(n);
    }
  }
  cost.delete(p.seg);
  return { cost, prev };
}

/** Pass and shot targets from the ball's spot. */
export function passTargets(s: State, p: Player): number[] {
  const from = s.ball.hex;
  return HEXES.filter(h => h.id !== from && h.goalOf !== p.team && hexDist(from, h.id) <= PASS_RANGE).map(h => h.id);
}

// Lane test in exact integers (see geometry.ts: distance squared is 3X^2 + Y^2).
const dot = (ax: number, ay: number, bx: number, by: number) => 3 * ax * bx + ay * by;
/** Opponents who can cut out a ball from hex a to hex b, ordered along the lane. */
export function laneThreats(s: State, team: TeamId, a: number, b: number): { p: Player; react: boolean }[] {
  const Ax = cx(a), Ay = cy(a), dx = cx(b) - Ax, dy = cy(b) - Ay, dd = dot(dx, dy, dx, dy);
  const out: { p: Player; react: boolean; wd: number }[] = [];
  for (const p of s.players) {
    if (p.team === team) continue;
    const wx = segX(p.seg) - Ax, wy = segY(p.seg) - Ay, wd = dot(wx, wy, dx, dy), ww = dot(wx, wy, wx, wy);
    const perp2 = ww * dd - wd * wd;                     // (perpendicular distance)^2 * dd
    if (20 * wd > dd && 20 * wd <= 21 * dd && 2 * perp2 < 3 * dd) out.push({ p, react: false, wd });
    else if (p.reserve > 0 && wd > 0 && wd <= dd && perp2 < 40 * dd) out.push({ p, react: true, wd });
  }
  return out.sort((x, y) => x.wd - y.wd || x.p.num - y.p.num).map(({ p, react }) => ({ p, react }));
}

// ---------- applying commands ----------

export interface Applied { state: State; events: Ev[] }

/** Apply one command for the side to move. Throws RuleError if it isn't legal. Never mutates `state`. */
export function apply(state: State, cmd: Command): Applied {
  if (state.over) throw new RuleError("the match is over");
  const s: State = structuredClone(state);
  const dice = new Dice(s.rng);
  const ev: Ev[] = [];
  const team = s.turn;
  const me = (num: number) => {
    const p = playerOf(s, team, num);
    if (!p) throw new RuleError(`no player #${num}`);
    return p;
  };
  const needAp = (n: number) => { if (s.ap < n) throw new RuleError(`needs ${n} AP, ${s.ap} left`); };

  let endTurn = false;
  const hadBall = carrier(s)?.team === team;
  switch (cmd.t) {
    case "end":
      ev.push({ e: "endturn", timeout: !!cmd.timeout });
      endTurn = true;
      break;
    case "reserve": {
      const p = me(cmd.p);
      needAp(1);
      if (p.reserve >= MAX_RESERVE) throw new RuleError(`#${p.num} already holds ${MAX_RESERVE} reserves`);
      p.reserve++; s.ap--;
      break;
    }
    case "move": {
      const p = me(cmd.p);
      const { cost, prev } = reach(s, p);
      let target = cmd.seg;
      if (target === undefined) {
        if (cmd.hex === undefined) throw new RuleError("move needs a target");
        const opts = hexSegs(cmd.hex).filter(x => cost.has(x)).sort((x, y) => cost.get(x)! - cost.get(y)! || x - y);
        if (!opts.length) throw new RuleError(`#${p.num} can't reach spot ${hexName(cmd.hex)} with ${s.ap} AP`);
        target = opts[0];
        cmd.seg = target; // resolved, so the notation records the exact segment
      }
      if (!cost.has(target)) throw new RuleError(`#${p.num} can't reach ${segName(target)} with ${s.ap} AP`);
      const path: number[] = [];
      for (let x = target; x !== p.seg; x = prev.get(x)!) path.unshift(x);
      for (const step of path) {
        const fromHex = hexOf(p);
        p.seg = step; s.ap--;
        const h = segHex(step);
        if (s.ball.owner === p.id && h !== fromHex) {
          s.ball.hex = h;
          if (!dribbleContests(s, p, dice, ev)) break;
        } else if (s.ball.owner === null && h === s.ball.hex) {
          s.ball.owner = p.id; ev.push({ e: "pickup", pid: p.id, hex: h });
        }
        if (hadBall && carrier(s)?.team !== team) break; // dispossessed: the dribble ends
      }
      break;
    }
    case "pass":
    case "shot": {
      const p = me(cmd.p);
      if (s.ball.owner !== p.id) throw new RuleError(`#${p.num} doesn't have the ball`);
      needAp(1);
      let to: number;
      if (cmd.t === "pass" && cmd.to !== undefined) {
        const mate = me(cmd.to);
        if (mate === p) throw new RuleError("can't pass to yourself");
        to = hexOf(mate);
      } else to = cmd.hex!;
      if (to === s.ball.hex) throw new RuleError("the ball is already on that spot");
      if (HEXES[to].goalOf === team) throw new RuleError("that's your own goal");
      if (hexDist(s.ball.hex, to) > PASS_RANGE) throw new RuleError(`spot ${hexName(to)} is out of range (${PASS_RANGE})`);
      const shot = attackGoal(team).includes(to);
      if (cmd.t === "shot" && !shot) throw new RuleError(`spot ${hexName(to)} isn't a goal spot`);
      s.ap--;
      kick(s, p, to, shot, cmd.t === "pass" ? cmd.to : undefined, dice, ev);
      break;
    }
    case "tackle": {
      const p = me(cmd.p);
      needAp(1);
      const c = carrier(s);
      if (!c || c.team === team || c.num !== cmd.target) throw new RuleError(`#${cmd.target} of the other side doesn't have the ball`);
      if (hexOf(c) !== hexOf(p)) throw new RuleError(`#${p.num} must stand in the ball's hexagon to tackle`);
      if (s.beaten.includes(p.id)) throw new RuleError(`#${p.num} lost a tackle this turn and can't tackle again until next turn`);
      s.ap--;
      if (duel(s, "tackle", p, c, dice, ev) === "lose") s.beaten.push(p.id);
      break;
    }
  }

  const goal = ev.find(e => e.e === "goal");
  if (goal) {
    s.score[goal.team]++;
    restart(s, other(goal.team), ev);
  } else {
    const owner = carrier(s);
    if (hadBall && owner && owner.team !== team) { ev.push({ e: "turnover" }); endTurn = true; }
    if (s.ap <= 0) endTurn = true;
    if (endTurn) nextTurn(s, ev);
  }
  s.rng = dice.state;
  return { state: s, events: ev };
}

function nextTurn(s: State, ev: Ev[]) {
  s.turnNo++;
  if (s.turnNo > s.maxTurns) { s.over = true; ev.push({ e: "fulltime" }); return; }
  if (s.turnNo === Math.floor(s.maxTurns / 2) + 1) {
    ev.push({ e: "halftime" });
    lineUp(s, other(s.firstKick));
    ev.push({ e: "kickoff", team: s.turn });
    return;
  }
  s.turn = other(s.turn);
  s.ap = s.apPerTurn;
  s.beaten = [];
  for (const p of s.players) if (p.team === s.turn) p.reserve = 0; // reserves expire as your own turn begins
}

/** After a goal: the conceding side kicks off, and that counts as a new turn. */
function restart(s: State, kick: TeamId, ev: Ev[]) {
  s.turnNo++;
  if (s.turnNo > s.maxTurns) { s.over = true; ev.push({ e: "fulltime" }); return; }
  if (s.turnNo === Math.floor(s.maxTurns / 2) + 1) { ev.push({ e: "halftime" }); kick = other(s.firstKick); }
  lineUp(s, kick);
  ev.push({ e: "kickoff", team: kick });
}

const majority = (s: State, h: number, team: TeamId) => {
  const ps = inHex(s, h), mine = ps.filter(p => p.team === team).length;
  return mine > ps.length - mine ? 1 : 0;
};

/** A one-on-one. kind decides the stats; the attacker (att) is the one with the ball, except in a tackle. */
function duel(s: State, kind: "dribble" | "press" | "tackle" | "receive", att: Player, def: Player, dice: Dice, ev: Ev[]): "win" | "tie" | "lose" {
  const h = hexOf(att.id === s.ball.owner ? att : def);
  let a: number, d: number;
  if (kind === "tackle") { a = att.st.tack + dice.roll() + majority(s, h, att.team); d = def.st.drib + dice.roll(); }
  else if (kind === "receive") { a = att.st.ctrl + dice.roll(); d = def.st.tack + dice.roll() + majority(s, h, def.team); }
  else { a = att.st.drib + dice.roll(); d = def.st.tack + dice.roll() + majority(s, h, def.team) + (kind === "press" ? 1 : 0); }
  const out = a > d ? "win" : a === d ? "tie" : "lose";
  ev.push({ e: "duel", kind, att: att.id, def: def.id, a, d, out });
  if (kind === "tackle") {
    if (out === "win") s.ball.owner = att.id;
    else if (out === "tie") { s.ball.owner = null; ev.push({ e: "loose", hex: h }); looseReactions(s, dice, ev); }
  } else if (kind === "receive") {
    if (out === "win") { s.ball.owner = att.id; ev.push({ e: "received", pid: att.id }); }
    else if (out === "tie") { s.ball.owner = null; ev.push({ e: "loose", hex: h }); looseReactions(s, dice, ev); }
    else { s.ball.owner = def.id; ev.push({ e: "lost", pid: def.id }); }
  } else if (out === "lose") s.ball.owner = def.id;
  return out;
}

/**
 * The carrier just stepped into a new hexagon: every opponent there duels him,
 * then reserves within reach press. Returns false when the dribble ends here.
 */
function dribbleContests(s: State, p: Player, dice: Dice, ev: Ev[]): boolean {
  const h = hexOf(p);
  for (const d of inHex(s, h).filter(x => x.team !== p.team)) {
    const out = duel(s, "dribble", p, d, dice, ev);
    if (out === "tie") { ev.push({ e: "stopped", pid: p.id, at: p.seg }); return false; }
    if (out === "lose") return false;
  }
  const occ = occupied(s);
  const pressers = s.players
    .filter(x => x.team !== p.team && x.reserve > 0 && hexOf(x) !== h && hexDist(hexOf(x), h) === 1)
    .sort((a, b) => a.num - b.num);
  for (const x of pressers) {
    const free = hexSegs(h).filter(sg => !occ.has(sg) && canEnter(x, sg));
    if (!free.length) continue;
    x.reserve--; x.seg = free[0]; occ.set(free[0], x);
    ev.push({ e: "react", pid: x.id, seg: x.seg });
    const out = duel(s, "press", p, x, dice, ev);
    if (out === "tie") { ev.push({ e: "stopped", pid: p.id, at: p.seg }); return false; }
    if (out === "lose") return false;
  }
  return true;
}

/** The ball lies loose: the nearest opponent of the side to move with a reserve may step in and take it. */
function looseReactions(s: State, dice: Dice, ev: Ev[]) {
  if (s.ball.owner) return;
  const h = s.ball.hex, occ = occupied(s);
  const cands = s.players
    .filter(x => x.team !== s.turn && x.reserve > 0 && hexDist(hexOf(x), h) <= 1)
    .sort((a, b) => hexDist(hexOf(a), h) - hexDist(hexOf(b), h) || a.num - b.num);
  for (const x of cands) {
    if (hexOf(x) !== h) {
      const free = hexSegs(h).filter(sg => !occ.has(sg) && canEnter(x, sg));
      if (!free.length) continue;
      x.seg = free[0];
    }
    x.reserve--;
    ev.push({ e: "react", pid: x.id, seg: x.seg });
    s.ball.owner = x.id;
    ev.push({ e: "pickup", pid: x.id, hex: h });
    return;
  }
}

/** A pass or a shot from the ball's spot to hex `to`. */
function kick(s: State, p: Player, to: number, shot: boolean, toNum: number | undefined, dice: Dice, ev: Ev[]) {
  const from = s.ball.hex, dist = hexDist(from, to);
  const skill = shot ? p.st.shoot : p.st.pass;
  // Opponents in the lane, nearest first. Reserves just off the lane stretch for it, a little worse.
  for (const { p: x, react } of laneThreats(s, p.team, from, to)) {
    if (react) { x.reserve--; }
    const a = skill + dice.roll() + 1 - (dist >= 4 ? 1 : 0);
    const d = x.st.tack + dice.roll() - (react ? 1 : 0) + (x.role === "GK" && shot ? x.st.keep - x.st.tack : 0);
    if (d > a) {
      s.ball.hex = hexOf(x); s.ball.owner = x.id;
      ev.push({ e: "intercept", pid: x.id, a, d, react });
      return;
    }
    ev.push({ e: "lane", pid: x.id, a, d, react });
  }
  s.ball.hex = to; s.ball.owner = null;
  if (shot) {
    const gk = s.players.find(x => x.team !== p.team && x.role === "GK");
    const gd = gk ? hexDist(hexOf(gk), to) : 99;
    if (gk && gd <= 1) {
      const a = p.st.shoot + dice.roll() - Math.max(0, dist - 3);
      const d = gk.st.keep + dice.roll() + (gd === 0 ? 1 : -1);
      if (d > a) { s.ball.hex = hexOf(gk); s.ball.owner = gk.id; ev.push({ e: "saved", pid: gk.id, a, d }); return; }
      if (d === a) {
        const out = hexNbrs(to).filter(n => HEXES[n].kind === "field").sort((x, y) => x - y);
        const land = out[dice.pick(out.length)];
        s.ball.hex = land;
        ev.push({ e: "parried", pid: gk.id, a, d, hex: land });
        settle(s, p, undefined, dice, ev);
        return;
      }
      ev.push({ e: "beaten", pid: gk.id, a, d });
    }
    ev.push({ e: "goal", team: p.team, pid: p.id, hex: to });
    return;
  }
  settle(s, p, toNum, dice, ev);
}

/** The ball has arrived on s.ball.hex: who gets it? */
function settle(s: State, p: Player, toNum: number | undefined, dice: Dice, ev: Ev[]) {
  const here = inHex(s, s.ball.hex).filter(x => x !== p);
  const mates = here.filter(x => x.team === p.team), opps = here.filter(x => x.team !== p.team);
  if (mates.length) {
    const r = mates.find(x => x.num === toNum) ?? mates[0];
    if (!opps.length) { s.ball.owner = r.id; ev.push({ e: "received", pid: r.id }); return; }
    duel(s, "receive", r, opps[0], dice, ev);
    return;
  }
  if (opps.length) { s.ball.owner = opps[0].id; ev.push({ e: "lost", pid: opps[0].id }); return; }
  ev.push({ e: "loose", hex: s.ball.hex });
  looseReactions(s, dice, ev);
}
