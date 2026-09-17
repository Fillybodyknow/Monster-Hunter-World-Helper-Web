// ผู้ช่วยแจกเต๋ารับของจากตาราง Reward — ตรรกะล้วน ไม่แตะ Vue ทดสอบแยกได้ (scripts/test-reward-planner.mjs)
//
// กติกา (ยืนยันกับผู้เล่นแล้วว่าตรงกับการเล่นจริง):
// - รวมเต๋าที่ยังไม่ใช้กี่ลูกก็ได้ ผลรวมต้องเท่าเลขแถว 1-12 → ได้ของแถวนั้น 1 ชิ้น แถวเดิมรับซ้ำได้
// - ต้องใช้เต๋าให้หมด — ไม่มีวันติด เพราะทุกตารางมีครบ 1-12 เต๋าลูกเดียวลงแถว 1-6 ได้เสมอ
//
// เฟส 1: บอกว่าแถวไหนลงได้ และหยิบเต๋าให้เมื่อผู้เล่นแตะแถวก่อน
// เฟส 2 (ยังไม่ทำ): ให้คะแนนของตามรายการติดตามคราฟต์ แล้วแนะนำทีละกลุ่ม

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

