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

const getImg = (path) => `src/${path}`

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
    selectedItems.value = selectedItems.value.filter((i) => i.item_id !== item.item_id)
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

const tooltipItem = ref(null)
let hoverTimer = null

const handleMouseEnter = (item) => {
  clearTimeout(hoverTimer)

  hoverTimer = setTimeout(() => {
    tooltipItem.value = item
  }, 500) // 👈 delay 0.5 วิ
}

const handleMouseLeave = () => {
  clearTimeout(hoverTimer)
  tooltipItem.value = null
}
</script>

<template>
  <div class="inventory-container">
    <h2>Inventory</h2>

    <button class="btn-add" @click="showAddModal = true">+ Add Item</button>

    <!-- INVENTORY -->
    <div v-for="group in groupedInventory" :key="group.resource_type">
      <h3>{{ group.resource_type }}</h3>

      <div class="grid">
        <div v-for="item in group.items" :key="item.item_id" class="card">
          <img :src="getImg(item.thumbnail)" />

          <span class="qty">x{{ item.quantity }}</span>

          <div class="control">
            <button @click="changeQty(item, -1)">-</button>
            <button @click="changeQty(item, 1)">+</button>
          </div>

          <p>{{ item.item }}</p>
        </div>
      </div>
    </div>

    <!-- MODAL -->
    <teleport to="body">
      <div v-if="showAddModal" class="modal">
        <div class="modal-box">
          <h2>Add Item</h2>

          <div class="add-layout">
            <!-- LEFT -->
            <div class="box">
              <input v-model="search" placeholder="Search..." />

              <div class="grid">
                <div v-for="item in filteredAvailable" :key="item.item_id" class="card">
                  <img :src="getImg(item.thumbnail)" />

                  <div class="control">
                    <button @click="selectItem(item, -1)">-</button>
                    <button @click="selectItem(item, 1)">+</button>
                  </div>

                  <p>{{ item.item }}</p>
                </div>
              </div>
            </div>

            <!-- RIGHT -->
            <div class="box">
              <h3>Selected</h3>

              <div class="grid">
                <div v-for="item in selectedItems" :key="item.item_id" class="card active">
                  <img :src="getImg(item.thumbnail)" />

                  <span class="qty">x{{ item.quantity }}</span>

                  <div class="control">
                    <button @click="selectItem(item, -1)">-</button>
                    <button @click="selectItem(item, 1)">+</button>
                  </div>

                  <p>{{ item.item }}</p>
                </div>
              </div>

              <button class="btn-confirm" @click="confirmAdd">Confirm</button>
            </div>
          </div>

          <button class="btn-cancel" @click="showAddModal = false">Close</button>
        </div>
      </div>
    </teleport>
  </div>
</template>

<style scoped>
/* ===== GLOBAL ===== */
.inventory-container {
  color: #f8f4e6;
  max-width: 1100px;
  margin: auto;
}

/* ===== TITLE ===== */
h2 {
  color: #ffd27a;
  text-shadow: 0 0 8px rgba(255, 200, 100, 0.6);
}

h3 {
  color: #ffcc66;
}

/* ===== GRID ===== */
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
  gap: 12px;
}

