<script setup>
import { ref, onMounted, computed } from 'vue'
import { getHunterById, saveHunters, getHunters } from '@/services/hunterStorage'
import { loadHunter } from '@/stores/hunter'
import resourceData from '@/assets/files/resource.json'
import { openCraftLookup } from '@/composables/useCraftLookup'

const inventory = ref([])

// ===== LOAD =====
const loadInventory = () => {
  const HunterID = parseInt(localStorage.getItem('hunterId'))
  const Hunter = getHunterById(HunterID)
  inventory.value = [...(Hunter?.inventory || [])]
}

onMounted(() => {
  loadInventory()
})

// ===== INVENTORY CONTROL =====
const changeQty = (item, delta) => {
  const HunterID = parseInt(localStorage.getItem('hunterId'))
  const hunters = getHunters()
  const hunter = hunters.find((h) => h.hunter_id === HunterID)

  const inv = hunter.inventory.find(
    (i) => i.resource_type_id === item.resource_type_id && i.item_id === item.item_id,
  )

  if (!inv) return

  inv.quantity += delta

  if (inv.quantity <= 0) {
    hunter.inventory = hunter.inventory.filter(
      (i) => !(i.resource_type_id === item.resource_type_id && i.item_id === item.item_id),
    )
  }

  saveHunters(hunters)
  loadHunter()
  loadInventory()
}

// ===== GROUP =====
const groupedInventory = computed(() => {
  return resourceData
    .map((type) => {
      const items = inventory.value
        .filter((i) => i.resource_type_id === type.resource_type_id)
        .map((inv) => {
          const itemData = type.resources.find((r) => r.item_id === inv.item_id)
          if (!itemData) return null

          return {
            ...itemData,
            quantity: inv.quantity,
            resource_type_id: type.resource_type_id,
          }
        })
        .filter(Boolean)

      return {
        resource_type: type.resource_type,
        items,
      }
    })
    .filter((g) => g.items.length)
})

const getImg = (path) => `${import.meta.env.BASE_URL}${path}`

// ================= MODAL =================
const showAddModal = ref(false)
const selectedItems = ref([])
const search = ref('')

// 🔥 items ที่ยังไม่มี
const availableItems = computed(() => {
  const owned = inventory.value.map((i) => `${i.resource_type_id}-${i.item_id}`)

  return resourceData.flatMap((type) =>
    type.resources
      .filter((item) => !owned.includes(`${type.resource_type_id}-${item.item_id}`))
      .map((item) => ({
        ...item,
        resource_type_id: type.resource_type_id,
      })),
  )
})

// 🔍 search
const filteredAvailable = computed(() => {
  return availableItems.value.filter((i) =>
    i.item.toLowerCase().includes(search.value.toLowerCase()),
  )
})

// ➕➖ select item
const selectItem = (item, delta) => {
  let found = selectedItems.value.find(
    (i) => i.item_id === item.item_id && i.resource_type_id === item.resource_type_id,
  )

  if (!found) {
    if (delta > 0) {
      selectedItems.value.push({ ...item, quantity: 1 })
    }
    return
  }

  found.quantity += delta

  if (found.quantity <= 0) {
    selectedItems.value = selectedItems.value.filter(
      (i) => !(i.item_id === item.item_id && i.resource_type_id === item.resource_type_id),
    )
  }
}

// ✅ confirm add
const confirmAdd = () => {
  const HunterID = parseInt(localStorage.getItem('hunterId'))
  const hunters = getHunters()
  const hunter = hunters.find((h) => h.hunter_id === HunterID)

  selectedItems.value.forEach((item) => {
    hunter.inventory.push({
      resource_type_id: item.resource_type_id,
      item_id: item.item_id,
      quantity: item.quantity,
    })
  })

  saveHunters(hunters)
  loadHunter()
  loadInventory()

  selectedItems.value = []
  showAddModal.value = false
}

</script>

