<script setup>
import { computed, ref } from 'vue'
import { APP_VERSION } from '@/services/appVersion'
import { newerBuild, dismissedSha, reloadToLatest } from '@/services/versionCheck'
import { CHANGELOG } from '@/services/changelog'
import { entriesNotIn } from '@/services/changelogLogic'
import ChangelogList from './ChangelogList.vue'

const show = computed(() => !!newerBuild.value && newerBuild.value.sha !== dismissedSha.value)

// อ่าน localStorage ตรง ๆ ไม่เรียก useRoomStore — แบนเนอร์อยู่ระดับ App
// ถ้าสร้าง room store ตรงนี้ หน้าเลือกนักล่า (/) จะติด listener ของ Co-op ไปด้วยทั้งที่ไม่ได้ใช้
// lastRoomCode มีค่าตลอดที่อยู่ในห้อง (รวมตอนหลุดรอ reconnect) และถูกลบตอนออกจากห้อง
const inCoopRoom = computed(() => {
  if (!newerBuild.value) return false
  try {
    return !!localStorage.getItem('lastRoomCode')
  } catch {
    return false
  }
})

const later = () => {
  dismissedSha.value = newerBuild.value?.sha ?? null
}

// build ใหม่ส่ง changelog มากับ version.json — แสดงเฉพาะรายการที่ build ที่รันอยู่ยังไม่มี
const newEntries = computed(() => entriesNotIn(newerBuild.value?.changelog, CHANGELOG.map((e) => e.id)))
const showChanges = ref(false)
</script>

<template>
  <Transition name="ub">
    <div v-if="show" class="update-banner" role="status" aria-live="polite">
      <div class="ub-seal" aria-hidden="true">✦</div>

      <div class="ub-body">
        <p class="ub-title">มีเวอร์ชันใหม่แล้ว</p>
        <p class="ub-ver">
          <span class="ub-old">v{{ APP_VERSION }}</span>
          <span class="ub-arrow">→</span>
          <span class="ub-new">v{{ newerBuild.version }}</span>
        </p>
        <!-- โหลดใหม่กลางเควสอาจทำให้ตี้สะดุด — เตือนไว้ แต่ไม่บังคับ -->
        <p v-if="inCoopRoom" class="ub-note">อยู่ในห้อง Co-op — แนะนำให้จบเควสนี้ก่อนค่อยโหลดใหม่</p>
        <button v-if="newEntries.length" type="button" class="ub-changes-toggle" @click="showChanges = !showChanges">
          {{ showChanges ? 'ซ่อนรายการอัปเดต' : `ดูว่ามีอะไรใหม่ (${newEntries.length})` }}
        </button>
      </div>

      <div class="ub-actions">
        <button class="ub-later" @click="later">ภายหลัง</button>
        <button class="ub-reload" @click="reloadToLatest">โหลดใหม่</button>
      </div>

      <div v-if="showChanges && newEntries.length" class="ub-changes">
        <ChangelogList :entries="newEntries" tone="dark" />
      </div>
    </div>
  </Transition>
</template>

