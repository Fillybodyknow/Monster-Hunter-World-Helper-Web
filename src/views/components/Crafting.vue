<script setup>
import { ref, computed, onMounted } from 'vue'
import weaponsData from '@/assets/files/weapons.json'
import armorsData from '@/assets/files/armors.json'
import { getHunterById, saveHunter } from '@/services/hunterStorage'
import craftingData from '@/assets/files/crafting_item.json'
import resourceData from '@/assets/files/resource.json'
import rarityData from '@/assets/files/equiment_rarity.json'
import elementalData from '@/assets/files/elemental.json'
import bonusAbilityData from '@/assets/files/bonus_ability.json'
import { getArmors, getWeapons } from '@/services/equipService'

const activeTab = ref('weapon')

const hunter = ref(null)
const selectedWeapon = ref(null)

const getImg = (path) => `${import.meta.env.BASE_URL}${path}`

// ===== LOAD HUNTER =====
onMounted(() => {
  const id = parseInt(localStorage.getItem('hunterId'))
  hunter.value = getHunterById(id)
  // console.log(hunter.value)
})

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
  const weaponTypeId = hunter.value.hunter_class_id

  const rarityGroup = rarityData[1].rarity_list.find((r) => r.equipment_rarity === rarity)

  if (!rarityGroup) return ''

  const weapon = rarityGroup.list.find((w) => w.id === weaponTypeId)

  return weapon ? `/src/${weapon.thumbnail}` : ''
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

// ===== SELECT =====
const selectWeapon = (w) => {
  selectedWeapon.value = w
}

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
  return item ? `/src/${item.thumbnail}` : ''
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
</script>

<template>
  <div class="crafting-page">

    <!-- CRAFT STATION HEADER -->
    <div class="craft-header">
      <div class="ch-line"></div>
      <div class="ch-title-wrap">
        <span class="ch-ornament">🔨</span>
        <h2 class="ch-title">Crafting Station</h2>
        <span class="ch-ornament">🔨</span>
      </div>
      <div class="ch-line"></div>
    </div>

    <!-- TABS -->
    <div class="tabs">
      <button class="tab-btn" :class="{ active: activeTab === 'weapon' }" @click="activeTab = 'weapon'">
        <span class="tab-icon">⚔</span>
        <span>Weapons</span>
      </button>
      <button class="tab-btn" :class="{ active: activeTab === 'armor' }" @click="activeTab = 'armor'">
        <span class="tab-icon">🛡</span>
        <span>Armor</span>
      </button>
    </div>

    <!-- ================= WEAPON ================= -->
    <div v-if="activeTab === 'weapon'" class="weapon-tree">
      <div v-for="(tree, tIndex) in weaponTree" :key="tIndex" class="tree-line">
        <!-- 🔥 LEFT: TREE INFO -->
        <div class="tree-info">
          <img :src="getImg(tree.typeThumbnail)" />
          <p>{{ tree.typeName }}</p>
        </div>

        <!-- 🔥 RIGHT: WEAPON TIERS -->
        <div class="tree-nodes">
          <div v-for="(node, i) in tree.nodes" :key="i" class="node-wrapper">
            <!-- NODE -->
            <div
              class="node-card"
              :class="{
                equipped: isEquipped(node),
                locked: !isEquipped(node),
                craftable: canCraft(node),
              }"
              @click="
                (selectWeapon(node), canCraft(node) && !hasWeapon(node) ? craftWeapon(node) : null)
              "
            >
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

              <!-- 🔥 CRAFT BUTTON -->
              <button
                v-if="canCraft(node) && !hasWeapon(node)"
                class="btn-craft"
                @click="craftWeapon(node)"
              >
                Craft
              </button>
            </div>

            <!-- 🔥 LINE -->
            <div v-if="i < tree.nodes.length - 1" class="line"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- ================= ARMOR ================= -->
    <div v-if="activeTab === 'armor'" class="weapon-tree">
      <div v-for="armorSet in armorList" :key="armorSet.equip_set_id" class="tree-line armor-tree-line">
        <!-- LEFT: SET INFO -->
        <div class="tree-info">
          <img :src="getImg(armorSet.thumbnail)" />
          <p>{{ armorSet.set_name }}</p>
        </div>

        <!-- CENTER: SET BONUS -->
        <div class="set-bonus-col">
          <div
            v-if="armorSet.set_ability_bonus !== 0 && getAbility(armorSet.set_ability_bonus)"
            class="set-bonus-bar"
            :class="{ unlocked: hasFullSet(armorSet.equip_set_id) }"
          >
            <span class="set-bonus-label">Set Bonus</span>
            <span class="set-bonus-name">{{ getAbility(armorSet.set_ability_bonus).ability_name }}</span>
            <span class="set-bonus-desc">{{ getAbility(armorSet.set_ability_bonus).ability }}</span>
          </div>
        </div>

        <!-- RIGHT: ARMOR PIECES -->
        <div class="tree-nodes">
          <div v-for="equip in armorSet.equips" :key="equip.equip_id" class="node-wrapper">
            <div
              class="node-card"
              :class="{
                equipped: hasArmor(armorSet.equip_set_id, equip.equip_id, equip.armor_part_id),
                locked: !hasArmor(armorSet.equip_set_id, equip.equip_id, equip.armor_part_id),
                craftable: canCraftArmor(armorSet.equip_set_id, equip.equip_id),
              }"
            >
              <img
                class="rarity-icon"
                :src="getArmorRarityIcon(armorSet.rarity, equip.armor_part_id)"
              />
              <p class="weapon-name">{{ equip.equip }}</p>

              <div class="weapon-stats">
                <!-- MATERIALS -->
                <div
                  class="crafting-box"
                  v-if="
                    getArmorCrafting(armorSet.equip_set_id, equip.equip_id).length &&
                    !hasArmor(armorSet.equip_set_id, equip.equip_id, equip.armor_part_id)
                  "
                >
                  <div
                    v-for="(mat, mIndex) in getArmorCrafting(armorSet.equip_set_id, equip.equip_id)"
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

              <!-- CRAFT BUTTON -->
              <button
                v-if="
                  canCraftArmor(armorSet.equip_set_id, equip.equip_id) &&
                  !hasArmor(armorSet.equip_set_id, equip.equip_id, equip.armor_part_id)
                "
                class="btn-craft"
                @click="craftArmor(armorSet, equip)"
              >
                Craft
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  </div>
</template>

