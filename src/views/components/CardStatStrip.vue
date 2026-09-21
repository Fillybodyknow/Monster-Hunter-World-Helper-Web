<script setup>
// แถบค่าของการ์ดพฤติกรรม — โชว์ตัวเลขที่ใช้จริงหลังกฎบวกลบแล้ว
// ค่าไหนไม่ตรงกับที่พิมพ์บนการ์ดจะขึ้นเป็น 9 → 10 แล้วกดดูได้ว่ามาจากกฎข้อไหน
// ค่าที่คำนวณมาจาก src/services/cardStats.js
import { ref, computed } from 'vue'
import RuleText from './RuleText.vue'
import elementalData from '@/assets/files/elemental.json'
import statusEffectData from '@/assets/files/status_effect.json'
import monsterPartsData from '@/assets/files/monster_parts.json'

const props = defineProps({
  // ผลลัพธ์จาก resolveCardStats — { base, value, applied, notes }
  stats: { type: Object, default: null },
  // การ์ดต้นทาง ใช้เฉพาะไอคอนธาตุ/สถานะที่ติดมากับการโจมตี
  card: { type: Object, default: null },
  // monster_parts ของระดับความยากนั้น — ใช้เรียกชื่อชิ้นส่วนที่เป็นต้นเหตุ
  parts: { type: Object, default: null },
})

const img = (path) => `${import.meta.env.BASE_URL}${path}`
const sym = (name) => img(`assets/img/UI/symbol/${name}.webp`)

const ROWS = [
  { key: 'damage', icon: sym('monster_attack_symbol'), label: 'ความเสียหาย' },
  { key: 'range', icon: sym('range_symbol'), label: 'ระยะโจมตี' },
  { key: 'agility', icon: sym('agility_symbol'), label: 'หลบหลีก' },
  { key: 'move', icon: sym('monster_movement_symbol'), label: 'การเคลื่อนที่' },
  { key: 'activations', icon: sym('hunter_turn_symbol'), label: 'เทิร์น Hunter' },
  { key: 'attack_cards', icon: sym('hunter_attack_card_symbol'), label: 'Attack Card' },
]

// เปิดไว้ตั้งแต่แรก — ตัวเลขที่เปลี่ยนต้องเห็นที่มาทันที ไม่ต้องกดหา (ยังพับเก็บได้)
const open = ref(true)

// โชว์เฉพาะค่าที่กฎแก้จริง — ค่าที่ไม่เปลี่ยนอ่านจากการ์ดได้อยู่แล้ว ไม่ต้องซ้ำ
const chips = computed(() => {
  const s = props.stats
  if (!s) return []
  return ROWS.filter((r) => s.base[r.key] !== s.value[r.key]).map((r) => ({
    ...r,
    base: s.base[r.key],
    value: s.value[r.key],
    changed: true,
    up: s.value[r.key] > s.base[r.key],
  }))
})

const element = computed(() => elementalData.find((e) => e.elemental_id === props.card?.attack?.element_id) ?? null)
const status = computed(() => statusEffectData.find((s) => s.effect_id === props.card?.attack?.status_id) ?? null)
const POSITION_LABEL = { front: 'ด้านหน้า', back: 'ด้านหลัง', left: 'ด้านซ้าย', right: 'ด้านขวา' }
const partName = (position) => {
  const id = props.parts?.[position]?.part_id
  return monsterPartsData.find((p) => p.part_id === id)?.part ?? POSITION_LABEL[position] ?? position
}

const anyChanged = computed(() => chips.value.some((c) => c.changed))
const hasWhy = computed(() => (props.stats?.applied?.length ?? 0) + (props.stats?.notes?.length ?? 0) > 0)
const sourceLabel = (rule) => (rule.kind === 'special' ? rule.title || 'กฎพิเศษ' : `${partName(rule.position)} แตก`)
const changeText = (change) =>
  ROWS.filter((r) => change?.[r.key]).map((r) => `${r.label} ${change[r.key] > 0 ? '+' : ''}${change[r.key]}`).join(' · ')
</script>

