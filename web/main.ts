// main.ts: the page. All rules come from the engine; this file draws the board,
// turns clicks into notation commands, runs bot and Claude sides, and saves,
// loads and steps through matches.

import {
  Match, HEXES, NSEG, segExists, segIsGoal, segZone, segHex, pixelOf, LETTERS, PENALTY_SPOT,
  reach, passTargets, laneThreats, carrier, hexOf, inHex, playerOf, attackGoal, hexDist, segName, hexName,
  RuleError, NotationError, formatCommand as fmt, type State, type Player, type TeamId, type Zone, type Entry,
} from "../src/engine/index.ts";
import { botCommand } from "../src/ai/bot.ts";
import { analyze } from "../src/ai/odds.ts";
import { coachTurn } from "../src/ai/coach.ts";
import { commentary, type Line } from "../src/commentary.ts";

// ---------- claude.ai capabilities (null outside an artifact) ----------
type Sample = ((input: string, o?: object) => Promise<{ text: string }>) & { json: (input: string, o?: object) => Promise<unknown> };
type Downloads = { save(f: { filename: string; data: string | Blob }): Promise<unknown> };
const claudeApi = (globalThis as { claude?: { use?: (n: string) => Promise<unknown> } }).claude;
const capCache = new Map<string, Promise<unknown>>();
function capability<T>(name: string): Promise<T | null> {
  if (!capCache.has(name)) capCache.set(name, claudeApi?.use ? claudeApi.use(name).catch(() => null) : Promise.resolve(null));
  return capCache.get(name) as Promise<T | null>;
}

// ---------- drawing geometry ----------
const R = 40, HH = Math.sqrt(3) * R, DEG = Math.PI / 180, HEX_GAP = 2.6, SEG_CUT = .34, SEG_GAP = 1.6;
const ZONE_COL: Record<Zone, string> = { goal: "#e0412e", sixyard: "#f2881c", box: "#f5d22b", flank: "#22409a", centre: "#17663e", circle: "#2a9a5e", mid: "#3b7fcf" };
const centre = (h: number) => pixelOf(h, R);
const corner = (h: number, k: number): [number, number] => { const c = centre(h), a = 60 * k * DEG, r = R - HEX_GAP; return [c.x + r * Math.cos(a), c.y + r * Math.sin(a)]; };
const pts = (a: [number, number][]) => a.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
function segPts(s: number) {
  const h = segHex(s), k = s % 6, c = centre(h), A = corner(h, k), B = corner(h, (k + 1) % 6);
  const lerp = (P: [number, number], t: number): [number, number] => [c.x + (P[0] - c.x) * t, c.y + (P[1] - c.y) * t];
  let poly = [lerp(A, SEG_CUT), A, B, lerp(B, SEG_CUT)];
  const mx = poly.reduce((a, p) => a + p[0], 0) / 4, my = poly.reduce((a, p) => a + p[1], 0) / 4;
  poly = poly.map(([x, y]) => { const d = Math.hypot(x - mx, y - my), f = Math.max(0, (d - SEG_GAP) / d); return [mx + (x - mx) * f, my + (y - my) * f] as [number, number]; });
  return pts(poly);
}
const segCentroid = (s: number) => { const c = centre(segHex(s)), a = (30 + 60 * (s % 6)) * DEG; return { x: c.x + HH / 3 * Math.cos(a), y: c.y + HH / 3 * Math.sin(a) }; };
function outline(h: number) {
  const x = HEXES[h], c = centre(h);
  const ks = x.cut === "top" ? [0, 1, 2, 3] : x.cut === "bottom" ? [3, 4, 5, 0] : x.cut === "left" ? [4, 5, 0, 1, 2] : x.cut === "right" ? [1, 2, 3, 4, 5] : [0, 1, 2, 3, 4, 5];
  const p = ks.map(k => corner(h, k));
  if (x.cut === "left" || x.cut === "right") p.push([c.x, c.y]);
  return pts(p);
}
const spotPts = (r: number) => pts([0, 1, 2, 3, 4, 5].map(k => [r * Math.cos(60 * k * DEG), r * Math.sin(60 * k * DEG)]));