<style scoped>
/* แผ่นหนังตอกหมุดห้อยลงมาจากขอบบน — วัสดุเดียวกับแผงเครื่องมือในแอป */
.update-banner {
  position: fixed;
  top: calc(12px + env(safe-area-inset-top));
  left: 50%;
  transform: translateX(-50%);
  /* เหนือ toast คราฟต์ (10000) แต่ใต้ทัวร์ (11000) — spotlight ของทัวร์ยังคลุมได้ */
  z-index: 10500;
  width: min(460px, calc(100vw - 32px));
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 3px 2px 4px 2px;
  border: 3px solid #2e2113;
  background:
    repeating-linear-gradient(
      100deg,
      rgba(0, 0, 0, 0.14) 0px,
      rgba(0, 0, 0, 0.14) 1px,
      transparent 1px,
      transparent 5px
    ),
    linear-gradient(170deg, #3a2a19, #261b0f 55%, #2e2213);
  box-shadow:
    inset 0 1px 0 rgba(255, 220, 160, 0.1),
    0 10px 30px rgba(0, 0, 0, 0.75);
  font-family: 'Georgia', 'Times New Roman', serif;
}

/* ตราครั่ง */
.ub-seal {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #c0503a, #8a2a1c 60%, #5e1a10);
  box-shadow: inset 0 -2px 4px rgba(0, 0, 0, 0.45), 0 2px 4px rgba(0, 0, 0, 0.5);
  color: #f3c9a0;
  font-size: 14px;
}

.ub-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ub-title {
  margin: 0;
  font-size: 13px;
  font-weight: bold;
  color: #ffd27a;
  letter-spacing: 1px;
}

.ub-ver {
  margin: 0;
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.ub-old { color: rgba(168, 128, 64, 0.75); }
.ub-arrow { color: #7c5a2b; }
.ub-new { color: #7fd99a; font-weight: bold; }

.ub-note {
  margin: 2px 0 0;
  font-size: 10px;
  line-height: 1.4;
  color: #e0a860;
}

.ub-actions {
  flex: none;
  display: flex;
  gap: 6px;
}

.ub-actions button {
  padding: 8px 12px;
  border-radius: 3px;
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  transition: 0.15s;
}

.ub-later {
  border: 1px solid rgba(124, 90, 43, 0.55);
  background: linear-gradient(170deg, #2b1f13, #1c1409);
  color: #a88040;
}
.ub-later:hover { color: #ffd27a; border-color: #c89b3c; }

/* ปุ่มแผ่นทองเหลือง — ชุดเดียวกับปุ่มยืนยันหลักทั้งแอป */
.ub-reload {
  border: 1px solid #6b4f1c;
  background: linear-gradient(to bottom, #b08a34 0%, #8a6a22 48%, #6b501a 100%);
  color: #2a1d06;
  font-weight: bold;
  text-shadow: 0 1px 0 rgba(255, 225, 170, 0.35);
  box-shadow: inset 0 1px 0 rgba(255, 230, 180, 0.4), 0 2px 6px rgba(0, 0, 0, 0.5);
}
.ub-reload:hover {
  background: linear-gradient(to bottom, #c99f42 0%, #9d7a29 48%, #7a5c1f 100%);
}

/* รายการอัปเดตกางลงใต้แบนเนอร์ — ยาวเกินก็เลื่อนในกรอบ ไม่ดันแบนเนอร์ล้นจอ */
.update-banner { flex-wrap: wrap; }
.ub-changes-toggle {
  align-self: flex-start;
  margin-top: 4px;
  padding: 0;
  border: none;
  background: none;
  color: #e0b862;
  font-family: inherit;
  font-size: 11px;
  text-decoration: underline;
  cursor: pointer;
}
.ub-changes {
  flex-basis: 100%;
  max-height: min(50vh, 360px);
  overflow-y: auto;
  margin-top: 2px;
  padding-top: 10px;
  border-top: 1px solid rgba(124, 90, 43, 0.4);
}

/* จอแคบ: ปุ่มลงไปอยู่แถวล่าง ไม่บีบข้อความจนอ่านไม่ออก */
@media (max-width: 480px) {
  .update-banner { flex-wrap: wrap; }
  .ub-actions { width: 100%; }
  .ub-actions button { flex: 1; }
}

/* ห้อยลงมาจากขอบบน — ต้องคง translateX(-50%) ไว้ ไม่งั้นแบนเนอร์กระโดดไปทางขวาระหว่าง transition */
.ub-enter-active,
.ub-leave-active {
  transition: opacity 0.3s ease, transform 0.35s cubic-bezier(0.22, 1, 0.36, 1);
}
.ub-enter-from,
.ub-leave-to {
  opacity: 0;
  transform: translate(-50%, -18px);
}
</style>
