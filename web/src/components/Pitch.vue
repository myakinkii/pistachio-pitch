<script setup lang="ts">
// Pitch.vue: the match board. The static pitch is rebuilt only when the view
// turns; the moving parts (control, targets, pistachios, ball) follow the match.
import { computed } from "vue";
import { reach, passTargets, laneThreats, carrier, hexOf, inHex, playerOf, segName, HEXES } from "../../../src/engine/index.ts";
import { DEFS, BALL, staticBoard, letters, viewBox, pieceSvg, controlSvg, ballTransform, segPts, segCentroid, centre, upright } from "../lib/draw.ts";
import { store, prefs, shown, humanTurn, act, cardText } from "../lib/game.ts";

const staticHtml = computed(() => staticBoard(prefs.rot));
const lettersHtml = computed(() => letters(prefs.rot));
const state = computed(() => { void store.tick; void store.view; return shown(); });
const ctrlHtml = computed(() => (prefs.control ? controlSvg(state.value) : ""));
const ballXf = computed(() => ballTransform(state.value));

const layers = computed(() => {
  void store.tick; void store.aiBusy;
  const s = state.value, rot = prefs.rot;
  const canAct = humanTurn() && store.view === null;
  const sel = canAct && store.sel !== null ? playerOf(s, s.turn, store.sel) : undefined;
  const c = carrier(s), bh = s.ball.hex, iCarry = !!sel && c === sel;
  let lo = "", tp = "";
  const threats = new Set<string>();
  if (sel) {
    lo += `<polygon points="${segPts(sel.seg)}" class="t-from"/>`;
    if (s.ap > 0) for (const [seg, cost] of reach(s, sel).cost) {
      const cc = segCentroid(seg);
      lo += `<polygon class="t-move" data-act="move" data-seg="${seg}" data-cost="${cost}" tabindex="0" aria-label="Move to ${segName(seg)}, ${cost} AP" points="${segPts(seg)}"/><text class="cost" x="${cc.x.toFixed(1)}" y="${(cc.y + 3).toFixed(1)}"${upright(rot, cc.x, cc.y)}>${cost}</text>`;
    }
  }
  if (iCarry && store.preview !== null) {
    const a = centre(bh), b = centre(store.preview);
    for (const t of laneThreats(s, sel!.team, bh, store.preview)) threats.add(t.p.id);
    for (const x of inHex(s, store.preview)) if (x.team !== sel!.team) threats.add(x.id);
    lo += `<line class="pv-under" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/><line class="pv" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`;
  }
  for (const p of s.players) lo += pieceSvg(p, { rot, mine: canAct && p.team === s.turn, selected: !!sel && sel.id === p.id, threat: threats.has(p.id) });
  if (iCarry && s.ap > 0) for (const h of passTargets(s, sel!)) {
    const p = centre(h), on = store.preview === h;
    tp += `<circle class="t-pass-mark${on ? " on" : ""}" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${on ? 14 : 12.5}"/><circle class="t-pass" data-act="pass" data-hex="${h}" tabindex="0" aria-label="Pass to spot ${HEXES[h].num}" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="14"/>`;
  }
  if (sel && s.ap > 0 && c && c.team !== sel.team && hexOf(sel) === bh && !s.beaten.includes(sel.id)) {
    const b = centre(bh);
    tp += `<circle class="t-tackle" data-act="tackle" tabindex="0" aria-label="Tackle" cx="${b.x}" cy="${b.y}" r="16"/>`;
  }
  return { lo, tp };
});

const target = (e: Event) => (e.target as Element).closest("[data-act]") as HTMLElement | null;
function onClick(e: MouseEvent) {
  const el = target(e);
  if (!el) { store.sel = null; store.preview = null; return; }
  act(el.dataset, false);
}
function onKey(e: KeyboardEvent) {
  if (e.key !== "Enter" && e.key !== " ") return;
  const el = target(e);
  if (el) { e.preventDefault(); act(el.dataset, true); }
}
function onOver(e: PointerEvent) {
  if (store.lastPtr === "touch") return;
  const el = e.target as Element;
  const pass = el.closest('[data-act="pass"]') as HTMLElement | null;
  const n = pass ? Number(pass.dataset.hex) : null;
  if (n !== store.preview) store.preview = n;
  const pc = el.closest('[data-act="piece"]') as HTMLElement | null;
  const mv = el.closest('[data-act="move"]') as HTMLElement | null;
  if (pc && store.preview === null) { const pl = state.value.players.find(x => x.id === pc.dataset.id); store.hover = pl ? cardText(state.value, pl) : ""; }
  else if (mv) { const c = Number(mv.dataset.cost); store.hover = `Move to ${segName(Number(mv.dataset.seg))} for ${c} action${c > 1 ? "s" : ""}.`; }
  else store.hover = "";
}
</script>

<template>
  <svg id="pitch" :class="{ 'no-coords': !prefs.coords, 'no-ctrl': !prefs.control }" :style="{ '--tint': prefs.tint / 100 }"
    :viewBox="viewBox(prefs.rot)" role="application" aria-label="Hex football pitch with pistachio players"
    @click="onClick" @keydown="onKey" @pointerdown="store.lastPtr = $event.pointerType || 'mouse'" @pointerover="onOver" @pointerleave="store.hover = ''">
    <defs v-html="DEFS" />
    <g :transform="prefs.rot ? `rotate(${-prefs.rot})` : undefined">
      <g v-html="staticHtml" />
      <g v-html="ctrlHtml" />
      <g v-html="layers.lo" />
      <g class="coord-lets" pointer-events="none" v-html="lettersHtml" />
      <g id="ball" :style="{ transform: ballXf }" v-html="BALL" />
      <g v-html="layers.tp" />
    </g>
  </svg>
</template>
