// ฉายาตอนสรุปการล่า (Hunter Highlights) — คนละ 1 ฉายา คิดจากบันทึกการล่าล้วน ๆ
// ทุกเครื่องในห้องคำนวณเองจากบันทึกชุดเดียวกัน จึงต้อง deterministic:
// คะแนนเท่ากันตัดสินด้วย key ของ Hunter ไม่ใช้ลำดับที่รายการเข้ามา

// แต่ละคนได้ฉายาจากสถิติที่ "เด่นที่สุด" ของตัวเอง ไม่ใช่ตามลำดับตายตัว
// (เคยเจอ: คนที่ทำให้ติดสถานะทั้งเกม แต่บังเอิญตีปิดด้วยดาเมจ 1 กลับได้ "ดาบปิดฉาก")
//
// score(value, ctx): ความเด่นของค่านั้น ≈ 1 คือ "น่าพูดถึง" — ใช้เทียบข้ามฉายาต่างชนิด
//   ค่าเริ่มต้น value / min · คะแนนเท่ากัน ฉายาที่อยู่บนในตารางชนะ
// leaderOnly: ความหมายคือ "มากที่สุด" ให้เฉพาะคนที่นำจริง ไม่ส่งต่อให้อันดับสอง
// secondOnly: ฉายารองของคนที่ไม่ใช่อันดับ 1 — อันดับ 1 ได้ไม่ได้
// ทุกฉายาในตี้ไม่ซ้ำกัน คนที่ไม่เหลือฉายาให้ได้ FALLBACK_TITLES คนละชื่อ
// min: ค่าต่ำสุดที่ถือว่าเข้าเงื่อนไข · when: เงื่อนไขเพิ่มของคนนั้น
// img: รูปสถานะ/ธาตุ แสดงแทน icon บนการ์ด · labelOf: ป้ายที่ขึ้นกับสถิติของคนนั้น

// สถานะแยกตามชนิด — id ตาม status_effect.json
const AILMENT_TITLES = [
  { sid: 1, icon: '🌀', name: 'ค้อนน็อกสติ', label: 'ทำให้มึน (Stun)', img: 'assets/img/status_effect/stun.webp' },
  { sid: 2, icon: '☠️', name: 'นักปรุงพิษ', label: 'ทำให้ติดพิษ (Poison)', img: 'assets/img/status_effect/poison.webp' },
  { sid: 3, icon: '💤', name: 'ผู้กล่อมนิทรา', label: 'ทำให้หลับ (Sleep)', img: 'assets/img/status_effect/sleep.webp' },
  { sid: 4, icon: '🔗', name: 'มือสะกดร่าง', label: 'ทำให้อัมพาต (Paralysis)', img: 'assets/img/status_effect/paralysis.webp' },
  { sid: 5, icon: '💣', name: 'มือจุดชนวน', label: 'ทำให้ระเบิด (Blast)', img: 'assets/img/status_effect/blastblight.webp' },
].map((t) => ({ ...t, id: `ailment${t.sid}`, stat: `status${t.sid}`, min: 1, unit: 'x', score: (v) => v }))

// ธาตุแยกตามชนิด — id ตาม elemental.json
const ELEMENT_TITLES = [
  { eid: 1, icon: '🔥', name: 'จ้าวเปลวเพลิง', label: 'ธาตุไฟทำงาน', img: 'assets/img/elemental/fire.webp' },
  { eid: 2, icon: '💧', name: 'นักรบสายน้ำ', label: 'ธาตุน้ำทำงาน', img: 'assets/img/elemental/water.webp' },
  { eid: 3, icon: '⚡', name: 'สายฟ้าฟาด', label: 'ธาตุสายฟ้าทำงาน', img: 'assets/img/elemental/thunder.webp' },
  { eid: 4, icon: '❄️', name: 'หัวใจน้ำแข็ง', label: 'ธาตุน้ำแข็งทำงาน', img: 'assets/img/elemental/ice.webp' },
  { eid: 5, icon: '🐉', name: 'ผู้สังหารมังกร', label: 'ธาตุมังกรทำงาน', img: 'assets/img/elemental/dragon.webp' },
].map((t) => ({ ...t, id: `element${t.eid}`, stat: `element${t.eid}`, min: 1, unit: 'x', score: (v) => v }))

