<script setup lang="ts">
// FormationLab.vue: two formations against each other, at kick-off or in their
// target shapes, with the engine's control map. Edit mode: click a pistachio,
// then a spot. "Copy as JSON" gives a data/formations.json with your changes.
import { ref, reactive, computed, watch } from "vue";
import {
  newState, control, territory, HEXES, hexByNum, hexAt, hexDist, mirror, segHex, pixelOf, FORMATIONS, FORMATION_NAMES, BUILDS,
  type TeamId,
} from "../../../src/engine/index.ts";
import { chain } from "../../../src/ai/tempo.ts";
import { analyze, passOdds, pct } from "../../../src/ai/odds.ts";
import { ballThreat, teamThreat, focal, type HeatMap } from "../../../src/ai/threat.ts";
import { reach, passTargets, playerById } from "../../../src/engine/index.ts";
import { DEFS, BALL, staticBoard, viewBox, pieceSvg, controlSvg, influenceSvg, heatSvg, ballTransform, centre, segPts, segCentroid, upright, playerName, R, HH } from "../lib/draw.ts";
import { store, prefs } from "../lib/game.ts";

type Draft = Record<string, { style: string; players: { pos: string; kickoff: number; target: number }[] }>;
const num = (q: number, r: number) => HEXES[hexAt(q, r)!].num;
function fromEngine(): Draft {
  return Object.fromEntries(Object.entries(FORMATIONS).map(([n, f]) => [n, {
    style: f.style,
    players: f.slots.map(([pos, q, r], i) => ({ pos, kickoff: num(q, r), target: num(...f.target[i]) })),
  }]));
}
const draft = reactive<Draft>(fromEngine());
const edited = ref(false);
const pick = reactive({ K: "4-4-2", S: "5-4-1", mode: "target" as "target" | "kickoff", numbers: true, ball: false, influence: false,
  heat: "team" as "off" | "ball" | "team" | "counter" });
const ballAt = ref<string | null>(null);   // who has the ball ("K10"), with the Ball tool
const preview = ref<number | null>(null);  // pass target under the pointer
const sel = ref<string | null>(null);   // "K7"
const note = ref("");

const dlg = ref<HTMLDialogElement>();
watch(() => store.labOpen, open => { if (open) dlg.value?.showModal(); else dlg.value?.close(); });

