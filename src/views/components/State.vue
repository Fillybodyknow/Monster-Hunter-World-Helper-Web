<script setup>
import { ref, onMounted, computed } from 'vue'

import { getHunterById } from '@/services/hunterStorage'
import { getHunterClassById } from '@/services/hunterService'
import { getArmors, getWeapons } from '@/services/equipService'
import elementalData from '@/assets/files/elemental.json'
import bonusAbilityData from '@/assets/files/bonus_ability.json'

const hunter = ref(null)

const totalArmor = computed(() => {
  if (!hunter.value) return 0

  const helm = hunter.value.armors.helm.physical_armor || 0
  const mail = hunter.value.armors.mail.physical_armor || 0
  const greaves = hunter.value.armors.greaves.physical_armor || 0
  const weaponDef = hunter.value.weapon.defense || 0

  return helm + mail + greaves + weaponDef
})

const elementArmor = computed(() => {
  if (!hunter.value) return []

  const armors = [hunter.value.armors.helm, hunter.value.armors.mail, hunter.value.armors.greaves]

  const map = {}

  armors.forEach((a) => {
    const el = a.elemental_armor

    if (!el || el.elemental_id === 0) return

    if (!map[el.elemental_id]) {
      map[el.elemental_id] = 0
    }

    map[el.elemental_id] += el.protection
  })

  // 🔥 แปลงเป็น array พร้อม thumbnail
  return Object.keys(map).map((id) => {
    const element = elementalData.find((e) => e.elemental_id === Number(id))

    return {
      elemental_id: id,
      value: map[id],
      thumbnail: element?.thumbnail,
    }
  })
})

const bonusAbilities = computed(() => {
  if (!hunter.value) return []

  const armors = [hunter.value.armors.helm, hunter.value.armors.mail, hunter.value.armors.greaves]

  const abilitySet = new Set()

  if (hunter.value.armor_set_ability !== 0) abilitySet.add(hunter.value.armor_set_ability)

  armors.forEach((a) => {
    if (a.ability_id && a.ability_id !== 0) {
      abilitySet.add(a.ability_id)
    }
  })

  return [...abilitySet]
    .map((id) => {
      return bonusAbilityData.find((a) => a.ability_id === id)
    })
    .filter(Boolean)
})

const getImg = (path) => `src/${path}`

onMounted(async () => {
  const HunterID = parseInt(localStorage.getItem('hunterId'))
  const Hunter = getHunterById(HunterID)
  const Weapon = Hunter.equipments.weapons.find((i) => i.is_equip)
  const Armors = {
    helm: Hunter.equipments.armors.helm.find((i) => i.is_equip),
    mail: Hunter.equipments.armors.mail.find((i) => i.is_equip),
    greaves: Hunter.equipments.armors.greaves.find((i) => i.is_equip),
  }

  const helm = await Promise.resolve(getArmors(Armors.helm.equip_set_id, Armors.helm.equip_id))
  const mail = await Promise.resolve(getArmors(Armors.mail.equip_set_id, Armors.mail.equip_id))
  const greaves = await Promise.resolve(
    getArmors(Armors.greaves.equip_set_id, Armors.greaves.equip_id),
  )
  const weapon = await Promise.resolve(
    getWeapons(Hunter.hunter_class_id, Weapon.weapon_type_id, Weapon.item_id),
  )
  const Hunterinfo = {
    name: Hunter.hunter_name,
    class: await Promise.resolve(getHunterClassById(Hunter.hunter_class_id)),
    palico: Hunter.palico_name,
    campaign_day: Hunter.campaign_day,
    weapon: weapon,
    armors: {
      helm: helm,
      mail: mail,
      greaves: greaves,
    },
    armor_set_ability:
      helm.equip_set_id == mail.equip_set_id && helm.equip_set_id == greaves.equip_set_id
        ? helm.set_ability_bonus
        : 0,
  }

  // console.log(Hunterinfo)
  hunter.value = Hunterinfo
})
</script>

