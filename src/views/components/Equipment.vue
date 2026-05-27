<script setup>
import { computed, onMounted, ref } from 'vue'
import { getHunterById, saveHunter } from '@/services/hunterStorage'
import { getArmors, getWeapons } from '@/services/equipService'

const hunterId = computed(() => parseInt(localStorage.getItem('hunterId')))
const hunter = ref(null)

const slotWeapon = ref(null)
const slotHelm = ref(null)
const slotMail = ref(null)
const slotGreaves = ref(null)

const getImg = (path) => `${import.meta.env.BASE_URL}${path}`

const equippedOrNull = (arr) => {
  if (!Array.isArray(arr)) return null
  return arr.find((i) => i?.is_equip) || null
}

const loadEquipment = async () => {
  const id = hunterId.value
  hunter.value = id ? getHunterById(id) : null
  if (!hunter.value) return

  const weaponEquip = equippedOrNull(hunter.value.equipments?.weapons)
  const helmEquip = equippedOrNull(hunter.value.equipments?.armors?.helm)
  const mailEquip = equippedOrNull(hunter.value.equipments?.armors?.mail)
  const greavesEquip = equippedOrNull(hunter.value.equipments?.armors?.greaves)

  const promises = [
    weaponEquip
      ? getWeapons(hunter.value.hunter_class_id, weaponEquip.weapon_type_id, weaponEquip.item_id)
      : Promise.resolve(null),
    helmEquip ? getArmors(helmEquip.equip_set_id, helmEquip.equip_id) : Promise.resolve(null),
    mailEquip ? getArmors(mailEquip.equip_set_id, mailEquip.equip_id) : Promise.resolve(null),
    greavesEquip
      ? getArmors(greavesEquip.equip_set_id, greavesEquip.equip_id)
      : Promise.resolve(null),
  ]

  const [weapon, helm, mail, greaves] = await Promise.all(promises)

  slotWeapon.value = weapon
  slotHelm.value = helm
  slotMail.value = mail
  slotGreaves.value = greaves
}

onMounted(() => {
  loadEquipment()
})

const slotTitle = (key) => {
  switch (key) {
    case 'weapon':
      return 'Weapon'
    case 'helm':
      return 'Helm'
    case 'mail':
      return 'Mail'
    case 'greaves':
      return 'Greaves'
    default:
      return ''
  }
}

/* ================= MODAL ================= */
const equipType = ref('weapon')
const showModal = ref(false)
const modalItems = ref([]) // { id, label, thumbnail, raw }
const loadingModal = ref(false)

const equipArrayByType = (type) => {
  if (!hunter.value?.equipments) return []
  if (type === 'weapon') return hunter.value.equipments.weapons || []
  if (type === 'helm') return hunter.value.equipments.armors?.helm || []
  if (type === 'mail') return hunter.value.equipments.armors?.mail || []
  if (type === 'greaves') return hunter.value.equipments.armors?.greaves || []
  return []
}

const openEquipModal = async (type) => {
  equipType.value = type
  showModal.value = true
  modalItems.value = []
  loadingModal.value = true

  try {
    const rawItems = equipArrayByType(type)

    const promises = rawItems.map(async (it) => {
      if (!it) return null

      if (type === 'weapon') {
        const d = await getWeapons(hunter.value.hunter_class_id, it.weapon_type_id, it.item_id)

        return {
          id: `${it.weapon_type_id}-${it.item_id}`,
          thumbnail: d?.thumbnail || null,
          label: d?.item || d?.weapon_type || `Weapon ${it.item_id}`,
          raw: it,
        }
      }

      const d = await getArmors(it.equip_set_id, it.equip_id)

      return {
        id: `${it.equip_set_id}-${it.equip_id}`,
        thumbnail: d?.thumbnail || null,
        label: d?.equip || d?.set_name || `Armor ${it.equip_id}`,
        raw: it,
      }
    })

    const results = await Promise.all(promises)
    modalItems.value = results.filter(Boolean)
  } finally {
    loadingModal.value = false
  }
}

const setEquip = async (item) => {
  const type = equipType.value
  const rawItems = equipArrayByType(type)

  // set is_equip true only for selected
  rawItems.forEach((it) => {
    if (!it) return

    const same =
      type === 'weapon'
        ? it.weapon_type_id === item.raw.weapon_type_id && it.item_id === item.raw.item_id
        : it.equip_set_id === item.raw.equip_set_id && it.equip_id === item.raw.equip_id

    it.is_equip = !!same
  })

  // reassign for Vue reactivity
  if (type === 'weapon') {
    hunter.value.equipments.weapons = [...rawItems]
  } else {
    hunter.value.equipments.armors[type] = [...rawItems]
  }

  saveHunter(hunter.value)
  await loadEquipment()

  showModal.value = false
}
</script>

