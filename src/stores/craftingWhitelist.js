import { ref, computed } from 'vue'
import craftingData from '@/assets/files/crafting_item.json'
import resourceData from '@/assets/files/resource.json'
import weaponsData from '@/assets/files/weapons.json'
import { hunter, saveHunter } from '@/stores/hunter'

/* รายการติดตามคราฟต์ — แยกของแต่ละ Hunter เก็บในเซฟของตัวละคร (hunter.craft_watch)
   เดิมเก็บก้อนเดียวที่ localStorage 'mhw_crafting_whitelist' ตัวละครทุกตัวบนเครื่องเห็นชุดเดียวกัน
   ที่แย่กว่านั้น: key ของอาวุธ (weapon_type_id + item_id) ซ้ำกันข้ามคลาส 169 จาก 182 สูตร
   Great Sword ติดตามอาวุธไว้ ตัวละคร Bow จะเห็นเป็นอาวุธคนละชิ้นที่บังเอิญเลขตรงกัน
   เก็บในเซฟแล้วติดไปกับ Export/Import และหายไปพร้อมตัวละครที่ถูกลบ */
const LEGACY_KEY = 'mhw_crafting_whitelist'
const MAX_WHITELIST = 5

export const whitelist = computed(() => hunter.value?.craft_watch ?? [])

const setWatchList = (list) => {
  if (!hunter.value) return
  saveHunter({ ...hunter.value, craft_watch: list })
}

// ชื่ออาวุธของคลาสนี้ — ใช้ยืนยันว่ารายการเก่าเป็นอาวุธของคลาสนี้จริง ไม่ใช่แค่เลขบังเอิญตรง
const weaponName = (hunterClassId, weaponTypeId, itemId) =>
  weaponsData
    .find((c) => c.hunter_class_id === hunterClassId)
    ?.weapons_list.find((w) => w.weapon_type_id === weaponTypeId)
    ?.items.find((i) => i.item_id === itemId)?.item ?? null

/* ย้ายรายการเดิม (ก้อนรวม) มาเป็นของตัวละคร — ทำครั้งเดียวต่อตัวละคร ตอนโหลดตัวละครครั้งแรกหลังอัปเดต
   - เกราะ: สูตรไม่ผูกกับคลาส ได้ทุกตัวละคร
   - อาวุธ: ได้เฉพาะตัวละครที่คลาสมีอาวุธชื่อเดียวกันกับที่บันทึกไว้ (ตัดตัวที่เลขบังเอิญตรงทิ้ง)
   ไม่ลบก้อนเดิมทิ้ง — ตัวละครอื่นที่ยังไม่ได้เปิดยังต้องใช้ย้ายของตัวเอง */
export const ensureWatchList = (target) => {
  if (!target || Array.isArray(target.craft_watch)) return false
  let legacy = []
  try { legacy = JSON.parse(localStorage.getItem(LEGACY_KEY)) || [] } catch { legacy = [] }
  const mine = (Array.isArray(legacy) ? legacy : []).filter((item) => {
    if (item?.type === 'armor') return true
    if (item?.type === 'weapon') {
      return !!item.name && weaponName(target.hunter_class_id, item.weapon_type_id, item.item_id) === item.name
    }
    return false
  }).slice(0, MAX_WHITELIST)
  saveHunter({ ...target, craft_watch: mine })
  return true
}

export const whitelistKey = (type, ...ids) => `${type}_${ids.join('_')}`

export const isWhitelisted = (key) => whitelist.value.some((i) => i.key === key)

export const addToWhitelist = (item) => {
  if (!hunter.value) return false
  if (whitelist.value.length >= MAX_WHITELIST) return false
  if (isWhitelisted(item.key)) return false
  setWatchList([...whitelist.value, item])
  // Initialize tracking immediately so the first resource gain fires notification
  if (hunter.value) {
    const materials = getItemMaterials(item, hunter.value)
    const counts = {}
    materials.forEach((mat) => {
      counts[`${mat.material[0]}_${mat.material[1]}`] = getInvCount(hunter.value, mat.material[0], mat.material[1])
    })
    prevMaterialCounts[item.key] = counts
    prevCraftable[item.key] = item.type === 'weapon'
      ? checkWeapon(item, hunter.value)
      : checkArmor(item, hunter.value)
  }
  return true
}

export const removeFromWhitelist = (key) => {
  setWatchList(whitelist.value.filter((i) => i.key !== key))
  delete prevMaterialCounts[key]
  delete prevCraftable[key]
}

// ─── Notification Queue ───────────────────────────────────────────────────────
export const craftNotifications = ref([])

