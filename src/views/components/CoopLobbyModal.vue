<script setup>
import { ref, watch } from 'vue'
import { useRoomStore } from '@/stores/room'
import hunterClassData from '@/assets/files/class_hunter.json'

const props = defineProps({ show: Boolean })
const emit = defineEmits(['start', 'leave'])

const room = useRoomStore()
const getImg = (path) => `${import.meta.env.BASE_URL}${path}`
const getClass = (id) => hunterClassData.find((c) => c.hunter_class_id === id)

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
    counting.value = false
    countdownMsg.value = ''
    emit('start')
  }, 4000)
}

// Host: when allReady → push questStartAt to Firebase
watch(() => room.allReady, (ready) => {
  if (ready && props.show && room.isHost) {
    room.triggerQuestStart()
  }
})

// Watch questStartAt (for guests — host triggers, guests follow)
watch(() => room.questStartAt, (val) => {
  if (val && props.show && !counting.value) startCountdown()
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
</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="cml-overlay">
      <div class="cml-panel">

        <!-- Header -->
        <div class="cml-header">
          <span class="cml-title">⚔ Co-op Lobby</span>
          <div class="cml-code-wrap" @click="copyCode" title="คลิกเพื่อคัดลอก">
            <span class="cml-code-label">{{ copied ? '✓ Copied!' : 'Room Code (กดเพื่อคัดลอก)' }}</span>
            <span class="cml-code" :class="{ copied }">{{ room.roomCode }}</span>
          </div>
        </div>

        <!-- Quest Info -->
        <div v-if="room.questInfo" class="cml-quest-info">
          <img
            v-if="room.questInfo.thumbnail"
            :src="getImg(room.questInfo.thumbnail)"
            class="cml-quest-monster-img"
          />
          <div class="cml-quest-detail">
            <span class="cml-quest-name">{{ room.questInfo.monster_name }}</span>
            <div class="cml-quest-meta">
              <span class="cml-quest-type">{{ room.questInfo.quest_type }}</span>
              <span class="cml-quest-stars">
                <span v-for="i in room.questInfo.difficulty_level" :key="i">★</span>
              </span>
            </div>
          </div>
        </div>

        <!-- Countdown overlay -->
        <Transition name="cml-fade">
          <div v-if="counting" class="cml-countdown">
            <p class="cml-countdown-text">{{ countdownMsg }}</p>
          </div>
        </Transition>

        <!-- Hunter list -->
        <div class="cml-hunters">
          <div
            v-for="h in room.hunters"
            :key="h.hunter_id"
            class="cml-hunter-card"
            :class="{ ready: h.ready, 'is-me': h.hunter_id === room.myHunterId }"
          >
            <div class="cml-hunter-left">
              <img
                v-if="getClass(h.hunter_class_id)?.thumbnail"
                :src="getImg(getClass(h.hunter_class_id).thumbnail)"
                class="cml-hunter-icon"
              />
              <div class="cml-hunter-info">
                <span class="cml-hunter-name">{{ h.hunter_name }}</span>
                <span class="cml-hunter-class">{{ getClass(h.hunter_class_id)?.hunter_class }}</span>
              </div>
            </div>
            <div class="cml-hunter-right">
              <span v-if="h.isHost" class="cml-badge host">HOST</span>
              <span class="cml-ready-badge" :class="h.ready ? 'ready' : 'not-ready'">
                {{ h.ready ? '✓ Ready' : 'Not Ready' }}
              </span>
            </div>
          </div>

          <!-- Empty slots -->
          <div v-for="i in (4 - room.hunterCount)" :key="`e${i}`" class="cml-hunter-card empty">
            <span class="cml-empty">รอ Hunter เข้าร่วม...</span>
          </div>
        </div>

        <!-- Status text -->
        <p class="cml-status">
          <span v-if="room.allReady">✦ ทุกคน Ready แล้ว!</span>
          <span v-else>รอ Hunter กด Ready ({{ room.hunters.filter(h => h.ready).length }}/{{ room.hunterCount }})</span>
        </p>

        <!-- Actions -->
        <div class="cml-actions">
          <button
            class="cml-btn-ready"
            :class="{ active: room.amReady }"
            @click="handleReady"
            :disabled="counting"
          >
            {{ room.amReady ? '✓ Ready!' : 'Ready' }}
          </button>
          <button class="cml-btn-leave" @click="handleLeave" :disabled="counting">
            {{ room.isHost ? 'ยุบ Room' : 'ออก' }}
          </button>
        </div>

      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.cml-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.75);
  backdrop-filter: blur(8px);
  z-index: 300;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.cml-panel {
  background: linear-gradient(160deg, #1c1508, #13100a, #1c1508);
  border: 2px solid #7c5a2b;
  border-radius: 16px;
  width: min(440px, 100%);
  overflow: hidden;
  position: relative;
  box-shadow: 0 0 40px rgba(0,0,0,0.8), 0 0 20px rgba(200,155,60,0.1);
}

.cml-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid rgba(124,90,43,0.4);
  background: rgba(200,155,60,0.05);
}

.cml-title {
  font-size: 15px;
  font-weight: bold;
  color: #ffd27a;
  letter-spacing: 2px;
}

.cml-code-wrap {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 1px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  transition: background 0.15s;
}
.cml-code-wrap:hover { background: rgba(200,155,60,0.08); }

.cml-code-label {
  font-size: 9px;
  color: #7c5a2b;
  letter-spacing: 2px;
  text-transform: uppercase;
  transition: color 0.2s;
}
.cml-code {
  font-size: 20px;
  font-weight: bold;
  font-family: monospace;
  color: #ffd27a;
  letter-spacing: 4px;
  text-shadow: 0 0 10px rgba(255,210,122,0.4);
  transition: color 0.2s;
}
.cml-code.copied {
  color: #7cfc00;
  text-shadow: 0 0 10px rgba(100,255,100,0.5);
}

/* Quest Info */
.cml-quest-info {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0 20px;
  padding: 12px 14px;
  border-radius: 10px;
  background: rgba(0,0,0,0.3);
  border: 1px solid rgba(124,90,43,0.3);
}
.cml-quest-monster-img {
  width: 56px;
  height: 56px;
  object-fit: contain;
  filter: drop-shadow(0 0 8px rgba(200,155,60,0.3));
}
.cml-quest-detail {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.cml-quest-name {
  font-size: 15px;
  font-weight: bold;
  color: #ffd27a;
}
.cml-quest-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}
.cml-quest-type {
  font-size: 10px;
  letter-spacing: 2px;
  color: #a88040;
  text-transform: uppercase;
  background: rgba(200,155,60,0.1);
  border: 1px solid rgba(200,155,60,0.25);
  border-radius: 4px;
  padding: 2px 6px;
}
.cml-quest-stars {
  color: #f5c518;
  font-size: 13px;
  letter-spacing: 1px;
}

/* Countdown overlay */
.cml-countdown {
  position: absolute;
  inset: 0;
  background: rgba(8,6,2,0.92);
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
}
.cml-countdown-text {
  font-size: 24px;
  font-weight: bold;
  color: #ffd27a;
  letter-spacing: 3px;
  text-align: center;
  text-shadow: 0 0 20px rgba(255,210,122,0.8);
  animation: cml-pulse 1.2s ease-in-out infinite;
}
@keyframes cml-pulse {
  0%,100% { transform: scale(1); opacity: 1; }
  50%      { transform: scale(1.04); opacity: 0.8; }
}

.cml-fade-enter-active { transition: opacity 0.3s; }
.cml-fade-leave-active { transition: opacity 0.3s; }
.cml-fade-enter-from, .cml-fade-leave-to { opacity: 0; }

/* Hunter list */
.cml-hunters {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px 20px;
}

.cml-hunter-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-radius: 8px;
  background: rgba(200,155,60,0.05);
  border: 1px solid rgba(124,90,43,0.3);
  transition: border-color 0.3s, background 0.3s;
}
.cml-hunter-card.ready {
  border-color: rgba(100,220,100,0.5);
  background: rgba(60,180,60,0.08);
}
.cml-hunter-card.is-me {
  border-color: rgba(200,155,60,0.6);
}
.cml-hunter-card.empty {
  justify-content: center;
  border-style: dashed;
  border-color: rgba(124,90,43,0.2);
  background: transparent;
}
.cml-empty {
  font-size: 11px;
  color: rgba(124,90,43,0.35);
  letter-spacing: 2px;
}

