<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { showQuestEffects, showTips } from '@/stores/settings'
import classHunterData from '@/assets/files/class_hunter.json'
import { hunter } from '@/stores/hunter'

const router = useRouter()

const showLogoutConfirm = ref(false)

const logout = () => {
  showLogoutConfirm.value = false
  localStorage.removeItem('hunterId')
  hunter.value = null
  router.push('/')
}

// ─── Export ───────────────────────────────────────────────────────────────────
const getClassName = (classId) =>
  classHunterData.find((c) => c.hunter_class_id === classId)?.hunter_class ?? `Class${classId}`

const sanitize = (str) => String(str).replace(/[^\w฀-๿]/g, '_').replace(/_+/g, '_')

const showExportConfirm = ref(false)

const confirmExport = () => {
  showExportConfirm.value = false
  doExport(hunter.value)
}

const exportHunter = () => {
  showExportConfirm.value = true
}

const doExport = (hunter) => {
  const date = new Date().toISOString().slice(0, 10)
  const name = sanitize(hunter.hunter_name)
  const cls  = sanitize(getClassName(hunter.hunter_class_id))
  const day  = `Day${hunter.campaign_day ?? 1}`
  const payload = { version: '1.1', exportedAt: new Date().toISOString(), hunter }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url
  a.download = `${date}_${name}_${cls}_${day}.json`
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
<div>
  <div class="setting-page">

    <!-- HEADER -->
    <div class="setting-header">
      <div class="sh-line"></div>
      <div class="sh-title-wrap">
        <span class="sh-ornament">⚙</span>
        <h2 class="sh-title">Settings</h2>
        <span class="sh-ornament">⚙</span>
      </div>
      <div class="sh-line"></div>
    </div>

    <!-- GUILD NOTICE -->
    <div class="guild-notice">
      <div class="notice-stamp">GUILD NOTICE</div>
      <p class="notice-text">
        การตั้งค่าเกมเพิ่มเติมและตัวเลือกจัดการแคมเปญจะพร้อมใช้งานในการอัปเดตถัดไป
        สมาคมนักล่าขอบคุณสำหรับความอดทนของคุณ
      </p>
    </div>

    <!-- PLACEHOLDER SECTIONS -->
    <div class="setting-sections">

      <div class="setting-section">
        <div class="ss-header">
          <span class="ss-icon">📋</span>
          <span class="ss-title">แคมเปญ</span>
        </div>
        <div class="ss-body coming-soon">
          <span class="cs-badge">เร็วๆ นี้</span>
          <p class="cs-text">การจัดการวันแคมเปญ, การตั้งค่าความยาก</p>
        </div>
      </div>

      <div class="setting-section">
        <div class="ss-header">
          <span class="ss-icon">🔊</span>
          <span class="ss-title">การแสดงผล</span>
        </div>
        <div class="ss-body">
          <div class="setting-row">
            <div class="setting-row-info">
              <span class="setting-row-label">เอฟเฟกต์การเลือกเควส</span>
              <span class="setting-row-desc">แสดงข้อความผลที่เกิดขึ้นบนปุ่มเลือกเควส</span>
            </div>
            <button
              class="toggle-btn"
              :class="{ active: showQuestEffects }"
              @click="showQuestEffects = !showQuestEffects"
              :aria-label="showQuestEffects ? 'ซ่อนเอฟเฟกต์' : 'แสดงเอฟเฟกต์'"
            >
              <span class="toggle-track">
                <span class="toggle-thumb"></span>
              </span>
              <span class="toggle-label">{{ showQuestEffects ? 'ON' : 'OFF' }}</span>
            </button>
          </div>

          <div class="setting-row">
            <div class="setting-row-info">
              <span class="setting-row-label">💡 Tip Notifications</span>
              <span class="setting-row-desc">แสดง Tip เป็นระยะๆ เพื่อแนะนำฟีเจอร์ต่างๆ ของแอป</span>
            </div>
            <button
              class="toggle-btn"
              :class="{ active: showTips }"
              @click="showTips = !showTips"
              :aria-label="showTips ? 'ปิด Tip' : 'เปิด Tip'"
            >
              <span class="toggle-track">
                <span class="toggle-thumb"></span>
              </span>
              <span class="toggle-label">{{ showTips ? 'ON' : 'OFF' }}</span>
            </button>
          </div>
        </div>
      </div>

      <div class="setting-section">
        <div class="ss-header">
          <span class="ss-icon">💾</span>
          <span class="ss-title">ข้อมูลเซฟ</span>
        </div>
        <div class="ss-body">

          <!-- Export current hunter -->
          <div class="save-section-label">📤 ส่งออก Hunter</div>
          <div v-if="!hunter" class="save-empty">ยังไม่มี Hunter ที่ Login — สร้าง Hunter ก่อนเพื่อ Export</div>
          <div v-else class="export-hunter-card">
            <div class="export-hunter-info">
              <span class="export-hunter-name">{{ hunter.hunter_name }}</span>
              <span class="export-hunter-meta">{{ getClassName(hunter.hunter_class_id) }} · Day {{ hunter.campaign_day ?? 1 }}</span>
            </div>
            <button class="save-btn save-btn-export export-btn-full" @click="exportHunter">
              📤 Export
            </button>
          </div>

          <p class="save-import-hint">💡 Import Hunter ทำได้จากหน้าเลือก Hunter</p>

        </div>
      </div>

    </div>

    <!-- LOGOUT -->
    <button class="logout-btn" @click="showLogoutConfirm = true">
      <span class="logout-icon">🚪</span>
      เปลี่ยน Hunter
    </button>

    <!-- VERSION FOOTER -->
    <div class="setting-footer">
      <span class="footer-ornament">— ✦ —</span>
      <p class="footer-ver">MHW Board Game Companion · ช่วงทดสอบ</p>
      <span class="footer-ornament">— ✦ —</span>
    </div>

  </div>

  <!-- Change Hunter Confirm Modal -->
  <Teleport to="body">
    <Transition name="slain-fade">
      <div v-if="showLogoutConfirm" class="export-confirm-overlay" @click.self="showLogoutConfirm = false">
        <div class="export-confirm-modal">
          <p class="export-confirm-title">🚪 เปลี่ยน Hunter</p>
          <p class="export-confirm-desc">
            ออกจาก <strong>{{ hunter?.hunter_name }}</strong> และกลับไปหน้าเลือก Hunter ใช่หรือไม่?
          </p>
          <div class="export-confirm-btns">
            <button class="save-btn save-btn-export" @click="logout">✓ ยืนยัน</button>
            <button class="export-cancel-btn" @click="showLogoutConfirm = false">ยกเลิก</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- Export Confirm Modal -->
  <Teleport to="body">
    <Transition name="slain-fade">
      <div v-if="showExportConfirm" class="export-confirm-overlay" @click.self="showExportConfirm = false">
        <div class="export-confirm-modal">
          <p class="export-confirm-title">📤 ยืนยันการ Export</p>
          <p class="export-confirm-desc">
            Export ข้อมูลของ <strong>{{ hunter?.hunter_name }}</strong> เป็นไฟล์ .json ใช่หรือไม่?
          </p>
          <div class="export-confirm-btns">
            <button class="save-btn save-btn-export" @click="confirmExport">✓ ยืนยัน</button>
            <button class="export-cancel-btn" @click="showExportConfirm = false">ยกเลิก</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</div>
</template>

<style scoped>
/* ══════════════════════════════════════════
   BASE
══════════════════════════════════════════ */
.setting-page {
  display: flex;
  flex-direction: column;
  gap: 24px;
  color: #f0ddb0;
  font-family: 'Georgia', 'Times New Roman', serif;
  max-width: 700px;
  margin: 0 auto;
}

/* ══════════════════════════════════════════
   HEADER
══════════════════════════════════════════ */
.setting-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.sh-line {
  flex: 1;
  height: 1px;
  background: linear-gradient(to right, transparent, #7c5a2b);
}

.sh-line:last-child {
  background: linear-gradient(to left, transparent, #7c5a2b);
}

.sh-title-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
  white-space: nowrap;
}

.sh-title {
  margin: 0;
  font-size: 18px;
  color: #ffd27a;
  letter-spacing: 4px;
  text-transform: uppercase;
  text-shadow: 0 0 12px rgba(255, 200, 80, 0.4);
}

.sh-ornament {
  font-size: 14px;
  color: #7c5a2b;
}

/* ══════════════════════════════════════════
   GUILD NOTICE
══════════════════════════════════════════ */
.guild-notice {
  padding: 16px 18px;
  border-radius: 10px;
  background: rgba(10, 8, 4, 0.6);
  border: 1px solid rgba(124, 90, 43, 0.4);
  border-left: 3px solid #c89b3c;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.notice-stamp {
  font-size: 9px;
  letter-spacing: 4px;
  text-transform: uppercase;
  color: #c89b3c;
  text-shadow: 0 0 6px rgba(200, 155, 60, 0.3);
}

.notice-text {
  margin: 0;
  font-size: 13px;
  color: #a88040;
  line-height: 1.6;
  font-style: italic;
}

/* ══════════════════════════════════════════
   SETTING SECTIONS
══════════════════════════════════════════ */
.setting-sections {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.setting-section {
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid rgba(124, 90, 43, 0.4);
  background: linear-gradient(160deg, rgba(22, 16, 8, 0.9), rgba(12, 9, 5, 0.95));
}

.ss-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(124, 90, 43, 0.25);
  background: rgba(5, 4, 2, 0.4);
}

.ss-icon {
  font-size: 16px;
}

.ss-title {
  font-size: 12px;
  letter-spacing: 3px;
  text-transform: uppercase;
  color: #c89b3c;
}

.ss-body {
  padding: 16px;
}

.ss-body.coming-soon {
  display: flex;
  align-items: center;
  gap: 14px;
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.setting-row-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.setting-row-label {
  font-size: 13px;
  color: #f0ddb0;
}

.setting-row-desc {
  font-size: 11px;
  color: #7c5a2b;
  font-style: italic;
}

.toggle-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px 0;
  flex-shrink: 0;
}

.toggle-track {
  position: relative;
  width: 42px;
  height: 24px;
  border-radius: 12px;
  background: rgba(124, 90, 43, 0.25);
  border: 1px solid rgba(124, 90, 43, 0.5);
  display: block;
  transition: 0.2s;
}

.toggle-btn.active .toggle-track {
  background: rgba(200, 155, 60, 0.3);
  border-color: #c89b3c;
  box-shadow: 0 0 8px rgba(200, 155, 60, 0.3);
}

.toggle-thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #5a3d1f;
  transition: 0.2s;
}

.toggle-btn.active .toggle-thumb {
  left: 21px;
  background: #c89b3c;
}

.toggle-label {
  font-size: 10px;
  letter-spacing: 1.5px;
  color: #7c5a2b;
  font-family: 'Georgia', serif;
  transition: 0.2s;
  min-width: 22px;
}

.toggle-btn.active .toggle-label {
  color: #c89b3c;
}

.cs-badge {
  display: inline-block;
  font-size: 8px;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: #7c5a2b;
  border: 1px solid rgba(124, 90, 43, 0.4);
  border-radius: 4px;
  padding: 3px 8px;
  white-space: nowrap;
}

.cs-text {
  margin: 0;
  font-size: 12px;
  color: #5a3d1f;
  font-style: italic;
}

/* ══════════════════════════════════════════
   SAVE SECTION
══════════════════════════════════════════ */
.save-section-label {
  font-size: 11px;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: #7c5a2b;
  margin-bottom: 8px;
}

.save-empty {
  font-size: 12px;
  color: #5a3d1f;
  font-style: italic;
  padding: 8px 0;
}

.save-hunter-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid rgba(124, 90, 43, 0.12);
}
.save-hunter-row:last-of-type { border-bottom: none; }

