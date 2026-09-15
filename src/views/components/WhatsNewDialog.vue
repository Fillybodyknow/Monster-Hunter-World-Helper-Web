<script setup>
import { onMounted } from 'vue'
import ChangelogList from './ChangelogList.vue'
import { APP_VERSION } from '@/services/appVersion'
import { whatsNew, checkWhatsNew, dismissWhatsNew } from '@/services/changelog'

// App.vue mount ตัวนี้หลัง BootLoader หายไป — เช็คตอนนั้นทีเดียว ไม่ให้เด้งทับจอโหลด
onMounted(checkWhatsNew)
</script>

<template>
  <Teleport to="body">
    <Transition name="wn-fade">
      <div v-if="whatsNew.length" class="wn-overlay" @click.self="dismissWhatsNew">
        <div class="wn-card" role="dialog" aria-modal="true" aria-labelledby="wn-title">
          <div class="wn-head">
            <span class="wn-seal" aria-hidden="true">✦</span>
            <div class="wn-head-text">
              <h3 id="wn-title" class="wn-title">มีอะไรใหม่</h3>
              <p class="wn-ver">เวอร์ชัน v{{ APP_VERSION }}</p>
            </div>
          </div>

          <div class="wn-body">
            <ChangelogList :entries="whatsNew" tone="parchment" />
          </div>

          <button type="button" class="wn-ok" @click="dismissWhatsNew">เข้าใจแล้ว</button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.wn-overlay {
  position: fixed;
  inset: 0;
  /* ใต้แบนเนอร์เวอร์ชันใหม่ (10500) และทัวร์ (11000) */
  z-index: 10450;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.78);
  backdrop-filter: blur(4px);
}

/* ม้วนกระดาษประกาศของกิลด์ */
.wn-card {
  width: min(480px, 100%);
  max-height: calc(100vh - 32px);
  max-height: calc(100dvh - 32px);
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 18px 18px 16px;
  border-radius: 3px 2px 4px 2px;
  border: 1px solid #8a6a3a;
  background:
    radial-gradient(ellipse at 30% 15%, rgba(255, 255, 255, 0.35), transparent 60%),
    linear-gradient(170deg, #efe0bd, #e2cc9c 60%, #d6bd88);
  box-shadow: inset 0 0 40px rgba(120, 80, 30, 0.35), 0 12px 40px rgba(0, 0, 0, 0.8);
  font-family: 'Georgia', 'Times New Roman', serif;
}

.wn-head { display: flex; align-items: center; gap: 12px; }
.wn-seal {
  flex: none;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #c0503a, #8a2a1c 60%, #5e1a10);
  box-shadow: inset 0 -2px 4px rgba(0, 0, 0, 0.45), 0 2px 4px rgba(60, 30, 10, 0.5);
  color: #f3c9a0;
  font-size: 16px;
}
.wn-head-text { min-width: 0; }
.wn-title { margin: 0; font-size: 20px; color: #3b2a14; letter-spacing: 0.5px; }
.wn-ver { margin: 2px 0 0; font-size: 12px; color: #8a6a3a; font-variant-numeric: tabular-nums; }

/* รายการยาวเลื่อนในกรอบ ปุ่มล่างอยู่ที่เดิมเสมอ */
.wn-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 12px 4px 4px;
  border-top: 1px solid rgba(92, 66, 32, 0.3);
}

/* ปุ่มแผ่นทองเหลือง — ชุดเดียวกับปุ่มยืนยันหลักทั้งแอป */
.wn-ok {
  flex: none;
  min-height: 46px;
  padding: 10px 14px;
  border-radius: 3px;
  border: 1px solid #6b4f1c;
  background: linear-gradient(to bottom, #b08a34 0%, #8a6a22 48%, #6b501a 100%);
  color: #2a1d06;
  font-family: inherit;
  font-size: 14px;
  font-weight: bold;
  text-shadow: 0 1px 0 rgba(255, 225, 170, 0.35);
  box-shadow: inset 0 1px 0 rgba(255, 230, 180, 0.4), 0 2px 6px rgba(60, 40, 15, 0.4);
  cursor: pointer;
}
.wn-ok:hover { background: linear-gradient(to bottom, #c99f42 0%, #9d7a29 48%, #7a5c1f 100%); }

.wn-fade-enter-active,
.wn-fade-leave-active { transition: opacity 0.2s ease; }
.wn-fade-enter-active .wn-card,
.wn-fade-leave-active .wn-card { transition: transform 0.25s cubic-bezier(0.22, 1, 0.36, 1); }
.wn-fade-enter-from,
.wn-fade-leave-to { opacity: 0; }
.wn-fade-enter-from .wn-card,
.wn-fade-leave-to .wn-card { transform: translateY(14px) scale(0.98); }
</style>
