<script setup>
// ผลที่ "ระบบของแอป" ทำกับ Hunter — เสีย HP หรือติดสถานะ
// ขึ้นทีละรายการ ทั้งตี้เห็นพร้อมกัน (โดนพร้อมกันหลายคนก็ต่อคิวให้ ไม่ทับกัน)
// ใช้เวลาสั้น ๆ แล้วปิดเอง แตะเพื่อข้ามได้
import { computed } from 'vue'
import statusEffectData from '@/assets/files/status_effect.json'

const props = defineProps({
  // { kind: 'damage'|'status', hunterName, classId, amount, statusId, source, hpBefore, hpAfter }
  effect: { type: Object, default: null },
  classThumb: { type: String, default: null },
  // เหลือรออีกกี่รายการในคิว — บอกให้รู้ว่ายังมีต่อ
  queued: { type: Number, default: 0 },
})
const emit = defineEmits(['skip'])

const img = (path) => `${import.meta.env.BASE_URL}${path}`
const status = computed(() =>
  props.effect?.statusId ? statusEffectData.find((s) => s.effect_id === props.effect.statusId) ?? null : null,
)
const isDamage = computed(() => props.effect?.kind === 'damage')
</script>

<template>
  <div v-if="effect" class="he-overlay" @click="emit('skip')">
    <div class="he-card" :class="isDamage ? 'he-dmg' : 'he-status'">
      <div class="he-who">
        <img v-if="classThumb" :src="img(classThumb)" class="he-class" alt="" />
        <span class="he-name">{{ effect.hunterName }}</span>
      </div>

      <template v-if="isDamage">
        <div class="he-icon-wrap">
          <img :src="img('assets/img/take_damage.webp')" class="he-icon" alt="" />
          <span class="he-amount">−{{ effect.amount }}</span>
        </div>
        <p class="he-title">เสีย HP</p>
      </template>
      <template v-else>
        <div class="he-icon-wrap">
          <img v-if="status?.thumbnail" :src="img(status.thumbnail)" class="he-icon he-icon-status" alt="" />
          <span v-for="n in 3" :key="n" class="he-ring" :style="{ '--i': n }"></span>
        </div>
        <p class="he-title">ติด {{ status?.effect_name ?? 'สถานะผิดปกติ' }}</p>
      </template>

      <p v-if="effect.source" class="he-source">จาก {{ effect.source }}</p>
      <p v-if="isDamage && effect.hpAfter != null" class="he-hp">
        HP {{ effect.hpBefore }} → <strong :class="{ 'he-hp-out': effect.hpAfter === 0 }">{{ effect.hpAfter }}</strong>
        <template v-if="effect.hpAfter === 0"> · ล้ม</template>
      </p>
      <p v-if="queued > 0" class="he-queued">ยังมีอีก {{ queued }} รายการ</p>
    </div>
  </div>
</template>

<style scoped>
.he-overlay {
  position: fixed;
  inset: 0;
  z-index: 9955;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.78);
  backdrop-filter: blur(3px);
}
.he-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  min-width: 240px;
  padding: 20px 26px 16px;
  border: 1.5px solid #8a3a2a;
  border-radius: 16px;
  background: linear-gradient(180deg, #2a120c 0%, #150a06 100%);
  color: #e8dcc0;
  text-align: center;
  animation: he-pop 0.4s cubic-bezier(0.2, 1.4, 0.4, 1) both;
}
.he-status { border-color: #7a58b0; background: linear-gradient(180deg, #1e1330 0%, #120a1c 100%); }
@keyframes he-pop { from { transform: scale(0.7); opacity: 0; } to { transform: none; opacity: 1; } }

.he-who { display: flex; align-items: center; gap: 7px; margin-bottom: 6px; }
.he-class { width: 26px; height: 26px; object-fit: contain; }
.he-name { font-size: 0.95rem; font-weight: 700; color: #f0d9a0; }

.he-icon-wrap { position: relative; display: flex; align-items: center; justify-content: center; width: 96px; height: 96px; }
.he-icon { width: 78px; height: 78px; opacity: 0.92; object-fit: contain; animation: he-hit 0.5s ease-out both; }
.he-icon-status { width: 62px; height: 62px; animation: he-float 1.6s ease-in-out infinite; }
@keyframes he-hit { 0% { transform: scale(1.8) rotate(-10deg); opacity: 0; } 60% { transform: scale(0.92); opacity: 1; } 100% { transform: none; } }
@keyframes he-float { 0%, 100% { transform: translateY(-3px); } 50% { transform: translateY(3px); } }
.he-amount {
  position: absolute;
  font-size: 2.6rem;
  font-weight: 900;
  color: #fff;
  /* ตัวเลขทับดาวสีส้ม — ขอบเข้มหนาให้อ่านออกทุกพื้นหลัง */
  text-shadow: 0 0 6px rgba(0,0,0,0.95), 0 0 3px rgba(0,0,0,1), 0 3px 10px rgba(0,0,0,0.9);
  -webkit-text-stroke: 2px rgba(60, 10, 0, 0.85);
  paint-order: stroke fill;
  animation: he-pop 0.45s 0.12s cubic-bezier(0.2, 1.4, 0.4, 1) both;
}
.he-ring {
  position: absolute;
  inset: 0;
  border: 2px solid rgba(160, 110, 220, 0.55);
  border-radius: 50%;
  animation: he-ring 1.8s ease-out infinite;
  animation-delay: calc(var(--i) * -0.6s);
}
@keyframes he-ring { from { transform: scale(0.45); opacity: 0.9; } to { transform: scale(1.1); opacity: 0; } }

.he-title { margin: 6px 0 0; font-size: 1.15rem; font-weight: 800; color: #ff9a80; }
.he-status .he-title { color: #c9a6ff; }
.he-source { margin: 2px 0 0; font-size: 0.82rem; color: #a8946c; }
.he-hp { margin: 6px 0 0; font-size: 0.9rem; color: #e8dcc0; }
.he-hp-out { color: #ff6a4a; }
.he-queued { margin: 8px 0 0; font-size: 0.72rem; color: #8a7050; }
</style>
