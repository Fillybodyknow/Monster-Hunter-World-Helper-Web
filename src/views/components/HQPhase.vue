<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { hunter, loadHunter, saveHunter } from '@/stores/hunter'
import { useRoomStore } from '@/stores/room'
import resourceData from '@/assets/files/resource.json'
import monsterInfoData from '@/assets/files/monster_info.json'
import elementalData from '@/assets/files/elemental.json'
import hunterClassData from '@/assets/files/class_hunter.json'
import { openCraftLookup } from '@/composables/useCraftLookup'

const props = defineProps({ maxActions: { type: Number, default: 3 } })
const emit = defineEmits(['allReady'])
const room = useRoomStore()
const getImg = (path) => `${import.meta.env.BASE_URL}${path}`

onMounted(loadHunter)

// ─── Helpers ──────────────────────────────────────────────────────────────────
const _resMap = new Map()
resourceData.forEach(group => {
  group.resources.forEach(item => {
    _resMap.set(`${group.resource_type_id}-${item.item_id}`, { ...item, resource_type_id: group.resource_type_id })
  })
})
const lookupResource = (typeId, itemId) => _resMap.get(`${typeId}-${itemId}`) ?? null
const getResource = lookupResource

const allCommonResources = resourceData
  .find(r => r.resource_type_id === 1)?.resources
  .map(r => ({ resource_type_id: 1, item_id: r.item_id, ...r })) ?? []

const getHunterClass = (id) => hunterClassData.find((c) => c.hunter_class_id === id)

// ─── Locations ────────────────────────────────────────────────────────────────
// tags = ป้ายสั้น ๆ บอกว่า "ได้อะไร" อ่านปราดเดียวรู้ ไม่ต้องอ่านทั้งประโยค
const LOCATIONS = [
  { id: 'resource',   name: 'Resource Center',      icon: '🎲', tags: ['🎲 ทอย 2', '📦 Resource'] },
  { id: 'provisions', name: 'Provisions Stockpile', icon: '⚖',  tags: ['⇄ แลกของ', '🦴 Monster Part'] },
  { id: 'chef',       name: 'Meowscular Chef',      icon: '🍖', tags: ['🔥 Element Token'] },
  { id: 'lodge',      name: "Hunter's Lodge",       icon: '🐱', tags: ['🐱 เลือก Palico', '💰 จ้างเพิ่ม'] },
  { id: 'poogie',     name: 'Pet the Poogie',       icon: '🐷', tags: ['🍀 เสี่ยงโชค'] },
]

// ─── Visit state ──────────────────────────────────────────────────────────────
const MAX_VISITS = computed(() => props.maxActions)
const activeLocation = ref(null)   // null | location id
const myDoneList    = ref([])      // completed location ids

const myVisitCount = computed(() => myDoneList.value.length)
const canVisit = (id) => myVisitCount.value < MAX_VISITS.value && !myDoneList.value.includes(id) && !activeLocation.value
const isMyDone = (id) => myDoneList.value.includes(id)

// แถบเดินทาง — ช่องละ 1 สิทธิ์ เรียงตามลำดับที่เข้าไปจริง ช่องว่างคือที่ที่ยังเหลือ
// โชว์ค้างไว้ตลอดรวมถึงตอนอยู่ในสถานที่ ผู้เล่นจะได้ตัดสินใจโดยรู้ว่าเหลืออีกกี่สิทธิ์
const visitSlots = computed(() =>
  Array.from({ length: MAX_VISITS.value }, (_, i) => {
    const id = myDoneList.value[i]
    return id ? (LOCATIONS.find((l) => l.id === id) ?? null) : null
  }),
)

// แยกที่ที่ยังเข้าได้ออกจากที่ที่จบไปแล้ว — ที่ที่กดไม่ได้ไม่ควรกินพื้นที่เท่ากัน
const openLocations = computed(() => LOCATIONS.filter((l) => canVisit(l.id)))
const closedLocations = computed(() => LOCATIONS.filter((l) => !canVisit(l.id)))
const lockReason = (id) => (isMyDone(id) ? 'เข้าไปแล้ว' : 'ใช้สิทธิ์ครบแล้ว')

// Reconnect: restore from Firebase
watch(() => room.hqState[room.myHunterId], (state) => {
  if (!state) return
  const fb = state.done
  if (fb && Array.isArray(fb)) myDoneList.value = fb
  else if (fb && typeof fb === 'object') myDoneList.value = Object.values(fb)
}, { immediate: true })

const enterLocation = (id) => {
  if (!canVisit(id)) return
  activeLocation.value = id
  if (room.inRoom) room.setHqCurrent(id)
}

const leaveLocation = () => {
  if (activeLocation.value === 'provisions' && provisionsTraded.value) {
    completeLocation()
    return
  }
  // Lodge นับสิทธิ์เฉพาะตอนจ้าง Palico สำเร็จ (confirmLodgeHire) — เข้ามาดูเฉย ๆ แล้วออกไม่หัก
  const id = activeLocation.value
  activeLocation.value = null
  if (room.inRoom) room.setHqCurrent(null)
  resetActivityState(id)
}

const completeLocation = () => {
  const id = activeLocation.value
  if (id && !myDoneList.value.includes(id)) {
    myDoneList.value = [...myDoneList.value, id]
    if (room.inRoom) room.setHqDoneList(myDoneList.value)
  }
  activeLocation.value = null
  if (room.inRoom) room.setHqCurrent(null)
  resetActivityState(id)
}

const resetActivityState = (id) => {
  if (id === 'resource') rcReset()
  if (id === 'provisions') { provisionsTraded.value = false; tradeOpen.value = false }
  if (id === 'chef') { chefChosenElement.value = null; chefDone.value = false }
  if (id === 'poogie') poogiePatted.value = false
}

// Ready for quest
const myReady = computed(() => !!room.hqState[room.myHunterId]?.ready)
const voteReady = () => {
  if (room.inRoom) room.setHqReady(true)
  else _localReady.value = true
}
const _localReady = ref(false)
const isReady = computed(() => room.inRoom ? myReady.value : _localReady.value)

watch([isReady], ([ready]) => {
  if (!ready) return
  if (!room.inRoom) { emit('allReady'); return }
  // allHqReady watcher in Quest.vue handles the actual transition
})

// Hunter presence helpers (from Firebase)
// คืนตัว hunter ไม่ใช่ชื่อ — ป้ายในการ์ดใช้ไอคอนคลาส ชื่อยาว ๆ 4 คนล้นการ์ด
const _hunterById = (hId) => room.hunters.find(h => String(h.hunter_id) === String(hId)) ?? null

const hunterAtLocation = (locId) => {
  if (!room.inRoom) return []
  return Object.entries(room.hqState)
    .filter(([hId, s]) => s?.current === locId && hId !== room.myHunterId)
    .map(([hId]) => _hunterById(hId))
    .filter(Boolean)
}
const huntersDoneAt = (locId) => {
  if (!room.inRoom) return []
  return Object.entries(room.hqState)
    .filter(([hId, s]) => {
      if (String(hId) === String(room.myHunterId)) return false
      const done = s?.done
      if (!done) return false
      const arr = Array.isArray(done) ? done : Object.values(done)
      return arr.includes(locId)
    })
    .map(([hId]) => _hunterById(hId))
    .filter(Boolean)
}
const hunterReadyList = computed(() => {
  if (!room.inRoom) return []
  return Object.entries(room.hqState)
    .filter(([, s]) => s?.ready)
    .map(([hId]) => room.hunters.find(h => String(h.hunter_id) === String(hId))?.hunter_name ?? hId)
})

// ─── Resource Center ─────────────────────────────────────────────────────────
const RC_REWARD_TABLE = {
  2:  { resource_type_id: 1, item_id: 1  },
  3:  { resource_type_id: 1, item_id: 2  },
  4:  { resource_type_id: 1, item_id: 3  },
  5:  { resource_type_id: 1, item_id: 4  },
  6:  { resource_type_id: 1, item_id: 7  },
  7:  { resource_type_id: 1, item_id: 8  },
  8:  { resource_type_id: 1, item_id: 14 },
  9:  { resource_type_id: 1, item_id: 5  },
  10: { resource_type_id: 1, item_id: 11 },
  11: { resource_type_id: 2, item_id: 3  },
  12: { resource_type_id: 2, item_id: 2  },
}
const dotPatterns = { 1:[4], 2:[2,6], 3:[2,4,6], 4:[0,2,6,8], 5:[0,2,4,6,8], 6:[0,2,3,5,6,8] }

const rcPhase           = ref('roll')
const rcHasRolled       = ref(false)
const rcDice            = ref([{ id: 0, value: 1, spent: false }, { id: 1, value: 1, spent: false }])
const rcRolling         = ref(new Set())
const rcSelectedDiceIds = ref([])
const rcStagedRewards   = ref([])

