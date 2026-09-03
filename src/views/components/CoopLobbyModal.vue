<script setup>
import { ref, watch, computed } from 'vue'
import { useRoomStore } from '@/stores/room'
import hunterClassData from '@/assets/files/class_hunter.json'

const emit = defineEmits(['start', 'leave'])

const room = useRoomStore()
const getImg = (path) => `${import.meta.env.BASE_URL}${path}`
const getClass = (id) => hunterClassData.find((c) => c.hunter_class_id === id)

// สีป้ายตามชนิดเควส — ชุดเดียวกับหน้า Room Board
// Tempered ต้องเช็คก่อน เพราะชื่อเต็มคือ "Tempered Investigation Quest"
const questTypeTone = (type) => {
  if (!type) return ''
  if (type.includes('Tempered')) return 'qt-tempered'
  if (type.includes('Investigation')) return 'qt-invest'
  return ''
}

// Countdown state
const countdownMsg = ref('')
const counting = ref(false)
let _countdownTimer = null

const countdownText = [
  '⚔ Hunter พร้อมแล้ว!',
  '🗺 กำลังออกล่า...',
  '🌿 ได้เวลาออกล่า!',
]

const startCountdown = () => {
  if (counting.value) return
  counting.value = true
  let i = 0
  countdownMsg.value = countdownText[0]

  _countdownTimer = setInterval(() => {
    i++
    if (i < countdownText.length) {
      countdownMsg.value = countdownText[i]
    }
  }, 1200)

  setTimeout(() => {
    clearInterval(_countdownTimer)
    // ไม่ล้างสถานะนับถอยหลัง — หน้านี้จะถูกปิดตอน phase เปลี่ยน
    // ถ้าล้าง Guest ที่ยังรอ Host จะเห็นปุ่ม Ready เด้งกลับมาเหมือนยังไม่ได้เริ่ม
    emit('start')
  }, 4000)
}

// Host: when allReady → push questStartAt to Firebase
watch(() => room.allReady, (ready) => {
  if (ready && room.isHost) {
    room.triggerQuestStart()
  }
})

// Watch questStartAt (for guests — host triggers, guests follow)
watch(() => room.questStartAt, (val) => {
  if (val && !counting.value) startCountdown()
})

const handleReady = () => room.setReady(!room.amReady)

const handleLeave = async () => {
  clearInterval(_countdownTimer)
  await room.leave()
  emit('leave')
}

const copyCode = async () => {
  await navigator.clipboard.writeText(room.roomCode)
  copied.value = true
  setTimeout(() => (copied.value = false), 1500)
}
const copied = ref(false)

const starColor = computed(() => {
  const d = room.questInfo?.difficulty_level
  if (d >= 4) return '#cc77ff'
  if (d >= 2) return '#ff4444'
  return '#ffffff'
})
</script>

