<script setup>
import { ref, onMounted } from 'vue'
import WeaponSelect from '@/views/components/WeaponSelect.vue'
import { createHunter, getHunters, deleteHunter } from '@/services/hunterStorage'
import { getHunterClasses, getHunterClassById } from '@/services/hunterService'
import { getArmors, getWeapons } from '@/services/equipService'
import { useRouter } from 'vue-router'

const router = useRouter()

const showModal = ref(false)

const hunterName = ref('')
const palicoName = ref('')
const weapon = ref(null)

const hunters = ref([])
const hunterClasses = ref([])

const showDetailModal = ref(false)
const showDeleteModal = ref(false)
const selectedHunter = ref(null)

const deleteConfirmName = ref('')

const hunterEquip = ref({
  weapon: null,
  helm: null,
  mail: null,
  greaves: null,
})

const openHunter = async (h) => {
  const helm = h.equipments.armors.helm.find((i) => i.is_equip)
  const mail = h.equipments.armors.mail.find((i) => i.is_equip)
  const greaves = h.equipments.armors.greaves.find((i) => i.is_equip)
  const weapon = h.equipments.weapons.find((i) => i.is_equip)

  const [helmdetail, maildetail, greavedetail, weapondetail] = await Promise.all([
    getArmors(helm.equip_set_id, helm.equip_id),
    getArmors(mail.equip_set_id, mail.equip_id),
    getArmors(greaves.equip_set_id, greaves.equip_id),
    getWeapons(h.hunter_class_id, weapon.weapon_type_id, weapon.item_id),
  ])

  hunterEquip.value = {
    weapon: weapondetail,
    helm: helmdetail,
    mail: maildetail,
    greaves: greavedetail,
  }

  selectedHunter.value = h
  deleteConfirmName.value = ''
  showDetailModal.value = true
}

const handleDelete = () => {
  if (deleteConfirmName.value !== selectedHunter.value.hunter_name) {
    Swal.fire({
      icon: 'error',
      title: 'Name Mismatch',
      text: 'Please type the hunter name correctly.',
      timer: 1500,
      showConfirmButton: false,
    })
    return
  }

  deleteHunter(selectedHunter.value.hunter_id)

  Swal.fire({
    icon: 'success',
    title: 'Hunter Retired',
    timer: 1200,
    showConfirmButton: false,
  })

  showDetailModal.value = false
  showDeleteModal.value = false
  showModal.value = false
  loadHunters()
}

const enterWorld = () => {
  showDetailModal.value = false
  showDeleteModal.value = false
  showModal.value = false
  router.push('/home')
  localStorage.setItem('hunterId', selectedHunter.value.hunter_id)
}

const loadHunters = () => {
  const data = getHunters()
  hunters.value = Array.isArray(data) ? data.filter((h) => h.hunter_name) : []
}

onMounted(async () => {
  hunterClasses.value = await getHunterClasses()
  loadHunters()
})

const getClass = (id) => {
  return hunterClasses.value.find((c) => c.hunter_class_id === id)
}

const getImg = (path) => `${import.meta.env.BASE_URL}${path}`

const handleCreate = () => {
  if (!hunterName.value || !palicoName.value || !weapon.value) {
    Swal.fire({
      icon: 'error',
      title: '[Guild Notice]',
      text: 'Please fill in all required fields.',
      showConfirmButton: false,
      timer: 1500,
    })
    return
  }
  var HunterClass = getHunterClassById(weapon.value.hunter_class_id)
  const hunterData = {
    hunter_name: hunterName.value,
    hunter_class_id: weapon.value.hunter_class_id,
    campaign_day: 1,
    palico_name: palicoName.value,

    equipments: {
      weapons: [HunterClass.starter_set.weapon],
      armors: {
        helm: [HunterClass.starter_set.armors.helm],
        mail: [HunterClass.starter_set.armors.mail],
        greaves: [HunterClass.starter_set.armors.greaves],
      },
    },

    inventory: [],

    attempted_quest: [{ monster_id: 1, quest_id: 2, attempted: 0 }],
  }

  createHunter(hunterData)
  loadHunters()
  showModal.value = false
}
</script>

