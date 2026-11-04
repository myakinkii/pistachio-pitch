<script setup lang="ts">
// StickerCard.vue: one sticker of the album: its pixel portrait, number, name,
// position, archetype and its stat line (marked where it differs from the
// position's template), and the bonus of rares and legendaries. Missing
// stickers show as an empty slot with the number, the name and a silhouette.
import { computed } from "vue";
import { BUILDS, BUDGET, POSITION_NAMES } from "../../../src/engine/index.ts";
import { STAT_LABEL } from "../lib/game.ts";
import { portraitSvg, type Sticker } from "../lib/album.ts";

const props = defineProps<{ sticker: Sticker; team: "K" | "S"; count?: number; badge?: "new" | "dupe" | null; empty?: boolean }>();
const s = computed(() => props.sticker);
const svg = computed(() => portraitSvg(s.value.id, { team: props.team, gk: s.value.pos === "GK", silhouette: props.empty, label: props.empty ? undefined : s.value.name }));
const stats = computed(() => {
  const t = s.value.pos ? BUILDS[s.value.pos] : undefined, b = s.value.build ?? t;
  return b && t ? STAT_LABEL.filter(([k]) => k !== "kee" || s.value.pos === "GK")
    .map(([k, l]) => ({ l, v: b[k], cls: b[k] > 5 ? "top" : b[k] > t[k] ? "up" : b[k] < t[k] ? "down" : "" })) : [];
});
const total = computed(() => (s.value.build ? Object.values(s.value.build).reduce((a, x) => a + x, 0) : BUDGET));
</script>

<template>
  <figure class="sticker" :class="[sticker.tier, { empty }]">
    <div class="st-top"><span class="st-no">{{ sticker.no }}</span><span class="st-pos" :title="POSITION_NAMES[sticker.pos ?? ''] ?? ''">{{ sticker.pos }}</span></div>
    <div class="st-portrait" v-html="svg"></div>
    <figcaption>
      <span class="st-name">{{ sticker.name }}</span>
      <span v-if="!empty && sticker.style" class="st-style">{{ sticker.style }}<template v-if="total !== BUDGET"> · {{ total }} pts</template></span>
      <span v-if="!empty" class="st-stats" title="▲ ▼ against the position's template"><span v-for="x in stats" :key="x.l" :class="x.cls">{{ x.l }} <b>{{ x.v }}</b></span></span>
      <span v-if="!empty && sticker.bonus?.type === 'unlock'" class="st-bonus">{{ sticker.bonus.text }}</span>
      <span v-else-if="!empty && sticker.bonus?.type === 'perk'" class="st-bonus"><b>{{ sticker.bonus.name }}</b>: {{ sticker.bonus.text }}
        <i>Perk costs {{ sticker.bonus.cost ?? "to be set" }} pts</i></span>
    </figcaption>
    <span v-if="badge" class="st-badge" :class="badge">{{ badge === "new" ? "NEW" : "DUPE" }}</span>
    <span v-else-if="(count ?? 0) > 1" class="st-count" :aria-label="`${count} copies`">×{{ count }}</span>
  </figure>
</template>