/* ===== CARD ===== */
.card {
  padding: 10px;
  border-radius: 12px;

  background: linear-gradient(to bottom, #2d2418, #17120c);
  border: 1px solid #7c5a2b;

  text-align: center;
  position: relative;

  display: flex;
  flex-direction: column;
  align-items: center;

  transition: 0.2s;
}

/* HOVER */
.card:hover {
  transform: translateY(-3px) scale(1.05);
  box-shadow: 0 0 10px rgba(255, 200, 100, 0.6);
}

/* ACTIVE */
.card.active {
  border: 2px solid gold;
  box-shadow: 0 0 12px rgba(255, 215, 0, 0.8);
}

/* IMG */
.card img {
  width: 50px;
  height: 50px;
  object-fit: contain;

  filter: drop-shadow(0 0 5px rgba(255, 200, 100, 0.5));
}

/* NAME */
.card p {
  font-size: 11px;
  margin-top: 5px;
  line-height: 1.2;

  color: #f8f4e6; /* 👈 อ่านชัด */
  text-shadow: 0 0 3px rgba(0, 0, 0, 0.8);
}

/* QTY */
.qty {
  color: #fff;

  background: rgba(0, 0, 0, 0.8);
  /* padding: 0 50px 0 50px; */
  width: 75%;
  border-radius: 10px;
  text-shadow: 0 0 5px #000;

  font-weight: bold;
}

/* ===== CONTROL ===== */
.control {
  display: flex;
  justify-content: center;
  gap: 6px;
  margin-top: 5px;
}

.control button {
  width: 26px;
  height: 26px;

  border-radius: 6px;
  border: 1px solid #7c5a2b;

  background: #1a1208;
  color: #f5d7a1;

  cursor: pointer;
  transition: 0.2s;
}

.control button:hover {
  background: #3a2c1a;
  box-shadow: 0 0 5px gold;
}

/* ===== MODAL ===== */
.modal {
  position: fixed;
  inset: 0;

  background: rgba(10, 8, 5, 0.7);
  backdrop-filter: blur(8px);

  display: flex;
  justify-content: center;
  align-items: center;
}

/* BOX */
.modal-box {
  width: 1000px;
  padding: 20px;

  background: rgba(20, 15, 10, 0.95);
  border: 2px solid #7c5a2b;
  border-radius: 14px;

  display: flex;
  flex-direction: column;
  gap: 15px;

  box-shadow:
    0 0 20px rgba(0, 0, 0, 0.8),
    0 0 15px rgba(255, 200, 100, 0.2);
}

/* ===== LAYOUT ===== */
.add-layout {
  display: grid;
  grid-template-columns: 2.5fr 1fr;
  gap: 15px;
}

/* ===== BOX ===== */
.box {
  background: rgba(30, 20, 10, 0.85);
  border: 1px solid #7c5a2b;
  border-radius: 10px;

  padding: 10px;

  display: flex;
  flex-direction: column;
  gap: 10px;

  max-height: 500px;
}

/* SCROLL */
.box .grid {
  overflow-y: auto;
  padding-right: 5px;
}

/* ===== SEARCH ===== */
.box input {
  padding: 8px;
  border-radius: 8px;
  border: 1px solid #a67c3b;

  background: #1a1208;
  color: #fff;
}

.box input::placeholder {
  color: #aaa;
}

/* ===== SELECTED TITLE ===== */
.box h3 {
  text-align: center;
  color: #ffd27a;
  text-shadow: 0 0 5px rgba(255, 200, 100, 0.5);
}

/* EMPTY */
.box:has(.grid:empty)::after {
  content: 'No items';
  text-align: center;
  opacity: 0.5;
}

/* ===== BUTTON ===== */
.btn-add,
.btn-confirm,
.btn-cancel {
  padding: 10px;
  border-radius: 10px;

  border: 2px solid #7c5a2b;
  background: linear-gradient(to bottom, #3a2c1a, #1a1208);

  color: #f5d7a1;
  cursor: pointer;

  transition: 0.2s;
}

.btn-add:hover,
.btn-confirm:hover {
  box-shadow: 0 0 10px rgba(255, 200, 100, 0.7);
}

.btn-cancel {
  background: #444;
}

.card p,
.qty {
  -webkit-text-stroke: 0.2px rgba(0, 0, 0, 0.6);
}

/* ===== GLOBAL SCROLLBAR ===== */
::-webkit-scrollbar {
  width: 10px;
}

::-webkit-scrollbar-track {
  background: #1a1208; /* พื้น */
}

::-webkit-scrollbar-thumb {
  background: linear-gradient(to bottom, #7c5a2b, #3a2c1a);
  border-radius: 10px;
  border: 1px solid #000;
}

::-webkit-scrollbar-thumb:hover {
  background: linear-gradient(to bottom, #a67c3b, #5a3d1f);
}
</style>
