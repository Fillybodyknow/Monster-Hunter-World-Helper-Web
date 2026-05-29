<script setup>
import { ref, computed, onMounted } from 'vue'
import { hunter, loadHunter, saveHunter } from '@/stores/hunter'
import ancientData from '@/assets/files/ancient-quest-book.json'
import wildspireData from '@/assets/files/wildspire_book.json'
import resourceData from '@/assets/files/resource.json'
import monsterInfoData from '@/assets/files/monster_info.json'
import elementalData from '@/assets/files/elemental.json'

const getImg = (path) => `${import.meta.env.BASE_URL}${path}`

// ─── Static lookup map (built once, O(1) access) ──────────────────────────────
const _resMap = new Map()
resourceData.forEach(group => {
  group.resources.forEach(item => {
    _resMap.set(`${group.resource_type_id}-${item.item_id}`, { ...item, resource_type_id: group.resource_type_id })
  })
})
const lookupResource = (typeId, itemId) => _resMap.get(`${typeId}-${itemId}`) ?? null

// Static (not reactive computed) — derived purely from static JSON
const allCommonResources = resourceData
  .find(r => r.resource_type_id === 1)?.resources
  .map(r => ({ resource_type_id: 1, item_id: r.item_id, ...r })) ?? []

const selected = ref(new Set())
const showConfirm = ref(false)
const activeActivity = ref(null)

onMounted(loadHunter)

const books = [
  { id: 'ancient',   name: 'Ancient Forest',  data: ancientData },
  { id: 'wildspire', name: 'Wildspire Waste', data: wildspireData },
]

const resettableList = computed(() => {
  if (!hunter.value) return []
  const result = []
  for (const book of books) {
    for (const monster of book.data) {
      for (const quest of monster.quest) {
        if (quest.quest_id === 1) continue
        const attempt = hunter.value.attempted_quest.find(
          (a) => a.monster_id === monster.monster_id && a.quest_id === quest.quest_id,
        )
        if (!attempt || attempt.attempted === 0) continue
        result.push({
          key: `${monster.monster_id}-${quest.quest_id}`,
          bookName: book.name,
          bookId: book.id,
          monster_id: monster.monster_id,
          monster_name: monster.monster_name,
          thumbnail: monster.thumbnail,
          quest_id: quest.quest_id,
          quest_type: quest.quest_type,
          attempted: attempt.attempted,
          total: quest.starting_point.length,
        })
      }
    }
  }
  return result
})

const bookGroups = computed(() => {
  const groups = {}
  for (const entry of resettableList.value) {
    if (!groups[entry.bookId]) {
      groups[entry.bookId] = { name: entry.bookName, entries: [] }
    }
    groups[entry.bookId].entries.push(entry)
  }
  return Object.values(groups)
})

const toggleSelect = (key) => {
  const s = new Set(selected.value)
  s.has(key) ? s.delete(key) : s.add(key)
  selected.value = s
}

const selectAll = () => {
  selected.value = new Set(resettableList.value.map((e) => e.key))
}

const clearAll = () => {
  selected.value = new Set()
}

const questTypeInfo = (type) => {
  if (type === 'Investigation Quest')
    return { label: 'INVESTIGATION', cls: 'stamp-investigation' }
  return { label: 'TEMPERED', cls: 'stamp-tempered' }
}

const confirmReset = () => {
  if (!hunter.value || selected.value.size === 0) return
  hunter.value.attempted_quest = hunter.value.attempted_quest.filter((a) => {
    if (a.quest_id === 1) return true
    return !selected.value.has(`${a.monster_id}-${a.quest_id}`)
  })
  saveHunter(hunter.value)
  selected.value = new Set()
  showConfirm.value = false
}

