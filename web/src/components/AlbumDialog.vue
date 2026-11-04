<script setup lang="ts">
// AlbumDialog.vue: the season's sticker album. Album: every slot, filled or empty.
// Packs: open a free pack and see what came out. Roster: put owned stickers on the
// eleven positions of a formation. Lab: odds and quick tools for testing.
import { ref, computed, watch, reactive } from "vue";
import { FORMATIONS, FORMATION_NAMES, BUILDS, POSITION_NAMES } from "../../../src/engine/index.ts";
import { STAT_LABEL } from "../lib/game.ts";
import { TEAM } from "../lib/draw.ts";
import {
  album, SEASON, TIERS, TIER_NAME, STICKER, completion, expected, openPacks, place, setRoster, setSettings, resetSettings, restart,
  portraitSvg, type Tier,
} from "../lib/album.ts";
import StickerCard from "./StickerCard.vue";

const dlg = ref<HTMLDialogElement>();
watch(() => album.open, open => { if (open) dlg.value?.showModal(); else dlg.value?.close(); });

const st = computed(() => album.state);
const team = computed(() => st.value.roster.team);
const done = computed(() => completion(st.value, SEASON));
const exp = computed(() => expected(SEASON, st.value.settings, st.value.packs));
const pages = computed(() => TIERS.map(t => ({ tier: t, list: SEASON.stickers.filter(s => s.tier === t) })));
const tabs = [["album", "Album"], ["packs", "Packs"], ["roster", "Roster"], ["lab", "Lab"]] as const;

// ---- packs ----
const reveal = computed(() => album.last ? album.last.ids.map((id, i) => ({ s: STICKER.get(id)!, fresh: album.last!.fresh[i], i })) : []);
const opened = ref(0);   // bumped to restart the reveal animation
function openOne() { openPacks(1); opened.value++; }

// ---- roster ----
const slots = computed(() => FORMATIONS[st.value.roster.formation].slots.map(([pos], i) => {
  const id = st.value.roster.spots[i];
  return { i, pos, sticker: id ? STICKER.get(id) ?? null : null };
}));
const ownedList = computed(() => SEASON.stickers.filter(s => st.value.owned[s.id]));
const choices = computed(() => {
  if (album.pick === null) return [];
  const pos = slots.value[album.pick].pos;
  return ownedList.value.slice().sort((a, b) => Number(b.pos === pos) - Number(a.pos === pos) || a.no - b.no);
});
const spotOf = (id: string) => st.value.roster.spots.indexOf(id);
const statLine = (pos: string) => STAT_LABEL.filter(([k]) => k !== "kee" || pos === "GK").map(([k, l]) => `${l} ${BUILDS[pos][k]}`).join(" · ");

// ---- lab ----
const form = reactive({ cards: 0, rates: { common: 0, rare: 0, legendary: 0 } as Record<Tier, number>, seed: "" });
const labNote = ref("");
function syncForm() { form.cards = st.value.settings.cards; Object.assign(form.rates, st.value.settings.rates); form.seed = st.value.seed; }
watch(() => [album.tab, st.value.settings, st.value.seed], syncForm, { immediate: true });
function apply() { labNote.value = setSettings({ cards: Number(form.cards), rates: { ...form.rates } }) ? "Settings applied to the next packs." : "Cards must be 1 to 20, and rates zero or more with at least one above zero."; }
function startOver() { if (confirm("Start a new album? Every sticker you have goes.")) { restart(form.seed); labNote.value = `New album, seed ${st.value.seed}.`; } }
const pct = (n: number, d: number) => (d ? Math.round(n / d * 100) : 0);
</script>

