<script setup>
import { ref, computed, onMounted } from 'vue'

defineOptions({ name: 'Quest' })
import ancientData from '@/assets/files/ancient-quest-book.json'
import wildspireData from '@/assets/files/wildspire_book.json'
import { getHunterById, saveHunter } from '@/services/hunterStorage'
import { showQuestEffects } from '@/stores/settings'

const getImg = (path) => `src/${path}`

const hunter = ref(null)

const reloadHunter = () => {
  const id = parseInt(localStorage.getItem('hunterId'))
  hunter.value = getHunterById(id)
}

onMounted(reloadHunter)

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
  resultMonsterName.value = selectedMonster.value?.monster_name ?? ''
  resultAnimType.value = type
  showResultAnim.value = true
  if (type === 'complete') {
    onComplete()
  } else {
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
  reloadHunter()
}

const onComplete = () => {
  incrementAttempted()
  currentDialogId.value = null
  selectedQuest.value = null
  phase.value = 'quest'
}

const onFail = () => {
  if (selectedQuest.value.quest_id !== 1) incrementAttempted()
  currentDialogId.value = null
  selectedQuest.value = null
  phase.value = 'quest'
}

const goBack = () => {
  const map = {
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
                :src="book.id === 'ancient' ? '/src/assets/img/ancient_forest.webp' : '/src/assets/img/wildspire_waste.webp'"
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

      <!-- RESULT -->
      <div class="hunt-result-section">
        <p class="hunt-result-label">— Quest Outcome —</p>
        <div class="hunt-result-btns">
          <button class="btn-complete" @click="requestOutcome('complete')">
            <span class="result-icon">✦</span>
            Quest Complete
          </button>
          <button class="btn-fail" @click="requestOutcome('fail')">
            <span class="result-icon">✕</span>
            Quest Failed
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
</style>
