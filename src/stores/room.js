import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { isFirebaseConnected } from '@/services/firebase'
import { createRoom, joinRoom, leaveRoom, listenRoom, registerDisconnect, setHunterReady, pushQuestStart, pushQuestInfo, pushDialogVote, clearDialogVotes, pushCurrentDialog, pushProceedVote, clearProceedVotes, pushPendingAction, clearPendingAction, pushHuntState, pushOutcomeVote, clearOutcomeVotes, removeOutcomeVote, setConnected, kickHunter, pushPartyDice, clearPartyDice, pushActionVote, clearActionVotes, pushPartyRewards, clearPartyRewards, addTradeItem, removeTradeItem, clearTradePool, pushDialogCounts, clearAllDialogCounts, setHostConnected, pushRerollRequest, setRerollApproval, clearRerollRequest, pushGamePhase, pushTrackTokens, pushBehaviorDeck, pushTimeCards, pushTcPending, pushTcDrawn, clearTcTurnEnds, pushShuffleSignal, pushActivationCount, pushOutcomeSignal, pushManualOutcome } from '@/services/roomService'

export const useRoomStore = defineStore('room', () => {
  const roomCode = ref(null)
  const roomData = ref(null)
  const isHost = ref(false)
  const myHunterId = ref(null)
  const joinSignal = ref(0)
  let _unsub = null

  const hunters = computed(() => Object.values(roomData.value?.hunters ?? {}))
  const hunterCount = computed(() => hunters.value.length)
  const inRoom = computed(() => !!roomCode.value)
  const gameState = computed(() => roomData.value?.gameState ?? null)
  const allReady = computed(() => hunters.value.length > 0 && hunters.value.every((h) => h.ready))

  // Dialog votes
  const dialogVotes = computed(() => roomData.value?.dialogVotes ?? {})
  const votesByAction = computed(() => {
    const counts = {}
    Object.values(dialogVotes.value).forEach((id) => {
      counts[id] = (counts[id] || 0) + 1
    })
    return counts
  })
  const votersByAction = computed(() => {
    const map = {}
    Object.entries(dialogVotes.value).forEach(([hunterId, actionId]) => {
      if (!map[actionId]) map[actionId] = []
      const h = hunters.value.find((h) => String(h.hunter_id) === String(hunterId))
      if (h) map[actionId].push(h.hunter_name)
    })
    return map
  })
  const myVote = computed(() => dialogVotes.value[myHunterId.value] ?? null)
  const syncedDialogId = computed(() => roomData.value?.currentDialog ?? null)
  const syncedPhase = computed(() => roomData.value?.gamePhase ?? null)

  const proceedVotes = computed(() => roomData.value?.proceedVotes ?? {})
  const allProceeded = computed(() =>
    hunters.value.length > 0 &&
    hunters.value.every((h) => proceedVotes.value[h.hunter_id])
  )
  const myProceedVoted = computed(() => !!proceedVotes.value[myHunterId.value])
  const syncedPendingActionId = computed(() => roomData.value?.pendingActionId ?? null)

  const huntState = computed(() => roomData.value?.huntState ?? null)
  const behaviorDeckState = computed(() => roomData.value?.behaviorDeck ?? null)
  const trackTokenState = computed(() => roomData.value?.trackTokens ?? null)
  const timeCardState = computed(() => roomData.value?.timeCards ?? null)
  const tcTurnEnds = computed(() => roomData.value?.tcTurnEnds ?? null)
  const shuffleSignal = computed(() => roomData.value?.shuffleSignal ?? null)
  const activationCount = computed(() => roomData.value?.activationCount ?? 0)

  // Reroll request
  const rerollRequest = computed(() => roomData.value?.rerollRequest ?? null)
  const myRerollApproval = computed(() => rerollRequest.value?.approvals?.[myHunterId.value] ?? null)
  const rerollAllApproved = computed(() => {
    if (!rerollRequest.value) return false
    const approvals = rerollRequest.value.approvals ?? {}
    return hunters.value
      .filter((h) => h.hunter_id !== rerollRequest.value.requesterId)
      .every((h) => approvals[h.hunter_id] === true)
  })
  const hostConnected = computed(() => roomData.value?.hostConnected !== false)
  const myDialogCounts = computed(() => roomData.value?.dialogCounts?.[myHunterId.value] ?? null)
  const partyDice = computed(() => roomData.value?.partyDice ?? {})
  const partyRewards = computed(() => roomData.value?.partyRewards ?? {})
  const tradePool = computed(() => {
    const raw = roomData.value?.tradePool ?? {}
    return Object.entries(raw).map(([key, val]) => ({ key, ...val }))
  })
  const actionVotes = computed(() => roomData.value?.actionVotes ?? {})
  const myActionVote = computed(() => actionVotes.value[myHunterId.value] ?? null)
  const actionVoteCount = (action) => Object.values(actionVotes.value).filter((v) => v === action).length
  const isActionComplete = (action) =>
    hunters.value.length > 0 && hunters.value.every((h) => actionVotes.value[h.hunter_id] === action)
  const outcomeVotes = computed(() => roomData.value?.outcomeVotes ?? {})
  const outcomeResult = computed(() => {
    const votes = Object.values(outcomeVotes.value)
    if (!votes.length) return null
    const majority = Math.floor(hunters.value.length / 2) + 1
    const counts = votes.reduce((acc, v) => ({ ...acc, [v]: (acc[v] || 0) + 1 }), {})
    for (const [outcome, count] of Object.entries(counts)) {
      if (count >= majority) return outcome
    }
    return null
  })
  const myOutcomeVote = computed(() => outcomeVotes.value[myHunterId.value] ?? null)
  const questStartAt = computed(() => roomData.value?.questStartAt ?? null)
  const questInfo = computed(() => roomData.value?.questInfo ?? null)
  const myHunter = computed(() => hunters.value.find((h) => h.hunter_id === myHunterId.value))
  const amReady = computed(() => myHunter.value?.ready ?? false)

  const _listen = (code) => {
    if (_unsub) _unsub()
    _unsub = listenRoom(code, (data) => {
      if (!data) { reset(); return }
      roomData.value = data
    })
  }

  const reregisterHostConnected = () => {
    if (!roomCode.value || !isHost.value) return
    setHostConnected(roomCode.value, true)
    registerDisconnect(roomCode.value, myHunterId.value, true)
  }

  // Auto re-register when Firebase reconnects (handles host disconnect overlay)
  watch(isFirebaseConnected, (connected) => {
    if (connected && roomCode.value && isHost.value) {
      setHostConnected(roomCode.value, true)
      registerDisconnect(roomCode.value, myHunterId.value, true)
    }
  })

  const create = async (hunter) => {
    const code = await createRoom(hunter)
    roomCode.value = code
    isHost.value = true
    myHunterId.value = hunter.hunter_id
    _listen(code)
    registerDisconnect(code, hunter.hunter_id, true)
    localStorage.setItem('lastRoomCode', code); savedRoomCode.value = code
    return code
  }

  const join = async (code, hunter) => {
    const roomSnap = await joinRoom(code, hunter)
    roomCode.value = code
    myHunterId.value = hunter.hunter_id
    _listen(code)

    // Check if this hunter is the original host reconnecting
    const rejoiningAsHost = roomSnap?.hostId === hunter.hunter_id
    isHost.value = rejoiningAsHost

    if (rejoiningAsHost) {
      setHostConnected(code, true)
      registerDisconnect(code, hunter.hunter_id, true)
    } else {
      registerDisconnect(code, hunter.hunter_id, false)
      setConnected(code, hunter.hunter_id, true)
    }
    localStorage.setItem('lastRoomCode', code); savedRoomCode.value = code
    joinSignal.value++
  }

  const kick = async (hunterId) => {
    if (!roomCode.value || !isHost.value) return
    await kickHunter(roomCode.value, hunterId)
  }

  const leave = async () => {
    if (!roomCode.value) return
    if (_unsub) _unsub()
    await leaveRoom(roomCode.value, myHunterId.value, isHost.value)
    localStorage.removeItem('lastRoomCode')
    savedRoomCode.value = null
    reset()
  }

  const setReady = (ready) => {
    if (!roomCode.value || !myHunterId.value) return
    return setHunterReady(roomCode.value, myHunterId.value, ready)
  }

  const triggerQuestStart = () => {
    if (!roomCode.value) return
    return pushQuestStart(roomCode.value)
  }

  const setQuestInfo = (info) => {
    if (!roomCode.value) return
    return pushQuestInfo(roomCode.value, info)
  }

  const voteForAction = (actionId) => {
    if (!roomCode.value || !myHunterId.value) return
    return pushDialogVote(roomCode.value, myHunterId.value, actionId)
  }

  const clearVotes = () => {
    if (!roomCode.value) return
    return clearDialogVotes(roomCode.value)
  }

  const setCurrentDialog = (dialogId) => {
    if (!roomCode.value) return
    return pushCurrentDialog(roomCode.value, dialogId)
  }

  const voteProceed = () => {
    if (!roomCode.value || !myHunterId.value) return
    return pushProceedVote(roomCode.value, myHunterId.value)
  }

  const clearProceed = () => {
    if (!roomCode.value) return
    return clearProceedVotes(roomCode.value)
  }

  const setPendingAction = (actionId) => {
    if (!roomCode.value) return
    return pushPendingAction(roomCode.value, actionId)
  }

  const clearSyncedPendingAction = () => {
    if (!roomCode.value) return
    return clearPendingAction(roomCode.value)
  }

  const syncHuntState = (state) => {
    if (!roomCode.value) return
    return pushHuntState(roomCode.value, state)
  }

  const voteOutcome = (outcome) => {
    if (!roomCode.value || !myHunterId.value) return
    return pushOutcomeVote(roomCode.value, myHunterId.value, outcome)
  }

  const clearOutcome = () => {
    if (!roomCode.value) return
    return clearOutcomeVotes(roomCode.value)
  }

  const pushMyDice = (rolls) => {
    if (!roomCode.value || !myHunterId.value) return
    return pushPartyDice(roomCode.value, myHunterId.value, rolls)
  }

  const clearAllPartyDice = () => {
    if (!roomCode.value) return
    return clearPartyDice(roomCode.value)
  }

  const pushMyRewards = (rewards) => {
    if (!roomCode.value || !myHunterId.value) return
    return pushPartyRewards(roomCode.value, myHunterId.value, rewards)
  }

  const clearAllPartyRewards = () => {
    if (!roomCode.value) return
    return clearPartyRewards(roomCode.value)
  }

  const addToTradePool = (item) => {
    if (!roomCode.value) return
    return addTradeItem(roomCode.value, { ...item, fromHunterId: myHunterId.value, fromHunterName: myHunter.value?.hunter_name ?? '' })
  }

  const removeFromTradePool = (key) => {
    if (!roomCode.value) return
    return removeTradeItem(roomCode.value, key)
  }

  const clearTrade = () => {
    if (!roomCode.value) return
    return clearTradePool(roomCode.value)
  }

  const syncBehaviorDeck = (deckState) => {
    if (!roomCode.value) return
    return pushBehaviorDeck(roomCode.value, deckState)
  }

  const syncTimeCards = (deckState) => {
    if (!roomCode.value) return
    return pushTimeCards(roomCode.value, deckState)
  }

  const markTcPending = (hunterId, hunterName) => {
    if (!roomCode.value) return
    return pushTcPending(roomCode.value, hunterId, hunterName)
  }

  const markTcDrawn = (hunterId, hunterName, card) => {
    if (!roomCode.value) return
    return pushTcDrawn(roomCode.value, hunterId, hunterName, card)
  }

  const clearAllTurnEnds = () => {
    if (!roomCode.value) return
    return clearTcTurnEnds(roomCode.value)
  }

  const syncTrackTokens = (pool, tokens) => {
    if (!roomCode.value) return
    return pushTrackTokens(roomCode.value, pool, tokens)
  }

  const syncPhase = (phase) => {
    if (!roomCode.value) return
    return pushGamePhase(roomCode.value, phase)
  }

  const requestReroll = () => {
    if (!roomCode.value || !myHunterId.value) return
    const h = myHunter.value
    return pushRerollRequest(roomCode.value, myHunterId.value, h?.hunter_name ?? '')
  }

  const respondReroll = (approved) => {
    if (!roomCode.value || !myHunterId.value) return
    return setRerollApproval(roomCode.value, myHunterId.value, approved)
  }

  const cancelReroll = () => {
    if (!roomCode.value) return
    return clearRerollRequest(roomCode.value)
  }

  const setMyDialogCounts = (counts) => {
    if (!roomCode.value || !myHunterId.value) return
    return pushDialogCounts(roomCode.value, myHunterId.value, counts)
  }

  const clearDialogCounts = () => {
    if (!roomCode.value) return
    return clearAllDialogCounts(roomCode.value)
  }

  const voteAction = (action) => {
    if (!roomCode.value || !myHunterId.value) return
    return pushActionVote(roomCode.value, myHunterId.value, action)
  }

  const clearActionVote = () => {
    if (!roomCode.value) return
    return clearActionVotes(roomCode.value)
  }

  const unvoteOutcome = () => {
    if (!roomCode.value || !myHunterId.value) return
    return removeOutcomeVote(roomCode.value, myHunterId.value)
  }

  const reset = () => {
    roomCode.value = null
    roomData.value = null
    isHost.value = false
    myHunterId.value = null
    _unsub = null
  }

  const savedRoomCode = ref(localStorage.getItem('lastRoomCode') ?? null)
  const clearSavedRoom = () => {
    localStorage.removeItem('lastRoomCode')
    savedRoomCode.value = null
  }

  return {
    roomCode, roomData, isHost, myHunterId,
    hunters, hunterCount, inRoom, gameState,
    allReady, questStartAt, questInfo, myHunter, amReady,
    dialogVotes, votesByAction, votersByAction, myVote, syncedDialogId,
    proceedVotes, allProceeded, myProceedVoted,
    syncedPendingActionId,
    huntState, behaviorDeckState, hostConnected, partyDice, partyRewards, tradePool, myDialogCounts,
    trackTokenState, timeCardState, tcTurnEnds,
    rerollRequest, myRerollApproval, rerollAllApproved,
    syncedPhase,
    actionVotes, myActionVote, actionVoteCount, isActionComplete,
    outcomeVotes, outcomeResult, myOutcomeVote,
    create, join, leave, setReady, triggerQuestStart, setQuestInfo,
    voteForAction, clearVotes, setCurrentDialog, voteProceed, clearProceed,
    setPendingAction, clearSyncedPendingAction,
    joinSignal, savedRoomCode, clearSavedRoom,
    reregisterHostConnected,
    syncHuntState, voteOutcome, unvoteOutcome, clearOutcome,
    triggerShuffle: () => roomCode.value ? pushShuffleSignal(roomCode.value) : undefined,
    shuffleSignal,
    activationCount,
    syncActivationCount: (count) => roomCode.value ? pushActivationCount(roomCode.value, count) : undefined,
    outcomeSignal: computed(() => roomData.value?.outcomeSignal ?? null),
    triggerOutcomeSignal: (outcome) => roomCode.value ? pushOutcomeSignal(roomCode.value, outcome) : undefined,
    manualOutcomeState: computed(() => roomData.value?.manualOutcome ?? null),
    syncManualOutcome: (outcome) => roomCode.value ? pushManualOutcome(roomCode.value, outcome) : undefined,
    syncBehaviorDeck,
    syncTrackTokens,
    syncTimeCards, markTcPending, markTcDrawn, clearAllTurnEnds,
    syncPhase,
    requestReroll, respondReroll, cancelReroll,
    pushMyDice, clearAllPartyDice,
    pushMyRewards, clearAllPartyRewards,
    addToTradePool, removeFromTradePool, clearTrade,
    setMyDialogCounts, clearDialogCounts,
    voteAction, clearActionVote, kick, reset,
  }
})
