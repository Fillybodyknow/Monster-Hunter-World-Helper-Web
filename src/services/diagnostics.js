import { APP_BUILD } from './appVersion'
// เก็บ error ที่เกิดในแอปไว้ให้ผู้ใช้ส่งกลับมาได้
// ก่อนหน้านี้แอปไม่ได้ดัก error ไว้เลย เวลาผู้ใช้เจอปัญหาบนมือถือจึงไม่มีอะไรให้ดู
// ต้องเดาจากการไล่โค้ดอย่างเดียว
import { ref } from 'vue'

const LOG_KEY = 'diagLog'
const MAX_ENTRIES = 20 // พอให้เห็นบริบท แต่ไม่กิน localStorage จนเบียดข้อมูลเกม

export const diagLog = ref(_read())

function _read() {
  try {
    const raw = JSON.parse(localStorage.getItem(LOG_KEY))
    return Array.isArray(raw) ? raw : []
  } catch {
    return []
  }
}

export const recordError = (source, err, extra = {}) => {
  try {
    const entry = {
      at: new Date().toISOString(),
      source,
      // ข้อความอย่างเดียวมักไม่พอบอกว่าเกิดตรงไหน — เก็บ stack 3 บรรทัดแรกไว้ด้วย
      name: err?.name ?? null,
      message: String(err?.message ?? err ?? '').slice(0, 300),
      stack: String(err?.stack ?? '').split('\n').slice(0, 3).join(' | ').slice(0, 400),
      route: typeof location !== 'undefined' ? location.hash || location.pathname : null,
      ...extra,
    }
    const next = [..._read(), entry].slice(-MAX_ENTRIES)
    localStorage.setItem(LOG_KEY, JSON.stringify(next))
    diagLog.value = next
  } catch {
    // localStorage เต็มหรือถูกปิด — ตัวเก็บ log ห้ามทำให้แอปพังเสียเอง
  }
}

export const clearDiagLog = () => {
  try { localStorage.removeItem(LOG_KEY) } catch { /* ไม่เป็นไร */ }
  diagLog.value = []
}

// ติดตั้งครั้งเดียวตอนแอปเริ่ม ครอบทั้ง error ปกติ, promise ที่ reject ทิ้ง และ error ในคอมโพเนนต์ Vue
export const installErrorCapture = (app) => {
  if (typeof window !== 'undefined') {
    window.addEventListener('error', (e) => recordError('window', e.error ?? e.message))
    window.addEventListener('unhandledrejection', (e) => recordError('promise', e.reason))
  }
  if (app) {
    app.config.errorHandler = (err, _vm, info) => {
      recordError('vue', err, { info })
      console.error(err) // ยังให้เห็นใน console ตามปกติ ไม่กลืนทิ้ง
    }
  }
}

const _safe = (fn, fallback = null) => { try { return fn() } catch { return fallback } }

// ข้อมูลชุดที่ผู้ใช้กดคัดลอกส่งกลับมา — เลือกเฉพาะที่ใช้วิเคราะห์ได้จริง
// ตั้งใจไม่เอาเนื้อหาตัวละคร/ของในกระเป๋า เพราะยาวและไม่ช่วยหาสาเหตุ
export const buildDiagnostics = (extra = {}) => {
  return {
    // มี version นำหน้า sha — คนที่ส่งรายงานมาอ่านเลขเวอร์ชันได้เอง ส่วน sha ใช้ชี้ commit ที่แน่นอน
    build: APP_BUILD,
    at: new Date().toISOString(),
    route: _safe(() => location.hash || location.pathname),
    // ตัวชี้ขาดของบั๊ก "กดเข้าตัวละครไม่ได้" — ถ้าค่านี้หายไปคืออาการนั้นเลย
    hunterId: _safe(() => localStorage.getItem('hunterId')),
    hunterCount: _safe(() => JSON.parse(localStorage.getItem('hunters') ?? '[]').length, 'อ่านไม่ได้'),
    lastRoomCode: _safe(() => localStorage.getItem('lastRoomCode')),
    storageKeys: _safe(() => Object.keys(localStorage).sort().join(', ')),
    // localStorage ถูกปิด/เต็ม เป็นสาเหตุที่เจอบ่อยบน iOS แต่มองไม่เห็นจากภายนอก
    storageWritable: _safe(() => {
      localStorage.setItem('__t', '1'); localStorage.removeItem('__t'); return true
    }, false),
    screen: _safe(() => `${innerWidth}x${innerHeight} @${devicePixelRatio}x`),
    ua: _safe(() => navigator.userAgent),
    online: _safe(() => navigator.onLine),
    ...extra,
    errors: diagLog.value,
  }
}

export const diagnosticsText = (extra) => JSON.stringify(buildDiagnostics(extra), null, 2)
