<script setup>
import { ref, computed, onMounted, onActivated } from 'vue'

defineOptions({ name: 'Quest' })
import ancientData from '@/assets/files/ancient-quest-book.json'
import wildspireData from '@/assets/files/wildspire_book.json'
import { showQuestEffects } from '@/stores/settings'
import { hunter, loadHunter, saveHunter } from '@/stores/hunter'
import monsterInfoData from '@/assets/files/monster_info.json'
import monsterPartsData from '@/assets/files/monster_parts.json'
import elementalData from '@/assets/files/elemental.json'
import statusEffectData from '@/assets/files/status_effect.json'
import resourceData from '@/assets/files/resource.json'
import { getHunters, saveHunters } from '@/services/hunterStorage'

const getImg = (path) => `src/${path}`

onMounted(loadHunter)
onActivated(loadHunter)

const phase = ref('book')
const selectedBook = ref(null)
const selectedMonster = ref(null)
const selectedQuest = ref(null)
const currentDialogId = ref(null)

const books = [
  { id: 'ancient', name: 'Ancient Forest', data: ancientData, color: '#2d5a1b', accent: '#5aab2e' },
  {
    id: 'wildspire',
    name: 'Wildspire Waste',
    data: wildspireData,
    color: '#7a5a1b',
    accent: '#d4a017',
  },
]

const selectBook = (book) => {
  selectedBook.value = book
  phase.value = 'monster'
}

const monsters = computed(() => selectedBook.value?.data || [])

const selectMonster = (monster) => {
  selectedMonster.value = monster
  phase.value = 'quest'
}

const getAttempted = (monster_id, quest_id) => {
  if (!hunter.value) return 0
  return (
    hunter.value.attempted_quest.find((a) => a.monster_id === monster_id && a.quest_id === quest_id)
      ?.attempted ?? 0
  )
}

const isAssignedComplete = (monster_id) => getAttempted(monster_id, 1) >= 1

const isQuestUnlocked = (monster_id, quest_id) => {
  if (quest_id === 1) return true
  return isAssignedComplete(monster_id)
}

const isQuestExhausted = (quest) =>
  getAttempted(selectedMonster.value?.monster_id, quest.quest_id) >= quest.starting_point.length

const calMonths = computed(() => {
  const day = hunter.value?.campaign_day ?? 1
  const count = Math.max(1, Math.ceil(day / 31))
  return Array.from({ length: count })
})

const attemptsLeft = (quest) => {
  const used = getAttempted(selectedMonster.value?.monster_id, quest.quest_id)
  return Math.max(0, quest.starting_point.length - used)
}

const selectQuest = (quest) => {
  if (!isQuestUnlocked(selectedMonster.value.monster_id, quest.quest_id)) return
  if (isQuestExhausted(quest)) return
  selectedQuest.value = quest
  phase.value = 'detail'
}

const startingDialog = computed(() => {
  if (!selectedQuest.value || !selectedMonster.value) return null
  const attempted = getAttempted(selectedMonster.value.monster_id, selectedQuest.value.quest_id)
  const dialogId = selectedQuest.value.starting_point[attempted]
  return selectedMonster.value.quest_dialogs.find((d) => d.dialog_id === dialogId)
})

const startQuest = () => {
  const attempted = getAttempted(selectedMonster.value.monster_id, selectedQuest.value.quest_id)
  currentDialogId.value = selectedQuest.value.starting_point[attempted]
  phase.value = selectedMonster.value.dialog_hunting_phase.includes(currentDialogId.value)
    ? 'hunting'
    : 'dialog'
}

const currentDialog = computed(() => {
  if (!currentDialogId.value || !selectedMonster.value) return null
  return selectedMonster.value.quest_dialogs.find((d) => d.dialog_id === currentDialogId.value)
})

const pendingAction = ref(null)

const doAction = (action) => {
  pendingAction.value = action
}

const confirmAction = () => {
  const action = pendingAction.value
  if (!action) return
  pendingAction.value = null
  currentDialogId.value = action.PathToDialog
  if (selectedMonster.value.dialog_hunting_phase.includes(action.PathToDialog)) {
    phase.value = 'hunting'
  }
}

const cancelAction = () => {
  pendingAction.value = null
}

const pendingOutcome = ref(null)
const showResultAnim = ref(false)
const resultAnimType = ref(null)
const resultMonsterName = ref('')

const requestOutcome = (type) => {
  pendingOutcome.value = type
}

const cancelOutcome = () => {
  pendingOutcome.value = null
}

const confirmOutcome = () => {
  const type = pendingOutcome.value
  pendingOutcome.value = null
  if (type === 'complete') {
    if (monsterHuntingData.value?.reward_table?.length) {
      goToRewardPhase()
    } else {
      resultMonsterName.value = selectedMonster.value?.monster_name ?? ''
      resultAnimType.value = 'complete'
      showResultAnim.value = true
      onComplete()
    }
  } else {
    resultMonsterName.value = selectedMonster.value?.monster_name ?? ''
    resultAnimType.value = 'fail'
    showResultAnim.value = true
    onFail()
  }
}

const dismissResult = () => {
  showResultAnim.value = false
  resultAnimType.value = null
  resultMonsterName.value = ''
}

const scoutflySummary = computed(() => {
  if (!selectedQuest.value || !selectedMonster.value) return []
  const [min, max] = selectedQuest.value.scoutfly_level
  const attacks = selectedMonster.value.special_attack_card
  return [
    { range: `< ${min}`, attack: attacks[0], tier: 'low' },
    { range: `${min} – ${max}`, attack: attacks[1], tier: 'mid' },
    { range: `> ${max}`, attack: attacks[2], tier: 'high' },
  ]
})

const incrementAttempted = () => {
  const monster_id = selectedMonster.value.monster_id
  const quest_id = selectedQuest.value.quest_id
  const entry = hunter.value.attempted_quest.find(
    (a) => a.monster_id === monster_id && a.quest_id === quest_id,
  )
  if (!entry) {
    hunter.value.attempted_quest.push({ monster_id, quest_id, attempted: 1 })
  } else {
    entry.attempted += 1
  }
  saveHunter(hunter.value)
}

const incrementDay = () => {
  hunter.value.campaign_day = (hunter.value.campaign_day ?? 0) + 1
  saveHunter(hunter.value)
}

const onComplete = () => {
  incrementAttempted()
  incrementDay()
  currentDialogId.value = null
  selectedQuest.value = null
  phase.value = 'quest'
}

const onFail = () => {
  if (selectedQuest.value.quest_id !== 1) incrementAttempted()
  incrementDay()
  currentDialogId.value = null
  selectedQuest.value = null
  phase.value = 'quest'
}

const goBack = () => {
  const map = {
    reward: () => {
      phase.value = 'huntingPanel'
    },
    huntingPanel: () => {
      phase.value = 'hunting'
    },
    hunting: () => {
      phase.value = 'dialog'
    },
    dialog: () => {
      phase.value = 'detail'
      currentDialogId.value = null
    },
    detail: () => {
      phase.value = 'quest'
      selectedQuest.value = null
    },
    quest: () => {
      phase.value = 'monster'
      selectedMonster.value = null
    },
    monster: () => {
      phase.value = 'book'
      selectedBook.value = null
    },
  }
  map[phase.value]?.()
}

const starColor = (difficulty, index) => {
  if (difficulty === 4) return '#cc77ff'
  if (difficulty > 1) return '#ff4444'
  return '#ffffff'
}

const questTypeStamp = (type) => {
  if (type === 'Assigned Quest') return { label: 'ASSIGNED', cls: 'stamp-assigned' }
  if (type === 'Investigation Quest') return { label: 'INVESTIGATION', cls: 'stamp-investigation' }
  return { label: 'TEMPERED', cls: 'stamp-tempered' }
}

// ─── Hunting Panel ───────────────────────────────────────────────────────────
const huntingHp = ref(0)
const partDamage = ref({})

const monsterHuntingData = computed(() => {
  if (!selectedMonster.value || !selectedQuest.value) return null
  const info = monsterInfoData.find((m) => m.monster_id === selectedMonster.value.monster_id)
  if (!info) return null
  return (
    info.difficulty.find((d) => d.difficulty_id === selectedQuest.value.difficulty_level) ?? null
  )
})

const activeParts = computed(() => {
  if (!monsterHuntingData.value) return {}
  return Object.fromEntries(
    Object.entries(monsterHuntingData.value.monster_parts).filter(
      ([, data]) => data && Object.keys(data).length > 0,
    ),
  )
})

const brokenParts = computed(() => {
  const result = {}
  Object.entries(activeParts.value).forEach(([pos, data]) => {
    result[pos] = data.part_break_threshold
      ? (partDamage.value[pos] ?? 0) >= data.part_break_threshold
      : false
  })
  return result
})

const hpPercent = computed(() => {
  if (!monsterHuntingData.value) return 0
  return Math.max(0, Math.min(100, (huntingHp.value / monsterHuntingData.value.health) * 100))
})

const hpBarColor = computed(() => {
  const pct = huntingHp.value / (monsterHuntingData.value?.health ?? 1)
  if (pct > 0.5) return '#3cb83c'
  if (pct > 0.25) return '#d4a017'
  return '#cc2222'
})

const getPartMeta = (partId) => monsterPartsData.find((p) => p.part_id === partId)
const getElemental = (id) => elementalData.find((e) => e.elemental_id === id)
const getStatusEffect = (id) => statusEffectData.find((s) => s.effect_id === id)

const posDotCoords = {
  front: { x: 50, y: 20 },
  back: { x: 50, y: 80 },
  left: { x: 20, y: 50 },
  right: { x: 80, y: 50 },
}

// Status / Element mark tracking
const statusMarks = ref({})
const appliedStatuses = ref([])
const elementMarks = ref({})
const triggeringElement = ref(null)
let _elemAnimTimer = null

const markStatus = (statusId) => {
  const res = monsterHuntingData.value?.status_resistance?.find((s) => s.status_id === statusId)
  if (!res) return
  const cur = statusMarks.value[statusId] ?? 0
  const next = cur + 1
  if (next >= res.level) {
    if (!appliedStatuses.value.includes(statusId))
      appliedStatuses.value = [...appliedStatuses.value, statusId]
    statusMarks.value = { ...statusMarks.value, [statusId]: 0 }
  } else {
    statusMarks.value = { ...statusMarks.value, [statusId]: next }
  }
}

const removeStatus = (statusId) => {
  appliedStatuses.value = appliedStatuses.value.filter((id) => id !== statusId)
  statusMarks.value = { ...statusMarks.value, [statusId]: 0 }
}

const markElement = (elementId) => {
  const res = monsterHuntingData.value?.element_resistance?.find((e) => e.element_id === elementId)
  if (!res || res.immune || res.level <= 0) return
  const cur = elementMarks.value[elementId] ?? 0
  const next = cur + 1
  if (next >= res.level) {
    triggeringElement.value = elementId
    elementMarks.value = { ...elementMarks.value, [elementId]: 0 }
    if (_elemAnimTimer) clearTimeout(_elemAnimTimer)
    _elemAnimTimer = setTimeout(() => {
      triggeringElement.value = null
    }, 1800)
  } else {
    elementMarks.value = { ...elementMarks.value, [elementId]: next }
  }
}

const initHuntingData = () => {
  if (!monsterHuntingData.value) return
  huntingHp.value = monsterHuntingData.value.health
  const parts = {}
  Object.keys(activeParts.value).forEach((pos) => {
    parts[pos] = 0
  })
  partDamage.value = parts
  statusMarks.value = {}
  appliedStatuses.value = []
  elementMarks.value = {}
  triggeringElement.value = null
  if (_elemAnimTimer) clearTimeout(_elemAnimTimer)
}

const adjustHp = (delta) => {
  const max = monsterHuntingData.value?.health ?? 999
  huntingHp.value = Math.max(0, Math.min(max, huntingHp.value + delta))
}

const adjustPartDamage = (position, delta) => {
  const data = activeParts.value[position]
  if (!data) return
  const max = data.part_break_threshold ?? 0
  const current = partDamage.value[position] ?? 0
  partDamage.value = {
    ...partDamage.value,
    [position]: Math.max(0, Math.min(max, current + delta)),
  }
}

const goToHuntingPanel = () => {
  initHuntingData()
  phase.value = 'huntingPanel'
}

// ─── Reward Phase ─────────────────────────────────────────────────────────────
const diceCountTable = {
  'Assigned Quest': { 2: 3, 3: 2, 4: 2 },
  'Investigation Quest': { 2: 4, 3: 3, 4: 3 },
  'Tempered Investigation Quest': { 2: 5, 3: 4, 4: 4 },
}

const rewardPhase = ref('hunterSelect') // 'hunterSelect' | 'diceRoll' | 'assign'
const rewardHunterCount = ref(2)
const rewardDiceCount = computed(() => {
  const qt = selectedQuest.value?.quest_type ?? ''
  return diceCountTable[qt]?.[rewardHunterCount.value] ?? 2
})

const rolledDice = ref([]) // [{id, value, spent}]
const selectedDiceIds = ref([]) // ids of dice currently selected
const claimedRewards = ref([]) // [{resource_type_id, item_id, quantity}]

const getResourceItem = (resource_type_id, item_id) => {
  const type = resourceData.find((t) => t.resource_type_id === resource_type_id)
  return type?.resources.find((r) => r.item_id === item_id) ?? null
}

const isPartBrokenById = (partId) => {
  if (!partId) return false
  return Object.entries(activeParts.value).some(
    ([pos, data]) => data.part_id === partId && brokenParts.value[pos],
  )
}

const rollAllDice = () => {
  rolledDice.value = Array.from({ length: rewardDiceCount.value }, (_, i) => ({
    id: i,
    value: Math.ceil(Math.random() * 6),
    spent: false,
  }))
  selectedDiceIds.value = []
}

const rerollDie = (id) => {
  rolledDice.value = rolledDice.value.map((d) =>
    d.id === id ? { ...d, value: Math.ceil(Math.random() * 6) } : d,
  )
}

const toggleDie = (id) => {
  const die = rolledDice.value.find((d) => d.id === id)
  if (!die || die.spent) return
  selectedDiceIds.value = selectedDiceIds.value.includes(id)
    ? selectedDiceIds.value.filter((x) => x !== id)
    : [...selectedDiceIds.value, id]
}

const selectedSum = computed(() =>
  selectedDiceIds.value.reduce((sum, id) => {
    const die = rolledDice.value.find((d) => d.id === id)
    return sum + (die?.value ?? 0)
  }, 0),
)

const allDiceSpent = computed(
  () => rolledDice.value.length > 0 && rolledDice.value.every((d) => d.spent),
)

const initAssignPhase = () => {
  const auto = []
  monsterHuntingData.value?.reward_table?.forEach((row) => {
    if (!row.part_break_reward?.part_id) return
    if (!isPartBrokenById(row.part_break_reward.part_id)) return
    const { resource_type_id, item_id } = row.reward
    const qty = row.part_break_reward.gain_additional ?? 1
    const existing = auto.find(
      (r) => r.resource_type_id === resource_type_id && r.item_id === item_id,
    )
    if (existing) {
      existing.quantity += qty
    } else {
      auto.push({ resource_type_id, item_id, quantity: qty, fromBreak: true })
    }
  })
  claimedRewards.value = auto
  rewardPhase.value = 'assign'
}

const claimReward = (row) => {
  if (selectedDiceIds.value.length === 0) return
  if (row.rolled_number !== selectedSum.value) return

  const { resource_type_id, item_id } = row.reward
  const existing = claimedRewards.value.find(
    (r) => r.resource_type_id === resource_type_id && r.item_id === item_id,
  )
  if (existing) {
    claimedRewards.value = claimedRewards.value.map((r) =>
      r.resource_type_id === resource_type_id && r.item_id === item_id
        ? { ...r, quantity: r.quantity + 1 }
        : r,
    )
  } else {
    claimedRewards.value = [...claimedRewards.value, { resource_type_id, item_id, quantity: 1 }]
  }

  rolledDice.value = rolledDice.value.map((d) =>
    selectedDiceIds.value.includes(d.id) ? { ...d, spent: true } : d,
  )
  selectedDiceIds.value = []
}

