<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { requestTour, cancelTourRequest } from '@/composables/useTour'

import { getHunterById, saveHunter } from '@/services/hunterStorage'
import { rankOf } from '@/services/hunterRank'
import { getHunterClassById } from '@/services/hunterService'
import { getArmors, getWeapons } from '@/services/equipService'
import { previewClassSwitch, switchHunterClass, weaponCountOfClass } from '@/services/classSwitch'
import { cardLines } from '@/services/cardLines'
import { loadHunter } from '@/stores/hunter'
import { questInProgress } from '@/stores/questSession'
import { useRoomStore } from '@/stores/room'
import elementalData from '@/assets/files/elemental.json'
import bonusAbilityData from '@/assets/files/bonus_ability.json'
import classHunterData from '@/assets/files/class_hunter.json'
import weaponsData from '@/assets/files/weapons.json'
import armorsData from '@/assets/files/armors.json'
import RuleText from './RuleText.vue'

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

// ── ของที่หน้านี้ต้องวาดซ้ำ ๆ — รวมเป็นรายการเดียวแทนการก๊อปบล็อกละช่อง ──
// การ์ดดาเมจของอาวุธ: โชว์ครบสี่แบบเสมอ ช่องที่ไม่มีการ์ดให้จางไว้
// (เลข 0 คือข้อมูล ไม่ใช่ช่องว่าง — ต้องรู้ว่าอาวุธนี้ไม่มีการ์ดหน้านั้นเลย)
const damageCards = computed(() =>
  Object.entries(hunter.value?.weapon?.damage_cards ?? {})
    .map(([key, count]) => ({ face: key.replace('damage_', ''), count }))
    // เอาเฉพาะหน้าที่อาวุธมีการ์ดจริง — ช่องเปล่าไม่ได้บอกอะไรตอนหยิบการ์ดมาตั้งกอง
    .filter((d) => d.count > 0),
)

// สี่ช่องอุปกรณ์ในรูปแบบเดียวกัน — ค่าที่ชิ้นนั้นให้จะได้อ่านตรงช่องเลย ไม่ต้องไปไล่หาในแผงรวม
const gearSlots = computed(() => {
  const h = hunter.value
  if (!h) return []
  const armorSlot = (key, label) => {
    const a = h.armors[key]
    const el = a.elemental_armor?.elemental_id > 0 ? a.elemental_armor : null
    return {
      key,
      label,
      name: a.equip,
      setImg: a.set_thumbnail,
      itemImg: a.thumbnail,
      dmg: [],
      armor: a.physical_armor || 0,
      element: el ? { value: el.protection, thumbnail: getElementalById(el.elemental_id)?.thumbnail } : null,
      ability: a.ability_id > 0 ? (getAbilityById(a.ability_id)?.ability_name ?? null) : null,
    }
  }
  const w = h.weapon
  return [
    {
      key: 'weapon',
      label: 'อาวุธ',
      name: w.item,
      setImg: w.set_thumbnail,
      itemImg: w.thumbnail,
      dmg: damageCards.value.filter((d) => d.count > 0),
      armor: w.defense || 0,
      element: null,
      ability: null,
    },
    armorSlot('helm', 'หมวก'),
    armorSlot('mail', 'เสื้อเกราะ'),
    armorSlot('greaves', 'สนับขา'),
  ]
})

// ความสามารถแต่ละอันมาจากชิ้นไหน — เดิมขึ้นแต่ชื่อ ถอดชิ้นไหนถึงจะหายก็ไม่มีทางรู้
const SLOT_LABEL = { helm: 'หมวก', mail: 'เสื้อเกราะ', greaves: 'สนับขา' }
const abilitySource = (abilityId) => {
  const h = hunter.value
  if (!h) return ''
  const from = Object.entries(SLOT_LABEL)
    .filter(([slot]) => h.armors[slot]?.ability_id === abilityId)
    .map(([, label]) => label)
  if (h.armor_set_ability === abilityId) from.push('ครบเซ็ต')
  return from.join(' · ')
}

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
    hunter_rank: rankOf(Hunter),
    weapon,
    armors: { helm, mail, greaves },
    armor_set_ability:
      helm.equip_set_id === mail.equip_set_id && helm.equip_set_id === greaves.equip_set_id
        ? helm.set_ability_bonus : 0,
  }
}

onMounted(loadState)
// ทัวร์ของหน้านี้ — ขึ้นครั้งแรกที่เปิดแท็บ State (ข้อความอยู่ใน src/tours/tours.js)
onMounted(() => requestTour('state'))
onUnmounted(() => cancelTourRequest('state'))
// ทัวร์สั้นของปุ่มเปลี่ยนสายอาวุธ — แยกจากทัวร์หลักของหน้า คนที่ดูทัวร์หน้านี้ไปแล้วจะได้เห็นด้วย
onMounted(() => requestTour('classSwitch'))
onUnmounted(() => cancelTourRequest('classSwitch'))

// ─── Swap Equipment ───────────────────────────────────────────────────────────
const equipType    = ref('weapon')
const showSwapModal = ref(false)
const modalItems   = ref([])
const loadingModal = ref(false)

const slotTitle = (key) =>
  ({ weapon: 'อาวุธ', helm: 'หมวก', mail: 'เสื้อเกราะ', greaves: 'สนับขา' }[key] ?? '')

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
          return { id: `${it.weapon_type_id}-${it.item_id}`, thumbnail: d?.thumbnail ?? null, label: d?.item || d?.weapon_type || `Weapon ${it.item_id}`, data: d, raw: it, worn: !!it.is_equip }
        }
        const d = await getArmors(it.equip_set_id, it.equip_id)
        return { id: `${it.equip_set_id}-${it.equip_id}`, thumbnail: d?.thumbnail ?? null, label: d?.equip || d?.set_name || `Armor ${it.equip_id}`, data: d, raw: it, worn: !!it.is_equip }
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

