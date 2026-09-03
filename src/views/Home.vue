<script setup>
import { ref, computed, watch, provide } from 'vue'
import { useRoomStore } from '@/stores/room'
import CraftLookupModal from './components/CraftLookupModal.vue'
import { isFirebaseConnected } from '@/services/firebase'
import { hunter } from '@/stores/hunter'

const room = useRoomStore()

// ── Notification system ───────────────────────────────────
let _notifId = 0
const notifications = ref([])

const addNotif = (message, type = 'info') => {
  const id = ++_notifId
  notifications.value.push({ id, message, type })
  setTimeout(() => {
    notifications.value = notifications.value.filter((n) => n.id !== id)
  }, 4000)
}

provide('addNotif', addNotif)

// Auto-reconnect เมื่อ Firebase reconnect และมี savedRoomCode
// เคสนี้คือ "หลุดจนห้องถูก reset ไปแล้ว" (roomData กลายเป็น null) — ต้อง join ใหม่ทั้งหมด
// ส่วนเคสที่ยังอยู่ในห้อง store จะ re-register presence + bump joinSignal ให้เอง
let _autoReconnecting = false
watch(isFirebaseConnected, async (connected, wasConnected) => {
  if (!connected || wasConnected) return
  if (room.inRoom || !room.savedRoomCode || !hunter.value || _autoReconnecting) return
  _autoReconnecting = true
  try {
    await room.join(room.savedRoomCode, hunter.value)
    addNotif('✅ Reconnect สำเร็จ', 'info')
  } catch {
    addNotif('❌ Auto-reconnect ล้มเหลว กรุณากด Reconnect เอง', 'warn')
  } finally {
    _autoReconnecting = false
  }
})

// แจ้งเตือนสถานะการเชื่อมต่อของ "ตัวเอง" — เดิมผู้เล่นไม่รู้เลยว่าเน็ตตัวเองหลุด
watch(isFirebaseConnected, (connected, wasConnected) => {
  if (!room.inRoom) return
  if (!connected) addNotif('🔌 คุณขาดการเชื่อมต่อ — กำลังเชื่อมต่อใหม่อัตโนมัติ', 'warn')
  else if (wasConnected === false) addNotif('✅ กลับมาเชื่อมต่อแล้ว', 'info')
})

// Overlay: แยกให้ชัดว่าเน็ตตัวเองหลุด หรือ Host หลุด
const selfOffline = computed(() => room.inRoom && !isFirebaseConnected.value)
const hostOffline = computed(() => room.inRoom && isFirebaseConnected.value && !room.hostConnected)

// Watch: ตรวจ connected state ของสมาชิก
const _connectedCache = ref({}) // { hunterId: boolean }
watch(() => room.hunters, (hunters) => {
  if (!room.inRoom) return
  hunters.forEach((h) => {
    if (h.hunter_id === room.myHunterId) return
    const wasConnected = _connectedCache.value[h.hunter_id]
    const isConnected = h.connected !== false
    if (wasConnected === true && !isConnected) {
      addNotif(`🔌 ${h.hunter_name} ขาดการเชื่อมต่อ — รอการกลับมา`, 'warn')
    } else if (wasConnected === false && isConnected) {
      addNotif(`✅ ${h.hunter_name} กลับมาเชื่อมต่อแล้ว`, 'info')
    }
    _connectedCache.value[h.hunter_id] = isConnected
  })
}, { deep: true })

// Watch: ตรวจว่าตัวเองถูก reset (host ลบตี้)
watch(() => room.inRoom, (inRoom, wasInRoom) => {
  if (wasInRoom && !inRoom) {
    addNotif('🔌 ตี้ถูกยุบ หรือคุณถูกเตะออก', 'error')
    _connectedCache.value = {}
  }
  if (inRoom) {
    room.hunters.forEach((h) => {
      _connectedCache.value[h.hunter_id] = h.connected !== false
    })
  }
})

// Watch: Host หลุดการเชื่อมต่อ — แสดงปุ่มออกตี้หลัง 2 นาที
const showLeaveButton = ref(false)
let _leaveButtonTimer = null
watch(
  () => room.inRoom && !room.isHost && !room.hostConnected && isFirebaseConnected.value,
  (hostOffline) => {
    if (hostOffline) {
      _leaveButtonTimer = setTimeout(() => { showLeaveButton.value = true }, 60_000)
    } else {
      clearTimeout(_leaveButtonTimer)
      showLeaveButton.value = false
    }
  }
)