const confirmRewards = () => {
  if (claimedRewards.value.length > 0) {
    const hunters = getHunters()
    const h = hunters.find((x) => x.hunter_id === hunter.value?.hunter_id)
    if (h) {
      if (!h.inventory) h.inventory = []
      claimedRewards.value.forEach((r) => {
        const existing = h.inventory.find(
          (i) => i.resource_type_id === r.resource_type_id && i.item_id === r.item_id,
        )
        if (existing) {
          existing.quantity += r.quantity
        } else {
          h.inventory.push({ ...r })
        }
      })
      saveHunters(hunters)
      loadHunter()
    }
  }
  resultMonsterName.value = selectedMonster.value?.monster_name ?? ''
  resultAnimType.value = 'complete'
  showResultAnim.value = true
  onComplete()
}

const goToRewardPhase = () => {
  rewardPhase.value = 'hunterSelect'
  rewardHunterCount.value = 2
  rolledDice.value = []
  selectedDiceIds.value = []
  claimedRewards.value = []
  phase.value = 'reward'
}
</script>

<template>
  <div class="quest-container">
    <!-- ═══════════ NAV BAR ═══════════ -->
    <div class="nav-bar" v-if="phase !== 'book'">
      <button class="btn-back" @click="goBack">
        <span class="back-arrow">◄</span>
        <span class="back-text">Back</span>
      </button>
      <div class="breadcrumb">
        <span v-if="selectedBook" class="crumb">{{ selectedBook.name }}</span>
        <span v-if="selectedMonster" class="crumb-sep">›</span>
        <span v-if="selectedMonster" class="crumb">{{ selectedMonster.monster_name }}</span>
        <span v-if="selectedQuest" class="crumb-sep">›</span>
        <span v-if="selectedQuest" class="crumb active">{{ selectedQuest.quest_type }}</span>
      </div>
    </div>

    <!-- ═══════════ BOOK SELECTION ═══════════ -->
    <div v-if="phase === 'book'" class="phase-book">
      <div class="board-header">
        <div class="board-ornament">✦</div>
        <h1 class="board-title">Hunter's Guild</h1>
        <div class="board-ornament">✦</div>
      </div>
      <p class="board-subtitle">Commission Quest Board</p>

      <div class="cal-months-row">
        <div v-for="(_, mi) in calMonths" :key="mi" class="campaign-calendar">
          <div class="cal-header">
            <span class="cal-title">MONTH {{ mi + 1 }}</span>
            <span class="cal-day-label">DAY {{ hunter?.campaign_day ?? 1 }}</span>
          </div>
          <div class="cal-grid">
            <div
              v-for="n in 31"
              :key="n"
              class="cal-cell"
              :class="{ filled: mi * 31 + n <= (hunter?.campaign_day ?? 1) }"
            ></div>
          </div>
        </div>
      </div>

      <div class="book-grid">
        <div
          v-for="book in books"
          :key="book.id"
          class="book-card"
          :style="{ '--book-accent': book.accent, '--book-bg': book.color }"
          @click="selectBook(book)"
        >
          <div class="book-spine"></div>
          <div class="book-body">
            <div class="book-seal">
              <img
                class="seal-inner"
                :src="
                  book.id === 'ancient'
                    ? '/src/assets/img/ancient_forest.webp'
                    : '/src/assets/img/wildspire_waste.webp'
                "
                :alt="book.name"
              />
            </div>
            <h2 class="book-title-text">{{ book.name }}</h2>
            <div class="book-divider"></div>
            <p class="book-meta">{{ book.data.length }} Monsters Available</p>
            <div class="book-cta">Open Book ▶</div>
          </div>
        </div>
      </div>
    </div>

    <!-- ═══════════ MONSTER SELECTION ═══════════ -->
    <div v-if="phase === 'monster'" class="phase-monster">
      <div class="commission-header">
        <h2 class="commission-title">{{ selectedBook.name }}</h2>
        <p class="commission-sub">Select Target Monster</p>
      </div>

      <div class="monster-grid">
        <div
          v-for="monster in monsters"
          :key="monster.monster_id"
          class="wanted-card"
          :class="{ cleared: isAssignedComplete(monster.monster_id) }"
          @click="selectMonster(monster)"
        >
          <div class="wanted-top">
            <span class="wanted-label">MONSTER FILE</span>
            <span v-if="isAssignedComplete(monster.monster_id)" class="cleared-stamp">CLEARED</span>
          </div>
          <div class="wanted-img-wrap">
            <img :src="getImg(monster.thumbnail)" class="wanted-img" />
          </div>
          <div class="wanted-name">{{ monster.monster_name }}</div>
        </div>
      </div>
    </div>

    <!-- ═══════════ QUEST SELECTION ═══════════ -->
    <div v-if="phase === 'quest'" class="phase-quest">
      <div class="target-banner">
        <img :src="getImg(selectedMonster.thumbnail)" class="target-img" />
        <div class="target-info">
          <p class="target-label">TARGET</p>
          <h2 class="target-name">{{ selectedMonster.monster_name }}</h2>
          <p class="target-book">{{ selectedBook.name }}</p>
        </div>
      </div>

      <div class="quest-scroll-list">
        <div
          v-for="quest in selectedMonster.quest"
          :key="quest.quest_id"
          class="scroll-card"
          :class="{
            'scroll-locked': !isQuestUnlocked(selectedMonster.monster_id, quest.quest_id),
            'scroll-exhausted':
              isQuestExhausted(quest) &&
              isQuestUnlocked(selectedMonster.monster_id, quest.quest_id),
            'scroll-available':
              isQuestUnlocked(selectedMonster.monster_id, quest.quest_id) &&
              !isQuestExhausted(quest),
          }"
          @click="selectQuest(quest)"
        >
          <!-- LOCK VEIL -->
          <div
            v-if="!isQuestUnlocked(selectedMonster.monster_id, quest.quest_id)"
            class="lock-veil"
          >
            <div class="lock-content">
              <span class="lock-glyph">🔒</span>
              <span class="lock-msg">Clear Assigned Quest to Unlock</span>
            </div>
          </div>

          <div class="scroll-inner">
            <!-- STAMP -->
            <div class="stamp-wrap">
              <div class="quest-stamp" :class="questTypeStamp(quest.quest_type).cls">
                {{ questTypeStamp(quest.quest_type).label }}
              </div>
            </div>

            <!-- STARS ROW -->
            <div class="scroll-stars">
              <span
                v-for="i in quest.difficulty_level"
                :key="i"
                class="scroll-star"
                :style="{ color: starColor(quest.difficulty_level, i - 1) }"
                >★</span
              >
            </div>

            <!-- INFO CHIPS -->
            <div class="scroll-chips">
              <div class="chip">
                <span class="chip-icon">⏳</span>
                <span class="chip-v">{{ quest.time_limit }}</span>
                <span class="chip-u">cards</span>
              </div>
              <div class="chip">
                <span class="chip-icon">🔍</span>
                <span class="chip-v"
                  >{{ quest.scoutfly_level[0] }}–{{ quest.scoutfly_level[1] }}</span
                >
              </div>
              <div class="chip" :class="{ 'chip-danger': attemptsLeft(quest) === 0 }">
                <span class="chip-icon">📜</span>
                <span class="chip-v">{{ attemptsLeft(quest) }}</span>
                <span class="chip-u">/ {{ quest.starting_point.length }}</span>
              </div>
            </div>

            <div
              v-if="
                isQuestExhausted(quest) &&
                isQuestUnlocked(selectedMonster.monster_id, quest.quest_id)
              "
              class="exhausted-notice"
            >
              All starting points exhausted
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ═══════════ QUEST DETAIL ═══════════ -->
    <div v-if="phase === 'detail' && selectedQuest" class="phase-detail">
      <div class="detail-commission">
        <div class="commission-seal-bar">
          <div class="quest-stamp large" :class="questTypeStamp(selectedQuest.quest_type).cls">
            {{ questTypeStamp(selectedQuest.quest_type).label }}
          </div>
          <div class="detail-stars">
            <span
              v-for="i in selectedQuest.difficulty_level"
              :key="i"
              class="detail-star"
              :style="{ color: starColor(selectedQuest.difficulty_level, i - 1) }"
              >★</span
            >
          </div>
        </div>

        <div class="detail-monster-row">
          <img :src="getImg(selectedMonster.thumbnail)" class="detail-monster-img" />
          <div>
            <p class="detail-target-label">Target</p>
            <h2 class="detail-monster-name">{{ selectedMonster.monster_name }}</h2>
            <p class="detail-book-name">{{ selectedBook.name }}</p>
          </div>
        </div>
      </div>

      <!-- STATS PARCHMENT -->
      <div class="parchment-stats">
        <div class="pstat">
          <span class="pstat-label">⏳ Time Limit</span>
          <div class="pstat-val">
            <div class="time-pip-row">
              <span
                class="time-pip"
                v-for="i in Math.min(selectedQuest.time_limit, 15)"
                :key="i"
              ></span>
              <span v-if="selectedQuest.time_limit > 15" class="time-more"
                >+{{ selectedQuest.time_limit - 15 }}</span
              >
            </div>
            <span class="time-num">{{ selectedQuest.time_limit }} Cards</span>
          </div>
        </div>

        <div class="pstat-divider"></div>

        <div class="pstat">
          <span class="pstat-label">🔍 Scoutfly Level</span>
          <span class="pstat-val sf-val"
            >{{ selectedQuest.scoutfly_level[0] }} – {{ selectedQuest.scoutfly_level[1] }}</span
          >
        </div>

        <div class="pstat-divider"></div>

        <div class="pstat">
          <span class="pstat-label">📜 Attempts Remaining</span>
          <span class="pstat-val" :class="{ 'val-danger': attemptsLeft(selectedQuest) <= 1 }">
            {{ attemptsLeft(selectedQuest) }} / {{ selectedQuest.starting_point.length }}
          </span>
        </div>
      </div>

      <!-- STARTING POINT SCROLL -->
      <div v-if="startingDialog" class="starting-scroll">
        <div class="scroll-tab">Starting Point</div>
        <p class="scroll-flavor-title">{{ startingDialog.title }}</p>
        <p class="scroll-flavor-body">{{ startingDialog.subtitle }}</p>
      </div>

      <button class="btn-embark" @click="startQuest">
        <span class="embark-icon">⚔</span>
        Embark on Quest
      </button>
    </div>

    <!-- ═══════════ DIALOG PHASE ═══════════ -->
    <div v-if="phase === 'dialog' && currentDialog" class="phase-dialog">
      <div class="dialog-tag-row">
        <img :src="getImg(selectedMonster.thumbnail)" class="dialog-tag-img" />
        <div>
          <span class="dialog-tag-monster">{{ selectedMonster.monster_name }}</span>
          <span class="dialog-tag-quest">{{ selectedQuest.quest_type }}</span>
        </div>
      </div>

      <div class="dialog-parchment">
        <div class="parchment-notch top"></div>

        <p v-if="currentDialog.title" class="dp-title">{{ currentDialog.title }}</p>
        <div class="dp-rule"></div>
        <p v-if="currentDialog.subtitle" class="dp-body">{{ currentDialog.subtitle }}</p>
        <div v-if="currentDialog.consequences" class="dp-consequence">
          <span class="dp-consequence-label">Effect</span>
          {{ currentDialog.consequences }}
        </div>

        <div class="parchment-notch bottom"></div>
      </div>

      <div class="dialog-choices">
        <p class="choices-label">— Choose Your Action —</p>
        <button
          v-for="action in currentDialog.actions"
          :key="action.action_id"
          class="choice-btn"
          @click="doAction(action)"
        >
          <div class="choice-header">
            <span class="choice-num">{{ action.action_id }}</span>
            <span class="choice-title">{{ action.title }}</span>
          </div>
          <div v-if="action.required_dialog" class="choice-requirement">
            <span class="req-icon">⚠</span>{{ action.required_dialog }}
          </div>
          <div v-if="action.consequences && showQuestEffects" class="choice-effect">
            {{ action.consequences }}
          </div>
        </button>
      </div>
    </div>

    <!-- ═══════════ ACTION CONFIRM MODAL ═══════════ -->
    <teleport to="body">
      <div v-if="pendingAction" class="action-modal-overlay">
        <div class="action-modal">
          <div class="am-stamp">CHOSEN ACTION</div>

          <div class="am-action-title">
            <span class="am-num">{{ pendingAction.action_id }}</span>
            <span class="am-title">{{ pendingAction.title }}</span>
          </div>

          <div v-if="pendingAction.consequences" class="am-consequences">
            <span class="am-con-label">⚠ Effect</span>
            <p class="am-con-text">{{ pendingAction.consequences }}</p>
          </div>

          <div class="am-buttons">
            <button class="am-btn-confirm" @click="confirmAction">✦ Proceed</button>
            <button class="am-btn-cancel" @click="cancelAction">← Go Back</button>
          </div>
        </div>
      </div>
    </teleport>

    <!-- ═══════════ HUNTING PHASE ═══════════ -->
    <div v-if="phase === 'hunting'" class="phase-hunting">
      <!-- INTRO DIALOG -->
      <div v-if="currentDialog" class="hunt-intro-scroll">
        <p v-if="currentDialog.title" class="dp-title">{{ currentDialog.title }}</p>
        <p v-if="currentDialog.subtitle" class="dp-body">{{ currentDialog.subtitle }}</p>
        <div v-if="currentDialog.consequences" class="dp-consequence">
          <span class="dp-consequence-label">Effect</span>
          {{ currentDialog.consequences }}
        </div>
      </div>

      <!-- MONSTER PORTRAIT -->
      <div class="hunt-portrait">
        <div class="hunt-portrait-glow"></div>
        <img :src="getImg(selectedMonster.thumbnail)" class="hunt-portrait-img" />
        <div class="hunt-portrait-name">{{ selectedMonster.monster_name }}</div>
      </div>

      <!-- SCOUTFLY FIELD NOTES -->
      <div class="field-notes">
        <div class="field-notes-header">
          <span class="fn-icon">🔍</span>
          <span>Scoutfly Intelligence Report</span>
        </div>
        <div class="fn-table">
          <div
            v-for="row in scoutflySummary"
            :key="row.range"
            class="fn-row"
            :class="`fn-${row.tier}`"
          >
            <div class="fn-level">
              <span class="fn-range">{{ row.range }}</span>
              <span class="fn-label">Scoutfly Lv.</span>
            </div>
            <div class="fn-divider">▶</div>
            <div class="fn-attack">
              <span class="fn-attack-label">Special Attack</span>
              <span class="fn-attack-name">{{ row.attack }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- ENTER HUNTING PANEL -->
      <div class="hunt-enter-section">
        <button class="btn-enter-hunt" @click="goToHuntingPanel">
          <span class="enter-hunt-icon">⚔</span>
          เข้าสู่ Hunting Phase
        </button>
      </div>
    </div>

    <!-- ═══════════ HUNTING PANEL ═══════════ -->
    <div v-if="phase === 'huntingPanel' && monsterHuntingData" class="phase-hunting-panel">
      <!-- Header -->
      <div class="hpanel-header">
        <img :src="getImg(selectedMonster.thumbnail)" class="hpanel-monster-img" />
        <div class="hpanel-header-info">
          <p class="hpanel-phase-tag">HUNTING PHASE</p>
          <h2 class="hpanel-monster-name">{{ selectedMonster.monster_name }}</h2>
          <div class="hpanel-stars">
            <span
              v-for="i in selectedQuest.difficulty_level"
              :key="i"
              :style="{ color: starColor(selectedQuest.difficulty_level, i - 1) }"
              >★</span
            >
          </div>
        </div>
      </div>

      <!-- Map -->
      <div
        v-if="monsterHuntingData.map_image"
        style="display: flex; align-items: center; justify-content: center; width: 100%"
      >
        <img :src="monsterHuntingData.map_image" class="hpanel-map-img" />
      </div>

      <!-- Info + Parts Row -->
      <div class="info-parts-row">
        <!-- Left column: monster status canvas + resist + special rule -->
        <div class="info-left-col">
          <!-- ── Monster Status Canvas ── -->
          <div class="msc-wrap">
            <!-- Monster portrait -->
            <div class="msc-portrait">
              <img :src="getImg(selectedMonster.thumbnail)" class="msc-monster-img" />

              <!-- Applied status overlays -->
              <div class="msc-status-overlays">
                <transition-group name="status-pop" tag="div" class="msc-status-list">
                  <div
                    v-for="sid in appliedStatuses"
                    :key="sid"
                    class="msc-applied-badge"
                    @click="removeStatus(sid)"
                    title="กดเพื่อเอาออก"
                  >
                    <img
                      v-if="getStatusEffect(sid)"
                      :src="getImg(getStatusEffect(sid).thumbnail)"
                      class="msc-applied-icon"
                    />
                    <span class="msc-remove-x">×</span>
                  </div>
                </transition-group>
              </div>

              <!-- Element animation overlay -->
              <transition name="elem-flash">
                <div
                  v-if="triggeringElement !== null"
                  class="msc-elem-flash"
                  :class="`elem-flash-${triggeringElement}`"
                >
                  <img
                    v-if="getElemental(triggeringElement)"
                    :src="getImg(getElemental(triggeringElement).thumbnail)"
                    class="msc-elem-flash-img"
                  />
                </div>
              </transition>
            </div>
          </div>

          <!-- ── Resistance / Marking Row ── -->
          <div class="resist-row">
            <!-- Element Resistance (interactive) -->
            <div class="resist-col">
              <p class="resist-col-label">Element</p>
              <div class="resist-items">
                <div
                  v-for="er in monsterHuntingData.element_resistance"
                  :key="er.element_id"
                  class="resist-item"
                  :class="{ 'resist-item-active': !er.immune && er.level > 0 }"
                  @click="markElement(er.element_id)"
                >
                  <div class="resist-icon-wrap">
                    <img
                      v-if="getElemental(er.element_id)"
                      :src="getImg(getElemental(er.element_id).thumbnail)"
                      class="resist-icon"
                    />
                    <span v-if="er.immune" class="resist-immune-x">✕</span>
                  </div>
                  <div class="resist-marks" v-if="!er.immune && er.level > 0">
                    <span
                      v-for="i in er.level"
                      :key="i"
                      class="resist-mark resist-mark-elem"
                      :class="{ 'mark-filled': i <= (elementMarks[er.element_id] ?? 0) }"
                    ></span>
                  </div>
                  <div v-else class="resist-marks">
                    <span class="resist-mark mark-immune"></span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Status Resistance (interactive) -->
            <div class="resist-col">
              <p class="resist-col-label">Status</p>
              <div class="resist-items">
                <div
                  v-for="sr in monsterHuntingData.status_resistance"
                  :key="sr.status_id"
                  class="resist-item resist-item-active"
                  :class="{ 'resist-item-applied': appliedStatuses.includes(sr.status_id) }"
                  @click="markStatus(sr.status_id)"
                >
                  <div class="resist-icon-wrap">
                    <img
                      v-if="getStatusEffect(sr.status_id)"
                      :src="getImg(getStatusEffect(sr.status_id).thumbnail)"
                      class="resist-icon"
                    />
                    <span v-if="appliedStatuses.includes(sr.status_id)" class="resist-applied-dot"
                      >✓</span
                    >
                  </div>
                  <div class="resist-marks">
                    <span
                      v-for="i in sr.level"
                      :key="i"
                      class="resist-mark resist-mark-status"
                      :class="{ 'mark-filled': i <= (statusMarks[sr.status_id] ?? 0) }"
                    ></span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Special Rule -->
          <div v-if="monsterHuntingData.special_rule" class="hpanel-special-rule">
            <span class="hpanel-rule-icon">⚡</span>
            <div>
              <p class="hpanel-rule-title">{{ monsterHuntingData.special_rule.title }}</p>
              <p class="hpanel-rule-desc">{{ monsterHuntingData.special_rule.description }}</p>
            </div>
          </div>
        </div>

        <!-- Parts Section (right) -->
        <div v-if="Object.keys(activeParts).length > 0" class="hpanel-section hpanel-parts-col">
          <!-- <div class="hpanel-section-header">
          <span class="hpanel-section-icon">🗡</span>
          <span class="hpanel-section-label">Monster Parts</span>
        </div> -->
        <!-- HP Section -->
      <div class="hpanel-section">
        <div class="hpanel-section-header" :class="{ 'hp-header-dead': huntingHp === 0 }">
          <span class="hpanel-section-icon">{{ huntingHp === 0 ? '💀' : '♥' }}</span>
          <span class="hpanel-section-label">Monster HP</span>
          <span class="hpanel-hp-nums" :class="{ 'hp-nums-dead': huntingHp === 0 }">
            {{ huntingHp === 0 ? 'SLAIN' : `${huntingHp} / ${monsterHuntingData.health}` }}
          </span>
        </div>
        <div class="hp-bar-track">
          <div
            class="hp-bar-fill"
            :style="{ width: hpPercent + '%', background: hpBarColor }"
          ></div>
        </div>
        <div class="hp-controls">
          <button class="hp-btn hp-minus" @click="adjustHp(-10)">−10</button>
          <button class="hp-btn hp-minus" @click="adjustHp(-5)">−5</button>
          <button class="hp-btn hp-minus" @click="adjustHp(-1)">−1</button>
          <div class="hp-ctrl-sep"></div>
          <button class="hp-btn hp-plus" @click="adjustHp(1)">+1</button>
          <button class="hp-btn hp-plus" @click="adjustHp(5)">+5</button>
          <button class="hp-btn hp-plus" @click="adjustHp(10)">+10</button>
        </div>
      </div>

          <!-- Part cards -->
          <div class="parts-layout">
            <div class="parts-list">
              <div
                v-for="(partData, position) in activeParts"
                :key="position"
                class="part-card"
                :class="{ 'part-card-broken': brokenParts[position] }"
              >
                <!-- Card header -->
                <div class="part-card-head">
                  <div class="part-icon-wrap">
                    <img
                      v-if="getPartMeta(partData.part_id)"
                      :src="getImg(getPartMeta(partData.part_id).thumbnail)"
                      class="part-icon-img"
                      :class="{ 'part-icon-broken': brokenParts[position] }"
                    />
                  </div>
                  <div class="part-card-armor-wrap">
                    <div class="armor-element-card">
                      <img src="/src/assets/img/bonus_armor.png" class="armor-base" />
                      <span class="element-value">{{ partData.armor }}</span>
                    </div>
                  </div>
                  <!-- Mini position diagram -->
                  <div class="part-mini-diagram">
                    <svg viewBox="0 0 100 100" class="part-mini-svg">
                      <circle
                        cx="50"
                        cy="50"
                        r="46"
                        fill="#0f0b05"
                        stroke="#5a3d1f"
                        stroke-width="2"
                      />
                      <line x1="4" y1="4" x2="96" y2="96" stroke="#3a2810" stroke-width="2" />
                      <line x1="96" y1="4" x2="4" y2="96" stroke="#3a2810" stroke-width="2" />
                      <!-- Primary position dot -->
                      <circle
                        v-if="posDotCoords[position]"
                        :cx="posDotCoords[position].x"
                        :cy="posDotCoords[position].y"
                        r="12"
                        :fill="
                          brokenParts[position] ? 'rgba(220,60,40,0.9)' : 'rgba(200,155,60,0.9)'
                        "
                        :filter="brokenParts[position] ? 'url(#glow-red)' : 'url(#glow-gold)'"
                      />
                      <!-- Connected position dot -->
                      <circle
                        v-if="
                          partData.connect_part_position &&
                          posDotCoords[partData.connect_part_position]
                        "
                        :cx="posDotCoords[partData.connect_part_position].x"
                        :cy="posDotCoords[partData.connect_part_position].y"
                        r="12"
                        :fill="
                          brokenParts[position] ? 'rgba(220,60,40,0.9)' : 'rgba(200,155,60,0.9)'
                        "
                        :filter="brokenParts[position] ? 'url(#glow-red)' : 'url(#glow-gold)'"
                      />
                      <defs>
                        <filter id="glow-gold" x="-50%" y="-50%" width="200%" height="200%">
                          <feGaussianBlur stdDeviation="3" result="blur" />
                          <feMerge>
                            <feMergeNode in="blur" />
                            <feMergeNode in="SourceGraphic" />
                          </feMerge>
                        </filter>
                        <filter id="glow-red" x="-50%" y="-50%" width="200%" height="200%">
                          <feGaussianBlur stdDeviation="3" result="blur" />
                          <feMerge>
                            <feMergeNode in="blur" />
                            <feMergeNode in="SourceGraphic" />
                          </feMerge>
                        </filter>
                      </defs>
                    </svg>
                  </div>
                  <div v-if="brokenParts[position]" class="part-broken-stamp">BROKEN</div>
                </div>

                <!-- Break bar -->
                <div class="part-break-wrap">
                  <div class="part-break-row">
                    <span class="part-break-label">Break</span>
                    <span class="part-break-nums">
                      {{ partDamage[position] ?? 0 }} / {{ partData.part_break_threshold }}
                    </span>
                  </div>
                  <div class="part-break-track">
                    <div
                      class="part-break-fill"
                      :class="{ 'break-fill-broken': brokenParts[position] }"
                      :style="{
                        width:
                          Math.min(
                            100,
                            ((partDamage[position] ?? 0) / partData.part_break_threshold) * 100,
                          ) + '%',
                      }"
                    ></div>
                  </div>
                  <div class="part-break-controls">
                    <button class="pb-btn pb-minus" @click="adjustPartDamage(position, -5)">
                      −5
                    </button>
                    <button class="pb-btn pb-minus" @click="adjustPartDamage(position, -1)">
                      −1
                    </button>
                    <button class="pb-btn pb-plus" @click="adjustPartDamage(position, 1)">
                      +1
                    </button>
                    <button class="pb-btn pb-plus" @click="adjustPartDamage(position, 5)">
                      +5
                    </button>
                  </div>
                </div>

                <!-- Break rule — tip before break, alert after -->
                <div
                  v-if="partData.part_break_rule"
                  class="part-break-rule"
                  :class="brokenParts[position] ? 'pbr-broken' : 'pbr-tip'"
                >
                  <span class="pbr-icon">{{ brokenParts[position] ? '⚡' : '💡' }}</span>
                  <div class="pbr-body">
                    <span class="pbr-label">{{
                      brokenParts[position] ? 'BREAK EFFECT' : 'TIP ON BREAK'
                    }}</span>
                    <p class="pbr-text">{{ partData.part_break_rule }}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <!-- end info-parts-row -->

      <!-- Quest Outcome -->
      <div class="hunt-result-section">
        <p class="hunt-result-label">— Quest Outcome —</p>
        <div class="hunt-result-btns">
          <button class="btn-complete" @click="requestOutcome('complete')">
            <span class="result-icon">✦</span>Quest Complete
          </button>
          <button class="btn-fail" @click="requestOutcome('fail')">
            <span class="result-icon">✕</span>Quest Failed
          </button>
        </div>
      </div>
    </div>

    <!-- ═══════════ REWARD PHASE ═══════════ -->
    <div v-if="phase === 'reward' && monsterHuntingData" class="phase-reward">
      <!-- ── Hunter Count Select ── -->
      <div v-if="rewardPhase === 'hunterSelect'" class="rw-hunter-select">
        <div class="rw-header">
          <span class="rw-trophy">🏆</span>
          <div>
            <p class="rw-title">Quest Complete</p>
            <p class="rw-sub">{{ selectedMonster.monster_name }} ถูกล่าสำเร็จ</p>
          </div>
        </div>
        <p class="rw-section-label">มี Hunter กี่คนร่วมล่า?</p>
        <div class="rw-hunter-btns">
          <button
            v-for="n in [2, 3, 4]"
            :key="n"
            class="rw-hunter-btn"
            :class="{ active: rewardHunterCount === n }"
            @click="rewardHunterCount = n"
          >
            <span class="rw-hunter-num">{{ n }}</span>
            <span class="rw-hunter-label">Hunters</span>
            <span class="rw-dice-preview">
              {{ diceCountTable[selectedQuest.quest_type]?.[n] ?? '?' }} 🎲
            </span>
          </button>
        </div>
        <div class="rw-quest-type-row">
          <span class="rw-qt-label">{{ selectedQuest.quest_type }}</span>
          <span class="rw-qt-arrow">→</span>
          <span class="rw-qt-dice">{{ rewardDiceCount }} ลูกเต๋า</span>
        </div>
        <button
          class="rw-btn-primary"
          @click="
            rewardPhase = 'diceRoll';
            rollAllDice()
          "
        >
          ⚔ เริ่มรับรางวัล
        </button>
      </div>

      <!-- ── Dice Roll ── -->
      <div v-else-if="rewardPhase === 'diceRoll'" class="rw-dice-roll">
        <p class="rw-title">ทอยเต๋า</p>
        <p class="rw-sub">
          {{ rewardDiceCount }} ลูกเต๋า · {{ rewardHunterCount }} Hunters ·
          {{ selectedQuest.quest_type }}
        </p>
        <div class="rw-dice-row">
          <div v-for="die in rolledDice" :key="die.id" class="rw-die">
            <span class="rw-die-value">{{ die.value }}</span>
            <button class="rw-die-reroll" @click="rerollDie(die.id)" title="ทอยใหม่">↺</button>
          </div>
        </div>
        <div class="rw-roll-actions">
          <button class="rw-btn-secondary" @click="rollAllDice()">🎲 ทอยใหม่ทั้งหมด</button>
          <button class="rw-btn-primary" @click="initAssignPhase()">ใช้ผลนี้ →</button>
        </div>
      </div>

      <!-- ── Assign Dice → Claim Rewards ── -->
      <div v-else-if="rewardPhase === 'assign'" class="rw-assign">
        <!-- Dice chips -->
        <div class="rw-dice-chips-wrap">
          <p class="rw-section-label">เต๋าที่ทอยได้ — เลือกเพื่อรวมค่า</p>
          <div class="rw-dice-chips">
            <div
              v-for="die in rolledDice"
              :key="die.id"
              class="rw-die-chip"
              :class="{
                'chip-selected': selectedDiceIds.includes(die.id),
                'chip-spent': die.spent,
              }"
              @click="toggleDie(die.id)"
            >
              {{ die.value }}
            </div>
            <div v-if="selectedDiceIds.length > 0" class="rw-sum-badge">= {{ selectedSum }}</div>
          </div>
          <p v-if="selectedDiceIds.length > 0" class="rw-sum-hint">
            เลือก row {{ selectedSum }} เพื่อรับรางวัล
          </p>
        </div>

        <!-- Reward table -->
        <p class="rw-section-label">ตาราง Reward</p>
        <div class="rw-table">
          <div
            v-for="row in monsterHuntingData.reward_table"
            :key="row.rolled_number"
            class="rw-row"
            :class="{
              'rw-row-claimable': selectedDiceIds.length > 0 && selectedSum === row.rolled_number,
              'rw-row-locked': selectedDiceIds.length > 0 && selectedSum !== row.rolled_number,
            }"
            @click="claimReward(row)"
          >
            <span class="rw-row-num">{{ row.rolled_number }}</span>
            <div class="rw-row-item">
              <img
                v-if="getResourceItem(row.reward.resource_type_id, row.reward.item_id)"
                :src="
                  getImg(getResourceItem(row.reward.resource_type_id, row.reward.item_id).thumbnail)
                "
                class="rw-item-img"
              />
              <span class="rw-item-name">{{
                getResourceItem(row.reward.resource_type_id, row.reward.item_id)?.item ?? '?'
              }}</span>
            </div>
            <div
              v-if="row.part_break_reward?.part_id"
              class="rw-part-bonus"
              :class="{ 'bonus-active': isPartBrokenById(row.part_break_reward.part_id) }"
            >
              <span class="rw-bonus-icon">{{
                isPartBrokenById(row.part_break_reward.part_id) ? '🔓' : '🔒'
              }}</span>
              <span class="rw-bonus-text">
                +{{ row.part_break_reward.gain_additional }}
                {{ getPartMeta(row.part_break_reward.part_id)?.part ?? '' }} Break
              </span>
            </div>
          </div>
        </div>

        <!-- Claimed summary -->
        <div v-if="claimedRewards.length > 0" class="rw-claimed">
          <p class="rw-section-label">รางวัลที่รับแล้ว</p>
          <div class="rw-claimed-list">
            <div
              v-for="r in claimedRewards"
              :key="`${r.resource_type_id}-${r.item_id}`"
              class="rw-claimed-item"
            >
              <img
                v-if="getResourceItem(r.resource_type_id, r.item_id)"
                :src="getImg(getResourceItem(r.resource_type_id, r.item_id).thumbnail)"
                class="rw-claimed-img"
              />
              <span class="rw-claimed-qty">×{{ r.quantity }}</span>
              <span class="rw-claimed-name">{{
                getResourceItem(r.resource_type_id, r.item_id)?.item
              }}</span>
            </div>
          </div>
        </div>

        <div class="rw-confirm-row">
          <p v-if="!allDiceSpent" class="rw-skip-hint">
            ยังมีเต๋าเหลือ {{ rolledDice.filter((d) => !d.spent).length }} ลูก
          </p>
          <button class="rw-btn-primary rw-btn-confirm" @click="confirmRewards">
            ✦ รับรางวัลและปิด Quest
          </button>
        </div>
      </div>
    </div>

    <!-- ═══════════ OUTCOME CONFIRM MODAL ═══════════ -->
    <teleport to="body">
      <div v-if="pendingOutcome" class="outcome-confirm-overlay">
        <div class="outcome-confirm-modal" :class="`ocm-${pendingOutcome}`">
          <div class="am-stamp ocm-stamp">
            {{ pendingOutcome === 'complete' ? 'QUEST COMPLETE' : 'QUEST FAILED' }}
          </div>
          <p class="ocm-question">ยืนยันผลลัพธ์นี้หรือไม่?</p>
          <p class="ocm-desc">
            {{
              pendingOutcome === 'complete'
                ? 'บันทึกการล่าครั้งนี้ว่าสำเร็จและดำเนินต่อไป'
                : 'บันทึกการล่าครั้งนี้ว่าล้มเหลวและดำเนินต่อไป'
            }}
          </p>
          <div class="am-buttons">
            <button
              class="am-btn-confirm ocm-btn-result"
              :class="`ocm-result-${pendingOutcome}`"
              @click="confirmOutcome"
            >
              {{ pendingOutcome === 'complete' ? '✦ Quest Complete' : '✕ Quest Failed' }}
            </button>
            <button class="am-btn-cancel" @click="cancelOutcome">← Go Back</button>
          </div>
        </div>
      </div>
    </teleport>

    <!-- ═══════════ RESULT ANIMATION ═══════════ -->
    <teleport to="body">
      <div
        v-if="showResultAnim"
        class="result-anim-overlay"
        :class="`ra-${resultAnimType}`"
        @click="dismissResult"
      >
        <!-- Fail screen flash -->
        <div v-if="resultAnimType === 'fail'" class="ra-fail-flash"></div>

        <!-- Rotating rays (complete only) -->
        <div v-if="resultAnimType === 'complete'" class="ra-rays"></div>

        <!-- Cinematic bars -->
        <div class="ra-cinebar ra-cinebar-top">
          <div class="ra-cinebar-inner">
            <span class="ra-cinebar-guild">Hunter's Guild</span>
            <div class="ra-cinebar-line"></div>
          </div>
        </div>
        <div class="ra-cinebar ra-cinebar-bottom">
          <div class="ra-cinebar-inner">
            <div class="ra-cinebar-line"></div>
            <span class="ra-cinebar-guild">Commission Quest</span>
          </div>
        </div>

        <!-- Center stage -->
        <div class="ra-stage">
          <div class="ra-divider ra-divider-top"></div>

          <!-- Crest seal -->
          <div class="ra-crest-wrap">
            <div class="ra-crest-glow"></div>
            <div class="ra-crest-ring-outer"></div>
            <div class="ra-crest-ring-inner"></div>
            <span class="ra-crest-symbol">{{ resultAnimType === 'complete' ? '✦' : '✕' }}</span>
          </div>

          <!-- Text -->
          <div class="ra-text-group">
            <span class="ra-label-quest">Quest</span>
            <span class="ra-label-result">{{
              resultAnimType === 'complete' ? 'Complete' : 'Failed'
            }}</span>
          </div>

          <div class="ra-sub-text">
            {{ resultAnimType === 'complete' ? resultMonsterName : 'The hunt has come to an end.' }}
          </div>

          <div class="ra-divider ra-divider-bottom"></div>
        </div>

        <!-- Gold particles (complete only) -->
        <div v-if="resultAnimType === 'complete'" class="ra-particles">
          <span v-for="n in 16" :key="n" class="ra-particle" :style="`--i:${n}`"></span>
        </div>

        <p class="ra-tap-hint">Tap anywhere to continue</p>
      </div>
    </teleport>
  </div>