// ─── เปลี่ยนสายอาวุธ (1 ID เล่นได้หลายคลาส) ─────────────────────────────────
// อาวุธผูกกับคลาส เกราะใช้ร่วมกัน ยกเว้น Starting Armor ที่เปลี่ยนตามคลาส — กติกาทั้งหมดอยู่ใน classSwitch.js
const room = useRoomStore()
const CLASS_DATA = { classes: classHunterData, weapons: weaponsData }

const showClassModal = ref(false)
const classPick = ref(null) // คลาสที่กดเลือกไว้ รอยืนยัน

const switchBlockedReason = computed(() => {
  if (questInProgress.value) return 'กำลังอยู่ในเควส — กลับมาเปลี่ยนหลังจบการล่า'
  if (room.inRoom) return 'อยู่ในห้อง Co-op — ออกจากห้องก่อนถึงจะเปลี่ยนได้ (คลาสในตี้ห้ามซ้ำกัน)'
  return ''
})

const classList = computed(() =>
  classHunterData.map((c) => ({
    ...c,
    current: c.hunter_class_id === rawHunter.value?.hunter_class_id,
    weaponCount: weaponCountOfClass(rawHunter.value, c.hunter_class_id),
  })),
)

const armorName = (a) =>
  armorsData.find((s) => s.equip_set_id === a?.equip_set_id)?.equips.find((e) => e.equip_id === a?.equip_id)?.equip ??
  `Armor ${a?.equip_id ?? '?'}`

const classPreview = computed(() =>
  classPick.value ? previewClassSwitch(CLASS_DATA, rawHunter.value, classPick.value.hunter_class_id) : null,
)

const openClassModal = () => {
  if (switchBlockedReason.value) return
  classPick.value = null
  showClassModal.value = true
}

const pickClass = (c) => {
  if (c.current) return
  classPick.value = c
}

const confirmClassSwitch = async () => {
  const next = switchHunterClass(CLASS_DATA, rawHunter.value, classPick.value?.hunter_class_id)
  if (!next) return
  saveHunter(next)
  loadHunter() // สโตร์กลางถือตัวละครคนละก้อน — หน้าอื่น (คราฟต์ / เควส) ต้องเห็นคลาสใหม่ด้วย
  rawHunter.value = next
  showClassModal.value = false
  classPick.value = null
  await loadState()
}
</script>

