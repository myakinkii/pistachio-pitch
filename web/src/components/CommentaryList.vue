<script setup lang="ts">
import { store } from "../lib/game.ts";
</script>

<template>
  <section class="comms">
    <p class="log-head">Commentary</p>
    <ol class="log">
      <li v-for="(l, i) in store.comms" :key="store.comms.length - i" :class="[l.team, { big: l.big }]"><span class="mv">{{ l.n }}</span>{{ l.text }}</li>
    </ol>
  </section>
</template>