</template>

<style scoped>
/* ══════════════════════════════════════════
   BASE / TOKENS
══════════════════════════════════════════ */
.quest-container {
  color: #f0ddb0;
  display: flex;
  flex-direction: column;
  gap: 18px;
  font-family: 'Georgia', 'Times New Roman', serif;
}

/* ══════════════════════════════════════════
   NAV BAR
══════════════════════════════════════════ */
.nav-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid rgba(200, 155, 60, 0.3);
}

.btn-back {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: 6px;
  border: 1px solid #7c5a2b;
  background: linear-gradient(to bottom, #2a1e10, #17120c);
  color: #c89b3c;
  font-size: 13px;
  cursor: pointer;
  transition: 0.2s;
  white-space: nowrap;
  min-height: 44px;
}

.btn-back:hover {
  border-color: #c89b3c;
  box-shadow: 0 0 10px rgba(200, 155, 60, 0.4);
}

.back-arrow {
  font-size: 10px;
}

.breadcrumb {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  font-size: 12px;
}

.crumb {
  color: #a88040;
}
.crumb.active {
  color: #ffd27a;
  font-weight: bold;
}
.crumb-sep {
  color: #5a3d1f;
}

/* ══════════════════════════════════════════
   BOOK SELECTION
══════════════════════════════════════════ */
.phase-book {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
}

.board-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.board-title {
  font-size: 26px;
  color: #ffd27a;
  text-shadow:
    0 0 20px rgba(255, 200, 80, 0.5),
    0 2px 4px rgba(0, 0, 0, 0.8);
  letter-spacing: 3px;
  text-transform: uppercase;
  margin: 0;
}

.board-ornament {
  color: #c89b3c;
  font-size: 18px;
}

.board-subtitle {
  font-size: 13px;
  color: #a88040;
  letter-spacing: 4px;
  text-transform: uppercase;
  margin: 0;
}

.cal-months-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
  width: 100%;
}

