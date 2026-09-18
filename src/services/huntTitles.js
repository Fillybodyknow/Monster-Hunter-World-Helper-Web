// ฉายาตอนสรุปการล่า (Hunter Highlights) — คนละ 1 ฉายา คิดจากบันทึกการล่าล้วน ๆ
// ทุกเครื่องในห้องคำนวณเองจากบันทึกชุดเดียวกัน จึงต้อง deterministic:
// คะแนนเท่ากันตัดสินด้วย key ของ Hunter ไม่ใช้ลำดับที่รายการเข้ามา

// ลำดับในตาราง = ลำดับความสำคัญในการแจก
// leaderOnly: ฉายาที่ความหมายคือ "มากที่สุด" ให้เฉพาะคนที่นำจริง ไม่ส่งต่อให้อันดับสอง
// min: ค่าต่ำสุดที่ถือว่าเข้าเงื่อนไข
// img: รูปสถานะ/ธาตุ แสดงแทน icon บนการ์ด

// สถานะแยกตามชนิด — id ตาม status_effect.json
const AILMENT_TITLES = [
  { sid: 1, icon: '🌀', name: 'ช่างเคาะกะโหลก', label: 'ทำให้มึน (Stun)', img: 'assets/img/status_effect/stun.webp' },
  { sid: 2, icon: '☠', name: 'นักปรุงพิษ', label: 'ทำให้ติดพิษ (Poison)', img: 'assets/img/status_effect/poison.webp' },
  { sid: 3, icon: '💤', name: 'ผู้กล่อมนิทรา', label: 'ทำให้หลับ (Sleep)', img: 'assets/img/status_effect/sleep.webp' },
  { sid: 4, icon: '🔗', name: 'จอมสะกดร่าง', label: 'ทำให้อัมพาต (Paralysis)', img: 'assets/img/status_effect/paralysis.webp' },
  { sid: 5, icon: '💣', name: 'มือระเบิดพลีชีพ', label: 'ทำให้ระเบิด (Blast)', img: 'assets/img/status_effect/blastblight.webp' },
].map((t) => ({ ...t, id: `ailment${t.sid}`, stat: `status${t.sid}`, min: 1, unit: 'x' }))

// ธาตุแยกตามชนิด — id ตาม elemental.json
const ELEMENT_TITLES = [
  { eid: 1, icon: '🔥', name: 'เจ้าแห่งเปลวเพลิง', label: 'ธาตุไฟทำงาน', img: 'assets/img/elemental/fire.webp' },
  { eid: 2, icon: '💧', name: 'นักรบสายน้ำ', label: 'ธาตุน้ำทำงาน', img: 'assets/img/elemental/water.webp' },
  { eid: 3, icon: '⚡', name: 'สายฟ้าฟาด', label: 'ธาตุสายฟ้าทำงาน', img: 'assets/img/elemental/thunder.webp' },
  { eid: 4, icon: '❄', name: 'หัวใจน้ำแข็ง', label: 'ธาตุน้ำแข็งทำงาน', img: 'assets/img/elemental/ice.webp' },
  { eid: 5, icon: '🐉', name: 'ผู้สังหารมังกร', label: 'ธาตุมังกรทำงาน', img: 'assets/img/elemental/dragon.webp' },
].map((t) => ({ ...t, id: `element${t.eid}`, stat: `element${t.eid}`, min: 1, unit: 'x' }))