.save-hunter-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.save-hunter-name {
  font-size: 13px;
  color: #f0ddb0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.save-hunter-meta {
  font-size: 11px;
  color: #7c5a2b;
}

.export-hunter-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  border-radius: 10px;
  background: rgba(200, 155, 60, 0.06);
  border: 1px solid rgba(124, 90, 43, 0.3);
}

.export-hunter-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: center;
  text-align: center;
}

.export-hunter-name {
  font-size: 15px;
  font-weight: bold;
  color: #ffd27a;
}

.export-hunter-meta {
  font-size: 12px;
  color: #a88040;
}

.export-btn-full {
  width: 100%;
  justify-content: center;
  gap: 6px;
}

.save-import-hint {
  margin: 12px 0 0;
  font-size: 11px;
  color: #5a3d1f;
  font-style: italic;
}

.save-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.save-divider {
  height: 1px;
  background: rgba(124, 90, 43, 0.2);
  margin: 12px 0;
}

.save-btn {
  flex-shrink: 0;
  padding: 7px 18px;
  border-radius: 7px;
  font-size: 12px;
  font-family: 'Georgia', serif;
  letter-spacing: 1px;
  cursor: pointer;
  transition: all 0.15s;
  display: inline-flex;
  align-items: center;
}

.save-btn-export {
  border: 1px solid rgba(200, 155, 60, 0.5);
  background: rgba(200, 155, 60, 0.07);
  color: #c89b3c;
}
.save-btn-export:hover {
  background: rgba(200, 155, 60, 0.14);
  color: #ffd27a;
}

