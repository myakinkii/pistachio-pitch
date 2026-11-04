<script setup lang="ts">
import { computed } from "vue";
import { store, shown, setSide, schedule, type Side } from "../lib/game.ts";
import type { TeamId } from "../../../src/engine/index.ts";
const s = computed(() => { void store.tick; void store.view; return shown(); });
const options: [Side, string][] = [["human", "You"], ["bot", "Bot"], ["advisor", "Advisor"], ["claude", "Claude"]];
const change = (t: TeamId, e: Event) => setSide(t, (e.target as HTMLSelectElement).value as Side);
</script>

<template>
  <div class="score" aria-label="Score">
    <h1 class="title">Calcio Pistacchio</h1>
    <div class="team K">
      <svg viewBox="-12 -16 24 32" aria-hidden="true"><clipPath id="miniK"><ellipse rx="10.5" ry="14.5"/></clipPath><g clip-path="url(#miniK)"><rect x="-11" y="-15" width="22" height="30" fill="#9fcb3a"/><rect x="-11" y="-3.5" width="22" height="7" fill="#9c2e6b"/></g><ellipse rx="10.5" ry="14.5" fill="none" stroke="#2a1f22" stroke-width="1.4"/></svg>
      <span><span>Kernels</span><span class="form">{{ s.formation.K }}</span></span>
    </div>
    <div class="nums"><span>{{ s.score.K }}</span><span>:</span><span>{{ s.score.S }}</span></div>
    <div class="team S">
      <span><span>Shells</span><span class="form">{{ s.formation.S }}</span></span>
      <svg viewBox="-12 -16 24 32" aria-hidden="true"><clipPath id="miniS"><ellipse rx="11" ry="15"/></clipPath><g clip-path="url(#miniS)"><rect x="-11" y="-15" width="22" height="30" fill="#ecdfbf"/><rect x="-3" y="-15" width="6" height="30" fill="#6b4426"/></g><ellipse rx="11" ry="15" fill="none" stroke="#4a3018" stroke-width="1.4"/></svg>
    </div>
    <select class="side K" aria-label="Who plays the Kernels" :value="store.sides.K" @change="change('K', $event)">
      <option v-for="[v, l] in options" :key="v" :value="v">{{ l }}</option>
    </select>
    <span class="vs" aria-hidden="true">–</span>
    <select class="side S" aria-label="Who plays the Shells" :value="store.sides.S" @change="change('S', $event)">
      <option v-for="[v, l] in options" :key="v" :value="v">{{ l }}</option>
    </select>
    <label class="ctl auto" title="Claude sides make one request per turn on your Claude account; any problem switches auto-play off">
      <input type="checkbox" v-model="store.auto" @change="schedule()"> Auto-play AI sides
    </label>
  </div>
</template>
