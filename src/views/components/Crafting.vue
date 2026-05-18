<script setup>
import { ref, computed, onMounted } from 'vue'
import weaponsData from '@/assets/files/weapons.json'
import { getHunterById, saveHunter } from '@/services/hunterStorage'
import craftingData from '@/assets/files/crafting_item.json'
import resourceData from '@/assets/files/resource.json'
import rarityData from '@/assets/files/equiment_rarity.json'
import { getArmors, getWeapons } from '@/services/equipService'

const activeTab = ref('weapon')

const hunter = ref(null)
const selectedWeapon = ref(null)

const getImg = (path) => `src/${path}`

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

  console.log('✅ SAVED & CRAFTED:', node.item)
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
</script>

<template>
  <div class="crafting-container">
    <!-- TAB -->
    <div class="tabs">
      <button :class="{ active: activeTab === 'weapon' }" @click="activeTab = 'weapon'">
        Weapon
      </button>
      <button :class="{ active: activeTab === 'armor' }" @click="activeTab = 'armor'">Armor</button>
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
                        <img src="/src/assets/img/take_damage.png" />
                        <span class="tier">{{ key.split('_')[1] }}</span>
                      </div>
                      <p class="dmg-count">x{{ val }}</p>
                    </div>
                  </template>
                </div>

                <!-- 🛡 DEFENSE -->
                <div class="defense-row" v-if="node.defense > 0">
                  <div class="stat def">
                    <div class="icon-wrap">
                      <img src="/src/assets/img/bonus_armor.png" />
                      <span class="def-val">{{ node.defense }}</span>
                    </div>
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
    <div v-if="activeTab === 'armor'">Coming Soon...</div>
  </div>
</template>

<style scoped>
.node-card.craftable {
  border: 2px solid #00ffcc;
  box-shadow: 0 0 12px rgba(0, 255, 200, 0.6);
}

