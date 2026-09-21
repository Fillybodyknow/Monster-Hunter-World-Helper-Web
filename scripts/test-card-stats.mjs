#!/usr/bin/env node
// ทดสอบเครื่องคำนวณค่าการ์ดพฤติกรรม (src/services/cardStats.js) — `npm test`
// เคสที่เขียนมือคือเคสที่ไล่จากการ์ดจริงด้วยมือแล้ว ส่วนท้ายเป็นการกวาดทั้งไฟล์หาค่าที่เป็นไปไม่ได้
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { resolveCardStats, resolvePartArmor, resolveHunterDamage, GUARD_ABILITY_ID, CARD_STATS } from '../src/services/cardStats.js'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'))
const monsters = [
  ...read('src/assets/files/monster_info.json'),
  ...fs
    .readdirSync(path.join(ROOT, 'src/assets/elden_dragon'))
    .filter((f) => f.endsWith('_info.json'))
    .flatMap((f) => {
      const j = read(path.join('src/assets/elden_dragon', f))
      return Array.isArray(j) ? j : [j]
    }),
]

let failures = 0
let checks = 0
const expect = (cond, msg) => {
  checks++
  if (!cond && failures++ < 20) console.log('  ✗ ' + msg)
}

const find = (name, level) => {
  const m = monsters.find((x) => x.monster_name === name)
  if (!m) throw new Error('ไม่เจอมอน ' + name)
  const difficulty = m.difficulty.find((d) => d.level === level)
  if (!difficulty) throw new Error(`ไม่เจอ ${name} lv${level}`)
  return { monster: m, difficulty }
}
const cardsOf = (m) => [...(m.behavior_deck ?? []), ...(m.behavior_special_card ?? [])]
const card = (m, name) => {
  const c = cardsOf(m).find((x) => x.behavior_name === name)
  if (!c) throw new Error(`ไม่เจอการ์ด ${name} ของ ${m.monster_name}`)
  return c
}
// เขียนผลลัพธ์แบบสั้น ๆ ไว้ฟ้องตอนพัง
const brief = (r) => CARD_STATS.filter((k) => r.base[k] !== r.value[k]).map((k) => `${k} ${r.base[k]}→${r.value[k]}`).join(', ') || 'ไม่เปลี่ยน'

// ── 1. special_rule ที่เข้าทุกใบ ────────────────────────────
{
  const { monster, difficulty } = find('Rathalos', 4) // King of the Skies: ทุกใบ {atk}+1 และ {agility}+1
  for (const c of cardsOf(monster)) {
    const r = resolveCardStats(c, { difficulty, brokenParts: {} })
    expect(r.value.damage === r.base.damage + 1, `Rathalos lv4 ${c.behavior_name} damage ควร +1 (${brief(r)})`)
    expect(r.value.agility === r.base.agility + 1, `Rathalos lv4 ${c.behavior_name} agility ควร +1 (${brief(r)})`)
    expect(r.applied.length === 1 && r.applied[0].kind === 'special', `Rathalos lv4 ${c.behavior_name} ควรมีกฎเดียว`)
  }
}

// ── 2. กฎแยกตามธาตุ / ตามส่วนที่โจมตี ───────────────────────
{
  const { monster, difficulty } = find('Rathalos', 4)
  const brokenParts = { front: true, left: true } // front: ธาตุไฟ {range}-1 · left: ส่วน {body} {hturn}+1 {hcard}+1
  const fire = card(monster, 'Flamethrower') // ธาตุไฟ ระยะ 3
  const body = card(monster, 'Tackle') // ส่วน Body
  const other = card(monster, 'Tail Swing') // ส่วน Tail กายภาพ

  const rf = resolveCardStats(fire, { difficulty, brokenParts })
  expect(rf.value.range === rf.base.range - 1, `Flamethrower range ควร -1 (${brief(rf)})`)
  expect(rf.value.activations === rf.base.activations, `Flamethrower ไม่ใช่ส่วน Body ไม่ควรได้ Hunter Turn เพิ่ม (${brief(rf)})`)

  const rb = resolveCardStats(body, { difficulty, brokenParts })
  expect(rb.value.activations === rb.base.activations + 1, `Tackle activations ควร +1 (${brief(rb)})`)
  expect(rb.value.attack_cards === rb.base.attack_cards + 1, `Tackle attack_cards ควร +1 (${brief(rb)})`)
  expect(rb.value.range === rb.base.range, `Tackle ไม่ใช่ธาตุไฟ ระยะไม่ควรเปลี่ยน (${brief(rb)})`)

  const ro = resolveCardStats(other, { difficulty, brokenParts })
  expect(ro.value.range === ro.base.range && ro.value.activations === ro.base.activations, `Tail Swing ไม่ควรโดนกฎชิ้นส่วนเลย (${brief(ro)})`)
}