<template>
  <div class="state-page">
  <template v-if="hunter">

    <!-- ══════════ HERO — ใครกำลังล่าอยู่ ══════════ -->
    <section data-tour="state-profile" class="hero">
      <div class="hero-emblem">
        <img :src="getImg(hunter.class.thumbnail)" class="hero-emblem-img" alt="" />
      </div>
      <div class="hero-main">
        <h2 class="hero-name">{{ hunter.name }}</h2>
        <p class="hero-class">{{ hunter.class.hunter_class }}</p>
        <div class="hero-chips">
          <span class="hero-chip hero-chip-hr"><em>HR</em>{{ hunter.hunter_rank }}</span>
          <span class="hero-chip hero-chip-day">Day {{ hunter.campaign_day }}</span>
          <span class="hero-chip">🐾 {{ hunter.palico }}</span>
        </div>
      </div>
      <div class="hero-side">
        <button
          data-tour="state-class-switch"
          class="dh-class-btn"
          :disabled="!!switchBlockedReason"
          :title="switchBlockedReason || 'เปลี่ยนไปเล่นสายอาวุธอื่นด้วยตัวละครเดิม'"
          @click="openClassModal"
        >
          ⇄ เปลี่ยนสายอาวุธ
        </button>
        <p v-if="switchBlockedReason" class="dh-class-note">{{ switchBlockedReason }}</p>
      </div>
    </section>

    <div class="state-layout">

      <!-- ══════════ ค่าที่ใช้ตั้งกระดาน — ของที่ต้องหยิบใช้บ่อยสุด อยู่บนสุด ══════════ -->
      <section data-tour="state-combat" class="card board-card">
        <header class="card-head">
          <span class="card-title">ค่าสำหรับตั้งกระดาน</span>
          <span class="card-sub">ชุดตัวเลขที่ใช้ตอนเซ็ตของบนโต๊ะ</span>
        </header>

        <div class="bs-group">
          <p class="bs-label">การ์ดดาเมจของอาวุธ</p>
          <div class="bs-dmg-row">
            <div v-for="d in damageCards" :key="d.face" class="bs-dmg">
              <span class="bs-dmg-card" :style="{ backgroundImage: `url(${getImg('assets/img/take_damage.webp')})` }">
                {{ d.face }}
              </span>
              <span class="bs-dmg-count">×{{ d.count }}</span>
            </div>
          </div>
        </div>

        <div class="bs-group">
          <p class="bs-label">ค่าป้องกัน</p>
          <div class="bs-def-row">
            <div class="bs-def">
              <span class="bs-def-coin" :style="{ backgroundImage: `url(${getImg('assets/img/bonus_armor.webp')})` }">
                <span class="bs-def-num">{{ totalArmor }}</span>
              </span>
              <span class="bs-def-tag">กายภาพ</span>
            </div>
            <div v-for="el in elementArmor" :key="el.elemental_id" class="bs-def">
              <span class="bs-def-coin" :style="{ backgroundImage: `url(${getImg('assets/img/bonus_armor.webp')})` }">
                <img :src="getImg(el.thumbnail)" class="bs-def-elem" alt="" />
                <span class="bs-def-num bs-def-num-elem">{{ el.value }}</span>
              </span>
              <span class="bs-def-tag">{{ getElementalById(Number(el.elemental_id))?.elemental ?? 'ธาตุ' }}</span>
            </div>
          </div>
          <p class="bs-hint">ค่ากายภาพรวมค่าป้องกันติดตัวของอาวุธไว้แล้ว</p>
        </div>

        <!-- หน้าตาเดียวกับการ์ดอาวุธในหน้า Crafting — คนที่เพิ่งตีอาวุธมาจะได้เห็นของชุดเดิม -->
        <div v-if="hunter.weapon.remove || hunter.weapon.add" class="bs-group">
          <p class="bs-label">ปรับกองการ์ดโจมตี</p>

          <div v-if="hunter.weapon.remove" class="cardmod cardmod-remove">
            <div class="cardmod-head">
              <span class="cardmod-sign">🗑️</span>
              <span class="cardmod-title">นำการ์ดออก</span>
              <span class="cardmod-sign">🗑️</span>
            </div>
            <div v-for="(line, li) in cardLines(hunter.weapon.remove)" :key="'r' + li" class="cardmod-row">
              <span v-if="line.count" class="cardmod-count">{{ line.count }}</span>
              <span class="cardmod-name">{{ line.name }}</span>
            </div>
          </div>

          <div v-if="hunter.weapon.add" class="cardmod cardmod-add">
            <div class="cardmod-head">
              <span class="cardmod-sign">📥</span>
              <span class="cardmod-title">ใส่การ์ดเข้าแทน</span>
              <span class="cardmod-sign">📥</span>
            </div>
            <div v-for="(line, li) in cardLines(hunter.weapon.add)" :key="'a' + li" class="cardmod-row">
              <span v-if="line.count" class="cardmod-count">{{ line.count }}</span>
              <span class="cardmod-name">{{ line.name }}</span>
            </div>
          </div>
        </div>
      </section>

      <div class="state-col">

        <!-- ══════════ อุปกรณ์ ══════════ -->
        <section class="card gear-card">
          <header class="card-head">
            <span class="card-title">อุปกรณ์ที่สวมอยู่</span>
            <span class="card-sub">แตะช่องเพื่อเปลี่ยนเป็นชิ้นที่คราฟไว้</span>
          </header>

          <div data-tour="state-equipment" class="gear-grid">
            <button v-for="slot in gearSlots" :key="slot.key" class="gear-slot" @click="openSwapModal(slot.key)">
              <span class="gear-top">
                <span class="gear-label">{{ slot.label }}</span>
                <span class="gear-swap">เปลี่ยน ›</span>
              </span>
              <span class="gear-body">
                <span class="gear-art">
                  <img :src="getImg(slot.setImg)" class="gear-art-set" alt="" />
                  <img :src="getImg(slot.itemImg)" class="gear-art-item" alt="" />
                </span>
                <span class="gear-info">
                  <span class="gear-name">{{ slot.name }}</span>
                  <span class="gear-stats">
                    <span v-for="d in slot.dmg" :key="d.face" class="gear-dmg">
                      <span
                        class="gear-dmg-card"
                        :style="{ backgroundImage: `url(${getImg('assets/img/take_damage.webp')})` }"
                      >{{ d.face }}</span>
                      <em class="gear-dmg-count">×{{ d.count }}</em>
                    </span>
                    <span
                      v-if="slot.armor > 0"
                      class="gear-pill gear-pill-armor"
                      :style="{ backgroundImage: `url(${getImg('assets/img/bonus_armor.webp')})` }"
                    >
                      {{ slot.armor }}
                    </span>
                    <span
                      v-if="slot.element"
                      class="gear-pill gear-pill-armor gear-pill-elem"
                      :style="{ backgroundImage: `url(${getImg('assets/img/bonus_armor.webp')})` }"
                    >
                      <img :src="getImg(slot.element.thumbnail)" class="gear-elem-icon" alt="" />
                      <span class="gear-elem-num">{{ slot.element.value }}</span>
                    </span>
                    <span v-if="slot.ability" class="gear-pill gear-pill-skill">{{ slot.ability }}</span>
                    <span v-if="!slot.dmg.length && !slot.armor && !slot.element && !slot.ability" class="gear-pill gear-pill-none">
                      ไม่มีค่าเพิ่ม
                    </span>
                  </span>
                </span>
              </span>
            </button>
          </div>
        </section>

        <!-- ══════════ ความสามารถ ══════════ -->
        <section data-tour="state-abilities" class="card skill-card">
          <header class="card-head">
            <span class="card-title">ความสามารถที่ได้อยู่</span>
            <span class="card-sub">{{ bonusAbilities.length }} อย่าง</span>
          </header>

          <div v-if="bonusAbilities.length" class="skill-list">
            <article v-for="ab in bonusAbilities" :key="ab.ability_id" class="skill-item">
              <p class="skill-head">
                <span class="skill-name">{{ ab.ability_name }}</span>
                <span v-if="abilitySource(ab.ability_id)" class="skill-from">{{ abilitySource(ab.ability_id) }}</span>
              </p>
              <p class="skill-text"><RuleText :text="ab.ability" /></p>
            </article>
          </div>
          <p v-else class="skill-empty">เกราะที่ใส่อยู่ยังไม่มีความสามารถพิเศษ</p>
        </section>

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
            <h3 class="swap-title">เลือก{{ slotTitle(equipType) }}</h3>
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
              :class="{ 'smc-worn': it.worn }"
              @click="setEquip(it)"
            >
              <div class="smc-img-wrap">
                <img v-if="it.thumbnail" :src="getImg(it.thumbnail)" class="smc-img" />
                <div v-else class="smc-empty">?</div>
              </div>
              <p class="smc-label">{{ it.label }}</p>
              <span v-if="it.worn" class="smc-worn-tag">ใส่อยู่</span>

              <!-- Weapon details -->
              <template v-if="equipType === 'weapon' && it.data">
                <div class="smc-details">
                  <div v-for="(cnt, key) in it.data.damage_cards" :key="key" v-show="cnt > 0" class="smc-dmg-card"
                    :style="{ backgroundImage: `url(${getImg('assets/img/take_damage.webp')})` }">
                    <span>{{ key.replace('damage_', '') }}</span>
                  </div>
                  <div v-if="it.data.defense > 0" class="smc-armor-card"
                    :style="{ backgroundImage: `url(${getImg('assets/img/bonus_armor.webp')})` }">
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
                    :style="{ backgroundImage: `url(${getImg('assets/img/bonus_armor.webp')})` }">
                    <span>{{ it.data.physical_armor }}</span>
                  </div>
                  <div v-if="it.data.elemental_armor?.elemental_id > 0" class="smc-armor-card"
                    :style="{ backgroundImage: `url(${getImg(getElementalById(it.data.elemental_armor.elemental_id)?.thumbnail)}), url(${getImg('assets/img/bonus_armor.webp')})` }">
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

  <!-- ══════════ CLASS SWITCH MODAL ══════════ -->
  <teleport to="body">
    <div v-if="showClassModal" class="swap-overlay" @click.self="showClassModal = false">
      <div class="swap-parchment">
        <div class="swap-modal-top">
          <div class="swap-title-row">
            <span class="swap-ornament">◆</span>
            <h3 class="swap-title">เปลี่ยนสายอาวุธ</h3>
            <span class="swap-ornament">◆</span>
          </div>
          <button class="btn-swap-close" @click="showClassModal = false">✕</button>
        </div>

        <div class="swap-modal-body">
          <!-- เลือกคลาส -->
          <template v-if="!classPick">
            <p class="cls-hint">
              ตัวละครเดิม เล่นได้ทุกสายอาวุธ — อาวุธของแต่ละสายเก็บแยกกัน เกราะ ของในกระเป๋า Campaign Day และ HR ใช้ร่วมกัน
            </p>
            <div class="cls-grid">
              <div
                v-for="c in classList"
                :key="c.hunter_class_id"
                class="cls-card"
                :class="{ 'cls-current': c.current }"
                @click="pickClass(c)"
              >
                <img :src="getImg(c.thumbnail)" class="cls-img" />
                <p class="cls-name">{{ c.hunter_class }}</p>
                <span v-if="c.current" class="cls-badge cls-badge-now">สายปัจจุบัน</span>
                <span v-else-if="c.weaponCount" class="cls-badge">เคยเล่น · อาวุธ {{ c.weaponCount }} ชิ้น</span>
                <span v-else class="cls-badge cls-badge-new">ยังไม่เคยเล่น</span>
              </div>
            </div>
          </template>

          <!-- ยืนยัน -->
          <template v-else>
            <div class="cls-confirm">
              <img :src="getImg(classPick.thumbnail)" class="cls-confirm-img" />
              <p class="cls-confirm-title">เปลี่ยนไปเล่น {{ classPick.hunter_class }}?</p>

              <div class="cls-row">
                <span class="cls-row-label">อาวุธ</span>
                <span class="cls-row-val">
                  {{ classPreview.equipped?.info?.item ?? '—' }}
                  <em v-if="classPreview.returning">(ของเดิมที่เก็บไว้ · {{ classPreview.weaponCount }} ชิ้น)</em>
                  <em v-else>(อาวุธเริ่มต้นของสายนี้)</em>
                </span>
              </div>

              <div class="cls-row">
                <span class="cls-row-label">เกราะ</span>
                <span v-if="!classPreview.armorChanges.length" class="cls-row-val">ไม่มีอะไรเปลี่ยน</span>
                <span v-else class="cls-row-val">
                  <span v-for="ch in classPreview.armorChanges" :key="ch.slot" class="cls-armor-line">
                    {{ armorName(ch.from) }} → {{ armorName(ch.to) }}<em v-if="ch.worn"> (ใส่อยู่)</em>
                  </span>
                </span>
              </div>

              <p class="cls-note">
                อาวุธของสาย {{ hunter.class.hunter_class }} เก็บไว้ให้ครบ กลับมาเล่นเมื่อไหร่ก็ได้ของเดิมคืน
              </p>

              <div class="cls-btn-row">
                <button class="cls-btn cls-btn-back" @click="classPick = null">ย้อนกลับ</button>
                <button class="cls-btn cls-btn-ok" @click="confirmClassSwitch">ยืนยันเปลี่ยน</button>
              </div>
            </div>
          </template>
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
.state-page,
.swap-overlay {
  /* พื้นผิวชุดเดียวกับหน้าอื่นในแอป */
  --grain: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='110' height='110'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.6' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='110' height='110' filter='url(%23g)' opacity='0.07'/%3E%3C/svg%3E");
  --leather:
    repeating-linear-gradient(
      100deg,
      rgba(0,0,0,0.14) 0px,
      rgba(0,0,0,0.14) 1px,
      transparent 1px,
      transparent 5px
    ),
    linear-gradient(170deg, #2b1f13, #221809 55%, #281d10);
  --wood-grain:
    repeating-linear-gradient(0deg, rgba(0,0,0,0.18) 0 1px, transparent 1px 6px),
    repeating-linear-gradient(0deg, rgba(255,216,164,0.035) 0 1px, transparent 1px 11px);
}

.state-page {
  display: flex;
  flex-direction: column;
  gap: 18px;
  color: #f0ddb0;
  font-family: 'Georgia', 'Times New Roman', serif;
}

/* ══════════════════════════════════════════
   HERO — ชื่อ คลาส และสถานะแคมเปญในแถบเดียว
   เดิมแยกเป็นป้ายชื่อ + แผง Hunter Profile เต็มความสูง กินที่ก่อนถึงของจริงเกือบ 550px
══════════════════════════════════════════ */
.hero {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 14px;
  border: 1px solid rgba(124, 90, 43, 0.55);
  border-left: 3px solid #7c5a2b;
  border-radius: 4px 3px 5px 3px;
  background: var(--grain), var(--leather);
  box-shadow: inset 0 1px 0 rgba(255, 220, 160, 0.07), 0 3px 12px rgba(0, 0, 0, 0.45);
}
.hero-emblem {
  flex: none;
  width: 62px;
  height: 62px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  border: 2px solid #6b4f1c;
  background: radial-gradient(circle at 38% 32%, #3a2a16, #1a1206 72%);
  box-shadow: inset 0 2px 6px rgba(0, 0, 0, 0.7), 0 0 14px rgba(200, 155, 60, 0.18);
}
.hero-emblem-img { width: 42px; height: 42px; object-fit: contain; filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.85)); }