<template>
  <div class="inventory-page">

    <!-- HEADER -->
    <div class="inv-header">
      <div class="inv-title-row">
        <span class="inv-ornament">◆</span>
        <h2 class="inv-title">Supply Pack</h2>
        <span class="inv-ornament">◆</span>
      </div>
      <button class="btn-add-item" @click="showAddModal = true">✚ เพิ่มของ</button>
    </div>
    <p class="inv-subtitle">เป้สัมภาระของนักล่า</p>

    <!-- INVENTORY BY CATEGORY -->
    <div v-if="groupedInventory.length === 0" class="inv-empty">
      <span class="inv-empty-icon">🎒</span>
      <p class="inv-empty-title">เป้ยังว่างเปล่า</p>
      <p class="inv-empty-sub">เก็บของจากการล่า หรือกดเพิ่มของเอง</p>
    </div>

    <!-- ลังไม้แยกตามหมวด -->
    <div v-for="group in groupedInventory" :key="group.resource_type" class="inv-group">
      <div class="group-header">
        <div class="gh-line"></div>
        <span class="gh-label">{{ group.resource_type }}</span>
        <span class="gh-count">{{ group.items.length }}</span>
        <div class="gh-line"></div>
      </div>

      <div class="grid">
        <div v-for="item in group.items" :key="`${item.resource_type_id}-${item.item_id}`" class="card">
          <img :src="getImg(item.thumbnail)" class="card-img" />
          <span class="qty">x{{ item.quantity }}</span>
          <div class="control">
            <button @click="changeQty(item, -1)">−</button>
            <button class="craft-lookup-btn" @click="openCraftLookup(item.resource_type_id, item.item_id, item.item)" title="ดูสูตรคราฟ">🔨</button>
            <button @click="changeQty(item, 1)">+</button>
          </div>
          <p class="card-name">{{ item.item }}</p>
        </div>
      </div>
    </div>

    <!-- ADD ITEM MODAL -->
    <teleport to="body">
      <div v-if="showAddModal" class="modal-overlay">
        <div class="modal-parchment">

          <div class="modal-top">
            <div class="modal-title-wrap">
              <span class="mt-ornament">◆</span>
              <h2 class="modal-title">Add to Supply Pack</h2>
              <span class="mt-ornament">◆</span>
            </div>
            <button class="btn-modal-close" @click="showAddModal = false">✕</button>
          </div>

          <div class="add-layout">
            <!-- LEFT — AVAILABLE -->
            <div class="add-panel">
              <div class="add-panel-label">Available Items</div>
              <input v-model="search" class="search-input" placeholder="Search items..." />

              <div class="grid scrollable">
                <div
                  v-for="item in filteredAvailable"
                  :key="`${item.resource_type_id}-${item.item_id}`"
                  class="card"
                >
                  <img :src="getImg(item.thumbnail)" class="card-img" />
                  <div class="control">
                    <button @click="selectItem(item, -1)">−</button>
                    <button @click="selectItem(item, 1)">+</button>
                  </div>
                  <p class="card-name">{{ item.item }}</p>
                </div>

                <div v-if="filteredAvailable.length === 0" class="no-results">
                  No items found
                </div>
              </div>
            </div>

            <!-- RIGHT — SELECTED -->
            <div class="add-panel">
              <div class="add-panel-label">Selected</div>

              <div class="grid scrollable">
                <div
                  v-for="item in selectedItems"
                  :key="`${item.resource_type_id}-${item.item_id}`"
                  class="card active"
                >
                  <img :src="getImg(item.thumbnail)" class="card-img" />
                  <span class="qty">x{{ item.quantity }}</span>
                  <div class="control">
                    <button @click="selectItem(item, -1)">−</button>
                    <button @click="selectItem(item, 1)">+</button>
                  </div>
                  <p class="card-name">{{ item.item }}</p>
                </div>

                <div v-if="selectedItems.length === 0" class="no-results">
                  Nothing selected
                </div>
              </div>

              <button class="btn-confirm" @click="confirmAdd" :disabled="selectedItems.length === 0">
                ✦ Confirm
              </button>
            </div>
          </div>

        </div>
      </div>
    </teleport>
  </div>
</template>