/** The two shapes as a game state, so the engine's own control() can judge them. */
const state = computed(() => {
  const s = newState({ formation: { K: pick.K, S: pick.S } });
  for (const team of ["K", "S"] as TeamId[]) draft[pick[team]].players.forEach((p, i) => {
    const h = hexByNum(pick.mode === "target" ? p.target : p.kickoff)!;
    const [q, r] = mirror(team, HEXES[h].q, HEXES[h].r);
    s.players.find(x => x.team === team && x.num === i + 1)!.seg = hexAt(q, r)! * 6 + (team === "K" ? 1 : 4);
  });
  // the ball at a player's feet makes his side the one to move, with a full turn of AP
  const c = ballAt.value ? playerById(s, ballAt.value) : undefined;
  if (c) { s.ball = { hex: segHex(c.seg), owner: c.id }; s.turn = c.team; s.ap = s.apPerTurn; }
  else s.ball = { hex: s.ball.hex, owner: null };
  return s;
});
const carrierP = computed(() => (ballAt.value ? playerById(state.value, ballAt.value) : undefined));
/** The carrier's options, as in a match: where he can dribble (with costs), and every pass and shot target. */
const ballLayers = computed(() => {
  const s = state.value, c = carrierP.value, rot = prefs.rot;
  if (!c) return { lo: "", tp: "", threats: new Set<string>() };
  let lo = "", tp = "";
  for (const [seg, cost] of reach(s, c).cost) {
    const cc = segCentroid(seg);
    lo += `<polygon class="t-move lab-reach" points="${segPts(seg)}"/><text class="cost" x="${cc.x.toFixed(1)}" y="${(cc.y + 3).toFixed(1)}"${upright(rot, cc.x, cc.y)}>${cost}</text>`;
  }
  const threats = new Set<string>();
  if (preview.value !== null) {
    const o = passOdds(s, c, preview.value), a = centre(s.ball.hex), b = centre(preview.value);
    for (const t of o.threats) threats.add(t.split(" ")[0].replace("(reserve)", ""));
    for (const id of o.opps) threats.add(id);
    lo += `<line class="pv-under" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/><line class="pv" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`;
  }
  for (const h of passTargets(s, c)) {
    const p = centre(h), on = preview.value === h;
    tp += `<circle class="t-pass-mark${on ? " on" : ""}" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${on ? 14 : 12.5}"/><circle class="t-pass" data-act="lab-pass" data-hex="${h}" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="14"/>`;
  }
  return { lo, tp, threats };
});
/** Words for the pass or shot under the pointer. */
const passText = computed(() => {
  const c = carrierP.value;
  if (!c || preview.value === null) return "";
  const s = state.value, o = passOdds(s, c, preview.value), spot = HEXES[preview.value].num;
  const who = (id: string) => playerName(playerById(s, id)!);
  const lane = o.threats.length ? `lane threatened by ${o.threats.map(t => { const [id, ...rest] = t.split(" "); return `${who(id.replace("(reserve)", ""))}${id.includes("reserve") ? " from reserve" : ""} (${rest.join(" ")})`; }).join(", ")}` : "the lane is clear";
  if (o.shot) return `Shot at spot ${spot}: goal ${pct(o.goal!)}; ${lane}; ${o.keeper}.`;
  const end = o.mates.length && o.opps.length ? `${who(o.mates[0])} has to win it against ${o.opps.map(who).join(", ")}`
    : o.opps.length ? `${o.opps.map(who).join(", ")} stands there and wins it`
    : o.mates.length ? `${who(o.mates[0])} receives it` : "nobody there: a through ball into space";
  return `Pass to spot ${spot}: arrives ${pct(o.arrive)} (on target ${pct(o.acc)}; off target it scatters one or two spots); ${lane}; ${end}.`;
});
/** The top options the coach and the advisor would see in this position. */
/** The chosen heat map(s): ball threat and counter-threat need someone on the ball. */
const heat = computed(() => {
  const s = state.value, c = carrierP.value, maps: { team: TeamId; m: HeatMap; title: string }[] = [];
  const name = (t: TeamId) => (t === "K" ? "Kernels" : "Shells");
  if (pick.heat === "ball" && c) maps.push({ team: c.team, m: ballThreat(s), title: `Ball threat, ${playerName(c)}` });
  else if (pick.heat === "team") (c ? [c.team] : (["K", "S"] as TeamId[])).forEach(t => maps.push({ team: t, m: teamThreat(s, t), title: `${name(t)} threat` }));
  else if (pick.heat === "counter" && c) { const t: TeamId = c.team === "K" ? "S" : "K"; maps.push({ team: t, m: teamThreat(s, t), title: `Counter-threat if the ${name(t)} win it back` }); }
  return maps.map(x => ({ ...x, svg: heatSvg(x.m, x.team, prefs.rot), focal: focal(x.m, 5) }));
});
const coachOptions = computed(() => (carrierP.value ? analyze(state.value).options.slice().sort((a, b) => b.score - a.score).slice(0, 8) : []));
const staticHtml = computed(() => staticBoard(prefs.rot, true));
const spotsHtml = computed(() => HEXES.map(h => {
  const c = centre(h.id);
  return `<circle class="lab-spot" data-act="lab-spot" data-hex="${h.id}" cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="${(R * .82).toFixed(1)}"/>`;
}).join(""));
const piecesHtml = computed(() => state.value.players.map(p => pieceSvg(p, { rot: prefs.rot, act: "lab-piece", selected: sel.value === p.id, threat: ballLayers.value.threats.has(p.id), mine: true })).join(""));

const counts = computed(() => {
  const ctl = control(state.value);
  const half = (seg: number) => { const y = pixelOf(segHex(seg), R).y; return Math.abs(y - 5.5 * HH) < 1 ? null : y < 5.5 * HH ? "K" : "S"; };
  const stat = (t: TeamId) => {
    const mine = [...ctl.entries()].filter(([, x]) => x === t).map(([seg]) => seg);
    return { all: mine.length, theirs: mine.filter(seg => half(seg) !== null && half(seg) !== t).length };
  };
  const hexes = state.value.players.map(p => segHex(p.seg));
  const shared = new Set(hexes.filter((h, i) => hexes.indexOf(h) !== i)).size;
  const terr = territory(state.value);
  return { K: { ...stat("K"), terr: terr.K }, S: { ...stat("S"), terr: terr.S }, shared };
});
/** Tempo, from the shapes as edited here: development (kick-off to target) and the keeper's chain to the box. */
const tempo = computed(() => {
  const one = (t: TeamId) => {
    const players = draft[pick[t]].players;
    const spots = players.map(p => hexDist(hexByNum(p.kickoff)!, hexByNum(p.target)!));
    const ap = spots.reduce((a, b) => a + b, 0);
    const turns = Math.max(Math.ceil(ap / 7), ...players.map((p, i) => Math.ceil(spots[i] / (1 + BUILDS[p.pos].pac))));
    const from = carrierP.value && carrierP.value.team === t ? carrierP.value : undefined;
    const c = chain(state.value, t, from?.num);
    const start = from ? `#${from.num} with the ball` : "keeper";
    const ch = c.passes === Infinity ? `no passing chain from the ${start} to the box`
      : `${start} to the box in ${c.passes} pass${c.passes === 1 ? "" : "es"}, ${Math.round(c.safe * 100)}% clear${c.reached ? "" : " (nobody next to the penalty spot)"}`;
    return `develops in ${turns} turn${turns === 1 ? "" : "s"} (${ap} AP); ${ch}`;
  };
  return { K: one("K"), S: one("S") };
});