.campaign-calendar {
  display: flex;
  flex-direction: column;
  width: 160px;
  border: 1px solid #c89b3c;
  border-radius: 6px;
  overflow: hidden;
  box-shadow: 0 0 10px rgba(200, 155, 60, 0.2);
  background: #1a1208;
}

.cal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #c89b3c;
  padding: 3px 6px;
}

.cal-title {
  font-size: 8px;
  font-weight: bold;
  letter-spacing: 2px;
  color: #1a1208;
}

.cal-day-label {
  font-size: 8px;
  font-weight: bold;
  color: #1a1208;
}

.cal-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
  padding: 5px;
}

.cal-cell {
  aspect-ratio: 1;
  border-radius: 1px;
  border: 1px solid #2a1c08;
  background: #0f0b05;
  transition:
    background 0.15s,
    box-shadow 0.15s;
}

.cal-cell.filled {
  background: #c89b3c;
  border-color: #ffd27a;
  box-shadow: 0 0 3px rgba(255, 210, 100, 0.35);
}

.book-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  width: 100%;
}

.book-card {
  position: relative;
  display: flex;
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  border: 2px solid #7c5a2b;
  background: #17120c;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.6);
  transition: 0.25s;
  min-height: 180px;
}

.book-card:hover {
  border-color: var(--book-accent);
  box-shadow:
    0 0 24px rgba(255, 200, 80, 0.3),
    0 4px 20px rgba(0, 0, 0, 0.8);
  transform: translateY(-4px);
}

.book-spine {
  width: 18px;
  flex-shrink: 0;
  background: linear-gradient(to right, #0d0a06, var(--book-bg), #0d0a06);
  border-right: 1px solid rgba(255, 200, 80, 0.2);
}

.book-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 24px 20px;
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--book-bg) 30%, #17120c) 0%,
    #17120c 60%,
    color-mix(in srgb, var(--book-bg) 15%, #17120c) 100%
  );
}

.book-seal {
  width: 200px;
  height: 200px;
  border-radius: 50%;
  border: 2px solid var(--book-accent);
  background: radial-gradient(circle, color-mix(in srgb, var(--book-bg) 60%, #17120c), #17120c);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 0 12px rgba(255, 200, 80, 0.2);
}

.seal-inner {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
  display: block;
}

.book-title-text {
  font-size: 18px;
  color: #ffd27a;
  text-align: center;
  margin: 0;
  letter-spacing: 1px;
}

.book-divider {
  width: 60%;
  height: 1px;
  background: linear-gradient(to right, transparent, var(--book-accent), transparent);
}

.book-meta {
  font-size: 12px;
  color: #a88040;
  margin: 0;
}

.book-cta {
  font-size: 12px;
  color: var(--book-accent);
  letter-spacing: 1px;
  margin-top: 4px;
}

/* ══════════════════════════════════════════
   MONSTER GRID — WANTED POSTER
══════════════════════════════════════════ */
.commission-header {
  text-align: center;
  margin-bottom: 4px;
}

.commission-title {
  font-size: 20px;
  color: #ffd27a;
  margin: 0;
}

.commission-sub {
  font-size: 12px;
  color: #a88040;
  letter-spacing: 3px;
  text-transform: uppercase;
  margin: 4px 0 0;
  text-align: center;
}

.monster-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  gap: 12px;
  max-width: 600px;
  margin: 0 auto;
  width: 100%;
}

.wanted-card {
  position: relative;
  border-radius: 6px;
  border: 1px solid #7c5a2b;
  background: linear-gradient(to bottom, #2a1e10, #17120c);
  cursor: pointer;
  transition: 0.2s;
  overflow: hidden;
  padding-bottom: 8px;
}

.wanted-card:hover {
  border-color: #c89b3c;
  box-shadow: 0 0 14px rgba(200, 155, 60, 0.5);
  transform: translateY(-3px);
}

.wanted-card.cleared {
  border-color: #3a7a3a;
}

.wanted-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 5px 7px;
  background: rgba(0, 0, 0, 0.4);
  border-bottom: 1px solid rgba(124, 90, 43, 0.4);
}

.wanted-label {
  font-size: 8px;
  color: #7c5a2b;
  letter-spacing: 1px;
  text-transform: uppercase;
}

.cleared-stamp {
  font-size: 7px;
  color: #3cb83c;
  border: 1px solid #3cb83c;
  padding: 1px 4px;
  border-radius: 3px;
  letter-spacing: 0.5px;
  font-weight: bold;
}

.wanted-img-wrap {
  display: flex;
  justify-content: center;
  padding: 10px 6px 6px;
}

.wanted-img {
  width: 70px;
  height: 70px;
  object-fit: contain;
  filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.8));
}

.wanted-name {
  text-align: center;
  font-size: 11px;
  color: #e0c88a;
  padding: 0 6px;
  line-height: 1.3;
}

/* ══════════════════════════════════════════
   QUEST SCROLL LIST
══════════════════════════════════════════ */
.target-banner {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 16px;
  border-radius: 8px;
  background: linear-gradient(to right, rgba(40, 28, 14, 0.95), rgba(20, 15, 10, 0.95));
  border: 1px solid #7c5a2b;
  border-left: 4px solid #c89b3c;
  margin-bottom: 4px;
}

.target-img {
  width: 64px;
  height: 64px;
  object-fit: contain;
}
.target-label {
  font-size: 10px;
  color: #7c5a2b;
  letter-spacing: 2px;
  text-transform: uppercase;
  margin: 0;
}
.target-name {
  font-size: 20px;
  color: #ffd27a;
  margin: 2px 0;
}
.target-book {
  font-size: 11px;
  color: #a88040;
  margin: 0;
}

