<script setup>
import { computed } from 'vue'

// ข้อความกฎใน monster_info.json ฝัง {token} ไว้ตรงจุดที่ควรมีสัญลักษณ์กำกับ
// เติมด้วย scripts/annotate-rule-symbols.mjs — แก้ที่นั่นถ้าจะเพิ่ม/ย้าย token
const props = defineProps({
  text: { type: String, default: '' },
})

const SYMBOL = {
  atk: 'UI/symbol/monster_attack_symbol',
  agility: 'UI/symbol/agility_symbol',
  range: 'UI/symbol/range_symbol',
  move: 'UI/symbol/monster_movement_symbol',
  break: 'UI/symbol/break_symbol',
  armor: 'bonus_armor',
  track: 'UI/symbol/track_token_symbol',
  hturn: 'UI/symbol/hunter_turn_symbol',
  hcard: 'UI/symbol/hunter_attack_card_symbol',
  closest: 'UI/symbol/target_closest_symbol',
  furthest: 'UI/symbol/target_furthest_symbol',
  fire: 'elemental/fire',
  water: 'elemental/water',
  thunder: 'elemental/thunder',
  ice: 'elemental/ice',
  dragon: 'elemental/dragon',
  head: 'monster_breakable_parts/head',
  body: 'monster_breakable_parts/body',
  tail: 'monster_breakable_parts/tail',
  wing: 'monster_breakable_parts/wing',
  claw: 'monster_breakable_parts/claw',
  leg: 'monster_breakable_parts/leg',
  poison: 'status_effect/poison',
  paralysis: 'status_effect/paralysis',
  sleep: 'status_effect/sleep',
  stun: 'status_effect/stun',
  blastblight: 'status_effect/blastblight',
}

const LABEL = {
  atk: 'ความเสียหาย', agility: 'ระยะโจมตี/หลบหลีก', range: 'ระยะโจมตี',
  move: 'การเคลื่อนที่', break: 'Break Token', track: 'Track Token', armor: 'เกราะ',
  hturn: 'เทิร์น Hunter', hcard: 'Attack Card',
  closest: 'เป้าหมายใกล้สุด', furthest: 'เป้าหมายไกลสุด',
}

const parts = computed(() =>
  props.text
    .split(/(\{[a-z_]+\})/)
    .filter(Boolean)
    .map((chunk) => {
      const key = chunk.startsWith('{') && chunk.slice(1, -1)
      // token ที่ยังไม่มีรูป ปล่อยเป็นข้อความไว้ให้เห็นว่าตกหล่น ดีกว่าหายเงียบ
      if (!key || !SYMBOL[key]) return { text: chunk }
      return { key, src: `${import.meta.env.BASE_URL}assets/img/${SYMBOL[key]}.webp`, label: LABEL[key] ?? key }
    }),
)
</script>

<template><span class="rt"><template v-for="(p, i) in parts" :key="i"><img
        v-if="p.src"
        class="rt-sym"
        :src="p.src"
        :alt="p.label"
        :title="p.label"
      /><template v-else>{{ p.text }}</template></template></span></template>

<style scoped>
.rt {
  /* ตัวสัญลักษณ์สูงกว่าบรรทัดปกติ — ต้องคุม line-height เองไม่งั้นบรรทัดกระโดดไม่เท่ากัน */
  line-height: inherit;
}

.rt-sym {
  height: 1.5em;
  width: auto;
  vertical-align: -0.4em;
  margin: 0 2px;
  border-radius: 3px;
  border: 1px solid rgba(90, 61, 31, 0.45);
  background: rgba(255, 245, 220, 0.5);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
}
</style>