.damage-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 4px;
}
.defense-row {
  display: flex;
  justify-content: center;
}
/* 🛠 crafting panel */
.crafting-box {
  margin-top: 8px;
  padding: 8px;

  display: flex;
  flex-direction: column;
  gap: 6px;

  border-radius: 10px;

  /* 🔥 กรอบ */
  border: 1px solid rgba(200, 150, 80, 0.4);

  /* 🔥 ทำให้ดูยุบลง */
  background: linear-gradient(to bottom, #14100a, #0d0a06);

  box-shadow:
    inset 0 2px 6px rgba(0, 0, 0, 0.8),
    inset 0 -1px 3px rgba(255, 200, 100, 0.1);
}

/* 📦 material row */
.material {
  display: flex;
  align-items: center;
  gap: 8px;

  padding: 4px 6px;

  border-radius: 6px;

  background: rgba(255, 255, 255, 0.03);
}

/* icon */
.material img {
  width: 20px;
  height: 20px;
  object-fit: contain;
}

/* 📝 text container */
.mat-info {
  display: flex;
  justify-content: space-between;
  align-items: center;

  width: 100%;
}

/* name */
.mat-name {
  font-size: 11px;
  color: #e6d3a3;
}

/* count */
.mat-count {
  font-size: 11px;
  font-weight: bold;
  color: #bbb;
}

/* 🔥 ถ้าของไม่พอ */
.mat-count.not-enough {
  color: #ff6b6b;
}

/* 🔥 ถ้าของพอ */
.mat-count.enough {
  color: #7cfc00;
}

/* ครอบ icon */
.icon-wrap {
  position: relative;
  width: 20px;
  height: 20px;
}

/* icon */
.icon-wrap img {
  width: 200%;
  height: 200%;
  object-fit: contain;
}

/* DEFENSE VALUE overlay */
.icon-wrap .def-val {
  left: 50%;
  transform: translateX(-50%);

  font-size: 14px;
  font-weight: bold;
  color: #ffffff;

  text-shadow:
    0 0 4px rgba(100, 180, 255, 0.8),
    0 0 2px #000;
}

.icon-wrap .tier,
.icon-wrap .def-val {
  position: absolute;
}

/* ตัวเลข "ชั้น damage" */
.icon-wrap .tier {
  left: 50%;
  transform: translateX(-50%);

  font-size: 14px;
  font-weight: bold;
  color: white;
  text-shadow:
    0 0 4px rgba(255, 200, 100, 0.8),
    0 0 2px #000;
}

/* xจำนวน */
.dmg-count {
  font-size: 10px;
  color: #ffb347;
}

/* ===== STAT CONTAINER ===== */
.weapon-stats {
  margin-top: 6px;

  display: flex;
  flex-direction: column; /* 🔥 สำคัญ */
  gap: 6px;
}

/* ===== STAT BADGE ===== */
.stat {
  display: flex;
  align-items: center;
  gap: 3px;

  padding: 2px 5px;
  border-radius: 6px;

  font-size: 10px;
  font-weight: bold;

  background: rgba(0, 0, 0, 0.6);
  border: 1px solid rgba(255, 200, 100, 0.3);

  box-shadow: inset 0 0 4px rgba(255, 200, 100, 0.2);
}

/* ICON */
.stat img {
  width: 14px;
  height: 14px;
}

/* DAMAGE STYLE */
.stat.dmg {
  color: #ffb347;
  border-color: rgba(255, 150, 50, 0.5);
}

/* DEFENSE STYLE */
.stat.def {
  color: #7ec8ff;
  border-color: rgba(100, 180, 255, 0.5);
}
/* 🔥 equipped = เรืองแสง */
.node-card.equipped {
  border: 2px solid gold;
  box-shadow:
    0 0 15px rgba(255, 200, 100, 0.9),
    0 0 30px rgba(255, 200, 100, 0.4);

  background: linear-gradient(to bottom, #3a2c1a, #1a1208);
}

/* ❌ locked = หม่น */
.node-card.locked {
  /* opacity: 0.75; */
  filter: grayscale(85%);
}

/* hover เฉพาะตัวที่ใช้ได้ */
.node-card.locked:hover {
  transform: none;
  box-shadow: none;
}

.weapon-tree {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* ===== LINE (แต่ละ tree) ===== */
.tree-line {
  display: grid;
  grid-template-columns: 200px 1fr;
  align-items: center;

  padding: 10px;
  border-radius: 12px;

  background: rgba(20, 15, 10, 0.9);
  border: 1px solid #7c5a2b;
}

/* ===== LEFT INFO ===== */
.tree-info {
  display: flex;
  align-items: center;
  gap: 10px;

  border-right: 1px solid rgba(255, 200, 100, 0.2);
  padding-right: 10px;
}

.tree-info img {
  width: 100px;
  height: 100px;
}

.tree-info p {
  font-weight: bold;
  color: #f5d7a1;
}

/* ===== NODE AREA ===== */
.tree-nodes {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-left: 15px;
}

/* ===== NODE ===== */
.node-wrapper {
  display: flex;
  align-items: center;
}

.node-card {
  width: 240px;
  padding: 10px;

  border-radius: 10px;
  border: 1px solid #7c5a2b;

  background: linear-gradient(to bottom, #2d2418, #17120c);

  text-align: center;
  cursor: pointer;

  transition: 0.2s;
}

.node-card:hover {
  border-color: gold;
  box-shadow: 0 0 12px rgba(255, 200, 100, 0.7);
  transform: translateY(-2px);
}

/* ===== TEXT ===== */
.weapon-name {
  font-size: 12px;
  color: #fff3d1;
  margin-bottom: 6px;
}

/* ===== RARITY ===== */
.rarity-icon {
  width: 40px;
  height: 40px;
  object-fit: contain;
}

/* ===== LINE ===== */
.line {
  width: 60px;
  height: 3px;

  background: linear-gradient(to right, gold, #7c5a2b);

  margin: 0 5px;
}

.crafting-container {
  color: #f5e6c8;
}

/* TAB */
.tabs {
  display: flex;
  gap: 10px;
  margin-bottom: 15px;
}

.tabs button {
  flex: 1;
  padding: 10px;

  background: #2d2418;
  border: 1px solid #7c5a2b;
  color: #aaa;
}

.tabs button.active {
  color: #fff;
  border-bottom: 2px solid gold;
}

/* LAYOUT */
.crafting-layout {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 15px;
}

/* TREE */
.tree-box {
  background: rgba(20, 15, 10, 0.9);
  border: 1px solid #7c5a2b;
  padding: 10px;
}

.tree-row {
  display: flex;
  align-items: center;
  margin-bottom: 20px;
}

.node {
  display: flex;
  align-items: center;
}

/* DETAIL */
.detail-box {
  background: rgba(20, 15, 10, 0.9);
  border: 1px solid #7c5a2b;
  padding: 15px;
}

/* ARMOR */

/* BUTTON */
.btn-craft {
  margin-top: 10px;
  width: 100%;
  padding: 8px;

  background: linear-gradient(to bottom, #3a2c1a, #1a1208);
  border: 1px solid #c89b3c;
  color: #f5e6c8;
}
</style>
