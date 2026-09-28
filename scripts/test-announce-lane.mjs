#!/usr/bin/env node
// ทดสอบช่องทางประกาศกลาง (src/composables/useAnnounceLane.js) — `npm test`
// กติกาที่ต้องจริงเสมอ: เล่นทีละใบ, หยุดรอเมื่อมีหน้าต่างที่ต้องกด, คิวไม่ยาวเกินกำหนด
import { createAnnounceLane } from '../src/composables/useAnnounceLane.js'

let failures = 0
let checks = 0
const expect = (cond, msg) => {
  checks++
  if (!cond && failures++ < 20) console.log('  ✗ ' + msg)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ── 1. เล่นทีละใบ ใบถัดไปรอใบแรกจบก่อน ──
{
  const lane = createAnnounceLane()
  const started = []
  lane.push({ kind: 'a', ms: 60, onStart: () => started.push('a') })
  lane.push({ kind: 'b', ms: 60, onStart: () => started.push('b') })
  expect(lane.current.value?.kind === 'a', 'ใบแรกต้องขึ้นทันที')
  expect(lane.pending.value === 1, 'ต้องบอกว่ามีอีก 1 ใบรออยู่')
  expect(started.join(',') === 'a', 'ใบที่สองต้องยังไม่เริ่ม')
  await sleep(90)
  expect(lane.current.value?.kind === 'b', 'ใบแรกจบแล้วใบสองต้องขึ้นต่อ')
  expect(started.join(',') === 'a,b', 'ใบสองเริ่มเล่นแล้ว')
  await sleep(90)
  expect(lane.current.value === null, 'หมดคิวต้องไม่มีอะไรค้าง')
}

// ── 2. มีหน้าต่างที่ต้องกดค้างอยู่ = หยุดรอ ไม่ซ้อนทับ ──
{
  const lane = createAnnounceLane()
  lane.setBlocked(true)
  const started = []
  lane.push({ kind: 'a', ms: 60, onStart: () => started.push('a') })
  expect(lane.current.value === null, 'ระหว่างบล็อกต้องไม่โชว์ประกาศ')
  expect(started.length === 0, 'ระหว่างบล็อกต้องยังไม่เริ่มเล่น')
  await sleep(100)
  expect(lane.queue.value.length === 1, 'ของที่ค้างต้องไม่หายไปเอง')
  lane.setBlocked(false)
  expect(lane.current.value?.kind === 'a', 'ปิดหน้าต่างแล้วประกาศต้องเล่นต่อ')
  expect(started.length === 1, 'เริ่มเล่นตอนปลดบล็อก')
  await sleep(90)
  expect(lane.current.value === null, 'เล่นจบแล้วออกจากคิว')
}

// ── 3. บล็อกกลางคัน: ใบที่ค้างต้องได้เล่นใหม่เต็มเวลา ไม่หายไปเงียบ ──
{
  const lane = createAnnounceLane()
  let starts = 0
  lane.push({ kind: 'a', ms: 80, onStart: () => starts++ })
  await sleep(30)
  lane.setBlocked(true)
  expect(lane.current.value === null, 'บล็อกแล้วต้องซ่อนของที่กำลังเล่น')
  await sleep(120)
  expect(lane.queue.value.length === 1, 'ของที่ถูกบล็อกต้องยังอยู่ในคิว')
  lane.setBlocked(false)
  expect(starts === 2, 'กลับมาแล้วต้องเริ่มเล่นใบเดิมใหม่ให้เห็นเต็ม ๆ')
  await sleep(110)
  expect(lane.current.value === null, 'เล่นจบแล้วออกจากคิว')
}

// ── 4. แตะข้าม ──
{
  const lane = createAnnounceLane()
  lane.push({ kind: 'a', ms: 500 })
  lane.push({ kind: 'b', ms: 50 })
  lane.skip()
  expect(lane.current.value?.kind === 'b', 'แตะข้ามแล้วไปใบถัดไปทันที')
  lane.skip()
  expect(lane.current.value === null, 'ข้ามใบสุดท้ายแล้วคิวว่าง')
  lane.skip() // ข้ามตอนคิวว่างต้องไม่พัง
  expect(lane.queue.value.length === 0, 'ข้ามตอนคิวว่างแล้วต้องไม่มีอะไรเพี้ยน')
}

// ── 5. คิวล้น: ทิ้งใบเก่าที่ยังไม่ได้เล่น ใบที่กำลังเล่นไม่หาย ──
{
  const lane = createAnnounceLane({ max: 3 })
  lane.push({ kind: 'playing', ms: 400 })
  for (const k of ['x1', 'x2', 'x3', 'x4']) lane.push({ kind: k, ms: 50 })
  expect(lane.queue.value.length === 3, `คิวต้องไม่เกิน 3 (ได้ ${lane.queue.value.length})`)
  expect(lane.current.value?.kind === 'playing', 'ใบที่กำลังเล่นต้องไม่ถูกทิ้ง')
  expect(lane.queue.value.map((q) => q.kind).join(',') === 'playing,x3,x4', `ต้องเก็บใบใหม่สุดไว้ (ได้ ${lane.queue.value.map((q) => q.kind).join(',')})`)
}

// ── 6. ล้างคิว (เริ่มล่าใหม่ / หลุดแล้วกลับเข้ามา) ──
{
  const lane = createAnnounceLane()
  lane.push({ kind: 'a', ms: 1000 })
  lane.push({ kind: 'b', ms: 1000 })
  lane.clear()
  expect(lane.current.value === null && lane.queue.value.length === 0, 'ล้างคิวแล้วต้องว่างทันที')
  lane.push({ kind: 'c', ms: 40 })
  expect(lane.current.value?.kind === 'c', 'ล้างแล้วยังใช้งานต่อได้')
  await sleep(80)
  expect(lane.current.value === null, 'ของใหม่เล่นจบตามปกติ')
}

console.log(failures ? `\n✗ ไม่ผ่าน ${failures} จาก ${checks} ข้อ` : `✓ ผ่านทั้งหมด ${checks} ข้อ`)
process.exit(failures ? 1 : 0)
