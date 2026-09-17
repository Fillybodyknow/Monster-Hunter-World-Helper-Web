<script setup>
import hunterClassData from '@/assets/files/class_hunter.json'

// แถวไอคอนคลาสของทุกคนในตี้ บอกว่าใครกดแล้ว ใครยังรออยู่
// ใช้กับทุกการโหวตที่ต้องรอครบทั้งตี้ — เดิมหลายจุดโชว์แค่ "2/4" ไม่รู้ว่ารอใคร
// ต้นแบบคือแถว "พร้อมปิดเควส" ในหน้า Trade Post หน้าตาเหมือนกันทุกจุด แก้ที่นี่ที่เดียว
//
// status(hunter): true = ✓ กดแล้ว · false = ✕ ปฏิเสธ (เช่นไม่อนุมัติ Reroll) · อย่างอื่น = … ยังไม่กด
const props = defineProps({
  hunters: { type: Array, required: true },
  status: { type: Function, required: true },
  label: { type: String, default: '' },
})

const getImg = (path) => `${import.meta.env.BASE_URL}${path}`
const classOf = (id) => hunterClassData.find((c) => c.hunter_class_id === id)
const stateOf = (h) => {
  const s = props.status(h)
  return s === true ? 'yes' : s === false ? 'no' : 'wait'
}
const TICK = { yes: '✓', no: '✕', wait: '…' }
</script>

<template>
  <div class="party-ready-row">
    <span v-if="label" class="party-ready-label">{{ label }}</span>
    <span
      v-for="h in hunters"
      :key="h.hunter_id"
      class="party-ready-chip"
      :class="'is-' + stateOf(h)"
      :title="h.hunter_name"
    >
      <img
        v-if="classOf(h.hunter_class_id)?.thumbnail"
        :src="getImg(classOf(h.hunter_class_id).thumbnail)"
        class="party-ready-icon"
      />
      <span v-else class="party-ready-fallback">{{ (h.hunter_name || '?').slice(0, 1) }}</span>
      <span class="party-ready-tick">{{ TICK[stateOf(h)] }}</span>
    </span>
  </div>
</template>

<style scoped>
.party-ready-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 8px 12px;
  border-radius: 3px;
  border: 1px solid rgba(124, 90, 43, 0.4);
  background: rgba(0, 0, 0, 0.28);
  box-shadow: inset 0 2px 6px rgba(0, 0, 0, 0.45);
}
.party-ready-label {
  font-size: 9px;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: #a88040;
}
.party-ready-chip {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 2px;
  border: 1px solid rgba(124, 90, 43, 0.45);
  background: rgba(0, 0, 0, 0.35);
  opacity: 0.45;
  transition: 0.2s;
}
.party-ready-chip.is-yes {
  opacity: 1;
  border-color: rgba(90, 210, 130, 0.6);
  background: linear-gradient(170deg, #1e3324, #131f16);
  box-shadow: 0 0 8px rgba(60, 170, 110, 0.3);
}
.party-ready-chip.is-no {
  opacity: 1;
  border-color: rgba(220, 90, 80, 0.6);
  background: linear-gradient(170deg, #3a1d1a, #1f1110);
  box-shadow: 0 0 8px rgba(190, 70, 60, 0.3);
}
.party-ready-icon {
  width: 22px;
  height: 22px;
  object-fit: contain;
}
.party-ready-fallback {
  font-size: 12px;
  font-weight: bold;
  color: #ffd27a;
  line-height: 1;
}
/* สถานะมุมล่างขวา */
.party-ready-tick {
  position: absolute;
  right: -4px;
  bottom: -4px;
  padding: 0 3px;
  border-radius: 999px;
  border: 1px solid rgba(40, 30, 12, 0.6);
  background: radial-gradient(circle at 35% 30%, #6a5636, #3a2e1a);
  color: #c0985a;
  font-size: 10px;
  font-weight: bold;
  line-height: 1.3;
}
.party-ready-chip.is-yes .party-ready-tick {
  border-color: rgba(20, 50, 32, 0.6);
  background: radial-gradient(circle at 35% 30%, #8fd9a8, #3f8f5f 60%, #24603c);
  color: #0d2417;
}
.party-ready-chip.is-no .party-ready-tick {
  border-color: rgba(60, 20, 16, 0.6);
  background: radial-gradient(circle at 35% 30%, #f0a098, #b04a40 60%, #7a2a22);
  color: #2a0b08;
}
</style>
