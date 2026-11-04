// game.ts: the match being played and everything the page does with it.
// Components read `store` and the helpers below; the Match itself is kept out of
// Vue's reactivity (it's a class with its own history) and `store.tick` is bumped
// after every change so computed views refresh.

import { reactive, markRaw, watch } from "vue";
import {
  Match, HEXES, playerOf, carrier, inHex, attackGoal, hexDist, hexOf, segName, hexName, laneThreats, paceLeft,
  RuleError, NotationError, formatCommand as fmt, POSITION_NAMES,
  type State, type Player, type TeamId, type Entry,
} from "../../../src/engine/index.ts";
import { botCommand } from "../../../src/ai/bot.ts";
import { analyze } from "../../../src/ai/odds.ts";
import { coachTurn } from "../../../src/ai/coach.ts";
import { commentary, type Line } from "../../../src/commentary.ts";
import { capability, type Sample, type Downloads } from "./claude.ts";
import { TEAM, playerName } from "./draw.ts";

export type Side = "human" | "bot" | "advisor" | "claude";
export const isLocalAi = (x: Side) => x === "bot" || x === "advisor";
export const randomSeed = () => Math.random().toString(36).slice(2, 8);

let match = markRaw(new Match({ seed: randomSeed() }));
export const getMatch = () => match;

export const store = reactive({
  tick: 0,                               // bumped after every change to the match
  view: null as number | null,           // replay position, or null for the live match
  sel: null as number | null,            // selected player (number) of the side to move
  preview: null as number | null,        // pass target being previewed
  error: "",
  hover: "",                             // hint text while hovering a move target or a pistachio
  lastPtr: "mouse",
  sides: { K: "human", S: "bot" } as Record<TeamId, Side>,
  comms: [] as (Line & { n: number; team: TeamId })[],
  aiBusy: false,
  aiNote: "",
  auto: false,
  sampleOk: false,
  ioNote: "",
  labOpen: false,
});

/** Per-browser display preferences. */
export const prefs = reactive({ coords: true, rot: 0, control: true, tint: 100 });
try {
  const p = JSON.parse(localStorage.getItem("pp-prefs") ?? "null");
  if (p) Object.assign(prefs, p);
  else {   // settings saved by earlier versions of the page
    if (localStorage.getItem("pp-rot") === "90") prefs.rot = 90;
    if (localStorage.getItem("pp-ctrl") === "0") prefs.control = false;
    const t = Number(localStorage.getItem("pp-tint")); if (t >= 10 && t <= 100) prefs.tint = t;
  }
} catch { /* storage unavailable */ }
watch(prefs, () => { try { localStorage.setItem("pp-prefs", JSON.stringify(prefs)); } catch { /* storage unavailable */ } });

const bump = () => { store.tick++; };
export const shown = (): State => (store.view === null ? match.state : match.stateAt(store.view));
export const live = () => store.view === null && !match.state.over;
export const humanTurn = () => live() && store.sides[match.state.turn] === "human" && !store.aiBusy;

// ---------- playing ----------
export function play(text: string): Entry | null {
  try {
    const before = match.state;
    const e = match.play(text);
    for (const l of commentary(e.events, before, match.state)) store.comms.unshift({ ...l, n: e.turnNo, team: e.team });
    store.error = "";
    if (match.state.turn !== before.turn || match.state.turnNo !== before.turnNo) store.sel = null;
    store.preview = null;
    save(); bump();
    return e;
  } catch (err) {
    if (err instanceof RuleError || err instanceof NotationError) { store.error = err.message; bump(); return null; }
    throw err;
  }
}