<template>
  <div class="registry-page">
    <!-- GUILD HEADER -->
    <div class="registry-header">
      <div class="rh-ornament">— ✦ —</div>
      <h1 class="rh-title">Hunter Registry</h1>
      <p class="rh-sub">Select your hunter to enter the world</p>
      <div class="rh-ornament">— ✦ —</div>
    </div>

    <!-- HUNTER LIST -->
    <div class="hunter-list">
      <!-- EXISTING HUNTERS -->
      <div v-for="h in hunters" :key="h.hunter_id" class="guild-card" @click="openHunter(h)">
        <div class="gc-left">
          <div class="gc-icon-wrap">
            <img
              v-if="getClass(h.hunter_class_id)"
              :src="getImg(getClass(h.hunter_class_id).thumbnail)"
              class="gc-icon"
            />
          </div>
        </div>

        <div class="gc-body">
          <div class="gc-name">{{ h.hunter_name }}</div>
          <div class="gc-meta">
            <span class="gc-tag">{{ getClass(h.hunter_class_id)?.hunter_class || '—' }}</span>
          </div>
          <div class="gc-details">
            <span class="gc-palico">Palico: {{ h.palico_name }}</span>
            <span class="gc-day">Day {{ h.campaign_day }}</span>
          </div>
        </div>

        <div class="gc-right">
          <div class="gc-enter-hint">▶</div>
        </div>
      </div>

      <!-- CREATE NEW HUNTER CARD -->
      <div class="guild-card new-hunter-card" @click="showModal = true">
        <div class="gc-left">
          <div class="gc-icon-wrap new-icon-wrap">
            <span class="new-plus">+</span>
          </div>
        </div>
        <div class="gc-body">
          <div class="gc-name new-name">Register New Hunter</div>
          <div class="gc-meta">
            <span class="gc-tag new-tag">Guild Enrollment</span>
          </div>
        </div>
        <div class="gc-right">
          <div class="gc-enter-hint">▶</div>
        </div>
      </div>
    </div>
  </div>

  <!-- ══════════ HUNTER DETAIL MODAL ══════════ -->
  <teleport to="body">
    <div v-if="showDetailModal" class="modal-overlay">
      <div class="modal-parchment">
        <div class="modal-stamp-header">
          <div class="modal-stamp">HUNTER FILE</div>
        </div>

        <img
          v-if="getClass(selectedHunter.hunter_class_id)"
          :src="getImg(getClass(selectedHunter.hunter_class_id).thumbnail)"
          class="modal-hunter-img"
        />

        <h2 class="modal-hunter-name">{{ selectedHunter.hunter_name }}</h2>

        <div class="modal-meta-row">
          <span class="modal-meta-chip">Palico: {{ selectedHunter.palico_name }}</span>
          <span class="modal-meta-chip">Day {{ selectedHunter.campaign_day }}</span>
        </div>

        <div class="modal-divider">— Equipment —</div>

        <div class="equip-grid">
          <div class="equip-slot">
            <img
              v-if="hunterEquip.weapon"
              :src="getImg(hunterEquip.weapon.thumbnail)"
              class="equip-slot-img"
            />
            <p class="equip-slot-name">{{ hunterEquip.weapon?.item || '—' }}</p>
            <span class="equip-slot-label">Weapon</span>
          </div>
          <div class="equip-slot">
            <img
              v-if="hunterEquip.helm"
              :src="getImg(hunterEquip.helm.thumbnail)"
              class="equip-slot-img"
            />
            <p class="equip-slot-name">{{ hunterEquip.helm?.equip || '—' }}</p>
            <span class="equip-slot-label">Helm</span>
          </div>
          <div class="equip-slot">
            <img
              v-if="hunterEquip.mail"
              :src="getImg(hunterEquip.mail.thumbnail)"
              class="equip-slot-img"
            />
            <p class="equip-slot-name">{{ hunterEquip.mail?.equip || '—' }}</p>
            <span class="equip-slot-label">Mail</span>
          </div>
          <div class="equip-slot">
            <img
              v-if="hunterEquip.greaves"
              :src="getImg(hunterEquip.greaves.thumbnail)"
              class="equip-slot-img"
            />
            <p class="equip-slot-name">{{ hunterEquip.greaves?.equip || '—' }}</p>
            <span class="equip-slot-label">Greaves</span>
          </div>
        </div>

        <div class="modal-actions">
          <button class="btn-embark" @click="enterWorld"><span>⚔</span> Enter World</button>
          <button class="btn-danger-sm" @click="showDeleteModal = true">Retire Hunter</button>
          <button class="btn-close-sm" @click="showDetailModal = false">Close</button>
        </div>
      </div>
    </div>
  </teleport>

  <!-- ══════════ DELETE CONFIRM MODAL ══════════ -->
  <teleport to="body">
    <div v-if="showDeleteModal" class="modal-overlay">
      <div class="modal-parchment narrow">
        <div class="modal-stamp-header danger">
          <div class="modal-stamp danger-stamp">RETIREMENT FORM</div>
        </div>

        <p class="delete-warning">
          This action is irreversible.<br />
          Type the hunter's name to confirm.
        </p>

        <h3 class="delete-hunter-name">{{ selectedHunter.hunter_name }}</h3>

        <input v-model="deleteConfirmName" class="mhw-input" placeholder="Type hunter name..." />

        <div class="modal-actions">
          <button class="btn-danger-sm" @click="handleDelete">Confirm Retirement</button>
          <button class="btn-close-sm" @click="showDeleteModal = false">Cancel</button>
        </div>
      </div>
    </div>
  </teleport>

  <!-- ══════════ CREATE HUNTER MODAL ══════════ -->
  <teleport to="body">
    <div v-if="showModal" class="modal-overlay">
      <div class="modal-parchment">
        <div class="modal-stamp-header">
          <div class="modal-stamp">GUILD ENROLLMENT</div>
        </div>

        <div class="form-section">
          <label class="form-label">Hunter Name</label>
          <input v-model="hunterName" class="mhw-input" placeholder="Enter hunter name..." />
        </div>

        <div class="form-section">
          <label class="form-label">Palico Name</label>
          <input v-model="palicoName" class="mhw-input" placeholder="Enter palico name..." />
        </div>

        <div class="form-section">
          <label class="form-label">Hunter Class</label>
          <WeaponSelect @select="(w) => (weapon = w)" />
        </div>

        <div class="modal-actions">
          <button class="btn-embark" @click="handleCreate"><span>✦</span> Enroll Hunter</button>
          <button class="btn-close-sm" @click="showModal = false">Cancel</button>
        </div>
      </div>
    </div>
  </teleport>