function onClick(e: MouseEvent) {
  const el = (e.target as Element).closest("[data-act]") as HTMLElement | null;
  if (!el) { sel.value = null; return; }
  if (el.dataset.act === "lab-pass") { preview.value = Number(el.dataset.hex); return; }   // a tap on touch screens
  if (el.dataset.act === "lab-piece" && pick.ball) { ballAt.value = ballAt.value === el.dataset.id ? null : el.dataset.id!; preview.value = null; sel.value = null; return; }
  if (el.dataset.act === "lab-piece") { sel.value = sel.value === el.dataset.id ? null : el.dataset.id!; note.value = ""; return; }
  if (el.dataset.act === "lab-spot" && sel.value) moveTo(Number(el.dataset.hex));
}
function onOver(e: PointerEvent) {
  if (e.pointerType === "touch") return;
  const el = (e.target as Element).closest('[data-act="lab-pass"]') as HTMLElement | null;
  const n = el ? Number(el.dataset.hex) : null;
  if (n !== preview.value) preview.value = n;
}
/** Move the selected player to a spot (given on the board, so mirrored back for the Shells). */
function moveTo(hex: number) {
  const team = sel.value![0] as TeamId, n = Number(sel.value!.slice(1));
  const players = draft[pick[team]].players, p = players[n - 1];
  const h = HEXES[hex];
  const [q, r] = mirror(team, h.q, h.r);            // mirroring twice is the identity
  const at = hexAt(q, r);
  if (at === undefined) return;
  const x = HEXES[at];
  if (x.kind === "goal" && p.pos !== "GK") { note.value = "Only the keeper can stand in his goal."; return; }
  if (x.cut) { note.value = "Pick a full spot: players start on whole hexagons."; return; }
  const key = pick.mode, spot = x.num;
  const mate = players.find(o => o !== p && o[key] === spot);
  if (mate) mate[key] = p[key];                     // swap with a teammate already there
  p[key] = spot;
  edited.value = true; sel.value = null; note.value = "";
}
function reset() { Object.assign(draft, fromEngine()); edited.value = false; sel.value = null; note.value = "Back to the formations in data/formations.json."; }
function json(): string {
  return "{\n" + Object.entries(draft).map(([k, v]) =>
    `  "${k}": {\n    "style": "${v.style}",\n    "players": [\n` +
    v.players.map(p => `      { "pos": "${p.pos}", "kickoff": ${p.kickoff}, "target": ${p.target} }`).join(",\n") + "\n    ]\n  }").join(",\n") + "\n}\n";
}
const jsonText = ref("");
async function copy() {
  jsonText.value = json();
  try { await navigator.clipboard.writeText(jsonText.value); note.value = "Copied. Paste it over data/formations.json and rebuild."; }
  catch { note.value = "Copying isn’t allowed here: select the text below and copy it."; }
}
</script>

