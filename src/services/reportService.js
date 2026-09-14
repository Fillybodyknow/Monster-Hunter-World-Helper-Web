// ส่งรายงานบั๊ก / ไอเดีย ไปที่ Cloudflare Worker (workers/report) ซึ่งส่งต่อเข้า LINE ของผู้พัฒนา
import { buildDiagnostics } from './diagnostics'

// URL ของ Worker ไม่ใช่ความลับ ใครเปิดแอปก็เห็นได้ — token ของ LINE อยู่ฝั่ง Worker เท่านั้น
// ยังว่างอยู่ = ยังไม่ได้ deploy Worker ปุ่มรายงานจะมีแค่ "คัดลอก"
// VITE_REPORT_URL ใช้ชี้ไปที่ Worker ในเครื่องตอนทดสอบ (npx wrangler dev)
const PRODUCTION_REPORT_URL = 'https://mhw-report.mhw-helper.workers.dev'
const REPORT_URL = (import.meta.env.VITE_REPORT_URL || PRODUCTION_REPORT_URL).replace(/\/+$/, '')
export const reportEnabled = !!REPORT_URL

export const REPORT_TYPES = [
  { id: 'bug', label: '🐞 บั๊ก' },
  { id: 'idea', label: '💡 ไอเดีย' },
  { id: 'rule', label: '📖 กฎไม่ตรง Rulebook' },
]
// ต้องตรงกับ LIMITS ใน workers/report/src/index.js — เกินกว่านี้ Worker ตัดทิ้ง
export const REPORT_LIMITS = { subject: 120, message: 3000, contact: 100 }

// ข้อมูลระบบฉบับย่อสำหรับแนบ — LINE รับข้อความได้ไม่เกิน 5,000 ตัวอักษร
// ตัดของที่ยาวแต่ไม่ช่วยหาสาเหตุ (รายชื่อ key ใน storage) และ hunterId ออก เหลือ error 3 รายการล่าสุด
export const buildReportDiagnostics = (extra) => {
  const d = buildDiagnostics(extra)
  const errors = Array.isArray(d.errors) ? d.errors : []
  return {
    build: d.build,
    at: d.at,
    route: d.route,
    screen: d.screen,
    ua: d.ua,
    online: d.online,
    hunterCount: d.hunterCount,
    storageWritable: d.storageWritable,
    inRoom: d.inRoom ?? false,
    roomCode: d.roomCode ?? null,
    isHost: d.isHost ?? false,
    errorCount: errors.length,
    errors: errors.slice(-3).map((e) => ({ at: e.at, source: e.source, message: e.message })),
  }
}

// ฉบับข้อความธรรมดาไว้คัดลอกส่งทางอื่น — ใช้ตอนยังไม่เปิด Worker หรือส่งไม่สำเร็จ
export const formatReportText = ({ type, subject, message, contact, diagnostics }) => {
  const label = REPORT_TYPES.find((t) => t.id === type)?.label ?? type
  return [
    `📮 ${label}: ${subject || '(ไม่มีหัวข้อ)'}`,
    contact ? `ติดต่อกลับ: ${contact}` : null,
    '',
    message || '(ไม่มีรายละเอียด)',
    diagnostics ? `\n🛠 ข้อมูลระบบ\n${JSON.stringify(diagnostics, null, 2)}` : null,
  ]
    .filter((line) => line !== null)
    .join('\n')
}

const MESSAGES = {
  rate: 'ส่งถี่เกินไป รอสักครู่แล้วลองใหม่',
  'line-limit': 'ช่องทางรายงานเต็มชั่วคราว กดคัดลอกแล้วส่งทางช่องทางอื่นแทนได้',
  'not-configured': 'ระบบส่งรายงานยังไม่เปิดใช้ กดคัดลอกแล้วส่งทางช่องทางอื่นแทนได้',
  invalid: 'ข้อมูลไม่ครบ ตรวจหัวข้อและรายละเอียดอีกครั้ง',
  network: 'ส่งไม่สำเร็จ ตรวจอินเทอร์เน็ตแล้วลองใหม่',
}

export class ReportError extends Error {
  constructor(code, status) {
    super(code)
    this.code = code
    this.userMessage =
      MESSAGES[code] ?? `ส่งไม่สำเร็จ (${status ?? code}) ลองใหม่อีกครั้ง หรือกดคัดลอกแล้วส่งทางอื่น`
  }
}

export const sendReport = async (payload) => {
  if (!reportEnabled) throw new ReportError('not-configured')
  const ctrl = new AbortController()
  // เน็ตมือถือค้างได้นาน — ไม่ให้ปุ่มหมุนค้างไม่มีที่สิ้นสุด
  const timer = setTimeout(() => ctrl.abort(), 15000)
  let res
  try {
    res = await fetch(`${REPORT_URL}/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    })
  } catch {
    throw new ReportError('network')
  } finally {
    clearTimeout(timer)
  }
  if (res.ok) return
  let code = res.status === 429 ? 'rate' : null
  if (!code) {
    try {
      code = (await res.json())?.error ?? null
    } catch {
      code = null
    }
  }
  throw new ReportError(code ?? 'server', res.status)
}