const svg = document.getElementById("pitch") as unknown as SVGSVGElement;
const minX = -2 * R - 18, maxX = 11 * R + 18, minY = -HH - 18, maxY = 12 * HH + 18;
svg.setAttribute("viewBox", `${minX} ${minY.toFixed(1)} ${maxX - minX} ${(maxY - minY).toFixed(1)}`);

function buildStatic(): string {
  let h = `<rect x="${minX + 6}" y="${(minY + 6).toFixed(1)}" width="${maxX - minX - 12}" height="${(maxY - minY - 12).toFixed(1)}" rx="6" class="sheet"/>`;
  for (let s = 0; s < NSEG; s++) if (segExists(s)) h += `<polygon points="${segPts(s)}" fill="${ZONE_COL[segIsGoal(s) ? "goal" : segZone(s)]}" class="seg"/>`;
  h += `<line class="halfway" x1="${-2 * R}" y1="${(5.5 * HH).toFixed(1)}" x2="${11 * R}" y2="${(5.5 * HH).toFixed(1)}"/>`;
  for (const x of HEXES) h += `<polygon points="${outline(x.id)}" class="hexline"/>`;
  for (const y of [-HH, 12 * HH]) h += `<line class="goalline" x1="${-2 * R}" y1="${y.toFixed(1)}" x2="${11 * R}" y2="${y.toFixed(1)}"/>`;
  const sp = spotPts(8);
  for (const x of HEXES) { const c = centre(x.id); h += `<g transform="translate(${c.x.toFixed(1)} ${c.y.toFixed(1)})"><polygon points="${sp}" class="spot"/><circle r="2.2" class="dot"/></g>`; }
  for (const id of Object.values(PENALTY_SPOT)) { const c = centre(id); h += `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="4.6" fill="#161616"/>`; }
  const big = spotPts(9.5);
  h += `<g id="coordNums">` + HEXES.map(x => { const c = centre(x.id); return `<g transform="translate(${c.x.toFixed(1)} ${c.y.toFixed(1)})"><polygon points="${big}" class="spot"/><text class="hexnum" y="2.8">${x.num}</text></g>`; }).join("") + `</g>`;
  return h;
}
function lettersSvg(): string {
  let h = "";
  for (let s = 0; s < NSEG; s++) {
    if (!segExists(s)) continue;
    const c = centre(segHex(s)), a = (30 + 60 * (s % 6)) * DEG;
    h += `<text class="seglet" x="${(c.x + 30 * Math.cos(a)).toFixed(1)}" y="${(c.y + 30 * Math.sin(a) + 2.5).toFixed(1)}">${LETTERS[s % 6]}</text>`;
  }
  return h;
}
const pent = (cx: number, cy: number, r: number, rot: number) => pts([0, 1, 2, 3, 4].map(k => { const a = (rot + 72 * k) * DEG; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; }));
const BR = 12.5;
const ballSvg = `<g filter="url(#drop)"><circle r="${BR}" fill="#fff"/><g clip-path="url(#ballClip)">
  <polygon points="${pent(0, 0, 4.9, -90)}" fill="#111"/>
  ${[0, 1, 2, 3, 4].map(k => { const d = -90 + 36 + 72 * k, a = d * DEG; return `<polygon points="${pent(13.6 * Math.cos(a), 13.6 * Math.sin(a), 4.6, d + 180)}" fill="#111"/>`; }).join("")}
  ${[0, 1, 2, 3, 4].map(k => { const a = (-90 + 72 * k) * DEG; return `<line x1="${(4.9 * Math.cos(a)).toFixed(2)}" y1="${(4.9 * Math.sin(a)).toFixed(2)}" x2="${(BR * Math.cos(a)).toFixed(2)}" y2="${(BR * Math.sin(a)).toFixed(2)}" stroke="#111" stroke-width="0.9"/>`; }).join("")}
  </g><circle r="${BR}" fill="none" stroke="#111" stroke-width="1.8"/></g>`;