<template>
  <div v-if="hunter" class="state-container">
    <!-- ===== LEFT PANEL ===== -->
    <div class="panel left">
      <img :src="getImg(hunter.class.thumbnail)" class="class-img" />

      <h2>{{ hunter.name }}</h2>
      <p class="class-name">{{ hunter.class.hunter_class }}</p>
      <p>Palico: {{ hunter.palico }}</p>
      <p>Day {{ hunter.campaign_day }}</p>
    </div>

    <!-- ===== CENTER PANEL ===== -->
    <div class="panel center">
      <h3>Equipment</h3>

      <div class="equip-grid">
        <!-- WEAPON -->
        <div class="equip-card">
          <div class="col">
            <img :src="getImg(hunter.weapon.set_thumbnail)" />
            <img :src="getImg(hunter.weapon.thumbnail)" />
          </div>
          <p>{{ hunter.weapon.item }}</p>
        </div>

        <!-- HELM -->
        <div class="equip-card">
          <div class="col">
            <img :src="getImg(hunter.armors.helm.set_thumbnail)" />
            <img :src="getImg(hunter.armors.helm.thumbnail)" />
          </div>
          <p>{{ hunter.armors.helm.equip }}</p>
        </div>

        <!-- MAIL -->
        <div class="equip-card">
          <div class="col">
            <img :src="getImg(hunter.armors.mail.set_thumbnail)" />
            <img :src="getImg(hunter.armors.mail.thumbnail)" />
          </div>
          <p>{{ hunter.armors.mail.equip }}</p>
        </div>

        <!-- GREAVES -->
        <div class="equip-card">
          <div class="col">
            <img :src="getImg(hunter.armors.greaves.set_thumbnail)" />
            <img :src="getImg(hunter.armors.greaves.thumbnail)" />
          </div>
          <p>{{ hunter.armors.greaves.equip }}</p>
        </div>
      </div>

      <!-- SET BONUS -->
      <div class="set-box">
        <h3>Bonus Ability</h3>

        <div v-if="bonusAbilities.length > 0" class="ability-list">
          <div v-for="ab in bonusAbilities" :key="ab.ability_id" class="ability-card">
            <h4>{{ ab.ability_name }}</h4>
            <p>{{ ab.ability }}</p>
          </div>
        </div>

        <p v-else class="no-ability">No Ability</p>
      </div>
    </div>

    <!-- ===== RIGHT PANEL ===== -->
    <div class="panel right">
      <h3>Stats</h3>

      <!-- DAMAGE -->
      <div class="damage-box">
        <!-- 🔥 CARD FRAME -->
        <div class="damage-row">
          <div v-for="(val, key) in hunter.weapon.damage_cards" :key="key" class="damage-wrapper">
            <div class="damage-frame">
              <div class="damage-card">
                <img src="/src/assets/img/take_damage.png" />
                <span class="dmg-value">
                  {{ key.split('_')[1] }}
                </span>
              </div>

              <p class="dmg-count">x{{ val }}</p>
            </div>
          </div>
        </div>
      </div>

      <!-- ARMOR STATS -->
      <div class="armor-stats col justify-content-center">
        <div class="armor-card element-card">
          <img src="/src/assets/img/bonus_armor.png" />
          <span>{{ totalArmor }}</span>
        </div>

        <!-- 🔒 Placeholder Element Armor -->
        <div class="element-grid">
          <div v-for="el in elementArmor" :key="el.elemental_id" class="armor-card element-card">
            <!-- BASE ARMOR -->
            <img src="/src/assets/img/bonus_armor.png" class="armor-base" />

            <!-- ELEMENT ICON -->
            <img :src="getImg(el.thumbnail)" class="element-icon" />

            <!-- VALUE -->
            <span class="element-value">{{ el.value }}</span>
          </div>
        </div>
      </div>

      <!-- REMOVE / ADD -->
      <div class="card-mod">
        <p>Remove: {{ hunter.weapon.remove || '-' }}</p>
        <p>Add: {{ hunter.weapon.add || '-' }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ELEMENT GRID */
.ability-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 10px;
}

.ability-card {
  padding: 10px;
  border-radius: 10px;

  background: rgba(30, 20, 10, 0.85);
  border: 1px solid #7c5a2b;

  box-shadow: inset 0 0 8px rgba(255, 200, 100, 0.1);
}

.ability-card h4 {
  margin: 0;
  font-size: 14px;
  color: gold;
}

.ability-card p {
  margin: 5px 0 0;
  font-size: 12px;
  color: #f5d7a1;
}

.no-ability {
  text-align: center;
  opacity: 0.6;
}

.element-grid {
  display: flex;
  gap: 10px;
  justify-content: center;
}

.state-container {
  display: grid;
  grid-template-columns: 1fr 2fr 1fr;
  gap: 15px;
  color: #f5d7a1;
}

/* PANEL */
.panel {
  padding: 15px;
  border-radius: 12px;

  background: rgba(20, 15, 10, 0.85);
  border: 2px solid #7c5a2b;

  box-shadow:
    0 0 10px rgba(0, 0, 0, 0.8),
    inset 0 0 10px rgba(255, 200, 100, 0.1);
}

/* LEFT */
.class-img {
  width: 100px;
  display: block;
  margin: auto;
}

.class-name {
  text-align: center;
  color: gold;
}

/* CENTER */
.equip-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

.equip-card {
  text-align: center;
  padding: 10px;
  border-radius: 10px;

  background: rgba(30, 20, 10, 0.8);
  border: 1px solid #7c5a2b;
}

.equip-card img {
  width: 60px;
}

.set-box {
  margin-top: 10px;
  text-align: center;
}

/* RIGHT */
.damage-box,
.armor-stats,
.card-mod {
  margin-top: 20px;
}

