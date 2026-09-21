import Armordata from '@/assets/files/armors.json'
import Weapondata from '@/assets/files/weapons.json'
import raritydata from '@/assets/files/equiment_rarity.json'

export const getArmors = async (equip_set_id, equip_id) => {

  const armor = Armordata.find(a => a.equip_set_id === equip_set_id)
  if (!armor) return null

  const armorSlot = armor.equips.find(e => e.equip_id === equip_id)
  if (!armorSlot) return null

  const item = await getItemByRarity(
    1,
    armor.rarity,
    armorSlot.armor_part_id
  )

  return {
    ...armorSlot,
    thumbnail: item?.thumbnail || null,
    set_thumbnail: armor.thumbnail,
    rarity: armor.rarity,
    set_name: armor.equip_set,
    equip_set_id: armor.equip_set_id,
    set_ability_bonus: armor.set_ability_bonus
  }
}

export const getWeapons = async (classId, weapon_type, itemId) => {

  const classweapon = Weapondata.find(w => w.hunter_class_id === classId)
  if (!classweapon) return null

  const typeweapon = classweapon.weapons_list.find(w => w.weapon_type_id === weapon_type)
  if (!typeweapon) return null

  const weapon = typeweapon.items.find(i => i.item_id === itemId)
  if (!weapon) return null

  // 🔥 FIX: await + ใช้ item_id
  const item = await getItemByRarity(2, weapon.rarity, classId)

  return {
    ...weapon,
    thumbnail: item?.thumbnail || null,
    weapon_type: typeweapon.weapon_type,
    set_thumbnail: typeweapon.thumbnail
  }
}

const wornArmor = (hunter) => {
  const slots = hunter?.equipments?.armors ?? {}
  return ['helm', 'mail', 'greaves']
    .map((k) => (slots[k] ?? []).find((a) => a.is_equip))
    .filter(Boolean)
}

const pieceOf = (w) =>
  Armordata.find((s) => s.equip_set_id === w.equip_set_id)?.equips.find((e) => e.equip_id === w.equip_id) ?? null

// ability ของเกราะที่ใส่อยู่ + โบนัสเซ็ตเมื่อใส่ครบสามชิ้นจากเซ็ตเดียวกัน
export const armorAbilityIds = (hunter) => {
  const worn = wornArmor(hunter)
  const ids = new Set()
  for (const w of worn) {
    const piece = pieceOf(w)
    if (piece?.ability_id) ids.add(piece.ability_id)
  }
  if (worn.length === 3 && new Set(worn.map((w) => w.equip_set_id)).size === 1) {
    const bonus = Armordata.find((s) => s.equip_set_id === worn[0].equip_set_id)?.set_ability_bonus
    if (bonus) ids.add(bonus)
  }
  return [...ids]
}

// ค่าป้องกันติดตัวของอาวุธที่ถืออยู่ — นับรวมเป็นเกราะกายภาพ (หน้า State ก็นับแบบนี้)
const weaponDefense = (hunter) => {
  const equipped = hunter?.equipments?.weapons?.find((w) => w.is_equip)
  if (!equipped) return 0
  const cls = Weapondata.find((w) => w.hunter_class_id === hunter?.hunter_class_id)
  const type = cls?.weapons_list.find((t) => t.weapon_type_id === equipped.weapon_type_id)
  return type?.items.find((i) => i.item_id === equipped.item_id)?.defense ?? 0
}

// สรุปของที่ใส่อยู่ — เกราะกายภาพรวม (เกราะ 3 ชิ้น + อาวุธ), เกราะธาตุแยกตามชนิด, ability ที่มี
// ใช้สองที่: ส่งขึ้นห้องให้ Host คิดดาเมจแทนเพื่อนได้ และคิดเองตอนเล่นคนเดียว
// ค่าป้องกันบนการ์ดโจมตีไม่อยู่ในนี้ — การ์ดอยู่บนมือบนโต๊ะ แอปไม่มีทางรู้ ต้องให้กรอกเอง
export const armorSummary = (hunter) => {
  let physical = weaponDefense(hunter)
  const elements = {}
  for (const w of wornArmor(hunter)) {
    const piece = pieceOf(w)
    if (!piece) continue
    physical += piece.physical_armor ?? 0
    const el = piece.elemental_armor
    if (el?.elemental_id) elements[el.elemental_id] = (elements[el.elemental_id] ?? 0) + (el.protection ?? 0)
  }
  return { physical, elements, abilities: armorAbilityIds(hunter) }
}

export const getItemByRarity = (type, rarity, slotId) => {
  return new Promise((resolve) => {

    const typeData = raritydata.find(t => t.type_id === type)
    if (!typeData) return resolve(null)

    const rarityData = typeData.rarity_list.find(
      r => r.equipment_rarity === rarity
    )
    if (!rarityData) return resolve(null)

    const item = rarityData.list.find(i => i.id === slotId)

    resolve(item || null)
  })
}