// ── 3. กฎบวกและลบพร้อมกันในใบเดียว ──────────────────────────
{
  // Diablos lv4: Devastating Charge ส่วน {head} {atk}+2 · พังหน้า ทุกใบ {atk}-1 · พังขา ส่วน {head} {move}-1 · พังหาง ส่วน {tail} {range}-1
  const { monster, difficulty } = find('Diablos', 4)
  const brokenParts = { front: true, back: true, right: true }

  const horn = card(monster, 'Horn Swing Left') // ส่วน Head
  const rh = resolveCardStats(horn, { difficulty, brokenParts })
  expect(rh.value.damage === rh.base.damage + 1, `Horn Swing Left damage ควร +2-1 = +1 (${brief(rh)})`)
  expect(rh.value.move === rh.base.move - 1, `Horn Swing Left move ควร -1 (${brief(rh)})`)

  const tail = card(monster, 'Tail Sweep Left') // ส่วน Tail
  const rt = resolveCardStats(tail, { difficulty, brokenParts })
  expect(rt.value.damage === rt.base.damage - 1, `Tail Sweep Left damage ควร -1 (${brief(rt)})`)
  expect(rt.value.range === rt.base.range - 1, `Tail Sweep Left range ควร -1 (${brief(rt)})`)
  expect(rt.value.move === rt.base.move, `Tail Sweep Left ไม่ใช่ส่วนหัว move ไม่ควรเปลี่ยน (${brief(rt)})`)
}

// ── 4. เงื่อนไข "มีชิ้นส่วนไหนพังก็ได้" ─────────────────────
{
  const { monster, difficulty } = find('Great Jagras', 2) // Irritable: ระหว่างที่มีชิ้นส่วนถูกทำลาย {atk}+1 {agility}+1
  const c = card(monster, 'Headbutt')
  const none = resolveCardStats(c, { difficulty, brokenParts: {} })
  expect(none.value.damage === none.base.damage, `Great Jagras lv2 ยังไม่พังอะไร ไม่ควรได้โบนัส (${brief(none)})`)
  expect(none.applied.length === 0, 'Great Jagras lv2 ยังไม่พังอะไร ไม่ควรมีกฎทำงาน')

  const broken = resolveCardStats(c, { difficulty, brokenParts: { back: true } })
  expect(broken.value.damage === broken.base.damage + 1, `Great Jagras lv2 พังชิ้นส่วนแล้ว damage ควร +1 (${brief(broken)})`)
  expect(broken.value.agility === broken.base.agility + 1, `Great Jagras lv2 พังชิ้นส่วนแล้ว agility ควร +1 (${brief(broken)})`)
}

// ── 5. เงื่อนไขที่แอปไม่รู้เอง (manual) ต้องไม่บวกให้ ────────
{
  const { monster, difficulty } = find('Jyuratodus', 3) // Mire Beast: ระหว่างอยู่ในพื้นที่ Pond
  const c = card(monster, 'Forward Bite')
  const r = resolveCardStats(c, { difficulty, brokenParts: {} })
  expect(r.value.damage === r.base.damage, `Jyuratodus lv3 ยังไม่ควรบวกดาเมจให้ (${brief(r)})`)
  expect(r.applied.length === 0, 'Jyuratodus lv3 กฎ Pond ไม่ควรอยู่ใน applied')
  expect(r.notes.length === 1, `Jyuratodus lv3 ควรมีหมายเหตุ 1 ข้อ (ได้ ${r.notes.length})`)
  expect(!!r.notes[0]?.condition, 'หมายเหตุต้องบอกเงื่อนไขว่าต้องเป็นยังไงถึงจะได้')
  expect(r.notes[0]?.change?.damage === 1 && r.notes[0]?.change?.agility === 1, 'หมายเหตุต้องบอกด้วยว่าได้อะไรบ้าง')
  expect(r.notes[0]?.change?.armor === undefined, 'เกราะไม่ใช่ค่าบนการ์ด ไม่ควรติดมาในหมายเหตุของการ์ด')
}

