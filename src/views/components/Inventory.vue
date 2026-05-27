<script setup>
import { ref, onMounted, computed } from 'vue'
import { getHunterById, saveHunters, getHunters } from '@/services/hunterStorage'
import resourceData from '@/assets/files/resource.json'

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
      <button class="btn-add-item" @click="showAddModal = true">+ Add Item</button>
    </div>

    <!-- INVENTORY BY CATEGORY -->
    <div v-if="groupedInventory.length === 0" class="inv-empty">
      <p>Your supply pack is empty.</p>
    </div>

    <div v-for="group in groupedInventory" :key="group.resource_type" class="inv-group">
      <div class="group-header">
        <div class="gh-line"></div>
        <span class="gh-label">{{ group.resource_type }}</span>
        <div class="gh-line"></div>
      </div>

      <div class="grid">
        <div v-for="item in group.items" :key="`${item.resource_type_id}-${item.item_id}`" class="card">
          <img :src="getImg(item.thumbnail)" class="card-img" />
          <span class="qty">x{{ item.quantity }}</span>
          <div class="control">
            <button @click="changeQty(item, -1)">−</button>
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
  font-size: 8px;
  color: #7c5a2b;
}

.btn-add-item {
  padding: 8px 18px;
  border-radius: 8px;
  border: 1px solid #7c5a2b;
  background: linear-gradient(to bottom, #2a1e10, #17120c);
  color: #c89b3c;
  font-size: 13px;
  font-family: 'Georgia', serif;
  letter-spacing: 1px;
  cursor: pointer;
  transition: 0.2s;
  min-height: 40px;
  white-space: nowrap;
}

.btn-add-item:hover {
  border-color: #c89b3c;
  color: #ffd27a;
  box-shadow: 0 0 10px rgba(200, 155, 60, 0.3);
}

/* EMPTY STATE */
.inv-empty {
  text-align: center;
  padding: 40px 0;
  color: #5a3d1f;
  font-style: italic;
  font-size: 14px;
}

/* ══════════════════════════════════════════
   CATEGORY GROUP
══════════════════════════════════════════ */
.inv-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.group-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.gh-line {
  flex: 1;
  height: 1px;
  background: rgba(124, 90, 43, 0.35);
}

.gh-label {
  font-size: 10px;
  letter-spacing: 3px;
  text-transform: uppercase;
  color: #a88040;
  white-space: nowrap;
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
.card {
  padding: 10px 8px;
  border-radius: 10px;
  background: linear-gradient(160deg, rgba(30, 22, 10, 0.9), rgba(16, 12, 6, 0.95));
  border: 1px solid rgba(124, 90, 43, 0.6);
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  transition: 0.18s;
  position: relative;
}

.card:hover {
  border-color: #a88040;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.5), 0 0 8px rgba(200, 155, 60, 0.15);
}

.card.active {
  border: 2px solid #c89b3c;
  box-shadow: 0 0 14px rgba(200, 155, 60, 0.5);
}

.card-img {
  width: 48px;
  height: 48px;
  object-fit: contain;
  filter: drop-shadow(0 0 5px rgba(255, 200, 100, 0.4));
}

.card-name {
  font-size: 10px;
  margin: 0;
  line-height: 1.3;
  color: #c89b3c;
  -webkit-text-stroke: 0.1px rgba(0,0,0,0.5);
}

.qty {
  font-size: 11px;
  font-weight: bold;
  color: #ffd27a;
  background: rgba(0, 0, 0, 0.7);
  border-radius: 8px;
  padding: 1px 8px;
  width: 80%;
  text-align: center;
  text-shadow: 0 0 4px #000;
}

/* ══════════════════════════════════════════
   CONTROLS
══════════════════════════════════════════ */
.control {
  display: flex;
  justify-content: center;
  gap: 4px;
}

.control button {
  width: 26px;
  height: 26px;
  border-radius: 6px;
  border: 1px solid #5a3d1f;
  background: rgba(10, 8, 4, 0.8);
  color: #c89b3c;
  font-size: 14px;
  cursor: pointer;
  transition: 0.15s;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.control button:hover {
  border-color: #c89b3c;
  background: rgba(60, 40, 15, 0.7);
  box-shadow: 0 0 6px rgba(200, 155, 60, 0.4);
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
  background: linear-gradient(160deg, #1c1508, #13100a, #1c1508);
  border: 2px solid #7c5a2b;
  border-radius: 14px;
  box-shadow: 0 0 40px rgba(0,0,0,0.9), 0 0 20px rgba(200, 155, 60, 0.1);
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
  border-bottom: 1px solid rgba(124, 90, 43, 0.3);
  padding-bottom: 12px;
}

.modal-title-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
}

.mt-ornament {
  font-size: 8px;
  color: #7c5a2b;
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
  border-radius: 50%;
  border: 1px solid #5a3d1f;
  background: rgba(20, 14, 6, 0.8);
  color: #7c5a2b;
  font-size: 14px;
  cursor: pointer;
  transition: 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-modal-close:hover {
  border-color: #c89b3c;
  color: #c89b3c;
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

.add-panel {
  background: rgba(10, 8, 4, 0.5);
  border: 1px solid rgba(124, 90, 43, 0.4);
  border-radius: 10px;
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
  color: #7c5a2b;
  border-bottom: 1px solid rgba(124, 90, 43, 0.25);
  padding-bottom: 6px;
}

.search-input {
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid #5a3d1f;
  background: rgba(5, 4, 2, 0.8);
  color: #f0ddb0;
  font-size: 13px;
  font-family: 'Georgia', serif;
  transition: 0.2s;
}

.search-input:focus {
  outline: none;
  border-color: #7c5a2b;
  box-shadow: 0 0 6px rgba(124, 90, 43, 0.3);
}

.search-input::placeholder { color: #3a2c1a; }

.no-results {
  grid-column: 1 / -1;
  text-align: center;
  padding: 30px 0;
  color: #5a3d1f;
  font-style: italic;
  font-size: 12px;
}

/* CONFIRM BUTTON */
.btn-confirm {
  padding: 10px;
  border-radius: 8px;
  border: 1px solid #7c5a2b;
  background: linear-gradient(to bottom, #3a2c1a, #17120c);
  color: #ffd27a;
  font-size: 13px;
  font-family: 'Georgia', serif;
  letter-spacing: 1px;
  cursor: pointer;
  transition: 0.2s;
  min-height: 44px;
}

.btn-confirm:hover:not(:disabled) {
  border-color: #c89b3c;
  box-shadow: 0 0 12px rgba(200, 155, 60, 0.35);
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

  .grid { grid-template-columns: repeat(auto-fill, minmax(72px, 1fr)); gap: 6px; }
  .card-img { width: 40px; height: 40px; }

  .modal-parchment { padding: 14px; gap: 12px; }
  .add-layout { grid-template-columns: 1fr; }
  .grid.scrollable { max-height: 180px; }
}
</style>