</template>

<style scoped>
/* ══════════════════════════════════════════
   BASE
══════════════════════════════════════════ */
.registry-page {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
  font-family: 'Georgia', 'Times New Roman', serif;
  color: #f0ddb0;
  padding: 10px 0;
}

/* ══════════════════════════════════════════
   GUILD HEADER
══════════════════════════════════════════ */
.registry-header {
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.rh-title {
  margin: 0;
  font-size: 28px;
  color: #ffd27a;
  letter-spacing: 4px;
  text-transform: uppercase;
  text-shadow:
    0 0 20px rgba(255, 200, 80, 0.5),
    0 2px 6px rgba(0, 0, 0, 0.9);
}

.rh-sub {
  margin: 0;
  font-size: 12px;
  color: #a88040;
  letter-spacing: 3px;
  text-transform: uppercase;
}

.rh-ornament {
  color: #5a3d1f;
  font-size: 12px;
  letter-spacing: 6px;
}

/* ══════════════════════════════════════════
   HUNTER LIST
══════════════════════════════════════════ */
.hunter-list {
  width: 100%;
  max-width: 500px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* ══════════════════════════════════════════
   GUILD CARD
══════════════════════════════════════════ */
.guild-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  border-radius: 10px;
  background: linear-gradient(135deg, rgba(30, 22, 10, 0.9), rgba(20, 14, 6, 0.95));
  border: 1px solid #7c5a2b;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
  overflow: hidden;
}

.guild-card::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, rgba(200, 155, 60, 0.04) 0%, transparent 60%);
  pointer-events: none;
}

.guild-card:hover {
  border-color: #c89b3c;
  transform: translateY(-2px);
  box-shadow:
    0 4px 20px rgba(0, 0, 0, 0.6),
    0 0 12px rgba(200, 155, 60, 0.2);
}

/* NEW HUNTER */
.new-hunter-card {
  border-style: dashed;
  border-color: #5a3d1f;
  background: rgba(20, 14, 6, 0.6);
}

.new-hunter-card:hover {
  border-color: #c89b3c;
  border-style: solid;
}

/* LEFT */
.gc-left {
}