<template>
  <dialog ref="dlg" class="lab album" aria-label="Sticker album" @close="album.open = false">
    <div class="lab-head">
      <h2>{{ SEASON.title }} album</h2>
      <span class="al-sum">{{ done.all.owned }}/{{ done.all.total }} stickers · {{ st.packs }} pack{{ st.packs === 1 ? "" : "s" }} opened</span>
      <button type="button" class="close" aria-label="Close the album" @click="album.open = false">✕</button>
    </div>
    <div class="al-tabs" role="tablist">
      <button v-for="[k, l] in tabs" :key="k" type="button" role="tab" :aria-selected="album.tab === k" :class="{ strong: album.tab === k }" @click="album.tab = k">{{ l }}</button>
      <span class="al-team">Kit:
        <label v-for="t in (['K', 'S'] as const)" :key="t" class="ctl"><input type="radio" name="al-team" :checked="team === t" @change="setRoster({ team: t })"> {{ TEAM[t].name }}</label>
      </span>
    </div>

    <!-- album: every slot -->
    <div v-if="album.tab === 'album'" class="al-body">
      <section v-for="p in pages" :key="p.tier">
        <h3>{{ TIER_NAME[p.tier] }} <span>{{ done[p.tier].owned }}/{{ done[p.tier].total }}</span></h3>
        <div class="al-grid">
          <StickerCard v-for="s in p.list" :key="s.id" :sticker="s" :team="team" :count="st.owned[s.id]" :empty="!st.owned[s.id]" />
        </div>
      </section>
    </div>

    <!-- packs -->
    <div v-else-if="album.tab === 'packs'" class="al-body">
      <div class="al-machine">
        <button type="button" class="strong al-open" @click="openOne">Open a pack <small>(free)</small></button>
        <span>{{ st.settings.cards }} stickers a pack</span>
      </div>
      <div v-if="reveal.length" :key="opened" class="al-grid al-reveal">
        <StickerCard v-for="r in reveal" :key="r.i" :style="{ animationDelay: `${r.i * 0.35}s` }" :sticker="r.s" :team="team" :badge="r.fresh ? 'new' : 'dupe'" />
      </div>
      <p v-else-if="album.lastBatch" class="al-note">Opened {{ album.lastBatch }} packs at once: see the album.</p>
      <p v-else class="al-note">Open a pack to see what's inside.</p>
    </div>

    <!-- roster -->
    <div v-else-if="album.tab === 'roster'" class="al-body">
      <div class="al-machine">
        <label class="ctl">Formation
          <select :value="st.roster.formation" @change="setRoster({ formation: ($event.target as HTMLSelectElement).value })">
            <option v-for="f in FORMATION_NAMES" :key="f" :value="f">{{ f }}, {{ FORMATIONS[f].style }}</option>
          </select>
        </label>
        <span class="al-note">Pick a spot, then one of your stickers. Not used in matches yet.</span>
      </div>
      <ol class="al-roster">
        <li v-for="x in slots" :key="x.i" :class="{ on: album.pick === x.i }">
          <button type="button" class="al-spot" :aria-label="`Spot ${x.i + 1}, ${POSITION_NAMES[x.pos]}: ${x.sticker ? x.sticker.name : 'empty'}`" @click="album.pick = album.pick === x.i ? null : x.i">
            <span class="al-mini" :class="{ ph: !x.sticker }" v-html="portraitSvg(x.sticker?.id ?? 'placeholder', { team, gk: x.pos === 'GK' })"></span>
            <span class="al-spot-txt">
              <b>#{{ x.i + 1 }} {{ x.pos }}</b> {{ x.sticker ? x.sticker.name : "placeholder" }}
              <small>{{ statLine(x.pos) }}<template v-if="x.sticker?.bonus"> · {{ x.sticker.bonus.type === "perk" ? x.sticker.bonus.name : x.sticker.bonus.text }}</template></small>
            </span>
          </button>
        </li>
      </ol>
      <div v-if="album.pick !== null" class="al-picker">
        <div class="al-machine">
          <b>Spot #{{ album.pick + 1 }}, {{ POSITION_NAMES[slots[album.pick].pos] }}</b>
          <button v-if="slots[album.pick].sticker" type="button" @click="place(album.pick!, null)">Clear the spot</button>
          <button type="button" class="quiet" @click="album.pick = null">Cancel</button>
        </div>
        <p v-if="!choices.length" class="al-note">No stickers yet: open some packs first.</p>
        <div class="al-grid small">
          <button v-for="s in choices" :key="s.id" type="button" class="al-choice" :class="{ used: spotOf(s.id) >= 0 }"
            :title="spotOf(s.id) >= 0 ? `Now on spot #${spotOf(s.id) + 1}: moves here` : ''" @click="place(album.pick!, s.id)">
            <StickerCard :sticker="s" :team="team" />
          </button>
        </div>
      </div>
    </div>

    <!-- lab -->
    <div v-else class="al-body al-lab">
      <section>
        <h3>Open quickly</h3>
        <div class="al-machine">
          <button type="button" @click="openPacks(10)">Open 10 packs</button>
          <button type="button" @click="openPacks(20)">Open 20 packs</button>
        </div>
      </section>
      <section>
        <h3>Collected against expected <span>after {{ st.packs }} packs</span></h3>
        <table class="squad al-table">
          <thead><tr><th></th><th>have</th><th>expected</th><th>of</th></tr></thead>
          <tbody>
            <tr v-for="t in TIERS" :key="t"><td>{{ TIER_NAME[t] }}</td><td>{{ done[t].owned }}</td><td>{{ exp[t].toFixed(1) }}</td><td>{{ done[t].total }}</td></tr>
            <tr><td><b>All</b></td><td><b>{{ done.all.owned }} ({{ pct(done.all.owned, done.all.total) }}%)</b></td><td>{{ exp.all.toFixed(1) }} ({{ pct(exp.all, done.all.total) }}%)</td><td>{{ done.all.total }}</td></tr>
          </tbody>
        </table>
        <p class="al-note">{{ done.dupes }} duplicate{{ done.dupes === 1 ? "" : "s" }}.</p>
      </section>
      <section>
        <h3>Packs</h3>
        <div class="al-form">
          <label class="ctl">Stickers a pack <input v-model.number="form.cards" type="number" min="1" max="20"></label>
          <label v-for="t in TIERS" :key="t" class="ctl">{{ TIER_NAME[t] }} rate <input v-model.number="form.rates[t]" type="number" min="0" step="0.01"></label>
        </div>
        <div class="al-machine">
          <button type="button" class="strong" @click="apply">Apply</button>
          <button type="button" @click="resetSettings(); labNote = 'Season defaults restored.'">Season defaults</button>
        </div>
      </section>
      <section>
        <h3>Seed</h3>
        <div class="al-machine">
          <label class="ctl">Seed <input v-model="form.seed" type="text" size="12"></label>
          <button type="button" @click="startOver">Start over with this seed</button>
        </div>
        <p class="al-note">The same seed and settings give the same packs, in the same order.</p>
      </section>
      <p v-if="labNote" class="al-note" role="status">{{ labNote }}</p>
    </div>
  </dialog>
</template>