svg.innerHTML = `<defs>
  <linearGradient id="kernelG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b5cf63"/><stop offset=".55" stop-color="#6f9234"/><stop offset="1" stop-color="#8a4865"/></linearGradient>
  <radialGradient id="shellG" cx=".4" cy=".35" r=".8"><stop offset="0" stop-color="#f7efde"/><stop offset="1" stop-color="#cdb88e"/></radialGradient>
  <clipPath id="ballClip"><circle r="12"/></clipPath>
  <filter id="drop" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="1.2" stdDeviation="1.1" flood-opacity=".45"/></filter>
</defs><g>${buildStatic()}</g><g id="low"></g><g id="coordLets" pointer-events="none">${lettersSvg()}</g><g id="ball">${ballSvg}</g><g id="top"></g>`;
const lowG = document.getElementById("low")!, topG = document.getElementById("top")!, ballEl = document.getElementById("ball") as unknown as SVGGElement;

// ---------- state ----------
type Side = "human" | "bot" | "advisor" | "claude";
const isLocalAi = (x: Side) => x === "bot" || x === "advisor";
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const TEAM: Record<TeamId, { name: string; one: string; chip: string }> = {
  K: { name: "Kernels", one: "Kernel", chip: "#7c9d3b" }, S: { name: "Shells", one: "Shell", chip: "#d9c49a" },
};
let match = new Match({ seed: randomSeed() });
let view: number | null = null;           // replay position, or null for the live match
const ui: { sel: number | null; preview: number | null; error: string } = { sel: null, preview: null, error: "" };
const sides: Record<TeamId, Side> = { K: "human", S: "bot" };
let comms: (Line & { n: number; team: TeamId })[] = [];
let lastPtr = "mouse";
let aiBusy: AbortController | null = null;
let botTimer: ReturnType<typeof setTimeout> | null = null;
let sampleOk = false;

function randomSeed() { return Math.random().toString(36).slice(2, 8); }
const shown = (): State => (view === null ? match.state : match.stateAt(view));
const live = () => view === null && !match.state.over;
const humanTurn = () => live() && sides[match.state.turn] === "human" && !aiBusy;
const name = (p: Player) => `${TEAM[p.team].one} #${p.num}${p.role === "GK" ? " (keeper)" : ""}`;

// ---------- playing ----------
function play(text: string): Entry | null {
  try {
    const before = match.state;
    const e = match.play(text);
    for (const l of commentary(e.events, before, match.state)) comms.unshift({ ...l, n: e.turnNo, team: e.team });
    comms = comms.slice(0, 80);
    ui.error = "";
    if (match.state.turn !== before.turn || match.state.turnNo !== before.turnNo) { ui.sel = null; ui.preview = null; }
    else ui.preview = null;
    save();
    return e;
  } catch (err) {
    if (err instanceof RuleError || err instanceof NotationError) { ui.error = err.message; return null; }
    throw err;
  }
}

function act(el: Element, kb: boolean) {
  const a = (el as HTMLElement).dataset.act, s = match.state;
  if (!humanTurn()) return;
  const sel = ui.sel !== null ? playerOf(s, s.turn, ui.sel) : undefined;
  if (a === "piece") {
    const id = (el as HTMLElement).dataset.id!;
    if (id[0] !== s.turn) return;
    const n = Number(id.slice(1));
    ui.sel = ui.sel === n ? null : n; ui.preview = null; ui.error = "";
    render(); return;
  }
  if (!sel) return;
  if (a === "move") play(`#${sel.num}-${segName(Number((el as HTMLElement).dataset.seg))}`);
  else if (a === "pass") {
    const h = Number((el as HTMLElement).dataset.hex);
    if (lastPtr === "touch" && !kb && ui.preview !== h) { ui.preview = h; render(); return; }
    play(passText(s, sel, h));
  } else if (a === "tackle") { const c = carrier(s); if (c) play(`#${sel.num}x#${c.num}`); }
  render();
  schedule();
}
function passText(s: State, p: Player, h: number) {
  if (attackGoal(p.team).includes(h)) return `#${p.num}>>${hexName(h)}`;
  const mate = inHex(s, h).find(x => x.team === p.team && x !== p);
  return mate ? `#${p.num}>#${mate.num}` : `#${p.num}>${hexName(h)}`;
}

