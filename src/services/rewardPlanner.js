// ผู้ช่วยแจกเต๋ารับของจากตาราง Reward — ตรรกะล้วน ไม่แตะ Vue ทดสอบแยกได้ (scripts/test-reward-planner.mjs)
//
// กติกา (ยืนยันกับผู้เล่นแล้วว่าตรงกับการเล่นจริง):
// - รวมเต๋าที่ยังไม่ใช้กี่ลูกก็ได้ ผลรวมต้องเท่าเลขแถว 1-12 → ได้ของแถวนั้น 1 ชิ้น แถวเดิมรับซ้ำได้
// - ต้องใช้เต๋าให้หมด — ไม่มีวันติด เพราะทุกตารางมีครบ 1-12 เต๋าลูกเดียวลงแถว 1-6 ได้เสมอ
//
// เฟส 1: บอกว่าแถวไหนลงได้ และหยิบเต๋าให้เมื่อผู้เล่นแตะแถวก่อน
// เฟส 2: ให้คะแนนของตามรายการติดตามคราฟต์ หาวิธีแบ่งเต๋าที่คุ้มที่สุด แล้วแนะนำทีละกลุ่ม (planRewards)

export const MAX_ROW = 12

// เต๋าหน้าเดียวกันใช้แทนกันได้ — คิดจาก "จำนวนเต๋าแต่ละหน้า" แทนการไล่ทีละลูก
// เต๋ามากแค่ไหนก็คำนวณเร็วเท่าเดิม (ปรับจำนวนเต๋าเองได้ ห้ามพึ่งการไล่ทุก subset)
const countFaces = (dice) => {
  const counts = [0, 0, 0, 0, 0, 0, 0] // index = หน้าเต๋า 1-6
  for (const d of dice) {
    if (!d.spent && d.value >= 1 && d.value <= 6) counts[d.value]++
  }
  return counts
}

// bit ที่ n เปิด = รวมได้ n พอดี (ตัดทิ้งที่เกิน 12 เพราะไม่มีแถวให้ลง)
const reachMask = (counts) => {
  const limit = (1 << (MAX_ROW + 1)) - 1
  let mask = 1 // รวม 0 ได้เสมอ (ไม่เลือกเลย)
  for (let face = 1; face <= 6; face++) {
    for (let k = 0; k < counts[face]; k++) mask = (mask | (mask << face)) & limit
  }
  return mask
}

const rowsOfMask = (mask) => {
  const rows = new Set()
  for (let n = 1; n <= MAX_ROW; n++) if (mask & (1 << n)) rows.add(n)
  return rows
}

// แถวที่เต๋าที่ยังไม่ใช้รวมกันได้
export const reachableRows = (dice) => rowsOfMask(reachMask(countFaces(dice)))

// ทุกวิธีเลือก "จำนวนเต๋าแต่ละหน้า" ที่รวมได้ target พอดี
const faceCombos = (counts, target) => {
  const out = []
  const take = [0, 0, 0, 0, 0, 0, 0]
  const walk = (face, left) => {
    if (left === 0) return out.push([...take])
    if (face === 0) return
    for (let k = Math.min(counts[face], Math.floor(left / face)); k >= 0; k--) {
      take[face] = k
      walk(face - 1, left - k * face)
    }
    take[face] = 0
  }
  walk(6, target)
  return out
}

/* เลือกเต๋าให้เมื่อผู้เล่นแตะแถวก่อน — คืน id ของเต๋า หรือ null ถ้ารวมไม่ได้
   ในหลายชุดที่รวมได้เท่ากัน เลือกชุดที่เหลือเต๋าไว้ใช้ต่อได้ดีที่สุด เรียงตามนี้:
   1) ใช้เต๋าน้อยลูกที่สุด — เหลือเต๋าไว้รับของได้อีกหลายชิ้น
   2) เต๋าที่เหลือรวมได้หลายแถวที่สุด — เหลือทางเลือกมาก
   3) เก็บเต๋าหน้าสูงไว้ — แถวเลขสูงยังลงได้ (7-12 มักเป็นชิ้นส่วนหายาก)
   ยังไม่ดูว่าของชิ้นไหนมีค่า — นั่นคืองานเฟส 2 */
