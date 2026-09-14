<script setup>
import { computed, ref } from 'vue'
import { useRoomStore } from '@/stores/room'
import { copyText } from '@/services/clipboard'
import {
  REPORT_LIMITS,
  REPORT_TYPES,
  reportEnabled,
  sendReport,
  buildReportDiagnostics,
  formatReportText,
} from '@/services/reportService'

// วางได้ทั้งหน้าเลือก Hunter และหน้า Setting — หน้า Setting อยู่หลัง route guard ที่ต้องมี hunterId
// คนที่เข้าตัวละครไม่ได้จะติดอยู่หน้าเลือก Hunter และไปไม่ถึงหน้า Setting
const room = useRoomStore()

const open = ref(false)
const type = ref('bug')
const subject = ref('')
const message = ref('')
const contact = ref('')
const includeDiagnostics = ref(true)
const showPreview = ref(false)
// honeypot — คนมองไม่เห็นช่องนี้ บอทที่กรอกทุกช่องจะถูก Worker ทิ้งเงียบ ๆ
const website = ref('')
const status = ref('idle') // idle | sending | sent | error
const errorMsg = ref('')
const copied = ref(false)

const PLACEHOLDERS = {
  bug: 'เล่าว่ากดอะไร แล้วเกิดอะไรขึ้น และคิดว่าควรเป็นแบบไหน',
  idea: 'อยากให้แอปมีอะไรเพิ่ม หรือปรับตรงไหน',
  rule: 'กฎข้อไหน อยู่หน้าไหนใน Rulebook และแอปทำต่างไปอย่างไร',
}

// คำนวณใหม่ตอนเปิดฟอร์ม — error ที่เพิ่งเกิดก่อนกดรายงานต้องติดไปด้วย
const diagnostics = computed(() =>
  open.value
    ? buildReportDiagnostics({ inRoom: room.inRoom, roomCode: room.roomCode ?? null, isHost: room.isHost })
    : null,
)

const canSend = computed(
  () => !!subject.value.trim() && !!message.value.trim() && status.value !== 'sending',
)

const reset = () => {
  type.value = 'bug'
  subject.value = ''
  message.value = ''
  contact.value = ''
  includeDiagnostics.value = true
  showPreview.value = false
  status.value = 'idle'
  errorMsg.value = ''
}

const openForm = () => {
  if (status.value === 'sent') reset()
  else {
    status.value = 'idle'
    errorMsg.value = ''
  }
  open.value = true
}

// ปิดแล้วร่างยังอยู่ — เผลอแตะนอกกรอบจะได้ไม่ต้องพิมพ์ใหม่ ล้างเมื่อส่งสำเร็จเท่านั้น
const closeForm = () => {
  if (status.value !== 'sending') open.value = false
}

const payload = () => ({
  type: type.value,
  subject: subject.value.trim(),
  message: message.value.trim(),
  contact: contact.value.trim(),
  diagnostics: includeDiagnostics.value ? diagnostics.value : null,
  website: website.value,
})

const submit = async () => {
  if (!canSend.value) return
  status.value = 'sending'
  errorMsg.value = ''
  try {
    await sendReport(payload())
    status.value = 'sent'
  } catch (e) {
    status.value = 'error'
    errorMsg.value = e?.userMessage ?? 'ส่งไม่สำเร็จ ลองใหม่อีกครั้ง'
  }
}

const copyReport = async () => {
  await copyText(formatReportText(payload()))
  copied.value = true
  setTimeout(() => (copied.value = false), 2000)
}
</script>