<template>
  <div class="cl-page">

    <!-- ทุกคนพร้อม → ปิดจอด้วยหน้ากำลังออกล่า -->
    <Teleport to="body">
      <Transition name="cl-fade">
        <div v-if="counting" class="cl-loading">
          <div class="cl-loading-box">
            <div class="cl-loading-party">
              <div
                v-for="(h, i) in room.hunters"
                :key="h.hunter_id"
                class="cl-loading-hunter"
                :style="{ animationDelay: i * 0.14 + 's' }"
                :title="h.hunter_name"
              >
                <img
                  v-if="getClass(h.hunter_class_id)?.thumbnail"
                  :src="getImg(getClass(h.hunter_class_id).thumbnail)"
                  class="cl-loading-icon"
                />
                <span v-else class="cl-loading-icon-fallback">⚔</span>
              </div>
            </div>
            <p class="cl-loading-text">{{ countdownMsg }}</p>
            <div class="cl-loading-bar">
              <div class="cl-loading-fill"></div>
            </div>
            <p class="cl-loading-sub">กำลังเตรียมการล่า...</p>
          </div>
        </div>
      </Transition>
    </Teleport>

    <div class="board-header">
      <div class="board-ornament">✦</div>
      <h1 class="board-title">Co-op Lobby</h1>
      <div class="board-ornament">✦</div>
    </div>
    <p class="board-subtitle">Waiting for Hunters</p>

    <div class="cl-board">
    <div class="cl-inner">

      <!-- Room Code — เด่นสุดในหน้า เพราะเป็นสิ่งที่ต้องบอกเพื่อน -->
      <button class="cl-code-banner" :class="{ copied }" @click="copyCode">
        <span class="cl-code-label">{{ copied ? '✓ คัดลอกแล้ว' : 'ROOM CODE — แตะเพื่อคัดลอก' }}</span>
        <span class="cl-code">
          <span v-for="(ch, i) in room.roomCode" :key="i" class="cl-code-char">{{ ch }}</span>
        </span>
      </button>

      <!-- ใบประกาศที่ทีมนี้รับไว้ ปักอยู่บนกระดาน -->
      <div class="cl-notice">

      <div v-if="room.questInfo" class="cl-quest">
        <img
          v-if="room.questInfo.thumbnail"
          :src="getImg(room.questInfo.thumbnail)"
          class="cl-quest-img"
          :class="questTypeTone(room.questInfo.quest_type)"
        />
        <div class="cl-quest-body">
          <span class="cl-quest-name">{{ room.questInfo.monster_name }}</span>
          <div class="cl-quest-meta">
            <span class="cl-tag" :class="questTypeTone(room.questInfo.quest_type)">
              {{ room.questInfo.quest_type }}
            </span>
            <span class="cl-stars" :style="{ color: starColor }">
              <span v-for="i in room.questInfo.difficulty_level" :key="i">★</span>
            </span>
          </div>
          <div v-if="room.questInfo.exhausted_attempt" class="cl-warn">
            ⚠ จะบังคับเข้า HQ (2 กิจกรรม)
          </div>
        </div>
      </div>

      <!-- Hunters -->
      <div class="cl-section-head">
        <div class="cl-line"></div>
        <span class="cl-section-label">
          Hunters · {{ room.hunters.filter(h => h.ready).length }}/{{ room.hunterCount }} Ready
        </span>
        <div class="cl-line"></div>
      </div>

      <div class="cl-hunter-grid">
        <div
          v-for="h in room.hunters"
          :key="h.hunter_id"
          class="cl-hunter"
          :class="{ ready: h.ready, me: h.hunter_id === room.myHunterId }"
        >
          <div class="cl-hunter-head">
            <img
              v-if="getClass(h.hunter_class_id)?.thumbnail"
              :src="getImg(getClass(h.hunter_class_id).thumbnail)"
              class="cl-hunter-icon"
            />
            <span class="cl-hunter-name">{{ h.hunter_name }}</span>
          </div>

          <div class="cl-hunter-meta">
            <span v-if="h.isHost" class="cl-host-tag">HOST</span>
            <span class="cl-hunter-class">{{ getClass(h.hunter_class_id)?.hunter_class }}</span>
            <span class="cl-day">DAY {{ h.campaign_day ?? 1 }}</span>
          </div>

          <div v-if="h.weapon" class="cl-weapon">
            <img
              v-if="h.weapon.thumbnail"
              :src="getImg(h.weapon.thumbnail)"
              class="cl-weapon-icon"
              :title="`Rarity ${h.weapon.rarity}`"
            />
            <span class="cl-weapon-name" :class="'cl-rar-' + (h.weapon.rarity || 1)">
              {{ h.weapon.name }}
            </span>
          </div>
          <div v-else class="cl-weapon cl-weapon-none">ไม่มีข้อมูลอาวุธ</div>

          <div class="cl-ready" :class="h.ready ? 'is-ready' : 'not-ready'">
            {{ h.ready ? '✓ Ready' : 'รอ Ready' }}
          </div>
        </div>

        <div v-for="i in (4 - room.hunterCount)" :key="`e${i}`" class="cl-hunter cl-hunter-empty">
          <span class="cl-empty-text">รอ Hunter</span>
        </div>
      </div>

      </div>

      <p class="cl-status" :class="{ 'all-ready': room.allReady }">
        <span v-if="room.allReady">✦ ทุกคน Ready แล้ว — กำลังเริ่ม</span>
        <span v-else>รอ Hunter กด Ready ให้ครบ</span>
      </p>

      <div class="cl-actions">
        <button
          class="cl-btn-ready"
          :class="{ active: room.amReady }"
          @click="handleReady"
          :disabled="counting"
        >
          {{ room.amReady ? '✓ Ready!' : 'Ready' }}
        </button>
        <button class="cl-btn-leave" @click="handleLeave" :disabled="counting">
          {{ room.isHost ? '🗑 ยุบ Room' : '🚪 ออก' }}
        </button>
      </div>

    </div>
    </div>
  </div>