<style scoped>
/* ══════════════════════════════════════════
   BASE
══════════════════════════════════════════ */
.crafting-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
  color: #f0ddb0;
  font-family: 'Georgia', 'Times New Roman', serif;
}

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

.ch-title {
  margin: 0;
  font-size: 18px;
  color: #ffd27a;
  letter-spacing: 4px;
  text-transform: uppercase;
  text-shadow: 0 0 12px rgba(255, 200, 80, 0.4);
}

.ch-ornament { font-size: 14px; color: #7c5a2b; }

/* ══════════════════════════════════════════
   TABS
══════════════════════════════════════════ */
.tabs {
  display: flex;
  gap: 8px;
}

.tab-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 16px;
  border-radius: 8px;
  border: 1px solid rgba(124, 90, 43, 0.5);
  background: rgba(16, 12, 6, 0.8);
  color: #7c5a2b;
  font-family: 'Georgia', serif;
  font-size: 13px;
  letter-spacing: 1px;
  cursor: pointer;
  transition: 0.2s;
  min-height: 44px;
}

.tab-btn:hover {
  color: #a88040;
  border-color: #7c5a2b;
}

.tab-btn.active {
  color: #ffd27a;
  border-color: #c89b3c;
  background: linear-gradient(to bottom, rgba(60, 40, 15, 0.8), rgba(20, 14, 6, 0.9));
  box-shadow: 0 0 10px rgba(200, 155, 60, 0.2);
  border-bottom: 2px solid #c89b3c;
}

.tab-icon { font-size: 14px; }

/* ══════════════════════════════════════════
   TREE
══════════════════════════════════════════ */
.weapon-tree {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* TREE ROW */
.tree-line {
  display: grid;
  grid-template-columns: 180px 1fr;
  align-items: start;
  padding: 12px;
  border-radius: 12px;
  background: linear-gradient(160deg, rgba(22, 16, 8, 0.9), rgba(12, 9, 5, 0.95));
  border: 1px solid rgba(124, 90, 43, 0.6);
  overflow: hidden;
}

/* ARMOR TREE: 3 columns */
.armor-tree-line {
  grid-template-columns: 160px 160px 1fr !important;
}

/* LEFT INFO */
.tree-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  border-right: 1px solid rgba(200, 155, 60, 0.15);
  padding: 4px 12px 4px 0;
}

.tree-info img {
  width: 80px;
  height: 80px;
  object-fit: contain;
  filter: drop-shadow(0 0 6px rgba(255, 200, 100, 0.3));
}

.tree-info p {
  font-size: 11px;
  font-weight: bold;
  color: #c89b3c;
  text-align: center;
  letter-spacing: 0.5px;
  margin: 0;
}

/* SET BONUS COLUMN */
.set-bonus-col {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px 10px;
  border-right: 1px solid rgba(200, 155, 60, 0.15);
}

/* SET BONUS BAR */
.set-bonus-bar {
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(20, 14, 6, 0.8);
  border: 1px solid rgba(124, 90, 43, 0.35);
  display: flex;
  flex-direction: column;
  gap: 4px;
  opacity: 0.4;
  width: 100%;
  transition: 0.3s;
}