export const HUNT_TITLES = [
  { id: 'finisher', icon: '🗡', name: 'ผู้ปิดฉาก', label: 'ดาเมจครั้งสุดท้าย', stat: 'finisher', min: 1, leaderOnly: true },
  { id: 'topDamage', icon: '👑', name: 'นักล่าตัวจริง', label: 'ดาเมจรวม', stat: 'dmg', min: 1, leaderOnly: true },
  { id: 'bigTurn', icon: '💥', name: 'หนึ่งเทิร์นสะท้านโลก', label: 'ดาเมจในเทิร์นเดียว', stat: 'bestTurn', min: 8 },
  { id: 'partBreaker', icon: '🔨', name: 'ช่างทุบเกราะ', label: 'ดาเมจชิ้นส่วน', stat: 'partDmg', min: 1 },
  // ติดสถานะได้ตั้งแต่ 2 ชนิดขึ้นไป — เหนือกว่าฉายาสถานะชนิดเดียว (แบบ Ailment Master ในเกม)
  { id: 'ailmentMaster', icon: '⚗', name: 'ปรมาจารย์สถานะ', label: 'ชนิดสถานะที่ทำให้ติด', stat: 'ailmentKinds', min: 2, unit: 'ชนิด' },
  ...AILMENT_TITLES,
  { id: 'elementMaster', icon: '🌈', name: 'ผู้กุมธาตุทั้งปวง', label: 'ชนิดธาตุที่ทำงาน', stat: 'elementKinds', min: 2, unit: 'ชนิด' },
  ...ELEMENT_TITLES,
  // ลง Mark ไว้เยอะแต่คนอื่นเป็นคนทำให้ติด — คนปูทางให้ทีม
  { id: 'marks', icon: '🧱', name: 'ผู้ปูทาง', label: 'ลง Mark ให้ทีม', stat: 'marks', min: 3, unit: 'x' },
  { id: 'palico', icon: '🐾', name: 'ทาสแมว', label: 'ใช้ Palico', stat: 'palico', min: 1, unit: 'x' },
  { id: 'faint', icon: '💫', name: 'ผู้กลับจากค่าย', label: 'ล้มกลับแคมป์', stat: 'faints', min: 1, unit: 'x' },
  { id: 'potion', icon: '🧪', name: 'นักดื่มยา', label: 'ใช้ยา', stat: 'potions', min: 2, unit: 'x' },
  { id: 'undo', icon: '⟲', name: 'ผู้แก้ไขประวัติศาสตร์', label: 'กดย้อน', stat: 'undos', min: 2, unit: 'x' },
]
// คนที่ไม่เข้าเงื่อนไขไหนเลย — ทุกคนต้องมีฉายา
export const FALLBACK_TITLE = { id: 'support', icon: '🛡', name: 'ผู้สนับสนุน', label: 'เทิร์นที่เล่น', stat: 'turns', unit: 'x' }

const keyOf = (e) => String(e.whoId ?? e.whoName ?? '?')
// status1..5 / element1..5 เพิ่มเข้ามาเมื่อเจอ — อ่านผ่าน statOf ที่คืน 0 ถ้าไม่มี
const emptyStats = () => ({ dmg: 0, bestTurn: 0, partDmg: 0, ailmentKinds: 0, elementKinds: 0, marks: 0, palico: 0, faints: 0, potions: 0, undos: 0, turns: 0, finisher: 0 })
const statOf = (p, stat) => p.stats[stat] ?? 0

// ผลของเทิร์น (HP / ชิ้นส่วน / สถานะ / ธาตุ) นับให้เจ้าของเทิร์น — เล่นจริงกดแทนกันบ่อย
// สะสมไว้ในกองจนมีคนกดจบเทิร์น แล้วยกกองนั้นให้คนนั้น (จบเทิร์นกดได้จากเครื่องตัวเองเท่านั้น)
// กองที่ค้างหลังจบเทิร์นสุดท้าย (ตีตายแล้วเควสจบเลย) ยกให้คนที่กดแต่ละรายการ
const TURN_KINDS = new Set(['hp', 'part', 'status', 'element'])

/**
 * @param {object[]} log บันทึกการล่าทั้งหมด (รวมรายการที่ถูกย้อน) เรียงตามเวลา
 * @param {{id, name, classId}[]} members Hunter ในปาร์ตี้ — คนที่ไม่ได้กดอะไรเลยก็ยังได้ฉายา
 * @returns {{ key, name, classId, title, value, unit }[]} เรียงตามลำดับ members แล้วต่อด้วยคนที่อยู่ในบันทึกแต่ออกจากห้องไปแล้ว
 */