<template>
  <dialog ref="dlg" class="lab" aria-label="Formation lab" @close="store.labOpen = false">
    <div class="lab-head">
      <h2>Formation lab</h2>
      <button type="button" class="close" aria-label="Close the formation lab" @click="store.labOpen = false">✕</button>
    </div>
    <div class="lab-bar">
      <label class="ctl">Kernels <select v-model="pick.K"><option v-for="n in FORMATION_NAMES" :key="n" :value="n">{{ n }}, {{ draft[n].style }}</option></select></label>
      <div class="mode" role="radiogroup" aria-label="Which shapes">
        <label class="ctl"><input type="radio" value="target" v-model="pick.mode"> Target shapes</label>
        <label class="ctl"><input type="radio" value="kickoff" v-model="pick.mode"> Kick-off</label>
        <label class="ctl"><input type="checkbox" v-model="pick.numbers"> Spot numbers</label>
        <label class="ctl" title="A lighter tint on the empty spots each side would get to first"><input type="checkbox" v-model="pick.influence"> Influence</label>
        <label class="ctl">Heat
          <select v-model="pick.heat" aria-label="Heat map">
            <option value="off">Off</option>
            <option value="ball" :disabled="!carrierP">Ball threat</option>
            <option value="team">Team threat</option>
            <option value="counter" :disabled="!carrierP">Counter-threat</option>
          </select>
        </label>
        <label class="ctl" title="Then click a pistachio to give him the ball"><input type="checkbox" v-model="pick.ball" @change="!pick.ball && (ballAt = null, preview = null)"> Ball</label>
      </div>
      <label class="ctl">Shells <select v-model="pick.S"><option v-for="n in FORMATION_NAMES" :key="n" :value="n">{{ n }}, {{ draft[n].style }}</option></select></label>
    </div>
    <p class="lab-counts">
      <span>Kernels {{ pick.K }}: {{ counts.K.all }} segments, {{ counts.K.theirs }} in the Shells’ half; first to {{ counts.K.terr }} empty spots</span>
      <span>Shells {{ pick.S }}: {{ counts.S.all }} segments, {{ counts.S.theirs }} in the Kernels’ half; first to {{ counts.S.terr }} empty spots</span>
    </p>
    <p class="lab-counts">
      <span>Kernels {{ tempo.K }}</span>
      <span>Shells {{ tempo.S }}</span>
    </p>
    <svg class="lab-pitch" :class="{ 'no-coords': !pick.numbers }" :style="{ '--tint': prefs.tint / 100 }" :viewBox="viewBox(prefs.rot)"
      role="img" aria-label="Both formations on the pitch, with who controls which segments" @click="onClick" @pointerover="onOver">
      <defs v-html="DEFS" />
      <g :transform="prefs.rot ? `rotate(${-prefs.rot})` : undefined">
        <g v-html="staticHtml" />
        <g v-if="pick.influence" v-html="influenceSvg(state)" />
        <g v-html="controlSvg(state)" />
        <g v-for="h in heat" :key="h.title" v-html="h.svg" pointer-events="none" />
        <g v-html="spotsHtml" />
        <g v-html="ballLayers.lo" />
        <g v-html="piecesHtml" />
        <g v-if="carrierP" :style="{ transform: ballTransform(state) }" v-html="BALL" pointer-events="none" />
        <g v-html="ballLayers.tp" />
      </g>
    </svg>
    <p class="small" aria-live="polite">
      {{ note || passText || (pick.ball && !carrierP ? "Click a pistachio to give him the ball." : carrierP ? `${playerName(carrierP)} has the ball: segments show where he can dribble and what it costs; hover a ring to see a pass or shot.` : "") || (sel ? "Now click the spot to move him to (a teammate already there swaps places)." : counts.shared ? `${counts.shared} spot${counts.shared > 1 ? "s are" : " is"} shared: the split segments are contested ground.` : "Click a pistachio, then a spot, to move him. Positions are written from the Kernels’ side; the Shells mirror them.") }}
    </p>
    <div v-if="heat.length" class="lab-options">
      <template v-for="h in heat" :key="h.title">
        <p class="log-head">{{ h.title }}: focal points</p>
        <ol v-if="h.focal.length"><li v-for="f in h.focal" :key="f.hex">spot {{ HEXES[f.hex].num }}: {{ f.why }}</li></ol>
        <p v-else class="small">No danger anywhere this turn.</p>
      </template>
    </div>
    <p v-if="(pick.heat === 'ball' || pick.heat === 'counter') && !carrierP" class="small">Ball threat and counter-threat need someone on the ball: tick Ball and click a pistachio.</p>
    <div v-if="coachOptions.length" class="lab-options">
      <p class="log-head">What the coach would see</p>
      <ol><li v-for="o in coachOptions" :key="o.cmd + o.kind">{{ o.text }}</li></ol>
    </div>
    <div class="row">
      <button type="button" class="strong" @click="copy">Copy as JSON</button>
      <button type="button" :disabled="!edited" @click="reset">Reset</button>
      <span v-if="edited" class="small">Edited here only: the match uses data/formations.json until you paste this in and rebuild.</span>
    </div>
    <textarea v-if="jsonText" class="lab-json" readonly rows="8" :value="jsonText"></textarea>
  </dialog>
</template>
