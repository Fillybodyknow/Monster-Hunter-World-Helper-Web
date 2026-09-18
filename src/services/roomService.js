import { db, authReady } from './firebase'
import { ref, set, get, update, onValue, remove, onDisconnect, push, runTransaction } from 'firebase/database'
import { getWeapons } from './equipService'
import { rankOf } from './hunterRank'

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

/* ── Cleanup ห้องเก่าที่ค้างอยู่ (Host ปิดแท็บโดยไม่ได้กด "ออก") ──────
   Host หลุด = ห้องไม่ถูกลบ (ตั้งใจ ให้กลับเข้าห้องเดิมได้) ห้องที่เจ้าของไม่กลับมาจึงค้างถาวร

   กฎของ Firebase ให้อ่าน rooms/<code> ทีละห้อง ไล่อ่านทั้งกองไม่ได้ (ยืนยันด้วยการยิงจริง 2026-09-16: 401)
   โค้ดเดิมอ่าน rooms ทั้งกองแล้วโดนปฏิเสธ error ถูก catch กลืน เลยไม่เคยลบอะไรเลยตั้งแต่เขียนมา
   ตอนนี้จึงเก็บ "สารบัญ" แยกไว้ที่ roomIndex ซึ่งไล่อ่านทั้งกองได้ และเล็กมาก (ห้องละไม่กี่สิบไบต์)
   ไม่เอาข้อมูลห้องจริงมาไว้ในนี้ — rooms/ มี hash รหัสผ่านอยู่ และการเปิดให้อ่านทั้งกองจะหนักขึ้นเรื่อย ๆ

   roomIndex/<code> = { createdAt, online: { <hunterId>: true } }
   online เขียนคู่กับ presence ของห้อง และ onDisconnect ฝั่ง server ลบให้เองแม้เบราว์เซอร์ crash */
const STALE_ROOM_MS = 5 * 60 * 60 * 1000 // 5 ชั่วโมง
// กันไว้เผื่อ presence ค้าง — เปิดมานานขนาดนี้ถือว่าร้างแน่นอน ห้องจะได้ไม่ค้างถาวร
const MAX_ROOM_AGE_MS = 24 * 60 * 60 * 1000
// ลบทีละไม่เกินเท่านี้ต่อการสร้างห้องหนึ่งครั้ง — ไม่ให้คนที่กดสร้างห้องต้องรอลบของค้างเป็นกอง
const MAX_CLEANUP_PER_RUN = 30

const isStaleEntry = (e, now) => {
  const age = now - (e?.createdAt ?? 0)
  if (age > MAX_ROOM_AGE_MS) return true
  return age > STALE_ROOM_MS && Object.keys(e?.online ?? {}).length === 0
}

// เขียนสารบัญแบบ best-effort — ถ้ากฎยังไม่อนุญาต (Console ยังไม่อัปเดต) ห้ามให้การสร้างห้องพัง
const indexRoom = (code) =>
  set(ref(db, `roomIndex/${code}`), { createdAt: Date.now() }).catch(() => {})

const unindexRoom = (code) => remove(ref(db, `roomIndex/${code}`)).catch(() => {})

const cleanupStaleRooms = async () => {
  try {
    const snap = await get(ref(db, 'roomIndex'))
    if (!snap.exists()) return
    const now = Date.now()
    const stale = []
    snap.forEach((child) => {
      if (stale.length < MAX_CLEANUP_PER_RUN && isStaleEntry(child.val(), now)) stale.push(child.key)
    })
    // ลบทีละห้อง ไม่ใช่ update ก้อนเดียวที่ rooms/ — กฎอนุญาตให้เขียนทีละ rooms/<code> เท่านั้น
    await Promise.all(
      stale.flatMap((code) => [
        remove(ref(db, `rooms/${code}`)).catch(() => {}),
        remove(ref(db, `roomIndex/${code}`)).catch(() => {}),
        remove(ref(db, `lobbies/${code}`)).catch(() => {}),
      ]),
    )
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
        palico_id: hunter.palico_id ?? null,
        campaign_day: hunter.campaign_day ?? 1,
        hunter_rank: rankOf(hunter),
        weapon,
        isHost: true,
        joinedAt: Date.now(),
      },
    },
  }

  await set(ref(db, `rooms/${code}`), roomData)
  indexRoom(code)
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
    palico_id: hunter.palico_id ?? null,
    campaign_day: hunter.campaign_day ?? 1,
    hunter_rank: rankOf(hunter),
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
    hunter_rank: rankOf(hunter),
    weapon: await buildWeaponSummary(hunter),
  })
}

