<script setup>
import { useRoute } from 'vue-router'
import { computed, onMounted, watch } from 'vue'
import { hunter, loadHunter } from '@/stores/hunter'
import {
  craftNotifications,
  dismissNotification,
  checkCraftability,
  initCraftability,
} from '@/stores/craftingWhitelist'

const route = useRoute()
const isHomePage = computed(() => route.path === '/')
const getImg = (path) => `${import.meta.env.BASE_URL}${path}`

let craftabilityReady = false

onMounted(() => {
  loadHunter()
  if (hunter.value) {
    initCraftability(hunter.value)
    craftabilityReady = true
  }
})

watch(hunter, (val) => {
  if (!val) return
  if (!craftabilityReady) {
    initCraftability(val)
    craftabilityReady = true
    return
  }
  checkCraftability(val)
})
const logo = `${import.meta.env.BASE_URL}assets/img/UI/icon.jpg`
</script>

<template>
  <div class="app-wrapper">
    <!-- LOGO + TITLE HEADER -->
    <div class="app-header" :class="{ compact: !isHomePage }">
      <div class="logo-frame">
        <img :src="logo" id="logo" :class="{ small: !isHomePage }" />
      </div>
      <div v-if="isHomePage" class="app-title-block">
        <div class="title-ornament">✦ ✦ ✦</div>
        <h1 class="app-title">Monster Hunter World</h1>
        <p class="app-subtitle">Board Game Companion</p>
        <div class="title-ornament">✦ ✦ ✦</div>
      </div>
    </div>

    <!-- CONTENT -->
    <div class="content-panel">
      <router-view />
    </div>

    <!-- CRAFT NOTIFICATIONS -->
    <teleport to="body">
      <div class="craft-notif-wrapper">
        <transition-group name="notif" tag="div" class="craft-notif-list">
          <div
            v-for="notif in craftNotifications"
            :key="notif.id"
            class="craft-notif-toast"
            :class="[`notif-${notif.type}`, { 'notif-progress': notif.notifType === 'progress' }]"
            @click="dismissNotification(notif.id)"
          >
            <!-- Header row -->
            <div class="cn-header">
              <div class="cn-icon-wrap">
                <img :src="getImg(notif.thumbnail)" class="cn-thumbnail" />
                <span class="cn-forge">{{ notif.notifType === 'craftable' ? '🔨' : '📦' }}</span>
              </div>
              <div class="cn-body">
                <span class="cn-label">
                  {{ notif.notifType === 'craftable' ? 'สามารถ Craft ได้แล้ว!' : 'วัตถุดิบใหม่!' }}
                </span>
                <span class="cn-name">{{ notif.name }}</span>
                <span class="cn-type">{{ notif.type === 'weapon' ? '⚔ Weapon' : '🛡 Armor' }}</span>
              </div>
              <button class="cn-dismiss" @click="dismissNotification(notif.id)">✕</button>
            </div>

            <!-- Materials table (progress only) -->
            <div v-if="notif.notifType === 'progress'" class="cn-mat-table">
              <div
                v-for="mat in notif.materials"
                :key="`${mat.resource_type_id}_${mat.item_id}`"
                class="cn-mat-row"
              >
                <img :src="getImg(mat.thumbnail)" class="cn-mat-img" />
                <span class="cn-mat-name">{{ mat.item }}</span>
                <span class="cn-mat-count" :class="{ 'cn-mat-ok': mat.current >= mat.required }">
                  {{ mat.current }}<span class="cn-mat-sep">/</span>{{ mat.required }}
                  <span v-if="mat.current >= mat.required" class="cn-mat-check">✓</span>
                </span>
              </div>
            </div>

            <div class="cn-progress" :class="{ 'cn-progress-slow': notif.notifType === 'progress' }"></div>
          </div>
        </transition-group>
      </div>
    </teleport>

    <!-- FOOTER -->
    <div class="app-footer">
      <span class="footer-text">Hunter's Guild Board Game Companion</span>
    </div>
  </div>
</template>

<style scoped>
/* ══════════════════════════════════════════
   GLOBAL WRAPPER
══════════════════════════════════════════ */
.app-wrapper {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 24px 12px 16px;
  gap: 0;
  font-family: 'Georgia', 'Times New Roman', serif;
}

/* ══════════════════════════════════════════
   HEADER
══════════════════════════════════════════ */
.app-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
  transition: all 0.3s;
}

.app-header.compact {
  flex-direction: row;
  gap: 14px;
  margin-bottom: 14px;
}