.save-btn-import {
  border: 1px solid rgba(60, 160, 220, 0.5);
  background: rgba(60, 160, 220, 0.07);
  color: #5ab4e0;
}
.save-btn-import:hover {
  background: rgba(60, 160, 220, 0.14);
  color: #90d0f8;
}

.save-msg {
  margin: 10px 0 0;
  font-size: 12px;
  border-radius: 6px;
  padding: 8px 12px;
}
.save-msg-error {
  color: #e06060;
  background: rgba(200, 60, 60, 0.1);
  border: 1px solid rgba(200, 60, 60, 0.3);
}
.save-msg-ok {
  color: #60c060;
  background: rgba(60, 180, 60, 0.1);
  border: 1px solid rgba(60, 180, 60, 0.3);
}

/* ── Import Confirm Modal ── */
.ic-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.72);
  z-index: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.ic-modal {
  background: linear-gradient(160deg, rgba(22, 16, 8, 0.99), rgba(10, 8, 4, 0.99));
  border: 1px solid rgba(200, 155, 60, 0.4);
  border-radius: 14px;
  width: 360px;
  max-width: 100%;
  padding: 24px 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.9);
}

.ic-stamp {
  font-size: 10px;
  letter-spacing: 3px;
  text-transform: uppercase;
  color: #e0a030;
  text-align: center;
}

