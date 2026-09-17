#!/usr/bin/env node
// ทดสอบผู้ช่วยแจกเต๋า (src/services/rewardPlanner.js) เทียบกับการไล่ลองทุกแบบตรง ๆ — `npm test`
// สุ่มเต๋าหลายพันชุด (มีลูกที่ใช้ไปแล้วปน) แล้วต้องได้คำตอบเดียวกับวิธีไล่ครบทุก subset
import { reachableRows, pickDiceForRow, planRewards, SCORE, EXACT_DICE_LIMIT, MAX_ROW } from '../src/services/rewardPlanner.js'

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


// ================= เฟส 2: แผนแนะนำ =================
// เขียนสูตรคะแนนซ้ำตรงนี้แยกจากตัวจริง ใช้เป็นสเปก — ถ้าสองฝั่งไม่ตรงกัน แปลว่ามีฝั่งหนึ่งผิด
const specScore = (rows, table, needs, usage, claimed) => {
  const rowItem = new Map(table.map((r) => [r.rolled_number, r.reward.resource_type_id + '-' + r.reward.item_id]))
  const perItem = new Map()
  for (const k of rowItem.values()) perItem.set(k, (perItem.get(k) ?? 0) + 1)
  const have = new Map()
  for (const c of claimed) { const k = c.resource_type_id + '-' + c.item_id; have.set(k, (have.get(k) ?? 0) + c.quantity) }
  let total = 0
  for (const row of rows) {
    const key = rowItem.get(row)
    const k = (have.get(key) ?? 0) + 1
    have.set(key, k)
    const short = needs.get(key)?.short ?? 0
    if (k <= short) { total += SCORE.NEED; continue }
    const type = Number(key.split('-')[0])
    let base = type === 3 ? SCORE.PART : type === 2 ? SCORE.OTHER : SCORE.COMMON
    if (type !== 1 && perItem.get(key) === 1) base += SCORE.UNIQUE_ROW
    base += Math.min(usage.get(key) ?? 0, SCORE.RECIPE_MAX)
    total += base * SCORE.REPEAT_DECAY ** (k - short - 1)
  }
  return total
}
// ไล่ทุกวิธีแบ่งเต๋าทีละลูก (ไม่ใช้เทคนิคใด ๆ ของตัวจริง)
const bruteBest = (dice, table, needs, usage, claimed) => {
  const pool = dice.filter((d) => !d.spent).map((d) => d.value)
  let best = -1
  const walk = (rest, rows) => {
    if (!rest.length) { best = Math.max(best, specScore(rows, table, needs, usage, claimed)); return }
    const [first, ...others] = rest
    for (let mask = 0; mask < 1 << others.length; mask++) {
      let sum = first
      const left = []
      others.forEach((v, i) => ((mask >> i) & 1 ? (sum += v) : left.push(v)))
      if (sum <= MAX_ROW) walk(left, [...rows, sum])
    }
  }
  walk(pool, [])
  return best
}
const randomTable = () => Array.from({ length: 12 }, (_, i) => ({
  rolled_number: i + 1,
  reward: { resource_type_id: 1 + Math.floor(rand() * 3), item_id: 1 + Math.floor(rand() * 6) },
}))

for (let round = 0; round < 1500; round++) {
  const n = 1 + Math.floor(rand() * 7) // 1-7 ลูก
  const dice = Array.from({ length: n }, (_, i) => ({ id: i, value: d6(), spent: rand() < 0.15 }))
  if (!dice.some((d) => !d.spent)) dice[0].spent = false
  const table = randomTable()
  const needs = new Map()
  for (const r of table) if (rand() < 0.2) needs.set(r.reward.resource_type_id + '-' + r.reward.item_id, { short: 1 + Math.floor(rand() * 2), targets: ['เป้า'] })
  const usage = new Map(table.map((r) => [r.reward.resource_type_id + '-' + r.reward.item_id, Math.floor(rand() * 8)]))
  const claimed = rand() < 0.3 ? [{ ...table[Math.floor(rand() * 12)].reward, quantity: 1 }] : []
  const label = JSON.stringify(dice.map((d) => (d.spent ? '(' + d.value + ')' : d.value)))

  const plan = planRewards({ dice, table, needs, usage, claimed })
  expect(!!plan && plan.exact, 'ไม่ได้แผน ' + label)
  if (!plan) continue

  // ใช้เต๋าที่ยังไม่ใช้ครบทุกลูก ลูกละครั้ง และผลรวมทุกกลุ่มตรงเลขแถว
  const used = plan.groups.flatMap((g) => g.diceIds)
  const unspentIds = dice.filter((d) => !d.spent).map((d) => d.id).sort()
  expect(JSON.stringify([...used].sort()) === JSON.stringify(unspentIds), 'ใช้เต๋าไม่ครบ/ซ้ำ ' + label + ' → ' + JSON.stringify(plan.groups))
  for (const g of plan.groups) {
    const sum = g.diceIds.reduce((s, id) => s + dice.find((d) => d.id === id).value, 0)
    expect(sum === g.row, 'กลุ่มแถว ' + g.row + ' รวมได้ ' + sum + ' ' + label)
  }
  // คะแนนเท่ากับวิธีที่ดีที่สุดจากการไล่ทุกแบบ
  const got = specScore(plan.groups.map((g) => g.row), table, needs, usage, claimed)
  const best = bruteBest(dice, table, needs, usage, claimed)
  expect(Math.abs(got - best) < 1e-6, 'แผนได้ ' + got.toFixed(2) + ' แต่ดีสุดคือ ' + best.toFixed(2) + ' ' + label)
  // กลุ่มแรกคือกลุ่มที่ค่าสูงสุด
  for (let i = 1; i < plan.groups.length; i++) expect(plan.groups[i - 1].value >= plan.groups[i].value - 1e-9, 'ลำดับกลุ่มไม่เรียงตามค่า ' + label)
  // กลุ่มที่ได้ของที่ขาดต้องบอกเหตุผลว่าขาด
  for (const g of plan.groups) {
    if (g.value === SCORE.NEED) expect(g.reason.kind === 'need' && g.reason.short >= 1, 'กลุ่มของที่ขาดไม่มีเหตุผล need ' + label)
  }
}

