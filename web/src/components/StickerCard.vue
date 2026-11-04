<script setup lang="ts">
// StickerCard.vue: one sticker of the album: its pixel portrait, number, name,
// position and stat line, and the bonus of rares and legendaries. Missing
// stickers show as an empty slot with the number, the name and a silhouette.
import { computed } from "vue";
import { BUILDS, POSITION_NAMES } from "../../../src/engine/index.ts";
import { STAT_LABEL } from "../lib/game.ts";
import { portraitSvg, type Sticker } from "../lib/album.ts";

const props = defineProps<{ sticker: Sticker; team: "K" | "S"; count?: number; badge?: "new" | "dupe" | null; empty?: boolean }>();
const s = computed(() => props.sticker);
const svg = computed(() => portraitSvg(s.value.id, { team: props.team, gk: s.value.pos === "GK", silhouette: props.empty, label: props.empty ? undefined : s.value.name }));
const stats = computed(() => {
  const b = s.value.pos ? BUILDS[s.value.pos] : undefined;
  return b ? STAT_LABEL.filter(([k]) => k !== "kee" || s.value.pos === "GK").map(([k, l]) => ({ l, v: b[k] })) : [];
});
</script>

<template>
  <figure class="sticker" :class="[sticker.tier, { empty }]">
    <div class="st-top"><span class="st-no">{{ sticker.no }}</span><span class="st-pos" :title="POSITION_NAMES[sticker.pos ?? ''] ?? ''">{{ sticker.pos }}</span></div>
    <div class="st-portrait" v-html="svg"></div>
    <figcaption>
      <span class="st-name">{{ sticker.name }}</span>
      <span v-if="!empty" class="st-stats"><span v-for="x in stats" :key="x.l">{{ x.l }} <b>{{ x.v }}</b></span></span>
      <span v-if="!empty && sticker.bonus?.type === 'slot'" class="st-bonus">{{ sticker.bonus.text }}</span>
      <span v-else-if="!empty && sticker.bonus?.type === 'perk'" class="st-bonus"><b>{{ sticker.bonus.name }}</b>: {{ sticker.bonus.text }}
        <i>Cost {{ sticker.bonus.cost ?? "to be set" }}</i></span>
    </figcaption>
    <span v-if="badge" class="st-badge" :class="badge">{{ badge === "new" ? "NEW" : "DUPE" }}</span>
    <span v-else-if="(count ?? 0) > 1" class="st-count" :aria-label="`${count} copies`">×{{ count }}</span>
  </figure>
</template>