export const HUNT_TITLES = [
  // ตีปิดด้วยดาเมจ 1 ไม่ใช่เรื่องใหญ่ — 5 ดาเมจขึ้นไปถึงนับว่าเด่น
  { id: 'finisher', icon: '🗡️', name: 'ดาบปิดฉาก', label: 'ดาเมจเทิร์นปิดฉาก', stat: 'finisher', min: 1, leaderOnly: true, score: (v) => v / 5 },
  // วัดจากส่วนแบ่งดาเมจของทีม — ทำ 1/3 ของทีม = 1, ครึ่งหนึ่ง = 1.5
  { id: 'topDamage', icon: '👑', name: 'สุดยอดนักล่า', label: 'ดาเมจรวม', stat: 'dmg', min: 1, leaderOnly: true, score: (v, ctx) => (ctx.totalDmg ? (v / ctx.totalDmg) * 3 : 0) },
  // ดาเมจเยอะแต่ไม่ใช่อันดับ 1 — ไม่งั้นคนตีหนักอันดับสองได้แค่ "ผู้สนับสนุน"
  { id: 'heavyHitter', icon: '⚔️', name: 'หมัดหนัก', label: 'ดาเมจรวม', stat: 'dmg', min: 5, secondOnly: true, score: (v, ctx) => (ctx.totalDmg ? (v / ctx.totalDmg) * 2 : 0) },
  { id: 'bigTurn', icon: '💥', name: 'เทิร์นสะท้านสนาม', label: 'ดาเมจในเทิร์นเดียว', stat: 'bestTurn', min: 8 },
  { id: 'partBreaker', icon: '🔨', name: 'มือทลายเกราะ', label: 'ดาเมจชิ้นส่วน', stat: 'partDmg', min: 1, score: (v) => v / 4 },
  // ติดสถานะได้ตั้งแต่ 2 ชนิดขึ้นไป (แบบ Ailment Master ในเกม) — คะแนนเหนือฉายาสถานะชนิดเดียวเล็กน้อย
  {
    id: 'ailmentMaster', icon: '⚗️', name: 'ปรมาจารย์สถานะ', stat: 'ailments', min: 2, unit: 'x',
    when: (p) => p.stats.ailmentKinds >= 2, score: (v) => v * 1.2,
    labelOf: (p) => `ทำให้ติดสถานะ ${p.stats.ailmentKinds} ชนิด`,
  },
  ...AILMENT_TITLES,
  {
    id: 'elementMaster', icon: '🌈', name: 'ผู้เชี่ยวชาญธาตุ', stat: 'elements', min: 2, unit: 'x',
    when: (p) => p.stats.elementKinds >= 2, score: (v) => v * 1.2,
    labelOf: (p) => `ธาตุทำงาน ${p.stats.elementKinds} ชนิด`,
  },
  ...ELEMENT_TITLES,
  // ── ตอนมอนโจมตี (บันทึก defend จากขั้นตอนรับ / หลบ / นอกระยะ) ──
  // รับดาเมจแทนทีมมากที่สุด — วัดจากส่วนแบ่งของทีมแบบเดียวกับ "สุดยอดนักล่า" แต่เบากว่านิดหน่อย
  { id: 'tank', icon: '🛡️', name: 'โล่ประจำตี้', label: 'ดาเมจที่รับแทนทีม', stat: 'dmgTaken', min: 6, leaderOnly: true, score: (v, ctx) => (ctx.totalTaken ? (v / ctx.totalTaken) * 2.7 : 0) },
  { id: 'bigHitTaken', icon: '🪨', name: 'รับเต็มแรง', label: 'ดาเมจที่รับในครั้งเดียว', stat: 'bigHitTaken', min: 6, score: (v) => v / 7 },
  // โดนตีกี่ครั้งก็ไม่ใช่ว่าเก่ง — ต้องยังตีคืนได้ด้วย ถึงเป็นคนยืนแถวหน้า
  {
    id: 'frontline', icon: '🦾', name: 'นักรบหน้าด่าน', stat: 'hitsTaken', min: 2, unit: 'x',
    when: (p) => p.stats.dmg >= 5, score: (v) => v / 3 + 0.1,
    labelOf: (p) => `รับการโจมตี ${p.stats.hitsTaken} ครั้ง · ตีคืน ${p.stats.dmg}`,
  },
  { id: 'dodger', icon: '💨', name: 'เงาไร้ร่าง', label: 'หลบการโจมตีได้', stat: 'dodges', min: 2, unit: 'x', score: (v) => v / 2.5 },
  // เจอการโจมตีอย่างน้อย 3 ครั้ง แต่ไม่โดนเลยสักครั้ง
  {
    id: 'untouchable', icon: '🍃', name: 'ไร้บาดแผล', label: 'เจอการโจมตีแต่ไม่โดนเลย', stat: 'defends', min: 3, unit: 'x',
    when: (p) => p.stats.hitsTaken === 0, score: (v) => v / 2.5,
  },
  // มอนเล็งบ่อยที่สุด — ความหมายคือ "ที่สุด" จึงให้เฉพาะคนนำ
  { id: 'aggro', icon: '🎯', name: 'ขวัญใจมอนสเตอร์', label: 'โดนมอนเล็ง', stat: 'targeted', min: 2, unit: 'x', leaderOnly: true, score: (v) => v / 2.5 },
  { id: 'guardian', icon: '🔰', name: 'มือตั้งการ์ด', label: 'เกราะจากการ์ดที่ใช้กัน', stat: 'shieldUsed', min: 3, score: (v) => v / 4 },
  // นอกระยะเป็นเรื่องตำแหน่งบนกระดาน ไม่ได้เก่งเท่าหลบ — คะแนนเบากว่า
  { id: 'distance', icon: '🏃', name: 'นักล่าระยะไกล', label: 'อยู่นอกระยะโจมตี', stat: 'outranges', min: 3, unit: 'x', score: (v) => (v / 3) * 0.7 },
  // ฉายารอง — คนที่ทำสถิตินั้นได้แต่ไม่ใช่อันดับ 1 (อันดับ 1 ได้ฉายาหลักไปแล้ว)
  // ไม่งั้นตีชิ้นส่วนกัน 3 คน ได้ "มือทลายเกราะ" ซ้ำกันทั้ง 3
  { id: 'partHelper', icon: '🪓', name: 'ผู้ช่วยทลายเกราะ', label: 'ดาเมจชิ้นส่วน', stat: 'partDmg', min: 1, secondOnly: true, score: (v) => (v / 4) * 0.9 },
  { id: 'ailmentHelper', icon: '🌿', name: 'ผู้ช่วยลงสถานะ', label: 'ทำให้ติดสถานะ', stat: 'ailments', min: 1, unit: 'x', secondOnly: true, score: (v) => v * 0.8 },
  { id: 'elementHelper', icon: '✨', name: 'ผู้ปลุกพลังธาตุ', label: 'ธาตุทำงาน', stat: 'elements', min: 1, unit: 'x', secondOnly: true, score: (v) => v * 0.8 },
  // ลง Mark ไว้เยอะแต่คนอื่นเป็นคนทำให้ติด — คนปูทางให้ทีม
  { id: 'marks', icon: '🧱', name: 'ผู้ปูทาง', label: 'ลง Mark ให้ทีม', stat: 'marks', min: 3, unit: 'x', score: (v) => v / 4 },
  // Palico ใช้ได้แค่ 1–2 ครั้งต่อเควส ใครมีก็ใช้ — ไม่ให้แย่งฉายาที่เป็นผลงานจริง
  { id: 'palico', icon: '🐾', name: 'คู่หูเหมียว', label: 'ใช้ Palico', stat: 'palico', min: 1, unit: 'x', score: (v) => v * 0.6 },
  { id: 'faint', icon: '💫', name: 'ผู้คืนสังเวียน', label: 'ล้มกลับแคมป์', stat: 'faints', min: 1, unit: 'x', score: (v) => v * 0.5 },
  { id: 'potion', icon: '🧪', name: 'นักดื่มยา', label: 'ใช้ยา', stat: 'potions', min: 2, unit: 'x', score: (v) => v / 3 },
]
// คนที่ไม่เหลือฉายาให้ (ไม่เข้าเงื่อนไข หรือฉายาที่เข้าเงื่อนไขมีคนได้ไปแล้ว) — แจกคนละชื่อ ไม่ซ้ำกัน
export const FALLBACK_TITLES = [
  { id: 'support', icon: '🛡️', name: 'ผู้สนับสนุน' },
  { id: 'companion', icon: '🧭', name: 'สหายร่วมทาง' },
  { id: 'porter', icon: '🎒', name: 'ผู้แบกเสบียง' },
  { id: 'lookout', icon: '👀', name: 'ยามเฝ้าระวัง' },
  { id: 'cheer', icon: '📣', name: 'กองเชียร์ประจำตี้' },
  { id: 'rookie', icon: '🌱', name: 'นักล่าหน้าใหม่' },
].map((t) => ({ ...t, label: 'เทิร์นที่เล่น', stat: 'turns', unit: 'x' }))
export const FALLBACK_TITLE = FALLBACK_TITLES[0]