<template>
  <button type="button" class="report-open" @click="openForm">
    <span class="ro-icon" aria-hidden="true">📮</span>
    <span class="ro-text">
      <span class="ro-title">รายงานปัญหา / เสนอไอเดีย</span>
      <span class="ro-sub">ส่งถึงผู้พัฒนาโดยตรง</span>
    </span>
    <span class="ro-arrow" aria-hidden="true">›</span>
  </button>

  <Teleport to="body">
    <Transition name="report-fade">
      <div v-if="open" class="report-overlay" @click.self="closeForm">
        <form
          class="report-letter"
          role="dialog"
          aria-modal="true"
          aria-labelledby="report-title"
          novalidate
          @submit.prevent="submit"
        >
          <div class="rl-head">
            <span class="rl-seal" aria-hidden="true">✉</span>
            <div class="rl-head-text">
              <h3 id="report-title" class="rl-title">จดหมายถึงผู้พัฒนา</h3>
              <p class="rl-sub">แจ้งบั๊ก เสนอไอเดีย หรือบอกจุดที่ไม่ตรง Rulebook</p>
            </div>
            <button type="button" class="rl-close" aria-label="ปิด" @click="closeForm">✕</button>
          </div>

          <!-- ส่งสำเร็จ -->
          <div v-if="status === 'sent'" class="rl-done">
            <p class="rl-done-title">✓ ส่งถึงผู้พัฒนาแล้ว</p>
            <p class="rl-done-sub">ขอบคุณที่ช่วยแจ้งครับ</p>
            <button type="button" class="rl-btn rl-btn-send" @click="open = false">ปิด</button>
          </div>

          <template v-else>
            <fieldset class="rl-field rl-fieldset">
              <legend class="rl-label">เรื่อง</legend>
              <div class="rl-type-row">
                <button
                  v-for="t in REPORT_TYPES"
                  :key="t.id"
                  type="button"
                  class="rl-type"
                  :class="{ active: type === t.id }"
                  :aria-pressed="type === t.id"
                  @click="type = t.id"
                >
                  {{ t.label }}
                </button>
              </div>
            </fieldset>

            <label class="rl-field">
              <span class="rl-label">หัวข้อ</span>
              <input
                v-model="subject"
                class="rl-input"
                :maxlength="REPORT_LIMITS.subject"
                placeholder="สรุปสั้น ๆ"
              />
            </label>

            <label class="rl-field">
              <span class="rl-label">
                รายละเอียด
                <span class="rl-count">{{ message.length }}/{{ REPORT_LIMITS.message }}</span>
              </span>
              <textarea
                v-model="message"
                class="rl-input rl-textarea"
                rows="6"
                :maxlength="REPORT_LIMITS.message"
                :placeholder="PLACEHOLDERS[type]"
              />
            </label>

            <label class="rl-field">
              <span class="rl-label">ติดต่อกลับ <span class="rl-optional">(ไม่บังคับ)</span></span>
              <input
                v-model="contact"
                class="rl-input"
                :maxlength="REPORT_LIMITS.contact"
                placeholder="ชื่อในกลุ่ม หรือ LINE"
              />
            </label>

            <input
              v-model="website"
              class="rl-hp"
              type="text"
              name="website"
              tabindex="-1"
              autocomplete="off"
              aria-hidden="true"
            />

            <div class="rl-diag">
              <label class="rl-check">
                <input v-model="includeDiagnostics" type="checkbox" />
                <span>แนบ 🛠 ข้อมูลระบบ (เวอร์ชัน, อุปกรณ์, error ล่าสุด)</span>
              </label>
              <!-- ให้เห็นก่อนส่งว่าส่งอะไรออกไป — มีข้อมูลเครื่องและรหัสห้องอยู่ด้วย -->
              <button
                v-if="includeDiagnostics"
                type="button"
                class="rl-link"
                @click="showPreview = !showPreview"
              >
                {{ showPreview ? 'ซ่อน' : 'ดูสิ่งที่จะส่ง' }}
              </button>
              <pre v-if="includeDiagnostics && showPreview" class="rl-pre">{{ JSON.stringify(diagnostics, null, 2) }}</pre>
            </div>

            <p v-if="!reportEnabled" class="rl-note">
              ระบบส่งรายงานยังไม่เปิดใช้ — กดคัดลอกแล้วส่งทางช่องทางอื่นแทนได้
            </p>
            <p v-if="status === 'error'" class="rl-error" role="alert">{{ errorMsg }}</p>

            <div class="rl-actions">
              <button type="button" class="rl-btn rl-btn-copy" @click="copyReport">
                {{ copied ? '✓ คัดลอกแล้ว' : '📋 คัดลอก' }}
              </button>
              <button v-if="reportEnabled" type="submit" class="rl-btn rl-btn-send" :disabled="!canSend">
                {{ status === 'sending' ? 'กำลังส่ง…' : '✉ ส่งรายงาน' }}
              </button>
            </div>
          </template>
        </form>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* ── ปุ่มเปิด: แผ่นหนังเข้าชุดกับการ์ดอื่นในหน้า ── */