<template>
  <div class="armory-page">

    <!-- ARMORY HEADER -->
    <div class="armory-header">
      <div class="ah-line"></div>
      <div class="ah-title-wrap">
        <span class="ah-ornament">⚔</span>
        <h2 class="ah-title">Armory</h2>
        <span class="ah-ornament">⚔</span>
      </div>
      <div class="ah-line"></div>
    </div>

    <!-- EQUIPMENT SLOTS GRID -->
    <div class="equip-grid">

      <!-- WEAPON -->
      <div class="equip-card">
        <div class="slot-label-bar">
          <span class="slot-type">Weapon</span>
          <button class="btn-swap" @click="openEquipModal('weapon')">Swap</button>
        </div>
        <div class="slot-body">
          <div class="slot-img-wrap">
            <img v-if="slotWeapon?.thumbnail" :src="getImg(slotWeapon.thumbnail)" class="slot-img" />
            <div v-else class="slot-empty">
              <span class="slot-empty-icon">⚔</span>
            </div>
          </div>
          <p class="slot-name">{{ slotWeapon?.item || slotWeapon?.weapon_type || '— Empty —' }}</p>
        </div>
      </div>

      <!-- HELM -->
      <div class="equip-card">
        <div class="slot-label-bar">
          <span class="slot-type">Helm</span>
          <button class="btn-swap" @click="openEquipModal('helm')">Swap</button>
        </div>
        <div class="slot-body">
          <div class="slot-img-wrap">
            <img v-if="slotHelm?.thumbnail" :src="getImg(slotHelm.thumbnail)" class="slot-img" />
            <div v-else class="slot-empty">
              <span class="slot-empty-icon">🪖</span>
            </div>
          </div>
          <p class="slot-name">{{ slotHelm?.equip || slotHelm?.set_name || '— Empty —' }}</p>
        </div>
      </div>

      <!-- MAIL -->
      <div class="equip-card">
        <div class="slot-label-bar">
          <span class="slot-type">Mail</span>
          <button class="btn-swap" @click="openEquipModal('mail')">Swap</button>
        </div>
        <div class="slot-body">
          <div class="slot-img-wrap">
            <img v-if="slotMail?.thumbnail" :src="getImg(slotMail.thumbnail)" class="slot-img" />
            <div v-else class="slot-empty">
              <span class="slot-empty-icon">🛡</span>
            </div>
          </div>
          <p class="slot-name">{{ slotMail?.equip || slotMail?.set_name || '— Empty —' }}</p>
        </div>
      </div>

      <!-- GREAVES -->
      <div class="equip-card">
        <div class="slot-label-bar">
          <span class="slot-type">Greaves</span>
          <button class="btn-swap" @click="openEquipModal('greaves')">Swap</button>
        </div>
        <div class="slot-body">
          <div class="slot-img-wrap">
            <img v-if="slotGreaves?.thumbnail" :src="getImg(slotGreaves.thumbnail)" class="slot-img" />
            <div v-else class="slot-empty">
              <span class="slot-empty-icon">🥾</span>
            </div>
          </div>
          <p class="slot-name">{{ slotGreaves?.equip || slotGreaves?.set_name || '— Empty —' }}</p>
        </div>
      </div>

    </div>

    <!-- MODAL -->
    <teleport to="body">
      <div v-if="showModal" class="modal-overlay">
        <div class="modal-parchment">

          <div class="modal-top">
            <div class="modal-title-row">
              <span class="modal-ornament">◆</span>
              <h3 class="modal-title">Choose {{ slotTitle(equipType) }}</h3>
              <span class="modal-ornament">◆</span>
            </div>
            <button class="btn-modal-close" @click="showModal = false">✕</button>
          </div>

          <div class="modal-body">
            <div v-if="loadingModal" class="modal-loading">
              <span class="loading-dot">·</span>
              <span class="loading-dot">·</span>
              <span class="loading-dot">·</span>
            </div>

            <div v-else class="modal-grid">
              <div
                v-for="it in modalItems"
                :key="it.id"
                class="modal-card"
                @click="setEquip(it)"
              >
                <div class="mc-img-wrap">
                  <img v-if="it.thumbnail" :src="getImg(it.thumbnail)" class="mc-img" />
                  <div v-else class="mc-empty">?</div>
                </div>
                <p class="mc-label">{{ it.label }}</p>
              </div>

              <div v-if="!modalItems.length" class="modal-no-items">
                No items available
              </div>
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
.armory-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
  color: #f0ddb0;
  font-family: 'Georgia', 'Times New Roman', serif;
  max-width: 900px;
  margin: 0 auto;
}

/* ══════════════════════════════════════════
   ARMORY HEADER
══════════════════════════════════════════ */
.armory-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.ah-line {
  flex: 1;
  height: 1px;
  background: linear-gradient(to right, transparent, #7c5a2b);
}

.ah-line:last-child {
  background: linear-gradient(to left, transparent, #7c5a2b);
}

.ah-title-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
  white-space: nowrap;
}

.ah-title {
  margin: 0;
  font-size: 18px;
  color: #ffd27a;
  letter-spacing: 4px;
  text-transform: uppercase;
  text-shadow: 0 0 12px rgba(255, 200, 80, 0.4);
}

.ah-ornament {
  font-size: 14px;
  color: #7c5a2b;
}

/* ══════════════════════════════════════════
   EQUIP GRID
══════════════════════════════════════════ */
.equip-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 14px;
}

