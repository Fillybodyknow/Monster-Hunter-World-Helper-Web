import palicosData from '@/assets/files/palicos_data.json'

// ชื่อในไฟล์เป็น "ตระกูล - ความสามารถ" — แยกไว้เพราะ 4 ใบของ Coral Orchestra
// ขึ้นต้นเหมือนกันหมด ถ้าโชว์ทั้งพวงในช่องแคบจะอ่านไม่ออกว่าใบไหนเป็นใบไหน
export const PALICOS = (palicosData[0]?.palicos ?? []).map((p) => {
  const [family, ability] = p.type.split(' - ')
  return { ...p, family: ability ? family : null, shortName: ability ?? family }
})

export const PALICO_BACK = palicosData[0]?.back_card_img ?? null

const _byId = new Map(PALICOS.map((p) => [p.id, p]))
export const getPalico = (id) => (id == null ? null : (_byId.get(Number(id)) ?? null))

// สุ่มใบไม่ซ้ำจากกองที่เหลือ
// รับ exclude เข้ามาแทนที่จะให้แต่ละคนสุ่มเอง เพราะคนแจกต้องรู้ว่าอะไรถูกหยิบไปแล้ว
// คืนน้อยกว่า count ได้ถ้ากองไม่พอ — ปลายทางต้องรับมือเอง ไม่ใช่วนหาไม่รู้จบ
export const drawPalicos = (count, exclude = []) => {
  const skip = new Set(exclude.map(Number))
  const pool = PALICOS.filter((p) => !skip.has(p.id)).map((p) => p.id)
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool.slice(0, count)
}