.gc-icon-wrap {
  width: 64px;
  height: 64px;
  border-radius: 8px;
  border: 1px solid #5a3d1f;
  background: rgba(10, 8, 4, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.gc-icon {
  width: 56px;
  height: 56px;
  object-fit: contain;
  filter: drop-shadow(0 0 6px rgba(255, 200, 100, 0.4));
}

.new-icon-wrap {
  border-style: dashed;
}

.new-plus {
  font-size: 32px;
  color: #5a3d1f;
  line-height: 1;
}

/* BODY */
.gc-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.gc-name {
  font-size: 16px;
  color: #ffd27a;
  font-weight: bold;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.8);
  letter-spacing: 0.5px;
}

.new-name {
  color: #a88040;
}

.gc-meta {
  display: flex;
  gap: 6px;
}

.gc-tag {
  font-size: 9px;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: #c89b3c;
  background: rgba(200, 155, 60, 0.12);
  border: 1px solid rgba(200, 155, 60, 0.3);
  border-radius: 4px;
  padding: 2px 6px;
}

.new-tag {
  color: #5a3d1f;
  border-color: rgba(90, 61, 31, 0.3);
  background: transparent;
}

.gc-details {
  display: flex;
  gap: 12px;
}

.gc-palico,
.gc-day {
  font-size: 11px;
  color: #a88040;
}

/* RIGHT */
.gc-right {
}

.gc-enter-hint {
  font-size: 14px;
  color: #5a3d1f;
  transition: 0.2s;
}

.guild-card:hover .gc-enter-hint {
  color: #c89b3c;
  transform: translateX(3px);
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
  z-index: 100;
  padding: 16px;
}

/* ══════════════════════════════════════════
   MODAL PARCHMENT
══════════════════════════════════════════ */
.modal-parchment {
  width: min(460px, 100%);
  max-height: 90vh;
  overflow-y: auto;
  padding: 24px;
  border-radius: 12px;
  background: linear-gradient(160deg, #1c1508, #13100a, #1c1508);
  border: 2px solid #7c5a2b;
  box-shadow:
    0 0 40px rgba(0, 0, 0, 0.9),
    0 0 20px rgba(200, 155, 60, 0.15);
  display: flex;
  flex-direction: column;
  gap: 16px;
  animation: popIn 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
  font-family: 'Georgia', serif;
}

.modal-parchment.narrow {
  width: min(360px, 100%);
}

@keyframes popIn {
  from {
    transform: scale(0.85);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}

/* STAMP HEADER */
.modal-stamp-header {
  text-align: center;
}

.modal-stamp {
  display: inline-block;
  font-size: 10px;
  letter-spacing: 4px;
  text-transform: uppercase;
  color: #c89b3c;
  border: 2px solid #7c5a2b;
  border-radius: 4px;
  padding: 4px 14px;
  background: rgba(200, 155, 60, 0.08);
  text-shadow: 0 0 8px rgba(200, 155, 60, 0.4);
}

.modal-stamp-header.danger .modal-stamp {
  color: #e05050;
  border-color: #8b1a1a;
  background: rgba(140, 26, 26, 0.12);
  text-shadow: 0 0 8px rgba(224, 80, 80, 0.4);
}

/* HUNTER IMAGE */
.modal-hunter-img {
  width: 100px;
  height: 100px;
  object-fit: contain;
  margin: 0 auto;
  display: block;
  filter: drop-shadow(0 0 10px rgba(255, 200, 100, 0.5));
}

.modal-hunter-name {
  text-align: center;
  margin: 0;
  font-size: 22px;
  color: #ffd27a;
  text-shadow: 0 0 15px rgba(255, 200, 80, 0.4);
  letter-spacing: 1px;
}

.modal-meta-row {
  display: flex;
  justify-content: center;
  gap: 10px;
  flex-wrap: wrap;
}

.modal-meta-chip {
  font-size: 11px;
  color: #a88040;
  letter-spacing: 1px;
}

.modal-divider {
  text-align: center;
  font-size: 11px;
  color: #7c5a2b;
  letter-spacing: 4px;
  text-transform: uppercase;
}

/* EQUIP GRID */
.equip-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

.equip-slot {
  background: rgba(10, 8, 4, 0.7);
  border: 1px solid #5a3d1f;
  border-radius: 8px;
  padding: 10px 8px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  transition: 0.2s;
}

.equip-slot:hover {
  border-color: #7c5a2b;
}

.equip-slot-img {
  width: 52px;
  height: 52px;
  object-fit: contain;
  filter: drop-shadow(0 0 5px rgba(255, 200, 100, 0.4));
}

.equip-slot-name {
  margin: 0;
  font-size: 11px;
  color: #f0ddb0;
  line-height: 1.3;
}

.equip-slot-label {
  font-size: 9px;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: #7c5a2b;
}

/* ══════════════════════════════════════════
   BUTTONS
══════════════════════════════════════════ */
.modal-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: center;
}

.btn-embark {
  flex: 1;
  min-width: 140px;
  padding: 12px 20px;
  border-radius: 8px;
  border: 2px solid #7c5a2b;
  background: linear-gradient(to bottom, #3a2c1a, #1a1208);
  color: #ffd27a;
  font-size: 14px;
  font-family: 'Georgia', serif;
  letter-spacing: 1px;
  cursor: pointer;
  transition: 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 48px;
}

.btn-embark:hover {
  border-color: #c89b3c;
  box-shadow: 0 0 15px rgba(200, 155, 60, 0.4);
  color: #fff;
}

.btn-danger-sm {
  padding: 10px 16px;
  border-radius: 8px;
  border: 1px solid #8b1a1a;
  background: rgba(139, 26, 26, 0.2);
  color: #e05050;
  font-size: 12px;
  cursor: pointer;
  transition: 0.2s;
  min-height: 44px;
}

.btn-danger-sm:hover {
  background: rgba(139, 26, 26, 0.4);
  box-shadow: 0 0 10px rgba(224, 80, 80, 0.3);
}

.btn-close-sm {
  padding: 10px 16px;
  border-radius: 8px;
  border: 1px solid #3a2c1a;
  background: rgba(30, 22, 10, 0.6);
  color: #7c5a2b;
  font-size: 12px;
  cursor: pointer;
  transition: 0.2s;
  min-height: 44px;
}

.btn-close-sm:hover {
  color: #a88040;
  border-color: #5a3d1f;
}

/* ══════════════════════════════════════════
   FORM
══════════════════════════════════════════ */
.form-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-label {
  font-size: 10px;
  letter-spacing: 3px;
  text-transform: uppercase;
  color: #7c5a2b;
}

.mhw-input {
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid #7c5a2b;
  background: rgba(10, 8, 4, 0.8);
  color: #f0ddb0;
  font-size: 14px;
  font-family: 'Georgia', serif;
  width: 100%;
  box-sizing: border-box;
  transition: 0.2s;
}

.mhw-input:focus {
  outline: none;
  border-color: #c89b3c;
  box-shadow: 0 0 8px rgba(200, 155, 60, 0.25);
}

.mhw-input::placeholder {
  color: #5a3d1f;
}

/* DELETE SECTION */
.delete-warning {
  text-align: center;
  font-size: 13px;
  color: #a88040;
  line-height: 1.6;
  margin: 0;
}

.delete-hunter-name {
  text-align: center;
  margin: 0;
  font-size: 18px;
  color: #e05050;
  letter-spacing: 1px;
}

/* ══════════════════════════════════════════
   RESPONSIVE
══════════════════════════════════════════ */
@media (max-width: 768px) {
  .rh-title {
    font-size: 22px;
    letter-spacing: 2px;
  }
  .hunter-list {
    max-width: 100%;
  }
  .guild-card {
    padding: 12px;
    gap: 12px;
  }
  .gc-icon-wrap {
    width: 56px;
    height: 56px;
  }
  .gc-icon {
    width: 48px;
    height: 48px;
  }
  .gc-name {
    font-size: 15px;
  }
}

@media (max-width: 480px) {
  .rh-title {
    font-size: 18px;
    letter-spacing: 1px;
  }
  .rh-sub {
    font-size: 10px;
    letter-spacing: 2px;
  }

  .guild-card {
    padding: 10px 12px;
    gap: 10px;
  }
  .gc-icon-wrap {
    width: 48px;
    height: 48px;
  }
  .gc-icon {
    width: 40px;
    height: 40px;
  }
  .gc-name {
    font-size: 14px;
  }
  .gc-details {
    flex-direction: column;
    gap: 2px;
  }

  .modal-parchment {
    padding: 18px 16px;
    gap: 12px;
  }
  .equip-grid {
    gap: 8px;
  }
  .equip-slot-img {
    width: 44px;
    height: 44px;
  }

  .btn-embark {
    font-size: 13px;
    padding: 10px 14px;
  }
  .modal-hunter-name {
    font-size: 18px;
  }
}
</style>
