<script setup>
import { ref, onMounted, computed } from 'vue'

import { getHunterById, saveHunter } from '@/services/hunterStorage'
import { getHunterClassById } from '@/services/hunterService'
import { getArmors, getWeapons } from '@/services/equipService'
import elementalData from '@/assets/files/elemental.json'
import bonusAbilityData from '@/assets/files/bonus_ability.json'

const hunter    = ref(null)
const rawHunter = ref(null)

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

const getAbilityById   = (id) => bonusAbilityData.find(a => a.ability_id === id) ?? null
const getElementalById = (id) => elementalData.find(e => e.elemental_id === id) ?? null

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

const getImg = (path) => `${import.meta.env.BASE_URL}${path}`

const loadState = async () => {
  const HunterID = parseInt(localStorage.getItem('hunterId'))
  const Hunter = getHunterById(HunterID)
  rawHunter.value = Hunter
  const Weapon = Hunter.equipments.weapons.find((i) => i.is_equip)
  const Armors = {
    helm:    Hunter.equipments.armors.helm.find((i) => i.is_equip),
    mail:    Hunter.equipments.armors.mail.find((i) => i.is_equip),
    greaves: Hunter.equipments.armors.greaves.find((i) => i.is_equip),
  }
  const [helm, mail, greaves, weapon] = await Promise.all([
    getArmors(Armors.helm.equip_set_id, Armors.helm.equip_id),
    getArmors(Armors.mail.equip_set_id, Armors.mail.equip_id),
    getArmors(Armors.greaves.equip_set_id, Armors.greaves.equip_id),
    getWeapons(Hunter.hunter_class_id, Weapon.weapon_type_id, Weapon.item_id),
  ])
  hunter.value = {
    name: Hunter.hunter_name,
    class: await getHunterClassById(Hunter.hunter_class_id),
    palico: Hunter.palico_name,
    campaign_day: Hunter.campaign_day,
    weapon,
    armors: { helm, mail, greaves },
    armor_set_ability:
      helm.equip_set_id === mail.equip_set_id && helm.equip_set_id === greaves.equip_set_id
        ? helm.set_ability_bonus : 0,
  }
}

onMounted(loadState)

// ─── Swap Equipment ───────────────────────────────────────────────────────────
const equipType    = ref('weapon')
const showSwapModal = ref(false)
const modalItems   = ref([])
const loadingModal = ref(false)

const equippedOrNull = (arr) => Array.isArray(arr) ? arr.find((i) => i?.is_equip) || null : null

const slotTitle = (key) =>
  ({ weapon: 'Weapon', helm: 'Helm', mail: 'Mail', greaves: 'Greaves' }[key] ?? '')

const equipArrayByType = (type) => {
  if (!rawHunter.value?.equipments) return []
  if (type === 'weapon') return rawHunter.value.equipments.weapons || []
  return rawHunter.value.equipments.armors?.[type] || []
}

const openSwapModal = async (type) => {
  equipType.value  = type
  showSwapModal.value = true
  modalItems.value = []
  loadingModal.value = true
  try {
    const rawItems = equipArrayByType(type)
    const results = await Promise.all(
      rawItems.map(async (it) => {
        if (!it) return null
        if (type === 'weapon') {
          const d = await getWeapons(rawHunter.value.hunter_class_id, it.weapon_type_id, it.item_id)
          return { id: `${it.weapon_type_id}-${it.item_id}`, thumbnail: d?.thumbnail ?? null, label: d?.item || d?.weapon_type || `Weapon ${it.item_id}`, data: d, raw: it }
        }
        const d = await getArmors(it.equip_set_id, it.equip_id)
        return { id: `${it.equip_set_id}-${it.equip_id}`, thumbnail: d?.thumbnail ?? null, label: d?.equip || d?.set_name || `Armor ${it.equip_id}`, data: d, raw: it }
      })
    )
    modalItems.value = results.filter(Boolean)
  } finally {
    loadingModal.value = false
  }
}

