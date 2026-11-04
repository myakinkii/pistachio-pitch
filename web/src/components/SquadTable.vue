<script setup lang="ts">
import { FORMATIONS, BUILDS } from "../../../src/engine/index.ts";
import { STAT_LABEL } from "../lib/game.ts";
defineProps<{ team: string; formation: string }>();
</script>

<template>
  <table class="squad">
    <caption>{{ team }}: {{ formation }}, {{ FORMATIONS[formation].style }}</caption>
    <thead><tr><th>#</th><th class="pos"></th><th v-for="[, l] in STAT_LABEL" :key="l">{{ l }}</th></tr></thead>
    <tbody>
      <tr v-for="([pos], i) in FORMATIONS[formation].slots" :key="i">
        <td>{{ i + 1 }}</td><td class="pos">{{ pos }}</td>
        <td v-for="[k] in STAT_LABEL" :key="k" :class="k === 'kee' && pos !== 'GK' ? 'lo' : BUILDS[pos][k] >= 5 ? 'hi' : BUILDS[pos][k] <= 1 ? 'lo' : ''">
          {{ k === "kee" && pos !== "GK" ? "–" : BUILDS[pos][k] }}
        </td>
      </tr>
    </tbody>
  </table>
</template>