// ── 6. ค่าติดลบไม่ได้ ───────────────────────────────────────
{
  const { difficulty } = find('Barroth', 3) // พังหน้า: ส่วน {head} {move}-1
  const stuck = { behavior_name: 'ทดสอบ', attack: { damage: 0, range: 0, agility: 0, element_id: 0, status_id: 0 }, activations: 1, attack_cards: 1, part_id: 1, move: 0 }
  const r = resolveCardStats(stuck, { difficulty, brokenParts: { front: true } })
  expect(r.value.move === 0, `การ์ดที่ move 0 อยู่แล้ว ต้องไม่ติดลบ (ได้ ${r.value.move})`)
}

// ── 7. เกราะของชิ้นส่วน ─────────────────────────────────────
{
  const { difficulty } = find('Black Diablos', 1) // ขวา: Part ส่วนนี้ {armor}-1
  const before = resolvePartArmor('right', { difficulty, brokenParts: {} })
  const after = resolvePartArmor('right', { difficulty, brokenParts: { right: true } })
  expect(before.value === before.base, 'Black Diablos ขวา ยังไม่พัง เกราะไม่ควรเปลี่ยน')
  expect(after.value === after.base - 1, `Black Diablos ขวา พังแล้วเกราะควร -1 (${after.base}→${after.value})`)

  const otherPart = resolvePartArmor('front', { difficulty, brokenParts: { right: true } })
  expect(otherPart.value === otherPart.base, 'กฎ "Part ส่วนนี้" ต้องไม่ลามไปชิ้นส่วนอื่น')

  // Jyuratodus lv3 เพิ่มเกราะทุกชิ้นส่วน แต่ติดเงื่อนไข Pond → ต้องเป็นหมายเหตุ ไม่ใช่บวกให้เลย
  const jyu = find('Jyuratodus', 3)
  const pond = resolvePartArmor('front', { difficulty: jyu.difficulty, brokenParts: {} })
  expect(pond.value === pond.base, 'Jyuratodus lv3 เกราะ Pond ยังไม่ควรบวกให้')
  expect(pond.notes.length === 1, `Jyuratodus lv3 ควรมีหมายเหตุเกราะ 1 ข้อ (ได้ ${pond.notes.length})`)
}

