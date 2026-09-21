// คำนวณค่าจริงบนการ์ดพฤติกรรมของมอน หลังบวกลบตามกฎของระดับความยากและชิ้นส่วนที่พัง
//
// ค่าที่พิมพ์บนการ์ดเป็นแค่ค่าตั้งต้น — special_rule ของแต่ละระดับ กับ part_break_rule ของชิ้นส่วนที่พังแล้ว
// จะบวก/ลบทับอีกที ตัวเลขที่ผู้เล่นต้องใช้จริงจึงไม่ใช่ตัวเลขบนการ์ด
// ตัวเลขพวกนี้อยู่ใน monster_info.json ช่อง modifiers / part_break_modifiers (คู่กับข้อความกฎภาษาไทย)
// scripts/check-data.cjs บังคับให้สองอย่างตรงกันเสมอ
//
// ไฟล์นี้ตั้งใจไม่พึ่ง Vue และไม่ import อะไรเลย — scripts/test-card-stats.mjs จะได้เรียกตรงจาก node ได้

export const PART_POSITIONS = ['front', 'back', 'left', 'right']

// ค่าบนการ์ดที่กฎแก้ได้ — ต้องตรงกับ TOKEN_OF ใน check-data.cjs
export const CARD_STATS = ['damage', 'range', 'agility', 'activations', 'attack_cards', 'move']

// 'yes' = เข้าเงื่อนไข · 'no' = ไม่เข้า · 'manual' = แอปตัดสินเองไม่ได้ ต้องให้คนดู
// 'n/a' = เงื่อนไขผูกกับตัวการ์ด แต่กำลังคิดค่าที่ไม่เกี่ยวกับการ์ด (เช่น เกราะของชิ้นส่วน)
const evaluate = (when, card, ctx) => {
  if (!when) return 'no'
  if (when.always) return 'yes'
  if (when.monster_has_broken_part) return ctx.anyPartBroken ? 'yes' : 'no'
  if (when.manual != null) return 'manual'
  if (!card) return 'n/a'
  if (when.element_id != null) return card.attack?.element_id === when.element_id ? 'yes' : 'no'
  if (when.status_id != null) return card.attack?.status_id === when.status_id ? 'yes' : 'no'
  if (when.part_id != null) return card.part_id === when.part_id ? 'yes' : 'no'
  return 'no'
}

// กฎที่มีผลในตอนนี้: special_rule ของระดับนี้ + part_break_rule ของชิ้นส่วนที่พังแล้วเท่านั้น
const activeRules = (difficulty, brokenParts) => {
  const rules = []
  const special = difficulty?.special_rule
  if (special?.modifiers?.length) {
    rules.push({ kind: 'special', position: null, title: special.title ?? null, text: special.description ?? '', modifiers: special.modifiers })
  }
  for (const position of PART_POSITIONS) {
    if (!brokenParts?.[position]) continue
    const part = difficulty?.monster_parts?.[position]
    if (!part?.part_break_modifiers?.length) continue
    rules.push({ kind: 'part', position, title: null, text: part.part_break_rule ?? '', modifiers: part.part_break_modifiers })
  }
  return rules
}

const sourceOf = (rule) => ({ kind: rule.kind, position: rule.position, title: rule.title, text: rule.text })

export const POISON_HP_LOSS = 2

/**
 * HP ที่ Hunter เสียตอน Poison ที่ติดจากการโจมตีของมอนหมดผล (ปกติ 2)
 * กฎแก้ผ่าน change.poison_hp เช่น Pukei-Pukei +1 และหน้าพังที่ระดับ 3 −1
 * Poison จาก Time Card ไม่ได้มาจากมอน ไม่ต้องเรียกตัวนี้ ใช้ POISON_HP_LOSS ตรง ๆ
 * @returns { base, value, applied }
 */
export function resolvePoisonHpLoss({ difficulty, brokenParts } = {}) {
  const base = POISON_HP_LOSS
  let value = base
  const applied = []
  const ctx = { anyPartBroken: PART_POSITIONS.some((p) => brokenParts?.[p]) }
  for (const rule of activeRules(difficulty, brokenParts)) {
    for (const mod of rule.modifiers) {
      const delta = mod.change?.poison_hp
      if (!delta || evaluate(mod.when, null, ctx) !== 'yes') continue
      value += delta
      applied.push({ ...sourceOf(rule), change: { poison_hp: delta } })
    }
  }
  return { base, value: Math.max(0, value), applied }
}

/**
 * ค่าจริงของการ์ดพฤติกรรม 1 ใบ
 * @param card การ์ดจาก behavior_deck / behavior_special_card (ต้องมี attack, part_id, move)
 * @param ctx  { difficulty, brokenParts } — brokenParts คือ { front: true, ... } แบบเดียวกับใน Quest.vue
 * @returns { base, value, applied, notes }
 *          base = ตัวเลขบนการ์ด · value = ตัวเลขที่ใช้จริง
 *          applied = กฎที่บวกให้แล้ว · notes = กฎที่ต้องให้คนตัดสินเอง (เงื่อนไข manual)
 */