const setEquip = async (item) => {
  const type = equipType.value
  const rawItems = equipArrayByType(type)
  rawItems.forEach((it) => {
    if (!it) return
    const same = type === 'weapon'
      ? it.weapon_type_id === item.raw.weapon_type_id && it.item_id === item.raw.item_id
      : it.equip_set_id === item.raw.equip_set_id && it.equip_id === item.raw.equip_id
    it.is_equip = !!same
  })
  if (type === 'weapon') rawHunter.value.equipments.weapons = [...rawItems]
  else rawHunter.value.equipments.armors[type] = [...rawItems]
  saveHunter(rawHunter.value)
  showSwapModal.value = false
  await loadState()
}
</script>

<template>
  <div class="state-page">
  <template v-if="hunter">

    <!-- ══════════ DOSSIER HEADER ══════════ -->
    <div class="dossier-header">
      <div class="dh-ornament">✦</div>
      <div class="dh-title-block">
        <h2 class="dh-title">{{ hunter.name }}</h2>
        <p class="dh-class">{{ hunter.class.hunter_class }}</p>
      </div>
      <div class="dh-ornament">✦</div>
    </div>

    <div class="state-grid">

      <!-- ══════════ LEFT PANEL — PROFILE ══════════ -->
      <div class="panel">
        <div class="panel-header">
          <span class="ph-label">Hunter Profile</span>
        </div>

        <div class="profile-center">
          <div class="hunter-portrait">
            <img :src="getImg(hunter.class.thumbnail)" class="class-img" />
          </div>

          <div class="profile-tags">
            <div class="ptag">
              <span class="ptag-l">Palico</span>
              <span class="ptag-v">{{ hunter.palico }}</span>
            </div>
            <div class="ptag">
              <span class="ptag-l">Campaign Day</span>
              <span class="ptag-v day-badge">Day {{ hunter.campaign_day }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- ══════════ CENTER PANEL — EQUIPMENT ══════════ -->
      <div class="panel">
        <div class="panel-header">
          <span class="ph-label">Equipment</span>
        </div>

        <div class="equip-grid">
          <!-- WEAPON -->
          <div class="equip-card" @click="openSwapModal('weapon')">
            <span class="equip-slot-badge">Weapon</span>
            <div class="equip-imgs">
              <img :src="getImg(hunter.weapon.set_thumbnail)" class="equip-set-img" />
              <img :src="getImg(hunter.weapon.thumbnail)" class="equip-item-img" />
            </div>
            <p class="equip-name">{{ hunter.weapon.item }}</p>
            <div class="equip-details">
              <div v-for="(cnt, key) in hunter.weapon.damage_cards" :key="key" v-show="cnt > 0" class="mini-dmg-wrap">
                <div class="mini-dmg-frame">
                  <div class="mini-dmg-card" :style="{ backgroundImage: `url(${getImg('assets/img/take_damage.png')})` }">
                    <span class="mini-dmg-val">{{ key.replace('damage_', '') }}</span>
                  </div>
                  <span class="mini-dmg-count">×{{ cnt }}</span>
                </div>
              </div>
              <div v-if="hunter.weapon.defense > 0"
                class="mini-armor-card"
                :style="{ backgroundImage: `url(${getImg('assets/img/bonus_armor.png')})` }">
                <span>{{ hunter.weapon.defense }}</span>
              </div>
            </div>
          </div>

          <!-- HELM -->
          <div class="equip-card" @click="openSwapModal('helm')">
            <span class="equip-slot-badge">Helm</span>
            <div class="equip-imgs">
              <img :src="getImg(hunter.armors.helm.set_thumbnail)" class="equip-set-img" />
              <img :src="getImg(hunter.armors.helm.thumbnail)" class="equip-item-img" />
            </div>
            <p class="equip-name">{{ hunter.armors.helm.equip }}</p>
            <div class="equip-details">
              <div v-if="hunter.armors.helm.physical_armor > 0"
                class="mini-armor-card"
                :style="{ backgroundImage: `url(${getImg('assets/img/bonus_armor.png')})` }">
                <span>{{ hunter.armors.helm.physical_armor }}</span>
              </div>
              <div v-if="hunter.armors.helm.elemental_armor?.elemental_id > 0"
                class="mini-armor-card"
                :style="{ backgroundImage: `url(${getImg(getElementalById(hunter.armors.helm.elemental_armor.elemental_id)?.thumbnail)}), url(${getImg('assets/img/bonus_armor.png')})` }">
                <span class="mini-elem-val">{{ hunter.armors.helm.elemental_armor.protection }}</span>
              </div>
              <span v-if="hunter.armors.helm.ability_id > 0" class="equip-ability-chip">{{ getAbilityById(hunter.armors.helm.ability_id)?.ability_name }}</span>
            </div>
          </div>

          <!-- MAIL -->
          <div class="equip-card" @click="openSwapModal('mail')">
            <span class="equip-slot-badge">Mail</span>
            <div class="equip-imgs">
              <img :src="getImg(hunter.armors.mail.set_thumbnail)" class="equip-set-img" />
              <img :src="getImg(hunter.armors.mail.thumbnail)" class="equip-item-img" />
            </div>
            <p class="equip-name">{{ hunter.armors.mail.equip }}</p>
            <div class="equip-details">
              <div v-if="hunter.armors.mail.physical_armor > 0"
                class="mini-armor-card"
                :style="{ backgroundImage: `url(${getImg('assets/img/bonus_armor.png')})` }">
                <span>{{ hunter.armors.mail.physical_armor }}</span>
              </div>
              <div v-if="hunter.armors.mail.elemental_armor?.elemental_id > 0"
                class="mini-armor-card"
                :style="{ backgroundImage: `url(${getImg(getElementalById(hunter.armors.mail.elemental_armor.elemental_id)?.thumbnail)}), url(${getImg('assets/img/bonus_armor.png')})` }">
                <span class="mini-elem-val">{{ hunter.armors.mail.elemental_armor.protection }}</span>
              </div>
              <span v-if="hunter.armors.mail.ability_id > 0" class="equip-ability-chip">{{ getAbilityById(hunter.armors.mail.ability_id)?.ability_name }}</span>
            </div>
          </div>

          <!-- GREAVES -->
          <div class="equip-card" @click="openSwapModal('greaves')">
            <span class="equip-slot-badge">Greaves</span>
            <div class="equip-imgs">
              <img :src="getImg(hunter.armors.greaves.set_thumbnail)" class="equip-set-img" />
              <img :src="getImg(hunter.armors.greaves.thumbnail)" class="equip-item-img" />
            </div>
            <p class="equip-name">{{ hunter.armors.greaves.equip }}</p>
            <div class="equip-details">
              <div v-if="hunter.armors.greaves.physical_armor > 0"
                class="mini-armor-card"
                :style="{ backgroundImage: `url(${getImg('assets/img/bonus_armor.png')})` }">
                <span>{{ hunter.armors.greaves.physical_armor }}</span>
              </div>
              <div v-if="hunter.armors.greaves.elemental_armor?.elemental_id > 0"
                class="mini-armor-card"
                :style="{ backgroundImage: `url(${getImg(getElementalById(hunter.armors.greaves.elemental_armor.elemental_id)?.thumbnail)}), url(${getImg('assets/img/bonus_armor.png')})` }">
                <span class="mini-elem-val">{{ hunter.armors.greaves.elemental_armor.protection }}</span>
              </div>
              <span v-if="hunter.armors.greaves.ability_id > 0" class="equip-ability-chip">{{ getAbilityById(hunter.armors.greaves.ability_id)?.ability_name }}</span>
            </div>
          </div>
        </div>

        <!-- BONUS ABILITY -->
        <div class="panel-section-header">Bonus Abilities</div>

        <div v-if="bonusAbilities.length > 0" class="ability-list">
          <div v-for="ab in bonusAbilities" :key="ab.ability_id" class="ability-card">
            <p class="ability-name">{{ ab.ability_name }}</p>
            <p class="ability-desc">{{ ab.ability }}</p>
          </div>
        </div>
        <p v-else class="no-ability">No abilities active</p>
      </div>

      <!-- ══════════ RIGHT PANEL — STATS ══════════ -->
      <div class="panel">
        <div class="panel-header">
          <span class="ph-label">Combat Stats</span>
        </div>

        <!-- DAMAGE CARDS -->
        <div class="panel-section-header">Damage Cards</div>
        <div class="damage-row">
          <div v-for="(val, key) in hunter.weapon.damage_cards" :key="key" class="damage-wrapper">
            <div class="damage-frame">
              <div class="damage-card">
                <img :src="getImg('assets/img/take_damage.png')" />
                <span class="dmg-value">{{ key.split('_')[1] }}</span>
              </div>
              <p class="dmg-count">x{{ val }}</p>
            </div>
          </div>
        </div>

        <!-- ARMOR STATS -->
        <div class="panel-section-header">Defense</div>
        <div class="armor-stats-row">
          <div class="armor-card element-card">
            <img :src="getImg('assets/img/bonus_armor.png')" />
            <span>{{ totalArmor }}</span>
          </div>

          <div v-for="el in elementArmor" :key="el.elemental_id" class="armor-card element-card">
            <img :src="getImg('assets/img/bonus_armor.png')" class="armor-base" />
            <img :src="getImg(el.thumbnail)" class="element-icon" />
            <span class="element-value">{{ el.value }}</span>
          </div>
        </div>

        <!-- DECK MODS -->
        <div class="panel-section-header">Deck Modification</div>
        <div class="deck-mod-row">
          <div class="deck-chip remove-chip">
            <span class="dc-label">Remove</span>
            <span class="dc-val">{{ hunter.weapon.remove || '—' }}</span>
          </div>
          <div class="deck-chip add-chip">
            <span class="dc-label">Add</span>
            <span class="dc-val">{{ hunter.weapon.add || '—' }}</span>
          </div>
        </div>
      </div>

    </div>
  </template>

  <!-- ══════════ SWAP MODAL ══════════ -->
  <teleport to="body">
    <div v-if="showSwapModal" class="swap-overlay" @click.self="showSwapModal = false">
      <div class="swap-parchment">
        <div class="swap-modal-top">
          <div class="swap-title-row">
            <span class="swap-ornament">◆</span>
            <h3 class="swap-title">Choose {{ slotTitle(equipType) }}</h3>
            <span class="swap-ornament">◆</span>
          </div>
          <button class="btn-swap-close" @click="showSwapModal = false">✕</button>
        </div>
        <div class="swap-modal-body">
          <div v-if="loadingModal" class="swap-loading">
            <span>·</span><span>·</span><span>·</span>
          </div>
          <div v-else class="swap-modal-grid">
            <div
              v-for="it in modalItems"
              :key="it.id"
              class="swap-modal-card"
              @click="setEquip(it)"
            >
              <div class="smc-img-wrap">
                <img v-if="it.thumbnail" :src="getImg(it.thumbnail)" class="smc-img" />
                <div v-else class="smc-empty">?</div>
              </div>
              <p class="smc-label">{{ it.label }}</p>

              <!-- Weapon details -->
              <template v-if="equipType === 'weapon' && it.data">
                <div class="smc-details">
                  <div v-for="(cnt, key) in it.data.damage_cards" :key="key" v-show="cnt > 0" class="smc-dmg-card"
                    :style="{ backgroundImage: `url(${getImg('assets/img/take_damage.png')})` }">
                    <span>{{ key.replace('damage_', '') }}</span>
                  </div>
                  <div v-if="it.data.defense > 0" class="smc-armor-card"
                    :style="{ backgroundImage: `url(${getImg('assets/img/bonus_armor.png')})` }">
                    <span>{{ it.data.defense }}</span>
                  </div>
                </div>
                <div v-if="it.data.remove || it.data.add" class="smc-deck-row">
                  <span v-if="it.data.remove" class="smc-deck-chip smc-remove">− {{ it.data.remove }}</span>
                  <span v-if="it.data.add" class="smc-deck-chip smc-add">+ {{ it.data.add }}</span>
                </div>
              </template>

              <!-- Armor details -->
              <template v-if="equipType !== 'weapon' && it.data">
                <div class="smc-details">
                  <div v-if="it.data.physical_armor > 0" class="smc-armor-card"
                    :style="{ backgroundImage: `url(${getImg('assets/img/bonus_armor.png')})` }">
                    <span>{{ it.data.physical_armor }}</span>
                  </div>
                  <div v-if="it.data.elemental_armor?.elemental_id > 0" class="smc-armor-card"
                    :style="{ backgroundImage: `url(${getImg(getElementalById(it.data.elemental_armor.elemental_id)?.thumbnail)}), url(${getImg('assets/img/bonus_armor.png')})` }">
                    <span>{{ it.data.elemental_armor.protection }}</span>
                  </div>
                </div>
                <span v-if="it.data.ability_id > 0" class="smc-ability-chip">
                  {{ getAbilityById(it.data.ability_id)?.ability_name }}
                </span>
              </template>
            </div>
            <div v-if="!modalItems.length" class="swap-no-items">No items available</div>
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
.state-page {
  display: flex;
  flex-direction: column;
  gap: 18px;
  color: #f0ddb0;
  font-family: 'Georgia', 'Times New Roman', serif;
}

/* ══════════════════════════════════════════
   DOSSIER HEADER
══════════════════════════════════════════ */
.dossier-header {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 12px 0 4px;
}

.dh-ornament {
  color: #7c5a2b;
  font-size: 14px;
  opacity: 0.7;
}

.dh-title-block {
  text-align: center;
}

.dh-title {
  margin: 0;
  font-size: 22px;
  color: #ffd27a;
  letter-spacing: 2px;
  text-shadow: 0 0 15px rgba(255, 200, 80, 0.4), 0 2px 4px rgba(0,0,0,0.8);
}

.dh-class {
  margin: 2px 0 0;
  font-size: 11px;
  color: #a88040;
  letter-spacing: 4px;
  text-transform: uppercase;
}

/* ══════════════════════════════════════════
   MAIN GRID
══════════════════════════════════════════ */
.state-grid {
  display: grid;
  grid-template-columns: 1fr 2fr 1fr;
  gap: 14px;
  align-items: start;
}

/* ══════════════════════════════════════════
   PANEL
══════════════════════════════════════════ */
.panel {
  padding: 14px;
  border-radius: 12px;
  background: linear-gradient(160deg, rgba(28, 20, 10, 0.9), rgba(16, 12, 6, 0.95));
  border: 1px solid #7c5a2b;
  box-shadow:
    0 0 10px rgba(0,0,0,0.7),
    inset 0 0 12px rgba(255, 200, 100, 0.05);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* PANEL HEADER */
.panel-header {
  border-bottom: 1px solid rgba(200, 155, 60, 0.25);
  padding-bottom: 8px;
  margin-bottom: 2px;
}

.ph-label {
  font-size: 10px;
  letter-spacing: 3px;
  text-transform: uppercase;
  color: #c89b3c;
  text-shadow: 0 0 8px rgba(200, 155, 60, 0.3);
}

/* SECTION HEADER */
.panel-section-header {
  font-size: 10px;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: #7c5a2b;
  border-bottom: 1px solid rgba(124, 90, 43, 0.25);
  padding-bottom: 4px;
  margin-top: 2px;
}

/* ══════════════════════════════════════════
   PROFILE (LEFT PANEL)
══════════════════════════════════════════ */
.profile-center {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
}

.hunter-portrait {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(60, 40, 15, 0.5) 0%, transparent 70%);
}

.class-img {
  width: 90px;
  height: 90px;
  object-fit: contain;
  filter: drop-shadow(0 0 10px rgba(255, 200, 100, 0.4));
}

.profile-tags {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ptag {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  background: rgba(10, 8, 4, 0.5);
  border: 1px solid rgba(124, 90, 43, 0.3);
}

.ptag-l {
  font-size: 10px;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: #7c5a2b;
}

.ptag-v {
  font-size: 12px;
  color: #f0ddb0;
  text-align: right;
}

.day-badge {
  color: #ffd27a;
  font-weight: bold;
  text-shadow: 0 0 6px rgba(255, 200, 80, 0.4);
}

/* ══════════════════════════════════════════
   EQUIPMENT (CENTER PANEL)
══════════════════════════════════════════ */
.equip-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.equip-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  padding: 10px 8px;
  border-radius: 10px;
  background: rgba(10, 8, 4, 0.6);
  border: 1px solid rgba(124, 90, 43, 0.4);
  position: relative;
  transition: 0.2s;
}

.equip-card {
  cursor: pointer;
}

.equip-card:hover {
  border-color: #c89b3c;
  box-shadow: inset 0 0 10px rgba(255, 200, 100, 0.1);
}

.equip-slot-badge {
  font-size: 8px;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: #7c5a2b;
}

.equip-imgs {
  display: flex;
  gap: 4px;
  align-items: center;
}

.equip-set-img {
  width: 30px;
  height: 30px;
  object-fit: contain;
  opacity: 0.7;
  filter: drop-shadow(0 0 3px rgba(255, 200, 100, 0.3));
}

.equip-item-img {
  width: 44px;
  height: 44px;
  object-fit: contain;
  filter: drop-shadow(0 0 5px rgba(255, 200, 100, 0.4));
}

.equip-name {
  margin: 0;
  font-size: 10px;
  color: #c89b3c;
  text-align: center;
  line-height: 1.3;
}

.equip-details {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  justify-content: center;
  align-items: flex-end;
  margin-top: 4px;
}

/* ── Mini Damage Card (ย่อจาก .damage-frame) ── */
.mini-dmg-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.mini-dmg-frame {
  padding: 5px 4px 2px;
  display: flex;
  flex-direction: column;
  align-items: center;
  border-radius: 8px;
  background: linear-gradient(to bottom, rgba(60, 45, 25, 0.9), rgba(20, 15, 10, 0.9));
  border: 1px solid #7c5a2b;
  box-shadow: inset 0 0 6px rgba(255, 200, 100, 0.1);
}

.mini-dmg-card {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
  display: flex;
  align-items: center;
  justify-content: center;
}

.mini-dmg-val {
  font-size: 12px;
  font-weight: bold;
  color: #fff;
  text-shadow: 0 0 4px #000;
  line-height: 1;
}

.mini-dmg-count {
  font-size: 11px;
  color: #c89b3c;
  font-weight: bold;
  margin-top: 1px;
}

/* ── Mini Armor Card (ย่อจาก .armor-card) ── */
.mini-armor-card {
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  background-size: contain, contain;
  background-repeat: no-repeat, no-repeat;
  background-position: center, center;
  display: flex;
  align-items: center;
  justify-content: center;
}

.mini-armor-card > span,
.mini-elem-val {
  font-size: 13px;
  font-weight: bold;
  color: #fff;
  text-shadow: 0 0 5px #000;
  line-height: 1;
}

/* ── Ability chip ── */
.equip-ability-chip {
  font-size: 9px;
  color: #ffd27a;
  background: rgba(60, 40, 0, 0.6);
  border: 1px solid rgba(200, 155, 60, 0.35);
  border-radius: 4px;
  padding: 2px 5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
  align-self: center;
}

/* ABILITY LIST */
.ability-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ability-card {
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(10, 8, 4, 0.6);
  border: 1px solid rgba(124, 90, 43, 0.35);
  border-left: 2px solid #c89b3c;
}

.ability-name {
  margin: 0;
  font-size: 12px;
  color: #ffd27a;
  font-weight: bold;
}

.ability-desc {
  margin: 3px 0 0;
  font-size: 11px;
  color: #a88040;
  line-height: 1.4;
}

.no-ability {
  text-align: center;
  font-size: 12px;
  color: #5a3d1f;
  font-style: italic;
}

/* ══════════════════════════════════════════
   STATS (RIGHT PANEL)
══════════════════════════════════════════ */

/* DAMAGE */
.damage-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
}

