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
  HEXES, CENTER, GOAL, attackGoal, other, hexAt, HEX_NBR, LETTERS,
  segHex, segExists, segIsGoal, hexSegs, hexDist, hexNbrs, cx, cy, segX, segY,
  segName, hexName, type TeamId,
} from "./geometry.ts";
import { Dice, seedState } from "./rng.ts";
import { FORMATIONS, BUILDS, DEFAULT_FORMATION, mirror, type Stats } from "./squad.ts";

export const RULES_VERSION = "0.4";
export const PASS_RANGE = 5;
export const MAX_RESERVE = 2;

/** A player: role is his position in the formation (GK, CB, FB, WB, DM, CM, WM, W, ST, TS). */
export interface Player { id: string; team: TeamId; num: number; role: string; seg: number; reserve: number; st: Stats }
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
  moved: Record<string, number>; // spots each player of the side to move has moved this turn (pace cap)
  formation: Record<TeamId, string>;
  over: boolean;
}
export interface Options { seed?: string; ap?: number; turns?: number; firstKick?: TeamId; formation?: Partial<Record<TeamId, string>> }

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
  | { e: "astray"; pid: string; a: number; need: number; dir: string; hex: number }   // an inaccurate pass, and where it went
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

/** Put both teams in kick-off positions from their formations; `kick` takes the kick-off. */
function lineUp(state: State, kick: TeamId) {
  const players: Player[] = [];
  for (const team of ["K", "S"] as TeamId[]) {
    const face = team === "K" ? 1 : 4; // segment pointing at the opponents' goal
    FORMATIONS[state.formation[team]].slots.forEach(([role, q0, r0], i) => {
      const num = i + 1;
      let hex: number, seg: number;
      if (team === kick && num === 10) { hex = CENTER; seg = hex * 6 + (team === "K" ? 4 : 1); }
      else if (team === kick && num === 11) { hex = team === "K" ? hexAt(2, 5)! : hexAt(2, 6)!; seg = hex * 6 + face; }
      else { const [q, r] = mirror(team, q0, r0); hex = hexAt(q, r)!; seg = hex * 6 + face; }
      players.push({ id: team + num, team, num, role, seg, reserve: 0, st: { ...BUILDS[role] } });
    });
  }
  state.players = players;
  state.beaten = [];
  state.moved = {};
  state.ball = { hex: CENTER, owner: kick + "10" };
  state.turn = kick;
  state.ap = state.apPerTurn;
}

