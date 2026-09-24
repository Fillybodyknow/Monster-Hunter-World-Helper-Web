#!/usr/bin/env node
// ทดสอบการแจกฉายาหลังล่า (src/services/huntTitles.js) — `npm test`
// บันทึกการล่าสร้างมือให้ตรงกับที่ Quest.vue จดจริง (hp / turnEnd / defend ฯลฯ)
import { buildHuntHighlights, buildTeamTitle, HUNT_TITLES } from '../src/services/huntTitles.js'

let failures = 0
let checks = 0
const expect = (cond, msg) => {
  checks++
  if (!cond && failures++ < 20) console.log('  ✗ ' + msg)
}

const who = (id) => ({ whoId: id, whoName: `H${id}`, whoClass: id })
const hit = (id, n) => ({ kind: 'hp', delta: -n, ...who(id) })
const end = (id) => ({ kind: 'turnEnd', ...who(id) })
const def = (id, choice, dmg = 0, extra = {}) => ({ kind: 'defend', choice, dmg: choice === 'hit' ? dmg : 0, ...who(id), ...extra })
const members = (...ids) => ids.map((id) => ({ id, name: `H${id}`, classId: id }))
const titleOf = (cards, id) => cards.find((c) => c.key === String(id))?.title.id

// ── 1. ไม่มีบันทึกการโจมตี = ฉายาเดิมทำงานเหมือนเดิม ──
{
  const log = [hit(1, 12), end(1), hit(2, 3), end(2)]
  const cards = buildHuntHighlights(log, members(1, 2))
  expect(titleOf(cards, 1) === 'topDamage' || titleOf(cards, 1) === 'finisher' || titleOf(cards, 1) === 'bigTurn', `คนตีหนักสุดต้องได้ฉายาดาเมจ (ได้ ${titleOf(cards, 1)})`)
  const defendIds = new Set(['tank', 'bigHitTaken', 'frontline', 'dodger', 'untouchable', 'aggro', 'guardian', 'distance'])
  expect(!cards.some((c) => defendIds.has(c.title.id)), 'ไม่มีบันทึก defend ต้องไม่มีฉายาจากการโจมตีโผล่มา')
}

// ── 2. โล่มนุษย์: รับดาเมจเยอะสุด ตีน้อย ──
{
  const log = [
    hit(1, 15), end(1), hit(2, 2), end(2),
    def(2, 'hit', 7, { targeted: true }), def(1, 'dodge'),
    def(2, 'hit', 5), def(1, 'outrange'),
  ]
  const cards = buildHuntHighlights(log, members(1, 2))
  expect(titleOf(cards, 2) === 'tank' || titleOf(cards, 2) === 'bigHitTaken', `คนรับดาเมจแทนทีม 12 ต้องได้ โล่มนุษย์ / รับเต็มหน้า (ได้ ${titleOf(cards, 2)})`)
  const tank = cards.find((c) => c.title.id === 'tank')
  if (tank) expect(tank.value === 12, `โล่มนุษย์ต้องโชว์ดาเมจที่รับรวม 12 (ได้ ${tank.value})`)
}

// ── 3. เงาไร้ร่าง / ผู้ไม่เคยถูกแตะต้อง ──
{
  const log = [
    hit(1, 4), end(1), hit(2, 4), end(2),
    def(1, 'dodge'), def(1, 'dodge'), def(1, 'dodge'), def(1, 'dodge'),
    def(2, 'hit', 3), def(2, 'hit', 3),
  ]
  const cards = buildHuntHighlights(log, members(1, 2))
  expect(['dodger', 'untouchable'].includes(titleOf(cards, 1)), `หลบได้ 4 ครั้งไม่โดนเลย ต้องได้ฉายาหลบ (ได้ ${titleOf(cards, 1)})`)
}
{
  // โดนสักครั้ง = ไม่ใช่ "ไม่เคยถูกแตะต้อง"
  const log = [def(1, 'dodge'), def(1, 'dodge'), def(1, 'outrange'), def(1, 'hit', 2)]
  const cards = buildHuntHighlights(log, members(1))
  expect(titleOf(cards, 1) !== 'untouchable', 'โดนตี 1 ครั้งต้องไม่ได้ ผู้ไม่เคยถูกแตะต้อง')
}

// ── 4. ขวัญใจมอนสเตอร์ ให้เฉพาะคนที่โดนเล็งมากที่สุด ──
{
  const log = [
    def(1, 'outrange', 0, { targeted: true }), def(1, 'outrange', 0, { targeted: true }), def(1, 'outrange', 0, { targeted: true }),
    def(2, 'outrange', 0, { targeted: true }), def(2, 'outrange', 0, { targeted: true }),
  ]
  const cards = buildHuntHighlights(log, members(1, 2))
  expect(titleOf(cards, 2) !== 'aggro', 'คนที่โดนเล็งน้อยกว่าต้องไม่ได้ ขวัญใจมอนสเตอร์')
}

