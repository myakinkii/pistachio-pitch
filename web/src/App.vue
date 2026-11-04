<script setup lang="ts">
// App.vue: the layout. Upright, the score and turn boxes lead the side panel;
// sideways, they sit in a status bar above the wide pitch.
import { onMounted, onBeforeUnmount } from "vue";
import Pitch from "./components/Pitch.vue";
import ScoreBox from "./components/ScoreBox.vue";
import TurnBox from "./components/TurnBox.vue";
import DisplayPanel from "./components/DisplayPanel.vue";
import NewMatchPanel from "./components/NewMatchPanel.vue";
import NotationPanel from "./components/NotationPanel.vue";
import HowItPlays from "./components/HowItPlays.vue";
import CommentaryList from "./components/CommentaryList.vue";
import FormationLab from "./components/FormationLab.vue";
import AlbumDialog from "./components/AlbumDialog.vue";
import { store, prefs, step, schedule } from "./lib/game.ts";
import { album } from "./lib/album.ts";

function onKey(e: KeyboardEvent) {
  const t = e.target as HTMLInputElement;
  const typing = t.tagName === "TEXTAREA" || t.tagName === "SELECT" || (t.tagName === "INPUT" && t.type !== "checkbox" && t.type !== "range" && t.type !== "radio");
  if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (k === "c") prefs.coords = !prefs.coords;
  else if (k === "v") prefs.control = !prefs.control;
  else if (k === "r") prefs.rot = prefs.rot ? 0 : 90;
  else if (k === "l") store.labOpen = !store.labOpen;
  else if (k === "a") album.open = !album.open;
  else if (store.view !== null && (e.key === "ArrowRight" || e.key === "ArrowLeft")) step(e.key === "ArrowRight" ? 1 : -1);
}
// #lab opens the formation lab directly, #album the sticker album (plain hashes, as artifact links allow)
const fromHash = () => { if (location.hash === "#lab") store.labOpen = true; if (location.hash === "#album") album.open = true; };
onMounted(() => { document.addEventListener("keydown", onKey); window.addEventListener("hashchange", fromHash); fromHash(); schedule(); });
onBeforeUnmount(() => { document.removeEventListener("keydown", onKey); window.removeEventListener("hashchange", fromHash); });
</script>

<template>
  <main class="app" :class="{ wide: prefs.rot }">
    <section class="board-wrap" aria-label="Pitch">
      <div v-if="prefs.rot" class="hud" aria-label="Match status"><ScoreBox /><TurnBox /></div>
      <Pitch />
    </section>
    <aside class="panel">
      <template v-if="!prefs.rot"><ScoreBox /><TurnBox /></template>
      <DisplayPanel />
      <NewMatchPanel />
      <NotationPanel />
      <HowItPlays />
      <CommentaryList />
    </aside>
    <FormationLab />
    <AlbumDialog />
  </main>
</template>
