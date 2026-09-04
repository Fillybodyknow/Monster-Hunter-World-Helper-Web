<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import weaponsData from '@/assets/files/weapons.json'
import armorsData from '@/assets/files/armors.json'
import { hunter, loadHunter, saveHunter } from '@/stores/hunter'
import craftingData from '@/assets/files/crafting_item.json'
import resourceData from '@/assets/files/resource.json'
import rarityData from '@/assets/files/equiment_rarity.json'
import elementalData from '@/assets/files/elemental.json'
import bonusAbilityData from '@/assets/files/bonus_ability.json'
import {
  whitelist,
  whitelistKey,
  isWhitelisted,
  addToWhitelist,
  removeFromWhitelist,
} from '@/stores/craftingWhitelist'

const activeTab = ref('weapon')

const getImg = (path) => `${import.meta.env.BASE_URL}${path}`

onMounted(loadHunter)

// ─── Item Modal ───────────────────────────────────────────────────────────────
const showItemModal = ref(false)
const modalType = ref(null)
const modalNode = ref(null)
const modalArmorSet = ref(null)
const modalEquip = ref(null)

const modalCanCraft = computed(() => {
  if (!showItemModal.value) return false
  if (modalType.value === 'weapon') return canCraft(modalNode.value)
  return canCraftArmor(modalArmorSet.value?.equip_set_id, modalEquip.value?.equip_id)
})

const modalHasItem = computed(() => {
  if (!showItemModal.value) return false
  if (modalType.value === 'weapon') return hasWeapon(modalNode.value)
  return hasArmor(modalArmorSet.value?.equip_set_id, modalEquip.value?.equip_id, modalEquip.value?.armor_part_id)
})

const modalKey = computed(() => {
  if (!modalType.value) return ''
  if (modalType.value === 'weapon') return whitelistKey('weapon', modalNode.value?.weapon_type_id, modalNode.value?.item_id)
  return whitelistKey('armor', modalArmorSet.value?.equip_set_id, modalEquip.value?.equip_id)
})

const modalIsWhitelisted = computed(() => isWhitelisted(modalKey.value))

const modalMaterials = computed(() => {
  if (!showItemModal.value) return []
  if (modalType.value === 'weapon') return getCrafting(modalNode.value)
  return getArmorCrafting(modalArmorSet.value?.equip_set_id, modalEquip.value?.equip_id)
})

const modalRarityIcon = computed(() => {
  if (!showItemModal.value) return ''
  if (modalType.value === 'weapon') return getRarityIcon(modalNode.value?.rarity)
  return getArmorRarityIcon(modalArmorSet.value?.rarity, modalEquip.value?.armor_part_id)
})

const modalName = computed(() => {
  if (!showItemModal.value) return ''
  return modalType.value === 'weapon' ? modalNode.value?.item : modalEquip.value?.equip
})

const openModal = (type, node, armorSet = null, equip = null) => {
  modalType.value = type
  modalNode.value = node
  modalArmorSet.value = armorSet
  modalEquip.value = equip
  showItemModal.value = true
}

const closeModal = () => { showItemModal.value = false }

const isCrafting = ref(false)

const modalCraft = () => {
  if (!modalCanCraft.value || modalHasItem.value || isCrafting.value) return
  isCrafting.value = true
  if (modalType.value === 'weapon') craftWeapon(modalNode.value)
  else craftArmor(modalArmorSet.value, modalEquip.value)
  setTimeout(() => {
    isCrafting.value = false
    closeModal()
  }, 1600)
}

const modalToggleWhitelist = () => {
  if (modalIsWhitelisted.value) {
    removeFromWhitelist(modalKey.value)
    return
  }
  if (whitelist.value.length >= 5 || modalCanCraft.value) return
  if (modalType.value === 'weapon') {
    addToWhitelist({
      type: 'weapon',
      key: modalKey.value,
      weapon_type_id: modalNode.value.weapon_type_id,
      item_id: modalNode.value.item_id,
      name: modalNode.value.item,
      thumbnail: modalNode.value.thumbnail,
    })
  } else {
    addToWhitelist({
      type: 'armor',
      key: modalKey.value,
      equip_set_id: modalArmorSet.value.equip_set_id,
      equip_id: modalEquip.value.equip_id,
      name: modalEquip.value.equip,
      thumbnail: modalArmorSet.value.thumbnail,
    })
  }
}

const craftWeapon = (node) => {
  const recipe = getRecipe(node)
  if (!recipe) return

  // ===== ลบ MATERIAL =====
  recipe.crafting_table.forEach((mat) => {
    const inv = hunter.value.inventory.find(
      (i) => i.resource_type_id === mat.material[0] && i.item_id === mat.material[1],
    )

    if (inv) {
      inv.quantity -= mat.amount

      if (inv.quantity <= 0) {
        hunter.value.inventory = hunter.value.inventory.filter((i) => i !== inv)
      }
    }
  })

  // ===== ลบ REQUIRED WEAPON =====
  if (recipe.required_weapon?.length) {
    const [reqType, reqItem] = recipe.required_weapon

    if (!(reqType === 1 && reqItem === 1)) {
      const index = hunter.value.equipments.weapons.findIndex(
        (w) => w.weapon_type_id === reqType && w.item_id === reqItem,
      )

      if (index !== -1) {
        hunter.value.equipments.weapons.splice(index, 1)
      }
    }
  }

  // ===== เพิ่ม WEAPON ใหม่ =====
  hunter.value.equipments.weapons.push({
    weapon_type_id: node.weapon_type_id,
    item_id: node.item_id,
    is_equip: false,
  })

  // 🔥 SAVE จริงลง localStorage
  saveHunter(hunter.value)

}

const getRecipe = (node) => {
  const data = craftingData.find((c) => c.type === 'Weapon')

  const classData = data?.craft_list.find((c) => c.hunter_class_id === hunter.value.hunter_class_id)

  return classData?.weapon_craft_list.find(
    (w) => w.weapon_type_id === node.weapon_type_id && w.item_id === node.item_id,
  )
}

const canCraft = (node) => {
  if (!hunter.value) return false

  const recipe = getRecipe(node)
  if (!recipe?.crafting_table) return false

  // ✅ check material
  const hasMaterial = recipe.crafting_table.every((mat) => {
    const have = getInventoryCount(mat.material[0], mat.material[1])
    return have >= mat.amount
  })

  // 🔥 ถ้าไม่มี required_weapon → ข้ามเลย
  if (!recipe.required_weapon || recipe.required_weapon.length === 0) {
    return hasMaterial
  }

  // ✅ check required weapon
  const [reqType, reqItem] = recipe.required_weapon

  const hasWeapon = hunter.value.equipments.weapons.some(
    (w) => w.weapon_type_id === reqType && w.item_id === reqItem,
  )

  return hasMaterial && hasWeapon
}

// 🎒 จำนวนของที่ hunter มี
const getInventoryCount = (typeId, itemId) => {
  if (!hunter.value) return 0

  const found = hunter.value.inventory.find(
    (i) => i.resource_type_id === typeId && i.item_id === itemId,
  )

  return found ? found.quantity : 0
}

// 🔎 หา resource info (ชื่อ + รูป)
const getResource = (typeId, itemId) => {
  const group = resourceData.find((r) => r.resource_type_id === typeId)
  return group?.resources.find((r) => r.item_id === itemId)
}

const getCrafting = (node) => {
  if (!hunter.value) return []

  const weaponCraft = craftingData
    .find((t) => t.type === 'Weapon')
    ?.craft_list.find((c) => c.hunter_class_id === hunter.value.hunter_class_id)
    ?.weapon_craft_list.find(
      (w) => w.weapon_type_id === node.weapon_type_id && w.item_id === node.item_id,
    )

  return weaponCraft?.crafting_table || []
}

const isEquipped = (node) => {
  if (!hunter.value) return false

  return hunter.value.equipments.weapons.some(
    (w) => w.weapon_type_id === node.weapon_type_id && w.item_id === node.item_id,
  )
}

const getRarityIcon = (rarity) => {
  if (!hunter.value) return ''
  const weaponTypeId = hunter.value.hunter_class_id

  const rarityGroup = rarityData[1].rarity_list.find((r) => r.equipment_rarity === rarity)

  if (!rarityGroup) return ''

  const weapon = rarityGroup.list.find((w) => w.id === weaponTypeId)

  return weapon ? `${import.meta.env.BASE_URL}${weapon.thumbnail}` : ''
}

// ===== GET WEAPON TREE =====
const weaponTree = computed(() => {
  if (!hunter.value) return []

  const classData = weaponsData.find((w) => w.hunter_class_id === hunter.value.hunter_class_id)

  if (!classData) return []

  return classData.weapon_priority_set.map((path) => {
    const nodes = path.priority.map(([typeId, itemId], index) => {
      const type = classData.weapons_list.find((w) => w.weapon_type_id === typeId)
      const item = type?.items.find((i) => i.item_id === itemId)

      return {
        ...item,
        weapon_type_id: type?.weapon_type_id,
        weapon_type: type?.weapon_type,
        thumbnail: type?.thumbnail,
        tier: index, // 🔥 สำคัญ
      }
    })

    return {
      typeName: classData.weapons_list.find((w) => w.weapon_type_id === path.weapon_type_id)
        ?.weapon_type,
      typeThumbnail: classData.weapons_list.find((w) => w.weapon_type_id === path.weapon_type_id)
        ?.thumbnail,
      nodes,
    }
  })
})

const hasWeapon = (node) => {
  if (!hunter.value) return false

  return hunter.value.equipments.weapons.some(
    (w) => w.weapon_type_id === node.weapon_type_id && w.item_id === node.item_id,
  )
}

// ===== ARMOR =====
const getArmorRecipe = (equip_set_id, equip_id) => {
  return craftingData
    .find((c) => c.type === 'Armor')
    ?.craft_list.find((c) => c.equip_set_id === equip_set_id && c.equip_id === equip_id)
}

const getArmorCrafting = (equip_set_id, equip_id) => {
  return getArmorRecipe(equip_set_id, equip_id)?.crafting_table || []
}

const canCraftArmor = (equip_set_id, equip_id) => {
  if (!hunter.value) return false
  const recipe = getArmorRecipe(equip_set_id, equip_id)
  if (!recipe?.crafting_table) return false

  return recipe.crafting_table.every((mat) => {
    return getInventoryCount(mat.material[0], mat.material[1]) >= mat.amount
  })
}

const armorSlotKey = (armor_part_id) => {
  if (armor_part_id === 1) return 'helm'
  if (armor_part_id === 2) return 'mail'
  return 'greaves'
}

const hasArmor = (equip_set_id, equip_id, armor_part_id) => {
  if (!hunter.value) return false
  const slot = armorSlotKey(armor_part_id)
  return (hunter.value.equipments.armors[slot] || []).some(
    (a) => a.equip_set_id === equip_set_id && a.equip_id === equip_id,
  )
}

const craftArmor = (armorSet, equip) => {
  const recipe = getArmorRecipe(armorSet.equip_set_id, equip.equip_id)
  if (!recipe) return

  recipe.crafting_table.forEach((mat) => {
    const inv = hunter.value.inventory.find(
      (i) => i.resource_type_id === mat.material[0] && i.item_id === mat.material[1],
    )
    if (inv) {
      inv.quantity -= mat.amount
      if (inv.quantity <= 0) {
        hunter.value.inventory = hunter.value.inventory.filter((i) => i !== inv)
      }
    }
  })

  const slot = armorSlotKey(equip.armor_part_id)
  if (!hunter.value.equipments.armors[slot]) {
    hunter.value.equipments.armors[slot] = []
  }
  hunter.value.equipments.armors[slot].push({
    equip_set_id: armorSet.equip_set_id,
    equip_id: equip.equip_id,
    is_equip: false,
  })

  saveHunter(hunter.value)
}

const getElemental = (elemental_id) => {
  return elementalData.find((e) => e.elemental_id === elemental_id)
}

const getAbility = (ability_id) => {
  return bonusAbilityData.find((a) => a.ability_id === ability_id)
}

const hasFullSet = (equip_set_id) => {
  if (!hunter.value) return false
  return ['helm', 'mail', 'greaves'].every((slot) =>
    (hunter.value.equipments.armors[slot] || []).some((a) => a.equip_set_id === equip_set_id),
  )
}

const getArmorRarityIcon = (rarity, armor_part_id) => {
  const rarityGroup = rarityData[0].rarity_list.find((r) => r.equipment_rarity === rarity)
  if (!rarityGroup) return ''
  const item = rarityGroup.list.find((i) => i.id === armor_part_id)
  return item ? `${import.meta.env.BASE_URL}${item.thumbnail}` : ''
}

const armorList = computed(() => {
  return armorsData
    .filter((set) => set.equip_set_id > 2)
    .map((set) => ({
      equip_set_id: set.equip_set_id,
      set_name: set.equip_set,
      rarity: set.rarity,
      thumbnail: set.thumbnail,
      set_ability_bonus: set.set_ability_bonus,
      equips: set.equips,
    }))
})

// ─── ชั้นวางหมวด: เลือกได้ทีละหมวด แล้วค่อยแสดงรายการด้านล่าง ────────────────
// เดิมเป็น accordion เปิดพร้อมกันได้หลายอัน ทำให้หน้ายาวมากและหาของไม่เจอ
const selectedTypeKey = ref(null)