const addDay = () => {
  if (!hunter.value) return
  hunter.value.campaign_day = (hunter.value.campaign_day ?? 0) + 1
  saveHunter(hunter.value)
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const getResource = (typeId, itemId) => lookupResource(typeId, itemId)

// ─── Resource Center ─────────────────────────────────────────────────────────
const RC_REWARD_TABLE = {
  2:  { resource_type_id: 1, item_id: 1  }, // Carbalite Ore
  3:  { resource_type_id: 1, item_id: 2  }, // Machalite Ore
  4:  { resource_type_id: 1, item_id: 3  }, // Dragonite Ore
  5:  { resource_type_id: 1, item_id: 4  }, // Fucium Ore
  6:  { resource_type_id: 1, item_id: 7  }, // Quality Bone
  7:  { resource_type_id: 1, item_id: 8  }, // Monster Bone Small
  8:  { resource_type_id: 1, item_id: 14 }, // Ancient Bone
  9:  { resource_type_id: 1, item_id: 5  }, // Dragonvein Crystal
  10: { resource_type_id: 1, item_id: 11 }, // Boulder Bone
  11: { resource_type_id: 2, item_id: 3  }, // Coral Crystal
  12: { resource_type_id: 2, item_id: 2  }, // Firecell Stone
}

const dotPatterns = { 1:[4], 2:[2,6], 3:[2,4,6], 4:[0,2,6,8], 5:[0,2,4,6,8], 6:[0,2,3,5,6,8] }

const rcPhase           = ref('roll')
const rcDice            = ref([{ id: 0, value: 1, spent: false }, { id: 1, value: 1, spent: false }])
const rcRolling         = ref(new Set())
const rcSelectedDiceIds = ref([])

const rcIsRolling   = computed(() => rcRolling.value.size > 0)
const rcSelectedSum = computed(() =>
  rcSelectedDiceIds.value.reduce((s, id) => {
    const d = rcDice.value.find(d => d.id === id)
    return s + (d?.value ?? 0)
  }, 0)
)
const rcAllDiceSpent = computed(() => rcDice.value.length > 0 && rcDice.value.every(d => d.spent))

const rcRewardTable = computed(() =>
  Object.entries(RC_REWARD_TABLE).map(([num, ref]) => {
    const meta = getResource(ref.resource_type_id, ref.item_id)
    return { num: Number(num), resource_type_id: ref.resource_type_id, item_id: ref.item_id, ...meta }
  })
)

const rcAnimateDie = (id, finalValue) => {
  rcRolling.value = new Set([...rcRolling.value, id])
  const interval = setInterval(() => {
    rcDice.value = rcDice.value.map(d => d.id === id ? { ...d, value: Math.ceil(Math.random() * 6) } : d)
  }, 55)
  setTimeout(() => {
    clearInterval(interval)
    rcDice.value = rcDice.value.map(d => d.id === id ? { ...d, value: finalValue } : d)
    rcRolling.value = new Set([...rcRolling.value].filter(x => x !== id))
  }, 650)
}

const rcRollAll = () => {
  if (rcIsRolling.value) return
  const vals = [Math.ceil(Math.random() * 6), Math.ceil(Math.random() * 6)]
  vals.forEach((val, i) => setTimeout(() => rcAnimateDie(i, val), i * 100))
}

const rcRerollOne = (id) => {
  if (rcRolling.value.has(id)) return
  rcAnimateDie(id, Math.ceil(Math.random() * 6))
}

const rcUseResult = () => {
  if (rcIsRolling.value) return
  rcSelectedDiceIds.value = []
  rcPhase.value = 'claim'
}

const rcToggleDie = (id) => {
  const die = rcDice.value.find(d => d.id === id)
  if (!die || die.spent) return
  rcSelectedDiceIds.value = rcSelectedDiceIds.value.includes(id)
    ? rcSelectedDiceIds.value.filter(x => x !== id)
    : [...rcSelectedDiceIds.value, id]
}

const rcStagedRewards = ref([]) // staging before confirming

const rcClaimReward = (row) => {
  if (rcSelectedDiceIds.value.length === 0) return
  if (row.num !== rcSelectedSum.value) return
  const existing = rcStagedRewards.value.find(
    r => r.resource_type_id === row.resource_type_id && r.item_id === row.item_id
  )
  if (existing) existing.quantity++
  else rcStagedRewards.value = [...rcStagedRewards.value, { resource_type_id: row.resource_type_id, item_id: row.item_id, quantity: 1, item: row.item, thumbnail: row.thumbnail }]
  rcDice.value = rcDice.value.map(d => rcSelectedDiceIds.value.includes(d.id) ? { ...d, spent: true } : d)
  rcSelectedDiceIds.value = []
}

const rcConfirmRewards = () => {
  if (!hunter.value || rcStagedRewards.value.length === 0) return
  const inv = hunter.value.inventory
  rcStagedRewards.value.forEach(r => {
    const existing = inv.find(i => i.resource_type_id === r.resource_type_id && i.item_id === r.item_id)
    if (existing) existing.quantity += r.quantity
    else inv.push({ resource_type_id: r.resource_type_id, item_id: r.item_id, quantity: r.quantity })
  })
  saveHunter(hunter.value)
  rcReset()
}

const rcReset = () => {
  rcPhase.value = 'roll'
  rcDice.value = [{ id: 0, value: 1, spent: false }, { id: 1, value: 1, spent: false }]
  rcSelectedDiceIds.value = []
  rcStagedRewards.value = []
  rcRollAll()
}

// ─── Provisions Stockpile ────────────────────────────────────────────────────
const showTradeModal    = ref(false)
const tradeMode         = ref(null)        // 'common' | 'rare'
const tradeChosenItem   = ref(null)
const tradeGiveSelection = ref({})         // { 'typeId-itemId': qty }
const tradeSearch       = ref('')
const tradeGiveSearch   = ref('')

const totalCommons = computed(() => {
  if (!hunter.value) return 0
  return (hunter.value.inventory ?? [])
    .filter(i => i.resource_type_id === 1)
    .reduce((s, i) => s + i.quantity, 0)
})

const tradeCost = computed(() => tradeMode.value === 'common' ? 3 : 10)

const tradeGiveTotal = computed(() =>
  Object.values(tradeGiveSelection.value).reduce((s, q) => s + q, 0)
)

const tradeReady = computed(() =>
  tradeGiveTotal.value === tradeCost.value && !!tradeChosenItem.value
)

const clearedMonsterIds = computed(() =>
  (hunter.value?.attempted_quest ?? [])
    .filter(a => a.quest_id === 1 && a.attempted >= 1)
    .map(a => a.monster_id)
)

const tradeRareOptions = computed(() => {
  const seen = new Set()
  const result = []
  for (const mId of clearedMonsterIds.value) {
    const info = monsterInfoData.find(m => m.monster_id === mId)
    const diff = info?.difficulty.find(d => d.difficulty_id === 1)
    for (const row of diff?.reward_table ?? []) {
      const { resource_type_id, item_id } = row.reward
      if (resource_type_id !== 3) continue
      const key = `${resource_type_id}-${item_id}`
      if (seen.has(key)) continue
      seen.add(key)
      const meta = getResource(resource_type_id, item_id)
      if (meta) result.push({ resource_type_id, item_id, ...meta })
    }
  }
  return result
})

const inventoryCommons = computed(() =>
  (hunter.value?.inventory ?? [])
    .filter(i => i.resource_type_id === 1 && i.quantity > 0)
    .map(i => {
      const meta = lookupResource(1, i.item_id)
      return { resource_type_id: 1, item_id: i.item_id, quantity: i.quantity, item: meta?.item ?? '', thumbnail: meta?.thumbnail ?? '' }
    })
)

const inventoryAll = computed(() =>
  (hunter.value?.inventory ?? [])
    .filter(i => i.quantity > 0)
    .map(i => {
      const meta = lookupResource(i.resource_type_id, i.item_id)
      return { resource_type_id: i.resource_type_id, item_id: i.item_id, quantity: i.quantity, item: meta?.item ?? '', thumbnail: meta?.thumbnail ?? '' }
    })
)

const totalInventory = computed(() =>
  (hunter.value?.inventory ?? []).reduce((s, i) => s + i.quantity, 0)
)

const filteredReceiveItems = computed(() => {
  const base = tradeMode.value === 'common' ? allCommonResources : tradeRareOptions.value
  if (!tradeSearch.value) return base
  return base.filter(i => i.item.toLowerCase().includes(tradeSearch.value.toLowerCase()))
})

const filteredGiveItems = computed(() => {
  const base = tradeMode.value === 'common' ? inventoryCommons.value : inventoryAll.value
  if (!tradeGiveSearch.value) return base
  return base.filter(i => i.item.toLowerCase().includes(tradeGiveSearch.value.toLowerCase()))
})

const openTradeModal = (mode) => {
  tradeMode.value = mode
  tradeChosenItem.value = null
  tradeGiveSelection.value = {}
  tradeSearch.value = ''
  tradeGiveSearch.value = ''
  showTradeModal.value = true
}

const adjustGive = (item, delta) => {
  const key = `${item.resource_type_id}-${item.item_id}`
  const current = tradeGiveSelection.value[key] ?? 0
  const otherTotal = tradeGiveTotal.value - current
  let newVal
  if (delta > 0) {
    newVal = Math.min(current + delta, item.quantity, tradeCost.value - otherTotal)
  } else {
    newVal = Math.max(0, current + delta)
  }
  const updated = { ...tradeGiveSelection.value }
  if (newVal <= 0) delete updated[key]
  else updated[key] = newVal
  tradeGiveSelection.value = updated
}

const confirmTrade = () => {
  if (!tradeReady.value || !hunter.value) return
  const inv = hunter.value.inventory
  Object.entries(tradeGiveSelection.value).forEach(([key, qty]) => {
    const [typeId, itemId] = key.split('-').map(Number)
    const it = inv.find(i => i.resource_type_id === typeId && i.item_id === itemId)
    if (it) it.quantity -= qty
  })
  hunter.value.inventory = inv.filter(i => i.quantity > 0)
  const received = tradeChosenItem.value
  const existing = hunter.value.inventory.find(i => i.resource_type_id === received.resource_type_id && i.item_id === received.item_id)
  if (existing) existing.quantity++
  else hunter.value.inventory.push({ resource_type_id: received.resource_type_id, item_id: received.item_id, quantity: 1 })
  saveHunter(hunter.value)
  const name = received.item
  showTradeModal.value = false
  tradeGiveSelection.value = {}
  tradeChosenItem.value = null
  Swal.fire({ icon: 'success', title: `ได้รับ ${name} แล้ว`, timer: 1200, showConfirmButton: false })
}

// ─── Meowscular Chef ─────────────────────────────────────────────────────────
const chefChosenElement = ref(null)
const chefDone          = ref(false)

const chefConfirm = () => {
  if (!chefChosenElement.value) return
  chefDone.value = true
}

const chefReset = () => { chefChosenElement.value = null; chefDone.value = false }

// ─── Hunter's Lodge ──────────────────────────────────────────────────────────
const lodgeDone = ref(false)

// ─── Pet the Poogie ──────────────────────────────────────────────────────────
const poogiePatted = ref(false)
const poogiePat = () => { poogiePatted.value = true }
</script>

<template>
  <div class="hq-page">

    <!-- HEADER -->
    <div class="hq-header">
      <div class="hq-line"></div>
      <div class="hq-title-wrap">
        <span class="hq-ornament">⚔</span>
        <h2 class="hq-title">Head Quarter</h2>
        <span class="hq-ornament">⚔</span>
      </div>
      <div class="hq-line"></div>
    </div>

    <!-- HUNTER INFO -->
    <div v-if="hunter" class="hq-hunter-bar">
      <div class="hqh-label">นักล่าปัจจุบัน</div>
      <div class="hqh-name">{{ hunter.hunter_name }}</div>
      <div class="hqh-class">{{ hunter.hunter_class }}</div>
    </div>

    <!-- CAMP ACTIONS -->
    <div v-if="hunter" class="hq-camp-actions">
      <div class="hq-camp-label">CAMP LOG</div>
      <div class="hq-camp-row">
        <div class="hq-camp-day">
          <span class="hq-camp-day-num">{{ hunter.campaign_day ?? 1 }}</span>
          <span class="hq-camp-day-text">วันที่</span>
        </div>
        <button class="btn-add-day" @click="addDay">+ เพิ่มวัน</button>
      </div>
    </div>

    <!-- ══════ LOCATION GRID ══════ -->
    <div v-if="hunter && !activeActivity" class="hq-location-grid">
      <div class="hq-loc-card" @click="activeActivity = 'resource'">
        <span class="hq-loc-icon">🎲</span>
        <div class="hq-loc-info">
          <span class="hq-loc-name">Resource Center</span>
          <span class="hq-loc-sub">ทอย 2 เต๋าเพื่อรับ Resource</span>
        </div>
        <span class="hq-loc-arrow">›</span>
      </div>
      <div class="hq-loc-card" :class="{ 'loc-disabled': totalCommons < 3 && totalInventory < 10 }"
        @click="(totalCommons >= 3 || totalInventory >= 10) && (activeActivity = 'provisions')">
        <span class="hq-loc-icon">⚖</span>
        <div class="hq-loc-info">
          <span class="hq-loc-name">Provisions Stockpile</span>
          <span class="hq-loc-sub">แลกเปลี่ยน Resource</span>
        </div>
        <span class="hq-loc-arrow">›</span>
      </div>
      <div class="hq-loc-card" @click="activeActivity = 'chef'">
        <span class="hq-loc-icon">🍖</span>
        <div class="hq-loc-info">
          <span class="hq-loc-name">Meowscular Chef</span>
          <span class="hq-loc-sub">รับ Element Token</span>
        </div>
        <span class="hq-loc-arrow">›</span>
      </div>
      <div class="hq-loc-card" @click="activeActivity = 'lodge'">
        <span class="hq-loc-icon">🐱</span>
        <div class="hq-loc-info">
          <span class="hq-loc-name">Hunter's Lodge</span>
          <span class="hq-loc-sub">จัดการ Palico</span>
        </div>
        <span class="hq-loc-arrow">›</span>
      </div>
      <div class="hq-loc-card" @click="activeActivity = 'handler'">
        <span class="hq-loc-icon">📋</span>
        <div class="hq-loc-info">
          <span class="hq-loc-name">The Handler</span>
          <span class="hq-loc-sub">รีเซ็ต Quest Progress</span>
        </div>
        <span class="hq-loc-arrow">›</span>
      </div>
      <div class="hq-loc-card hq-loc-poogie" @click="activeActivity = 'poogie'">
        <span class="hq-loc-icon">🐷</span>
        <div class="hq-loc-info">
          <span class="hq-loc-name">Pet the Poogie</span>
          <span class="hq-loc-sub">นำโชค... หรือเปล่า?</span>
        </div>
        <span class="hq-loc-arrow">›</span>
      </div>
    </div>

    <!-- ══════ ACTIVITY BACK BUTTON ══════ -->
    <button v-if="hunter && activeActivity" class="hq-back-btn" @click="activeActivity = null">
      ‹ กลับ
    </button>

    <!-- ══════ RESOURCE CENTER ══════ -->
    <div v-if="hunter && activeActivity === 'resource'" class="hq-activity-card rc-card">
      <div class="hqa-stamp">VISIT THE RESOURCE CENTER</div>

      <!-- Phase: Roll -->
      <div v-if="rcPhase === 'roll'" class="rc-roll-phase">
        <p class="rc-sub">ทอย 2 เต๋า · กดที่เต๋าเพื่อทอยใหม่เฉพาะลูก</p>
        <div class="rc-dice-row">
          <div
            v-for="die in rcDice" :key="die.id"
            class="rc-die"
            :class="{ rolling: rcRolling.has(die.id) }"
            @click="rcRerollOne(die.id)"
            title="คลิกเพื่อทอยใหม่"
          >
            <div class="rc-die-face">
              <span v-for="pos in 9" :key="pos" class="rc-die-dot"
                :class="{ visible: dotPatterns[die.value]?.includes(pos - 1) }" />
            </div>
          </div>
        </div>
        <div class="rc-roll-actions">
          <button class="rc-btn-secondary" :disabled="rcIsRolling" @click="rcRollAll">🎲 ทอยใหม่ทั้งหมด</button>
          <button class="rc-btn-primary"   :disabled="rcIsRolling" @click="rcUseResult">ใช้ผลนี้ →</button>
        </div>
      </div>

      <!-- Phase: Claim -->
      <div v-else class="rc-claim-phase">
        <div class="rc-chips-wrap">
          <p class="rc-section-label">เต๋าที่ทอยได้ — เลือกเพื่อรวมค่า</p>
          <div class="rc-chips-row">
            <div
              v-for="die in rcDice" :key="die.id"
              class="rc-die-chip"
              :class="{
                'chip-selected': rcSelectedDiceIds.includes(die.id),
                'chip-spent':    die.spent,
              }"
              @click="rcToggleDie(die.id)"
            >{{ die.value }}</div>
            <div v-if="rcSelectedDiceIds.length > 0" class="rc-sum-badge">= {{ rcSelectedSum }}</div>
          </div>
          <p v-if="rcSelectedDiceIds.length > 0" class="rc-sum-hint">
            เลือก row {{ rcSelectedSum }} เพื่อรับ Reward
          </p>
        </div>

        <p class="rc-section-label">ตาราง Reward</p>
        <div class="rc-table">
          <div
            v-for="row in rcRewardTable" :key="row.num"
            class="rc-row"
            :class="{
              'rc-row-match':  rcSelectedDiceIds.length > 0 && row.num === rcSelectedSum,
              'rc-row-locked': rcSelectedDiceIds.length > 0 && row.num !== rcSelectedSum,
            }"
            @click="rcClaimReward(row)"
          >
            <span class="rc-row-num">{{ row.num }}</span>
            <div class="rc-row-item">
              <img :src="getImg(row.thumbnail)" class="rc-item-img" />
              <span class="rc-item-name">{{ row.item }}</span>
            </div>
          </div>
        </div>

        <!-- Staged rewards summary -->
        <div v-if="rcStagedRewards.length > 0" class="rc-staged">
          <p class="rc-section-label">รางวัลที่รอรับ</p>
          <div class="rc-staged-list">
            <div v-for="r in rcStagedRewards" :key="`${r.resource_type_id}-${r.item_id}`" class="rc-staged-item">
              <img :src="getImg(r.thumbnail)" class="rc-item-img" />
              <span class="rc-item-name">{{ r.item }}</span>
              <span class="rc-staged-qty">×{{ r.quantity }}</span>
            </div>
          </div>
        </div>

        <div class="rc-confirm-row">
          <p v-if="!rcAllDiceSpent" class="rc-skip-hint">
            ยังมีเต๋าเหลือ {{ rcDice.filter(d => !d.spent).length }} ลูก
          </p>
          <button class="rc-btn-primary" @click="rcConfirmRewards" :disabled="rcStagedRewards.length === 0">
            ✦ รับรางวัลและปิด
          </button>
        </div>
      </div>
    </div>

    <!-- ══════ PROVISIONS STOCKPILE ══════ -->
    <div v-if="hunter && activeActivity === 'provisions'" class="hq-activity-card">
      <div class="hqa-stamp">VISIT THE PROVISIONS STOCKPILE</div>
      <p class="hqa-desc">แลกเปลี่ยน Common Resources เพื่อรับ Resource ที่ต้องการ</p>

      <div class="hqa-trade-row">
        <div class="hqa-trade-card" :class="{ disabled: totalCommons < 3 }" @click="totalCommons >= 3 && openTradeModal('common')">
          <div class="htc-cost">3 Common</div>
          <div class="htc-arrow">→</div>
          <div class="htc-gain">1 Common</div>
          <div v-if="totalCommons < 3" class="htc-lock">ไม่พอ ({{ totalCommons }}/3)</div>
        </div>
        <div class="hqa-trade-card" :class="{ disabled: totalInventory < 10 || clearedMonsterIds.length === 0 }"
          @click="totalInventory >= 10 && clearedMonsterIds.length > 0 && openTradeModal('rare')">
          <div class="htc-cost">10 Resource</div>
          <div class="htc-arrow">→</div>
          <div class="htc-gain">1 Monster Part</div>
          <div v-if="totalInventory < 10" class="htc-lock">ไม่พอ ({{ totalInventory }}/10)</div>
          <div v-else-if="clearedMonsterIds.length === 0" class="htc-lock">ยังไม่ผ่าน Quest</div>
        </div>
      </div>
    </div>

    <!-- ══════ MEOWSCULAR CHEF ══════ -->
    <div v-if="hunter && activeActivity === 'chef'" class="hq-activity-card hqa-flavor">
      <div class="hqa-stamp">VISIT THE MEOWSCULAR CHEF</div>
      <p class="hqa-desc">เชฟผู้เชี่ยวชาญจะปรุงเมนูพิเศษสำหรับการล่าครั้งถัดไป</p>

      <div v-if="!chefDone">
        <p class="hqa-flavor-sub">เลือก Element ที่ต้องการเพิ่มความต้านทาน:</p>
        <div class="hqa-elem-row">
          <div v-for="el in elementalData" :key="el.elemental_id"
            class="hqa-elem-chip" :class="{ chosen: chefChosenElement?.elemental_id === el.elemental_id }"
            @click="chefChosenElement = el">
            <img :src="getImg(el.thumbnail)" class="hqa-elem-icon" />
            <span>{{ el.elemental }}</span>
          </div>
        </div>
        <button v-if="chefChosenElement" class="hqa-btn hqa-btn-claim" @click="chefConfirm">
          🍖 รับ Token
        </button>
      </div>
      <div v-else class="hqa-flavor-result">
        <img :src="getImg(chefChosenElement.thumbnail)" class="hqa-elem-icon" />
        <p>เชฟยิ้มกว้างและนำจานพิเศษออกมา — ขอให้โชคดีในการล่า นักล่า!</p>
        <p class="hqa-flavor-tip">วาง <strong>{{ chefChosenElement.elemental }} Token</strong> บนอาวุธของคุณ เพื่อบ่งบอกว่า Quest ถัดไปจะได้รับความต้านทาน Element นั้น</p>
        <button class="hqa-btn hqa-btn-reset" @click="chefReset">↺ เมนูใหม่</button>
      </div>
    </div>

    <!-- ══════ HUNTER'S LODGE ══════ -->
    <div v-if="hunter && activeActivity === 'lodge'" class="hq-activity-card hqa-flavor">
      <div class="hqa-stamp">VISIT THE HUNTER'S LODGE</div>
      <div v-if="hunter.palico_name">
        <p class="hqa-desc">{{ hunter.palico_name }} รอคุณอยู่ที่ Lodge — พูดคุยกับ Palico ตัวอื่นที่นั่น เพื่อนำ Palico ที่เหมาะสมกับ Quest ถัดไปของคุณมาด้วย</p>
        <p class="hqa-flavor-tip">🐱 วางการ์ด Palico ที่เลือกไว้ข้าง Quest Card ของคุณ</p>
      </div>
      <div v-else>
        <p class="hqa-desc">คุณมาคนเดียว... แต่ Felyne ที่ Lodge มองคุณด้วยตาเป็นประกาย</p>
        <p class="hqa-flavor-tip">🐱 นำ Resource 3 อันออกจาก Inventory เพื่อจ้าง Palico ร่วมเดินทางใน Quest ถัดไป</p>
      </div>
    </div>

    <!-- NOTICE (Handler) -->
    <div v-if="activeActivity === 'handler'" class="hq-notice">
      <span class="hq-notice-stamp">VISIT THE HANDLER</span>
      <p class="hq-notice-text">
        เลือก Investigation และ Tempered quests เพื่อล้างบันทึกจำนวนการเล่น
        Assigned Quests เป็นบันทึกถาวรของสมาคมและไม่สามารถรีเซ็ตได้
      </p>
    </div>

    <!-- EMPTY STATE -->
    <div v-if="activeActivity === 'handler' && resettableList.length === 0" class="hq-empty">
      <div class="hq-empty-icon">📋</div>
      <p class="hq-empty-title">ไม่พบบันทึก</p>
      <p class="hq-empty-sub">ยังไม่มีการเล่น Investigation หรือ Tempered quests</p>
    </div>

    <!-- QUEST LIST -->
    <template v-else-if="activeActivity === 'handler'">

      <!-- ACTION BAR -->
      <div class="hq-action-bar">
        <div class="hq-select-btns">
          <button class="btn-select-all" @click="selectAll">เลือกทั้งหมด</button>
          <button class="btn-clear-sel" @click="clearAll" :disabled="selected.size === 0">ล้างการเลือก</button>
        </div>
        <button
          class="btn-reset"
          :disabled="selected.size === 0"
          @click="showConfirm = true"
        >
          <span class="btn-reset-icon">↺</span>
          รีเซ็ต ({{ selected.size }})
        </button>
      </div>

      <!-- GROUPS -->
      <div class="hq-groups">
        <div v-for="group in bookGroups" :key="group.name" class="hq-group">
          <div class="hq-group-header">
            <div class="hq-group-line"></div>
            <span class="hq-group-name">{{ group.name }}</span>
            <div class="hq-group-line"></div>
          </div>

          <div class="hq-quest-list">
            <div
              v-for="entry in group.entries"
              :key="entry.key"
              class="hq-quest-row"
              :class="{ selected: selected.has(entry.key) }"
              @click="toggleSelect(entry.key)"
            >
              <!-- Checkbox -->
              <div class="hqr-check" :class="{ checked: selected.has(entry.key) }">
                <span v-if="selected.has(entry.key)">✦</span>
              </div>

              <!-- Monster icon -->
              <img :src="getImg(entry.thumbnail)" class="hqr-img" />

              <!-- Info -->
              <div class="hqr-info">
                <div class="hqr-monster">{{ entry.monster_name }}</div>
                <div class="hqr-stamp-row">
                  <span class="hqr-stamp" :class="questTypeInfo(entry.quest_type).cls">
                    {{ questTypeInfo(entry.quest_type).label }}
                  </span>
                </div>
              </div>

              <!-- Attempts -->
              <div class="hqr-attempts">
                <span class="hqr-attempts-used">{{ entry.attempted }}</span>
                <span class="hqr-attempts-sep">/</span>
                <span class="hqr-attempts-total">{{ entry.total }}</span>
                <span class="hqr-attempts-label">ใช้แล้ว</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- ══════ PET THE POOGIE ══════ -->
    <div v-if="hunter && activeActivity === 'poogie'" class="hq-activity-card hqa-flavor hqa-poogie">
      <div class="hqa-stamp">PET THE POOGIE</div>
      <p class="hqa-desc">
        "บางครั้งสิ่งนี้อาจนำโชคมาให้คุณ บางคนเชื่อว่ามันเป็นเพียงตำนาน"<br/>
        <span class="hqa-flavor-en">"Some say this brings you luck, others believe this is a myth."</span>
      </p>
      <div v-if="!poogiePatted" class="hqa-btn-row">
        <button class="hqa-btn hqa-btn-poogie" @click="poogiePat">🐷 ลูบ Poogie</button>
      </div>
      <p v-else class="hqa-poogie-result">Poogie ส่งเสียงร้องอย่างพึงพอใจ... ✨</p>
    </div>

    <!-- TRADE MODAL -->
    <teleport to="body">
      <div v-if="showTradeModal" class="hq-confirm-overlay" @click.self="showTradeModal = false">
        <div class="hq-confirm-modal hq-trade-modal">
          <div class="hq-confirm-stamp">
            {{ tradeMode === 'common' ? 'TRADE COMMON RESOURCES' : 'TRADE FOR MONSTER PART' }}
          </div>

          <!-- ── Give Section ── -->
          <div class="trade-give-section">
            <div class="trade-give-header">
              <span class="trade-give-label">เลือก Resources ที่จะแลก</span>
              <span class="trade-give-count" :class="{ full: tradeGiveTotal === tradeCost }">
                {{ tradeGiveTotal }} / {{ tradeCost }}
              </span>
            </div>
            <input
              v-model="tradeGiveSearch"
              class="trade-search-input"
              placeholder="Search item..."
            />
            <div class="trade-give-list">
              <div v-if="filteredGiveItems.length === 0" class="trade-no-give-results">ไม่พบ item</div>
              <div
                v-for="item in filteredGiveItems"
                :key="`${item.resource_type_id}-${item.item_id}`"
                v-memo="[tradeGiveSelection[`${item.resource_type_id}-${item.item_id}`] ?? 0, tradeGiveTotal >= tradeCost]"
                class="trade-give-row"
              >
                <img :src="getImg(item.thumbnail)" class="hq-trade-img" />
                <span class="trade-give-name">{{ item.item }}</span>
                <span class="trade-give-owned">มี {{ item.quantity }}</span>
                <div class="trade-give-ctrl">
                  <button class="tgc-btn" @click="adjustGive(item, -1)">−</button>
                  <span class="tgc-qty">{{ tradeGiveSelection[`${item.resource_type_id}-${item.item_id}`] ?? 0 }}</span>
                  <button class="tgc-btn" @click="adjustGive(item, 1)"
                    :disabled="tradeGiveTotal >= tradeCost || (tradeGiveSelection[`${item.resource_type_id}-${item.item_id}`] ?? 0) >= item.quantity">+</button>
                </div>
              </div>
            </div>
          </div>

          <!-- ── Receive Section ── -->
          <div class="trade-receive-section">
            <span class="trade-give-label">เลือก Item ที่ต้องการรับ</span>
            <input
              v-model="tradeSearch"
              class="trade-search-input"
              placeholder="Search item..."
            />
            <div class="hq-trade-grid">
              <div v-for="item in filteredReceiveItems"
                :key="`${item.resource_type_id}-${item.item_id}`"
                v-memo="[tradeChosenItem?.item_id === item.item_id && tradeChosenItem?.resource_type_id === item.resource_type_id]"
                class="hq-trade-item"
                :class="{ chosen: tradeChosenItem?.item_id === item.item_id && tradeChosenItem?.resource_type_id === item.resource_type_id }"
                @click="tradeChosenItem = item">
                <img :src="getImg(item.thumbnail)" class="hq-trade-img" />
                <span class="hq-trade-name">{{ item.item }}</span>
              </div>
              <div v-if="filteredReceiveItems.length === 0" class="trade-no-results">
                ไม่พบ item
              </div>
            </div>
          </div>

          <div class="hq-confirm-btns">
            <button class="hq-btn-confirm" :disabled="!tradeReady" @click="confirmTrade">
              ✓ ยืนยันแลก
            </button>
            <button class="hq-btn-cancel" @click="showTradeModal = false">← ยกเลิก</button>
          </div>
        </div>
      </div>
    </teleport>

    <!-- CONFIRM MODAL -->
    <teleport to="body">
      <div v-if="showConfirm" class="hq-confirm-overlay">
        <div class="hq-confirm-modal">
          <div class="hq-confirm-stamp">GUILD RESET ORDER</div>
          <p class="hq-confirm-question">รีเซ็ต {{ selected.size }} บันทึกเควส?</p>
          <p class="hq-confirm-desc">
            จำนวนการเล่นจะถูกล้าง และสามารถเล่นเควสใหม่ได้ตั้งแต่ต้น
            การกระทำนี้ไม่สามารถยกเลิกได้
          </p>
          <div class="hq-confirm-btns">
            <button class="hq-btn-confirm" @click="confirmReset">↺ ยืนยันการรีเซ็ต</button>
            <button class="hq-btn-cancel" @click="showConfirm = false">← กลับ</button>
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
.hq-page {
  display: flex;
  flex-direction: column;
  gap: 18px;
  color: #f0ddb0;
  font-family: 'Georgia', 'Times New Roman', serif;
  max-width: 680px;
  margin: 0 auto;
}

