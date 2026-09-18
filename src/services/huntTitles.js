// ฉายาตอนสรุปการล่า (Hunter Highlights) — คนละ 1 ฉายา คิดจากบันทึกการล่าล้วน ๆ
// ทุกเครื่องในห้องคำนวณเองจากบันทึกชุดเดียวกัน จึงต้อง deterministic:
// คะแนนเท่ากันตัดสินด้วย key ของ Hunter ไม่ใช้ลำดับที่รายการเข้ามา

// แต่ละคนได้ฉายาจากสถิติที่ "เด่นที่สุด" ของตัวเอง ไม่ใช่ตามลำดับตายตัว
// (เคยเจอ: คนที่ทำให้ติดสถานะทั้งเกม แต่บังเอิญตีปิดด้วยดาเมจ 1 กลับได้ "ผู้ปิดฉาก")
//
// score(value, ctx): ความเด่นของค่านั้น ≈ 1 คือ "น่าพูดถึง" — ใช้เทียบข้ามฉายาต่างชนิด
//   ค่าเริ่มต้น value / min · คะแนนเท่ากัน ฉายาที่อยู่บนในตารางชนะ
// leaderOnly: ความหมายคือ "มากที่สุด" ให้เฉพาะคนที่นำจริง ไม่ส่งต่อให้อันดับสอง
// secondOnly: ฉายาปลอบใจของคนที่ไม่ใช่อันดับ 1 — แจกเฉพาะรอบสอง
// min: ค่าต่ำสุดที่ถือว่าเข้าเงื่อนไข · when: เงื่อนไขเพิ่มของคนนั้น
// img: รูปสถานะ/ธาตุ แสดงแทน icon บนการ์ด · labelOf: ป้ายที่ขึ้นกับสถิติของคนนั้น

// สถานะแยกตามชนิด — id ตาม status_effect.json
const AILMENT_TITLES = [
  { sid: 1, icon: '🌀', name: 'ช่างเคาะกะโหลก', label: 'ทำให้มึน (Stun)', img: 'assets/img/status_effect/stun.webp' },
  { sid: 2, icon: '☠', name: 'นักปรุงพิษ', label: 'ทำให้ติดพิษ (Poison)', img: 'assets/img/status_effect/poison.webp' },
  { sid: 3, icon: '💤', name: 'ผู้กล่อมนิทรา', label: 'ทำให้หลับ (Sleep)', img: 'assets/img/status_effect/sleep.webp' },
  { sid: 4, icon: '🔗', name: 'จอมสะกดร่าง', label: 'ทำให้อัมพาต (Paralysis)', img: 'assets/img/status_effect/paralysis.webp' },
  { sid: 5, icon: '💣', name: 'มือระเบิดพลีชีพ', label: 'ทำให้ระเบิด (Blast)', img: 'assets/img/status_effect/blastblight.webp' },
].map((t) => ({ ...t, id: `ailment${t.sid}`, stat: `status${t.sid}`, min: 1, unit: 'x', score: (v) => v }))

// ธาตุแยกตามชนิด — id ตาม elemental.json
const ELEMENT_TITLES = [
  { eid: 1, icon: '🔥', name: 'เจ้าแห่งเปลวเพลิง', label: 'ธาตุไฟทำงาน', img: 'assets/img/elemental/fire.webp' },
  { eid: 2, icon: '💧', name: 'นักรบสายน้ำ', label: 'ธาตุน้ำทำงาน', img: 'assets/img/elemental/water.webp' },
  { eid: 3, icon: '⚡', name: 'สายฟ้าฟาด', label: 'ธาตุสายฟ้าทำงาน', img: 'assets/img/elemental/thunder.webp' },
  { eid: 4, icon: '❄', name: 'หัวใจน้ำแข็ง', label: 'ธาตุน้ำแข็งทำงาน', img: 'assets/img/elemental/ice.webp' },
  { eid: 5, icon: '🐉', name: 'ผู้สังหารมังกร', label: 'ธาตุมังกรทำงาน', img: 'assets/img/elemental/dragon.webp' },
].map((t) => ({ ...t, id: `element${t.eid}`, stat: `element${t.eid}`, min: 1, unit: 'x', score: (v) => v }))