.damage-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.damage-frame {
  padding: 10px 6px 4px;
  display: flex;
  flex-direction: column;
  align-items: center;
  border-radius: 12px;
  background: linear-gradient(to bottom, rgba(60, 45, 25, 0.9), rgba(20, 15, 10, 0.9));
  border: 1px solid #7c5a2b;
  box-shadow: inset 0 0 8px rgba(255, 200, 100, 0.1);
  transition: 0.2s;
}

.damage-frame:hover {
  box-shadow: 0 0 10px rgba(255, 200, 100, 0.3), inset 0 0 8px rgba(255, 200, 100, 0.1);
}

.damage-card {
  position: relative;
  width: 54px;
  height: 54px;
}

.damage-card img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.dmg-value {
  position: absolute;
  inset: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 17px;
  font-weight: bold;
  color: #fff;
  text-shadow: 0 0 6px #000;
}

.dmg-count {
  margin-top: 2px;
  font-size: 13px;
  color: #c89b3c;
  font-weight: bold;
}

/* ARMOR STATS */
.armor-stats-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
  align-items: center;
}

.armor-card {
  position: relative;
  width: 64px;
  height: 64px;
}

.armor-card img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.armor-card > span {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 18px;
  font-weight: bold;
  color: #fff;
  text-shadow: 0 0 8px #000;
}

