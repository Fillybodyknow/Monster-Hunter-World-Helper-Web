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