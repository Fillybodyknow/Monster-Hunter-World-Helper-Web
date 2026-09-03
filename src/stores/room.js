import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { isFirebaseConnected } from '@/services/firebase'
import { createRoom, joinRoom, leaveRoom, listenRoom, registerDisconnect, setHunterReady, pushQuestStart, pushQuestInfo, pushDialogVote, clearDialogVotes, pushCurrentDialog, pushProceedVote, clearProceedVotes, pushPendingAction, clearPendingAction, pushHuntState, pushOutcomeVote, clearOutcomeVotes, removeOutcomeVote, setConnected, kickHunter, pushPartyDice, clearPartyDice, pushActionVote, clearActionVotes, pushPartyRewards, clearPartyRewards, addTradeItem, removeTradeItem, clearTradePool, pushDialogCounts, clearAllDialogCounts, pushDialogDice, clearDialogDice, setHostConnected, pushRerollRequest, setRerollApproval, clearRerollRequest, pushGamePhase, pushTrackTokens, pushBehaviorDeck, pushTimeCards, pushTcPending, pushTcDrawn, clearTcTurnEnds, pushShuffleSignal, pushActivationCount, pushOutcomeSignal, pushManualOutcome, pushRewardDiceModifiers, pushQuestMode, pushHqVote, clearHqVotes, pushHqCurrent, pushHqDoneList, pushHqReady, clearHqState, updateHunterProfile, publishLobby, updateLobby, removeLobby, listenLobbies, setRoomPassword, getRoomPassword } from '@/services/roomService'

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
  const questModeState = computed(() => roomData.value?.questMode ?? null)
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
  const dialogDice = computed(() => roomData.value?.dialogDice ?? {})

  // ── Lobby Board ──────────────────────────────────────────
  const lobbies = ref({})
  const lobbyPosted = ref(false)
  let _lobbyUnsub = null

  // ห้องที่ค้างเกิน 3 ชม. ถือว่าตายแล้ว (onDisconnect อาจไม่ทำงานถ้าเบราว์เซอร์ crash)
  const LOBBY_STALE_MS = 3 * 60 * 60 * 1000

  const lobbyList = computed(() => {
    const now = Date.now()
    return Object.values(lobbies.value)
      .filter((l) => l && !l.started && now - (l.updatedAt ?? 0) < LOBBY_STALE_MS)
      .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
  })
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

  // HQ Vote
  const hqVotes = computed(() => roomData.value?.hqVotes ?? {})
  const hqState = computed(() => roomData.value?.hqState ?? {})
  const hqVoteResult = computed(() => {
    const votes = Object.values(hqVotes.value)
    if (!votes.length) return null
    const majority = Math.floor(hunters.value.length / 2) + 1
    const hqCount = votes.filter(v => v === 'hq').length
    const questCount = votes.filter(v => v === 'quest').length
    if (hqCount >= majority) return 'hq'
    if (questCount >= majority) return 'quest'
    return null
  })
  const hqAllVoted = computed(() =>
    hunters.value.length > 0 && hunters.value.every(h => hqVotes.value[h.hunter_id])
  )
  const hqVoteTied = computed(() => hqAllVoted.value && hqVoteResult.value === null)
  const allHqReady = computed(() =>
    hunters.value.length > 0 &&
    hunters.value.every(h => hqState.value[h.hunter_id]?.ready)
  )

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
    // rejoin ใช้ record เดิม — เขียน day/อาวุธล่าสุดทับ ไม่งั้นการ์ดจะโชว์ข้อมูลเก่า
    updateHunterProfile(code, hunter).catch(() => {})
    joinSignal.value++
  }

  const kick = async (hunterId) => {
    if (!roomCode.value || !isHost.value) return
    await kickHunter(roomCode.value, hunterId)
  }

  const leave = async () => {
    if (!roomCode.value) return
    if (_unsub) _unsub()
    // Host ออก = ห้องหาย ต้องถอดประกาศออกจากบอร์ดด้วย
    if (isHost.value) await removeLobby(roomCode.value).catch(() => {})
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

  // hash แบบเบา ๆ พอกันไม่ให้รหัสโผล่เป็น plaintext ใน DB
  // (บอร์ดเกมเล่นกับเพื่อน ไม่ได้ต้องการ crypto จริงจัง)
  const _hashPassword = (pw) => {
    let h = 5381
    for (let i = 0; i < pw.length; i++) h = ((h << 5) + h + pw.charCodeAt(i)) | 0
    return String(h >>> 0)
  }

  const startLobbyBrowse = () => {
    if (_lobbyUnsub) return
    _lobbyUnsub = listenLobbies((data) => { lobbies.value = data })
  }

  const stopLobbyBrowse = () => {
    _lobbyUnsub?.()
    _lobbyUnsub = null
    lobbies.value = {}
  }

  // เข้าห้องที่มีอยู่แล้วจะไม่ผ่าน createRoom — ต้องเขียน day/อาวุธของตัวเองซ้ำเอง
  const syncMyProfile = (hunter) => {
    if (!roomCode.value || !hunter) return
    return updateHunterProfile(roomCode.value, hunter)
  }

  // ข้อมูลผู้เล่นที่โชว์บนการ์ดห้อง — undefined ถูกตัดทิ้งเพราะ Firebase ไม่รับ
  const _lobbyMember = (h) => ({
    hunter_id: h.hunter_id,
    hunter_name: h.hunter_name,
    hunter_class_id: h.hunter_class_id,
    campaign_day: h.campaign_day ?? 1,
    weapon: h.weapon ?? null,
  })

  // Firebase ปฏิเสธ undefined — ตัดทิ้งก่อนส่ง
  const _stripUndefined = (obj) =>
    Object.fromEntries(Object.entries(obj ?? {}).filter(([, v]) => v !== undefined))

  // Host ประกาศห้องขึ้นบอร์ดหลังตั้งค่า quest เสร็จ
  const postLobby = async ({ roomName, password, questInfo, questMode }) => {
    if (!roomCode.value || !isHost.value) return
    await setRoomPassword(roomCode.value, password ? _hashPassword(password) : null)
    return publishLobby(roomCode.value, {
      roomName,
      hasPassword: !!password,
      questMode: questMode ?? 'full',
      hostId: myHunterId.value,
      hostName: hunters.value.find((h) => h.hunter_id === myHunterId.value)?.hunter_name ?? '',
      questInfo: questInfo ? _stripUndefined(questInfo) : null,
      members: hunters.value.map(_lobbyMember),
      memberCount: hunters.value.length,
      started: false,
      createdAt: Date.now(),
    }).then(() => { lobbyPosted.value = true })
  }

  const syncLobbyMembers = () => {
    if (!roomCode.value || !isHost.value || !lobbyPosted.value) return
    return updateLobby(roomCode.value, {
      members: hunters.value.map(_lobbyMember),
      memberCount: hunters.value.length,
    })
  }

  // เควสเริ่มแล้ว = ถอดออกจากบอร์ด ไม่ให้คนอื่นเข้ามากลางเกม
  const closeLobby = async () => {
    if (!roomCode.value || !isHost.value) return
    lobbyPosted.value = false
    return removeLobby(roomCode.value)
  }

  const verifyLobbyPassword = async (code, password) => {
    const hash = await getRoomPassword(code)
    if (!hash) return true
    return hash === _hashPassword(password ?? '')
  }

  // สมาชิกเข้า/ออกระหว่างรออยู่ในล็อบบี้ — อัปเดตการ์ดบนบอร์ดให้ตรง
  watch(hunters, () => {
    if (isHost.value && lobbyPosted.value) syncLobbyMembers()
  }, { deep: true })

  const setDialogDice = (key, value) => {
    if (!roomCode.value) return
    return pushDialogDice(roomCode.value, key, value)
  }

  const clearDialogDiceAll = () => {
    if (!roomCode.value) return
    return clearDialogDice(roomCode.value)
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

  const voteHq = (vote) => {
    if (!roomCode.value || !myHunterId.value) return
    return pushHqVote(roomCode.value, myHunterId.value, vote)
  }
  const clearHqVotesAll = () => {
    if (!roomCode.value) return
    return clearHqVotes(roomCode.value)
  }
  const setHqCurrent = (locationId) => {
    if (!roomCode.value || !myHunterId.value) return
    return pushHqCurrent(roomCode.value, myHunterId.value, locationId)
  }
  const setHqDoneList = (doneList) => {
    if (!roomCode.value || !myHunterId.value) return
    return pushHqDoneList(roomCode.value, myHunterId.value, doneList)
  }
  const setHqReady = (ready) => {
    if (!roomCode.value || !myHunterId.value) return
    return pushHqReady(roomCode.value, myHunterId.value, ready)
  }
  const clearHqStateAll = () => {
    if (!roomCode.value) return
    return clearHqState(roomCode.value)
  }

  const reset = () => {
    roomCode.value = null
    roomData.value = null
    isHost.value = false
    myHunterId.value = null
    lobbyPosted.value = false
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
    huntState, behaviorDeckState, hostConnected, partyDice, partyRewards, tradePool, myDialogCounts, dialogDice, lobbies, lobbyList, lobbyPosted,
    trackTokenState, timeCardState, tcTurnEnds, questModeState,
    syncQuestMode: (mode) => roomCode.value ? pushQuestMode(roomCode.value, mode) : undefined,
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
    rewardDiceModifierState: computed(() => roomData.value?.rewardDiceModifiers ?? null),
    syncRewardDiceModifiers: (modifiers) => roomCode.value ? pushRewardDiceModifiers(roomCode.value, modifiers) : undefined,
    syncBehaviorDeck,
    syncTrackTokens,
    syncTimeCards, markTcPending, markTcDrawn, clearAllTurnEnds,
    syncPhase,
    requestReroll, respondReroll, cancelReroll,
    pushMyDice, clearAllPartyDice,
    pushMyRewards, clearAllPartyRewards,
    addToTradePool, removeFromTradePool, clearTrade,
    setMyDialogCounts, clearDialogCounts, setDialogDice, clearDialogDiceAll,
    startLobbyBrowse, stopLobbyBrowse, postLobby, syncLobbyMembers, closeLobby, verifyLobbyPassword, syncMyProfile,
    voteAction, clearActionVote, kick, reset,
    hqVotes, hqState, hqVoteResult, hqVoteTied, allHqReady,
    voteHq, clearHqVotesAll, setHqCurrent, setHqDoneList, setHqReady, clearHqStateAll,
  }
})