const keyOf = (e) => String(e.whoId ?? e.whoName ?? '?')
// status1..5 / element1..5 เพิ่มเข้ามาเมื่อเจอ — อ่านผ่าน statOf ที่คืน 0 ถ้าไม่มี
const emptyStats = () => ({
  dmg: 0, bestTurn: 0, partDmg: 0, ailments: 0, elements: 0, ailmentKinds: 0, elementKinds: 0, marks: 0,
  palico: 0, faints: 0, potions: 0, turns: 0, finisher: 0,
  defends: 0, hitsTaken: 0, dmgTaken: 0, bigHitTaken: 0, dodges: 0, outranges: 0, targeted: 0, shieldUsed: 0,
})
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
    else if (e.kind === 'defend') {
      // จดโดย Host ตอนการโจมตีครั้งนั้นจบ — whoId คือคนที่โดนโจมตี ไม่ใช่คนกด
      const s = p.stats
      s.defends++
      if (e.targeted) s.targeted++
      if (e.choice === 'hit') {
        const dmg = e.dmg ?? 0
        s.hitsTaken++
        s.dmgTaken += dmg
        s.bigHitTaken = Math.max(s.bigHitTaken, dmg)
        s.shieldUsed += e.shield ?? 0
      } else if (e.choice === 'dodge') s.dodges++
      else s.outranges++
    }
  }
  // กองที่ค้าง — แยกตามคนกด
  const leftover = new Map()
  for (const e of pool) {
    const k = keyOf(e)
    if (!leftover.has(k)) leftover.set(k, [])
    leftover.get(k).push(e)
  }
  for (const [k, entries] of leftover) settle(people.get(k), entries)

  // ดาบปิดฉาก = เจ้าของเทิร์นที่มีการตีครั้งสุดท้าย (ดาเมจจากเต๋า / Time Card ไม่อยู่ในบันทึก)
  // ค่าที่โชว์คือดาเมจทั้งเทิร์นนั้น ไม่ใช่แค่ปุ่มสุดท้าย — กด −5 −3 −1 ในเทิร์นปิดฉาก = 9 ไม่ใช่ 1
  const lastHit = [...live].reverse().find((e) => e.kind === 'hp' && e.delta < 0)
  const finish = lastHit && ownerOf.get(lastHit)
  if (finish) finish.owner.stats.finisher = Math.max(finish.turnDmg, -lastHit.delta)

  for (const p of people.values()) {
    // ชิ้นส่วนกดลดได้ ติดลบไม่ถือเป็นผลงาน
    p.stats.partDmg = Math.max(0, p.stats.partDmg)
    p.stats.ailmentKinds = AILMENT_TITLES.filter((t) => statOf(p, t.stat) > 0).length
    p.stats.elementKinds = ELEMENT_TITLES.filter((t) => statOf(p, t.stat) > 0).length
  }

  const list = [...people.values()]
  const ctx = {
    totalDmg: list.reduce((n, p) => n + p.stats.dmg, 0),
    totalTaken: list.reduce((n, p) => n + p.stats.dmgTaken, 0),
  }
  const qualifies = (p, t) => statOf(p, t.stat) >= t.min && (!t.when || t.when(p))
  const scoreOf = (p, t) => (t.score ? t.score(statOf(p, t.stat), ctx) : statOf(p, t.stat) / t.min)
  const byKey = (a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
  // คะแนนสูงก่อน → ฉายาที่อยู่บนในตารางก่อน → key — ทุกเครื่องเรียงได้ลำดับเดียวกัน
  const byScore = (a, b) => b.score - a.score || a.order - b.order || byKey(a.p, b.p)
  const titled = new Map()

  // ใครมีสิทธิ์ได้ฉายาไหน
  //  leaderOnly = ต้องเป็นอันดับ 1 ของสถิตินั้น (เสมอกันได้) · secondOnly = ต้องไม่ใช่อันดับ 1
  const topOf = (t) => Math.max(...list.map((p) => statOf(p, t.stat)))
  const eligible = (p, t) => {
    if (!qualifies(p, t)) return false
    if (t.leaderOnly) return statOf(p, t.stat) === topOf(t)
    if (t.secondOnly) return statOf(p, t.stat) < topOf(t)
    return true
  }

  // จับคู่ทั้งทีมพร้อมกันให้คะแนนรวมสูงสุด — คนละ 1 ฉายา ฉายาละ 1 คน (ไม่มีฉายาซ้ำในตี้)
  // (แจกทีละคู่เคยพลาด: ดาเมจเสมอกัน คนตีปิดเอา "สุดยอดนักล่า" ไป เพื่อนเหลือแค่ฉายารอง
  //  และเคยปล่อยให้ซ้ำ: ตีชิ้นส่วนกัน 3 คน ได้ "มือทลายเกราะ" ทั้ง 3)
  // ตี้ไม่เกิน 4 คน ค้นทุกแบบได้ — ตัดเหลือ 8 ตัวเลือกต่อคนกันกรณีมีคนออกจากห้องแล้วยังอยู่ในบันทึก
  const order = [...list].sort(byKey)
  const options = order.map((p) =>
    HUNT_TITLES.map((t, idx) => ({ p, t, order: idx, score: scoreOf(p, t) }))
      .filter((c) => eligible(p, c.t))
      .sort(byScore)
      .slice(0, 8),
  )
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
    search(i + 1, sum) // คนนี้ไปรับฉายาสำรอง
  }
  search(0, 0)
  for (const c of best.pick) titled.set(c.p.key, c.t)
  // ที่เหลือได้ฉายาสำรองคนละชื่อ เรียงตาม key
  let fb = 0
  for (const p of order) {
    if (titled.has(p.key)) continue
    titled.set(p.key, FALLBACK_TITLES[fb++ % FALLBACK_TITLES.length])
  }

  return list.map((p) => {
    const t = titled.get(p.key)
    const title = t.labelOf ? { ...t, label: t.labelOf(p) } : t
    return { key: p.key, name: p.name, classId: p.classId, title, value: statOf(p, t.stat), unit: t.unit ?? '' }
  })
}

