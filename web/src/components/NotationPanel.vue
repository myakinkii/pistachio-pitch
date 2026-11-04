<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { store, getMatch, load, saveFile, replay } from "../lib/game.ts";

const text = ref("");
const editing = ref(false);
// the textarea follows the match unless you're typing in it
watch(() => store.tick, () => { if (!editing.value) text.value = getMatch().toText(); }, { immediate: true });
const count = computed(() => { void store.tick; return getMatch().entries.length; });
const replayText = computed(() => store.view !== null
  ? `Replay: action ${store.view} of ${count.value}`
  : `Step through the match so far (${count.value} actions), or a loaded file.`);
async function copy(e: Event) {
  text.value = getMatch().toText();
  try { await navigator.clipboard.writeText(text.value); store.ioNote = "Copied."; }
  catch { ((e.target as HTMLElement).closest("details")!.querySelector("textarea") as HTMLTextAreaElement).select(); store.ioNote = "Selected: press Ctrl+C (or Cmd+C) to copy."; }
}
async function openFile(e: Event) {
  const input = e.target as HTMLInputElement, f = input.files?.[0];
  if (f) load(await f.text());
  input.value = "";
}
</script>

<template>
  <details>
    <summary>Notation, save and load</summary>
    <p class="small">The match as Pistachio Pitch Notation. The same file replays in the command line: <code>node src/cli.ts replay match.ppn --verify</code></p>
    <textarea v-model="text" spellcheck="false" rows="8" @focus="editing = true" @blur="editing = false"></textarea>
    <div class="row">
      <button type="button" @click="saveFile">Save file</button>
      <button type="button" @click="copy">Copy</button>
      <button type="button" @click="load(text)">Load from text</button>
      <label class="file">Open file<input type="file" accept=".ppn,.txt,text/plain" @change="openFile"></label>
    </div>
    <p class="small" aria-live="polite">{{ store.ioNote }}</p>
    <p class="log-head">Replay</p>
    <p class="small">{{ replayText }}</p>
    <div class="row">
      <button type="button" aria-label="First action" :disabled="store.aiBusy || !count" @click="replay('first')">⏮</button>
      <button type="button" aria-label="Previous action" :disabled="store.aiBusy || !count" @click="replay('prev')">◀</button>
      <button type="button" aria-label="Next action" :disabled="store.aiBusy || !count" @click="replay('next')">▶</button>
      <button type="button" aria-label="Last action" :disabled="store.aiBusy || !count" @click="replay('last')">⏭</button>
      <button type="button" :disabled="store.aiBusy || store.view === null" @click="replay('resume')">Play on from here</button>
    </div>
  </details>
</template>