.report-open {
  width: 100%;
  min-height: 52px;
  margin-top: 14px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-radius: 6px;
  border: 1px solid rgba(200, 155, 60, 0.45);
  background: linear-gradient(170deg, #2b1f13, #1c1409);
  color: #f0ddb0;
  font-family: 'Georgia', 'Times New Roman', serif;
  text-align: left;
  cursor: pointer;
  transition: 0.15s;
}
.report-open:hover {
  border-color: #c89b3c;
  background: linear-gradient(170deg, #3a2a19, #241a0e);
}
.ro-icon { font-size: 22px; }
.ro-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.ro-title { font-size: 13px; font-weight: bold; color: #ffd27a; }
.ro-sub { font-size: 11px; color: #a88040; }
.ro-arrow { font-size: 20px; color: #7c5a2b; }

/* ── จดหมาย: กระดาษ parchment วางบนพื้นมืด ── */
.report-overlay {
  position: fixed;
  inset: 0;
  /* ใต้แบนเนอร์เวอร์ชันใหม่ (10500) และทัวร์ (11000) */
  z-index: 10400;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.78);
  backdrop-filter: blur(4px);
}
.report-letter {
  width: min(520px, 100%);
  max-height: calc(100vh - 32px);
  max-height: calc(100dvh - 32px);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 0;
  padding: 18px 18px 16px;
  border-radius: 3px 2px 4px 2px;
  border: 1px solid #8a6a3a;
  background:
    radial-gradient(ellipse at 30% 15%, rgba(255, 255, 255, 0.35), transparent 60%),
    linear-gradient(170deg, #efe0bd, #e2cc9c 60%, #d6bd88);
  box-shadow: inset 0 0 40px rgba(120, 80, 30, 0.35), 0 12px 40px rgba(0, 0, 0, 0.8);
  color: #3b2a14;
  font-family: 'Georgia', 'Times New Roman', serif;
}

.rl-head { display: flex; align-items: flex-start; gap: 12px; }
.rl-seal {
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
  font-size: 18px;
}
.rl-head-text { flex: 1; min-width: 0; }
.rl-title { margin: 2px 0 2px; font-size: 18px; color: #3b2a14; letter-spacing: 0.5px; }
.rl-sub { margin: 0; font-size: 12px; color: #6b5030; }
.rl-close {
  flex: none;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: #6b5030;
  font-size: 16px;
  cursor: pointer;
}
.rl-close:hover { background: rgba(92, 66, 32, 0.12); color: #3b2a14; }

.rl-field { display: flex; flex-direction: column; gap: 5px; }
.rl-fieldset { margin: 0; padding: 0; border: none; min-width: 0; }
.rl-label {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 0;
  font-size: 12px;
  font-weight: bold;
  color: #5c4220;
  letter-spacing: 0.5px;
}
.rl-count { margin-left: auto; font-weight: normal; font-size: 11px; color: #8a6a3a; font-variant-numeric: tabular-nums; }
.rl-optional { font-weight: normal; color: #8a6a3a; }

.rl-type-row { display: flex; flex-wrap: wrap; gap: 6px; }
.rl-type {
  flex: 1 1 auto;
  min-height: 40px;
  padding: 8px 12px;
  border-radius: 999px;
  border: 1px solid rgba(92, 66, 32, 0.45);
  background: rgba(255, 250, 235, 0.45);
  color: #5c4220;
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;
  transition: 0.15s;
}
.rl-type.active {
  border-color: #6b4f1c;
  background: linear-gradient(to bottom, #b08a34 0%, #8a6a22 48%, #6b501a 100%);
  color: #2a1d06;
  font-weight: bold;
}

.rl-input {
  width: 100%;
  box-sizing: border-box;
  padding: 10px 12px;
  border-radius: 3px;
  border: 1px solid rgba(92, 66, 32, 0.45);
  background: rgba(255, 250, 235, 0.6);
  box-shadow: inset 0 1px 3px rgba(92, 66, 32, 0.2);
  color: #2a1d0c;
  font-family: inherit;
  /* ต่ำกว่า 16px แล้ว iPhone จะซูมหน้าจอทุกครั้งที่แตะช่องกรอก */
  font-size: 16px;
}
.rl-input::placeholder { color: rgba(92, 66, 32, 0.55); }
.rl-input:focus { outline: none; border-color: #8a2a1c; background: rgba(255, 252, 242, 0.85); }
.rl-textarea { resize: vertical; min-height: 120px; line-height: 1.5; }

/* honeypot — ซ่อนจากคน แต่ยังอยู่ในฟอร์มให้บอทเห็น */
.rl-hp { position: absolute; left: -9999px; width: 1px; height: 1px; opacity: 0; }

.rl-diag {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
  padding: 10px 12px;
  border-radius: 3px;
  border: 1px dashed rgba(92, 66, 32, 0.4);
  background: rgba(92, 66, 32, 0.06);
}
.rl-check { display: flex; align-items: center; gap: 8px; flex: 1 1 220px; font-size: 13px; color: #3b2a14; cursor: pointer; }
.rl-check input { width: 18px; height: 18px; accent-color: #8a2a1c; }
.rl-link {
  padding: 4px 0;
  border: none;
  background: none;
  color: #8a2a1c;
  font-family: inherit;
  font-size: 12px;
  text-decoration: underline;
  cursor: pointer;
}
.rl-pre {
  flex-basis: 100%;
  margin: 4px 0 0;
  padding: 10px;
  max-height: 180px;
  overflow: auto;
  border-radius: 3px;
  background: rgba(40, 28, 12, 0.92);
  color: #e8d5a8;
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 10px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
}

.rl-note,
.rl-error {
  margin: 0;
  padding: 8px 12px;
  border-radius: 3px;
  font-size: 12px;
  line-height: 1.5;
}
.rl-note { background: rgba(92, 66, 32, 0.1); color: #5c4220; }
.rl-error { background: rgba(138, 42, 28, 0.12); border: 1px solid rgba(138, 42, 28, 0.35); color: #7a2414; }

.rl-actions { display: flex; gap: 8px; }
.rl-btn {
  flex: 1;
  min-height: 46px;
  padding: 10px 14px;
  border-radius: 3px;
  font-family: inherit;
  font-size: 14px;
  cursor: pointer;
  transition: 0.15s;
}
.rl-btn-copy {
  border: 1px solid rgba(92, 66, 32, 0.5);
  background: rgba(255, 250, 235, 0.5);
  color: #5c4220;
}
.rl-btn-copy:hover { background: rgba(255, 250, 235, 0.8); }
/* ปุ่มแผ่นทองเหลือง — ชุดเดียวกับปุ่มยืนยันหลักทั้งแอป */
.rl-btn-send {
  flex: 2;
  border: 1px solid #6b4f1c;
  background: linear-gradient(to bottom, #b08a34 0%, #8a6a22 48%, #6b501a 100%);
  color: #2a1d06;
  font-weight: bold;
  text-shadow: 0 1px 0 rgba(255, 225, 170, 0.35);
  box-shadow: inset 0 1px 0 rgba(255, 230, 180, 0.4), 0 2px 6px rgba(60, 40, 15, 0.4);
}
.rl-btn-send:hover:not(:disabled) { background: linear-gradient(to bottom, #c99f42 0%, #9d7a29 48%, #7a5c1f 100%); }
.rl-btn-send:disabled { opacity: 0.5; cursor: not-allowed; }

.rl-done { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 18px 0 4px; text-align: center; }
.rl-done-title { margin: 0; font-size: 18px; font-weight: bold; color: #2f5a36; }
.rl-done-sub { margin: 0 0 10px; font-size: 13px; color: #5c4220; }
.rl-done .rl-btn { flex: none; min-width: 160px; }

.report-fade-enter-active,
.report-fade-leave-active { transition: opacity 0.2s ease; }
.report-fade-enter-active .report-letter,
.report-fade-leave-active .report-letter { transition: transform 0.25s cubic-bezier(0.22, 1, 0.36, 1); }
.report-fade-enter-from,
.report-fade-leave-to { opacity: 0; }
.report-fade-enter-from .report-letter,
.report-fade-leave-to .report-letter { transform: translateY(14px) scale(0.98); }
</style>