// ตัวอย่างจากแผน: Rathalos ★1 เต๋า 6,4,2,1 ขาด Shell (แถว 10) กับ Scale (แถว 3) → ต้องแนะนำ 6+4 และ 2+1
{
  const rath = [[1,'3-24'],[2,'1-10'],[3,'3-22'],[4,'3-19'],[5,'3-23'],[6,'3-17'],[7,'3-25'],[8,'3-18'],[9,'3-21'],[10,'3-20'],[11,'3-16'],[12,'2-9']]
    .map(([n, k]) => ({ rolled_number: n, reward: { resource_type_id: Number(k.split('-')[0]), item_id: Number(k.split('-')[1]) } }))
  const dice = [6, 4, 2, 1].map((value, id) => ({ id, value, spent: false }))
  const needs = new Map([['3-20', { short: 1, targets: ['Rathalos Mail'] }], ['3-22', { short: 1, targets: ['Rathalos Helm'] }]])
  const plan = planRewards({ dice, table: rath, needs })
  const rows = plan.groups.map((g) => g.row).sort((a, b) => a - b).join()
  expect(rows === '3,10', 'ตัวอย่าง Rathalos ควรแนะนำแถว 3 กับ 10 ได้ ' + rows)
  expect(plan.groups.every((g) => g.reason.kind === 'need'), 'ตัวอย่าง Rathalos ทุกกลุ่มต้องมีเหตุผล need')
  // ไม่มีรายการติดตาม → ยังแนะนำได้ (ตามความหายาก) และไม่มีกลุ่มไหนอ้างว่าขาด
  const plain = planRewards({ dice, table: rath })
  expect(plain && plain.groups.every((g) => g.reason.kind !== 'need'), 'ไม่มีรายการติดตามแต่มีเหตุผล need')
}

// เต๋าเยอะเกินไล่ทุกแบบ → ใช้วิธีทีละกลุ่ม ยังต้องใช้เต๋าครบและผลรวมถูก
{
  const dice = Array.from({ length: 25 }, (_, i) => ({ id: i, value: d6(), spent: false }))
  const table = randomTable()
  const t0 = performance.now()
  const plan = planRewards({ dice, table })
  const greedyMs = performance.now() - t0
  expect(plan && !plan.exact, 'เต๋า 25 ลูกควรใช้วิธีทีละกลุ่ม')
  expect(plan && plan.groups.flatMap((g) => g.diceIds).length === 25, 'เต๋า 25 ลูกใช้ไม่ครบ')
  for (const g of plan?.groups ?? []) expect(g.diceIds.reduce((s, id) => s + dice[id].value, 0) === g.row, 'เต๋า 25 ลูก กลุ่มผลรวมผิด')
  expect(greedyMs < 1000, 'เต๋า 25 ลูกใช้เวลา ' + greedyMs.toFixed(0) + 'ms')
  // เคสไล่ทุกแบบที่หนักที่สุด
  const ten = Array.from({ length: EXACT_DICE_LIMIT }, (_, i) => ({ id: i, value: 1 + (i % 3), spent: false }))
  const t1 = performance.now()
  const planTen = planRewards({ dice: ten, table })
  const exactMs = performance.now() - t1
  expect(planTen?.exact, 'เต๋า 10 ลูกควรไล่ทุกแบบ')
  expect(exactMs < 1500, 'เต๋า 10 ลูก (หน้าเล็ก แบ่งได้เยอะสุด) ใช้เวลา ' + exactMs.toFixed(0) + 'ms')
  console.log('เวลา: เต๋า 10 ลูกไล่ทุกแบบ ' + exactMs.toFixed(0) + 'ms · เต๋า 25 ลูกทีละกลุ่ม ' + greedyMs.toFixed(0) + 'ms')
}

console.log(`rewardPlanner: ตรวจ ${checks} จุด (เต๋า 60 ลูก ${ms.toFixed(1)}ms)`)
if (failures) {
  console.log(`พัง ${failures} จุด`)
  process.exit(1)
}
console.log('ผ่านทั้งหมด')
