<script setup>
// เฉลยผลการโจมตีพร้อมกันทุกคน หลังทุกคนเลือกครบแล้ว
// การ์ดของแต่ละคนโผล่ทีละใบ แล้วปิดเองเมื่อจบ — ทุกเครื่องคิดจากข้อมูลชุดเดียวกันจึงเห็นพร้อมกัน
import { computed, onMounted, onUnmounted, ref } from 'vue'

const props = defineProps({
  // [{ id, name, icon, choice, dmg, targeted }]
  rows: { type: Array, default: () => [] },
  // ชื่อการ์ดที่มอนเล่น — ไว้บอกว่าเฉลยของท่าไหน
  cardName: { type: String, default: '' },
  myId: { type: [String, Number], default: null },
})
const emit = defineEmits(['done'])

const STEP = 260      // ระยะห่างการโผล่ของแต่ละใบ
const HOLD = 1700     // ค้างให้อ่านหลังใบสุดท้ายโผล่

const shown = ref(0)
let timers = []

const total = computed(() => props.rows.reduce((s, r) => s + (r.choice === 'hit' ? r.dmg : 0), 0))
const label = (r) => (r.choice === 'hit' ? `−${r.dmg}` : r.choice === 'dodge' ? 'หลบได้' : 'นอกระยะ')
const img = (path) => `${import.meta.env.BASE_URL}${path}`

onMounted(() => {
  props.rows.forEach((_, i) => timers.push(setTimeout(() => { shown.value = i + 1 }, STEP * (i + 1))))
  timers.push(setTimeout(() => emit('done'), STEP * props.rows.length + HOLD))
})
onUnmounted(() => { for (const t of timers) clearTimeout(t); timers = [] })
</script>

<template>
  <div class="ar-overlay">
    <div class="ar-box">
      <p class="ar-title">ผลการโจมตี</p>
      <p v-if="cardName" class="ar-card-name">{{ cardName }}</p>

      <div class="ar-grid">
        <div
          v-for="(r, i) in rows"
          :key="r.id"
          class="ar-card"
          :class="[r.choice === 'hit' ? 'ar-hit' : 'ar-safe', { 'ar-in': i < shown, 'ar-me': String(r.id) === String(myId) }]"
        >
          <div class="ar-icon-wrap">
            <img v-if="r.icon" :src="img(r.icon)" class="ar-icon" alt="" />
            <img
              v-if="r.targeted"
              :src="img('assets/img/UI/symbol/target_furthest_symbol.webp')"
              class="ar-target"
              alt="เป้าหมาย"
            />
          </div>
          <span class="ar-name">{{ r.name }}</span>
          <span class="ar-badge">{{ label(r) }}</span>
        </div>
      </div>

      <p class="ar-total" :class="{ 'ar-in': shown >= rows.length }">
        <template v-if="total">ทีมรับไปรวม <strong>{{ total }}</strong> หน่วย</template>
        <template v-else>ทั้งตี้รอดหมด</template>
      </p>
    </div>
  </div>
</template>

<style scoped>
.ar-overlay {
  position: fixed;
  inset: 0;
  /* ต้องสูงกว่า .ma-overlay (950) เพราะเฉลยทับการ์ดโจมตี แต่ยังต่ำกว่าหน้าต่างอื่น (1200 ขึ้นไป) */
  z-index: 1100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.86);
  backdrop-filter: blur(3px);
}
.ar-box { width: 100%; max-width: 420px; text-align: center; }
.ar-title {
  margin: 0;
  font-size: 15px; font-weight: bold; letter-spacing: 3px; color: #c89b3c;
  text-shadow: 0 0 12px rgba(200, 155, 60, 0.5);
}
.ar-card-name { margin: 2px 0 14px; font-size: 12px; color: #8c7a5c; }

.ar-grid { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; }
.ar-card {
  flex: 0 0 auto;
  width: 92px;
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  padding: 10px 6px;
  border-radius: 11px;
  border: 1px solid #55452a;
  background: rgba(0, 0, 0, 0.45);
  opacity: 0;
  transform: scale(0.75) translateY(10px);
  transition: opacity 0.28s ease, transform 0.28s cubic-bezier(0.2, 1.5, 0.5, 1);
}
.ar-card.ar-in { opacity: 1; transform: scale(1) translateY(0); }
.ar-me { box-shadow: 0 0 0 2px rgba(200, 155, 60, 0.55); }

.ar-icon-wrap { position: relative; }
.ar-icon { width: 42px; height: 42px; object-fit: contain; }
.ar-target { position: absolute; right: -6px; top: -4px; width: 17px; height: 17px; object-fit: contain; }

.ar-name {
  max-width: 100%; font-size: 11px; color: #c8b998;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.ar-badge { font-size: 17px; font-weight: bold; line-height: 1.1; }

.ar-hit { border-color: #a6392b; background: rgba(110, 26, 18, 0.42); }
.ar-hit .ar-badge { color: #ff9c86; text-shadow: 0 0 10px rgba(220, 70, 45, 0.6); }
.ar-hit.ar-in .ar-icon { animation: ar-shake 0.42s ease 0.05s; }

.ar-safe { border-color: #3c7a4a; background: rgba(20, 70, 36, 0.38); }
.ar-safe .ar-badge { font-size: 13px; color: #8fe0a0; }

.ar-total {
  margin: 14px 0 0; font-size: 12px; color: #8c7a5c;
  opacity: 0; transition: opacity 0.3s ease 0.15s;
}
.ar-total.ar-in { opacity: 1; }
.ar-total strong { color: #ff9c86; font-size: 15px; }

@keyframes ar-shake {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-4px); }
  45% { transform: translateX(4px); }
  70% { transform: translateX(-2px); }
}

@media (prefers-reduced-motion: reduce) {
  .ar-card { transition: opacity 0.2s ease; transform: none; }
  .ar-card.ar-in { transform: none; }
  .ar-hit.ar-in .ar-icon { animation: none; }
}
</style>