// The next command for a local AI side. The advisor plays the top-rated option from
// odds.ts; options like "#10>68 then #11-68" are queued so both halves get played.
let aiQueue: string[] = [];
function localAiCommand(): string {
  const s = match.state;
  if (sides[s.turn] === "advisor") {
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

/** Run the AI for the side to move when that side is a bot (auto-play) — Claude always waits for a click. */
function schedule() {
  if (botTimer) { clearTimeout(botTimer); botTimer = null; }
  if (!live() || aiBusy) return;
  if (isLocalAi(sides[match.state.turn]) && ($("autoAi") as HTMLInputElement).checked) botTimer = setTimeout(botStep, 320);
}
function botStep() {
  botTimer = null;
  if (!live() || !isLocalAi(sides[match.state.turn])) return;
  const t = match.state.turn, n = match.state.turnNo;
  playLocalAi();
  render();
  if (live() && match.state.turn === t && match.state.turnNo === n) botTimer = setTimeout(botStep, 320);
  else schedule();
}
async function botTurnAnimated() {
  const t = match.state.turn, n = match.state.turnNo;
  aiBusy = new AbortController(); render();
  for (let i = 0; i < 40 && live() && match.state.turn === t && match.state.turnNo === n; i++) {
    playLocalAi(); render();
    await new Promise(r => setTimeout(r, 320));
    if (aiBusy?.signal.aborted) break;
  }
  aiBusy = null; render(); schedule();
}

async function claudeTurn() {
  const sample = await capability<Sample>("sample");
  if (!sample) { setAiNote("Claude isn’t available in this view. Open the page as a claude.ai artifact to let Claude coach."); return; }
  const ctl = new AbortController();
  aiBusy = ctl; render();
  setAiNote("Thinking…");
  const before = match.entries.length;
  try {
    const r = await coachTurn({
      match,
      ask: async prompt => { if (ctl.signal.aborted) throw new Error("stopped"); return sample.json(prompt, { signal: ctl.signal, cache: false }); },
    });
    for (let i = before; i < match.entries.length; i++) {
      const e = match.entries[i];
      for (const l of commentary(e.events, match.stateAt(i), match.stateAt(i + 1))) comms.unshift({ ...l, n: e.turnNo, team: e.team });
    }
    setAiNote(`${r.idea ? "Idea: " + r.idea + "\n" : ""}${r.note ? "Claude: " + r.note + "\n" : ""}Played ${r.played.join(" ")}${r.errors.length ? `\nFixed: ${r.errors.join("; ")}` : ""}`);
    save();
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "cancelled" || (e as Error).message === "stopped") setAiNote("Stopped. The turn continues from where it was.");
    else if (code === "not_granted" || code === "sampling_disabled") { sampleOk = false; setAiNote("Claude wasn’t allowed for this page, so Claude sides are off."); }
    else if (code === "rate_limited") setAiNote("Claude is busy right now. Try again in a little while.");
    else setAiNote(`Claude’s turn didn’t work: ${(e as Error).message ?? code}. Try again, or play the turn yourself.`);
  } finally {
    aiBusy = null; render(); schedule();
  }
}
const setAiNote = (t: string) => { $("aiNote").textContent = t; };

// ---------- rendering ----------
function pieceSvg(p: Player, mine: boolean, selected: boolean, threat: boolean) {
  const c = segCentroid(p.seg), a = 30 + 60 * (p.seg % 6);
  const jit = ((p.num * 37 + (p.team === "K" ? 0 : 13)) % 17) - 8, rot = a - 90 + jit;
  const body = p.team === "K"
    ? `<ellipse rx="8" ry="11.5" fill="url(#kernelG)" stroke="#3a2a2e" stroke-width="1"/><path d="M-2.5 -8 Q-5.5 0 -1.5 8" stroke="rgba(255,255,255,.35)" stroke-width="1.5" fill="none"/>`
    : `<ellipse rx="8.4" ry="12" fill="url(#shellG)" stroke="#8a7249" stroke-width="1"/><path d="M.7 -11.5 Q3 0 .7 11.5" stroke="#9c8558" stroke-width=".9" fill="none"/>`;
  const ring = selected ? `<ellipse rx="12" ry="15.5" class="ring-sel"/>` : threat ? `<ellipse rx="12" ry="15.5" class="threat"/>` : "";
  const res = p.reserve ? Array.from({ length: p.reserve }, (_, i) => `<circle class="reserve" cx="${(8 + i * 6).toFixed(1)}" cy="-11" r="2.6"/>`).join("") : "";
  return `<g class="piece${mine ? " mine" : ""}" data-act="piece" data-id="${p.id}"${mine ? ' tabindex="0"' : ""} aria-label="${name(p)}" transform="translate(${c.x.toFixed(1)} ${c.y.toFixed(1)}) rotate(${rot})">${ring}<g filter="url(#drop)">${body}</g>${res}<text y="3" class="num ${p.team}" transform="rotate(${-rot})">${p.num}</text></g>`;
}

function renderBoard() {
  const s = shown();
  const canAct = humanTurn() && view === null;
  const sel = canAct && ui.sel !== null ? playerOf(s, s.turn, ui.sel) : undefined;
  const c = carrier(s), bh = s.ball.hex;
  const iCarry = !!sel && c === sel;
  let lo = "", tp = "";
  const threats = new Set<string>();
  if (sel) {
    lo += `<polygon points="${segPts(sel.seg)}" class="t-from"/>`;
    if (s.ap > 0) for (const [seg, cost] of reach(s, sel).cost) {
      const cc = segCentroid(seg);
      lo += `<polygon class="t-move" data-act="move" data-seg="${seg}" data-cost="${cost}" tabindex="0" aria-label="Move to ${segName(seg)}, ${cost} AP" points="${segPts(seg)}"/><text class="cost" x="${cc.x.toFixed(1)}" y="${(cc.y + 3).toFixed(1)}">${cost}</text>`;
    }
  }
  if (iCarry && ui.preview !== null) {
    const a = centre(bh), b = centre(ui.preview);
    for (const t of laneThreats(s, sel!.team, bh, ui.preview)) threats.add(t.p.id);
    for (const x of inHex(s, ui.preview)) if (x.team !== sel!.team) threats.add(x.id);
    lo += `<line class="pv-under" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/><line class="pv" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`;
  }
  for (const p of s.players) lo += pieceSvg(p, canAct && p.team === s.turn, !!sel && sel.id === p.id, threats.has(p.id));
  if (iCarry && s.ap > 0) for (const h of passTargets(s, sel!)) {
    const p = centre(h), on = ui.preview === h;
    tp += `<circle class="t-pass-mark${on ? " on" : ""}" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${on ? 14 : 12.5}"/><circle class="t-pass" data-act="pass" data-hex="${h}" tabindex="0" aria-label="Pass to spot ${HEXES[h].num}" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="14"/>`;
  }
  if (sel && s.ap > 0 && c && c.team !== sel.team && hexOf(sel) === bh && !s.beaten.includes(sel.id)) {
    const b = centre(bh);
    tp += `<circle class="t-tackle" data-act="tackle" tabindex="0" aria-label="Tackle" cx="${b.x}" cy="${b.y}" r="16"/>`;
  }
  lowG.innerHTML = lo; topG.innerHTML = tp;
  // the ball sits at its carrier's feet
  const bc = centre(bh);
  let x = bc.x, y = bc.y;
  if (c && hexOf(c) === bh) { const cc = segCentroid(c.seg); x += (cc.x - bc.x) * .22; y += (cc.y - bc.y) * .22; }
  ballEl.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
}

function hintText(): string {
  const s = shown();
  if (view !== null) return "Replay. Step through the match, or play on from here.";
  if (s.over) return `Full time. ${TEAM.K.name} ${s.score.K}, ${TEAM.S.name} ${s.score.S}.`;
  if (ui.error) return ui.error;
  if (sides[s.turn] !== "human") return { bot: "The bot is playing this side.", advisor: "The advisor plays the top-rated option every time.", claude: "Claude is coaching this side." }[sides[s.turn] as "bot"];
  const sel = ui.sel !== null ? playerOf(s, s.turn, ui.sel) : undefined, c = carrier(s);
  if (!sel) return c ? (c.team === s.turn ? `Your #${c.num} has the ball. Select a pistachio to spend actions.` : `${TEAM[c.team].name} have the ball. Select a pistachio to press, or put reserves near the ball.`) : `The ball is loose on spot ${hexName(s.ball.hex)}. Walk a player onto it.`;
  if (c === sel && ui.preview !== null) {
    const h = ui.preview, shot = attackGoal(sel.team).includes(h);
    const lane = laneThreats(s, sel.team, s.ball.hex, h).map(t => `${name(t.p)}${t.react ? " (reserve)" : ""}`);
    const there = inHex(s, h).filter(x => x.team !== sel.team).map(name);
    const parts = [`${shot ? "Shot at" : "Pass to"} spot ${HEXES[h].num}:`, lane.length ? `${lane.join(", ")} may cut it out.` : "the lane is clear."];
    if (shot) { const gk = s.players.find(x => x.team !== sel.team && x.role === "GK")!; parts.push(hexDist(hexOf(gk), h) <= 1 ? "The keeper can reach it." : "The keeper is too far to save it."); }
    else if (there.length) parts.push(`${there.join(", ")} contests it on arrival.`);
    else if (!inHex(s, h).some(x => x.team === sel.team)) parts.push("Nobody there: a through ball.");
    return parts.join(" ");
  }
  const parts = ["Numbers on segments are action costs."];
  if (c === sel) parts.push(lastPtr === "touch" ? "Step into another hexagon to dribble. Tap a ring once to preview a pass, again to play it." : "Step into another hexagon to dribble. Hover a ring to preview a pass or shot, click to play it.");
  if (c && c.team !== sel.team && hexOf(sel) === s.ball.hex) parts.push(s.beaten.includes(sel.id) ? `#${sel.num} lost a tackle this turn.` : "Tap the ball to tackle.");
  if (sel.reserve) parts.push(`#${sel.num} holds ${sel.reserve} reserve${sel.reserve > 1 ? "s" : ""}.`);
  return parts.join(" ");
}

function renderPanel() {
  const s = shown();
  $("sK").textContent = String(s.score.K); $("sS").textContent = String(s.score.S);
  const sideName: Record<Side, string> = { human: "", bot: " (Bot)", advisor: " (Advisor)", claude: " (Claude)" };
  $("nameK").textContent = "Kernels" + sideName[sides.K];
  $("nameS").textContent = "Shells" + sideName[sides.S];
  $("turnText").innerHTML = s.over ? "Full time" : `<span class="chip" style="background:${TEAM[s.turn].chip}"></span>${TEAM[s.turn].name} to play`;
  $("turnNo").textContent = `Turn ${Math.min(s.turnNo, s.maxTurns)} of ${s.maxTurns}`;
  $("pips").innerHTML = Array.from({ length: s.apPerTurn }, (_, i) => `<span class="pip${i < s.ap ? " full" : ""}"></span>`).join("");
  $("hint").textContent = hintText();
  const sel = ui.sel !== null ? playerOf(s, s.turn, ui.sel) : undefined;
  ($("reserveBtn") as HTMLButtonElement).disabled = !humanTurn() || !sel || s.ap < 1 || sel.reserve >= 2;
  $("reserveBtn").textContent = sel ? `Reserve on #${sel.num} (+1 AP)` : "Reserve (select a player)";
  ($("endTurn") as HTMLButtonElement).disabled = !humanTurn();
  ($("undo") as HTMLButtonElement).disabled = !match.entries.length || view !== null || !!aiBusy;
  // replay bar
  $("replayBar").hidden = view === null;
  if (view !== null) $("replayText").textContent = `Replay: action ${view} of ${match.entries.length}${view > 0 ? ` (last: ${match.entries[view - 1].text})` : ""}`;
  // AI box
  const side = sides[s.turn];
  const showAi = live() && side !== "human";
  $("aiBox").hidden = !showAi && !$("aiNote").textContent;
  ($("aiBtn") as HTMLButtonElement).hidden = !showAi;
  ($("aiBtn") as HTMLButtonElement).disabled = !!aiBusy || (side === "claude" && !sampleOk);
  $("aiBtn").textContent = side === "claude" ? (sampleOk ? `Ask Claude to play the ${TEAM[s.turn].name}’ turn` : "Claude isn’t available here") : side === "advisor" ? "Play the advisor’s turn" : "Play the bot’s turn";
  ($("aiStop") as HTMLButtonElement).hidden = !aiBusy;
  // notation and commentary
  const ta = $("ppn") as HTMLTextAreaElement;
  if (document.activeElement !== ta) ta.value = match.toText();
  $("comms").innerHTML = comms.map(l => `<li class="${l.team}${l.big ? " big" : ""}"><span class="mv">${l.n}</span>${escapeHtml(l.text)}</li>`).join("");
  ($("sideK") as HTMLSelectElement).value = sides.K; ($("sideS") as HTMLSelectElement).value = sides.S;
}
const escapeHtml = (t: string) => t.replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]!));