.ic-body {
  margin: 0;
  font-size: 13px;
  color: #c4a060;
  line-height: 1.6;
  text-align: center;
}
.ic-body strong { color: #e06060; }

.ic-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  background: rgba(200, 155, 60, 0.06);
  border: 1px solid rgba(200, 155, 60, 0.2);
  border-radius: 7px;
  font-size: 11px;
  color: #a88040;
}

.ic-btns {
  display: flex;
  gap: 10px;
}

.ic-btn-ok {
  flex: 1;
  padding: 10px;
  border-radius: 8px;
  border: 1px solid rgba(200, 60, 60, 0.5);
  background: rgba(200, 60, 60, 0.1);
  color: #e08080;
  font-size: 13px;
  font-family: 'Georgia', serif;
  cursor: pointer;
  transition: all 0.15s;
}
.ic-btn-ok:hover { background: rgba(200, 60, 60, 0.18); color: #ff9090; }

.ic-btn-cancel {
  flex: 1;
  padding: 10px;
  border-radius: 8px;
  border: 1px solid rgba(124, 90, 43, 0.4);
  background: rgba(124, 90, 43, 0.08);
  color: #a88040;
  font-size: 13px;
  font-family: 'Georgia', serif;
  cursor: pointer;
  transition: all 0.15s;
}
.ic-btn-cancel:hover { background: rgba(124, 90, 43, 0.15); color: #f0ddb0; }

/* ══════════════════════════════════════════
   LOGOUT
══════════════════════════════════════════ */
.logout-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 12px;
  border-radius: 10px;
  border: 1px solid rgba(200, 60, 60, 0.35);
  background: rgba(200, 60, 60, 0.06);
  color: #c06060;
  font-size: 13px;
  font-family: 'Georgia', serif;
  letter-spacing: 1px;
  cursor: pointer;
  transition: all 0.15s;
}
.logout-btn:hover {
  border-color: rgba(200, 60, 60, 0.6);
  background: rgba(200, 60, 60, 0.12);
  color: #e08080;
}

.logout-icon { font-size: 16px; }

/* ══════════════════════════════════════════
   FOOTER
══════════════════════════════════════════ */
.setting-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding-top: 8px;
}

.footer-ornament {
  font-size: 10px;
  color: #3a2c1a;
  letter-spacing: 4px;
}

.footer-ver {
  margin: 0;
  font-size: 10px;
  color: #3a2c1a;
  letter-spacing: 2px;
  text-transform: uppercase;
}

/* ══════════════════════════════════════════
   RESPONSIVE
══════════════════════════════════════════ */
@media (max-width: 480px) {
  .sh-title { font-size: 14px; letter-spacing: 2px; }
  .ss-body.coming-soon { flex-direction: column; align-items: flex-start; gap: 6px; }
  .notice-text { font-size: 12px; }
}
</style>

<style>
.export-confirm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.7);
  backdrop-filter: blur(6px);
  z-index: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.export-confirm-modal {
  background: linear-gradient(160deg, #1c1508, #13100a);
  border: 2px solid #7c5a2b;
  border-radius: 14px;
  padding: 24px 20px;
  width: min(340px, 100%);
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: 0 0 40px rgba(0,0,0,0.8);
}
.export-confirm-title {
  font-size: 16px;
  font-weight: bold;
  color: #ffd27a;
  text-align: center;
  margin: 0;
}
.export-confirm-desc {
  font-size: 13px;
  color: #d4c090;
  text-align: center;
  margin: 0;
  line-height: 1.6;
}
.export-confirm-desc strong { color: #ffd27a; }
.export-confirm-btns {
  display: flex;
  gap: 10px;
  margin-top: 4px;
}
.export-confirm-btns > * { flex: 1; }
.export-cancel-btn {
  padding: 12px;
  border-radius: 8px;
  border: 1px solid rgba(124,90,43,0.4);
  background: rgba(10,8,4,0.6);
  color: #7c5a2b;
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;
  transition: 0.2s;
}
.export-cancel-btn:hover { color: #a88040; border-color: #7c5a2b; }
</style>
