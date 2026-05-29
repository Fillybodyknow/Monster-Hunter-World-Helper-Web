<script setup>
import { useRoute } from 'vue-router'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { hunter, loadHunter } from '@/stores/hunter'
import {
  craftNotifications,
  dismissNotification,
  checkCraftability,
  initCraftability,
} from '@/stores/craftingWhitelist'
import { showTips } from '@/stores/settings'

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
  startTipTimer()
})

onUnmounted(() => {
  stopTipTimer()
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

// ─── Tip Notification System ──────────────────────────────────────────────────
const tipNotifications = ref([])
let tipTimer = null
let firstTipTimer = null
let lastTipIndex = -1

const tips = [
  { icon: '🎒', text: 'กด "🎒 Inventory" ใน Gathering Phase เพื่อเพิ่ม Item' },
  { icon: '📌', text: 'กดการ์ด Weapon/Armor ใน Crafting เพื่อดูรายละเอียดหรือเพิ่มใน Whitelist (สูงสุด 5 ชิ้น)' },
  { icon: '🔔', text: 'Whitelist แจ้งเตือนเมื่อ Material ครบ และลบออกอัตโนมัติหลัง Craft' },
  { icon: '⚔', text: 'กด Element/Status ใน Hunting Panel เพื่อนับการโจมตี Real-time' },
  { icon: '💀', text: 'กด Faint Icon นับ Faint — ครบ 3 ครั้ง Quest Fail อัตโนมัติ' },
  { icon: '🗡', text: 'กด +/− ใต้ Part เพื่อ Track ความเสียหาย — ถึง Threshold จะแสดง BROKEN' },
  { icon: '🎲', text: 'กดลูกเต๋าใน Reward Phase เพื่อทอยใหม่เฉพาะลูกนั้น' },
  { icon: '🔍', text: 'Scoutfly Level กำหนดระดับ Special Attack ของ Monster' },
  { icon: '🛡', text: 'Craft Armor ครบ 3 ชิ้น (Helm, Mail, Greaves) ของ Set เดียวกัน เพื่อปลดล็อค Set Bonus' },
  { icon: '📋', text: 'Quest ถูกล็อคจนกว่าจะผ่าน Assigned Quest ของ Monster นั้น' },
  { icon: '🏆', text: 'เลือก Dice หลายลูกแล้วรวมค่า เพื่อ Claim Reward จากแถวที่ตรงกัน' },
  { icon: '💡', text: 'กด Notification เพื่อปิดทันที หรือรอให้หายเองอัตโนมัติ' },
  { icon: '✨', text: 'กด Badge (✓) บน Monster เพื่อเอา Status Effect ออก' },
  { icon: '❤', text: 'HP Bar เปลี่ยนสี เหลือง → แดง เมื่อ Monster HP เหลือน้อย' },
  { icon: '📅', text: 'Campaign Calendar แสดงวันที่ผ่านมา — เพิ่มทุกครั้งที่จบ Quest' },
  { icon: '🗺', text: 'แผนที่ใน Hunting Panel แสดง Zone ที่ Monster อาศัยอยู่' },
  { icon: '⚡', text: 'อ่าน Special Rule ใน Hunting Panel ก่อนเริ่ม Hunt' },
  { icon: '👥', text: 'เลือกจำนวน Hunter ใน Reward Phase เพื่อกำหนดจำนวน Dice ที่ทอย' },
  { icon: '🎯', text: 'Investigation/Tempered Quest ให้ Dice Reward มากกว่า Assigned Quest' },
  { icon: '🔧', text: 'Weapon บางชิ้นต้องการ Required Weapon ก่อน — ดูใน Item Modal' },
  { icon: '🌿', text: 'สะสม Resource หลายประเภทไว้ เพราะแต่ละประเภทใช้ Craft อุปกรณ์ต่างกัน' },
  { icon: '💎', text: 'Break Part ทำให้ Monster อ่อนแอลงและได้ Reward เพิ่ม' },
  { icon: '⭐', text: 'ดาวม่วง (4 ดาว) คือ Tempered Quest — ยากที่สุด แต่ Reward มากสุด' },
  { icon: '⏳', text: 'Time Limit = จำนวน Card ที่ใช้ได้ — หมดแล้ว Quest Fail' },
  { icon: '◄', text: 'กด Back (มุมบนซ้าย) ย้อนกลับได้ทุกเมื่อ ข้อมูลยังคงอยู่' },
  { icon: '📦', text: 'ข้อมูลบันทึกใน Local Storage อัตโนมัติ ไม่หายเมื่อปิดหน้าเว็บ' },
  { icon: '🔓', text: 'ผ่าน Assigned Quest ก่อน เพื่อปลดล็อค Investigation และ Tempered Quest' },
  { icon: '📤', text: 'ใช้ Export ใน Settings บันทึกข้อมูล Hunter เป็น .json สำรองไว้ก่อนเริ่มแคมเปญ' },
  { icon: '📥', text: 'Import .json ในหน้าเลือก Hunter — ระบบเพิ่ม/อัปเดต Hunter โดยไม่กระทบตัวอื่น' },
  { icon: '💾', text: 'ชื่อไฟล์ Export มี วันที่, ชื่อ Hunter, Class และ Campaign Day เช่น 2025-01-15_Alon_Great_Sword_Day12.json' },
  { icon: '🏕', text: 'HQ มี 6 Location — กดการ์ดเพื่อเข้า กด ‹ เพื่อออก' },
  { icon: '🎲', text: 'Resource Center: ทอย 2 เต๋า รวมค่าเพื่อ Claim Reward แล้วกด "รับรางวัลและปิด"' },
  { icon: '⚖', text: 'Provisions Stockpile: Trade Common 3→1 หรือ Resource 10 ชิ้น → Monster Part' },
  { icon: '🍖', text: 'Meowscular Chef: เลือก Element รับ Token — วางบนอาวุธเพื่อบ่งบอก Resistance Quest ถัดไป' },
  { icon: '🐱', text: "Hunter's Lodge: เปลี่ยน Palico หรือจ้างใหม่ด้วย Resource 3 ชิ้น" },
  { icon: '📋', text: 'The Handler: เลือก Quest แล้วกด Reset เพื่อล้างจำนวนครั้งและเล่นซ้ำได้' },
  { icon: '🐷', text: 'Pet the Poogie: "บางครั้งสิ่งนี้อาจนำโชคมาให้คุณ..."' },
]

const dismissTip = (id) => {
  tipNotifications.value = tipNotifications.value.filter((n) => n.id !== id)
}

const showNextTip = () => {
  if (!showTips.value) return
  let idx
  do { idx = Math.floor(Math.random() * tips.length) } while (idx === lastTipIndex && tips.length > 1)
  lastTipIndex = idx
  const tip = tips[idx]
  const id = `tip_${Date.now()}`
  tipNotifications.value = [...tipNotifications.value, { ...tip, id }]
  setTimeout(() => dismissTip(id), 10000)
}

const startTipTimer = () => {
  firstTipTimer = setTimeout(() => {
    showNextTip()
    tipTimer = setInterval(showNextTip, 3 * 15 * 1000)
  }, 15 * 1000)
}

const stopTipTimer = () => {
  clearTimeout(firstTipTimer)
  clearInterval(tipTimer)
  firstTipTimer = null
  tipTimer = null
}

watch(showTips, (val) => {
  if (val) {
    startTipTimer()
  } else {
    stopTipTimer()
    tipNotifications.value = []
  }
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

    <!-- TIP NOTIFICATIONS -->
    <teleport to="body">
      <div class="tip-notif-wrapper">
        <transition-group name="tip" tag="div" class="tip-notif-list">
          <div
            v-for="tip in tipNotifications"
            :key="tip.id"
            class="tip-notif-toast"
            @click="dismissTip(tip.id)"
          >
            <span class="tip-icon">{{ tip.icon }}</span>
            <div class="tip-body">
              <span class="tip-label">Guild Tip</span>
              <span class="tip-text">{{ tip.text }}</span>
            </div>
            <div class="tip-progress"></div>
          </div>
        </transition-group>
      </div>
    </teleport>

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
   TIP NOTIFICATIONS
══════════════════════════════════════════ */
.tip-notif-wrapper {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 9998;
  pointer-events: none;
}

.tip-notif-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: flex-start;
}

.tip-notif-toast {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 14px 10px 12px;
  border-radius: 10px;
  max-width: 300px;
  pointer-events: all;
  cursor: pointer;
  overflow: hidden;
  background: linear-gradient(135deg, rgba(4, 12, 20, 0.97), rgba(2, 8, 16, 0.99));
  border: 1px solid rgba(60, 160, 220, 0.45);
  box-shadow:
    0 4px 20px rgba(0, 0, 0, 0.8),
    0 0 14px rgba(60, 140, 220, 0.12),
    inset 0 0 10px rgba(60, 140, 220, 0.04);
}

.tip-icon {
  font-size: 20px;
  flex-shrink: 0;
  line-height: 1.2;
  margin-top: 1px;
}

.tip-body {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.tip-label {
  font-size: 9px;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: #4a9fd4;
}

.tip-text {
  font-size: 12px;
  color: #c8dff0;
  line-height: 1.5;
}

.tip-progress {
  position: absolute;
  bottom: 0;
  left: 0;
  height: 2px;
  background: linear-gradient(to right, #2a7ab8, #60c0ff);
  animation: cnProgress 10s linear forwards;
}

.tip-enter-active {
  animation: notifSlideIn 0.35s cubic-bezier(0.22, 1, 0.36, 1) forwards;
}
.tip-leave-active {
  animation: notifSlideOut 0.3s ease-in forwards;
}

@media (max-width: 768px) {
  .tip-notif-wrapper {
    top: 8px;
    right: 8px;
    left: 8px;
  }
  .tip-notif-list { align-items: stretch; }
  .tip-notif-toast { max-width: 100%; }
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