function render() { renderBoard(); renderPanel(); }

// ---------- persistence (this browser only) ----------
function save() {
  try { localStorage.setItem("pp-match", JSON.stringify({ text: match.toText(), sides })); } catch { /* storage unavailable */ }
}
function restore() {
  try {
    const raw = localStorage.getItem("pp-match");
    if (!raw) return;
    const o = JSON.parse(raw) as { text: string; sides: Record<TeamId, Side> };
    match = Match.fromText(o.text);
    if (o.sides) { sides.K = o.sides.K; sides.S = o.sides.S; }
    rebuildComms();
  } catch { /* start fresh */ }
}
function rebuildComms() {
  comms = [];
  match.entries.forEach((e, i) => { for (const l of commentary(e.events, match.stateAt(i), match.stateAt(i + 1))) comms.unshift({ ...l, n: e.turnNo, team: e.team }); });
  comms = comms.slice(0, 80);
}

// ---------- controls ----------
svg.addEventListener("pointerdown", e => { lastPtr = e.pointerType || "mouse"; });
svg.addEventListener("click", e => {
  const el = (e.target as Element).closest("[data-act]");
  if (!el) { if (ui.sel !== null) { ui.sel = null; ui.preview = null; render(); } return; }
  act(el, false);
});
svg.addEventListener("keydown", e => {
  if (e.key !== "Enter" && e.key !== " ") return;
  const el = (e.target as Element).closest("[data-act]");
  if (el) { e.preventDefault(); act(el, true); }
});
svg.addEventListener("pointerover", e => {
  if (lastPtr === "touch") return;
  const pass = (e.target as Element).closest('[data-act="pass"]') as HTMLElement | null;
  const n = pass ? Number(pass.dataset.hex) : null;
  if (n !== ui.preview) { ui.preview = n; render(); }
  const mv = (e.target as Element).closest('[data-act="move"]') as HTMLElement | null;
  if (mv) { const c = Number(mv.dataset.cost); $("hint").textContent = `Move to ${segName(Number(mv.dataset.seg))} for ${c} action${c > 1 ? "s" : ""}.`; }
});

