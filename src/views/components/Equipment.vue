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

const getImg = (path) => `src/${path}`

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
  <div class="equipment-container">
    <h2>Equipment</h2>

    <div class="equip-grid">
      <div class="equip-card">
        <div class="equip-head">
          <span class="equip-slot-title">{{ slotTitle('weapon') }}</span>
          <button class="equip-choose" @click="openEquipModal('weapon')">Change</button>
        </div>
        <div class="equip-body">
          <img v-if="slotWeapon?.thumbnail" :src="getImg(slotWeapon.thumbnail)" class="equip-img" />
          <div v-else class="equip-empty">Empty</div>
          <p class="equip-name">{{ slotWeapon?.item || slotWeapon?.weapon_type || '-' }}</p>
        </div>
      </div>

      <div class="equip-card">
        <div class="equip-head">
          <span class="equip-slot-title">{{ slotTitle('helm') }}</span>
          <button class="equip-choose" @click="openEquipModal('helm')">Change</button>
        </div>
        <div class="equip-body">
          <img v-if="slotHelm?.thumbnail" :src="getImg(slotHelm.thumbnail)" class="equip-img" />
          <div v-else class="equip-empty">Empty</div>
          <p class="equip-name">{{ slotHelm?.equip || slotHelm?.set_name || '-' }}</p>
        </div>
      </div>

      <div class="equip-card">
        <div class="equip-head">
          <span class="equip-slot-title">{{ slotTitle('mail') }}</span>
          <button class="equip-choose" @click="openEquipModal('mail')">Change</button>
        </div>
        <div class="equip-body">
          <img v-if="slotMail?.thumbnail" :src="getImg(slotMail.thumbnail)" class="equip-img" />
          <div v-else class="equip-empty">Empty</div>
          <p class="equip-name">{{ slotMail?.equip || slotMail?.set_name || '-' }}</p>
        </div>
      </div>

      <div class="equip-card">
        <div class="equip-head">
          <span class="equip-slot-title">{{ slotTitle('greaves') }}</span>
          <button class="equip-choose" @click="openEquipModal('greaves')">Change</button>
        </div>
        <div class="equip-body">
          <img
            v-if="slotGreaves?.thumbnail"
            :src="getImg(slotGreaves.thumbnail)"
            class="equip-img"
          />
          <div v-else class="equip-empty">Empty</div>
          <p class="equip-name">{{ slotGreaves?.equip || slotGreaves?.set_name || '-' }}</p>
        </div>
      </div>
    </div>
    <teleport to="body">
      <div v-if="showModal" class="modal">
        <div class="modal-box">
          <div class="modal-head">
            <h3>Choose {{ slotTitle(equipType) }}</h3>
            <button class="btn-cancel" @click="showModal = false">Close</button>
          </div>

          <div class="modal-body">
            <div v-if="loadingModal" class="modal-loading">Loading...</div>

            <div v-else class="modal-grid">
              <div v-for="it in modalItems" :key="it.id" class="modal-card" @click="setEquip(it)">
                <img v-if="it.thumbnail" :src="getImg(it.thumbnail)" class="modal-img" />
                <div v-else class="modal-empty">No Image</div>
                <p class="modal-label">{{ it.label }}</p>
              </div>

              <div v-if="!modalItems.length" class="modal-empty big">No items</div>
            </div>
          </div>
        </div>
      </div>
    </teleport>
  </div>
</template>

<style scoped>
.equipment-container {
  color: #f8f4e6;
  max-width: 1100px;
  margin: auto;
  padding: 10px 0;
}

h2 {
  color: #ffd27a;
  text-shadow: 0 0 8px rgba(255, 200, 100, 0.6);
  margin-bottom: 14px;
}

.equip-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 14px;
}

.equip-card {
  padding: 12px;
  border-radius: 14px;
  background: linear-gradient(to bottom, #2d2418, #17120c);
  border: 1px solid #7c5a2b;

  text-align: center;
  position: relative;

  box-shadow: inset 0 0 10px rgba(255, 200, 100, 0.06);
}

.equip-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.equip-slot-title {
  font-weight: 900;
  letter-spacing: 0.3px;
  color: #f5d7a1;
  text-shadow: 0 0 4px rgba(0, 0, 0, 0.6);
  font-size: 14px;
}

.equip-choose {
  padding: 6px 10px;
  border-radius: 10px;
  border: 1px solid #7c5a2b;
  background: linear-gradient(to bottom, #3a2c1a, #1a1208);
  color: #f5d7a1;
  cursor: pointer;
  font-weight: 800;
  font-size: 12px;
  transition: 0.2s;
}

.equip-choose:hover {
  box-shadow: 0 0 10px rgba(255, 200, 100, 0.6);
}

.equip-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 4px 0 8px;
}

.equip-img {
  width: 90px;
  height: 90px;
  object-fit: contain;
  filter: drop-shadow(0 0 6px rgba(255, 200, 100, 0.5));
}

.equip-empty {
  width: 90px;
  height: 90px;
  border-radius: 12px;
  border: 1px dashed rgba(255, 200, 100, 0.35);

  display: flex;
  align-items: center;
  justify-content: center;

  color: rgba(255, 200, 100, 0.7);
  font-size: 12px;
  padding: 6px;

  text-shadow: 0 0 3px rgba(0, 0, 0, 0.8);
}

.equip-name {
  margin: 0;
  font-size: 12px;
  color: #f8f4e6;
  text-shadow: 0 0 3px rgba(0, 0, 0, 0.8);
  line-height: 1.25;
}

/* Modal */
.modal {
  position: fixed;
  inset: 0;

  background: rgba(10, 8, 5, 0.7);
  backdrop-filter: blur(8px);

  display: flex;
  justify-content: center;
  align-items: center;

  padding: 18px;
}

.modal-box {
  width: min(900px, 100%);
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

.modal-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.modal-head h3 {
  color: #ffd27a;
  text-shadow: 0 0 6px rgba(255, 200, 100, 0.4);
}

.btn-cancel {
  padding: 10px 12px;
  border-radius: 10px;
  border: none;

  background: #444;
  color: #fff;

  cursor: pointer;
}

.modal-body {
  min-height: 180px;
}

.modal-loading {
  color: #f5d7a1;
  text-align: center;
  padding: 30px 0;
}

.modal-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
}

.modal-card {
  padding: 12px;
  border-radius: 12px;

  border: 1px solid #7c5a2b;
  background: rgba(30, 20, 10, 0.8);

  cursor: pointer;
  text-align: center;

  transition: 0.2s;
}

.modal-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 0 12px rgba(255, 200, 100, 0.25);
}

.modal-img {
  width: 70px;
  height: 70px;
  object-fit: contain;
  filter: drop-shadow(0 0 6px rgba(255, 200, 100, 0.5));
}

.modal-empty {
  width: 70px;
  height: 70px;
  margin: 0 auto;
  border-radius: 12px;
  border: 1px dashed rgba(255, 200, 100, 0.35);

  display: flex;
  align-items: center;
  justify-content: center;

  color: rgba(255, 200, 100, 0.7);
  font-size: 12px;
}

.modal-empty.big {
  grid-column: 1 / -1;
  padding: 35px 0;
  font-size: 14px;
}

.modal-label {
  margin: 8px 0 0;
  font-size: 12px;
  color: #f8f4e6;
  text-shadow: 0 0 3px rgba(0, 0, 0, 0.8);
  line-height: 1.25;
}
</style>