// Party panel
const showPartyPanel = ref(false)
import Quest from './components/Quest.vue'
import State from './components/State.vue'
import Inventory from './components/Inventory.vue'
import Crafting from './components/Crafting.vue'
import Setting from './components/Setting.vue'
import Help from './components/Help.vue'
const menus = [
  { menu: 'Quest',     label: 'Quest',     thumbnail: 'assets/img/menu_topbar_icon/quest.png' },
  { menu: 'State',     label: 'State',     thumbnail: 'assets/img/menu_topbar_icon/hunter.png' },
  { menu: 'Inventory', label: 'Inventory', thumbnail: 'assets/img/menu_topbar_icon/inv.png' },
  { menu: 'Crafting',  label: 'Crafting',  thumbnail: 'assets/img/menu_topbar_icon/craft.png' },
  { menu: 'Setting',   label: 'Setting',   thumbnail: 'assets/img/menu_topbar_icon/setting.png' },
  { menu: 'Help',      label: 'คู่มือ',    text: '?' },
]

const componentMap = { Quest, State, Inventory, Crafting, Setting, Help }
const currentComponent = computed(() => componentMap[activeMenu.value])
const activeMenu = ref('Quest')

const getImg = (path) => `${import.meta.env.BASE_URL}${path}`
</script>

<template>
  <div class="home">

    <!-- ══════════ TOPBAR / NAV ══════════ -->
    <nav class="topbar" role="navigation">
      <div
        v-for="item in menus"
        :key="item.menu"
        class="nav-item"
        :class="{ active: activeMenu === item.menu }"
        @click="activeMenu = item.menu"
        :aria-label="item.menu"
      >
        <div class="nav-icon-wrap">
          <span v-if="item.text" class="nav-icon-text">{{ item.text }}</span>
          <img
            v-else
            :src="getImg(item.thumbnail)"
            class="nav-icon"
            :style="item.white ? 'filter: brightness(0) invert(1)' : ''"
          />
        </div>
        <span class="nav-label">{{ item.label ?? item.menu }}</span>
        <div v-if="activeMenu === item.menu" class="nav-underline"></div>
      </div>

      <button v-if="room.inRoom" class="topbar-party-btn" @click="showPartyPanel = true">
        ⚔ <span class="topbar-party-count">{{ room.hunterCount }}</span>
      </button>

    </nav>

    <!-- ══════════ SECTION TITLE BAR ══════════ -->
    <div class="section-title-bar">
      <div class="stb-line"></div>
      <div class="stb-text">
        <span class="stb-ornament">◆</span>
        <span class="stb-label">{{ activeMenu }}</span>
        <span class="stb-ornament">◆</span>
      </div>
      <div class="stb-line"></div>
    </div>

    <!-- ══════════ CONTENT ══════════ -->
    <div class="content">
      <transition name="fade" mode="out-in">
        <keep-alive include="Quest">
          <component :is="currentComponent" />
        </keep-alive>
      </transition>
    </div>

    <teleport to="body">
      <transition name="notif-slide">
        <div v-if="showPartyPanel" class="party-panel-overlay" @click.self="showPartyPanel = false">
          <div class="party-panel">
            <div class="party-panel-header">
              <span class="party-panel-title">⚔ ตี้</span>
              <span class="party-panel-code">{{ room.roomCode }}</span>
              <button class="party-panel-close" @click="showPartyPanel = false">✕</button>
            </div>

            <div class="party-panel-list">
              <div
                v-for="h in room.hunters"
                :key="h.hunter_id"
                class="party-member"
                :class="{ offline: h.connected === false }"
              >
                <div class="party-member-info">
                  <span class="party-conn-dot" :class="h.connected === false ? 'dot-offline' : 'dot-online'"></span>
                  <span class="party-member-name">{{ h.hunter_name }}</span>
                  <span v-if="h.isHost" class="party-host-badge">HOST</span>
                  <span v-if="h.hunter_id === room.myHunterId" class="party-me-badge">YOU</span>
                  <span v-if="h.connected === false" class="party-offline-label">ขาดการเชื่อมต่อ</span>
                </div>
                <button
                  v-if="room.isHost && h.hunter_id !== room.myHunterId"
                  class="party-kick-btn"
                  @click="room.kick(h.hunter_id)"
                >เตะ</button>
              </div>
            </div>

            <div class="party-panel-actions">
              <button v-if="room.isHost" class="party-btn-disband" @click="room.leave(); showPartyPanel = false">
                🗑 ยุบตี้
              </button>
              <button v-else class="party-btn-leave" @click="room.leave(); showPartyPanel = false">
                🚪 ออกจากตี้
              </button>
            </div>
          </div>
        </div>
      </transition>
    </teleport>

    <!-- ── Craft Lookup Modal ── -->
    <CraftLookupModal />

    <!-- ── Disconnect Overlay ── -->
    <teleport to="body">
      <Transition name="notif-slide">
        <div v-if="selfOffline || hostOffline" class="disconnect-overlay">
          <div class="disconnect-box">
            <div class="disconnect-spinner"></div>
            <p class="disconnect-title">
              {{ selfOffline ? 'คุณขาดการเชื่อมต่อ' : 'Host ขาดการเชื่อมต่อ' }}
            </p>
            <p class="disconnect-sub">
              {{ selfOffline ? 'กำลังเชื่อมต่อใหม่อัตโนมัติ' : 'กำลัง Reconnect...' }}
            </p>
            <button v-if="showLeaveButton" class="disconnect-leave-btn" @click="room.leave()">ออกจากตี้</button>
          </div>
        </div>
      </Transition>
    </teleport>

    <!-- ── Notifications ── -->
    <teleport to="body">
      <div class="notif-container">
        <transition-group name="notif-slide">
          <div
            v-for="n in notifications"
            :key="n.id"
            class="notif-item"
            :class="`notif-${n.type}`"
          >
            {{ n.message }}
          </div>
        </transition-group>
      </div>
    </teleport>
  </div>