const craftTypes = computed(() => {
  if (activeTab.value === 'weapon') {
    return weaponTree.value.map((tree, i) => {
      const nodes = tree.nodes ?? []
      return {
        key: `w-${i}`,
        name: tree.typeName,
        thumbnail: tree.typeThumbnail,
        tree,
        total: nodes.length,
        owned: nodes.filter((n) => hasWeapon(n)).length,
        craftable: nodes.filter((n) => !hasWeapon(n) && canCraft(n)).length,
        pinned: nodes.some((n) =>
          isWhitelisted(whitelistKey('weapon', n.weapon_type_id, n.item_id)),
        ),
      }
    })
  }
  return armorList.value.map((set) => {
    const equips = set.equips ?? []
    return {
      key: `a-${set.equip_set_id}`,
      name: set.set_name,
      thumbnail: set.thumbnail,
      set,
      total: equips.length,
      owned: equips.filter((e) => hasArmor(set.equip_set_id, e.equip_id, e.armor_part_id)).length,
      craftable: equips.filter(
        (e) =>
          !hasArmor(set.equip_set_id, e.equip_id, e.armor_part_id) &&
          canCraftArmor(set.equip_set_id, e.equip_id),
      ).length,
      pinned: equips.some((e) =>
        isWhitelisted(whitelistKey('armor', set.equip_set_id, e.equip_id)),
      ),
    }
  })
})

const selectedType = computed(
  () => craftTypes.value.find((t) => t.key === selectedTypeKey.value) ?? null,
)

// สะเก็ดไฟ — ตำแหน่ง/จังหวะ/ระยะลอย กำหนดมือให้ไม่สัมพันธ์กัน
// ถ้าผูกทุกค่ากับ index มันจะกลายเป็นคลื่นกวาดข้างเดียวทันที
// สังเกตว่า delay ไม่ได้เรียงตาม x และ drift มีทั้งซ้ายและขวา
const EMBERS = [
  { x: 11, delay: 0.0, dur: 5.4, drift: 14, rise: 176, size: 3 },
  { x: 63, delay: 0.9, dur: 6.8, drift: -11, rise: 210, size: 2 },
  { x: 29, delay: 2.6, dur: 4.9, drift: 21, rise: 150, size: 3 },
  { x: 88, delay: 1.4, dur: 6.1, drift: -17, rise: 195, size: 2 },
  { x: 47, delay: 3.7, dur: 5.6, drift: 8, rise: 168, size: 3 },
  { x: 74, delay: 0.4, dur: 7.3, drift: 25, rise: 224, size: 2 },
  { x: 19, delay: 4.5, dur: 5.1, drift: -6, rise: 158, size: 2 },
  { x: 55, delay: 2.0, dur: 6.5, drift: -22, rise: 205, size: 3 },
  { x: 95, delay: 5.2, dur: 5.9, drift: 12, rise: 182, size: 2 },
]
const emberStyle = (em) => ({
  '--x': `${em.x}%`,
  '--delay': `${em.delay}s`,
  '--dur': `${em.dur}s`,
  '--drift': `${em.drift}px`,
  '--rise': `${-em.rise}px`,
  '--sz': `${em.size}px`,
})

// สะเก็ดไฟตอนสูบลมจุดเตา — กระจายรอบกองไฟ ไม่ใช่ไล่เป็นแถว
const IGNITE_SPARKS = [
  { x: -6, delay: 0.02, drift: -34, rise: 82 },
  { x: 52, delay: 0.16, drift: 26, rise: 64 },
  { x: -48, delay: 0.09, drift: -12, rise: 96 },
  { x: 22, delay: 0.24, drift: 40, rise: 71 },
  { x: -26, delay: 0.05, drift: 18, rise: 58 },
  { x: 70, delay: 0.13, drift: 33, rise: 88 },
  { x: 8, delay: 0.3, drift: -22, rise: 62 },
  { x: -66, delay: 0.19, drift: -41, rise: 76 },
  { x: 38, delay: 0.07, drift: 9, rise: 92 },
  { x: -14, delay: 0.27, drift: -28, rise: 55 },
]
const sparkStyle = (sp) => ({
  '--x': `${sp.x}px`,
  '--delay': `${sp.delay}s`,
  '--drift': `${sp.drift}px`,
  '--rise': `${-sp.rise}px`,
})

// ไอคอนแท็บ — ใช้ของจริงจากเกมแทน emoji
// Weapon = อาวุธ R1 ของ Class ที่เล่นอยู่ · Armor = Mail R1 (armor_part_id 2)
const weaponTabIcon = computed(() => getRarityIcon(1))
const armorTabIcon = computed(() => getArmorRarityIcon(1, 2))

// ─── สถานะเตา ───────────────────────────────────────────────
// 'off' → 'igniting' → 'lit' → 'closing' (เก็บงาน/ยุบช่อง) → 'quenching' (ดับไฟ) → 'off'
// จุดไฟครั้งเดียวตอนเปิดเตา สลับสายอื่นระหว่างที่เตายังติดไม่ต้องจุดใหม่
const IGNITE_MS = 900
const CLOSE_MS = 420
const QUENCH_MS = 700
const forgeState = ref('off')
let _forgeTimer = null

// คนที่ขอลดการเคลื่อนไหวไม่ควรต้องรอ animation ที่เขาไม่เห็นอยู่ดี
const _prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true

const _clearForgeTimer = () => {
  clearTimeout(_forgeTimer)
  _forgeTimer = null
}

const _forgeOffNow = () => {
  _clearForgeTimer()
  forgeState.value = 'off'
  selectedTypeKey.value = null
}

const _startQuench = () => {
  forgeState.value = 'quenching'
  _forgeTimer = setTimeout(_forgeOffNow, QUENCH_MS)
}

const _startIgnite = () => {
  forgeState.value = 'igniting'
  _forgeTimer = setTimeout(() => { forgeState.value = 'lit' }, IGNITE_MS)
}

const closeForge = () => {
  if (forgeState.value === 'off' || forgeState.value === 'closing' || forgeState.value === 'quenching') return
  _clearForgeTimer()
  if (_prefersReducedMotion()) {
    _forgeOffNow()
    return
  }
  // ยังจุดไฟไม่เสร็จ ยังไม่มีงานบนโต๊ะให้เก็บ — ข้ามไปดับเลย
  if (forgeState.value === 'igniting') {
    _startQuench()
    return
  }
  forgeState.value = 'closing'
  nextTick(collapseBench)
  _forgeTimer = setTimeout(_startQuench, CLOSE_MS)
}

const selectType = (key) => {
  // กดระหว่างกำลังเก็บงาน → ยกเลิกการดับ กลับมาใช้เตาต่อ ไม่ต้องจุดใหม่
  if (forgeState.value === 'closing') {
    _clearForgeTimer()
    _resetBenchHeight()
    selectedTypeKey.value = key
    forgeState.value = 'lit'
    return
  }
  // กดระหว่างไฟกำลังดับ → ไฟดับไปแล้ว ต้องจุดใหม่
  if (forgeState.value === 'quenching') {
    _clearForgeTimer()
    selectedTypeKey.value = key
    _startIgnite()
    return
  }
  // กดหมวดเดิมซ้ำ = ดับเตา
  if (selectedTypeKey.value === key) {
    closeForge()
    return
  }
  selectedTypeKey.value = key
  // เตาติดอยู่แล้ว (หรือกำลังจุด) → แค่สลับงาน ไม่จุดไฟซ้ำ
  if (forgeState.value === 'lit' || forgeState.value === 'igniting') return
  if (_prefersReducedMotion()) {
    forgeState.value = 'lit'
    return
  }
  _clearForgeTimer()
  _startIgnite()
}

onUnmounted(_clearForgeTimer)

// สลับแท็บ = เปลี่ยนของทั้งชุด ดับทันทีไม่ต้องเล่น animation
watch(activeTab, _forgeOffNow)

// ─── ขยายช่องเตาหลังไฟติด ────────────────────────────────────
// max-height ต้องเป็นตัวเลขจริงถึงจะ transition ได้ (auto ทรานซิชันไม่ได้)
// เลยวัด scrollHeight เอาตอนรันจริง แล้วคืนค่าเป็น auto เมื่อจบ
const BENCH_OPEN_MS = 600
const benchEl = ref(null)

const BENCH_MIN_H = 190 // เท่าความสูงจอจุดเตา — ขยาย/ยุบต่อจากตรงนั้นพอดี
let _benchCleanup = null

const _resetBenchHeight = () => {
  _benchCleanup?.()
  const el = benchEl.value
  if (!el) return
  el.style.transition = ''
  el.style.maxHeight = ''
}

// ยิง transition ของ max-height จาก from → to แล้วคืนค่าเป็น auto เมื่อจบ
const _animateBenchHeight = (from, to, ms) => {
  const el = benchEl.value
  if (!el || _prefersReducedMotion()) return
  _benchCleanup?.()

  el.style.transition = 'none'
  el.style.maxHeight = `${from}px`
  void el.offsetHeight // บังคับ reflow ไม่งั้นเบราว์เซอร์ยุบสองค่าเป็นเฟรมเดียว
  el.style.transition = `max-height ${ms}ms cubic-bezier(0.22, 0.61, 0.36, 1)`
  el.style.maxHeight = `${to}px`

  let fallback = null
  const cleanup = (e) => {
    // transitionend ยิงทุก property — สนใจเฉพาะ max-height
    if (e && e.propertyName !== 'max-height') return
    el.style.transition = ''
    el.style.maxHeight = ''
    el.removeEventListener('transitionend', cleanup)
    clearTimeout(fallback)
    _benchCleanup = null
  }
  // เผื่อ transitionend ไม่ยิง (แท็บถูกพัก / ความสูงบังเอิญเท่าเดิม)
  fallback = setTimeout(cleanup, ms + 150)
  el.addEventListener('transitionend', cleanup)
  _benchCleanup = cleanup
}

const expandBench = () => {
  const h = benchEl.value?.scrollHeight
  if (h) _animateBenchHeight(BENCH_MIN_H, h, BENCH_OPEN_MS)
}

const collapseBench = () => {
  const h = benchEl.value?.scrollHeight
  if (h) _animateBenchHeight(h, BENCH_MIN_H, CLOSE_MS)
}

watch(forgeState, async (state, prev) => {
  if (state !== 'lit' || prev !== 'igniting') return
  await nextTick()
  expandBench()
})
</script>