export const dismissNotification = (id) => {
  craftNotifications.value = craftNotifications.value.filter((n) => n.id !== id)
}

// ─── Craftability + Material Progress Check ───────────────────────────────────
const prevCraftable = {}
const prevMaterialCounts = {}

const getInvCount = (hunter, typeId, itemId) =>
  hunter?.inventory?.find(
    (i) => i.resource_type_id === typeId && i.item_id === itemId
  )?.quantity ?? 0

const getResourceInfo = (typeId, itemId) => {
  const group = resourceData.find((r) => r.resource_type_id === typeId)
  return group?.resources.find((r) => r.item_id === itemId) ?? null
}

const getItemMaterials = (item, hunter) => {
  if (item.type === 'weapon') {
    const data = craftingData.find((c) => c.type === 'Weapon')
    const classData = data?.craft_list.find((c) => c.hunter_class_id === hunter.hunter_class_id)
    const recipe = classData?.weapon_craft_list.find(
      (w) => w.weapon_type_id === item.weapon_type_id && w.item_id === item.item_id
    )
    return recipe?.crafting_table ?? []
  }
  const recipe = craftingData
    .find((c) => c.type === 'Armor')
    ?.craft_list.find((c) => c.equip_set_id === item.equip_set_id && c.equip_id === item.equip_id)
  return recipe?.crafting_table ?? []
}

const checkMaterialProgress = (item, hunter) => {
  const materials = getItemMaterials(item, hunter)
  if (!materials.length) return false

  const prevCounts = prevMaterialCounts[item.key]
  const currentCounts = {}
  let anyIncreased = false

  materials.forEach((mat) => {
    const matKey = `${mat.material[0]}_${mat.material[1]}`
    const current = getInvCount(hunter, mat.material[0], mat.material[1])
    currentCounts[matKey] = current
    if (prevCounts && current > (prevCounts[matKey] ?? 0)) anyIncreased = true
  })

  prevMaterialCounts[item.key] = currentCounts
  return anyIncreased && !!prevCounts
}

const buildMatDetails = (materials, hunter) =>
  materials.map((mat) => {
    const info = getResourceInfo(mat.material[0], mat.material[1])
    return {
      resource_type_id: mat.material[0],
      item_id: mat.material[1],
      required: mat.amount,
      current: getInvCount(hunter, mat.material[0], mat.material[1]),
      item: info?.item ?? '',
      thumbnail: info?.thumbnail ?? '',
    }
  })

const checkWeapon = (item, hunter) => {
  const data = craftingData.find((c) => c.type === 'Weapon')
  const classData = data?.craft_list.find((c) => c.hunter_class_id === hunter.hunter_class_id)
  const recipe = classData?.weapon_craft_list.find(
    (w) => w.weapon_type_id === item.weapon_type_id && w.item_id === item.item_id
  )
  if (!recipe?.crafting_table) return false
  const hasMat = recipe.crafting_table.every(
    (m) => getInvCount(hunter, m.material[0], m.material[1]) >= m.amount
  )
  if (!recipe.required_weapon?.length) return hasMat
  const [rType, rItem] = recipe.required_weapon
  return hasMat && hunter.equipments.weapons.some(
    (w) => w.weapon_type_id === rType && w.item_id === rItem
  )
}

const checkArmor = (item, hunter) => {
  const recipe = craftingData
    .find((c) => c.type === 'Armor')
    ?.craft_list.find(
      (c) => c.equip_set_id === item.equip_set_id && c.equip_id === item.equip_id
    )
  if (!recipe?.crafting_table) return false
  return recipe.crafting_table.every(
    (m) => getInvCount(hunter, m.material[0], m.material[1]) >= m.amount
  )
}

// ตัวละครที่ค่าเปรียบเทียบด้านล่าง (prevCraftable / prevMaterialCounts) เป็นของ
// เปลี่ยนตัวละครแล้วต้องเริ่มนับใหม่ ไม่งั้นเอาของในกระเป๋าตัวเก่ามาเทียบ แล้วเด้งแจ้งเตือนผิด
let trackedHunterId = null