/* ══════════════════════════════════════════
   EQUIP CARD
══════════════════════════════════════════ */
.equip-card {
  padding: 14px;
  border-radius: 12px;
  background: linear-gradient(160deg, rgba(28, 20, 10, 0.9), rgba(16, 12, 6, 0.95));
  border: 1px solid #7c5a2b;
  box-shadow: inset 0 0 12px rgba(255, 200, 100, 0.04);
  display: flex;
  flex-direction: column;
  gap: 10px;
  transition: 0.2s;
}

.equip-card:hover {
  border-color: #a88040;
  box-shadow:
    0 4px 16px rgba(0,0,0,0.5),
    inset 0 0 12px rgba(255, 200, 100, 0.06);
}

/* SLOT LABEL BAR */
.slot-label-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid rgba(124, 90, 43, 0.3);
  padding-bottom: 8px;
}

.slot-type {
  font-size: 10px;
  letter-spacing: 3px;
  text-transform: uppercase;
  color: #c89b3c;
  text-shadow: 0 0 6px rgba(200, 155, 60, 0.3);
}

.btn-swap {
  padding: 5px 12px;
  border-radius: 6px;
  border: 1px solid #7c5a2b;
  background: linear-gradient(to bottom, #2a1e10, #17120c);
  color: #c89b3c;
  font-size: 11px;
  letter-spacing: 1px;
  cursor: pointer;
  font-family: 'Georgia', serif;
  transition: 0.2s;
  min-height: 32px;
}

.btn-swap:hover {
  border-color: #c89b3c;
  box-shadow: 0 0 8px rgba(200, 155, 60, 0.35);
  color: #ffd27a;
}

/* SLOT BODY */
.slot-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.slot-img-wrap {
  width: 90px;
  height: 90px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.slot-img {
  width: 90px;
  height: 90px;
  object-fit: contain;
  filter: drop-shadow(0 0 8px rgba(255, 200, 100, 0.4));
}

.slot-empty {
  width: 80px;
  height: 80px;
  border-radius: 10px;
  border: 1px dashed rgba(124, 90, 43, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(124, 90, 43, 0.5);
  font-size: 24px;
}

.slot-name {
  margin: 0;
  font-size: 12px;
  color: #c89b3c;
  text-align: center;
  line-height: 1.4;
}

/* ══════════════════════════════════════════
   MODAL
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

.modal-parchment {
  width: min(900px, 100%);
  max-height: 88vh;
  padding: 20px;
  background: linear-gradient(160deg, #1c1508, #13100a);
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

.modal-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.modal-title {
  margin: 0;
  font-size: 16px;
  color: #ffd27a;
  letter-spacing: 2px;
  text-transform: uppercase;
  text-shadow: 0 0 10px rgba(255, 200, 80, 0.4);
}

.modal-ornament {
  font-size: 8px;
  color: #7c5a2b;
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

.modal-body {
  overflow-y: auto;
  min-height: 160px;
}

.modal-loading {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 6px;
  padding: 40px 0;
  color: #7c5a2b;
  font-size: 24px;
  letter-spacing: 4px;
}

.modal-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;
}

.modal-card {
  padding: 12px 8px;
  border-radius: 10px;
  border: 1px solid rgba(124, 90, 43, 0.5);
  background: rgba(20, 14, 6, 0.7);
  cursor: pointer;
  text-align: center;
  transition: 0.2s;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.modal-card:hover {
  border-color: #c89b3c;
  transform: translateY(-2px);
  box-shadow: 0 4px 14px rgba(0,0,0,0.5), 0 0 10px rgba(200, 155, 60, 0.2);
}

.mc-img-wrap {
  width: 70px;
  height: 70px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.mc-img {
  width: 70px;
  height: 70px;
  object-fit: contain;
  filter: drop-shadow(0 0 5px rgba(255, 200, 100, 0.4));
}

.mc-empty {
  width: 60px;
  height: 60px;
  border-radius: 8px;
  border: 1px dashed rgba(124, 90, 43, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #5a3d1f;
  font-size: 18px;
}

.mc-label {
  margin: 0;
  font-size: 11px;
  color: #c89b3c;
  line-height: 1.3;
}

.modal-no-items {
  grid-column: 1 / -1;
  text-align: center;
  padding: 40px 0;
  color: #5a3d1f;
  font-size: 13px;
  font-style: italic;
}

/* ══════════════════════════════════════════
   RESPONSIVE — iPad (≤768px)
══════════════════════════════════════════ */
@media (max-width: 768px) {
  .equip-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
  }

  .slot-img, .slot-img-wrap { width: 76px; height: 76px; }
}

/* ══════════════════════════════════════════
   RESPONSIVE — Phone (≤480px)
══════════════════════════════════════════ */
@media (max-width: 480px) {
  .equip-grid {
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .equip-card { padding: 10px; gap: 8px; }
  .slot-img, .slot-img-wrap { width: 64px; height: 64px; }
  .slot-name { font-size: 10px; }

  .modal-parchment { padding: 14px; gap: 12px; }
  .modal-grid { grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 8px; }
  .mc-img, .mc-img-wrap { width: 56px; height: 56px; }
}
</style>
