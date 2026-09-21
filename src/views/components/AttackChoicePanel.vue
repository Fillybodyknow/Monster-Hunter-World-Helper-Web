<script setup>
// ขั้นตอนของ "ตัวเอง" ตอนมอนโจมตี — สามจังหวะ ไม่เห็นของคนอื่นเลย
//   choice : เลือก รับ / หลบ / นอกระยะ — ไม่มีตัวเลขให้คิด ตัดสินจากหน้าโต๊ะอย่างเดียว
//   calc   : เฉพาะคนที่เลือกรับ — คิดความเสียหาย เกราะจาก Attack Card กดเพิ่มเอง
//   wait   : รอคนอื่นให้ครบ
// เลือกของใครของมัน Host กดแทนไม่ได้
import { computed } from 'vue'
import elementalData from '@/assets/files/elemental.json'

const props = defineProps({
  // 'choice' | 'calc' | 'wait'
  stage: { type: String, default: 'choice' },
  // แถวของตัวเอง — { name, icon, targeted, choice }
  me: { type: Object, default: null },
  // คนอื่น: บอกแค่ว่าจบขั้นตอนของตัวเองหรือยัง ไม่บอกว่าเลือกอะไร
  others: { type: Array, default: () => [] },
  elementId: { type: Number, default: 0 },
  agility: { type: Number, default: 0 },
  // ผลคำนวณของตัวเอง — { base, worn, chefBonus, shield, guardBonus, guard, dmg }
  preview: { type: Object, default: null },
  shield: { type: Number, default: 0 },
})
const emit = defineEmits(['choose', 'reset', 'confirm', 'update:shield'])

const img = (path) => `${import.meta.env.BASE_URL}${path}`
const element = computed(() => elementalData.find((e) => e.elemental_id === props.elementId) ?? null)
const pending = computed(() => props.others.filter((o) => !o.done))
const guardLabel = computed(() => (element.value ? `เกราะ ${element.value.elemental}` : 'เกราะกายภาพ'))
const CHOSEN_LABEL = { hit: 'รับความเสียหาย', dodge: 'หลบหลีก', outrange: 'อยู่นอกระยะ' }
</script>