.element-card { position: relative; }

.armor-base {
  width: 100%;
  height: 100%;
}

.element-icon {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 52px !important;
  height: 52px !important;
  object-fit: contain;
  z-index: 2;
}

.element-value {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 13px;
  font-weight: bold;
  color: #fff;
  text-shadow: 0 0 6px black;
  z-index: 3;
}

/* DECK MODS */
.deck-mod-row {
  display: flex;
  gap: 8px;
}

.deck-chip {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(10, 8, 4, 0.5);
  border: 1px solid rgba(124, 90, 43, 0.3);
  text-align: center;
}

.dc-label {
  font-size: 8px;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: #7c5a2b;
}

.dc-val {
  font-size: 12px;
  color: #f0ddb0;
}

.remove-chip { border-left: 2px solid #8b1a1a; }
.add-chip { border-left: 2px solid #1a6b1a; }

/* ══════════════════════════════════════════
   RESPONSIVE — iPad (≤768px)
══════════════════════════════════════════ */
@media (max-width: 768px) {
  .state-grid {
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  .panel:last-child {
    grid-column: 1 / -1;
  }

  .dh-title { font-size: 18px; }
  .class-img { width: 72px; height: 72px; }
}

/* ══════════════════════════════════════════
   RESPONSIVE — Phone (≤480px)
══════════════════════════════════════════ */
@media (max-width: 480px) {
  .state-grid {
    grid-template-columns: 1fr;
    gap: 10px;
  }

  .panel:last-child {
    grid-column: auto;
  }

  .dossier-header { gap: 10px; }
  .dh-title { font-size: 16px; letter-spacing: 1px; }

  .equip-grid { grid-template-columns: repeat(2, 1fr); gap: 6px; }

  .damage-row { justify-content: flex-start; }
  .armor-stats-row { justify-content: flex-start; }

  .armor-card { width: 56px; height: 56px; }
}

/* ══════════════════════════════════════════
   LEGACY (kept for existing classes)
══════════════════════════════════════════ */
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

/* ── Swap Modal ── */
.swap-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.72);
  z-index: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.swap-parchment {
  background: linear-gradient(160deg, rgba(22, 16, 8, 0.98), rgba(10, 8, 4, 0.99));
  border: 1px solid rgba(200, 155, 60, 0.4);
  border-radius: 14px;
  width: 420px;
  max-width: 100%;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.9);
  overflow: hidden;
}

.swap-modal-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid rgba(200, 155, 60, 0.15);
  flex-shrink: 0;
}