/* LOGO FRAME */
.logo-frame {
  position: relative;
  display: inline-flex;
}

.logo-frame::before {
  content: '';
  position: absolute;
  inset: -4px;
  border-radius: 50%;
  background: conic-gradient(
    #c89b3c 0deg, #ffd27a 60deg, #c89b3c 120deg,
    #7c5a2b 180deg, #c89b3c 240deg, #ffd27a 300deg, #c89b3c 360deg
  );
  opacity: 0.7;
  z-index: 0;
}

#logo {
  position: relative;
  z-index: 1;
  width: 130px;
  height: 130px;
  object-fit: cover;
  border-radius: 50%;
  border: 3px solid #7c5a2b;
  box-shadow:
    0 0 20px rgba(255, 200, 100, 0.5),
    0 0 40px rgba(255, 150, 50, 0.2),
    inset 0 0 10px rgba(255, 200, 100, 0.2);
  transition: all 0.3s;
}

#logo.small {
  width: 56px;
  height: 56px;
}

/* TITLE BLOCK */
.app-title-block {
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.app-title {
  margin: 0;
  font-size: 28px;
  color: #ffd27a;
  letter-spacing: 3px;
  text-transform: uppercase;
  text-shadow:
    0 0 20px rgba(255, 200, 80, 0.6),
    0 2px 6px rgba(0,0,0,0.9);
}

.app-subtitle {
  margin: 0;
  font-size: 12px;
  color: #a88040;
  letter-spacing: 5px;
  text-transform: uppercase;
}

.title-ornament {
  color: #7c5a2b;
  font-size: 10px;
  letter-spacing: 8px;
}

/* ══════════════════════════════════════════
   CONTENT PANEL
══════════════════════════════════════════ */
.content-panel {
  width: min(1200px, 96%);
  padding: 28px;
  border-radius: 16px;
  background: rgba(16, 12, 8, 0.82);
  border: 2px solid #7c5a2b;
  box-shadow:
    0 0 30px rgba(0, 0, 0, 0.9),
    0 0 60px rgba(0, 0, 0, 0.5),
    inset 0 0 20px rgba(255, 200, 100, 0.06);
  backdrop-filter: blur(8px);
  position: relative;
  overflow: hidden;
}

/* Corner ornaments */
.content-panel::before,
.content-panel::after {
  content: '◆';
  position: absolute;
  color: #7c5a2b;
  font-size: 12px;
  opacity: 0.6;
}
.content-panel::before { top: 8px; left: 10px; }
.content-panel::after  { bottom: 8px; right: 10px; }

/* ══════════════════════════════════════════
   FOOTER
══════════════════════════════════════════ */
.app-footer {
  margin-top: 14px;
  padding: 6px;
}

.footer-text {
  font-size: 10px;
  color: #5a3d1f;
  letter-spacing: 2px;
  text-transform: uppercase;
}

/* ══════════════════════════════════════════
   RESPONSIVE
══════════════════════════════════════════ */
@media (max-width: 768px) {
  .app-wrapper {
    padding: 16px 8px 12px;
  }

  .app-header {
    margin-bottom: 14px;
  }

  #logo {
    width: 100px;
    height: 100px;
  }

  #logo.small {
    width: 46px;
    height: 46px;
  }

  .app-title {
    font-size: 20px;
    letter-spacing: 2px;
  }

  .content-panel {
    padding: 18px 14px;
    border-radius: 12px;
    width: 98%;
  }
}

@media (max-width: 480px) {
  .app-wrapper {
    padding: 10px 6px 10px;
  }

  #logo {
    width: 80px;
    height: 80px;
  }

  #logo.small {
    width: 40px;
    height: 40px;
  }

  .app-title {
    font-size: 16px;
    letter-spacing: 1px;
  }

  .app-subtitle {
    font-size: 10px;
    letter-spacing: 3px;
  }

  .content-panel {
    padding: 12px 10px;
    border-radius: 10px;
    width: 100%;
  }
}

/* ══════════════════════════════════════════
   CRAFT NOTIFICATIONS
══════════════════════════════════════════ */
.craft-notif-wrapper {
  position: fixed;
  bottom: 20px;
  bottom: calc(20px + env(safe-area-inset-bottom));
  right: 16px;
  z-index: 9999;
  pointer-events: none;
}

