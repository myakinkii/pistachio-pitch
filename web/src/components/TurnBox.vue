<script setup lang="ts">
import { computed } from "vue";
import { playerOf } from "../../../src/engine/index.ts";
import { TEAM } from "../lib/draw.ts";
import { store, shown, live, humanTurn, hintText, endTurn, reserve, undo, aiTurn, stopAi, replay, getMatch } from "../lib/game.ts";

const s = computed(() => { void store.tick; void store.view; return shown(); });
const sel = computed(() => (store.sel !== null ? playerOf(s.value, s.value.turn, store.sel) : undefined));
const hint = computed(() => { void store.tick; void store.sel; void store.preview; void store.hover; void store.error; void store.sides.K; void store.sides.S; return hintText(); });
const canHuman = computed(() => { void store.tick; void store.aiBusy; void store.view; return humanTurn(); });
const side = computed(() => store.sides[s.value.turn]);
const showAi = computed(() => { void store.tick; void store.view; return live() && side.value !== "human"; });
const aiLabel = computed(() => side.value === "claude"
  ? (store.sampleOk ? `Ask Claude to play the ${TEAM[s.value.turn].name}’ turn` : "Claude isn’t available here")
  : side.value === "advisor" ? "Play the advisor’s turn" : "Play the bot’s turn");
const replayText = computed(() => { void store.tick; const n = getMatch().entries.length; return store.view !== null ? `Replay: action ${store.view} of ${n}${store.view > 0 ? ` (last: ${getMatch().entries[store.view - 1].text})` : ""}` : ""; });
const canUndo = computed(() => { void store.tick; return !!getMatch().entries.length && store.view === null && !store.aiBusy; });
</script>

<template>
  <div class="turn">
    <div class="turn-row">
      <span id="turnText"><template v-if="s.over">Full time</template><template v-else><span class="chip" :style="{ background: TEAM[s.turn].chip }"></span>{{ TEAM[s.turn].name }} to play</template></span>
      <span id="turnNo">Turn {{ Math.min(s.turnNo, s.maxTurns) }} of {{ s.maxTurns }}</span>
    </div>
    <div class="ap-row"><span class="ap-label">Actions left</span>
      <div class="pips"><span v-for="i in s.apPerTurn" :key="i" class="pip" :class="{ full: i <= s.ap }"></span></div>
    </div>
    <div v-if="store.view !== null" class="replay">
      <span class="replay-text">{{ replayText }}</span>
      <div class="row">
        <button type="button" aria-label="First action" :disabled="store.aiBusy" @click="replay('first')">⏮</button>
        <button type="button" aria-label="Previous action" :disabled="store.aiBusy" @click="replay('prev')">◀</button>
        <button type="button" aria-label="Next action" :disabled="store.aiBusy" @click="replay('next')">▶</button>
        <button type="button" aria-label="Last action" :disabled="store.aiBusy" @click="replay('last')">⏭</button>
        <button type="button" :disabled="store.aiBusy" @click="replay('resume')">Play on from here</button>
      </div>
    </div>
    <p id="hint" class="hint" aria-live="polite">{{ hint }}</p>
    <div class="row">
      <button id="undo" type="button" class="quiet" :disabled="!canUndo" @click="undo">Undo</button>
      <button id="reserveBtn" type="button" :disabled="!canHuman || !sel || s.ap < 1 || sel.reserve >= 2" @click="reserve">{{ sel ? `Reserve on #${sel.num} (+1 AP)` : "Reserve (select a player)" }}</button>
      <button id="endTurn" type="button" class="strong" :disabled="!canHuman" @click="endTurn">End turn</button>
    </div>
    <div v-if="showAi || store.aiNote" class="ai">
      <button v-if="showAi" id="aiBtn" type="button" class="strong" :disabled="store.aiBusy || (side === 'claude' && !store.sampleOk)" @click="aiTurn">{{ aiLabel }}</button>
      <button v-if="store.aiBusy" type="button" @click="stopAi">Stop</button>
      <p class="note">{{ store.aiNote }}</p>
    </div>
  </div>
</template>