export const HUNT_TITLES = [
  // ตีปิดด้วยดาเมจ 1 ไม่ใช่เรื่องใหญ่ — 5 ดาเมจขึ้นไปถึงนับว่าเด่น
  { id: 'finisher', icon: '🗡', name: 'ผู้ปิดฉาก', label: 'ดาเมจเทิร์นปิดฉาก', stat: 'finisher', min: 1, leaderOnly: true, score: (v) => v / 5 },
  // วัดจากส่วนแบ่งดาเมจของทีม — ทำ 1/3 ของทีม = 1, ครึ่งหนึ่ง = 1.5
  { id: 'topDamage', icon: '👑', name: 'นักล่าตัวจริง', label: 'ดาเมจรวม', stat: 'dmg', min: 1, leaderOnly: true, score: (v, ctx) => (ctx.totalDmg ? (v / ctx.totalDmg) * 3 : 0) },
  // ดาเมจเยอะแต่ไม่ใช่อันดับ 1 — ไม่งั้นคนตีหนักอันดับสองได้แค่ "ผู้สนับสนุน"
  { id: 'heavyHitter', icon: '⚔', name: 'มือหนัก', label: 'ดาเมจรวม', stat: 'dmg', min: 5, secondOnly: true, score: (v, ctx) => (ctx.totalDmg ? (v / ctx.totalDmg) * 2 : 0) },
  { id: 'bigTurn', icon: '💥', name: 'หนึ่งเทิร์นสะท้านโลก', label: 'ดาเมจในเทิร์นเดียว', stat: 'bestTurn', min: 8 },
  { id: 'partBreaker', icon: '🔨', name: 'ช่างทุบเกราะ', label: 'ดาเมจชิ้นส่วน', stat: 'partDmg', min: 1, score: (v) => v / 4 },
  // ติดสถานะได้ตั้งแต่ 2 ชนิดขึ้นไป (แบบ Ailment Master ในเกม) — คะแนนเหนือฉายาสถานะชนิดเดียวเล็กน้อย
  {
    id: 'ailmentMaster', icon: '⚗', name: 'ปรมาจารย์สถานะ', stat: 'ailments', min: 2, unit: 'x',
    when: (p) => p.stats.ailmentKinds >= 2, score: (v) => v * 1.2,
    labelOf: (p) => `ทำให้ติดสถานะ ${p.stats.ailmentKinds} ชนิด`,
  },
  ...AILMENT_TITLES,
  {
    id: 'elementMaster', icon: '🌈', name: 'ผู้กุมธาตุทั้งปวง', stat: 'elements', min: 2, unit: 'x',
    when: (p) => p.stats.elementKinds >= 2, score: (v) => v * 1.2,
    labelOf: (p) => `ธาตุทำงาน ${p.stats.elementKinds} ชนิด`,
  },
  ...ELEMENT_TITLES,
  // ลง Mark ไว้เยอะแต่คนอื่นเป็นคนทำให้ติด — คนปูทางให้ทีม
  { id: 'marks', icon: '🧱', name: 'ผู้ปูทาง', label: 'ลง Mark ให้ทีม', stat: 'marks', min: 3, unit: 'x', score: (v) => v / 4 },
  // Palico ใช้ได้แค่ 1–2 ครั้งต่อเควส ใครมีก็ใช้ — ไม่ให้แย่งฉายาที่เป็นผลงานจริง
  { id: 'palico', icon: '🐾', name: 'ทาสแมว', label: 'ใช้ Palico', stat: 'palico', min: 1, unit: 'x', score: (v) => v * 0.6 },
  { id: 'faint', icon: '💫', name: 'ผู้กลับจากค่าย', label: 'ล้มกลับแคมป์', stat: 'faints', min: 1, unit: 'x', score: (v) => v * 0.5 },
  { id: 'potion', icon: '🧪', name: 'นักดื่มยา', label: 'ใช้ยา', stat: 'potions', min: 2, unit: 'x', score: (v) => v / 3 },
  { id: 'undo', icon: '⟲', name: 'ผู้แก้ไขประวัติศาสตร์', label: 'กดย้อน', stat: 'undos', min: 2, unit: 'x', score: (v) => v / 4 },
]
// คนที่ไม่เข้าเงื่อนไขไหนเลย — ทุกคนต้องมีฉายา
export const FALLBACK_TITLE = { id: 'support', icon: '🛡', name: 'ผู้สนับสนุน', label: 'เทิร์นที่เล่น', stat: 'turns', unit: 'x' }

