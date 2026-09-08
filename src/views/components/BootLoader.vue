<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import { preloadCore, preloadDeferred } from '@/services/assetPreload'

const emit = defineEmits(['done'])

const logo = `${import.meta.env.BASE_URL}assets/img/UI/icon.webp`

const percent = ref(0)
const closing = ref(false)

// รูปแคชไว้แล้วจะเสร็จใน ~200ms — ถ้าปล่อยตามจริงหน้าโหลดจะกระพริบแวบเดียวเหมือนจอค้าง
const MIN_SHOW = 900

const TIPS = [
  'ลับอาวุธไว้เสมอ ก่อนเข้าปะทะ',
  'รอยเท้าที่พบระหว่างทาง บอกได้ว่ามอนสเตอร์ไปทางไหน',
  'Hunter Token เป็นตัวบอกว่ามอนสเตอร์จะเล็งใคร',
  'ยาไม่ได้มีไว้ใช้ตอนใกล้ตาย แต่มีไว้ใช้ก่อนถึงตอนนั้น',
  'ทำลายส่วนของมอนสเตอร์ แล้วจะได้วัตถุดิบที่หายาก',
  'แบ่งของกันในกองกลางก่อนออกล่า จะรอดกว่าเก็บไว้คนเดียว',
  'จับตาการ์ด Behavior ให้ดี มันบอกว่าเทิร์นนี้เล่นได้กี่ที',
]
const tip = ref(TIPS[Math.floor(Math.random() * TIPS.length)])
let _tipTimer = null

onMounted(async () => {
  document.body.classList.add('modal-open')
  _tipTimer = setInterval(() => {
    tip.value = TIPS[(TIPS.indexOf(tip.value) + 1) % TIPS.length]
  }, 3200)

  const started = Date.now()
  await preloadCore((p) => {
    // แถบต้องเดินหน้าอย่างเดียว — คิว 8 เส้นจบไม่พร้อมกัน ค่าที่เข้ามาอาจย้อนหลังได้
    percent.value = Math.max(percent.value, Math.round(p * 100))
  })
  percent.value = 100

  const wait = Math.max(0, MIN_SHOW - (Date.now() - started))
  setTimeout(() => {
    closing.value = true
    preloadDeferred()
    setTimeout(() => emit('done'), 450)
  }, wait)
})

onUnmounted(() => {
  clearInterval(_tipTimer)
  document.body.classList.remove('modal-open')
})
</script>

<template>
  <teleport to="body">
    <div class="bl-screen" :class="{ 'bl-closing': closing }">
      <div class="bl-inner">
        <div class="bl-logo-frame">
          <img :src="logo" class="bl-logo" alt="" />
        </div>

        <div class="bl-ornament">✦ ✦ ✦</div>
        <h1 class="bl-title">Monster Hunter World</h1>
        <p class="bl-subtitle">Board Game Companion</p>

        <div class="bl-bar">
          <div class="bl-fill" :style="{ width: percent + '%' }"></div>
        </div>

        <div class="bl-status">
          <span class="bl-label">{{ percent < 100 ? 'กำลังเตรียมอุปกรณ์ล่า' : 'พร้อมออกเดินทาง' }}</span>
          <span class="bl-percent">{{ percent }}%</span>
        </div>

        <transition name="bl-tip" mode="out-in">
          <p class="bl-tip" :key="tip">“{{ tip }}”</p>
        </transition>
      </div>
    </div>
  </teleport>
</template>

<style scoped>
.bl-screen {
  position: fixed;
  inset: 0;
  z-index: 99999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: radial-gradient(ellipse at center, rgba(24, 17, 9, 0.94), rgba(6, 4, 2, 0.99) 70%);
  backdrop-filter: blur(6px);
  transition: opacity 0.45s ease, visibility 0.45s;
}

.bl-screen.bl-closing {
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
}

.bl-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  width: min(420px, 100%);
  font-family: 'Georgia', 'Times New Roman', serif;
  text-align: center;
}

/* วงแหวนทองหมุน — ตัวเดียวกับกรอบโลโก้ในหน้าแอป ให้ต่อเนื่องกันตอนหน้าโหลดจางออก */
.bl-logo-frame {
  position: relative;
  width: 120px;
  height: 120px;
  margin-bottom: 6px;
}

