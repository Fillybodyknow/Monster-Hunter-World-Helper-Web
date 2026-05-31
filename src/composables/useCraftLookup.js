import { ref } from 'vue'
import craftingData from '@/assets/files/crafting_item.json'
import armorsData from '@/assets/files/armors.json'
import weaponsData from '@/assets/files/weapons.json'
import elementalData from '@/assets/files/elemental.json'
import rarityData from '@/assets/files/equiment_rarity.json'
import { hunter } from '@/stores/hunter'

// Global modal state (shared across all components)
export const craftLookupItem = ref(null) // { resource_type_id, item_id, name }
export const craftLookupResults = ref([])

export const openCraftLookup = (resource_type_id, item_id, itemName) => {
  craftLookupItem.value = { resource_type_id, item_id, name: itemName }
  craftLookupResults.value = getCraftableWith(resource_type_id, item_id)
}

export const closeCraftLookup = () => {
  craftLookupItem.value = null
  craftLookupResults.value = []
}

const getCraftableWith = (resource_type_id, item_id) => {
  const results = []

  // ── Armor ────────────────────────────────────────────────
  const armorType = craftingData.find((t) => t.type_id === 1)
  armorType?.craft_list.forEach((craft) => {
    const matches = craft.crafting_table.some(
      (mat) => mat.material[0] === resource_type_id && mat.material[1] === item_id,
    )
    if (!matches) return
    const armorSet = armorsData.find((s) => s.equip_set_id === craft.equip_set_id)
    const armor = armorSet?.equips.find((e) => e.equip_id === craft.equip_id)
    if (armor) {
      // Get piece thumbnail from equiment_rarity
      const rarityGroup = rarityData[0]?.rarity_list?.find((r) => r.equipment_rarity === armorSet.rarity)
      const armorPieceThumbnail = rarityGroup?.list?.find((l) => l.id === armor.armor_part_id)?.thumbnail
      const elemental = armor.elemental_armor?.elemental_id
        ? elementalData.find((e) => e.elemental_id === armor.elemental_armor.elemental_id)
        : null
      results.push({
        type: 'armor',
        name: armor.equip,
        set: armorSet.equip_set,
        thumbnail: armorPieceThumbnail ?? armorSet.thumbnail,
        physical_armor: armor.physical_armor,
        elemental_armor: armor.elemental_armor,
        elemental_thumbnail: elemental?.thumbnail ?? null,
        materials: craft.crafting_table,
      })
    }
  })

  // ── Weapon (filter by hunter class) ─────────────────────
  const myClassId = hunter.value?.hunter_class_id ?? null
  const weaponType = craftingData.find((t) => t.type_id === 2)
  weaponType?.craft_list.forEach((classEntry) => {
    if (myClassId && classEntry.hunter_class_id !== myClassId) return
    classEntry.weapon_craft_list?.forEach((weaponCraft) => {
      const matches = weaponCraft.crafting_table.some(
        (mat) => mat.material[0] === resource_type_id && mat.material[1] === item_id,
      )
      if (!matches) return
      const weaponClass = weaponsData.find((c) => c.hunter_class_id === classEntry.hunter_class_id)
      const weaponList = weaponClass?.weapons_list.find(
        (wl) => wl.weapon_type_id === weaponCraft.weapon_type_id,
      )
      const weapon = weaponList?.items.find((i) => i.item_id === weaponCraft.item_id)
      if (weapon) {
        results.push({
          type: 'weapon',
          name: weapon.item,
          set: weaponList.weapon_type,
          thumbnail: weaponList.thumbnail,
          damage_cards: weapon.damage_cards,
          materials: weaponCraft.crafting_table,
          hunter_class_id: classEntry.hunter_class_id,
        })
      }
    })
  })

  return results
}