<template>
  <div v-if="me" class="ac-panel">
    <p class="ac-head">
      <img v-if="me.icon" :src="img(me.icon)" class="ac-head-icon" alt="" />
      <span class="ac-head-name">{{ me.name }}</span>
      <span v-if="me.targeted" class="ac-head-target">
        <img :src="img('assets/img/UI/symbol/target_furthest_symbol.webp')" class="ac-head-target-icon" alt="" />
        โดนเล็ง
      </span>
    </p>

    <!-- ── เลือก ─────────────────────────────────────────── -->
    <template v-if="stage === 'choice'">
      <p class="ac-ask">จะเอายังไงกับการโจมตีนี้?</p>
      <div class="ac-actions">
        <button class="ac-act ac-act-hit" @click="emit('choose', 'hit')">
          <span class="ac-act-icon">🛡</span>
          <span class="ac-act-text">รับความเสียหาย</span>
        </button>
        <div class="ac-act-row">
          <button class="ac-act ac-act-safe" @click="emit('choose', 'dodge')">
            <span class="ac-act-icon">💨</span>
            <span class="ac-act-text">หลบหลีก</span>
            <span v-if="agility" class="ac-act-sub">ทิ้งการ์ดรวม ◇ {{ agility }}</span>
          </button>
          <button class="ac-act ac-act-safe" @click="emit('choose', 'outrange')">
            <span class="ac-act-icon">📏</span>
            <span class="ac-act-text">นอกระยะ</span>
          </button>
        </div>
      </div>
    </template>

    <!-- ── คำนวณความเสียหาย ──────────────────────────────── -->
    <template v-else-if="stage === 'calc'">
      <div class="ac-math">
        <div class="ac-math-cell">
          <div class="ac-badge">
            <img :src="img('assets/img/UI/symbol/monster_attack_symbol.webp')" class="ac-badge-bg" alt="" />
            <span class="ac-badge-num">{{ preview?.base ?? 0 }}</span>
          </div>
          <span class="ac-math-label">ดาเมจ</span>
        </div>

        <span class="ac-math-op">−</span>

        <div class="ac-math-cell">
          <div class="ac-badge">
            <img :src="img('assets/img/bonus_armor.webp')" class="ac-badge-bg" alt="" />
            <!-- ยังไม่มีรูปเกราะแยกตามธาตุ — เอาไอคอนธาตุทับไปก่อน -->
            <img v-if="element" :src="img(element.thumbnail)" class="ac-badge-el" alt="" />
            <span class="ac-badge-num">{{ preview?.guard ?? 0 }}</span>
          </div>
          <span class="ac-math-label">{{ guardLabel }}</span>
        </div>

        <span class="ac-math-op">=</span>

        <div class="ac-math-cell">
          <span class="ac-math-result">{{ preview?.dmg ?? 0 }}</span>
          <span class="ac-math-label">รับจริง</span>
        </div>
      </div>

      <p class="ac-math-detail">
        เกราะที่ใส่อยู่ {{ preview?.worn ?? 0 }}<template v-if="preview?.chefBonus"> (รวมข้าวเชฟ +{{ preview.chefBonus }})</template>
        <template v-if="preview?.shield"> · จากการ์ด {{ preview.shield }}</template>
        <template v-if="preview?.guardBonus"> · Guard +{{ preview.guardBonus }}</template>
      </p>

      <!-- การ์ดอยู่บนมือบนโต๊ะ แอปไม่เห็น ต้องกดเพิ่มเอง -->
      <div class="ac-tune">
        <span class="ac-tune-label">+ {{ guardLabel }}จากการ์ด</span>
        <button class="ac-step" :disabled="shield <= 0" @click="emit('update:shield', shield - 1)">−</button>
        <span class="ac-tune-num">{{ shield }}</span>
        <button class="ac-step" @click="emit('update:shield', shield + 1)">+</button>
      </div>

      <div class="ac-act-row">
        <button class="ac-act ac-act-back" @click="emit('reset')">ย้อนกลับ</button>
        <button class="ac-act ac-act-confirm" @click="emit('confirm')">
          <span class="ac-act-text">ยืนยัน รับ {{ preview?.dmg ?? 0 }}</span>
        </button>
      </div>
    </template>

    <!-- ── รอคนอื่น ───────────────────────────────────────── -->
    <template v-else>
      <p class="ac-locked">
        <span class="ac-locked-check">✓</span>
        <span class="ac-locked-text">{{ CHOSEN_LABEL[me.choice?.choice] }}</span>
        <span v-if="me.choice?.choice === 'hit'" class="ac-locked-dmg">{{ me.choice.dmg }}</span>
      </p>
      <div v-if="pending.length" class="ac-wait">
        <p class="ac-wait-text">รออีก {{ pending.length }} คน</p>
        <div class="ac-wait-dots">
          <img v-for="o in pending" :key="o.id" :src="img(o.icon)" class="ac-wait-icon" :title="o.name" alt="" />
        </div>
      </div>
      <p v-else class="ac-wait-text ac-wait-done">ครบทุกคนแล้ว — กำลังเฉลย…</p>
    </template>
  </div>
</template>

<style scoped>
.ac-panel {
  width: 100%;
  padding: 12px 14px;
  border: 1px solid #6b552f;
  border-radius: 12px;
  background: linear-gradient(180deg, rgba(28, 22, 12, 0.94), rgba(14, 11, 6, 0.94));
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.5);
}