/** A click (or Enter) on something on the pitch with data-act. */
export function act(d: DOMStringMap, kb: boolean) {
  const s = match.state;
  if (!humanTurn()) return;
  const sel = store.sel !== null ? playerOf(s, s.turn, store.sel) : undefined;
  if (d.act === "piece") {
    const id = d.id!;
    if (id[0] !== s.turn) return;
    const n = Number(id.slice(1));
    store.sel = store.sel === n ? null : n; store.preview = null; store.error = "";
    return;
  }
  if (!sel) return;
  if (d.act === "move") play(`#${sel.num}-${segName(Number(d.seg))}`);
  else if (d.act === "pass") {
    const h = Number(d.hex);
    if (store.lastPtr === "touch" && !kb && store.preview !== h) { store.preview = h; return; }
    play(passText(s, sel, h));
  } else if (d.act === "tackle") { const c = carrier(s); if (c) play(`#${sel.num}x#${c.num}`); }
  schedule();
}
function passText(s: State, p: Player, h: number) {
  if (attackGoal(p.team).includes(h)) return `#${p.num}>>${hexName(h)}`;
  const mate = inHex(s, h).find(x => x.team === p.team && x !== p);
  return mate ? `#${p.num}>#${mate.num}` : `#${p.num}>${hexName(h)}`;
}
export function endTurn() { if (humanTurn()) { play("/"); schedule(); } }
export function reserve() { if (humanTurn() && store.sel !== null) { play(`#${store.sel}+`); schedule(); } }
export function undo() {
  stopTimer();
  // go back to the last action a human made, so a bot doesn't immediately replay its move
  let e = match.undo();
  while (e && store.sides[e.team] !== "human" && match.entries.length && (store.sides.K === "human" || store.sides.S === "human")) e = match.undo();
  store.sel = null; store.preview = null; store.error = "";
  rebuildComms(); save(); bump();
}

// ---------- AI sides ----------
// The advisor plays the top-rated option from odds.ts; options like "#10>68 then #11-68"
// are queued so both halves get played.
let aiQueue: string[] = [];
let aiCtl: AbortController | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
const stopTimer = () => { if (timer) { clearTimeout(timer); timer = null; } };
function localAiCommand(): string {
  const s = match.state;
  if (store.sides[s.turn] === "advisor") {
    if (aiQueue.length) return aiQueue.shift()!;
    const best = analyze(s).options.slice().sort((a, b) => b.score - a.score || a.cmd.localeCompare(b.cmd))[0];
    if (!best) return "/";
    const cmds = best.cmd.split(/ then | /);
    aiQueue = cmds.slice(1);
    return cmds[0];
  }
  return fmt(botCommand(s));
}
function playLocalAi() {
  const t = match.state.turn, n = match.state.turnNo;
  if (!play(localAiCommand())) { aiQueue = []; play("/"); }
  if (match.state.turn !== t || match.state.turnNo !== n) aiQueue = [];
}
/**
 * With auto-play on, run the side to move when it's an AI side. Claude sides make
 * one request per turn, one at a time; any problem switches auto-play off.
 */
export function schedule() {
  stopTimer();
  if (!live() || store.aiBusy || !store.auto) return;
  const side = store.sides[match.state.turn];
  if (isLocalAi(side)) timer = setTimeout(botStep, 320);
  else if (side === "claude" && store.sampleOk) timer = setTimeout(() => {
    timer = null;
    if (live() && !store.aiBusy && store.auto && store.sides[match.state.turn] === "claude") claudeTurn();
  }, 900);
}
function botStep() {
  timer = null;
  if (!live() || !isLocalAi(store.sides[match.state.turn])) return;
  const t = match.state.turn, n = match.state.turnNo;
  playLocalAi();
  if (live() && match.state.turn === t && match.state.turnNo === n) timer = setTimeout(botStep, 320);
  else schedule();
}
async function localTurnAnimated() {
  const t = match.state.turn, n = match.state.turnNo;
  aiCtl = new AbortController(); store.aiBusy = true;
  for (let i = 0; i < 40 && live() && match.state.turn === t && match.state.turnNo === n; i++) {
    playLocalAi();
    await new Promise(r => setTimeout(r, 320));
    if (aiCtl?.signal.aborted) break;
  }
  aiCtl = null; store.aiBusy = false; schedule();
}
async function claudeTurn() {
  const sample = await capability<Sample>("sample");
  if (!sample) { store.aiNote = "Claude isn’t available in this view. Open the page as a claude.ai artifact to let Claude coach."; return; }
  const ctl = new AbortController();
  aiCtl = ctl; store.aiBusy = true; store.aiNote = "Thinking…";
  const before = match.entries.length;
  try {
    const r = await coachTurn({
      match,
      ask: async prompt => { if (ctl.signal.aborted) throw new Error("stopped"); return sample.json(prompt, { signal: ctl.signal, cache: false }); },
    });
    for (let i = before; i < match.entries.length; i++) {
      const e = match.entries[i];
      for (const l of commentary(e.events, match.stateAt(i), match.stateAt(i + 1))) store.comms.unshift({ ...l, n: e.turnNo, team: e.team });
    }
    store.aiNote = `${r.idea ? "Idea: " + r.idea + "\n" : ""}${r.note ? "Claude: " + r.note + "\n" : ""}Played ${r.played.join(" ")}${r.errors.length ? `\nFixed: ${r.errors.join("; ")}` : ""}`;
    save();
  } catch (e) {
    const code = (e as { code?: string }).code;
    store.auto = false;
    if (code === "cancelled" || (e as Error).message === "stopped") store.aiNote = "Stopped. The turn continues from where it was.";
    else if (code === "not_granted" || code === "sampling_disabled") { store.sampleOk = false; store.aiNote = "Claude wasn’t allowed for this page, so Claude sides are off."; }
    else if (code === "rate_limited") store.aiNote = "Claude is busy right now. Try again in a little while.";
    else store.aiNote = `Claude’s turn didn’t work: ${(e as Error).message ?? code}. Try again, or play the turn yourself.`;
  } finally {
    aiCtl = null; store.aiBusy = false; bump(); schedule();
  }
}
/** The "Play this turn" button for an AI side. */
export function aiTurn() {
  if (store.aiBusy || !live()) return;
  if (store.sides[match.state.turn] === "claude") claudeTurn(); else localTurnAnimated();
}
export function stopAi() { store.auto = false; aiCtl?.abort(); }
export function setSide(t: TeamId, v: Side) { store.sides[t] = v; store.sel = null; save(); schedule(); }
capability<Sample>("sample").then(s => { store.sampleOk = !!s; });