// ── 5. นักรบแนวหน้า ต้องตีคืนด้วย ──
{
  const noDmg = buildHuntHighlights([def(1, 'hit', 2), def(1, 'hit', 2), def(1, 'hit', 2)], members(1))
  expect(titleOf(noDmg, 1) !== 'frontline', 'รับการโจมตีแต่ไม่ได้ตีเลย ต้องไม่ได้ นักรบแนวหน้า')
}

// ── 6. ตี้ 4 คน: ฉายาไม่ซ้ำ และลำดับ members ไม่เปลี่ยนผล (ทุกเครื่องต้องได้เหมือนกัน) ──
{
  const log = [
    hit(1, 10), end(1), hit(2, 6), end(2), hit(3, 2), end(3), hit(4, 1), end(4),
    def(1, 'hit', 4), def(2, 'dodge'), def(3, 'hit', 8, { targeted: true, shield: 2 }), def(4, 'outrange'),
    def(1, 'hit', 5), def(2, 'dodge'), def(3, 'hit', 6, { targeted: true, shield: 2 }), def(4, 'outrange'),
    def(1, 'dodge'), def(2, 'dodge'), def(3, 'hit', 3, { targeted: true }), def(4, 'outrange'),
  ]
  const a = buildHuntHighlights(log, members(1, 2, 3, 4))
  const b = buildHuntHighlights(log, members(4, 2, 3, 1))
  const ids = a.map((c) => c.title.id)
  expect(new Set(ids).size === ids.length, `ฉายาในตี้ต้องไม่ซ้ำกัน (${ids.join(', ')})`)
  for (const c of a) expect(titleOf(b, c.key) === c.title.id, `ลำดับสมาชิกเปลี่ยน ฉายาของ ${c.key} ต้องเหมือนเดิม`)
  expect(titleOf(a, 3) === 'tank' || titleOf(a, 3) === 'bigHitTaken' || titleOf(a, 3) === 'aggro', `คนที่โดนเล็งและรับหนักสุดต้องได้ฉายาสายรับ (ได้ ${titleOf(a, 3)})`)
}

// ── 7. บันทึกที่ถูกย้อนไม่นับ ──
{
  const log = [def(1, 'hit', 9, { undone: true }), def(1, 'hit', 9, { undone: true })]
  const cards = buildHuntHighlights(log, members(1))
  expect(!['tank', 'bigHitTaken'].includes(titleOf(cards, 1)), 'รายการที่ถูกย้อนต้องไม่นับเป็นดาเมจที่รับ')
}

// ── 8. ตารางฉายา: id ไม่ซ้ำ ──
{
  const ids = HUNT_TITLES.map((t) => t.id)
  expect(new Set(ids).size === ids.length, 'id ฉายาในตารางต้องไม่ซ้ำ')
}

// ── 9. ฉายาทีม ──
{
  const t = (o) => buildTeamTitle(o).name
  const dodgeLog = Array.from({ length: 5 }, () => def(1, 'dodge'))
  expect(t({ faints: 0, log: dodgeLog }) === 'ตี้ไร้บาดแผล', 'เจอการโจมตี 5 ครั้งไม่มีใครโดน = ตี้ไร้บาดแผล')
  const mixed = [def(1, 'dodge'), def(1, 'dodge'), def(2, 'dodge'), def(2, 'dodge'), def(1, 'hit', 3)]
  expect(t({ faints: 0, log: mixed }) === 'ตี้เงาสายลม', 'หลบได้ 4 จาก 5 ครั้ง = ตี้เงาสายลม')
  const heavy = [def(1, 'hit', 8), def(2, 'hit', 7), def(1, 'hit', 6)]
  expect(t({ faints: 0, log: heavy }) === 'ปราการเหล็ก', 'รับรวม 21 แต่ไม่มีใครล้ม = ปราการเหล็ก')
  expect(t({ faints: 0 }) === 'ตี้ไร้ผู้ล้ม', 'ไม่มีบันทึกการโจมตี + ไม่มีใครล้ม = ตี้ไร้ผู้ล้ม')
  expect(t({ faints: 2, log: heavy }) === 'รอดแบบเฉียดฉิว', 'ล้ม 2 ครั้ง = เฉียดตาย')
  expect(t({ faints: 0, brokenCount: 3, partTotal: 3, log: dodgeLog }) === 'ตี้ทลายเกราะ', 'ทุบครบยังชนะทุกอย่าง')
}

console.log(failures ? `\n✗ ไม่ผ่าน ${failures} จาก ${checks} ข้อ` : `✓ ผ่านทั้งหมด ${checks} ข้อ`)
process.exit(failures ? 1 : 0)
