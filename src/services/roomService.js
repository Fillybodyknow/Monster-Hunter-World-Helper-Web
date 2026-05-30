import { db } from './firebase'
import { ref, set, get, update, onValue, remove, onDisconnect } from 'firebase/database'

const generateRoomCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

// ── Create Room ──────────────────────────────────────────
export const createRoom = async (hunter) => {
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
  const target = isHost
    ? ref(db, `rooms/${code}`)
    : ref(db, `rooms/${code}/hunters/${hunterId}`)
  onDisconnect(target).remove()
}