<template>
  <div class="crafting-page">

    <!-- CRAFT STATION HEADER -->
    <div class="craft-header">
      <div class="ch-line"></div>
      <div class="ch-title-wrap">
        <span class="ch-ornament">⚒</span>
        <h2 class="ch-title">The Forge</h2>
        <span class="ch-ornament">🔥</span>
      </div>
      <div class="ch-line"></div>
    </div>
    <p class="ch-subtitle">โรงตีเหล็ก</p>

    <!-- TABS -->
    <div class="tabs">
      <button class="tab-btn" :class="{ active: activeTab === 'weapon' }" @click="activeTab = 'weapon'">
        <img v-if="weaponTabIcon" :src="weaponTabIcon" class="tab-icon-img" alt="" />
        <span v-else class="tab-icon">⚔</span>
        <span>Weapons</span>
      </button>
      <button class="tab-btn" :class="{ active: activeTab === 'armor' }" @click="activeTab = 'armor'">
        <img v-if="armorTabIcon" :src="armorTabIcon" class="tab-icon-img" alt="" />
        <span v-else class="tab-icon">🛡</span>
        <span>Armor</span>
      </button>
    </div>

    <!-- ================= WHITELIST STATUS ================= -->
    <div class="wl-status-bar" v-if="whitelist.length > 0">
      <span class="wl-status-label">🔔 Craft Watchlist</span>
      <div class="wl-status-items">
        <div
          v-for="item in whitelist"
          :key="item.key"
          class="wl-status-chip"
          :class="{ 'wl-chip-weapon': item.type === 'weapon', 'wl-chip-armor': item.type === 'armor' }"
        >
          <img :src="getImg(item.thumbnail)" class="wl-chip-img" />
          <span class="wl-chip-name">{{ item.name }}</span>
          <button class="wl-chip-remove" @click="removeFromWhitelist(item.key)">✕</button>
        </div>
      </div>
      <span class="wl-status-count">{{ whitelist.length }} / 5</span>
    </div>

    <!-- ================= ชั้นวางแม่พิมพ์ — เลือกหมวดก่อน ================= -->
    <div
      class="forge-rack"
      :class="{
        igniting: forgeState === 'igniting',
        closing: forgeState === 'closing',
        quenching: forgeState === 'quenching',
      }"
    >
      <!-- เบ้าถ่านคุที่ก้นเตา + สะเก็ดไฟลอยขึ้น -->
      <div class="forge-coals"></div>
      <span
        v-for="(em, i) in EMBERS"
        :key="'em' + i"
        class="forge-ember"
        :style="emberStyle(em)"
      ></span>

      <div class="rack-head">
        <span class="rack-label">{{ activeTab === 'weapon' ? 'สายอาวุธ' : 'ชุดเกราะ' }}</span>
        <span class="rack-hint">แตะเพื่อเปิดรายการด้านล่าง</span>
      </div>
      <div class="rack-slots">
        <button
          v-for="t in craftTypes"
          :key="t.key"
          class="rack-slot"
          :class="{ active: selectedTypeKey === t.key, 'has-craftable': t.craftable > 0 }"
          @click="selectType(t.key)"
        >
          <span v-if="t.pinned" class="rack-pin">📌</span>
          <span v-if="t.craftable > 0" class="rack-badge" title="ตีได้ตอนนี้">🔨{{ t.craftable }}</span>
          <img :src="getImg(t.thumbnail)" class="rack-icon" />
          <span class="rack-name">{{ t.name }}</span>
          <span class="rack-owned">{{ t.owned }}/{{ t.total }}</span>
        </button>
      </div>
    </div>

    <!-- ยังไม่เลือกหมวด — เตายังไม่ติดไฟ -->
    <!-- ================= จุดเตา — เล่นครั้งเดียวตอนเปิดเตา ================= -->
    <div v-if="forgeState === 'igniting'" class="forge-igniting">
      <div class="ig-hearth">
        <span v-for="n in 5" :key="'f' + n" class="ig-flame" :style="`--i:${n}`"></span>
        <span
          v-for="(sp, i) in IGNITE_SPARKS"
          :key="'s' + i"
          class="ig-spark"
          :style="sparkStyle(sp)"
        ></span>
      </div>
      <p class="ig-text">กำลังจุดเตา</p>
      <p class="ig-sub">{{ selectedType?.name }}</p>
    </div>

    <!-- ================= ดับเตา ================= -->
    <div v-else-if="forgeState === 'quenching'" class="forge-igniting forge-quenching">
      <div class="ig-hearth">
        <span v-for="n in 5" :key="'f' + n" class="ig-flame" :style="`--i:${n}`"></span>
        <span v-for="n in 5" :key="'m' + n" class="ig-smoke" :style="`--i:${n}`"></span>
      </div>
      <p class="ig-text">ดับเตา</p>
      <p class="ig-sub">เก็บงานเรียบร้อย</p>
    </div>

    <!-- ================= โต๊ะช่าง — รายการของหมวดที่เลือก ================= -->
    <div
      v-else-if="selectedType"
      ref="benchEl"
      class="forge-bench"
      :class="{ 'is-closing': forgeState === 'closing' }"
      :key="selectedTypeKey"
    >
      <!-- เบ้าถ่าน + สะเก็ดไฟชุดเดียวกับชั้นวาง — ของที่ตีอยู่ในแสงไฟ -->
      <div class="forge-coals"></div>
      <span
        v-for="(em, i) in EMBERS"
        :key="'be' + i"
        class="forge-ember"
        :style="emberStyle(em)"
      ></span>

      <div class="bench-head">
        <img :src="getImg(selectedType.thumbnail)" class="bench-icon" />
        <div class="bench-info">
          <span class="bench-kicker">{{ activeTab === 'weapon' ? 'Weapon Line' : 'Armor Set' }}</span>
          <h3 class="bench-name">{{ selectedType.name }}</h3>
          <span class="bench-meta">
            มีแล้ว {{ selectedType.owned }}/{{ selectedType.total }}
            <template v-if="selectedType.craftable > 0"> · ตีได้ {{ selectedType.craftable }}</template>
          </span>
        </div>
        <button class="bench-close" @click="closeForge" title="ดับเตา">✕</button>
      </div>

    <!-- ================= WEAPON ================= -->
    <div v-if="activeTab === 'weapon'" class="weapon-tree">
      <div class="tree-line">
        <!-- 🔥 WEAPON TIERS -->
        <div class="tree-nodes">
          <div
            v-for="(node, i) in selectedType.tree.nodes"
            :key="i"
            class="node-wrapper"
            :style="{ '--i': i }"
          >
            <!-- NODE -->
            <div
              class="node-card"
              :class="{
                equipped: isEquipped(node),
                locked: !isEquipped(node),
                craftable: canCraft(node),
              }"
              @click="openModal('weapon', node)"
            >
              <div
                v-if="isWhitelisted(whitelistKey('weapon', node.weapon_type_id, node.item_id))"
                class="wl-pin-indicator"
              >📌</div>

              <img class="rarity-icon" :src="getRarityIcon(node.rarity)" />
              <p class="weapon-name">{{ node.item }}</p>
              <!-- ⭐ RARITY -->

              <!-- 🔥 STATS -->
              <div class="weapon-stats">
                <!-- 🛠 CRAFTING -->
                <div class="crafting-box" v-if="getCrafting(node).length && !hasWeapon(node)">
                  <div v-for="(mat, mIndex) in getCrafting(node)" :key="mIndex" class="material">
                    <img :src="getImg(getResource(mat.material[0], mat.material[1])?.thumbnail)" />

                    <div class="mat-info">
                      <span class="mat-name">
                        {{ getResource(mat.material[0], mat.material[1])?.item }}
                      </span>

                      <span class="mat-count">
                        {{ getInventoryCount(mat.material[0], mat.material[1]) }} /
                        {{ mat.amount }}
                      </span>
                    </div>
                  </div>
                </div>

                <!-- ⚔️ DAMAGE (แถวเดียว) -->
                <div class="damage-row">
                  <template v-for="(val, key) in node.damage_cards || {}" :key="key">
                    <div v-if="val > 0" class="stat dmg">
                      <div class="icon-wrap">
                        <img :src="getImg('assets/img/take_damage.png')" />
                        <span class="tier">{{ key.split('_')[1] }}</span>
                      </div>
                      <p class="dmg-count">x{{ val }}</p>
                    </div>
                  </template>
                </div>

                <!-- 🛡 DEFENSE -->
                <div class="defense-row" v-if="node.defense > 0">
                  <div class="armor-element-card">
                    <img :src="getImg('assets/img/bonus_armor.png')" class="armor-base" />
                    <span class="element-value">{{ node.defense }}</span>
                  </div>
                </div>
              </div>

              <fieldset class="crafting-box" v-if="node.add != ''">
                <label for="name">➕</label>
                <span class="mat-name" v-for="text in node.add.split('\n')" :key="text">{{
                  text
                }}</span>
              </fieldset>

              <div class="crafting-box" v-if="node.remove != ''">
                <label for="name">🗑️</label>
                <span class="mat-name" v-for="text in node.remove.split('\n')" :key="text">{{
                  text
                }}</span>
              </div>

            </div>

            <!-- 🔥 LINE -->
            <div v-if="i < selectedType.tree.nodes.length - 1" class="line"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- ================= ARMOR ================= -->
    <div v-if="activeTab === 'armor'" class="weapon-tree">
      <div class="tree-line">
        <!-- SET BONUS -->
        <div class="set-bonus-col">
          <div
            v-if="selectedType.set.set_ability_bonus !== 0 && getAbility(selectedType.set.set_ability_bonus)"
            class="set-bonus-bar"
            :class="{ unlocked: hasFullSet(selectedType.set.equip_set_id) }"
          >
            <div class="set-bonus-head">
              <span class="set-bonus-label">Set Bonus</span>
              <span class="set-bonus-state">
                {{ hasFullSet(selectedType.set.equip_set_id) ? '✦ ครบชุดแล้ว' : '🔒 ยังไม่ครบชุด' }}
              </span>
            </div>
            <span class="set-bonus-name">{{ getAbility(selectedType.set.set_ability_bonus).ability_name }}</span>
            <span class="set-bonus-desc">{{ getAbility(selectedType.set.set_ability_bonus).ability }}</span>
          </div>
        </div>

        <!-- ARMOR PIECES -->
        <div class="tree-nodes">
          <div
            v-for="(equip, i) in selectedType.set.equips"
            :key="equip.equip_id"
            class="node-wrapper"
            :style="{ '--i': i }"
          >
            <div
              class="node-card"
              :class="{
                equipped: hasArmor(selectedType.set.equip_set_id, equip.equip_id, equip.armor_part_id),
                locked: !hasArmor(selectedType.set.equip_set_id, equip.equip_id, equip.armor_part_id),
                craftable: canCraftArmor(selectedType.set.equip_set_id, equip.equip_id),
              }"
              @click="openModal('armor', null, selectedType.set, equip)"
            >
              <div
                v-if="isWhitelisted(whitelistKey('armor', selectedType.set.equip_set_id, equip.equip_id))"
                class="wl-pin-indicator"
              >📌</div>

              <img
                class="rarity-icon"
                :src="getArmorRarityIcon(selectedType.set.rarity, equip.armor_part_id)"
              />
              <p class="weapon-name">{{ equip.equip }}</p>

              <div class="weapon-stats">
                <!-- MATERIALS -->
                <div
                  class="crafting-box"
                  v-if="
                    getArmorCrafting(selectedType.set.equip_set_id, equip.equip_id).length &&
                    !hasArmor(selectedType.set.equip_set_id, equip.equip_id, equip.armor_part_id)
                  "
                >
                  <div
                    v-for="(mat, mIndex) in getArmorCrafting(selectedType.set.equip_set_id, equip.equip_id)"
                    :key="mIndex"
                    class="material"
                  >
                    <img :src="getImg(getResource(mat.material[0], mat.material[1])?.thumbnail)" />
                    <div class="mat-info">
                      <span class="mat-name">{{
                        getResource(mat.material[0], mat.material[1])?.item
                      }}</span>
                      <span class="mat-count">
                        {{ getInventoryCount(mat.material[0], mat.material[1]) }} / {{ mat.amount }}
                      </span>
                    </div>
                  </div>
                </div>

                <!-- STATS -->
                <div class="defense-row">
                  <div v-if="equip.physical_armor > 0" class="armor-element-card">
                    <img :src="getImg('assets/img/bonus_armor.png')" class="armor-base" />
                    <span class="element-value">{{ equip.physical_armor }}</span>
                  </div>

                  <div v-if="equip.elemental_armor?.elemental_id !== 0" class="armor-element-card">
                    <img :src="getImg('assets/img/bonus_armor.png')" class="armor-base" />
                    <img
                      :src="getImg(getElemental(equip.elemental_armor.elemental_id)?.thumbnail)"
                      class="element-icon"
                    />
                    <span class="element-value">{{ equip.elemental_armor.protection }}</span>
                  </div>
                </div>
              </div>

              <!-- PIECE ABILITY -->
              <div v-if="equip.ability_id !== 0 && getAbility(equip.ability_id)" class="ability-tag">
                <span class="ability-name">{{ getAbility(equip.ability_id).ability_name }}</span>
                <span class="ability-desc">{{ getAbility(equip.ability_id).ability }}</span>
              </div>

            </div>
          </div>
        </div>

      </div>
    </div>
    </div>

    <!-- ================= เตายังไม่ติดไฟ ================= -->
    <div v-else class="forge-empty">
      <span class="forge-empty-icon">⚒</span>
      <p class="forge-empty-title">เตายังไม่ติดไฟ</p>
      <p class="forge-empty-sub">เลือกหมวดจากชั้นวางด้านบนเพื่อเริ่มตี</p>
    </div>

    <!-- ================= ITEM MODAL ================= -->
    <teleport to="body">
      <transition name="im-fade">
        <div v-if="showItemModal" class="im-overlay" @click.self="!isCrafting && closeModal()">
          <div class="im-card" :class="{ 'im-crafting': isCrafting }">

            <!-- Forge Animation Overlay -->
            <transition name="craft-anim">
              <div v-if="isCrafting" class="craft-overlay">
                <div class="forge-ambient"></div>

                <div class="forge-hammer-wrap">
                  <span class="forge-hammer">🔨</span>
                </div>

                <div class="forge-impact-zone">
                  <div class="forge-impact-flash"></div>
                  <span class="forge-item">{{ modalType === 'weapon' ? '⚔' : '🛡' }}</span>
                  <span v-for="n in 12" :key="n" class="forge-spark" :style="`--i:${n}`"></span>
                </div>

                <span class="forge-done-text">✦ Crafted! ✦</span>
              </div>
            </transition>

            <!-- Header -->
            <div class="im-header">
              <img :src="modalRarityIcon" class="im-rarity-icon" />
              <div class="im-header-info">
                <span class="im-type-badge">{{ modalType === 'weapon' ? '⚔ Weapon' : '🛡 Armor' }}</span>
                <h3 class="im-name">{{ modalName }}</h3>
              </div>
              <button class="im-close" @click="closeModal">✕</button>
            </div>

            <!-- Materials -->
            <div v-if="modalMaterials.length && !modalHasItem" class="im-materials">
              <p class="im-section-label">— Materials Required —</p>
              <div class="im-mat-list">
                <div v-for="(mat, i) in modalMaterials" :key="i" class="im-mat-row">
                  <img :src="getImg(getResource(mat.material[0], mat.material[1])?.thumbnail)" class="im-mat-img" />
                  <span class="im-mat-name">{{ getResource(mat.material[0], mat.material[1])?.item }}</span>
                  <span
                    class="im-mat-count"
                    :class="{
                      'mat-ok': getInventoryCount(mat.material[0], mat.material[1]) >= mat.amount,
                      'mat-short': getInventoryCount(mat.material[0], mat.material[1]) < mat.amount,
                    }"
                  >{{ getInventoryCount(mat.material[0], mat.material[1]) }} / {{ mat.amount }}</span>
                </div>
              </div>
            </div>

            <div v-if="modalHasItem" class="im-owned-notice">✓ มีแล้ว</div>

            <!-- Actions -->
            <div class="im-actions">
              <button
                v-if="!modalHasItem"
                class="im-btn im-btn-wl"
                :class="{ 'im-wl-on': modalIsWhitelisted }"
                :disabled="!modalIsWhitelisted && (whitelist.length >= 5 || modalCanCraft)"
                @click="modalToggleWhitelist"
              >
                <span>{{ modalIsWhitelisted ? '📌 Remove Whitelist' : '🔕 Add Whitelist' }}</span>
                <span v-if="!modalIsWhitelisted && whitelist.length >= 5" class="im-btn-hint">เต็มแล้ว</span>
                <span v-else-if="!modalIsWhitelisted && modalCanCraft" class="im-btn-hint">Craft ได้แล้ว</span>
              </button>

              <button
                v-if="!modalHasItem"
                class="im-btn im-btn-craft"
                :class="{ 'im-craft-ready': modalCanCraft }"
                :disabled="!modalCanCraft"
                @click="modalCraft"
              >
                🔨 Craft
              </button>
            </div>
          </div>
        </div>
      </transition>
    </teleport>
  </div>