.ac-head { display: flex; align-items: center; justify-content: center; gap: 6px; margin: 0 0 10px; }
.ac-head-icon { width: 24px; height: 24px; object-fit: contain; }
.ac-head-name { font-size: 15px; font-weight: bold; color: #e8dcc0; letter-spacing: 0.5px; }
.ac-head-target {
  display: inline-flex; align-items: center; gap: 3px;
  padding: 1px 8px; border-radius: 10px;
  background: rgba(150, 35, 25, 0.5); border: 1px solid #c0392b;
  font-size: 10px; color: #ffb0a0;
}
.ac-head-target-icon { width: 12px; height: 12px; object-fit: contain; }

.ac-ask { margin: 0 0 9px; text-align: center; font-size: 12px; color: #a89878; }

.ac-actions { display: flex; flex-direction: column; gap: 7px; }
.ac-act-row { display: flex; gap: 7px; }
.ac-act {
  flex: 1; display: flex; flex-direction: column; align-items: center; gap: 1px;
  padding: 10px 8px; cursor: pointer;
  border: 1px solid #6b552f; border-radius: 10px;
  background: rgba(0, 0, 0, 0.35); color: #e8dcc0;
}
.ac-act:disabled { opacity: 0.4; cursor: not-allowed; }
.ac-act-icon { font-size: 18px; line-height: 1; }
.ac-act-text { font-size: 13px; font-weight: bold; }
.ac-act-sub { font-size: 10px; color: #8c7a5c; }
.ac-act-hit { border-color: #a6392b; background: rgba(120, 30, 20, 0.35); }
.ac-act-hit:active { background: rgba(160, 45, 30, 0.5); }
.ac-act-safe:active { background: rgba(24, 80, 40, 0.4); border-color: #3c7a4a; }
.ac-act-back { flex: 0 0 34%; color: #8c7a5c; font-size: 12px; }
.ac-act-confirm { border-color: #c89b3c; background: rgba(120, 90, 30, 0.4); }
.ac-act-confirm:active { background: rgba(170, 130, 45, 0.55); }

/* ── หน้าคำนวณ ── */
.ac-math { display: flex; align-items: flex-start; justify-content: center; gap: 8px; margin-bottom: 6px; }
.ac-math-cell { display: flex; flex-direction: column; align-items: center; gap: 3px; min-width: 56px; }
.ac-math-op { font-size: 19px; color: #8c7a5c; line-height: 56px; }
.ac-math-label { font-size: 10px; color: #8c7a5c; text-align: center; }
.ac-math-result {
  display: flex; align-items: center; justify-content: center;
  width: 56px; height: 56px;
  font-size: 30px; font-weight: bold; color: #ff9c86;
  text-shadow: 0 0 14px rgba(200, 60, 40, 0.5);
}

/* เลขทับไอคอน — จัดกลางทั้งแนวตั้งแนวนอน */
.ac-badge { position: relative; width: 56px; height: 56px; }
.ac-badge-bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }
.ac-badge-el { position: absolute; left: 50%; top: 50%; width: 46%; height: 46%; object-fit: contain; transform: translate(-50%, -50%); opacity: 0.75; }
.ac-badge-num {
  position: absolute; left: 0; top: 0; right: 0; bottom: 0;
  display: flex; align-items: center; justify-content: center;
  font-size: 22px; font-weight: bold; color: #fff;
  text-shadow: 0 2px 4px #000, 0 0 8px #000;
}

.ac-math-detail { margin: 0 0 9px; text-align: center; font-size: 10px; color: #8c7a5c; }

.ac-tune {
  display: flex; align-items: center; justify-content: center; gap: 7px;
  width: 100%; padding: 6px 10px; margin-bottom: 9px;
  border-radius: 9px; background: rgba(0, 0, 0, 0.28); border: 1px solid #4a3c22;
}
.ac-tune-label { font-size: 11px; color: #a89878; }
.ac-tune-num { font-size: 15px; font-weight: bold; color: #e8dcc0; min-width: 1.2em; text-align: center; }
.ac-step {
  width: 26px; height: 26px; line-height: 1; cursor: pointer; flex: none;
  border: 1px solid #6b552f; border-radius: 7px;
  background: rgba(0, 0, 0, 0.4); color: #e8dcc0; font-size: 15px;
}
.ac-step:disabled { opacity: 0.35; cursor: not-allowed; }
.ac-step:not(:disabled):active { background: rgba(200, 155, 60, 0.25); }

/* ── รอ ── */
.ac-locked { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 6px; margin: 0; }
.ac-locked-check {
  display: inline-flex; align-items: center; justify-content: center;
  width: 22px; height: 22px; border-radius: 50%;
  background: rgba(24, 80, 40, 0.5); border: 1px solid #3c7a4a; color: #8fe0a0; font-size: 12px;
}
.ac-locked-text { font-size: 14px; font-weight: bold; color: #e8dcc0; }
.ac-locked-dmg { font-size: 18px; font-weight: bold; color: #ff9c86; }
.ac-wait { margin-top: 10px; padding-top: 9px; border-top: 1px solid rgba(107, 85, 47, 0.5); }
.ac-wait-text { margin: 0; text-align: center; font-size: 11px; color: #8c7a5c; }
.ac-wait-done { margin-top: 10px; color: #c89b3c; }
.ac-wait-dots { display: flex; justify-content: center; gap: 8px; margin-top: 6px; }
.ac-wait-icon { width: 26px; height: 26px; object-fit: contain; opacity: 0.4; animation: ac-pulse 1.4s ease-in-out infinite; }
@keyframes ac-pulse { 0%, 100% { opacity: 0.25; } 50% { opacity: 0.7; } }

@media (prefers-reduced-motion: reduce) {
  .ac-wait-icon { animation: none; opacity: 0.45; }
}
</style>