<style scoped>
/* ══════════════════════════════════════════
   BASE
══════════════════════════════════════════ */
.inventory-page,
.modal-overlay {
  /* ── พื้นผิวชุดเดียวกับหน้าอื่นในแอป ──
     grit = เม็ดหยาบบนไม้ · wood = เสี้ยน + รอยต่อแผ่น
     modal ถูก teleport ไป body เลยต้องประกาศซ้ำที่ overlay */
  --grit: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='r'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='180' height='180' filter='url(%23r)' opacity='0.12'/%3E%3C/svg%3E");
  --wood-grain:
    repeating-linear-gradient(0deg, rgba(0,0,0,0.18) 0 1px, transparent 1px 6px),
    repeating-linear-gradient(0deg, rgba(255,216,164,0.035) 0 1px, transparent 1px 11px),
    repeating-linear-gradient(0deg, rgba(0,0,0,0.12) 0 2px, transparent 2px 19px);
  --wood-planks:
    repeating-linear-gradient(
      0deg,
      rgba(0,0,0,0.5) 0 2px,
      rgba(232,198,152,0.05) 2px 3px,
      transparent 3px 78px
    );
}

.inventory-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
  color: #f0ddb0;
  font-family: 'Georgia', 'Times New Roman', serif;
}

/* ══════════════════════════════════════════
   HEADER
══════════════════════════════════════════ */
.inv-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.inv-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.inv-title {
  margin: 0;
  font-size: 20px;
  color: #ffd27a;
  letter-spacing: 3px;
  text-transform: uppercase;
  text-shadow: 0 0 12px rgba(255, 200, 80, 0.4);
}

.inv-ornament {
  font-size: 9px;
  color: #a8802e;
}

.inv-subtitle {
  margin: -14px 0 0;
  font-size: 11px;
  letter-spacing: 4px;
  color: #7c5a2b;
}

.btn-add-item {
  padding: 9px 18px;
  border-radius: 3px;
  border: 1px solid #6b4f1c;
  background: linear-gradient(to bottom, #b08a34 0%, #8a6a22 48%, #6b501a 100%);
  color: #2a1d06;
  font-size: 13px;
  font-weight: bold;
  font-family: 'Georgia', serif;
  letter-spacing: 1px;
  cursor: pointer;
  transition: 0.2s;
  min-height: 40px;
  white-space: nowrap;
  text-shadow: 0 1px 0 rgba(255, 225, 170, 0.35);
  box-shadow: inset 0 1px 0 rgba(255, 230, 180, 0.4), 0 2px 6px rgba(0, 0, 0, 0.5);
}

.btn-add-item:hover {
  background: linear-gradient(to bottom, #c99f42 0%, #9d7a29 48%, #7a5c1f 100%);
  box-shadow: inset 0 1px 0 rgba(255, 230, 180, 0.5), 0 3px 10px rgba(0, 0, 0, 0.55);
}

/* EMPTY STATE */
.inv-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  text-align: center;
  padding: 40px 20px;
  border-radius: 2px;
  border: 1px dashed rgba(140, 118, 84, 0.32);
  background: linear-gradient(170deg, rgba(38, 31, 25, 0.6), rgba(18, 14, 11, 0.55));
  box-shadow: inset 0 3px 12px rgba(0, 0, 0, 0.5);
}
.inv-empty-icon { font-size: 34px; opacity: 0.45; filter: grayscale(60%) sepia(25%); }
.inv-empty-title { margin: 0; font-size: 13px; letter-spacing: 2px; color: #9b8a6d; }
.inv-empty-sub { margin: 0; font-size: 11px; color: #7d6f57; font-style: italic; }

/* ══════════════════════════════════════════
   CATEGORY GROUP
══════════════════════════════════════════ */
/* ลังไม้หนึ่งใบต่อหนึ่งหมวด */
.inv-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 13px 16px;
  border-radius: 3px;
  border: 3px solid #221a10;
  background:
    var(--grit),
    radial-gradient(ellipse 90px 44px at 14% 76%, rgba(96, 44, 14, 0.16), transparent 74%),
    radial-gradient(ellipse 70px 40px at 88% 26%, rgba(0, 0, 0, 0.28), transparent 76%),
    var(--wood-planks),
    var(--wood-grain),
    linear-gradient(172deg, #5b3e22 0%, #4a3119 48%, #3a2614 100%);
  box-shadow:
    inset 0 0 50px rgba(0, 0, 0, 0.5),
    inset 0 2px 0 rgba(232, 198, 152, 0.07),
    0 3px 12px rgba(0, 0, 0, 0.55);
}

/* ป้ายไฟนาบบนขอบลัง */
.group-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.gh-line {
  flex: 1;
  height: 1px;
  background: rgba(0, 0, 0, 0.45);
  box-shadow: 0 1px 0 rgba(232, 198, 152, 0.07);
}

.gh-label {
  font-size: 10px;
  letter-spacing: 3px;
  text-transform: uppercase;
  color: #e8c9a0;
  white-space: nowrap;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.85);
}

.gh-count {
  font-size: 9px;
  font-weight: bold;
  color: #241800;
  padding: 1px 7px;
  border-radius: 999px;
  background: radial-gradient(circle at 35% 30%, #f0d9a0, #c9a227 60%, #8a6a18);
  border: 1px solid rgba(60, 42, 10, 0.55);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.55);
}

/* ══════════════════════════════════════════
   GRID
══════════════════════════════════════════ */
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(88px, 1fr));
  gap: 10px;
}