$("endTurn").addEventListener("click", () => { if (humanTurn()) { play("/"); render(); schedule(); } });
$("reserveBtn").addEventListener("click", () => { if (humanTurn() && ui.sel !== null) { play(`#${ui.sel}+`); render(); schedule(); } });
$("undo").addEventListener("click", () => {
  if (botTimer) { clearTimeout(botTimer); botTimer = null; }
  // go back to the last action a human made, so a bot doesn't immediately replay its move
  let e = match.undo();
  while (e && sides[e.team] !== "human" && match.entries.length && (sides.K === "human" || sides.S === "human")) e = match.undo();
  ui.sel = null; ui.preview = null; ui.error = "";
  rebuildComms(); save(); render();
});
$("aiBtn").addEventListener("click", () => {
  if (aiBusy || !live()) return;
  if (sides[match.state.turn] === "claude") claudeTurn(); else botTurnAnimated();
});
$("aiStop").addEventListener("click", () => aiBusy?.abort());
for (const t of ["K", "S"] as TeamId[]) {
  $(`side${t}`).addEventListener("change", e => {
    const v = (e.target as HTMLSelectElement).value as Side;
    sides[t] = v; ui.sel = null; save(); render(); schedule();
  });
}
$("autoAi").addEventListener("change", () => { render(); schedule(); });

