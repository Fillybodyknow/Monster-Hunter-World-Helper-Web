import { db } from './firebase'
import { ref, set, get, update, onValue, remove, onDisconnect, push } from 'firebase/database'

const generateRoomCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

// ── Cleanup ห้องเก่าที่ค้างอยู่ (Host ปิดไปโดยไม่ได้กด "ออก") ──────
// เรียกแบบ best-effort ตอนสร้างห้องใหม่ — ลบห้องที่ไม่มีความเคลื่อนไหวนานเกิน STALE_ROOM_MS
const STALE_ROOM_MS = 5 * 60 * 60 * 1000 // 5 ชั่วโมง

const cleanupStaleRooms = async () => {
  try {
    const snap = await get(ref(db, 'rooms'))
    if (!snap.exists()) return
    const now = Date.now()
    const updates = {}
    snap.forEach((child) => {
      const r = child.val()
      const lastActive = r?.createdAt ?? 0
      if (now - lastActive > STALE_ROOM_MS) {
        updates[child.key] = null
      }
    })
    if (Object.keys(updates).length) {
      await update(ref(db, 'rooms'), updates)
    }
  } catch {
    // best-effort เท่านั้น ไม่ต้อง throw
  }
}

// ── Create Room ──────────────────────────────────────────
export const createRoom = async (hunter) => {
  cleanupStaleRooms()

  let code
  let exists = true

  while (exists) {
    code = generateRoomCode()
    const snap = await get(ref(db, `rooms/${code}`))
    exists = snap.exists()
  }

  const roomData = {
    code,
    hostId: hunter.hunter_id,
    createdAt: Date.now(),
    gameState: null,
    hunters: {
      [hunter.hunter_id]: {
        hunter_id: hunter.hunter_id,
        hunter_name: hunter.hunter_name,
        hunter_class_id: hunter.hunter_class_id,
        palico_name: hunter.palico_name,
        isHost: true,
        joinedAt: Date.now(),
      },
    },
  }

  await set(ref(db, `rooms/${code}`), roomData)
  return code
}

// ── Join Room ────────────────────────────────────────────
export const joinRoom = async (code, hunter) => {
  const snap = await get(ref(db, `rooms/${code}`))
  if (!snap.exists()) throw new Error('ไม่พบ Room นี้')

  const room = snap.val()
  const hunterCount = Object.keys(room.hunters || {}).length
  if (hunterCount >= 4) throw new Error('Room เต็มแล้ว (สูงสุด 4 คน)')

  const takenClasses = Object.values(room.hunters || {})
    .filter(h => h.hunter_id !== hunter.hunter_id)
    .map(h => h.hunter_class_id)
  if (takenClasses.includes(hunter.hunter_class_id)) throw new Error('Class นี้มีผู้เล่นอื่นใช้อยู่แล้วในตี้')

  await update(ref(db, `rooms/${code}/hunters/${hunter.hunter_id}`), {
    hunter_id: hunter.hunter_id,
    hunter_name: hunter.hunter_name,
    hunter_class_id: hunter.hunter_class_id,
    palico_name: hunter.palico_name,
    isHost: false,
    joinedAt: Date.now(),
  })

  return room
}

// ── Leave Room ───────────────────────────────────────────
export const leaveRoom = async (code, hunterId, isHost) => {
  if (isHost) {
    await remove(ref(db, `rooms/${code}`))
  } else {
    await remove(ref(db, `rooms/${code}/hunters/${hunterId}`))
  }
}

// ── Sync game state (host pushes) ───────────────────────
export const pushGameState = (code, state) => {
  return update(ref(db, `rooms/${code}/gameState`), state)
}

// ── Ready state ─────────────────────────────────────────
export const setHunterReady = (code, hunterId, ready) => {
  return update(ref(db, `rooms/${code}/hunters/${hunterId}`), { ready })
}

// ── Quest start signal ───────────────────────────────────
export const pushQuestStart = (code) => {
  return set(ref(db, `rooms/${code}/questStartAt`), Date.now())
}

// ── Quest info (host pushes when opening lobby) ──────────
export const pushQuestInfo = (code, questInfo) => {
  return set(ref(db, `rooms/${code}/questInfo`), questInfo)
}