.bl-logo-frame::before {
  content: '';
  position: absolute;
  inset: -5px;
  border-radius: 50%;
  background: conic-gradient(
    #c89b3c 0deg, #ffd27a 60deg, #c89b3c 120deg,
    #7c5a2b 180deg, #c89b3c 240deg, #ffd27a 300deg, #c89b3c 360deg
  );
  opacity: 0.8;
  animation: blSpin 3.2s linear infinite;
}

.bl-logo {
  position: relative;
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
  border: 3px solid #7c5a2b;
  background: #0a0806;
  box-shadow:
    0 0 24px rgba(255, 200, 100, 0.45),
    inset 0 0 12px rgba(255, 200, 100, 0.2);
  animation: blPulse 2.6s ease-in-out infinite;
}

@keyframes blSpin {
  to { transform: rotate(360deg); }
}

@keyframes blPulse {
  0%, 100% { box-shadow: 0 0 24px rgba(255, 200, 100, 0.4), inset 0 0 12px rgba(255, 200, 100, 0.18); }
  50%      { box-shadow: 0 0 40px rgba(255, 200, 100, 0.7), inset 0 0 16px rgba(255, 200, 100, 0.3); }
}

.bl-ornament {
  color: #7c5a2b;
  font-size: 10px;
  letter-spacing: 8px;
}

.bl-title {
  margin: 0;
  font-size: 22px;
  color: #ffd27a;
  letter-spacing: 3px;
  text-transform: uppercase;
  text-shadow: 0 0 20px rgba(255, 200, 80, 0.55), 0 2px 6px rgba(0, 0, 0, 0.9);
}

.bl-subtitle {
  margin: 0 0 14px;
  font-size: 11px;
  color: #a88040;
  letter-spacing: 4px;
  text-transform: uppercase;
}

.bl-bar {
  position: relative;
  width: 100%;
  height: 8px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.6);
  border: 1px solid rgba(200, 155, 60, 0.4);
  overflow: hidden;
  box-shadow: inset 0 1px 4px rgba(0, 0, 0, 0.8);
}

.bl-fill {
  height: 100%;
  position: relative;
  overflow: hidden;
  border-radius: 999px;
  background: linear-gradient(to right, #7c5a2b, #c89b3c, #ffd27a);
  box-shadow: 0 0 12px rgba(255, 200, 100, 0.6);
  transition: width 0.3s ease-out;
}

/* แถบวิ่งบาง ๆ ทับบน fill — บอกว่ายังทำงานอยู่แม้ % ค้างเพราะติดไฟล์ใหญ่ */
.bl-fill::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    100deg,
    transparent 30%,
    rgba(255, 240, 200, 0.35) 50%,
    transparent 70%
  );
  animation: blSheen 1.4s linear infinite;
}

@keyframes blSheen {
  from { transform: translateX(-100%); }
  to   { transform: translateX(100%); }
}

.bl-status {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  width: 100%;
  margin-top: 8px;
}

.bl-label {
  font-size: 10px;
  color: #a88040;
  letter-spacing: 2px;
  text-transform: uppercase;
}

.bl-percent {
  font-size: 13px;
  font-weight: bold;
  color: #ffd27a;
  letter-spacing: 1px;
}

.bl-tip {
  margin: 22px 0 0;
  min-height: 34px;
  font-size: 12px;
  line-height: 1.6;
  color: #7c5a2b;
  font-style: italic;
}

.bl-tip-enter-active,
.bl-tip-leave-active {
  transition: opacity 0.4s ease;
}
.bl-tip-enter-from,
.bl-tip-leave-to {
  opacity: 0;
}

@media (max-width: 480px) {
  .bl-logo-frame { width: 92px; height: 92px; }
  .bl-title { font-size: 17px; letter-spacing: 2px; }
  .bl-subtitle { font-size: 10px; letter-spacing: 3px; }
}

@media (prefers-reduced-motion: reduce) {
  .bl-logo-frame::before,
  .bl-logo,
  .bl-fill::after {
    animation: none;
  }
}
</style>
