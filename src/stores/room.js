import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { createRoom, joinRoom, leaveRoom, listenRoom, registerDisconnect, setHunterReady, pushQuestStart, pushQuestInfo, pushDialogVote, clearDialogVotes, pushCurrentDialog, pushProceedVote, clearProceedVotes, pushPendingAction, clearPendingAction, pushHuntState, pushOutcomeVote, clearOutcomeVotes, removeOutcomeVote } from '@/services/roomService'

export const useRoomStore = defineStore('room', () => {
  const roomCode = ref(null)
  const roomData = ref(null)
  const isHost = ref(false)
  const myHunterId = ref(null)
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

  const proceedVotes = computed(() => roomData.value?.proceedVotes ?? {})
  const allProceeded = computed(() =>
    hunters.value.length > 0 &&
    hunters.value.every((h) => proceedVotes.value[h.hunter_id])
  )
  const myProceedVoted = computed(() => !!proceedVotes.value[myHunterId.value])
  const syncedPendingActionId = computed(() => roomData.value?.pendingActionId ?? null)

  const huntState = computed(() => roomData.value?.huntState ?? null)
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

  const create = async (hunter) => {
    const code = await createRoom(hunter)
    roomCode.value = code
    isHost.value = true
    myHunterId.value = hunter.hunter_id
    _listen(code)
    registerDisconnect(code, hunter.hunter_id, true)
    return code
  }

  const join = async (code, hunter) => {
    await joinRoom(code, hunter)
    roomCode.value = code
    isHost.value = false
    myHunterId.value = hunter.hunter_id
    _listen(code)
    registerDisconnect(code, hunter.hunter_id, false)
  }

  const leave = async () => {
    if (!roomCode.value) return
    if (_unsub) _unsub()
    await leaveRoom(roomCode.value, myHunterId.value, isHost.value)
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

  return {
    roomCode, roomData, isHost, myHunterId,
    hunters, hunterCount, inRoom, gameState,
    allReady, questStartAt, questInfo, myHunter, amReady,
    dialogVotes, votesByAction, votersByAction, myVote, syncedDialogId,
    proceedVotes, allProceeded, myProceedVoted,
    syncedPendingActionId,
    huntState, outcomeVotes, outcomeResult, myOutcomeVote,
    create, join, leave, setReady, triggerQuestStart, setQuestInfo,
    voteForAction, clearVotes, setCurrentDialog, voteProceed, clearProceed,
    setPendingAction, clearSyncedPendingAction,
    syncHuntState, voteOutcome, unvoteOutcome, clearOutcome, reset,
  }
})