</template>

<style scoped>
.cl-page {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding-bottom: 40px;
  /* เข้าหน้าแบบเดียวกับ phase อื่นใน Quest.vue */
  animation: phase-in 0.3s cubic-bezier(0.22, 0.61, 0.36, 1) both;
}

@keyframes phase-in {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .cl-page { animation: none; }
}
.cl-inner {
  width: 100%;
  max-width: 560px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* หัวเรื่องชุดเดียวกับหน้าอื่น — scoped เลยต้องมีสำเนาของตัวเอง */
.board-header {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}
.board-ornament {
  color: #7c5a2b;
  font-size: 14px;
}
.board-title {
  margin: 0;
  font-size: 20px;
  font-weight: bold;
  color: #ffd27a;
  letter-spacing: 3px;
  text-transform: uppercase;
}
.board-subtitle {
  margin: 0;
  text-align: center;
  font-size: 11px;
  letter-spacing: 3px;
  text-transform: uppercase;
  color: #7c5a2b;
}

/* ── Room Code ── */
.cl-code-banner {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 14px;
  border-radius: 12px;
  border: 1px solid rgba(200,155,60,0.35);
  background: linear-gradient(to bottom, rgba(200,155,60,0.12), rgba(200,155,60,0.04));
  font-family: inherit;
  cursor: pointer;
  transition: 0.15s;
}
.cl-code-banner:hover { border-color: rgba(200,155,60,0.7); }
.cl-code-banner.copied { border-color: rgba(90,210,130,0.7); }
.cl-code-label {
  font-size: 9px;
  letter-spacing: 2px;
  color: #7c5a2b;
}
.cl-code-banner.copied .cl-code-label { color: #7fd99a; }
.cl-code {
  display: flex;
  gap: 6px;
}
.cl-code-char {
  min-width: 28px;
  padding: 4px 0;
  border-radius: 6px;
  background: rgba(0,0,0,0.4);
  border: 1px solid rgba(124,90,43,0.5);
  font-family: monospace;
  font-size: 20px;
  font-weight: bold;
  color: #ffd27a;
  text-align: center;
  letter-spacing: 1px;
}

/* ── หน้ากำลังออกล่า (ทุกคน Ready แล้ว) ── */
.cl-loading {
  position: fixed;
  inset: 0;
  z-index: 1400;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(6, 4, 2, 0.93);
  backdrop-filter: blur(10px);
}
.cl-loading-box {
  width: min(90vw, 340px);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
}
.cl-loading-party {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  flex-wrap: wrap;
}
/* เต้นเหลื่อมกันทีละคน ให้เห็นว่าทั้งตี้กำลังออกเดินทาง */
.cl-loading-hunter {
  animation: cl-bob 1.5s ease-in-out infinite;
}
.cl-loading-icon {
  width: 42px;
  height: 42px;
  object-fit: contain;
  filter: drop-shadow(0 0 12px rgba(200,155,60,0.55));
}
.cl-loading-icon-fallback {
  display: inline-block;
  width: 42px;
  font-size: 30px;
  text-align: center;
  color: #ffd27a;
  filter: drop-shadow(0 0 12px rgba(200,155,60,0.55));
}
@keyframes cl-bob {
  0%, 100% { transform: translateY(4px) scale(0.94); opacity: 0.7; }
  50%      { transform: translateY(-5px) scale(1.06); opacity: 1; }
}
.cl-loading-text {
  margin: 0;
  font-size: 17px;
  font-weight: bold;
  color: #ffd27a;
  letter-spacing: 2px;
  text-align: center;
  min-height: 24px;
}
/* แถบเดินตามเวลานับถอยหลังจริง (4 วินาที) */
.cl-loading-bar {
  width: 100%;
  height: 4px;
  border-radius: 999px;
  overflow: hidden;
  background: rgba(200,155,60,0.15);
}
.cl-loading-fill {
  height: 100%;
  width: 0;
  border-radius: 999px;
  background: linear-gradient(90deg, #7c5a2b, #ffd27a);
  animation: cl-fill 4s linear forwards;
}
@keyframes cl-fill {
  from { width: 0; }
  to   { width: 100%; }
}
.cl-loading-sub {
  margin: 0;
  font-size: 11px;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: #7c5a2b;
}
.cl-fade-enter-active, .cl-fade-leave-active { transition: opacity 0.3s ease; }
.cl-fade-enter-from, .cl-fade-leave-to { opacity: 0; }

@media (prefers-reduced-motion: reduce) {
  .cl-loading-hunter { animation: none; }
}

/* ── กระดานไม้ + ใบประกาศ (ชุดเดียวกับหน้า Room Board) ── */
.cl-board {
  width: 100%;
  padding: 22px 16px 26px;
  border-radius: 6px;
  background:
    repeating-linear-gradient(
      90deg,
      rgba(0,0,0,0.16) 0px,
      rgba(0,0,0,0.16) 1px,
      transparent 1px,
      transparent 7px
    ),
    repeating-linear-gradient(
      90deg,
      rgba(255,220,160,0.045) 0px,
      rgba(255,220,160,0.045) 2px,
      transparent 2px,
      transparent 23px
    ),
    linear-gradient(175deg, #4a3520 0%, #46331f 22%, #3a2917 58%, #43301c 100%);
  border: 4px solid #2e2113;
  box-shadow:
    inset 0 0 60px rgba(0,0,0,0.55),
    inset 0 2px 0 rgba(255,220,160,0.08),
    0 4px 14px rgba(0,0,0,0.5);
}
.cl-notice {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 4px;
  padding: 18px 16px 16px;
  border: 1px solid #b8a173;
  border-radius: 2px;
  color: #3a2c18;
  transform: rotate(-0.4deg);
  background:
    radial-gradient(circle at 12% 8%, rgba(140,110,60,0.13), transparent 42%),
    radial-gradient(circle at 88% 92%, rgba(120,95,50,0.15), transparent 45%),
    linear-gradient(168deg, #efe4c8 0%, #e6d9b8 45%, #dccba6 100%);
  box-shadow:
    0 3px 8px rgba(0,0,0,0.45),
    inset 0 0 26px rgba(150,120,70,0.14);
}
/* หมุดปักหัวใบประกาศ */
.cl-notice::before {
  content: '';
  position: absolute;
  top: -6px;
  left: 50%;
  transform: translateX(-50%);
  width: 13px;
  height: 13px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #f0d9a0, #a8762c 60%, #6b4718);
  box-shadow: 0 2px 4px rgba(0,0,0,0.6);
}

/* ── หมึกบนกระดาษ: ทับโทนทอง/ดำเดิมให้อ่านออก ── */
.cl-notice .cl-quest {
  background: rgba(120,95,55,0.08);
  border-color: rgba(120,95,55,0.32);
}
.cl-notice .cl-quest-img {
  background: rgba(90,70,40,0.12);
  border: 1px solid rgba(120,95,55,0.3);
}
.cl-notice .cl-quest-name { color: #2f2312; }
.cl-notice .cl-tag {
  background: rgba(120,95,55,0.14);
  border-color: rgba(120,95,55,0.4);
  color: #6b542e;
}
.cl-notice .cl-warn { color: #9c4a15; }
.cl-notice .cl-section-label { color: #6b542e; }
.cl-notice .cl-line {
  background: linear-gradient(to right, transparent, rgba(120,95,55,0.5));
}
.cl-notice .cl-line:last-child {
  background: linear-gradient(to left, transparent, rgba(120,95,55,0.5));
}
.cl-notice .cl-hunter {
  background: rgba(120,95,55,0.09);
  border-color: rgba(120,95,55,0.32);
}
.cl-notice .cl-hunter.me { border-color: rgba(150,110,40,0.6); }
.cl-notice .cl-hunter.ready {
  border-color: rgba(45,120,70,0.55);
  background: rgba(60,140,85,0.12);
}
.cl-notice .cl-hunter-name { color: #2f2312; }
.cl-notice .cl-hunter-class { color: #6b542e; }
.cl-notice .cl-host-tag {
  background: rgba(160,120,45,0.28);
  border-color: rgba(140,100,35,0.6);
  color: #5c4212;
}
.cl-notice .cl-day {
  background: rgba(45,85,150,0.12);
  border-color: rgba(45,85,150,0.35);
  color: #2c5f9e;
}
.cl-notice .cl-rar-1 { color: #5f5f5f; }
.cl-notice .cl-rar-2 { color: #2f7d4f; }
.cl-notice .cl-rar-3 { color: #2c5f9e; }
.cl-notice .cl-rar-4 { color: #7b3fa0; }
.cl-notice .cl-weapon-none { color: rgba(90,70,40,0.65); }
.cl-notice .cl-ready.is-ready {
  background: rgba(60,140,85,0.22);
  color: #256b42;
}
.cl-notice .cl-ready.not-ready {
  background: rgba(120,95,55,0.16);
  color: rgba(90,70,40,0.8);
}
.cl-notice .cl-hunter-empty { border-color: rgba(120,95,55,0.4); }
.cl-notice .cl-empty-text { color: rgba(90,70,40,0.5); }

/* ── Quest ── */
.cl-quest {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 12px;
  border-radius: 10px;
  background: rgba(0,0,0,0.28);
  border: 1px solid rgba(124,90,43,0.35);
}
.cl-quest-img {
  width: 66px;
  height: 66px;
  object-fit: contain;
  border-radius: 8px;
  background: rgba(0,0,0,0.35);
  flex-shrink: 0;
}
.cl-quest-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.cl-quest-name {
  font-size: 15px;
  font-weight: bold;
  color: #ffd27a;
}
.cl-quest-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.cl-tag {
  font-size: 9px;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(200,155,60,0.12);
  border: 1px solid rgba(200,155,60,0.3);
  color: #a88040;
  letter-spacing: 0.5px;
}
.cl-stars {
  font-size: 11px;
  letter-spacing: 1px;
}
/* รูปมอนเรืองแสงจากกลางกรอบ (Assigned ไม่เรือง) */
.cl-notice .cl-quest-img.qt-invest {
  background:
    radial-gradient(circle at center,
      rgba(80,155,250,1) 0%,
      rgba(80,155,250,1) 30%,
      rgba(55,115,205,0.48) 48%,
      rgba(45,92,170,0.15) 66%,
      transparent 84%),
    rgba(90,70,40,0.08);
  border: 1px solid rgba(50,105,190,0.55);
}
.cl-notice .cl-quest-img.qt-tempered {
  background:
    radial-gradient(circle at center,
      rgba(178,92,248,1) 0%,
      rgba(178,92,248,1) 30%,
      rgba(140,65,205,0.5) 48%,
      rgba(115,52,170,0.16) 66%,
      transparent 84%),
    rgba(90,70,40,0.08);
  border: 1px solid rgba(135,62,200,0.6);
}

/* ป้ายชนิดเควสอยู่บนกระดาษ — ใช้โทนเข้มให้อ่านออก */
.cl-notice .qt-invest {
  background: rgba(45,85,150,0.14);
  border-color: rgba(45,85,150,0.45);
  color: #2c5f9e;
}
.cl-notice .qt-tempered {
  background: rgba(110,55,160,0.15);
  border-color: rgba(110,55,160,0.5);
  color: #6b2f9c;
}
.cl-warn {
  font-size: 10px;
  color: #ff9955;
}

/* ── Section head ── */
.cl-section-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 2px;
}
.cl-line {
  flex: 1;
  height: 1px;
  background: linear-gradient(to right, transparent, rgba(200,155,60,0.35));
}
.cl-line:last-child {
  background: linear-gradient(to left, transparent, rgba(200,155,60,0.35));
}
.cl-section-label {
  font-size: 10px;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: #7c5a2b;
  white-space: nowrap;
}

/* ── Hunters 2x2 ── */
.cl-hunter-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.cl-hunter {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px;
  border-radius: 10px;
  background: rgba(0,0,0,0.28);
  border: 1px solid rgba(124,90,43,0.35);
  transition: 0.2s;
}
.cl-hunter.me { border-color: rgba(200,155,60,0.6); }
.cl-hunter.ready {
  border-color: rgba(90,210,130,0.55);
  background: rgba(80,180,110,0.1);
}
.cl-hunter-head {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
}
.cl-hunter-icon {
  width: 26px;
  height: 26px;
  object-fit: contain;
  flex-shrink: 0;
}
.cl-hunter-name {
  font-size: 12px;
  font-weight: bold;
  color: #ffd27a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* ไม่ wrap — ให้ชื่อคลาสตัดแทน ไม่งั้น DAY จะตกบรรทัดในช่องแคบ */
.cl-hunter-meta {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
}
.cl-hunter-class {
  font-size: 10px;
  color: #a88040;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cl-day {
  margin-left: auto;
  flex-shrink: 0;
  font-size: 9px;
  letter-spacing: 1px;
  color: #7ab3ff;
  padding: 1px 6px;
  border-radius: 999px;
  background: rgba(60,100,200,0.14);
  border: 1px solid rgba(90,140,230,0.3);
}
.cl-weapon {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}
.cl-weapon-icon {
  width: 16px;
  height: 16px;
  object-fit: contain;
  flex-shrink: 0;
}
.cl-weapon-name {
  font-size: 10px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* rarity บอกด้วยสีชื่ออาวุธ ชุดเดียวกับหน้าบอร์ดห้อง */
.cl-rar-1 { color: #b8b8b8; }
.cl-rar-2 { color: #7fd99a; }
.cl-rar-3 { color: #7ab3ff; }
.cl-rar-4 { color: #cc77ff; }
.cl-weapon-none {
  font-size: 9px;
  color: rgba(124,90,43,0.6);
  font-style: italic;
}
.cl-host-tag {
  font-size: 8px;
  font-weight: bold;
  letter-spacing: 1px;
  padding: 1px 5px;
  border-radius: 3px;
  background: rgba(200,155,60,0.25);
  border: 1px solid rgba(200,155,60,0.5);
  color: #ffd27a;
}
.cl-ready {
  padding: 4px;
  border-radius: 6px;
  text-align: center;
  font-size: 10px;
  font-weight: bold;
  letter-spacing: 1px;
}
.cl-ready.is-ready {
  background: rgba(80,200,120,0.2);
  color: #8fe0aa;
}
.cl-ready.not-ready {
  background: rgba(124,90,43,0.15);
  color: rgba(168,128,64,0.8);
}
.cl-hunter-empty {
  align-items: center;
  justify-content: center;
  min-height: 118px;
  border-style: dashed;
  background: transparent;
}
.cl-empty-text {
  font-size: 10px;
  color: rgba(124,90,43,0.55);
  letter-spacing: 1px;
}

/* ── Status + actions ── */
.cl-status {
  margin: 0;
  text-align: center;
  font-size: 11px;
  color: #a88040;
  letter-spacing: 1px;
}
.cl-status.all-ready { color: #8fe0aa; }
.cl-actions {
  display: flex;
  gap: 8px;
}
.cl-btn-ready {
  flex: 2;
  padding: 13px;
  border-radius: 10px;
  border: 1px solid rgba(90,210,130,0.5);
  background: rgba(80,180,110,0.14);
  color: #8fe0aa;
  font-size: 14px;
  font-weight: bold;
  font-family: inherit;
  letter-spacing: 1px;
  cursor: pointer;
  transition: 0.15s;
}
.cl-btn-ready:hover:not(:disabled) { background: rgba(80,190,115,0.28); }
.cl-btn-ready.active {
  background: rgba(80,200,120,0.3);
  border-color: rgba(110,220,150,0.8);
}
.cl-btn-ready:disabled { opacity: 0.5; cursor: not-allowed; }
.cl-btn-leave {
  flex: 1;
  padding: 13px;
  border-radius: 10px;
  border: 1px solid rgba(180,60,40,0.45);
  background: rgba(180,60,40,0.1);
  color: #e07060;
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  transition: 0.15s;
}
.cl-btn-leave:hover:not(:disabled) { background: rgba(180,60,40,0.25); }
.cl-btn-leave:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
