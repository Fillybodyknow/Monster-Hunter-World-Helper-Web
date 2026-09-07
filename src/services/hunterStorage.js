const STORAGE_KEY = 'hunters'

/* ================= REPAIR =================
   ตัวละครที่ไม่มีของสวมอยู่เลยจะเปิดไม่ได้ (openHunter อ่าน .weapon_type_id ของค่าที่หาไม่เจอ)
   ทำให้กดเข้าตัวละครไม่ได้ถาวรเพราะข้อมูลถูกบันทึกค้างแบบนั้นแล้ว refresh ก็ไม่หาย
   เคยเกิดจาก craftWeapon ที่ลบอาวุธเก่าซึ่งสวมอยู่ทิ้ง แล้วใส่ตัวใหม่เป็น is_equip: false
   ต้นเหตุแก้แล้ว แต่ข้อมูลที่พังไปแล้วต้องกู้ตรงนี้ ไม่งั้นผู้ใช้เดิมยังติดอยู่เหมือนเดิม */
const _repairSlot = (list) => {
  if (!Array.isArray(list) || list.length === 0) return false
  if (list.some((i) => i?.is_equip)) return false
  list[0].is_equip = true // ไม่มีตัวไหนถูกสวม — หยิบตัวแรกมาสวมให้ ดีกว่าเปิดตัวละครไม่ได้
  return true
}

export const repairHunter = (h) => {
  let changed = false
  if (!h?.equipments) return changed
  changed = _repairSlot(h.equipments.weapons) || changed
  for (const slot of ['helm', 'mail', 'greaves']) {
    changed = _repairSlot(h.equipments.armors?.[slot]) || changed
  }
  return changed
}

/* ================= GET ALL ================= */
export const getHunters = () => {
  try {
    const data = localStorage.getItem(STORAGE_KEY)
    const parsed = data ? JSON.parse(data) : []

    const hunters = Array.isArray(parsed) ? parsed : []
    // ซ่อมตอนอ่านเสมอ แล้วเขียนกลับถ้ามีอะไรเปลี่ยน — ผู้ใช้ที่ข้อมูลพังอยู่แล้วจะกลับมาใช้ได้เอง
    if (hunters.map(repairHunter).some(Boolean)) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(hunters))
    }
    return hunters
  } catch (e) {
    console.error('getHunters error:', e)
    return []
  }
}

/* ================= SAVE ALL ================= */
export const saveHunters = (hunters) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(hunters))
}

// services/hunterStorage.js
export const saveHunter = (hunter) => {
  const hunters = JSON.parse(localStorage.getItem('hunters')) || []

  const index = hunters.findIndex((h) => h.hunter_id === hunter.hunter_id)

  if (index !== -1) {
    hunters[index] = hunter
  } else {
    hunters.push(hunter)
  }

  localStorage.setItem('hunters', JSON.stringify(hunters))
}

/* ================= CREATE ================= */
export const createHunter = (hunter) => {
  const hunters = getHunters()

  const newHunter = {
    ...hunter,
    hunter_id: Date.now(), // unique id
  }

  hunters.push(newHunter) // ✅ ตอนนี้ push ได้แน่นอน

  saveHunters(hunters)

  return newHunter
}

/* ================= GET BY ID ================= */
export const getHunterById = (id) => {
  const hunters = getHunters()
  return hunters.find(h => h.hunter_id === id)
}

/* ================= DELETE ================= */
export const deleteHunter = (id) => {
  const hunters = getHunters()
  const filtered = hunters.filter((h) => h.hunter_id !== id)

  saveHunters(filtered)
}