import { ref, watch } from 'vue'
import craftingData from '@/assets/files/crafting_item.json'
import resourceData from '@/assets/files/resource.json'
import { hunter } from '@/stores/hunter'

const STORAGE_KEY = 'mhw_crafting_whitelist'
const MAX_WHITELIST = 5

const loadStored = () => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [] }
  catch { return [] }
}

export const whitelist = ref(loadStored())

watch(whitelist, (val) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(val))
}, { deep: true })

export const whitelistKey = (type, ...ids) => `${type}_${ids.join('_')}`

export const isWhitelisted = (key) => whitelist.value.some((i) => i.key === key)

export const addToWhitelist = (item) => {
  if (whitelist.value.length >= MAX_WHITELIST) return false
  if (isWhitelisted(item.key)) return false
  whitelist.value = [...whitelist.value, item]
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
  whitelist.value = whitelist.value.filter((i) => i.key !== key)
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

export const checkCraftability = (hunter) => {
  if (!hunter) return
  const toRemove = []

  whitelist.value.forEach((item) => {
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
  whitelist.value.forEach((item) => {
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