@media (max-width: 768px) {
  .craft-notif-wrapper {
    bottom: calc(72px + env(safe-area-inset-bottom));
    right: 8px;
    left: 8px;
  }
  .craft-notif-list {
    align-items: stretch;
  }
  .craft-notif-toast {
    max-width: 100%;
    min-width: unset;
  }
}

.craft-notif-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: flex-end;
}

.craft-notif-toast {
  position: relative;
  display: flex;
  flex-direction: column;
  border-radius: 10px;
  min-width: 260px;
  max-width: 320px;
  pointer-events: all;
  overflow: hidden;
  cursor: pointer;
  background: linear-gradient(135deg, rgba(18, 14, 8, 0.97), rgba(10, 8, 4, 0.99));
  border: 1px solid rgba(200, 155, 60, 0.5);
  box-shadow:
    0 4px 20px rgba(0, 0, 0, 0.8),
    0 0 16px rgba(200, 155, 60, 0.15),
    inset 0 0 10px rgba(200, 155, 60, 0.04);
}

.craft-notif-toast.notif-armor {
  border-color: rgba(200, 100, 60, 0.5);
  box-shadow:
    0 4px 20px rgba(0, 0, 0, 0.8),
    0 0 16px rgba(200, 100, 60, 0.15),
    inset 0 0 10px rgba(200, 100, 60, 0.04);
}

/* Header row (shared) */
.cn-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 34px 10px 10px;
}

.cn-icon-wrap {
  position: relative;
  flex-shrink: 0;
}

.cn-thumbnail {
  width: 40px;
  height: 40px;
  object-fit: contain;
  border-radius: 6px;
  border: 1px solid rgba(200, 155, 60, 0.3);
  background: rgba(0, 0, 0, 0.4);
}

.cn-forge {
  position: absolute;
  bottom: -4px;
  right: -6px;
  font-size: 14px;
  filter: drop-shadow(0 0 4px rgba(255, 160, 0, 0.8));
}

.cn-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.cn-label {
  font-size: 9px;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: #c89b3c;
}

.cn-name {
  font-size: 13px;
  font-weight: bold;
  color: #f0ddb0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cn-type {
  font-size: 10px;
  color: #7c5a2b;
}

.cn-dismiss {
  position: absolute;
  top: 6px;
  right: 8px;
  background: none;
  border: none;
  color: #5a3d1f;
  font-size: 11px;
  cursor: pointer;
  padding: 2px 4px;
  line-height: 1;
  transition: color 0.15s;
}
.cn-dismiss:hover { color: #cc4444; }

/* Materials table (progress type) */
.cn-mat-table {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 0 10px 10px;
  border-top: 1px solid rgba(200, 155, 60, 0.1);
  padding-top: 8px;
}

.cn-mat-row {
  display: flex;
  align-items: center;
  gap: 7px;
}

.cn-mat-img {
  width: 22px;
  height: 22px;
  object-fit: contain;
  border-radius: 3px;
  background: rgba(0, 0, 0, 0.35);
  flex-shrink: 0;
}

.cn-mat-name {
  flex: 1;
  font-size: 11px;
  color: #c4a060;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cn-mat-count {
  font-size: 11px;
  font-weight: bold;
  color: #cc4444;
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 2px;
}
.cn-mat-count.cn-mat-ok { color: #3cb83c; }
.cn-mat-sep { opacity: 0.5; font-weight: normal; }
.cn-mat-check { font-size: 10px; }

/* Progress bar */
.cn-progress {
  position: absolute;
  bottom: 0;
  left: 0;
  height: 2px;
  background: linear-gradient(to right, #c89b3c, #ffd27a);
  animation: cnProgress 7s linear forwards;
}
.cn-progress.cn-progress-slow {
  animation-duration: 8s;
}

.notif-armor .cn-progress {
  background: linear-gradient(to right, #c86040, #ff9060);
}

@keyframes cnProgress {
  from { width: 100%; }
  to   { width: 0%; }
}

/* Transition animations */
.notif-enter-active {
  animation: notifSlideIn 0.35s cubic-bezier(0.22, 1, 0.36, 1) forwards;
}

.notif-leave-active {
  animation: notifSlideOut 0.3s ease-in forwards;
}

@keyframes notifSlideIn {
  from { opacity: 0; transform: translateX(100%) scale(0.9); }
  to   { opacity: 1; transform: translateX(0) scale(1); }
}

@keyframes notifSlideOut {
  from { opacity: 1; transform: translateX(0) scale(1); }
  to   { opacity: 0; transform: translateX(60%) scale(0.95); }
}
</style>