<template>
  <!-- root ต้องมีเสมอ ไม่งั้น class/listener ที่ส่งมาจากข้างนอกจะตกหล่น -->
  <div class="cs-strip">
    <div v-if="chips.length" class="cs-chips">
      <span
        v-for="c in chips"
        :key="c.key"
        class="cs-chip"
        :class="{ 'cs-chip-up': c.changed && c.up, 'cs-chip-down': c.changed && !c.up }"
        :title="c.label"
      >
        <img :src="c.icon" class="cs-chip-icon" :alt="c.label" />
        <span v-if="c.changed" class="cs-was">{{ c.base }}</span>
        <span v-if="c.changed" class="cs-arrow">→</span>
        <span class="cs-num">{{ c.value }}</span>
        <img v-if="c.key === 'damage' && element" :src="img(element.thumbnail)" class="cs-chip-tag" :alt="element.elemental" />
        <img v-if="c.key === 'damage' && status" :src="img(status.thumbnail)" class="cs-chip-tag" :alt="status.effect_name" />
      </span>
    </div>

    <button v-if="hasWhy" class="cs-why-btn" @click.stop="open = !open">
      {{ open ? '▲ ซ่อนที่มา' : anyChanged ? '▼ ตัวเลขนี้มาจากไหน' : '▼ มีกฎที่ต้องดูเอง' }}
    </button>

    <div v-if="open && hasWhy" class="cs-why">
      <div v-for="(rule, i) in stats.applied" :key="'a' + i" class="cs-rule">
        <p class="cs-rule-head">
          <span class="cs-rule-src">{{ sourceLabel(rule) }}</span>
          <span class="cs-rule-change">{{ changeText(rule.change) }}</span>
        </p>
        <p class="cs-rule-text"><RuleText :text="rule.text" /></p>
      </div>
      <div v-for="(rule, i) in stats.notes" :key="'n' + i" class="cs-rule cs-rule-note">
        <p class="cs-rule-head">
          <span class="cs-rule-src">{{ sourceLabel(rule) }}</span>
          <span class="cs-rule-change">ถ้า {{ rule.condition }} → {{ changeText(rule.change) }}</span>
        </p>
        <p class="cs-note-warn">ยังไม่ได้บวกให้ — ต้องดูบนโต๊ะเองว่าเข้าเงื่อนไขไหม</p>
        <p class="cs-rule-text"><RuleText :text="rule.text" /></p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cs-strip { width: 100%; }
.cs-chips { display: flex; flex-wrap: wrap; justify-content: center; gap: 4px 6px; }
.cs-chip {
  display: inline-flex; align-items: center; gap: 3px;
  padding: 2px 7px; border-radius: 11px;
  background: rgba(0, 0, 0, 0.32); border: 1px solid #55452a;
  font-size: 12px; line-height: 1.5; color: #e8dcc0; white-space: nowrap;
}
.cs-chip-icon { width: 13px; height: 13px; object-fit: contain; }
.cs-chip-tag { width: 12px; height: 12px; object-fit: contain; margin-left: 1px; }
.cs-num { font-weight: bold; }
.cs-was { color: #8c7a5c; text-decoration: line-through; }
.cs-arrow { color: #8c7a5c; font-size: 10px; }
.cs-chip-up { border-color: #c0392b; background: rgba(120, 30, 20, 0.36); }
.cs-chip-up .cs-num { color: #ff9c86; }
.cs-chip-down { border-color: #3c7a4a; background: rgba(24, 80, 40, 0.34); }
.cs-chip-down .cs-num { color: #8fe0a0; }

.cs-why-btn {
  display: block; margin: 6px auto 0; padding: 2px 10px;
  background: none; border: none; color: #c89b3c;
  font-size: 11px; cursor: pointer;
}
.cs-why-btn:hover { color: #e8c46a; }

.cs-why { margin-top: 5px; display: flex; flex-direction: column; gap: 6px; }
.cs-rule {
  padding: 6px 8px; border-radius: 6px;
  background: rgba(0, 0, 0, 0.3); border-left: 2px solid #c89b3c;
  text-align: left;
}
.cs-rule-note { border-left-color: #7a6ab0; }
.cs-rule-head { display: flex; flex-wrap: wrap; gap: 4px 8px; align-items: baseline; margin: 0 0 3px; }
.cs-rule-src { font-size: 11px; font-weight: bold; color: #c89b3c; }
.cs-rule-change { font-size: 11px; color: #e8dcc0; }
.cs-note-warn { margin: 0 0 3px; font-size: 10px; color: #b3a6e0; }
.cs-rule-text { margin: 0; font-size: 11px; line-height: 1.6; color: #a89878; }
</style>