const coordBtn = $("coordToggle");
function toggleCoords() {
  const off = svg.classList.toggle("no-coords");
  coordBtn.setAttribute("aria-pressed", String(!off));
  coordBtn.textContent = off ? "Show coordinates" : "Hide coordinates";
}
coordBtn.addEventListener("click", toggleCoords);
document.addEventListener("keydown", e => {
  const tag = (e.target as HTMLElement).tagName;
  if (/INPUT|SELECT|TEXTAREA/.test(tag) || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === "c" || e.key === "C") toggleCoords();
  if (view !== null && (e.key === "ArrowRight" || e.key === "ArrowLeft")) step(e.key === "ArrowRight" ? 1 : -1);
});

$("newBtn").addEventListener("click", () => { ($("newBox") as HTMLDetailsElement).open = true; ($("seedIn") as HTMLInputElement).value = randomSeed(); $("seedIn").focus(); });
$("startBtn").addEventListener("click", () => {
  aiBusy?.abort();
  const seed = ($("seedIn") as HTMLInputElement).value.trim() || randomSeed();
  match = new Match({ seed, ap: Number(($("apSel") as HTMLSelectElement).value), turns: Number(($("turnsSel") as HTMLSelectElement).value) });
  view = null; comms = []; ui.sel = null; ui.preview = null; ui.error = ""; setAiNote("");
  save(); render(); schedule();
});