</template>

<style scoped>
/* ══════════════════════════════════════════
   BASE
══════════════════════════════════════════ */
.home {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 0;
  font-family: 'Georgia', 'Times New Roman', serif;
}

/* ══════════════════════════════════════════
   TOPBAR
══════════════════════════════════════════ */
.topbar {
  display: flex;
  align-items: stretch;
  gap: 2px;
  padding: 6px 8px;
  border-radius: 12px 12px 0 0;
  background: linear-gradient(to bottom, #1a1208, #0f0c06);
  border: 2px solid #7c5a2b;
  border-bottom: 1px solid #5a3d1f;
  overflow-x: auto;
  scrollbar-width: none;
}

.topbar::-webkit-scrollbar { display: none; }

/* NAV ITEM */
.nav-item {
  flex: 1;
  min-width: 64px;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 6px 6px;
  border-radius: 8px;
  cursor: pointer;
  color: #7c5a2b;
  transition: all 0.2s;
  white-space: nowrap;
}

.nav-item:hover {
  color: #c89b3c;
  background: rgba(255, 200, 100, 0.06);
}


/* ACTIVE */
.nav-item.active {
  color: #ffd27a;
  background: linear-gradient(to bottom, rgba(60, 40, 15, 0.9), rgba(30, 20, 8, 0.8));
  box-shadow: inset 0 0 12px rgba(255, 200, 100, 0.15);
}

/* ICON */
.nav-icon-wrap {
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  transition: 0.2s;
}

.nav-item.active .nav-icon-wrap {
  background: rgba(255, 200, 100, 0.08);
}

.nav-icon {
  width: 26px;
  height: 26px;
  object-fit: contain;
  filter: drop-shadow(0 0 3px rgba(255, 200, 100, 0.3));
  transition: 0.2s;
}

.nav-icon-text {
  font-size: 18px;
  font-weight: bold;
  color: rgba(200,155,60,0.5);
  line-height: 1;
  transition: 0.2s;
}
.nav-item.active .nav-icon-text,
.nav-item:hover .nav-icon-text {
  color: #ffd27a;
  text-shadow: 0 0 8px rgba(255,200,100,0.7);
}

.topbar-party-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  margin-left: auto;
  flex-shrink: 0;
  background: rgba(200,155,60,0.12);
  border: 1px solid rgba(200,155,60,0.35);
  border-radius: 8px;
  color: #ffd27a;
  font-size: 13px;
  font-weight: bold;
  cursor: pointer;
  transition: 0.15s;
}
.topbar-party-btn:hover { background: rgba(200,155,60,0.22); }
.topbar-party-count {
  background: #7cfc00;
  color: #000;
  font-size: 10px;
  font-weight: bold;
  border-radius: 10px;
  padding: 1px 5px;
}

.nav-item.active .nav-icon {
  filter: drop-shadow(0 0 8px rgba(255, 200, 100, 0.7));
}

.nav-item:hover .nav-icon {
  filter: drop-shadow(0 0 5px rgba(255, 200, 100, 0.5));
}