.hero-main { flex: 1; min-width: 0; }
.hero-name {
  margin: 0;
  font-size: 21px;
  font-weight: bold;
  line-height: 1.15;
  color: #ffd27a;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.8);
  overflow-wrap: anywhere;
}
.hero-class {
  margin: 1px 0 0;
  font-size: 10px;
  letter-spacing: 3px;
  text-transform: uppercase;
  color: #a88040;
}
.hero-chips { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 7px; }
.hero-chip {
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid rgba(124, 90, 43, 0.5);
  background: rgba(0, 0, 0, 0.35);
  font-size: 11px;
  color: #c9b895;
}
.hero-chip em { font-style: normal; margin-right: 4px; font-size: 9px; letter-spacing: 1px; color: #a88040; }
/* เหรียญเงินให้ HR, เหรียญทองให้วันในแคมเปญ — สองค่านี้คือค่าที่เปลี่ยนไปเรื่อย ๆ */
.hero-chip-hr { border-color: rgba(200, 210, 220, 0.45); color: #e6edf3; background: linear-gradient(to bottom, rgba(150, 165, 180, 0.28), rgba(0, 0, 0, 0.4)); }
.hero-chip-day { border-color: rgba(200, 155, 60, 0.6); color: #ffd27a; background: linear-gradient(to bottom, rgba(200, 155, 60, 0.26), rgba(0, 0, 0, 0.4)); }

.hero-side { flex: none; display: flex; flex-direction: column; align-items: flex-end; gap: 2px; max-width: 42%; }

/* ══════════════════════════════════════════
   LAYOUT
══════════════════════════════════════════ */
.state-layout { display: flex; flex-direction: column; gap: 14px; }
.state-col { display: flex; flex-direction: column; gap: 14px; min-width: 0; }

/* จอกว้าง: ค่าตั้งกระดานค้างไว้ซ้ายมือ อ่านไปเปลี่ยนของไปได้โดยไม่ต้องเลื่อนสลับ */
@media (min-width: 900px) {
  .state-layout {
    display: grid;
    grid-template-columns: minmax(300px, 360px) minmax(0, 1fr);
    align-items: start;
    gap: 16px;
  }
  .board-card { position: sticky; top: 12px; }
}

/* แผ่นหนังหุ้ม สันทองเหลืองด้านซ้าย — ใช้ร่วมกันทุกกล่องในหน้านี้ */
.card {
  padding: 12px 14px 14px;
  border: 1px solid rgba(124, 90, 43, 0.5);
  border-left: 3px solid #7c5a2b;
  border-radius: 4px 3px 5px 3px;
  background: var(--grain), var(--leather);
  box-shadow: inset 0 1px 0 rgba(255, 220, 160, 0.06), 0 3px 12px rgba(0, 0, 0, 0.4);
}
.card-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 10px;
  padding-bottom: 8px;
  margin-bottom: 12px;
  border-bottom: 1px solid rgba(124, 90, 43, 0.35);
}
.card-title { font-size: 13px; font-weight: bold; letter-spacing: 2px; color: #ffd27a; }
.card-sub { font-size: 10px; color: #a88040; }

/* ══════════════════════════════════════════
   ค่าสำหรับตั้งกระดาน
══════════════════════════════════════════ */
.bs-group + .bs-group { margin-top: 14px; padding-top: 12px; border-top: 1px dashed rgba(124, 90, 43, 0.3); }
.bs-label { margin: 0 0 8px; font-size: 10px; letter-spacing: 2px; text-transform: uppercase; color: #a88040; }

.bs-dmg-row { display: flex; flex-wrap: wrap; justify-content: center; gap: 12px; }
.bs-dmg { display: flex; flex-direction: column; align-items: center; gap: 4px; }
/* รูปดาวในไฟล์เป็นสี่เหลี่ยมจัตุรัส — กรอบต้องจัตุรัสและใช้ contain
   (เคยใช้กรอบแนวตั้ง + cover แล้วปลายดาวซ้ายขวาโดนตัด ดูเหมือนวางไม่ตรงกลาง) */
.bs-dmg-card {
  width: 54px;
  height: 54px;
  display: grid;
  place-items: center;
  background-size: contain;
  background-position: center;
  background-repeat: no-repeat;
  font-size: 22px;
  font-weight: bold;
  color: #fff;
  text-shadow: 0 2px 3px rgba(0, 0, 0, 0.9);
}
.bs-dmg-count { font-size: 13px; font-weight: bold; color: #e8c698; }

.bs-def-row { display: flex; flex-wrap: wrap; justify-content: center; gap: 16px; }
/* ป้ายอยู่ใต้เหรียญ ไม่ทับบนรูป — เคยวางทับแล้วอ่านไม่ออกทั้งสองอย่าง */
.bs-def { display: flex; flex-direction: column; align-items: center; gap: 6px; }
/* ตัวเลขอยู่กลางเหรียญเสมอ ส่วนรูปธาตุเป็นตราเล็กที่มุม
   (เคยวางรูปธาตุเต็มเหรียญแล้วเลขจมหายไปกับลายของรูป อ่านไม่ออกทั้งคู่) */
.bs-def-coin {
  position: relative;
  width: 60px;
  height: 62px;
  display: grid;
  place-items: center;
  background-size: contain;
  background-position: center;
  background-repeat: no-repeat;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.6));
}
/* ซ้อนสามชั้นกึ่งกลางเดียวกัน: เหรียญ → รูปธาตุ → ตัวเลข
   เลขใช้ขาวตัดขอบดำแบบเดียวกับหน้า Crafting จึงอ่านออกแม้ทับบนรูปธาตุ */
.bs-def-elem {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 48px;
  height: 48px;
  object-fit: contain;
}
/* ขาวตัดขอบดำทุกเหรียญ — อ่านออกทั้งบนเหรียญเปล่าและบนรูปธาตุ (สูตรเดียวกับหน้า Crafting) */
.bs-def-num {
  position: relative;
  z-index: 3;
  font-size: 26px;
  font-weight: bold;
  line-height: 1;
  color: #fff;
  text-shadow: 0 0 4px #000;
  -webkit-text-stroke: 0.6px #000;
}
.bs-def-tag { display: inline-flex; align-items: center; font-size: 10px; letter-spacing: 1px; color: #a88040; }
.bs-hint { margin: 8px 0 0; font-size: 10px; color: #7d6a4c; }

/* กล่องการ์ดที่ต้องสลับ — ใช้หน้าตาชุดเดียวกับการ์ดอาวุธในหน้า Crafting
   คนที่เพิ่งตีอาวุธเสร็จแล้วมาเปิดหน้านี้จะได้เห็นของหน้าตาเดิม ไม่ต้องอ่านใหม่ */
.cardmod {
  margin-top: 7px;
  padding: 7px 9px 8px;
  border-radius: 3px;
  border: 1px solid rgba(124, 90, 43, 0.5);
  border-left-width: 3px;
  background: linear-gradient(170deg, rgba(28, 19, 10, 0.6), rgba(16, 11, 6, 0.6));
  text-align: center;
}
.cardmod-remove { border-left-color: #b4503a; }
.cardmod-add { border-left-color: #4f9d5d; }

.cardmod-head {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-bottom: 5px;
}
.cardmod-sign {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  font-size: 14px;
  font-weight: 900;
  line-height: 1;
}
.cardmod-remove .cardmod-sign { background: rgba(180, 80, 58, 0.24); color: #ff9a80; }
.cardmod-add .cardmod-sign { background: rgba(79, 157, 93, 0.24); color: #8ee7a1; }
.cardmod-title { font-size: 11px; letter-spacing: 0.5px; color: #a8946c; }

.cardmod-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 4px 0;
}
.cardmod-row + .cardmod-row { border-top: 1px dashed rgba(124, 90, 43, 0.3); }
.cardmod-count {
  flex-shrink: 0;
  min-width: 24px;
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 12px;
  font-weight: bold;
  text-align: center;
}
.cardmod-remove .cardmod-count { background: rgba(180, 80, 58, 0.26); color: #ffb3a0; }
.cardmod-add .cardmod-count { background: rgba(79, 157, 93, 0.26); color: #a6efb6; }
.cardmod-name { font-size: 13px; line-height: 1.35; color: #e6d5ab; }

/* ══════════════════════════════════════════
   อุปกรณ์
══════════════════════════════════════════ */
.gear-grid { display: grid; grid-template-columns: 1fr; gap: 10px; }
@media (min-width: 520px) { .gear-grid { grid-template-columns: 1fr 1fr; } }

/* แถวเดียวจบ: ชื่อช่อง รูป ชื่อของ และค่าที่ชิ้นนั้นให้ — กวาดตาทีเดียวรู้ว่าใส่อะไรได้อะไร */
.gear-slot {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  padding: 10px;
  text-align: left;
  font-family: inherit;
  color: inherit;
  cursor: pointer;
  border: 1px solid rgba(124, 90, 43, 0.45);
  border-radius: 4px 3px 5px 3px;
  background: var(--grain), linear-gradient(168deg, rgba(0, 0, 0, 0.42), rgba(0, 0, 0, 0.2));
  box-shadow: inset 0 2px 6px rgba(0, 0, 0, 0.5);
  transition: border-color 0.15s, box-shadow 0.15s, transform 0.15s;
}
.gear-slot:hover {
  border-color: rgba(200, 155, 60, 0.75);
  box-shadow: inset 0 2px 6px rgba(0, 0, 0, 0.5), 0 0 12px rgba(200, 155, 60, 0.2);
  transform: translateY(-1px);
}
.gear-slot:active { transform: translateY(0); }
.gear-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.gear-label { font-size: 10px; letter-spacing: 2px; text-transform: uppercase; color: #a88040; }
.gear-swap { font-size: 10px; color: #6b5a3c; }
.gear-slot:hover .gear-swap { color: #c89b3c; }

.gear-body { display: flex; align-items: center; gap: 10px; min-width: 0; }
.gear-art { flex: none; position: relative; width: 54px; height: 54px; }
.gear-art-set {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  opacity: 0.35;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.8));
}
.gear-art-item {
  position: absolute;
  right: -2px;
  bottom: -2px;
  width: 38px;
  height: 38px;
  object-fit: contain;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.9));
}
.gear-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.gear-name {
  font-size: 13px;
  font-weight: bold;
  line-height: 1.25;
  color: #e8c698;
  overflow-wrap: anywhere;
}
.gear-stats { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; }

.gear-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
  min-width: 26px;
  height: 26px;
  padding: 0 4px;
  font-size: 13px;
  font-weight: bold;
  color: #fff;
  background-size: contain, contain;
  background-position: center, center;
  background-repeat: no-repeat, no-repeat;
  text-shadow: 0 0 4px #000;
  -webkit-text-stroke: 0.5px #000;
}
.gear-pill em { font-style: normal; font-size: 10px; }
/* เกราะธาตุในช่องอุปกรณ์ — ซ้อนสามชั้นแบบเดียวกับเหรียญในแผงค่าตั้งกระดาน */
.gear-pill-elem { position: relative; }
.gear-elem-icon {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 22px;
  height: 22px;
  object-fit: contain;
}
.gear-elem-num { position: relative; z-index: 3; }

/* การ์ดดาเมจของอาวุธ: เลขหน้าการ์ดอยู่บนรูป ส่วนจำนวนใบอยู่ข้าง ๆ
   (เคยยัดไว้ในรูปเดียวกันแล้วเลขสองตัวทับกันจนอ่านไม่ออก) */
.gear-dmg { display: inline-flex; align-items: center; gap: 2px; }
.gear-dmg-card {
  width: 26px;
  height: 26px;
  display: grid;
  place-items: center;
  background-size: contain;
  background-position: center;
  background-repeat: no-repeat;
  font-size: 13px;
  font-weight: bold;
  color: #fff;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9);
}
.gear-dmg-count { font-style: normal; font-size: 11px; font-weight: bold; color: #c9b895; margin-right: 4px; }
.gear-pill-skill {
  min-width: 0;
  height: auto;
  padding: 3px 8px;
  border-radius: 999px;
  border: 1px solid rgba(200, 155, 60, 0.45);
  background: rgba(200, 155, 60, 0.14);
  color: #ffd27a;
  font-size: 10px;
  font-weight: normal;
  text-shadow: none;
  -webkit-text-stroke: 0;
}
.gear-pill-none {
  min-width: 0;
  height: auto;
  padding: 2px 0;
  background: none;
  color: #6b5a3c;
  font-size: 10px;
  font-weight: normal;
  text-shadow: none;
  -webkit-text-stroke: 0;
}

/* ══════════════════════════════════════════
   ความสามารถ
══════════════════════════════════════════ */
.skill-list { display: flex; flex-direction: column; gap: 10px; }
.skill-item {
  padding: 9px 11px;
  border-radius: 4px;
  border-left: 3px solid #c89b3c;
  background: rgba(0, 0, 0, 0.3);
}
.skill-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 8px; margin: 0 0 4px; }
.skill-name { font-size: 13px; font-weight: bold; color: #ffd27a; }
/* บอกว่ามาจากชิ้นไหน — ถอดชิ้นไหนความสามารถนี้ถึงจะหาย */
.skill-from { font-size: 10px; color: #a88040; }
.skill-text { margin: 0; font-size: 12px; line-height: 1.7; color: #d8c9a8; }
.skill-empty { margin: 0; font-size: 12px; color: #7d6a4c; font-style: italic; }

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
  background:
    var(--grain),
    var(--wood-grain),
    linear-gradient(172deg, #4a3320 0%, #3a2716 55%, #2a1c10 100%);
  border: 3px solid #221a10;
  border-radius: 3px 2px 4px 2px;
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
  padding: 12px 16px;
  background: linear-gradient(to bottom, rgba(200, 155, 60, 0.2), rgba(110, 80, 25, 0.26));
  border-bottom: 2px solid rgba(0, 0, 0, 0.5);
  box-shadow: 0 1px 0 rgba(232, 198, 152, 0.07);
  flex-shrink: 0;
}

.swap-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.swap-ornament { font-size: 10px; color: #6b4f1c; }

.swap-title {
  margin: 0;
  font-size: 14px;
  color: #ffd27a;
  letter-spacing: 3px;
  text-transform: uppercase;
}

.btn-swap-close {
  border-radius: 2px;
  border: 1px solid rgba(60, 42, 10, 0.5);
  background: rgba(0, 0, 0, 0.25);
  color: #f0d9a0;
  font-size: 14px;
  font-family: inherit;
  cursor: pointer;
  padding: 4px 9px;
  transition: 0.15s;
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
  border-radius: 3px 2px 3px 2px;
  border: 1px solid rgba(0, 0, 0, 0.5);
  background:
    var(--grain),
    linear-gradient(168deg, rgba(0, 0, 0, 0.46), rgba(0, 0, 0, 0.26));
  box-shadow: inset 0 3px 8px rgba(0, 0, 0, 0.6), inset 0 -1px 0 rgba(232, 198, 152, 0.07);
  cursor: pointer;
  transition: all 0.15s;
  text-align: center;
}
.swap-modal-card:hover {
  border-color: rgba(200, 155, 60, 0.55);
  background:
    var(--grain),
    linear-gradient(168deg, rgba(200, 155, 60, 0.14), rgba(0, 0, 0, 0.26));
  box-shadow: inset 0 2px 6px rgba(0, 0, 0, 0.5), 0 3px 10px rgba(0, 0, 0, 0.5);
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
  color: #c9b895;
  line-height: 1.3;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
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

/* ชิ้นที่ใส่อยู่ — ในกองที่มีหลายชิ้นต้องรู้ว่ากำลังใส่อันไหน */
.smc-worn { border-color: rgba(200, 155, 60, 0.7); box-shadow: inset 0 2px 6px rgba(0, 0, 0, 0.5), 0 0 10px rgba(200, 155, 60, 0.22); }
.smc-worn-tag {
  padding: 1px 8px; border-radius: 999px;
  background: rgba(200, 155, 60, 0.2); border: 1px solid rgba(200, 155, 60, 0.5);
  font-size: 9px; letter-spacing: 1px; color: #ffd27a;
}

.swap-no-items {
  grid-column: 1 / -1;
  text-align: center;
  padding: 24px;
  color: #5a3d1f;
  font-style: italic;
  font-size: 13px;
}

/* ── เปลี่ยนสายอาวุธ ─────────────────────────────── */
.dh-class-btn {
  margin-top: 6px;
  padding: 4px 12px;
  border: 1px solid rgba(200, 155, 60, 0.5);
  border-radius: 3px 2px 3px 2px;
  background: linear-gradient(168deg, rgba(200, 155, 60, 0.18), rgba(0, 0, 0, 0.3));
  color: #ffd27a;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1px;
  cursor: pointer;
  transition: all 0.15s;
}
.dh-class-btn:hover:not(:disabled) {
  border-color: rgba(200, 155, 60, 0.85);
  background: linear-gradient(168deg, rgba(200, 155, 60, 0.3), rgba(0, 0, 0, 0.3));
}
.dh-class-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.dh-class-note { margin: 4px 0 0; font-size: 10px; color: #a88040; }

.cls-hint { margin: 0 0 10px; font-size: 11px; line-height: 1.5; color: #c9b895; }
.cls-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.cls-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  padding: 10px 6px;
  text-align: center;
  cursor: pointer;
  transition: all 0.15s;
  border: 1px solid rgba(0, 0, 0, 0.5);
  border-radius: 3px 2px 3px 2px;
  background: var(--grain), linear-gradient(168deg, rgba(0, 0, 0, 0.46), rgba(0, 0, 0, 0.26));
  box-shadow: inset 0 3px 8px rgba(0, 0, 0, 0.6);
}
.cls-card:hover {
  border-color: rgba(200, 155, 60, 0.55);
  background: var(--grain), linear-gradient(168deg, rgba(200, 155, 60, 0.14), rgba(0, 0, 0, 0.26));
}
.cls-current { border-color: rgba(200, 155, 60, 0.7); cursor: default; }
.cls-img { width: 46px; height: 46px; object-fit: contain; filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.8)); }
.cls-name { margin: 0; font-size: 11px; font-weight: 700; color: #e8c698; line-height: 1.2; }
.cls-badge { font-size: 9px; line-height: 1.3; color: #a88040; }
.cls-badge-now { color: #ffd27a; font-weight: 700; }
.cls-badge-new { color: #7d6a4c; }

.cls-confirm { display: flex; flex-direction: column; align-items: center; gap: 10px; }
.cls-confirm-img { width: 64px; height: 64px; object-fit: contain; filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.8)); }
.cls-confirm-title { margin: 0; font-size: 14px; font-weight: 800; color: #ffd27a; }
.cls-row {
  display: flex;
  gap: 10px;
  width: 100%;
  padding: 8px 10px;
  border: 1px solid rgba(0, 0, 0, 0.5);
  border-radius: 3px 2px 3px 2px;
  background: linear-gradient(168deg, rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.2));
}
.cls-row-label { flex: 0 0 52px; font-size: 11px; font-weight: 700; color: #a88040; letter-spacing: 1px; }
.cls-row-val { flex: 1; font-size: 12px; line-height: 1.5; color: #e8c698; }
.cls-row-val em { font-style: normal; color: #a88040; }
.cls-armor-line { display: block; }
.cls-note { margin: 0; font-size: 11px; line-height: 1.5; color: #c9b895; text-align: center; }
.cls-btn-row { display: flex; gap: 10px; width: 100%; }
.cls-btn {
  flex: 1;
  padding: 10px;
  border: none;
  border-radius: 3px 2px 3px 2px;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 1px;
  cursor: pointer;
}
.cls-btn-back { background: rgba(0, 0, 0, 0.45); color: #c9b895; border: 1px solid rgba(0, 0, 0, 0.6); }
.cls-btn-ok { background: #c9a050; color: #1a1206; }
.cls-btn-ok:hover { background: #d9b060; }
</style>
