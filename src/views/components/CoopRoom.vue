<script setup>
import { ref } from 'vue'
import { useRoomStore } from '@/stores/room'
import { hunter } from '@/stores/hunter'
import hunterClassData from '@/assets/files/class_hunter.json'

const room = useRoomStore()
const emit = defineEmits(['close'])

const view = ref(room.inRoom ? 'lobby' : 'entry') // 'entry' | 'join' | 'lobby'
const joinCode = ref('')
const error = ref('')
const loading = ref(false)

const getImg = (path) => `${import.meta.env.BASE_URL}${path}`

const getClass = (id) => hunterClassData.find((c) => c.hunter_class_id === id)

const handleCreate = async () => {
  if (!hunter.value) return
  loading.value = true
  error.value = ''
  try {
    await room.create(hunter.value)
    view.value = 'lobby'
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

const handleJoin = async () => {
  if (!hunter.value || !joinCode.value.trim()) return
  loading.value = true
  error.value = ''
  try {
    await room.join(joinCode.value.trim().toUpperCase(), hunter.value)
    view.value = 'lobby'
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

const handleLeave = async () => {
  await room.leave()
  view.value = 'entry'
  joinCode.value = ''
}

const copyCode = () => {
  navigator.clipboard.writeText(room.roomCode)
}
</script>

<template>
  <div class="coop-overlay" @click.self="emit('close')">
    <div class="coop-panel">

      <!-- Header -->
      <div class="coop-header">
        <span class="coop-title">⚔ Co-op Hunt</span>
        <button class="coop-close" @click="emit('close')">✕</button>
      </div>

      <!-- ── ENTRY VIEW ── -->
      <div v-if="view === 'entry'" class="coop-body">
        <p class="coop-desc">ล่าร่วมกับ Hunter คนอื่น สูงสุด 4 คน</p>
        <div class="coop-entry-btns">
          <button class="coop-btn-create" @click="handleCreate" :disabled="loading">
            <span>🏠</span>
            <span>สร้าง Room</span>
            <span class="coop-btn-sub">คุณเป็น Host</span>
          </button>
          <button class="coop-btn-join" @click="view = 'join'" :disabled="loading">
            <span>🚪</span>
            <span>เข้าร่วม Room</span>
            <span class="coop-btn-sub">กรอก Room Code</span>
          </button>
        </div>
        <p v-if="error" class="coop-error">{{ error }}</p>
      </div>

      <!-- ── JOIN VIEW ── -->
      <div v-else-if="view === 'join'" class="coop-body">
        <button class="coop-back" @click="view = 'entry'">← กลับ</button>
        <p class="coop-label">กรอก Room Code</p>
        <input
          v-model="joinCode"
          class="coop-code-input"
          maxlength="6"
          placeholder="ABC123"
          @keyup.enter="handleJoin"
        />
        <button class="coop-btn-primary" @click="handleJoin" :disabled="loading || joinCode.length < 6">
          {{ loading ? 'กำลังเข้าร่วม...' : 'เข้าร่วม' }}
        </button>
        <p v-if="error" class="coop-error">{{ error }}</p>
      </div>

      <!-- ── LOBBY VIEW ── -->
      <div v-else-if="view === 'lobby'" class="coop-body">

        <!-- Room Code -->
        <div class="coop-room-code-wrap">
          <span class="coop-room-label">Room Code</span>
          <div class="coop-room-code" @click="copyCode" title="คลิกเพื่อคัดลอก">
            <span v-for="char in room.roomCode" :key="char" class="coop-code-char">{{ char }}</span>
          </div>
          <span class="coop-copy-hint">คลิกเพื่อคัดลอก</span>
        </div>

        <!-- Hunter List -->
        <div class="coop-hunter-list">
          <p class="coop-label">Hunters ({{ room.hunterCount }}/4)</p>
          <div
            v-for="h in room.hunters"
            :key="h.hunter_id"
            class="coop-hunter-card"
            :class="{ 'is-me': h.hunter_id === room.myHunterId }"
          >
            <img
              v-if="getClass(h.hunter_class_id)?.thumbnail"
              :src="getImg(getClass(h.hunter_class_id).thumbnail)"
              class="coop-hunter-icon"
            />
            <div class="coop-hunter-info">
              <span class="coop-hunter-name">{{ h.hunter_name }}</span>
              <span class="coop-hunter-class">{{ getClass(h.hunter_class_id)?.hunter_class }}</span>
            </div>
            <span v-if="h.isHost" class="coop-host-badge">HOST</span>
            <span v-if="h.hunter_id === room.myHunterId" class="coop-me-badge">YOU</span>
          </div>

          <!-- Empty slots -->
          <div v-for="i in (4 - room.hunterCount)" :key="`empty-${i}`" class="coop-hunter-card empty">
            <span class="coop-empty-slot">รอ Hunter เข้าร่วม...</span>
          </div>
        </div>

        <button class="coop-btn-leave" @click="handleLeave">
          {{ room.isHost ? '🗑 ยุบ Room' : '🚪 ออกจาก Room' }}
        </button>
      </div>

    </div>
  </div>
</template>

<style scoped>
.coop-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(6px);
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.coop-panel {
  background: linear-gradient(160deg, #1c1508, #13100a, #1c1508);
  border: 2px solid #7c5a2b;
  border-radius: 16px;
  width: min(420px, 100%);
  box-shadow: 0 0 40px rgba(0,0,0,0.8), 0 0 20px rgba(200,155,60,0.1);
  overflow: hidden;
}

.coop-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(124,90,43,0.4);
  background: rgba(200,155,60,0.06);
}

.coop-title {
  font-size: 16px;
  font-weight: bold;
  color: #ffd27a;
  letter-spacing: 2px;
}

.coop-close {
  background: none;
  border: none;
  color: #7c5a2b;
  font-size: 18px;
  cursor: pointer;
  padding: 4px 8px;
  transition: color 0.15s;
}
.coop-close:hover { color: #ffd27a; }

.coop-body {
  padding: 24px 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.coop-desc {
  text-align: center;
  font-size: 13px;
  color: #a88040;
  margin: 0;
}

/* Entry buttons */
.coop-entry-btns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.coop-btn-create, .coop-btn-join {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 20px 12px;
  border-radius: 10px;
  cursor: pointer;
  transition: 0.2s;
  font-family: inherit;
  font-size: 14px;
  font-weight: bold;
  letter-spacing: 1px;
}

.coop-btn-create {
  background: rgba(60,155,60,0.1);
  border: 2px solid rgba(60,155,60,0.4);
  color: #7cfc00;
}
.coop-btn-create:hover { background: rgba(60,155,60,0.2); transform: translateY(-2px); }

.coop-btn-join {
  background: rgba(60,100,200,0.1);
  border: 2px solid rgba(60,100,200,0.4);
  color: #7ab3ff;
}
.coop-btn-join:hover { background: rgba(60,100,200,0.2); transform: translateY(-2px); }

.coop-btn-sub {
  font-size: 10px;
  opacity: 0.6;
  font-weight: normal;
  letter-spacing: 0;
}

/* Join view */
.coop-back {
  background: none;
  border: none;
  color: #7c5a2b;
  cursor: pointer;
  font-size: 13px;
  padding: 0;
  text-align: left;
  font-family: inherit;
  transition: color 0.15s;
}
.coop-back:hover { color: #c89b3c; }

.coop-label {
  font-size: 11px;
  letter-spacing: 3px;
  color: #7c5a2b;
  text-transform: uppercase;
  margin: 0;
}

.coop-code-input {
  background: rgba(0,0,0,0.4);
  border: 2px solid rgba(124,90,43,0.5);
  border-radius: 8px;
  color: #ffd27a;
  font-size: 28px;
  font-weight: bold;
  letter-spacing: 10px;
  text-align: center;
  padding: 12px;
  font-family: monospace;
  width: 100%;
  text-transform: uppercase;
  transition: border-color 0.2s;
}
.coop-code-input:focus {
  outline: none;
  border-color: #c89b3c;
}

.coop-btn-primary {
  padding: 14px;
  border-radius: 8px;
  border: 2px solid #c89b3c;
  background: rgba(200,155,60,0.12);
  color: #ffd27a;
  font-size: 14px;
  font-weight: bold;
  cursor: pointer;
  font-family: inherit;
  letter-spacing: 1px;
  transition: 0.2s;
}
.coop-btn-primary:hover:not(:disabled) { background: rgba(200,155,60,0.25); }
.coop-btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }

/* Room code display */
.coop-room-code-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.coop-room-code {
  display: flex;
  gap: 6px;
  cursor: pointer;
  padding: 10px 16px;
  border-radius: 10px;
  background: rgba(0,0,0,0.4);
  border: 2px solid rgba(200,155,60,0.4);
  transition: border-color 0.2s;
}
.coop-room-code:hover { border-color: #c89b3c; }

.coop-code-char {
  font-size: 28px;
  font-weight: bold;
  font-family: monospace;
  color: #ffd27a;
  text-shadow: 0 0 10px rgba(255,210,122,0.5);
  letter-spacing: 2px;
}

.coop-copy-hint {
  font-size: 10px;
  color: rgba(124,90,43,0.6);
  letter-spacing: 2px;
}

/* Hunter list */
.coop-hunter-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.coop-hunter-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(200,155,60,0.06);
  border: 1px solid rgba(124,90,43,0.35);
}
.coop-hunter-card.is-me {
  border-color: rgba(200,155,60,0.6);
  background: rgba(200,155,60,0.1);
}
.coop-hunter-card.empty {
  background: rgba(0,0,0,0.2);
  border: 1px dashed rgba(124,90,43,0.25);
  justify-content: center;
}

.coop-empty-slot {
  font-size: 11px;
  color: rgba(124,90,43,0.4);
  letter-spacing: 2px;
}

.coop-hunter-icon {
  width: 36px;
  height: 36px;
  object-fit: contain;
}

.coop-hunter-info {
  display: flex;
  flex-direction: column;
  flex: 1;
  gap: 2px;
}

.coop-hunter-name {
  font-size: 14px;
  font-weight: bold;
  color: #ffd27a;
}

.coop-hunter-class {
  font-size: 11px;
  color: #a88040;
  letter-spacing: 1px;
}

.coop-host-badge {
  font-size: 9px;
  letter-spacing: 2px;
  color: #ffd27a;
  background: rgba(200,155,60,0.2);
  border: 1px solid rgba(200,155,60,0.4);
  border-radius: 4px;
  padding: 2px 6px;
}

.coop-me-badge {
  font-size: 9px;
  letter-spacing: 2px;
  color: #7ab3ff;
  background: rgba(60,100,200,0.15);
  border: 1px solid rgba(60,100,200,0.35);
  border-radius: 4px;
  padding: 2px 6px;
}

.coop-btn-leave {
  padding: 12px;
  border-radius: 8px;
  border: 1px solid rgba(180,60,60,0.4);
  background: rgba(180,60,60,0.08);
  color: #ff6b6b;
  font-size: 13px;
  cursor: pointer;
  font-family: inherit;
  letter-spacing: 1px;
  transition: 0.2s;
}
.coop-btn-leave:hover { background: rgba(180,60,60,0.18); }

.coop-error {
  text-align: center;
  font-size: 12px;
  color: #ff6b6b;
  margin: 0;
  padding: 8px;
  border-radius: 6px;
  background: rgba(180,60,60,0.1);
  border: 1px solid rgba(180,60,60,0.3);
}
</style>