// ── 8. กวาดทั้งไฟล์ — ทุกมอน ทุกระดับ ทุกแบบของชิ้นส่วนที่พัง ──
// หาเคสที่ค่าเพี้ยน (ติดลบ, ไม่ใช่ตัวเลข) และเก็บว่ามี modifier ไหนไม่เคยเข้าเงื่อนไขกับการ์ดใบไหนเลย
{
  const POS = ['front', 'back', 'left', 'right']
  const reached = new Map() // "มอน|lv|ที่มา|ลำดับ" -> เคยเข้าเงื่อนไขไหม
  const seen = (key) => reached.set(key, reached.get(key) ?? false)

  for (const m of monsters) {
    for (const difficulty of m.difficulty ?? []) {
      const lv = `${m.monster_name}|lv${difficulty.level}`
      ;(difficulty.special_rule?.modifiers ?? []).forEach((_, i) => seen(`${lv}|special|${i}`))
      for (const pos of POS) {
        ;(difficulty.monster_parts?.[pos]?.part_break_modifiers ?? []).forEach((_, i) => seen(`${lv}|${pos}|${i}`))
      }

      for (let mask = 0; mask < 1 << POS.length; mask++) {
        const brokenParts = Object.fromEntries(POS.map((p, i) => [p, !!(mask & (1 << i))]))
        for (const c of cardsOf(m)) {
          const r = resolveCardStats(c, { difficulty, brokenParts })
          const who = `${lv} ${c.behavior_name} [พัง ${POS.filter((p) => brokenParts[p]).join(',') || 'ไม่มี'}]`
          for (const stat of CARD_STATS) {
            expect(Number.isInteger(r.value[stat]) && r.value[stat] >= 0, `${who} ${stat} เพี้ยน (${r.value[stat]})`)
          }
          // กฎที่ทำงานต้องมาจาก special หรือชิ้นส่วนที่พังจริงเท่านั้น
          for (const a of [...r.applied, ...r.notes]) {
            expect(a.kind === 'special' || brokenParts[a.position], `${who} ติดกฎจากชิ้นส่วน ${a.position} ที่ยังไม่พัง`)
          }
          for (const a of r.applied) reached.set(`${lv}|${a.position ?? 'special'}|?`, true)
        }
        // นับว่า modifier ไหนเข้าเงื่อนไขบ้าง (ไล่ทีละตัวเพื่อให้รู้ลำดับ)
        // เทียบ change ด้วยลายเซ็นที่เรียงคีย์แล้ว ลำดับคีย์จะได้ไม่ทำให้เทียบพลาด
        const sign = (change) =>
          CARD_STATS.filter((k) => change?.[k]).map((k) => `${k}${change[k]}`).join(',')
        for (const c of cardsOf(m)) {
          const one = (mods, src) =>
            (mods ?? []).forEach((mod, i) => {
              const r = resolveCardStats(c, { difficulty, brokenParts })
              const hit = [...r.applied, ...r.notes].some((a) => (a.position ?? 'special') === src && sign(a.change) === sign(mod.change))
              if (hit) reached.set(`${lv}|${src}|${i}`, true)
            })
          one(difficulty.special_rule?.modifiers, 'special')
          for (const pos of POS) if (brokenParts[pos]) one(difficulty.monster_parts?.[pos]?.part_break_modifiers, pos)
        }
      }
      // เกราะ: ต้องไม่ติดลบไม่ว่าพังแบบไหน
      for (let mask = 0; mask < 1 << POS.length; mask++) {
        const brokenParts = Object.fromEntries(POS.map((p, i) => [p, !!(mask & (1 << i))]))
        for (const pos of POS) {
          if (!difficulty.monster_parts?.[pos]?.part_id) continue
          const a = resolvePartArmor(pos, { difficulty, brokenParts })
          expect(Number.isInteger(a.value) && a.value >= 0, `${lv} เกราะ ${pos} เพี้ยน (${a.value})`)
        }
      }
    }
  }

  // modifier ที่แก้เฉพาะเกราะจะไม่โผล่ในผลของการ์ด — ไม่นับว่าเข้าไม่ถึง
  const armorOnly = new Set()
  for (const m of monsters) {
    for (const difficulty of m.difficulty ?? []) {
      const lv = `${m.monster_name}|lv${difficulty.level}`
      const mark = (mods, src) =>
        (mods ?? []).forEach((mod, i) => {
          if (!Object.keys(mod.change).some((k) => CARD_STATS.includes(k))) armorOnly.add(`${lv}|${src}|${i}`)
        })
      mark(difficulty.special_rule?.modifiers, 'special')
      for (const pos of ['front', 'back', 'left', 'right']) mark(difficulty.monster_parts?.[pos]?.part_break_modifiers, pos)
    }
  }
  const never = [...reached].filter(([k, hit]) => !hit && !k.endsWith('|?') && !armorOnly.has(k)).map(([k]) => k)
  expect(never.length === 0, `มี modifier ที่ไม่มีการ์ดใบไหนเข้าเงื่อนไขเลย (part_id/ธาตุผิดหรือเปล่า): ${never.join(' , ')}`)
}