export const pickDiceForRow = (dice, row) => {
  if (!(row >= 1 && row <= MAX_ROW)) return null
  const counts = countFaces(dice)
  const combos = faceCombos(counts, row)
  if (!combos.length) return null

  const scored = combos.map((take) => {
    const left = counts.map((c, face) => c - take[face])
    const used = take.reduce((a, b) => a + b, 0)
    const reach = rowsOfMask(reachMask(left)).size
    // หน้าเต๋าที่เหลือ เรียงจากสูงไปต่ำ ใช้เทียบข้อ 3
    const kept = []
    for (let face = 6; face >= 1; face--) for (let k = 0; k < left[face]; k++) kept.push(face)
    return { take, used, reach, kept }
  })
  scored.sort((a, b) => {
    if (a.used !== b.used) return a.used - b.used
    if (a.reach !== b.reach) return b.reach - a.reach
    for (let i = 0; i < Math.max(a.kept.length, b.kept.length); i++) {
      const diff = (b.kept[i] ?? 0) - (a.kept[i] ?? 0)
      if (diff) return diff
    }
    return 0
  })

  // แปลงจำนวนต่อหน้าเป็น id จริง — หยิบลูกที่ id น้อยก่อน ผลออกมาเหมือนเดิมทุกครั้ง
  const best = scored[0].take
  const ids = []
  const unspent = dice.filter((d) => !d.spent).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  for (let face = 1; face <= 6; face++) {
    let need = best[face]
    for (const d of unspent) {
      if (need === 0) break
      if (d.value === face) { ids.push(d.id); need-- }
    }
  }
  return ids
}

/* ================= เฟส 2: แผนแนะนำ =================
   ให้คะแนนของแต่ละชิ้น แล้วหาวิธีแบ่งเต๋าทั้งหมดที่ได้คะแนนรวมสูงสุด
   ผู้เล่นเห็นทีละกลุ่ม (กลุ่มที่คุ้มที่สุดก่อน) และกดรับเอง — คำนวณใหม่ทุกครั้งที่ใช้เต๋าไปหนึ่งกลุ่ม

   คะแนนต่อชิ้น เรียงตามความสำคัญ (ปรับตัวเลขได้ที่ SCORE ที่เดียว):
   1) ยังขาดสำหรับรายการติดตามคราฟต์ — ชิ้นที่อยู่ในส่วนที่ขาดได้ NEED เต็ม
   2) ชนิดของ: ชิ้นส่วนมอน > วัตถุดิบพิเศษ > Common (Common แลกที่ HQ ได้ทุกชิ้นอยู่แล้ว)
   3) ได้จากช่องเดียวในตารางนี้ = หายากกว่า
   4) ใช้คราฟได้หลายสูตร บวกนิดหน่อย
   ได้ชิ้นเดิมซ้ำเกินที่ต้องใช้ ค่าลดลงทีละ REPEAT_DECAY — แผนจะกระจายเอาของหลายแบบเมื่อไม่มีอะไรที่ขาด */
export const SCORE = {
  NEED: 100,
  PART: 20,
  OTHER: 12,
  COMMON: 3,
  UNIQUE_ROW: 8,
  RECIPE_MAX: 5,
  REPEAT_DECAY: 0.7,
}

// เต๋าเกินนี้ไล่ทุกวิธีแบ่งไม่ไหว (ปรับจำนวนเต๋าเองได้) — ใช้วิธีเลือกกลุ่มที่คุ้มสุดทีละกลุ่มแทน
export const EXACT_DICE_LIMIT = 10

const itemKeyOf = (reward) => `${reward.resource_type_id}-${reward.item_id}`

// ทุก "ชุดเลขแถว" ที่แบ่งเต๋าได้ (ต้องใช้เต๋าครบทุกลูก)
// ให้กลุ่มต้องมีเต๋าหน้าสูงสุดที่เหลืออยู่ 1 ลูกเสมอ — ไม่งั้นได้การแบ่งแบบเดียวกันซ้ำหลายรอบต่างลำดับ
const rowMultisets = (counts, memo = new Map()) => {
  const memoKey = counts.join(',')
  if (memo.has(memoKey)) return memo.get(memoKey)
  let top = 6
  while (top > 0 && counts[top] === 0) top--
  if (top === 0) {
    memo.set(memoKey, [[]])
    return memo.get(memoKey)
  }
  const rest = [...counts]
  rest[top]--
  const seen = new Set()
  const out = []
  for (let extra = 0; extra <= MAX_ROW - top; extra++) {
    for (const take of faceCombos(rest, extra)) {
      const left = rest.map((c, face) => c - take[face])
      for (const tail of rowMultisets(left, memo)) {
        const rows = [...tail, top + extra].sort((a, b) => b - a)
        const key = rows.join(',')
        if (!seen.has(key)) { seen.add(key); out.push(rows) }
      }
    }
  }
  memo.set(memoKey, out)
  return out
}

// แปลงชุดเลขแถวกลับเป็นเต๋าจริงทีละกลุ่ม (ย้อนหาจนลงตัว — ชุดนี้มาจากการแบ่งที่ทำได้จริงอยู่แล้ว)
const realizeRows = (dice, rows) => {
  const counts = countFaces(dice)
  const takes = []
  const walk = (i, left) => {
    if (i === rows.length) return true
    for (const take of faceCombos(left, rows[i])) {
      const next = left.map((c, face) => c - take[face])
      takes.push(take)
      if (walk(i + 1, next)) return true
      takes.pop()
    }
    return false
  }
  if (!walk(0, counts)) return null
  const pool = dice.filter((d) => !d.spent).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const used = new Set()
  return rows.map((row, i) => {
    const ids = []
    for (let face = 1; face <= 6; face++) {
      let need = takes[i][face]
      for (const d of pool) {
        if (need === 0) break
        if (d.value === face && !used.has(d.id)) { used.add(d.id); ids.push(d.id); need-- }
      }
    }
    return { row, diceIds: ids }
  })
}