// ── โอนหัวห้อง ───────────────────────────────────────────
// เขียนครั้งเดียวทั้ง hostId และธง isHost ของทั้งสองคน ไม่งั้นมีจังหวะที่ห้องมีสองหัวหรือไม่มีเลย
export const setRoomHost = (code, newHostId, oldHostId) =>
  update(ref(db, `rooms/${code}`), {
    hostId: newHostId,
    [`hunters/${newHostId}/isHost`]: true,
    [`hunters/${oldHostId}/isHost`]: false,
    hostConnected: true,
  })

// ── Leave Room ───────────────────────────────────────────
export const leaveRoom = async (code, hunterId, isHost) => {
  if (isHost) {
    await remove(ref(db, `rooms/${code}`))
    unindexRoom(code)
  } else {
    await remove(ref(db, `rooms/${code}/hunters/${hunterId}`))
    remove(ref(db, `roomIndex/${code}/online/${hunterId}`)).catch(() => {})
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
  // สำเนา presence ลงสารบัญด้วย — ตัวเก็บกวาดอ่านได้เฉพาะสารบัญ ไม่ได้อ่าน rooms/ ทั้งกอง
  // เก็บแยกตามคน ไม่ใช่ flag เดียว ไม่งั้นลูกทีมคนเดียวหลุดจะทำให้ห้องที่ยังเล่นกันอยู่ดูเหมือนร้าง
  if (hunterId == null) return
  const seenRef = ref(db, `roomIndex/${code}/online/${hunterId}`)
  set(seenRef, true).catch(() => {})
  onDisconnect(seenRef).remove().catch(() => {})
}

// ── ยกเลิก onDisconnect ที่ฝากไว้ ─────────────────────────
// คำสั่ง onDisconnect ถูกเก็บไว้ที่ server ไม่ใช่ที่เครื่อง — ลบห้องทิ้งแล้วมันยังรออยู่
// พอปิดแท็บทีหลัง server จะเขียน hostConnected/connected = false กลับเข้าไป
// สร้าง node ห้องที่ลบไปแล้วขึ้นมาใหม่เป็นซากเปล่า ๆ ต้องยกเลิกทุกครั้งที่ออกจากห้อง
// ไม่คืน promise ให้ await — ถ้าเน็ตหลุดอยู่ผลลัพธ์จาก server จะไม่มา แล้วจะค้างคาการออกห้องไว้
// คำสั่งวิ่งไปตามคอนเนกชันเดียวกันตามลำดับ ยิงก่อนลบห้องก็ถึง server ก่อนเสมอ
// role: 'host' | 'guest' | 'all' (รวม lobby) — ตอนโอนหัวห้องใช้ยกเลิกเฉพาะบทบาทที่เสียไป
export const cancelDisconnect = (code, hunterId, role = 'all') => {
  if (!code) return
  const paths = []
  if (role !== 'guest') paths.push(`rooms/${code}/hostConnected`)
  if (role !== 'host' && hunterId != null) paths.push(`rooms/${code}/hunters/${hunterId}/connected`)
  if (role === 'all') paths.push(`lobbies/${code}`)
  if (hunterId != null) paths.push(`roomIndex/${code}/online/${hunterId}`)
  paths.forEach((p) => onDisconnect(ref(db, p)).cancel().catch(() => {}))
}

export const setConnected = (code, hunterId, connected) =>
  set(ref(db, `rooms/${code}/hunters/${hunterId}/connected`), connected)

export const setHostConnected = (code, val) =>
  set(ref(db, `rooms/${code}/hostConnected`), val)

// คนถูกเตะจะยกเลิก onDisconnect ของตัวเองทิ้ง (ไม่ให้ไปปลุกห้องที่ออกไปแล้ว)
// สารบัญจึงต้องให้ Host เป็นคนลบให้ ไม่งั้นค้างเป็น "ยังออนไลน์" จนกว่าจะชนเพดาน 24 ชม.
export const kickHunter = (code, hunterId) => {
  remove(ref(db, `roomIndex/${code}/online/${hunterId}`)).catch(() => {})
  return remove(ref(db, `rooms/${code}/hunters/${hunterId}`))
}

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

// ── Reroll Request ────────────────────────────────────────
export const pushRerollRequest = (code, hunterId, hunterName) =>
  set(ref(db, `rooms/${code}/rerollRequest`), { requesterId: hunterId, requesterName: hunterName, approvals: {} })

export const setRerollApproval = (code, hunterId, approved) =>
  set(ref(db, `rooms/${code}/rerollRequest/approvals/${hunterId}`), approved)

export const clearRerollRequest = (code) =>
  remove(ref(db, `rooms/${code}/rerollRequest`))

export const pushPartyDice = (code, hunterId, rolls) =>
  set(ref(db, `rooms/${code}/partyDice/${hunterId}`), rolls)

// เต๋าโบนัสจาก Slayer Card — คนละลูกต่อคน แยก node จาก partyDice ที่เป็นกองรวมของตี้
export const pushSlayerDie = (code, hunterId, value) =>
  set(ref(db, `rooms/${code}/slayerDice/${hunterId}`), value)

export const clearSlayerDice = (code) => remove(ref(db, `rooms/${code}/slayerDice`))

export const clearPartyDice = (code) =>
  remove(ref(db, `rooms/${code}/partyDice`))

export const pushDialogCounts = (code, hunterId, counts) =>
  set(ref(db, `rooms/${code}/dialogCounts/${hunterId}`), counts)

export const clearAllDialogCounts = (code) =>
  remove(ref(db, `rooms/${code}/dialogCounts`))

// ── Hunter Token ──────────────────────────────────────────
export const pushHunterToken = (code, hunterId, token) =>
  set(ref(db, `rooms/${code}/hunterTokens/${hunterId}`), token)

export const pushAllHunterTokens = (code, tokens) =>
  set(ref(db, `rooms/${code}/hunterTokens`), tokens)

export const clearHunterTokens = (code) =>
  remove(ref(db, `rooms/${code}/hunterTokens`))

// ยืนยันการเลือก — แยก node จาก hunterTokens เพราะเลือกแล้วยังเปลี่ยนใจได้จนกว่าจะกดยืนยัน
export const pushHunterTokenConfirm = (code, hunterId, confirmed) =>
  set(ref(db, `rooms/${code}/hunterTokenConfirms/${hunterId}`), confirmed || null)

export const clearHunterTokenConfirms = (code) =>
  remove(ref(db, `rooms/${code}/hunterTokenConfirms`))

// ความสามารถชุดเกราะแบบ "เควสละครั้ง" — เก็บรวมเป็น node เดียวเผื่อใบอื่นในอนาคต
// ต้อง sync เพราะทั้งตี้ต้องเห็นตรงกันว่าใครใช้สิทธิ์ไปแล้ว ไม่ใช่แค่เจ้าตัว
export const pushAbilityUsed = (code, hunterId, abilityId) =>
  set(ref(db, `rooms/${code}/abilityUsed/${hunterId}/${abilityId}`), true)

export const clearAbilityUsed = (code) => remove(ref(db, `rooms/${code}/abilityUsed`))

// คำขอสลับ Hunter Token — ปลายทางต้องกดยินยอมก่อนถึงจะสลับจริง
// มีได้ทีละคำขอ ทั้งห้องเห็น node เดียวกัน ไม่ต้องแยกรายคน
export const pushTokenSwapRequest = (code, req) =>
  set(ref(db, `rooms/${code}/tokenSwapRequest`), req)

export const clearTokenSwapRequest = (code) => remove(ref(db, `rooms/${code}/tokenSwapRequest`))

// ใช้ยา / ล้ม — ทุกคนยิงสัญญาณนี้ได้เอง แต่คนที่แก้ huntState จริงคือ Host เท่านั้น
// (huntState ถูกเขียนทั้งก้อน ถ้าปล่อยให้ guest เขียนจะทับ HP/ชิ้นส่วนที่ Host ถืออยู่)
export const pushUseSignal = (code, payload) =>
  set(ref(db, `rooms/${code}/useSignal`), { at: Date.now(), ...payload })

// ── บันทึกการล่า — ใครกดอะไรไปบ้าง + ย้อนได้ ─────────────
// push ต่อท้ายทีละรายการ ไม่เขียนทับทั้งก้อน สองคนกดพร้อมกันก็ไม่หายสักรายการ
export const pushHuntLogEntry = (code, entry) =>
  push(ref(db, `rooms/${code}/huntLog`), { at: Date.now(), ...entry })

// จองสิทธิ์ย้อนรายการนี้ — transaction ให้มีคนเดียวที่ย้อนสำเร็จ ถ้าสองคนกดพร้อมกันจะไม่ย้อนซ้ำสองรอบ
// คืน true = เราได้สิทธิ์ ต้องเป็นคนใส่ผลย้อนเอง
export const claimHuntLogUndo = async (code, entryId, undoneBy) => {
  const res = await runTransaction(ref(db, `rooms/${code}/huntLog/${entryId}`), (cur) => {
    if (!cur || cur.undone) return undefined
    return { ...cur, undone: true, undoneBy }
  })
  return res.committed
}

export const clearHuntLog = (code) => remove(ref(db, `rooms/${code}/huntLog`))

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

// ── Palico ────────────────────────────────────────────────
// ใครถือใบไหน — เก็บบน record ของ hunter เลย เพราะทุกที่ที่ต้องใช้ (Lodge, ดราฟต์,
// แถบปาร์ตี้ตอนล่า) วนอ่าน hunters อยู่แล้ว ไม่ต้องไป join กับ node อื่น
export const pushHunterPalico = (code, hunterId, palicoId) =>
  set(ref(db, `rooms/${code}/hunters/${hunterId}/palico_id`), palicoId ?? null)

// กองที่ Lodge เปิดให้จ้าง (ตี้ 3-4 คน) — สุ่มตอนเข้า Downtime ทั้งตี้เห็นกองเดียวกัน
// hired เก็บแยกใน node ลูก เพื่อให้คนจ้างเขียนเฉพาะช่องตัวเอง ไม่ทับกองที่ Host แจกไว้
export const pushPalicoOffer = (code, offer) =>
  set(ref(db, `rooms/${code}/palicoOffer`), offer)
export const pushPalicoHire = (code, hunterId, palicoId) =>
  set(ref(db, `rooms/${code}/palicoOffer/hired/${hunterId}`), palicoId)
export const clearPalicoOffer = (code) =>
  remove(ref(db, `rooms/${code}/palicoOffer`))

// ── จองใบ Palico ──────────────────────────────────────────
// ทุกทางที่ได้ Palico มา (ดราฟต์, จ้างที่ Lodge ทั้งตี้เล็กและตี้ใหญ่) ต้องจองที่นี่ก่อนผูกใบ
// set() ธรรมดาเขียนคนละ path ของใครของมัน server รับหมด สองคนกดพร้อมกันเลยได้ใบเดียวกันทั้งคู่
// transaction บน path เดียวต่อใบ ให้ server ตัดสินตามลำดับที่รับจริง คนแพ้รู้ก่อนเสียของ
// liveHunterIds = คนที่ยังอยู่ในห้อง — การจองของคนที่ออกไปแล้วยึดทับได้ ไม่ปล่อยให้ใบค้างทั้งเควสต์
// temporary = จองชั่วคราวตอนเข้าหน้าจ่ายของ — ผูก onDisconnect ให้ server ลบเองถ้าปิดแท็บ/หลุดค้างอยู่
// ไม่งั้นใบนั้นล็อกค้างทั้ง Downtime เพราะคนหลุดยังนับว่าอยู่ในห้อง (hunters ไม่ถูกลบตอนหลุด)
// ถาวร (ดราฟต์ / กดยืนยันจ้าง) = ยกเลิก onDisconnect ทิ้ง การจองอยู่ต่อแม้หลุด
// ผูก onDisconnect "หลัง" จองสำเร็จเท่านั้น — ผูกก่อนแล้วจองไม่ได้ ตอนเราหลุดจะไปลบการจองของคนอื่น
export const claimPalicoSlot = async (code, palicoId, hunterId, liveHunterIds = [], { temporary = false } = {}) => {
  const me = String(hunterId)
  const live = new Set(liveHunterIds.map(String))
  const slot = ref(db, `rooms/${code}/palicoClaims/${palicoId}`)
  const res = await runTransaction(slot, (cur) => {
    if (cur == null || String(cur) === me || !live.has(String(cur))) return me
    return undefined // คนในห้องจองไว้แล้ว — คืน undefined คือยกเลิก transaction
  })
  const ok = res.committed && String(res.snapshot.val()) === me
  if (ok) {
    if (temporary) await onDisconnect(slot).remove()
    else await onDisconnect(slot).cancel()
  }
  return ok
}

// ปล่อยเฉพาะการจองที่ยังเป็นของเราจริง — ไม่ไปลบของคนที่ยึดทับไปแล้ว
export const releasePalicoSlot = async (code, palicoId, hunterId) => {
  const me = String(hunterId)
  const slot = ref(db, `rooms/${code}/palicoClaims/${palicoId}`)
  // ถอด onDisconnect ก่อน — ถ้าปล่อยค้าง พอเราหลุดทีหลังจะไปลบการจองของคนที่มาจองใบนี้ต่อ
  await onDisconnect(slot).cancel()
  await runTransaction(slot, (cur) => (String(cur) === me ? null : undefined))
}

export const clearPalicoClaims = (code) =>
  remove(ref(db, `rooms/${code}/palicoClaims`))

// ดราฟต์ก่อนเริ่มเควสต์ (ตี้ 1-2 คน) — Host แจกให้ทุกคนทีเดียวจากกองเดียว
// ถ้าให้ต่างคนต่างสุ่มเองจะมีทางได้ใบซ้ำกัน
export const pushPalicoDraft = (code, draft) =>
  set(ref(db, `rooms/${code}/palicoDraft`), draft)
export const pushPalicoDraftPick = (code, hunterId, palicoId) =>
  set(ref(db, `rooms/${code}/palicoDraft/picks/${hunterId}`), palicoId)
export const clearPalicoDraft = (code) =>
  remove(ref(db, `rooms/${code}/palicoDraft`))

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
