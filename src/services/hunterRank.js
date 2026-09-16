// Hunter Rank (HR) — ป้ายโชว์ความคืบหน้าข้างเลขวัน ไม่มีผลกับกฎในเกม
//
// แต้มสะสมอยู่ใน hunter.hr_points ตัวเดียว ไม่เกี่ยวกับ attempted_quest
// เพราะปุ่มรีเซ็ตเควสต์ใน HQ ลบประวัติเควสต์ทิ้งเพื่อคืนสิทธิ์ลงใหม่ ถ้าแต้มอยู่ในนั้น HR จะลดลงตอนรีเซ็ต
// HR ต้องขึ้นอย่างเดียว ไม่มีวันลด

// จบเควสต์แล้วได้แต้มตามความยาก (difficulty_level ของเควสต์) — แพ้ก็ได้ แต่ได้น้อยกว่า
export const WIN_RATE = 10
export const LOSS_RATE = 4

export const questPoints = (difficulty, won) => (difficulty ?? 1) * (won ? WIN_RATE : LOSS_RATE)

// HR = 2√(แต้ม + 1) − 1 ปัดลง — ขึ้นถี่ตอนต้น ห่างขึ้นเรื่อย ๆ ตอนหลัง
// ชนะครบทุกเควสต์ในเกมอย่างละครั้ง (650 แต้ม) = HR50 เท่าเส้นปลด Tempered Elder Dragon ในเกมต้นฉบับ
export const hunterRank = (points) => Math.max(1, Math.floor(2 * Math.sqrt(Math.max(0, points ?? 0) + 1) - 1))

// แต้มต่ำสุดของขั้นนั้น — ใช้ทั้งตอนเติมย้อนหลังและตอนบอกว่าอีกกี่แต้มจะขึ้นขั้น
export const pointsForRank = (rank) => Math.max(0, Math.ceil(((rank + 1) / 2) ** 2 - 1))

export const pointsToNextRank = (points) =>
  Math.max(1, pointsForRank(hunterRank(points) + 1) - Math.max(0, points ?? 0))

// เซฟที่ยังไม่ถูกเติมแต้ม (เช่นไฟล์ Export เก่าที่เพิ่งเลือกไฟล์ ยังไม่ได้กด Import)
// ต้องโชว์ HR ที่ถูกต้องอยู่ดี — คิดย้อนหลังให้ตรงนี้เลย ไม่ต้องรอ migrate
export const pointsOf = (hunter) =>
  typeof hunter?.hr_points === 'number' ? hunter.hr_points : seedHrPoints(hunter)

export const rankOf = (hunter) => hunterRank(pointsOf(hunter))

/* ================= เติมแต้มย้อนหลัง =================
   ผู้เล่นที่เล่นมาก่อนมี HR แล้ว ไม่ต้องเริ่มนับใหม่ — คิดจากประวัติที่เซฟไว้อยู่แล้ว
   - Assigned Quest ที่ผ่าน: รู้แน่ว่าชนะ (แพ้ไม่ถูกบันทึกใน attempted) → ให้เต็ม
   - เควสต์อื่น: รู้แค่ว่าลงไปกี่ครั้ง ไม่รู้ผล → ให้ค่ากลางระหว่างชนะกับแพ้
   - กันคนที่เคยกดรีเซ็ตเควสต์ใน HQ จนประวัติหาย: HR ต้องไม่ต่ำกว่าจำนวนวันที่เล่นมา ÷ 4 */
const UNKNOWN_RATE = 6 // ระหว่างชนะ (10) กับแพ้ (4) ค่อนไปทางชนะ
const DAYS_PER_MIN_RANK = 4

// ความยากของเควสต์ ณ วันที่เปิดใช้ HR — ใช้เฉพาะตอนเติมย้อนหลังให้เซฟเก่าเท่านั้น
// ตอนเล่นจริงอ่าน difficulty_level จากเล่มเควสต์โดยตรง ตารางนี้เลยไม่ต้องตามอัปเดตเวลาเพิ่มมอนใหม่
// (ไม่ import เล่มเควสต์มาที่นี่ เพราะไฟล์รวมกันเกือบ 800KB และหน้าแรกไม่ได้ใช้)
const SEED_DIFFICULTY = { 1: 1, 2: 2, 3: 3 } // quest_id → ความยาก
const SEED_TEMPERED_D4 = new Set([4, 5, 9, 10]) // Rathalos, Azure Rathalos, Diablos, Black Diablos

const seedDifficulty = (monster_id, quest_id) => {
  if (quest_id === 3 && SEED_TEMPERED_D4.has(monster_id)) return 4
  return SEED_DIFFICULTY[quest_id] ?? 1
}

export const seedHrPoints = (hunter) => {
  let points = 0
  for (const entry of hunter?.attempted_quest ?? []) {
    const times = entry?.attempted ?? 0
    if (!(times > 0)) continue
    const difficulty = seedDifficulty(entry.monster_id, entry.quest_id)
    // Assigned ลงได้ครั้งเดียว ต่อให้ข้อมูลเก่าจะเพี้ยนเป็นเลขอื่นก็นับครั้งเดียว
    if (entry.quest_id === 1) points += questPoints(difficulty, true)
    else points += times * difficulty * UNKNOWN_RATE
  }
  const minRank = Math.floor((hunter?.campaign_day ?? 1) / DAYS_PER_MIN_RANK)
  return Math.max(points, pointsForRank(minRank))
}