export const planRewards = ({ dice, table, needs = new Map(), usage = new Map(), claimed = [] }) => {
  const unspent = (dice ?? []).filter((d) => !d.spent)
  if (!unspent.length || !table?.length) return null

  const rowItem = new Map(table.map((r) => [r.rolled_number, itemKeyOf(r.reward)]))
  const rowsPerItem = new Map()
  for (const key of rowItem.values()) rowsPerItem.set(key, (rowsPerItem.get(key) ?? 0) + 1)
  const already = new Map()
  for (const r of claimed ?? []) {
    const key = itemKeyOf(r)
    already.set(key, (already.get(key) ?? 0) + (r.quantity ?? 1))
  }

  const baseOf = (key) => {
    const type = Number(key.split('-')[0])
    let base = type === 3 ? SCORE.PART : type === 2 ? SCORE.OTHER : SCORE.COMMON
    if (type !== 1 && rowsPerItem.get(key) === 1) base += SCORE.UNIQUE_ROW
    return base + Math.min(usage.get(key) ?? 0, SCORE.RECIPE_MAX)
  }
  // ค่าของ "ชิ้นที่ k" ของของชนิดนี้ (นับรวมที่ได้ไปแล้วรอบนี้)
  const unitValue = (key, k) => {
    const short = needs.get(key)?.short ?? 0
    if (k <= short) return SCORE.NEED
    return baseOf(key) * SCORE.REPEAT_DECAY ** (k - short - 1)
  }
  const scoreRows = (rows) => {
    const got = new Map()
    let total = 0
    for (const row of rows) {
      const key = rowItem.get(row)
      if (!key) continue
      const k = (already.get(key) ?? 0) + (got.get(key) ?? 0) + 1
      got.set(key, (got.get(key) ?? 0) + 1)
      total += unitValue(key, k)
    }
    return total
  }

  let chosenRows
  const exact = unspent.length <= EXACT_DICE_LIMIT
  if (exact) {
    let best = null
    for (const rows of rowMultisets(countFaces(dice))) {
      const score = scoreRows(rows)
      // เท่ากัน → ได้ของหลายชิ้นกว่า → เลขแถวสูงกว่า (ผลออกมาเหมือนเดิมทุกครั้ง)
      if (!best || score > best.score + 1e-9 ||
          (Math.abs(score - best.score) <= 1e-9 &&
            (rows.length > best.rows.length || (rows.length === best.rows.length && rows.join(',') > best.rows.join(','))))) {
        best = { rows, score }
      }
    }
    chosenRows = best.rows
  } else {
    // เต๋าเยอะ: เลือกกลุ่มที่ได้ค่าเพิ่มมากสุดทีละกลุ่ม (ใช้เต๋าน้อยก่อนเมื่อเท่ากัน)
    chosenRows = []
    let cur = dice.map((d) => ({ ...d }))
    while (cur.some((d) => !d.spent)) {
      let pick = null
      for (const row of reachableRows(cur)) {
        const ids = pickDiceForRow(cur, row)
        const gain = scoreRows([...chosenRows, row]) - scoreRows(chosenRows)
        if (!pick || gain > pick.gain + 1e-9 || (Math.abs(gain - pick.gain) <= 1e-9 && ids.length < pick.ids.length)) {
          pick = { row, ids, gain }
        }
      }
      chosenRows.push(pick.row)
      cur = cur.map((d) => (pick.ids.includes(d.id) ? { ...d, spent: true } : d))
    }
    chosenRows.sort((a, b) => b - a)
  }

  const groups = realizeRows(dice, chosenRows)
  if (!groups) return null

  // ใส่ค่าและเหตุผลให้ทีละกลุ่ม — ชิ้นที่ค่าสูงสุดของของชนิดเดียวกันไปอยู่กลุ่มแรก ๆ
  const got = new Map()
  for (const g of groups) {
    const key = rowItem.get(g.row)
    const k = (already.get(key) ?? 0) + (got.get(key) ?? 0) + 1
    got.set(key, (got.get(key) ?? 0) + 1)
    g.itemKey = key
    g.value = key ? unitValue(key, k) : 0
    const need = needs.get(key)
    const type = key ? Number(key.split('-')[0]) : 1
    if (need && k <= need.short) {
      g.reason = { kind: 'need', short: need.short - (already.get(key) ?? 0), targets: need.targets }
    } else if (type !== 1 && rowsPerItem.get(key) === 1) {
      g.reason = { kind: 'unique' }
    } else {
      g.reason = { kind: type === 3 ? 'part' : type === 2 ? 'other' : 'common' }
    }
  }
  groups.sort((a, b) => b.value - a.value || b.row - a.row)
  return { groups, exact }
}
