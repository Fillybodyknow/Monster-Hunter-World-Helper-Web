<script setup>
import { showQuestEffects } from '@/stores/settings'
</script>

<template>
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
        </div>
      </div>

      <div class="setting-section">
        <div class="ss-header">
          <span class="ss-icon">💾</span>
          <span class="ss-title">ข้อมูลเซฟ</span>
        </div>
        <div class="ss-body coming-soon">
          <span class="cs-badge">เร็วๆ นี้</span>
          <p class="cs-text">ส่งออก นำเข้า และสำรองข้อมูลเซฟของนักล่า</p>
        </div>
      </div>

    </div>

    <!-- VERSION FOOTER -->
    <div class="setting-footer">
      <span class="footer-ornament">— ✦ —</span>
      <p class="footer-ver">MHW Board Game Companion · ช่วงทดสอบ</p>
      <span class="footer-ornament">— ✦ —</span>
    </div>

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