.cml-hunter-left {
  display: flex;
  align-items: center;
  gap: 10px;
}
.cml-hunter-icon {
  width: 36px;
  height: 36px;
  object-fit: contain;
}
.cml-hunter-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.cml-hunter-name {
  font-size: 14px;
  font-weight: bold;
  color: #ffd27a;
}
.cml-hunter-class {
  font-size: 11px;
  color: #a88040;
}

.cml-hunter-right {
  display: flex;
  align-items: center;
  gap: 6px;
}
.cml-badge.host {
  font-size: 9px;
  letter-spacing: 2px;
  color: #ffd27a;
  background: rgba(200,155,60,0.15);
  border: 1px solid rgba(200,155,60,0.35);
  border-radius: 4px;
  padding: 2px 6px;
}
.cml-ready-badge {
  font-size: 11px;
  font-weight: bold;
  border-radius: 4px;
  padding: 3px 8px;
  letter-spacing: 1px;
  transition: 0.3s;
}
.cml-ready-badge.ready {
  color: #7cfc00;
  background: rgba(60,180,60,0.15);
  border: 1px solid rgba(60,180,60,0.4);
}
.cml-ready-badge.not-ready {
  color: #7c5a2b;
  background: rgba(0,0,0,0.2);
  border: 1px solid rgba(124,90,43,0.25);
}

/* Status */
.cml-status {
  text-align: center;
  font-size: 12px;
  color: #a88040;
  margin: 0;
  padding: 0 20px 12px;
  letter-spacing: 1px;
}

/* Actions */
.cml-actions {
  display: flex;
  gap: 10px;
  padding: 0 20px 20px;
}

.cml-btn-ready {
  flex: 1;
  padding: 14px;
  border-radius: 8px;
  border: 2px solid rgba(124,90,43,0.5);
  background: rgba(0,0,0,0.2);
  color: #7c5a2b;
  font-size: 15px;
  font-weight: bold;
  cursor: pointer;
  font-family: inherit;
  letter-spacing: 2px;
  transition: 0.2s;
}
.cml-btn-ready.active {
  border-color: #7cfc00;
  background: rgba(60,180,60,0.15);
  color: #7cfc00;
  box-shadow: 0 0 16px rgba(100,255,100,0.3);
}
.cml-btn-ready:hover:not(:disabled):not(.active) {
  border-color: #c89b3c;
  color: #ffd27a;
}
.cml-btn-ready:disabled { opacity: 0.4; cursor: not-allowed; }

.cml-btn-leave {
  padding: 14px 18px;
  border-radius: 8px;
  border: 1px solid rgba(180,60,60,0.35);
  background: rgba(180,60,60,0.08);
  color: #ff6b6b;
  font-size: 13px;
  cursor: pointer;
  font-family: inherit;
  transition: 0.2s;
}
.cml-btn-leave:hover:not(:disabled) { background: rgba(180,60,60,0.18); }
.cml-btn-leave:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
