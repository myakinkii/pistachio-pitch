<script setup lang="ts">
import { reactive, ref } from "vue";
import { FORMATIONS, FORMATION_NAMES } from "../../../src/engine/index.ts";
import { startMatch, randomSeed, getMatch } from "../lib/game.ts";
import SquadTable from "./SquadTable.vue";

const box = ref<HTMLDetailsElement>();
const m = getMatch().start;
const f = reactive({ seed: "", ap: m.apPerTurn, turns: m.maxTurns, K: m.formation.K, S: m.formation.S });
// a fresh seed each time the panel is opened empty; type your own to replay a fixture
const onToggle = () => { if (box.value?.open && !f.seed.trim()) f.seed = randomSeed(); };
function start() {
  startMatch({ seed: f.seed.trim(), ap: f.ap, turns: f.turns, formation: { K: f.K, S: f.S } });
  f.seed = randomSeed(); if (box.value) box.value.open = false;
}
</script>

<template>
  <details ref="box" @toggle="onToggle">
    <summary>New match</summary>
    <div class="settings">
      <div class="forms">
        <label class="ctl">Kernels <select v-model="f.K" aria-label="Kernels formation"><option v-for="n in FORMATION_NAMES" :key="n" :value="n">{{ n }} ({{ FORMATIONS[n].style }})</option></select></label>
        <label class="ctl">Shells <select v-model="f.S" aria-label="Shells formation"><option v-for="n in FORMATION_NAMES" :key="n" :value="n">{{ n }} ({{ FORMATIONS[n].style }})</option></select></label>
      </div>
      <div class="squads"><SquadTable team="Kernels" :formation="f.K" /><SquadTable team="Shells" :formation="f.S" /></div>
      <label class="ctl">Seed <input v-model="f.seed" type="text" spellcheck="false"></label>
      <label class="ctl">Actions per turn <select v-model.number="f.ap"><option v-for="n in [5, 6, 7, 8, 9, 10]" :key="n" :value="n">{{ n }}</option></select></label>
      <label class="ctl">Turns <select v-model.number="f.turns"><option v-for="n in [10, 20, 40, 60]" :key="n" :value="n">{{ n }}</option></select></label>
      <button type="button" class="strong" @click="start">Start new match</button>
    </div>
  </details>
</template>