.quest-scroll-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.scroll-card {
  position: relative;
  border-radius: 8px;
  border: 1px solid #7c5a2b;
  background: linear-gradient(135deg, #221810, #17120c 50%, #201510);
  overflow: hidden;
  transition: 0.2s;
}

.scroll-card.scroll-available {
  cursor: pointer;
}

.scroll-card.scroll-available:hover {
  border-color: #c89b3c;
  box-shadow: 0 0 16px rgba(200, 155, 60, 0.35);
}

.scroll-card.scroll-locked {
  opacity: 0.55;
  filter: grayscale(50%);
}
.scroll-card.scroll-exhausted {
  opacity: 0.4;
  filter: grayscale(70%);
}

.lock-veil {
  position: absolute;
  inset: 0;
  background: rgba(8, 5, 2, 0.72);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 3;
  backdrop-filter: blur(1px);
}

.lock-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.lock-glyph {
  font-size: 28px;
}
.lock-msg {
  font-size: 11px;
  color: #aaa;
  text-align: center;
  padding: 0 20px;
  line-height: 1.4;
}

.scroll-inner {
  padding: 14px 16px;
}

.stamp-wrap {
  margin-bottom: 10px;
}

.quest-stamp {
  display: inline-block;
  padding: 4px 10px;
  border-radius: 3px;
  font-size: 10px;
  font-weight: bold;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  font-family: 'Arial Narrow', 'Arial', sans-serif;
}

.quest-stamp.stamp-assigned {
  border: 2px solid #c89b3c;
  color: #c89b3c;
  background: rgba(200, 155, 60, 0.08);
}

.quest-stamp.stamp-investigation {
  border: 2px solid #4499ff;
  color: #4499ff;
  background: rgba(68, 153, 255, 0.08);
}

.quest-stamp.stamp-tempered {
  border: 2px solid #cc77ff;
  color: #cc77ff;
  background: rgba(200, 120, 255, 0.08);
}

.quest-stamp.large {
  font-size: 12px;
  padding: 5px 14px;
}

.scroll-stars {
  display: flex;
  gap: 3px;
  margin-bottom: 10px;
}

.scroll-star {
  font-size: 18px;
  text-shadow: 0 0 6px currentColor;
  line-height: 1;
}

.scroll-chips {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.chip {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 10px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(124, 90, 43, 0.4);
  font-size: 12px;
}

.chip.chip-danger {
  border-color: rgba(255, 80, 80, 0.5);
}
.chip.chip-danger .chip-v {
  color: #ff6b6b;
}

.chip-icon {
  font-size: 12px;
}
.chip-v {
  font-weight: bold;
  color: #f5d7a1;
}
.chip-u {
  color: #a88040;
  font-size: 11px;
}

.exhausted-notice {
  margin-top: 8px;
  font-size: 11px;
  color: #ff6b6b;
  font-style: italic;
}

/* ══════════════════════════════════════════
   DETAIL
══════════════════════════════════════════ */
.phase-detail {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.detail-commission {
  padding: 16px;
  border-radius: 8px;
  background: linear-gradient(135deg, #221810, #17120c);
  border: 1px solid #7c5a2b;
  border-top: 3px solid #c89b3c;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.commission-seal-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
}

.detail-stars {
  display: flex;
  gap: 4px;
}

.detail-star {
  font-size: 24px;
  text-shadow: 0 0 8px currentColor;
  line-height: 1;
}

.detail-monster-row {
  display: flex;
  align-items: center;
  gap: 16px;
}
.detail-monster-img {
  width: 72px;
  height: 72px;
  object-fit: contain;
  filter: drop-shadow(0 0 8px rgba(255, 200, 100, 0.3));
}
.detail-target-label {
  font-size: 10px;
  color: #7c5a2b;
  letter-spacing: 2px;
  text-transform: uppercase;
  margin: 0;
}
.detail-monster-name {
  font-size: 22px;
  color: #ffd27a;
  margin: 2px 0;
}
.detail-book-name {
  font-size: 11px;
  color: #a88040;
  margin: 0;
}

.parchment-stats {
  padding: 14px 16px;
  border-radius: 8px;
  background: rgba(28, 20, 10, 0.95);
  border: 1px solid rgba(124, 90, 43, 0.5);
  display: flex;
  flex-direction: column;
  gap: 0;
}

.pstat {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 0;
  gap: 10px;
  flex-wrap: wrap;
}

.pstat-label {
  font-size: 13px;
  color: #a88040;
}
.pstat-val {
  font-size: 16px;
  font-weight: bold;
  color: #f5d7a1;
}
.pstat-val.sf-val {
  color: #88ddff;
  font-size: 18px;
}
.pstat-val.val-danger {
  color: #ff6b6b;
}

.time-pip-row {
  display: flex;
  gap: 3px;
  align-items: center;
  flex-wrap: wrap;
}
.time-pip {
  width: 10px;
  height: 14px;
  background: linear-gradient(to bottom, #c89b3c, #7c5a2b);
  border-radius: 2px;
}
.time-more {
  font-size: 11px;
  color: #a88040;
  margin-left: 4px;
}
.time-num {
  font-size: 13px;
  color: #c89b3c;
  margin-top: 4px;
}

.pstat-divider {
  height: 1px;
  background: linear-gradient(to right, transparent, rgba(124, 90, 43, 0.4), transparent);
}

.starting-scroll {
  position: relative;
  padding: 16px;
  border-radius: 6px;
  background: linear-gradient(to bottom, #1e1610, #17120c);
  border: 1px solid rgba(124, 90, 43, 0.4);
}

.scroll-tab {
  position: absolute;
  top: -1px;
  left: 16px;
  padding: 2px 12px;
  background: #2a1e10;
  border: 1px solid rgba(124, 90, 43, 0.4);
  border-bottom: none;
  font-size: 10px;
  color: #a88040;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  border-radius: 4px 4px 0 0;
}

.scroll-flavor-title {
  font-size: 13px;
  font-weight: bold;
  color: #ffd27a;
  margin: 8px 0 8px;
}
.scroll-flavor-body {
  font-size: 12px;
  color: #c0a870;
  line-height: 1.7;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.btn-embark {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 16px;
  border-radius: 8px;
  border: 2px solid #c89b3c;
  background: linear-gradient(to bottom, #3a2c1a, #1a1208);
  color: #ffd27a;
  font-size: 16px;
  font-weight: bold;
  letter-spacing: 2px;
  text-transform: uppercase;
  cursor: pointer;
  transition: 0.25s;
  min-height: 56px;
  font-family: inherit;
}

.btn-embark:hover {
  background: linear-gradient(to bottom, #4a3820, #2a1e10);
  box-shadow:
    0 0 20px rgba(200, 155, 60, 0.6),
    0 0 40px rgba(200, 155, 60, 0.2);
  transform: translateY(-2px);
}

.embark-icon {
  font-size: 20px;
}

/* ══════════════════════════════════════════
   DIALOG PHASE
══════════════════════════════════════════ */
.phase-dialog {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.dialog-tag-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.dialog-tag-img {
  width: 40px;
  height: 40px;
  object-fit: contain;
  filter: drop-shadow(0 0 4px rgba(255, 200, 100, 0.3));
}
.dialog-tag-monster {
  display: block;
  font-size: 14px;
  color: #ffd27a;
}
.dialog-tag-quest {
  display: block;
  font-size: 11px;
  color: #a88040;
}

.dialog-parchment {
  position: relative;
  padding: 20px 20px 24px;
  border-radius: 6px;
  background: linear-gradient(160deg, #211810, #1a1208 40%, #1e160c);
  border: 1px solid rgba(200, 155, 60, 0.25);
  box-shadow: inset 0 0 40px rgba(0, 0, 0, 0.5);
}

.parchment-notch {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  width: 40px;
  height: 6px;
  background: rgba(200, 155, 60, 0.2);
  border-radius: 0 0 4px 4px;
}

.parchment-notch.top {
  top: 0;
}
.parchment-notch.bottom {
  bottom: 0;
  border-radius: 4px 4px 0 0;
}

.dp-title {
  font-size: 14px;
  font-weight: bold;
  color: #ffd27a;
  margin: 0 0 10px;
  line-height: 1.4;
}

.dp-rule {
  height: 1px;
  background: linear-gradient(to right, transparent, rgba(200, 155, 60, 0.3), transparent);
  margin: 10px 0;
}

.dp-body {
  font-size: 13px;
  color: #d0b880;
  line-height: 1.8;
  margin: 0;
  font-style: italic;
}

.dp-consequence {
  margin-top: 14px;
  padding: 10px 14px;
  border-radius: 6px;
  background: rgba(200, 155, 60, 0.07);
  border-left: 3px solid #c89b3c;
  font-size: 12px;
  color: #f0d9a0;
  line-height: 1.6;
}

.dp-consequence-label {
  display: block;
  font-size: 9px;
  color: #c89b3c;
  letter-spacing: 2px;
  text-transform: uppercase;
  margin-bottom: 4px;
}

.dialog-choices {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.choices-label {
  font-size: 11px;
  color: #7c5a2b;
  letter-spacing: 3px;
  text-transform: uppercase;
  margin: 0;
  text-align: center;
}

/* ══════════════════════════════════════════
   ACTION CONFIRM MODAL
══════════════════════════════════════════ */
.action-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(5, 4, 2, 0.72);
  backdrop-filter: blur(10px) brightness(0.55);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 300;
  padding: 16px;
}

.action-modal {
  width: min(440px, 100%);
  padding: 24px;
  border-radius: 12px;
  background: linear-gradient(160deg, #1c1508, #13100a, #1c1508);
  border: 2px solid #7c5a2b;
  box-shadow:
    0 0 40px rgba(0, 0, 0, 0.9),
    0 0 20px rgba(200, 155, 60, 0.12);
  display: flex;
  flex-direction: column;
  gap: 16px;
  animation: popIn 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
  font-family: 'Georgia', serif;
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

.am-stamp {
  text-align: center;
  font-size: 9px;
  letter-spacing: 5px;
  text-transform: uppercase;
  color: #c89b3c;
  border: 1px solid rgba(200, 155, 60, 0.35);
  border-radius: 4px;
  padding: 4px 12px;
  width: fit-content;
  margin: 0 auto;
  background: rgba(200, 155, 60, 0.06);
}

.am-action-title {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  border-radius: 8px;
  background: rgba(10, 8, 4, 0.6);
  border: 1px solid rgba(124, 90, 43, 0.4);
  border-left: 3px solid #c89b3c;
}

.am-num {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: rgba(200, 155, 60, 0.15);
  border: 1px solid #7c5a2b;
  color: #c89b3c;
  font-size: 13px;
  font-weight: bold;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.am-title {
  font-size: 15px;
  color: #ffd27a;
  line-height: 1.4;
  text-shadow: 0 0 10px rgba(255, 200, 80, 0.3);
  padding-top: 2px;
}

.am-consequences {
  padding: 12px 14px;
  border-radius: 8px;
  background: rgba(139, 90, 20, 0.08);
  border: 1px solid rgba(200, 130, 40, 0.3);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.am-con-label {
  font-size: 9px;
  letter-spacing: 3px;
  text-transform: uppercase;
  color: #a88040;
}

.am-con-text {
  margin: 0;
  font-size: 13px;
  color: #f0ddb0;
  line-height: 1.6;
  font-style: italic;
}

.am-buttons {
  display: flex;
  gap: 10px;
}

.am-btn-confirm {
  flex: 1;
  padding: 12px;
  border-radius: 8px;
  border: 2px solid #7c5a2b;
  background: linear-gradient(to bottom, #3a2c1a, #1a1208);
  color: #ffd27a;
  font-family: 'Georgia', serif;
  font-size: 14px;
  letter-spacing: 1px;
  cursor: pointer;
  transition: 0.2s;
  min-height: 48px;
}

.am-btn-confirm:hover {
  border-color: #c89b3c;
  box-shadow: 0 0 14px rgba(200, 155, 60, 0.35);
  color: #fff;
}

.am-btn-cancel {
  padding: 12px 18px;
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

.am-btn-cancel:hover {
  color: #a88040;
  border-color: #7c5a2b;
}

@media (max-width: 480px) {
  .action-modal {
    padding: 18px 16px;
    gap: 12px;
  }
  .am-title {
    font-size: 14px;
  }
  .am-buttons {
    flex-direction: column;
  }
}

.choice-btn {
  padding: 13px 16px;
  border-radius: 8px;
  border: 1px solid rgba(124, 90, 43, 0.6);
  background: linear-gradient(to right, rgba(40, 28, 14, 0.9), rgba(20, 15, 10, 0.9));
  color: #f5d7a1;
  text-align: left;
  cursor: pointer;
  transition: 0.2s;
  font-family: inherit;
  min-height: 52px;
}

.choice-btn:hover {
  border-color: #c89b3c;
  box-shadow: 0 0 12px rgba(200, 155, 60, 0.3);
  transform: translateX(6px);
  background: linear-gradient(to right, rgba(58, 44, 26, 0.95), rgba(32, 24, 14, 0.95));
}

.choice-header {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.choice-num {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: rgba(200, 155, 60, 0.15);
  border: 1px solid #7c5a2b;
  color: #c89b3c;
  font-size: 11px;
  font-weight: bold;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-top: 1px;
}

.choice-title {
  font-size: 14px;
  font-weight: bold;
  color: #ffd27a;
  line-height: 1.4;
}

.choice-requirement {
  display: flex;
  align-items: flex-start;
  gap: 5px;
  margin-top: 6px;
  padding: 5px 10px;
  padding-left: 32px;
  border-radius: 4px;
  background: rgba(180, 100, 20, 0.1);
  border-left: 2px solid #c07020;
  font-size: 11px;
  color: #d4904a;
  line-height: 1.4;
  font-style: italic;
}

.req-icon {
  font-style: normal;
  flex-shrink: 0;
  font-size: 10px;
}

.choice-effect {
  margin-top: 6px;
  padding-left: 32px;
  font-size: 11px;
  color: #a88040;
  line-height: 1.5;
}

/* ══════════════════════════════════════════
   HUNTING PHASE
══════════════════════════════════════════ */
.phase-hunting {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.hunt-intro-scroll {
  padding: 16px;
  border-radius: 6px;
  background: rgba(20, 15, 10, 0.9);
  border: 1px solid rgba(200, 155, 60, 0.2);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.hunt-portrait {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px 0;
  border-radius: 8px;
  background: radial-gradient(
    ellipse at center,
    rgba(120, 30, 10, 0.3) 0%,
    rgba(10, 5, 2, 0.95) 70%
  );
  border: 1px solid rgba(180, 60, 20, 0.4);
  overflow: hidden;
}

.hunt-portrait-glow {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 160px;
  height: 160px;
  background: radial-gradient(circle, rgba(200, 80, 20, 0.2) 0%, transparent 70%);
  pointer-events: none;
}

.hunt-portrait-img {
  width: 120px;
  height: 120px;
  object-fit: contain;
  filter: drop-shadow(0 0 20px rgba(255, 100, 50, 0.6));
  position: relative;
  z-index: 1;
}

.hunt-portrait-name {
  font-size: 20px;
  color: #ff9955;
  letter-spacing: 3px;
  text-transform: uppercase;
  text-shadow: 0 0 12px rgba(255, 100, 50, 0.7);
  margin-top: 10px;
  font-weight: bold;
  z-index: 1;
}

.field-notes {
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid rgba(124, 90, 43, 0.5);
}

.field-notes-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: rgba(60, 45, 20, 0.8);
  font-size: 12px;
  color: #c89b3c;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  font-weight: bold;
}

.fn-table {
  display: flex;
  flex-direction: column;
}

.fn-row {
  display: grid;
  grid-template-columns: 1fr 20px 1fr;
  align-items: center;
  padding: 13px 16px;
  gap: 10px;
  border-top: 1px solid rgba(124, 90, 43, 0.25);
  background: rgba(20, 15, 10, 0.85);
}

.fn-row.fn-mid {
  background: rgba(28, 20, 12, 0.85);
}
.fn-row.fn-high {
  background: rgba(35, 22, 14, 0.85);
}

.fn-level {
  display: flex;
  flex-direction: column;
}
.fn-range {
  font-size: 16px;
  font-weight: bold;
  color: #88ddff;
}
.fn-label {
  font-size: 9px;
  color: #7c5a2b;
  letter-spacing: 1px;
  text-transform: uppercase;
  margin-top: 2px;
}

.fn-divider {
  color: #7c5a2b;
  text-align: center;
  font-size: 12px;
}

.fn-attack {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}
.fn-attack-label {
  font-size: 9px;
  color: #7c5a2b;
  letter-spacing: 1px;
  text-transform: uppercase;
  margin-bottom: 2px;
}
.fn-attack-name {
  font-size: 15px;
  font-weight: bold;
  color: #ff9955;
  text-align: right;
  line-height: 1.3;
}

.hunt-result-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.hunt-result-label {
  text-align: center;
  font-size: 11px;
  color: #7c5a2b;
  letter-spacing: 3px;
  text-transform: uppercase;
  margin: 0;
}

.hunt-result-btns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.result-icon {
  font-size: 16px;
}

.btn-complete {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 16px;
  border-radius: 8px;
  border: 2px solid #3cb83c;
  background: linear-gradient(to bottom, #1a3a1a, #0d1a0d);
  color: #7cfc00;
  font-size: 15px;
  font-weight: bold;
  cursor: pointer;
  transition: 0.2s;
  letter-spacing: 1px;
  min-height: 56px;
  font-family: inherit;
}

.btn-complete:hover {
  box-shadow: 0 0 20px rgba(100, 255, 100, 0.5);
  transform: translateY(-2px);
}

.btn-fail {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 16px;
  border-radius: 8px;
  border: 2px solid #8c3a3a;
  background: linear-gradient(to bottom, #3a1a1a, #1a0d0d);
  color: #ff6b6b;
  font-size: 15px;
  font-weight: bold;
  cursor: pointer;
  transition: 0.2s;
  letter-spacing: 1px;
  min-height: 56px;
  font-family: inherit;
}

.btn-fail:hover {
  box-shadow: 0 0 20px rgba(255, 80, 80, 0.5);
  transform: translateY(-2px);
}

/* ══════════════════════════════════════════
   ENTER HUNTING PHASE BUTTON
══════════════════════════════════════════ */
.hunt-enter-section {
  padding-top: 4px;
}

.btn-enter-hunt {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 100%;
  padding: 16px;
  border-radius: 8px;
  border: 2px solid #c89b3c;
  background: linear-gradient(to bottom, #3a2c1a, #1a1208);
  color: #ffd27a;
  font-size: 16px;
  font-weight: bold;
  letter-spacing: 2px;
  text-transform: uppercase;
  cursor: pointer;
  transition: 0.25s;
  min-height: 56px;
  font-family: inherit;
}

.btn-enter-hunt:hover {
  background: linear-gradient(to bottom, #4a3820, #2a1e10);
  box-shadow:
    0 0 20px rgba(200, 155, 60, 0.6),
    0 0 40px rgba(200, 155, 60, 0.2);
  transform: translateY(-2px);
}

.enter-hunt-icon {
  font-size: 20px;
}

/* ══════════════════════════════════════════
   HUNTING PANEL
══════════════════════════════════════════ */
.phase-hunting-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* — Header — */
.hpanel-header {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  border-radius: 8px;
  background: radial-gradient(
    ellipse at center,
    rgba(120, 30, 10, 0.25) 0%,
    rgba(10, 5, 2, 0.95) 70%
  );
  border: 1px solid rgba(180, 60, 20, 0.4);
}

.hpanel-monster-img {
  width: 72px;
  height: 72px;
  object-fit: contain;
  filter: drop-shadow(0 0 14px rgba(255, 100, 50, 0.5));
  flex-shrink: 0;
}

.hpanel-header-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.hpanel-phase-tag {
  font-size: 9px;
  letter-spacing: 4px;
  text-transform: uppercase;
  color: #ff9955;
  margin: 0;
}

.hpanel-monster-name {
  font-size: 22px;
  color: #ffd27a;
  margin: 0;
  text-shadow: 0 0 10px rgba(255, 200, 80, 0.3);
}

.hpanel-stars {
  display: flex;
  gap: 3px;
  font-size: 16px;
}

/* — Map — */
.hpanel-map-wrap {
  padding: 12px;
}

.hpanel-map-img {
  display: block;
  width: 50%;
  aspect-ratio: 1 / 1;
  object-fit: contain;
  border-radius: 4px;
  image-rendering: pixelated;
}

/* — Monster Status Canvas — */
.msc-wrap {
  width: 100%;
}
.msc-portrait {
  position: relative;
  width: 100%;
  /* aspect-ratio: 1 / 1; */
  border-radius: 10px;
  overflow: hidden;
  background: radial-gradient(circle at 50% 60%, rgba(30, 20, 8, 0.95), rgba(8, 6, 2, 0.98));
  border: 1px solid rgba(124, 90, 43, 0.4);

  display: flex;
  align-items: center;
  justify-content: center;
}
.msc-monster-img {
  width: 70%;
  height: 70%;
  object-fit: contain;
  padding: 6%;
}
/* Applied status overlay */
.msc-status-overlays {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 6px 8px;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.75) 60%, transparent);
}
.msc-status-list {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
.msc-applied-badge {
  position: relative;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: 2px solid rgba(255, 200, 80, 0.8);
  background: rgba(10, 8, 4, 0.85);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: 0.15s;
  box-shadow: 0 0 8px rgba(255, 150, 50, 0.4);
}
.msc-applied-badge:hover {
  border-color: #ff6666;
  box-shadow: 0 0 10px rgba(255, 80, 80, 0.5);
}
.msc-applied-icon {
  width: 30px;
  height: 30px;
  object-fit: contain;
}
.msc-remove-x {
  position: absolute;
  top: -4px;
  right: -4px;
  width: 13px;
  height: 13px;
  border-radius: 50%;
  background: #cc2222;
  color: #fff;
  font-size: 9px;
  font-weight: bold;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  pointer-events: none;
}
/* Status pop transition */
.status-pop-enter-active {
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.status-pop-leave-active {
  transition: all 0.15s ease;
}
.status-pop-enter-from {
  opacity: 0;
  transform: scale(0);
}
.status-pop-leave-to {
  opacity: 0;
  transform: scale(0.5);
}

/* Element animation overlay */
.msc-elem-flash {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  pointer-events: none;
}
.msc-elem-flash-img {
  width: 30%;
  height: 30%;
  object-fit: contain;
}
/* Per-element tint + animation */
.elem-flash-1 {
  background: rgba(255, 80, 20, 0.25);
}
.elem-flash-2 {
  background: rgba(30, 120, 255, 0.25);
}
.elem-flash-3 {
  background: rgba(255, 230, 0, 0.25);
}
.elem-flash-4 {
  background: rgba(160, 220, 255, 0.25);
}
.elem-flash-5 {
  background: rgba(140, 40, 220, 0.25);
}

@keyframes elem-trigger {
  0% {
    opacity: 0;
    transform: scale(0.3) rotate(-15deg);
  }
  25% {
    opacity: 1;
    transform: scale(1.6) rotate(5deg);
    filter: brightness(2);
  }
  60% {
    opacity: 0.85;
    transform: scale(1.3) rotate(0deg);
    filter: brightness(1.4);
  }
  100% {
    opacity: 0;
    transform: scale(2) rotate(3deg);
    filter: brightness(1);
  }
}
.elem-flash-enter-active .msc-elem-flash-img {
  animation: elem-trigger 1.8s ease forwards;
}
.elem-flash-enter-active {
  animation: elem-trigger 1.8s ease forwards;
}
.elem-flash-enter-from {
  opacity: 0;
}
.elem-flash-leave-active {
  display: none;
}

/* — Resistance / Marking Row — */
.resist-row {
  display: flex;
  gap: 8px;
}

.resist-col {
  flex: 1;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(20, 15, 10, 0.9);
  border: 1px solid rgba(124, 90, 43, 0.45);
}

.resist-col-label {
  font-size: 9px;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: #7c5a2b;
  margin: 0 0 7px;
}

.resist-items {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.resist-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  opacity: 0.5;
}
.resist-item-active {
  opacity: 1;
  cursor: pointer;
  transition: 0.15s;
}
.resist-item-active:hover .resist-icon-wrap {
  filter: drop-shadow(0 0 5px rgba(255, 200, 80, 0.6));
}
.resist-item-applied .resist-icon-wrap {
  filter: drop-shadow(0 0 6px rgba(100, 255, 100, 0.7));
}

.resist-icon-wrap {
  position: relative;
  width: 50px;
  height: 50px;
}
.resist-icon {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.resist-immune-x {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: 900;
  color: #ff2222;
  text-shadow:
    0 0 6px rgba(255, 0, 0, 0.7),
    0 0 2px #000;
  line-height: 1;
  pointer-events: none;
}
.resist-applied-dot {
  position: absolute;
  top: -3px;
  right: -3px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #3cb83c;
  color: #fff;
  font-size: 8px;
  font-weight: bold;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  box-shadow: 0 0 5px rgba(60, 200, 60, 0.6);
}

/* Mark dots */
.resist-marks {
  display: flex;
  gap: 3px;
  min-height: 8px;
  justify-content: center;
}
.resist-mark {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  border: 1px solid rgba(124, 90, 43, 0.7);
  background: transparent;
  transition: 0.15s;
}
.resist-mark-elem.mark-filled {
  background: #ffd27a;
  border-color: #ffd27a;
  box-shadow: 0 0 4px rgba(255, 200, 80, 0.8);
}
.resist-mark-status.mark-filled {
  background: #e06060;
  border-color: #e06060;
  box-shadow: 0 0 4px rgba(230, 80, 80, 0.8);
}
.resist-mark.mark-immune {
  background: rgba(90, 61, 31, 0.2);
  border-color: rgba(90, 61, 31, 0.3);
  width: 5px;
  height: 5px;
}

/* — Special Rule + Parts Row — */
.info-parts-row {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.info-left-col {
  flex: 0 0 42%;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.info-left-col .resist-row {
  flex-direction: row;
  gap: 8px;
}

.hpanel-special-rule {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 12px 14px;
  border-radius: 8px;
  background: rgba(100, 60, 10, 0.12);
  border: 1px solid rgba(200, 130, 40, 0.35);
  border-left: 3px solid #c89b3c;
}

.hpanel-parts-col {
  flex: 1;
  min-width: 0;
}

.hpanel-rule-icon {
  font-size: 18px;
  flex-shrink: 0;
  margin-top: 1px;
}

.hpanel-rule-title {
  font-size: 13px;
  font-weight: bold;
  color: #ffd27a;
  margin: 0 0 4px;
}

.hpanel-rule-desc {
  font-size: 12px;
  color: #c0a870;
  line-height: 1.7;
  margin: 0;
  font-style: italic;
}

/* — Section wrapper — */
.hpanel-section {
  border-radius: 8px;
  background: rgba(20, 15, 10, 0.9);
  border: 1px solid rgba(124, 90, 43, 0.45);
  overflow: hidden;
}

.hpanel-section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: rgba(50, 36, 16, 0.7);
  border-bottom: 1px solid rgba(124, 90, 43, 0.3);
}

.hpanel-section-icon {
  font-size: 15px;
}

.hpanel-section-label {
  font-size: 11px;
  font-weight: bold;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: #c89b3c;
  flex: 1;
}

.hpanel-hp-nums {
  font-size: 15px;
  font-weight: bold;
  color: #f5d7a1;
  letter-spacing: 1px;
}

.hp-header-dead {
  background: rgba(60, 10, 10, 0.6);
}

.hp-nums-dead {
  color: #ff4444;
  letter-spacing: 3px;
  text-transform: uppercase;
  font-size: 13px;
  animation: deadPulse 2s ease-in-out infinite alternate;
}

@keyframes deadPulse {
  from {
    opacity: 0.7;
  }
  to {
    opacity: 1;
  }
}

/* — HP Bar — */
.hp-bar-track {
  margin: 12px 14px 0;
  height: 18px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(124, 90, 43, 0.3);
  overflow: hidden;
}

.hp-bar-fill {
  height: 100%;
  border-radius: 3px;
  transition:
    width 0.3s ease,
    background 0.5s ease;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.15);
}

/* — HP Controls — */
.hp-controls {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 14px 14px;
  flex-wrap: wrap;
}

.hp-ctrl-sep {
  flex: 1;
  height: 1px;
  background: rgba(124, 90, 43, 0.3);
  min-width: 8px;
}

.hp-btn {
  padding: 7px 12px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: bold;
  cursor: pointer;
  transition: 0.15s;
  min-height: 36px;
  min-width: 44px;
  font-family: inherit;
  letter-spacing: 0.5px;
}

.hp-minus {
  border: 1px solid rgba(200, 60, 60, 0.5);
  background: rgba(60, 10, 10, 0.7);
  color: #ff9090;
}

.hp-minus:hover {
  border-color: #cc4444;
  background: rgba(100, 20, 20, 0.8);
  box-shadow: 0 0 8px rgba(200, 60, 60, 0.3);
}

.hp-plus {
  border: 1px solid rgba(60, 184, 60, 0.5);
  background: rgba(10, 40, 10, 0.7);
  color: #7cfc00;
}

.hp-plus:hover {
  border-color: #3cb83c;
  background: rgba(20, 60, 20, 0.8);
  box-shadow: 0 0 8px rgba(60, 184, 60, 0.3);
}

/* — Parts Layout — */
.parts-layout {
  padding: 14px;
}

/* — Part Cards — */
.parts-list {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.part-card {
  border-radius: 8px;
  border: 1px solid rgba(124, 90, 43, 0.5);
  background: linear-gradient(135deg, #1e1810, #17120c);
  overflow: hidden;
  transition: border-color 0.3s;
}

.part-card-broken {
  border-color: rgba(220, 60, 40, 0.6);
  background: linear-gradient(135deg, #1e1010, #140c0c);
}

.part-card-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-bottom: 1px solid rgba(124, 90, 43, 0.25);
  position: relative;
}

.part-icon-wrap {
  width: 50px;
  height: 50px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(124, 90, 43, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.part-icon-img {
  width: 43px;
  height: 43px;
  border-radius: 4px;
  object-fit: contain;
  filter: drop-shadow(0 0 3px rgba(200, 155, 60, 0.4));
  transition: filter 0.3s;
}

.part-icon-broken {
  filter: drop-shadow(0 0 4px rgba(220, 60, 40, 0.6)) grayscale(0.3);
}

/* — Armor element card (mirrors Crafting.vue) — */
.part-card-armor-wrap {
  display: flex;
  align-items: center;
}

.armor-element-card {
  position: relative;
  width: 44px;
  height: 44px;
}

.armor-element-card .armor-base {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.armor-element-card .element-value {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 15px;
  font-weight: bold;
  color: #fff;
  text-shadow: 0 0 4px black;
  z-index: 3;
  -webkit-text-stroke: 0.5px black;
}

.part-mini-diagram {
  flex-shrink: 0;
}

.part-mini-svg {
  width: 44px;
  height: 44px;
  display: block;
}

.part-broken-stamp {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%) rotate(-8deg);
  font-size: 10px;
  font-weight: bold;
  letter-spacing: 2px;
  color: #ff5533;
  border: 2px solid #ff5533;
  padding: 2px 8px;
  border-radius: 3px;
  background: rgba(30, 5, 5, 0.7);
  text-transform: uppercase;
  box-shadow: 0 0 8px rgba(255, 50, 30, 0.3);
  animation: brokenStampIn 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes brokenStampIn {
  from {
    transform: translateY(-50%) rotate(-8deg) scale(0.5);
    opacity: 0;
  }
  to {
    transform: translateY(-50%) rotate(-8deg) scale(1);
    opacity: 1;
  }
}

/* — Break bar — */
.part-break-wrap {
  padding: 10px 12px 12px;
}

.part-break-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 5px;
}

.part-break-label {
  font-size: 9px;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: #7c5a2b;
}

.part-break-nums {
  font-size: 12px;
  font-weight: bold;
  color: #f5d7a1;
}

.part-break-track {
  height: 10px;
  border-radius: 3px;
  background: rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(124, 90, 43, 0.3);
  overflow: hidden;
  margin-bottom: 8px;
}

.part-break-fill {
  height: 100%;
  border-radius: 2px;
  background: linear-gradient(to right, #7c5a2b, #c89b3c);
  transition: width 0.3s ease;
}

.break-fill-broken {
  background: linear-gradient(to right, #992222, #dd4422);
  box-shadow: 0 0 6px rgba(220, 60, 30, 0.5);
}

.part-break-controls {
  display: flex;
  gap: 5px;
}

.pb-btn {
  flex: 1;
  padding: 5px 8px;
  border-radius: 5px;
  font-size: 12px;
  font-weight: bold;
  cursor: pointer;
  transition: 0.15s;
  min-height: 32px;
  font-family: inherit;
}

.pb-minus {
  border: 1px solid rgba(180, 60, 60, 0.45);
  background: rgba(50, 8, 8, 0.7);
  color: #ff9090;
}

.pb-minus:hover {
  border-color: #cc4444;
  box-shadow: 0 0 6px rgba(200, 60, 60, 0.25);
}

.pb-plus {
  border: 1px solid rgba(200, 155, 60, 0.45);
  background: rgba(30, 22, 8, 0.7);
  color: #ffd27a;
}

.pb-plus:hover {
  border-color: #c89b3c;
  box-shadow: 0 0 6px rgba(200, 155, 60, 0.25);
}

/* — Break rule — */
.part-break-rule {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  margin: 0 12px 12px;
  padding: 10px 12px;
  border-radius: 6px;
}

.pbr-tip {
  background: rgba(200, 155, 60, 0.05);
  border: 1px solid rgba(200, 155, 60, 0.2);
  border-left: 3px solid rgba(200, 155, 60, 0.4);
}

.pbr-broken {
  background: rgba(180, 40, 20, 0.12);
  border: 1px solid rgba(220, 60, 40, 0.35);
  border-left: 3px solid #dd4422;
}

.pbr-icon {
  font-size: 14px;
  flex-shrink: 0;
  margin-top: 2px;
}

.pbr-body {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.pbr-label {
  font-size: 8px;
  letter-spacing: 2px;
  text-transform: uppercase;
  font-weight: bold;
}

.pbr-tip .pbr-label {
  color: #7c5a2b;
}

.pbr-broken .pbr-label {
  color: #dd4422;
}

.pbr-text {
  font-size: 12px;
  line-height: 1.6;
  margin: 0;
  font-style: italic;
}

.pbr-tip .pbr-text {
  color: #a88040;
}

.pbr-broken .pbr-text {
  color: #ffb090;
}

/* ══════════════════════════════════════════
   RESPONSIVE — iPad (≤ 768px)
══════════════════════════════════════════ */
@media (max-width: 768px) {
  .board-title {
    font-size: 20px;
    letter-spacing: 2px;
  }

  .book-grid {
    gap: 12px;
  }
  .book-card {
    min-height: 150px;
  }
  .book-title-text {
    font-size: 16px;
  }

  .monster-grid {
    grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
    gap: 10px;
  }
  .wanted-img {
    width: 58px;
    height: 58px;
  }

  .target-banner {
    padding: 12px;
  }
  .target-name {
    font-size: 17px;
  }

  .detail-monster-name {
    font-size: 18px;
  }
  .pstat-val {
    font-size: 14px;
  }
  .pstat-val.sf-val {
    font-size: 16px;
  }

  .fn-range {
    font-size: 14px;
  }
  .fn-attack-name {
    font-size: 13px;
  }

  .btn-complete,
  .btn-fail {
    font-size: 13px;
    padding: 14px;
  }
  .btn-embark {
    font-size: 14px;
  }

  .choice-title {
    font-size: 13px;
  }
}

/* ══════════════════════════════════════════
   RESPONSIVE — Smartphone (≤ 480px)
══════════════════════════════════════════ */
@media (max-width: 480px) {
  .quest-container {
    gap: 14px;
  }

  .board-title {
    font-size: 17px;
    letter-spacing: 1px;
  }
  .board-subtitle {
    font-size: 10px;
    letter-spacing: 2px;
  }
  .board-ornament {
    font-size: 14px;
  }

  .book-grid {
    grid-template-columns: 1fr;
    gap: 12px;
  }

  .book-card {
    min-height: 100px;
    flex-direction: row;
  }
  .book-spine {
    width: 12px;
  }
  .book-body {
    flex-direction: row;
    padding: 14px 16px;
    gap: 14px;
    justify-content: flex-start;
  }
  .book-seal {
    width: 40px;
    height: 40px;
    flex-shrink: 0;
  }
  .seal-inner {
    width: 100%;
    height: 100%;
  }
  .book-title-text {
    font-size: 16px;
    text-align: left;
  }
  .book-divider {
    display: none;
  }
  .book-meta {
    font-size: 11px;
  }
  .book-cta {
    display: none;
  }

  .monster-grid {
    grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
    gap: 8px;
  }
  .wanted-img {
    width: 52px;
    height: 52px;
  }
  .wanted-name {
    font-size: 10px;
  }

  .target-banner {
    padding: 10px 12px;
    gap: 12px;
  }
  .target-img {
    width: 50px;
    height: 50px;
  }
  .target-name {
    font-size: 16px;
  }

  .scroll-inner {
    padding: 12px;
  }
  .scroll-chips {
    gap: 6px;
  }
  .chip {
    padding: 4px 8px;
    font-size: 11px;
  }

  .detail-commission {
    padding: 12px;
  }
  .commission-seal-bar {
    flex-direction: column;
    align-items: flex-start;
  }
  .detail-monster-img {
    width: 58px;
    height: 58px;
  }
  .detail-monster-name {
    font-size: 18px;
  }
  .detail-star {
    font-size: 20px;
  }

  .pstat {
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
  }
  .pstat-val {
    font-size: 15px;
  }
  .time-pip {
    width: 8px;
    height: 12px;
  }

  .dialog-parchment {
    padding: 16px 14px;
  }
  .dp-title {
    font-size: 13px;
  }
  .dp-body {
    font-size: 12px;
    line-height: 1.7;
  }

  .choice-btn {
    padding: 12px 14px;
  }
  .choice-title {
    font-size: 13px;
  }
  .choice-effect {
    font-size: 11px;
    padding-left: 28px;
  }

  .hunt-portrait-img {
    width: 90px;
    height: 90px;
  }
  .hunt-portrait-name {
    font-size: 16px;
  }

  .fn-row {
    grid-template-columns: 90px 16px 1fr;
    padding: 12px 12px;
    gap: 6px;
  }
  .fn-range {
    font-size: 13px;
  }
  .fn-attack-name {
    font-size: 13px;
  }

  .hunt-result-btns {
    grid-template-columns: 1fr;
    gap: 10px;
  }
  .btn-complete,
  .btn-fail {
    font-size: 15px;
    min-height: 52px;
  }

  .nav-bar {
    gap: 10px;
  }
  .btn-back {
    padding: 8px 12px;
    font-size: 12px;
  }
  .breadcrumb {
    font-size: 11px;
  }

  .hpanel-monster-name {
    font-size: 18px;
  }
  .hpanel-monster-img {
    width: 56px;
    height: 56px;
  }

  /* Hunting panel: stack left col + parts col vertically */
  .info-parts-row {
    flex-direction: column;
  }
  .info-left-col {
    flex: 0 0 auto;
    width: 100%;
  }
  .info-left-col .resist-row {
    flex-direction: row;
  }
  .msc-portrait {
    aspect-ratio: 2 / 1;
  }
  .msc-monster-img {
    object-position: center 30%;
  }

  /* Parts: single column for full width */
  .parts-layout {
    padding: 10px;
  }
  .parts-list {
    grid-template-columns: 1fr;
    gap: 10px;
  }

  /* Bigger touch targets for part break buttons */
  .pb-btn {
    min-height: 40px;
    font-size: 13px;
    padding: 8px 6px;
  }
  .part-break-controls {
    gap: 6px;
  }

  /* Part card: reduce icon size a bit to save space */
  .part-icon-wrap {
    width: 40px;
    height: 40px;
  }
  .part-icon-img {
    width: 34px;
    height: 34px;
  }
  .part-card-head {
    padding: 8px 10px;
    gap: 8px;
  }

  .hp-controls {
    gap: 5px;
  }
  .hp-btn {
    min-width: 38px;
    padding: 6px 8px;
    font-size: 12px;
  }
}
</style>

<style>
/* ══════════════════════════════════════════
   OUTCOME CONFIRM MODAL  (unscoped — teleport escapes scoped)
══════════════════════════════════════════ */
.outcome-confirm-overlay {
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

.outcome-confirm-modal {
  width: min(400px, 100%);
  padding: 24px;
  border-radius: 12px;
  background: linear-gradient(160deg, #1c1508, #13100a, #1c1508);
  border: 2px solid #7c5a2b;
  box-shadow: 0 0 40px rgba(0, 0, 0, 0.9);
  display: flex;
  flex-direction: column;
  gap: 14px;
  animation: ocmPopIn 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
  font-family: 'Georgia', serif;
}

@keyframes ocmPopIn {
  from {
    transform: scale(0.85);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}

.outcome-confirm-modal.ocm-complete {
  border-color: #3cb83c;
  box-shadow:
    0 0 40px rgba(0, 0, 0, 0.9),
    0 0 20px rgba(60, 184, 60, 0.15);
}

.outcome-confirm-modal.ocm-fail {
  border-color: #8c3a3a;
  box-shadow:
    0 0 40px rgba(0, 0, 0, 0.9),
    0 0 20px rgba(200, 60, 60, 0.15);
}

.ocm-stamp {
  text-align: center;
  font-size: 9px;
  letter-spacing: 5px;
  text-transform: uppercase;
  border-radius: 4px;
  padding: 4px 14px;
  width: fit-content;
  margin: 0 auto;
}

.ocm-complete .ocm-stamp {
  color: #7cfc00;
  border: 1px solid rgba(60, 184, 60, 0.4);
  background: rgba(60, 184, 60, 0.08);
}

.ocm-fail .ocm-stamp {
  color: #ff6b6b;
  border: 1px solid rgba(200, 60, 60, 0.4);
  background: rgba(200, 60, 60, 0.08);
}

.ocm-question {
  margin: 0;
  font-size: 17px;
  color: #ffd27a;
  text-align: center;
  font-family: 'Georgia', serif;
}

.ocm-desc {
  margin: 0;
  font-size: 12px;
  color: #7c5a2b;
  text-align: center;
  font-style: italic;
  font-family: 'Georgia', serif;
}

.ocm-btn-result {
  font-weight: bold;
  letter-spacing: 1px;
}

.ocm-result-complete {
  border: 2px solid #3cb83c !important;
  background: linear-gradient(to bottom, #1a3a1a, #0d1a0d) !important;
  color: #7cfc00 !important;
}

.ocm-result-complete:hover {
  box-shadow: 0 0 18px rgba(100, 255, 100, 0.45) !important;
}

.ocm-result-fail {
  border: 2px solid #8c3a3a !important;
  background: linear-gradient(to bottom, #3a1a1a, #1a0d0d) !important;
  color: #ff6b6b !important;
}

.ocm-result-fail:hover {
  box-shadow: 0 0 18px rgba(255, 80, 80, 0.45) !important;
}

/* ══════════════════════════════════════════
   RESULT ANIMATION OVERLAY — MHW THEMED
══════════════════════════════════════════ */
.result-anim-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  z-index: 400;
  cursor: pointer;
  overflow: hidden;
  animation: raFadeIn 0.3s ease-out forwards;
}

.result-anim-overlay.ra-complete {
  background: #07050000;
}
.result-anim-overlay.ra-fail {
  background: #060002;
}

@keyframes raFadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

/* ——— Dark fill (complete needs solid bg under rays) ——— */
.ra-complete::before {
  content: '';
  position: absolute;
  inset: 0;
  background: #080600;
  z-index: 0;
}

/* ——— Fail screen flash ——— */
.ra-fail-flash {
  position: absolute;
  inset: 0;
  background: rgba(200, 0, 0, 0.55);
  animation: raFailFlash 0.5s ease-out forwards;
  pointer-events: none;
  z-index: 1;
}
@keyframes raFailFlash {
  0% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}

/* ——— Rotating light rays (complete) ——— */
.ra-rays {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 200vmax;
  height: 200vmax;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  background: conic-gradient(
    from 0deg,
    transparent 0deg,
    rgba(200, 155, 60, 0.1) 7deg,
    transparent 14deg,
    transparent 21deg,
    rgba(200, 155, 60, 0.06) 28deg,
    transparent 35deg,
    transparent 42deg,
    rgba(200, 155, 60, 0.1) 49deg,
    transparent 56deg,
    transparent 63deg,
    rgba(200, 155, 60, 0.06) 70deg,
    transparent 77deg,
    transparent 84deg,
    rgba(200, 155, 60, 0.1) 91deg,
    transparent 98deg,
    transparent 105deg,
    rgba(200, 155, 60, 0.06) 112deg,
    transparent 119deg,
    transparent 126deg,
    rgba(200, 155, 60, 0.1) 133deg,
    transparent 140deg,
    transparent 147deg,
    rgba(200, 155, 60, 0.06) 154deg,
    transparent 161deg,
    transparent 168deg,
    rgba(200, 155, 60, 0.1) 175deg,
    transparent 182deg,
    transparent 189deg,
    rgba(200, 155, 60, 0.06) 196deg,
    transparent 203deg,
    transparent 210deg,
    rgba(200, 155, 60, 0.1) 217deg,
    transparent 224deg,
    transparent 231deg,
    rgba(200, 155, 60, 0.06) 238deg,
    transparent 245deg,
    transparent 252deg,
    rgba(200, 155, 60, 0.1) 259deg,
    transparent 266deg,
    transparent 273deg,
    rgba(200, 155, 60, 0.06) 280deg,
    transparent 287deg,
    transparent 294deg,
    rgba(200, 155, 60, 0.1) 301deg,
    transparent 308deg,
    transparent 315deg,
    rgba(200, 155, 60, 0.06) 322deg,
    transparent 329deg,
    transparent 336deg,
    rgba(200, 155, 60, 0.1) 343deg,
    transparent 350deg,
    transparent 357deg,
    rgba(200, 155, 60, 0.06) 360deg
  );
  animation: raRaysSpin 16s linear infinite;
  pointer-events: none;
  z-index: 1;
}
@keyframes raRaysSpin {
  from {
    transform: translate(-50%, -50%) rotate(0deg);
  }
  to {
    transform: translate(-50%, -50%) rotate(360deg);
  }
}

/* ——— Cinematic bars ——— */
.ra-cinebar {
  position: absolute;
  left: 0;
  right: 0;
  height: 76px;
  display: flex;
  align-items: center;
  z-index: 3;
}

.ra-cinebar-top {
  top: 0;
  border-bottom-width: 1px;
  border-bottom-style: solid;
  transform: translateY(-100%);
  animation: raBarDown 0.4s cubic-bezier(0.4, 0, 0.2, 1) 0.05s forwards;
}
.ra-cinebar-bottom {
  bottom: 0;
  border-top-width: 1px;
  border-top-style: solid;
  transform: translateY(100%);
  animation: raBarUp 0.4s cubic-bezier(0.4, 0, 0.2, 1) 0.05s forwards;
}

.ra-complete .ra-cinebar {
  background: linear-gradient(to bottom, #0e0b06, #0a0800);
  border-color: rgba(200, 155, 60, 0.35);
}
.ra-fail .ra-cinebar {
  background: linear-gradient(to bottom, #0d0204, #0a0002);
  border-color: rgba(160, 30, 30, 0.4);
}

@keyframes raBarDown {
  to {
    transform: translateY(0);
  }
}
@keyframes raBarUp {
  to {
    transform: translateY(0);
  }
}

.ra-cinebar-inner {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 0 20px;
  width: 100%;
}
.ra-cinebar-bottom .ra-cinebar-inner {
  flex-direction: row-reverse;
}

.ra-cinebar-guild {
  font-size: 9px;
  letter-spacing: 4px;
  text-transform: uppercase;
  font-family: 'Georgia', serif;
  white-space: nowrap;
  flex-shrink: 0;
  animation: raCinebarTextIn 0.5s ease-out 0.4s both;
}
.ra-complete .ra-cinebar-guild {
  color: rgba(200, 155, 60, 0.55);
}
.ra-fail .ra-cinebar-guild {
  color: rgba(180, 60, 60, 0.55);
}

@keyframes raCinebarTextIn {
  from {
    opacity: 0;
    letter-spacing: 8px;
  }
  to {
    opacity: 1;
    letter-spacing: 4px;
  }
}

.ra-cinebar-line {
  flex: 1;
  height: 1px;
  animation: raCinebarLineIn 0.5s ease-out 0.45s both;
  transform-origin: left center;
}
.ra-cinebar-bottom .ra-cinebar-line {
  transform-origin: right center;
}

@keyframes raCinebarLineIn {
  from {
    transform: scaleX(0);
    opacity: 0;
  }
  to {
    transform: scaleX(1);
    opacity: 1;
  }
}

.ra-complete .ra-cinebar-line {
  background: linear-gradient(to right, rgba(200, 155, 60, 0.4), transparent);
}
.ra-fail .ra-cinebar-line {
  background: linear-gradient(to right, rgba(180, 40, 40, 0.4), transparent);
}
.ra-cinebar-bottom .ra-complete .ra-cinebar-line {
  background: linear-gradient(to left, rgba(200, 155, 60, 0.4), transparent);
}

/* ——— Center stage ——— */
.ra-stage {
  position: relative;
  z-index: 3;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 20px 48px;
  animation: raStageIn 0.3s ease-out 0.38s both;
}
@keyframes raStageIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

/* Dividers */
.ra-divider {
  width: 300px;
  height: 1px;
  transform: scaleX(0);
  transform-origin: center;
}
.ra-divider-top {
  animation: raDivExpand 0.55s ease-out 0.5s both;
}
.ra-divider-bottom {
  animation: raDivExpand 0.55s ease-out 0.65s both;
}
@keyframes raDivExpand {
  to {
    transform: scaleX(1);
  }
}

.ra-complete .ra-divider {
  background: linear-gradient(
    to right,
    transparent,
    #7c5a2b 20%,
    #c89b3c 50%,
    #7c5a2b 80%,
    transparent
  );
}
.ra-fail .ra-divider {
  background: linear-gradient(
    to right,
    transparent,
    #6b1e1e 20%,
    #aa2222 50%,
    #6b1e1e 80%,
    transparent
  );
}

/* ——— Crest seal ——— */
.ra-crest-wrap {
  position: relative;
  width: 96px;
  height: 96px;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: raCrestStamp 0.65s cubic-bezier(0.22, 1.4, 0.6, 1) 0.48s both;
}
@keyframes raCrestStamp {
  0% {
    transform: scale(0) rotate(-30deg);
    opacity: 0;
  }
  65% {
    transform: scale(1.06) rotate(2deg);
    opacity: 1;
  }
  82% {
    transform: scale(0.97) rotate(-1deg);
  }
  100% {
    transform: scale(1) rotate(0);
  }
}

.ra-crest-glow {
  position: absolute;
  inset: -16px;
  border-radius: 50%;
  pointer-events: none;
  animation: raCrestGlowPulse 2s ease-in-out 1.2s infinite alternate;
}
.ra-complete .ra-crest-glow {
  background: radial-gradient(circle, rgba(200, 155, 60, 0.25) 0%, transparent 65%);
}
.ra-fail .ra-crest-glow {
  background: radial-gradient(circle, rgba(180, 30, 30, 0.25) 0%, transparent 65%);
}
@keyframes raCrestGlowPulse {
  from {
    opacity: 0.6;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1.05);
  }
}

.ra-crest-ring-outer,
.ra-crest-ring-inner {
  position: absolute;
  border-radius: 50%;
  border-style: solid;
}
.ra-crest-ring-outer {
  inset: 0;
  border-width: 2px;
}
.ra-crest-ring-inner {
  inset: 10px;
  border-width: 1px;
  opacity: 0.4;
}

.ra-complete .ra-crest-ring-outer {
  border-color: #c89b3c;
  box-shadow:
    0 0 16px rgba(200, 155, 60, 0.4),
    inset 0 0 16px rgba(200, 155, 60, 0.1);
}
.ra-complete .ra-crest-ring-inner {
  border-color: #c89b3c;
}

.ra-fail .ra-crest-ring-outer {
  border-color: #aa2222;
  box-shadow:
    0 0 16px rgba(180, 30, 30, 0.4),
    inset 0 0 16px rgba(180, 30, 30, 0.1);
}
.ra-fail .ra-crest-ring-inner {
  border-color: #aa2222;
}

.ra-crest-symbol {
  font-size: 44px;
  line-height: 1;
  position: relative;
  z-index: 1;
}
.ra-complete .ra-crest-symbol {
  color: #ffd27a;
  text-shadow:
    0 0 14px rgba(200, 155, 60, 1),
    0 0 40px rgba(200, 155, 60, 0.45);
}
.ra-fail .ra-crest-symbol {
  color: #cc2222;
  text-shadow:
    0 0 14px rgba(200, 30, 30, 1),
    0 0 40px rgba(200, 30, 30, 0.45);
  animation: raCrestFailShake 0.4s ease-out 0.5s both;
}
@keyframes raCrestFailShake {
  0% {
    transform: rotate(-10deg) scale(1.25);
  }
  40% {
    transform: rotate(7deg) scale(0.95);
  }
  70% {
    transform: rotate(-3deg);
  }
  100% {
    transform: rotate(0);
  }
}

/* ——— Text ——— */
.ra-text-group {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
}

.ra-label-quest {
  font-family: 'Georgia', serif;
  font-size: 13px;
  letter-spacing: 10px;
  text-transform: uppercase;
  display: block;
  animation: raQuestLabelIn 0.45s ease-out 0.64s both;
}
.ra-complete .ra-label-quest {
  color: #a88040;
}
.ra-fail .ra-label-quest {
  color: #7a3030;
}

@keyframes raQuestLabelIn {
  from {
    letter-spacing: 18px;
    opacity: 0;
  }
  to {
    letter-spacing: 10px;
    opacity: 1;
  }
}

.ra-label-result {
  font-family: 'Georgia', serif;
  font-size: 54px;
  font-weight: bold;
  letter-spacing: 4px;
  text-transform: uppercase;
  display: block;
  line-height: 1.05;
}
.ra-complete .ra-label-result {
  color: #ffffff;
  text-shadow:
    0 0 18px rgba(255, 255, 220, 0.9),
    0 0 50px rgba(255, 200, 80, 0.5),
    0 0 90px rgba(200, 155, 60, 0.2);
  animation: raCompleteResultIn 0.65s cubic-bezier(0.2, 0.8, 0.4, 1) 0.72s both;
}
@keyframes raCompleteResultIn {
  from {
    transform: translateY(12px) scale(0.88);
    opacity: 0;
    letter-spacing: 0px;
  }
  to {
    transform: translateY(0) scale(1);
    opacity: 1;
    letter-spacing: 4px;
  }
}

.ra-fail .ra-label-result {
  color: #cc1111;
  text-shadow:
    0 0 18px rgba(200, 20, 20, 0.95),
    0 0 50px rgba(160, 0, 0, 0.4);
  animation: raFailResultIn 0.55s ease-out 0.68s both;
}
@keyframes raFailResultIn {
  0% {
    transform: translateX(-10px) scale(1.12);
    opacity: 0;
  }
  40% {
    transform: translateX(6px) scale(1.02);
    opacity: 1;
  }
  70% {
    transform: translateX(-3px);
  }
  100% {
    transform: translateX(0) scale(1);
  }
}

/* ——— Sub-text (monster name / flavor) ——— */
.ra-sub-text {
  font-family: 'Georgia', serif;
  font-size: 11px;
  letter-spacing: 3px;
  text-transform: uppercase;
  animation: raSubIn 0.4s ease-out 0.94s both;
}
.ra-complete .ra-sub-text {
  color: #a88040;
}
.ra-fail .ra-sub-text {
  color: #7a3030;
  font-style: italic;
  letter-spacing: 2px;
}
@keyframes raSubIn {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* ——— Particles ——— */
.ra-particles {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 0;
  height: 0;
  pointer-events: none;
  z-index: 2;
}
.ra-particle {
  position: absolute;
  width: 5px;
  height: 5px;
  margin: -2.5px;
  border-radius: 50%;
  background: #ffd27a;
  box-shadow: 0 0 6px #c89b3c;
  animation: raParticleOut 1.8s ease-out calc(0.55s + var(--i) * 0.045s) both;
}
@keyframes raParticleOut {
  0% {
    transform: rotate(calc(var(--i) * 22.5deg)) translateX(0) scale(1.6);
    opacity: 1;
  }
  70% {
    opacity: 0.6;
  }
  100% {
    transform: rotate(calc(var(--i) * 22.5deg)) translateX(50vmin) scale(0);
    opacity: 0;
  }
}

/* ——— Tap hint ——— */
.ra-tap-hint {
  position: absolute;
  bottom: 92px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 10px;
  letter-spacing: 3px;
  text-transform: uppercase;
  font-family: 'Georgia', serif;
  animation: raTapBlink 2s ease-in-out 1.8s infinite alternate;
  margin: 0;
  pointer-events: none;
  white-space: nowrap;
  z-index: 4;
}
.ra-complete .ra-tap-hint {
  color: rgba(200, 155, 60, 0.4);
}
.ra-fail .ra-tap-hint {
  color: rgba(160, 50, 50, 0.4);
}

@keyframes raTapBlink {
  from {
    opacity: 0.2;
  }
  to {
    opacity: 0.8;
  }
}

@media (max-width: 480px) {
  .outcome-confirm-modal {
    padding: 18px 16px;
    gap: 12px;
  }
  .ocm-question {
    font-size: 15px;
  }
  .ra-cinebar {
    height: 58px;
  }
  .ra-crest-wrap {
    width: 76px;
    height: 76px;
  }
  .ra-crest-symbol {
    font-size: 34px;
  }
  .ra-label-result {
    font-size: 38px;
    letter-spacing: 2px;
  }
  .ra-label-quest {
    font-size: 11px;
    letter-spacing: 7px;
  }
  .ra-divider {
    width: 220px;
  }
  .ra-tap-hint {
    bottom: 72px;
  }
}

/* ══════════════════════════════════════════
   REWARD PHASE
══════════════════════════════════════════ */
.phase-reward {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 4px 2px;
}

.rw-header {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  border-radius: 10px;
  background: linear-gradient(135deg, rgba(30, 22, 8, 0.95), rgba(20, 15, 6, 0.9));
  border: 1px solid rgba(200, 155, 60, 0.4);
}
.rw-trophy {
  font-size: 32px;
  flex-shrink: 0;
}
.rw-title {
  font-size: 17px;
  font-weight: bold;
  color: #ffd27a;
  text-shadow: 0 0 12px rgba(255, 200, 80, 0.5);
  margin: 0;
  letter-spacing: 1px;
}
.rw-sub {
  font-size: 11px;
  color: #a88040;
  margin: 2px 0 0;
}

.rw-section-label {
  font-size: 9px;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: #7c5a2b;
  margin: 0 0 8px;
}

/* Hunter count buttons */
.rw-hunter-btns {
  display: flex;
  gap: 10px;
  margin-bottom: 12px;
}
.rw-hunter-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 12px 8px;
  border-radius: 10px;
  border: 1px solid rgba(124, 90, 43, 0.4);
  background: rgba(20, 15, 8, 0.8);
  color: #7c5a2b;
  cursor: pointer;
  transition: all 0.2s;
}
.rw-hunter-btn.active {
  border-color: #c89b3c;
  background: rgba(60, 40, 10, 0.9);
  color: #ffd27a;
  box-shadow: 0 0 12px rgba(200, 155, 60, 0.25);
}
.rw-hunter-num {
  font-size: 22px;
  font-weight: bold;
  line-height: 1;
}
.rw-hunter-label {
  font-size: 9px;
  letter-spacing: 1px;
  text-transform: uppercase;
}
.rw-dice-preview {
  font-size: 12px;
  margin-top: 2px;
}

.rw-quest-type-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 8px;
  background: rgba(10, 8, 4, 0.6);
  border: 1px solid rgba(90, 61, 31, 0.4);
  margin-bottom: 14px;
}
.rw-qt-label {
  font-size: 11px;
  color: #a88040;
}
.rw-qt-arrow {
  color: #5a3d1f;
}
.rw-qt-dice {
  font-size: 13px;
  color: #ffd27a;
  font-weight: bold;
}

/* Primary / Secondary buttons */
.rw-btn-primary {
  width: 100%;
  padding: 13px;
  border-radius: 10px;
  border: 1px solid #c89b3c;
  background: linear-gradient(135deg, #3a2a0a, #241a06);
  color: #ffd27a;
  font-size: 14px;
  font-weight: bold;
  letter-spacing: 1px;
  cursor: pointer;
  transition: all 0.2s;
}
.rw-btn-primary:hover {
  background: linear-gradient(135deg, #4a3510, #2e2008);
  box-shadow: 0 0 14px rgba(200, 155, 60, 0.3);
}
.rw-btn-secondary {
  flex: 1;
  padding: 10px;
  border-radius: 8px;
  border: 1px solid rgba(124, 90, 43, 0.5);
  background: rgba(20, 15, 8, 0.8);
  color: #a88040;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}
.rw-btn-secondary:hover {
  color: #ffd27a;
  border-color: #c89b3c;
}

/* Dice roll screen */
.rw-dice-roll {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.rw-dice-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: center;
  padding: 16px;
  border-radius: 12px;
  background: rgba(10, 8, 4, 0.8);
  border: 1px solid rgba(90, 61, 31, 0.4);
}
.rw-die {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  width: 56px;
  padding: 10px 0;
  border-radius: 10px;
  background: rgba(30, 22, 8, 0.9);
  border: 2px solid #c89b3c;
  box-shadow: 0 0 10px rgba(200, 155, 60, 0.2);
}
.rw-die-value {
  font-size: 26px;
  font-weight: bold;
  color: #ffd27a;
  line-height: 1;
}
.rw-die-reroll {
  font-size: 14px;
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid rgba(124, 90, 43, 0.5);
  background: transparent;
  color: #7c5a2b;
  cursor: pointer;
  transition: 0.15s;
}
.rw-die-reroll:hover {
  color: #ffd27a;
  border-color: #c89b3c;
}
.rw-roll-actions {
  display: flex;
  gap: 10px;
}

/* Assign screen */
.rw-assign {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.rw-dice-chips-wrap {
  padding: 12px 14px;
  border-radius: 10px;
  background: rgba(10, 8, 4, 0.8);
  border: 1px solid rgba(90, 61, 31, 0.4);
}
.rw-dice-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.rw-die-chip {
  width: 38px;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: bold;
  border-radius: 8px;
  border: 2px solid rgba(124, 90, 43, 0.5);
  background: rgba(30, 22, 8, 0.9);
  color: #a88040;
  cursor: pointer;
  transition: all 0.15s;
  user-select: none;
}
.rw-die-chip.chip-selected {
  border-color: #ffd27a;
  color: #ffd27a;
  background: rgba(60, 40, 10, 0.9);
  box-shadow: 0 0 10px rgba(255, 210, 122, 0.35);
}
.rw-die-chip.chip-spent {
  opacity: 0.25;
  cursor: default;
  pointer-events: none;
}
.rw-sum-badge {
  padding: 4px 12px;
  border-radius: 20px;
  background: rgba(200, 155, 60, 0.2);
  border: 1px solid #c89b3c;
  color: #ffd27a;
  font-size: 14px;
  font-weight: bold;
}
.rw-sum-hint {
  font-size: 10px;
  color: #c89b3c;
  margin: 6px 0 0;
  letter-spacing: 0.5px;
}

/* Reward table */
.rw-table {
  display: flex;
  flex-direction: column;
  gap: 4px;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid rgba(90, 61, 31, 0.4);
}
.rw-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: rgba(15, 11, 5, 0.85);
  border-bottom: 1px solid rgba(60, 40, 15, 0.4);
  transition: all 0.15s;
  cursor: default;
}
.rw-row:last-child {
  border-bottom: none;
}
.rw-row-claimable {
  background: rgba(40, 28, 8, 0.95);
  border-color: rgba(200, 155, 60, 0.4);
  cursor: pointer;
  box-shadow: inset 0 0 16px rgba(200, 155, 60, 0.12);
}
.rw-row-claimable:hover {
  background: rgba(55, 38, 10, 0.95);
  box-shadow: inset 0 0 22px rgba(200, 155, 60, 0.2);
}
.rw-row-locked {
  opacity: 0.4;
}
.rw-row-num {
  min-width: 22px;
  font-size: 12px;
  font-weight: bold;
  color: #7c5a2b;
  text-align: center;
}
.rw-row-claimable .rw-row-num {
  color: #ffd27a;
}
.rw-row-item {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}
.rw-item-img {
  width: 28px;
  height: 28px;
  object-fit: contain;
  border-radius: 4px;
}
.rw-item-name {
  font-size: 11px;
  color: #c8a060;
  flex: 1;
}
.rw-row-claimable .rw-item-name {
  color: #ffd27a;
}
.rw-part-bonus {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 7px;
  border-radius: 10px;
  border: 1px solid rgba(90, 61, 31, 0.5);
  background: rgba(10, 8, 4, 0.6);
  opacity: 0.5;
}
.rw-part-bonus.bonus-active {
  border-color: rgba(80, 200, 80, 0.5);
  background: rgba(20, 60, 20, 0.5);
  opacity: 1;
}
.rw-bonus-icon {
  font-size: 11px;
}
.rw-bonus-text {
  font-size: 9px;
  color: #7c5a2b;
  white-space: nowrap;
}
.rw-part-bonus.bonus-active .rw-bonus-text {
  color: #7adf7a;
}

/* Claimed summary */
.rw-claimed {
  padding: 12px 14px;
  border-radius: 10px;
  background: rgba(10, 20, 10, 0.7);
  border: 1px solid rgba(60, 140, 60, 0.35);
}
.rw-claimed-list {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.rw-claimed-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 8px;
  background: rgba(20, 35, 20, 0.8);
  border: 1px solid rgba(60, 140, 60, 0.3);
}
.rw-claimed-img {
  width: 22px;
  height: 22px;
  object-fit: contain;
}
.rw-claimed-qty {
  font-size: 13px;
  font-weight: bold;
  color: #7adf7a;
}
.rw-claimed-name {
  font-size: 10px;
  color: #5aab5a;
}

.rw-confirm-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.rw-skip-hint {
  font-size: 10px;
  color: #7c5a2b;
  text-align: center;
  letter-spacing: 0.5px;
}
.rw-btn-confirm {
  margin-top: 4px;
}

.rw-hunter-select {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
</style>