</template>

<style scoped>
/* ══════════════════════════════════════════
   BASE
══════════════════════════════════════════ */
/* โทนโรงตีเหล็ก: เหล็กเย็น + แสงเตาอุ่นจากด้านล่าง */
.crafting-page {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 16px;
  color: #f0ddb0;
  font-family: 'Georgia', 'Times New Roman', serif;
}

/* ── พื้นผิวใช้ซ้ำทั้งหน้า ──
   ผิวเรียบเป๊ะคือสิ่งที่ทำให้ดูเป็นของสมัยใหม่
   grain = เม็ดหยาบบนโลหะ · grit = หยาบกว่า ใช้กับหิน · scratch = รอยขูดจากการใช้งาน
   .im-overlay ถูก teleport ไป body — อยู่นอก .crafting-page เลยต้องประกาศซ้ำที่นี่ */
.crafting-page,
.im-overlay {
  /* feTurbulence คายสัญญาณรบกวนเป็นสี RGB — ต้อง saturate 0 ไม่งั้นได้เม็ดสีรุ้ง
     ใช้คนละสเกลระหว่างพื้นหลังกับเนื้อหา ไม่งั้นทุกอย่างกลืนเป็นผืนเดียว
     grit  = หยาบ ชัด → ผนัง/พื้น (ถอยหลัง)
     grain = ละเอียด จาง → แผ่นเหล็ก/การ์ด (ลอยขึ้นหน้า) */
  --grit: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='r'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='180' height='180' filter='url(%23r)' opacity='0.13'/%3E%3C/svg%3E");
  --grain: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='110' height='110'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.6' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='110' height='110' filter='url(%23g)' opacity='0.07'/%3E%3C/svg%3E");
  --scratch:
    repeating-linear-gradient(19deg, transparent 0 17px, rgba(255,238,210,0.02) 17px 18px, transparent 18px 43px),
    repeating-linear-gradient(-71deg, transparent 0 29px, rgba(0,0,0,0.04) 29px 30px, transparent 30px 67px);

  /* ── ผนัง/พื้นไม้รมควัน ──
     เสี้ยนไม้เป็นลายมีทิศทาง ต่างจากเม็ดโลหะบนการ์ด — แยก figure/ground ให้เอง
     ระยะของเสี้ยนสามชั้นไม่ลงตัวกัน (6/11/19px) จะได้ไม่เห็นลายซ้ำ */
  --wood-grain:
    repeating-linear-gradient(0deg, rgba(0,0,0,0.2) 0 1px, transparent 1px 6px),
    repeating-linear-gradient(0deg, rgba(255,216,164,0.04) 0 1px, transparent 1px 11px),
    repeating-linear-gradient(0deg, rgba(0,0,0,0.13) 0 2px, transparent 2px 19px);
  /* รอยต่อแผ่นไม้ — เส้นมืดแล้วมีขอบรับแสงบาง ๆ ถัดขึ้นไป */
  --wood-planks:
    repeating-linear-gradient(
      0deg,
      rgba(0,0,0,0.55) 0 2px,
      rgba(232,198,152,0.055) 2px 3px,
      transparent 3px 94px
    );
  /* เขม่าควัน: ล่างสุดเข้มจัด ไล่จางขึ้นไปแล้วหมดแถว ๆ 60%
     เหนือจากนั้นเป็นเนื้อไม้สะอาด — ไฟอยู่ข้างล่าง เขม่าจึงไม่ควรขึ้นไปถึงยอด */
  --soot: linear-gradient(
    to top,
    rgba(6,4,2,0.97) 0%,
    rgba(8,5,3,0.9) 9%,
    rgba(10,6,3,0.7) 22%,
    rgba(12,7,4,0.42) 37%,
    rgba(14,8,4,0.16) 50%,
    rgba(16,9,5,0.05) 57%,
    transparent 62%
  );
}

/* แสงเตาอบขึ้นมาจากหลังชั้นวาง */
.crafting-page::before {
  content: '';
  position: absolute;
  inset: -20px -20px auto;
  height: 340px;
  pointer-events: none;
  z-index: 0;
  background: radial-gradient(
    ellipse 70% 100% at 50% 30%,
    rgba(160, 78, 20, 0.1) 0%,
    rgba(110, 46, 12, 0.05) 45%,
    transparent 72%
  );
}
.crafting-page > * { position: relative; z-index: 1; }

/* ══════════════════════════════════════════
   HEADER
══════════════════════════════════════════ */
.craft-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.ch-line {
  flex: 1;
  height: 1px;
  background: linear-gradient(to right, transparent, #7c5a2b);
}

.ch-line:last-child {
  background: linear-gradient(to left, transparent, #7c5a2b);
}

.ch-title-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
  white-space: nowrap;
}

/* ชื่อร้านเหมือนเหล็กเผาไฟ */
.ch-title {
  margin: 0;
  font-size: 18px;
  color: #ffca6e;
  letter-spacing: 4px;
  text-transform: uppercase;
  text-shadow:
    0 2px 4px rgba(0, 0, 0, 0.9),
    0 0 12px rgba(190, 100, 30, 0.45),
    0 0 26px rgba(150, 62, 16, 0.25);
}

.ch-ornament {
  font-size: 15px;
  color: #a8802e;
  filter: drop-shadow(0 0 5px rgba(180, 92, 28, 0.4));
}

.ch-subtitle {
  margin: -10px 0 0;
  text-align: center;
  font-size: 11px;
  letter-spacing: 4px;
  color: #7c5a2b;
}

/* ══════════════════════════════════════════
   TABS
══════════════════════════════════════════ */
.tabs {
  display: flex;
  gap: 8px;
}

/* แผ่นเหล็กดำตีมือ ตอกหมุดทองเหลือง — เลือกแล้วคือเหล็กที่เพิ่งออกจากเตา */
.tab-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 16px;
  border-radius: 3px 2px 3px 2px;
  border: 1px solid #0f0b08;
  background:
    var(--grain),
    var(--scratch),
    radial-gradient(ellipse 50px 20px at 14% 88%, rgba(118, 54, 18, 0.26), transparent 74%),
    radial-gradient(circle at 9px 50%, rgba(198,164,110,0.3) 0 1.6px, transparent 2.2px),
    radial-gradient(circle at calc(100% - 9px) 50%, rgba(198,164,110,0.3) 0 1.6px, transparent 2.2px),
    linear-gradient(170deg, #3a322a 0%, #2a231c 45%, #1b1712 100%);
  box-shadow: inset 0 1px 0 rgba(226,200,150,0.1), inset 0 -3px 8px rgba(0,0,0,0.55), 0 2px 5px rgba(0,0,0,0.5);
  color: #9b8a6d;
  font-family: 'Georgia', serif;
  font-size: 13px;
  letter-spacing: 1px;
  cursor: pointer;
  transition: 0.2s;
  min-height: 44px;
}

.tab-btn:hover {
  color: #d3c1a0;
  background:
    var(--grain),
    var(--scratch),
    radial-gradient(circle at 9px 50%, rgba(214,180,124,0.36) 0 1.6px, transparent 2.2px),
    radial-gradient(circle at calc(100% - 9px) 50%, rgba(214,180,124,0.36) 0 1.6px, transparent 2.2px),
    linear-gradient(170deg, #473c31 0%, #342c23 45%, #221c16 100%);
}

/* เหล็กเผาไฟ — ถ่านอำพันหม่น ไม่ใช่ส้มสด */
.tab-btn.active {
  color: #24120a;
  border-color: #5e2f0d;
  background:
    var(--grain),
    var(--scratch),
    radial-gradient(circle at 9px 50%, rgba(255,222,170,0.4) 0 1.6px, transparent 2.2px),
    radial-gradient(circle at calc(100% - 9px) 50%, rgba(255,222,170,0.4) 0 1.6px, transparent 2.2px),
    linear-gradient(to bottom, #c4913f 0%, #a36520 45%, #6e3a10 100%);
  text-shadow: 0 1px 0 rgba(255, 220, 165, 0.3);
  box-shadow:
    inset 0 1px 0 rgba(255, 224, 170, 0.35),
    inset 0 -4px 10px rgba(60, 22, 4, 0.5),
    0 0 12px rgba(170, 85, 20, 0.3),
    0 2px 6px rgba(0, 0, 0, 0.55);
}

.tab-icon { font-size: 14px; }

/* ไอคอนของจริงจากเกม — แขวนบนแผ่นเหล็ก */
.tab-icon-img {
  width: 26px;
  height: 26px;
  object-fit: contain;
  flex-shrink: 0;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.8));
  transition: filter 0.2s;
}
.tab-btn:hover .tab-icon-img { filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.85)) brightness(1.1); }
/* แท็บที่เลือกเป็นเหล็กเผาไฟ — ไอคอนต้องมีเงาเข้มขึ้นถึงจะไม่จมพื้นสว่าง */
.tab-btn.active .tab-icon-img {
  filter: drop-shadow(0 1px 3px rgba(40, 16, 4, 0.85)) drop-shadow(0 0 6px rgba(60, 24, 6, 0.5));
}