export const checkCraftability = (hunter) => {
  if (!hunter) return
  if (hunter.hunter_id !== trackedHunterId || !Array.isArray(hunter.craft_watch)) {
    initCraftability(hunter)
    return
  }
  const toRemove = []

  hunter.craft_watch.forEach((item) => {
    const craftable = item.type === 'weapon'
      ? checkWeapon(item, hunter)
      : checkArmor(item, hunter)
    const prev = prevCraftable[item.key] ?? null

    if (craftable && prev === false) {
      const notif = { ...item, id: `${item.key}_${Date.now()}`, notifType: 'craftable' }
      craftNotifications.value = [...craftNotifications.value, notif]
      setTimeout(() => dismissNotification(notif.id), 7000)
      toRemove.push(item.key)
      delete prevMaterialCounts[item.key]
    } else if (!craftable) {
      const materialsChanged = checkMaterialProgress(item, hunter)
      if (materialsChanged) {
        const alreadyShowing = craftNotifications.value.some(
          (n) => n.key === item.key && n.notifType === 'progress'
        )
        if (!alreadyShowing) {
          const materials = getItemMaterials(item, hunter)
          const notif = {
            ...item,
            id: `${item.key}_progress_${Date.now()}`,
            notifType: 'progress',
            materials: buildMatDetails(materials, hunter),
          }
          craftNotifications.value = [...craftNotifications.value, notif]
          setTimeout(() => dismissNotification(notif.id), 8000)
        }
      }
    }

    prevCraftable[item.key] = craftable
  })

  toRemove.forEach((key) => removeFromWhitelist(key))
}

export const initCraftability = (hunter) => {
  if (!hunter) return
  // ย้ายรายการเดิมมาเป็นของตัวละครก่อน — บันทึกเซฟแล้ว watch ใน App.vue จะเรียกเข้ามาใหม่พร้อมรายการที่ย้ายแล้ว
  if (ensureWatchList(hunter)) return
  trackedHunterId = hunter.hunter_id
  for (const key of Object.keys(prevCraftable)) delete prevCraftable[key]
  for (const key of Object.keys(prevMaterialCounts)) delete prevMaterialCounts[key]
  hunter.craft_watch.forEach((item) => {
    const craftable = item.type === 'weapon'
      ? checkWeapon(item, hunter)
      : checkArmor(item, hunter)
    prevCraftable[item.key] = craftable

    const materials = getItemMaterials(item, hunter)
    const counts = {}
    materials.forEach((mat) => {
      counts[`${mat.material[0]}_${mat.material[1]}`] = getInvCount(hunter, mat.material[0], mat.material[1])
    })
    prevMaterialCounts[item.key] = counts
  })
}

// ─── ของที่ยังขาด (ใช้แนะนำตอนแจกเต๋ารับรางวัล) ───────────────────────────────
// คืน Map "typeId-itemId" → { short, targets } — short = ยังขาดกี่ชิ้นเทียบกับของในกระเป๋า
// เป้าหลายชิ้นใช้วัตถุดิบเดียวกัน ต้องรวมจำนวนที่ต้องใช้ เพราะคราฟแล้วของหายไปทีละชิ้น
// ไม่หักของที่เพิ่งได้รอบนี้ — ตัวแนะนำนับรวมเอง (ของยังไม่เข้ากระเป๋าจนกว่าจะกดยืนยัน)
export const materialShortfall = (hunter) => {
  const needs = new Map()
  if (!hunter) return needs
  for (const item of hunter.craft_watch ?? []) {
    for (const mat of getItemMaterials(item, hunter)) {
      const key = `${mat.material[0]}-${mat.material[1]}`
      const entry = needs.get(key) ?? { required: 0, targets: [] }
      entry.required += mat.amount
      if (item.name && !entry.targets.includes(item.name)) entry.targets.push(item.name)
      needs.set(key, entry)
    }
  }
  const result = new Map()
  for (const [key, entry] of needs) {
    const [typeId, itemId] = key.split('-').map(Number)
    const short = entry.required - getInvCount(hunter, typeId, itemId)
    if (short > 0) result.set(key, { short, targets: entry.targets })
  }
  return result
}

// วัตถุดิบแต่ละชิ้นใช้คราฟได้กี่สูตร (ชุดเกราะทั้งหมด + อาวุธของคลาสนี้) — ของที่ใช้ได้หลายสูตรมีค่ากว่านิดหน่อย
export const recipeCountByMaterial = (hunterClassId) => {
  const counts = new Map()
  const add = (table) => {
    for (const mat of table ?? []) {
      const key = `${mat.material[0]}-${mat.material[1]}`
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }
  craftingData.find((c) => c.type === 'Armor')?.craft_list.forEach((r) => add(r.crafting_table))
  craftingData
    .find((c) => c.type === 'Weapon')
    ?.craft_list.find((c) => c.hunter_class_id === hunterClassId)
    ?.weapon_craft_list.forEach((r) => add(r.crafting_table))
  return counts
}