const keyOf = (e) => String(e.whoId ?? e.whoName ?? '?')
// status1..5 / element1..5 เพิ่มเข้ามาเมื่อเจอ — อ่านผ่าน statOf ที่คืน 0 ถ้าไม่มี
const emptyStats = () => ({ dmg: 0, bestTurn: 0, partDmg: 0, ailments: 0, elements: 0, ailmentKinds: 0, elementKinds: 0, marks: 0, palico: 0, faints: 0, potions: 0, undos: 0, turns: 0, finisher: 0 })
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
          if (e.kind === 'status') s.ailments++
          else s.elements++
        }
      }
    }
    if (turnDmg > 0) {
      s.dmg += turnDmg
      s.bestTurn = Math.max(s.bestTurn, turnDmg)
    }
    for (const e of entries) ownerOf.set(e, { owner, turnDmg })
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

  // ผู้ปิดฉาก = เจ้าของเทิร์นที่มีการตีครั้งสุดท้าย (ดาเมจจากเต๋า / Time Card ไม่อยู่ในบันทึก)
  // ค่าที่โชว์คือดาเมจทั้งเทิร์นนั้น ไม่ใช่แค่ปุ่มสุดท้าย — กด −5 −3 −1 ในเทิร์นปิดฉาก = 9 ไม่ใช่ 1
  const lastHit = [...live].reverse().find((e) => e.kind === 'hp' && e.delta < 0)
  const finish = lastHit && ownerOf.get(lastHit)
  if (finish) finish.owner.stats.finisher = Math.max(finish.turnDmg, -lastHit.delta)

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
  const ctx = { totalDmg: list.reduce((n, p) => n + p.stats.dmg, 0) }
  const qualifies = (p, t) => statOf(p, t.stat) >= t.min && (!t.when || t.when(p))
  const scoreOf = (p, t) => (t.score ? t.score(statOf(p, t.stat), ctx) : statOf(p, t.stat) / t.min)
  const byKey = (a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
  // คะแนนสูงก่อน → ฉายาที่อยู่บนในตารางก่อน → key — ทุกเครื่องเรียงได้ลำดับเดียวกัน
  const byScore = (a, b) => b.score - a.score || a.order - b.order || byKey(a.p, b.p)
  const titled = new Map()

  // รอบแรก: คู่ (คน, ฉายา) ที่คนนั้นเป็นอันดับ 1 ของสถิตินั้น (เสมอกันได้หลายคน)
  // จับคู่ทั้งทีมพร้อมกันให้คะแนนรวมสูงสุด — คนละ 1 ฉายา ฉายาละ 1 คน
  // (แจกทีละคู่จากคะแนนสูงสุดเคยพลาด: ดาเมจเสมอกัน คนที่ตีปิดเอา "นักล่าตัวจริง" ไป
  //  เพื่อนที่ดาเมจเท่ากันเหลือแค่ "มือหนัก" ทั้งที่ให้คนตีปิดเป็น "ผู้ปิดฉาก" ได้ทั้งคู่)
  const leads = []
  HUNT_TITLES.forEach((t, order) => {
    if (t.secondOnly) return
    const cands = list.filter((p) => qualifies(p, t))
    if (!cands.length) return
    const top = Math.max(...cands.map((p) => statOf(p, t.stat)))
    for (const p of cands) {
      if (statOf(p, t.stat) === top) leads.push({ p, t, order, score: scoreOf(p, t) })
    }
  })
  // ตี้ไม่เกิน 4 คน ค้นทุกแบบได้ — ตัดเหลือ 6 ตัวเลือกต่อคนกันกรณีมีคนออกจากห้องแล้วยังอยู่ในบันทึก
  const order = [...list].sort(byKey)
  const options = order.map((p) => leads.filter((c) => c.p === p).sort(byScore).slice(0, 6))
  let best = { sum: -1, pick: [] }
  const used = new Set()
  const pick = []
  const search = (i, sum) => {
    if (i === order.length) {
      // ต้องมากกว่าจริง ๆ — ผลเสมอเก็บแบบที่เจอก่อน (ตัวเลือกคะแนนสูงของคน key น้อยก่อน) ทุกเครื่องได้เหมือนกัน
      if (sum > best.sum + 1e-9) best = { sum, pick: [...pick] }
      return
    }
    for (const c of options[i]) {
      if (used.has(c.t.id)) continue
      used.add(c.t.id)
      pick.push(c)
      search(i + 1, sum + c.score)
      pick.pop()
      used.delete(c.t.id)
    }
    search(i + 1, sum) // คนนี้ไม่ได้ฉายารอบแรก ไปรับรอบสอง
  }
  search(0, 0)
  for (const c of best.pick) titled.set(c.p.key, c.t)
  // รอบสอง: คนที่ยังไม่มีฉายา เอาฉายาที่เด่นที่สุดที่ตัวเองเข้าเงื่อนไข (ซ้ำกับคนอื่นได้ ยกเว้น leaderOnly)
  for (const p of list) {
    if (titled.has(p.key)) continue
    const best = HUNT_TITLES
      .map((t, order) => ({ p, t, order, score: scoreOf(p, t) }))
      .filter((c) => !c.t.leaderOnly && qualifies(p, c.t))
      .sort(byScore)[0]
    titled.set(p.key, best?.t ?? FALLBACK_TITLE)
  }

  return list.map((p) => {
    const t = titled.get(p.key)
    const title = t.labelOf ? { ...t, label: t.labelOf(p) } : t
    return { key: p.key, name: p.name, classId: p.classId, title, value: statOf(p, t.stat), unit: t.unit ?? '' }
  })
}

// ฉายาของทั้งทีม — อันแรกที่เข้าเงื่อนไข
export const buildTeamTitle = ({ faints = 0, brokenCount = 0, partTotal = 0 } = {}) => {
  if (partTotal > 0 && brokenCount >= partTotal) return { icon: '🔨', name: 'ทุบครบทุกชิ้น', desc: 'ชิ้นส่วนแตกหมดทุกชิ้น' }
  if (faints === 0) return { icon: '✨', name: 'ไร้รอยขีดข่วน', desc: 'ไม่มีใครล้มเลย' }
  if (faints >= 2) return { icon: '😮‍💨', name: 'เฉียดตาย', desc: `ล้ม ${faints} ครั้งแต่ยังรอด` }
  return { icon: '🏆', name: 'ภารกิจสำเร็จ', desc: 'กลับแคมป์อย่างผู้ชนะ' }
}
