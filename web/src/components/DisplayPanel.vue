<script setup lang="ts">
import { prefs, store } from "../lib/game.ts";
import { album } from "../lib/album.ts";
</script>

<template>
  <details>
    <summary>Display</summary>
    <div class="settings">
      <label class="ctl" title="Shortcut: C"><input type="checkbox" v-model="prefs.coords"> Show coordinates</label>
      <label class="ctl" title="Shortcut: R"><input type="checkbox" :checked="prefs.rot === 90" @change="prefs.rot = ($event.target as HTMLInputElement).checked ? 90 : 0"> Turn the pitch sideways (1a bottom left)</label>
      <label class="ctl" title="Shortcut: V"><input type="checkbox" v-model="prefs.control"> Show control (magenta Kernels, coffee Shells)</label>
      <label class="ctl slider">Pitch colours <input type="range" min="10" max="100" step="5" v-model.number="prefs.tint" aria-label="Pitch colour strength"></label>
      <button type="button" title="Shortcut: L" @click="store.labOpen = true">Open the formation lab</button>
      <button type="button" title="Shortcut: A" @click="album.open = true">Open the sticker album</button>
    </div>
  </details>
</template>
