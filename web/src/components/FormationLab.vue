<script setup lang="ts">
// FormationLab.vue: two formations against each other, at kick-off or in their
// target shapes, with the engine's control map. Edit mode: click a pistachio,
// then a spot. "Copy as JSON" gives a data/formations.json with your changes.
import { ref, reactive, computed, watch } from "vue";
import {
  newState, control, HEXES, hexByNum, hexAt, mirror, segHex, pixelOf, FORMATIONS, FORMATION_NAMES,
  type TeamId,
} from "../../../src/engine/index.ts";
import { DEFS, staticBoard, viewBox, pieceSvg, controlSvg, centre, R, HH } from "../lib/draw.ts";
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
const pick = reactive({ K: "4-4-2", S: "5-4-1", mode: "target" as "target" | "kickoff", numbers: true });
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
  return s;
});
const staticHtml = computed(() => staticBoard(prefs.rot, true));
const spotsHtml = computed(() => HEXES.map(h => {
  const c = centre(h.id);
  return `<circle class="lab-spot" data-act="lab-spot" data-hex="${h.id}" cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="${(R * .82).toFixed(1)}"/>`;
}).join(""));
const piecesHtml = computed(() => state.value.players.map(p => pieceSvg(p, { rot: prefs.rot, act: "lab-piece", selected: sel.value === p.id, mine: true })).join(""));

const counts = computed(() => {
  const ctl = control(state.value);
  const half = (seg: number) => { const y = pixelOf(segHex(seg), R).y; return Math.abs(y - 5.5 * HH) < 1 ? null : y < 5.5 * HH ? "K" : "S"; };
  const stat = (t: TeamId) => {
    const mine = [...ctl.entries()].filter(([, x]) => x === t).map(([seg]) => seg);
    return { all: mine.length, theirs: mine.filter(seg => half(seg) !== null && half(seg) !== t).length };
  };
  const hexes = state.value.players.map(p => segHex(p.seg));
  const shared = new Set(hexes.filter((h, i) => hexes.indexOf(h) !== i)).size;
  return { K: stat("K"), S: stat("S"), shared };
});

function onClick(e: MouseEvent) {
  const el = (e.target as Element).closest("[data-act]") as HTMLElement | null;
  if (!el) { sel.value = null; return; }
  if (el.dataset.act === "lab-piece") { sel.value = sel.value === el.dataset.id ? null : el.dataset.id!; note.value = ""; return; }
  if (el.dataset.act === "lab-spot" && sel.value) moveTo(Number(el.dataset.hex));
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
      </div>
      <label class="ctl">Shells <select v-model="pick.S"><option v-for="n in FORMATION_NAMES" :key="n" :value="n">{{ n }}, {{ draft[n].style }}</option></select></label>
    </div>
    <p class="lab-counts">
      <span>Kernels {{ pick.K }}: {{ counts.K.all }} segments, {{ counts.K.theirs }} in the Shells’ half</span>
      <span>Shells {{ pick.S }}: {{ counts.S.all }} segments, {{ counts.S.theirs }} in the Kernels’ half</span>
    </p>
    <svg class="lab-pitch" :class="{ 'no-coords': !pick.numbers }" :style="{ '--tint': prefs.tint / 100 }" :viewBox="viewBox(prefs.rot)"
      role="img" aria-label="Both formations on the pitch, with who controls which segments" @click="onClick">
      <defs v-html="DEFS" />
      <g :transform="prefs.rot ? `rotate(${-prefs.rot})` : undefined">
        <g v-html="staticHtml" />
        <g v-html="controlSvg(state)" />
        <g v-html="spotsHtml" />
        <g v-html="piecesHtml" />
      </g>
    </svg>
    <p class="small" aria-live="polite">
      {{ note || (sel ? "Now click the spot to move him to (a teammate already there swaps places)." : counts.shared ? `${counts.shared} spot${counts.shared > 1 ? "s are" : " is"} shared: the split segments are contested ground.` : "Click a pistachio, then a spot, to move him. Positions are written from the Kernels’ side; the Shells mirror them.") }}
    </p>
    <div class="row">
      <button type="button" class="strong" @click="copy">Copy as JSON</button>
      <button type="button" :disabled="!edited" @click="reset">Reset</button>
      <span v-if="edited" class="small">Edited here only: the match uses data/formations.json until you paste this in and rebuild.</span>
    </div>
    <textarea v-if="jsonText" class="lab-json" readonly rows="8" :value="jsonText"></textarea>
  </dialog>
</template>