export function newState(opts: Options = {}): State {
  const seed = opts.seed ?? "pistachio";
  const formation: Record<TeamId, string> = { K: opts.formation?.K || DEFAULT_FORMATION, S: opts.formation?.S || DEFAULT_FORMATION };
  for (const t of ["K", "S"] as TeamId[]) if (!FORMATIONS[formation[t]]) throw new RuleError(`unknown formation ${formation[t]}`);
  const s: State = {
    rules: RULES_VERSION, seed, rng: seedState(seed),
    apPerTurn: opts.ap ?? 7, maxTurns: opts.turns ?? 40,
    turnNo: 1, turn: "K", ap: 0, firstKick: opts.firstKick ?? "K",
    score: { K: 0, S: 0 }, ball: { hex: CENTER, owner: null }, players: [], beaten: [], moved: {}, formation, over: false,
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

/**
 * Movement (rules 0.2) goes hexagon by hexagon: stepping into a neighbouring
 * spot costs 1 AP, plus 1 per opponent standing in it, plus 1 if you're carrying
 * the ball (the ball is faster than legs, dribbling is slower than running). It
 * needs a free segment to arrive on (you pick any free one). Moving to another
 * segment of your own spot costs 1 AP.
 */
export const CARRY_COST = 1;
export function stepCost(s: State, p: Player, h: number): number {
  if (h === hexOf(p)) return 1;
  return 1 + inHex(s, h).filter(x => x.team !== p.team).length + (s.ball.owner === p.id ? CARRY_COST : 0);
}

/** Spots a player of the side to move may still move this turn: 1 + PAC, minus what he has moved. */
export function paceLeft(s: State, p: Player): number {
  return Math.max(0, 1 + p.st.pac - (s.moved[p.id] ?? 0));
}

/**
 * Segments the player can reach with `ap` AP and his remaining pace: the cost of
 * each, and path(seg), the segments stepped on to get there. A path crosses each
 * spot on its lowest free segment; ties go to fewer spots, then lower spot ids,
 * so paths are deterministic.
 */
export function reach(s: State, p: Player, ap = s.ap): { cost: Map<number, number>; path: (seg: number) => number[] } {
  const occ = occupied(s), carrying = s.ball.owner === p.id, home = hexOf(p);
  const steps = p.team === s.turn ? paceLeft(s, p) : 1 + p.st.pac;
  const free = (h: number) => hexSegs(h).filter(x => !occ.has(x) && canEnter(p, x));
  const entry = new Map<number, number>();
  // search states (spot, spots moved); keep the cheapest per state
  const key = (h: number, k: number) => h * 16 + k;
  const best = new Map<number, number>([[key(home, 0), 0]]), from = new Map<number, number>();
  const open = [key(home, 0)];
  while (open.length) {
    open.sort((a, b) => best.get(a)! - best.get(b)! || (a & 15) - (b & 15) || a - b);
    const st = open.shift()!, h = st >> 4, k = st & 15, c = best.get(st)!;
    if (k >= steps) continue;
    for (const n of hexNbrs(h)) {
      if (carrying && HEXES[n].goalOf === p.team) continue;
      if (!entry.has(n)) { const f = free(n); if (!f.length) { entry.set(n, -1); continue; } entry.set(n, f[0]); }
      if (entry.get(n)! < 0) continue;
      const nc = c + 1 + inHex(s, n).filter(x => x.team !== p.team).length + (carrying ? CARRY_COST : 0);
      const ns = key(n, k + 1);
      if (nc > ap || (best.has(ns) && best.get(ns)! <= nc)) continue;
      if (!best.has(ns)) open.push(ns);
      best.set(ns, nc); from.set(ns, st);
    }
  }
  // the best state for each spot: cheapest, then fewest spots moved
  const bestFor = new Map<number, number>();
  for (const [st, c] of best) {
    const h = st >> 4, cur = bestFor.get(h);
    if (cur === undefined || c < best.get(cur)! || (c === best.get(cur)! && (st & 15) < (cur & 15))) bestFor.set(h, st);
  }
  const cost = new Map<number, number>(), endState = new Map<number, number>();
  for (const [h, st] of bestFor) {
    if (h === home) { if (ap >= 1) for (const x of free(h)) { cost.set(x, 1); endState.set(x, st); } continue; }
    for (const x of free(h)) { cost.set(x, best.get(st)!); endState.set(x, st); }
  }
  const path = (seg: number): number[] => {
    if (segHex(seg) === home) return [seg];
    const out = [seg];
    for (let st = from.get(endState.get(seg)!); st !== undefined && (st >> 4) !== home; st = from.get(st)) out.unshift(entry.get(st >> 4)!);
    return out;
  };
  return { cost, path };
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
      const { cost, path: pathTo } = reach(s, p);
      let target = cmd.seg;
      if (target === undefined) {
        if (cmd.hex === undefined) throw new RuleError("move needs a target");
        const opts = hexSegs(cmd.hex).filter(x => cost.has(x)).sort((x, y) => cost.get(x)! - cost.get(y)! || x - y);
        if (!opts.length) throw new RuleError(`#${p.num} can't reach spot ${hexName(cmd.hex)} with ${s.ap} AP and pace for ${paceLeft(s, p)} more spot${paceLeft(s, p) === 1 ? "" : "s"}`);
        target = opts[0];
        cmd.seg = target; // resolved, so the notation records the exact segment
      }
      if (!cost.has(target)) throw new RuleError(`#${p.num} can't reach ${segName(target)} with ${s.ap} AP and pace for ${paceLeft(s, p)} more spot${paceLeft(s, p) === 1 ? "" : "s"}`);
      for (const step of pathTo(target)) {
        const fromHex = hexOf(p), h = segHex(step), c = stepCost(s, p, h);
        if (s.ap < c) break;
        p.seg = step; s.ap -= c;
        if (h !== fromHex) s.moved[p.id] = (s.moved[p.id] ?? 0) + 1;
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
  s.moved = {};
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
  // PHY: +1 to whichever of the two is physically stronger
  const ea = att.st.phy > def.st.phy ? 1 : 0, ed = def.st.phy > att.st.phy ? 1 : 0;
  if (kind === "tackle") { a = att.st.def + dice.roll() + majority(s, h, att.team) + ea; d = def.st.dri + dice.roll() + ed; }
  else if (kind === "receive") { a = att.st.dri + dice.roll() + ea; d = def.st.def + dice.roll() + majority(s, h, def.team) + ed; }
  else { a = att.st.dri + dice.roll() + ea; d = def.st.def + dice.roll() + majority(s, h, def.team) + (kind === "press" ? 1 : 0) + ed; }
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
/** Scatter directions for a d6: 1 = a (top), then clockwise to 6 = f, as segment numbers k. */
const SCATTER_K = [4, 5, 0, 1, 2, 3];
/** The accuracy roll a pass needs: PAS + d6 must reach 2 + its length in spots. */
export const passNeed = (dist: number) => 2 + dist;

function kick(s: State, p: Player, aim: number, shot: boolean, toNum: number | undefined, dice: Dice, ev: Ev[]) {
  const from = s.ball.hex;
  // Accuracy (passes only): PAS + d6 against 2 + the length. A miss scatters the ball one spot in a
  // rolled direction, or two if it missed by 3 or more; it stops at the edge of the pitch.
  let to = aim;
  if (!shot) {
    const need = passNeed(hexDist(from, aim)), a = p.st.pas + dice.roll();
    if (a < need) {
      const k = SCATTER_K[dice.roll() - 1], steps = need - a >= 3 ? 2 : 1;
      for (let i = 0; i < steps; i++) { const n = HEX_NBR[to][k]; if (n === undefined || HEXES[n].kind !== "field") break; to = n; }
      ev.push({ e: "astray", pid: p.id, a, need, dir: LETTERS[k], hex: to });
    }
  }
  const dist = hexDist(from, to);
  const skill = shot ? p.st.sho : p.st.pas;
  // Opponents in the lane, nearest first. Reserves just off the lane stretch for it, a little worse.
  for (const { p: x, react } of laneThreats(s, p.team, from, to)) {
    if (react) { x.reserve--; }
    const a = skill + dice.roll() + 1 - (dist >= 4 ? 1 : 0);
    const d = x.st.def + dice.roll() - (react ? 1 : 0) + (x.role === "GK" && shot ? x.st.kee - x.st.def : 0);
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
      const a = p.st.sho + dice.roll() - Math.max(0, dist - 2);
      const d = gk.st.kee + dice.roll() + (gd === 0 ? 1 : 0);
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
