<script setup>
import { ref, onMounted } from 'vue'
import WeaponSelect from '@/views/components/WeaponSelect.vue'
import { createHunter, getHunters, deleteHunter } from '@/services/hunterStorage'
import { getHunterClasses } from '@/services/hunterService'
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

  // 🔥 เก็บลง state
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
      title: 'ชื่อไม่ตรง',
      text: 'กรุณาพิมพ์ชื่อ Hunter ให้ถูกต้อง',
      timer: 1500,
      showConfirmButton: false,
    })
    return
  }

  deleteHunter(selectedHunter.value.hunter_id)

  Swal.fire({
    icon: 'success',
    title: 'ลบสำเร็จ',
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
  // 👉 ต่อ router ได้ เช่น:
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

const getImg = (path) => {
  return `src/${path}`
}

const handleCreate = () => {
  if (!hunterName.value || !palicoName.value || !weapon.value) {
    Swal.fire({
      icon: 'error',
      title: '[แจ้งเตือนจากระบบ]',
      text: 'กรุณากรอกข้อมูลให้ครบ',
      showConfirmButton: false,
      timer: 1500,
    })
    return
  }
  const hunterData = {
    hunter_name: hunterName.value,
    hunter_class_id: weapon.value.hunter_class_id,
    campaign_day: 1,
    palico_name: palicoName.value,

    equipments: {
      weapons: [
        {
          weapon_type_id: 1,
          item_id: 1,
          is_equip: true,
        },
      ],
      armors: {
        helm: [{ equip_set_id: 1, equip_id: 1, is_equip: true }],
        mail: [{ equip_set_id: 1, equip_id: 2, is_equip: true }],
        greaves: [{ equip_set_id: 1, equip_id: 3, is_equip: true }],
      },
    },

    inventory: [{ resource_type_id: 1, item_id: 1, quantity: 1 }],

    attempted_quest: [{ monster_id: 1, quest_id: 2, attempted: 0 }],
  }

  const newHunter = createHunter(hunterData)

  loadHunters()

  showModal.value = false
}
</script>

<template>
  <div class="menu">
    <h1 class="title">Hunter Save Data</h1>

    <div class="hunter-list">
      <div
        v-for="h in hunters"
        :key="h.hunter_id"
        class="hunter-card row align-items-center justify-content-start"
        @click="openHunter(h)"
      >
        <div class="col-5">
          <img
            v-if="getClass(h.hunter_class_id)"
            :src="getImg(getClass(h.hunter_class_id).thumbnail)"
            class="weapon-img"
          />
        </div>

        <div class="col-5">
          <h3>{{ h.hunter_name }}</h3>
          <p>Palico: {{ h.palico_name }}</p>
          <p>Day {{ h.campaign_day }}</p>
        </div>
      </div>
      <div
        class="hunter-card row align-items-center justify-content-start"
        @click="showModal = true"
      >
        <div class="col-5">
          <span class="add-icon" style="font-size: 50px; margin-left: 10px">+</span>
        </div>
        <div class="col-5">
          <h3>Create Hunter</h3>
        </div>
      </div>
    </div>
  </div>

  <!-- 🔥 HUNTER DETAIL MODAL -->
  <teleport to="body">
    <div v-if="showDetailModal" class="modal-overlay">
      <div class="modal-box align-items-center">
        <h2>{{ selectedHunter.hunter_name }}</h2>

        <img
          v-if="getClass(selectedHunter.hunter_class_id)"
          :src="getImg(getClass(selectedHunter.hunter_class_id).thumbnail)"
          class="weapon-img"
        />

        <p>Palico: {{ selectedHunter.palico_name }}</p>
        <p>Day {{ selectedHunter.campaign_day }}</p>

        <div class="equip-grid">
          <!-- WEAPON -->
          <div class="equip-slot">
            <img v-if="hunterEquip.weapon" :src="getImg(hunterEquip.weapon.thumbnail)" />
            <p>{{ hunterEquip.weapon?.item || 'Empty' }}</p>
          </div>

          <!-- HELM -->
          <div class="equip-slot">
            <img v-if="hunterEquip.helm" :src="getImg(hunterEquip.helm.thumbnail)" />
            <p>{{ hunterEquip.helm?.equip || 'Empty' }}</p>
          </div>

          <!-- MAIL -->
          <div class="equip-slot">
            <img v-if="hunterEquip.mail" :src="getImg(hunterEquip.mail.thumbnail)" />
            <p>{{ hunterEquip.mail?.equip || 'Empty' }}</p>
          </div>

          <!-- GREAVES -->
          <div class="equip-slot">
            <img v-if="hunterEquip.greaves" :src="getImg(hunterEquip.greaves.thumbnail)" />
            <p>{{ hunterEquip.greaves?.equip || 'Empty' }}</p>
          </div>
        </div>

        <div class="modal-actions">
          <button class="btn-mhw" @click="enterWorld">Enter World</button>

          <button class="btn-danger" @click="showDeleteModal = true">Delete Account</button>

          <button class="btn-cancel" @click="showDetailModal = false">Close</button>
        </div>
      </div>
    </div>
  </teleport>
  <teleport to="body">
    <div v-if="showDeleteModal" class="modal-overlay">
      <div class="modal-box align-items-center">
        <h2>{{ selectedHunter.hunter_name }}</h2>

        <input v-model="deleteConfirmName" placeholder="Type Hunter Name to delete" />

        <div class="modal-actions">
          <button class="btn-danger" @click="handleDelete">Delete Account</button>

          <button class="btn-cancel" @click="showDeleteModal = false">Close</button>
        </div>
      </div>
    </div>
  </teleport>

  <!-- MODAL -->
  <teleport to="body">
    <div v-if="showModal" class="modal-overlay">
      <div class="modal-box">
        <h2>Create Hunter</h2>

        <input v-model="hunterName" placeholder="Hunter Name" />
        <input v-model="palicoName" placeholder="Palico Name" />

        <WeaponSelect @select="(w) => (weapon = w)" />

        <div class="modal-actions">
          <button class="btn-mhw" @click="handleCreate">Confirm</button>

          <button class="btn-cancel" @click="showModal = false">Cancel</button>
        </div>
      </div>
    </div>
  </teleport>
</template>

<style scoped>
.equip-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  margin-top: 10px;
}

.equip-slot {
  background: rgba(30, 20, 10, 0.8);
  border: 1px solid #7c5a2b;
  border-radius: 10px;

  padding: 10px;
  text-align: center;

  transition: 0.2s;
}

.equip-slot img {
  width: 60px;
  height: 60px;
  object-fit: contain;

  filter: drop-shadow(0 0 5px rgba(255, 200, 100, 0.5));
}

.equip-slot p {
  margin-top: 5px;
  font-size: 12px;
  color: #f5d7a1;
}

.equip-slot:hover {
  transform: scale(1.05);
  box-shadow: 0 0 10px rgba(255, 200, 100, 0.5);
}

.btn-danger {
  padding: 10px;
  border-radius: 8px;
  border: none;

  background: #8b1a1a;
  color: #fff;

  cursor: pointer;
}

.btn-danger:hover {
  box-shadow: 0 0 10px rgba(255, 50, 50, 0.7);
}

.weapon-img {
  width: 100px;
  height: 100px;
  object-fit: contain;

  filter: drop-shadow(0 0 5px rgba(255, 200, 100, 0.6));
}

.hunter-list {
  margin-top: 30px;
  width: 400px;

  display: flex;
  flex-direction: column;
  gap: 15px;
}

/* CARD */
.hunter-card {
  padding: 10px;
  border-radius: 12px;

  background: rgba(20, 15, 10, 0.85);
  border: 2px solid #7c5a2b;

  color: #f5d7a1;

  box-shadow:
    0 0 10px rgba(0, 0, 0, 0.8),
    inset 0 0 10px rgba(255, 200, 100, 0.1);

  transition: all 0.2s;
}

/* HOVER */
.hunter-card:hover {
  transform: scale(1.02);
  box-shadow: 0 0 15px rgba(255, 200, 100, 0.6);
  cursor: pointer;
}

.menu {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
}

.title {
  color: #f5d7a1;
}

/* ===== MODAL ===== */
.modal-overlay {
  position: fixed;
  inset: 0;

  background: rgba(10, 8, 5, 0.6);

  backdrop-filter: blur(10px) brightness(0.7);
  -webkit-backdrop-filter: blur(10px) brightness(0.7);

  display: flex;
  justify-content: center;
  align-items: center;
}

.modal-box {
  width: 350px;
  padding: 25px;
  border-radius: 12px;

  background: rgba(20, 15, 10, 0.95);
  border: 2px solid #7c5a2b;

  box-shadow:
    0 0 20px rgba(0, 0, 0, 0.8),
    0 0 15px rgba(255, 200, 100, 0.2);

  display: flex;
  flex-direction: column;
  gap: 15px;
}

.modal-box h2 {
  text-align: center;
  color: #f5d7a1;
}

/* INPUT */
.modal-box input,
.modal-box select {
  padding: 10px;
  border-radius: 8px;
  border: 1px solid #7c5a2b;

  background: #1a1208;
  color: #fff;
}

/* BUTTON */
.btn-mhw {
  padding: 10px;
  border-radius: 8px;
  border: 2px solid #7c5a2b;

  background: linear-gradient(to bottom, #3a2c1a, #1a1208);
  color: #f5d7a1;

  cursor: pointer;
}

.btn-mhw:hover {
  box-shadow: 0 0 10px rgba(255, 200, 100, 0.7);
}

.btn-cancel {
  padding: 10px;
  border-radius: 8px;
  border: none;

  background: #444;
  color: #fff;
}

/* ACTION */
.modal-actions {
  display: flex;
  justify-content: space-between;
  gap: 10px;
}

.modal-box {
  animation: popup 0.2s ease;
}

@keyframes popup {
  from {
    transform: scale(0.8);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}
</style>
