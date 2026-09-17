#!/usr/bin/env node
// ทดสอบผู้ช่วยแจกเต๋า (src/services/rewardPlanner.js) เทียบกับการไล่ลองทุกแบบตรง ๆ — `npm test`
// สุ่มเต๋าหลายพันชุด (มีลูกที่ใช้ไปแล้วปน) แล้วต้องได้คำตอบเดียวกับวิธีไล่ครบทุก subset
import { reachableRows, pickDiceForRow, MAX_ROW } from '../src/services/rewardPlanner.js'

let failures = 0
let checks = 0
const expect = (cond, msg) => {
  checks++
  if (!cond && failures++ < 10) console.log('  ✗ ' + msg)
}

// สุ่มแบบกำหนด seed ได้ — ถ้าพังจะได้ชุดเดิมกลับมาไล่ดู
let seed = 20260917
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)
const d6 = () => 1 + Math.floor(rand() * 6)

const bruteSubsets = (dice) => {
  const pool = dice.filter((d) => !d.spent)
  const out = []
  for (let mask = 1; mask < 1 << pool.length; mask++) {
    const pick = pool.filter((_, i) => mask & (1 << i))
    out.push({ pick, sum: pick.reduce((s, d) => s + d.value, 0) })
  }
  return out
}
const bruteReach = (dice) => new Set(bruteSubsets(dice).map((s) => s.sum).filter((s) => s <= MAX_ROW))

for (let round = 0; round < 3000; round++) {
  const n = Math.floor(rand() * 11) // 0-10 ลูก
  const dice = Array.from({ length: n }, (_, i) => ({ id: i, value: d6(), spent: rand() < 0.25 }))
  const label = JSON.stringify(dice.map((d) => (d.spent ? `(${d.value})` : d.value)))

  // 1) แถวที่ลงได้ต้องตรงกับการไล่ทุก subset
  const reach = reachableRows(dice)
  const brute = bruteReach(dice)
  expect([...reach].sort().join() === [...brute].sort().join(), `reachable ${label}: ได้ ${[...reach]} ควรเป็น ${[...brute]}`)

  // 2) เต๋าที่ยังไม่ใช้ทุกลูกต้องลงแถวได้เสมอ (กติกา "ต้องใช้ให้หมด" จะไม่มีวันติด)
  for (const d of dice.filter((x) => !x.spent)) expect(reach.has(d.value), `เต๋า ${d.value} ลงไม่ได้ ${label}`)

  for (let row = 1; row <= MAX_ROW; row++) {
    const ids = pickDiceForRow(dice, row)
    const options = bruteSubsets(dice).filter((s) => s.sum === row)
    if (!options.length) {
      expect(ids === null, `แถว ${row} รวมไม่ได้แต่ได้ ${ids} ${label}`)
      continue
    }
    expect(Array.isArray(ids), `แถว ${row} รวมได้แต่คืน null ${label}`)
    if (!Array.isArray(ids)) continue

    // 3) id ต้องเป็นเต๋าที่ยังไม่ใช้ ไม่ซ้ำ และรวมได้เลขแถวพอดี
    const picked = ids.map((id) => dice.find((d) => d.id === id))
    expect(new Set(ids).size === ids.length, `แถว ${row} หยิบเต๋าซ้ำ ${ids} ${label}`)
    expect(picked.every((d) => d && !d.spent), `แถว ${row} หยิบเต๋าที่ใช้ไปแล้ว ${ids} ${label}`)
    expect(picked.reduce((s, d) => s + (d?.value ?? 0), 0) === row, `แถว ${row} ผลรวมไม่ตรง ${ids} ${label}`)

    // 4) ใช้เต๋าน้อยลูกที่สุดเท่าที่ทำได้
    const fewest = Math.min(...options.map((o) => o.pick.length))
    expect(ids.length === fewest, `แถว ${row} ใช้ ${ids.length} ลูก ทั้งที่ ${fewest} ลูกก็พอ ${label}`)

    // 5) ในชุดที่ใช้น้อยลูกที่สุด เต๋าที่เหลือต้องรวมได้หลายแถวที่สุด
    const leftReach = (pick) => bruteReach(dice.map((d) => (pick.some((p) => p.id === d.id) ? { ...d, spent: true } : d))).size
    const bestReach = Math.max(...options.filter((o) => o.pick.length === fewest).map((o) => leftReach(o.pick)))
    expect(leftReach(picked) === bestReach, `แถว ${row} เหลือทางเลือก ${leftReach(picked)} แถว ทั้งที่ทำได้ ${bestReach} ${label}`)

    // 6) เรียกซ้ำต้องได้ผลเดิม
    expect(JSON.stringify(pickDiceForRow(dice, row)) === JSON.stringify(ids), `แถว ${row} ผลไม่คงที่ ${label}`)
  }
}

// 7) เต๋าเยอะมาก (ปรับจำนวนเต๋าเองได้) ต้องยังเร็ว
const many = Array.from({ length: 60 }, (_, i) => ({ id: i, value: d6(), spent: false }))
const start = performance.now()
for (let row = 1; row <= MAX_ROW; row++) pickDiceForRow(many, row)
reachableRows(many)
const ms = performance.now() - start
expect(ms < 200, `เต๋า 60 ลูกใช้เวลา ${ms.toFixed(1)}ms`)

// 8) ตัวอย่างที่อ่านเข้าใจได้
const ex = [6, 5, 2, 1].map((value, id) => ({ id, value, spent: false }))
expect(JSON.stringify(pickDiceForRow(ex, 7)) === JSON.stringify([2, 1]), `แถว 7 จาก 6,5,2,1 ควรใช้ 5+2 เก็บ 6 ไว้ ได้ ${pickDiceForRow(ex, 7)}`)
expect(JSON.stringify(pickDiceForRow(ex, 12)?.sort()) === JSON.stringify([0, 1, 3]), 'แถว 12 จาก 6,5,2,1 ต้องได้ 6+5+1')
expect(pickDiceForRow(ex, 4) === null && pickDiceForRow(ex, 10) === null, 'แถว 4 กับ 10 จาก 6,5,2,1 ต้องรวมไม่ได้')
expect([...reachableRows(ex)].sort((a, b) => a - b).join() === '1,2,3,5,6,7,8,9,11,12', `แถวที่ลงได้จาก 6,5,2,1 ได้ ${[...reachableRows(ex)]}`)

console.log(`rewardPlanner: ตรวจ ${checks} จุด (เต๋า 60 ลูก ${ms.toFixed(1)}ms)`)
if (failures) {
  console.log(`พัง ${failures} จุด`)
  process.exit(1)
}
console.log('ผ่านทั้งหมด')