// ฉายาของทั้งทีม — อันแรกที่เข้าเงื่อนไข
// log (ถ้าส่งมา) ใช้นับการรับ / หลบการโจมตีของทั้งทีม
export const buildTeamTitle = ({ faints = 0, brokenCount = 0, partTotal = 0, log = [] } = {}) => {
  const defends = log.filter((e) => !e.undone && e.kind === 'defend')
  const hits = defends.filter((e) => e.choice === 'hit').length
  const dodges = defends.filter((e) => e.choice === 'dodge').length
  const taken = defends.reduce((n, e) => n + (e.choice === 'hit' ? (e.dmg ?? 0) : 0), 0)

  if (partTotal > 0 && brokenCount >= partTotal) return { icon: '🔨', name: 'ตี้ทลายเกราะ', desc: 'ชิ้นส่วนแตกหมดทุกชิ้น' }
  // เจอการโจมตีหลายครั้งแต่ไม่มีใครโดนเลย — หายากกว่า "ตี้ไร้ผู้ล้ม"
  if (defends.length >= 4 && hits === 0) return { icon: '🍃', name: 'ตี้ไร้บาดแผล', desc: `เจอการโจมตี ${defends.length} ครั้ง ไม่มีใครโดนเลย` }
  if (faints === 0 && dodges >= 4 && dodges * 2 >= defends.length) return { icon: '💨', name: 'ตี้เงาสายลม', desc: `หลบการโจมตีได้ ${dodges} ครั้ง` }
  if (faints === 0 && taken >= 20) return { icon: '🧱', name: 'ปราการเหล็ก', desc: `รับดาเมจรวม ${taken} แต่ไม่มีใครล้ม` }
  if (faints === 0) return { icon: '✨', name: 'ตี้ไร้ผู้ล้ม', desc: 'กลับแคมป์ครบทุกคน' }
  if (faints >= 2) return { icon: '😮‍💨', name: 'รอดแบบเฉียดฉิว', desc: `ล้ม ${faints} ครั้งแต่ยังรอด` }
  return { icon: '🏆', name: 'ภารกิจสำเร็จ', desc: 'กลับแคมป์อย่างผู้ชนะ' }
}