export const buildHuntHighlights = (log, members) => {
  const people = new Map()
  const ensure = (key, name, classId) => {
    if (!people.has(key)) people.set(key, { key, name, classId, stats: emptyStats() })
    const p = people.get(key)
    if (!p.classId && classId) p.classId = classId
    return p
  }
  for (const m of members) ensure(String(m.id ?? m.name), m.name, m.classId)
  const byName = (name) => [...people.values()].find((p) => p.name === name)

  const live = log.filter((e) => !e.undone)
  let pool = []
  const ownerOf = new Map() // รายการ → คนที่ได้เครดิต ใช้หาผู้ปิดฉาก

  const settle = (owner, entries) => {
    const s = owner.stats
    let turnDmg = 0
    for (const e of entries) {
      if (e.kind === 'hp') turnDmg -= e.delta
      else if (e.kind === 'part') s.partDmg += e.delta
      else if (e.kind === 'status' || e.kind === 'element') {
        const trig = e.kind === 'status' ? e.applied : e.triggered
        if (!trig) s.marks++
        else {
          const k = e.kind === 'status' ? `status${e.sid}` : `element${e.eid}`
          s[k] = (s[k] ?? 0) + 1
        }
      }
    }
    if (turnDmg > 0) {
      s.dmg += turnDmg
      s.bestTurn = Math.max(s.bestTurn, turnDmg)
    }
    for (const e of entries) ownerOf.set(e, owner)
  }

  for (const e of live) {
    if (TURN_KINDS.has(e.kind)) {
      ensure(keyOf(e), e.whoName, e.whoClass)
      pool.push(e)
      continue
    }
    const p = ensure(keyOf(e), e.whoName, e.whoClass)
    if (e.kind === 'turnEnd') {
      p.stats.turns++
      settle(p, pool)
      pool = []
    } else if (e.kind === 'potion') p.stats.potions++
    else if (e.kind === 'faint') p.stats.faints++
    else if (e.kind === 'palico') p.stats.palico++
  }
  // กองที่ค้าง — แยกตามคนกด
  const leftover = new Map()
  for (const e of pool) {
    const k = keyOf(e)
    if (!leftover.has(k)) leftover.set(k, [])
    leftover.get(k).push(e)
  }
  for (const [k, entries] of leftover) settle(people.get(k), entries)

  // ผู้ปิดฉาก = คนที่ได้เครดิตการตีครั้งสุดท้าย (ดาเมจจากเต๋า / Time Card ไม่อยู่ในบันทึก)
  const lastHit = [...live].reverse().find((e) => e.kind === 'hp' && e.delta < 0)
  if (lastHit && ownerOf.has(lastHit)) ownerOf.get(lastHit).stats.finisher = -lastHit.delta

  // บันทึกเก็บแค่ชื่อคนกดย้อน
  for (const e of log) {
    if (!e.undone || !e.undoneBy) continue
    const p = byName(e.undoneBy)
    if (p) p.stats.undos++
  }
  for (const p of people.values()) {
    // ชิ้นส่วนกดลดได้ ติดลบไม่ถือเป็นผลงาน
    p.stats.partDmg = Math.max(0, p.stats.partDmg)
    p.stats.ailmentKinds = AILMENT_TITLES.filter((t) => statOf(p, t.stat) > 0).length
    p.stats.elementKinds = ELEMENT_TITLES.filter((t) => statOf(p, t.stat) > 0).length
  }

  const list = [...people.values()]
  const rank = (stat) => [...list].sort((a, b) => statOf(b, stat) - statOf(a, stat) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
  const titled = new Map()

  // รอบแรก: ฉายาไปที่คนนำของสถิตินั้น (เสมอกันหลายคน ให้คนแรกที่ยังไม่มีฉายา)
  // คนนำทุกคนมีฉายาแล้ว ฉายานั้นถูกข้าม — ไม่ส่งต่อให้อันดับสอง
  for (const t of HUNT_TITLES) {
    const ranked = rank(t.stat)
    const top = ranked[0] ? statOf(ranked[0], t.stat) : 0
    if (top < t.min) continue
    const leader = ranked.find((p) => statOf(p, t.stat) === top && !titled.has(p.key))
    if (leader) titled.set(leader.key, t)
  }
  // รอบสอง: คนที่ยังไม่มีฉายา เอาฉายาแรกตามลำดับที่ตัวเองเข้าเงื่อนไข (ซ้ำกับคนอื่นได้)
  for (const p of list) {
    if (titled.has(p.key)) continue
    const t = HUNT_TITLES.find((x) => !x.leaderOnly && statOf(p, x.stat) >= x.min)
    titled.set(p.key, t ?? FALLBACK_TITLE)
  }

  return list.map((p) => {
    const t = titled.get(p.key)
    return { key: p.key, name: p.name, classId: p.classId, title: t, value: statOf(p, t.stat), unit: t.unit ?? '' }
  })
}

// ฉายาของทั้งทีม — อันแรกที่เข้าเงื่อนไข
export const buildTeamTitle = ({ faints = 0, brokenCount = 0, partTotal = 0 } = {}) => {
  if (partTotal > 0 && brokenCount >= partTotal) return { icon: '🔨', name: 'ทุบครบทุกชิ้น', desc: 'ชิ้นส่วนแตกหมดทุกชิ้น' }
  if (faints === 0) return { icon: '✨', name: 'ไร้รอยขีดข่วน', desc: 'ไม่มีใครล้มเลย' }
  if (faints >= 2) return { icon: '😮‍💨', name: 'เฉียดตาย', desc: `ล้ม ${faints} ครั้งแต่ยังรอด` }
  return { icon: '🏆', name: 'ภารกิจสำเร็จ', desc: 'กลับแคมป์อย่างผู้ชนะ' }
}
