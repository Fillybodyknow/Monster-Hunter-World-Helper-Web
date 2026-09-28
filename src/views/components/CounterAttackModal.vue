<script setup>
// สวนกลับหลังโดนมอนโจมตี (ตอนนี้มีแค่ Attack Card ของ Lance)
// สองขั้น: เลือกส่วนที่จะตี → ใส่ดาเมจจาก Damage Card แล้วแอปหักเกราะของส่วนนั้นให้
// กติกา: ดาเมจที่เข้าจริงอย่างน้อย 1 หน่วยเสมอ ต่อให้เกราะสูงกว่าดาเมจที่ทอยได้
import { computed, ref } from 'vue'

const props = defineProps({
  // [{ position, name, thumbnail, armor, current, max, broken, positions }]
  parts: { type: Array, default: () => [] },
  hunterName: { type: String, default: '' },
  // เลือด/เกราะของมอนถูกลดด้วย Blastblight อยู่หรือเปล่า — ไว้บอกว่าทำไมเกราะน้อยลง
  blast: { type: Boolean, default: false },
})
const emit = defineEmits(['confirm', 'cancel'])

const img = (path) => `${import.meta.env.BASE_URL}${path}`
// วงกลมบอกด้านที่ตีชิ้นนี้ได้ — พิกัดชุดเดียวกับแผนภาพบนการ์ด Part ในหน้าล่า
const POS_DOTS = {
  front: { x: 50, y: 20 },
  back: { x: 50, y: 80 },
  left: { x: 20, y: 50 },
  right: { x: 80, y: 50 },
}
const dotsOf = (p) => (p.positions ?? [p.position]).map((pos) => POS_DOTS[pos]).filter(Boolean)
const picked = ref(null)      // position ที่เลือก
const raw = ref(0)            // ดาเมจรวมจาก Damage Card
const breakAdd = ref(0)       // Break Token ที่จะใส่เพิ่ม

const part = computed(() => props.parts.find((p) => p.position === picked.value) ?? null)
const armor = computed(() => part.value?.armor ?? 0)
// อย่างน้อย 1 หน่วยเสมอ — แต่ถ้ายังไม่ใส่เลขก็ยังไม่ต้องโชว์ว่าจะเข้า 1
const dealt = computed(() => (raw.value > 0 ? Math.max(1, raw.value - armor.value) : 0))
const blocked = computed(() => raw.value > 0 && raw.value - armor.value < 1)

const press = (n) => { if (raw.value < 100) raw.value = raw.value * 10 + n }
const backspace = () => { raw.value = Math.floor(raw.value / 10) }
const clearAll = () => { raw.value = 0 }
const stepBreak = (d) => {
  const max = part.value?.max ?? 0
  const room = Math.max(0, max - (part.value?.current ?? 0))
  breakAdd.value = Math.max(0, Math.min(room, breakAdd.value + d))
}
const pick = (position) => {
  picked.value = position
  breakAdd.value = 0
}
const confirm = () => {
  if (!part.value || raw.value <= 0) return
  emit('confirm', { position: part.value.position, raw: raw.value, dealt: dealt.value, breakAdd: breakAdd.value })
}
</script>

