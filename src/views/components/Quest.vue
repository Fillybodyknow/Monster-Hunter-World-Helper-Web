<script setup>
import { ref, computed, watch, nextTick, onMounted, onActivated, inject } from 'vue'

defineOptions({ name: 'Quest' })
import ancientData from '@/assets/files/ancient-quest-book.json'
import wildspireData from '@/assets/files/wildspire_book.json'
import { showQuestEffects, soundEnabled, soundVolume } from '@/stores/settings'
import { hunter, loadHunter, saveHunter } from '@/stores/hunter'
import monsterInfoData from '@/assets/files/monster_info.json'
import timeCardData from '@/assets/files/time_card_management.json'
import hunterClassData from '@/assets/files/class_hunter.json'
const getHunterClass = (id) => hunterClassData.find((c) => c.hunter_class_id === id)
import monsterPartsData from '@/assets/files/monster_parts.json'
import elementalData from '@/assets/files/elemental.json'
import statusEffectData from '@/assets/files/status_effect.json'
import resourceData from '@/assets/files/resource.json'
import { getHunters, saveHunters } from '@/services/hunterStorage'
import { useRoomStore } from '@/stores/room'
import CoopLobbyModal from './CoopLobbyModal.vue'
import HQPhase from './HQPhase.vue'
import { openCraftLookup } from '@/composables/useCraftLookup'

const room = useRoomStore()
const getImg = (path) => `${import.meta.env.BASE_URL}${path}`
const addNotif = inject('addNotif', () => {})

// Coop
const showCoopLobby = ref(false)
const showCoopModeSelect = ref(false)
const showJoinInput = ref(false)
const joinCode = ref('')
const joinError = ref('')
const joinLoading = ref(false)

// Quest Mode: 'full' | 'minimal'
const questMode = ref('full')

const startCoopQuest = async () => {
  if (!hunter.value) return
  if (!room.inRoom) await room.create(hunter.value)
  const _exhausted = isQuestExhausted(selectedQuest.value)
  await room.setQuestInfo({
    monster_id: selectedMonster.value?.monster_id,
    monster_name: selectedMonster.value?.monster_name,
    thumbnail: selectedMonster.value?.thumbnail,
    quest_type: selectedQuest.value?.quest_type,
    difficulty_level: selectedQuest.value?.difficulty_level,
    campaign_day: hunter.value.campaign_day ?? 1,
    exhausted_attempt: _exhausted,
    hq_max_actions: _exhausted ? 2 : 3,
  })
  showCoopLobby.value = true
}

const onCoopStart = () => {
  showCoopLobby.value = false

  if (!selectedMonster.value && room.questInfo) {
    const info = room.questInfo
    const allMonsters = [...ancientData, ...wildspireData]
    const monster = allMonsters.find((m) => m.monster_id === info.monster_id)
    if (monster) {
      selectedMonster.value = monster
      selectedBook.value = ancientData.includes(monster) ? books[0] : books[1]
      const quest = monster.quest?.find(
        (q) => q.quest_type === info.quest_type && q.difficulty_level === info.difficulty_level,
      )
      if (quest) selectedQuest.value = quest
    }
  }

  if (room.syncedDialogId) {
    // Quest ดำเนินอยู่แล้ว (host reconnect หรือ guest) → sync โดยไม่ reset
    if (room.inRoom) _startSuppressAnimations()
    if (room.inRoom) {
      // Restore behavior deck
      const deckState = room.behaviorDeckState
      if (deckState) {
        behaviorDeck.value = deckState.deck ?? []
        behaviorDiscard.value = deckState.discard ?? []
        behaviorBanished.value = deckState.banished ?? []
        currentBehaviorCard.value = deckState.current ?? null
        if (deckState.specialCard) specialCardOverlayCard.value = deckState.specialCard
      }
      // Restore time cards
      const tcState = room.timeCardState
      if (tcState) {
        timeCardDeck.value = tcState.deck ?? []
        timeCardDiscard.value = tcState.discard ?? []
      }
      // Restore quest mode (time cards only exist in Full mode — guards against stale 'minimal' in Firebase)
      const _hasTc = (tcState?.deck?.length ?? 0) > 0 || (tcState?.discard?.length ?? 0) > 0
      if (_hasTc) questMode.value = 'full'
      else if (room.questModeState) questMode.value = room.questModeState
    }
    _syncToPhase(room.syncedDialogId, true)
    // Restore manual outcome AFTER _syncToPhase (canComplete watcher อาจล้างค่าในรอบ async เดียวกัน)
    const savedOutcome = room.manualOutcomeState
    if (savedOutcome) {
      _restoringOutcome = true
      nextTick(() => {
        manualOutcomeCheck.value = savedOutcome
        floatBarCollapsed.value = false
        _restoringOutcome = false
      })
    }
  } else if (room.syncedPhase === 'hqVote' || room.syncedPhase === 'hq' || room.syncedPhase === 'handlerStart') {
    // Reconnect กลางช่วง HQ / handlerStart
    _resolveQuestFromRoom()
    isExhaustedAttempt.value = room.questInfo?.exhausted_attempt ?? false
    phase.value = room.syncedPhase
  } else if (!room.isHost) {
    // Guest รอ phase จาก Firebase
    const stop = watch([() => room.syncedDialogId, () => room.syncedPhase], ([id, sp]) => {
      if (sp === 'hqVote' || sp === 'hq' || sp === 'handlerStart') {
        stop()
        if (sp === 'handlerStart') isExhaustedAttempt.value = room.questInfo?.exhausted_attempt ?? false
        phase.value = sp
        return
      }
      if (!id) return
      stop()
      _syncToPhase(id, true)
    }, { immediate: true })
  } else {
    // Host เริ่มเควสใหม่
    const day = room.questInfo?.campaign_day ?? hunter.value?.campaign_day ?? 1
    isExhaustedAttempt.value = room.questInfo?.exhausted_attempt ?? false
    if (isExhaustedAttempt.value) {
      // Attempts หมด: บังคับ HQ 2 actions
      handlerStartDialogId.value = null
      phase.value = 'hq'
      room.syncPhase?.('hq')
      room.clearHqVotesAll?.()
      room.clearHqStateAll?.()
    } else if (day <= 1) {
      startQuest()
    } else {
      phase.value = 'hqVote'
      room.syncPhase?.('hqVote')
      room.clearHqVotesAll?.()
      room.clearHqStateAll?.()
    }
  }
}

const onCoopLeave = () => {
  showCoopLobby.value = false
}

const handleJoinQuest = async () => {
  if (!hunter.value || !joinCode.value.trim()) return
  joinLoading.value = true
  joinError.value = ''
  try {
    await room.join(joinCode.value.trim().toUpperCase(), hunter.value)
    showJoinInput.value = false
    joinCode.value = ''
    showCoopLobby.value = true
  } catch (e) {
    joinError.value = e.message
    addNotif(`❌ ${e.message}`, 'error')
  } finally {
    joinLoading.value = false
  }
}

onMounted(loadHunter)
onActivated(loadHunter)

const phase = ref('book')
const selectedBook = ref(null)
const selectedMonster = ref(null)
const selectedQuest = ref(null)
const currentDialogId = ref(null)

// ─── HQ Vote ─────────────────────────────────────────────
const myHqVote = ref(null)  // 'hq' | 'quest' | null
const isExhaustedAttempt = ref(false)
const handlerStartDialogId = ref(null)
const hqMaxActions = computed(() => isExhaustedAttempt.value ? 2 : 3)

watch(phase, (p) => {
  if (p === 'hqVote') { myHqVote.value = null; pendingHqVote.value = null }
})

const pendingHqVote = ref(null)
const confirmHqVote = () => { if (pendingHqVote.value) { castHqVote(pendingHqVote.value); pendingHqVote.value = null } }
const cancelHqVote = () => { pendingHqVote.value = null }

const castHqVote = (vote) => {
  myHqVote.value = vote
  if (room.inRoom) {
    room.voteHq?.(vote)
  } else {
    // Solo: ตัดสินใจทันที
    if (vote === 'hq') {
      phase.value = 'hq'
    } else {
      startQuest()
    }
  }
}

const confirmHandlerStart = (dialogId) => {
  handlerStartDialogId.value = dialogId
  startQuest()
}

const breakHqTie = (vote) => {
  if (vote === 'hq') {
    phase.value = 'hq'
    room.syncPhase?.('hq')
    room.clearHqVotesAll?.()
  } else {
    room.clearHqVotesAll?.()
    startQuest()
  }
}

// Watch majority vote result (coop)
watch(() => room.hqVoteResult, (result) => {
  if (!result || !room.inRoom || !room.isHost) return
  if (result === 'hq') {
    phase.value = 'hq'
    room.syncPhase?.('hq')
  } else {
    room.clearHqVotesAll?.()
    startQuest()
  }
})

// Guest syncs hqVote / hq / handlerStart phase
watch([() => room.syncedPhase, () => room.joinSignal], ([sp]) => {
  if (!sp || !room.inRoom || room.isHost) return
  if ((sp === 'hqVote' || sp === 'hq' || sp === 'handlerStart') && phase.value !== sp) {
    if (sp === 'handlerStart') isExhaustedAttempt.value = room.questInfo?.exhausted_attempt ?? false
    phase.value = sp
  }
})

const _incrementDay = () => {
  if (hunter.value) {
    hunter.value.campaign_day = (hunter.value.campaign_day ?? 0) + 1
    saveHunter(hunter.value)
  }
}

// All hunters ready in HQ → host adds day and starts quest (or picks dialog if exhausted)
watch(() => room.allHqReady, (allReady) => {
  if (!allReady || !room.inRoom || !room.isHost) return
  _incrementDay()
  room.clearHqVotesAll?.()
  room.clearHqStateAll?.()
  myHqVote.value = null
  if (isExhaustedAttempt.value) {
    phase.value = 'handlerStart'
    room.syncPhase?.('handlerStart')
  } else {
    startQuest()
  }
})

const onHQAllReady = () => {
  if (!room.inRoom) {
    _incrementDay()
    myHqVote.value = null
    if (isExhaustedAttempt.value) {
      phase.value = 'handlerStart'
    } else {
      startQuest()
    }
  }
}

watch(() => room.inRoom, (inRoom, wasInRoom) => {
  if (wasInRoom && !inRoom) {
    phase.value = 'book'
    selectedBook.value = null
    selectedMonster.value = null
    selectedQuest.value = null
    currentDialogId.value = null
  }
})

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

const WILDSPIRE_ENABLED_MONSTERS = [6, 7, 8, 9, 10]

const monsters = computed(() => selectedBook.value?.data || [])

const isMonsterEnabled = (monster_id) => {
  if (selectedBook.value?.id !== 'wildspire') return true
  return WILDSPIRE_ENABLED_MONSTERS.includes(monster_id)
}

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
  if (quest.quest_id === 1 && isQuestExhausted(quest)) return
  selectedQuest.value = quest
  phase.value = 'detail'
}

const startingDialog = computed(() => {
  if (!selectedQuest.value || !selectedMonster.value) return null
  const attempted = getAttempted(selectedMonster.value.monster_id, selectedQuest.value.quest_id)
  const dialogId = selectedQuest.value.starting_point[attempted]
  return selectedMonster.value.quest_dialogs.find((d) => d.dialog_id === dialogId)
})

const getDialog = (dialogId) =>
  selectedMonster.value?.quest_dialogs?.find(d => d.dialog_id === dialogId) ?? null

const startQuest = () => {
  dialogResourceCounts.value = {}
  showDialogResources.value = false
  initTrackTokens()
  if (questMode.value === 'full') {
    buildTimeCardDeck()
  }
  const startDialogId = (isExhaustedAttempt.value && handlerStartDialogId.value)
    ? handlerStartDialogId.value
    : selectedQuest.value.starting_point[getAttempted(selectedMonster.value.monster_id, selectedQuest.value.quest_id)]
  currentDialogId.value = startDialogId
  phase.value = selectedMonster.value.dialog_hunting_phase.includes(currentDialogId.value)
    ? 'hunting'
    : 'dialog'
  // Co-op: push initial dialog and quest mode to Firebase
  if (room.inRoom && room.isHost) {
    room.setCurrentDialog?.(currentDialogId.value)
    room.syncQuestMode?.(questMode.value)
  }
}

const currentDialog = computed(() => {
  if (!currentDialogId.value || !selectedMonster.value) return null
  return selectedMonster.value.quest_dialogs.find((d) => d.dialog_id === currentDialogId.value)
})

const pendingAction = ref(null)
const tiedActions = ref([]) // actions ที่ votes เสมอกัน รอ Host ตัดสิน
const showBattleIntro = ref(false)
const showSpecialCardOverlay = ref(false)
const specialCardOverlayCard = ref(null)
const showSpecialCardSelect = ref(false)
const specialCardSelectOptions = ref([])
const _pendingTokenTotal = ref(0)
const awaitingHostDeckBuild = ref(false)
const showSpecialCardConfirm = ref(false)
const _pendingSpecialCardChoice = ref(null)

// Token Reveal Overlay
const showTokenReveal = ref(false)
const tokenRevealVisual = ref([]) // [{...token, showValue: bool}]
const tokenRevealDone = ref(false)

const tokenRevealTotal = computed(() =>
  tokenRevealVisual.value
    .filter(t => t.showValue)
    .reduce((sum, t) => sum + (t.value ?? 0), 0),
)

const startTokenReveal = (onDone) => {
  if (!trackTokens.value.length) { onDone(); return }

  // Reveal all tokens immediately (update state + push Firebase)
  trackTokens.value = trackTokens.value.map(t => ({ ...t, revealed: true }))
  _pushTokenState()

  if (questMode.value === 'minimal') {
    const finalTotal = trackTokens.value.reduce((s, t) => s + (t.value ?? 0), 0)
    onDone(finalTotal)
    return
  }

  showTokenReveal.value = true
  tokenRevealDone.value = false
  tokenRevealVisual.value = trackTokens.value.map(t => ({ ...t, showValue: false }))

  // Animate flip one by one
  trackTokens.value.forEach((_, i) => {
    setTimeout(() => {
      if (tokenRevealVisual.value[i]) tokenRevealVisual.value[i].showValue = true
    }, 500 + i * 600)
  })
  const total = 500 + trackTokens.value.length * 600 + 800
  setTimeout(() => { tokenRevealDone.value = true }, total)
  const finalTotal = trackTokens.value.reduce((s, t) => s + (t.value ?? 0), 0)
  setTimeout(() => {
    showTokenReveal.value = false
    onDone(finalTotal)
  }, total + 2000)
}
const battleIntroPhase = ref('enter') // 'enter' | 'show' | 'leave'
const battleIntroKey = ref(0)

const outcomeAudio = ref(null)

const playOutcomeSound = (type) => {
  if (outcomeAudio.value) {
    outcomeAudio.value.pause()
    outcomeAudio.value = null
  }
  if (!soundEnabled.value) return
  const audio = new Audio(`${import.meta.env.BASE_URL}assets/sounds/hunting_phase/${type === 'complete' ? 'quest_complete' : 'quest_failed'}.mp3`)
  audio.volume = soundVolume.value
  audio.play().catch(() => {})
  outcomeAudio.value = audio
}

const fadeOutOutcomeSound = () => {
  const audio = outcomeAudio.value
  if (!audio) return
  const step = audio.volume / 20
  const fade = setInterval(() => {
    if (audio.volume > step) {
      audio.volume = Math.max(0, audio.volume - step)
    } else {
      audio.pause()
      outcomeAudio.value = null
      clearInterval(fade)
    }
  }, 200)
}

const doAction = (action) => {
  if (room.inRoom) {
    room.voteForAction(action.action_id)
  } else {
    pendingAction.value = action
  }
}

const _executeDialog = (dialogId) => {
  pendingAction.value = null
  currentDialogId.value = dialogId
  if (selectedMonster.value?.dialog_hunting_phase?.includes(dialogId)) {
    _saveDialogCountsToInventory()
    if (room.inRoom) room.clearDialogCounts?.()
    battleIntroKey.value++
    showBattleIntro.value = true
    battleIntroPhase.value = 'enter'
    setTimeout(() => { battleIntroPhase.value = 'show' }, 30)
    setTimeout(() => { battleIntroPhase.value = 'leave' }, 2200)
    setTimeout(() => {
      showBattleIntro.value = false
      battleIntroPhase.value = 'enter'
      startTokenReveal((total) => {
        if (room.isHost || !room.inRoom) {
          if (questMode.value === 'minimal') {
            const info = monsterInfoData.find(m => m.monster_id === selectedMonster.value?.monster_id)
            const names = selectedMonster.value?.special_attack_card ?? []
            const cardTierMap = new Map()
            names.forEach((name, tier) => {
              if (!name) return
              const card = info?.behavior_special_card?.find(c => c.behavior_name === name)
              if (!card) return
              if (!cardTierMap.has(card.behavior_name)) cardTierMap.set(card.behavior_name, { card, tiers: [] })
              cardTierMap.get(card.behavior_name).tiers.push(tier)
            })
            const options = [...cardTierMap.values()]
            if (options.length > 0) {
              _pendingTokenTotal.value = total
              specialCardSelectOptions.value = options
              showSpecialCardSelect.value = true
              return
            }
            buildBehaviorDeck(total)
          } else {
            const info = monsterInfoData.find(m => m.monster_id === selectedMonster.value?.monster_id)
            const [min, max] = selectedQuest.value?.scoutfly_level ?? [0, 0]
            let specialName = null
            if (total < min) specialName = selectedMonster.value?.special_attack_card?.[0]
            else if (total <= max) specialName = selectedMonster.value?.special_attack_card?.[1]
            else specialName = selectedMonster.value?.special_attack_card?.[2]
            const specialCard = specialName
              ? info?.behavior_special_card?.find(c => c.behavior_name === specialName)
              : null
            buildBehaviorDeck(total, specialName)
            if (specialCard) {
              specialCardOverlayCard.value = specialCard
              showSpecialCardOverlay.value = true
              setTimeout(() => {
                showSpecialCardOverlay.value = false
                phase.value = 'huntingPanel'
              }, 4000)
              return
            }
          }
        } else if (questMode.value === 'minimal') {
          // Guest: รอ Host เลือก Special Attack Card ก่อน
          awaitingHostDeckBuild.value = true
          return
        }
        phase.value = 'huntingPanel'
      })
    }, 2800)
  }
}

const _proceedWithAction = (action) => {
  if (room.inRoom && room.setCurrentDialog) {
    room.clearVotes?.()
    room.clearProceed?.()
    room.clearSyncedPendingAction?.()
    // ถ้า path ไปหน้า hunting → init และ push state ก่อน notify guests
    if (selectedMonster.value?.dialog_hunting_phase?.includes(action.PathToDialog)) {
      initHuntingData()
      _pushHuntState()
    }
    room.setCurrentDialog(action.PathToDialog)
  } else {
    _executeDialog(action.PathToDialog)
  }
}

const confirmAction = () => {
  const action = pendingAction.value
  if (!action) return
  if (room.inRoom) {
    room.voteProceed()
  } else {
    _proceedWithAction(action)
  }
}

const cancelAction = () => {
  pendingAction.value = null
  tiedActions.value = []
  if (room.inRoom) { room.clearVotes(); room.clearProceed() }
}

const isTied = computed(() => tiedActions.value.length > 0)

const hostPickTied = (action) => {
  tiedActions.value = []
  pendingAction.value = action
  if (room.inRoom) room.setPendingAction(action.action_id)
}

// Guest: watch host's tie-breaking pick
watch(() => room.syncedPendingActionId, (actionId) => {
  if (!actionId || room.isHost) return
  const action = currentDialog.value?.actions?.find(
    (a) => String(a.action_id) === String(actionId),
  )
  if (action) {
    tiedActions.value = []
    pendingAction.value = action
  }
})

// Co-op: wait until ALL hunters voted → find winner or detect tie
watch(() => room.dialogVotes, (votes) => {
  if (!room.inRoom || phase.value !== 'dialog' || pendingAction.value || tiedActions.value.length) return
  const totalVoted = Object.keys(votes).length
  if (totalVoted < room.hunterCount) return

  const sorted = Object.entries(room.votesByAction).sort((a, b) => b[1] - a[1])
  if (!sorted.length) return
  const maxVotes = sorted[0][1]
  const topIds = sorted.filter(([, c]) => c === maxVotes).map(([id]) => String(id))

  const allActions = currentDialog.value?.actions ?? []
  if (topIds.length === 1) {
    // ชัดเจน
    const action = allActions.find((a) => String(a.action_id) === topIds[0])
    if (action) pendingAction.value = action
  } else {
    // เสมอ → Host ตัดสิน
    tiedActions.value = allActions.filter((a) => topIds.includes(String(a.action_id)))
  }
}, { deep: true })

// Co-op: host watches allProceeded → execute action
watch(() => room.allProceeded, (ready) => {
  if (!ready || !room.inRoom || !room.isHost || !pendingAction.value) return
  _proceedWithAction(pendingAction.value)
})

// Resolve monster/quest จาก questInfo (ใช้ตอน reconnect / guest join)
const _resolveQuestFromRoom = () => {
  if (selectedMonster.value || !room.questInfo) return
  const info = room.questInfo
  const allMonsters = [...ancientData, ...wildspireData]
  const monster = allMonsters.find((m) => m.monster_id === info.monster_id)
  if (!monster) return
  selectedMonster.value = monster
  selectedBook.value = ancientData.includes(monster) ? books[0] : books[1]
  const quest = monster.quest?.find(
    (q) => q.quest_type === info.quest_type && q.difficulty_level === info.difficulty_level,
  )
  if (quest) selectedQuest.value = quest
}

// Silent sync — ไม่มี animation ใช้ตอน reconnect
const _syncToPhase = (dialogId, applyHuntState = false) => {
  currentDialogId.value = dialogId
  if (selectedMonster.value?.dialog_hunting_phase?.includes(dialogId)) {
    if (applyHuntState && room.huntState) {
      _applyCurrentHuntState()
    } else {
      initHuntingData()
    }
    // เช็ค syncedPhase ก่อน — อาจอยู่ใน reward/trade phase อยู่แล้ว
    const sp = room.syncedPhase
    if (sp === 'reward') {
      phase.value = 'reward'
      rewardPhase.value = 'diceRoll'
      // Restore dice from Firebase
      const myDice = room.partyDice?.[room.myHunterId]
      if (myDice?.length) {
        rolledDice.value = myDice.map((val, i) => ({ id: i, value: val, spent: false }))
        rewardHunterCount.value = room.hunterCount
      }
    } else if (sp === 'assign') {
      phase.value = 'reward'
      rewardPhase.value = 'assign'
      // Restore dice from Firebase
      const myDice = room.partyDice?.[room.myHunterId]
      if (myDice?.length && !rolledDice.value.length) {
        rolledDice.value = myDice.map((val, i) => ({ id: i, value: val, spent: false }))
        rewardHunterCount.value = room.hunterCount
      }
    } else if (sp === 'trade') {
      phase.value = 'reward'
      rewardPhase.value = 'trade'
    } else {
      phase.value = 'huntingPanel'
    }
  } else {
    phase.value = 'dialog'
  }
}

// Sync phase for reconnecting guests (reward/trade)
watch([() => room.syncedPhase, () => room.joinSignal], ([syncPhase]) => {
  if (!syncPhase || !room.inRoom || room.isHost) return
  if (syncPhase === 'reward' && phase.value !== 'reward') {
    phase.value = 'reward'
    rewardPhase.value = 'diceRoll'
  } else if (syncPhase === 'assign' && rewardPhase.value !== 'assign') {
    phase.value = 'reward'
    rewardPhase.value = 'assign'
  } else if (syncPhase === 'trade' && rewardPhase.value !== 'trade') {
    phase.value = 'reward'
    rewardPhase.value = 'trade'
  }
})

let _suppressAnimations = false
let _suppressTimer = null
let _isReconnecting = false
let _reconnectTimer = null
let _restoringOutcome = false
const _startSuppressAnimations = () => {
  _suppressAnimations = true
  clearTimeout(_suppressTimer)
  _suppressTimer = setTimeout(() => { _suppressAnimations = false }, 2000)
}

// Auto-reconnect: joinSignal fires → รอ Firebase โหลด → navigate และ restore deck
watch(() => room.joinSignal, () => {
  if (!room.inRoom) return
  _startSuppressAnimations()
  // Allow reactive watchers to restore Host state from Firebase during reconnect window
  _isReconnecting = true
  clearTimeout(_reconnectTimer)
  _reconnectTimer = setTimeout(() => { _isReconnecting = false }, 5000)

  const restoreDeck = (state) => {
    if (!state) return
    behaviorDeck.value = state.deck ?? []
    behaviorDiscard.value = state.discard ?? []
    behaviorBanished.value = state.banished ?? []
    currentBehaviorCard.value = state.current ?? null
    if (state.specialCard) specialCardOverlayCard.value = state.specialCard
  }

  // Restore track tokens จาก sessionStorage (สำหรับ host reconnect)
  if (room.isHost) {
    try {
      const local = JSON.parse(sessionStorage.getItem('tt_local') ?? '{}')
      if (local.pool?.length) trackTokenPool.value = local.pool
      if (local.tokens?.length) {
        trackTokens.value = local.tokens
        _tokenIdCounter = Math.max(...local.tokens.map(t => t.id), 0)
      }
    } catch {}
  }

  const doNav = (dialogId) => {
    _resolveQuestFromRoom()
    if (!selectedMonster.value) return
    // Restore behavior deck for ALL (host+guest) on reconnect
    restoreDeck(room.behaviorDeckState)
    // Restore time card deck from Firebase
    const tcState = room.timeCardState
    if (tcState) {
      timeCardDeck.value = tcState.deck ?? []
      timeCardDiscard.value = tcState.discard ?? []
    }
    // Restore quest mode จาก Firebase
    // Time cards only exist in Full mode — if Firebase has stale 'minimal' but time cards are present, treat as Full
    const _tcState = room.timeCardState
    const _hasTimeCards = (_tcState?.deck?.length ?? 0) > 0 || (_tcState?.discard?.length ?? 0) > 0
    if (_hasTimeCards) {
      questMode.value = 'full'
    } else if (room.questModeState) {
      questMode.value = room.questModeState
    }
    pendingAction.value = null
    tiedActions.value = []
    _syncToPhase(dialogId, true)
    // Restore manual outcome — keep _isReconnecting = true until after nextTick so canComplete
    // watcher (queued from _syncToPhase's huntingHp change) won't clear the restored value
    const savedOutcome = room.manualOutcomeState
    if (savedOutcome) {
      _restoringOutcome = true
      nextTick(() => {
        manualOutcomeCheck.value = savedOutcome
        floatBarCollapsed.value = false
        _restoringOutcome = false
        clearTimeout(_reconnectTimer)
        _isReconnecting = false
      })
    } else {
      clearTimeout(_reconnectTimer)
      _isReconnecting = false
    }
  }

  const sp = room.syncedPhase
  if (sp === 'hqVote' || sp === 'hq' || sp === 'handlerStart') {
    _resolveQuestFromRoom()
    isExhaustedAttempt.value = room.questInfo?.exhausted_attempt ?? false
    phase.value = sp
    return
  }

  if (room.syncedDialogId) {
    doNav(room.syncedDialogId)
  } else {
    const stop = watch([() => room.syncedDialogId, () => room.syncedPhase], ([id, newSp]) => {
      if (newSp === 'hqVote' || newSp === 'hq' || newSp === 'handlerStart') {
        stop()
        _resolveQuestFromRoom()
        isExhaustedAttempt.value = room.questInfo?.exhausted_attempt ?? false
        phase.value = newSp
        return
      }
      if (!id) return
      stop()
      doNav(id)
    })
  }
})

// Host proceeds → guests follow
watch(() => room.syncedDialogId, (dialogId) => {
  if (!dialogId || !room.inRoom) return
  isExhaustedAttempt.value = room.questInfo?.exhausted_attempt ?? false
  _resolveQuestFromRoom()
  if (!selectedMonster.value) return
  pendingAction.value = null
  tiedActions.value = []
  const isHuntingDialog = selectedMonster.value?.dialog_hunting_phase?.includes(dialogId)
  if (isHuntingDialog && phase.value !== 'dialog') {
    // Reconnect: ไปหน้า huntingPanel โดยตรง ข้าม animation
    currentDialogId.value = dialogId
    _applyCurrentHuntState()
    // ถ้าอยู่ใน reward/assign/trade phase อยู่แล้ว ไม่ต้องเขียนทับ
    const sp = room.syncedPhase
    if (sp === 'reward' || sp === 'assign' || sp === 'trade') {
      // _syncToPhase จาก joinSignal watch จัดการ phase ไปแล้ว
    } else {
      phase.value = 'huntingPanel'
    }
  } else {
    phase.value = 'dialog'
    _executeDialog(dialogId)
  }
})


const pendingOutcome = ref(null)
const showResultAnim = ref(false)
const isDismissing = ref(false)
const pendingRewardAfterAnim = ref(false)
const resultAnimType = ref(null)
const resultMonsterName = ref('')

// Solo: confirm modal
const requestOutcome = (type) => {
  if (room.inRoom) {
    pendingVoteType.value = type  // show confirm modal first
  } else {
    pendingOutcome.value = type
  }
}

const cancelOutcome = () => {
  if (room.inRoom) room.clearOutcome?.()
  pendingOutcome.value = null
}

// Co-op vote confirmation
const pendingVoteType = ref(null)

const confirmVote = () => {
  if (!pendingVoteType.value) return
  room.voteOutcome(pendingVoteType.value)
  pendingVoteType.value = null
}

const cancelVote = () => {
  pendingVoteType.value = null
}

const toggleVote = (type) => {
  if (room.myOutcomeVote === type) {
    room.unvoteOutcome()   // unvote ไม่ต้องยืนยัน
  } else {
    pendingVoteType.value = type  // แสดง modal ยืนยัน
  }
}

// Co-op: watch reroll request → all approved → execute / any denied → cancel
watch(() => room.rerollRequest, (req) => {
  if (!req || !room.inRoom) return
  const approvals = Object.values(req.approvals ?? {})
  const others = room.hunters.filter(h => h.hunter_id !== req.requesterId)
  // All approved
  if (others.length > 0 && others.every(h => req.approvals?.[h.hunter_id] === true)) {
    room.cancelReroll()
    if (req.requesterId === room.myHunterId) rollAllDice()
  }
  // Any denied
  if (approvals.some(v => v === false)) {
    room.cancelReroll()
  }
}, { deep: true })

// Co-op: watch action votes → ครบทุกคน → execute
watch(() => room.actionVotes, () => {
  if (!room.inRoom) return
  if (room.isActionComplete('goReward')) {
    room.clearActionVote()
    initAssignPhase()
  }
  if (room.isActionComplete('confirmReward')) {
    room.clearActionVote()
    _doConfirmRewards()
  }
  if (room.isActionComplete('goTrade')) {
    room.clearActionVote()
    confirmRewards()
  }
  if (room.isActionComplete('closeTrade')) {
    room.clearActionVote()
    room.clearTrade?.()
    _doConfirmRewards()
  }
}, { deep: true })

// Co-op: watch outcomeResult → execute ทันทีโดยไม่ต้องผ่าน modal
watch(() => room.outcomeResult, (result) => {
  if (!result || !room.inRoom) return
  pendingOutcome.value = result
  confirmOutcome()
})

const confirmOutcome = () => {
  const type = pendingOutcome.value
  pendingOutcome.value = null
  if (room.inRoom) room.clearOutcome?.()
  resultMonsterName.value = selectedMonster.value?.monster_name ?? ''
  if (type === 'complete') {
    resultAnimType.value = 'complete'
    showResultAnim.value = true
    playOutcomeSound('complete')
    if (monsterHuntingData.value?.reward_table?.length) {
      pendingRewardAfterAnim.value = true
    } else {
      onComplete()
    }
  } else {
    resultAnimType.value = 'fail'
    showResultAnim.value = true
    playOutcomeSound('fail')
    onFail()
  }
  setTimeout(dismissResult, 8000)
}

const _doDismissResult = () => {
  if (isDismissing.value) return
  isDismissing.value = true
  if (!pendingRewardAfterAnim.value) fadeOutOutcomeSound()
  setTimeout(() => {
    showResultAnim.value = false
    resultAnimType.value = null
    resultMonsterName.value = ''
    isDismissing.value = false
    if (pendingRewardAfterAnim.value) {
      pendingRewardAfterAnim.value = false
      goToRewardPhase()
    }
  }, 500)
}

const dismissResult = () => {
  if (isDismissing.value) return
  _doDismissResult()
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

// ── Behavior Deck ─────────────────────────────────────────
const behaviorDeck = ref([])       // cards in draw pile
const behaviorDiscard = ref([])    // cards already used
const behaviorBanished = ref([])   // cards removed from game
const currentBehaviorCard = ref(null)  // card currently showing
const showMonsterAttack = ref(false)   // animation overlay
const monsterAttackCard = ref(null)    // card being drawn
const monsterAttackStatuses = ref([])  // status snapshot for resolve overlay
const showStatusResolve = ref(false)   // "Effects Resolved" overlay
let _statusResolveTimer = null
const showDeckManager = ref(false)
const showCardZoom = ref(false)
const zoomCardImg = ref('')
const deckManagerTab = ref('deck')     // 'deck' | 'discard' | 'banished'

const _shuffle = (arr) => {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const _getMonsterInfo = () =>
  monsterInfoData.find((m) => m.monster_id === selectedMonster.value?.monster_id)

const buildBehaviorDeck = (tokenTotal, forcedSpecialName = undefined) => {
  const info = _getMonsterInfo()
  if (!info) return
  let specialName = forcedSpecialName
  if (specialName === undefined) {
    // Determine which special card to add based on Scoutfly tier
    const [min, max] = selectedQuest.value?.scoutfly_level ?? [0, 0]
    if (tokenTotal < min) specialName = selectedMonster.value?.special_attack_card?.[0]
    else if (tokenTotal <= max) specialName = selectedMonster.value?.special_attack_card?.[1]
    else specialName = selectedMonster.value?.special_attack_card?.[2]
  }

  const special = specialName
    ? info.behavior_special_card?.find(c => c.behavior_name === specialName)
    : null

  const deck = [...(info.behavior_deck ?? [])]
  if (special) deck.push(special)

  behaviorDeck.value = _shuffle(deck)
  behaviorDiscard.value = []
  currentBehaviorCard.value = null
  _pushDeckState(special ?? null)
}

const scoutflyTierLabel = (tier) => {
  const [min, max] = selectedQuest.value?.scoutfly_level ?? [0, 0]
  if (tier === 0) return `น้อยกว่า ${min}`
  if (tier === 1) return `${min} - ${max}`
  return `มากกว่า ${max}`
}

const selectSpecialAttackCard = (card) => {
  _pendingSpecialCardChoice.value = card
  showSpecialCardConfirm.value = true
}

const confirmSpecialAttackCard = () => {
  const card = _pendingSpecialCardChoice.value
  showSpecialCardConfirm.value = false
  showSpecialCardSelect.value = false
  buildBehaviorDeck(_pendingTokenTotal.value, card?.behavior_name ?? null)
  if (card) {
    specialCardOverlayCard.value = card
    if (questMode.value !== 'minimal') {
      showSpecialCardOverlay.value = true
      setTimeout(() => {
        showSpecialCardOverlay.value = false
        phase.value = 'huntingPanel'
      }, 4000)
      return
    }
  }
  phase.value = 'huntingPanel'
}

const _pushDeckState = (specialCard = undefined) => {
  if (!room.inRoom) return
  const payload = {
    deck: behaviorDeck.value,
    discard: behaviorDiscard.value,
    banished: behaviorBanished.value,
    current: currentBehaviorCard.value,
    misreadActive: misreadActive.value,
    rampageActive: rampageActive.value,
    activationOverride: activationOverride.value,
    attackStatuses: monsterAttackStatuses.value.length ? monsterAttackStatuses.value : null,
  }
  if (specialCard !== undefined) payload.specialCard = specialCard
  room.syncBehaviorDeck?.(payload)
}

// Banish card permanently from game (from deck or discard)
const banishCard = (card) => {
  behaviorDeck.value = behaviorDeck.value.filter(c => c.behavior_id !== card.behavior_id)
  behaviorDiscard.value = behaviorDiscard.value.filter(c => c.behavior_id !== card.behavior_id)
  behaviorBanished.value = [...behaviorBanished.value, card]
  _pushDeckState()
}

// Restore banished card back to deck
const restoreCard = (card) => {
  behaviorBanished.value = behaviorBanished.value.filter(c => c.behavior_id !== card.behavior_id)
  behaviorDeck.value = _shuffle([...behaviorDeck.value, card])
  _pushDeckState()
}

// Add a special card (that's not already in game) to deck
const addSpecialCardToDeck = (card) => {
  const allInGame = [...behaviorDeck.value, ...behaviorDiscard.value, ...behaviorBanished.value,
    ...(currentBehaviorCard.value ? [currentBehaviorCard.value] : [])]
  if (allInGame.find(c => c.behavior_id === card.behavior_id)) return
  behaviorDeck.value = _shuffle([...behaviorDeck.value, card])
  _pushDeckState()
}

const randomizeSpecialCard = () => {
  const specials = allSpecialCards.value
  if (!specials.length) return

  // นำ special card ทุกใบออกจาก deck, discard, banished และ current
  specials.forEach(card => {
    behaviorDeck.value = behaviorDeck.value.filter(c => c.behavior_id !== card.behavior_id)
    behaviorDiscard.value = behaviorDiscard.value.filter(c => c.behavior_id !== card.behavior_id)
    behaviorBanished.value = behaviorBanished.value.filter(c => c.behavior_id !== card.behavior_id)
    if (currentBehaviorCard.value?.behavior_id === card.behavior_id) currentBehaviorCard.value = null
  })

  // สุ่ม 1 ใบจากทั้งหมด
  const chosen = specials[Math.floor(Math.random() * specials.length)]

  // เพิ่มใบที่สุ่มได้ + สับกองทิ้งกลับเข้า deck
  behaviorDeck.value = _shuffle([...behaviorDeck.value, ...behaviorDiscard.value, chosen])
  behaviorDiscard.value = []
  _pushDeckState()
  _triggerShuffleAnim()
}

// Get all special cards for this monster (for add panel)
const allSpecialCards = computed(() => {
  const info = _getMonsterInfo()
  return info?.behavior_special_card ?? []
})

const isCardInGame = (card) => {
  const all = [...behaviorDeck.value, ...behaviorDiscard.value, ...behaviorBanished.value,
    ...(currentBehaviorCard.value ? [currentBehaviorCard.value] : [])]
  return all.some(c => c.behavior_id === card.behavior_id)
}

const drawBehaviorCard = () => {
  if (!room.isHost && room.inRoom) return
  if (behaviorDeck.value.length === 0) return
  if (!monsterTurnReady.value) return

  // Misread effect: discard top card before drawing
  if (misreadActive.value) {
    const discarded = behaviorDeck.value[0]
    behaviorDeck.value = behaviorDeck.value.slice(1)
    behaviorDiscard.value = [...behaviorDiscard.value, discarded]
    misreadActive.value = false
    _pushDeckState()
    if (behaviorDeck.value.length === 0) return
  }

  // Snapshot statuses before clearing (for resolve overlay)
  const resolvedStatuses = [...appliedStatuses.value]

  // Apply and clear all status effects at start of new monster turn
  if (appliedStatuses.value.length > 0) {
    // Poison: -2 HP
    if (appliedStatuses.value.includes(2)) {
      adjustHpWithFlash(-2)
    }
    appliedStatuses.value = []
    _pushHuntState()
  }

  const card = behaviorDeck.value[0]
  behaviorDeck.value = behaviorDeck.value.slice(1)
  if (currentBehaviorCard.value) behaviorDiscard.value = [...behaviorDiscard.value, currentBehaviorCard.value]
  currentBehaviorCard.value = card

  if (rampageActive.value) {
    activationOverride.value = 0
  } else if (pendingActivationAdjust.value !== 0) {
    activationOverride.value = Math.max(0, (card.activations ?? 0) + pendingActivationAdjust.value)
  } else {
    activationOverride.value = null
  }
  rampageActive.value = false
  pendingActivationAdjust.value = 0

  if (resolvedStatuses.length > 0) {
    _showStatusResolve(resolvedStatuses, card)
  } else {
    monsterAttackCard.value = card
    showMonsterAttack.value = true
  }

  _pushDeckState()
  _resetActivation()
  // แสดง float bar เฉพาะตอน Hunter มีเทิร์น (monsterTurnReady = false หลัง reset)
  if (!monsterTurnReady.value) floatBarCollapsed.value = false
}

const removeCardFromDeck = (behavior_name) => {
  behaviorDeck.value = behaviorDeck.value.filter(c => c.behavior_name !== behavior_name)
  behaviorDiscard.value = behaviorDiscard.value.filter(c => c.behavior_name !== behavior_name)
  _pushDeckState()
}

const showShuffleAnim = ref(false)
const shuffleCardBacks = computed(() => {
  const pool = behaviorDeck.value
  return Array.from({ length: 6 }, (_, i) => pool[i % Math.max(pool.length, 1)]?.back_card_img ?? null)
})
let _shuffleTimer = null
const _playShuffleAnim = () => {
  showShuffleAnim.value = false

  requestAnimationFrame(() => {
    showShuffleAnim.value = true
    clearTimeout(_shuffleTimer)
    _shuffleTimer = setTimeout(() => { showShuffleAnim.value = false }, 2000)
  })
}
const _triggerShuffleAnim = () => {
  _playShuffleAnim()
  if (room.inRoom && room.isHost) room.triggerShuffle?.()
}

// Show "Effects Resolved" overlay then auto-transition to Monster Attack overlay
const _showStatusResolve = (statuses, card) => {
  monsterAttackStatuses.value = statuses
  monsterAttackCard.value = card
  showStatusResolve.value = true
  clearTimeout(_statusResolveTimer)
  _statusResolveTimer = setTimeout(() => {
    showStatusResolve.value = false
    showMonsterAttack.value = true
  }, 2500)
}
const skipStatusResolve = () => {
  clearTimeout(_statusResolveTimer)
  showStatusResolve.value = false
  showMonsterAttack.value = true
}

const reshuffleDiscardIntoDeck = () => {
  behaviorDeck.value = _shuffle([...behaviorDeck.value, ...behaviorDiscard.value])
  behaviorDiscard.value = []
  _pushDeckState()
  _triggerShuffleAnim()
}

const discardTopBehaviorCard = () => {
  if (!behaviorDeck.value.length) return
  const [top, ...rest] = behaviorDeck.value
  behaviorDeck.value = rest
  behaviorDiscard.value = [...behaviorDiscard.value, top]
  _pushDeckState()
}

// Watch Firebase deck state
watch([() => room.behaviorDeckState, () => room.joinSignal], ([state], [prev]) => {
  if (!state || !room.inRoom) return

  // Deck states — Host จัดการเองจากโค้ด (ยกเว้นตอน reconnect)
  if (room.isHost && !_isReconnecting) return
  behaviorDeck.value = state.deck ?? []
  behaviorDiscard.value = state.discard ?? []
  behaviorBanished.value = state.banished ?? []

  const newCard = state.current ?? null
  const oldCard = prev?.current ?? currentBehaviorCard.value

  // Guest รออยู่ใน Minimal Mode → Host build deck เสร็จแล้ว ไปหน้า Hunting ได้
  if (awaitingHostDeckBuild.value && state.specialCard !== undefined) {
    awaitingHostDeckBuild.value = false
    if (phase.value !== 'huntingPanel') phase.value = 'huntingPanel'
  }

  // Special card overlay: แสดงเมื่อ deck ถูก build ใหม่ (ไม่แสดงตอน reconnect)
  const prevSpecial = prev?.specialCard
  const newSpecial = state.specialCard
  if (!_suppressAnimations && newSpecial && newSpecial?.behavior_id !== prevSpecial?.behavior_id) {
    specialCardOverlayCard.value = newSpecial
    if (questMode.value !== 'minimal') {
      showSpecialCardOverlay.value = true
      setTimeout(() => {
        showSpecialCardOverlay.value = false
        if (phase.value !== 'huntingPanel') phase.value = 'huntingPanel'
      }, 4000)
    }
  }

  // ถ้าการ์ดเปลี่ยน → แสดง animation + show float bar เฉพาะตอน Hunter มีเทิร์น
  if (newCard && newCard.behavior_id !== oldCard?.behavior_id) {
    if (!_suppressAnimations) {
      const guestStatuses = state.attackStatuses ?? []
      if (guestStatuses.length > 0) {
        _showStatusResolve(guestStatuses, newCard)
      } else {
        monsterAttackCard.value = newCard
        showMonsterAttack.value = true
      }
    }
    const newLimit = newCard.activations ?? 0
    if (newLimit > 0) floatBarCollapsed.value = false
  }

  currentBehaviorCard.value = newCard
  activationOverride.value = state.activationOverride ?? null
}, { immediate: true, deep: true })

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

const resetToBookPhase = () => {
  currentDialogId.value = null
  selectedQuest.value = null
  selectedMonster.value = null
  selectedBook.value = null
  potionCount.value = 0
  // Reset track tokens
  trackTokens.value = []
  trackTokenPool.value = []
  sessionStorage.removeItem('tt_local')
  // Reset behavior deck
  behaviorDeck.value = []
  behaviorDiscard.value = []
  behaviorBanished.value = []
  currentBehaviorCard.value = null
  // Reset time cards
  timeCardDeck.value = []
  timeCardDiscard.value = []
  showTimeCardManage.value = false
  redCardCounts.value = {}
  _soloTurnEnded.value = false
  tcRevealQueue.value = []
  showTcReveal.value = false
  tcRevealCurrent.value = null
  _tcAnimatedKeys.clear()
  _tcProcessedKeys.clear()
  activationRoundsCompleted.value = 0
  rampageActive.value = false
  misreadActive.value = false
  tcDiscardFlash.value = null
  tcStatusFlash.value = null
  nitrotoadStep.value = null
  nitrotoadRoll.value = null
  nitrotoadDrawerId.value = null
  paratoadStep.value = null
  paratoadRoll.value = null
  paratoadDrawerId.value = null
  poisoncupStep.value = null
  poisoncupRoll.value = null
  poisoncupDrawerId.value = null
  sleeptoadStep.value = null
  sleeptoadRoll.value = null
  sleeptoadDrawerId.value = null
  roarStep.value = null
  roarRoll.value = null
  roarDrawerId.value = null
  boulderStep.value = null
  boulderRoll.value = null
  boulderDrawerId.value = null
  recoveryPending.value = false
  recoveryHpSnapshot.value = null
  tcHpFlash.value = null
  activationOverride.value = null
  manualOutcomeCheck.value = null
  if (room.inRoom && room.isHost) room.syncManualOutcome?.(null)
  floatBarCollapsed.value = false
  questMode.value = 'full'
  if (room.inRoom && room.isHost) room.syncQuestMode?.('full')
  isExhaustedAttempt.value = false
  handlerStartDialogId.value = null
  phase.value = 'book'
}

const onComplete = () => {
  if (!isExhaustedAttempt.value) incrementAttempted()
  incrementDay()
  if (room.inRoom) room.leave()
  resetToBookPhase()
}

const onFail = () => {
  if (selectedQuest.value.quest_id !== 1 && !isExhaustedAttempt.value) incrementAttempted()
  incrementDay()
  if (room.inRoom) room.leave()
  resetToBookPhase()
}


const goBack = () => {
  const map = {
    huntingPanel: () => { phase.value = 'hunting' },
    detail: () => { phase.value = 'quest'; selectedQuest.value = null },
    quest: () => { phase.value = 'monster'; selectedMonster.value = null },
    monster: () => { phase.value = 'book'; selectedBook.value = null },
  }
  map[phase.value]?.()
}

const starColor = (difficulty) => {
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
const blastblightActive = computed(() => appliedStatuses.value.includes(5))
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
  _pushHuntState()
}

const removeStatus = (statusId) => {
  appliedStatuses.value = appliedStatuses.value.filter((id) => id !== statusId)
  statusMarks.value = { ...statusMarks.value, [statusId]: 0 }
  _pushHuntState()
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
    _elemAnimTimer = setTimeout(() => { triggeringElement.value = null }, 1800)
  } else {
    elementMarks.value = { ...elementMarks.value, [elementId]: next }
  }
  _pushHuntState()
}

const faintCount = ref(0)

// ── Track Token System ────────────────────────────────────
const trackTokenPool = ref([])  // ค่าที่เหลือในกอง
const trackTokens = ref([])     // token ที่ hunter มี [{id, revealed, value}]
let _tokenIdCounter = 0

const _getMonsterTokenData = () =>
  monsterInfoData.find((m) => m.monster_id === selectedMonster.value?.monster_id)?.track_token ?? []

const initTrackTokens = () => {
  trackTokenPool.value = [..._getMonsterTokenData()]
  trackTokens.value = []
  _tokenIdCounter = 0
  _pushTokenState()  // sync pool ไป Firebase ให้ guest เห็นทันที
}

const selectedToken = ref(null) // token ที่คลิกเพื่อแสดง modal

const _pushTokenState = () => {
  // บันทึกค่าจริงไว้ใน sessionStorage เพื่อ restore หลัง reconnect
  const localData = { pool: trackTokenPool.value, tokens: trackTokens.value }
  sessionStorage.setItem('tt_local', JSON.stringify(localData))

  if (!room.inRoom) return
  // Firebase: ใช้ number เสมอ (ไม่มี null/undefined) เพราะ Firebase จะลบ null field ออก
  const serialized = trackTokens.value.map(t => ({
    id: t.id,
    revealed: t.revealed ?? false,
    value: t.revealed ? (t.value ?? 0) : 0,
  }))
  room.syncTrackTokens?.(trackTokenPool.value, serialized)
}

const addTrackToken = () => {
  if (trackTokenPool.value.length === 0) return
  const idx = Math.floor(Math.random() * trackTokenPool.value.length)
  const val = trackTokenPool.value[idx]
  trackTokenPool.value = trackTokenPool.value.filter((_, i) => i !== idx)
  trackTokens.value = [...trackTokens.value, { id: ++_tokenIdCounter, revealed: false, value: val }]
  _pushTokenState()
}

const revealTrackToken = (id) => {
  const token = trackTokens.value.find((t) => t.id === id)
  if (!token || token.revealed) return
  trackTokens.value = trackTokens.value.map((t) =>
    t.id === id ? { ...t, revealed: true } : t,
  )
  _pushTokenState()
}

const discardTrackToken = (id) => {
  const token = trackTokens.value.find((t) => t.id === id)
  if (!token) return
  if (token.value !== null) {
    trackTokenPool.value = [...trackTokenPool.value, token.value]
  }
  trackTokens.value = trackTokens.value.filter((t) => t.id !== id)
  _pushTokenState()
}

// Watch Firebase → sync token state from others (guests only, host manages own state)
// joinSignal เป็น dependency เพื่อให้ re-process ทุกครั้งที่ join แม้ trackTokenState ไม่เปลี่ยน
watch([() => room.trackTokenState, () => room.joinSignal], ([state]) => {
  if (!room.inRoom || room.isHost) return
  if (!state) {
    trackTokens.value = []
    trackTokenPool.value = []
    return
  }
  // ดึงค่า local (sessionStorage) เพื่อ restore unrevealed token values
  let localTokenMap = {}
  try {
    const local = JSON.parse(sessionStorage.getItem('tt_local') ?? '{}')
    localTokenMap = Object.fromEntries((local.tokens ?? []).map(t => [t.id, t.value]))
    // Restore pool จาก local ถ้า Firebase pool ตรงกัน
    if (local.pool?.length === (state.pool?.length ?? 0)) {
      trackTokenPool.value = local.pool
    } else {
      trackTokenPool.value = state.pool ?? []
    }
  } catch { trackTokenPool.value = state.pool ?? [] }

  const remote = Array.isArray(state.tokens) ? state.tokens : []
  trackTokens.value = remote.map(t => ({
    id: t.id,
    revealed: t.revealed,
    value: t.revealed
      ? (t.value ?? 0)
      : (localTokenMap[t.id] ?? trackTokens.value.find(lt => lt.id === t.id)?.value ?? null),
  }))
}, { deep: true, immediate: true })

// ── Time Card System ──────────────────────────────────────
const timeCardDeck = ref([])
const timeCardDiscard = ref([])
const showTimeCardManage = ref(false)
const redCardCounts = ref({})
const showLastDiscard = ref(false)
const showConfirmTurn = ref(false)
const showMonsterTurnConfirm = ref(false)
const showAddHunterTurnConfirm = ref(false)
const pendingActivationAdjust = ref(0)
const floatBarCollapsed = ref(false)

const nextBehaviorCard = computed(() => behaviorDeck.value[0] ?? null)
const activationPartRules = computed(() =>
  Object.entries(activeParts.value)
    .filter(([pos, data]) => brokenParts.value[pos] && data.part_break_rule?.includes('จะทำให้ Hunter เล่นเพิ่มได้'))
    .map(([, data]) => data.part_break_rule)
)
const floatToggleLabel = computed(() => {
  if (floatOutcomeState.value === 'complete') return '✦ Quest Complete'
  if (floatOutcomeState.value === 'failed')   return '✕ Quest Failed'
  if (floatOutcomeState.value === 'timeout')  return '⏱ Time Out'
  if (!currentBehaviorCard.value || (activationLimit.value > 0 && monsterTurnReady.value)) return '⚔ รอ Monster Turn'
  if (myTurnEnded.value) return '✓ รอคนอื่น'
  return '🃏 จบเทิร์น'
})
const showDiscardCount = ref(false)
const discardCountInput = ref(1)

const _buildBaseTimeCardDeck = () => {
  const deck = []
  timeCardData.time_cards.forEach((card) => {
    for (let i = 0; i < card.copies; i++) {
      deck.push({ ...card, uid: `tc_${card.time_card_id}_${i}` })
    }
  })
  return deck
}

const buildTimeCardDeck = () => {
  if (!room.inRoom || room.isHost) {
    const timeLimit = selectedQuest.value?.time_limit ?? 45
    let deck = _buildBaseTimeCardDeck()
    deck = _shuffle(deck)
    timeCardDeck.value = deck.slice(0, timeLimit)
    timeCardDiscard.value = []
    _pushTimeCardState()
  }
}

const discardTimeCard = () => {
  if (!timeCardDeck.value.length) return
  const [top, ...rest] = timeCardDeck.value
  timeCardDiscard.value = [top, ...timeCardDiscard.value]
  timeCardDeck.value = rest
  _pushTimeCardState()
}

const addRedCardsAndShuffle = () => {
  const toAdd = []
  timeCardData.red_time_cards.forEach((card) => {
    if (redCardCounts.value[card.time_card_id]) {
      toAdd.push({ ...card, uid: `rc_${card.time_card_id}_${Date.now()}` })
    }
  })
  timeCardDeck.value = _shuffle([...timeCardDeck.value, ...toAdd])
  redCardCounts.value = {}
  showTimeCardManage.value = false
  _pushTimeCardState()
}


// Status Token Flash
const tcStatusFlash = ref(null) // { effectId, name, thumbnail } | null
let _statusFlashTimer = null

const _showTcStatusFlash = (statusId) => {
  const effect = getStatusEffect(statusId)
  if (!effect) return
  clearTimeout(_statusFlashTimer)
  tcStatusFlash.value = { effectId: statusId, name: effect.effect_name, thumbnail: effect.thumbnail }
  _pushTimeCardState()
  _statusFlashTimer = setTimeout(() => {
    tcStatusFlash.value = null
    _pushTimeCardState()
  }, 2000)
}

// Discard Flash Overlay
const tcDiscardFlash = ref(null) // [{ card_img, card_name }, ...]
let _discardFlashTimer = null

const _showDiscardFlash = (cards) => {
  clearTimeout(_discardFlashTimer)
  tcDiscardFlash.value = cards
  _pushTimeCardState()
  _discardFlashTimer = setTimeout(() => {
    tcDiscardFlash.value = null
    _pushTimeCardState()
  }, 2200)
}

// Nitrotoad state
const nitrotoadStep = ref(null) // null | 'roll' | 'part-select' | 'blastblight'
const nitrotoadRoll = ref(null)
const nitrotoadDrawerId = ref(null)
const nitrotoadDie = ref({ value: 1, rolling: false })
const isNitrotoadDrawer = computed(() =>
  !room.inRoom || String(room.myHunterId) === nitrotoadDrawerId.value
)

const rollNitrotoad = () => {
  const finalValue = Math.floor(Math.random() * 6) + 1
  nitrotoadDie.value = { value: 1, rolling: true }
  nitrotoadStep.value = 'rolling'
  _pushTimeCardState()
  const interval = setInterval(() => {
    nitrotoadDie.value = { value: Math.ceil(Math.random() * 6), rolling: true }
  }, 55)
  setTimeout(() => {
    clearInterval(interval)
    nitrotoadDie.value = { value: finalValue, rolling: false }
    nitrotoadRoll.value = finalValue
    nitrotoadStep.value = 'rolled'
    _pushTimeCardState()
  }, 700)
}

const confirmNitrotoad = () => {
  nitrotoadStep.value = nitrotoadRoll.value <= 3 ? 'part-select' : 'blastblight'
  _pushTimeCardState()
}

// Non-drawer animation: sync animation จาก Firebase (skip ถ้าเป็น drawer เพราะทอยเองแล้ว)
let _ntGuestInterval = null
watch(() => room.timeCardState?.nitrotoadStep, (step) => {
  if (!room.inRoom || isNitrotoadDrawer.value) return
  if (step === 'rolling') {
    nitrotoadDie.value = { value: 1, rolling: true }
    clearInterval(_ntGuestInterval)
    _ntGuestInterval = setInterval(() => {
      nitrotoadDie.value = { value: Math.ceil(Math.random() * 6), rolling: true }
    }, 55)
  } else if (step === 'rolled') {
    clearInterval(_ntGuestInterval)
    nitrotoadDie.value = { value: room.timeCardState?.nitrotoadRoll ?? 1, rolling: false }
  }
})

const applyNitrotoadBreak = (pos) => {
  const data = activeParts.value[pos]
  const current = partDamage.value[pos] ?? 0
  const max = data?.part_break_threshold ?? 0
  const next = Math.min(max, current + 1)
  adjustPartDamage(pos, 1)
  _showPartFlash(pos, next, next - current)
  nitrotoadStep.value = null
  nitrotoadRoll.value = null
  nitrotoadDrawerId.value = null
  _pushTimeCardState()
}

// ── Paratoad Time Card ────────────────────────────────────
const paratoadStep = ref(null) // null | 'roll' | 'rolling' | 'rolled' | 'paralysis'
const paratoadRoll = ref(null)
const paratoadDrawerId = ref(null)
const paratoadDie = ref({ value: 1, rolling: false })
const isParatoadDrawer = computed(() =>
  !room.inRoom || String(room.myHunterId) === paratoadDrawerId.value
)

const rollParatoad = () => {
  const finalValue = Math.floor(Math.random() * 6) + 1
  paratoadDie.value = { value: 1, rolling: true }
  paratoadStep.value = 'rolling'
  _pushTimeCardState()
  const interval = setInterval(() => {
    paratoadDie.value = { value: Math.ceil(Math.random() * 6), rolling: true }
  }, 55)
  setTimeout(() => {
    clearInterval(interval)
    paratoadDie.value = { value: finalValue, rolling: false }
    paratoadRoll.value = finalValue
    paratoadStep.value = 'rolled'
    _pushTimeCardState()
  }, 700)
}

const confirmParatoad = () => {
  if (paratoadRoll.value <= 3) {
    const res = monsterHuntingData.value?.status_resistance?.find(s => s.status_id === 4)
    if (res?.immune) {
      paratoadStep.value = 'immune'
    } else {
      markStatus(4)
      _showTcStatusFlash(4)
      paratoadStep.value = null
      paratoadRoll.value = null
      paratoadDrawerId.value = null
    }
  } else {
    paratoadStep.value = 'paralysis'
  }
  _pushTimeCardState()
}

const dismissParatoad = () => {
  paratoadStep.value = null
  paratoadRoll.value = null
  paratoadDrawerId.value = null
  _pushTimeCardState()
}

let _ptGuestInterval = null
watch(() => room.timeCardState?.paratoadStep, (step) => {
  if (!room.inRoom || isParatoadDrawer.value) return
  if (step === 'rolling') {
    paratoadDie.value = { value: 1, rolling: true }
    clearInterval(_ptGuestInterval)
    _ptGuestInterval = setInterval(() => { paratoadDie.value = { value: Math.ceil(Math.random() * 6), rolling: true } }, 55)
  } else if (step === 'rolled') {
    clearInterval(_ptGuestInterval)
    paratoadDie.value = { value: room.timeCardState?.paratoadRoll ?? 1, rolling: false }
  }
})

// ── Poisoncup Time Card ───────────────────────────────────
const poisoncupStep = ref(null) // null | 'roll' | 'rolling' | 'rolled' | 'poison'
const poisoncupRoll = ref(null)
const poisoncupDrawerId = ref(null)
const poisoncupDie = ref({ value: 1, rolling: false })
const isPoisoncupDrawer = computed(() =>
  !room.inRoom || String(room.myHunterId) === poisoncupDrawerId.value
)

const rollPoisoncup = () => {
  const finalValue = Math.floor(Math.random() * 6) + 1
  poisoncupDie.value = { value: 1, rolling: true }
  poisoncupStep.value = 'rolling'
  _pushTimeCardState()
  const interval = setInterval(() => {
    poisoncupDie.value = { value: Math.ceil(Math.random() * 6), rolling: true }
  }, 55)
  setTimeout(() => {
    clearInterval(interval)
    poisoncupDie.value = { value: finalValue, rolling: false }
    poisoncupRoll.value = finalValue
    poisoncupStep.value = 'rolled'
    _pushTimeCardState()
  }, 700)
}

const confirmPoisoncup = () => {
  if (poisoncupRoll.value <= 3) {
    const res = monsterHuntingData.value?.status_resistance?.find(s => s.status_id === 2)
    if (res?.immune) {
      poisoncupStep.value = 'immune'
    } else {
      markStatus(2)
      _showTcStatusFlash(2)
      poisoncupStep.value = null
      poisoncupRoll.value = null
      poisoncupDrawerId.value = null
    }
  } else {
    poisoncupStep.value = 'poison'
  }
  _pushTimeCardState()
}

const dismissPoisoncup = () => {
  poisoncupStep.value = null
  poisoncupRoll.value = null
  poisoncupDrawerId.value = null
  _pushTimeCardState()
}

let _pcGuestInterval = null
watch(() => room.timeCardState?.poisoncupStep, (step) => {
  if (!room.inRoom || isPoisoncupDrawer.value) return
  if (step === 'rolling') {
    poisoncupDie.value = { value: 1, rolling: true }
    clearInterval(_pcGuestInterval)
    _pcGuestInterval = setInterval(() => { poisoncupDie.value = { value: Math.ceil(Math.random() * 6), rolling: true } }, 55)
  } else if (step === 'rolled') {
    clearInterval(_pcGuestInterval)
    poisoncupDie.value = { value: room.timeCardState?.poisoncupRoll ?? 1, rolling: false }
  }
})

// ── Sleeptoad Time Card ───────────────────────────────────
const sleeptoadStep = ref(null) // null | 'roll' | 'rolling' | 'rolled' | 'sleep' | 'immune'
const sleeptoadRoll = ref(null)
const sleeptoadDrawerId = ref(null)
const sleeptoadDie = ref({ value: 1, rolling: false })
const isSleeptoadDrawer = computed(() =>
  !room.inRoom || String(room.myHunterId) === sleeptoadDrawerId.value
)

const rollSleeptoad = () => {
  const finalValue = Math.floor(Math.random() * 6) + 1
  sleeptoadDie.value = { value: 1, rolling: true }
  sleeptoadStep.value = 'rolling'
  _pushTimeCardState()
  const interval = setInterval(() => {
    sleeptoadDie.value = { value: Math.ceil(Math.random() * 6), rolling: true }
  }, 55)
  setTimeout(() => {
    clearInterval(interval)
    sleeptoadDie.value = { value: finalValue, rolling: false }
    sleeptoadRoll.value = finalValue
    sleeptoadStep.value = 'rolled'
    _pushTimeCardState()
  }, 700)
}

const confirmSleeptoad = () => {
  if (sleeptoadRoll.value <= 3) {
    const res = monsterHuntingData.value?.status_resistance?.find(s => s.status_id === 3)
    if (res?.immune) {
      sleeptoadStep.value = 'immune'
    } else {
      markStatus(3)
      _showTcStatusFlash(3)
      sleeptoadStep.value = null
      sleeptoadRoll.value = null
      sleeptoadDrawerId.value = null
    }
  } else {
    sleeptoadStep.value = 'sleep'
  }
  _pushTimeCardState()
}

const dismissSleeptoad = () => {
  sleeptoadStep.value = null
  sleeptoadRoll.value = null
  sleeptoadDrawerId.value = null
  _pushTimeCardState()
}

let _stGuestInterval = null
watch(() => room.timeCardState?.sleeptoadStep, (step) => {
  if (!room.inRoom || isSleeptoadDrawer.value) return
  if (step === 'rolling') {
    sleeptoadDie.value = { value: 1, rolling: true }
    clearInterval(_stGuestInterval)
    _stGuestInterval = setInterval(() => { sleeptoadDie.value = { value: Math.ceil(Math.random() * 6), rolling: true } }, 55)
  } else if (step === 'rolled') {
    clearInterval(_stGuestInterval)
    sleeptoadDie.value = { value: room.timeCardState?.sleeptoadRoll ?? 1, rolling: false }
  }
})

// ── Roar Time Card ────────────────────────────────────────
const roarStep = ref(null) // null | 'roll' | 'rolling' | 'rolled'
const roarRoll = ref(null)
const roarDrawerId = ref(null)
const roarDie = ref({ value: 1, rolling: false })
const isRoarDrawer = computed(() =>
  !room.inRoom || String(room.myHunterId) === roarDrawerId.value
)

const rollRoar = () => {
  const finalValue = Math.floor(Math.random() * 6) + 1
  roarDie.value = { value: 1, rolling: true }
  roarStep.value = 'rolling'
  _pushTimeCardState()
  const interval = setInterval(() => {
    roarDie.value = { value: Math.ceil(Math.random() * 6), rolling: true }
  }, 55)
  setTimeout(() => {
    clearInterval(interval)
    roarDie.value = { value: finalValue, rolling: false }
    roarRoll.value = finalValue
    roarStep.value = 'rolled'
    _pushTimeCardState()
  }, 700)
}

const confirmRoar = () => {
  const count = Math.min(roarRoll.value, timeCardDeck.value.length)
  const discarded = timeCardDeck.value.slice(0, count)
  timeCardDeck.value = timeCardDeck.value.slice(count)
  timeCardDiscard.value = [...discarded, ...timeCardDiscard.value]
  roarStep.value = null
  roarRoll.value = null
  roarDrawerId.value = null
  _showDiscardFlash(discarded)
  _pushTimeCardState()
}

const dismissRoar = () => {
  roarStep.value = null
  roarRoll.value = null
  roarDrawerId.value = null
  _pushTimeCardState()
}

let _roarGuestInterval = null
watch(() => room.timeCardState?.roarStep, (step) => {
  if (!room.inRoom || isRoarDrawer.value) return
  if (step === 'rolling') {
    roarDie.value = { value: 1, rolling: true }
    clearInterval(_roarGuestInterval)
    _roarGuestInterval = setInterval(() => { roarDie.value = { value: Math.ceil(Math.random() * 6), rolling: true } }, 55)
  } else if (step === 'rolled') {
    clearInterval(_roarGuestInterval)
    roarDie.value = { value: room.timeCardState?.roarRoll ?? 1, rolling: false }
  }
})

// ── Suspended Boulder Time Card ───────────────────────────
const boulderStep = ref(null) // null | 'roll' | 'rolling' | 'rolled' | 'hunter-damage'
const boulderRoll = ref(null)
const boulderDrawerId = ref(null)
const boulderDie = ref({ value: 1, rolling: false })
const isBoulderDrawer = computed(() =>
  !room.inRoom || String(room.myHunterId) === boulderDrawerId.value
)

const rollBoulder = () => {
  const finalValue = Math.floor(Math.random() * 6) + 1
  boulderDie.value = { value: 1, rolling: true }
  boulderStep.value = 'rolling'
  _pushTimeCardState()
  const interval = setInterval(() => {
    boulderDie.value = { value: Math.ceil(Math.random() * 6), rolling: true }
  }, 55)
  setTimeout(() => {
    clearInterval(interval)
    boulderDie.value = { value: finalValue, rolling: false }
    boulderRoll.value = finalValue
    boulderStep.value = 'rolled'
    _pushTimeCardState()
  }, 700)
}

const confirmBoulder = () => {
  if (boulderRoll.value <= 3) {
    adjustHpWithFlash(-5)
    boulderStep.value = null
    boulderRoll.value = null
    boulderDrawerId.value = null
  } else {
    boulderStep.value = 'hunter-damage'
  }
  _pushTimeCardState()
}

const dismissBoulder = () => {
  boulderStep.value = null
  boulderRoll.value = null
  boulderDrawerId.value = null
  _pushTimeCardState()
}

let _bdGuestInterval = null
watch(() => room.timeCardState?.boulderStep, (step) => {
  if (!room.inRoom || isBoulderDrawer.value) return
  if (step === 'rolling') {
    boulderDie.value = { value: 1, rolling: true }
    clearInterval(_bdGuestInterval)
    _bdGuestInterval = setInterval(() => { boulderDie.value = { value: Math.ceil(Math.random() * 6), rolling: true } }, 55)
  } else if (step === 'rolled') {
    clearInterval(_bdGuestInterval)
    boulderDie.value = { value: room.timeCardState?.boulderRoll ?? 1, rolling: false }
  }
})

// ── Recovery Time Card ────────────────────────────────────
const recoveryPending = ref(false)
const recoveryHpSnapshot = ref(null)


const dismissNitrotoad = () => {
  nitrotoadStep.value = null
  nitrotoadRoll.value = null
  nitrotoadDrawerId.value = null
  _pushTimeCardState()
}

const _pushTimeCardState = () => {
  if (!room.inRoom) return
  room.syncTimeCards?.({
    deck: timeCardDeck.value,
    discard: timeCardDiscard.value,
    tcStatusFlash: tcStatusFlash.value ?? null,
    discardFlashCards: tcDiscardFlash.value ?? null,
    nitrotoadStep: nitrotoadStep.value,
    nitrotoadRoll: nitrotoadRoll.value,
    nitrotoadDrawerId: nitrotoadDrawerId.value,
    paratoadStep: paratoadStep.value,
    paratoadRoll: paratoadRoll.value,
    paratoadDrawerId: paratoadDrawerId.value,
    poisoncupStep: poisoncupStep.value,
    poisoncupRoll: poisoncupRoll.value,
    poisoncupDrawerId: poisoncupDrawerId.value,
    sleeptoadStep: sleeptoadStep.value,
    sleeptoadRoll: sleeptoadRoll.value,
    sleeptoadDrawerId: sleeptoadDrawerId.value,
    roarStep: roarStep.value,
    roarRoll: roarRoll.value,
    roarDrawerId: roarDrawerId.value,
    boulderStep: boulderStep.value,
    boulderRoll: boulderRoll.value,
    boulderDrawerId: boulderDrawerId.value,
    recoveryPending: recoveryPending.value,
    recoveryHpSnapshot: recoveryHpSnapshot.value,
  })
}



watch([() => room.timeCardState, () => room.joinSignal], ([state]) => {
  if (!state || !room.inRoom) return

  // Modal states — ทุกคนต้องอ่าน (Host ด้วย เพราะ Guest อาจเป็นคนทอย)
  nitrotoadStep.value = state.nitrotoadStep ?? null
  nitrotoadRoll.value = state.nitrotoadRoll ?? null
  nitrotoadDrawerId.value = state.nitrotoadDrawerId ?? null
  paratoadStep.value = state.paratoadStep ?? null
  paratoadRoll.value = state.paratoadRoll ?? null
  paratoadDrawerId.value = state.paratoadDrawerId ?? null
  poisoncupStep.value = state.poisoncupStep ?? null
  poisoncupRoll.value = state.poisoncupRoll ?? null
  poisoncupDrawerId.value = state.poisoncupDrawerId ?? null
  sleeptoadStep.value = state.sleeptoadStep ?? null
  sleeptoadRoll.value = state.sleeptoadRoll ?? null
  sleeptoadDrawerId.value = state.sleeptoadDrawerId ?? null
  roarStep.value = state.roarStep ?? null
  roarRoll.value = state.roarRoll ?? null
  roarDrawerId.value = state.roarDrawerId ?? null
  boulderStep.value = state.boulderStep ?? null
  boulderRoll.value = state.boulderRoll ?? null
  boulderDrawerId.value = state.boulderDrawerId ?? null
  recoveryPending.value = state.recoveryPending ?? false
  recoveryHpSnapshot.value = state.recoveryHpSnapshot ?? null

  // Display states — ทุกคนต้องเห็น (Host ด้วย เพราะ Guest อาจเป็นคนจัดการ)
  if (state.tcStatusFlash && state.tcStatusFlash.effectId !== tcStatusFlash.value?.effectId) {
    clearTimeout(_statusFlashTimer)
    tcStatusFlash.value = state.tcStatusFlash
    _statusFlashTimer = setTimeout(() => { tcStatusFlash.value = null }, 2000)
  } else if (!state.tcStatusFlash) {
    tcStatusFlash.value = null
  }
  const _dfKey = state.discardFlashCards?.map(c => c.card_name).join(',') ?? null
  const _dfCur = tcDiscardFlash.value?.map(c => c.card_name).join(',') ?? null
  if (_dfKey && _dfKey !== _dfCur) {
    clearTimeout(_discardFlashTimer)
    tcDiscardFlash.value = state.discardFlashCards
    _discardFlashTimer = setTimeout(() => { tcDiscardFlash.value = null }, 2200)
  } else if (!state.discardFlashCards) {
    tcDiscardFlash.value = null
  }

  // Deck/discard — Host จัดการเองจากโค้ด ไม่ต้องอ่านจาก Firebase (ยกเว้นตอน reconnect)
  if (room.isHost && !_isReconnecting) return
  timeCardDeck.value = state.deck ?? []
  timeCardDiscard.value = state.discard ?? []
}, { deep: true, immediate: true })

// ── Time Card Turn System (Hunting Phase) ─────────────────
const _soloTurnEnded = ref(false)
const tcRevealQueue = ref([])
const showTcReveal = ref(false)
const tcRevealCurrent = ref(null)
const _tcAnimatedKeys = new Set()
const _tcProcessedKeys = new Set()

const myTurnEnded = computed(() => {
  if (!room.inRoom) return _soloTurnEnded.value
  return !!(room.tcTurnEnds?.[room.myHunterId])
})

const _queueReveal = (hunterName, card, hunterClassId) => {
  tcRevealQueue.value = [...tcRevealQueue.value, { hunterName, card, hunterClassId }]
  _processTcRevealQueue()
}

const _processTcRevealQueue = () => {
  if (showTcReveal.value || !tcRevealQueue.value.length) return
  if (!['huntingPanel', 'hunting'].includes(phase.value)) {
    tcRevealQueue.value = []
    return
  }
  tcRevealCurrent.value = tcRevealQueue.value[0]
  tcRevealQueue.value = tcRevealQueue.value.slice(1)
  showTcReveal.value = true
}

const dismissTcReveal = () => {
  showTcReveal.value = false
  tcRevealCurrent.value = null
  setTimeout(_processTcRevealQueue, 300)
}

const _drawTcCard = (hunterName, hunterId = null) => {
  const drawerId = room.inRoom ? String(hunterId ?? room.myHunterId) : null
  if (!timeCardDeck.value.length) return null
  const [card, ...rest] = timeCardDeck.value
  timeCardDeck.value = rest
  timeCardDiscard.value = [card, ...timeCardDiscard.value]
  if (card.card_name === 'Rampage') rampageActive.value = true
  if (card.card_name === 'Misread') misreadActive.value = true
  if (card.card_name === 'Monster Sleeps') {
    const newPartDamage = { ...partDamage.value }
    Object.entries(activeParts.value).forEach(([pos]) => {
      if (!brokenParts.value[pos]) newPartDamage[pos] = Math.max(0, (newPartDamage[pos] ?? 0) - 1)
    })
    partDamage.value = newPartDamage
    const max = monsterHuntingData.value?.health ?? 999
    huntingHp.value = Math.min(max, huntingHp.value + 5)
    _showDamageIndicator(5, 'heal')
    _showTcHpFlash(5, 'heal', huntingHp.value - 5, huntingHp.value)
    _pushHuntState()
  }
  if (card.card_name === 'Nitrotoad') {
    nitrotoadStep.value = 'roll'; nitrotoadRoll.value = null; nitrotoadDrawerId.value = drawerId
  }
  if (card.card_name === 'Paratoad') {
    paratoadStep.value = 'roll'; paratoadRoll.value = null; paratoadDrawerId.value = drawerId
  }
  if (card.card_name === 'Poisoncup') {
    poisoncupStep.value = 'roll'; poisoncupRoll.value = null; poisoncupDrawerId.value = drawerId
  }
  if (card.card_name === 'Sleeptoad') {
    sleeptoadStep.value = 'roll'; sleeptoadRoll.value = null; sleeptoadDrawerId.value = drawerId
  }
  if (card.card_name === 'Roar') {
    roarStep.value = 'roll'; roarRoll.value = null; roarDrawerId.value = drawerId
  }
  if (card.card_name === 'Suspended Boulder') {
    boulderStep.value = 'roll'; boulderRoll.value = null; boulderDrawerId.value = drawerId
  }
  if (card.card_name === 'Recovery') {
    adjustHpWithFlash(5); recoveryHpSnapshot.value = huntingHp.value; recoveryPending.value = true
  }
  if (card.card_name === 'Turf War') {
    adjustHpWithFlash(-5)
  }
  if (card.card_name === 'Time Waster') {
    const discardCount = Math.min(4, timeCardDeck.value.length)
    const discarded = timeCardDeck.value.slice(0, discardCount)
    timeCardDeck.value = timeCardDeck.value.slice(discardCount)
    timeCardDiscard.value = [...discarded, ...timeCardDiscard.value]
    _showDiscardFlash(discarded)
  }
  if (card.card_name === 'Monster Retreats') {
    const discardCount = Math.min(4, timeCardDeck.value.length)
    const discarded = timeCardDeck.value.slice(0, discardCount)
    timeCardDeck.value = timeCardDeck.value.slice(discardCount)
    timeCardDiscard.value = [...discarded, ...timeCardDiscard.value]
    _showDiscardFlash(discarded)
  }
  _pushTimeCardState()
  if (rampageActive.value || misreadActive.value) _pushDeckState()
  return card
}

const endTurn = () => {
  if (myTurnEnded.value) return
  if (!currentBehaviorCard.value) return
  if (activationLimit.value > 0 && monsterTurnReady.value) return

  if (recoveryPending.value) {
    if (huntingHp.value >= recoveryHpSnapshot.value) adjustHpWithFlash(5)
    recoveryPending.value = false
    recoveryHpSnapshot.value = null
    _pushTimeCardState()
  }

  if (!room.inRoom) {
    // Solo: draw card ถ้ายังมี, จากนั้น check outcome
    const hunterName = hunter.value?.hunter_name ?? 'Hunter'
    const deckWasEmpty = timeCardDeck.value.length === 0
    if (!deckWasEmpty) {
      const card = _drawTcCard(hunterName)
      if (card) _queueReveal(hunterName, card, hunter.value?.hunter_class_id)
    }
    _soloTurnEnded.value = true
    _incrementActivation()
    if (canComplete.value) {
      _setManualOutcome('complete')
    } else if (!canFail.value && deckWasEmpty && currentBehaviorCard.value) {
      _setManualOutcome('timeout')
    }
    setTimeout(() => { _soloTurnEnded.value = false }, 200)
    return
  }

  const myName = room.myHunter?.hunter_name ?? 'Hunter'

  if (room.isHost) {
    const deckWasEmpty = timeCardDeck.value.length === 0
    if (!deckWasEmpty) {
      const card = _drawTcCard(myName, room.myHunterId)
      if (card) {
        _tcProcessedKeys.add(String(room.myHunterId))
        room.markTcDrawn?.(room.myHunterId, myName, card)
      }
    } else {
      _tcProcessedKeys.add(String(room.myHunterId))
      room.markTcDrawn?.(room.myHunterId, myName, null)
    }
    _incrementActivation()
    _checkOutcomeAfterTurn(deckWasEmpty)
  } else {
    room.markTcPending?.(room.myHunterId, myName)
  }
}

// Host watches for guest pending requests; all watch for drawn cards to animate
watch(() => room.shuffleSignal, (val) => {
  if (!val || !room.inRoom || room.isHost || _suppressAnimations) return
  _playShuffleAnim()
})

// ── Activation (Turn Limit) System ───────────────────────
const activationRoundsCompleted = ref(0)
const rampageActive = ref(false)      // Rampage time card drawn → next behavior card activations = 0
const misreadActive = ref(false)      // Misread time card drawn → discard top behavior card before next draw
const activationOverride = ref(null)  // null = use card value, 0 = Rampage override

// Banner/flag states จาก Firebase — ต้องอยู่หลัง declare (ไม่มี immediate)
watch([() => room.behaviorDeckState, () => room.joinSignal], ([state]) => {
  if (!state || !room.inRoom) return
  misreadActive.value = state.misreadActive ?? false
  rampageActive.value = state.rampageActive ?? false
  activationOverride.value = state.activationOverride ?? null
})
const activationLimit = computed(() => {
  if (activationOverride.value !== null) return activationOverride.value
  return currentBehaviorCard.value?.activations ?? 0
})
const monsterTurnReady = computed(() =>
  activationLimit.value === 0 || activationRoundsCompleted.value >= activationLimit.value
)

const canComplete = computed(() => huntingHp.value === 0)
const canFail = computed(() => faintCount.value >= 3)

// Quest Complete / Time Out แสดงเฉพาะหลังกดจบเทิร์น (manual check)
// Quest Failed ยังคง reactive (จาก faint count)
const manualOutcomeCheck = ref(null) // 'complete' | 'timeout' | null
const floatOutcomeState = computed(() => {
  if (canFail.value) return 'failed'
  return manualOutcomeCheck.value
})

watch([monsterTurnReady, myTurnEnded], ([ready, ended]) => {
  if (floatOutcomeState.value) return
  floatBarCollapsed.value = ready || ended
})

watch(floatOutcomeState, (state) => {
  if (state !== null) floatBarCollapsed.value = false
})

// ถ้า monster heal กลับมา (HP > 0) → ล้าง Quest Complete ออก
watch(canComplete, (val) => {
  if (!val && manualOutcomeCheck.value === 'complete') {
    // ระหว่าง reconnect restore (_isReconnecting หรือ _restoringOutcome) — ไม่ล้างค่าเลย
    if (_isReconnecting || _restoringOutcome) return
    manualOutcomeCheck.value = null
    if (room.inRoom && room.isHost) room.syncManualOutcome?.(null)
  }
  // Minimal mode: HP = 0 → แสดง Slain บน portrait ทันที
  if (val && questMode.value === 'minimal') {
    _setManualOutcome('complete')
  }
})

// ออกจาก huntingPanel → clear outcome buttons ทันที (ทุก client)
watch(phase, (newPhase, oldPhase) => {
  if (oldPhase === 'huntingPanel' && newPhase !== 'huntingPanel') {
    manualOutcomeCheck.value = null
  }
})

// Guest receives outcome signal → set manual outcome + expand float bar
watch(() => room.outcomeSignal, (val) => {
  if (!val || !room.inRoom || room.isHost || _suppressAnimations) return
  if (val.outcome) {
    manualOutcomeCheck.value = val.outcome
    floatBarCollapsed.value = false
  }
})

// Guest syncs manualOutcome state จาก Firebase (รวมถึงตอน host clear เป็น null)
// Host ก็ restore ได้ระหว่าง reconnect window (เหมือน behaviorDeck / timeCard / questMode)
watch(() => room.manualOutcomeState, (val) => {
  if (!room.inRoom) return
  if (room.isHost && !_isReconnecting) return
  manualOutcomeCheck.value = val ?? null
})

// Guest syncs quest mode from host (Host also restores from Firebase during reconnect)
watch(() => room.questModeState, (val) => {
  if (!room.inRoom) return
  if (room.isHost && !_isReconnecting) return
  if (val) questMode.value = val
})

const _incrementActivation = () => {
  activationRoundsCompleted.value++
  if (room.inRoom && room.isHost) room.syncActivationCount?.(activationRoundsCompleted.value)
}

const _setManualOutcome = (outcome) => {
  manualOutcomeCheck.value = outcome
  floatBarCollapsed.value = false
  if (room.inRoom && room.isHost) {
    room.syncManualOutcome?.(outcome)
    room.triggerOutcomeSignal?.(outcome)
  }
}

const _checkOutcomeAfterTurn = (deckWasEmpty = false) => {
  let outcome = null
  if (canComplete.value) {
    outcome = 'complete'
  } else if (!canFail.value && deckWasEmpty && currentBehaviorCard.value) {
    outcome = 'timeout'
  }
  if (!outcome) return
  _setManualOutcome(outcome)
}

const _resetActivation = () => {
  activationRoundsCompleted.value = 0
  if (room.inRoom && room.isHost) room.syncActivationCount?.(0)
}

const addHostTurn = () => {
  if (!currentBehaviorCard.value) return
  activationOverride.value = activationLimit.value + 1
  _pushDeckState()
}

// Guest syncs from Firebase
watch([() => room.activationCount, () => room.joinSignal], ([count]) => {
  if (!room.inRoom) return
  activationRoundsCompleted.value = count ?? 0
})

watch(() => room.tcTurnEnds, (ends) => {
  if (!room.inRoom) return
  if (phase.value !== 'huntingPanel') return

  if (!ends) {
    _tcAnimatedKeys.clear()
    _tcProcessedKeys.clear()
    return
  }

  Object.entries(ends).forEach(([hunterId, data]) => {
    // Host: fulfill pending guest requests
    if (room.isHost && data.pending && !_tcProcessedKeys.has(hunterId)) {
      _tcProcessedKeys.add(hunterId)
      const deckWasEmpty = timeCardDeck.value.length === 0
      const card = !deckWasEmpty ? _drawTcCard(data.hunterName, hunterId) : null
      room.markTcDrawn?.(hunterId, data.hunterName, card ?? null)
      _incrementActivation()
      _checkOutcomeAfterTurn(deckWasEmpty)
    }

    // All: queue animation for newly drawn cards (ไม่แสดงตอน reconnect)
    if (!_suppressAnimations && data.card && !_tcAnimatedKeys.has(hunterId)) {
      _tcAnimatedKeys.add(hunterId)
      const h = room.hunters.find(hh => String(hh.hunter_id) === hunterId)
      _queueReveal(data.hunterName, data.card, h?.hunter_class_id)
    } else if (data.card) {
      _tcAnimatedKeys.add(hunterId)
    }
  })

  // Host: clear when all hunters have drawn
  if (room.isHost) {
    const total = room.hunters.length
    const drawn = Object.values(ends).filter(d => d.card).length
    if (drawn >= total && total > 0) {
      setTimeout(() => {
        room.clearAllTurnEnds?.()
        _tcAnimatedKeys.clear()
        _tcProcessedKeys.clear()
      }, 200)
    }
  }
}, { deep: true })

const potionCount = ref(0)

const toggleFaint = (index) => {
  faintCount.value = faintCount.value === index ? index - 1 : index
  _pushHuntState()
}

const togglePotion = (index) => {
  potionCount.value = potionCount.value === index ? index - 1 : index
  _pushHuntState()
}

const initHuntingData = () => {
  if (!monsterHuntingData.value) return
  huntingHp.value = monsterHuntingData.value.health
  faintCount.value = 0
  // potionCount ไม่ reset เพราะยาที่ได้จาก Dialog Phase ควรพกมาด้วย
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
  activationRoundsCompleted.value = 0
  activationOverride.value = null
  if (room.inRoom && room.isHost) room.syncActivationCount?.(0)
}

// ── Damage Indicator ─────────────────────────────────────
const damageIndicators = ref([])
const isShaking = ref(false)
const tcHpFlash = ref(null) // { delta: number, type: 'dmg'|'heal' } | null
let _tcHpFlashTimer = null
const tcPartFlash = ref(null) // { position, delta, current, max, thumbnail } | null
let _tcPartFlashTimer = null

const _showTcHpFlash = (delta, type, prevHp = null, newHp = null) => {
  clearTimeout(_tcHpFlashTimer)
  const maxHp = monsterHuntingData.value?.health ?? 1
  tcHpFlash.value = { delta, type, prevHp, newHp, maxHp }
  _tcHpFlashTimer = setTimeout(() => { tcHpFlash.value = null }, 2200)
}

const adjustHpWithFlash = (delta) => {
  const prev = huntingHp.value
  adjustHp(delta)
  const diff = huntingHp.value - prev
  if (diff !== 0) _showTcHpFlash(Math.abs(diff), diff < 0 ? 'dmg' : 'heal', prev, huntingHp.value)
}
let _dmgCounter = 0
let _shakeTimer = null

const _showDamageIndicator = (amount, type = 'dmg') => {
  if (amount <= 0) return
  const id = ++_dmgCounter
  const x = 35 + Math.random() * 30
  damageIndicators.value.push({ id, value: amount, x, type })
  setTimeout(() => {
    damageIndicators.value = damageIndicators.value.filter((d) => d.id !== id)
  }, 1100)

  if (type === 'dmg') {
    isShaking.value = false
    nextTick(() => {
      isShaking.value = true
      if (_shakeTimer) clearTimeout(_shakeTimer)
      _shakeTimer = setTimeout(() => { isShaking.value = false }, 500)
    })
  }
}

// ── Hunt State Sync ──────────────────────────────────────
let _remoteSyncing = false

const _pushHuntState = () => {
  if (!room.inRoom || _remoteSyncing) return
  room.syncHuntState({
    huntingHp: huntingHp.value,
    partDamage: partDamage.value,
    statusMarks: statusMarks.value,
    appliedStatuses: appliedStatuses.value.length
      ? appliedStatuses.value.reduce((o, id) => ({ ...o, [id]: true }), {})
      : { _empty: true },
    elementMarks: elementMarks.value,
    faintCount: faintCount.value,
    potionCount: potionCount.value,
    triggeringElement: triggeringElement.value ?? '_none',
  })
}

watch([() => room.huntState, () => room.joinSignal], ([state]) => {
  if (!state || !room.inRoom) return
  _remoteSyncing = true
  if (state.huntingHp !== undefined) {
    const diff = state.huntingHp - huntingHp.value
    if (!_suppressAnimations && diff < 0) _showDamageIndicator(-diff, 'dmg')
    if (!_suppressAnimations && diff > 0) _showDamageIndicator(diff, 'heal')
    if (!_suppressAnimations && diff !== 0)
      _showTcHpFlash(Math.abs(diff), diff < 0 ? 'dmg' : 'heal', huntingHp.value, state.huntingHp)
    huntingHp.value = state.huntingHp
  }
  if (state.partDamage) {
    if (!_suppressAnimations) {
      Object.entries(state.partDamage).forEach(([pos, newVal]) => {
        const diff = newVal - (partDamage.value[pos] ?? 0)
        if (diff !== 0) {
          const data = activeParts.value[pos]
          if (data) {
            const _pMax = data.part_break_threshold ?? 0
            const _pBroken = newVal >= _pMax && diff > 0
            clearTimeout(_tcPartFlashTimer)
            tcPartFlash.value = {
              position: pos, delta: diff, current: newVal,
              max: _pMax,
              thumbnail: getPartMeta(data.part_id)?.thumbnail ?? null,
              broken: _pBroken,
            }
            _tcPartFlashTimer = setTimeout(() => { tcPartFlash.value = null }, _pBroken ? 2800 : 1800)
          }
        }
      })
    }
    partDamage.value = state.partDamage
  }
  if (state.statusMarks) statusMarks.value = state.statusMarks

  // appliedStatuses: handle empty sentinel
  if (state.appliedStatuses) {
    const ids = Object.keys(state.appliedStatuses)
      .filter((k) => k !== '_empty')
      .map(Number)
    appliedStatuses.value = ids
  }

  if (state.elementMarks) elementMarks.value = state.elementMarks
  if (state.faintCount !== undefined) faintCount.value = state.faintCount
  if (state.potionCount !== undefined) potionCount.value = state.potionCount

  // triggeringElement: sync animation to all players
  if (state.triggeringElement !== undefined) {
    const el = state.triggeringElement === '_none' ? null : state.triggeringElement
    if (el !== null && el !== triggeringElement.value) {
      triggeringElement.value = el
      if (_elemAnimTimer) clearTimeout(_elemAnimTimer)
      _elemAnimTimer = setTimeout(() => { triggeringElement.value = null }, 1800)
    } else if (el === null) {
      triggeringElement.value = null
    }
  }

  setTimeout(() => { _remoteSyncing = false }, 50)
}, { deep: true })

const adjustHp = (delta) => {
  const max = monsterHuntingData.value?.health ?? 999
  const prev = huntingHp.value
  huntingHp.value = Math.max(0, Math.min(max, huntingHp.value + delta))
  const diff = huntingHp.value - prev
  if (diff < 0) _showDamageIndicator(-diff, 'dmg')
  if (diff > 0) _showDamageIndicator(diff, 'heal')
  _pushHuntState()
}

const _showPartFlash = (position, next, diff) => {
  const data = activeParts.value[position]
  if (!data || diff === 0) return
  const max = data.part_break_threshold ?? 0
  const broken = next >= max && diff > 0
  clearTimeout(_tcPartFlashTimer)
  tcPartFlash.value = {
    position,
    delta: diff,
    current: next,
    max,
    thumbnail: getPartMeta(data.part_id)?.thumbnail ?? null,
    broken,
  }
  _tcPartFlashTimer = setTimeout(() => { tcPartFlash.value = null }, broken ? 2800 : 1800)
}

const adjustPartDamage = (position, delta) => {
  const data = activeParts.value[position]
  if (!data) return
  const max = data.part_break_threshold ?? 0
  const current = partDamage.value[position] ?? 0
  const next = Math.max(0, Math.min(max, current + delta))
  partDamage.value = { ...partDamage.value, [position]: next }
  _pushHuntState()
}

const _applyCurrentHuntState = () => {
  const state = room.huntState
  if (!state) return
  if (state.huntingHp !== undefined) huntingHp.value = state.huntingHp
  if (state.partDamage) partDamage.value = state.partDamage
  if (state.statusMarks) statusMarks.value = state.statusMarks
  if (state.appliedStatuses) {
    appliedStatuses.value = Object.keys(state.appliedStatuses)
      .filter((k) => k !== '_empty')
      .map(Number)
  }
  if (state.elementMarks) elementMarks.value = state.elementMarks
  if (state.faintCount !== undefined) faintCount.value = state.faintCount
  if (state.potionCount !== undefined) potionCount.value = state.potionCount
}

const goToHuntingPanel = () => {
  if (room.inRoom && !room.isHost && room.huntState) {
    _applyCurrentHuntState()
  } else {
    initHuntingData()
    // Host pushes fresh state to Firebase so all guests sync correctly
    _pushHuntState()
  }
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
const rollingDiceIds = ref(new Set())

const isAnyRolling = computed(() => rollingDiceIds.value.size > 0)

const dotPatterns = {
  1: [4],
  2: [2, 6],
  3: [2, 4, 6],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
}

const animateDie = (id, finalValue, duration = 600) => {
  rollingDiceIds.value = new Set([...rollingDiceIds.value, id])
  const interval = setInterval(() => {
    rolledDice.value = rolledDice.value.map((d) =>
      d.id === id ? { ...d, value: Math.ceil(Math.random() * 6) } : d,
    )
  }, 55)
  setTimeout(() => {
    clearInterval(interval)
    rolledDice.value = rolledDice.value.map((d) =>
      d.id === id ? { ...d, value: finalValue } : d,
    )
    rollingDiceIds.value = new Set([...rollingDiceIds.value].filter((x) => x !== id))
  }, duration)
}

const getResourceItem = (resource_type_id, item_id) => {
  const type = resourceData.find((t) => t.resource_type_id === resource_type_id)
  return type?.resources.find((r) => r.item_id === item_id) ?? null
}

// ── Dialog Resources quick-add ────────────────────────────
const dialogResourceCounts = ref({})
const showDialogResources = ref(false)

const _pushDialogCounts = () => {
  if (room.inRoom) room.setMyDialogCounts?.(dialogResourceCounts.value)
}

const addDialogResource = (resource_type_id, item_id) => {
  const key = `${resource_type_id}-${item_id}`
  dialogResourceCounts.value = { ...dialogResourceCounts.value, [key]: (dialogResourceCounts.value[key] ?? 0) + 1 }
  _pushDialogCounts()
}

const removeDialogResource = (resource_type_id, item_id) => {
  const key = `${resource_type_id}-${item_id}`
  const cur = dialogResourceCounts.value[key] ?? 0
  if (cur <= 0) return
  dialogResourceCounts.value = { ...dialogResourceCounts.value, [key]: cur - 1 }
  _pushDialogCounts()
}

// Save dialog resource counts to inventory when dialog phase ends
const _saveDialogCountsToInventory = () => {
  const counts = dialogResourceCounts.value
  if (!Object.keys(counts).length) return
  const hunters = getHunters()
  const h = hunters.find((x) => x.hunter_id === hunter.value?.hunter_id)
  if (!h) return
  if (!h.inventory) h.inventory = []
  Object.entries(counts).forEach(([key, qty]) => {
    if (!qty) return
    const [rtid, iid] = key.split('-').map(Number)
    const existing = h.inventory.find((i) => i.resource_type_id === rtid && i.item_id === iid)
    if (existing) { existing.quantity += qty }
    else { h.inventory.push({ resource_type_id: rtid, item_id: iid, quantity: qty }) }
  })
  saveHunters(hunters)
  loadHunter()
}

// Restore dialog counts from Firebase (reconnect)
watch([() => room.myDialogCounts, () => room.joinSignal], ([counts]) => {
  if (!counts || !room.inRoom) return
  dialogResourceCounts.value = counts
}, { immediate: true })

const isPartBrokenById = (partId) => {
  if (!partId) return false
  return Object.entries(activeParts.value).some(
    ([pos, data]) => data.part_id === partId && brokenParts.value[pos],
  )
}

// รองรับ part_break_reward ที่ระบุ position เพื่อแยกชิ้นส่วนที่มี part_id ซ้ำกัน (เช่น Jyuratodus ครีบซ้าย/ขวา part_id=5)
const isPartBreakRewardActive = (reward) => {
  if (!reward?.part_id) return false
  if (reward.position) {
    const data = activeParts.value[reward.position]
    return !!data && data.part_id === reward.part_id && !!brokenParts.value[reward.position]
  }
  return isPartBrokenById(reward.part_id)
}

const rollAllDice = () => {
  if (isAnyRolling.value) return
  const count = rewardDiceCount.value
  const finalValues = Array.from({ length: count }, () => Math.ceil(Math.random() * 6))
  rolledDice.value = Array.from({ length: count }, (_, i) => ({
    id: i,
    value: Math.ceil(Math.random() * 6),
    spent: false,
  }))
  selectedDiceIds.value = []
  finalValues.forEach((val, i) => {
    setTimeout(() => animateDie(i, val, 650), i * 100)
  })
  // Co-op: push ผลเต๋าไป Firebase หลัง animation จบ
  if (room.inRoom) {
    setTimeout(() => {
      room.pushMyDice(finalValues)
    }, count * 100 + 700)
  }
}

const rerollDie = (id) => {
  if (room.inRoom) return // ไม่อนุญาต reroll ใน co-op
  if (rollingDiceIds.value.has(id)) return
  animateDie(id, Math.ceil(Math.random() * 6), 550)
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
    if (!isPartBreakRewardActive(row.part_break_reward)) return
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
  if (room.inRoom && auto.length) room.pushMyRewards?.(auto)
  rewardPhase.value = 'assign'
  if (room.inRoom) room.syncPhase?.('assign')
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

  // Co-op: push rewards ไป Firebase ให้คนอื่นเห็น
  if (room.inRoom) room.pushMyRewards?.(claimedRewards.value)
}

// Trade functions
const tradePicker = ref(null) // { resource_type_id, item_id, max, qty }
const tradeSearch = ref('')
const filteredInventory = computed(() => {
  const inv = hunter.value?.inventory ?? []
  if (!tradeSearch.value.trim()) return inv
  const q = tradeSearch.value.toLowerCase()
  return inv.filter((r) =>
    getResourceItem(r.resource_type_id, r.item_id)?.item?.toLowerCase().includes(q)
  )
})

const openTradePicker = (r) => {
  tradePicker.value = { resource_type_id: r.resource_type_id, item_id: r.item_id, max: r.quantity, qty: 1 }
}

const confirmOfferTrade = () => {
  const p = tradePicker.value
  if (!p || p.qty <= 0) return
  room.addToTradePool?.({ resource_type_id: p.resource_type_id, item_id: p.item_id, quantity: p.qty })
  // ลด inventory
  const hunters = getHunters()
  const h = hunters.find((x) => x.hunter_id === hunter.value?.hunter_id)
  if (h?.inventory) {
    const inv = h.inventory.find((i) => i.resource_type_id === p.resource_type_id && i.item_id === p.item_id)
    if (inv) {
      inv.quantity -= p.qty
      if (inv.quantity <= 0) h.inventory = h.inventory.filter((i) => !(i.resource_type_id === p.resource_type_id && i.item_id === p.item_id))
      saveHunters(hunters)
      loadHunter()
    }
  }
  tradePicker.value = null
}

const takeFromTrade = (item) => {
  room.removeFromTradePool?.(item.key)
  // เพิ่มลง inventory โดยตรง
  const hunters = getHunters()
  const h = hunters.find((x) => x.hunter_id === hunter.value?.hunter_id)
  if (h) {
    if (!h.inventory) h.inventory = []
    const inv = h.inventory.find((i) => i.resource_type_id === item.resource_type_id && i.item_id === item.item_id)
    if (inv) { inv.quantity += item.quantity }
    else { h.inventory.push({ resource_type_id: item.resource_type_id, item_id: item.item_id, quantity: item.quantity }) }
    saveHunters(hunters)
    loadHunter()
  }
}

const returnFromTrade = (item) => {
  room.removeFromTradePool?.(item.key)
  // คืนลง inventory
  const hunters = getHunters()
  const h = hunters.find((x) => x.hunter_id === hunter.value?.hunter_id)
  if (h) {
    if (!h.inventory) h.inventory = []
    const inv = h.inventory.find((i) => i.resource_type_id === item.resource_type_id && i.item_id === item.item_id)
    if (inv) { inv.quantity += item.quantity }
    else { h.inventory.push({ resource_type_id: item.resource_type_id, item_id: item.item_id, quantity: item.quantity }) }
    saveHunters(hunters)
    loadHunter()
  }
}

const voteCloseTrade = () => room.voteAction('closeTrade')

const _doConfirmRewards = () => {
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
  fadeOutOutcomeSound()
  if (room.inRoom) room.leave()
  onComplete()
}

const _saveRewardsToInventory = () => {
  if (!claimedRewards.value.length) return
  const hunters = getHunters()
  const h = hunters.find((x) => x.hunter_id === hunter.value?.hunter_id)
  if (!h) return
  if (!h.inventory) h.inventory = []
  claimedRewards.value.forEach((r) => {
    const existing = h.inventory.find(
      (i) => i.resource_type_id === r.resource_type_id && i.item_id === r.item_id,
    )
    if (existing) { existing.quantity += r.quantity }
    else { h.inventory.push({ ...r }) }
  })
  saveHunters(hunters)
  loadHunter()
  claimedRewards.value = []
}

const confirmRewards = () => {
  if (room.inRoom) {
    _saveRewardsToInventory()  // บันทึก reward เข้า inventory ก่อนเข้า trade
    room.clearAllPartyRewards?.()
    room.clearTrade?.()
    rewardPhase.value = 'trade'
    room.syncPhase?.('trade')
    return
  }
  _doConfirmRewards()
}

const goToRewardPhase = () => {
  rolledDice.value = []
  selectedDiceIds.value = []
  claimedRewards.value = []
  if (room.inRoom) {
    room.clearAllPartyDice?.()
    room.clearAllPartyRewards?.()
  }
  phase.value = 'reward'
  if (room.inRoom) room.syncPhase?.('reward')
  if (room.inRoom && room.hunterCount >= 2) {
    rewardHunterCount.value = room.hunterCount
    rewardPhase.value = 'diceRoll'
    rollAllDice()
  } else {
    rewardHunterCount.value = 2
    rewardPhase.value = 'hunterSelect'
  }
}

// ─── Quest Pack Drawer ────────────────────────────────────────────────────────
const showPackDrawer = ref(false)
const packDrawerTab = ref('pack')
const packSearch = ref('')
const packSelectedItems = ref([])

const packInventory = computed(() =>
  resourceData
    .map((type) => {
      const items = (hunter.value?.inventory || [])
        .filter((i) => i.resource_type_id === type.resource_type_id)
        .map((inv) => {
          const meta = type.resources.find((r) => r.item_id === inv.item_id)
          return meta ? { ...meta, quantity: inv.quantity, resource_type_id: type.resource_type_id } : null
        })
        .filter(Boolean)
      return { resource_type: type.resource_type, items }
    })
    .filter((g) => g.items.length)
)

const packAvailable = computed(() => {
  const ownedKeys = new Set((hunter.value?.inventory || []).map((i) => `${i.resource_type_id}-${i.item_id}`))
  return resourceData
    .flatMap((type) =>
      type.resources
        .filter((item) => !ownedKeys.has(`${type.resource_type_id}-${item.item_id}`))
        .map((item) => ({ ...item, resource_type_id: type.resource_type_id }))
    )
    .filter((i) => !packSearch.value || i.item.toLowerCase().includes(packSearch.value.toLowerCase()))
})

const packSelectedQty = (item) =>
  packSelectedItems.value.find(
    (s) => s.item_id === item.item_id && s.resource_type_id === item.resource_type_id
  )?.quantity ?? 0

const changePackQty = (item, delta) => {
  const hunters = getHunters()
  const h = hunters.find((x) => x.hunter_id === hunter.value?.hunter_id)
  if (!h) return
  const inv = h.inventory.find(
    (i) => i.resource_type_id === item.resource_type_id && i.item_id === item.item_id
  )
  if (!inv) return
  inv.quantity += delta
  if (inv.quantity <= 0) {
    h.inventory = h.inventory.filter(
      (i) => !(i.resource_type_id === item.resource_type_id && i.item_id === item.item_id)
    )
  }
  saveHunters(hunters)
  loadHunter()
}

const packSelectItem = (item, delta) => {
  const found = packSelectedItems.value.find(
    (s) => s.item_id === item.item_id && s.resource_type_id === item.resource_type_id
  )
  if (!found) {
    if (delta > 0) packSelectedItems.value.push({ ...item, quantity: 1 })
    return
  }
  found.quantity += delta
  if (found.quantity <= 0) {
    packSelectedItems.value = packSelectedItems.value.filter(
      (s) => !(s.item_id === item.item_id && s.resource_type_id === item.resource_type_id)
    )
  }
}

const packConfirmAdd = () => {
  const hunters = getHunters()
  const h = hunters.find((x) => x.hunter_id === hunter.value?.hunter_id)
  if (!h) return
  packSelectedItems.value.forEach((item) => {
    h.inventory.push({
      resource_type_id: item.resource_type_id,
      item_id: item.item_id,
      quantity: item.quantity,
    })
  })
  saveHunters(hunters)
  loadHunter()
  packSelectedItems.value = []
  packSearch.value = ''
  packDrawerTab.value = 'pack'
}

const openPackDrawer = () => {
  packDrawerTab.value = 'pack'
  packSearch.value = ''
  packSelectedItems.value = []
  showPackDrawer.value = true
}
</script>

<template>
  <div class="quest-container">
    <!-- ═══════════ NAV BAR ═══════════ -->
    <div class="nav-bar" v-if="phase !== 'book'">
      <button v-if="['monster', 'quest', 'detail', 'huntingPanel'].includes(phase)" class="btn-back" @click="goBack">
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

      <!-- Join Quest -->
      <div class="join-quest-bar">
        <div v-if="room.inRoom" class="join-quest-inroom">
          <span class="join-quest-icon">⚔</span>
          <span>Co-op Room: <strong>{{ room.roomCode }}</strong></span>
          <span class="join-room-count">{{ room.hunterCount }}/4 Hunters</span>
          <button class="join-leave-btn" @click="room.leave()">ออก</button>
        </div>
        <div v-else-if="!showJoinInput" class="join-quest-entry">
          <!-- Reconnect button ถ้ามี saved room code -->
          <div v-if="room.savedRoomCode" class="reconnect-bar">
            <span class="reconnect-label">🔌 ห้องล่าสุด</span>
            <span class="reconnect-code">{{ room.savedRoomCode }}</span>
            <button
              class="reconnect-btn"
              @click="joinCode = room.savedRoomCode; handleJoinQuest()"
              :disabled="joinLoading"
            >{{ joinLoading ? '...' : 'Reconnect' }}</button>
            <button class="reconnect-clear" @click="room.clearSavedRoom()">✕</button>
          </div>
          <button class="join-quest-btn" @click="showJoinInput = true">
            🚪 Join Quest (Co-op)
          </button>
        </div>
        <div v-else class="join-quest-form">
          <input
            v-model="joinCode"
            class="join-code-input"
            maxlength="6"
            placeholder="Room Code"
            @keyup.enter="handleJoinQuest"
            autofocus
          />
          <button class="join-submit-btn" @click="handleJoinQuest" :disabled="joinLoading || joinCode.length < 6">
            {{ joinLoading ? '...' : 'เข้าร่วม' }}
          </button>
          <button class="join-cancel-btn" @click="showJoinInput = false; joinError = ''">ยกเลิก</button>
        </div>
        <p v-if="joinError" class="join-error">{{ joinError }}</p>
      </div>

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
                    ? getImg('assets/img/ancient_forest.webp')
                    : getImg('assets/img/wildspire_waste.webp')
                "
                :alt="book.name"
              />
            </div>
            <h2 class="book-title-text">{{ book.name }}</h2>
            <div class="book-divider"></div>
            <p class="book-meta">{{ book.data.length }} Monsters Available</p>
            <div class="book-cta">📜 Open Book ▶</div>
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
          :class="{
            cleared: isAssignedComplete(monster.monster_id),
            'monster-wip': !isMonsterEnabled(monster.monster_id)
          }"
          @click="isMonsterEnabled(monster.monster_id) && selectMonster(monster)"
        >
          <div v-if="!isMonsterEnabled(monster.monster_id)" class="monster-wip-overlay">
            <span class="monster-wip-icon">🔨</span>
          </div>
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
            'scroll-cleared':
              quest.quest_id === 1 && isQuestExhausted(quest),
            'scroll-exhausted':
              quest.quest_id !== 1 && isQuestExhausted(quest) &&
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
              v-if="quest.quest_id === 1 && isQuestExhausted(quest)"
              class="exhausted-notice cleared-notice"
            >
              ✓ ผ่านแล้ว
            </div>
            <div
              v-else-if="
                quest.quest_id !== 1 && isQuestExhausted(quest) &&
                isQuestUnlocked(selectedMonster.monster_id, quest.quest_id)
              "
              class="exhausted-notice"
            >
              ⚠ จำนวนการลง Quest ครบแล้ว — ยังลงเล่นได้แต่จะบังคับเข้าช่วง HQ ก่อน (2 กิจกรรมใน HQ) และคุณจะเป็นคนเลือกจุดเริ่มต้น Quest ได้
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
      <div v-if="startingDialog && !isQuestExhausted(selectedQuest)" class="starting-scroll">
        <div class="scroll-tab">Starting Point</div>
        <p class="scroll-flavor-title">{{ startingDialog.title }}</p>
        <p class="scroll-flavor-body">{{ startingDialog.subtitle }}</p>
      </div>
      <div v-else-if="isQuestExhausted(selectedQuest)" class="starting-scroll exhausted-banner">
        <div class="scroll-tab exhausted-tab">⚠ ATTEMPTS EXHAUSTED</div>
        <p class="scroll-flavor-title">จำนวนการลง Quest ครบแล้ว</p>
        <p class="scroll-flavor-body">บังคับเข้า HQ ก่อน (2 Actions) · Host จะเลือก Starting Dialog เองหลัง HQ · ไม่นับ Attempt เพิ่ม</p>
      </div>

      <div class="embark-mode-row">
        <button class="btn-embark btn-coop" @click="showCoopModeSelect = true">
          <img :src="getImg('assets/img/menu_topbar_icon/quest.png')" class="embark-icon" />
          Post Quest
        </button>
      </div>

    </div>

    <CoopLobbyModal :show="showCoopLobby" @start="onCoopStart" @leave="onCoopLeave" />

    <!-- ═══════════ HQ VOTE PHASE ═══════════ -->
    <div v-if="phase === 'hqVote'" class="phase-hq-vote">
      <div class="hqv-header">
        <div class="hqv-line"></div>
        <span class="hqv-title">แวะ Head Quarter ก่อนลุยไหม?</span>
        <div class="hqv-line"></div>
      </div>

      <div class="hqv-monster-row">
        <img :src="getImg(selectedMonster?.thumbnail)" class="hqv-monster-img" />
        <div>
          <p class="hqv-target-label">Target</p>
          <p class="hqv-monster-name">{{ selectedMonster?.monster_name }}</p>
        </div>
      </div>

      <div v-if="!myHqVote" class="hqv-choices">
        <button class="hqv-btn hqv-btn-hq" @click="pendingHqVote = 'hq'">
          <img :src="getImg('assets/img/menu_topbar_icon/head_querter.png')" class="hqv-btn-icon hqv-hq-icon" />
          <span class="hqv-btn-label">แวะ HQ ก่อน</span>
          <span class="hqv-btn-sub">เพิ่มวัน · ทำ 3 กิจกรรม</span>
        </button>
        <button class="hqv-btn hqv-btn-quest" @click="pendingHqVote = 'quest'">
          <img :src="getImg('assets/img/menu_topbar_icon/quest.png')" class="hqv-btn-icon hqv-quest-icon" />
          <span class="hqv-btn-label">ลุย Quest เลย</span>
          <span class="hqv-btn-sub">ข้าม HQ ไปเริ่มล่าเลย</span>
        </button>
      </div>

      <!-- Vote Confirm Modal -->
      <Teleport to="body">
        <Transition name="slain-fade">
          <div v-if="pendingHqVote" class="hqvc-overlay" @click.self="cancelHqVote">
            <div class="hqvc-modal">
              <p class="hqvc-title">ยืนยันการโหวต</p>
              <div class="hqvc-choice" :class="pendingHqVote === 'hq' ? 'hqvc-hq' : 'hqvc-quest'">
                <img
                  v-if="pendingHqVote === 'hq'"
                  :src="getImg('assets/img/menu_topbar_icon/head_querter.png')"
                  class="hqvc-icon hqvc-icon-white"
                />
                <img
                  v-else
                  :src="getImg('assets/img/menu_topbar_icon/quest.png')"
                  class="hqvc-icon"
                />
                <span class="hqvc-label">{{ pendingHqVote === 'hq' ? 'แวะ HQ ก่อน' : 'ลุย Quest เลย' }}</span>
              </div>
              <div class="hqvc-btns">
                <button class="hqvc-btn-confirm" @click="confirmHqVote">✓ ยืนยัน</button>
                <button class="hqvc-btn-cancel" @click="cancelHqVote">← ยกเลิก</button>
              </div>
            </div>
          </div>
        </Transition>
      </Teleport>

      <div v-if="myHqVote" class="hqv-waiting">
        <p class="hqv-voted-label">คุณโหวต: <strong>{{ myHqVote === 'hq' ? '🏰 แวะ HQ' : '⚔ ลุย Quest' }}</strong></p>
        <p v-if="room.inRoom" class="hqv-waiting-sub">รอผลโหวตจากทีม...</p>
      </div>

      <!-- Party vote status -->
      <div v-if="room.inRoom" class="hqv-party-votes">
        <div v-for="h in room.hunters" :key="h.hunter_id" class="hqv-vote-row">
          <span class="hqv-hunter-name">{{ h.hunter_name }}</span>
          <span v-if="room.hqVotes[h.hunter_id] === 'hq'" class="hqv-vote-pill hqv-vote-hq">🏰 HQ</span>
          <span v-else-if="room.hqVotes[h.hunter_id] === 'quest'" class="hqv-vote-pill hqv-vote-quest">⚔ Quest</span>
          <span v-else class="hqv-vote-pill hqv-vote-pending">รอ...</span>
        </div>
      </div>

      <!-- Tiebreak -->
      <div v-if="room.inRoom && room.hqVoteTied" class="hqv-tiebreak">
        <p class="hqv-tie-label">⚖ คะแนนเท่ากัน!</p>
        <template v-if="room.isHost">
          <p class="hqv-tie-sub">Host ตัดสินใจเลือก</p>
          <div class="hqv-choices">
            <button class="hqv-btn hqv-btn-hq" @click="breakHqTie('hq')">
              <img :src="getImg('assets/img/menu_topbar_icon/head_querter.png')" class="hqv-btn-icon hqv-hq-icon" />
              <span class="hqv-btn-label">แวะ HQ ก่อน</span>
            </button>
            <button class="hqv-btn hqv-btn-quest" @click="breakHqTie('quest')">
              <span class="hqv-btn-icon">⚔</span>
              <span class="hqv-btn-label">ลุย Quest เลย</span>
            </button>
          </div>
        </template>
        <p v-else class="hqv-tie-sub">รอ Host ตัดสิน...</p>
      </div>
    </div>

    <!-- ═══════════ HQ PHASE ═══════════ -->
    <div v-if="phase === 'hq'" class="phase-hq">
      <HQPhase :maxActions="hqMaxActions" @allReady="onHQAllReady" />
    </div>

    <!-- ═══════════ HANDLER START — HOST PICKS DIALOG ═══════════ -->
    <div v-if="phase === 'handlerStart'" class="phase-hq-vote">
      <div class="hqv-header">
        <div class="hqv-line"></div>
        <span class="hqv-title">เลือก Starting Dialog</span>
        <div class="hqv-line"></div>
      </div>

      <div class="hqv-monster-row">
        <img :src="getImg(selectedMonster?.thumbnail)" class="hqv-monster-img" />
        <div>
          <p class="hqv-target-label">Target</p>
          <p class="hqv-monster-name">{{ selectedMonster?.monster_name }}</p>
        </div>
      </div>

      <template v-if="!room.inRoom || room.isHost">
        <p class="hs-pick-label">เลือก Route ที่จะเริ่ม Quest</p>
        <div class="hs-dialog-list">
          <div
            v-for="(dialogId, idx) in selectedQuest?.starting_point"
            :key="dialogId"
            class="hs-dialog-card"
            @click="confirmHandlerStart(dialogId)"
          >
            <div class="hs-dialog-index">Route {{ idx + 1 }}</div>
            <div class="hs-dialog-title">{{ getDialog(dialogId)?.title ?? `Dialog #${dialogId}` }}</div>
            <div v-if="getDialog(dialogId)?.subtitle" class="hs-dialog-sub">{{ getDialog(dialogId).subtitle }}</div>
          </div>
        </div>
      </template>

      <div v-else class="hqv-waiting">
        <p class="hqv-voted-label">⏳ รอ Host เลือก Starting Point...</p>
      </div>
    </div>

    <!-- ═══════════ CO-OP QUEST MODE MODAL ═══════════ -->
    <Teleport to="body">
      <Transition name="slain-fade">
        <div v-if="showCoopModeSelect" class="cqm-overlay" @click.self="showCoopModeSelect = false; questMode = 'full'">
          <div class="cqm-modal">
            <p class="cqm-title">เลือก Quest Mode</p>
            <div class="qmode-options">
              <button class="qmode-btn" :class="{ 'qmode-active': questMode === 'full' }" @click="questMode = 'full'">
                <span class="qmode-icon">⚔</span>
                <span class="qmode-name">Full</span>
                <span class="qmode-desc">Time Card · Track Token · Behavior Deck · Hunter Turn</span>
              </button>
              <button class="qmode-btn" :class="{ 'qmode-active': questMode === 'minimal' }" @click="questMode = 'minimal'">
                <span class="qmode-icon">🗡</span>
                <span class="qmode-name">Minimal</span>
                <span class="qmode-desc">HP · Part Damage · Status · Element เท่านั้น</span>
              </button>
            </div>
            <div class="cqm-actions">
              <button class="coop-mode-cancel" @click="showCoopModeSelect = false; questMode = 'full'">ยกเลิก</button>
              <button class="coop-mode-confirm" @click="showCoopModeSelect = false; startCoopQuest()">สร้าง Lobby</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- ═══════════ DIALOG PHASE ═══════════ -->
    <div v-if="phase === 'dialog' && currentDialog" class="phase-dialog">
      <div class="dialog-tag-row">
        <img :src="getImg(selectedMonster.thumbnail)" class="dialog-tag-img" />
        <div>
          <span class="dialog-tag-monster">{{ selectedMonster.monster_name }}</span>
          <span class="dialog-tag-quest">{{ selectedQuest.quest_type }}</span>
        </div>
        <!-- Potion tracker (compact) -->
        <div class="dialog-potion-tracker">
          <div
            v-for="i in 3"
            :key="i"
            class="dialog-potion-slot"
            :class="{ 'potion-empty': i > potionCount }"
            :style="room.inRoom && !room.isHost ? { pointerEvents: 'none', cursor: 'default' } : {}"
            @click="togglePotion(i)"
            title="คลิกเพื่อใช้ / เพิ่ม Potion"
          >
            <img :src="getImg('assets/img/UI/potion_icon.png')" class="dialog-potion-img" />
            <span v-if="i > potionCount" class="dialog-potion-x">✕</span>
          </div>
        </div>
        <button class="pack-toggle-btn" @click="openPackDrawer">🎒 Inventory</button>
      </div>

      <!-- Dialog Resource Quick-Add -->
      <div v-if="selectedQuest.dialog_resources?.length" class="dr-panel">
        <button class="dr-toggle" @click="showDialogResources = !showDialogResources">
          <span>📦 Resources ที่อาจได้ระหว่าง Dialog</span>
          <span class="dr-toggle-arrow">{{ showDialogResources ? '▲' : '▼' }}</span>
        </button>
        <transition name="dr-slide">
          <div v-if="showDialogResources" class="dr-grid">
            <div
              v-for="r in selectedQuest.dialog_resources"
              :key="`${r.resource_type_id}-${r.item_id}`"
              class="dr-item"
            >
              <img
                :src="getImg(getResourceItem(r.resource_type_id, r.item_id)?.thumbnail)"
                class="dr-item-img"
              />
              <span class="dr-item-name">{{ getResourceItem(r.resource_type_id, r.item_id)?.item }}</span>
              <div class="dr-item-right">
                <button
                  v-if="dialogResourceCounts[`${r.resource_type_id}-${r.item_id}`]"
                  class="dr-add-btn dr-sub-btn"
                  @click="removeDialogResource(r.resource_type_id, r.item_id)"
                >−</button>
                <span
                  v-if="dialogResourceCounts[`${r.resource_type_id}-${r.item_id}`]"
                  class="dr-count"
                >{{ dialogResourceCounts[`${r.resource_type_id}-${r.item_id}`] }}</span>
                <button class="dr-add-btn" @click="addDialogResource(r.resource_type_id, r.item_id)">+</button>
                <button
                  class="dr-add-btn dr-craft-btn"
                  @click="openCraftLookup(r.resource_type_id, r.item_id, getResourceItem(r.resource_type_id, r.item_id)?.item)"
                  title="ดูสูตรคราฟ"
                >🔨</button>
              </div>
            </div>
          </div>
        </transition>
      </div>

      <!-- Track Token Panel -->
      <div v-if="questMode !== 'minimal'" class="tt-panel">
        <div class="tt-header">
          <span class="tt-label">🔍 Track Token</span>
          <span class="tt-pool">Pool: {{ trackTokenPool.length }}</span>
          <div class="tt-actions">
            <button v-if="!room.inRoom || room.isHost" class="tt-btn tt-btn-add" @click="addTrackToken" title="รับ Token">+ รับ</button>
          </div>
        </div>
        <div v-if="trackTokens.length" class="tt-tokens">
          <div
            v-for="token in trackTokens"
            :key="token.id"
            class="tt-token"
            :class="{ revealed: token.revealed }"
            @click="(!room.inRoom || room.isHost) && (selectedToken = token)"
            title="คลิกเพื่อดูตัวเลือก"
          >
            <div class="tt-token-face">
              <span v-if="token.revealed" class="tt-value" :class="token.value > 0 ? 'val-pos' : token.value < 0 ? 'val-neg' : 'val-zero'">
                {{ token.value > 0 ? '+' : '' }}{{ token.value }}
              </span>
              <span v-else class="tt-hidden">?</span>
            </div>
          </div>
        </div>

        <!-- Token Action Modal -->
        <Teleport to="body">
          <Transition name="slain-fade">
            <div v-if="selectedToken" class="tt-modal-overlay" @click.self="selectedToken = null">
              <div class="tt-modal">
                <p class="tt-modal-title">Track Token</p>
                <div class="tt-modal-token">
                  <span v-if="selectedToken.revealed" class="tt-value tt-modal-val"
                    :class="selectedToken.value > 0 ? 'val-pos' : selectedToken.value < 0 ? 'val-neg' : 'val-zero'">
                    {{ selectedToken.value > 0 ? '+' : '' }}{{ selectedToken.value }}
                  </span>
                  <span v-else class="tt-hidden tt-modal-val">?</span>
                </div>
                <div class="tt-modal-btns">
                  <button
                    v-if="!selectedToken.revealed"
                    class="tt-modal-btn tt-modal-reveal"
                    @click="revealTrackToken(selectedToken.id); selectedToken = null"
                  >🔍 เปิดเผย</button>
                  <button
                    class="tt-modal-btn tt-modal-discard"
                    @click="discardTrackToken(selectedToken.id); selectedToken = null"
                  >🗑 ทิ้ง</button>
                  <button class="tt-modal-btn tt-modal-cancel" @click="selectedToken = null">ยกเลิก</button>
                </div>
              </div>
            </div>
          </Transition>
        </Teleport>
        <p v-if="!trackTokens.length" class="tt-empty">ยังไม่มี Track Token</p>
      </div>

      <!-- Time Card Panel -->
      <div v-if="questMode === 'full'" class="tc-panel">
        <div class="tc-header">
          <span class="tc-label">⏳ Time Cards</span>
          <div class="tc-deck-display">
            <div class="tc-deck-stack" :class="{ empty: !timeCardDeck.length }">
              <img :src="getImg(timeCardData.back_time_card_img)" class="tc-back-img" />
              <span class="tc-count-badge">{{ timeCardDeck.length }}</span>
            </div>
            <span class="tc-discard-label">ทิ้งแล้ว: {{ timeCardDiscard.length }}</span>
          </div>
          <div class="tc-actions">
            <button
              v-if="!room.inRoom || room.isHost"
              class="tc-btn tc-btn-discard"
              :disabled="!timeCardDeck.length"
              @click="discardTimeCard"
              title="ทิ้ง Time Card 1 ใบ"
            >🗑 ทิ้ง</button>
            <button
              v-if="!room.inRoom || room.isHost"
              class="tc-btn tc-btn-manage"
              @click="showTimeCardManage = true"
              title="จัดการ Deck"
            >⚙ Deck</button>
          </div>
        </div>
        <!-- Last discarded preview -->
        <div v-if="timeCardDiscard.length" class="tc-last-discard">
          <span class="tc-discard-label-sm">ล่าสุด:</span>
          <img :src="getImg(timeCardDiscard[0].card_img)" class="tc-discard-preview" />
          <span class="tc-discard-name">{{ timeCardDiscard[0].card_name }}</span>
        </div>
      </div>

      <!-- Time Card Manage Modal (Host only) -->
      <Teleport to="body">
        <Transition name="slain-fade">
          <div v-if="showTimeCardManage" class="tc-modal-overlay" @click.self="showTimeCardManage = false">
            <div class="tc-modal">
              <p class="tc-modal-title">⚙ จัดการ Time Card Deck</p>
              <p class="tc-modal-sub">Deck ปัจจุบัน: <strong>{{ timeCardDeck.length }}</strong> ใบ</p>
              <p class="tc-modal-section">เลือก Red Time Card เพื่อเพิ่มเข้า Deck</p>
              <div class="tc-red-grid">
                <div
                  v-for="card in timeCardData.red_time_cards"
                  :key="card.time_card_id"
                  class="tc-red-card"
                  :class="{ selected: redCardCounts[card.time_card_id] }"
                  @click="redCardCounts = redCardCounts[card.time_card_id] ? {} : { [card.time_card_id]: 1 }"
                >
                  <div class="tc-red-check">✓</div>
                  <img :src="getImg(card.card_img)" class="tc-red-img" />
                  <span class="tc-red-name">{{ card.card_name }}</span>
                </div>
              </div>
              <div class="tc-modal-btns">
                <button class="tc-modal-btn tc-modal-add" @click="addRedCardsAndShuffle">
                  🔀 เพิ่มและสับ Deck
                </button>
                <button class="tc-modal-btn tc-modal-cancel" @click="showTimeCardManage = false">ยกเลิก</button>
              </div>
            </div>
          </div>
        </Transition>
      </Teleport>

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
        <p class="choices-label">
          {{ room.inRoom ? '— Vote Your Action —' : '— Choose Your Action —' }}
        </p>
        <button
          v-for="action in currentDialog.actions"
          :key="action.action_id"
          class="choice-btn"
          :class="{ 'voted-me': room.inRoom && room.myVote == action.action_id }"
          @click="doAction(action)"
        >
          <div class="choice-header">
            <span class="choice-num">{{ action.action_id }}</span>
            <span class="choice-title">{{ action.title }}</span>
            <!-- Vote count badge (co-op only) -->
            <span
              v-if="room.inRoom && (room.votesByAction[action.action_id] ?? 0) > 0"
              class="vote-badge"
            >
              {{ room.votesByAction[action.action_id] }} vote
            </span>
          </div>
          <!-- Voters list -->
          <div v-if="room.inRoom && room.votersByAction[action.action_id]?.length" class="vote-voters">
            <span
              v-for="name in room.votersByAction[action.action_id]"
              :key="name"
              class="vote-voter-chip"
            >{{ name }}</span>
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

    <!-- ═══════════ ACTION CONFIRM DRAWER ═══════════ -->
    <teleport to="body">
      <transition name="drawer-slide">
        <!-- Tie-breaking drawer: Host picks from tied actions -->
        <div v-if="isTied" class="action-drawer">
          <div class="action-drawer-handle"></div>
          <div class="ad-header">
            <span class="ad-stamp ad-stamp-tie">⚖ Vote เสมอ — Host ตัดสิน</span>
          </div>
          <div v-if="room.isHost" class="ad-tied-choices">
            <button
              v-for="action in tiedActions"
              :key="action.action_id"
              class="ad-tied-btn"
              @click="hostPickTied(action)"
            >
              <span class="ad-num">{{ action.action_id }}</span>
              <span class="ad-title">{{ action.title }}</span>
            </button>
          </div>
          <p v-else class="ad-tie-msg">รอ Host เลือก...</p>
          <div class="ad-buttons">
            <button class="ad-btn-cancel" @click="cancelAction">← โหวตใหม่</button>
          </div>
        </div>

        <!-- Normal confirm drawer -->
        <div v-else-if="pendingAction" class="action-drawer">
          <div class="action-drawer-handle"></div>

          <div class="ad-header">
            <span class="ad-stamp">CHOSEN ACTION</span>
            <div class="ad-title-row">
              <span class="ad-num">{{ pendingAction.action_id }}</span>
              <span class="ad-title">{{ pendingAction.title }}</span>
            </div>
          </div>

          <div v-if="pendingAction.consequences" class="ad-consequences">
            <span class="ad-con-label">⚠ Effect</span>
            <p class="ad-con-text">{{ pendingAction.consequences }}</p>
          </div>

          <!-- Proceed votes (co-op) -->
          <div v-if="room.inRoom" class="ad-proceed-votes">
            <span
              v-for="h in room.hunters"
              :key="h.hunter_id"
              class="ad-proceed-chip"
              :class="{ voted: (room.proceedVotes ?? {})[h.hunter_id] }"
            >
              {{ h.hunter_name.split(' ')[0] }}
              <span>{{ (room.proceedVotes ?? {})[h.hunter_id] ? ' ✓' : ' …' }}</span>
            </span>
          </div>

          <div class="ad-buttons">
            <button
              class="ad-btn-confirm"
              :class="{ 'ad-voted': room.inRoom && room.myProceedVoted }"
              @click="confirmAction"
              :disabled="room.inRoom && room.myProceedVoted"
            >
              {{ room.inRoom && room.myProceedVoted ? '✓ Ready!' : '✦ Proceed' }}
            </button>
            <button class="ad-btn-cancel" @click="cancelAction">← Go Back</button>
          </div>
        </div>
      </transition>
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

      <!-- TRACK TOKEN TOTAL -->
      <div v-if="questMode !== 'minimal' && trackTokens.length" class="token-total-bar">
        <span class="token-total-label">🔍 Track Token รวม</span>
        <div class="token-total-tokens">
          <div
            v-for="token in trackTokens"
            :key="token.id"
            class="token-total-chip"
            :class="token.revealed ? (token.value > 0 ? 'chip-pos' : token.value < 0 ? 'chip-neg' : 'chip-zero') : 'chip-hidden'"
          >
            <span v-if="token.revealed">{{ token.value > 0 ? '+' : '' }}{{ token.value }}</span>
            <span v-else>?</span>
          </div>
        </div>
        <div class="token-total-sum">
          <span class="token-total-sum-label">= </span>
          <span
            class="token-total-sum-val"
            :class="trackTokens.filter(t=>t.revealed).reduce((s,t)=>s+t.value,0) > 0 ? 'val-pos' : trackTokens.filter(t=>t.revealed).reduce((s,t)=>s+t.value,0) < 0 ? 'val-neg' : 'val-zero'"
          >
            {{ trackTokens.filter(t=>t.revealed).reduce((s,t)=>s+(t.value??0),0) > 0 ? '+' : '' }}{{ trackTokens.filter(t=>t.revealed).reduce((s,t)=>s+(t.value??0),0) }}
            <span class="token-total-hidden" v-if="trackTokens.some(t=>!t.revealed)"> + ?×{{ trackTokens.filter(t=>!t.revealed).length }}</span>
          </span>
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
        <img :src="getImg(monsterHuntingData.map_image)" class="hpanel-map-img" />
      </div>

      <!-- Monster Turn (after map) -->
      <div v-if="questMode === 'full' && (behaviorDeck.length > 0 || currentBehaviorCard)" class="monster-turn-section">
        <p class="hunt-result-label">— Monster Turn —</p>

        <div class="mt-cards">
          <!-- Current card (front) -->
          <div class="mt-card-wrap">
            <p class="mt-card-label">การโจมตีปัจจุบัน</p>
            <div class="mt-card">
              <img v-if="currentBehaviorCard" :src="getImg(currentBehaviorCard.front_card_img)" class="mt-card-img" />
              <div v-else class="mt-card-empty">—</div>
            </div>
            <p v-if="currentBehaviorCard" class="mt-card-name">{{ currentBehaviorCard.behavior_name }}</p>
          </div>

          <!-- Next card (back) -->
          <div class="mt-card-wrap">
            <p class="mt-card-label" :class="{ 'misread-label': misreadActive }">
              {{ misreadActive ? '🃏 จะถูกทิ้ง!' : 'การ์ดถัดไป' }}
            </p>
            <div class="mt-card mt-card-back" :class="{ 'misread-card': misreadActive }">
              <img v-if="behaviorDeck.length" :src="getImg(behaviorDeck[0].back_card_img)" class="mt-card-img" />
              <div v-else class="mt-card-empty">หมด</div>
              <div v-if="misreadActive && behaviorDeck.length" class="misread-overlay">✕</div>
            </div>
            <p class="mt-card-name">เหลือ {{ behaviorDeck.length }} ใบ / ทิ้ง {{ behaviorDiscard.length }} ใบ</p>
          </div>
        </div>

        <!-- Rampage Warning -->
        <div v-if="rampageActive" class="rampage-banner">
          🔴 <strong>RAMPAGE!</strong> Monster Turn ถัดไป Hunter จะเล่นได้ 0 ครั้ง
        </div>

        <!-- Active Status Effects on Monster -->
        <div v-if="appliedStatuses.length > 0" class="status-badge-row">
          <div
            v-for="sid in appliedStatuses"
            :key="sid"
            class="status-badge"
            :class="`status-badge-${sid}`"
          >
            <img :src="getImg(getStatusEffect(sid)?.thumbnail)" class="status-badge-icon" />
            <div class="status-badge-info">
              <span class="status-badge-name">{{ getStatusEffect(sid)?.effect_name }}</span>
              <span class="status-badge-effect">{{ getStatusEffect(sid)?.monster_suffer }}</span>
            </div>
          </div>
        </div>

        <!-- Recovery Pending -->
        <div v-if="recoveryPending" class="recovery-banner">
          💚 <strong>RECOVERY</strong> — ถ้าไม่มีความเสียหายใน Turn ถัดไป Monster จะฟื้น +5 HP เพิ่ม
        </div>

        <!-- Misread Warning -->
        <div v-if="misreadActive" class="misread-banner">
          🃏 <strong>MISREAD!</strong> Monster Turn ถัดไป การ์ดบนสุดของ Behaviour Deck จะถูกทิ้งก่อน Draw
        </div>

        <!-- Activation Tracker -->
        <div v-if="activationLimit > 0" class="act-tracker">
          <div class="act-pips">
            <span
              v-for="i in activationLimit"
              :key="i"
              class="act-pip"
              :class="{ 'pip-done': i <= activationRoundsCompleted }"
            ></span>
          </div>
          <p class="act-status">
            <span v-if="!monsterTurnReady" class="act-waiting">
              Hunter เล่นได้อีก <strong>{{ activationLimit - activationRoundsCompleted }}</strong> รอบ
            </span>
            <span v-else class="act-ready-text">✓ Monster Turn พร้อมแล้ว!</span>
          </p>
        </div>

        <!-- Add Hunter Turn button (Host only) -->
        <button
          v-if="(room.isHost || !room.inRoom) && currentBehaviorCard && !monsterTurnReady"
          class="add-hunter-turn-btn"
          @click="showAddHunterTurnConfirm = true"
        >
          +1 เทิร์น Hunter กรณีมี Effect เพิ่ม Hunter Turn ในการ์ดปัจจุบัน
        </button>

        <!-- Monster Turn button (Host only) -->
        <button
          v-if="room.isHost || !room.inRoom"
          class="mt-draw-btn"
          :class="{ 'mt-btn-ready': monsterTurnReady }"
          :disabled="behaviorDeck.length === 0 || !monsterTurnReady"
          @click="pendingActivationAdjust = 0; showMonsterTurnConfirm = true"
        >
          ⚔ Monster Turn
        </button>
        <p v-else class="mt-guest-hint">
          <template v-if="!monsterTurnReady">
            Hunter เล่นได้อีก {{ activationLimit - activationRoundsCompleted }} รอบ
          </template>
          <template v-else>รอ Host จั๋วการ์ด Monster</template>
        </p>

        <!-- Deck management (Host only) -->
        <div v-if="room.isHost || !room.inRoom" class="mt-management">
          <button class="mt-mgmt-btn" @click="discardTopBehaviorCard" :disabled="behaviorDeck.length === 0">
            🗑 ทิ้งใบบนสุด
          </button>
          <button class="mt-mgmt-btn" @click="reshuffleDiscardIntoDeck" :disabled="behaviorDiscard.length === 0">
            🔀 สับกองทิ้งเข้า Deck
          </button>
          <button class="mt-mgmt-btn" @click="showDeckManager = true">
            📋 จัดการ Deck
          </button>
        </div>

      </div>

      <!-- Deck Manager Modal (Teleport) -->
      <Teleport to="body">
        <Transition name="slain-fade">
          <div v-if="showDeckManager" class="dm-overlay" @click.self="showDeckManager = false">
            <div class="dm-modal">
              <div class="dm-header">
                <span class="dm-title">📋 จัดการ Deck</span>
                <button class="dm-close" @click="showDeckManager = false">✕</button>
              </div>
              <div class="dm-tabs">
                <button :class="['dm-tab', { active: deckManagerTab === 'deck' }]" @click="deckManagerTab = 'deck'">Deck ({{ behaviorDeck.length }})</button>
                <button :class="['dm-tab', { active: deckManagerTab === 'discard' }]" @click="deckManagerTab = 'discard'">ทิ้งแล้ว ({{ behaviorDiscard.length }})</button>
                <button :class="['dm-tab', { active: deckManagerTab === 'banished' }]" @click="deckManagerTab = 'banished'">นอกเกม ({{ behaviorBanished.length }})</button>
                <button :class="['dm-tab', { active: deckManagerTab === 'special' }]" @click="deckManagerTab = 'special'">Special</button>
              </div>
              <div class="dm-list">
                <div v-if="deckManagerTab === 'deck'">
                  <div v-if="!behaviorDeck.length" class="dm-empty">ไม่มีการ์ดใน Deck</div>
                  <div v-for="card in behaviorDeck" :key="card.behavior_id" class="dm-card-row">
                    <img :src="getImg(card.front_card_img)" class="dm-card-thumb dm-card-zoomable" @click="zoomCardImg = getImg(card.front_card_img); showCardZoom = true" />
                    <span class="dm-card-name">{{ card.behavior_name }}</span>
                    <button class="dm-btn dm-btn-banish" @click="banishCard(card)">นำออกจากเกม</button>
                  </div>
                </div>
                <div v-if="deckManagerTab === 'discard'">
                  <div v-if="!behaviorDiscard.length" class="dm-empty">ไม่มีการ์ดในกองทิ้ง</div>
                  <div v-for="card in behaviorDiscard" :key="card.behavior_id" class="dm-card-row">
                    <img :src="getImg(card.front_card_img)" class="dm-card-thumb dm-card-zoomable" @click="zoomCardImg = getImg(card.front_card_img); showCardZoom = true" />
                    <span class="dm-card-name">{{ card.behavior_name }}</span>
                    <button class="dm-btn dm-btn-banish" @click="banishCard(card)">นำออกจากเกม</button>
                  </div>
                </div>
                <div v-if="deckManagerTab === 'banished'">
                  <div v-if="!behaviorBanished.length" class="dm-empty">ไม่มีการ์ดนอกเกม</div>
                  <div v-for="card in behaviorBanished" :key="card.behavior_id" class="dm-card-row">
                    <img :src="getImg(card.front_card_img)" class="dm-card-thumb dm-card-banished dm-card-zoomable" @click="zoomCardImg = getImg(card.front_card_img); showCardZoom = true" />
                    <span class="dm-card-name dm-card-name-banished">{{ card.behavior_name }}</span>
                    <button class="dm-btn dm-btn-restore" @click="restoreCard(card)">คืนเข้า Deck</button>
                  </div>
                </div>
                <div v-if="deckManagerTab === 'special'">
                  <button class="dm-random-special-btn" @click="randomizeSpecialCard">
                    🎲 สุ่ม Special Card + สับกองทิ้งเข้า Deck
                  </button>
                  <div v-for="card in allSpecialCards" :key="card.behavior_id" class="dm-card-row">
                    <img :src="getImg(card.front_card_img)" class="dm-card-thumb dm-card-zoomable" :class="{ 'dm-card-banished': !isCardInGame(card) }" @click="zoomCardImg = getImg(card.front_card_img); showCardZoom = true" />
                    <span class="dm-card-name">{{ card.behavior_name }}</span>
                    <button v-if="isCardInGame(card)" class="dm-btn dm-btn-banish" @click="banishCard(card)">นำออก</button>
                    <button v-else class="dm-btn dm-btn-restore" @click="addSpecialCardToDeck(card)">เพิ่มเข้า Deck</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Transition>
      </Teleport>

      <!-- Card Zoom Modal -->
      <Teleport to="body">
        <Transition name="slain-fade">
          <div v-if="showCardZoom" class="cz-overlay" @click="showCardZoom = false">
            <img :src="zoomCardImg" class="cz-img" @click.stop />
          </div>
        </Transition>
      </Teleport>

      <!-- Info + Parts Row -->
      <div class="info-parts-row">
        <!-- Left column: monster status canvas + resist + special rule -->
        <div class="info-left-col">
          <!-- ── Monster Status Canvas ── -->
          <div class="msc-wrap">
            <!-- Monster portrait -->
            <div class="msc-portrait" :class="{ 'portrait-slain': manualOutcomeCheck === 'complete' }">
              <img
                :src="getImg(selectedMonster.thumbnail)"
                class="msc-monster-img"
                :class="{ 'monster-img-slain': manualOutcomeCheck === 'complete', 'monster-img-shake': isShaking }"
              />

              <!-- Damage / Heal indicators -->
              <div
                v-for="d in damageIndicators"
                :key="d.id"
                class="dmg-indicator"
                :class="d.type === 'heal' ? 'dmg-heal' : 'dmg-damage'"
                :style="{ left: d.x + '%' }"
              >{{ d.type === 'heal' ? '+' : '-' }}{{ d.value }}</div>

              <!-- Slain overlay -->
              <transition name="slain-fade">
                <div v-if="manualOutcomeCheck === 'complete'" class="msc-slain-overlay">
                  <div class="msc-slain-content">
                    <span class="msc-slain-skull">💀</span>
                    <span class="msc-slain-text">SLAIN</span>
                  </div>
                </div>
              </transition>

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
                  class="resist-item"
                  :class="{
                    'resist-item-active': !sr.immune && sr.level > 0,
                    'resist-item-applied': appliedStatuses.includes(sr.status_id),
                  }"
                  @click="markStatus(sr.status_id)"
                >
                  <div class="resist-icon-wrap">
                    <img
                      v-if="getStatusEffect(sr.status_id)"
                      :src="getImg(getStatusEffect(sr.status_id).thumbnail)"
                      class="resist-icon"
                    />
                    <span v-if="sr.immune" class="resist-immune-x">✕</span>
                    <span v-if="appliedStatuses.includes(sr.status_id)" class="resist-applied-dot"
                      >✓</span
                    >
                  </div>
                  <div class="resist-marks" v-if="!sr.immune && sr.level > 0">
                    <span
                      v-for="i in sr.level"
                      :key="i"
                      class="resist-mark resist-mark-status"
                      :class="{ 'mark-filled': i <= (statusMarks[sr.status_id] ?? 0) }"
                    ></span>
                  </div>
                  <div v-else class="resist-marks">
                    <span class="resist-mark mark-immune"></span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Active Status Effects -->
          <transition-group name="status-pop" tag="div" class="hpanel-active-statuses">
            <div
              v-for="sid in appliedStatuses"
              :key="sid"
              class="hpanel-status-suffer"
            >
              <img
                v-if="getStatusEffect(sid)"
                :src="getImg(getStatusEffect(sid).thumbnail)"
                class="hpanel-suffer-icon"
              />
              <div class="hpanel-suffer-text">
                <span class="hpanel-suffer-name">{{ getStatusEffect(sid)?.effect_name }}</span>
                <span class="hpanel-suffer-desc">{{ getStatusEffect(sid)?.monster_suffer }}</span>
              </div>
            </div>
          </transition-group>

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
        <div class="hpanel-section-header" :class="{ 'hp-header-dead': manualOutcomeCheck === 'complete' }">
          <span class="hpanel-section-icon">{{ manualOutcomeCheck === 'complete' ? '💀' : '♥' }}</span>
          <span class="hpanel-section-label">Monster HP</span>
          <span class="hpanel-hp-nums" :class="{ 'hp-nums-dead': manualOutcomeCheck === 'complete' }">
            {{ manualOutcomeCheck === 'complete' ? 'SLAIN' : `${huntingHp} / ${monsterHuntingData.health}` }}
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
                    <div class="armor-element-card" :class="{ 'armor-blastblight': blastblightActive && partData.armor > 0 }">
                      <img :src="getImg('assets/img/bonus_armor.png')" class="armor-base" />
                      <span class="element-value">{{ blastblightActive ? Math.max(0, partData.armor - 1) : partData.armor }}</span>
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
                      <template
                        v-for="connPos in (partData.connect_part_position ?? [])"
                        :key="connPos"
                      >
                        <circle
                          v-if="posDotCoords[connPos]"
                          :cx="posDotCoords[connPos].x"
                          :cy="posDotCoords[connPos].y"
                          r="12"
                          :fill="
                            brokenParts[position] ? 'rgba(220,60,40,0.9)' : 'rgba(200,155,60,0.9)'
                          "
                          :filter="brokenParts[position] ? 'url(#glow-red)' : 'url(#glow-gold)'"
                        />
                      </template>
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

      <!-- Time Card Turn -->
      <div v-if="questMode === 'full' && (timeCardDeck.length > 0 || timeCardDiscard.length > 0)" class="tct-section">
        <p class="hunt-result-label">— Time Card —</p>
        <div class="tct-deck-row">
          <div class="tct-deck-wrap">
            <div class="tct-deck-stack" :class="{ empty: !timeCardDeck.length }">
              <img :src="getImg(timeCardData.back_time_card_img)" class="tct-back-img" />
              <span class="tct-count-badge">{{ timeCardDeck.length }}</span>
            </div>
            <span class="tct-deck-label">เหลือ</span>
          </div>
          <div class="tct-deck-wrap">
            <div
              class="tct-deck-stack tct-discard-stack"
              :class="{ 'tct-clickable': timeCardDiscard.length }"
              @click="timeCardDiscard.length && (showLastDiscard = true)"
            >
              <img v-if="timeCardDiscard.length" :src="getImg(timeCardDiscard[0].card_img)" class="tct-back-img" />
              <div v-else class="tct-deck-empty-slot"></div>
              <span class="tct-count-badge tct-badge-discard">{{ timeCardDiscard.length }}</span>
            </div>
            <span class="tct-deck-label">ทิ้งแล้ว</span>
          </div>
          <div class="tct-btn-col">
            <button
              v-if="!room.inRoom || room.isHost"
              class="tct-discard-btn"
              :disabled="!timeCardDeck.length"
              @click="discardCountInput = 1; showDiscardCount = true"
              title="ทิ้งการ์ดจาก Time Card Deck"
            >🗑 ทิ้ง</button>
          </div>
        </div>

      </div>

      <!-- Quest Outcome -->
      <div class="hunt-result-section">
        <p class="hunt-result-label">— Quest Outcome —</p>

        <!-- Faint Tracker -->
        <div class="faint-tracker">
          <span class="faint-label">Faint</span>
          <div class="faint-icons">
            <div
              v-for="i in 3"
              :key="i"
              class="faint-slot"
              :class="{ 'faint-used': i <= faintCount }"
              @click="toggleFaint(i)"
              title="คลิกเพื่อ Faint / ยกเลิก"
            >
              <img :src="getImg('assets/img/UI/faint_icon.png')" class="faint-icon-img" />
              <span v-if="i <= faintCount" class="faint-x">✕</span>
            </div>
          </div>
        </div>

        <!-- Potion Tracker -->
        <div class="faint-tracker">
          <span class="faint-label">Potion</span>
          <div class="faint-icons">
            <div
              v-for="i in 3"
              :key="i"
              class="faint-slot potion-slot"
              :class="{ 'potion-empty': i > potionCount }"
              @click="togglePotion(i)"
              title="คลิกเพื่อใช้ / เพิ่ม Potion"
            >
              <img :src="getImg('assets/img/UI/potion_icon.png')" class="faint-icon-img" />
              <span v-if="i > potionCount" class="faint-x">✕</span>
            </div>
          </div>
        </div>

        <!-- Minimal Mode Special Card -->
        <div v-if="questMode === 'minimal' && specialCardOverlayCard" class="minimal-special-card-wrap">
          <p class="minimal-special-label">⚔ Special Attack</p>
          <div class="minimal-special-card">
            <img :src="getImg(specialCardOverlayCard.front_card_img)" class="minimal-special-img" />
            <span class="minimal-special-name">{{ specialCardOverlayCard.behavior_name }}</span>
          </div>
        </div>

        <!-- Minimal Mode Outcome Buttons -->
        <div v-if="questMode === 'minimal'" class="minimal-outcome-wrap">
          <!-- Complete: auto-detect HP=0 -->
          <button
            v-if="canComplete"
            class="minimal-outcome-btn minimal-complete"
            :class="{ 'outcome-voted': room.myOutcomeVote === 'complete' }"
            @click="room.inRoom ? toggleVote('complete') : requestOutcome('complete')"
          >
            <span class="result-icon">✦</span> Quest Complete
            <span v-if="room.inRoom && Object.values(room.outcomeVotes ?? {}).filter(v => v === 'complete').length > 0" class="outcome-vote-count">
              {{ Object.values(room.outcomeVotes ?? {}).filter(v => v === 'complete').length }}/{{ room.hunterCount }}
            </span>
          </button>
          <!-- Failed: auto-detect Faint=3 -->
          <button
            v-if="canFail"
            class="minimal-outcome-btn minimal-failed"
            :class="{ 'outcome-voted': room.myOutcomeVote === 'fail' }"
            @click="room.inRoom ? toggleVote('fail') : requestOutcome('fail')"
          >
            <span class="result-icon">💀</span> Quest Failed
            <span v-if="room.inRoom && Object.values(room.outcomeVotes ?? {}).filter(v => v === 'fail').length > 0" class="outcome-vote-count">
              {{ Object.values(room.outcomeVotes ?? {}).filter(v => v === 'fail').length }}/{{ room.hunterCount }}
            </span>
          </button>
          <!-- Time Out: always visible -->
          <button
            class="minimal-outcome-btn minimal-timeout"
            :class="{ 'outcome-voted': room.myOutcomeVote === 'fail' }"
            @click="room.inRoom ? toggleVote('fail') : requestOutcome('fail')"
          >
            <span class="result-icon">⏱</span> Time Out
            <span v-if="room.inRoom && Object.values(room.outcomeVotes ?? {}).filter(v => v === 'fail').length > 0" class="outcome-vote-count">
              {{ Object.values(room.outcomeVotes ?? {}).filter(v => v === 'fail').length }}/{{ room.hunterCount }}
            </span>
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
        <!-- My dice -->
        <p class="rw-section-label">🎲 เต๋าของคุณ</p>
        <div class="rw-dice-row">
          <div
            v-for="die in rolledDice"
            :key="die.id"
            class="rw-die"
            :class="{ rolling: rollingDiceIds.has(die.id), 'no-click': room.inRoom }"
            @click="rerollDie(die.id)"
            :title="room.inRoom ? '' : 'คลิกเพื่อทอยใหม่'"
          >
            <div class="die-face">
              <span
                v-for="pos in 9"
                :key="pos"
                class="die-dot"
                :class="{ visible: dotPatterns[die.value]?.includes(pos - 1) }"
              />
            </div>
          </div>
        </div>

        <!-- Party dice (co-op) -->
        <div v-if="room.inRoom && Object.keys(room.partyDice ?? {}).length" class="rw-party-dice">
          <p class="rw-section-label">👥 เต๋าของปาร์ตี้</p>
          <div
            v-for="h in room.hunters.filter(h => h.hunter_id !== room.myHunterId && room.partyDice[h.hunter_id])"
            :key="h.hunter_id"
            class="rw-party-row"
          >
            <span class="rw-party-name">{{ h.hunter_name }}</span>
            <div class="rw-dice-row rw-dice-row-sm">
              <div
                v-for="(val, idx) in room.partyDice[h.hunter_id]"
                :key="idx"
                class="rw-die rw-die-sm no-click"
              >
                <div class="die-face">
                  <span
                    v-for="pos in 9"
                    :key="pos"
                    class="die-dot"
                    :class="{ visible: dotPatterns[val]?.includes(pos - 1) }"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Reroll request status (co-op) -->
        <div v-if="room.inRoom && room.rerollRequest" class="rw-reroll-status">
          <div v-if="room.rerollRequest.requesterId === room.myHunterId" class="rw-reroll-waiting">
            🎲 รอการอนุมัติ Reroll...
            ({{ Object.values(room.rerollRequest.approvals ?? {}).filter(v => v === true).length }}/{{ room.hunterCount - 1 }})
            <button class="rw-reroll-cancel" @click="room.cancelReroll()">ยกเลิก</button>
          </div>
          <div v-else-if="room.myRerollApproval === null" class="rw-reroll-ask">
            <span><strong>{{ room.rerollRequest.requesterName }}</strong> ขอ Reroll</span>
            <div class="rw-reroll-btns">
              <button class="rw-reroll-approve" @click="room.respondReroll(true)">✓ อนุมัติ</button>
              <button class="rw-reroll-deny" @click="room.respondReroll(false)">✕ ปฏิเชน</button>
            </div>
          </div>
          <p v-else class="rw-reroll-voted">{{ room.myRerollApproval ? 'คุณอนุมัติแล้ว' : 'คุณปฏิเสธแล้ว' }}</p>
        </div>

        <div class="rw-roll-actions">
          <button v-if="!room.inRoom" class="rw-btn-secondary" @click="rollAllDice()" :disabled="isAnyRolling">🎲 ทอยใหม่ทั้งหมด</button>
          <button v-if="room.inRoom && !room.rerollRequest" class="rw-btn-secondary" @click="room.requestReroll()" :disabled="isAnyRolling">🎲 ขอ Reroll</button>
          <button
            class="rw-btn-primary"
            :disabled="isAnyRolling || (room.inRoom && room.myActionVote === 'goReward')"
            @click="room.inRoom ? room.voteAction('goReward') : initAssignPhase()"
          >
            <span v-if="room.inRoom && room.actionVoteCount('goReward') > 0">
              ใช้ผลนี้ → ({{ room.actionVoteCount('goReward') }}/{{ room.hunterCount }})
            </span>
            <span v-else>ใช้ผลนี้ →</span>
          </button>
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
              <button
                class="rw-craft-btn"
                @click.stop="openCraftLookup(row.reward.resource_type_id, row.reward.item_id, getResourceItem(row.reward.resource_type_id, row.reward.item_id)?.item)"
                title="ดูสูตรคราฟ"
              >🔨</button>
            </div>
            <div
              v-if="row.part_break_reward?.part_id"
              class="rw-part-bonus"
              :class="{ 'bonus-active': isPartBreakRewardActive(row.part_break_reward) }"
            >
              <span class="rw-bonus-icon">{{
                isPartBreakRewardActive(row.part_break_reward) ? '🔓' : '🔒'
              }}</span>
              <span class="rw-bonus-text">
                +{{ row.part_break_reward.gain_additional }}
                {{ getPartMeta(row.part_break_reward.part_id)?.part ?? '' }}
                <template v-if="row.part_break_reward.position === 'left'">(ซ้าย)</template>
                <template v-else-if="row.part_break_reward.position === 'right'">(ขวา)</template>
                Break
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

        <!-- Party rewards (co-op) -->
        <div
          v-if="room.inRoom && room.hunters.some(h => h.hunter_id !== room.myHunterId && (room.partyRewards?.[h.hunter_id]?.length ?? 0) > 0)"
          class="rw-party-rewards"
        >
          <p class="rw-section-label">👥 รางวัลของปาร์ตี้</p>
          <div
            v-for="h in room.hunters.filter(h => h.hunter_id !== room.myHunterId && (room.partyRewards?.[h.hunter_id]?.length ?? 0) > 0)"
            :key="h.hunter_id"
            class="rw-party-reward-row"
          >
            <span class="rw-party-name">{{ h.hunter_name }}</span>
            <div class="rw-claimed-list">
              <div
                v-for="r in room.partyRewards[h.hunter_id]"
                :key="`${r.resource_type_id}-${r.item_id}`"
                class="rw-claimed-item"
              >
                <img
                  v-if="getResourceItem(r.resource_type_id, r.item_id)"
                  :src="getImg(getResourceItem(r.resource_type_id, r.item_id).thumbnail)"
                  class="rw-claimed-img"
                />
                <span class="rw-claimed-qty">×{{ r.quantity }}</span>
                <span class="rw-claimed-name">{{ getResourceItem(r.resource_type_id, r.item_id)?.item }}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="rw-confirm-row">
          <p v-if="!allDiceSpent" class="rw-skip-hint">
            🎲 ใช้เต๋าให้หมดก่อน — ยังเหลืออีก {{ rolledDice.filter((d) => !d.spent).length }} ลูก
          </p>
          <button
            class="rw-btn-primary rw-btn-confirm"
            :disabled="!allDiceSpent || (room.inRoom && room.myActionVote === 'goTrade')"
            @click="room.inRoom ? room.voteAction('goTrade') : confirmRewards()"
          >
            <span v-if="room.inRoom && room.actionVoteCount('goTrade') > 0">
              ⚔ รับรางวัลและ Trade ของกัน ({{ room.actionVoteCount('goTrade') }}/{{ room.hunterCount }})
            </span>
            <span v-else-if="room.inRoom">⚔ รับรางวัลและ Trade ของกัน</span>
            <span v-else>✦ รับรางวัลและปิด Quest</span>
          </button>
        </div>
      </div>

      <!-- ── Trade Phase ── -->
      <div v-else-if="rewardPhase === 'trade'" class="rw-trade">
        <p class="rw-title">⚔ Trade ของกัน</p>
        <p class="rw-sub">โยน Item ลงกองกลาง หรือหยิบ Item ของคนอื่น</p>

        <!-- My inventory -->
        <div class="trade-section">
          <div class="trade-inv-header">
            <p class="rw-section-label">🎒 Inventory ของฉัน</p>
            <input
              v-model="tradeSearch"
              class="trade-search-input"
              placeholder="🔍 ค้นหา..."
              @click.stop
            />
          </div>
          <div v-if="filteredInventory.length" class="trade-item-list trade-item-list-scroll">
            <div v-for="r in filteredInventory" :key="`${r.resource_type_id}-${r.item_id}`" class="trade-item">
              <img :src="getImg(getResourceItem(r.resource_type_id, r.item_id)?.thumbnail)" class="trade-item-img" />
              <span class="trade-item-name">{{ getResourceItem(r.resource_type_id, r.item_id)?.item }}</span>
              <span class="trade-item-qty">×{{ r.quantity }}</span>
              <button class="trade-offer-btn" @click="openTradePicker(r)">↓ Trade</button>
            </div>
          </div>
          <p v-else class="trade-empty">
            {{ tradeSearch ? 'ไม่พบ Item ที่ค้นหา' : 'ไม่มี Item ใน Inventory' }}
          </p>

          <!-- Quantity picker -->
          <div v-if="tradePicker" class="trade-picker">
            <span class="trade-picker-name">{{ getResourceItem(tradePicker.resource_type_id, tradePicker.item_id)?.item }}</span>
            <div class="trade-picker-qty">
              <button @click="tradePicker.qty = Math.max(1, tradePicker.qty - 1)">−</button>
              <span>{{ tradePicker.qty }}</span>
              <button @click="tradePicker.qty = Math.min(tradePicker.max, tradePicker.qty + 1)">+</button>
              <span class="trade-picker-max">/ {{ tradePicker.max }}</span>
            </div>
            <div class="trade-picker-btns">
              <button class="trade-offer-btn" @click="confirmOfferTrade">✓ ยืนยัน Trade</button>
              <button class="trade-cancel-btn" @click="tradePicker = null">ยกเลิก</button>
            </div>
          </div>
        </div>

        <!-- Trade pool -->
        <div class="trade-section trade-pool-section">
          <p class="rw-section-label">🔄 กองกลาง Trade</p>
          <div v-if="room.tradePool.length" class="trade-item-list">
            <div v-for="item in room.tradePool" :key="item.key" class="trade-item"
              :class="{ 'trade-mine': item.fromHunterId === room.myHunterId }">
              <img :src="getImg(getResourceItem(item.resource_type_id, item.item_id)?.thumbnail)" class="trade-item-img" />
              <span class="trade-item-name">{{ getResourceItem(item.resource_type_id, item.item_id)?.item }}</span>
              <span class="trade-item-qty">×{{ item.quantity }}</span>
              <span class="trade-from">{{ item.fromHunterName }}</span>
              <button
                v-if="item.fromHunterId !== room.myHunterId"
                class="trade-take-btn"
                @click="takeFromTrade(item)"
              >↑ รับ</button>
              <button
                v-else
                class="trade-cancel-btn"
                @click="returnFromTrade(item)"
              >↩ คืน</button>
            </div>
          </div>
          <p v-else class="trade-empty">ยังไม่มีใครโยน Item ลงกองกลาง</p>
        </div>

        <!-- Close trade vote -->
        <div class="trade-close-row">
          <button
            class="rw-btn-primary"
            :class="{ 'outcome-voted': room.myActionVote === 'closeTrade' }"
            :disabled="room.myActionVote === 'closeTrade'"
            @click="voteCloseTrade"
          >
            <span v-if="room.actionVoteCount('closeTrade') > 0">
              ✦ ปิดเควส ({{ room.actionVoteCount('closeTrade') }}/{{ room.hunterCount }})
            </span>
            <span v-else>✦ ปิดเควส</span>
          </button>
        </div>
      </div>
    </div>

    <!-- ═══════════ SHUFFLE ANIMATION OVERLAY ═══════════ -->
    <teleport to="body">
      <Transition name="slain-fade">
        <div v-if="showShuffleAnim" class="shuf-overlay">
          <div class="shuf-stage">
            <!-- Ghost cards fan out -->
            <div v-for="(back, i) in shuffleCardBacks.slice(1)" :key="i" :class="`shuf-ghost shuf-ghost-${i + 1}`">
              <img v-if="back" :src="getImg(back)" class="shuf-card-img" />
            </div>
            <!-- Top card (back) -->
            <div class="shuf-top-card">
              <img v-if="shuffleCardBacks[0]" :src="getImg(shuffleCardBacks[0])" class="shuf-card-img" />
            </div>
          </div>
          <p class="shuf-label">🔀 กำลังสับกอง...</p>
        </div>
      </Transition>
    </teleport>

    <!-- ═══════════ TIME CARD REVEAL OVERLAY ═══════════ -->
    <teleport to="body">
      <Transition name="ma-trans">
        <div v-if="showTcReveal && tcRevealCurrent" class="tcr-overlay" @click="dismissTcReveal">
          <div class="tcr-content">
            <div class="tcr-hunter-header">
              <img
                v-if="getHunterClass(tcRevealCurrent.hunterClassId)?.thumbnail"
                :src="getImg(getHunterClass(tcRevealCurrent.hunterClassId).thumbnail)"
                class="tcr-class-icon"
              />
              <p class="tcr-hunter-name">{{ tcRevealCurrent.hunterName }}</p>
            </div>
            <p class="tcr-label">จบเทิร์น</p>
            <div class="tcr-card-flip">
              <div class="tcr-card-inner">
                <div class="tcr-card-back">
                  <img :src="getImg(timeCardData.back_time_card_img)" class="tcr-card-img" />
                </div>
                <div class="tcr-card-front">
                  <img v-if="tcRevealCurrent.card" :src="getImg(tcRevealCurrent.card.card_img)" class="tcr-card-img" />
                </div>
              </div>
            </div>
            <p class="tcr-card-name">{{ tcRevealCurrent.card?.card_name }}</p>
            <p class="tcr-remaining">เหลือ {{ timeCardDeck.length }} ใบ</p>
          </div>
        </div>
      </Transition>
    </teleport>

    <!-- ═══════════ DISCARD COUNT MODAL ═══════════ -->
    <teleport to="body">
      <Transition name="slain-fade">
        <div v-if="showDiscardCount" class="dc-overlay" @click.self="showDiscardCount = false">
          <div class="dc-modal">
            <p class="dc-title">🗑 ทิ้ง Time Card</p>
            <p class="dc-sub">เหลือใน Deck: <strong>{{ timeCardDeck.length }}</strong> ใบ</p>
            <div class="dc-counter">
              <button class="dc-counter-btn" :disabled="discardCountInput <= 1" @click="discardCountInput--">−</button>
              <span class="dc-counter-val">{{ discardCountInput }}</span>
              <button class="dc-counter-btn" :disabled="discardCountInput >= timeCardDeck.length" @click="discardCountInput++">+</button>
            </div>
            <div class="dc-btns">
              <button class="dc-btn dc-confirm" @click="for(let i=0;i<discardCountInput;i++) discardTimeCard(); showDiscardCount=false">ยืนยัน</button>
              <button class="dc-btn dc-cancel" @click="showDiscardCount = false">ยกเลิก</button>
            </div>
          </div>
        </div>
      </Transition>
    </teleport>

    <!-- ═══════════ NITROTOAD MODAL ═══════════ -->
    <teleport to="body">
      <Transition name="slain-fade">
        <div v-if="nitrotoadStep" class="nt-overlay">
          <div class="nt-modal">
            <p class="nt-title">🐸 Nitrotoad!</p>

            <!-- Step: Roll -->
            <template v-if="nitrotoadStep === 'roll'">
              <p class="nt-rule">1–3 : เพิ่ม Break Token บน Part ที่เลือก</p>
              <p class="nt-rule">4–6 : Hunter ได้รับ Blastblight</p>
              <div class="nt-die-wrap">
                <div class="rw-die nt-die" :class="{ rolling: nitrotoadDie.rolling }">
                  <div class="die-face">
                    <span v-for="pos in 9" :key="pos" class="die-dot"
                      :class="{ visible: dotPatterns[nitrotoadDie.value]?.includes(pos - 1) }" />
                  </div>
                </div>
              </div>
              <button v-if="isNitrotoadDrawer" class="nt-roll-btn" :disabled="nitrotoadDie.rolling" @click="rollNitrotoad">
                🎲 ทอย
              </button>
              <p v-else class="nt-waiting">รอ {{ room.hunters.find(h => h.hunter_id === nitrotoadDrawerId)?.hunter_name ?? 'Hunter' }} ทอยลูกเต๋า...</p>
            </template>

            <!-- Step: Rolling (ทุกคนเห็น animation พร้อมกัน) -->
            <template v-else-if="nitrotoadStep === 'rolling'">
              <div class="nt-die-wrap">
                <div class="rw-die nt-die rolling">
                  <div class="die-face">
                    <span v-for="pos in 9" :key="pos" class="die-dot"
                      :class="{ visible: dotPatterns[nitrotoadDie.value]?.includes(pos - 1) }" />
                  </div>
                </div>
              </div>
            </template>

            <!-- Step: Rolled (แสดงผล รอ confirm) -->
            <template v-else-if="nitrotoadStep === 'rolled'">
              <div class="nt-die-wrap">
                <div class="rw-die nt-die" :class="{ rolling: nitrotoadDie.rolling }">
                  <div class="die-face">
                    <span v-for="pos in 9" :key="pos" class="die-dot"
                      :class="{ visible: dotPatterns[nitrotoadDie.value]?.includes(pos - 1) }" />
                  </div>
                </div>
              </div>
              <p class="nt-roll-result">ได้ <strong>{{ nitrotoadRoll }}</strong></p>
              <p class="nt-rule" :class="nitrotoadRoll <= 3 ? 'nt-rule-good' : 'nt-rule-bad'">
                {{ nitrotoadRoll <= 3 ? '✓ เพิ่ม Break Token บน Part ที่เลือก' : '✕ Hunter ได้รับ Blastblight' }}
              </p>
              <button v-if="isNitrotoadDrawer" class="nt-roll-btn" @click="confirmNitrotoad">ดำเนินการ</button>
              <p v-else class="nt-waiting">รอ {{ room.hunters.find(h => h.hunter_id === nitrotoadDrawerId)?.hunter_name ?? 'Hunter' }} ดำเนินการ...</p>
            </template>

            <!-- Step: Part Select (1-3) -->
            <template v-else-if="nitrotoadStep === 'part-select'">
              <p class="nt-roll-result">ได้ <strong>{{ nitrotoadRoll }}</strong> — กดที่ Part เพื่อวาง Break Token</p>
              <template v-if="isNitrotoadDrawer">
                <div class="nt-parts-grid">
                  <div
                    v-for="(partData, position) in activeParts"
                    :key="position"
                    class="part-card nt-part-card"
                    :class="{ 'part-card-broken': brokenParts[position], 'nt-part-selectable': !brokenParts[position] }"
                    @click="!brokenParts[position] && applyNitrotoadBreak(position)"
                  >
                    <div class="part-card-head">
                      <div class="part-icon-wrap">
                        <img v-if="getPartMeta(partData.part_id)" :src="getImg(getPartMeta(partData.part_id).thumbnail)" class="part-icon-img" :class="{ 'part-icon-broken': brokenParts[position] }" />
                      </div>
                      <div class="part-card-armor-wrap">
                        <div class="armor-element-card" :class="{ 'armor-blastblight': blastblightActive && partData.armor > 0 }">
                          <img :src="getImg('assets/img/bonus_armor.png')" class="armor-base" />
                          <span class="element-value">{{ blastblightActive ? Math.max(0, partData.armor - 1) : partData.armor }}</span>
                        </div>
                      </div>
                      <div class="part-mini-diagram">
                        <svg viewBox="0 0 100 100" class="part-mini-svg">
                          <circle cx="50" cy="50" r="46" fill="#0f0b05" stroke="#5a3d1f" stroke-width="2" />
                          <line x1="4" y1="4" x2="96" y2="96" stroke="#3a2810" stroke-width="2" />
                          <line x1="96" y1="4" x2="4" y2="96" stroke="#3a2810" stroke-width="2" />
                          <circle v-if="posDotCoords[position]" :cx="posDotCoords[position].x" :cy="posDotCoords[position].y" r="12"
                            :fill="brokenParts[position] ? 'rgba(220,60,40,0.9)' : 'rgba(200,155,60,0.9)'"
                            :filter="brokenParts[position] ? 'url(#glow-red)' : 'url(#glow-gold)'" />
                          <template v-for="connPos in (partData.connect_part_position ?? [])" :key="connPos">
                            <circle v-if="posDotCoords[connPos]" :cx="posDotCoords[connPos].x" :cy="posDotCoords[connPos].y" r="12"
                              :fill="brokenParts[position] ? 'rgba(220,60,40,0.9)' : 'rgba(200,155,60,0.9)'"
                              :filter="brokenParts[position] ? 'url(#glow-red)' : 'url(#glow-gold)'" />
                          </template>
                          <defs>
                            <filter id="glow-gold" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
                            <filter id="glow-red" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
                          </defs>
                        </svg>
                      </div>
                      <div v-if="brokenParts[position]" class="part-broken-stamp">BROKEN</div>
                    </div>
                    <div class="part-break-wrap">
                      <div class="part-break-row">
                        <span class="part-break-label">Break</span>
                        <span class="part-break-nums">{{ partDamage[position] ?? 0 }} / {{ partData.part_break_threshold }}</span>
                      </div>
                      <div class="part-break-track">
                        <div class="part-break-fill" :class="{ 'break-fill-broken': brokenParts[position] }"
                          :style="{ width: Math.min(100, ((partDamage[position] ?? 0) / partData.part_break_threshold) * 100) + '%' }" />
                      </div>
                    </div>
                  </div>
                </div>
              </template>
              <p v-else class="nt-waiting">รอ {{ room.hunters.find(h => h.hunter_id === nitrotoadDrawerId)?.hunter_name ?? 'Hunter' }} เลือก Part...</p>
            </template>

            <!-- Step: Blastblight (4-6) -->
            <template v-else-if="nitrotoadStep === 'blastblight'">
              <p class="nt-roll-result">ได้ <strong>{{ nitrotoadRoll }}</strong></p>
              <div class="nt-blast-box">
                <img :src="getImg('assets/img/status_effect/blastblight.webp')" class="nt-blast-icon" />
                <div>
                  <p class="nt-blast-name">Blastblight</p>
                  <p class="nt-blast-desc">{{ getStatusEffect(5)?.hunter_suffer }}</p>
                </div>
              </div>
              <button class="nt-close-btn" @click="dismissNitrotoad">รับทราบ</button>
            </template>
          </div>
        </div>
      </Transition>
    </teleport>

    <!-- ═══════════ PARATOAD MODAL ═══════════ -->
    <teleport to="body">
      <Transition name="slain-fade">
        <div v-if="paratoadStep" class="nt-overlay">
          <div class="nt-modal">
            <p class="nt-title">🐸 Paratoad!</p>

            <template v-if="paratoadStep === 'roll'">
              <p class="nt-rule">1–3 : วาง Paralysis Token บน Monster</p>
              <p class="nt-rule">4–6 : Hunter ได้รับ Paralysis</p>
              <div class="nt-die-wrap">
                <div class="rw-die nt-die" :class="{ rolling: paratoadDie.rolling }">
                  <div class="die-face">
                    <span v-for="pos in 9" :key="pos" class="die-dot"
                      :class="{ visible: dotPatterns[paratoadDie.value]?.includes(pos - 1) }" />
                  </div>
                </div>
              </div>
              <button v-if="isParatoadDrawer" class="nt-roll-btn" @click="rollParatoad">🎲 ทอย</button>
              <p v-else class="nt-waiting">รอ {{ room.hunters.find(h => h.hunter_id === paratoadDrawerId)?.hunter_name ?? 'Hunter' }} ทอยลูกเต๋า...</p>
            </template>

            <template v-else-if="paratoadStep === 'rolling'">
              <div class="nt-die-wrap">
                <div class="rw-die nt-die rolling">
                  <div class="die-face">
                    <span v-for="pos in 9" :key="pos" class="die-dot"
                      :class="{ visible: dotPatterns[paratoadDie.value]?.includes(pos - 1) }" />
                  </div>
                </div>
              </div>
            </template>

            <template v-else-if="paratoadStep === 'rolled'">
              <div class="nt-die-wrap">
                <div class="rw-die nt-die" :class="{ rolling: paratoadDie.rolling }">
                  <div class="die-face">
                    <span v-for="pos in 9" :key="pos" class="die-dot"
                      :class="{ visible: dotPatterns[paratoadDie.value]?.includes(pos - 1) }" />
                  </div>
                </div>
              </div>
              <p class="nt-roll-result">ได้ <strong>{{ paratoadRoll }}</strong></p>
              <p class="nt-rule" :class="paratoadRoll <= 3 ? 'nt-rule-good' : 'nt-rule-bad'">
                {{ paratoadRoll <= 3 ? '✓ วาง Paralysis Token บน Monster' : '✕ Hunter ได้รับ Paralysis' }}
              </p>
              <button v-if="isParatoadDrawer" class="nt-roll-btn" @click="confirmParatoad">ดำเนินการ</button>
              <p v-else class="nt-waiting">รอ {{ room.hunters.find(h => h.hunter_id === paratoadDrawerId)?.hunter_name ?? 'Hunter' }} ดำเนินการ...</p>
            </template>

            <template v-else-if="paratoadStep === 'paralysis'">
              <p class="nt-roll-result">ได้ <strong>{{ paratoadRoll }}</strong></p>
              <div class="nt-blast-box">
                <img :src="getImg('assets/img/status_effect/paralysis.webp')" class="nt-blast-icon" />
                <div>
                  <p class="nt-blast-name">Paralysis</p>
                  <p class="nt-blast-desc">{{ getStatusEffect(4)?.hunter_suffer }}</p>
                </div>
              </div>
              <button class="nt-close-btn" @click="dismissParatoad">รับทราบ</button>
            </template>

            <template v-else-if="paratoadStep === 'immune'">
              <p class="nt-roll-result">ได้ <strong>{{ paratoadRoll }}</strong></p>
              <div class="nt-immune-box">
                <span class="nt-immune-icon">🛡</span>
                <div>
                  <p class="nt-immune-title">Monster ต้านทาน!</p>
                  <p class="nt-immune-desc">Monster ไม่ได้รับผลจาก Paralysis</p>
                </div>
              </div>
              <button class="nt-close-btn" @click="dismissParatoad">ปิด</button>
            </template>
          </div>
        </div>
      </Transition>
    </teleport>

    <!-- ═══════════ POISONCUP MODAL ═══════════ -->
    <teleport to="body">
      <Transition name="slain-fade">
        <div v-if="poisoncupStep" class="nt-overlay">
          <div class="nt-modal">
            <p class="nt-title">☠ Poisoncup!</p>

            <template v-if="poisoncupStep === 'roll'">
              <p class="nt-rule">1–3 : วาง Poison Token บน Monster</p>
              <p class="nt-rule">4–6 : Hunter ได้รับ Poison</p>
              <div class="nt-die-wrap">
                <div class="rw-die nt-die" :class="{ rolling: poisoncupDie.rolling }">
                  <div class="die-face">
                    <span v-for="pos in 9" :key="pos" class="die-dot"
                      :class="{ visible: dotPatterns[poisoncupDie.value]?.includes(pos - 1) }" />
                  </div>
                </div>
              </div>
              <button v-if="isPoisoncupDrawer" class="nt-roll-btn" @click="rollPoisoncup">🎲 ทอย</button>
              <p v-else class="nt-waiting">รอ {{ room.hunters.find(h => h.hunter_id === poisoncupDrawerId)?.hunter_name ?? 'Hunter' }} ทอยลูกเต๋า...</p>
            </template>

            <template v-else-if="poisoncupStep === 'rolling'">
              <div class="nt-die-wrap">
                <div class="rw-die nt-die rolling">
                  <div class="die-face">
                    <span v-for="pos in 9" :key="pos" class="die-dot"
                      :class="{ visible: dotPatterns[poisoncupDie.value]?.includes(pos - 1) }" />
                  </div>
                </div>
              </div>
            </template>

            <template v-else-if="poisoncupStep === 'rolled'">
              <div class="nt-die-wrap">
                <div class="rw-die nt-die" :class="{ rolling: poisoncupDie.rolling }">
                  <div class="die-face">
                    <span v-for="pos in 9" :key="pos" class="die-dot"
                      :class="{ visible: dotPatterns[poisoncupDie.value]?.includes(pos - 1) }" />
                  </div>
                </div>
              </div>
              <p class="nt-roll-result">ได้ <strong>{{ poisoncupRoll }}</strong></p>
              <p class="nt-rule" :class="poisoncupRoll <= 3 ? 'nt-rule-good' : 'nt-rule-bad'">
                {{ poisoncupRoll <= 3 ? '✓ วาง Poison Token บน Monster' : '✕ Hunter ได้รับ Poison' }}
              </p>
              <button v-if="isPoisoncupDrawer" class="nt-roll-btn" @click="confirmPoisoncup">ดำเนินการ</button>
              <p v-else class="nt-waiting">รอ {{ room.hunters.find(h => h.hunter_id === poisoncupDrawerId)?.hunter_name ?? 'Hunter' }} ดำเนินการ...</p>
            </template>

            <template v-else-if="poisoncupStep === 'poison'">
              <p class="nt-roll-result">ได้ <strong>{{ poisoncupRoll }}</strong></p>
              <div class="nt-blast-box">
                <img :src="getImg('assets/img/status_effect/poison.webp')" class="nt-blast-icon" />
                <div>
                  <p class="nt-blast-name">Poison</p>
                  <p class="nt-blast-desc">{{ getStatusEffect(2)?.hunter_suffer }}</p>
                </div>
              </div>
              <button class="nt-close-btn" @click="dismissPoisoncup">รับทราบ</button>
            </template>

            <template v-else-if="poisoncupStep === 'immune'">
              <p class="nt-roll-result">ได้ <strong>{{ poisoncupRoll }}</strong></p>
              <div class="nt-immune-box">
                <span class="nt-immune-icon">🛡</span>
                <div>
                  <p class="nt-immune-title">Monster ต้านทาน!</p>
                  <p class="nt-immune-desc">Monster ไม่ได้รับผลจาก Poison</p>
                </div>
              </div>
              <button class="nt-close-btn" @click="dismissPoisoncup">ปิด</button>
            </template>
          </div>
        </div>
      </Transition>
    </teleport>

    <!-- ═══════════ SLEEPTOAD MODAL ═══════════ -->
    <teleport to="body">
      <Transition name="slain-fade">
        <div v-if="sleeptoadStep" class="nt-overlay">
          <div class="nt-modal">
            <p class="nt-title">💤 Sleeptoad!</p>

            <template v-if="sleeptoadStep === 'roll'">
              <p class="nt-rule">1–3 : วาง Sleep Token บน Monster</p>
              <p class="nt-rule">4–6 : Hunter ได้รับ Sleep</p>
              <div class="nt-die-wrap">
                <div class="rw-die nt-die" :class="{ rolling: sleeptoadDie.rolling }">
                  <div class="die-face">
                    <span v-for="pos in 9" :key="pos" class="die-dot"
                      :class="{ visible: dotPatterns[sleeptoadDie.value]?.includes(pos - 1) }" />
                  </div>
                </div>
              </div>
              <button v-if="isSleeptoadDrawer" class="nt-roll-btn" @click="rollSleeptoad">🎲 ทอย</button>
              <p v-else class="nt-waiting">รอ {{ room.hunters.find(h => h.hunter_id === sleeptoadDrawerId)?.hunter_name ?? 'Hunter' }} ทอยลูกเต๋า...</p>
            </template>

            <template v-else-if="sleeptoadStep === 'rolling'">
              <div class="nt-die-wrap">
                <div class="rw-die nt-die rolling">
                  <div class="die-face">
                    <span v-for="pos in 9" :key="pos" class="die-dot"
                      :class="{ visible: dotPatterns[sleeptoadDie.value]?.includes(pos - 1) }" />
                  </div>
                </div>
              </div>
            </template>

            <template v-else-if="sleeptoadStep === 'rolled'">
              <div class="nt-die-wrap">
                <div class="rw-die nt-die" :class="{ rolling: sleeptoadDie.rolling }">
                  <div class="die-face">
                    <span v-for="pos in 9" :key="pos" class="die-dot"
                      :class="{ visible: dotPatterns[sleeptoadDie.value]?.includes(pos - 1) }" />
                  </div>
                </div>
              </div>
              <p class="nt-roll-result">ได้ <strong>{{ sleeptoadRoll }}</strong></p>
              <p class="nt-rule" :class="sleeptoadRoll <= 3 ? 'nt-rule-good' : 'nt-rule-bad'">
                {{ sleeptoadRoll <= 3 ? '✓ วาง Sleep Token บน Monster' : '✕ Hunter ได้รับ Sleep' }}
              </p>
              <button v-if="isSleeptoadDrawer" class="nt-roll-btn" @click="confirmSleeptoad">ดำเนินการ</button>
              <p v-else class="nt-waiting">รอ {{ room.hunters.find(h => h.hunter_id === sleeptoadDrawerId)?.hunter_name ?? 'Hunter' }} ดำเนินการ...</p>
            </template>

            <template v-else-if="sleeptoadStep === 'sleep'">
              <p class="nt-roll-result">ได้ <strong>{{ sleeptoadRoll }}</strong></p>
              <div class="nt-blast-box">
                <img :src="getImg('assets/img/status_effect/sleep.webp')" class="nt-blast-icon" />
                <div>
                  <p class="nt-blast-name">Sleep</p>
                  <p class="nt-blast-desc">{{ getStatusEffect(3)?.hunter_suffer }}</p>
                </div>
              </div>
              <button class="nt-close-btn" @click="dismissSleeptoad">รับทราบ</button>
            </template>

            <template v-else-if="sleeptoadStep === 'immune'">
              <p class="nt-roll-result">ได้ <strong>{{ sleeptoadRoll }}</strong></p>
              <div class="nt-immune-box">
                <span class="nt-immune-icon">🛡</span>
                <div>
                  <p class="nt-immune-title">Monster ต้านทาน!</p>
                  <p class="nt-immune-desc">Monster ไม่ได้รับผลจาก Sleep</p>
                </div>
              </div>
              <button class="nt-close-btn" @click="dismissSleeptoad">ปิด</button>
            </template>
          </div>
        </div>
      </Transition>
    </teleport>

    <!-- ═══════════ ROAR MODAL ═══════════ -->
    <teleport to="body">
      <Transition name="slain-fade">
        <div v-if="roarStep" class="nt-overlay">
          <div class="nt-modal">
            <p class="nt-title">📢 Roar!</p>

            <template v-if="roarStep === 'roll'">
              <p class="nt-rule">ทอยลูกเต๋า — ทิ้งการ์ดจาก Time Deck เท่ากับผลที่ได้</p>
              <div class="nt-die-wrap">
                <div class="rw-die nt-die" :class="{ rolling: roarDie.rolling }">
                  <div class="die-face">
                    <span v-for="pos in 9" :key="pos" class="die-dot"
                      :class="{ visible: dotPatterns[roarDie.value]?.includes(pos - 1) }" />
                  </div>
                </div>
              </div>
              <button v-if="isRoarDrawer" class="nt-roll-btn" @click="rollRoar">🎲 ทอย</button>
              <p v-else class="nt-waiting">รอ {{ room.hunters.find(h => h.hunter_id === roarDrawerId)?.hunter_name ?? 'Hunter' }} ทอยลูกเต๋า...</p>
            </template>

            <template v-else-if="roarStep === 'rolling'">
              <div class="nt-die-wrap">
                <div class="rw-die nt-die rolling">
                  <div class="die-face">
                    <span v-for="pos in 9" :key="pos" class="die-dot"
                      :class="{ visible: dotPatterns[roarDie.value]?.includes(pos - 1) }" />
                  </div>
                </div>
              </div>
            </template>

            <template v-else-if="roarStep === 'rolled'">
              <div class="nt-die-wrap">
                <div class="rw-die nt-die">
                  <div class="die-face">
                    <span v-for="pos in 9" :key="pos" class="die-dot"
                      :class="{ visible: dotPatterns[roarDie.value]?.includes(pos - 1) }" />
                  </div>
                </div>
              </div>
              <p class="nt-roll-result">ได้ <strong>{{ roarRoll }}</strong></p>
              <p class="nt-rule nt-rule-bad">
                ทิ้ง {{ Math.min(roarRoll, timeCardDeck.length) }} ใบจาก Time Deck
                <span v-if="roarRoll > timeCardDeck.length"> (เหลือแค่ {{ timeCardDeck.length }} ใบ)</span>
              </p>
              <button v-if="isRoarDrawer" class="nt-roll-btn" @click="confirmRoar">ดำเนินการ</button>
              <p v-else class="nt-waiting">รอ {{ room.hunters.find(h => h.hunter_id === roarDrawerId)?.hunter_name ?? 'Hunter' }} ดำเนินการ...</p>
            </template>
          </div>
        </div>
      </Transition>
    </teleport>

    <!-- ═══════════ SUSPENDED BOULDER MODAL ═══════════ -->
    <teleport to="body">
      <Transition name="slain-fade">
        <div v-if="boulderStep" class="nt-overlay">
          <div class="nt-modal">
            <p class="nt-title">🪨 Suspended Boulder!</p>

            <template v-if="boulderStep === 'roll'">
              <p class="nt-rule">1–3 : Monster รับ 5 ความเสียหาย</p>
              <p class="nt-rule">4–6 : Hunter รับ 2 ความเสียหาย</p>
              <div class="nt-die-wrap">
                <div class="rw-die nt-die" :class="{ rolling: boulderDie.rolling }">
                  <div class="die-face">
                    <span v-for="pos in 9" :key="pos" class="die-dot"
                      :class="{ visible: dotPatterns[boulderDie.value]?.includes(pos - 1) }" />
                  </div>
                </div>
              </div>
              <button v-if="isBoulderDrawer" class="nt-roll-btn" @click="rollBoulder">🎲 ทอย</button>
              <p v-else class="nt-waiting">รอ {{ room.hunters.find(h => h.hunter_id === boulderDrawerId)?.hunter_name ?? 'Hunter' }} ทอยลูกเต๋า...</p>
            </template>

            <template v-else-if="boulderStep === 'rolling'">
              <div class="nt-die-wrap">
                <div class="rw-die nt-die rolling">
                  <div class="die-face">
                    <span v-for="pos in 9" :key="pos" class="die-dot"
                      :class="{ visible: dotPatterns[boulderDie.value]?.includes(pos - 1) }" />
                  </div>
                </div>
              </div>
            </template>

            <template v-else-if="boulderStep === 'rolled'">
              <div class="nt-die-wrap">
                <div class="rw-die nt-die">
                  <div class="die-face">
                    <span v-for="pos in 9" :key="pos" class="die-dot"
                      :class="{ visible: dotPatterns[boulderDie.value]?.includes(pos - 1) }" />
                  </div>
                </div>
              </div>
              <p class="nt-roll-result">ได้ <strong>{{ boulderRoll }}</strong></p>
              <p class="nt-rule" :class="boulderRoll <= 3 ? 'nt-rule-good' : 'nt-rule-bad'">
                {{ boulderRoll <= 3 ? '✓ Monster รับ 5 ความเสียหาย' : '✕ Hunter รับ 2 ความเสียหาย' }}
              </p>
              <button v-if="isBoulderDrawer" class="nt-roll-btn" @click="confirmBoulder">ดำเนินการ</button>
              <p v-else class="nt-waiting">รอ {{ room.hunters.find(h => h.hunter_id === boulderDrawerId)?.hunter_name ?? 'Hunter' }} ดำเนินการ...</p>
            </template>

            <template v-else-if="boulderStep === 'hunter-damage'">
              <p class="nt-roll-result">ได้ <strong>{{ boulderRoll }}</strong></p>
              <div class="nt-blast-box">
                <span style="font-size:28px;flex-shrink:0">💥</span>
                <div>
                  <p class="nt-blast-name">Hunter ได้รับความเสียหาย -2 หน่วย</p>
                </div>
              </div>
              <button class="nt-close-btn" @click="dismissBoulder">รับทราบ</button>
            </template>
          </div>
        </div>
      </Transition>
    </teleport>

    <!-- ═══════════ STATUS TOKEN FLASH OVERLAY ═══════════ -->
    <teleport to="body">
      <Transition name="tc-hp-flash">
        <div v-if="tcStatusFlash" class="tc-status-flash-overlay">
          <img v-if="selectedMonster" :src="getImg(selectedMonster.thumbnail)" class="tc-status-monster-icon" />
          <div class="tc-status-flash-badge">
            <img :src="getImg(tcStatusFlash.thumbnail)" class="tc-status-flash-icon" />
            <div class="tc-status-flash-info">
              <span class="tc-status-flash-label">Status Token</span>
              <span class="tc-status-flash-name">{{ tcStatusFlash.name }}</span>
            </div>
          </div>
        </div>
      </Transition>
    </teleport>

    <!-- ═══════════ DISCARD FLASH OVERLAY ═══════════ -->
    <teleport to="body">
      <Transition name="slain-fade">
        <div v-if="tcDiscardFlash?.length" class="tc-discard-flash-overlay">
          <p class="tc-discard-flash-label">ทิ้ง {{ tcDiscardFlash.length }} ใบ</p>
          <div class="tc-discard-flash-cards">
            <div
              v-for="(card, i) in tcDiscardFlash"
              :key="i"
              class="tc-discard-flash-card"
              :style="{ '--i': i, '--total': tcDiscardFlash.length }"
            >
              <img :src="getImg(card.card_img)" class="tc-discard-flash-img" />
              <span class="tc-discard-flash-name">{{ card.card_name }}</span>
            </div>
          </div>
        </div>
      </Transition>
    </teleport>

    <!-- ═══════════ PART BREAK TOKEN FLASH OVERLAY ═══════════ -->
    <teleport to="body">
      <Transition name="tc-hp-flash">
        <div v-if="tcPartFlash && questMode !== 'minimal'" class="tc-part-flash-overlay"
          :class="tcPartFlash.broken ? 'tc-part-shatter' : (tcPartFlash.delta > 0 ? 'tc-part-add' : 'tc-part-remove')">
          <div class="tc-part-icon-wrap" :class="{ 'tc-part-icon-hit': !tcPartFlash.broken }">
            <!-- Shatter shards (broken only) -->
            <template v-if="tcPartFlash.broken && tcPartFlash.thumbnail">
              <img :src="getImg(tcPartFlash.thumbnail)" class="tc-part-img tc-shard tc-shard-1" />
              <img :src="getImg(tcPartFlash.thumbnail)" class="tc-part-img tc-shard tc-shard-2" />
              <img :src="getImg(tcPartFlash.thumbnail)" class="tc-part-img tc-shard tc-shard-3" />
              <img :src="getImg(tcPartFlash.thumbnail)" class="tc-part-img tc-shard tc-shard-4" />
              <img :src="getImg(tcPartFlash.thumbnail)" class="tc-part-img tc-shard tc-shard-5" />
              <img :src="getImg(tcPartFlash.thumbnail)" class="tc-part-img tc-shard tc-shard-6" />
              <img :src="getImg(tcPartFlash.thumbnail)" class="tc-part-img tc-shard tc-shard-7" />
              <img :src="getImg(tcPartFlash.thumbnail)" class="tc-part-img tc-shard tc-shard-8" />
            </template>
            <!-- Normal icon -->
            <img v-else-if="tcPartFlash.thumbnail" :src="getImg(tcPartFlash.thumbnail)" class="tc-part-img" />
            <svg v-if="!tcPartFlash.broken" class="tc-part-crack-svg" viewBox="0 0 110 110">
              <!-- Crack 1: มุมซ้ายบน → กลาง -->
              <polyline v-if="tcPartFlash.current >= 1"
                points="4,6 20,24 33,36 44,48 52,55" class="tc-crack-line" />
              <!-- Crack 2: ขวา → กลาง -->
              <polyline v-if="tcPartFlash.current >= 2"
                points="110,38 90,42 78,48 66,52 58,55" class="tc-crack-line" />
              <!-- Crack 3: ล่าง → กลาง -->
              <polyline v-if="tcPartFlash.current >= 3"
                points="48,110 50,90 53,74 54,62 55,56" class="tc-crack-line" />
              <!-- Crack 4: ซ้าย → กลาง -->
              <polyline v-if="tcPartFlash.current >= 4"
                points="0,72 18,66 32,61 44,57 52,54" class="tc-crack-line" />
              <!-- Crack 5: มุมขวาบน → กลาง (สาขาเล็ก) -->
              <polyline v-if="tcPartFlash.current >= 5"
                points="106,4 88,20 74,32 63,43 57,52" class="tc-crack-line" />
              <polyline v-if="tcPartFlash.current >= 5"
                points="88,20 95,35" class="tc-crack-line tc-crack-thin" />
              <!-- Crack 6: ล่างซ้าย → กลาง (สาขาเล็ก) -->
              <polyline v-if="tcPartFlash.current >= 6"
                points="4,106 22,88 34,74 44,63 51,57" class="tc-crack-line" />
              <polyline v-if="tcPartFlash.current >= 6"
                points="34,74 22,80" class="tc-crack-line tc-crack-thin" />
              <!-- Crack 7: บน → กลาง -->
              <polyline v-if="tcPartFlash.current >= 7"
                points="66,0 63,18 60,30 58,44 56,53" class="tc-crack-line" />
              <!-- Crack 8: ล่างขวา → กลาง -->
              <polyline v-if="tcPartFlash.current >= 8"
                points="106,106 88,90 75,77 65,66 58,58" class="tc-crack-line" />
              <polyline v-if="tcPartFlash.current >= 8"
                points="75,77 82,70" class="tc-crack-line tc-crack-thin" />
            </svg>
            <div v-if="tcPartFlash.broken" class="tc-part-break-flash" />
          </div>
          <span class="tc-part-value" :class="tcPartFlash.broken ? 'tc-part-value-break' : ''">
            {{ tcPartFlash.broken ? 'BROKEN!' : (tcPartFlash.delta > 0 ? '+' : '') + tcPartFlash.delta }}
          </span>
          <div v-if="!tcPartFlash.broken" class="tc-hp-bar-wrap">
            <div class="tc-hp-bar-track">
              <div class="tc-hp-bar-fill tc-part-bar"
                :style="{ width: Math.min(100, (tcPartFlash.current / tcPartFlash.max) * 100) + '%' }" />
            </div>
            <span class="tc-hp-bar-nums">{{ tcPartFlash.current }} / {{ tcPartFlash.max }}</span>
          </div>
        </div>
      </Transition>
    </teleport>

    <!-- ═══════════ TC HP FLASH OVERLAY ═══════════ -->
    <teleport to="body">
      <Transition name="tc-hp-flash">
        <div v-if="tcHpFlash && questMode !== 'minimal'" class="tc-hp-flash-overlay" :class="tcHpFlash.type === 'heal' ? 'tc-hp-heal' : 'tc-hp-dmg'">
          <img v-if="selectedMonster" :src="getImg(selectedMonster.thumbnail)" class="tc-hp-monster-icon" />
          <span class="tc-hp-value">{{ tcHpFlash.type === 'heal' ? '+' : '−' }}{{ tcHpFlash.delta }}</span>
          <div v-if="tcHpFlash.prevHp !== null" class="tc-hp-bar-wrap">
            <div class="tc-hp-bar-track">
              <div
                class="tc-hp-bar-prev"
                :style="{ width: Math.min(100, (tcHpFlash.prevHp / tcHpFlash.maxHp) * 100) + '%' }"
              />
              <div
                class="tc-hp-bar-fill"
                :style="{ width: Math.min(100, (tcHpFlash.newHp / tcHpFlash.maxHp) * 100) + '%' }"
              />
            </div>
            <span class="tc-hp-bar-nums">{{ tcHpFlash.newHp }} / {{ tcHpFlash.maxHp }}</span>
          </div>
        </div>
      </Transition>
    </teleport>


    <!-- ═══════════ LAST DISCARD PREVIEW ═══════════ -->
    <teleport to="body">
      <Transition name="slain-fade">
        <div v-if="showLastDiscard && timeCardDiscard.length" class="ld-overlay" @click.self="showLastDiscard = false">
          <div class="ld-modal">
            <p class="ld-title">ใบล่าสุดที่ทิ้ง</p>
            <img :src="getImg(timeCardDiscard[0].card_img)" class="ld-card-img" />
            <p class="ld-card-name">{{ timeCardDiscard[0].card_name }}</p>
            <button class="ld-close" @click="showLastDiscard = false">ปิด</button>
          </div>
        </div>
      </Transition>
    </teleport>

    <!-- ═══════════ FLOATING TURN BAR ═══════════ -->
    <teleport to="body">
      <div
        v-if="questMode === 'full' && phase === 'huntingPanel' && (timeCardDeck.length > 0 || timeCardDiscard.length > 0) && !showResultAnim"
        class="float-turn-bar"
        :class="{ 'float-turn-bar-collapsed': floatBarCollapsed }"
      >
        <div v-if="floatBarCollapsed" class="float-status-label">{{ floatToggleLabel }}</div>

        <!-- Content (hidden when collapsed) -->
        <div v-show="!floatBarCollapsed">
        <!-- Outcome buttons (แสดงแทน จบเทิร์น เมื่อมีเงื่อนไข) -->
        <button
          v-if="floatOutcomeState === 'complete'"
          class="float-end-btn float-outcome-complete"
          :class="{ 'outcome-voted': room.myOutcomeVote === 'complete' }"
          @click="room.inRoom ? toggleVote('complete') : requestOutcome('complete')"
        >
          <span class="result-icon">✦</span> Quest Complete
          <span v-if="room.inRoom && Object.values(room.outcomeVotes ?? {}).filter(v => v === 'complete').length > 0" class="outcome-vote-count">
            {{ Object.values(room.outcomeVotes ?? {}).filter(v => v === 'complete').length }}/{{ room.hunterCount }}
          </span>
        </button>

        <button
          v-else-if="floatOutcomeState === 'failed'"
          class="float-end-btn float-outcome-fail"
          :class="{ 'outcome-voted': room.myOutcomeVote === 'fail' }"
          @click="room.inRoom ? toggleVote('fail') : requestOutcome('fail')"
        >
          <span class="result-icon">💀</span> Quest Failed
          <span v-if="room.inRoom && Object.values(room.outcomeVotes ?? {}).filter(v => v === 'fail').length > 0" class="outcome-vote-count">
            {{ Object.values(room.outcomeVotes ?? {}).filter(v => v === 'fail').length }}/{{ room.hunterCount }}
          </span>
        </button>

        <button
          v-else-if="floatOutcomeState === 'timeout'"
          class="float-end-btn float-outcome-timeout"
          :class="{ 'outcome-voted': room.myOutcomeVote === 'fail' }"
          @click="room.inRoom ? toggleVote('fail') : requestOutcome('fail')"
        >
          <span class="result-icon">⏱</span> Time Out
          <span v-if="room.inRoom && Object.values(room.outcomeVotes ?? {}).filter(v => v === 'fail').length > 0" class="outcome-vote-count">
            {{ Object.values(room.outcomeVotes ?? {}).filter(v => v === 'fail').length }}/{{ room.hunterCount }}
          </span>
        </button>

        <!-- End turn section (ปกติ) -->
        <template v-else>
          <!-- Activation counter -->
          <div v-if="activationLimit > 0 && currentBehaviorCard" class="float-act-bar">
            <div class="float-act-pips">
              <span
                v-for="i in activationLimit"
                :key="i"
                class="float-act-pip"
                :class="{ 'fpip-done': i <= activationRoundsCompleted }"
              ></span>
            </div>
            <span class="float-act-label">
              <template v-if="!monsterTurnReady">
                เหลืออีก <strong>{{ activationLimit - activationRoundsCompleted }}</strong> ครั้ง
              </template>
              <template v-else>✓ ครบแล้ว — กด Monster Turn</template>
            </span>
          </div>
          <!-- End turn button -->
          <button
            class="float-end-btn"
            :class="{ 'float-ended': myTurnEnded }"
            :disabled="myTurnEnded || !currentBehaviorCard || monsterTurnReady"
            @click="showConfirmTurn = true"
          >
            <span v-if="!currentBehaviorCard || monsterTurnReady">⚔ รอ Monster Turn</span>
            <span v-else-if="!myTurnEnded">🃏 จบเทิร์น</span>
            <span v-else>✓ รอคนอื่น</span>
          </button>
        </template>
        </div>
      </div>
    </teleport>

    <!-- ═══════════ PARTY STRIP (fixed right) ═══════════ -->
    <teleport to="body">
      <Transition name="slain-fade">
        <div
          v-if="questMode === 'full' && room.inRoom && phase === 'huntingPanel' && !showResultAnim"
          class="party-strip"
        >
          <div
            v-for="h in room.hunters"
            :key="h.hunter_id"
            class="party-member"
            :class="{
              'party-done':    !!room.tcTurnEnds?.[h.hunter_id]?.card,
              'party-pending': !!room.tcTurnEnds?.[h.hunter_id]?.pending,
              'party-me':      h.hunter_id === room.myHunterId
            }"
          >
            <div class="party-icon-wrap">
              <img
                v-if="getHunterClass(h.hunter_class_id)?.thumbnail"
                :src="getImg(getHunterClass(h.hunter_class_id).thumbnail)"
                class="party-icon-img"
              />
              <span class="party-status-dot">
                {{ room.tcTurnEnds?.[h.hunter_id]?.card ? '✓' : room.tcTurnEnds?.[h.hunter_id]?.pending ? '…' : '' }}
              </span>
            </div>
          </div>
        </div>
      </Transition>
    </teleport>

    <!-- ═══════════ MONSTER TURN CONFIRM ═══════════ -->
    <teleport to="body">
      <Transition name="slain-fade">
        <div v-if="showMonsterTurnConfirm" class="mtc-overlay" @click.self="showMonsterTurnConfirm = false">
          <div class="mtc-modal">
            <p class="mtc-title">⚔ Monster Turn</p>

            <!-- Back of next card -->
            <div v-if="nextBehaviorCard" class="mtc-card-wrap">
              <img :src="getImg(nextBehaviorCard.back_card_img)" class="mtc-card-img" />
            </div>

            <!-- Part break rules that give extra turns -->
            <div v-if="activationPartRules.length > 0" class="mtc-rules">
              <p class="mtc-rules-label">⚡ Part Break Effects</p>
              <p v-for="(rule, i) in activationPartRules" :key="i" class="mtc-rule-text">{{ rule }}</p>
            </div>

            <!-- Manual activation adjust -->
            <div v-if="activationPartRules.length > 0" class="mtc-adjust-wrap">
              <p class="mtc-adjust-label">เพิ่ม / ลด Hunter Turn</p>
              <div class="mtc-adjust-row">
                <button class="mtc-adj-btn" @click="pendingActivationAdjust--">−</button>
                <span class="mtc-adj-value" :class="pendingActivationAdjust > 0 ? 'mtc-adj-pos' : pendingActivationAdjust < 0 ? 'mtc-adj-neg' : ''">
                  {{ pendingActivationAdjust > 0 ? '+' : '' }}{{ pendingActivationAdjust }}
                </span>
                <button class="mtc-adj-btn" @click="pendingActivationAdjust++">+</button>
              </div>
            </div>

            <div class="mtc-btns">
              <button class="mtc-btn mtc-cancel" @click="showMonsterTurnConfirm = false; pendingActivationAdjust = 0">ยกเลิก</button>
              <button class="mtc-btn mtc-confirm" @click="showMonsterTurnConfirm = false; drawBehaviorCard()">ยืนยัน</button>
            </div>
          </div>
        </div>
      </Transition>
    </teleport>

    <!-- ═══════════ ADD HUNTER TURN CONFIRM ═══════════ -->
    <teleport to="body">
      <Transition name="slain-fade">
        <div v-if="showAddHunterTurnConfirm" class="mtc-overlay" @click.self="showAddHunterTurnConfirm = false">
          <div class="mtc-modal">
            <p class="mtc-title">+1 เทิร์น Hunter</p>
            <p class="aht-desc">
              เพิ่ม Hunter Turn สำหรับการ์ดนี้จาก
              <strong>{{ activationLimit }}</strong> เป็น <strong>{{ activationLimit + 1 }}</strong> เทิร์น
            </p>
            <div class="mtc-btns">
              <button class="mtc-btn mtc-cancel" @click="showAddHunterTurnConfirm = false">ยกเลิก</button>
              <button class="mtc-btn mtc-confirm" @click="showAddHunterTurnConfirm = false; addHostTurn()">ยืนยัน</button>
            </div>
          </div>
        </div>
      </Transition>
    </teleport>

    <!-- ═══════════ END TURN CONFIRM ═══════════ -->
    <teleport to="body">
      <Transition name="slain-fade">
        <div v-if="questMode === 'full' && showConfirmTurn" class="ct-overlay" @click.self="showConfirmTurn = false">
          <div class="ct-modal">
            <p class="ct-title">🃏 จบเทิร์น?</p>
            <p class="ct-sub">จั๋ว Time Card 1 ใบจากกอง (เหลือ {{ timeCardDeck.length }} ใบ)</p>
            <p v-if="activationLimit > 0" class="ct-act-hint">
              Hunter Turn {{ activationRoundsCompleted + 1 }} / {{ activationLimit }}
              — เหลืออีก <strong>{{ Math.max(0, activationLimit - activationRoundsCompleted - 1) }}</strong> ครั้งหลังกดนี้
            </p>
            <div class="ct-btns">
              <button class="ct-btn ct-confirm" @click="endTurn(); showConfirmTurn = false">ยืนยัน</button>
              <button class="ct-btn ct-cancel" @click="showConfirmTurn = false">ยกเลิก</button>
            </div>
          </div>
        </div>
      </Transition>
    </teleport>

    <!-- ═══════════ STATUS RESOLVE OVERLAY ═══════════ -->
    <teleport to="body">
      <Transition name="ma-trans">
        <div v-if="showStatusResolve" class="sr-overlay" @click="skipStatusResolve">
          <div class="sr-content">
            <p class="sr-label">✦ Status Effects Resolved</p>
            <div class="sr-list">
              <div v-for="sid in monsterAttackStatuses" :key="sid" class="sr-item">
                <img :src="getImg(getStatusEffect(sid)?.thumbnail)" class="sr-icon" />
                <div class="sr-info">
                  <span class="sr-name">{{ getStatusEffect(sid)?.effect_name }}</span>
                  <span class="sr-result">
                    <template v-if="sid === 2">Monster เสีย <strong>2 HP</strong></template>
                    <template v-else-if="sid === 5">เกราะทุกส่วน <strong>+1</strong> กลับสู่ปกติ</template>
                    <template v-else>ถูกล้างออก</template>
                  </span>
                </div>
                <span class="sr-check">✓</span>
              </div>
            </div>
            <p class="sr-hint">แตะเพื่อข้าม</p>
          </div>
        </div>
      </Transition>
    </teleport>

    <!-- ═══════════ MONSTER ATTACK OVERLAY ═══════════ -->
    <teleport to="body">
      <Transition name="ma-trans">
        <div v-if="showMonsterAttack" class="ma-overlay" @click="showMonsterAttack = false">
          <div class="ma-content">
            <p class="ma-label">⚔ Monster Attack!</p>
            <div class="ma-card-flip">
              <div class="ma-card-inner">
                <div class="ma-card-back">
                  <img v-if="monsterAttackCard" :src="getImg(monsterAttackCard.back_card_img)" class="ma-card-img" />
                </div>
                <div class="ma-card-front">
                  <img v-if="monsterAttackCard" :src="getImg(monsterAttackCard.front_card_img)" class="ma-card-img" />
                </div>
              </div>
            </div>
            <p v-if="monsterAttackCard" class="ma-card-name">{{ monsterAttackCard.behavior_name }}</p>
            <p class="ma-hint">แตะเพื่อปิด</p>
          </div>
        </div>
      </Transition>
    </teleport>

    <!-- ═══════════ SPECIAL CARD SELECT (Host only) ═══════════ -->
    <teleport to="body">
      <Transition name="slain-fade">
        <div v-if="showSpecialCardSelect" class="scs-overlay">
          <div class="scs-modal">
            <p class="scs-title">⚔ เลือก Special Attack Card</p>
            <p class="scs-sub">Host เลือกการ์ด Special Attack ของ {{ selectedMonster?.monster_name }}</p>
            <p class="scs-scoutfly">
              🪰 Scoutfly Level รวม: <strong>{{ _pendingTokenTotal }}</strong>
              <span v-if="selectedQuest?.scoutfly_level"> (เกณฑ์ {{ selectedQuest.scoutfly_level[0] }} - {{ selectedQuest.scoutfly_level[1] }})</span>
            </p>
            <div class="scs-options">
              <button
                v-for="opt in specialCardSelectOptions"
                :key="opt.card.behavior_id"
                class="scs-option"
                @click="selectSpecialAttackCard(opt.card)"
              >
                <img :src="getImg(opt.card.front_card_img)" class="scs-card-img" />
                <span class="scs-card-name">{{ opt.card.behavior_name }}</span>
                <span class="scs-card-hint">
                  🪰 ถ้าได้ {{ opt.tiers.map(scoutflyTierLabel).join(' หรือ ') }} ให้เลือกใบนี้
                </span>
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </teleport>

    <!-- ═══════════ WAITING FOR HOST SPECIAL CARD (Guest) ═══════════ -->
    <teleport to="body">
      <Transition name="slain-fade">
        <div v-if="awaitingHostDeckBuild" class="scs-overlay">
          <div class="scs-modal scs-waiting-modal">
            <div class="scs-waiting-spinner"></div>
            <p class="scs-title">⌛ รอ Host เลือก Special Attack Card</p>
            <p class="scs-sub">Host กำลังเลือกการ์ด Special Attack ของ {{ selectedMonster?.monster_name }} อยู่...</p>
          </div>
        </div>
      </Transition>
    </teleport>

    <!-- ═══════════ SPECIAL CARD CONFIRM (Host only) ═══════════ -->
    <teleport to="body">
      <Transition name="slain-fade">
        <div v-if="showSpecialCardConfirm" class="mtc-overlay" @click.self="showSpecialCardConfirm = false">
          <div class="mtc-modal">
            <p class="mtc-title">⚔ ยืนยันการเลือกการ์ด</p>
            <div v-if="_pendingSpecialCardChoice" class="scs-confirm-card-wrap">
              <img :src="getImg(_pendingSpecialCardChoice.front_card_img)" class="scs-confirm-card-img" />
              <span class="scs-confirm-card-name">{{ _pendingSpecialCardChoice.behavior_name }}</span>
            </div>
            <p class="aht-desc">ยืนยันเลือกการ์ดนี้เป็น Special Attack Card ของ Monster ตัวนี้ใช่ไหม?</p>
            <div class="mtc-btns">
              <button class="mtc-btn mtc-cancel" @click="showSpecialCardConfirm = false">ยกเลิก</button>
              <button class="mtc-btn mtc-confirm" @click="confirmSpecialAttackCard">ยืนยัน</button>
            </div>
          </div>
        </div>
      </Transition>
    </teleport>

    <!-- ═══════════ SPECIAL CARD OVERLAY ═══════════ -->
    <teleport to="body">
      <Transition name="slain-fade">
        <div v-if="questMode !== 'minimal' && showSpecialCardOverlay" class="sc-overlay" @click="showSpecialCardOverlay = false; phase = 'huntingPanel'">
          <div class="sc-content">
            <p class="sc-label">⚔ Special Attack Added!</p>
            <div class="sc-card">
              <img v-if="specialCardOverlayCard" :src="getImg(specialCardOverlayCard.front_card_img)" class="sc-card-img" />
            </div>
            <p v-if="specialCardOverlayCard" class="sc-card-name">{{ specialCardOverlayCard.behavior_name }}</p>
            <p class="sc-hint">แตะเพื่อเริ่มการต่อสู้</p>
          </div>
        </div>
      </Transition>
    </teleport>

    <!-- ═══════════ TOKEN REVEAL OVERLAY ═══════════ -->
    <teleport to="body">
      <transition name="slain-fade">
        <div v-if="showTokenReveal" class="tr-overlay" @click="if (tokenRevealDone) { showTokenReveal = false; phase = 'hunting' }">
          <p class="tr-title">🔍 Track Token</p>
          <div class="tr-tokens">
            <div
              v-for="token in tokenRevealVisual"
              :key="token.id"
              class="tr-token"
              :class="{ flipped: token.showValue }"
            >
              <div class="tr-token-inner">
                <div class="tr-token-back">?</div>
                <div class="tr-token-front" :class="token.value > 0 ? 'val-pos' : token.value < 0 ? 'val-neg' : 'val-zero'">
                  {{ token.value > 0 ? '+' : '' }}{{ token.value }}
                </div>
              </div>
            </div>
          </div>
          <transition name="slain-fade">
            <div v-if="tokenRevealDone" class="tr-total-wrap">
              <p class="tr-total-label">รวม</p>
              <p class="tr-total" :class="tokenRevealTotal > 0 ? 'val-pos' : tokenRevealTotal < 0 ? 'val-neg' : 'val-zero'">
                {{ tokenRevealTotal > 0 ? '+' : '' }}{{ tokenRevealTotal }}
              </p>
              <p class="tr-hint">แตะเพื่อดำเนินต่อ</p>
            </div>
          </transition>
        </div>
      </transition>
    </teleport>

    <!-- ═══════════ BATTLE INTRO CINEMATIC ═══════════ -->
    <teleport to="body">
      <div
        v-if="showBattleIntro"
        :key="battleIntroKey"
        class="battle-intro-overlay"
        :class="`bi-${battleIntroPhase}`"
      >
        <!-- Red flash -->
        <div class="bi-flash"></div>

        <!-- Speed lines -->
        <div class="bi-speed-lines"></div>

        <!-- Letterbox bars -->
        <div class="bi-bar bi-bar-top"></div>
        <div class="bi-bar bi-bar-bottom"></div>

        <!-- Monster slam -->
        <div class="bi-monster-wrap">
          <div class="bi-impact-ring"></div>
          <img :src="getImg(selectedMonster.thumbnail)" class="bi-monster-img" />
          <div class="bi-monster-glow"></div>
        </div>

        <!-- Text block -->
        <div class="bi-text-wrap">
          <p class="bi-line-danger">⚠ DANGER ⚠</p>
          <p class="bi-line-main">การต่อสู้กำลังจะเริ่มขึ้น</p>
          <p class="bi-line-sub">{{ selectedMonster.monster_name }}</p>
        </div>

        <!-- Impact white flash -->
        <div class="bi-impact-flash"></div>

        <!-- Vignette -->
        <div class="bi-vignette"></div>
      </div>
    </teleport>

    <!-- ═══════════ VOTE CONFIRM MODAL (Co-op) ═══════════ -->
    <teleport to="body">
      <transition name="slain-fade">
        <div v-if="pendingVoteType" class="outcome-confirm-overlay" @click.self="cancelVote">
          <div class="outcome-confirm-modal" :class="pendingVoteType === 'complete' ? 'ocm-complete' : 'ocm-fail'">
            <div class="am-stamp ocm-stamp">VOTE</div>
            <p class="ocm-question">ยืนยันการ Vote หรือไม่?</p>
            <p class="ocm-desc">
              {{ pendingVoteType === 'complete'
                ? 'Vote Quest Complete — มอนสเตอร์ถูกสังหาร'
                : 'Vote Quest Failed / Time Out — การล่าสิ้นสุดลง' }}
            </p>
            <div class="am-buttons">
              <button
                class="am-btn-confirm ocm-btn-result"
                :class="pendingVoteType === 'complete' ? 'ocm-result-complete' : 'ocm-result-fail'"
                @click="confirmVote"
              >
                {{ pendingVoteType === 'complete' ? '✦ Vote Complete' : '✕ Vote Failed' }}
              </button>
              <button class="am-btn-cancel" @click="cancelVote">← ยกเลิก</button>
            </div>
          </div>
        </div>
      </transition>
    </teleport>

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
        :class="[`ra-${resultAnimType}`, { 'ra-dismissing': isDismissing }]"
        @click="resultAnimType === 'fail' ? dismissResult() : null"
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

        <p v-if="resultAnimType === 'fail'" class="ra-tap-hint">Tap anywhere to continue</p>
      </div>
    </teleport>

    <!-- ═══════════ PACK DRAWER ═══════════ -->
    <teleport to="body">
      <transition name="pack-drawer">
        <div v-if="showPackDrawer" class="pack-drawer-wrapper">
          <div class="pack-backdrop" @click="showPackDrawer = false"></div>

          <div class="pack-drawer">
            <!-- Header -->
            <div class="pack-drawer-header">
              <span class="pack-drawer-title">🎒 Supply Pack</span>
              <button class="pack-drawer-close" @click="showPackDrawer = false">✕</button>
            </div>

            <!-- Tabs -->
            <div class="pack-tabs">
              <button
                class="pack-tab"
                :class="{ active: packDrawerTab === 'pack' }"
                @click="packDrawerTab = 'pack'"
              >Pack</button>
              <button
                class="pack-tab"
                :class="{ active: packDrawerTab === 'add' }"
                @click="packDrawerTab = 'add'"
              >+ Add Item</button>
            </div>

            <!-- Tab: Pack (current inventory) -->
            <div v-if="packDrawerTab === 'pack'" class="pack-content">
              <div v-if="!packInventory.length" class="pack-empty">
                <p>Supply pack is empty.</p>
                <button class="pack-goto-add" @click="packDrawerTab = 'add'">+ Add Item</button>
              </div>
              <div v-for="group in packInventory" :key="group.resource_type" class="pack-group">
                <div class="pack-group-label">{{ group.resource_type }}</div>
                <div
                  v-for="item in group.items"
                  :key="`${item.resource_type_id}-${item.item_id}`"
                  class="pack-item"
                >
                  <img :src="getImg(item.thumbnail)" class="pack-item-img" />
                  <span class="pack-item-name">{{ item.item }}</span>
                  <div class="pack-item-ctrl">
                    <button class="pctrl-btn" @click="changePackQty(item, -1)">−</button>
                    <span class="pctrl-qty">{{ item.quantity }}</span>
                    <button class="pctrl-btn" @click="changePackQty(item, 1)">+</button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Tab: Add Item -->
            <div v-if="packDrawerTab === 'add'" class="pack-content">
              <input
                v-model="packSearch"
                class="pack-search"
                placeholder="Search items..."
              />
              <div class="pack-add-grid">
                <div
                  v-for="item in packAvailable"
                  :key="`${item.resource_type_id}-${item.item_id}`"
                  class="pack-add-item"
                >
                  <img :src="getImg(item.thumbnail)" class="pack-item-img" />
                  <span class="pack-item-name">{{ item.item }}</span>
                  <div class="pack-item-ctrl">
                    <button class="pctrl-btn" @click="packSelectItem(item, -1)">−</button>
                    <span class="pctrl-qty">{{ packSelectedQty(item) }}</span>
                    <button class="pctrl-btn" @click="packSelectItem(item, 1)">+</button>
                  </div>
                </div>
                <div v-if="!packAvailable.length" class="pack-empty">
                  <p>{{ packSearch ? 'No results' : 'All items owned' }}</p>
                </div>
              </div>
              <div class="pack-add-footer">
                <button
                  class="pack-confirm-btn"
                  :disabled="!packSelectedItems.length"
                  @click="packConfirmAdd"
                >
                  ✓ เพิ่ม {{ packSelectedItems.length }} รายการ
                </button>
              </div>
            </div>
          </div>
        </div>
      </transition>
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
.book-wip {
  cursor: not-allowed;
  filter: grayscale(60%) brightness(0.7);
  border-color: rgba(124,90,43,0.3);
}
.book-wip:hover { transform: none !important; box-shadow: 0 4px 20px rgba(0,0,0,0.6) !important; }
.book-wip-overlay {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background: rgba(0,0,0,0.45);
}
.book-wip-icon { font-size: 28px; }
.book-wip-text {
  font-size: 12px;
  letter-spacing: 3px;
  color: rgba(200,155,60,0.7);
  text-transform: uppercase;
  font-weight: bold;
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

.wanted-card.monster-wip {
  cursor: not-allowed;
  filter: grayscale(70%) brightness(0.6);
}
.wanted-card.monster-wip:hover {
  border-color: #7c5a2b;
  box-shadow: none;
  transform: none;
}
.monster-wip-overlay {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0,0,0,0.35);
}
.monster-wip-icon { font-size: 22px; }

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
.scroll-card.scroll-cleared {
  opacity: 0.35;
  filter: grayscale(80%);
  cursor: not-allowed;
  pointer-events: none;
}
.cleared-notice { color: #6a9a5a !important; }
.scroll-card.scroll-exhausted {
  border-color: rgba(200,140,40,0.45);
  cursor: pointer;
}
.scroll-card.scroll-exhausted:hover { border-color: #c89b3c; background: rgba(30,20,8,0.9); }

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
.exhausted-banner { border-color: rgba(200,80,80,0.4) !important; background: linear-gradient(to bottom,#1e0e0e,#150b0b) !important; }
.exhausted-tab { background: #2a0e0e !important; border-color: rgba(200,80,80,0.4) !important; color: #ff6b6b !important; }
.exhausted-banner .scroll-flavor-title { color: #ff9090; }
.exhausted-banner .scroll-flavor-body { color: #c08080; -webkit-line-clamp: 4; line-clamp: 4; }

/* Handler Start — dialog picker */
.hs-pick-label { font-size: 12px; color: #a07840; text-align: center; font-style: italic; margin: 0; }
.hs-dialog-list { display: flex; flex-direction: column; gap: 10px; }
.hs-dialog-card {
  padding: 14px 16px; border-radius: 8px; cursor: pointer; transition: all 0.15s;
  border: 1px solid rgba(124,90,43,0.4); background: rgba(14,10,4,0.8);
}
.hs-dialog-card:hover { border-color: #c89b3c; background: rgba(40,28,10,0.9); box-shadow: 0 0 14px rgba(200,155,60,0.15); }
.hs-dialog-index { font-size: 10px; letter-spacing: 3px; color: #c89b3c; text-transform: uppercase; margin-bottom: 4px; }
.hs-dialog-title { font-size: 14px; font-weight: bold; color: #ffd27a; margin-bottom: 4px; }
.hs-dialog-sub { font-size: 11px; color: #a08050; line-height: 1.5; }

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
  width: 24px;
  height: 24px;
  object-fit: contain;
}

/* ── Monster Turn Confirm Modal ── */
.mtc-overlay {
  position: fixed;
  inset: 0;
  z-index: 3100;
  background: rgba(0,0,0,0.72);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.mtc-modal {
  background: rgba(20,10,5,0.98);
  border: 1px solid rgba(180,60,60,0.4);
  border-radius: 16px;
  padding: 20px 18px;
  width: 100%;
  max-width: 340px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  box-shadow: 0 8px 40px rgba(0,0,0,0.7);
}
.mtc-title {
  font-size: 14px;
  font-weight: bold;
  color: rgba(220,120,120,0.9);
  letter-spacing: 2px;
  text-transform: uppercase;
  margin: 0;
}
.mtc-card-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
.mtc-card-img {
  width: 180px;
  border-radius: 10px;
  border: 1px solid rgba(180,60,60,0.3);
  box-shadow: 0 4px 16px rgba(0,0,0,0.6);
}
.mtc-card-name {
  font-size: 11px;
  color: rgba(200,130,130,0.6);
  margin: 0;
}
.mtc-rules {
  width: 100%;
  background: rgba(180,60,60,0.08);
  border: 1px solid rgba(180,60,60,0.25);
  border-radius: 8px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.mtc-rules-label {
  font-size: 10px;
  color: rgba(220,120,80,0.8);
  text-transform: uppercase;
  letter-spacing: 1px;
  margin: 0 0 4px;
}
.mtc-rule-text {
  font-size: 12px;
  color: rgba(230,190,150,0.85);
  margin: 0;
  line-height: 1.5;
}
.mtc-adjust-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.mtc-adjust-label {
  font-size: 10px;
  color: rgba(200,155,60,0.6);
  text-transform: uppercase;
  letter-spacing: 2px;
  margin: 0;
}
.mtc-adjust-row {
  display: flex;
  align-items: center;
  gap: 16px;
}
.mtc-adj-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 1px solid rgba(200,155,60,0.4);
  background: rgba(40,28,12,0.8);
  color: rgba(200,155,60,0.9);
  font-size: 20px;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.15s;
  display: flex;
  align-items: center;
  justify-content: center;
}
.mtc-adj-btn:hover {
  border-color: rgba(200,155,60,0.8);
  background: rgba(60,40,12,0.9);
}
.mtc-adj-value {
  font-size: 28px;
  font-weight: bold;
  color: rgba(230,185,80,1);
  min-width: 50px;
  text-align: center;
  line-height: 1;
}
.mtc-adj-pos { color: rgba(100,220,120,1); }
.mtc-adj-neg { color: rgba(220,100,100,1); }
.mtc-btns {
  display: grid;
  grid-template-columns: 1fr 2fr;
  gap: 8px;
  width: 100%;
}
.mtc-btn {
  padding: 11px;
  border-radius: 8px;
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}
.mtc-cancel {
  background: rgba(40,20,10,0.7);
  border: 1px solid rgba(180,60,60,0.2);
  color: rgba(200,130,130,0.6);
}
.mtc-cancel:hover {
  border-color: rgba(180,60,60,0.5);
  color: rgba(200,130,130,0.9);
}
.mtc-confirm {
  background: rgba(120,30,30,0.3);
  border: 1px solid rgba(200,60,60,0.6);
  color: rgba(230,140,140,1);
  font-weight: bold;
  letter-spacing: 1px;
}
.mtc-confirm:hover {
  background: rgba(140,40,40,0.5);
  border-color: rgba(220,80,80,0.9);
}

/* ── Co-op Quest Mode Modal ── */
.cqm-overlay {
  position: fixed;
  inset: 0;
  z-index: 3100;
  background: rgba(0,0,0,0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.cqm-modal {
  background: rgba(28,18,8,0.98);
  border: 1px solid rgba(200,155,60,0.35);
  border-radius: 16px;
  padding: 24px 20px;
  width: 100%;
  max-width: 380px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  box-shadow: 0 8px 40px rgba(0,0,0,0.6);
}
.cqm-title {
  font-size: 13px;
  color: rgba(200,155,60,0.7);
  text-transform: uppercase;
  letter-spacing: 2px;
  margin: 0;
  text-align: center;
}
.cqm-actions {
  display: grid;
  grid-template-columns: 1fr 2fr;
  gap: 8px;
}
.coop-mode-cancel {
  padding: 10px;
  background: rgba(60,40,20,0.6);
  border: 1px solid rgba(180,130,60,0.2);
  border-radius: 8px;
  color: rgba(200,155,60,0.6);
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}
.coop-mode-cancel:hover {
  border-color: rgba(180,130,60,0.4);
  color: rgba(200,155,60,0.9);
}
.coop-mode-confirm {
  padding: 10px;
  background: rgba(180,130,60,0.15);
  border: 1px solid rgba(200,155,60,0.5);
  border-radius: 8px;
  color: rgba(230,185,80,1);
  font-family: inherit;
  font-size: 14px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s;
}
.coop-mode-confirm:hover {
  background: rgba(180,130,60,0.3);
  border-color: rgba(220,175,80,0.8);
}

/* ── Quest Mode Selector ── */
.qmode-selector {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.qmode-label {
  font-size: 11px;
  color: rgba(200,155,60,0.6);
  text-transform: uppercase;
  letter-spacing: 2px;
  margin: 0;
  text-align: center;
}
.qmode-options {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.qmode-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 12px 10px;
  background: rgba(20,15,8,0.8);
  border: 1px solid rgba(200,155,60,0.2);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
  font-family: inherit;
}
.qmode-btn:hover {
  border-color: rgba(200,155,60,0.5);
  background: rgba(40,28,12,0.9);
}
.qmode-active {
  border-color: #c89b3c !important;
  background: rgba(200,155,60,0.12) !important;
  box-shadow: 0 0 12px rgba(200,155,60,0.25);
}
.qmode-icon {
  font-size: 20px;
}
.qmode-name {
  font-size: 14px;
  font-weight: bold;
  color: #c89b3c;
  letter-spacing: 1px;
}
.qmode-desc {
  font-size: 10px;
  color: rgba(200,155,60,0.5);
  text-align: center;
  line-height: 1.4;
}
.qmode-active .qmode-name { color: #ffd27a; }
.qmode-active .qmode-desc { color: rgba(255,210,122,0.7); }

/* ═══════ HQ Vote Phase ═══════ */
.phase-hq-vote {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 4px 0;
  color: #f0ddb0;
  font-family: 'Georgia', serif;
}
.hqv-header { display: flex; align-items: center; gap: 10px; }
.hqv-line { flex: 1; height: 1px; background: linear-gradient(to right, transparent, #7c5a2b); }
.hqv-line:last-child { background: linear-gradient(to left, transparent, #7c5a2b); }
.hqv-title { font-size: 12px; letter-spacing: 3px; color: #c89b3c; white-space: nowrap; text-transform: uppercase; }
.hqv-monster-row { display: flex; align-items: center; gap: 14px; padding: 10px 14px; border-radius: 8px; background: rgba(20,14,6,0.8); border: 1px solid rgba(124,90,43,0.3); }
.hqv-monster-img { width: 50px; height: 50px; object-fit: contain; filter: drop-shadow(0 0 4px rgba(0,0,0,0.6)); }
.hqv-target-label { font-size: 9px; letter-spacing: 3px; color: #7c5a2b; text-transform: uppercase; margin: 0; }
.hqv-monster-name { font-size: 16px; color: #ffd27a; font-weight: bold; margin: 0; }
.hqv-choices { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.hqv-btn {
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  padding: 18px 10px; border-radius: 12px;
  border: 2px solid; cursor: pointer; transition: all 0.2s;
  font-family: 'Georgia', serif;
  background: rgba(10,8,4,0.8);
}
.hqv-btn-hq { border-color: rgba(200,155,60,0.5); }
.hqv-btn-hq:hover { border-color: #c89b3c; background: rgba(40,28,8,0.9); box-shadow: 0 0 16px rgba(200,155,60,0.2); }
.hqv-btn-quest { border-color: rgba(200,80,80,0.5); }
.hqv-btn-quest:hover { border-color: #cc4444; background: rgba(40,14,14,0.9); box-shadow: 0 0 16px rgba(200,60,60,0.2); }
.hqv-btn-icon { font-size: 26px; }
.hqv-hq-icon { width: 28px; height: 28px; object-fit: contain; filter: brightness(0) invert(1); }
.hqv-quest-icon { width: 28px; height: 28px; object-fit: contain; }

/* HQ Vote Confirm Modal */
.hqvc-overlay { position: fixed; inset: 0; background: rgba(5,4,2,0.75); backdrop-filter: blur(8px) brightness(0.5); display: flex; justify-content: center; align-items: center; z-index: 400; padding: 16px; }
.hqvc-modal { width: min(320px,100%); padding: 24px 20px; border-radius: 12px; background: linear-gradient(160deg,#1c1508,#13100a); border: 1px solid rgba(124,90,43,0.5); box-shadow: 0 0 40px rgba(0,0,0,0.9); display: flex; flex-direction: column; gap: 16px; align-items: center; font-family: 'Georgia',serif; animation: hqModalIn 0.2s cubic-bezier(0.34,1.56,0.64,1); }
.hqvc-title { font-size: 12px; letter-spacing: 3px; color: #c89b3c; text-transform: uppercase; margin: 0; }
.hqvc-choice { display: flex; align-items: center; gap: 12px; padding: 14px 20px; border-radius: 10px; border: 2px solid; width: 100%; }
.hqvc-hq { border-color: rgba(200,155,60,0.6); background: rgba(40,28,8,0.8); }
.hqvc-quest { border-color: rgba(200,80,80,0.5); background: rgba(40,14,14,0.8); }
.hqvc-icon { width: 32px; height: 32px; object-fit: contain; }
.hqvc-icon-white { filter: brightness(0) invert(1); }
.hqvc-label { font-size: 16px; font-weight: bold; color: #f0ddb0; letter-spacing: 1px; }
.hqvc-btns { display: flex; gap: 10px; width: 100%; }
.hqvc-btn-confirm { flex: 1; padding: 12px; border-radius: 8px; border: 2px solid #c89b3c; background: linear-gradient(to bottom,#3a2a10,#1a1308); color: #ffd27a; font-family: 'Georgia',serif; font-size: 14px; font-weight: bold; cursor: pointer; transition: 0.2s; }
.hqvc-btn-confirm:hover { box-shadow: 0 0 14px rgba(200,155,60,0.4); }
.hqvc-btn-cancel { flex: 1; padding: 12px; border-radius: 8px; border: 1px solid rgba(124,90,43,0.3); background: rgba(10,8,4,0.6); color: #7c5a2b; font-family: 'Georgia',serif; font-size: 13px; cursor: pointer; transition: 0.2s; }
.hqvc-btn-cancel:hover { border-color: rgba(124,90,43,0.6); color: #c89b3c; }
.hqv-btn-label { font-size: 14px; font-weight: bold; color: #f0ddb0; letter-spacing: 1px; }
.hqv-btn-sub { font-size: 10px; color: #7c5a2b; font-style: italic; }
.hqv-waiting { text-align: center; padding: 16px; border-radius: 10px; background: rgba(10,8,4,0.7); border: 1px solid rgba(124,90,43,0.3); }
.hqv-voted-label { margin: 0 0 4px; font-size: 14px; color: #f0ddb0; }
.hqv-voted-label strong { color: #ffd27a; }
.hqv-waiting-sub { margin: 0; font-size: 12px; color: #7c5a2b; font-style: italic; }
.hqv-party-votes { display: flex; flex-direction: column; gap: 6px; }
.hqv-vote-row { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; border-radius: 8px; background: rgba(14,10,4,0.7); border: 1px solid rgba(90,61,31,0.3); }
.hqv-hunter-name { font-size: 13px; color: #e0c88a; font-weight: bold; }
.hqv-vote-pill { font-size: 11px; padding: 3px 10px; border-radius: 12px; }
.hqv-vote-hq { background: rgba(200,155,60,0.15); border: 1px solid rgba(200,155,60,0.4); color: #ffd27a; }
.hqv-vote-quest { background: rgba(200,80,80,0.12); border: 1px solid rgba(200,80,80,0.4); color: #ff9090; }
.hqv-vote-pending { background: rgba(60,60,60,0.2); border: 1px solid rgba(90,90,90,0.3); color: #5a5a5a; }
.hqv-tiebreak { text-align: center; padding: 14px 12px; border-radius: 10px; background: rgba(20,12,4,0.85); border: 1px solid rgba(200,155,60,0.4); display: flex; flex-direction: column; align-items: center; gap: 8px; }
.hqv-tie-label { margin: 0; font-size: 16px; font-weight: bold; color: #ffd27a; letter-spacing: 1px; }
.hqv-tie-sub { margin: 0; font-size: 12px; color: #a07840; font-style: italic; }
.hqv-tiebreak .hqv-choices { width: 100%; }

/* HQ Phase container */
.phase-hq { padding: 4px 0; }

.embark-mode-row {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
}

.btn-solo {
  border-color: #c89b3c;
  color: #ffd27a;
}

.btn-coop {
  border-color: #5a9fff;
  background: linear-gradient(to bottom, #1a2c3a, #0d1520);
  color: #7ab3ff;
}
.btn-coop:hover {
  background: linear-gradient(to bottom, #1e3448, #101c28);
  box-shadow: 0 0 20px rgba(90,159,255,0.5);
  transform: translateY(-2px);
}

/* ── Join Quest bar ── */
.join-quest-bar {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 14px;
  border-radius: 10px;
  background: rgba(60,100,200,0.06);
  border: 1px solid rgba(60,100,200,0.2);
}
.join-quest-entry {
  display: flex;
  justify-content: center;
}
.reconnect-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 8px;
  background: rgba(60, 100, 200, 0.08);
  border: 1px solid rgba(60, 100, 200, 0.3);
  width: 100%;
}
.reconnect-label {
  font-size: 11px;
  color: #7ab3ff;
  white-space: nowrap;
}
.reconnect-code {
  font-family: monospace;
  font-size: 16px;
  font-weight: bold;
  color: #ffd27a;
  letter-spacing: 3px;
  flex: 1;
}
.reconnect-btn {
  padding: 5px 14px;
  border-radius: 6px;
  border: 1px solid rgba(90,159,255,0.5);
  background: rgba(60,100,200,0.15);
  color: #7ab3ff;
  font-size: 12px;
  font-weight: bold;
  cursor: pointer;
  font-family: inherit;
  transition: 0.15s;
  white-space: nowrap;
}
.reconnect-btn:hover:not(:disabled) { background: rgba(60,100,200,0.3); }
.reconnect-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.reconnect-clear {
  background: none;
  border: none;
  color: rgba(124,90,43,0.5);
  cursor: pointer;
  font-size: 13px;
  padding: 2px 4px;
  transition: color 0.15s;
}
.reconnect-clear:hover { color: #ff6b6b; }

.join-quest-btn {
  background: none;
  border: 1px dashed rgba(90,159,255,0.4);
  border-radius: 8px;
  color: #7ab3ff;
  font-size: 13px;
  padding: 10px 24px;
  cursor: pointer;
  font-family: inherit;
  letter-spacing: 1px;
  transition: 0.2s;
}
.join-quest-btn:hover { background: rgba(60,100,200,0.1); border-style: solid; }

.join-quest-form {
  display: flex;
  gap: 8px;
  align-items: center;
}
.join-code-input {
  flex: 1;
  background: rgba(0,0,0,0.4);
  border: 1px solid rgba(90,159,255,0.4);
  border-radius: 6px;
  color: #7ab3ff;
  font-size: 18px;
  font-weight: bold;
  letter-spacing: 6px;
  text-align: center;
  padding: 8px;
  font-family: monospace;
  text-transform: uppercase;
}
.join-code-input:focus { outline: none; border-color: #5a9fff; }

.join-submit-btn {
  padding: 8px 16px;
  border-radius: 6px;
  border: 1px solid rgba(90,159,255,0.5);
  background: rgba(60,100,200,0.15);
  color: #7ab3ff;
  font-family: inherit;
  cursor: pointer;
  transition: 0.15s;
}
.join-submit-btn:hover:not(:disabled) { background: rgba(60,100,200,0.3); }
.join-submit-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.join-cancel-btn {
  background: none;
  border: none;
  color: #7c5a2b;
  font-size: 12px;
  cursor: pointer;
  font-family: inherit;
}

.join-quest-inroom {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: #7ab3ff;
}
.join-quest-icon { font-size: 16px; }
.join-room-count {
  margin-left: auto;
  font-size: 11px;
  color: #7cfc00;
}
.join-leave-btn {
  background: none;
  border: 1px solid rgba(180,60,60,0.4);
  border-radius: 4px;
  color: #ff6b6b;
  font-size: 11px;
  padding: 3px 10px;
  cursor: pointer;
  font-family: inherit;
  transition: 0.15s;
}
.join-leave-btn:hover { background: rgba(180,60,60,0.15); }

.join-error {
  font-size: 11px;
  color: #ff6b6b;
  margin: 0;
  text-align: center;
}

/* ══════════════════════════════════════════
   DIALOG PHASE
══════════════════════════════════════════ */
.phase-dialog {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ── Dialog Resource Panel ── */
/* ── Special Card Overlay ── */
.sc-overlay {
  position: fixed; inset: 0;
  background: rgba(5,2,0,0.92);
  backdrop-filter: blur(6px);
  z-index: 488;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
}
.sc-content {
  display: flex; flex-direction: column;
  align-items: center; gap: 14px;
}
.sc-label {
  font-size: 13px; letter-spacing: 5px; color: #ffd27a;
  text-transform: uppercase; margin: 0;
  text-shadow: 0 0 12px rgba(255,210,122,0.6);
}
.sc-card {
  border-radius: 10px; overflow: hidden;
  border: 2px solid #c89b3c;
  box-shadow: 0 0 40px rgba(200,155,60,0.5);
  animation: sc-pop 0.5s cubic-bezier(0.2,1.4,0.4,1) forwards;
}
@keyframes sc-pop {
  0%   { transform: scale(0.5); opacity: 0; }
  100% { transform: scale(1);   opacity: 1; }
}
.sc-card-img {
  width: min(320px, 85vw);
  height: auto;
  display: block;
}
.sc-card-name { font-size: 18px; font-weight: bold; color: #ffd27a; margin: 0; letter-spacing: 2px; }
.sc-hint { font-size: 10px; color: rgba(124,90,43,0.5); letter-spacing: 2px; margin: 0; animation: cml-pulse 1.5s ease-in-out infinite; }

/* ── Special Card Select Modal ── */
.scs-overlay {
  position: fixed; inset: 0;
  background: rgba(5,2,0,0.92);
  backdrop-filter: blur(6px);
  z-index: 489;
  display: flex; align-items: center; justify-content: center;
  padding: 20px;
}
.scs-modal {
  display: flex; flex-direction: column; align-items: center; gap: 14px;
  background: rgba(20,14,8,0.9);
  border: 1px solid rgba(200,155,60,0.4);
  border-radius: 14px;
  padding: 24px;
  max-width: 560px;
  width: 100%;
}
.scs-title { font-size: 18px; font-weight: bold; color: #ffd27a; margin: 0; letter-spacing: 2px; text-align: center; }
.scs-sub { font-size: 13px; color: #c8b89a; margin: 0; text-align: center; }
.scs-scoutfly { font-size: 13px; color: #9adfff; margin: 0; text-align: center; }
.scs-scoutfly strong { color: #ffe08a; }
.scs-options {
  display: flex; flex-wrap: wrap; justify-content: center; gap: 16px;
  width: 100%;
}
.scs-option {
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  background: rgba(255,255,255,0.04);
  border: 2px solid rgba(200,155,60,0.35);
  border-radius: 10px;
  padding: 10px;
  cursor: pointer;
  transition: 0.2s;
  flex: 1 1 140px;
  max-width: 180px;
}
.scs-option:hover {
  border-color: rgba(255,210,122,0.9);
  box-shadow: 0 0 20px rgba(255,210,122,0.4);
  transform: translateY(-2px);
}
.scs-card-img { width: 100%; max-width: 140px; height: auto; border-radius: 6px; display: block; }
.scs-card-name { font-size: 13px; font-weight: bold; color: #ffd27a; text-align: center; }
.scs-card-hint { font-size: 11px; color: #9adfff; text-align: center; line-height: 1.4; }
.scs-confirm-card-wrap { display: flex; flex-direction: column; align-items: center; gap: 8px; margin-bottom: 8px; }
.scs-confirm-card-img { width: min(220px, 70vw); height: auto; border-radius: 8px; border: 2px solid #c89b3c; box-shadow: 0 0 20px rgba(200,155,60,0.4); }
.scs-confirm-card-name { font-size: 15px; font-weight: bold; color: #ffd27a; }
.scs-waiting-modal { gap: 18px; }
.scs-waiting-spinner {
  width: 44px; height: 44px;
  border: 4px solid rgba(255,210,122,0.2);
  border-top-color: #ffd27a;
  border-radius: 50%;
  animation: scs-spin 1s linear infinite;
}
@keyframes scs-spin { to { transform: rotate(360deg); } }

/* ── Current Attack Card (below msc-wrap) ── */
.current-attack-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 10px;
  border-radius: 8px;
  background: rgba(140,58,58,0.08);
  border: 1px solid rgba(180,60,60,0.3);
}
.cac-label {
  font-size: 10px;
  letter-spacing: 2px;
  color: #ff6b6b;
  text-transform: uppercase;
  margin: 0;
}
.cac-img {
  width: 100%;
  max-width: 260px;
  height: auto;
  border-radius: 6px;
  object-fit: cover;
}
.cac-name {
  font-size: 12px;
  color: #ffd27a;
  margin: 0;
  font-weight: bold;
}

/* ── Monster Turn ── */
.monster-turn-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.mt-cards {
  display: flex;
  gap: 16px;
  justify-content: center;
  flex-wrap: wrap;
}
.mt-card-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 140px;
}
.mt-card-label {
  font-size: 10px;
  letter-spacing: 2px;
  color: #7c5a2b;
  text-transform: uppercase;
  margin: 0;
}
.mt-card {
  position: relative;
  width: min(320px, 42vw);
  height: min(212px, 30vw);
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid rgba(124,90,43,0.4);
  background: rgba(10,8,4,0.6);
}
.mt-card-img { width: 100%; height: 100%; object-fit: cover; }
.mt-card-empty {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(124,90,43,0.3);
  font-size: 20px;
}
.mt-card-back { filter: brightness(0.95); }

/* ── Shuffle Overlay ── */
.shuf-overlay {
  position: fixed;
  inset: 0;
  z-index: 1600;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 36px;
  pointer-events: none;
}
.shuf-stage {
  position: relative;
  width: min(500px, 94vw);
  height: min(240px, 48vw);
}
.shuf-ghost, .shuf-top-card {
  position: absolute;
  width: min(280px, 72vw);
  height: min(196px, 50vw);
  border-radius: 12px;
  overflow: hidden;
  top: 50%; left: 50%;
  margin: calc(min(196px, 50vw) / -2) 0 0 calc(min(280px, 72vw) / -2);
  box-shadow: 0 16px 50px rgba(0,0,0,0.8), 0 4px 12px rgba(0,0,0,0.5);
}
.shuf-card-img { width: 100%; height: 100%; object-fit: cover; }

/* Ghost 1: bottom-left → center */
@keyframes sg1 {
  0%   { transform: translate(-180px, 55px) rotate(-28deg) scale(0.92); opacity: 0; }
  8%   { opacity: 1; }
  65%  { transform: translate(-18px, 6px) rotate(-4deg) scale(1.02); }
  100% { transform: translate(-5px, 3px) rotate(-3deg) scale(1); opacity: 1; }
}
/* Ghost 2: bottom-right → center */
@keyframes sg2 {
  0%   { transform: translate(180px, 55px) rotate(28deg) scale(0.92); opacity: 0; }
  8%   { opacity: 1; }
  65%  { transform: translate(18px, 6px) rotate(4deg) scale(1.02); }
  100% { transform: translate(6px, 2px) rotate(3deg) scale(1); opacity: 1; }
}
/* Ghost 3: mid-left → center */
@keyframes sg3 {
  0%   { transform: translate(-140px, -20px) rotate(-18deg) scale(0.94); opacity: 0; }
  14%  { opacity: 1; }
  65%  { transform: translate(-12px, -3px) rotate(-2deg) scale(1.01); }
  100% { transform: translate(-3px, -4px) rotate(-2deg) scale(1); opacity: 1; }
}
/* Ghost 4: mid-right → center */
@keyframes sg4 {
  0%   { transform: translate(140px, -20px) rotate(18deg) scale(0.94); opacity: 0; }
  14%  { opacity: 1; }
  65%  { transform: translate(12px, -3px) rotate(2deg) scale(1.01); }
  100% { transform: translate(4px, -3px) rotate(2deg) scale(1); opacity: 1; }
}
/* Ghost 5: top-center → center */
@keyframes sg5 {
  0%   { transform: translate(0, -90px) rotate(-8deg) scale(0.9); opacity: 0; }
  20%  { opacity: 1; }
  65%  { transform: translate(0, -8px) rotate(-1deg) scale(1.01); }
  100% { transform: translate(-2px, -5px) rotate(-1deg) scale(1); opacity: 1; }
}
/* Top card: subtle settle thump */
@keyframes shuf-top-settle {
  0%   { transform: scale(1); }
  80%  { transform: scale(1); }
  90%  { transform: scale(1.05); box-shadow: 0 16px 50px rgba(0,0,0,0.8), 0 0 20px rgba(201,162,39,0.3); }
  100% { transform: scale(1); box-shadow: 0 12px 40px rgba(0,0,0,0.75); }
}

.shuf-ghost-1 { animation: sg1 1.2s cubic-bezier(0.22,1,0.36,1) forwards; z-index:1; }
.shuf-ghost-2 { animation: sg2 1.2s cubic-bezier(0.22,1,0.36,1) 0.09s forwards; z-index:2; }
.shuf-ghost-3 { animation: sg3 1.2s cubic-bezier(0.22,1,0.36,1) 0.18s forwards; z-index:3; }
.shuf-ghost-4 { animation: sg4 1.2s cubic-bezier(0.22,1,0.36,1) 0.27s forwards; z-index:4; }
.shuf-ghost-5 { animation: sg5 1.2s cubic-bezier(0.22,1,0.36,1) 0.36s forwards; z-index:5; }
.shuf-top-card {
  z-index: 10;
  animation: shuf-top-settle 1.8s ease forwards;
}
.shuf-label {
  font-size: 16px;
  font-weight: 700;
  color: #c9a227;
  margin: 0;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  animation: shuf-label-fade 2.0s ease forwards;
}
@keyframes shuf-label-fade {
  0%   { opacity: 0; transform: translateY(10px); }
  15%  { opacity: 1;  transform: translateY(0); }
  75%  { opacity: 1; }
  100% { opacity: 0; }
}
.mt-card-name { font-size: 11px; color: #a88040; margin: 0; text-align: center; }
.mt-draw-btn {
  padding: 14px;
  border-radius: 8px;
  border: 2px solid #8c3a3a;
  background: linear-gradient(to bottom, #3a1a1a, #1a0d0d);
  color: #ff6b6b;
  font-size: 15px;
  font-weight: bold;
  cursor: pointer;
  font-family: inherit;
  letter-spacing: 1px;
  transition: 0.2s;
}
.mt-draw-btn:hover:not(:disabled) { box-shadow: 0 0 20px rgba(255,80,80,0.5); }
.mt-draw-btn:disabled { opacity: 0.3; cursor: not-allowed; }
.add-hunter-turn-btn {
  padding: 8px 18px;
  background: rgba(80, 180, 120, 0.15);
  border: 1px solid rgba(80, 200, 120, 0.5);
  border-radius: 8px;
  color: #7dffb0;
  font-size: 13px;
  cursor: pointer;
  transition: 0.2s;
  margin-bottom: 6px;
}
.add-hunter-turn-btn:hover { background: rgba(80, 200, 120, 0.28); box-shadow: 0 0 12px rgba(80,200,120,0.4); }
.aht-desc { font-size: 14px; color: #c8b89a; text-align: center; margin: 0 0 18px; line-height: 1.6; }
.aht-desc strong { color: #ffe08a; }
.mt-btn-ready {
  animation: mt-ready-pulse 1.4s ease-in-out infinite;
  border-color: rgba(255,80,80,0.9) !important;
}
@keyframes mt-ready-pulse {
  0%, 100% { box-shadow: 0 0 10px rgba(255,80,80,0.4); }
  50%       { box-shadow: 0 0 26px rgba(255,80,80,0.85); }
}

/* ── Status Effect Badges (Behavior card panel) ── */
.status-badge-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.status-badge {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  background: rgba(168, 85, 247, 0.1);
  border: 1px solid rgba(168, 85, 247, 0.35);
  border-radius: 8px;
  padding: 8px 12px;
}
.status-badge-icon {
  width: 26px;
  height: 26px;
  object-fit: contain;
  flex-shrink: 0;
  margin-top: 1px;
}
.status-badge-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.status-badge-name {
  font-size: 11px;
  font-weight: bold;
  color: #c084fc;
  text-transform: uppercase;
  letter-spacing: 1px;
}
.status-badge-effect {
  font-size: 12px;
  color: #d8b4fe;
  line-height: 1.5;
}
/* Poison gets green tint */
.status-badge-2 { background: rgba(34,197,94,0.1); border-color: rgba(34,197,94,0.35); }
.status-badge-2 .status-badge-name { color: #4ade80; }
.status-badge-2 .status-badge-effect { color: #86efac; }
/* Blastblight gets orange tint */
.status-badge-5 { background: rgba(249,115,22,0.1); border-color: rgba(249,115,22,0.35); }
.status-badge-5 .status-badge-name { color: #fb923c; }
.status-badge-5 .status-badge-effect { color: #fdba74; }

/* ── Status Resolve Overlay ── */
.sr-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.88);
  z-index: 479;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 20px;
  cursor: pointer;
}
.sr-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  width: min(340px, 90vw);
}
.sr-label {
  font-size: 13px;
  letter-spacing: 4px;
  color: #a78bfa;
  text-transform: uppercase;
  margin: 0;
}
.sr-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
}
.sr-item {
  display: flex;
  align-items: center;
  gap: 12px;
  background: rgba(30,20,50,0.7);
  border: 1px solid rgba(168,85,247,0.4);
  border-radius: 10px;
  padding: 10px 14px;
  animation: sr-item-in 0.35s ease both;
}
@keyframes sr-item-in {
  from { opacity: 0; transform: translateX(-12px); }
  to   { opacity: 1; transform: translateX(0); }
}
.sr-icon {
  width: 30px;
  height: 30px;
  object-fit: contain;
  flex-shrink: 0;
}
.sr-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
}
.sr-name {
  font-size: 12px;
  font-weight: bold;
  color: #c084fc;
  text-transform: uppercase;
  letter-spacing: 1px;
}
.sr-result {
  font-size: 12px;
  color: #e2d5f8;
}
.sr-result strong { color: #f9a8d4; }
.sr-check {
  font-size: 16px;
  color: #4ade80;
  font-weight: bold;
  flex-shrink: 0;
}
.sr-hint {
  font-size: 10px;
  color: rgba(168,85,247,0.4);
  letter-spacing: 2px;
  margin: 0;
  animation: cml-pulse 1.5s ease-in-out infinite;
}

/* ── Rampage Banner ── */
.rampage-banner {
  background: rgba(200, 40, 40, 0.15);
  border: 1px solid rgba(200, 40, 40, 0.5);
  border-radius: 8px;
  padding: 8px 14px;
  font-size: 13px;
  color: #f07070;
  text-align: center;
  animation: rampage-pulse 1.2s ease-in-out infinite;
}
@keyframes rampage-pulse {
  0%, 100% { box-shadow: 0 0 0 rgba(200,40,40,0); }
  50%       { box-shadow: 0 0 12px rgba(200,40,40,0.4); }
}

/* ── Misread Card Overlay ── */
.misread-label {
  color: #88aaff;
  font-weight: bold;
}
.misread-card {
  border-color: rgba(80,120,220,0.6) !important;
  filter: brightness(0.65) saturate(0.4);
}
.misread-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 40px;
  font-weight: bold;
  color: rgba(100,140,255,0.9);
  text-shadow: 0 0 12px rgba(80,120,220,0.8);
  pointer-events: none;
}


/* ── Nitrotoad / Paratoad Modal (shared) ── */
.nt-die-wrap { display: flex; justify-content: center; padding: 4px 0; }
.nt-die { pointer-events: none; }
.nt-parts-grid {
  display: flex; flex-wrap: wrap; gap: 10px; justify-content: center;
  max-width: 360px; max-height: 340px; overflow-y: auto;
}
.nt-part-card { width: 100px; transition: 0.15s; }
.nt-part-selectable {
  cursor: pointer;
  border-color: rgba(200,155,60,0.6) !important;
}
.nt-part-selectable:hover {
  border-color: #c89b3c !important;
  box-shadow: 0 0 14px rgba(200,155,60,0.4);
  transform: translateY(-2px);
}

.nt-overlay {
  position: fixed; inset: 0; z-index: 900;
  background: rgba(0,0,0,0.82);
  display: flex; align-items: center; justify-content: center;
}
.nt-modal {
  display: flex; flex-direction: column; align-items: center; gap: 12px;
  padding: 28px 32px;
  background: linear-gradient(160deg, #1c1508, #13100a);
  border: 2px solid rgba(200,155,60,0.45);
  border-radius: 16px;
  box-shadow: 0 0 40px rgba(0,0,0,0.9), inset 0 0 20px rgba(200,155,60,0.04);
  max-width: min(420px, 92vw); text-align: center;
}
.nt-title {
  font-size: 18px; font-weight: bold; color: #ffd27a;
  margin: 0; letter-spacing: 3px; text-transform: uppercase;
  text-shadow: 0 0 12px rgba(200,155,60,0.5);
}
.nt-rule { font-size: 12px; color: #7c5a2b; margin: 0; letter-spacing: 1px; }
.nt-rule-good { color: #c89b3c; font-weight: bold; }
.nt-rule-bad  { color: #cc6644; font-weight: bold; }
.nt-waiting { font-size: 12px; color: #5a3d1f; margin: 0; font-style: italic; letter-spacing: 1px; }
.nt-roll-result { font-size: 14px; color: #f0ddb0; margin: 0; letter-spacing: 1px; }
.nt-roll-btn {
  padding: 10px 32px;
  background: linear-gradient(to bottom, #2a1e10, #17120c);
  border: 1px solid #7c5a2b;
  border-radius: 8px; color: #c89b3c; font-size: 15px; cursor: pointer;
  letter-spacing: 1px; transition: 0.2s;
}
.nt-roll-btn:hover:not(:disabled) {
  border-color: #c89b3c;
  box-shadow: 0 0 10px rgba(200,155,60,0.4);
}
.nt-roll-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.nt-blast-box {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 14px;
  background: rgba(200,100,40,0.08);
  border: 1px solid rgba(200,100,40,0.3);
  border-radius: 10px; text-align: left; width: 100%; box-sizing: border-box;
}
.nt-blast-icon { width: 40px; height: 40px; object-fit: contain; flex-shrink: 0; }
.nt-blast-name { font-size: 13px; font-weight: bold; color: #d48040; margin: 0; }
.nt-blast-desc { font-size: 11px; color: #a86030; margin: 0; line-height: 1.5; }
.nt-immune-box {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 14px;
  background: rgba(100,100,120,0.12);
  border: 1px solid rgba(150,150,180,0.3);
  border-radius: 10px; text-align: left; width: 100%; box-sizing: border-box;
}
.nt-immune-icon { font-size: 28px; flex-shrink: 0; }
.nt-immune-title { font-size: 13px; font-weight: bold; color: #b0b0c8; margin: 0; }
.nt-immune-desc { font-size: 11px; color: #7a7a90; margin: 0; }

.nt-close-btn {
  padding: 8px 28px;
  background: linear-gradient(to bottom, #2a1e10, #17120c);
  border: 1px solid #7c5a2b;
  border-radius: 8px; color: #c89b3c; font-size: 13px; cursor: pointer;
  letter-spacing: 1px; transition: 0.2s;
}
.nt-close-btn:hover { border-color: #c89b3c; box-shadow: 0 0 8px rgba(200,155,60,0.3); }


/* ── Status Token Flash Overlay ── */
.tc-status-flash-overlay {
  position: fixed;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  z-index: 9990;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  pointer-events: none;
}
.tc-status-monster-icon {
  width: 100px; height: 100px;
  object-fit: contain;
  filter: drop-shadow(0 0 16px rgba(200,155,60,0.6));
  animation: tcIconPulse 0.4s ease-out;
}
.tc-status-flash-badge {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 20px;
  background: rgba(16,12,8,0.92);
  border: 2px solid rgba(200,155,60,0.5);
  border-radius: 12px;
  box-shadow: 0 0 24px rgba(0,0,0,0.8), 0 0 12px rgba(200,155,60,0.2);
}
.tc-status-flash-icon {
  width: 44px; height: 44px; object-fit: contain;
  filter: drop-shadow(0 0 8px rgba(200,155,60,0.5));
}
.tc-status-flash-info {
  display: flex; flex-direction: column; gap: 2px;
}
.tc-status-flash-label {
  font-size: 9px; color: #7c5a2b; letter-spacing: 2px; text-transform: uppercase;
}
.tc-status-flash-name {
  font-size: 18px; font-weight: bold; color: #ffd27a; letter-spacing: 2px;
  text-shadow: 0 0 10px rgba(200,155,60,0.5);
}

/* ── Discard Flash Overlay ── */
.tc-discard-flash-overlay {
  position: fixed;
  inset: 0;
  z-index: 9985;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  background: rgba(0,0,0,0.6);
  pointer-events: none;
}
.tc-discard-flash-label {
  font-size: 16px;
  font-weight: bold;
  color: #a88040;
  letter-spacing: 3px;
  text-transform: uppercase;
  margin: 0;
}
.tc-discard-flash-cards {
  display: flex;
  gap: 10px;
  justify-content: center;
  flex-wrap: wrap;
  max-width: 90vw;
}
.tc-discard-flash-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  animation: discardCardFly 2.2s ease-out both;
  animation-delay: calc(var(--i) * 0.08s);
}
.tc-discard-flash-img {
  width: min(90px, 20vw);
  height: auto;
  border-radius: 6px;
  border: 1px solid rgba(200,155,60,0.4);
  box-shadow: 0 4px 16px rgba(0,0,0,0.7);
  filter: grayscale(40%) brightness(0.75);
}
.tc-discard-flash-name {
  font-size: 9px;
  color: #7c5a2b;
  letter-spacing: 1px;
  text-align: center;
  max-width: min(90px, 20vw);
}
@keyframes discardCardFly {
  0%   { opacity: 0; transform: translateY(30px) scale(0.8) rotate(calc((var(--i) - var(--total)/2) * 6deg)); }
  20%  { opacity: 1; transform: translateY(0)    scale(1)   rotate(calc((var(--i) - var(--total)/2) * 4deg)); }
  70%  { opacity: 1; transform: translateY(0)    scale(1)   rotate(calc((var(--i) - var(--total)/2) * 4deg)); }
  100% { opacity: 0; transform: translateY(-40px) scale(0.9) rotate(calc((var(--i) - var(--total)/2) * 8deg)); }
}

/* ── Part Break Token Flash Overlay ── */
.tc-part-flash-overlay {
  position: fixed; top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  z-index: 9990;
  display: flex; flex-direction: column; align-items: center; gap: 10px;
  pointer-events: none;
}
.tc-part-add    { color: #c89b3c; }
.tc-part-remove { color: #8888cc; }
.tc-part-shatter { color: #ff4444; }

.tc-part-icon-wrap {
  position: relative;
  display: flex; align-items: center; justify-content: center;
  width: 110px; height: 110px;
}
.tc-part-img {
  width: 110px; height: 110px; object-fit: contain;
}
.tc-part-icon-hit {
  animation: partHit 0.35s ease-out;
}
@keyframes partHit {
  0%   { transform: scale(1); }
  20%  { transform: scale(1.15) rotate(-4deg); filter: brightness(2) sepia(1); }
  40%  { transform: scale(0.95) rotate(3deg); }
  70%  { transform: scale(1.05) rotate(-1deg); }
  100% { transform: scale(1) rotate(0); }
}
/* Shatter shards — 8 สามเหลี่ยมจากขอบเข้ากลาง */
.tc-shard {
  position: absolute; inset: 0;
  width: 100%; height: 100%;
}
/* 8 triangles meeting at center (50%,50%) */
.tc-shard-1 { clip-path: polygon(0% 0%, 50% 0%, 50% 50%);   animation: shard1 2.2s ease-out forwards; }
.tc-shard-2 { clip-path: polygon(50% 0%, 100% 0%, 50% 50%);  animation: shard2 2.2s ease-out forwards; }
.tc-shard-3 { clip-path: polygon(100% 0%, 100% 50%, 50% 50%); animation: shard3 2.2s ease-out forwards; }
.tc-shard-4 { clip-path: polygon(100% 50%, 100% 100%, 50% 50%); animation: shard4 2.2s ease-out forwards; }
.tc-shard-5 { clip-path: polygon(100% 100%, 50% 100%, 50% 50%); animation: shard5 2.2s ease-out forwards; }
.tc-shard-6 { clip-path: polygon(50% 100%, 0% 100%, 50% 50%); animation: shard6 2.2s ease-out forwards; }
.tc-shard-7 { clip-path: polygon(0% 100%, 0% 50%, 50% 50%);  animation: shard7 2.2s ease-out forwards; }
.tc-shard-8 { clip-path: polygon(0% 50%, 0% 0%, 50% 50%);   animation: shard8 2.2s ease-out forwards; }

@keyframes shard1 { 0% { transform: translate(0,0) rotate(0); opacity:1; } 100% { transform: translate(-38px,-48px) rotate(-30deg); opacity:0; } }
@keyframes shard2 { 0% { transform: translate(0,0) rotate(0); opacity:1; } 100% { transform: translate(38px,-48px) rotate(28deg); opacity:0; } }
@keyframes shard3 { 0% { transform: translate(0,0) rotate(0); opacity:1; } 100% { transform: translate(50px,-22px) rotate(22deg); opacity:0; } }
@keyframes shard4 { 0% { transform: translate(0,0) rotate(0); opacity:1; } 100% { transform: translate(50px,22px) rotate(-22deg); opacity:0; } }
@keyframes shard5 { 0% { transform: translate(0,0) rotate(0); opacity:1; } 100% { transform: translate(38px,48px) rotate(30deg); opacity:0; } }
@keyframes shard6 { 0% { transform: translate(0,0) rotate(0); opacity:1; } 100% { transform: translate(-38px,48px) rotate(-28deg); opacity:0; } }
@keyframes shard7 { 0% { transform: translate(0,0) rotate(0); opacity:1; } 100% { transform: translate(-50px,22px) rotate(-22deg); opacity:0; } }
@keyframes shard8 { 0% { transform: translate(0,0) rotate(0); opacity:1; } 100% { transform: translate(-50px,-22px) rotate(22deg); opacity:0; } }

.tc-part-crack-svg {
  position: absolute; inset: 0;
  width: 100%; height: 100%;
  pointer-events: none;
  filter: drop-shadow(0 0 2px rgba(255,60,0,0.8));
}
.tc-crack-line {
  fill: none;
  stroke: #ff4400;
  stroke-width: 2.5;
  stroke-linecap: round;
  stroke-linejoin: round;
  opacity: 0.9;
}
.tc-crack-thin {
  stroke-width: 1.5;
  opacity: 0.7;
}
.tc-part-break-flash {
  position: absolute; inset: -20px;
  background: radial-gradient(ellipse, rgba(255,100,0,0.9) 0%, rgba(255,50,0,0.4) 40%, transparent 70%);
  animation: breakFlash 0.4s ease-out;
  pointer-events: none;
}
@keyframes breakFlash {
  0%   { opacity: 0; transform: scale(0.5); }
  30%  { opacity: 1; transform: scale(1.3); }
  100% { opacity: 0; transform: scale(1.8); }
}

.tc-part-value {
  font-size: 64px; font-weight: 900; line-height: 1;
  text-shadow: 0 0 28px currentColor, 0 2px 8px rgba(0,0,0,0.9);
}
.tc-part-value-break {
  font-size: 48px;
  letter-spacing: 4px;
  animation: breakTextPulse 0.5s ease-out;
}
@keyframes breakTextPulse {
  0%   { transform: scale(0.5); opacity: 0; }
  60%  { transform: scale(1.2); opacity: 1; }
  100% { transform: scale(1); }
}
.tc-part-bar { background: linear-gradient(to right, #7c5a2b, #c89b3c); }

/* ── TC HP Flash Overlay ── */
.tc-hp-flash-overlay {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 9990;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  pointer-events: none;
}
.tc-hp-monster-icon {
  width: 120px;
  height: 120px;
  object-fit: contain;
  filter: drop-shadow(0 0 20px currentColor);
  animation: tcIconPulse 0.4s ease-out;
}
@keyframes tcIconPulse {
  0%   { transform: scale(0.7); opacity: 0.4; }
  60%  { transform: scale(1.1); }
  100% { transform: scale(1);   opacity: 1; }
}
.tc-hp-value {
  font-size: 80px;
  font-weight: 900;
  line-height: 1;
  text-shadow: 0 0 30px currentColor, 0 2px 8px rgba(0,0,0,0.9);
}
.tc-hp-bar-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  width: 200px;
}
.tc-hp-bar-track {
  position: relative;
  width: 100%;
  height: 10px;
  background: rgba(0,0,0,0.5);
  border-radius: 5px;
  overflow: hidden;
}
.tc-hp-bar-prev {
  position: absolute;
  inset: 0;
  height: 100%;
  background: rgba(255,255,255,0.15);
  border-radius: 5px;
  transition: none;
}
.tc-hp-bar-fill {
  position: absolute;
  inset: 0;
  height: 100%;
  border-radius: 5px;
  animation: tcBarGrow 0.5s 0.15s ease-out both;
}
.tc-hp-heal .tc-hp-bar-fill { background: linear-gradient(to right, #40b860, #80e890); }
.tc-hp-dmg  .tc-hp-bar-fill { background: linear-gradient(to right, #b84040, #f07070); }
@keyframes tcBarGrow {
  from { transform: scaleX(0); transform-origin: left; }
  to   { transform: scaleX(1); transform-origin: left; }
}
.tc-hp-bar-nums {
  font-size: 12px;
  color: rgba(255,255,255,0.7);
  letter-spacing: 1px;
}
.tc-hp-heal { color: #80e890; }
.tc-hp-dmg  { color: #f07070; }

.tc-hp-flash-enter-active {
  animation: tcHpFlashIn 0.2s ease-out forwards;
}
.tc-hp-flash-leave-active {
  animation: tcHpFlashOut 0.4s ease-in forwards;
}
@keyframes tcHpFlashIn {
  from { opacity: 0; transform: translate(-50%, -40%) scale(0.6); }
  to   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
}
@keyframes tcHpFlashOut {
  from { opacity: 1; transform: translate(-50%, -50%) scale(1); }
  to   { opacity: 0; transform: translate(-50%, -65%) scale(0.85); }
}

/* ── Recovery Banner ── */
.recovery-banner {
  background: rgba(40,160,80,0.1);
  border: 1px solid rgba(40,160,80,0.4);
  border-radius: 8px;
  padding: 8px 14px;
  font-size: 13px;
  color: #80d890;
  text-align: center;
}

/* ── Misread Banner ── */
.misread-banner {
  background: rgba(60, 100, 200, 0.12);
  border: 1px solid rgba(80, 120, 220, 0.45);
  border-radius: 8px;
  padding: 8px 14px;
  font-size: 13px;
  color: #88aaff;
  text-align: center;
  animation: misread-pulse 1.4s ease-in-out infinite;
}
@keyframes misread-pulse {
  0%, 100% { box-shadow: 0 0 0 rgba(80,120,220,0); }
  50%       { box-shadow: 0 0 12px rgba(80,120,220,0.35); }
}

/* ── Activation Tracker ── */
.act-tracker {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
.act-pips {
  display: flex;
  gap: 8px;
}
.act-pip {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: rgba(201,162,39,0.2);
  border: 2px solid rgba(201,162,39,0.35);
  transition: background 0.3s, border-color 0.3s, box-shadow 0.3s;
}
.act-pip.pip-done {
  background: #c9a227;
  border-color: #c9a227;
  box-shadow: 0 0 8px rgba(201,162,39,0.6);
}
.act-status { font-size: 12px; margin: 0; }
.act-waiting { color: rgba(201,162,39,0.65); }
.act-ready-text {
  color: #6fcf97;
  font-weight: 700;
  animation: act-ready-glow 1.2s ease-in-out infinite;
}
@keyframes act-ready-glow {
  0%, 100% { opacity: 0.8; }
  50%       { opacity: 1; }
}
.mt-guest-hint { font-size: 11px; color: #7c5a2b; text-align: center; margin: 0; }
.mt-management { display: flex; gap: 8px; }
.mt-mgmt-btn {
  flex: 1;
  padding: 8px;
  border-radius: 6px;
  border: 1px solid rgba(90,159,255,0.35);
  background: rgba(60,100,200,0.08);
  color: #7ab3ff;
  font-size: 12px;
  cursor: pointer;
  font-family: inherit;
  transition: 0.15s;
}
.mt-mgmt-btn:hover:not(:disabled) { background: rgba(60,100,200,0.18); }
.mt-mgmt-btn:disabled { opacity: 0.3; cursor: not-allowed; }

/* ── Deck Manager ── */
.dm-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.75);
  backdrop-filter: blur(6px);
  z-index: 600;
  display: flex; align-items: center; justify-content: center;
  padding: 16px;
}
.dm-modal {
  background: linear-gradient(160deg, #1c1508, #13100a);
  border: 2px solid #7c5a2b;
  border-radius: 14px;
  width: min(600px, 96vw);
  max-height: 90vh;
  display: flex; flex-direction: column;
  overflow: hidden;
  box-shadow: 0 0 40px rgba(0,0,0,0.8);
}
.dm-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(124,90,43,0.4);
  background: rgba(200,155,60,0.06);
  flex-shrink: 0;
}
.dm-title { font-size: 14px; font-weight: bold; color: #ffd27a; }
.dm-close { background: none; border: none; color: #7c5a2b; font-size: 16px; cursor: pointer; }
.dm-close:hover { color: #ffd27a; }
.dm-tabs {
  display: flex; border-bottom: 1px solid rgba(124,90,43,0.25);
  flex-shrink: 0;
}
.dm-tab {
  flex: 1; padding: 12px 6px;
  font-size: 13px; font-family: inherit;
  background: none; border: none;
  color: #7c5a2b; cursor: pointer;
  transition: 0.15s; letter-spacing: 0.5px;
}
.dm-tab.active { color: #ffd27a; border-bottom: 2px solid #c89b3c; }
.dm-tab:hover { color: #a88040; }
.dm-list { overflow-y: auto; padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; }
.dm-random-special-btn {
  width: 100%;
  padding: 10px;
  margin-bottom: 10px;
  border-radius: 8px;
  border: 1px solid rgba(120,80,200,0.5);
  background: rgba(120,80,200,0.15);
  color: #a98cf0;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s;
}
.dm-random-special-btn:hover { background: rgba(120,80,200,0.3); }
.dm-card-row {
  display: flex; align-items: center; gap: 14px;
  padding: 10px 12px; border-radius: 8px;
  background: rgba(200,155,60,0.05);
  border: 1px solid rgba(124,90,43,0.2);
}
.dm-card-thumb { width: 100px; height: 72px; object-fit: cover; border-radius: 6px; flex-shrink: 0; }
.dm-card-zoomable { cursor: zoom-in; transition: transform 0.15s; }
.dm-card-zoomable:hover { transform: scale(1.08); }
.cz-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 9999; display: flex; align-items: center; justify-content: center; cursor: zoom-out; }
.cz-img { max-width: 90vw; max-height: 85vh; object-fit: contain; border-radius: 10px; box-shadow: 0 8px 40px rgba(0,0,0,0.7); cursor: default; }
.dm-card-banished { filter: grayscale(80%) opacity(0.5); }
.dm-card-name { flex: 1; font-size: 14px; color: #d4c090; font-weight: bold; }
.dm-card-name-banished { color: #7c5a2b; }
.dm-btn {
  font-size: 13px; padding: 10px 16px; border-radius: 8px;
  cursor: pointer; font-family: inherit; white-space: nowrap;
  transition: 0.15s; font-weight: bold;
}
.dm-btn-banish {
  border: 1px solid rgba(180,60,60,0.4);
  background: rgba(180,60,60,0.08); color: #ff6b6b;
}
.dm-btn-banish:hover { background: rgba(180,60,60,0.2); }
.dm-btn-restore {
  border: 1px solid rgba(100,220,100,0.4);
  background: rgba(60,180,60,0.08); color: #7cfc00;
}
.dm-btn-restore:hover { background: rgba(60,180,60,0.2); }
.dm-empty { font-size: 11px; color: rgba(124,90,43,0.4); text-align: center; padding: 12px 0; }

/* ── Monster Attack Transition ── */
.ma-trans-enter-active { transition: opacity 0.25s ease; }
.ma-trans-enter-from   { opacity: 0; }
.ma-trans-leave-active { transition: opacity 0.08s ease; }
.ma-trans-leave-to     { opacity: 0; }

/* ── Monster Attack Animation Overlay ── */
/* ── Time Card Turn Section ── */
.tct-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 0 4px;
}
.tct-deck-row {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 36px;
  flex-wrap: wrap;
  width: 100%;
}
.tct-deck-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.tct-deck-stack {
  position: relative;
  width: min(170px, 44vw);
  height: min(234px, 60vw);
}
.tct-deck-stack.empty { opacity: 0.3; }
.tct-discard-stack { opacity: 0.8; }
.dc-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.7);
  z-index: 1400;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}
.dc-modal {
  background: #1a1304;
  border: 1px solid rgba(201,162,39,0.4);
  border-radius: 14px;
  padding: 24px 22px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  width: min(300px, 90vw);
}
.dc-title {
  font-size: 17px;
  font-weight: 700;
  color: #e07060;
  margin: 0;
}
.dc-sub {
  font-size: 13px;
  color: rgba(201,162,39,0.6);
  margin: 0;
}
.dc-counter {
  display: flex;
  align-items: center;
  gap: 16px;
}
.dc-counter-btn {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  border: 1px solid rgba(201,162,39,0.4);
  background: rgba(201,162,39,0.1);
  color: #c9a227;
  font-size: 20px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
}
.dc-counter-btn:hover:not(:disabled) { background: rgba(201,162,39,0.25); }
.dc-counter-btn:disabled { opacity: 0.3; cursor: default; }
.dc-counter-val {
  font-size: 28px;
  font-weight: 700;
  color: #f0d080;
  min-width: 40px;
  text-align: center;
}
.dc-btns {
  display: flex;
  gap: 10px;
}
.dc-btn {
  padding: 10px 24px;
  border-radius: 9px;
  border: none;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s;
}
.dc-confirm {
  background: rgba(180,60,40,0.25);
  color: #e07060;
  border: 1px solid rgba(180,60,40,0.4);
}
.dc-confirm:hover { background: rgba(180,60,40,0.42); }
.dc-cancel {
  background: rgba(120,120,120,0.15);
  color: rgba(200,200,200,0.6);
  border: 1px solid rgba(120,120,120,0.3);
}
.dc-cancel:hover { background: rgba(120,120,120,0.28); }
/* ── Float Activation Bar ── */
.float-act-bar {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  padding: 6px 0 2px;
}
.float-act-pips {
  display: flex;
  gap: 5px;
}
.float-act-pip {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: rgba(201,162,39,0.18);
  border: 1.5px solid rgba(201,162,39,0.35);
  transition: background 0.25s, box-shadow 0.25s;
}
.float-act-pip.fpip-done {
  background: #c9a227;
  border-color: #c9a227;
  box-shadow: 0 0 6px rgba(201,162,39,0.55);
}
.float-act-label {
  font-size: 11px;
  color: rgba(201,162,39,0.7);
}
.float-act-label strong { color: #ffd27a; }
.ct-act-hint {
  font-size: 12px;
  color: rgba(201,162,39,0.55);
  margin: 0;
  text-align: center;
}
.ct-act-hint strong { color: #c9a227; }
.ct-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.7);
  z-index: 1400;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}
.ct-modal {
  background: #1a1304;
  border: 1px solid rgba(201,162,39,0.4);
  border-radius: 14px;
  padding: 24px 22px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  width: min(320px, 90vw);
}
.ct-title {
  font-size: 18px;
  font-weight: 700;
  color: #c9a227;
  margin: 0;
}
.ct-sub {
  font-size: 13px;
  color: rgba(201,162,39,0.6);
  margin: 0;
  text-align: center;
}
.ct-btns {
  display: flex;
  gap: 10px;
  margin-top: 6px;
}
.ct-btn {
  padding: 10px 26px;
  border-radius: 9px;
  border: none;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s;
}
.ct-confirm {
  background: rgba(80,200,120,0.25);
  color: #6fcf97;
  border: 1px solid rgba(80,200,120,0.4);
}
.ct-confirm:hover { background: rgba(80,200,120,0.42); }
.ct-cancel {
  background: rgba(120,120,120,0.15);
  color: rgba(200,200,200,0.6);
  border: 1px solid rgba(120,120,120,0.3);
}
.ct-cancel:hover { background: rgba(120,120,120,0.28); }
.tct-clickable { cursor: pointer; transition: transform 0.12s, opacity 0.12s; }
.tct-clickable:hover { opacity: 1; transform: scale(1.04); }
.ld-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.75);
  z-index: 1400;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}
.ld-modal {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}
.ld-title {
  font-size: 13px;
  color: rgba(201,162,39,0.6);
  margin: 0;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.ld-card-img {
  width: min(280px, 78vw);
  border-radius: 10px;
  box-shadow: 0 0 30px rgba(0,0,0,0.8);
}
.ld-card-name {
  font-size: 16px;
  font-weight: 700;
  color: #f0d080;
  margin: 0;
}
.ld-close {
  margin-top: 4px;
  padding: 8px 24px;
  border-radius: 8px;
  border: 1px solid rgba(201,162,39,0.4);
  background: rgba(201,162,39,0.1);
  color: #c9a227;
  font-size: 13px;
  cursor: pointer;
}
.tct-back-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 5px;
}
.tct-deck-empty-slot {
  width: 100%;
  height: 100%;
  border-radius: 5px;
  border: 1px dashed rgba(201,162,39,0.3);
}
.tct-count-badge {
  position: absolute;
  bottom: -9px;
  right: -10px;
  background: #c9a227;
  color: #1a1000;
  font-size: 13px;
  font-weight: 700;
  border-radius: 12px;
  padding: 2px 8px;
  min-width: 24px;
  text-align: center;
  line-height: 1.4;
}
.tct-badge-discard { background: rgba(150,120,60,0.85); color: #fff; }
.tct-deck-label {
  font-size: 10px;
  color: rgba(201,162,39,0.5);
  margin-top: 6px;
}
.tct-btn-col {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
  align-self: center;
}
.tct-discard-btn {
  padding: 7px 14px;
  border-radius: 8px;
  border: 1px solid rgba(180,60,40,0.4);
  background: rgba(180,60,40,0.15);
  color: #e07060;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}
.tct-discard-btn:hover:not(:disabled) { background: rgba(180,60,40,0.32); }
.tct-discard-btn:disabled { opacity: 0.35; cursor: default; }
.tct-end-btn {
  padding: 12px 22px;
  border-radius: 10px;
  border: 2px solid rgba(201,162,39,0.5);
  background: rgba(201,162,39,0.12);
  color: #c9a227;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}
.tct-end-btn:hover:not(:disabled) {
  background: rgba(201,162,39,0.25);
  border-color: #c9a227;
}
.tct-end-btn.ended, .tct-end-btn:disabled {
  opacity: 0.45;
  cursor: default;
  background: rgba(120,120,120,0.1);
  border-color: rgba(120,120,120,0.3);
  color: rgba(200,200,200,0.5);
}
/* ── Floating Turn Bar ── */
.float-turn-bar {
  position: fixed;
  bottom: 0; left: 0; right: 0;
  z-index: 700;
  display: flex;
  flex-direction: column;
  gap: 0;
  background: linear-gradient(to top, rgba(10,8,4,0.98), rgba(16,12,8,0.95));
  border-top: 1px solid rgba(200,155,60,0.35);
  box-shadow: 0 -4px 20px rgba(0,0,0,0.7);
  padding: 8px 12px;
  padding-bottom: calc(8px + env(safe-area-inset-bottom));
  transition: transform 0.25s ease;
}
.float-status-label {
  position: absolute;
  top: -36px; right: 16px;
  background: linear-gradient(to bottom, #2a1e10, #17120c);
  border: 1px solid #c89b3c;
  border-bottom: none;
  border-radius: 10px 10px 0 0;
  color: #ffd27a;
  font-size: 13px;
  font-weight: bold;
  padding: 6px 16px;
  box-shadow: 0 -4px 12px rgba(200,155,60,0.25);
  letter-spacing: 0.5px;
  pointer-events: none;
  user-select: none;
}
.float-turn-bar-collapsed {
  transform: translateY(calc(100% - 0px));
}
/* ── Party Strip (fixed right vertical) ── */
.party-strip {
  position: fixed;
  right: 0;
  bottom: 80px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 6px 4px;
  background: rgba(10, 8, 4, 0.72);
  border: 1px solid rgba(200,155,60,0.2);
  border-right: none;
  border-radius: 12px 0 0 12px;
  z-index: 900;
  backdrop-filter: blur(6px);
}
.party-member {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  flex: 1;
  min-width: 0;
}
.party-icon-wrap {
  position: relative;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: rgba(20,14,6,0.8);
  border: 2px solid rgba(200,155,60,0.25);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: border-color 0.3s, box-shadow 0.3s;
}
.party-done .party-icon-wrap {
  border-color: #6fcf97;
  box-shadow: 0 0 10px rgba(111,207,151,0.45);
}
.party-pending .party-icon-wrap {
  border-color: rgba(201,162,39,0.6);
  animation: party-pending-pulse 1.2s ease-in-out infinite;
}
.party-me .party-icon-wrap {
  border-width: 2.5px;
}
@keyframes party-pending-pulse {
  0%, 100% { box-shadow: 0 0 4px rgba(201,162,39,0.2); }
  50%       { box-shadow: 0 0 12px rgba(201,162,39,0.5); }
}
.party-icon-img {
  width: 16px;
  height: 16px;
  object-fit: contain;
}
.party-status-dot {
  position: absolute;
  bottom: -2px;
  right: -2px;
  width: 11px;
  height: 11px;
  border-radius: 50%;
  background: #1a1304;
  border: 1px solid rgba(200,155,60,0.3);
  font-size: 7px;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  color: #6fcf97;
  font-weight: 700;
}
.party-done .party-status-dot {
  background: #1e3a28;
  border-color: #6fcf97;
}
.party-name {
  font-size: 9px;
  color: rgba(201,162,39,0.65);
  max-width: 40px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: center;
}
.float-end-btn {
  width: 100%;
  padding: 12px;
  border-radius: 10px;
  border: 1px solid #7c5a2b;
  background: linear-gradient(to bottom, #2a1e10, #17120c);
  color: #c89b3c;
  font-size: 16px;
  font-weight: bold;
  cursor: pointer;
  letter-spacing: 1px;
  transition: 0.2s;
}
.float-end-btn:not(:disabled):hover {
  border-color: #c89b3c;
  box-shadow: 0 0 12px rgba(200,155,60,0.4);
}
.float-end-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.float-ended { opacity: 0.5; }
.float-outcome-complete {
  border-color: #3cb83c;
  color: #6fcf97;
  background: linear-gradient(to bottom, #0a200a, #061406);
}
.float-outcome-complete:hover { box-shadow: 0 0 14px rgba(60,184,60,0.5); }
.float-outcome-complete.outcome-voted { background: rgba(60,184,60,0.15); border-color: #6fcf97; }
.float-outcome-fail {
  border-color: #cc4444;
  color: #f07070;
  background: linear-gradient(to bottom, #200a0a, #140606);
}
.float-outcome-fail:hover { box-shadow: 0 0 14px rgba(204,68,68,0.5); }
.float-outcome-fail.outcome-voted { background: rgba(204,68,68,0.15); border-color: #f07070; }
.float-outcome-timeout {
  border-color: #a88040;
  color: #ffd27a;
  background: linear-gradient(to bottom, #1c1508, #13100a);
}
.float-outcome-timeout:hover { box-shadow: 0 0 14px rgba(200,155,60,0.4); }
.float-outcome-timeout.outcome-voted { background: rgba(200,155,60,0.15); border-color: #ffd27a; }

.tct-hunter-list {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.tct-hunter-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 10px;
  border-radius: 7px;
  background: rgba(255,255,255,0.02);
  border: 1px solid rgba(201,162,39,0.1);
  transition: background 0.2s, border-color 0.2s;
}
.tct-hunter-row.turn-done {
  background: rgba(201,162,39,0.08);
  border-color: rgba(201,162,39,0.3);
}
.tct-hunter-mark {
  font-size: 14px;
  width: 20px;
  text-align: center;
}
.tct-hunter-name {
  font-size: 13px;
  color: #dba860;
  flex: 1;
}
.tct-class-icon {
  width: 22px;
  height: 22px;
  object-fit: contain;
  opacity: 0.85;
  flex-shrink: 0;
}
.tct-class-name {
  font-size: 11px;
  color: rgba(201,162,39,0.5);
  white-space: nowrap;
}
.tct-pending-label {
  font-size: 10px;
  color: rgba(201,162,39,0.45);
  font-style: italic;
}

/* ── Time Card Reveal Overlay ── */
.tcr-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.82);
  z-index: 1500;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.tcr-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}
.tcr-hunter-header {
  display: flex;
  align-items: center;
  gap: 10px;
}
.tcr-class-icon {
  width: 36px;
  height: 36px;
  object-fit: contain;
  filter: drop-shadow(0 0 4px rgba(201,162,39,0.5));
}
.tcr-hunter-name {
  font-size: 22px;
  font-weight: 700;
  color: #c9a227;
  margin: 0;
  letter-spacing: 0.03em;
}
.tcr-label {
  font-size: 12px;
  color: rgba(201,162,39,0.55);
  margin: 0;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.tcr-card-flip {
  width: min(300px, 72vw);
  height: min(410px, 98vw);
  perspective: 900px;
  margin: 8px 0;
}
.tcr-card-inner {
  width: 100%;
  height: 100%;
  position: relative;
  transform-style: preserve-3d;
  animation: ma-flip 0.9s 0.3s ease both;
}
.tcr-card-back, .tcr-card-front {
  position: absolute;
  inset: 0;
  border-radius: 10px;
  overflow: hidden;
}
.tcr-card-back  { animation: ma-back-hide  0s 0.845s step-end  both; }
.tcr-card-front {
  opacity: 0;
  transform: scaleX(-1);
  animation: ma-front-show 0s 0.845s step-start both, ma-glow 0.5s 1s ease both;
}
.tcr-card-img { width: 100%; height: 100%; object-fit: cover; }
.tcr-card-name {
  font-size: 15px;
  font-weight: 700;
  color: #f0d080;
  margin: 0;
}
.tcr-remaining {
  font-size: 11px;
  color: rgba(201,162,39,0.4);
  margin: 0;
}

.ma-overlay {
  position: fixed;
  inset: 0;
  background: #000;
  z-index: 480;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  overflow: hidden;
}
.ma-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  position: relative;
  z-index: 1;
  max-height: 92vh;
  overflow-y: auto;
  padding: 16px 8px;
  width: 100%;
}

.ma-label {
  font-size: 14px;
  letter-spacing: 6px;
  color: #ffd27a;
  text-transform: uppercase;
  margin: 0;
  font-weight: bold;
  text-shadow: 0 0 10px rgba(200,155,60,0.6), 0 0 4px #000;
}
.ma-card-flip {
  width: min(450px, 92vw);
  height: min(300px, 70vw);
  perspective: 1000px;
}
.ma-card-inner {
  width: 100%;
  height: 100%;
  position: relative;
  animation: ma-flip 0.9s 0.1s ease both;
}
@keyframes ma-flip {
  0%   { transform: scale(0.8) rotateY(0deg);  opacity: 0; }
  15%  { transform: scale(1)   rotateY(0deg);  opacity: 1; }
  45%  { transform: scale(1)   rotateY(89deg); }
  55%  { transform: scale(1)   rotateY(91deg); }
  100% { transform: scale(1)   rotateY(180deg); }
}
.ma-card-back, .ma-card-front {
  position: absolute;
  inset: 0;
  border-radius: 10px;
  overflow: hidden;
  border: 2px solid rgba(200,155,60,0.7);
  box-shadow: 0 0 30px rgba(200,155,60,0.4), 0 8px 32px rgba(0,0,0,0.8);
}
/* ซ่อน/แสดงด้วย opacity ตอนการ์ดตั้งตรง (แทน backface-visibility) */
.ma-card-back  { animation: ma-back-hide  0s 0.545s step-end  both; }
.ma-card-front { opacity: 0; animation: ma-front-show 0s 0.545s step-start both; }
@keyframes ma-back-hide  { to { opacity: 0; } }
@keyframes ma-front-show { to { opacity: 1; } }
/* Glow + counter-rotate ป้องกันภาพกลับด้าน */
.ma-card-front {
  animation: ma-front-show 0s 0.545s step-start both, ma-glow 0.5s 0.7s ease both;
  transform: scaleX(-1);
}
@keyframes ma-glow {
  0%   { box-shadow: 0 0 30px rgba(200,155,60,0.4), 0 8px 32px rgba(0,0,0,0.8); }
  50%  { box-shadow: 0 0 70px rgba(255,210,100,0.9), 0 0 30px rgba(200,155,60,0.7), 0 8px 32px rgba(0,0,0,0.8); }
  100% { box-shadow: 0 0 30px rgba(200,155,60,0.5), 0 8px 32px rgba(0,0,0,0.8); }
}
.ma-card-img { width: 100%; height: 100%; object-fit: cover; }
.ma-card-name {
  font-size: 18px;
  font-weight: bold;
  color: #ffd27a;
  margin: 0;
  letter-spacing: 2px;
  text-shadow: 0 0 10px rgba(200,155,60,0.6), 0 0 4px #000;
}
.ma-hint { font-size: 10px; color: rgba(124,90,43,0.5); letter-spacing: 2px; margin: 0; animation: cml-pulse 1.5s ease-in-out infinite; }

/* ── Token Total Bar (Scoutfly page) ── */
.token-total-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 10px;
  background: rgba(10,8,4,0.5);
  border: 1px solid rgba(124,90,43,0.3);
  flex-wrap: wrap;
}
.token-total-label {
  font-size: 11px;
  color: #a88040;
  letter-spacing: 1px;
  white-space: nowrap;
}
.token-total-tokens {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  flex: 1;
}
.token-total-chip {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: bold;
  border: 1px solid;
}
.chip-pos   { border-color: rgba(100,220,100,0.5); color: #7cfc00; background: rgba(60,180,60,0.1); }
.chip-neg   { border-color: rgba(255,80,80,0.5);   color: #ff6b6b; background: rgba(180,60,60,0.1); }
.chip-zero  { border-color: rgba(200,155,60,0.4);  color: #ffd27a; background: rgba(200,155,60,0.08); }
.chip-hidden{ border-color: rgba(124,90,43,0.3);   color: rgba(200,155,60,0.4); background: rgba(30,22,8,0.6); }
.token-total-sum { display: flex; align-items: baseline; gap: 2px; white-space: nowrap; }
.token-total-sum-label { font-size: 12px; color: #7c5a2b; }
.token-total-sum-val { font-size: 20px; font-weight: bold; }
.token-total-hidden { font-size: 12px; opacity: 0.6; }

/* ── Track Token Panel ── */
.tt-panel {
  border-radius: 10px;
  border: 1px solid rgba(124, 90, 43, 0.35);
  background: rgba(10, 8, 4, 0.5);
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.tt-header {
  display: flex;
  align-items: center;
  gap: 8px;
}
.tt-label {
  font-size: 12px;
  color: #a88040;
  letter-spacing: 1px;
  flex: 1;
}
.tt-pool {
  font-size: 11px;
  color: #7c5a2b;
}
.tt-actions { display: flex; gap: 6px; }
.tt-btn {
  font-size: 11px;
  padding: 3px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-family: inherit;
  transition: 0.15s;
}
.tt-btn-add {
  border: 1px solid rgba(200,155,60,0.45);
  background: rgba(200,155,60,0.1);
  color: #ffd27a;
}
.tt-btn-add:hover { background: rgba(200,155,60,0.22); }

.tt-tokens {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.tt-token {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}
.tt-token-face {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: 2px solid rgba(124,90,43,0.5);
  background: rgba(30,22,8,0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: 0.2s;
}
.tt-token-face:hover { border-color: #c89b3c; }
.tt-token.revealed .tt-token-face {
  cursor: default;
  border-color: #c89b3c;
  background: rgba(50,35,10,0.9);
}
.tt-hidden { font-size: 18px; color: rgba(200,155,60,0.4); font-weight: bold; }
.tt-value { font-size: 16px; font-weight: bold; }
.val-pos { color: #7cfc00; }
.val-zero { color: #ffd27a; }
.val-neg { color: #ff6b6b; }
.tt-token { cursor: pointer; }
.tt-token:hover .tt-token-face { border-color: #c89b3c; }
.tt-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.7);
  backdrop-filter: blur(6px);
  z-index: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.tt-modal {
  background: linear-gradient(160deg, #1c1508, #13100a);
  border: 2px solid #7c5a2b;
  border-radius: 14px;
  padding: 24px 20px;
  width: min(280px, 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  box-shadow: 0 0 40px rgba(0,0,0,0.8);
}
.tt-modal-title {
  font-size: 13px;
  letter-spacing: 3px;
  color: #a88040;
  text-transform: uppercase;
  margin: 0;
}
.tt-modal-token {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  border: 2px solid #c89b3c;
  background: rgba(50,35,10,0.9);
  display: flex;
  align-items: center;
  justify-content: center;
}
.tt-modal-val { font-size: 24px !important; }
.tt-modal-btns {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}
.tt-modal-btn {
  width: 100%;
  padding: 10px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: bold;
  cursor: pointer;
  font-family: inherit;
  transition: 0.15s;
}
.tt-modal-reveal {
  border: 1px solid rgba(100,220,100,0.5);
  background: rgba(60,180,60,0.1);
  color: #7cfc00;
}
.tt-modal-reveal:hover { background: rgba(60,180,60,0.2); }
.tt-modal-discard {
  border: 1px solid rgba(180,60,60,0.4);
  background: rgba(180,60,60,0.08);
  color: #ff6b6b;
}
.tt-modal-discard:hover { background: rgba(180,60,60,0.2); }
.tt-modal-cancel {
  border: 1px solid rgba(124,90,43,0.3);
  background: rgba(10,8,4,0.5);
  color: #7c5a2b;
}
.tt-modal-cancel:hover { color: #a88040; }

.tt-empty {
  font-size: 11px;
  color: rgba(124,90,43,0.35);
  margin: 0;
  text-align: center;
}

/* ── Time Card Panel ── */
.tc-panel {
  border-radius: 10px;
  border: 1px solid rgba(124, 90, 43, 0.35);
  background: rgba(10, 8, 4, 0.5);
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.tc-header {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.tc-label {
  font-size: 13px;
  font-weight: 700;
  color: #c9a227;
  white-space: nowrap;
}
.tc-deck-display {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}
.tc-deck-stack {
  position: relative;
  width: 38px;
  height: 52px;
  flex-shrink: 0;
}
.tc-deck-stack.empty { opacity: 0.35; }
.tc-back-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 4px;
  display: block;
}
.tc-count-badge {
  position: absolute;
  bottom: -6px;
  right: -8px;
  background: #c9a227;
  color: #1a1000;
  font-size: 11px;
  font-weight: 700;
  border-radius: 10px;
  padding: 1px 5px;
  min-width: 18px;
  text-align: center;
  line-height: 1.4;
}
.tc-discard-label {
  font-size: 11px;
  color: rgba(201, 162, 39, 0.6);
}
.tc-actions {
  display: flex;
  gap: 6px;
  margin-left: auto;
}
.tc-btn {
  font-size: 11px;
  padding: 5px 10px;
  border-radius: 6px;
  border: none;
  cursor: pointer;
  font-weight: 600;
  transition: background 0.15s;
}
.tc-btn:disabled { opacity: 0.4; cursor: default; }
.tc-btn-discard {
  background: rgba(180, 60, 40, 0.25);
  color: #e07060;
  border: 1px solid rgba(180, 60, 40, 0.4);
}
.tc-btn-discard:hover:not(:disabled) { background: rgba(180, 60, 40, 0.45); }
.tc-btn-manage {
  background: rgba(80, 80, 200, 0.2);
  color: #9090f0;
  border: 1px solid rgba(80, 80, 200, 0.4);
}
.tc-btn-manage:hover { background: rgba(80, 80, 200, 0.38); }
.tc-last-discard {
  display: flex;
  align-items: center;
  gap: 8px;
}
.tc-discard-label-sm {
  font-size: 10px;
  color: rgba(201, 162, 39, 0.45);
  white-space: nowrap;
}
.tc-discard-preview {
  width: 28px;
  height: 38px;
  object-fit: cover;
  border-radius: 3px;
  opacity: 0.75;
}
.tc-discard-name {
  font-size: 11px;
  color: rgba(201, 162, 39, 0.65);
}

/* Time Card Manage Modal */
.tc-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.72);
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.tc-modal {
  background: #1a1304;
  border: 1px solid rgba(201,162,39,0.4);
  border-radius: 14px;
  padding: 20px 18px;
  width: min(480px, 96vw);
  max-height: 85vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.tc-modal-title {
  font-size: 16px;
  font-weight: 700;
  color: #c9a227;
  margin: 0;
  text-align: center;
}
.tc-modal-sub {
  font-size: 12px;
  color: rgba(201,162,39,0.65);
  margin: 0;
  text-align: center;
}
.tc-modal-section {
  font-size: 12px;
  color: rgba(201,162,39,0.55);
  margin: 0;
  font-style: italic;
}
.tc-red-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
  gap: 10px;
}
.tc-red-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  cursor: pointer;
  border-radius: 8px;
  padding: 8px 4px 6px;
  border: 2px solid rgba(201,162,39,0.15);
  background: rgba(255,255,255,0.03);
  transition: border-color 0.15s, background 0.15s;
  user-select: none;
}
.tc-red-grid:has(.selected) .tc-red-card:not(.selected) {
  opacity: 0.35;
}
.tc-red-card:hover { border-color: rgba(201,162,39,0.4); background: rgba(201,162,39,0.07); }
.tc-red-card.selected {
  border-color: #c9a227;
  background: rgba(201,162,39,0.14);
}
.tc-red-check {
  position: absolute;
  top: 4px;
  right: 6px;
  font-size: 12px;
  font-weight: 700;
  color: #c9a227;
  opacity: 0;
  transition: opacity 0.15s;
}
.tc-red-card.selected .tc-red-check { opacity: 1; }
.tc-red-img {
  width: 54px;
  height: 74px;
  object-fit: cover;
  border-radius: 4px;
}
.tc-red-name {
  font-size: 10px;
  color: #dba860;
  text-align: center;
  line-height: 1.3;
}
.tc-modal-btns {
  display: flex;
  gap: 10px;
  justify-content: center;
  margin-top: 4px;
}
.tc-modal-btn {
  padding: 9px 18px;
  border-radius: 8px;
  border: none;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s;
}
.tc-modal-add {
  background: rgba(80, 200, 120, 0.25);
  color: #6fcf97;
  border: 1px solid rgba(80, 200, 120, 0.4);
}
.tc-modal-add:hover { background: rgba(80, 200, 120, 0.42); }
.tc-modal-cancel {
  background: rgba(120,120,120,0.15);
  color: rgba(200,200,200,0.6);
  border: 1px solid rgba(120,120,120,0.3);
}
.tc-modal-cancel:hover { background: rgba(120,120,120,0.28); }

.dr-panel {
  border-radius: 10px;
  border: 1px solid rgba(124, 90, 43, 0.35);
  background: rgba(10, 8, 4, 0.5);
  overflow: hidden;
}
.dr-toggle {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: rgba(200, 155, 60, 0.06);
  border: none;
  color: #a88040;
  font-size: 12px;
  letter-spacing: 1px;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.15s;
}
.dr-toggle:hover { background: rgba(200, 155, 60, 0.1); }
.dr-toggle-arrow { font-size: 10px; }

.dr-grid {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 6px 8px 10px;
  max-height: 220px;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.dr-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  background: rgba(30, 22, 8, 0.6);
}
.dr-item-img {
  width: 28px;
  height: 28px;
  object-fit: contain;
  flex-shrink: 0;
}
.dr-item-name {
  flex: 1;
  font-size: 12px;
  color: #d4c090;
}
.dr-item-right {
  display: flex;
  align-items: center;
  gap: 6px;
}
.dr-count {
  font-size: 12px;
  font-weight: bold;
  color: #ffd27a;
  min-width: 20px;
  text-align: center;
}
.dr-sub-btn {
  border-color: rgba(180, 60, 60, 0.4);
  background: rgba(180, 60, 60, 0.08);
  color: #ff8080;
}
.dr-sub-btn:hover { background: rgba(180, 60, 60, 0.2); }
.dr-craft-btn {
  border-color: rgba(200,155,60,0.35) !important;
  background: rgba(200,155,60,0.08) !important;
  font-size: 12px !important;
}
.dr-craft-btn:hover { background: rgba(200,155,60,0.2) !important; }
.dr-add-btn {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 1px solid rgba(200, 155, 60, 0.5);
  background: rgba(200, 155, 60, 0.1);
  color: #ffd27a;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: 0.15s;
  font-family: inherit;
}
.dr-add-btn:hover {
  background: rgba(200, 155, 60, 0.25);
  border-color: #c89b3c;
}

.dr-slide-enter-active { transition: max-height 0.25s ease, opacity 0.2s; }
.dr-slide-leave-active { transition: max-height 0.2s ease, opacity 0.15s; }
.dr-slide-enter-from, .dr-slide-leave-to { max-height: 0; opacity: 0; overflow: hidden; }
.dr-slide-enter-to, .dr-slide-leave-from { max-height: 600px; opacity: 1; }

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
/* ── Vote badges on action buttons ── */
.choice-btn.voted-me {
  border-color: rgba(90, 159, 255, 0.7);
  background: rgba(60, 100, 200, 0.08);
}
.vote-badge {
  margin-left: auto;
  font-size: 10px;
  font-weight: bold;
  color: #7ab3ff;
  background: rgba(60, 100, 200, 0.2);
  border: 1px solid rgba(60, 100, 200, 0.4);
  border-radius: 10px;
  padding: 2px 8px;
  letter-spacing: 0;
}
.vote-voters {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}
.vote-voter-chip {
  font-size: 10px;
  color: #7ab3ff;
  background: rgba(60, 100, 200, 0.12);
  border-radius: 4px;
  padding: 1px 6px;
  letter-spacing: 0;
}

/* ── Action Bottom Drawer ── */
.action-drawer {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 300;
  background: linear-gradient(to top, #13100a 80%, rgba(19,16,10,0.95));
  border-top: 2px solid #c89b3c;
  padding: 8px 20px 28px;
  box-shadow: 0 -10px 40px rgba(0,0,0,0.7), 0 -2px 0 rgba(200,155,60,0.2);
  display: flex;
  flex-direction: column;
  gap: 12px;
  font-family: 'Georgia', serif;
}
.drawer-slide-enter-active { transition: transform 0.3s cubic-bezier(0.2, 0, 0, 1); }
.drawer-slide-leave-active { transition: transform 0.25s ease-in; }
.drawer-slide-enter-from, .drawer-slide-leave-to { transform: translateY(100%); }

.action-drawer-handle {
  width: 36px;
  height: 3px;
  border-radius: 2px;
  background: rgba(200, 155, 60, 0.3);
  margin: 0 auto 4px;
}

.ad-header { display: flex; flex-direction: column; gap: 8px; }

.ad-stamp {
  font-size: 9px;
  letter-spacing: 5px;
  text-transform: uppercase;
  color: #c89b3c;
  border: 1px solid rgba(200, 155, 60, 0.35);
  border-radius: 4px;
  padding: 3px 10px;
  width: fit-content;
  background: rgba(200, 155, 60, 0.06);
}

.ad-title-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(10, 8, 4, 0.6);
  border: 1px solid rgba(124, 90, 43, 0.4);
  border-left: 3px solid #c89b3c;
}
.ad-num {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: rgba(200, 155, 60, 0.15);
  border: 1px solid #7c5a2b;
  color: #c89b3c;
  font-size: 12px;
  font-weight: bold;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.ad-title {
  font-size: 14px;
  color: #ffd27a;
  line-height: 1.4;
  padding-top: 2px;
}

.ad-consequences {
  padding: 10px 14px;
  border-radius: 8px;
  background: rgba(139, 90, 20, 0.08);
  border: 1px solid rgba(200, 130, 40, 0.3);
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.ad-con-label {
  font-size: 9px;
  letter-spacing: 3px;
  text-transform: uppercase;
  color: #a88040;
}
.ad-con-text {
  margin: 0;
  font-size: 13px;
  color: #f0ddb0;
  line-height: 1.6;
  font-style: italic;
}

.ad-stamp-tie {
  border-color: rgba(255, 153, 85, 0.4);
  color: #ff9955;
  background: rgba(255, 153, 85, 0.06);
}
.ad-tied-choices {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ad-tied-btn {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-radius: 8px;
  border: 1px solid rgba(200, 155, 60, 0.4);
  background: rgba(10, 8, 4, 0.5);
  color: #ffd27a;
  font-family: inherit;
  font-size: 14px;
  cursor: pointer;
  transition: 0.2s;
  text-align: left;
}
.ad-tied-btn:hover {
  border-color: #c89b3c;
  background: rgba(200, 155, 60, 0.1);
  box-shadow: 0 0 10px rgba(200, 155, 60, 0.2);
}

.ad-tie-msg {
  text-align: center;
  font-size: 11px;
  color: #ff9955;
  letter-spacing: 1px;
  margin: 0;
}

.ad-proceed-votes {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: center;
}
.ad-proceed-chip {
  font-size: 11px;
  padding: 3px 10px;
  border-radius: 12px;
  border: 1px solid rgba(124,90,43,0.35);
  color: #7c5a2b;
  background: rgba(0,0,0,0.2);
  transition: 0.2s;
}
.ad-proceed-chip.voted {
  border-color: rgba(100,220,100,0.5);
  color: #7cfc00;
  background: rgba(60,180,60,0.1);
}

.ad-btn-confirm.ad-voted {
  border-color: #7cfc00;
  background: rgba(60,180,60,0.15);
  color: #7cfc00;
}

.ad-buttons { display: flex; gap: 10px; }

.ad-btn-confirm {
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
.ad-btn-confirm:hover:not(:disabled) {
  border-color: #c89b3c;
  box-shadow: 0 0 14px rgba(200, 155, 60, 0.35);
}
.ad-btn-confirm:disabled { opacity: 0.4; cursor: not-allowed; }

.ad-btn-cancel {
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
.ad-btn-cancel:hover { color: #a88040; border-color: #7c5a2b; }

@media (max-width: 480px) {
  /* Monster Turn responsive */
  .mt-cards { flex-direction: column; align-items: center; gap: 12px; }
  .mt-card {
    width: min(102vw, 340px);
    height: min(65vw, 240px);
  }
  .mt-card-wrap { min-width: unset; width: 100%; }
  .mt-draw-btn { font-size: 16px; padding: 16px; }
  .mt-management { flex-direction: column; }
  .sc-card-img { width: min(90vw, 320px); }
  .ma-card-flip {
    width: min(92vw, 360px);
    height: min(65vw, 256px);
  }
  .dm-modal { width: 96vw; max-height: 92vh; }
  .dm-card-thumb { width: 80px; height: 56px; }
  .dm-card-name { font-size: 13px; }
  .dm-btn { font-size: 12px; padding: 8px 12px; }

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

/* ── Minimal Mode Special Card ── */
.minimal-special-card-wrap {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 10px 0 4px;
  border-top: 1px solid rgba(200,155,60,0.15);
}
.minimal-special-label {
  font-size: 10px;
  color: rgba(200,155,60,0.55);
  text-transform: uppercase;
  letter-spacing: 2px;
  margin: 0;
}
.minimal-special-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
.minimal-special-img {
  width: 120px;
  border-radius: 8px;
  border: 1px solid rgba(200,155,60,0.3);
  box-shadow: 0 2px 12px rgba(0,0,0,0.5);
}
.minimal-special-name {
  font-size: 12px;
  color: rgba(230,185,80,0.85);
  text-align: center;
}

/* ── Minimal Mode Outcome Buttons ── */
.minimal-outcome-wrap {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  padding-top: 4px;
}
.minimal-outcome-btn {
  width: 100%;
  padding: 14px;
  border-radius: 10px;
  border: none;
  font-size: 15px;
  font-weight: bold;
  font-family: inherit;
  letter-spacing: 1px;
  cursor: pointer;
  transition: all 0.2s;
}
.minimal-complete {
  background: linear-gradient(135deg, rgba(34,197,94,0.25), rgba(21,128,61,0.35));
  border: 1px solid rgba(34,197,94,0.6);
  color: #4ade80;
}
.minimal-complete:hover { background: linear-gradient(135deg, rgba(34,197,94,0.4), rgba(21,128,61,0.5)); }
.minimal-failed {
  background: linear-gradient(135deg, rgba(239,68,68,0.25), rgba(153,27,27,0.35));
  border: 1px solid rgba(239,68,68,0.6);
  color: #f87171;
}
.minimal-failed:hover { background: linear-gradient(135deg, rgba(239,68,68,0.4), rgba(153,27,27,0.5)); }
.minimal-timeout {
  background: linear-gradient(135deg, rgba(234,179,8,0.15), rgba(161,98,7,0.25));
  border: 1px solid rgba(234,179,8,0.4);
  color: #fbbf24;
}
.minimal-timeout:hover { background: linear-gradient(135deg, rgba(234,179,8,0.3), rgba(161,98,7,0.4)); }
.minimal-outcome-confirmed {
  padding: 12px 14px;
  border-radius: 10px;
  background: rgba(34,197,94,0.12);
  border: 1px solid rgba(34,197,94,0.4);
  color: #86efac;
  font-size: 13px;
  text-align: center;
  animation: rampage-pulse 1.5s ease-in-out infinite;
}

.faint-tracker {
  display: flex;
  align-items: center;
  gap: 10px;
  justify-content: center;
}
.faint-label {
  font-size: 11px;
  color: #7c5a2b;
  letter-spacing: 2px;
  text-transform: uppercase;
}
.faint-icons {
  display: flex;
  gap: 8px;
}
.faint-slot {
  position: relative;
  width: 60px;
  height: 60px;
  cursor: pointer;
  transition: transform 0.15s;
}
.faint-slot:hover {
  transform: scale(1.12);
}
.faint-icon-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  opacity: 0.85;
  transition: opacity 0.2s, filter 0.2s;
}
.faint-used .faint-icon-img {
  opacity: 0.35;
  filter: grayscale(70%);
}
.potion-empty .faint-icon-img {
  opacity: 0.3;
  filter: grayscale(80%);
}

/* Dialog phase compact potion tracker */
.dialog-potion-tracker {
  display: flex;
  gap: 4px;
  align-items: center;
}
.dialog-potion-slot {
  position: relative;
  width: 32px;
  height: 32px;
  cursor: pointer;
  transition: transform 0.15s;
}
.dialog-potion-slot:hover { transform: scale(1.1); }
.dialog-potion-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  opacity: 0.9;
  transition: opacity 0.2s, filter 0.2s;
}
.dialog-potion-slot.potion-empty .dialog-potion-img {
  opacity: 0.3;
  filter: grayscale(80%);
}
.dialog-potion-x {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: bold;
  color: #ff4444;
  text-shadow: 0 0 6px rgba(255,60,60,0.8), 0 0 2px #000;
  pointer-events: none;
}
.faint-x {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 38px;
  font-weight: bold;
  color: #ff4444;
  text-shadow: 0 0 10px rgba(255, 60, 60, 0.9), 0 0 3px #000;
  pointer-events: none;
}

.hunt-result-btns {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.hunt-result-btns > * {
  flex: 1;
  min-width: 120px;
}



.outcome-vote-count {
  font-size: 11px;
  opacity: 0.75;
  margin-left: 6px;
  letter-spacing: 0;
}
.outcome-voted {
  opacity: 0.6;
  cursor: default;
}

.btn-timeout {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 16px;
  border-radius: 8px;
  border: 2px solid #5a4a2a;
  background: linear-gradient(to bottom, #2a2010, #151008);
  color: #c89b3c;
  font-size: 14px;
  font-weight: bold;
  cursor: pointer;
  transition: 0.2s;
  letter-spacing: 1px;
  min-height: 56px;
  font-family: inherit;
}
.btn-timeout:hover {
  border-color: #c89b3c;
  box-shadow: 0 0 16px rgba(200, 155, 60, 0.4);
  transform: translateY(-2px);
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
  transition: filter 0.6s ease, opacity 0.6s ease;
}
.monster-img-shake {
  animation: monster-shake 0.45s ease;
}
@keyframes monster-shake {
  0%,100% { transform: translate(0,0) rotate(0deg); }
  12%  { transform: translate(-9px,-5px) rotate(-2deg); }
  25%  { transform: translate(9px, 5px) rotate( 2deg); }
  37%  { transform: translate(-6px, 3px) rotate(-1deg); }
  50%  { transform: translate( 6px,-3px) rotate( 1deg); }
  62%  { transform: translate(-3px, 2px); }
  75%  { transform: translate( 3px,-2px); }
  87%  { transform: translate(-1px, 1px); }
}

/* Damage / Heal floating number */
.dmg-indicator {
  position: absolute;
  top: 30%;
  transform: translateX(-50%);
  font-size: clamp(20px, 5vw, 30px);
  font-weight: 900;
  pointer-events: none;
  z-index: 10;
  white-space: nowrap;
  animation: dmg-float 1.1s cubic-bezier(0.2,0,0.8,1) forwards;
}
.dmg-damage {
  color: #ff3333;
  text-shadow: 2px 2px 0 #000, -2px -2px 0 #000, 0 0 12px rgba(255,50,50,0.9);
}
.dmg-heal {
  color: #44ff88;
  text-shadow: 2px 2px 0 #000, -2px -2px 0 #000, 0 0 12px rgba(60,255,120,0.9);
  animation: heal-float 1.1s cubic-bezier(0.2,0,0.8,1) forwards;
}
@keyframes dmg-float {
  0%   { opacity: 1; transform: translateX(-50%) translateY(0)    scale(1.5); }
  20%  { opacity: 1; transform: translateX(-50%) translateY(-20px) scale(1);   }
  100% { opacity: 0; transform: translateX(-50%) translateY(-70px) scale(0.8); }
}
@keyframes heal-float {
  0%   { opacity: 1; transform: translateX(-50%) translateY(0)    scale(1.3); }
  20%  { opacity: 1; transform: translateX(-50%) translateY(-15px) scale(1);   }
  100% { opacity: 0; transform: translateX(-50%) translateY(-60px) scale(0.9); }
}
.monster-img-slain {
  filter: grayscale(100%) brightness(0.4);
  opacity: 0.6;
}
.portrait-slain {
  border-color: rgba(180, 40, 40, 0.6);
  box-shadow: inset 0 0 40px rgba(120, 0, 0, 0.4);
}
.msc-slain-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(circle, rgba(120, 0, 0, 0.35) 0%, rgba(0, 0, 0, 0.15) 100%);
}
.msc-slain-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.msc-slain-skull {
  font-size: 42px;
  filter: drop-shadow(0 0 12px rgba(200, 50, 50, 0.8));
  animation: slain-pulse 2s ease-in-out infinite;
}
.msc-slain-text {
  font-size: 22px;
  font-weight: bold;
  letter-spacing: 6px;
  color: #ff4444;
  text-shadow: 0 0 16px rgba(255, 60, 60, 0.9), 0 0 4px #000;
  animation: slain-pulse 2s ease-in-out infinite;
}
@keyframes slain-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%       { opacity: 0.7; transform: scale(0.96); }
}
.slain-fade-enter-active { transition: opacity 0.5s ease, transform 0.5s ease; }
.slain-fade-enter-from   { opacity: 0; transform: scale(1.2); }

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
  font-size: 50px;
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

.hpanel-active-statuses {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.hpanel-status-suffer {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(60, 10, 100, 0.15);
  border: 1px solid rgba(160, 80, 220, 0.3);
  border-left: 3px solid #a855f7;
}
.hpanel-suffer-icon {
  width: 28px;
  height: 28px;
  object-fit: contain;
  flex-shrink: 0;
  margin-top: 2px;
}
.hpanel-suffer-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.hpanel-suffer-name {
  font-size: 11px;
  font-weight: bold;
  color: #c084fc;
  text-transform: uppercase;
  letter-spacing: 1px;
}
.hpanel-suffer-desc {
  font-size: 12px;
  color: #d8b4fe;
  line-height: 1.5;
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
.armor-blastblight {
  filter: drop-shadow(0 0 4px rgba(249,115,22,0.8));
}
.armor-blastblight .element-value {
  color: #fb923c;
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
   TOKEN REVEAL OVERLAY
══════════════════════════════════════════ */
.tr-overlay {
  position: fixed;
  inset: 0;
  background: rgba(5,4,2,0.92);
  z-index: 490;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 28px;
  cursor: default;
}
.tr-title {
  font-size: 14px;
  letter-spacing: 5px;
  color: #c89b3c;
  text-transform: uppercase;
  margin: 0;
}
.tr-tokens {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  justify-content: center;
  max-width: 360px;
}
.tr-token {
  width: 64px;
  height: 64px;
  perspective: 400px;
}
.tr-token-inner {
  width: 100%;
  height: 100%;
  position: relative;
  transform-style: preserve-3d;
  transition: transform 0.5s ease;
}
.tr-token.flipped .tr-token-inner {
  transform: rotateY(180deg);
}
.tr-token-back, .tr-token-front {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: bold;
  backface-visibility: hidden;
}
.tr-token-back {
  background: rgba(30,22,8,0.9);
  border: 2px solid rgba(124,90,43,0.5);
  color: rgba(200,155,60,0.3);
}
.tr-token-front {
  background: rgba(50,35,10,0.95);
  border: 2px solid #c89b3c;
  transform: rotateY(180deg);
  box-shadow: 0 0 16px rgba(200,155,60,0.4);
}
.tr-total-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.tr-total-label {
  font-size: 11px;
  letter-spacing: 4px;
  color: #7c5a2b;
  margin: 0;
  text-transform: uppercase;
}
.tr-total {
  font-size: 48px;
  font-weight: 900;
  margin: 0;
  text-shadow: 0 0 24px currentColor;
}
.tr-hint {
  font-size: 11px;
  color: rgba(124,90,43,0.5);
  letter-spacing: 2px;
  margin: 8px 0 0;
  animation: cml-pulse 1.5s ease-in-out infinite;
}

/* ══════════════════════════════════════════
   BATTLE INTRO CINEMATIC
══════════════════════════════════════════ */
.battle-intro-overlay {
  position: fixed;
  inset: 0;
  z-index: 500;
  background: #000;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.battle-intro-overlay.bi-leave {
  animation: bi-fade-out 0.6s 0.1s ease forwards;
}
@keyframes bi-fade-out {
  to { opacity: 0; }
}

/* Red flash */
.bi-flash {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at center, #ff2200 0%, #8b0000 60%, transparent 100%);
  z-index: 10;
  animation: bi-flash-anim 0.5s ease forwards;
}
@keyframes bi-flash-anim {
  0%   { opacity: 0; }
  15%  { opacity: 0.45; }
  100% { opacity: 0; }
}

/* Impact white flash */
.bi-impact-flash {
  position: absolute;
  inset: 0;
  background: #fff;
  z-index: 9;
  animation: bi-impact-anim 0.25s 0.45s ease forwards;
  opacity: 0;
}
@keyframes bi-impact-anim {
  0%   { opacity: 0.4; }
  100% { opacity: 0; }
}

/* Speed lines */
.bi-speed-lines {
  position: absolute;
  inset: -50%;
  background: repeating-conic-gradient(
    rgba(255, 80, 0, 0.12) 0deg 2deg,
    transparent 2deg 8deg
  );
  z-index: 1;
  animation: bi-lines-anim 0.6s 0.1s ease forwards;
  opacity: 0;
  transform: scale(0.2);
}
@keyframes bi-lines-anim {
  0%   { opacity: 0; transform: scale(0.2); }
  30%  { opacity: 1; transform: scale(1); }
  100% { opacity: 0; transform: scale(1.5); }
}

/* Letterbox bars */
.bi-bar {
  position: absolute;
  left: 0; right: 0;
  background: #000;
  z-index: 6;
  animation: bi-bar-in 0.18s 0.42s cubic-bezier(0.2, 0, 0, 1) forwards;
  height: 0;
}
.bi-bar-top  { top: 0; }
.bi-bar-bottom { bottom: 0; }
@keyframes bi-bar-in {
  to { height: 13vh; }
}

/* Monster wrap — shake on land */
.bi-monster-wrap {
  position: absolute;
  z-index: 4;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  animation: bi-shake 0.15s 0.25s ease;
}
@keyframes bi-shake {
  0%,100% { transform: translate(0,0) rotate(0deg); }
  20%  { transform: translate(-10px, 8px) rotate(-0.8deg); }
  40%  { transform: translate(10px, -6px) rotate(0.8deg); }
  60%  { transform: translate(-6px, 4px) rotate(-0.4deg); }
  80%  { transform: translate(6px, -3px) rotate(0.4deg); }
}

/* Monster image — slam in */
.bi-monster-img {
  width: min(340px, 60vw);
  height: min(340px, 60vw);
  object-fit: contain;
  animation: bi-monster-slam 0.55s 0.08s cubic-bezier(0.15, 1.4, 0.4, 1) forwards;
  opacity: 0;
  transform: scale(2.2) translateY(-30%);
  filter: drop-shadow(0 0 50px rgba(255, 60, 0, 0.9)) drop-shadow(0 0 20px #ff2200);
}
@keyframes bi-monster-slam {
  0%   { opacity: 0; transform: scale(2.2) translateY(-30%); filter: brightness(3) drop-shadow(0 0 60px #ff0000); }
  60%  { opacity: 1; transform: scale(0.93) translateY(2%);  filter: brightness(1.2) drop-shadow(0 0 40px rgba(255,60,0,0.8)); }
  80%  { transform: scale(1.04) translateY(-1%); }
  100% { opacity: 1; transform: scale(1) translateY(0);       filter: drop-shadow(0 0 30px rgba(255,60,0,0.6)); }
}

/* Impact ring */
.bi-impact-ring {
  position: absolute;
  width: min(340px, 60vw);
  height: min(340px, 60vw);
  border-radius: 50%;
  border: 4px solid rgba(255, 80, 0, 0.8);
  z-index: 3;
  animation: bi-ring-expand 0.5s 0.55s ease forwards;
  opacity: 0;
}
@keyframes bi-ring-expand {
  0%   { transform: scale(0.8); opacity: 0.9; }
  100% { transform: scale(2.5); opacity: 0; }
}

/* Monster glow */
.bi-monster-glow {
  position: absolute;
  width: min(340px, 60vw);
  height: min(340px, 60vw);
  background: radial-gradient(circle, rgba(255, 60, 0, 0.3) 0%, transparent 70%);
  animation: bi-glow-pulse 0.7s 0.6s ease-in-out infinite alternate;
  opacity: 0;
}
@keyframes bi-glow-pulse {
  from { opacity: 0.6; transform: scale(0.9); }
  to   { opacity: 1;   transform: scale(1.1); }
}

/* Text block */
.bi-text-wrap {
  position: absolute;
  bottom: 18vh;
  z-index: 7;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  text-align: center;
}
.bi-line-danger {
  font-size: 11px;
  letter-spacing: 6px;
  color: #ff4444;
  text-transform: uppercase;
  margin: 0;
  animation: bi-text-pop 0.2s 0.75s ease both;
  opacity: 0;
}
.bi-line-main {
  font-size: clamp(22px, 5.5vw, 38px);
  font-weight: 900;
  color: #fff;
  letter-spacing: 2px;
  margin: 0;
  text-shadow:
    3px 0 0 rgba(255,0,0,0.7),
    -3px 0 0 rgba(0,100,255,0.5),
    0 0 30px rgba(255,80,80,0.9),
    0 2px 8px #000;
  animation: bi-text-slam 0.3s 0.85s cubic-bezier(0.1, 1.5, 0.4, 1) both;
  opacity: 0;
}
.bi-line-sub {
  font-size: 13px;
  letter-spacing: 8px;
  color: #c89b3c;
  text-transform: uppercase;
  margin: 0;
  text-shadow: 0 0 12px rgba(200, 155, 60, 0.8);
  animation: bi-text-pop 0.25s 1.05s ease both;
  opacity: 0;
}
@keyframes bi-text-slam {
  0%   { opacity: 0; transform: scale(2) translateY(-15px); filter: blur(6px); }
  60%  { opacity: 1; filter: blur(0); }
  100% { opacity: 1; transform: scale(1) translateY(0); }
}
@keyframes bi-text-pop {
  0%   { opacity: 0; transform: translateY(10px); }
  100% { opacity: 1; transform: translateY(0); }
}

/* Vignette */
.bi-vignette {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at center, transparent 35%, rgba(0,0,0,0.8) 100%);
  pointer-events: none;
  z-index: 5;
}

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

/* ——— Dismiss (close) animation ——— */
.ra-dismissing {
  animation: raFadeOut 0.5s ease-in forwards;
  pointer-events: none;
}

@keyframes raFadeOut {
  from { opacity: 1; }
  to { opacity: 0; }
}

.ra-dismissing .ra-cinebar-top {
  animation: raBarExitTop 0.35s cubic-bezier(0.4, 0, 0.2, 1) forwards;
}

.ra-dismissing .ra-cinebar-bottom {
  animation: raBarExitBottom 0.35s cubic-bezier(0.4, 0, 0.2, 1) forwards;
}

@keyframes raBarExitTop {
  from { transform: translateY(0); }
  to { transform: translateY(-100%); }
}

@keyframes raBarExitBottom {
  from { transform: translateY(0); }
  to { transform: translateY(100%); }
}

.ra-dismissing .ra-stage {
  animation: raStageExit 0.4s ease-in forwards;
}

@keyframes raStageExit {
  from { opacity: 1; transform: scale(1); }
  to { opacity: 0; transform: scale(0.88); }
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
  animation: raStageIn 0.3s ease-out 0.98s both;
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
  animation: raCrestStamp 0.45s cubic-bezier(0.22, 1.4, 0.6, 1) 1.08s both;
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
  animation: raParticleOut 1.8s ease-out calc(0.75s + var(--i) * 0.045s) both;
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
   PACK TOGGLE BUTTON
══════════════════════════════════════════ */
.dialog-tag-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.pack-toggle-btn {
  margin-left: auto;
  flex-shrink: 0;
  background: rgba(12, 9, 4, 0.9);
  border: 1px solid rgba(200, 155, 60, 0.45);
  border-radius: 20px;
  padding: 5px 12px;
  font-size: 12px;
  color: #c89b3c;
  cursor: pointer;
  font-family: 'Georgia', serif;
  transition: all 0.15s;
  letter-spacing: 1px;
}
.pack-toggle-btn:hover {
  border-color: #c89b3c;
  background: rgba(200, 155, 60, 0.1);
  color: #ffd27a;
}

/* ══════════════════════════════════════════
   PACK DRAWER
══════════════════════════════════════════ */
.pack-drawer-wrapper {
  position: fixed;
  inset: 0;
  z-index: 600;
  display: flex;
  justify-content: flex-start;
}

.pack-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
}

.pack-drawer {
  position: relative;
  width: 300px;
  max-width: 90vw;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, rgba(14, 10, 5, 0.99) 0%, rgba(10, 7, 3, 0.99) 100%);
  border-right: 1px solid rgba(200, 155, 60, 0.3);
  box-shadow: 8px 0 32px rgba(0, 0, 0, 0.8);
}

.pack-drawer-header {
  display: flex;
  align-items: center;
  padding: 14px 16px;
  border-bottom: 1px solid rgba(200, 155, 60, 0.2);
  flex-shrink: 0;
}

.pack-drawer-title {
  flex: 1;
  font-size: 14px;
  font-family: 'Georgia', serif;
  color: #ffd27a;
  letter-spacing: 2px;
}

.pack-drawer-close {
  background: none;
  border: none;
  color: #5a3d1f;
  font-size: 16px;
  cursor: pointer;
  padding: 2px 6px;
  transition: color 0.15s;
}
.pack-drawer-close:hover { color: #cc4444; }

/* Tabs */
.pack-tabs {
  display: flex;
  border-bottom: 1px solid rgba(200, 155, 60, 0.15);
  flex-shrink: 0;
}

.pack-tab {
  flex: 1;
  padding: 10px 8px;
  background: none;
  border: none;
  color: #7c5a2b;
  font-size: 12px;
  font-family: 'Georgia', serif;
  cursor: pointer;
  transition: all 0.15s;
  letter-spacing: 1px;
  border-bottom: 2px solid transparent;
}
.pack-tab:hover { color: #c89b3c; }
.pack-tab.active {
  color: #ffd27a;
  border-bottom-color: #c89b3c;
  background: rgba(200, 155, 60, 0.05);
}

/* Content area */
.pack-content {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.pack-empty {
  text-align: center;
  padding: 32px 16px;
  color: #5a3d1f;
  font-size: 13px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.pack-goto-add {
  background: rgba(200, 155, 60, 0.08);
  border: 1px solid rgba(200, 155, 60, 0.35);
  border-radius: 6px;
  padding: 6px 14px;
  color: #c89b3c;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.15s;
}
.pack-goto-add:hover { background: rgba(200, 155, 60, 0.14); color: #ffd27a; }

/* Group */
.pack-group-label {
  font-size: 9px;
  letter-spacing: 3px;
  text-transform: uppercase;
  color: #5a3d1f;
  padding: 4px 2px 2px;
}

/* Item row */
.pack-item, .pack-add-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 4px;
  border-bottom: 1px solid rgba(200, 155, 60, 0.07);
}

.pack-item-img {
  width: 28px;
  height: 28px;
  object-fit: contain;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.4);
  flex-shrink: 0;
}

.pack-item-name {
  flex: 1;
  font-size: 12px;
  color: #d4b87a;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Quantity controls */
.pack-item-ctrl {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.pctrl-btn {
  width: 22px;
  height: 22px;
  border-radius: 4px;
  border: 1px solid rgba(124, 90, 43, 0.4);
  background: rgba(0, 0, 0, 0.35);
  color: #a88040;
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.12s;
  line-height: 1;
}
.pctrl-btn:hover {
  border-color: #c89b3c;
  color: #ffd27a;
  background: rgba(200, 155, 60, 0.1);
}

.pctrl-qty {
  min-width: 22px;
  text-align: center;
  font-size: 13px;
  color: #f0ddb0;
  font-weight: bold;
}

/* Add tab */
.pack-search {
  width: 100%;
  box-sizing: border-box;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(124, 90, 43, 0.4);
  border-radius: 6px;
  padding: 7px 10px;
  font-size: 12px;
  color: #f0ddb0;
  outline: none;
  flex-shrink: 0;
}
.pack-search:focus { border-color: rgba(200, 155, 60, 0.6); }
.pack-search::placeholder { color: #5a3d1f; }

.pack-add-grid {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow-y: auto;
}

.pack-add-footer {
  flex-shrink: 0;
  padding-top: 10px;
  border-top: 1px solid rgba(200, 155, 60, 0.15);
}

.pack-confirm-btn {
  width: 100%;
  padding: 10px;
  border-radius: 8px;
  border: 1px solid rgba(0, 229, 184, 0.5);
  background: rgba(0, 229, 184, 0.07);
  color: #00e5b8;
  font-size: 13px;
  font-family: 'Georgia', serif;
  cursor: pointer;
  transition: all 0.15s;
  letter-spacing: 1px;
}
.pack-confirm-btn:hover:not(:disabled) {
  background: rgba(0, 229, 184, 0.14);
}
.pack-confirm-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
  border-color: rgba(80, 80, 80, 0.4);
  color: #666;
}

/* Drawer slide transition */
.pack-drawer-enter-active { animation: packSlideIn 0.28s cubic-bezier(0.22, 1, 0.36, 1); }
.pack-drawer-leave-active { animation: packSlideIn 0.22s ease-in reverse; }
@keyframes packSlideIn {
  from { opacity: 0; transform: translateX(-100%); }
  to   { opacity: 1; transform: translateX(0); }
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
@keyframes dice-shake {
  0%   { transform: rotate(-18deg) scale(1.15); }
  20%  { transform: rotate(14deg)  scale(1.2);  }
  40%  { transform: rotate(-10deg) scale(1.15); }
  60%  { transform: rotate(8deg)   scale(1.18); }
  80%  { transform: rotate(-5deg)  scale(1.12); }
  100% { transform: rotate(0deg)   scale(1);    }
}
.rw-die {
  width: 64px;
  height: 64px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 0 10px rgba(200, 155, 60, 0.2);
  transition: box-shadow 0.2s, border-color 0.2s;
  cursor: pointer;
  padding: 6px;
}
.rw-die:hover {
  border-color: #ffd27a;
  box-shadow: 0 0 14px rgba(255, 210, 122, 0.4);
}
.rw-die.rolling {
  animation: dice-shake 0.12s ease-in-out infinite;
  border-color: #ffd27a;
  box-shadow: 0 0 18px rgba(255, 210, 122, 0.7), 0 0 6px rgba(200, 155, 60, 0.4);
  cursor: default;
}
.die-face {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
  width: 100%;
  height: 100%;
}
.die-dot {
  border-radius: 50%;
  background: transparent;
}
.die-dot.visible {
  background: #000000;
  box-shadow: 0 0 4px rgba(255, 210, 122, 0.7);
}
/* ── Trade Phase ── */
.rw-trade { display: flex; flex-direction: column; gap: 14px; }

.trade-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  border-radius: 10px;
  background: rgba(10, 8, 4, 0.5);
  border: 1px solid rgba(124,90,43,0.3);
}
.trade-pool-section {
  border-color: rgba(90,159,255,0.35);
  background: rgba(60,100,200,0.05);
}

.trade-item-list { display: flex; flex-direction: column; gap: 6px; }
.trade-item-list-scroll {
  max-height: 200px;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-right: 2px;
}
.trade-inv-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}
.trade-inv-header .rw-section-label { margin: 0; }
.trade-search-input {
  flex: 1;
  max-width: 150px;
  background: rgba(0,0,0,0.4);
  border: 1px solid rgba(124,90,43,0.4);
  border-radius: 6px;
  color: #d4c090;
  font-size: 11px;
  padding: 4px 8px;
  font-family: inherit;
  outline: none;
  transition: border-color 0.15s;
}
.trade-search-input:focus { border-color: #c89b3c; }
.trade-search-input::placeholder { color: rgba(124,90,43,0.5); }
.trade-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 6px;
  background: rgba(200,155,60,0.06);
  border: 1px solid rgba(124,90,43,0.2);
}
.trade-item.trade-mine {
  border-color: rgba(200,155,60,0.4);
  background: rgba(200,155,60,0.08);
}
.trade-item-img { width: 28px; height: 28px; object-fit: contain; flex-shrink: 0; }
.trade-item-name { flex: 1; font-size: 12px; color: #d4c090; }
.trade-item-qty { font-size: 12px; font-weight: bold; color: #ffd27a; min-width: 28px; text-align: right; }
.trade-from { font-size: 10px; color: #7ab3ff; }

.trade-offer-btn, .trade-take-btn, .trade-cancel-btn {
  font-size: 11px;
  padding: 3px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-family: inherit;
  transition: 0.15s;
  white-space: nowrap;
}
.trade-offer-btn {
  border: 1px solid rgba(255,150,0,0.45);
  background: rgba(255,150,0,0.08);
  color: #ffb347;
}
.trade-offer-btn:hover { background: rgba(255,150,0,0.2); }
.trade-take-btn {
  border: 1px solid rgba(100,220,100,0.45);
  background: rgba(60,180,60,0.08);
  color: #7cfc00;
}
.trade-take-btn:hover { background: rgba(60,180,60,0.2); }
.trade-cancel-btn {
  border: 1px solid rgba(124,90,43,0.4);
  background: rgba(0,0,0,0.2);
  color: #7c5a2b;
}
.trade-cancel-btn:hover { color: #a88040; }

.trade-empty { font-size: 11px; color: rgba(124,90,43,0.4); text-align: center; margin: 0; padding: 8px 0; }

.trade-picker {
  margin-top: 8px;
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(200,155,60,0.08);
  border: 1px solid rgba(200,155,60,0.35);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.trade-picker-name { font-size: 13px; color: #ffd27a; font-weight: bold; }
.trade-picker-qty {
  display: flex;
  align-items: center;
  gap: 10px;
}
.trade-picker-qty button {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 1px solid rgba(200,155,60,0.4);
  background: rgba(200,155,60,0.1);
  color: #ffd27a;
  font-size: 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: 0.15s;
}
.trade-picker-qty button:hover { background: rgba(200,155,60,0.25); }
.trade-picker-qty span { font-size: 18px; font-weight: bold; color: #ffd27a; min-width: 24px; text-align: center; }
.trade-picker-max { font-size: 12px; color: #7c5a2b; }
.trade-picker-btns { display: flex; gap: 8px; }

.trade-close-row { display: flex; justify-content: flex-end; }

.rw-party-rewards {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  border-radius: 8px;
  background: rgba(60,100,200,0.05);
  border: 1px solid rgba(60,100,200,0.2);
}
.rw-party-reward-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.rw-party-dice {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.rw-party-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.rw-party-name {
  font-size: 11px;
  color: #a88040;
  min-width: 60px;
  letter-spacing: 1px;
}
.rw-dice-row-sm {
  padding: 8px;
  gap: 6px;
}
.rw-die-sm {
  width: 44px;
  height: 44px;
  padding: 4px;
  opacity: 0.85;
}
.rw-die.no-click {
  cursor: default;
}
.rw-die.no-click:hover {
  border-color: #c89b3c;
  box-shadow: 0 0 10px rgba(200,155,60,0.2);
}

.rw-reroll-status {
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(60,100,200,0.08);
  border: 1px solid rgba(60,100,200,0.25);
}
.rw-reroll-waiting {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  color: #7ab3ff;
}
.rw-reroll-ask {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-size: 12px;
  color: #d4c090;
}
.rw-reroll-ask strong { color: #ffd27a; }
.rw-reroll-btns { display: flex; gap: 6px; }
.rw-reroll-approve, .rw-reroll-deny, .rw-reroll-cancel {
  font-size: 11px;
  padding: 4px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-family: inherit;
  transition: 0.15s;
}
.rw-reroll-approve {
  border: 1px solid rgba(100,220,100,0.5);
  background: rgba(60,180,60,0.1);
  color: #7cfc00;
}
.rw-reroll-approve:hover { background: rgba(60,180,60,0.2); }
.rw-reroll-deny, .rw-reroll-cancel {
  border: 1px solid rgba(180,60,60,0.4);
  background: rgba(180,60,60,0.08);
  color: #ff6b6b;
}
.rw-reroll-deny:hover, .rw-reroll-cancel:hover { background: rgba(180,60,60,0.2); }
.rw-reroll-voted { font-size: 11px; color: #a88040; margin: 0; text-align: center; }

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
.rw-craft-btn {
  background: rgba(200,155,60,0.1);
  border: 1px solid rgba(200,155,60,0.35);
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  padding: 4px 8px;
  min-width: 34px;
  min-height: 30px;
  transition: background 0.15s;
  line-height: 1;
  flex-shrink: 0;
}
.rw-craft-btn:hover { background: rgba(200,155,60,0.25); }
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
  transition: opacity 0.2s, box-shadow 0.2s;
}
.rw-btn-confirm:disabled {
  opacity: 0.35;
  cursor: not-allowed;
  box-shadow: none;
  transform: none;
}

.rw-hunter-select {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* ══════════════════════════════════════════
   SCROLLBAR
══════════════════════════════════════════ */
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: rgba(10, 8, 4, 0.5); border-radius: 4px; }
::-webkit-scrollbar-thumb {
  background: linear-gradient(to bottom, #7c5a2b, #3a2c1a);
  border-radius: 4px;
}
::-webkit-scrollbar-thumb:hover { background: #a67c3b; }
</style>