.armor-stats {
  display: flex;
  gap: 10px;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.damage-row {
  display: flex;
  justify-content: space-between;
}

.state-page {
  color: #f5d7a1;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* ===== TOP ===== */
.top-section {
  display: flex;
  gap: 20px;
}

/* LEFT */
.character-panel {
  width: 40%;
  text-align: center;

  background: rgba(20, 15, 10, 0.9);
  border: 2px solid #7c5a2b;
  border-radius: 12px;
  padding: 15px;
}

.hunter-img {
  width: 120px;
  height: 120px;
  object-fit: contain;
}

.class-box {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 10px;

  margin-top: 10px;
}

.class-box img {
  width: 40px;
}

/* RIGHT */
.stat-panel {
  width: 60%;

  background: rgba(20, 15, 10, 0.9);
  border: 2px solid #7c5a2b;
  border-radius: 12px;
  padding: 15px;

  display: flex;
  flex-direction: column;
  gap: 10px;
}

.stat-row {
  display: flex;
  justify-content: space-between;
}

/* DAMAGE */
.damage-box {
  margin-top: 10px;
}

.damage-grid {
  display: flex;
  gap: 10px;
}

/* WRAPPER */
.damage-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
}

/* CARD */
.damage-card {
  position: relative;
  width: 60px;
  height: 60px;
}

.damage-card img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

/* 🔥 ค่า DAMAGE (ซ้อนบนรูป) */
.dmg-value {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);

  font-size: 18px;
  font-weight: bold;
  color: #fff;

  text-shadow: 0 0 6px #000;
}

/* 🔥 จำนวนการ์ด (แยกออกมา) */
.dmg-count {
  margin-top: 4px;
  font-size: 16px;
  color: #f5d7a1;
}
/* ===== FRAME (เหมือนการ์ด) ===== */
.damage-frame {
  /* margin-top: 10px; */
  padding: 12px 6px 0px 6px;

  display: flex;
  flex-direction: column;
  align-items: center;

  border-radius: 14px;

  background: linear-gradient(to bottom, rgba(60, 45, 25, 0.9), rgba(20, 15, 10, 0.9));

  border: 2px solid #7c5a2b;

  box-shadow:
    0 0 10px rgba(0, 0, 0, 0.8),
    inset 0 0 10px rgba(255, 200, 100, 0.15);
}

/* ===== ROW ===== */
.damage-row {
  display: flex;
  justify-content: space-between;
  gap: 10px;
}

/* ===== OPTIONAL HOVER EFFECT ===== */
.damage-frame:hover {
  box-shadow:
    0 0 15px rgba(255, 200, 100, 0.6),
    inset 0 0 10px rgba(255, 200, 100, 0.2);
}

/* BONUS */
.bonus-box ul {
  padding-left: 15px;
}

/* ===== EQUIPMENT ===== */
.equip-section {
  display: flex;
  justify-content: space-around;

  background: rgba(20, 15, 10, 0.9);
  border: 2px solid #7c5a2b;
  border-radius: 12px;

  padding: 15px;
}

.equip-slot {
  text-align: center;
}

.equip-slot img {
  width: 60px;
  height: 60px;
  object-fit: contain;

  filter: drop-shadow(0 0 5px rgba(255, 200, 100, 0.5));
}

/* ===== DAMAGE ===== */
.damage-row {
  display: flex;
  gap: 10px;
  justify-content: space-between;
}

.damage-card {
  position: relative;
  width: 60px;
  height: 60px;
}

.damage-card img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.damage-card span {
  position: absolute;
  bottom: 2px;
  left: 50%;
  transform: translateX(-50%);

  font-size: 24px;
  font-weight: bold;
  color: #fff;

  text-shadow: 0 0 5px #000;
}

.dmg-value {
  position: absolute;
  inset: 0; /* 🔥 ทำให้กินเต็มกล่อง */

  display: flex;
  justify-content: center;
  align-items: center;

  font-size: 18px;
  font-weight: bold;
  color: #fff;

  text-shadow: 0 0 6px #000;
}

/* ===== ARMOR ===== */
.armor-card {
  position: relative;
  width: 70px;
  height: 70px;
  /* margin: auto; */
}

.armor-card img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.armor-card span {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);

  font-size: 40px;
  font-weight: bold;
  color: rgb(255, 255, 255);

  text-shadow: 0 0 8px #000;
}

/* 🔥 ELEMENT ICON */
.element-card {
  position: relative;
}

/* พื้นหลัง armor */
.armor-base {
  width: 100%;
  height: 100%;
}

/* 🔥 ไอคอนธาตุ */
.element-icon {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);

  width: 60px !important; /* 👈 ปรับตรงนี้ */
  height: 60px !important;

  object-fit: contain;
  z-index: 2;
}

/* 🔥 ค่าป้องกัน */
.element-value {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%); /* 👈 สำคัญมาก */

  font-size: 14px;
  font-weight: bold;
  color: #fff;

  text-shadow: 0 0 6px black;
  z-index: 3;
}
</style>
