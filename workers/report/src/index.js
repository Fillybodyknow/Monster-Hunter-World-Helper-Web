// รับรายงานบั๊ก / ไอเดีย จากแอป แล้วส่งต่อเข้า LINE ของผู้พัฒนา
// แอปเป็นเว็บ static บน GitHub Pages ซ่อนความลับไม่ได้ — Channel Access Token จึงอยู่ที่นี่ในรูป secret เท่านั้น
//
//   POST /report        แอปส่งรายงานมา → push ข้อความเข้า LINE_TO
//   POST /line-webhook  webhook ของ LINE — ช่วงตั้งค่าใช้บอก User ID / Group ID (LINE_ID_HELPER = "on")
//   GET  /health        เช็คว่าตั้งค่าครบไหม (ตอบแค่ true/false ไม่เผยค่าจริง)

const LINE_API = 'https://api.line.me/v2/bot/message'
// LINE รับข้อความ text ได้ไม่เกิน 5,000 ตัวอักษร — ตัดตามความยาว UTF-16 ซึ่งเข้มกว่านับตามตัวอักษรจริง ยังไงก็ไม่เกิน
const LINE_TEXT_MAX = 5000
const DIAG_TEXT_MAX = 1800
const MAX_BODY_BYTES = 32 * 1024
const TYPES = { bug: '🐞 บั๊ก', idea: '💡 ไอเดีย', rule: '📖 กฎไม่ตรง Rulebook' }
// ต้องตรงกับ REPORT_LIMITS ใน src/services/reportService.js ของแอป
const LIMITS = { subject: 120, message: 3000, contact: 100 }
const SEP = '\n━━━━━━━━━━\n'

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url)
    if (pathname === '/report') return handleReport(request, env)
    if (pathname === '/line-webhook') return handleWebhook(request, env)
    if (pathname === '/health') return handleHealth(env)
    return new Response('Not found', { status: 404 })
  },
}

// ── helpers ──────────────────────────────────────────────
const json = (status, body, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  })

const allowedOrigins = (env) =>
  String(env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)

const corsHeaders = (origin) => ({
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
  Vary: 'Origin',
})

const truncate = (text, max) => {
  if (text.length <= max) return text
  let cut = text.slice(0, max - 1)
  // อย่าตัดกลางอีโมจิ (surrogate pair) ไม่งั้นท้ายข้อความเป็นตัวอักษรเสีย
  if (/[\uD800-\uDBFF]$/.test(cut)) cut = cut.slice(0, -1)
  return cut + '…'
}

// ข้อความจากผู้ใช้: ตัดช่องว่างหัวท้าย รวม \r\n ให้เหลือ \n และจำกัดความยาว
const clean = (value, max) =>
  typeof value === 'string' ? truncate(value.replace(/\r\n?/g, '\n').trim(), max) : ''

// ค่าในข้อมูลระบบ: บรรทัดเดียว สั้น ๆ
const one = (value, max = 200) =>
  value == null ? '' : truncate(String(value).replace(/\s+/g, ' ').trim(), max)

const bangkokTime = (date) => {
  try {
    return date.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return date.toISOString()
  }
}