/* ══════════════════════════════════════════
   HEADER
══════════════════════════════════════════ */
.hq-header {
  display: flex;
  align-items: center;
  gap: 12px;
}
.hq-line {
  flex: 1;
  height: 1px;
  background: linear-gradient(to right, transparent, #7c5a2b);
}
.hq-line:last-child {
  background: linear-gradient(to left, transparent, #7c5a2b);
}
.hq-title-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
  white-space: nowrap;
}
.hq-title {
  margin: 0;
  font-size: 18px;
  color: #ffd27a;
  letter-spacing: 4px;
  text-transform: uppercase;
  text-shadow: 0 0 12px rgba(255, 200, 80, 0.4);
}
.hq-ornament { font-size: 13px; color: #7c5a2b; }

/* ══════════════════════════════════════════
   HUNTER BAR
══════════════════════════════════════════ */
.hq-hunter-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-radius: 8px;
  background: linear-gradient(to right, rgba(40, 28, 14, 0.9), rgba(20, 15, 8, 0.9));
  border: 1px solid rgba(124, 90, 43, 0.5);
  border-left: 3px solid #c89b3c;
}
.hqh-label {
  font-size: 9px;
  letter-spacing: 3px;
  text-transform: uppercase;
  color: #7c5a2b;
}
.hqh-name {
  font-size: 15px;
  color: #ffd27a;
  font-weight: bold;
  flex: 1;
}
.hqh-class {
  font-size: 11px;
  color: #a88040;
  letter-spacing: 1px;
}

/* ══════════════════════════════════════════
   NOTICE
══════════════════════════════════════════ */
.hq-notice {
  padding: 12px 16px;
  border-radius: 8px;
  background: rgba(10, 8, 4, 0.6);
  border: 1px solid rgba(124, 90, 43, 0.3);
  border-left: 3px solid #7c5a2b;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.hq-notice-stamp {
  font-size: 9px;
  letter-spacing: 4px;
  text-transform: uppercase;
  color: #7c5a2b;
}
.hq-notice-text {
  margin: 0;
  font-size: 12px;
  color: #7c5a2b;
  line-height: 1.6;
  font-style: italic;
}

/* ══════════════════════════════════════════
   EMPTY STATE
══════════════════════════════════════════ */
.hq-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 40px 20px;
  border-radius: 10px;
  border: 1px dashed rgba(124, 90, 43, 0.3);
  text-align: center;
}
.hq-empty-icon { font-size: 36px; opacity: 0.4; }
.hq-empty-title { margin: 0; font-size: 14px; color: #7c5a2b; letter-spacing: 2px; }
.hq-empty-sub { margin: 0; font-size: 12px; color: #4a3520; font-style: italic; }

/* ══════════════════════════════════════════
   ACTION BAR
══════════════════════════════════════════ */
.hq-action-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.hq-select-btns {
  display: flex;
  gap: 8px;
}
.btn-select-all,
.btn-clear-sel {
  padding: 7px 14px;
  border-radius: 6px;
  border: 1px solid rgba(124, 90, 43, 0.5);
  background: rgba(10, 8, 4, 0.7);
  color: #a88040;
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
  transition: 0.2s;
  min-height: 36px;
}
.btn-select-all:hover { border-color: #c89b3c; color: #c89b3c; }
.btn-clear-sel:hover:not(:disabled) { border-color: #c89b3c; color: #c89b3c; }
.btn-clear-sel:disabled { opacity: 0.35; cursor: default; }

.btn-reset {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 18px;
  border-radius: 6px;
  border: 1px solid #8c3a3a;
  background: linear-gradient(to bottom, #3a1a1a, #1a0d0d);
  color: #ff6b6b;
  font-family: inherit;
  font-size: 13px;
  font-weight: bold;
  cursor: pointer;
  transition: 0.2s;
  min-height: 36px;
}
.btn-reset:hover:not(:disabled) {
  box-shadow: 0 0 14px rgba(255, 80, 80, 0.35);
  border-color: #cc4444;
}
.btn-reset:disabled { opacity: 0.35; cursor: default; }
.btn-reset-icon { font-size: 16px; }

/* ══════════════════════════════════════════
   GROUPS
══════════════════════════════════════════ */
.hq-groups { display: flex; flex-direction: column; gap: 16px; }

.hq-group-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}
.hq-group-line {
  flex: 1;
  height: 1px;
  background: linear-gradient(to right, transparent, rgba(124, 90, 43, 0.4));
}
.hq-group-line:last-child {
  background: linear-gradient(to left, transparent, rgba(124, 90, 43, 0.4));
}
.hq-group-name {
  font-size: 10px;
  letter-spacing: 3px;
  text-transform: uppercase;
  color: #7c5a2b;
  white-space: nowrap;
}

/* ══════════════════════════════════════════
   QUEST ROWS
══════════════════════════════════════════ */
.hq-quest-list { display: flex; flex-direction: column; gap: 6px; }

.hq-quest-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-radius: 8px;
  border: 1px solid rgba(124, 90, 43, 0.35);
  background: linear-gradient(to right, rgba(28, 20, 10, 0.9), rgba(15, 11, 7, 0.9));
  cursor: pointer;
  transition: 0.18s;
  user-select: none;
}
.hq-quest-row:hover {
  border-color: rgba(200, 155, 60, 0.5);
  background: linear-gradient(to right, rgba(40, 28, 14, 0.95), rgba(22, 16, 9, 0.95));
}
.hq-quest-row.selected {
  border-color: #8c3a3a;
  background: linear-gradient(to right, rgba(50, 18, 18, 0.95), rgba(20, 8, 8, 0.95));
  box-shadow: inset 0 0 16px rgba(200, 50, 50, 0.08);
}

/* Checkbox */
.hqr-check {
  width: 22px;
  height: 22px;
  border-radius: 4px;
  border: 1px solid rgba(124, 90, 43, 0.5);
  background: rgba(5, 4, 2, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: 0.15s;
  font-size: 11px;
  color: #ff6b6b;
}
.hqr-check.checked {
  border-color: #8c3a3a;
  background: rgba(140, 58, 58, 0.2);
}

/* Monster icon */
.hqr-img {
  width: 44px;
  height: 44px;
  object-fit: contain;
  flex-shrink: 0;
  filter: drop-shadow(0 0 4px rgba(0, 0, 0, 0.6));
}

/* Info */
.hqr-info { flex: 1; min-width: 0; }
.hqr-monster {
  font-size: 14px;
  color: #e0c88a;
  font-weight: bold;
  line-height: 1.3;
}
.hqr-stamp-row { margin-top: 4px; }
.hqr-stamp {
  display: inline-block;
  font-size: 8px;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  font-family: 'Arial Narrow', 'Arial', sans-serif;
  font-weight: bold;
  padding: 2px 8px;
  border-radius: 3px;
}
.stamp-investigation {
  border: 1px solid #4499ff;
  color: #4499ff;
  background: rgba(68, 153, 255, 0.08);
}
.stamp-tempered {
  border: 1px solid #cc77ff;
  color: #cc77ff;
  background: rgba(200, 120, 255, 0.08);
}

/* Attempts counter */
.hqr-attempts {
  display: flex;
  align-items: baseline;
  gap: 2px;
  flex-shrink: 0;
  text-align: right;
}
.hqr-attempts-used { font-size: 20px; font-weight: bold; color: #ff6b6b; line-height: 1; }
.hqr-attempts-sep  { font-size: 14px; color: #5a3d1f; }
.hqr-attempts-total { font-size: 14px; color: #7c5a2b; }
.hqr-attempts-label {
  font-size: 9px;
  color: #5a3d1f;
  letter-spacing: 1px;
  text-transform: uppercase;
  margin-left: 2px;
}

/* ══════════════════════════════════════════
   CONFIRM MODAL
══════════════════════════════════════════ */
.hq-confirm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(5, 4, 2, 0.8);
  backdrop-filter: blur(10px) brightness(0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 300;
  padding: 16px;
}
.hq-confirm-modal {
  width: min(420px, 100%);
  padding: 24px;
  border-radius: 12px;
  background: linear-gradient(160deg, #1c1508, #13100a, #1c1508);
  border: 2px solid #8c3a3a;
  box-shadow: 0 0 40px rgba(0, 0, 0, 0.9), 0 0 20px rgba(200, 60, 60, 0.12);
  display: flex;
  flex-direction: column;
  gap: 14px;
  animation: hqModalIn 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
  font-family: 'Georgia', serif;
}
@keyframes hqModalIn {
  from { transform: scale(0.85); opacity: 0; }
  to   { transform: scale(1);    opacity: 1; }
}
.hq-confirm-stamp {
  text-align: center;
  font-size: 9px;
  letter-spacing: 5px;
  text-transform: uppercase;
  color: #ff6b6b;
  border: 1px solid rgba(200, 60, 60, 0.35);
  border-radius: 4px;
  padding: 4px 14px;
  width: fit-content;
  margin: 0 auto;
  background: rgba(200, 60, 60, 0.07);
}
.hq-confirm-question {
  margin: 0;
  font-size: 17px;
  color: #ffd27a;
  text-align: center;
}
.hq-confirm-desc {
  margin: 0;
  font-size: 12px;
  color: #7c5a2b;
  text-align: center;
  font-style: italic;
  line-height: 1.6;
}
.hq-confirm-btns { display: flex; gap: 10px; }
.hq-btn-confirm {
  flex: 1;
  padding: 13px;
  border-radius: 8px;
  border: 2px solid #8c3a3a;
  background: linear-gradient(to bottom, #3a1a1a, #1a0d0d);
  color: #ff6b6b;
  font-family: 'Georgia', serif;
  font-size: 14px;
  font-weight: bold;
  letter-spacing: 1px;
  cursor: pointer;
  transition: 0.2s;
  min-height: 48px;
}
.hq-btn-confirm:hover {
  box-shadow: 0 0 16px rgba(255, 80, 80, 0.4);
  border-color: #cc4444;
}
.hq-btn-cancel {
  padding: 13px 16px;
  border-radius: 8px;
  border: 1px solid rgba(124, 90, 43, 0.4);
  background: rgba(10, 8, 4, 0.6);
  color: #7c5a2b;
  font-family: 'Georgia', serif;
  font-size: 13px;
  cursor: pointer;
  transition: 0.2s;
  min-height: 48px;
}
.hq-btn-cancel:hover { color: #a88040; }

/* ══════════════════════════════════════════
   CAMP ACTIONS
══════════════════════════════════════════ */
.hq-camp-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 16px;
  border-radius: 8px;
  background: linear-gradient(to right, rgba(40, 28, 14, 0.9), rgba(20, 15, 8, 0.9));
  border: 1px solid rgba(124, 90, 43, 0.5);
  border-left: 3px solid #c89b3c;
}

.hq-camp-label {
  font-size: 9px;
  letter-spacing: 4px;
  text-transform: uppercase;
  color: #7c5a2b;
}

.hq-camp-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.hq-camp-day {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.hq-camp-day-num {
  font-size: 32px;
  font-weight: bold;
  color: #ffd27a;
  line-height: 1;
  text-shadow: 0 0 12px rgba(255, 210, 100, 0.4);
}

.hq-camp-day-text {
  font-size: 11px;
  color: #a88040;
  letter-spacing: 2px;
}

.btn-add-day {
  padding: 8px 18px;
  border-radius: 6px;
  border: 1px solid #c89b3c;
  background: linear-gradient(to bottom, #2a1f0a, #1a1208);
  color: #ffd27a;
  font-family: inherit;
  font-size: 13px;
  font-weight: bold;
  letter-spacing: 1px;
  cursor: pointer;
  transition: 0.2s;
  min-height: 38px;
}

.btn-add-day:hover {
  background: linear-gradient(to bottom, #3a2d10, #221908);
  box-shadow: 0 0 12px rgba(200, 155, 60, 0.3);
}

/* ══════════════════════════════════════════
   RESPONSIVE
══════════════════════════════════════════ */
@media (max-width: 480px) {
  .hq-title { font-size: 14px; letter-spacing: 2px; }
  .hq-quest-row { padding: 8px 10px; gap: 8px; }
  .hqr-img { width: 36px; height: 36px; }
  .hqr-monster { font-size: 13px; }
  .hqr-attempts-used { font-size: 17px; }
  .hq-confirm-modal { padding: 18px 16px; }
  .hq-confirm-btns { flex-direction: column; }
  .hq-action-bar { flex-direction: column; align-items: flex-start; }
  .btn-reset { width: 100%; justify-content: center; }
}

/* ══════════════════════════════════════════
   LOCATION GRID
══════════════════════════════════════════ */
.hq-location-grid {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.hq-loc-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 10px;
  border: 1px solid rgba(124, 90, 43, 0.35);
  background: linear-gradient(135deg, rgba(20, 14, 6, 0.88), rgba(10, 8, 4, 0.92));
  cursor: pointer;
  transition: all 0.18s;
}

.hq-loc-card:hover {
  border-color: rgba(200, 155, 60, 0.6);
  background: linear-gradient(135deg, rgba(32, 22, 8, 0.95), rgba(16, 12, 5, 0.98));
  box-shadow: 0 0 12px rgba(200, 155, 60, 0.1);
  transform: translateX(3px);
}

.hq-loc-card.loc-disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.hq-loc-card.loc-disabled:hover {
  transform: none;
  border-color: rgba(124, 90, 43, 0.35);
  box-shadow: none;
}

.hq-loc-poogie {
  border-color: rgba(200, 120, 160, 0.2);
}
.hq-loc-poogie:hover {
  border-color: rgba(220, 150, 190, 0.5);
  box-shadow: 0 0 10px rgba(200, 120, 160, 0.1);
}

.hq-loc-icon {
  font-size: 22px;
  width: 32px;
  text-align: center;
  flex-shrink: 0;
}

.hq-loc-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.hq-loc-name {
  font-size: 14px;
  color: #f0ddb0;
  font-family: 'Georgia', serif;
  letter-spacing: 0.5px;
}

.hq-loc-sub {
  font-size: 11px;
  color: #7c5a2b;
  font-style: italic;
}

.hq-loc-arrow {
  font-size: 20px;
  color: rgba(124, 90, 43, 0.5);
  flex-shrink: 0;
  transition: color 0.15s;
}
.hq-loc-card:hover .hq-loc-arrow { color: #c89b3c; }

/* Back button */
.hq-back-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border-radius: 8px;
  border: 1px solid rgba(124, 90, 43, 0.4);
  background: rgba(124, 90, 43, 0.08);
  color: #a88040;
  font-size: 13px;
  font-family: 'Georgia', serif;
  cursor: pointer;
  transition: all 0.15s;
  align-self: flex-start;
}
.hq-back-btn:hover {
  border-color: #c89b3c;
  color: #ffd27a;
  background: rgba(200, 155, 60, 0.12);
}

/* ══════════════════════════════════════════
   ACTIVITY CARDS
══════════════════════════════════════════ */
.hq-activity-card {
  border-radius: 10px;
  border: 1px solid rgba(124, 90, 43, 0.4);
  background: linear-gradient(160deg, rgba(20, 14, 6, 0.9), rgba(10, 8, 4, 0.95));
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.hqa-flavor {
  border-color: rgba(90, 60, 43, 0.35);
  background: linear-gradient(160deg, rgba(16, 10, 5, 0.88), rgba(8, 6, 3, 0.92));
}

.hqa-stamp {
  font-size: 9px;
  letter-spacing: 3px;
  text-transform: uppercase;
  color: #c89b3c;
  text-shadow: 0 0 8px rgba(200, 155, 60, 0.3);
}

.hqa-desc {
  margin: 0;
  font-size: 13px;
  color: #a88040;
  line-height: 1.6;
  font-style: italic;
}

.hqa-btn-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.hqa-btn {
  padding: 8px 16px;
  border-radius: 8px;
  border: 1px solid rgba(124, 90, 43, 0.5);
  background: rgba(124, 90, 43, 0.08);
  color: #c89b3c;
  font-size: 13px;
  font-family: 'Georgia', serif;
  cursor: pointer;
  transition: all 0.15s;
  letter-spacing: 0.5px;
}
.hqa-btn:hover:not(:disabled) {
  border-color: #c89b3c;
  background: rgba(200, 155, 60, 0.14);
  color: #ffd27a;
}
.hqa-btn:disabled { opacity: 0.35; cursor: not-allowed; }

.hqa-btn-claim {
  border-color: rgba(0, 200, 150, 0.5);
  background: rgba(0, 200, 150, 0.07);
  color: #00c896;
}
.hqa-btn-claim:hover:not(:disabled) {
  background: rgba(0, 200, 150, 0.14);
  color: #00ffbe;
}

.hqa-btn-reset {
  border-color: rgba(124, 90, 43, 0.3);
  color: #7c5a2b;
}

/* ── Resource Center ── */
.rc-card { gap: 14px; }

.rc-roll-phase, .rc-claim-phase {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.rc-sub {
  font-size: 11px;
  color: #a88040;
  margin: 0;
}

.rc-section-label {
  font-size: 9px;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: #7c5a2b;
  margin: 0;
}

.rc-dice-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: center;
}

@keyframes rc-dice-shake {
  0%   { transform: rotate(-18deg) scale(1.15); }
  20%  { transform: rotate(14deg)  scale(1.2);  }
  40%  { transform: rotate(-10deg) scale(1.15); }
  60%  { transform: rotate(8deg)   scale(1.18); }
  80%  { transform: rotate(-5deg)  scale(1.12); }
  100% { transform: rotate(0deg)   scale(1);    }
}

.rc-die {
  width: 64px;
  height: 64px;
  border-radius: 12px;
  background: #f5f0e8;
  border: 2px solid rgba(90, 61, 31, 0.4);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255,255,255,0.8);
  cursor: pointer;
  padding: 6px;
  transition: border-color 0.15s;
}
.rc-die:hover  { border-color: #c89b3c; box-shadow: 0 0 12px rgba(200, 155, 60, 0.4), 0 2px 8px rgba(0,0,0,0.5); }
.rc-die.rolling {
  animation: rc-dice-shake 0.12s ease-in-out infinite;
  border-color: #c89b3c;
  box-shadow: 0 0 18px rgba(200, 155, 60, 0.6), 0 2px 8px rgba(0,0,0,0.5);
  cursor: default;
}

.rc-die-face {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
  width: 100%;
  height: 100%;
}

.rc-die-dot { border-radius: 50%; background: transparent; }
.rc-die-dot.visible { background: #1a1208; box-shadow: 0 1px 2px rgba(0,0,0,0.4); }

.rc-roll-actions {
  display: flex;
  gap: 10px;
}

.rc-btn-primary {
  flex: 1;
  padding: 13px;
  border-radius: 10px;
  border: 1px solid #c89b3c;
  background: linear-gradient(135deg, #3a2808, #1e1604);
  color: #ffd27a;
  font-family: 'Georgia', serif;
  font-size: 13px;
  letter-spacing: 1px;
  cursor: pointer;
  transition: all 0.2s;
}
.rc-btn-primary:hover:not(:disabled) {
  background: linear-gradient(135deg, #4a3510, #2e2008);
  box-shadow: 0 0 14px rgba(200, 155, 60, 0.3);
}
.rc-btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }

.rc-btn-secondary {
  flex: 1;
  padding: 10px;
  border-radius: 8px;
  border: 1px solid rgba(124, 90, 43, 0.5);
  background: transparent;
  color: #c89b3c;
  font-family: 'Georgia', serif;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}
.rc-btn-secondary:hover:not(:disabled) { color: #ffd27a; border-color: #c89b3c; }
.rc-btn-secondary:disabled { opacity: 0.4; cursor: not-allowed; }
.rc-btn-reset { flex: none; align-self: flex-start; }

/* Chips */
.rc-chips-wrap {
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(10, 8, 4, 0.8);
  border: 1px solid rgba(90, 61, 31, 0.4);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.rc-chips-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }

.rc-die-chip {
  width: 38px;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  border: 1px solid rgba(90, 61, 31, 0.5);
  background: rgba(20, 14, 6, 0.9);
  font-size: 16px;
  font-weight: bold;
  color: #c89b3c;
  cursor: pointer;
  transition: all 0.15s;
  user-select: none;
}
.rc-die-chip:hover:not(.chip-spent) { border-color: #c89b3c; }
.rc-die-chip.chip-selected {
  border-color: #ffd27a;
  color: #ffd27a;
  background: rgba(60, 40, 10, 0.9);
  box-shadow: 0 0 10px rgba(255, 210, 122, 0.35);
}
.rc-die-chip.chip-spent {
  opacity: 0.25;
  cursor: default;
  pointer-events: none;
}

.rc-sum-badge {
  font-size: 14px;
  font-weight: bold;
  color: #ffd27a;
  letter-spacing: 1px;
}

.rc-sum-hint {
  font-size: 11px;
  color: #a88040;
  margin: 0;
}

.rc-staged {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(10, 30, 10, 0.5);
  border: 1px solid rgba(0, 200, 100, 0.25);
}

.rc-staged-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.rc-staged-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.rc-staged-qty {
  font-size: 13px;
  font-weight: bold;
  color: #00c896;
}

.rc-confirm-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.rc-skip-hint {
  font-size: 11px;
  color: #7c5a2b;
  margin: 0;
  text-align: center;
  font-style: italic;
}

/* Reward table */
.rc-table {
  display: flex;
  flex-direction: column;
  gap: 4px;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid rgba(90, 61, 31, 0.4);
}

.rc-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: rgba(14, 10, 4, 0.8);
  border-bottom: 1px solid rgba(60, 40, 15, 0.4);
  transition: all 0.15s;
  cursor: default;
}
.rc-row:last-child { border-bottom: none; }

.rc-row-match {
  background: rgba(40, 28, 8, 0.95);
  border-color: rgba(200, 155, 60, 0.4);
  cursor: pointer;
  box-shadow: inset 0 0 16px rgba(200, 155, 60, 0.12);
}
.rc-row-match:hover {
  background: rgba(55, 38, 10, 0.95);
  box-shadow: inset 0 0 22px rgba(200, 155, 60, 0.2);
}
.rc-row-locked { opacity: 0.4; }

.rc-row-num {
  min-width: 22px;
  font-size: 12px;
  font-weight: bold;
  color: #7c5a2b;
  text-align: center;
}
.rc-row-match .rc-row-num { color: #ffd27a; }

.rc-row-item { display: flex; align-items: center; gap: 8px; flex: 1; }

.rc-item-img {
  width: 28px;
  height: 28px;
  object-fit: contain;
  border-radius: 4px;
  background: rgba(0,0,0,0.3);
}

.rc-item-name { font-size: 12px; color: #c8a060; flex: 1; }
.rc-row-match .rc-item-name { color: #ffd27a; }

/* ── Provisions Stockpile ── */
.hqa-trade-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.hqa-trade-card {
  padding: 14px 10px;
  border-radius: 8px;
  border: 1px solid rgba(124, 90, 43, 0.4);
  background: rgba(14, 10, 4, 0.7);
  text-align: center;
  cursor: pointer;
  transition: all 0.15s;
  display: flex;
  flex-direction: column;
  gap: 4px;
  position: relative;
}
.hqa-trade-card:hover:not(.disabled) {
  border-color: #c89b3c;
  background: rgba(40, 28, 10, 0.8);
}
.hqa-trade-card.disabled { opacity: 0.45; cursor: not-allowed; }

.htc-cost { font-size: 12px; color: #e08060; }
.htc-arrow { font-size: 16px; color: #7c5a2b; }
.htc-gain  { font-size: 13px; color: #f0ddb0; font-weight: bold; }
.htc-lock  { font-size: 10px; color: #5a3d1f; font-style: italic; }

/* Trade modal */
.hq-trade-modal { max-width: 680px; width: 94vw; max-height: 88vh; overflow-y: auto; display: flex; flex-direction: column; gap: 14px; }

/* Give section */
.trade-give-section, .trade-receive-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.trade-give-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.trade-give-label {
  font-size: 10px;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: #7c5a2b;
}

.trade-give-count {
  font-size: 13px;
  font-weight: bold;
  color: #a88040;
  transition: color 0.2s;
}
.trade-give-count.full { color: #00c896; }

.trade-give-list {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px;
  max-height: 220px;
  overflow-y: auto;
  padding-right: 2px;
}

.trade-give-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 7px;
  background: rgba(14, 10, 4, 0.7);
  border: 1px solid rgba(90, 61, 31, 0.3);
}

.trade-give-name {
  flex: 1;
  font-size: 12px;
  color: #d4b87a;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.trade-give-owned {
  font-size: 10px;
  color: #5a3d1f;
  white-space: nowrap;
}

.trade-give-ctrl {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.tgc-btn {
  width: 22px;
  height: 22px;
  border-radius: 4px;
  border: 1px solid rgba(124, 90, 43, 0.4);
  background: rgba(0,0,0,0.3);
  color: #a88040;
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.12s;
  line-height: 1;
}
.tgc-btn:hover:not(:disabled) { border-color: #c89b3c; color: #ffd27a; }
.tgc-btn:disabled { opacity: 0.3; cursor: not-allowed; }

.tgc-qty {
  min-width: 20px;
  text-align: center;
  font-size: 13px;
  font-weight: bold;
  color: #f0ddb0;
}

/* Search */
.trade-search-input {
  width: 100%;
  box-sizing: border-box;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(124, 90, 43, 0.4);
  border-radius: 6px;
  padding: 7px 10px;
  font-size: 12px;
  color: #f0ddb0;
  outline: none;
}
.trade-search-input:focus { border-color: rgba(200, 155, 60, 0.6); }
.trade-search-input::placeholder { color: #5a3d1f; }

.trade-no-give-results {
  font-size: 12px;
  color: #5a3d1f;
  font-style: italic;
  padding: 8px 4px;
}

.trade-no-results {
  grid-column: 1 / -1;
  text-align: center;
  font-size: 12px;
  color: #5a3d1f;
  font-style: italic;
  padding: 12px;
}

/* Receive grid */
.hq-trade-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  max-height: 260px;
  overflow-y: auto;
}

.hq-trade-item {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  gap: 4px;
  padding: 8px 4px;
  border-radius: 7px;
  border: 1px solid rgba(124, 90, 43, 0.3);
  background: rgba(20, 14, 6, 0.8);
  cursor: pointer;
  transition: all 0.15s;
  text-align: center;
}
.hq-trade-item:hover { border-color: #c89b3c; background: rgba(40, 28, 10, 0.9); }
.hq-trade-item.chosen {
  border-color: #00c896;
  background: rgba(0, 200, 150, 0.08);
  box-shadow: 0 0 8px rgba(0, 200, 150, 0.2);
}

.hq-trade-img  { width: 30px; height: 30px; object-fit: contain; flex-shrink: 0; }
.hq-trade-name { font-size: 12px; color: #c4a060; line-height: 1.3; text-align: left; }

/* ── Meowscular Chef ── */
.hqa-flavor-sub  { margin: 0 0 8px; font-size: 12px; color: #a88040; }
.hqa-flavor-en   { font-size: 11px; color: #5a3d1f; }
.hqa-flavor-tip  { margin: 4px 0 0; font-size: 12px; color: #a88040; background: rgba(200,155,60,0.06); padding: 8px 10px; border-radius: 6px; border-left: 2px solid rgba(200,155,60,0.3); }

.hqa-elem-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.hqa-elem-chip {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid rgba(124, 90, 43, 0.3);
  background: rgba(14, 10, 4, 0.7);
  cursor: pointer;
  font-size: 12px;
  color: #c4a060;
  transition: all 0.15s;
}
.hqa-elem-chip:hover { border-color: #c89b3c; }
.hqa-elem-chip.chosen {
  border-color: rgba(200, 155, 60, 0.7);
  background: rgba(200, 155, 60, 0.12);
  color: #ffd27a;
}

.hqa-elem-icon { width: 22px; height: 22px; object-fit: contain; }

.hqa-flavor-result {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.hqa-flavor-result p { margin: 0; font-size: 13px; color: #a88040; font-style: italic; }
.hqa-flavor-result .hqa-elem-icon { width: 28px; height: 28px; }

/* ── Pet the Poogie ── */
.hqa-poogie { border-color: rgba(200, 120, 160, 0.25); }
.hqa-btn-poogie {
  border-color: rgba(200, 120, 160, 0.4);
  color: #d47ab0;
}
.hqa-btn-poogie:hover {
  border-color: rgba(220, 150, 190, 0.7);
  background: rgba(200, 120, 160, 0.1);
  color: #f0a0d0;
}

.hqa-poogie-result {
  font-size: 14px;
  color: #d47ab0;
  text-align: center;
  margin: 0;
  letter-spacing: 1px;
}

/* ── Fade transition ── */
.hqa-fade-enter-active { animation: hqaFadeIn 0.3s ease-out; }
@keyframes hqaFadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; } }

@media (max-width: 480px) {
  .hqa-trade-row { grid-template-columns: 1fr; }
  .hq-trade-grid { grid-template-columns: 1fr; }
  .trade-give-list { grid-template-columns: 1fr; }
}
</style>