// ---------- replays ----------
export function step(d: number) {
  if (store.view === null) store.view = match.entries.length;
  store.view = Math.max(0, Math.min(match.entries.length, store.view + d));
}
export function replay(what: string) {
  if (store.aiBusy) return;
  stopTimer();
  if (what === "first") store.view = 0;
  else if (what === "prev") step(-1);
  else if (what === "next") step(1);
  else if (what === "last") store.view = match.entries.length;
  else if (what === "resume" && store.view !== null) {
    while (match.entries.length > store.view) match.undo();
    store.view = null; rebuildComms(); save(); bump(); schedule();
  }
}

// ---------- new match, save and load ----------
export function startMatch(o: { seed: string; ap: number; turns: number; formation: Record<TeamId, string> }) {
  aiCtl?.abort(); stopTimer();
  match = markRaw(new Match({ seed: o.seed || randomSeed(), ap: o.ap, turns: o.turns, formation: o.formation }));
  store.view = null; store.comms = []; store.sel = null; store.preview = null; store.error = ""; store.aiNote = "";
  save(); bump(); schedule();
}
function save() {
  try { localStorage.setItem("pp-match", JSON.stringify({ text: match.toText(), sides: store.sides })); } catch { /* storage unavailable */ }
}
function restore() {
  try {
    const raw = localStorage.getItem("pp-match");
    if (!raw) return;
    const o = JSON.parse(raw) as { text: string; sides: Record<TeamId, Side> };
    match = markRaw(Match.fromText(o.text));
    if (o.sides) { store.sides.K = o.sides.K; store.sides.S = o.sides.S; }
    rebuildComms();
  } catch { /* start fresh: e.g. a match saved under older rules */ }
}
function rebuildComms() {
  store.comms = [];
  match.entries.forEach((e, i) => { for (const l of commentary(e.events, match.stateAt(i), match.stateAt(i + 1))) store.comms.unshift({ ...l, n: e.turnNo, team: e.team }); });
}
export function load(text: string) {
  try {
    let note = "";
    try { match = markRaw(Match.fromText(text, { verify: true })); note = "Loaded, and every result matches this engine."; }
    catch (e) {
      if (!(e instanceof NotationError)) throw e;
      if (/the file says \{/.test(e.message)) { match = markRaw(Match.fromText(text)); note = `Loaded, but some results differ: ${e.message}`; }
      else throw e;
    }
    store.view = 0; store.sel = null; store.preview = null; store.error = ""; aiCtl?.abort();
    rebuildComms(); save(); bump();
    store.ioNote = note + " Use the replay buttons to step through it.";
  } catch (e) {
    store.ioNote = `Couldn’t load that: ${(e as Error).message}`;
  }
}
export async function saveFile() {
  const text = match.toText(), base = `pistachio-${match.start.seed}`;
  const downloads = await capability<Downloads>("downloads");
  if (downloads) {
    try { await downloads.save({ filename: `${base}.ppn.txt`, data: text }); store.ioNote = "Saved. Rename it to .ppn if you like; the CLI reads either."; }
    catch (e) { const c = (e as { code?: string }).code; store.ioNote = c === "declined" ? "Not saved." : "Saving isn’t available here: use Copy instead."; }
    return;
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  a.download = `${base}.ppn`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------- texts ----------
export const STAT_LABEL: [keyof Player["st"], string][] = [["pac", "PAC"], ["sho", "SHO"], ["pas", "PAS"], ["dri", "DRI"], ["def", "DEF"], ["phy", "PHY"], ["kee", "KEE"]];
/** A one-line player card: who he is, his stats, and how far he can still move. */
export function cardText(s: State, p: Player): string {
  const stats = STAT_LABEL.filter(([k]) => k !== "kee" || p.role === "GK").map(([k, l]) => `${l} ${p.st[k]}`).join(" · ");
  const pace = p.team === s.turn ? ` Pace left: ${paceLeft(s, p)} spot${paceLeft(s, p) === 1 ? "" : "s"}.` : "";
  return `${playerName(p)}, ${POSITION_NAMES[p.role] ?? p.role}: ${stats}.${pace}`;
}
export function hintText(): string {
  const s = shown();
  if (store.view !== null) return "Replay. Step through the match, or play on from here.";
  if (s.over) return `Full time. ${TEAM.K.name} ${s.score.K}, ${TEAM.S.name} ${s.score.S}.`;
  if (store.error) return store.error;
  if (store.hover) return store.hover;
  const side = store.sides[s.turn];
  if (side !== "human") return { bot: "The bot is playing this side.", advisor: "The advisor plays the top-rated option every time.", claude: "Claude is coaching this side." }[side];
  const sel = store.sel !== null ? playerOf(s, s.turn, store.sel) : undefined, c = carrier(s);
  if (!sel) return c ? (c.team === s.turn ? `Your #${c.num} has the ball. Select a pistachio to spend actions.` : `${TEAM[c.team].name} have the ball. Select a pistachio to press, or put reserves near the ball.`) : `The ball is loose on spot ${hexName(s.ball.hex)}. Walk a player onto it.`;
  if (c === sel && store.preview !== null) {
    const h = store.preview, shot = attackGoal(sel.team).includes(h);
    const lane = laneThreats(s, sel.team, s.ball.hex, h).map(t => `${playerName(t.p)}${t.react ? " (reserve)" : ""}`);
    const there = inHex(s, h).filter(x => x.team !== sel.team).map(playerName);
    const parts = [`${shot ? "Shot at" : "Pass to"} spot ${HEXES[h].num}:`, lane.length ? `${lane.join(", ")} may cut it out.` : "the lane is clear."];
    if (shot) { const gk = s.players.find(x => x.team !== sel.team && x.role === "GK")!; parts.push(hexDist(hexOf(gk), h) <= 1 ? "The keeper can reach it." : "The keeper is too far to save it."); }
    else if (there.length) parts.push(`${there.join(", ")} contests it on arrival.`);
    else if (!inHex(s, h).some(x => x.team === sel.team)) parts.push("Nobody there: a through ball.");
    return parts.join(" ");
  }
  const parts = [cardText(s, sel), "Numbers on segments are action costs."];
  if (c === sel) parts.push(store.lastPtr === "touch" ? "Step into another hexagon to dribble. Tap a ring once to preview a pass, again to play it." : "Step into another hexagon to dribble. Hover a ring to preview a pass or shot, click to play it.");
  if (c && c.team !== sel.team && hexOf(sel) === s.ball.hex) parts.push(s.beaten.includes(sel.id) ? `#${sel.num} lost a tackle this turn.` : "Tap the ball to tackle.");
  if (sel.reserve) parts.push(`#${sel.num} holds ${sel.reserve} reserve${sel.reserve > 1 ? "s" : ""}.`);
  return parts.join(" ");
}

restore();