// ── /report ──────────────────────────────────────────────
async function handleReport(request, env) {
  const origin = request.headers.get('Origin') ?? ''
  // Origin ปลอมได้ถ้ายิงตรงไม่ผ่านเบราว์เซอร์ — ตัวนี้กันเว็บอื่นเอาปุ่มเราไปใช้ ส่วนกันสแปมเป็นหน้าที่ของ rate limit
  if (!allowedOrigins(env).includes(origin)) return json(403, { ok: false, error: 'origin' })
  const cors = corsHeaders(origin)
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (request.method !== 'POST') return json(405, { ok: false, error: 'method' }, cors)
  if (!env.LINE_CHANNEL_ACCESS_TOKEN || !env.LINE_TO) {
    return json(503, { ok: false, error: 'not-configured' }, cors)
  }

  // rate limit ไม่บังคับ — ถ้าไม่ได้ผูก binding ไว้ใน wrangler.toml ก็ข้ามไป
  // ค่าเป็นแบบประมาณ (Cloudflare นับแยกตามดาต้าเซ็นเตอร์) พอสำหรับกันคนกดรัวจนโควตา LINE หมด
  if (env.REPORT_LIMITER || env.REPORT_LIMITER_ALL) {
    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown'
    const checks = await Promise.all([
      env.REPORT_LIMITER?.limit({ key: `ip:${ip}` }),
      env.REPORT_LIMITER_ALL?.limit({ key: 'all' }),
    ])
    if (checks.some((c) => c && !c.success)) return json(429, { ok: false, error: 'rate' }, cors)
  }

  const raw = await request.text()
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
    return json(413, { ok: false, error: 'too-large' }, cors)
  }
  let body
  try {
    body = JSON.parse(raw)
  } catch {
    return json(400, { ok: false, error: 'bad-json' }, cors)
  }

  const report = {
    type: typeof body?.type === 'string' && Object.hasOwn(TYPES, body.type) ? body.type : null,
    subject: clean(body?.subject, LIMITS.subject),
    message: clean(body?.message, LIMITS.message),
    contact: clean(body?.contact, LIMITS.contact),
    diagnostics: body?.diagnostics && typeof body.diagnostics === 'object' ? body.diagnostics : null,
  }
  if (!report.type || !report.subject || !report.message) {
    return json(400, { ok: false, error: 'invalid' }, cors)
  }

  // honeypot — ช่องที่คนมองไม่เห็น ถ้ามีค่าแปลว่าบอทกรอก ตอบว่าสำเร็จแต่ไม่ส่งจริง บอทจะได้ไม่ลองใหม่
  if (typeof body?.website === 'string' && body.website.trim()) return json(200, { ok: true }, cors)

  const result = await pushToLine(env, formatReport(report, new Date()))
  if (result.ok) return json(200, { ok: true }, cors)
  return json(result.code === 'line-limit' ? 503 : 502, { ok: false, error: result.code }, cors)
}

export function formatReport({ type, subject, message, contact, diagnostics }, now) {
  const head = [
    `📮 ${TYPES[type]}`,
    `หัวข้อ: ${subject}`,
    contact ? `ติดต่อกลับ: ${contact}` : null,
    `เวลา: ${bangkokTime(now)}`,
  ]
    .filter(Boolean)
    .join('\n')
  const diag = formatDiagnostics(diagnostics)
  // หัวกับข้อมูลระบบต้องครบก่อน เพราะใช้ตามหาเรื่อง — เนื้อความได้พื้นที่เท่าที่เหลือ
  const room = LINE_TEXT_MAX - head.length - diag.length - SEP.length * 2
  const text = head + SEP + truncate(message, Math.max(room, 200)) + SEP + diag
  return truncate(text, LINE_TEXT_MAX)
}

export function formatDiagnostics(d) {
  if (!d || typeof d !== 'object') return '🛠 ไม่ได้แนบข้อมูลระบบ'
  const build = d.build && typeof d.build === 'object' ? d.build : {}
  const lines = [
    `🛠 v${one(build.version, 40) || '?'} (${one(build.sha, 20) || '?'})`,
    `หน้า: ${one(d.route, 80) || '-'} · ออนไลน์: ${one(d.online, 8) || '-'}`,
    `จอ: ${one(d.screen, 40) || '-'}`,
    `เครื่อง: ${one(d.ua, 220) || '-'}`,
    d.inRoom
      ? `Co-op: ห้อง ${one(d.roomCode, 12) || '?'}${d.isHost ? ' (Host)' : ''}`
      : 'Co-op: ไม่ได้อยู่ในห้อง',
    `Hunter: ${one(d.hunterCount, 12) || '-'} · บันทึกข้อมูลได้: ${one(d.storageWritable, 8) || '-'}`,
  ]
  const errors = Array.isArray(d.errors) ? d.errors.slice(-3) : []
  const total = Number.isFinite(d.errorCount) ? d.errorCount : errors.length
  if (errors.length) {
    lines.push(`Error ล่าสุด (${errors.length}/${total}):`)
    for (const e of errors) {
      lines.push(`• [${one(e?.source, 20)}] ${one(e?.message, 300)}${e?.at ? ` — ${one(e.at, 30)}` : ''}`)
    }
  } else {
    lines.push('Error: ไม่มี')
  }
  return truncate(lines.join('\n'), DIAG_TEXT_MAX)
}