// ── Dialog votes ─────────────────────────────────────────
export const pushDialogVote = (code, hunterId, actionId) =>
  set(ref(db, `rooms/${code}/dialogVotes/${hunterId}`), actionId)

export const clearDialogVotes = (code) =>
  remove(ref(db, `rooms/${code}/dialogVotes`))

// ── Current dialog sync ───────────────────────────────────
export const pushCurrentDialog = (code, dialogId) =>
  set(ref(db, `rooms/${code}/currentDialog`), dialogId)

// ── Current game phase sync ───────────────────────────────
export const pushGamePhase = (code, phase) =>
  set(ref(db, `rooms/${code}/gamePhase`), phase)

// ── Hunt state (any player pushes, all sync) ─────────────
export const pushHuntState = (code, state) =>
  update(ref(db, `rooms/${code}/huntState`), state)

// ── Outcome votes ─────────────────────────────────────────
export const pushOutcomeVote = (code, hunterId, outcome) =>
  set(ref(db, `rooms/${code}/outcomeVotes/${hunterId}`), outcome)

export const clearOutcomeVotes = (code) =>
  remove(ref(db, `rooms/${code}/outcomeVotes`))

export const removeOutcomeVote = (code, hunterId) =>
  remove(ref(db, `rooms/${code}/outcomeVotes/${hunterId}`))

// ── Host's picked action (for tie-breaking) ──────────────
export const pushPendingAction = (code, actionId) =>
  set(ref(db, `rooms/${code}/pendingActionId`), actionId)

export const clearPendingAction = (code) =>
  remove(ref(db, `rooms/${code}/pendingActionId`))

// ── Proceed votes ─────────────────────────────────────────
export const pushProceedVote = (code, hunterId) =>
  set(ref(db, `rooms/${code}/proceedVotes/${hunterId}`), true)

export const clearProceedVotes = (code) =>
  remove(ref(db, `rooms/${code}/proceedVotes`))

// ── Listen to room changes ───────────────────────────────
export const listenRoom = (code, callback) => {
  const roomRef = ref(db, `rooms/${code}`)
  const unsub = onValue(roomRef, (snap) => callback(snap.val()))
  return unsub
}

// ── Auto-remove hunter on disconnect ────────────────────
export const registerDisconnect = (code, hunterId, isHost) => {
  if (isHost) {
    // Host disconnect: mark as disconnected instead of deleting room
    const connRef = ref(db, `rooms/${code}/hostConnected`)
    set(connRef, true)
    onDisconnect(connRef).set(false)
  } else {
    const connRef = ref(db, `rooms/${code}/hunters/${hunterId}/connected`)
    set(connRef, true)
    onDisconnect(connRef).set(false)
  }
}

export const setConnected = (code, hunterId, connected) =>
  set(ref(db, `rooms/${code}/hunters/${hunterId}/connected`), connected)

export const setHostConnected = (code, val) =>
  set(ref(db, `rooms/${code}/hostConnected`), val)

export const kickHunter = (code, hunterId) =>
  remove(ref(db, `rooms/${code}/hunters/${hunterId}`))

// ── Behavior Deck Sync ───────────────────────────────────
export const pushBehaviorDeck = (code, deckState) =>
  set(ref(db, `rooms/${code}/behaviorDeck`), deckState)

// ── Track Token Sync ──────────────────────────────────────
export const pushTrackTokens = (code, pool, tokens) =>
  set(ref(db, `rooms/${code}/trackTokens`), { pool, tokens })

// ── Manual Outcome State ──────────────────────────────────
export const pushManualOutcome = (code, outcome) =>
  set(ref(db, `rooms/${code}/manualOutcome`), outcome ?? null)

// ── Reward Dice Modifier State (Time Card overrides) ──────
export const pushRewardDiceModifiers = (code, modifiers) =>
  set(ref(db, `rooms/${code}/rewardDiceModifiers`), modifiers ?? null)

// ── Outcome Float Signal ──────────────────────────────────
export const pushOutcomeSignal = (code, outcome) =>
  set(ref(db, `rooms/${code}/outcomeSignal`), { outcome, ts: Date.now() })

