<script setup>
import { computed, ref } from 'vue'
import { useRoomStore } from '@/stores/room'
import { diagnosticsText, diagLog, clearDiagLog } from '@/services/diagnostics'

// ต้องวางได้ทั้งหน้าเลือกตัวละครและหน้า Setting
// หน้า Setting อยู่หลัง route guard ที่ต้องมี hunterId — ถ้าเข้าตัวละครไม่ได้ก็เข้าไปไม่ถึง
// ซึ่งเป็นสถานการณ์ที่ต้องใช้ข้อมูลนี้มากที่สุดพอดี
const room = useRoomStore()

const show = ref(false)
const copied = ref(false)

const text = computed(() =>
  diagnosticsText({ inRoom: room.inRoom, roomCode: room.roomCode ?? null, isHost: room.isHost }),
)

const copy = async () => {
  const payload = text.value
  try {
    await navigator.clipboard.writeText(payload)
  } catch {
    // Safari บล็อก clipboard API ถ้าหน้าไม่ใช่ https หรือไม่ได้มาจาก gesture โดยตรง
    // ถอยไปใช้วิธีเก่าที่ใช้ได้ทุกที่ ดีกว่าปล่อยให้กดแล้วเงียบ
    const ta = document.createElement('textarea')
    ta.value = payload
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    try { document.execCommand('copy') } catch { /* คัดลอกไม่ได้จริง ๆ — ยังลากเลือกจากกล่องเองได้ */ }
    document.body.removeChild(ta)
  }
  copied.value = true
  setTimeout(() => { copied.value = false }, 2000)
}
</script>

<template>
  <div class="diag-box">
    <button class="diag-toggle" @click="show = !show">
      <span>🛠 ข้อมูลระบบ</span>
      <span class="diag-arrow">{{ show ? '▼' : '▶' }}</span>
    </button>
    <div v-if="show" class="diag-body">
      <p class="diag-hint">
        เจอปัญหาใช้งาน? กดคัดลอกแล้วส่งข้อความนี้ให้ผู้พัฒนา จะช่วยให้หาสาเหตุได้เร็วขึ้นมาก
      </p>
      <pre class="diag-pre">{{ text }}</pre>
      <div class="diag-actions">
        <button class="diag-copy" @click="copy">
          {{ copied ? '✓ คัดลอกแล้ว' : '📋 คัดลอกข้อมูลระบบ' }}
        </button>
        <button v-if="diagLog.length" class="diag-clear" @click="clearDiagLog">
          ล้างประวัติ error ({{ diagLog.length }})
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.diag-box {
  margin-top: 14px;
  border: 1px solid rgba(124, 90, 43, 0.4);
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.25);
  overflow: hidden;
}
.diag-toggle {
  width: 100%;
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 14px;
  background: none;
  border: none;
  color: #a88040;
  font-family: 'Georgia', 'Times New Roman', serif;
  font-size: 13px;
  cursor: pointer;
}
.diag-arrow { font-size: 10px; opacity: 0.7; }
.diag-body { padding: 0 12px 12px; }
.diag-hint {
  margin: 0 0 8px;
  font-size: 11px;
  line-height: 1.6;
  color: #7c5a2b;
}
.diag-pre {
  margin: 0 0 10px;
  padding: 10px;
  max-height: 220px;
  overflow: auto;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(124, 90, 43, 0.25);
  color: #c4a060;
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 10px;
  line-height: 1.5;
  /* ข้อความยาวมาก ต้องตัดบรรทัดไม่งั้นดันหน้าจอกว้างออกไปทั้งหน้า */
  white-space: pre-wrap;
  word-break: break-all;
  user-select: all;
}
.diag-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.diag-copy,
.diag-clear {
  min-height: 44px;
  padding: 10px 16px;
  border-radius: 6px;
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
}
.diag-copy {
  border: 1px solid rgba(0, 200, 150, 0.55);
  background: rgba(0, 200, 150, 0.14);
  color: #6ee7c0;
}
.diag-clear {
  border: 1px solid rgba(124, 90, 43, 0.5);
  background: rgba(124, 90, 43, 0.14);
  color: #a88040;
}
</style>