/* LABEL */
.nav-label {
  font-size: 10px;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  transition: 0.2s;
}

.nav-item.active .nav-label {
  color: #ffd27a;
  text-shadow: 0 0 8px rgba(255, 200, 80, 0.5);
}

/* UNDERLINE indicator */
.nav-underline {
  position: absolute;
  bottom: 0;
  left: 20%;
  right: 20%;
  height: 2px;
  border-radius: 2px;
  background: linear-gradient(to right, transparent, #c89b3c, transparent);
  box-shadow: 0 0 6px rgba(200, 155, 60, 0.8);
}

/* ══════════════════════════════════════════
   SECTION TITLE BAR
══════════════════════════════════════════ */
.section-title-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: linear-gradient(to bottom, #0f0c06, #17120c);
  border-left: 2px solid #7c5a2b;
  border-right: 2px solid #7c5a2b;
}

.stb-line {
  flex: 1;
  height: 1px;
  background: linear-gradient(to right, transparent, #5a3d1f);
}

.stb-line:last-child {
  background: linear-gradient(to left, transparent, #5a3d1f);
}

.stb-text {
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}

.stb-label {
  font-size: 11px;
  letter-spacing: 4px;
  text-transform: uppercase;
  color: #a88040;
}

.stb-ornament {
  font-size: 7px;
  color: #7c5a2b;
}

/* ══════════════════════════════════════════
   CONTENT
══════════════════════════════════════════ */
.content {
  padding: 20px 4px 4px;
  min-height: 200px;
}

/* ══════════════════════════════════════════
   TRANSITIONS
══════════════════════════════════════════ */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.18s, transform 0.18s;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(6px);
}

/* ══════════════════════════════════════════
   RESPONSIVE — iPad (≤768px)
══════════════════════════════════════════ */
@media (max-width: 768px) {
  .topbar {
    padding: 4px 6px;
    gap: 1px;
    border-radius: 10px 10px 0 0;
  }

  .nav-item {
    min-width: 52px;
    padding: 7px 4px 5px;
    gap: 3px;
  }

  .nav-icon {
    width: 22px;
    height: 22px;
  }

  .nav-label {
    font-size: 9px;
    letter-spacing: 0;
  }

  .content {
    padding: 16px 2px 2px;
  }
}

/* ══════════════════════════════════════════
   RESPONSIVE — Phone (≤480px)
══════════════════════════════════════════ */
@media (max-width: 480px) {
  .topbar {
    padding: 4px;
    gap: 0;
  }

  .nav-item {
    flex: 1;
    min-width: 0;
    padding: 6px 2px 4px;
    gap: 3px;
  }

  .nav-icon-wrap {
    width: 28px;
    height: 28px;
  }

  .nav-icon {
    width: 20px;
    height: 20px;
  }

  .nav-label {
    font-size: 8px;
    letter-spacing: 0;
  }

  .section-title-bar {
    padding: 6px 8px;
  }

  .stb-label {
    font-size: 10px;
    letter-spacing: 2px;
  }

  .content {
    padding: 12px 0 0;
  }
}
</style>

<style>
/* ── Party Panel ── */
.party-panel-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.6);
  backdrop-filter: blur(6px);
  z-index: 600;
  display: flex;
  align-items: flex-end;
  justify-content: flex-start;
  padding: 16px;
}
.party-panel {
  background: linear-gradient(160deg, #1c1508, #13100a);
  border: 2px solid #7c5a2b;
  border-radius: 14px;
  width: min(340px, 100%);
  overflow: hidden;
  box-shadow: 0 0 40px rgba(0,0,0,0.8);
  margin-bottom: 70px;
}
.party-panel-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: rgba(200,155,60,0.06);
  border-bottom: 1px solid rgba(124,90,43,0.4);
}
.party-panel-title { font-size: 14px; font-weight: bold; color: #ffd27a; flex: 1; }
.party-panel-code {
  font-size: 13px;
  font-family: monospace;
  letter-spacing: 3px;
  color: #c89b3c;
}
.party-panel-close {
  background: none;
  border: none;
  color: #7c5a2b;
  font-size: 16px;
  cursor: pointer;
  padding: 2px 6px;
  transition: color 0.15s;
}
.party-panel-close:hover { color: #ffd27a; }

.party-panel-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 14px;
}
.party-member {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(200,155,60,0.05);
  border: 1px solid rgba(124,90,43,0.3);
  transition: opacity 0.3s;
}
.party-member.offline { opacity: 0.6; }
.party-member-info { display: flex; align-items: center; gap: 7px; flex: 1; }
.party-conn-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.dot-online  { background: #7cfc00; box-shadow: 0 0 6px #7cfc00; }
.dot-offline { background: #ff6b6b; animation: blink 1.2s ease-in-out infinite; }
@keyframes blink {
  0%,100% { opacity: 1; }
  50%      { opacity: 0.3; }
}
.party-member-name { font-size: 13px; color: #ffd27a; }
.party-host-badge, .party-me-badge {
  font-size: 9px;
  letter-spacing: 1px;
  border-radius: 3px;
  padding: 1px 5px;
}
.party-host-badge { color: #ffd27a; background: rgba(200,155,60,0.15); border: 1px solid rgba(200,155,60,0.35); }
.party-me-badge   { color: #7ab3ff; background: rgba(60,100,200,0.15); border: 1px solid rgba(60,100,200,0.3); }
.party-offline-label { font-size: 10px; color: #ff6b6b; margin-left: 2px; }
.party-kick-btn {
  font-size: 11px;
  padding: 3px 10px;
  border-radius: 4px;
  border: 1px solid rgba(180,60,60,0.4);
  background: rgba(180,60,60,0.08);
  color: #ff6b6b;
  cursor: pointer;
  font-family: inherit;
  transition: 0.15s;
}
.party-kick-btn:hover { background: rgba(180,60,60,0.2); }

.party-panel-actions {
  padding: 10px 14px 14px;
  border-top: 1px solid rgba(124,90,43,0.25);
}
.party-btn-disband, .party-btn-leave {
  width: 100%;
  padding: 10px;
  border-radius: 8px;
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  transition: 0.2s;
}
.party-btn-disband {
  background: rgba(180,60,60,0.08);
  border: 1px solid rgba(180,60,60,0.4);
  color: #ff6b6b;
}
.party-btn-disband:hover { background: rgba(180,60,60,0.18); }
.party-btn-leave {
  background: rgba(124,90,43,0.08);
  border: 1px solid rgba(124,90,43,0.35);
  color: #a88040;
}
.party-btn-leave:hover { background: rgba(124,90,43,0.18); }

.disconnect-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.75);
  backdrop-filter: blur(8px);
  z-index: 800;
  display: flex;
  align-items: center;
  justify-content: center;
}
.disconnect-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 32px 40px;
  background: linear-gradient(160deg, #1c1508, #13100a);
  border: 2px solid rgba(200,155,60,0.5);
  border-radius: 16px;
  box-shadow: 0 0 40px rgba(0,0,0,0.8);
}
.disconnect-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid rgba(200,155,60,0.2);
  border-top-color: #c89b3c;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.disconnect-title {
  font-size: 16px;
  font-weight: bold;
  color: #ffd27a;
  margin: 0;
  letter-spacing: 2px;
}
.disconnect-sub {
  font-size: 12px;
  color: #a88040;
  margin: 0;
  letter-spacing: 1px;
}
.disconnect-leave-btn {
  margin-top: 8px;
  padding: 8px 24px;
  background: rgba(180,60,40,0.15);
  border: 1px solid rgba(200,80,60,0.5);
  border-radius: 8px;
  color: #ff8070;
  font-size: 13px;
  letter-spacing: 1px;
  cursor: pointer;
}
.disconnect-leave-btn:hover { background: rgba(180,60,40,0.3); }

.notif-container {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
}
.notif-item {
  padding: 10px 16px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: bold;
  letter-spacing: 0.5px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.5);
  max-width: 280px;
  pointer-events: auto;
}
.notif-info {
  background: rgba(30, 22, 8, 0.95);
  border: 1px solid rgba(200,155,60,0.5);
  color: #ffd27a;
}
.notif-warn {
  background: rgba(60, 30, 0, 0.95);
  border: 1px solid rgba(255,150,0,0.6);
  color: #ffb347;
}
.notif-error {
  background: rgba(50, 0, 0, 0.95);
  border: 1px solid rgba(255,60,60,0.6);
  color: #ff6b6b;
}
.notif-slide-enter-active { transition: all 0.3s cubic-bezier(0.2,0,0,1); }
.notif-slide-leave-active  { transition: all 0.25s ease-in; }
.notif-slide-enter-from    { opacity: 0; transform: translateX(60px); }
.notif-slide-leave-to      { opacity: 0; transform: translateX(60px); }
</style>