// replay stepping
function step(d: number) { if (view === null) view = match.entries.length; view = Math.max(0, Math.min(match.entries.length, view + d)); render(); }
$("rFirst").addEventListener("click", () => { view = 0; render(); });
$("rPrev").addEventListener("click", () => step(-1));
$("rNext").addEventListener("click", () => step(1));
$("rLast").addEventListener("click", () => { view = match.entries.length; render(); });
$("rResume").addEventListener("click", () => {
  if (view === null) return;
  while (match.entries.length > view) match.undo();
  view = null; rebuildComms(); save(); render(); schedule();
});

// save and load
function load(text: string) {
  try {
    let note = "";
    try { match = Match.fromText(text, { verify: true }); note = "Loaded, and every result matches this engine."; }
    catch (e) {
      if (!(e instanceof NotationError)) throw e;
      if (/the file says \{/.test(e.message)) { match = Match.fromText(text); note = `Loaded, but some results differ: ${e.message}`; }
      else throw e;
    }
    view = 0; ui.sel = null; ui.preview = null; ui.error = ""; aiBusy?.abort();
    rebuildComms(); save(); render();
    $("ioNote").textContent = note + " Use the replay buttons to step through it.";
  } catch (e) {
    $("ioNote").textContent = `Couldn’t load that: ${(e as Error).message}`;
  }
}
$("loadBtn").addEventListener("click", () => load(($("ppn") as HTMLTextAreaElement).value));
$("fileIn").addEventListener("change", async e => {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (f) load(await f.text());
  (e.target as HTMLInputElement).value = "";
});
$("copyBtn").addEventListener("click", async () => {
  const ta = $("ppn") as HTMLTextAreaElement;
  ta.value = match.toText();
  try { await navigator.clipboard.writeText(ta.value); $("ioNote").textContent = "Copied."; }
  catch { ta.select(); $("ioNote").textContent = "Selected: press Ctrl+C (or Cmd+C) to copy."; }
});
$("saveBtn").addEventListener("click", async () => {
  const text = match.toText(), base = `pistachio-${match.start.seed}`;
  const downloads = await capability<Downloads>("downloads");
  if (downloads) {
    try { await downloads.save({ filename: `${base}.ppn.txt`, data: text }); $("ioNote").textContent = "Saved. Rename it to .ppn if you like; the CLI reads either."; }
    catch (e) { const c = (e as { code?: string }).code; $("ioNote").textContent = c === "declined" ? "Not saved." : "Saving isn’t available here: use Copy instead."; }
    return;
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  a.download = `${base}.ppn`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

// ---------- start ----------
restore();
render();
schedule();
capability<Sample>("sample").then(s => { sampleOk = !!s; render(); });