<template>
  <div class="ca-overlay">
    <div class="ca-modal">
      <header class="ca-head">
        <span class="ca-title">⚔ สวนกลับ</span>
        <span class="ca-sub">{{ hunterName }} ตอบโต้การโจมตี</span>
      </header>

      <!-- ขั้น 1: เลือกส่วนที่จะตี -->
      <template v-if="!part">
        <p class="ca-step">1. เลือกส่วนที่ตีได้จากตำแหน่งที่ยืนอยู่</p>
        <div class="ca-parts">
          <button
            v-for="p in parts"
            :key="p.position"
            class="ca-part"
            :class="{ 'ca-part-broken': p.broken }"
            @click="pick(p.position)"
          >
            <div class="ca-part-top">
              <img v-if="p.thumbnail" :src="img(p.thumbnail)" class="ca-part-img" alt="" />
              <!-- ส่วนโค้งที่ตีชิ้นนี้ได้ -->
              <svg viewBox="0 0 100 100" class="ca-part-arc" aria-hidden="true">
                <circle cx="50" cy="50" r="46" fill="#0f0b05" stroke="#5a3d1f" stroke-width="3" />
                <line x1="4" y1="4" x2="96" y2="96" stroke="#3a2810" stroke-width="3" />
                <line x1="96" y1="4" x2="4" y2="96" stroke="#3a2810" stroke-width="3" />
                <circle
                  v-for="(d, i) in dotsOf(p)"
                  :key="i"
                  :cx="d.x"
                  :cy="d.y"
                  r="14"
                  :fill="p.broken ? 'rgba(220,60,40,0.9)' : 'rgba(200,155,60,0.95)'"
                />
              </svg>
            </div>
            <span class="ca-part-name">{{ p.name }}</span>
            <span class="ca-part-armor">
              <img :src="img('assets/img/bonus_armor.webp')" class="ca-armor-icon" alt="" />
              {{ p.armor }}
            </span>
            <span v-if="p.broken" class="ca-part-tag">BROKEN</span>
          </button>
        </div>
        <button class="ca-btn ca-skip" @click="emit('cancel')">ไม่สวนกลับ</button>
      </template>

      <!-- ขั้น 2: ใส่ดาเมจจาก Damage Card -->
      <template v-else>
        <button class="ca-back" @click="picked = null">‹ เปลี่ยนส่วน</button>
        <div class="ca-target">
          <img v-if="part.thumbnail" :src="img(part.thumbnail)" class="ca-target-img" alt="" />
          <svg viewBox="0 0 100 100" class="ca-target-arc" aria-hidden="true">
            <circle cx="50" cy="50" r="46" fill="#0f0b05" stroke="#5a3d1f" stroke-width="3" />
            <line x1="4" y1="4" x2="96" y2="96" stroke="#3a2810" stroke-width="3" />
            <line x1="96" y1="4" x2="4" y2="96" stroke="#3a2810" stroke-width="3" />
            <circle
              v-for="(d, i) in dotsOf(part)"
              :key="i"
              :cx="d.x"
              :cy="d.y"
              r="14"
              :fill="part.broken ? 'rgba(220,60,40,0.9)' : 'rgba(200,155,60,0.95)'"
            />
          </svg>
          <div class="ca-target-info">
            <span class="ca-target-name">{{ part.name }}</span>
            <span class="ca-target-armor">
              เกราะ {{ armor }}
              <small v-if="blast">(Blastblight −1 แล้ว)</small>
            </span>
          </div>
        </div>

        <p class="ca-step">2. ใส่ดาเมจรวมจาก Damage Card</p>
        <div class="ca-calc">
          <div class="ca-calc-line">
            <span class="ca-raw">{{ raw || '—' }}</span>
            <span class="ca-minus">−</span>
            <span class="ca-armor">{{ armor }}</span>
            <span class="ca-eq">=</span>
            <strong class="ca-dealt">{{ dealt }}</strong>
          </div>
          <p v-if="blocked" class="ca-note">เกราะสูงกว่าดาเมจ แต่เข้าอย่างน้อย 1 หน่วยเสมอ</p>
        </div>

        <div class="ca-pad">
          <button v-for="n in 9" :key="n" class="ca-key" @click="press(n)">{{ n }}</button>
          <button class="ca-key ca-key-fn" @click="clearAll">C</button>
          <button class="ca-key" @click="press(0)">0</button>
          <button class="ca-key ca-key-fn" @click="backspace">⌫</button>
        </div>

        <div class="ca-break">
          <span class="ca-break-label">Break Token</span>
          <div class="ca-break-ctrl">
            <button class="ca-break-btn" @click="stepBreak(-1)">−</button>
            <span class="ca-break-val">{{ breakAdd }}</span>
            <button class="ca-break-btn" @click="stepBreak(1)">+</button>
          </div>
          <span class="ca-break-now">{{ part.current + breakAdd }} / {{ part.max }}</span>
        </div>

        <div class="ca-btns">
          <button class="ca-btn ca-cancel" @click="emit('cancel')">ไม่สวนกลับ</button>
          <button class="ca-btn ca-ok" :disabled="raw <= 0" @click="confirm">
            ✓ ตีเข้า {{ dealt }}
          </button>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.ca-overlay {
  position: fixed;
  inset: 0;
  z-index: 9965;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 14px;
  background: rgba(0, 0, 0, 0.72);
}
.ca-modal {
  width: 100%;
  max-width: 380px;
  max-height: 92vh;
  overflow-y: auto;
  padding: 16px 14px 14px;
  border-radius: 14px;
  border: 1.5px solid #c9a050;
  background: linear-gradient(180deg, #2a1d0c 0%, #140e06 100%);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6);
  color: #e8dcc0;
}
.ca-head { display: flex; flex-direction: column; gap: 2px; margin-bottom: 12px; text-align: center; }
.ca-title { font-size: 1.15rem; font-weight: 800; color: #ffd27a; }
.ca-sub { font-size: 0.78rem; color: #a8946c; }
.ca-step { margin: 0 0 8px; font-size: 0.82rem; color: #c9a86a; }

.ca-parts { display: grid; grid-template-columns: repeat(auto-fit, minmax(96px, 1fr)); gap: 8px; margin-bottom: 12px; }
.ca-part {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  min-height: 116px;
  padding: 10px 6px;
  border: 1px solid #5a3d1f;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.04);
  color: inherit;
  font-family: inherit;
  cursor: pointer;
}
.ca-part:active { transform: scale(0.97); }
.ca-part-broken { border-color: rgba(220, 60, 40, 0.7); }
.ca-part-top { display: flex; align-items: center; gap: 4px; }
.ca-part-img { width: 40px; height: 40px; object-fit: contain; }
.ca-part-arc { width: 30px; height: 30px; flex-shrink: 0; }
.ca-target-arc { width: 34px; height: 34px; flex-shrink: 0; }
.ca-part-name { font-size: 0.78rem; text-align: center; line-height: 1.2; }
.ca-part-armor { display: inline-flex; align-items: center; gap: 3px; font-size: 0.8rem; font-weight: 700; color: #ffd27a; }
.ca-armor-icon { width: 15px; height: 15px; object-fit: contain; }
.ca-part-tag { position: absolute; top: 4px; right: 5px; font-size: 0.58rem; letter-spacing: 1px; color: #ff8a70; }

.ca-back { margin-bottom: 8px; padding: 0; border: none; background: none; color: #a8946c; font-family: inherit; font-size: 0.8rem; cursor: pointer; }
.ca-target { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; padding: 8px 10px; border-radius: 10px; background: rgba(255, 255, 255, 0.05); }
.ca-target-img { width: 42px; height: 42px; object-fit: contain; }
.ca-target-info { display: flex; flex-direction: column; }
.ca-target-name { font-size: 0.95rem; font-weight: 700; color: #fff0cc; }
.ca-target-armor { font-size: 0.76rem; color: #a8946c; }
.ca-target-armor small { color: #ff9a80; }

.ca-calc { margin-bottom: 10px; padding: 10px; border-radius: 10px; background: rgba(0, 0, 0, 0.35); text-align: center; }
.ca-calc-line { display: flex; align-items: baseline; justify-content: center; gap: 8px; font-size: 1.05rem; }
.ca-raw { min-width: 46px; font-size: 1.5rem; font-weight: 800; color: #fff0cc; }
.ca-minus, .ca-eq { color: #8a7050; }
.ca-armor { color: #c9a86a; }
.ca-dealt { font-size: 1.8rem; color: #ff9a60; }
.ca-note { margin: 6px 0 0; font-size: 0.72rem; color: #a8946c; }

.ca-pad { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-bottom: 12px; }
.ca-key {
  min-height: 46px;
  border: 1px solid #5a3d1f;
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.05);
  color: #fff0cc;
  font-family: inherit;
  font-size: 1.15rem;
  font-weight: 700;
  cursor: pointer;
}
.ca-key:active { background: rgba(201, 160, 80, 0.25); }
.ca-key-fn { color: #c9a86a; font-size: 0.95rem; }

.ca-break { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; padding: 8px 10px; border-radius: 10px; background: rgba(255, 255, 255, 0.04); }
.ca-break-label { flex: 1; font-size: 0.82rem; color: #c9a86a; }
.ca-break-ctrl { display: flex; align-items: center; gap: 6px; }
.ca-break-btn { width: 34px; height: 34px; border: 1px solid #5a3d1f; border-radius: 8px; background: rgba(255, 255, 255, 0.05); color: #fff0cc; font-family: inherit; font-size: 1rem; cursor: pointer; }
.ca-break-val { min-width: 20px; text-align: center; font-weight: 700; color: #fff0cc; }
.ca-break-now { font-size: 0.74rem; color: #8a7050; }

.ca-btns { display: flex; gap: 8px; }
.ca-btn { flex: 1; min-height: 44px; border-radius: 10px; font-family: inherit; font-size: 0.9rem; font-weight: 700; cursor: pointer; }
.ca-cancel, .ca-skip { border: 1px solid #5a3d1f; background: rgba(255, 255, 255, 0.04); color: #c9a86a; }
.ca-skip { width: 100%; }
.ca-ok { border: none; background: #c9a050; color: #1a1206; }
.ca-ok:disabled { opacity: 0.45; cursor: not-allowed; }
</style>