/* ══════════════════════════════════════════
   ชั้นวางหมวด (FORGE RACK) — กระดานไม้ตอกหมุด
══════════════════════════════════════════ */
/* ผนังเตาหลอม: หินทนไฟรมควัน กรอบเหล็ก ถ่านคุที่ก้น */
.forge-rack {
  position: relative;
  overflow: hidden;
  padding: 14px 12px 34px;
  border-radius: 3px;
  border: 4px solid #0f0b08;
  background:
    /* เม็ดหยาบบนผิวไม้ */
    var(--grit),
    /* ไอร้อนอาบขึ้นมาจากเบ้าถ่าน */
    radial-gradient(ellipse 78% 40% at 50% 104%, rgba(255, 126, 32, 0.26) 0%, transparent 70%),
    /* เขม่าไล่จากล่างขึ้นบน */
    var(--soot),
    /* คราบเขม่าเกาะเป็นหย่อมไม่เป็นระเบียบ */
    radial-gradient(ellipse 110px 60px at 22% 44%, rgba(0,0,0,0.42), transparent 72%),
    radial-gradient(ellipse 70px 90px at 86% 26%, rgba(0,0,0,0.34), transparent 74%),
    radial-gradient(ellipse 150px 40px at 58% 12%, rgba(0,0,0,0.26), transparent 76%),
    /* รอยต่อแผ่นไม้ + เสี้ยนไม้ */
    var(--wood-planks),
    var(--wood-grain),
    /* เนื้อไม้ */
    linear-gradient(172deg, #6d4b2b 0%, #5b3e22 45%, #46301b 100%);
  box-shadow:
    inset 0 0 80px rgba(0,0,0,0.55),
    inset 0 2px 0 rgba(232,198,152,0.07),
    0 4px 16px rgba(0,0,0,0.6);
}

/* เบ้าถ่านคุตลอดแนวก้นเตา */
/* ถ่านคุเป็นก้อน ๆ ไม่เท่ากัน — ถ้าเรียงเป็นแถบเท่ากันจะกลายเป็น progress bar ทันที */
.forge-coals {
  position: absolute;
  left: 0;
  right: 0;
  bottom: -4px;
  height: 26px;
  pointer-events: none;
  background:
    radial-gradient(ellipse 26px 9px at 6% 100%, rgba(214, 118, 32, 0.75), transparent 70%),
    radial-gradient(ellipse 15px 6px at 14% 100%, rgba(150, 58, 14, 0.6), transparent 72%),
    radial-gradient(ellipse 34px 11px at 27% 100%, rgba(226, 138, 44, 0.8), transparent 68%),
    radial-gradient(ellipse 18px 7px at 39% 100%, rgba(140, 52, 12, 0.55), transparent 72%),
    radial-gradient(ellipse 30px 10px at 51% 100%, rgba(206, 110, 28, 0.72), transparent 70%),
    radial-gradient(ellipse 20px 8px at 63% 100%, rgba(232, 146, 50, 0.78), transparent 68%),
    radial-gradient(ellipse 16px 6px at 73% 100%, rgba(138, 50, 12, 0.55), transparent 72%),
    radial-gradient(ellipse 32px 10px at 85% 100%, rgba(210, 114, 30, 0.72), transparent 70%),
    radial-gradient(ellipse 19px 7px at 95% 100%, rgba(160, 64, 16, 0.6), transparent 72%),
    linear-gradient(to top, rgba(150, 60, 14, 0.4), transparent 85%);
  filter: blur(3px);
  animation: coals-breathe 5.5s ease-in-out infinite;
}
@keyframes coals-breathe {
  0%, 100% { opacity: 0.6; }
  50%      { opacity: 0.92; }
}

/* สะเก็ดไฟลอยขึ้น — ค่าทั้งหมดมาจากตาราง EMBERS ในสคริปต์ */
.forge-ember {
  position: absolute;
  bottom: -6px;
  left: var(--x, 50%);
  width: var(--sz, 3px);
  height: var(--sz, 3px);
  border-radius: 50%;
  background: #e0a055;
  box-shadow: 0 0 5px 1px rgba(200, 105, 30, 0.7);
  opacity: 0;
  pointer-events: none;
  animation: ember-rise var(--dur, 5.5s) ease-out infinite;
  animation-delay: var(--delay, 0s);
}
/* ลอยขึ้นแล้วเอนไปข้างเดียว แต่ระหว่างทางส่ายกลับนิดหน่อยเหมือนโดนลมร้อน */
@keyframes ember-rise {
  0%   { opacity: 0;    transform: translate(0, 0) scale(0.55); }
  10%  { opacity: 0.95; }
  38%  { transform: translate(calc(var(--drift, 12px) * 0.75), calc(var(--rise, -190px) * 0.34)) scale(0.9); }
  64%  { opacity: 0.5;  transform: translate(calc(var(--drift, 12px) * 0.25), calc(var(--rise, -190px) * 0.64)) scale(1); }
  100% { opacity: 0;    transform: translate(var(--drift, 12px), var(--rise, -190px)) scale(1.05); }
}
/* เตาสองชั้นใช้ตารางเดียวกัน — เลื่อนเฟสของอันล่างไม่ให้ลอยพร้อมกันเป๊ะ */
.forge-bench .forge-ember { animation-delay: calc(var(--delay, 0s) + 1.7s); }

.rack-head {
  display: flex;
  align-items: baseline;
  justify-content: center;
  flex-wrap: wrap;
  gap: 4px 10px;
  margin-bottom: 12px;
  padding: 0 2px;
  text-align: center;
}
.rack-label {
  font-size: 10px;
  letter-spacing: 3px;
  text-transform: uppercase;
  color: #e8c9a0;
  text-shadow: 0 1px 3px rgba(0,0,0,0.85), 0 0 10px rgba(230, 110, 25, 0.35);
}
.rack-hint {
  font-size: 10px;
  color: #b3a084;
  font-style: italic;
  text-shadow: 0 1px 2px rgba(0,0,0,0.7);
}

/* flex + wrap แทน grid — แถวสุดท้ายที่ไม่เต็มจะอยู่กลางกระดาน ไม่ชิดซ้าย */
.rack-slots {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
}

/* ช่องเสียบในกระดาน — จมลงไปในเนื้อไม้ */
.rack-slot {
  position: relative;
  width: 96px;
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  padding: 10px 6px 8px;
  border-radius: 3px 2px 3px 2px;
  border: 1px solid rgba(0,0,0,0.55);
  /* ช่องเสียบสว่างกว่าผนัง เพื่อให้อ่านออกว่าเป็นของคนละชิ้น */
  background:
    var(--grain),
    linear-gradient(170deg, #46392e, #2e2620);
  box-shadow: inset 0 1px 0 rgba(240,220,180,0.1), inset 0 -6px 12px rgba(0,0,0,0.45), 0 3px 8px rgba(0,0,0,0.6);
  font-family: 'Georgia', serif;
  cursor: pointer;
  transition: 0.15s;
}
.rack-slot:hover {
  border-color: rgba(180,116,44,0.5);
  background:
    var(--grain),
    linear-gradient(170deg, #55442f, #362b22);
}
/* มีของที่ตีได้ในหมวดนี้ — เหล็กเริ่มร้อน */
.rack-slot.has-craftable {
  border-color: rgba(170, 100, 36, 0.45);
  box-shadow:
    inset 0 3px 8px rgba(0,0,0,0.55),
    inset 0 -10px 18px rgba(165, 76, 18, 0.2);
}
/* หมวดที่เลือก — ดึงเหล็กออกจากเตา สว่างที่สุด */
.rack-slot.active {
  border: 1px solid #6b3810;
  background:
    var(--grain),
    linear-gradient(to bottom, #7d5426, #4a2c12);
  box-shadow:
    inset 0 1px 0 rgba(255,222,170,0.3),
    0 0 16px rgba(175, 84, 20, 0.4),
    0 4px 10px rgba(0,0,0,0.7);
}

.rack-icon {
  width: 46px;
  height: 46px;
  object-fit: contain;
  filter: drop-shadow(0 2px 3px rgba(0,0,0,0.6));
}
.rack-slot.active .rack-icon {
  filter: drop-shadow(0 0 10px rgba(255,160,60,0.75));
}
.rack-name {
  font-size: 10px;
  line-height: 1.25;
  text-align: center;
  color: #b3a288;
  /* ชื่อยาว — ตัดสองบรรทัดให้ทุกช่องสูงเท่ากัน */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.rack-slot.active .rack-name { color: #ffe0b0; font-weight: bold; }
.rack-owned {
  font-size: 9px;
  letter-spacing: 1px;
  color: #7d6f57;
}
.rack-slot.has-craftable .rack-owned { color: #b8813f; }
.rack-slot.active .rack-owned { color: #d9a869; }

/* หมุดปักบอกว่ามีของใน Watchlist */
.rack-pin {
  position: absolute;
  top: -6px;
  left: -4px;
  font-size: 13px;
  filter: drop-shadow(0 1px 3px rgba(0,0,0,0.8));
  pointer-events: none;
}
/* เหรียญทองเหลืองบอกจำนวนที่ตีได้ตอนนี้ */
/* เหล็กร้อนคาคีม — จำนวนที่ตีได้ตอนนี้ */
.rack-badge {
  position: absolute;
  top: -7px;
  right: -5px;
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: bold;
  color: #24120a;
  background: radial-gradient(circle at 35% 30%, #e8bf82, #b8762a 58%, #7d3d0b);
  border: 1px solid rgba(60,22,4,0.65);
  box-shadow: 0 0 7px rgba(175,84,20,0.45), 0 1px 4px rgba(0,0,0,0.6);
  pointer-events: none;
  animation: badge-glow 3s ease-in-out infinite;
}
@keyframes badge-glow {
  0%, 100% { box-shadow: 0 0 6px rgba(175,84,20,0.35), 0 1px 4px rgba(0,0,0,0.6); }
  50%      { box-shadow: 0 0 12px rgba(205,105,30,0.6), 0 1px 4px rgba(0,0,0,0.6); }
}

/* ══════════════════════════════════════════
   ยังไม่เลือกหมวด
══════════════════════════════════════════ */
/* เตาเย็น — เทาเหล็ก ไม่มีไฟ */
.forge-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 36px 20px;
  border-radius: 2px;
  border: 1px dashed rgba(140, 118, 84, 0.32);
  background: linear-gradient(170deg, rgba(38, 31, 25, 0.6), rgba(18, 14, 11, 0.55));
  box-shadow: inset 0 3px 12px rgba(0, 0, 0, 0.55);
  text-align: center;
}
.forge-empty-icon {
  font-size: 36px;
  opacity: 0.5;
  filter: grayscale(70%) sepia(25%);
}
.forge-empty-title { margin: 0; font-size: 13px; letter-spacing: 2px; color: #9b8a6d; }
.forge-empty-sub { margin: 0; font-size: 11px; color: #7d6f57; font-style: italic; }

/* ══════════════════════════════════════════
   จุดเตา — คั่นระหว่างเลือกหมวดกับเปิดงาน
══════════════════════════════════════════ */
.forge-igniting {
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  gap: 2px;
  min-height: 190px;
  padding: 18px 20px 26px;
  border-radius: 3px 2px 4px 2px;
  border: 2px solid #0d0a07;
  background:
    var(--grit),
    var(--soot),
    var(--wood-planks),
    var(--wood-grain),
    linear-gradient(172deg, #46301b, #3a2716 55%, #2a1c10);
  box-shadow: inset 0 0 70px rgba(0,0,0,0.6), 0 3px 10px rgba(0,0,0,0.5);
  animation: ig-room-light 0.9s ease-out both;
}
/* ทั้งเตาสว่างขึ้นตามไฟที่ติด */
@keyframes ig-room-light {
  0%   { box-shadow: inset 0 0 70px rgba(0,0,0,0.85), 0 3px 10px rgba(0,0,0,0.5); }
  45%  { box-shadow: inset 0 -40px 90px rgba(190, 88, 20, 0.5), inset 0 0 70px rgba(0,0,0,0.5), 0 3px 10px rgba(0,0,0,0.5); }
  100% { box-shadow: inset 0 -30px 70px rgba(170, 78, 16, 0.3), inset 0 0 70px rgba(0,0,0,0.55), 0 3px 10px rgba(0,0,0,0.5); }
}

/* เบ้าไฟกลางจอ */
.ig-hearth {
  position: relative;
  width: 100%;
  height: 84px;
  margin-bottom: 6px;
}
.ig-hearth::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: -10px;
  transform: translateX(-50%);
  width: 260px;
  height: 90px;
  border-radius: 50%;
  background: radial-gradient(ellipse at 50% 100%, rgba(220, 110, 26, 0.5), transparent 68%);
  filter: blur(8px);
  animation: ig-glow-grow 0.9s ease-out both;
}
@keyframes ig-glow-grow {
  0%   { opacity: 0; transform: translateX(-50%) scale(0.3); }
  40%  { opacity: 1; transform: translateX(-50%) scale(1.05); }
  100% { opacity: 0.85; transform: translateX(-50%) scale(1); }
}

/* เปลวไฟห้าลิ้น ติดไล่กัน */
.ig-flame {
  position: absolute;
  bottom: 0;
  left: calc(50% + (var(--i) - 3) * 30px);
  width: 30px;
  height: 56px;
  margin-left: -15px;
  border-radius: 50% 50% 46% 46% / 68% 68% 32% 32%;
  background: linear-gradient(to top, #ffdb9c 0%, #e8912e 32%, #bb4a0d 66%, transparent 100%);
  filter: blur(3px);
  transform-origin: 50% 100%;
  opacity: 0;
  animation: ig-flame-up 0.9s ease-out both;
  animation-delay: calc((var(--i) - 1) * 0.07s);
}
@keyframes ig-flame-up {
  0%   { opacity: 0;    transform: scaleY(0.12) scaleX(0.6); }
  28%  { opacity: 1;    transform: scaleY(1.2)  scaleX(1); }
  52%  { opacity: 0.92; transform: scaleY(0.85) scaleX(1.08); }
  76%  { opacity: 0.85; transform: scaleY(1.12) scaleX(0.94); }
  100% { opacity: 0.7;  transform: scaleY(1)    scaleX(1); }
}

/* สะเก็ดไฟกระเด็นตอนสูบลม */
.ig-spark {
  position: absolute;
  bottom: 8px;
  left: calc(50% + var(--x, 0px));
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: #ffcf8a;
  box-shadow: 0 0 6px 1px rgba(230, 130, 40, 0.85);
  opacity: 0;
  animation: ig-spark-fly 0.9s ease-out both;
  animation-delay: var(--delay, 0s);
}
@keyframes ig-spark-fly {
  0%   { opacity: 0; transform: translate(0, 0) scale(0.5); }
  18%  { opacity: 1; }
  100% { opacity: 0; transform: translate(var(--drift, 0px), var(--rise, -74px)) scale(1); }
}

.ig-text {
  margin: 0;
  font-size: 12px;
  letter-spacing: 5px;
  text-transform: uppercase;
  color: #f5cf94;
  text-shadow: 0 1px 3px rgba(0,0,0,0.9), 0 0 14px rgba(210, 108, 28, 0.6);
}
.ig-sub {
  margin: 0;
  font-size: 11px;
  color: #b3a084;
  font-style: italic;
  text-shadow: 0 1px 2px rgba(0,0,0,0.8);
}

/* ── ดับเตา ── */
.forge-quenching { animation: ig-room-dark 0.7s ease-in both; }
@keyframes ig-room-dark {
  0%   { box-shadow: inset 0 -30px 70px rgba(170, 78, 16, 0.3), inset 0 0 70px rgba(0,0,0,0.55), 0 3px 10px rgba(0,0,0,0.5); }
  55%  { box-shadow: inset 0 -16px 46px rgba(120, 52, 10, 0.16), inset 0 0 70px rgba(0,0,0,0.72), 0 3px 10px rgba(0,0,0,0.5); }
  100% { box-shadow: inset 0 0 80px rgba(0,0,0,0.9), 0 3px 10px rgba(0,0,0,0.5); }
}
/* เปลวไฟยุบลงแล้วดับ */
.forge-quenching .ig-flame {
  animation: ig-flame-down 0.7s ease-in both;
  animation-delay: calc((5 - var(--i)) * 0.05s);
}
@keyframes ig-flame-down {
  0%   { opacity: 0.7; transform: scaleY(1) scaleX(1); }
  40%  { opacity: 0.5; transform: scaleY(0.55) scaleX(0.9); }
  100% { opacity: 0;   transform: scaleY(0.08) scaleX(0.6); }
}
.forge-quenching .ig-hearth::after { animation: ig-glow-shrink 0.7s ease-in both; }
@keyframes ig-glow-shrink {
  0%   { opacity: 0.85; transform: translateX(-50%) scale(1); }
  100% { opacity: 0;    transform: translateX(-50%) scale(0.35); }
}
/* ควันลอยขึ้นแทนสะเก็ดไฟ */
.ig-smoke {
  position: absolute;
  bottom: 14px;
  left: calc(50% + (var(--i) - 3) * 30px);
  width: 22px;
  height: 22px;
  margin-left: -11px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(150, 142, 132, 0.5), transparent 70%);
  filter: blur(5px);
  opacity: 0;
  animation: ig-smoke-rise 0.7s ease-out both;
  animation-delay: calc((var(--i) - 1) * 0.07s);
}
@keyframes ig-smoke-rise {
  0%   { opacity: 0;    transform: translate(0, 0) scale(0.5); }
  30%  { opacity: 0.55; }
  100% { opacity: 0;    transform: translate(calc((var(--i) - 3) * 9px), -66px) scale(2.1); }
}
.forge-quenching .ig-text {
  color: #b3a084;
  text-shadow: 0 1px 3px rgba(0,0,0,0.9);
}

/* ชั้นวางด้านบนก็วูบตามตอนสูบลม */
.forge-rack.igniting .forge-coals {
  animation: coals-flare 0.9s ease-out;
}
@keyframes coals-flare {
  0%   { opacity: 0.6;  filter: blur(3px) brightness(1); }
  22%  { opacity: 1;    filter: blur(2px) brightness(1.9); }
  60%  { opacity: 0.95; filter: blur(3px) brightness(1.35); }
  100% { opacity: 0.75; filter: blur(3px) brightness(1); }
}
.forge-rack.igniting .forge-ember { animation-duration: 1.7s; }

/* ถ่านเริ่มหรี่ตั้งแต่ตอนเก็บงาน แล้วดับสนิทตอน quench */
.forge-rack.closing .forge-coals {
  animation: coals-ease 0.42s ease-in both;
}
@keyframes coals-ease {
  0%   { opacity: 0.92; filter: blur(3px) brightness(1); }
  100% { opacity: 0.85; filter: blur(3px) brightness(0.85); }
}

/* ถ่านหรี่ลงตอนดับเตา */
.forge-rack.quenching .forge-coals {
  animation: coals-dim 0.7s ease-in both;
}
@keyframes coals-dim {
  0%   { opacity: 0.85; filter: blur(3px) brightness(1); }
  100% { opacity: 0.32; filter: blur(4px) brightness(0.55); }
}
.forge-rack.quenching .forge-ember { animation: none; opacity: 0; }

/* ══════════════════════════════════════════
   โต๊ะช่าง (FORGE BENCH)
══════════════════════════════════════════ */
/* แท่นหินหน้าเตา — เขม่าจับ ขอบเหล็ก */
/* พื้นโรงตี — มืดและด้าน ทำหน้าที่ถอยหลังให้การ์ดลอยขึ้นมา */
.forge-bench {
  border-radius: 3px 2px 4px 2px;
  border: 2px solid #0d0a07;
  position: relative;
  padding-bottom: 30px;
  background:
    var(--grit),
    /* aura ไฟจากเบ้าถ่านด้านล่าง — วางก่อน soot จะได้ส่องทะลุเขม่าขึ้นมา */
    radial-gradient(ellipse 86% 46% at 50% 104%, rgba(232, 112, 28, 0.28) 0%, transparent 72%),
    radial-gradient(ellipse 55% 30% at 50% 100%, rgba(255, 150, 50, 0.16) 0%, transparent 70%),
    /* เขม่าไล่ขึ้นเหมือนผนัง แต่ไม้เข้มกว่าเพื่อให้การ์ดลอยขึ้นมา */
    var(--soot),
    radial-gradient(ellipse 120px 70px at 8% 62%, rgba(0,0,0,0.38), transparent 74%),
    radial-gradient(ellipse 100px 50px at 92% 30%, rgba(0,0,0,0.3), transparent 76%),
    radial-gradient(ellipse 90% 34% at 50% -6%, rgba(170, 76, 16, 0.12), transparent 70%),
    var(--wood-planks),
    var(--wood-grain),
    linear-gradient(172deg, #46301b, #3a2716 55%, #2a1c10);
  box-shadow: inset 0 1px 0 rgba(232,198,152,0.06), inset 0 0 70px rgba(0,0,0,0.55), 0 3px 10px rgba(0,0,0,0.5);
  overflow: hidden;
  /* เล่นทุกครั้งที่สลับสาย (มี :key) — เบาพอให้เป็นแค่ feedback ไม่ใช่ไฟลุก */
  animation: bench-reveal 0.32s cubic-bezier(0.22, 0.61, 0.36, 1) both;
}
@keyframes bench-reveal {
  0%   { opacity: 0; transform: translateY(6px); }
  100% { opacity: 1; transform: none; }
}
/* ถ่านกับสะเก็ดไฟอยู่หลังเนื้อหา — เป็น aura ไม่ใช่สิ่งกีดขวาง
   (element ที่ position: absolute จะทับ static content ถ้าไม่กำหนด z-index) */
.forge-bench > .forge-coals,
.forge-bench > .forge-ember { z-index: 0; }
.forge-bench > .bench-head,
.forge-bench > .weapon-tree { position: relative; z-index: 1; }

/* แถบเหล็กรัดหัวโต๊ะ ตอกหมุดสองข้าง */
.bench-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background:
    radial-gradient(circle at 10px 50%, rgba(198,164,110,0.32) 0 1.8px, transparent 2.4px),
    radial-gradient(circle at calc(100% - 10px) 50%, rgba(198,164,110,0.32) 0 1.8px, transparent 2.4px),
    linear-gradient(to bottom, #3d342b 0%, #2c251e 50%, #1e1813 100%);
  border-bottom: 2px solid #0f0b08;
  box-shadow: inset 0 1px 0 rgba(226,200,150,0.12), 0 2px 6px rgba(0,0,0,0.45);
}
.bench-icon {
  width: 42px;
  height: 42px;
  object-fit: contain;
  flex-shrink: 0;
  filter: drop-shadow(0 1px 3px rgba(0,0,0,0.6));
}
.bench-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.bench-kicker {
  font-size: 8px;
  letter-spacing: 3px;
  text-transform: uppercase;
  color: #9b8a6d;
}
.bench-name {
  margin: 0;
  font-size: 15px;
  color: #f0e2c6;
  text-shadow: 0 1px 3px rgba(0,0,0,0.85);
  line-height: 1.3;
}
.bench-meta { font-size: 10px; color: #c1ae8c; letter-spacing: 0.5px; }
.bench-close {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: 2px;
  border: 1px solid #0f0b08;
  background: linear-gradient(170deg, #3a322a, #221c16);
  box-shadow: inset 0 1px 0 rgba(226,200,150,0.12);
  color: #c1ae8c;
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  transition: 0.15s;
}
.bench-close:hover { background: linear-gradient(170deg, #4a3f33, #2b241c); color: #f0e2c6; }

/* ══════════════════════════════════════════
   TREE
══════════════════════════════════════════ */
.weapon-tree {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* แถวรายการในโต๊ะช่าง */
.tree-line {
  display: block;
  padding: 12px;
}

/* SET BONUS COLUMN */
.set-bonus-col {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 0 4px;
}

/* SET BONUS BAR — ป้ายทองเหลืองสลักไว้
   เดิมใช้ opacity: 0.45 บอกสถานะ "ยังไม่ครบชุด" ซึ่งหรี่ทั้งกล่องจนอ่านไม่ออก
   ตอนนี้บอกสถานะด้วยป้ายกับสีขอบแทน ตัวหนังสือคมเต็มทั้งสองสถานะ */
.set-bonus-bar {
  padding: 11px 13px;
  border-radius: 2px;
  background: linear-gradient(170deg, #241d17, #16110d);
  border: 1px solid rgba(226, 200, 150, 0.2);
  border-left: 3px solid rgba(226, 200, 150, 0.28);
  box-shadow: inset 0 1px 0 rgba(240, 220, 180, 0.06), 0 3px 10px rgba(0, 0, 0, 0.55);
  display: flex;
  flex-direction: column;
  gap: 5px;
  width: 100%;
  transition: 0.3s;
}

.set-bonus-bar.unlocked {
  border-color: #6b4f1c;
  border-left-color: #c89b3c;
  background: linear-gradient(170deg, #3d3524, #211a11);
  box-shadow:
    inset 0 1px 0 rgba(255,220,160,0.18),
    0 0 16px rgba(160, 110, 40, 0.25),
    0 3px 10px rgba(0,0,0,0.55);
}

.set-bonus-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}

.set-bonus-label {
  font-size: 9px;
  font-weight: bold;
  color: #b08c4e;
  text-transform: uppercase;
  letter-spacing: 2px;
}

.set-bonus-bar.unlocked .set-bonus-label { color: #ffd27a; }

.set-bonus-state {
  font-size: 9px;
  letter-spacing: 1px;
  color: #96866a;
  white-space: nowrap;
}
.set-bonus-bar.unlocked .set-bonus-state { color: #8fe0aa; }

.set-bonus-name {
  font-size: 13px;
  font-weight: bold;
  color: #ded0b0;
}
.set-bonus-bar.unlocked .set-bonus-name { color: #ffe7bb; }

.set-bonus-desc {
  font-size: 11px;
  color: #b3a184;
  line-height: 1.65;
}
.set-bonus-bar.unlocked .set-bonus-desc { color: #d2bd97; }

/* NODE AREA */
.tree-nodes {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 8px;
  padding-top: 14px;
  overflow: visible;
}

/* NODE WRAPPER — วางลงโต๊ะทีละชิ้นตามลำดับขั้นการตี */
.node-wrapper {
  display: flex;
  align-items: flex-start;
  overflow: visible;
  animation: node-place 0.42s cubic-bezier(0.22, 0.61, 0.36, 1) both;
  animation-delay: calc(var(--i, 0) * 0.09s + 0.1s);
}
@keyframes node-place {
  0%   { opacity: 0; transform: translateY(16px) scale(0.95); }
  100% { opacity: 1; transform: none; }
}
/* เก็บงานออกจากโต๊ะทีละชิ้นตอนดับเตา */
.forge-bench.is-closing .node-wrapper {
  animation: node-lift 0.3s ease-in both;
  animation-delay: calc(var(--i, 0) * 0.05s);
}
@keyframes node-lift {
  0%   { opacity: 1; transform: none; }
  100% { opacity: 0; transform: translateY(-12px) scale(0.93); }
}
.forge-bench.is-closing .bench-head { animation: bench-head-out 0.34s ease-in both; }
@keyframes bench-head-out {
  0%   { opacity: 1; }
  100% { opacity: 0.15; }
}

/* NODE CARD — แผ่นเหล็กตีขึ้นรูป ตอกหมุดสี่มุม */
.node-card {
  width: 200px;
  padding: 12px 10px;
  /* มุมไม่เท่ากัน — ของตีมือไม่มีทางเนี้ยบเท่ากันทั้งสี่มุม */
  border-radius: 3px 2px 4px 2px;
  border: 2px solid #0f0b08;
  background:
    var(--grain),
    /* คราบสนิมที่มุม */
    radial-gradient(ellipse 40px 26px at 8% 92%, rgba(132, 64, 22, 0.26), transparent 74%),
    radial-gradient(ellipse 30px 34px at 96% 14%, rgba(114, 54, 18, 0.2), transparent 76%),
    radial-gradient(circle at 9px 9px, rgba(226,196,142,0.3) 0 1.8px, transparent 2.4px),
    radial-gradient(circle at calc(100% - 9px) 9px, rgba(226,196,142,0.3) 0 1.8px, transparent 2.4px),
    radial-gradient(circle at 9px calc(100% - 9px), rgba(226,196,142,0.3) 0 1.8px, transparent 2.4px),
    radial-gradient(circle at calc(100% - 9px) calc(100% - 9px), rgba(226,196,142,0.3) 0 1.8px, transparent 2.4px),
    /* รอยค้อนบนผิวเหล็ก */
    radial-gradient(ellipse 60% 30% at 30% 20%, rgba(240,220,180,0.06), transparent 70%),
    radial-gradient(ellipse 50% 25% at 72% 62%, rgba(0,0,0,0.2), transparent 70%),
    linear-gradient(168deg, #565043 0%, #423b31 42%, #2c2822 100%);
  /* ยกขึ้นจากพื้นด้วยเงาจริง ไม่ใช่แค่ขอบ */
  box-shadow:
    inset 0 1px 0 rgba(240,220,180,0.14),
    inset 0 -8px 16px rgba(0,0,0,0.4),
    0 5px 14px rgba(0,0,0,0.7);
  text-align: center;
  cursor: pointer;
  transition: 0.18s;
}

.node-card:hover {
  border-color: #2d251c;
  box-shadow:
    inset 0 1px 0 rgba(240,220,180,0.2),
    inset 0 -8px 16px rgba(0,0,0,0.32),
    0 10px 22px rgba(0,0,0,0.75);
  transform: translateY(-3px);
}

/* EQUIPPED — ตีเสร็จแล้ว ชุบทองเหลืองไว้ */
.node-card.equipped {
  border-color: #6b4f1c;
  box-shadow:
    inset 0 1px 0 rgba(255,230,180,0.28),
    inset 0 -6px 14px rgba(0,0,0,0.4),
    0 0 14px rgba(200, 155, 60, 0.32),
    0 2px 8px rgba(0,0,0,0.5);
}

/* LOCKED */
.node-card.locked {
  filter: grayscale(70%);
  opacity: 0.75;
}

.node-card.locked:hover {
  transform: none;
  box-shadow: none;
}

/* CRAFTABLE — เหล็กร้อนคาเตา พร้อมลงค้อน */
.node-card.craftable {
  border-color: #5e2f0d;
  background:
    var(--grain),
    radial-gradient(ellipse 40px 26px at 8% 92%, rgba(150, 68, 20, 0.28), transparent 74%),
    radial-gradient(ellipse 30px 34px at 96% 14%, rgba(122, 56, 16, 0.22), transparent 76%),
    radial-gradient(circle at 9px 9px, rgba(255,224,180,0.34) 0 1.8px, transparent 2.4px),
    radial-gradient(circle at calc(100% - 9px) 9px, rgba(255,224,180,0.34) 0 1.8px, transparent 2.4px),
    radial-gradient(circle at 9px calc(100% - 9px), rgba(255,224,180,0.34) 0 1.8px, transparent 2.4px),
    radial-gradient(circle at calc(100% - 9px) calc(100% - 9px), rgba(255,224,180,0.34) 0 1.8px, transparent 2.4px),
    radial-gradient(ellipse 90% 70% at 50% 118%, rgba(185, 84, 18, 0.42) 0%, transparent 70%),
    linear-gradient(168deg, #52402f 0%, #3f2f21 42%, #2b2018 100%);
  animation: forge-heat 3.2s ease-in-out infinite;
}
@keyframes forge-heat {
  0%, 100% {
    box-shadow:
      inset 0 1px 0 rgba(255,224,180,0.2),
      inset 0 -10px 20px rgba(155, 62, 10, 0.28),
      0 0 9px rgba(170, 80, 18, 0.28),
      0 5px 14px rgba(0,0,0,0.7);
  }
  50% {
    box-shadow:
      inset 0 1px 0 rgba(255,224,180,0.28),
      inset 0 -10px 22px rgba(185, 78, 12, 0.42),
      0 0 16px rgba(200, 96, 24, 0.42),
      0 5px 14px rgba(0,0,0,0.7);
  }
}

/* RARITY ICON */
.rarity-icon {
  width: 36px;
  height: 36px;
  object-fit: contain;
}

/* WEAPON NAME */
.weapon-name {
  font-size: 11px;
  color: #f0ddb0;
  margin: 4px 0 6px;
  line-height: 1.3;
}

/* CONNECTING LINE — เส้นเหล็กเชื่อมขั้นการตี */
.line {
  width: 40px;
  height: 2px;
  background: linear-gradient(to right, #8a7a5f, rgba(90, 78, 58, 0.4));
  margin: 0 4px;
  flex-shrink: 0;
  align-self: center;
  margin-top: 50px;
}

/* ══════════════════════════════════════════
   STATS
══════════════════════════════════════════ */
.weapon-stats {
  margin-top: 6px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

/* DAMAGE ROW */
.damage-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 4px;
}

/* DEFENSE ROW */
.defense-row {
  display: flex;
  justify-content: center;
  gap: 6px;
}

/* STAT BADGE */
.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.stat.dmg { color: #ffb347; }

/* ICON WRAP (damage tier overlay) */
.icon-wrap {
  position: relative;
  width: 40px;
  height: 40px;
  flex-shrink: 0;
}

.icon-wrap img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.icon-wrap .tier,
.icon-wrap .def-val {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  font-weight: bold;
  color: #fff;
  text-shadow: 0 0 5px rgba(0,0,0,0.9), 0 0 3px #000;
}

.dmg-count {
  margin: 0;
  font-size: 11px;
  font-weight: bold;
  color: #c89b3c;
}

/* ══════════════════════════════════════════
   ARMOR ELEMENT CARD
══════════════════════════════════════════ */
.armor-element-card {
  position: relative;
  width: 36px;
  height: 36px;
}

.armor-element-card .armor-base {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.armor-element-card .element-icon {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 28px !important;
  height: 28px !important;
  object-fit: contain;
  z-index: 2;
}

.armor-element-card .element-value {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 15px;
  font-weight: bold;
  color: #fff;
  text-shadow: 0 0 4px black;
  z-index: 3;
  -webkit-text-stroke: 0.5px black;
}

.armor-element-card .armor-phys-value {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 12px;
  font-weight: 900;
  color: #1a0f00;
  text-shadow:
    0 0 3px rgba(255, 255, 255, 0.9),
    0 1px 2px rgba(255, 255, 255, 0.8);
  z-index: 3;
}

/* ══════════════════════════════════════════
   CRAFTING BOX
══════════════════════════════════════════ */
/* ใบสูตร — กระดาษเปื้อนเขม่า ขอบเหลืองจากความร้อน */
.crafting-box {
  margin-top: 6px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  border-radius: 2px 3px 1px 3px;
  border: 1px solid #ab9564;
  color: #3a2c18;
  background:
    var(--grain),
    /* คราบนิ้วมือเปื้อนเขม่า */
    radial-gradient(ellipse 34px 20px at 88% 12%, rgba(90, 66, 32, 0.26), transparent 72%),
    radial-gradient(ellipse 26px 30px at 6% 72%, rgba(76, 54, 26, 0.2), transparent 74%),
    /* ขอบไหม้จากไอเตา */
    radial-gradient(ellipse 120% 40% at 50% 108%, rgba(126, 78, 30, 0.3), transparent 70%),
    linear-gradient(172deg, #e9dcbc, #d6c7a2);
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.5), inset 0 0 18px rgba(130, 100, 55, 0.2);
  text-align: left;
}

/* MATERIAL ROW */
.material {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 6px;
  border-radius: 2px;
  background: rgba(150, 120, 70, 0.12);
}

.material img {
  width: 20px;
  height: 20px;
  object-fit: contain;
  flex-shrink: 0;
}

.mat-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  gap: 4px;
}

.mat-name {
  font-size: 10px;
  color: #4a3a22;
}

.mat-count {
  font-size: 10px;
  font-weight: bold;
  color: #7a6238;
  flex-shrink: 0;
}

.mat-count.not-enough { color: #a3301f; }
.mat-count.enough { color: #1f6b45; }

/* label ของกล่อง ➕ / 🗑️ ก็อยู่บนกระดาษเหมือนกัน */
.crafting-box label { color: #7a6238; font-size: 11px; }

/* ══════════════════════════════════════════
   PIECE ABILITY
══════════════════════════════════════════ */
.ability-tag {
  margin-top: 7px;
  padding: 6px 8px;
  border-radius: 3px;
  background: linear-gradient(170deg, #2c1b38, #211530);
  border: 1px solid rgba(160, 80, 220, 0.35);
  border-left: 3px solid #a855f7;
  box-shadow: inset 0 1px 0 rgba(220, 180, 255, 0.08);
  display: flex;
  flex-direction: column;
  gap: 2px;
  text-align: left;
}

.ability-name {
  font-size: 11px;
  font-weight: bold;
  color: #c9a0ff;
}

.ability-desc {
  font-size: 10px;
  color: #b8a0d8;
  line-height: 1.4;
}

/* ══════════════════════════════════════════
   CRAFT BUTTON
══════════════════════════════════════════ */
.btn-craft {
  margin-top: 8px;
  width: 100%;
  padding: 7px;
  border-radius: 7px;
  border: 1px solid #c89b3c;
  background: linear-gradient(to bottom, #2a1e10, #17120c);
  color: #ffd27a;
  font-family: 'Georgia', serif;
  font-size: 11px;
  letter-spacing: 1px;
  cursor: pointer;
  transition: 0.2s;
}

.btn-craft:hover {
  background: linear-gradient(to bottom, #3a2c1a, #1a1208);
  box-shadow: 0 0 8px rgba(200, 155, 60, 0.4);
}

/* ══════════════════════════════════════════
   RESPONSIVE — iPad (≤768px)
══════════════════════════════════════════ */
@media (max-width: 1080px) {
  /* Vertical tree layout for weapon and armor */
  .tree-nodes {
    padding-left: 0;
    flex-direction: column;
    align-items: center;
    gap: 0;
    flex-wrap: nowrap;
    padding-top: 8px;
  }

  .node-wrapper {
    flex-direction: column;
    align-items: center;
  }

  .node-card { width: min(280px, 100%); }

  .line {
    width: 2px;
    height: 24px;
    background: linear-gradient(to bottom, #c89b3c, rgba(124, 90, 43, 0.4));
    margin: 0;
    margin-top: 0;
    align-self: center;
  }
}

/* ══════════════════════════════════════════
   RESPONSIVE — Phone (≤480px)
══════════════════════════════════════════ */
@media (max-width: 480px) {
  .ch-title { font-size: 14px; letter-spacing: 2px; }

  .tab-btn { font-size: 12px; padding: 8px 10px; gap: 5px; }
  .tab-icon { font-size: 12px; }
  .tab-icon-img { width: 22px; height: 22px; }

  .tree-line { padding: 10px; }

  .node-card { width: min(240px, 100%); }

  .rack-slots { gap: 6px; }
  .rack-slot { width: 82px; }
  .rack-icon { width: 38px; height: 38px; }
  .forge-rack { padding: 12px 8px 14px; border-width: 3px; }
  .bench-name { font-size: 14px; }
}

/* ══════════════════════════════════════════
   WHITELIST PIN INDICATOR
══════════════════════════════════════════ */
.node-card {
  position: relative;
}

.wl-pin-indicator {
  position: absolute;
  top: 0;
  right: 0;
  transform: translate(50%, -50%);
  font-size: 20px;
  filter: drop-shadow(0 0 6px rgba(200, 155, 60, 0.9));
  pointer-events: none;
  z-index: 2;
  line-height: 1;
}

/* ══════════════════════════════════════════
   ITEM MODAL
══════════════════════════════════════════ */
.im-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.72);
  z-index: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

/* กล่องงานบนทั่ง — เหล็กตอกหมุด อาบแสงเตาจากล่าง */
.im-card {
  border-radius: 3px 2px 4px 2px;
  border: 3px solid #0f0b08;
  background:
    var(--grain),
    var(--scratch),
    radial-gradient(ellipse 60px 40px at 8% 88%, rgba(118, 54, 18, 0.26), transparent 74%),
    radial-gradient(ellipse 46px 50px at 94% 22%, rgba(100, 46, 16, 0.2), transparent 76%),
    radial-gradient(circle at 12px 12px, rgba(198,164,110,0.26) 0 2px, transparent 2.6px),
    radial-gradient(circle at calc(100% - 12px) 12px, rgba(198,164,110,0.26) 0 2px, transparent 2.6px),
    radial-gradient(ellipse 90% 45% at 50% 108%, rgba(165, 76, 16, 0.28) 0%, transparent 72%),
    linear-gradient(168deg, #372f27 0%, #29221b 45%, #1a1511 100%);
  width: 340px;
  max-width: 100%;
  box-shadow:
    inset 0 1px 0 rgba(226,200,150,0.12),
    0 0 26px rgba(160, 76, 18, 0.14),
    0 10px 40px rgba(0, 0, 0, 0.9);
  overflow: hidden;
}

.im-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 16px 14px;
  border-bottom: 1px solid rgba(200, 155, 60, 0.15);
}

.im-rarity-icon {
  width: 48px;
  height: 48px;
  object-fit: contain;
  flex-shrink: 0;
}

.im-header-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.im-type-badge {
  font-size: 9px;
  letter-spacing: 2px;
  color: #a88040;
  text-transform: uppercase;
}

.im-name {
  margin: 0;
  font-size: 16px;
  color: #f0ddb0;
  font-family: 'Georgia', serif;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.im-close {
  background: none;
  border: none;
  color: #5a3d1f;
  font-size: 16px;
  cursor: pointer;
  padding: 4px 6px;
  line-height: 1;
  transition: color 0.15s;
  flex-shrink: 0;
}
.im-close:hover { color: #cc4444; }

.im-materials {
  padding: 14px 16px;
  border-bottom: 1px solid rgba(200, 155, 60, 0.1);
}

.im-section-label {
  font-size: 10px;
  letter-spacing: 3px;
  color: #7c5a2b;
  text-transform: uppercase;
  text-align: center;
  margin: 0 0 10px;
}

.im-mat-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.im-mat-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.im-mat-img {
  width: 28px;
  height: 28px;
  object-fit: contain;
  border-radius: 4px;
  background: rgba(0,0,0,0.3);
  flex-shrink: 0;
}

.im-mat-name {
  flex: 1;
  font-size: 12px;
  color: #d4b87a;
}

.im-mat-count {
  font-size: 12px;
  font-weight: bold;
  min-width: 44px;
  text-align: right;
}
.mat-ok    { color: #3cb83c; }
.mat-short { color: #cc4444; }

.im-owned-notice {
  padding: 16px;
  text-align: center;
  font-size: 14px;
  color: #c89b3c;
  letter-spacing: 2px;
}

.im-actions {
  display: flex;
  gap: 10px;
  padding: 14px 16px;
}

.im-btn {
  flex: 1;
  padding: 10px 8px;
  border-radius: 8px;
  border: 1px solid;
  font-size: 13px;
  font-family: 'Georgia', serif;
  cursor: pointer;
  transition: all 0.15s;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.im-btn-wl {
  border-color: rgba(124, 90, 43, 0.5);
  background: rgba(124, 90, 43, 0.08);
  color: #a88040;
}
.im-btn-wl:hover:not(:disabled) {
  border-color: #c89b3c;
  background: rgba(200, 155, 60, 0.12);
  color: #f0ddb0;
}
.im-btn-wl.im-wl-on {
  border-color: rgba(200, 155, 60, 0.7);
  background: rgba(200, 155, 60, 0.12);
  color: #ffd27a;
}
.im-btn-wl:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.im-btn-hint {
  font-size: 9px;
  color: #7c5a2b;
  letter-spacing: 1px;
}

.im-btn-craft {
  border-color: rgba(90, 75, 55, 0.4);
  background: rgba(30, 24, 16, 0.5);
  color: #6b5c45;
}
/* พร้อมตี — เหล็กเผาไฟ เต้นตามจังหวะสูบลม */
.im-btn-craft.im-craft-ready {
  border-color: #5e2f0d;
  background: linear-gradient(to bottom, #c4913f 0%, #a36520 45%, #6e3a10 100%);
  color: #24120a;
  font-weight: bold;
  text-shadow: 0 1px 0 rgba(255, 220, 165, 0.3);
  animation: craft-ready-glow 3s ease-in-out infinite;
}
@keyframes craft-ready-glow {
  0%, 100% { box-shadow: inset 0 1px 0 rgba(255,224,170,0.35), 0 0 9px rgba(170,85,20,0.3); }
  50%      { box-shadow: inset 0 1px 0 rgba(255,224,170,0.45), 0 0 18px rgba(200,100,26,0.5); }
}
.im-btn-craft.im-craft-ready:hover {
  background: linear-gradient(to bottom, #d8a44c 0%, #b87527 45%, #82460f 100%);
}
.im-btn-craft:disabled { cursor: not-allowed; }

.im-fade-enter-active { animation: imFadeIn 0.2s ease-out; }
.im-fade-leave-active { animation: imFadeIn 0.15s ease-in reverse; }
@keyframes imFadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}
.im-fade-enter-active .im-card { animation: imSlideUp 0.22s cubic-bezier(0.22, 1, 0.36, 1); }
.im-fade-leave-active .im-card { animation: imSlideUp 0.15s ease-in reverse; }
@keyframes imSlideUp {
  from { transform: translateY(16px) scale(0.97); }
  to   { transform: translateY(0) scale(1); }
}

/* ── Blacksmith Forge Animation ── */
.im-card.im-crafting {
  border-color: rgba(255, 140, 40, 0.6);
  box-shadow:
    0 0 24px rgba(255, 100, 20, 0.25),
    0 8px 40px rgba(0, 0, 0, 0.9);
  transition: border-color 0.3s, box-shadow 0.3s;
}

.craft-overlay {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0;
  border-radius: inherit;
  background: linear-gradient(
    to bottom,
    rgba(5, 3, 1, 0.9) 0%,
    rgba(20, 8, 2, 0.82) 55%,
    rgba(45, 18, 4, 0.7) 100%
  );
  overflow: hidden;
}

/* Forge fire ambient */
.forge-ambient {
  position: absolute;
  bottom: -10px;
  left: 50%;
  transform: translateX(-50%);
  width: 180px;
  height: 70px;
  border-radius: 50%;
  background: radial-gradient(ellipse, rgba(255, 100, 20, 0.45) 0%, transparent 70%);
  animation: ambientPulse 0.38s ease-in-out infinite alternate;
  pointer-events: none;
}
@keyframes ambientPulse {
  from { opacity: 0.5; transform: translateX(-50%) scaleX(1); }
  to   { opacity: 1;   transform: translateX(-50%) scaleX(1.15); }
}

/* Hammer */
.forge-hammer-wrap {
  height: 72px;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  position: relative;
  z-index: 2;
}

.forge-hammer {
  font-size: 58px;
  display: block;
  transform-origin: 88% 78%;
  animation: blacksmithStrike 1.6s cubic-bezier(0.4, 0, 0.2, 1) forwards;
  filter: drop-shadow(0 6px 10px rgba(0, 0, 0, 0.9));
}

/* 3 strikes — impacts at 22%, 48%, 74% of 1.6s → 0.35s, 0.77s, 1.18s */
@keyframes blacksmithStrike {
  0%   { transform: rotate(-55deg); opacity: 0; }
  5%   { transform: rotate(-55deg); opacity: 1; }
  12%  { transform: rotate(-55deg); }
  22%  { transform: rotate(14deg); }     /* ── IMPACT 1 ── */
  31%  { transform: rotate(-50deg); }
  40%  { transform: rotate(-50deg); }
  48%  { transform: rotate(14deg); }     /* ── IMPACT 2 ── */
  57%  { transform: rotate(-48deg); }
  66%  { transform: rotate(-48deg); }
  74%  { transform: rotate(14deg); }     /* ── IMPACT 3 ── */
  85%  { transform: rotate(-22deg); }
  100% { transform: rotate(-22deg); }
}

/* Impact zone */
.forge-impact-zone {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 80px;
  height: 64px;
  margin-top: -6px;
  z-index: 1;
}

/* Item icon on anvil */
.forge-item {
  font-size: 38px;
  display: block;
  position: relative;
  z-index: 2;
  animation: itemForge 1.6s ease-in-out forwards;
}
@keyframes itemForge {
  0%, 18% { filter: drop-shadow(0 0 4px rgba(255, 140, 40, 0.4)); }
  22%     { filter: drop-shadow(0 0 20px rgba(255, 210, 60, 1.0)) brightness(1.5); } /* Hit 1 */
  30%     { filter: drop-shadow(0 0 6px  rgba(255, 140, 40, 0.5)); }
  44%, 46%{ filter: drop-shadow(0 0 4px rgba(255, 140, 40, 0.4)); }
  48%     { filter: drop-shadow(0 0 20px rgba(255, 210, 60, 1.0)) brightness(1.5); } /* Hit 2 */
  56%     { filter: drop-shadow(0 0 6px  rgba(255, 140, 40, 0.5)); }
  70%, 72%{ filter: drop-shadow(0 0 4px rgba(255, 140, 40, 0.4)); }
  74%     { filter: drop-shadow(0 0 26px rgba(255, 230, 80, 1.0)) brightness(1.7); } /* Hit 3 */
  88%     { filter: drop-shadow(0 0 14px rgba(255, 180, 50, 0.7)); }
  100%    { filter: drop-shadow(0 0 14px rgba(255, 180, 50, 0.7)); }
}

/* Impact flash ring */
.forge-impact-flash {
  position: absolute;
  inset: -8px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255, 240, 120, 0.85) 0%, transparent 70%);
  pointer-events: none;
  z-index: 3;
  animation: impactFlash 1.6s ease-out forwards;
}
@keyframes impactFlash {
  0%, 18%  { opacity: 0; transform: scale(0.2); }
  22%      { opacity: 1; transform: scale(1.6); }   /* Hit 1 */
  28%      { opacity: 0; transform: scale(0.8); }
  44%, 46% { opacity: 0; transform: scale(0.2); }
  48%      { opacity: 1; transform: scale(1.5); }   /* Hit 2 */
  54%      { opacity: 0; transform: scale(0.8); }
  70%, 72% { opacity: 0; transform: scale(0.2); }
  74%      { opacity: 1; transform: scale(1.8); }   /* Hit 3 */
  82%      { opacity: 0; }
  100%     { opacity: 0; }
}

/* Sparks — 12 total, 4 per impact */
.forge-spark {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #ffd060;
  box-shadow: 0 0 5px 2px rgba(255, 200, 50, 0.8);
  opacity: 0;
  animation: forgeSpark 0.55s ease-out var(--delay) both;
}
/* Impact 1 → delay ~0.34s (22% of 1.6s) */
.forge-spark:nth-child(1) { --delay: 0.33s; --ax: -50px; --ay: -58px; }
.forge-spark:nth-child(2) { --delay: 0.33s; --ax:  50px; --ay: -58px; }
.forge-spark:nth-child(3) { --delay: 0.33s; --ax: -22px; --ay: -78px; }
.forge-spark:nth-child(4) { --delay: 0.33s; --ax:  22px; --ay: -78px; }
/* Impact 2 → delay ~0.75s (48% of 1.6s) */
.forge-spark:nth-child(5) { --delay: 0.75s; --ax: -58px; --ay: -48px; }
.forge-spark:nth-child(6) { --delay: 0.75s; --ax:  58px; --ay: -48px; }
.forge-spark:nth-child(7) { --delay: 0.75s; --ax: -28px; --ay: -72px; }
.forge-spark:nth-child(8) { --delay: 0.75s; --ax:  28px; --ay: -72px; }
/* Impact 3 → delay ~1.16s (74% of 1.6s) */
.forge-spark:nth-child(9)  { --delay: 1.16s; --ax: -68px; --ay: -42px; }
.forge-spark:nth-child(10) { --delay: 1.16s; --ax:  68px; --ay: -42px; }
.forge-spark:nth-child(11) { --delay: 1.16s; --ax: -34px; --ay: -68px; }
.forge-spark:nth-child(12) { --delay: 1.16s; --ax:  34px; --ay: -68px; }

@keyframes forgeSpark {
  0%   { opacity: 1; transform: translate(-50%, -50%) translate(0, 0) scale(1.3); }
  70%  { opacity: 0.7; }
  100% { opacity: 0; transform: translate(-50%, -50%) translate(var(--ax), var(--ay)) scale(0); }
}

/* "Crafted!" text — appears after 3rd strike */
.forge-done-text {
  font-family: 'Georgia', serif;
  font-size: 18px;
  font-weight: bold;
  letter-spacing: 5px;
  color: #ffd27a;
  text-shadow:
    0 0 14px rgba(255, 200, 60, 0.9),
    0 0 35px rgba(200, 155, 60, 0.5);
  margin-top: 14px;
  animation: doneTextIn 0.45s cubic-bezier(0.22, 1, 0.36, 1) 1.1s both;
}
@keyframes doneTextIn {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}

.craft-anim-enter-active { animation: craftOverlayIn 0.18s ease-out; }
.craft-anim-leave-active { animation: craftOverlayIn 0.15s ease-in reverse; }
@keyframes craftOverlayIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}

/* Status bar */
/* ใบสั่งงานหนีบไว้บนแผ่นเหล็ก */
.wl-status-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 2px;
  border: 1px solid #0f0b08;
  border-left: 3px solid #a36520;
  background:
    var(--grain),
    var(--scratch),
    radial-gradient(circle at 10px 50%, rgba(198,164,110,0.3) 0 1.8px, transparent 2.4px),
    linear-gradient(170deg, #3a322a, #2a231c 50%, #1e1813);
  box-shadow: inset 0 1px 0 rgba(226,200,150,0.11), 0 2px 6px rgba(0,0,0,0.45);
  flex-wrap: wrap;
}

.wl-status-label {
  font-size: 11px;
  letter-spacing: 2px;
  color: #a88040;
  text-transform: uppercase;
  white-space: nowrap;
}

.wl-status-items {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  flex: 1;
}

.wl-status-chip {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 3px 6px 3px 4px;
  border-radius: 5px;
  font-size: 11px;
  color: #f0ddb0;
}

.wl-chip-weapon {
  background: linear-gradient(170deg, #1e2738, #151b26);
  border: 1px solid rgba(90, 140, 220, 0.45);
  border-radius: 3px;
}

.wl-chip-armor {
  background: linear-gradient(170deg, #38201c, #261512);
  border: 1px solid rgba(200, 90, 70, 0.45);
  border-radius: 3px;
}

.wl-chip-img {
  width: 20px;
  height: 20px;
  object-fit: contain;
  border-radius: 3px;
}

.wl-chip-name {
  max-width: 90px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.wl-chip-remove {
  background: none;
  border: none;
  color: #a88040;
  cursor: pointer;
  font-size: 10px;
  padding: 0 2px;
  line-height: 1;
  transition: color 0.1s;
}

.wl-chip-remove:hover { color: #cc4444; }

.wl-status-count {
  font-size: 11px;
  color: #a88040;
  white-space: nowrap;
}

/* ── ตัวหนังสือใน modal: พื้นเปลี่ยนเป็นเหล็กแล้ว โทนทองเดิมจึงหม่น ──
   วางท้ายไฟล์เพื่อให้ชนะกฎเดิมที่อยู่ด้านบน */
.im-header { border-bottom-color: rgba(226, 200, 150, 0.12); }
.im-name { color: #f0e2c6; }
.im-type-badge { color: #9b8a6d; }
.im-close { color: #7d6f57; }
.im-close:hover { color: #f0e2c6; }
.im-section-label { color: #9b8a6d; }
.im-mat-name { color: #c9b895; }
.im-mat-img { background: rgba(0, 0, 0, 0.35); }
.im-btn-hint { color: #7d6f57; }
.im-materials { border-bottom-color: rgba(226, 200, 150, 0.1); }
.im-btn-wl {
  border-color: rgba(226, 200, 150, 0.22);
  background: linear-gradient(170deg, #3a322a, #221c16);
  color: #c1ae8c;
}
.im-btn-wl:hover:not(:disabled) {
  border-color: rgba(226, 200, 150, 0.4);
  background: linear-gradient(170deg, #4a3f33, #2b241c);
  color: #f0e2c6;
}

/* ไฟเตากับสะเก็ดไฟเป็นแค่บรรยากาศ — ปิดให้คนที่ขอลดการเคลื่อนไหว */
@media (prefers-reduced-motion: reduce) {
  .forge-ember,
  .ig-spark,
  .ig-smoke { display: none; }
  .node-card.craftable,
  .im-btn-craft.im-craft-ready,
  .rack-badge,
  .forge-coals,
  .forge-bench,
  .forge-igniting,
  .node-wrapper,
  .ig-flame,
  .ig-hearth::after { animation: none; }
  /* JS ข้ามช่วงจุดเตาให้อยู่แล้ว นี่กันไว้เผื่อ state ค้าง */
  .ig-flame, .ig-hearth::after { opacity: 1; }
}
</style>