.grid.scrollable {
  overflow-y: auto;
  max-height: 360px;
  padding-right: 4px;
}

/* ══════════════════════════════════════════
   CARD
══════════════════════════════════════════ */
/* ช่องเก็บของ — เจาะจมลงไปในเนื้อไม้ */
.card {
  padding: 10px 8px;
  border-radius: 3px 2px 3px 2px;
  background:
    var(--grit),
    linear-gradient(168deg, rgba(0, 0, 0, 0.46), rgba(0, 0, 0, 0.26));
  border: 1px solid rgba(0, 0, 0, 0.5);
  box-shadow:
    inset 0 3px 8px rgba(0, 0, 0, 0.6),
    inset 0 -1px 0 rgba(232, 198, 152, 0.07);
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  transition: 0.18s;
  position: relative;
}

.card:hover {
  border-color: rgba(200, 155, 60, 0.55);
  transform: translateY(-2px);
  background:
    var(--grit),
    linear-gradient(168deg, rgba(200, 155, 60, 0.13), rgba(0, 0, 0, 0.26));
  box-shadow: inset 0 2px 6px rgba(0, 0, 0, 0.5), 0 4px 12px rgba(0, 0, 0, 0.55);
}

/* เลือกไว้ = ผูกริบบิ้นทองเหลือง */
.card.active {
  border: 1px solid #6b4f1c;
  background:
    var(--grit),
    linear-gradient(168deg, rgba(200, 155, 60, 0.24), rgba(90, 58, 14, 0.2));
  box-shadow:
    inset 0 1px 0 rgba(255, 230, 180, 0.28),
    0 0 14px rgba(175, 120, 40, 0.35),
    0 3px 10px rgba(0, 0, 0, 0.6);
}

.card-img {
  width: 48px;
  height: 48px;
  object-fit: contain;
  filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.7));
}