export function resolveCardStats(card, { difficulty, brokenParts } = {}) {
  const base = {
    damage: card?.attack?.damage ?? 0,
    range: card?.attack?.range ?? 0,
    agility: card?.attack?.agility ?? 0,
    activations: card?.activations ?? 0,
    attack_cards: card?.attack_cards ?? 0,
    move: card?.move ?? 0,
  }
  const value = { ...base }
  const applied = []
  const notes = []
  if (!card) return { base, value, applied, notes }

  const ctx = { anyPartBroken: PART_POSITIONS.some((p) => brokenParts?.[p]) }

  // รวมส่วนต่างให้ครบก่อนแล้วค่อยตัดที่ 0 — ลำดับการบวกจะได้ไม่เปลี่ยนผลลัพธ์
  for (const rule of activeRules(difficulty, brokenParts)) {
    for (const mod of rule.modifiers) {
      const verdict = evaluate(mod.when, card, ctx)
      if (verdict === 'no' || verdict === 'n/a') continue

      const change = {}
      for (const stat of CARD_STATS) {
        if (mod.change?.[stat]) change[stat] = mod.change[stat]
      }
      if (!Object.keys(change).length) continue // กฎที่แก้เฉพาะเกราะ ไม่เกี่ยวกับการ์ด

      if (verdict === 'manual') {
        notes.push({ ...sourceOf(rule), condition: mod.when.manual, change })
        continue
      }
      for (const [stat, delta] of Object.entries(change)) value[stat] += delta
      applied.push({ ...sourceOf(rule), change })
    }
  }
  for (const stat of CARD_STATS) value[stat] = Math.max(0, value[stat])

  return { base, value, applied, notes }
}

// ability "Guard" — เล่นการ์ดโจมตีที่มีค่าป้องกัน ได้ค่าป้องกันเพิ่มอีก 1 (bonus_ability.json id 16)
export const GUARD_ABILITY_ID = 16

/**
 * ความเสียหายที่ Hunter รับจริงจากการโจมตี 1 ครั้ง
 *
 * การโจมตีกายภาพ (element_id = 0) หักด้วยเกราะกายภาพที่ใส่อยู่
 * การโจมตีธาตุ หักด้วยเกราะธาตุนั้น (+1 ถ้ากินข้าวเชฟเหมี่ยวธาตุตรงกัน)
 * เกราะที่ได้จาก Attack Card ที่เล่นลงไป แอปไม่เห็นการ์ดบนมือ — ผู้เล่นกดเพิ่มเองผ่าน shield
 * ability Guard ให้ค่าป้องกันเพิ่มอีก 1 เมื่อได้เล่นการ์ดที่มีค่าป้องกัน (shield > 0)
 * ติด Blastblight เกราะรวม −2 (ไม่ต่ำกว่า 0) จนกว่าจะจบเทิร์นถัดไปของตัวเอง
 * หักจนเหลือ 0 หรือติดลบ ยังต้องรับอย่างน้อย 1 หน่วยเสมอ
 *
 * @param armor { physical, elements: { [elementId]: n }, abilities: number[] } จาก armorSummary()
 * @param shield เกราะจาก Attack Card ที่กดเพิ่มเอง (ชนิดเดียวกับการโจมตีที่เข้ามา)
 * @param blastblight ติด Blastblight อยู่หรือไม่
 * @returns { base, worn, chefBonus, shield, guardBonus, blast, guard, element_id, dmg }
 */
export const BLASTBLIGHT_ARMOR_PENALTY = 2

export function resolveHunterDamage({ damage = 0, element_id = 0, armor, chefElement, shield = 0, blastblight = false } = {}) {
  const base = Math.max(0, damage)
  const el = element_id || 0
  const played = Math.max(0, shield)
  const guardBonus = played > 0 && armor?.abilities?.includes(GUARD_ABILITY_ID) ? 1 : 0
  const chefBonus = el > 0 && Number(chefElement) === el ? 1 : 0
  const worn = (el > 0 ? (armor?.elements?.[el] ?? 0) : (armor?.physical ?? 0)) + chefBonus
  const full = worn + played + guardBonus
  const blast = blastblight ? Math.min(full, BLASTBLIGHT_ARMOR_PENALTY) : 0
  const guard = full - blast
  return { base, worn, chefBonus, shield: played, guardBonus, blast, guard, element_id: el, dmg: Math.max(1, base - guard) }
}

/**
 * ค่าเกราะจริงของชิ้นส่วน 1 ชิ้น
 * กฎใน special_rule ที่แก้ {armor} คิดกับทุกชิ้นส่วน ส่วนกฎใน part_break_rule คิดเฉพาะชิ้นส่วนของตัวเอง
 * @returns { base, value, applied, notes }
 */
export function resolvePartArmor(position, { difficulty, brokenParts } = {}) {
  const base = difficulty?.monster_parts?.[position]?.armor ?? 0
  let value = base
  const applied = []
  const notes = []
  const ctx = { anyPartBroken: PART_POSITIONS.some((p) => brokenParts?.[p]) }

  const rules = activeRules(difficulty, brokenParts).filter((r) => r.kind === 'special' || r.position === position)
  for (const rule of rules) {
    for (const mod of rule.modifiers) {
      const delta = mod.change?.armor
      if (!delta) continue
      const verdict = evaluate(mod.when, null, ctx)
      if (verdict === 'no' || verdict === 'n/a') continue
      if (verdict === 'manual') {
        notes.push({ ...sourceOf(rule), condition: mod.when.manual, change: { armor: delta } })
        continue
      }
      value += delta
      applied.push({ ...sourceOf(rule), change: { armor: delta } })
    }
  }
  return { base, value: Math.max(0, value), applied, notes }
}