const rcIsRolling   = computed(() => rcRolling.value.size > 0)
const rcSelectedSum = computed(() =>
  rcSelectedDiceIds.value.reduce((s, id) => {
    const d = rcDice.value.find(d => d.id === id)
    return s + (d?.value ?? 0)
  }, 0)
)
const rcAllDiceSpent = computed(() => rcDice.value.every(d => d.spent))
const rcRewardTable  = computed(() =>
  Object.entries(RC_REWARD_TABLE).map(([num, r]) => {
    const meta = getResource(r.resource_type_id, r.item_id)
    return { num: Number(num), ...r, ...meta }
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
  rcHasRolled.value = true
  const vals = [Math.ceil(Math.random() * 6), Math.ceil(Math.random() * 6)]
  vals.forEach((val, i) => setTimeout(() => rcAnimateDie(i, val), i * 100))
}
const rcToggleDie = (id) => {
  const die = rcDice.value.find(d => d.id === id)
  if (!die || die.spent) return
  rcSelectedDiceIds.value = rcSelectedDiceIds.value.includes(id)
    ? rcSelectedDiceIds.value.filter(x => x !== id)
    : [...rcSelectedDiceIds.value, id]
}
const rcClaimReward = (row) => {
  if (rcSelectedDiceIds.value.length === 0 || row.num !== rcSelectedSum.value) return
  const existing = rcStagedRewards.value.find(r => r.resource_type_id === row.resource_type_id && r.item_id === row.item_id)
  if (existing) existing.quantity++
  else rcStagedRewards.value = [...rcStagedRewards.value, { ...row, quantity: 1 }]
  rcDice.value = rcDice.value.map(d => rcSelectedDiceIds.value.includes(d.id) ? { ...d, spent: true } : d)
  rcSelectedDiceIds.value = []
}
const rcUseResult = () => {
  if (rcIsRolling.value) return
  rcSelectedDiceIds.value = []
  rcPhase.value = 'claim'
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
  completeLocation()
}
const rcReset = () => {
  rcPhase.value = 'roll'
  rcHasRolled.value = false
  rcDice.value = [{ id: 0, value: 1, spent: false }, { id: 1, value: 1, spent: false }]
  rcSelectedDiceIds.value = []
  rcStagedRewards.value = []
}

// ─── Provisions Stockpile ────────────────────────────────────────────────────
const provisionsTraded  = ref(false)
const tradeOpen         = ref(false)
const tradeMode         = ref(null)
const tradeChosenItem   = ref(null)
const tradeGiveSelection = ref({})
const tradeSearch       = ref('')
const tradeGiveSearch   = ref('')

const totalCommons = computed(() => {
  if (!hunter.value) return 0
  return (hunter.value.inventory ?? []).filter(i => i.resource_type_id === 1).reduce((s, i) => s + i.quantity, 0)
})
const totalInventory = computed(() => (hunter.value?.inventory ?? []).reduce((s, i) => s + i.quantity, 0))
const tradeCost = computed(() => tradeMode.value === 'common' ? 3 : 10)
const tradeGiveTotal = computed(() => Object.values(tradeGiveSelection.value).reduce((s, q) => s + q, 0))
const tradeReady = computed(() => tradeGiveTotal.value === tradeCost.value && !!tradeChosenItem.value)

const clearedMonsterIds = computed(() =>
  (hunter.value?.attempted_quest ?? []).filter(a => a.quest_id === 1 && a.attempted >= 1).map(a => a.monster_id)
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
  (hunter.value?.inventory ?? []).filter(i => i.resource_type_id === 1 && i.quantity > 0)
    .map(i => { const meta = lookupResource(1, i.item_id); return { resource_type_id: 1, item_id: i.item_id, quantity: i.quantity, item: meta?.item ?? '', thumbnail: meta?.thumbnail ?? '' } })
)
const inventoryAll = computed(() =>
  (hunter.value?.inventory ?? []).filter(i => i.quantity > 0)
    .map(i => { const meta = lookupResource(i.resource_type_id, i.item_id); return { ...i, item: meta?.item ?? '', thumbnail: meta?.thumbnail ?? '' } })
)
const filteredReceiveItems = computed(() => {
  const base = tradeMode.value === 'common' ? allCommonResources : tradeRareOptions.value
  return tradeSearch.value ? base.filter(i => i.item.toLowerCase().includes(tradeSearch.value.toLowerCase())) : base
})
const filteredGiveItems = computed(() => {
  const base = tradeMode.value === 'common' ? inventoryCommons.value : inventoryAll.value
  return tradeGiveSearch.value ? base.filter(i => i.item.toLowerCase().includes(tradeGiveSearch.value.toLowerCase())) : base
})
const openTrade = (mode) => {
  tradeMode.value = mode; tradeChosenItem.value = null; tradeGiveSelection.value = {}
  tradeSearch.value = ''; tradeGiveSearch.value = ''; tradeOpen.value = true
}

// ถอยกลับไปหน้าเมนูของ Provisions ไม่ใช่ออกจากสถานที่
const closeTrade = () => { tradeOpen.value = false }
const adjustGive = (item, delta) => {
  const key = `${item.resource_type_id}-${item.item_id}`
  const current = tradeGiveSelection.value[key] ?? 0
  const otherTotal = tradeGiveTotal.value - current
  let newVal = delta > 0 ? Math.min(current + delta, item.quantity, tradeCost.value - otherTotal) : Math.max(0, current + delta)
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
  provisionsTraded.value = true
  tradeOpen.value = false
  tradeGiveSelection.value = {}
  tradeChosenItem.value = null
}

// ─── Meowscular Chef ─────────────────────────────────────────────────────────
const chefChosenElement = ref(null)
const chefDone          = ref(false)
const chefConfirm = () => { if (chefChosenElement.value) chefDone.value = true }

// ─── Hunter's Lodge ──────────────────────────────────────────────────────────
const showLodgeHireModal = ref(false)
const lodgeHireSelection  = ref({})
const lodgeHireSearch     = ref('')

const lodgeHireTotal = computed(() =>
  Object.values(lodgeHireSelection.value).reduce((s, q) => s + q, 0)
)
const lodgeHireReady = computed(() => lodgeHireTotal.value === 4)

const filteredLodgeHireItems = computed(() => {
  if (!lodgeHireSearch.value) return inventoryAll.value
  return inventoryAll.value.filter(i => i.item.toLowerCase().includes(lodgeHireSearch.value.toLowerCase()))
})

const openLodgeHireModal = () => {
  lodgeHireSelection.value = {}
  lodgeHireSearch.value = ''
  showLodgeHireModal.value = true
}

const adjustLodgeHire = (item, delta) => {
  const key = `${item.resource_type_id}-${item.item_id}`
  const current = lodgeHireSelection.value[key] ?? 0
  const otherTotal = lodgeHireTotal.value - current
  let newVal
  if (delta > 0) newVal = Math.min(current + delta, item.quantity, 4 - otherTotal)
  else newVal = Math.max(0, current + delta)
  const updated = { ...lodgeHireSelection.value }
  if (newVal <= 0) delete updated[key]
  else updated[key] = newVal
  lodgeHireSelection.value = updated
}

const confirmLodgeHire = () => {
  if (!lodgeHireReady.value || !hunter.value) return
  const inv = hunter.value.inventory
  Object.entries(lodgeHireSelection.value).forEach(([key, qty]) => {
    const [typeId, itemId] = key.split('-').map(Number)
    const it = inv.find(i => i.resource_type_id === typeId && i.item_id === itemId)
    if (it) it.quantity -= qty
  })
  hunter.value.inventory = inv.filter(i => i.quantity > 0)
  saveHunter(hunter.value)
  showLodgeHireModal.value = false
  completeLocation()
}

// ─── Pet the Poogie ──────────────────────────────────────────────────────────
const poogiePatted = ref(false)
</script>

<template>
  <div class="hqp-wrap">

    <!-- ─── HEADER ─── -->
    <div class="hqp-header">
      <div class="hqp-line"></div>
      <span class="hqp-title">HEAD QUARTER</span>
      <div class="hqp-line"></div>
    </div>

    <!-- ─── แถบเดินทาง — ค้างไว้ตลอด รวมถึงตอนอยู่ในสถานที่ ─── -->
    <div class="hqp-steps">
      <div
        v-for="(slot, i) in visitSlots" :key="i"
        class="hqp-step"
        :class="{ 'step-filled': !!slot }"
        :title="slot?.name ?? 'ยังว่าง'"
      >
        <span class="hqp-step-icon">{{ slot ? slot.icon : '○' }}</span>
      </div>
      <span class="hqp-steps-label">
        {{ myVisitCount >= MAX_VISITS ? 'ใช้สิทธิ์ครบแล้ว' : `เหลือ ${MAX_VISITS - myVisitCount} สิทธิ์` }}
      </span>
    </div>

    <!-- ─── PARTY PROGRESS BAR ─── -->
    <div v-if="room.inRoom" class="hqp-party-bar">
      <div
        v-for="h in room.hunters" :key="h.hunter_id"
        class="hqp-hunter-pill"
        :class="{ 'pill-ready': room.hqState[h.hunter_id]?.ready }"
        :title="h.hunter_name"
      >
        <img
          v-if="getHunterClass(h.hunter_class_id)?.thumbnail"
          :src="getImg(getHunterClass(h.hunter_class_id).thumbnail)"
          class="pill-icon"
        />
        <span class="pill-dots">
          <span
            v-for="n in MAX_VISITS" :key="n"
            class="pill-dot"
            :class="{ on: (room.hqState[h.hunter_id]?.done ? Object.values(room.hqState[h.hunter_id].done).length : 0) >= n }"
          />
        </span>
        <span v-if="room.hqState[h.hunter_id]?.ready" class="pill-done">✓</span>
      </div>
    </div>

    <!-- ─── LOCATION GRID (no active location) ─── -->
    <template v-if="!activeLocation">
      <div v-if="openLocations.length" class="hqp-loc-grid">
        <div
          v-for="loc in openLocations" :key="loc.id"
          class="hqp-loc-card loc-available"
          @click="enterLocation(loc.id)"
        >
          <span class="hqp-loc-icon">{{ loc.icon }}</span>
          <div class="hqp-loc-info">
            <span class="hqp-loc-name">{{ loc.name }}</span>
            <span class="hqp-loc-tags">
              <span v-for="t in loc.tags" :key="t" class="hqp-tag">{{ t }}</span>
            </span>
          </div>

          <!-- นักล่าคนอื่นที่อยู่/เคยอยู่ที่นี่ — ไอคอนคลาสในแถว ไม่ทับลูกศร -->
          <div v-if="hunterAtLocation(loc.id).length || huntersDoneAt(loc.id).length" class="hqp-loc-hunters">
            <img
              v-for="h in hunterAtLocation(loc.id)" :key="h.hunter_id"
              v-show="getHunterClass(h.hunter_class_id)?.thumbnail"
              :src="getImg(getHunterClass(h.hunter_class_id)?.thumbnail)"
              class="hqp-here-icon" :title="`${h.hunter_name} อยู่ที่นี่`"
            />
            <img
              v-for="h in huntersDoneAt(loc.id)" :key="'d-' + h.hunter_id"
              v-show="getHunterClass(h.hunter_class_id)?.thumbnail"
              :src="getImg(getHunterClass(h.hunter_class_id)?.thumbnail)"
              class="hqp-here-icon hqp-here-done" :title="`${h.hunter_name} เข้าไปแล้ว`"
            />
          </div>

          <span class="hqp-loc-arrow">›</span>
        </div>
      </div>

      <div v-if="closedLocations.length" class="hqp-closed">
        <div class="hqp-closed-head">
          <span class="hqp-closed-line"></span>
          <span class="hqp-closed-title">เข้าไม่ได้แล้ว</span>
          <span class="hqp-closed-line"></span>
        </div>
        <div
          v-for="loc in closedLocations" :key="loc.id"
          class="hqp-closed-row"
          :class="{ 'closed-done': isMyDone(loc.id) }"
        >
          <span class="hqp-closed-icon">{{ loc.icon }}</span>
          <span class="hqp-closed-name">{{ loc.name }}</span>
          <span class="hqp-closed-reason">{{ isMyDone(loc.id) ? '✦ ' : '' }}{{ lockReason(loc.id) }}</span>
        </div>
      </div>

      <!-- Ready button -->
      <div class="hqp-ready-wrap">
        <div v-if="!isReady && myVisitCount >= MAX_VISITS">
          <button class="hqp-btn-ready" @click="voteReady">⚔ พร้อมลุย Quest</button>
        </div>
        <div v-else-if="isReady" class="hqp-ready-status">
          <span>✦ คุณพร้อมแล้ว</span>
          <span v-if="room.inRoom" class="hqp-ready-waiting">
            — รอ {{ room.hunters.length - hunterReadyList.length }} คน
          </span>
        </div>
      </div>
    </template>

    <!-- ─── ACTIVE LOCATION ─── -->
    <template v-else>
      <button class="hqp-back-btn" @click="tradeOpen ? closeTrade() : leaveLocation()">
        {{ tradeOpen ? '‹ กลับไปหน้าแลกของ' : '‹ กลับ' }}
      </button>
      <div class="hqp-act-stamp">
        {{ tradeOpen
          ? (tradeMode === 'common' ? 'TRADE COMMON RESOURCES' : 'TRADE FOR MONSTER PART')
          : LOCATIONS.find(l => l.id === activeLocation)?.name?.toUpperCase() }}
      </div>

      <!-- Resource Center -->
      <div v-if="activeLocation === 'resource'" class="hqp-activity rc-card">
        <div v-if="rcPhase === 'roll'" class="rc-roll-phase">
          <div v-if="!rcHasRolled" class="rc-roll-actions">
            <button class="rc-btn-primary" @click="rcRollAll">🎲 ทอยเต๋า</button>
          </div>
          <template v-else>
            <div class="rc-dice-row">
              <div v-for="die in rcDice" :key="die.id" class="rc-die" :class="{ rolling: rcRolling.has(die.id) }">
                <div class="rc-die-face">
                  <span v-for="pos in 9" :key="pos" class="rc-die-dot" :class="{ visible: dotPatterns[die.value]?.includes(pos - 1) }" />
                </div>
              </div>
            </div>
            <div class="rc-roll-actions">
              <button class="rc-btn-primary" :disabled="rcIsRolling" @click="rcUseResult">ใช้ผลนี้ →</button>
            </div>
          </template>
        </div>

        <div v-else class="rc-claim-phase">
          <div class="rc-chips-wrap">
            <p class="rc-section-label">เต๋าที่ทอยได้ — เลือกเพื่อรวมค่า</p>
            <div class="rc-chips-row">
              <div v-for="die in rcDice" :key="die.id" class="rc-die-chip"
                :class="{ 'chip-selected': rcSelectedDiceIds.includes(die.id), 'chip-spent': die.spent }"
                @click="rcToggleDie(die.id)">{{ die.value }}</div>
              <div v-if="rcSelectedDiceIds.length > 0" class="rc-sum-badge">= {{ rcSelectedSum }}</div>
            </div>
            <p v-if="rcSelectedDiceIds.length > 0" class="rc-sum-hint">เลือก row {{ rcSelectedSum }} เพื่อรับ Reward</p>
          </div>
          <p class="rc-section-label">ตาราง Reward</p>
          <div class="rc-table">
            <div v-for="row in rcRewardTable" :key="row.num" class="rc-row"
              :class="{ 'rc-row-match': rcSelectedDiceIds.length > 0 && row.num === rcSelectedSum, 'rc-row-locked': rcSelectedDiceIds.length > 0 && row.num !== rcSelectedSum }"
              @click="rcClaimReward(row)">
              <span class="rc-row-num">{{ row.num }}</span>
              <div class="rc-row-item">
                <img :src="getImg(row.thumbnail)" class="rc-item-img" />
                <span class="rc-item-name">{{ row.item }}</span>
                <button class="hq-craft-btn" @click.stop="openCraftLookup(row.resource_type_id, row.item_id, row.item)" title="ดูสูตรคราฟ">🔨</button>
              </div>
            </div>
          </div>
          <div v-if="rcStagedRewards.length > 0" class="rc-staged">
            <p class="rc-section-label">รางวัลที่รอรับ</p>
            <div class="rc-staged-list">
              <div v-for="r in rcStagedRewards" :key="`${r.resource_type_id}-${r.item_id}`" class="rc-staged-item">
                <img :src="getImg(r.thumbnail)" class="rc-item-img" />
                <span class="rc-item-name">{{ r.item }}</span>
                <span class="rc-staged-qty">×{{ r.quantity }}</span>
                <button class="hq-craft-btn" @click.stop="openCraftLookup(r.resource_type_id, r.item_id, r.item)" title="ดูสูตรคราฟ">🔨</button>
              </div>
            </div>
          </div>
          <div class="rc-confirm-row">
            <p v-if="!rcAllDiceSpent" class="rc-skip-hint">ยังมีเต๋าเหลือ {{ rcDice.filter(d => !d.spent).length }} ลูก</p>
            <button class="rc-btn-primary" :disabled="rcStagedRewards.length === 0" @click="rcConfirmRewards">✦ รับรางวัลและเสร็จสิ้น</button>
          </div>
        </div>
      </div>

      <!-- Provisions Stockpile — เมนูเลือกดีล -->
      <div v-else-if="activeLocation === 'provisions' && !tradeOpen" class="hqp-activity">
        <p class="hqa-desc">แลกเปลี่ยน Common Resources เพื่อรับ Resource ที่ต้องการ</p>
        <div class="hqa-trade-row">
          <div class="hqa-trade-card" :class="{ disabled: totalCommons < 3 }" @click="totalCommons >= 3 && openTrade('common')">
            <div class="htc-cost">3 Common</div><div class="htc-arrow">→</div><div class="htc-gain">1 Common</div>
            <div v-if="totalCommons < 3" class="htc-lock">ไม่พอ ({{ totalCommons }}/3)</div>
          </div>
          <div class="hqa-trade-card" :class="{ disabled: totalInventory < 10 || clearedMonsterIds.length === 0 }"
            @click="totalInventory >= 10 && clearedMonsterIds.length > 0 && openTrade('rare')">
            <div class="htc-cost">10 Resource</div><div class="htc-arrow">→</div><div class="htc-gain">1 Monster Part</div>
            <div v-if="totalInventory < 10" class="htc-lock">ไม่พอ ({{ totalInventory }}/10)</div>
            <div v-else-if="clearedMonsterIds.length === 0" class="htc-lock">ยังไม่ผ่าน Quest</div>
          </div>
        </div>
      </div>

      <!-- Provisions Stockpile — หน้าแลกของ -->
      <div v-else-if="activeLocation === 'provisions' && tradeOpen" class="hqp-activity hqp-trade-page">
        <div class="trade-give-section">
          <div class="trade-give-header">
            <span class="trade-give-label">เลือก Resources ที่จะแลก</span>
            <span class="trade-give-count" :class="{ full: tradeGiveTotal === tradeCost }">{{ tradeGiveTotal }} / {{ tradeCost }}</span>
          </div>
          <input v-model="tradeGiveSearch" class="trade-search-input" placeholder="Search item..." />
          <div class="trade-give-list">
            <div v-if="filteredGiveItems.length === 0" class="trade-no-give-results">ไม่พบ item</div>
            <div v-for="item in filteredGiveItems" :key="`${item.resource_type_id}-${item.item_id}`" class="trade-give-row">
              <img :src="getImg(item.thumbnail)" class="hq-trade-img" />
              <span class="trade-give-name">{{ item.item }}</span>
              <span class="trade-give-owned">มี {{ item.quantity }}</span>
              <button class="hq-craft-btn" @click.stop="openCraftLookup(item.resource_type_id, item.item_id, item.item)" title="ดูสูตรคราฟ">🔨</button>
              <div class="trade-give-ctrl">
                <button class="tgc-btn" @click="adjustGive(item, -1)">−</button>
                <span class="tgc-qty">{{ tradeGiveSelection[`${item.resource_type_id}-${item.item_id}`] ?? 0 }}</span>
                <button class="tgc-btn" :disabled="tradeGiveTotal >= tradeCost || (tradeGiveSelection[`${item.resource_type_id}-${item.item_id}`] ?? 0) >= item.quantity" @click="adjustGive(item, 1)">+</button>
              </div>
            </div>
          </div>
        </div>

        <div class="trade-receive-section">
          <span class="trade-give-label">เลือก Item ที่ต้องการรับ</span>
          <input v-model="tradeSearch" class="trade-search-input" placeholder="Search item..." />
          <div class="hq-trade-grid">
            <div v-for="item in filteredReceiveItems" :key="`${item.resource_type_id}-${item.item_id}`"
              class="hq-trade-item" :class="{ chosen: tradeChosenItem?.item_id === item.item_id && tradeChosenItem?.resource_type_id === item.resource_type_id }"
              @click="tradeChosenItem = item">
              <img :src="getImg(item.thumbnail)" class="hq-trade-img" />
              <span class="hq-trade-name">{{ item.item }}</span>
              <button class="hq-craft-btn" @click.stop="openCraftLookup(item.resource_type_id, item.item_id, item.item)" title="ดูสูตรคราฟ">🔨</button>
            </div>
            <div v-if="filteredReceiveItems.length === 0" class="trade-no-results">ไม่พบ item</div>
          </div>
        </div>

      </div>

      <!-- Meowscular Chef -->
      <div v-else-if="activeLocation === 'chef'" class="hqp-activity hqa-flavor">
        <p class="hqa-desc">เชฟผู้เชี่ยวชาญจะปรุงเมนูพิเศษสำหรับการล่าครั้งถัดไป</p>
        <div v-if="!chefDone">
          <p class="hqa-flavor-sub">เลือก Element ที่ต้องการเพิ่มความต้านทาน:</p>
          <div class="hqa-elem-row">
            <div v-for="el in elementalData" :key="el.elemental_id" class="hqa-elem-chip"
              :class="{ chosen: chefChosenElement?.elemental_id === el.elemental_id }"
              @click="chefChosenElement = el">
              <img :src="getImg(el.thumbnail)" class="hqa-elem-icon" />
              <span>{{ el.elemental }}</span>
            </div>
          </div>
          <button v-if="chefChosenElement" class="hqa-btn hqa-btn-claim" @click="chefConfirm">🍖 รับ Token</button>
        </div>
        <div v-else class="hqa-flavor-result">
          <img :src="getImg(chefChosenElement.thumbnail)" class="hqa-elem-icon" />
          <p>วาง <strong>{{ chefChosenElement.elemental }} Token</strong> บนอาวุธของคุณ</p>
          <button class="hqa-btn hqa-btn-claim" @click="completeLocation">✦ เสร็จสิ้น</button>
        </div>
      </div>

      <!-- Hunter's Lodge -->
      <div v-else-if="activeLocation === 'lodge'" class="hqp-activity hqa-flavor">
        <p class="hqa-desc">{{ hunter?.palico_name }} รอคุณอยู่ที่ Lodge — เลือก Palico ที่เหมาะกับ Quest ถัดไป</p>
        <p class="hqa-flavor-tip">🐱 วางการ์ด Palico ที่เลือกไว้ข้าง Quest Card ของคุณ</p>
        <div class="lodge-divider"></div>
        <div
          class="hqa-trade-card lodge-hire-card"
          :class="{ disabled: totalInventory < 4 }"
          @click="totalInventory >= 4 && openLodgeHireModal()"
        >
          <div class="htc-cost">4 Any Resource</div>
          <div class="htc-arrow">→</div>
          <div class="htc-gain">🐱 จ้าง Palico</div>
          <div v-if="totalInventory < 4" class="htc-lock">ไม่พอ ({{ totalInventory }}/4)</div>
        </div>
      </div>


      <!-- Pet the Poogie -->
      <div v-else-if="activeLocation === 'poogie'" class="hqp-activity hqa-flavor hqa-poogie">
        <p class="hqa-desc">"บางครั้งสิ่งนี้อาจนำโชคมาให้คุณ"</p>
        <div v-if="!poogiePatted" class="hqa-btn-row">
          <button class="hqa-btn hqa-btn-poogie" @click="poogiePatted = true">🐷 ลูบ Poogie</button>
        </div>
        <div v-else>
          <p class="hqa-poogie-result">Poogie ส่งเสียงร้องอย่างพึงพอใจ... ✨</p>
          <button class="hqa-btn hqa-btn-claim" style="margin-top:10px" @click="completeLocation">✦ เสร็จสิ้น</button>
        </div>
      </div>
    </template>

    <!-- แถบสรุปหน้าแลกของ — ต้อง teleport เพราะ .content-panel ครอบด้วย overflow:hidden
         ทำให้ position:sticky ไม่ยอมเกาะขอบจอ -->
    <teleport to="body">
      <div v-if="activeLocation === 'provisions' && tradeOpen" class="trade-bar">
        <span class="trade-bar-sum">
          <span :class="{ 'trade-bar-ok': tradeGiveTotal === tradeCost }">{{ tradeGiveTotal }}/{{ tradeCost }}</span>
          <span class="trade-bar-arrow">→</span>
          <template v-if="tradeChosenItem">
            <img :src="getImg(tradeChosenItem.thumbnail)" class="trade-bar-img" />
            <span class="trade-bar-name">{{ tradeChosenItem.item }}</span>
          </template>
          <span v-else class="trade-bar-empty">ยังไม่เลือกของที่จะรับ</span>
        </span>
        <button class="hq-btn-confirm trade-bar-btn" :disabled="!tradeReady" @click="confirmTrade">✓ ยืนยันแลก</button>
      </div>
    </teleport>

    <!-- Lodge Hire Palico Modal -->
    <teleport to="body">
      <div v-if="showLodgeHireModal" class="hq-confirm-overlay" @click.self="showLodgeHireModal = false">
        <div class="hq-confirm-modal hq-trade-modal">
          <div class="hq-confirm-stamp lodge-hire-stamp">HIRE A PALICO</div>
          <div class="trade-give-section">
            <div class="trade-give-header">
              <span class="trade-give-label">เลือก Resource ที่จะจ่าย</span>
              <span class="trade-give-count" :class="{ full: lodgeHireTotal === 4 }">{{ lodgeHireTotal }} / 4</span>
            </div>
            <input v-model="lodgeHireSearch" class="trade-search-input" placeholder="Search item..." />
            <div class="trade-give-list">
              <div v-if="filteredLodgeHireItems.length === 0" class="trade-no-give-results">ไม่พบ item</div>
              <div v-for="item in filteredLodgeHireItems" :key="`${item.resource_type_id}-${item.item_id}`" class="trade-give-row">
                <img :src="getImg(item.thumbnail)" class="hq-trade-img" />
                <span class="trade-give-name">{{ item.item }}</span>
                <span class="trade-give-owned">มี {{ item.quantity }}</span>
                <button class="hq-craft-btn" @click.stop="openCraftLookup(item.resource_type_id, item.item_id, item.item)" title="ดูสูตรคราฟ">🔨</button>
                <div class="trade-give-ctrl">
                  <button class="tgc-btn" @click="adjustLodgeHire(item, -1)">−</button>
                  <span class="tgc-qty">{{ lodgeHireSelection[`${item.resource_type_id}-${item.item_id}`] ?? 0 }}</span>
                  <button class="tgc-btn" :disabled="lodgeHireTotal >= 4 || (lodgeHireSelection[`${item.resource_type_id}-${item.item_id}`] ?? 0) >= item.quantity" @click="adjustLodgeHire(item, 1)">+</button>
                </div>
              </div>
            </div>
          </div>
          <div class="hq-confirm-btns">
            <button class="hq-btn-confirm lodge-hire-confirm-btn" :disabled="!lodgeHireReady" @click="confirmLodgeHire">🐱 ยืนยันจ้าง Palico</button>
            <button class="hq-btn-cancel" @click="showLodgeHireModal = false">← ยกเลิก</button>
          </div>
        </div>
      </div>
    </teleport>


  </div>
</template>

<style scoped>
.hqp-wrap {
  display: flex;
  flex-direction: column;
  gap: 14px;
  color: #f0ddb0;
  font-family: 'Georgia', 'Times New Roman', serif;
}

/* ── ชุดวัสดุยุคกลาง: หนัง / ไม้ / กระดาษ / ทองเหลือง ── */
/* หนัง — ใช้กับแผงเครื่องมือทุกอัน */
.hqp-party-bar,
.hqp-steps,
.hqp-activity,
.rc-chips-wrap {
  border-radius: 4px;
  border: 1px solid rgba(124, 90, 43, 0.5);
  border-left: 3px solid #7c5a2b;
  background:
    repeating-linear-gradient(
      100deg,
      rgba(0,0,0,0.14) 0px,
      rgba(0,0,0,0.14) 1px,
      transparent 1px,
      transparent 5px
    ),
    linear-gradient(170deg, #2b1f13, #221809 55%, #281d10);
  box-shadow: inset 0 1px 0 rgba(255,220,160,0.07), 0 2px 6px rgba(0,0,0,0.45);
}

/* Header */
.hqp-header { display: flex; align-items: center; gap: 10px; }
.hqp-line { flex: 1; height: 1px; background: linear-gradient(to right, transparent, #7c5a2b); }
.hqp-line:last-child { background: linear-gradient(to left, transparent, #7c5a2b); }
.hqp-title { font-size: 11px; letter-spacing: 5px; color: #d8c39a; white-space: nowrap; text-transform: uppercase; text-shadow: 0 1px 2px rgba(0,0,0,0.7); }

/* ── แถบเดินทาง — ช่องละสิทธิ์ เติมไอคอนที่ที่เข้าไปแล้วตามลำดับ ── */
.hqp-steps {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 12px;
}
.hqp-step {
  width: 34px; height: 34px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 3px;
  border: 1px solid rgba(124,90,43,0.4);
  background: rgba(0,0,0,0.35);
  box-shadow: inset 0 0 10px rgba(0,0,0,0.5);
}
.hqp-step.step-filled {
  border-color: rgba(200,155,60,0.65);
  background: linear-gradient(170deg, #3d2c14, #241a0c);
  box-shadow: inset 0 1px 0 rgba(255,220,160,0.15), 0 0 8px rgba(200,155,60,0.2);
}
.hqp-step-icon { font-size: 16px; line-height: 1; }
.hqp-step:not(.step-filled) .hqp-step-icon { color: #5a442a; font-size: 12px; }
.hqp-steps-label { margin-left: auto; font-size: 11px; color: #a88040; letter-spacing: 1px; }

/* Party bar — ไอคอนคลาส + จุดนับ ให้ 4 คนอยู่แถวเดียวได้ */
.hqp-party-bar {
  display: flex; flex-wrap: wrap; gap: 8px;
  padding: 8px 12px;
}
.hqp-hunter-pill {
  display: flex; align-items: center; gap: 6px;
  padding: 4px 8px; border-radius: 3px;
  border: 1px solid rgba(124, 90, 43, 0.45);
  background: linear-gradient(170deg, #33251b, #1c1409);
  transition: all 0.2s;
}
.hqp-hunter-pill.pill-ready {
  border-color: rgba(0, 200, 100, 0.5);
  background: linear-gradient(170deg, #1e3324, #131f16);
}
.pill-icon { width: 20px; height: 20px; object-fit: contain; }
.pill-dots { display: flex; gap: 3px; }
.pill-dot {
  width: 5px; height: 5px; border-radius: 50%;
  background: rgba(124,90,43,0.4);
  box-shadow: inset 0 0 2px rgba(0,0,0,0.6);
}
.pill-dot.on { background: #c89b3c; box-shadow: 0 0 4px rgba(200,155,60,0.6); }
.pill-done { color: #00c896; font-size: 12px; }

/* Location grid */
.hqp-loc-grid { display: flex; flex-direction: column; gap: 6px; }
/* ป้ายไม้แขวนหน้าร้านแต่ละแห่ง */
.hqp-loc-card {
  display: flex; align-items: center; gap: 12px;
  padding: 12px 14px; border-radius: 3px;
  border: 3px solid #2e2113;
  background:
    repeating-linear-gradient(
      90deg,
      rgba(0,0,0,0.16) 0px,
      rgba(0,0,0,0.16) 1px,
      transparent 1px,
      transparent 7px
    ),
    linear-gradient(175deg, #4a3520 0%, #3a2917 58%, #43301c 100%);
  box-shadow: inset 0 0 30px rgba(0,0,0,0.5), inset 0 2px 0 rgba(255,220,160,0.07), 0 2px 8px rgba(0,0,0,0.45);
  position: relative; transition: all 0.18s;
}
.hqp-loc-card.loc-available { cursor: pointer; }
.hqp-loc-card.loc-available:hover {
  border-color: #4a3520;
  box-shadow: inset 0 0 30px rgba(0,0,0,0.35), inset 0 2px 0 rgba(255,220,160,0.12), 0 5px 14px rgba(0,0,0,0.5);
  transform: translateX(3px);
}
.hqp-loc-icon { font-size: 20px; width: 28px; text-align: center; flex-shrink: 0; }
.hqp-loc-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.hqp-loc-name { font-size: 13px; color: #f5e3ba; text-shadow: 0 1px 2px rgba(0,0,0,0.7); }
.hqp-loc-tags { display: flex; flex-wrap: wrap; gap: 4px; }
.hqp-tag {
  font-size: 10px; padding: 2px 7px; border-radius: 2px;
  background: rgba(0,0,0,0.32);
  border: 1px solid rgba(200,155,60,0.28);
  color: #d8bf8c; white-space: nowrap;
}
.hqp-loc-arrow { font-size: 20px; color: rgba(124, 90, 43, 0.5); flex-shrink: 0; transition: color 0.15s; }
.hqp-loc-card.loc-available:hover .hqp-loc-arrow { color: #c89b3c; }

/* นักล่าคนอื่น — ไอคอนคลาสในแถว ไม่ absolute ทับลูกศรเหมือนป้ายชื่อเดิม */
.hqp-loc-hunters { display: flex; gap: 3px; flex-shrink: 0; }
.hqp-here-icon {
  width: 20px; height: 20px; object-fit: contain;
  border-radius: 3px;
  background: rgba(0,0,0,0.3);
  border: 1px solid rgba(200,155,60,0.45);
}
.hqp-here-icon.hqp-here-done { border-color: rgba(0,200,100,0.4); opacity: 0.55; }

/* ── ที่ที่เข้าไม่ได้แล้ว — แถวเตี้ยครึ่งเดียว ไม่แย่งสายตาจากที่ที่ยังกดได้ ── */
.hqp-closed { display: flex; flex-direction: column; gap: 2px; }
.hqp-closed-head { display: flex; align-items: center; gap: 8px; margin: 2px 0 4px; }
.hqp-closed-line { flex: 1; height: 1px; background: rgba(124,90,43,0.28); }
.hqp-closed-title { font-size: 10px; letter-spacing: 2px; color: #6b563a; white-space: nowrap; }
.hqp-closed-row {
  display: flex; align-items: center; gap: 10px;
  padding: 6px 12px; border-radius: 3px;
  border: 1px solid rgba(124,90,43,0.22);
  background: rgba(0,0,0,0.22);
  opacity: 0.6;
}
.hqp-closed-row.closed-done { border-color: rgba(0,200,100,0.22); }
.hqp-closed-icon { font-size: 14px; width: 20px; text-align: center; flex-shrink: 0; filter: grayscale(0.6); }
.hqp-closed-name { flex: 1; min-width: 0; font-size: 12px; color: #a28a63; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hqp-closed-reason { font-size: 10px; color: #6b563a; white-space: nowrap; flex-shrink: 0; }
.hqp-closed-row.closed-done .hqp-closed-reason { color: #4e8a68; }

/* Ready section */
.hqp-ready-wrap { padding: 4px 0; }
/* ปุ่มหลัก = แผ่นทองเหลืองตอกหมุด */
.hqp-btn-ready {
  width: 100%; padding: 14px;
  border-radius: 3px;
  border: 1px solid #6b4f1c;
  background: linear-gradient(to bottom, #b08a34 0%, #8a6a22 48%, #6b501a 100%);
  color: #2a1d06; font-family: 'Georgia', serif; font-size: 15px;
  font-weight: bold; letter-spacing: 2px; cursor: pointer; transition: all 0.2s;
  text-shadow: 0 1px 0 rgba(255,225,170,0.35);
  box-shadow: inset 0 1px 0 rgba(255,230,180,0.4), 0 3px 8px rgba(0,0,0,0.55);
}
.hqp-btn-ready:hover {
  background: linear-gradient(to bottom, #c99f42 0%, #9d7a29 48%, #7a5c1f 100%);
  box-shadow: inset 0 1px 0 rgba(255,230,180,0.5), 0 4px 12px rgba(0,0,0,0.6);
}
.hqp-ready-status {
  text-align: center; font-size: 13px; color: #00c896;
  padding: 10px; border: 1px solid rgba(0, 200, 100, 0.35);
  border-left: 3px solid #2f7d4f;
  border-radius: 3px; background: linear-gradient(170deg, #1e2617, #161c10);
}
.hqp-ready-waiting { color: #a88040; }

/* Back btn & stamp */
.hqp-back-btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 7px 14px; border-radius: 3px;
  border: 1px solid rgba(124, 90, 43, 0.5);
  background: linear-gradient(170deg, #2b1f13, #1c1409);
  color: #a88040; font-size: 13px; font-family: 'Georgia', serif;
  cursor: pointer; transition: all 0.15s; align-self: flex-start;
}
.hqp-back-btn:hover { border-color: #c89b3c; color: #ffd27a; background: linear-gradient(170deg, #3a2a18, #241a0e); }
.hqp-act-stamp {
  font-size: 9px; letter-spacing: 3px; text-transform: uppercase;
  color: #f0d9a0;
  border: 1px solid rgba(200, 155, 60, 0.5);
  border-radius: 3px; padding: 3px 10px; width: fit-content;
  background: linear-gradient(to bottom, rgba(200,155,60,0.22), rgba(140,100,30,0.14));
  text-shadow: 0 1px 2px rgba(0,0,0,0.6);
}

/* Activity wrapper */
.hqp-activity {
  padding: 16px;
  display: flex; flex-direction: column; gap: 12px;
}
/* บทบรรยาย = ของที่ต้องอ่าน → กระดาษ */
.hqa-flavor {
  border: 1px solid #b8a173;
  border-left: 3px solid #9c4a15;
  border-radius: 2px;
  color: #3a2c18;
  background: linear-gradient(172deg, #ece1c4, #e0d3b2);
  box-shadow: 0 2px 8px rgba(0,0,0,0.45);
}
.hqa-desc { margin: 0; font-size: 13px; color: #a88040; line-height: 1.6; font-style: italic; }
.hqa-flavor .hqa-desc,
.hqa-flavor .hqa-flavor-sub,
.hqa-flavor .hqa-flavor-result p { color: #4a3a22; }
.hqa-flavor-tip { margin: 4px 0 0; font-size: 12px; color: #a88040; background: rgba(200,155,60,0.06); padding: 8px 10px; border-radius: 6px; border-left: 2px solid rgba(200,155,60,0.3); }
.hqa-flavor .hqa-flavor-tip {
  color: #4a3a22;
  background: rgba(150,120,70,0.16);
  border-radius: 2px;
  border-left: 2px solid rgba(120,95,55,0.6);
}
.hqa-flavor-sub { margin: 0 0 8px; font-size: 12px; color: #a88040; }
.hqa-btn-row { display: flex; gap: 8px; flex-wrap: wrap; }
.hqa-btn { padding: 8px 16px; border-radius: 3px; border: 1px solid rgba(124, 90, 43, 0.5); background: linear-gradient(170deg, #2b1f13, #1c1409); color: #c0985a; font-size: 13px; font-family: 'Georgia', serif; cursor: pointer; transition: all 0.15s; letter-spacing: 0.5px; }
.hqa-btn:hover:not(:disabled) { border-color: #c89b3c; background: linear-gradient(170deg, #3a2a18, #241a0e); color: #ffd27a; }
/* ปุ่มบนกระดาษต้องเป็นหมึก ไม่ใช่หนัง */
.hqa-flavor .hqa-btn {
  background: linear-gradient(to bottom, rgba(200,155,60,0.26), rgba(150,110,35,0.16));
  border-color: rgba(150,110,35,0.55);
  color: #5c4212;
}
.hqa-flavor .hqa-btn:hover:not(:disabled) {
  background: linear-gradient(to bottom, rgba(200,155,60,0.4), rgba(150,110,35,0.26));
  color: #2f2312;
}
.hqa-btn-claim { border-color: rgba(0, 200, 150, 0.5); background: rgba(0, 200, 150, 0.07); color: #00c896; }
.hqa-btn-claim:hover:not(:disabled) { background: rgba(0, 200, 150, 0.14); color: #00ffbe; }
/* ปุ่มยืนยันบนกระดาษ — เขียวสดอ่านไม่ออก ใช้หมึกเขียวเข้ม */
.hqa-flavor .hqa-btn-claim {
  border-color: rgba(40, 110, 70, 0.5);
  background: rgba(50, 150, 95, 0.16);
  color: #1f6b45;
}
.hqa-flavor .hqa-btn-claim:hover:not(:disabled) {
  background: rgba(50, 150, 95, 0.3);
  color: #14522f;
}
/* Poogie อยู่บนกระดาษ — ชมพูสดอ่านไม่ออก ต้องใช้หมึกชมพูเข้ม */
.hqa-btn-poogie { border-color: rgba(150, 60, 105, 0.5) !important; color: #8c3a6a !important; background: rgba(190, 100, 150, 0.14) !important; }
.hqa-btn-poogie:hover { border-color: rgba(150, 60, 105, 0.8) !important; background: rgba(190, 100, 150, 0.26) !important; color: #6b2650 !important; }
.hqa-poogie { border-left-color: #8c3a6a; }
.hqa-poogie-result { font-size: 14px; color: #8c3a6a; text-align: center; margin: 0; letter-spacing: 1px; font-weight: bold; }
.hqa-flavor-result { display: flex; flex-direction: column; gap: 8px; }
.hqa-flavor-result p { margin: 0; font-size: 13px; color: #a88040; font-style: italic; }
.hqa-elem-row { display: flex; gap: 8px; flex-wrap: wrap; }
.hqa-elem-chip { display: flex; align-items: center; gap: 5px; padding: 6px 10px; border-radius: 3px; border: 1px solid rgba(124, 90, 43, 0.35); background: linear-gradient(170deg, #2b1f13, #1a1209); cursor: pointer; font-size: 12px; color: #c4a060; transition: all 0.15s; }
.hqa-elem-chip:hover { border-color: #c89b3c; }
.hqa-elem-chip.chosen { border-color: rgba(200, 155, 60, 0.7); background: linear-gradient(170deg, #4a3520, #2e2113); color: #ffd27a; }
/* ชิปธาตุอยู่ในการ์ดกระดาษ (Chef) — สลับเป็นหมึกบนกระดาษ */
.hqa-flavor .hqa-elem-chip {
  border-color: rgba(120, 95, 55, 0.45);
  background: rgba(150, 120, 70, 0.12);
  color: #4a3a22;
}
.hqa-flavor .hqa-elem-chip:hover { border-color: #8a6a35; background: rgba(150, 120, 70, 0.22); }
.hqa-flavor .hqa-elem-chip.chosen {
  border-color: #8c2f22;
  background: rgba(200, 155, 60, 0.3);
  color: #2f2312;
  font-weight: bold;
}
.hqa-elem-icon { width: 22px; height: 22px; object-fit: contain; }

/* Provisions */
.hqa-trade-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
/* ใบราคาบนแผงพ่อค้า */
.hqa-trade-card { padding: 14px 10px; border-radius: 2px; border: 1px solid #b8a173; color: #3a2c18; background: linear-gradient(172deg, #f2e8cf, #e0d3b2); box-shadow: 0 2px 6px rgba(0,0,0,0.4); text-align: center; cursor: pointer; transition: all 0.15s; display: flex; flex-direction: column; gap: 4px; position: relative; }
.hqa-trade-card:hover:not(.disabled) { border-color: #8a6a35; transform: translateY(-2px); box-shadow: 0 5px 12px rgba(0,0,0,0.5); }
.hqa-trade-card.disabled { opacity: 0.45; cursor: not-allowed; }
.htc-cost { font-size: 12px; color: #9c4a15; }
.htc-arrow { font-size: 16px; color: #8a6a35; }
.htc-gain { font-size: 13px; color: #2f2312; font-weight: bold; }
.htc-lock { font-size: 10px; color: #7a6238; font-style: italic; }
.lodge-divider { height: 1px; background: linear-gradient(to right, transparent, rgba(120,95,55,0.5), transparent); margin: 4px 0; }
.lodge-hire-card { margin-top: 2px; }
/* การ์ดจ้าง Palico อยู่บนกระดาษอยู่แล้ว — ใช้เส้นประแทนแผ่นกระดาษซ้อนกระดาษ */
.hqa-flavor .hqa-trade-card {
  background: rgba(150, 120, 70, 0.14);
  border: 1px dashed rgba(120, 95, 55, 0.65);
  box-shadow: none;
}
.hqa-flavor .hqa-trade-card:hover:not(.disabled) {
  background: rgba(150, 120, 70, 0.26);
  border-color: #8a6a35;
  box-shadow: none;
}
/* stamp กับปุ่มยืนยันอยู่ใน modal พื้นมืด — คงเขียวสว่างไว้ */
.lodge-hire-stamp { color: #90d890 !important; border-color: rgba(80,200,80,0.4) !important; background: rgba(60,160,60,0.12) !important; }
.lodge-hire-confirm-btn { border-color: #3a7a3a !important; background: linear-gradient(to bottom,#1f4520,#0f210f) !important; color: #90d890 !important; }
.lodge-hire-confirm-btn:hover { box-shadow: 0 0 16px rgba(80,200,80,0.3) !important; }

/* Resource Center (reuse from HeadQuarter styles) */
.rc-card { gap: 14px; }
.rc-roll-phase, .rc-claim-phase { display: flex; flex-direction: column; gap: 12px; }
.rc-sub { font-size: 11px; color: #a88040; margin: 0; }
.rc-section-label { font-size: 9px; letter-spacing: 2px; text-transform: uppercase; color: #a88040; margin: 0; }
.rc-dice-row { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; }
@keyframes rc-dice-shake { 0%{transform:rotate(-18deg) scale(1.15)} 20%{transform:rotate(14deg) scale(1.2)} 40%{transform:rotate(-10deg) scale(1.15)} 60%{transform:rotate(8deg) scale(1.18)} 80%{transform:rotate(-5deg) scale(1.12)} 100%{transform:rotate(0deg) scale(1)} }
.rc-die { width: 64px; height: 64px; border-radius: 12px; background: #f5f0e8; border: 2px solid rgba(90, 61, 31, 0.4); box-shadow: 0 2px 8px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.8); padding: 6px; }
.rc-die.rolling { animation: rc-dice-shake 0.12s ease-in-out infinite; border-color: #c89b3c; box-shadow: 0 0 18px rgba(200,155,60,0.6), 0 2px 8px rgba(0,0,0,0.5); cursor: default; }
.rc-die-face { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; width: 100%; height: 100%; }
.rc-die-dot { border-radius: 50%; background: transparent; }
.rc-die-dot.visible { background: #1a1208; box-shadow: 0 1px 2px rgba(0,0,0,0.4); }
.rc-roll-actions { display: flex; gap: 10px; }
.rc-btn-primary { flex: 1; padding: 13px; border-radius: 3px; border: 1px solid #6b4f1c; background: linear-gradient(to bottom, #b08a34 0%, #8a6a22 48%, #6b501a 100%); color: #2a1d06; font-family: 'Georgia', serif; font-size: 13px; font-weight: bold; letter-spacing: 1px; cursor: pointer; transition: all 0.2s; text-shadow: 0 1px 0 rgba(255,225,170,0.35); box-shadow: inset 0 1px 0 rgba(255,230,180,0.4), 0 2px 6px rgba(0,0,0,0.5); }
.rc-btn-primary:hover:not(:disabled) { background: linear-gradient(to bottom, #c99f42 0%, #9d7a29 48%, #7a5c1f 100%); box-shadow: inset 0 1px 0 rgba(255,230,180,0.5), 0 3px 10px rgba(0,0,0,0.55); }
.rc-btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }
.rc-chips-wrap { padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; }
.rc-chips-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
/* เบี้ยไม้จารึกเลข — เลือกแล้วเป็นเหรียญทองเหลือง (ชุดเดียวกับเฟส Reward) */
.rc-die-chip {
  width: 38px; height: 38px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 50%;
  border: 2px solid rgba(124,90,43,0.55);
  background:
    repeating-linear-gradient(120deg, rgba(0,0,0,0.12) 0px, rgba(0,0,0,0.12) 1px, transparent 1px, transparent 4px),
    radial-gradient(circle at 38% 30%, #4a3520, #2b1f13 70%);
  box-shadow: inset 0 0 8px rgba(0,0,0,0.6), 0 1px 3px rgba(0,0,0,0.5);
  font-size: 16px; font-weight: bold; color: #c0985a;
  cursor: pointer; transition: all 0.15s; user-select: none;
}
.rc-die-chip:hover:not(.chip-spent) { border-color: #c89b3c; }
.rc-die-chip.chip-selected {
  border-color: #6b4f1c;
  color: #2a1d06;
  text-shadow: 0 1px 0 rgba(255,225,170,0.4);
  background: radial-gradient(circle at 36% 28%, #e0bc63, #a8802a 62%, #7a5c1c);
  box-shadow: inset 0 1px 2px rgba(255,230,180,0.45), 0 2px 6px rgba(0,0,0,0.55);
}
.rc-die-chip.chip-spent { opacity: 0.25; cursor: default; pointer-events: none; }
.rc-sum-badge { font-size: 14px; font-weight: bold; color: #2a1d06; letter-spacing: 1px; padding: 4px 12px; border-radius: 3px; background: linear-gradient(to bottom, #b08a34, #7a5c1c); border: 1px solid #6b4f1c; text-shadow: 0 1px 0 rgba(255,225,170,0.35); box-shadow: inset 0 1px 0 rgba(255,230,180,0.4), 0 2px 5px rgba(0,0,0,0.5); }
.rc-sum-hint { font-size: 11px; color: #a88040; margin: 0; }
/* บัญชีทรัพยากร: กระดาษตีเส้น ขอบไม้ (ชุดเดียวกับตาราง Reward) */
.rc-table {
  display: flex; flex-direction: column; gap: 0;
  border-radius: 3px; overflow: hidden;
  border: 3px solid #5a4222;
  color: #3a2c18;
  background:
    radial-gradient(circle at 10% 4%, rgba(140,110,60,0.13), transparent 40%),
    radial-gradient(circle at 90% 96%, rgba(120,95,50,0.15), transparent 42%),
    linear-gradient(168deg, #efe4c8 0%, #e6d9b8 45%, #dccba6 100%);
  box-shadow: 0 3px 10px rgba(0,0,0,0.5), inset 0 0 26px rgba(150,120,70,0.14);
}
.rc-row { display: flex; align-items: center; gap: 10px; padding: 8px 12px; background: transparent; border-bottom: 1px solid rgba(120,95,55,0.3); transition: all 0.15s; cursor: default; }
.rc-row:nth-child(even) { background: rgba(150,120,70,0.07); }
.rc-row:last-child { border-bottom: none; }
.rc-row-match { background: rgba(200,155,60,0.28); cursor: pointer; box-shadow: inset 3px 0 0 #8c2f22, inset 0 0 18px rgba(150,110,35,0.25); }
.rc-row-match:hover { background: rgba(200,155,60,0.42); }
.rc-row-locked { opacity: 0.35; }
.rc-row-num { min-width: 22px; font-size: 12px; font-weight: bold; color: #7a6238; text-align: center; }
.rc-row-match .rc-row-num { color: #8c2f22; font-size: 14px; }
.rc-row-item { display: flex; align-items: center; gap: 8px; flex: 1; }
.rc-item-img { width: 28px; height: 28px; object-fit: contain; border-radius: 2px; background: rgba(120,95,55,0.12); }
.rc-item-name { font-size: 12px; color: #4a3a22; flex: 1; }
.rc-row-match .rc-item-name { color: #2f2312; font-weight: bold; }
.rc-staged { display: flex; flex-direction: column; gap: 8px; padding: 10px 12px; border-radius: 4px; border: 1px solid rgba(124,90,43,0.45); border-left: 3px solid #2f7d4f; background: linear-gradient(170deg, #1e2617, #161c10); box-shadow: inset 0 1px 0 rgba(200,255,200,0.05), 0 2px 6px rgba(0,0,0,0.45); }
.rc-staged-list { display: flex; flex-direction: column; gap: 6px; }
.rc-staged-item { display: flex; align-items: center; gap: 8px; }
.rc-staged-qty { font-size: 13px; font-weight: bold; color: #00c896; }
.rc-confirm-row { display: flex; flex-direction: column; gap: 6px; }
.rc-skip-hint { font-size: 11px; color: #a88040; margin: 0; text-align: center; font-style: italic; }

/* Trade modal (shared with HeadQuarter) */
.hq-confirm-overlay { position: fixed; inset: 0; background: rgba(5,4,2,0.8); backdrop-filter: blur(10px) brightness(0.5); display: flex; justify-content: center; align-items: center; z-index: 300; padding: 16px; }
.hq-confirm-modal {
  width: min(420px,100%); padding: 24px;
  border-radius: 3px;
  border: 3px solid #2e2113;
  background:
    repeating-linear-gradient(100deg, rgba(0,0,0,0.14) 0px, rgba(0,0,0,0.14) 1px, transparent 1px, transparent 5px),
    linear-gradient(170deg, #2b1f13, #1c1409 55%, #241a0e);
  box-shadow: inset 0 1px 0 rgba(255,220,160,0.07), 0 10px 34px rgba(0,0,0,0.85);
  display: flex; flex-direction: column; gap: 14px;
  animation: hqModalIn 0.2s cubic-bezier(0.34,1.56,0.64,1); font-family: 'Georgia',serif;
}
@keyframes hqModalIn { from{transform:scale(0.85);opacity:0} to{transform:scale(1);opacity:1} }
.hq-confirm-stamp { text-align: center; font-size: 9px; letter-spacing: 5px; text-transform: uppercase; color: #ffb3a3; border: 1px solid rgba(200,60,60,0.45); border-radius: 3px; padding: 4px 14px; width: fit-content; margin: 0 auto; background: linear-gradient(to bottom, rgba(190,70,50,0.28), rgba(140,45,32,0.16)); text-shadow: 0 1px 2px rgba(0,0,0,0.6); }
.hq-confirm-btns { display: flex; gap: 10px; }
/* ปุ่มเหล็กชุบเลือด ชุดเดียวกับปุ่ม Monster Turn */
.hq-btn-confirm { flex: 1; padding: 13px; border-radius: 3px; border: 1px solid #5e1c14; background: linear-gradient(to bottom, #7a2a1e 0%, #4d1a13 50%, #2c0f0a 100%); color: #ffb3a3; font-family: 'Georgia',serif; font-size: 14px; font-weight: bold; letter-spacing: 1px; cursor: pointer; transition: 0.2s; min-height: 48px; text-shadow: 0 1px 2px rgba(0,0,0,0.7); box-shadow: inset 0 1px 0 rgba(255,180,160,0.22), 0 3px 8px rgba(0,0,0,0.55); }
.hq-btn-confirm:hover:not(:disabled) { background: linear-gradient(to bottom, #943627 0%, #5e2118 50%, #38140d 100%); }
.hq-btn-confirm:disabled { opacity: 0.35; cursor: not-allowed; }
.hq-btn-cancel { padding: 13px 16px; border-radius: 3px; border: 1px solid rgba(124,90,43,0.5); background: linear-gradient(170deg, #2b1f13, #1c1409); color: #a88040; font-family: 'Georgia',serif; font-size: 13px; cursor: pointer; transition: 0.2s; min-height: 48px; }
.hq-btn-cancel:hover { color: #ffd27a; border-color: #c89b3c; }
.hq-trade-modal { max-width: 680px; width: 94vw; max-height: 88vh; overflow-y: auto; display: flex; flex-direction: column; gap: 14px; }

/* ── หน้าแลกของ (ไม่ใช่ modal แล้ว) ──
   ไม่มีกรอบ modal บีบแล้ว ปล่อยรายการสูงขึ้นได้ แต่ยังคุม max-height ไว้
   ไม่งั้นสองส่วนจะยาวจนต้องเลื่อนผ่านส่วนแรกไปหาส่วนที่สอง */
/* เว้นที่ล่างสุดให้แถบสรุปที่ลอยอยู่ ไม่ให้ทับรายการแถวสุดท้าย */
.hqp-trade-page { gap: 16px; padding-bottom: 78px; }
.hqp-trade-page .trade-give-list { max-height: 42vh; }
.hqp-trade-page .hq-trade-grid { max-height: 42vh; }

/* แถบสรุปลอยล่างจอ — เลื่อนดูรายการอยู่ก็ยังกดยืนยันได้ */
.trade-bar {
  position: fixed;
  left: 8px;
  right: 8px;
  bottom: max(8px, env(safe-area-inset-bottom));
  z-index: 300;
  max-width: 620px;
  margin: 0 auto;
  display: flex; align-items: center; gap: 10px;
  padding: 10px 12px;
  border-radius: 3px;
  border: 1px solid rgba(200,155,60,0.45);
  background: linear-gradient(170deg, #33251b, #16100a);
  box-shadow: 0 4px 18px rgba(0,0,0,0.75), inset 0 1px 0 rgba(255,220,160,0.08);
  backdrop-filter: blur(4px);
  font-family: 'Georgia', serif;
}
.trade-bar-sum { flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px; font-size: 12px; color: #a88040; }
.trade-bar-sum > span:first-child { font-weight: bold; }
.trade-bar-ok { color: #00c896; }
.trade-bar-arrow { color: #5a3d1f; }
.trade-bar-img { width: 24px; height: 24px; object-fit: contain; flex-shrink: 0; }
.trade-bar-name { color: #d4b87a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.trade-bar-empty { font-style: italic; color: #5a3d1f; }
.trade-bar-btn { flex-shrink: 0; min-height: 44px; padding: 10px 16px; }
.trade-give-section, .trade-receive-section { display: flex; flex-direction: column; gap: 8px; }
.trade-give-header { display: flex; align-items: center; justify-content: space-between; }
.trade-give-label { font-size: 10px; letter-spacing: 2px; text-transform: uppercase; color: #a88040; }
.trade-give-count { font-size: 13px; font-weight: bold; color: #a88040; transition: color 0.2s; }
.trade-give-count.full { color: #00c896; }
.trade-give-list { display: grid; grid-template-columns: repeat(2,1fr); gap: 6px; max-height: 220px; overflow-y: auto; }
.trade-give-row { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 3px; background: linear-gradient(170deg, #241a0f, #17110a); border: 1px solid rgba(124,90,43,0.35); }
.trade-give-name { flex: 1; font-size: 12px; color: #d4b87a; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.trade-give-owned { font-size: 10px; color: #5a3d1f; white-space: nowrap; }
.trade-give-ctrl { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
.tgc-btn { width: 22px; height: 22px; border-radius: 4px; border: 1px solid rgba(124,90,43,0.4); background: rgba(0,0,0,0.3); color: #a88040; font-size: 14px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.12s; line-height: 1; }
.tgc-btn:hover:not(:disabled) { border-color: #c89b3c; color: #ffd27a; }
.tgc-btn:disabled { opacity: 0.3; cursor: not-allowed; }
.tgc-qty { min-width: 20px; text-align: center; font-size: 13px; font-weight: bold; color: #f0ddb0; }
.trade-search-input { width: 100%; box-sizing: border-box; background: rgba(0,0,0,0.4); border: 1px solid rgba(124,90,43,0.4); border-radius: 6px; padding: 7px 10px; font-size: 12px; color: #f0ddb0; outline: none; }
.trade-search-input:focus { border-color: rgba(200,155,60,0.6); }
.trade-search-input::placeholder { color: #5a3d1f; }
.trade-no-give-results, .trade-no-results { font-size: 12px; color: #5a3d1f; font-style: italic; padding: 8px 4px; }
.hq-trade-grid { display: grid; grid-template-columns: repeat(2,1fr); gap: 8px; max-height: 260px; overflow-y: auto; }
.hq-trade-item { display: flex; flex-direction: row; align-items: center; gap: 8px; padding: 8px 4px; border-radius: 3px; border: 1px solid rgba(124,90,43,0.35); background: linear-gradient(170deg, #2b1f13, #1a1209); box-shadow: inset 0 1px 0 rgba(255,220,160,0.06); cursor: pointer; transition: all 0.15s; }
.hq-trade-item:hover { border-color: #c89b3c; background: linear-gradient(170deg, #3d2c19, #241a0e); }
.hq-trade-item.chosen { border-color: #00c896; background: rgba(0,200,150,0.08); box-shadow: 0 0 8px rgba(0,200,150,0.2); }
.hq-trade-img { width: 30px; height: 30px; object-fit: contain; flex-shrink: 0; }
.hq-trade-name { font-size: 12px; color: #c4a060; line-height: 1.3; text-align: left; }

@media (max-width: 480px) {
  .hqa-trade-row { grid-template-columns: 1fr; }
  .hq-trade-grid { grid-template-columns: 1fr; }
  .trade-give-list { grid-template-columns: 1fr; }
}
/* ปุ่มดูสูตรคราฟบนการ์ดไอเทม — ใช้ร่วมกันทุกจุดในหน้านี้
   ทุกจุดที่ปุ่มไปเกาะอยู่บนแถว/การ์ดที่คลิกได้อยู่แล้ว จึงต้องคู่กับ @click.stop เสมอ */
.hq-craft-btn {
  background: rgba(150, 110, 35, 0.14);
  border: 1px solid rgba(150, 110, 35, 0.45);
  border-radius: 2px;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  padding: 3px 6px;
  min-width: 32px;
  min-height: 32px;
  flex-shrink: 0;
  transition: background 0.15s;
}
.hq-craft-btn:hover { background: rgba(150, 110, 35, 0.3); }
</style>