async function pushToLine(env, text) {
  // retry key เดิมทั้งสองรอบ — ถ้ารอบแรกส่งถึงแล้วแต่คำตอบหาย LINE จะตอบ 409 แทนการส่งซ้ำ
  const retryKey = crypto.randomUUID()
  for (let attempt = 1; attempt <= 2; attempt++) {
    let res
    try {
      res = await fetch(`${LINE_API}/push`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
          'X-Line-Retry-Key': retryKey,
        },
        body: JSON.stringify({ to: env.LINE_TO, messages: [{ type: 'text', text }] }),
      })
    } catch (err) {
      console.error('LINE push network error', attempt, String(err))
      continue
    }
    if (res.ok || res.status === 409) return { ok: true }
    const detail = await res.text().catch(() => '')
    console.error('LINE push failed', res.status, detail.slice(0, 300))
    // 429 = โควตาข้อความของเดือนหมด หรือยิงถี่เกิน — ส่งซ้ำไปก็ไม่ผ่าน
    if (res.status === 429) return { ok: false, code: 'line-limit' }
    if (res.status < 500) return { ok: false, code: 'line' }
  }
  return { ok: false, code: 'line' }
}

// ── /line-webhook ────────────────────────────────────────
async function handleWebhook(request, env) {
  if (request.method !== 'POST') return new Response('ok')
  if (!env.LINE_CHANNEL_SECRET) return new Response('not configured', { status: 503 })

  // ต้องตรวจลายเซ็นกับ body ดิบก่อน parse — แก้ body แม้แต่นิดเดียวลายเซ็นจะไม่ตรง
  const raw = await request.text()
  const valid = await verifySignature(raw, request.headers.get('x-line-signature'), env.LINE_CHANNEL_SECRET)
  if (!valid) return new Response('bad signature', { status: 401 })

  let events = []
  try {
    events = JSON.parse(raw)?.events ?? []
  } catch {
    return new Response('bad json', { status: 400 })
  }

  // ช่วงตั้งค่า: ทักบอทหรือเชิญเข้ากลุ่ม แล้วบอทตอบ ID กลับ ใช้ reply จึงไม่กินโควตาข้อความ
  // ได้ ID แล้วตั้ง LINE_ID_HELPER = "off" บอทจะเงียบ
  if (env.LINE_ID_HELPER === 'on' && env.LINE_CHANNEL_ACCESS_TOKEN) {
    const replies = events
      .filter((e) => e?.replyToken && ['message', 'follow', 'join'].includes(e.type))
      .map((e) => reply(env, e.replyToken, idText(e.source)))
    await Promise.all(replies)
  }
  return new Response('ok')
}

export function idText(source) {
  if (source?.type === 'group') {
    return `Group ID ของกลุ่มนี้:\n${source.groupId}\n\nถ้าอยากให้รายงานเข้ากลุ่มนี้ ให้ตั้งค่านี้เป็น LINE_TO`
  }
  if (source?.type === 'room') {
    return `Room ID:\n${source.roomId}\n\nถ้าอยากให้รายงานเข้าห้องแชทนี้ ให้ตั้งค่านี้เป็น LINE_TO`
  }
  return `User ID ของคุณ:\n${source?.userId}\n\nถ้าอยากให้รายงานส่งมาหาคุณ ให้ตั้งค่านี้เป็น LINE_TO`
}

async function reply(env, replyToken, text) {
  try {
    const res = await fetch(`${LINE_API}/reply`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ replyToken, messages: [{ type: 'text', text }] }),
    })
    if (!res.ok) console.error('LINE reply failed', res.status, (await res.text().catch(() => '')).slice(0, 300))
  } catch (err) {
    console.error('LINE reply network error', String(err))
  }
}

export async function verifySignature(body, signature, secret) {
  if (!signature) return false
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(body)))
  let binary = ''
  for (const byte of mac) binary += String.fromCharCode(byte)
  const expected = btoa(binary)
  // เทียบแบบใช้เวลาเท่ากันทุกกรณี ไม่ให้เดาลายเซ็นทีละตัวจากเวลาตอบได้
  if (expected.length !== signature.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i)
  return diff === 0
}

// ── /health ──────────────────────────────────────────────
function handleHealth(env) {
  return json(200, {
    ok: true,
    configured: {
      LINE_CHANNEL_ACCESS_TOKEN: !!env.LINE_CHANNEL_ACCESS_TOKEN,
      LINE_CHANNEL_SECRET: !!env.LINE_CHANNEL_SECRET,
      LINE_TO: !!env.LINE_TO,
      ALLOWED_ORIGINS: allowedOrigins(env),
      LINE_ID_HELPER: env.LINE_ID_HELPER === 'on',
      rateLimit: !!(env.REPORT_LIMITER || env.REPORT_LIMITER_ALL),
    },
  })
}