.card-name {
  font-size: 10px;
  margin: 0;
  line-height: 1.3;
  color: #c1ae8c;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
}
.card.active .card-name { color: #ffe7bb; }

/* ป้ายทองเหลืองตอกจำนวน */
.qty {
  font-size: 11px;
  font-weight: bold;
  color: #2a1d06;
  background: linear-gradient(to bottom, #c9a24a, #8a6a1e);
  border: 1px solid #5e440f;
  border-radius: 2px;
  padding: 1px 8px;
  width: 80%;
  text-align: center;
  text-shadow: 0 1px 0 rgba(255, 225, 170, 0.35);
  box-shadow: inset 0 1px 0 rgba(255, 230, 180, 0.4), 0 1px 3px rgba(0, 0, 0, 0.5);
}

/* ══════════════════════════════════════════
   CONTROLS
══════════════════════════════════════════ */
.control {
  display: flex;
  align-items: center; /* ปุ่ม 🔨 เตี้ยกว่าเพื่อน — ถ้าไม่ตั้งจะไปเกาะขอบบน */
  justify-content: center;
  gap: 4px;
}

/* ปุ่มรอง — เล็กกว่าปุ่มปรับจำนวน ไม่ให้แย่งน้ำหนัก */
.craft-lookup-btn {
  width: 20px !important;
  height: 20px !important;
  font-size: 10px !important;
  background: linear-gradient(to bottom, rgba(200,155,60,0.24), rgba(120,88,26,0.18)) !important;
  border-color: rgba(150,110,35,0.5) !important;
}
.craft-lookup-btn:hover {
  background: linear-gradient(to bottom, rgba(200,155,60,0.4), rgba(140,102,30,0.28)) !important;
}

.control button {
  width: 26px;
  height: 26px;
  border-radius: 2px;
  border: 1px solid #0f0b08;
  background: linear-gradient(170deg, #3a322a, #221c16);
  box-shadow: inset 0 1px 0 rgba(226, 200, 150, 0.12);
  color: #c1ae8c;
  font-size: 14px;
  font-family: inherit;
  cursor: pointer;
  transition: 0.15s;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.control button:hover {
  border-color: #6b4f1c;
  background: linear-gradient(170deg, #4a3f33, #2b241c);
  color: #ffd27a;
}

/* ══════════════════════════════════════════
   MODAL OVERLAY
══════════════════════════════════════════ */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(5, 4, 2, 0.75);
  backdrop-filter: blur(10px) brightness(0.6);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 200;
  padding: 16px;
}

/* ══════════════════════════════════════════
   MODAL PARCHMENT
══════════════════════════════════════════ */
.modal-parchment {
  width: min(1000px, 100%);
  max-height: 90vh;
  padding: 20px;
  border-radius: 3px 2px 4px 2px;
  border: 4px solid #221a10;
  background:
    var(--grit),
    radial-gradient(ellipse 120px 60px at 10% 82%, rgba(96, 44, 14, 0.16), transparent 74%),
    var(--wood-planks),
    var(--wood-grain),
    linear-gradient(172deg, #513720 0%, #422c17 48%, #322111 100%);
  box-shadow:
    inset 0 0 60px rgba(0, 0, 0, 0.5),
    inset 0 2px 0 rgba(232, 198, 152, 0.07),
    0 10px 40px rgba(0, 0, 0, 0.9);
  display: flex;
  flex-direction: column;
  gap: 16px;
  animation: popIn 0.18s cubic-bezier(0.34, 1.56, 0.64, 1);
  font-family: 'Georgia', serif;
}

@keyframes popIn {
  from { transform: scale(0.88); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

.modal-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 2px solid rgba(0, 0, 0, 0.45);
  box-shadow: 0 1px 0 rgba(232, 198, 152, 0.07);
  padding-bottom: 12px;
}

.modal-title-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
}

.mt-ornament {
  font-size: 9px;
  color: #a8802e;
}

.modal-title {
  margin: 0;
  font-size: 16px;
  color: #ffd27a;
  letter-spacing: 2px;
  text-transform: uppercase;
  text-shadow: 0 0 10px rgba(255, 200, 80, 0.3);
}

.btn-modal-close {
  width: 36px;
  height: 36px;
  border-radius: 2px;
  border: 1px solid #0f0b08;
  background: linear-gradient(170deg, #3a322a, #221c16);
  box-shadow: inset 0 1px 0 rgba(226, 200, 150, 0.12);
  color: #c1ae8c;
  font-size: 14px;
  font-family: inherit;
  cursor: pointer;
  transition: 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-modal-close:hover {
  border-color: #6b4f1c;
  background: linear-gradient(170deg, #4a3f33, #2b241c);
  color: #f0e2c6;
}

/* ══════════════════════════════════════════
   ADD LAYOUT
══════════════════════════════════════════ */
.add-layout {
  display: grid;
  grid-template-columns: 2.5fr 1fr;
  gap: 14px;
  min-height: 0;
}

/* ถุงหนังสองใบวางบนฝาลัง */
.add-panel {
  border-radius: 4px;
  border: 1px solid rgba(124, 90, 43, 0.5);
  border-left: 3px solid #7c5a2b;
  background:
    repeating-linear-gradient(
      100deg,
      rgba(0,0,0,0.14) 0px,
      rgba(0,0,0,0.14) 1px,
      transparent 1px,
      transparent 5px
    ),
    linear-gradient(170deg, #2b1f13, #221809 55%, #281d10);
  box-shadow: inset 0 1px 0 rgba(255, 220, 160, 0.07), 0 2px 8px rgba(0, 0, 0, 0.5);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
}

.add-panel-label {
  font-size: 9px;
  letter-spacing: 3px;
  text-transform: uppercase;
  color: #a88040;
  border-bottom: 1px solid rgba(124, 90, 43, 0.3);
  padding-bottom: 6px;
}

.search-input {
  padding: 8px 12px;
  border-radius: 2px;
  border: 1px solid rgba(124, 90, 43, 0.5);
  background: rgba(0, 0, 0, 0.42);
  box-shadow: inset 0 2px 6px rgba(0, 0, 0, 0.55);
  color: #f0ddb0;
  font-size: 13px;
  font-family: 'Georgia', serif;
  transition: 0.2s;
}

.search-input:focus {
  outline: none;
  border-color: #c89b3c;
}

.search-input::placeholder { color: #7d6f57; }

.no-results {
  grid-column: 1 / -1;
  text-align: center;
  padding: 30px 0;
  color: #7d6f57;
  font-style: italic;
  font-size: 12px;
}

/* CONFIRM BUTTON */
.btn-confirm {
  padding: 10px;
  border-radius: 3px;
  border: 1px solid #6b4f1c;
  background: linear-gradient(to bottom, #b08a34 0%, #8a6a22 48%, #6b501a 100%);
  color: #2a1d06;
  font-size: 13px;
  font-weight: bold;
  font-family: 'Georgia', serif;
  letter-spacing: 1px;
  cursor: pointer;
  transition: 0.2s;
  min-height: 44px;
  text-shadow: 0 1px 0 rgba(255, 225, 170, 0.35);
  box-shadow: inset 0 1px 0 rgba(255, 230, 180, 0.4), 0 2px 6px rgba(0, 0, 0, 0.5);
}

.btn-confirm:hover:not(:disabled) {
  background: linear-gradient(to bottom, #c99f42 0%, #9d7a29 48%, #7a5c1f 100%);
  box-shadow: inset 0 1px 0 rgba(255, 230, 180, 0.5), 0 3px 10px rgba(0, 0, 0, 0.55);
}

.btn-confirm:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* ══════════════════════════════════════════
   SCROLLBAR
══════════════════════════════════════════ */
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: rgba(10, 8, 4, 0.5); border-radius: 4px; }
::-webkit-scrollbar-thumb {
  background: linear-gradient(to bottom, #7c5a2b, #3a2c1a);
  border-radius: 4px;
}
::-webkit-scrollbar-thumb:hover { background: #a67c3b; }

/* ══════════════════════════════════════════
   RESPONSIVE — iPad (≤768px)
══════════════════════════════════════════ */
@media (max-width: 768px) {
  .grid { grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)); gap: 8px; }

  .add-layout {
    grid-template-columns: 1fr;
    gap: 10px;
  }

  .grid.scrollable { max-height: 220px; }
}

/* ══════════════════════════════════════════
   RESPONSIVE — Phone (≤480px)
══════════════════════════════════════════ */
@media (max-width: 480px) {
  .inv-header { flex-direction: column; align-items: flex-start; gap: 8px; }
  .btn-add-item { width: 100%; }
  .inv-group { padding: 11px 9px 13px; border-width: 2px; }
  .modal-parchment { border-width: 3px; }

  .grid { grid-template-columns: repeat(auto-fill, minmax(72px, 1fr)); gap: 6px; }
  .card-img { width: 40px; height: 40px; }

  .modal-parchment { padding: 14px; gap: 12px; }
  .add-layout { grid-template-columns: 1fr; }
  .grid.scrollable { max-height: 180px; }
}
</style>
