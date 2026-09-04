import { db, authReady } from './firebase'
import { ref, set, get, update, onValue, remove, onDisconnect, push } from 'firebase/database'
import { getWeapons } from './equipService'

// สรุปอาวุธที่ถืออยู่ให้เพื่อนร่วมตี้เห็น (ชื่อ + rarity + ไอคอน)
// Firebase ไม่รับ undefined — คืน null ถ้าหาไม่เจอ
const buildWeaponSummary = async (hunter) => {
  try {
    const equipped = hunter?.equipments?.weapons?.find((w) => w.is_equip)
    if (!equipped) return null
    const w = await getWeapons(hunter.hunter_class_id, equipped.weapon_type_id, equipped.item_id)
    if (!w) return null
    return {
      name: w.item ?? '',
      rarity: w.rarity ?? 0,
      thumbnail: w.thumbnail ?? '',
      weapon_type: w.weapon_type ?? '',
    }
  } catch {
    return null
  }
}

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
  await authReady()
  cleanupStaleRooms()

  let code
  let exists = true

  while (exists) {
    code = generateRoomCode()
    const snap = await get(ref(db, `rooms/${code}`))
    exists = snap.exists()
  }

  const weapon = await buildWeaponSummary(hunter)

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
        campaign_day: hunter.campaign_day ?? 1,
        weapon,
        isHost: true,
        joinedAt: Date.now(),
      },
    },
  }

  await set(ref(db, `rooms/${code}`), roomData)
  return code
}

// ── Join Room ────────────────────────────────────────────
// validate(room) → คืนข้อความถ้าห้ามเข้า / null ถ้าผ่าน — เช็คก่อนเขียนตัวเองลงห้อง
// ใช้เฉพาะคนใหม่ คนที่อยู่ในตี้อยู่แล้ว (rejoin) ข้ามเสมอ ไม่งั้นหลุดแล้วกลับเข้าไม่ได้
export const joinRoom = async (code, hunter, validate) => {
  await authReady()
  const snap = await get(ref(db, `rooms/${code}`))
  if (!snap.exists()) throw new Error('ไม่พบ Room นี้')

  const room = snap.val()
  const existing = room.hunters?.[hunter.hunter_id]
  const isRejoin = !!existing

  if (!isRejoin) {
    const hunterCount = Object.keys(room.hunters || {}).length
    if (hunterCount >= 4) throw new Error('Room เต็มแล้ว (สูงสุด 4 คน)')

    const takenClasses = Object.values(room.hunters || {})
      .filter(h => h.hunter_id !== hunter.hunter_id)
      .map(h => h.hunter_class_id)
    if (takenClasses.includes(hunter.hunter_class_id)) throw new Error('Class นี้มีผู้เล่นอื่นใช้อยู่แล้วในตี้')

    const blocked = validate?.(room)
    if (blocked) throw new Error(blocked)
  }

  await update(ref(db, `rooms/${code}/hunters/${hunter.hunter_id}`), {
    hunter_id: hunter.hunter_id,
    hunter_name: hunter.hunter_name,
    hunter_class_id: hunter.hunter_class_id,
    palico_name: hunter.palico_name,
    campaign_day: hunter.campaign_day ?? 1,
    weapon: await buildWeaponSummary(hunter),
    isHost: existing?.isHost ?? false,
    joinedAt: existing?.joinedAt ?? Date.now(),
  })

  return room
}

// อัปเดต day/อาวุธของตัวเองในห้อง — เรียกได้ซ้ำ ๆ ใช้กับห้องที่เข้าไปก่อนหน้าแล้วด้วย
export const updateHunterProfile = async (code, hunter) => {
  await authReady()
  if (!code || !hunter?.hunter_id) return
  return update(ref(db, `rooms/${code}/hunters/${hunter.hunter_id}`), {
    campaign_day: hunter.campaign_day ?? 1,
    weapon: await buildWeaponSummary(hunter),
  })
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
export const pushShuffleSignal = (code, kind = 'behavior') =>
  set(ref(db, `rooms/${code}/shuffleSignal`), { at: Date.now(), kind })

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

// ── Dialog Dice (ผลทอยแบบ "ทอยครั้งเดียว" ใช้ร่วมกันทั้งกลุ่ม) ──
export const pushDialogDice = (code, key, value) =>
  set(ref(db, `rooms/${code}/dialogDice/${key}`), value)

export const clearDialogDice = (code) =>
  remove(ref(db, `rooms/${code}/dialogDice`))

// ── ผลทอยรายคน (แบบ "ทุกคนทอยของตัวเอง") — ใช้โชว์ว่าใครได้อะไร ──
export const pushDiceResult = (code, key, hunterId, result) =>
  set(ref(db, `rooms/${code}/diceResults/${key}/${hunterId}`), result)

export const clearDiceResults = (code) =>
  remove(ref(db, `rooms/${code}/diceResults`))

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

// ── Lobby Board (ประกาศห้องให้คนอื่นเห็นและกด Join) ──────────
// แยกจาก rooms/ เพราะต้อง list ทั้งหมด — เก็บแค่ข้อมูลที่ใช้แสดงบนการ์ด
// ไม่มี state เกมและไม่มีรหัสผ่าน (เก็บ hash ไว้ใน rooms/ แทน)
export const publishLobby = async (code, data) => {
  await authReady()
  const lobbyRef = ref(db, `lobbies/${code}`)
  // Host หลุด = ห้องหาย ไม่ทิ้งประกาศค้างไว้บนบอร์ด
  onDisconnect(lobbyRef).remove()
  return set(lobbyRef, { ...data, code, updatedAt: Date.now() })
}

export const updateLobby = (code, patch) =>
  update(ref(db, `lobbies/${code}`), { ...patch, updatedAt: Date.now() })

export const removeLobby = (code) => remove(ref(db, `lobbies/${code}`))

export const listenLobbies = (callback) => {
  let unsub = () => {}
  authReady().then(() => {
    unsub = onValue(ref(db, 'lobbies'), (snap) => callback(snap.val() ?? {}))
  })
  return () => unsub()
}

// รหัสผ่านห้อง — เก็บ hash ไว้ใน rooms/ ไม่ใช่ lobbies/ ที่ใครก็อ่านได้
export const setRoomPassword = (code, hash) =>
  set(ref(db, `rooms/${code}/passwordHash`), hash ?? null)

export const getRoomPassword = async (code) => {
  await authReady()
  const snap = await get(ref(db, `rooms/${code}/passwordHash`))
  return snap.exists() ? snap.val() : null
}