// ── Activation Count Sync ─────────────────────────────────
export const pushActivationCount = (code, count) =>
  set(ref(db, `rooms/${code}/activationCount`), count)

// ── Shuffle Signal ────────────────────────────────────────
export const pushShuffleSignal = (code) =>
  set(ref(db, `rooms/${code}/shuffleSignal`), Date.now())

// ── Time Card Deck Sync ───────────────────────────────────
export const pushTimeCards = (code, deckState) =>
  set(ref(db, `rooms/${code}/timeCards`), deckState)

// ── Time Card Turn Ends ───────────────────────────────────
export const pushTcPending = (code, hunterId, hunterName) =>
  set(ref(db, `rooms/${code}/tcTurnEnds/${hunterId}`), { hunterName, pending: true })

export const pushTcDrawn = (code, hunterId, hunterName, card) =>
  set(ref(db, `rooms/${code}/tcTurnEnds/${hunterId}`), { hunterName, card })

export const clearTcTurnEnds = (code) =>
  remove(ref(db, `rooms/${code}/tcTurnEnds`))

// ── Quest Mode ────────────────────────────────────────────
export const pushQuestMode = (code, mode) =>
  set(ref(db, `rooms/${code}/questMode`), mode)

// ── Reroll Request ────────────────────────────────────────
export const pushRerollRequest = (code, hunterId, hunterName) =>
  set(ref(db, `rooms/${code}/rerollRequest`), { requesterId: hunterId, requesterName: hunterName, approvals: {} })

export const setRerollApproval = (code, hunterId, approved) =>
  set(ref(db, `rooms/${code}/rerollRequest/approvals/${hunterId}`), approved)

export const clearRerollRequest = (code) =>
  remove(ref(db, `rooms/${code}/rerollRequest`))

export const pushPartyDice = (code, hunterId, rolls) =>
  set(ref(db, `rooms/${code}/partyDice/${hunterId}`), rolls)

export const clearPartyDice = (code) =>
  remove(ref(db, `rooms/${code}/partyDice`))

export const pushDialogCounts = (code, hunterId, counts) =>
  set(ref(db, `rooms/${code}/dialogCounts/${hunterId}`), counts)

export const clearAllDialogCounts = (code) =>
  remove(ref(db, `rooms/${code}/dialogCounts`))

export const pushActionVote = (code, hunterId, action) =>
  set(ref(db, `rooms/${code}/actionVotes/${hunterId}`), action)

export const clearActionVotes = (code) =>
  remove(ref(db, `rooms/${code}/actionVotes`))

export const pushPartyRewards = (code, hunterId, rewards) =>
  set(ref(db, `rooms/${code}/partyRewards/${hunterId}`), rewards)

export const clearPartyRewards = (code) =>
  remove(ref(db, `rooms/${code}/partyRewards`))

// ── Trade Pool ────────────────────────────────────────────
export const addTradeItem = (code, item) =>
  push(ref(db, `rooms/${code}/tradePool`), item)

export const removeTradeItem = (code, key) =>
  remove(ref(db, `rooms/${code}/tradePool/${key}`))

export const clearTradePool = (code) =>
  remove(ref(db, `rooms/${code}/tradePool`))

// ── HQ Vote ───────────────────────────────────────────────
export const pushHqVote = (code, hunterId, vote) =>
  set(ref(db, `rooms/${code}/hqVotes/${hunterId}`), vote)
export const clearHqVotes = (code) =>
  remove(ref(db, `rooms/${code}/hqVotes`))

// ── HQ State (visit tracking per hunter) ─────────────────
export const pushHqCurrent = (code, hunterId, locationId) =>
  set(ref(db, `rooms/${code}/hqState/${hunterId}/current`), locationId ?? null)
export const pushHqDoneList = (code, hunterId, doneList) =>
  set(ref(db, `rooms/${code}/hqState/${hunterId}/done`), doneList.length ? doneList : null)
export const pushHqReady = (code, hunterId, ready) =>
  set(ref(db, `rooms/${code}/hqState/${hunterId}/ready`), ready)
export const clearHqState = (code) =>
  remove(ref(db, `rooms/${code}/hqState`))