// ── 9. ความเสียหายที่ Hunter รับ ─────────────────────────────
{
  const armor = { physical: 3, elements: { 1: 2 } } // กายภาพ 3 · เกราะไฟ 2
  const d = (o) => resolveHunterDamage({ armor, ...o })

  const phys = d({ damage: 9, element_id: 0 })
  expect(phys.dmg === 6 && phys.guard === 3, `กายภาพ 9 − เกราะกายภาพ 3 ควรได้ 6 (ได้ ${phys.dmg})`)

  const fire = d({ damage: 9, element_id: 1 })
  expect(fire.dmg === 7 && fire.guard === 2, `ไฟ 9 − เกราะไฟ 2 ควรได้ 7 (ได้ ${fire.dmg})`)

  const water = d({ damage: 9, element_id: 2 })
  expect(water.dmg === 9 && water.guard === 0, `ไม่มีเกราะน้ำ ควรกินเต็ม 9 (ได้ ${water.dmg})`)

  const noWrongGuard = d({ damage: 9, element_id: 1 })
  expect(noWrongGuard.guard === 2, 'การโจมตีธาตุต้องไม่เอาเกราะกายภาพมาหัก')
  expect(d({ damage: 9, element_id: 0 }).guard === 3, 'การโจมตีกายภาพต้องไม่เอาเกราะธาตุมาหัก')

  const chef = d({ damage: 9, element_id: 1, chefElement: 1 })
  expect(chef.dmg === 6 && chef.chefBonus === 1, `กินข้าวเชฟธาตุไฟ เกราะไฟควร +1 เหลือ 6 (ได้ ${chef.dmg})`)
  const chefOther = d({ damage: 9, element_id: 1, chefElement: 3 })
  expect(chefOther.chefBonus === 0, 'กินข้าวคนละธาตุกับการโจมตี ไม่ควรได้โบนัส')
  const chefPhys = d({ damage: 9, element_id: 0, chefElement: 1 })
  expect(chefPhys.chefBonus === 0, 'การโจมตีกายภาพไม่ควรได้โบนัสข้าวเชฟ')

  // หักจนหมดแล้วก็ยังต้องรับอย่างน้อย 1
  expect(d({ damage: 3, element_id: 0 }).dmg === 1, 'เกราะเท่าดาเมจพอดี ต้องยังรับ 1')
  expect(d({ damage: 1, element_id: 0 }).dmg === 1, 'เกราะมากกว่าดาเมจ ต้องยังรับ 1 ไม่ติดลบ')
  expect(resolveHunterDamage({ damage: 8, element_id: 0 }).dmg === 8, 'ไม่ส่งเกราะมา ต้องกินเต็ม')
  expect(resolveHunterDamage({}).dmg === 1, 'ไม่ส่งอะไรมาเลย ต้องไม่พังและได้ขั้นต่ำ 1')

  // ── โล่จากการ์ดโจมตีที่เล่นลงไป (กรอกเอง) ──
  const shielded = d({ damage: 9, element_id: 0, shield: 2 })
  expect(shielded.dmg === 4 && shielded.guard === 5, `9 − เกราะ 3 − โล่ 2 ควรได้ 4 (ได้ ${shielded.dmg})`)
  expect(d({ damage: 9, element_id: 0, shield: -3 }).dmg === 6, 'โล่ติดลบต้องถือเป็น 0')

  // ── ability Guard: เล่นการ์ดที่มีค่าป้องกันแล้วได้ +1 ──
  const guard = { physical: 3, elements: { 1: 2 }, abilities: [GUARD_ABILITY_ID] }
  const withGuard = resolveHunterDamage({ damage: 9, element_id: 0, armor: guard, shield: 2 })
  expect(withGuard.dmg === 3 && withGuard.guardBonus === 1, `มี Guard และเล่นโล่ 2 ควรกันได้ 6 เหลือ 3 (ได้ ${withGuard.dmg})`)
  const guardNoShield = resolveHunterDamage({ damage: 9, element_id: 0, armor: guard, shield: 0 })
  expect(guardNoShield.guardBonus === 0, 'ไม่ได้เล่นการ์ดที่มีค่าป้องกัน Guard ต้องไม่ทำงาน')
  const guardOnElement = resolveHunterDamage({ damage: 9, element_id: 1, armor: guard, shield: 2 })
  expect(guardOnElement.guardBonus === 1, 'Guard ทำงานเมื่อได้เล่นการ์ดที่มีค่าป้องกัน ไม่ว่าจะกายภาพหรือธาตุ')

  // ── เกราะธาตุที่กดเพิ่มเองจากการ์ด ──
  const elemShield = d({ damage: 9, element_id: 1, shield: 3 })
  expect(elemShield.dmg === 4 && elemShield.guard === 5, `เกราะไฟ 2 + จากการ์ด 3 เหลือ 4 (ได้ ${elemShield.dmg})`)
  expect(elemShield.worn === 2, 'แยกเกราะที่ใส่อยู่กับเกราะจากการ์ดออกจากกัน')
  const elemChefShield = d({ damage: 9, element_id: 1, chefElement: 1, shield: 2 })
  expect(elemChefShield.guard === 5, `เกราะไฟ 2 + ข้าวเชฟ 1 + จากการ์ด 2 = 5 (ได้ ${elemChefShield.guard})`)
  expect(d({ damage: 9, element_id: 0, shield: 2 }).worn === 3, 'การโจมตีกายภาพ worn ต้องเป็นเกราะกายภาพที่ใส่อยู่')
}

console.log(failures ? `\n✗ ไม่ผ่าน ${failures} จาก ${checks} ข้อ` : `✓ ผ่านทั้งหมด ${checks} ข้อ`)
process.exit(failures ? 1 : 0)