.set-bonus-bar.unlocked {
  border-color: #c89b3c;
  background: rgba(60, 40, 10, 0.4);
  box-shadow: 0 0 10px rgba(200, 155, 60, 0.25);
  opacity: 1;
}

.set-bonus-label {
  font-size: 8px;
  font-weight: bold;
  color: #7c5a2b;
  text-transform: uppercase;
  letter-spacing: 2px;
}

.set-bonus-bar.unlocked .set-bonus-label { color: #c89b3c; }

.set-bonus-name {
  font-size: 12px;
  font-weight: bold;
  color: #f0ddb0;
}

.set-bonus-desc {
  font-size: 10px;
  color: #a88040;
  line-height: 1.5;
}

/* NODE AREA */
.tree-nodes {
  display: flex;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 8px;
  padding-left: 12px;
}

/* NODE WRAPPER */
.node-wrapper {
  display: flex;
  align-items: flex-start;
}

/* NODE CARD */
.node-card {
  width: 200px;
  padding: 10px;
  border-radius: 10px;
  border: 1px solid rgba(124, 90, 43, 0.6);
  background: linear-gradient(160deg, rgba(28, 20, 10, 0.9), rgba(14, 10, 5, 0.95));
  text-align: center;
  cursor: pointer;
  transition: 0.18s;
}

.node-card:hover {
  border-color: #a88040;
  box-shadow: 0 0 12px rgba(200, 155, 60, 0.3);
  transform: translateY(-2px);
}

/* EQUIPPED */
.node-card.equipped {
  border: 2px solid #c89b3c;
  box-shadow:
    0 0 16px rgba(200, 155, 60, 0.5),
    inset 0 0 10px rgba(200, 155, 60, 0.08);
  background: linear-gradient(160deg, rgba(50, 35, 12, 0.9), rgba(25, 18, 6, 0.95));
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

/* CRAFTABLE */
.node-card.craftable {
  border: 2px solid #00e5b8;
  box-shadow: 0 0 10px rgba(0, 229, 184, 0.4);
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

/* CONNECTING LINE */
.line {
  width: 40px;
  height: 2px;
  background: linear-gradient(to right, #c89b3c, rgba(124, 90, 43, 0.4));
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
.crafting-box {
  margin-top: 6px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  border-radius: 8px;
  border: 1px solid rgba(124, 90, 43, 0.3);
  background: rgba(8, 6, 3, 0.7);
  box-shadow: inset 0 2px 6px rgba(0, 0, 0, 0.8);
}

/* MATERIAL ROW */
.material {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 6px;
  border-radius: 5px;
  background: rgba(255, 255, 255, 0.02);
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
  color: #c89b3c;
}

.mat-count {
  font-size: 10px;
  font-weight: bold;
  color: #7c5a2b;
  flex-shrink: 0;
}

.mat-count.not-enough { color: #e05050; }
.mat-count.enough { color: #5ab85a; }

/* ══════════════════════════════════════════
   PIECE ABILITY
══════════════════════════════════════════ */
.ability-tag {
  margin-top: 7px;
  padding: 6px 8px;
  border-radius: 6px;
  background: rgba(80, 50, 150, 0.15);
  border: 1px solid rgba(150, 100, 240, 0.3);
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
@media (max-width: 768px) {
  .tree-line {
    grid-template-columns: 1fr !important;
    gap: 10px;
  }

  .tree-info {
    flex-direction: row;
    border-right: none;
    border-bottom: 1px solid rgba(200, 155, 60, 0.15);
    padding: 0 0 10px;
    justify-content: flex-start;
  }

  .tree-info img { width: 60px; height: 60px; }
  .tree-info p { text-align: left; font-size: 13px; }

  .set-bonus-col {
    border-right: none;
    border-bottom: 1px solid rgba(200, 155, 60, 0.15);
    padding: 0 0 10px;
  }

  .tree-nodes {
    padding-left: 0;
    flex-wrap: wrap;
  }

  .node-card { width: 180px; }

  .line {
    width: 24px;
    margin-top: 44px;
  }
}

/* ══════════════════════════════════════════
   RESPONSIVE — Phone (≤480px)
══════════════════════════════════════════ */
@media (max-width: 480px) {
  .ch-title { font-size: 14px; letter-spacing: 2px; }

  .tab-btn { font-size: 12px; padding: 8px 10px; gap: 5px; }
  .tab-icon { font-size: 12px; }

  .tree-line { padding: 10px; border-radius: 10px; }
  .tree-info img { width: 50px; height: 50px; }

  .tree-nodes { gap: 6px; }
  .node-card { width: 150px; }

  .line { width: 16px; margin-top: 40px; }
}
</style>