.swap-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.swap-ornament { font-size: 10px; color: #7c5a2b; }

.swap-title {
  margin: 0;
  font-size: 14px;
  color: #ffd27a;
  letter-spacing: 3px;
  text-transform: uppercase;
}

.btn-swap-close {
  background: none;
  border: none;
  color: #5a3d1f;
  font-size: 16px;
  cursor: pointer;
  padding: 2px 6px;
  transition: color 0.15s;
}
.btn-swap-close:hover { color: #cc4444; }

.swap-modal-body {
  overflow-y: auto;
  padding: 14px;
}

.swap-loading {
  display: flex;
  justify-content: center;
  gap: 6px;
  padding: 24px;
  color: #7c5a2b;
  font-size: 24px;
}

.swap-modal-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.swap-modal-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 10px 6px;
  border-radius: 8px;
  border: 1px solid rgba(124, 90, 43, 0.3);
  background: rgba(20, 14, 6, 0.8);
  cursor: pointer;
  transition: all 0.15s;
  text-align: center;
}
.swap-modal-card:hover {
  border-color: #c89b3c;
  background: rgba(40, 28, 12, 0.9);
  box-shadow: 0 0 8px rgba(200, 155, 60, 0.2);
}

.smc-img-wrap {
  width: 56px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.smc-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  border-radius: 6px;
}

.smc-empty {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  color: #5a3d1f;
  border: 1px dashed #3a2810;
  border-radius: 6px;
}

.smc-label {
  margin: 0;
  font-size: 11px;
  color: #d4b87a;
  line-height: 1.3;
}

.smc-details {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  justify-content: center;
  margin-top: 4px;
}

.smc-dmg-card {
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
  display: flex;
  align-items: center;
  justify-content: center;
}

.smc-dmg-card span {
  font-size: 11px;
  font-weight: bold;
  color: #fff;
  text-shadow: 0 0 4px #000;
  line-height: 1;
}

.smc-armor-card {
  width: 26px;
  height: 26px;
  flex-shrink: 0;
  background-size: contain, contain;
  background-repeat: no-repeat, no-repeat;
  background-position: center, center;
  display: flex;
  align-items: center;
  justify-content: center;
}

.smc-armor-card span {
  font-size: 12px;
  font-weight: bold;
  color: #fff;
  text-shadow: 0 0 5px #000;
  line-height: 1;
}

.smc-deck-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 4px;
  width: 100%;
}

.smc-deck-chip {
  font-size: 9px;
  padding: 2px 5px;
  border-radius: 3px;
  line-height: 1.4;
  white-space: pre-line;
  text-align: left;
}

.smc-remove {
  color: #ff8888;
  background: rgba(140, 30, 30, 0.25);
  border: 1px solid rgba(200, 60, 60, 0.3);
}

.smc-add {
  color: #88dd88;
  background: rgba(30, 100, 30, 0.25);
  border: 1px solid rgba(60, 180, 60, 0.3);
}

.smc-ability-chip {
  display: block;
  margin-top: 4px;
  font-size: 9px;
  color: #ffd27a;
  background: rgba(60, 40, 0, 0.6);
  border: 1px solid rgba(200, 155, 60, 0.35);
  border-radius: 4px;
  padding: 2px 5px;
  text-align: center;
  width: 100%;
  box-sizing: border-box;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.swap-no-items {
  grid-column: 1 / -1;
  text-align: center;
  padding: 24px;
  color: #5a3d1f;
  font-style: italic;
  font-size: 13px;
}
</style>
