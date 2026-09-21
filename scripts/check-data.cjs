#!/usr/bin/env node
/* ยามเฝ้าข้อมูลเกม — รันด้วย `npm run check` และรันเองทุกครั้งที่ push
 *
 * บั๊กที่เจ็บที่สุดของแอปนี้ไม่ใช่บั๊กโค้ด แต่เป็นข้อมูลไม่ตรงกันเงียบ ๆ:
 * วัตถุดิบในสูตรคราฟต์ที่ไม่มีมอนตัวไหนดรอป (Black Diablos Horn) ทำให้ผู้เล่นคราฟไม่ได้ทั้งชุด
 * โดยที่หน้าจอไม่ฟ้องอะไรเลย ต้องมีคนเล่นมาถึงจุดนั้นแล้วรายงานเข้ามาถึงจะรู้
 *
 * ตัวนี้ตรวจความสอดคล้องระหว่างไฟล์ ไม่ตรวจว่าตรงกับ Rulebook ไหม (แอปนี้ตั้งใจต่างจาก Rulebook บางจุด)
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const FILES = path.join(ROOT, 'src/assets/files')
const ELDER = path.join(ROOT, 'src/assets/elden_dragon')
const PUBLIC = path.join(ROOT, 'public')

const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'))
const errors = []
const warnings = []
const fail = (where, msg) => errors.push(`${where}: ${msg}`)
const warn = (where, msg) => warnings.push(`${where}: ${msg}`)

// ── โหลดข้อมูล ──────────────────────────────────────────────
const resources = read(path.join(FILES, 'resource.json'))
const crafting = read(path.join(FILES, 'crafting_item.json'))
const changelog = read(path.join(FILES, 'changelog.json'))
const elderBooks = fs.readdirSync(ELDER).filter((f) => f.endsWith('_book.json'))
const elderInfos = fs.readdirSync(ELDER).filter((f) => f.endsWith('_info.json'))

const books = [
  { name: 'ancient-quest-book.json', data: read(path.join(FILES, 'ancient-quest-book.json')) },
  { name: 'wildspire_book.json', data: read(path.join(FILES, 'wildspire_book.json')) },
  ...elderBooks.map((f) => {
    const j = read(path.join(ELDER, f))
    return { name: f, data: Array.isArray(j) ? j : [j] }
  }),
]
const monsterInfo = [
  ...read(path.join(FILES, 'monster_info.json')),
  ...elderInfos.map((f) => read(path.join(ELDER, f))),
]

// ── 1. คลังวัตถุดิบ ─────────────────────────────────────────
const itemKey = (t, i) => `${t}-${i}`
const itemNames = new Map()
for (const group of resources) {
  const seen = new Set()
  for (const item of group.resources) {
    const key = itemKey(group.resource_type_id, item.item_id)
    if (seen.has(item.item_id)) fail('resource.json', `item_id ${item.item_id} ซ้ำในหมวด ${group.resource_type}`)
    seen.add(item.item_id)
    itemNames.set(key, item.item)
  }
}

/* ── 2. ของที่ "หาได้จริง" ─────────────────────────────────
   แหล่งที่มาของวัตถุดิบในเกมมีสี่ทาง ต้องนับให้ครบ ไม่งั้นตัวตรวจจะฟ้องผิด:
   1) ตารางรางวัลของมอน (reward / part_break_reward)
   2) ของที่เจอระหว่างเควสต์ (dialog_resources)
   3) ผลของ Dialog ที่แจกของให้ตรง ๆ (effects type: gainResource)
   4) Trade ที่ HQ — ฝั่ง Common แลกได้ทุกชิ้นเสมอ ส่วนฝั่ง Rare หยิบจากตารางรางวัลซึ่งนับในข้อ 1 แล้ว */
const obtainable = new Set()
for (const group of resources) {
  if (group.resource_type_id !== 1) continue
  for (const item of group.resources) obtainable.add(itemKey(1, item.item_id))
}
const collectGains = (node) => {
  if (Array.isArray(node)) return node.forEach(collectGains)
  if (!node || typeof node !== 'object') return
  if (node.type === 'gainResource' && node.type_id != null && node.item_id != null) {
    obtainable.add(itemKey(node.type_id, node.item_id))
  }
  for (const value of Object.values(node)) collectGains(value)
}
for (const info of monsterInfo) {
  for (const diff of info.difficulty ?? []) {
    for (const row of diff.reward_table ?? []) {
      for (const r of [row.reward, row.part_break_reward]) {
        if (r?.resource_type_id != null && r?.item_id != null) obtainable.add(itemKey(r.resource_type_id, r.item_id))
      }
    }
  }
}
for (const book of books) {
  for (const monster of book.data) {
    for (const quest of monster.quest ?? []) {
      for (const r of quest.dialog_resources ?? []) obtainable.add(itemKey(r.resource_type_id, r.item_id))
    }
    collectGains(monster.quest_dialogs)
  }
}

// ── 3. สูตรคราฟต์ ───────────────────────────────────────────
for (const group of crafting) {
  for (const entry of group.craft_list ?? []) {
    const who = `${group.type} set ${entry.equip_set_id ?? '-'} / id ${entry.equip_id ?? entry.item_id ?? '-'}`
    for (const row of entry.crafting_table ?? []) {
      const [typeId, itemId] = row.material ?? []
      const key = itemKey(typeId, itemId)
      if (!itemNames.has(key)) {
        fail('crafting_item.json', `${who} ใช้วัตถุดิบ [${typeId},${itemId}] ที่ไม่มีใน resource.json`)
        continue
      }
      if (!(row.amount > 0)) fail('crafting_item.json', `${who} วัตถุดิบ ${itemNames.get(key)} จำนวนไม่ถูกต้อง (${row.amount})`)
      if (!obtainable.has(key)) {
        fail('crafting_item.json', `${who} ต้องใช้ "${itemNames.get(key)}" [${typeId},${itemId}] ซึ่งไม่มีทางหาได้ — ไม่อยู่ในตารางรางวัลของมอนตัวไหนและไม่พบระหว่างเควสต์`)
      }
    }
  }
}

// ── 4. เล่มเควสต์ ───────────────────────────────────────────
const QUEST_TYPES = new Set(['Assigned Quest', 'Investigation Quest', 'Tempered Investigation Quest'])
const monsterIds = new Map()
for (const book of books) {
  for (const monster of book.data) {
    const who = `${book.name} / ${monster.monster_name}`
    if (monsterIds.has(monster.monster_id)) {
      fail('books', `monster_id ${monster.monster_id} ซ้ำกันระหว่าง ${monsterIds.get(monster.monster_id)} กับ ${who}`)
    }
    monsterIds.set(monster.monster_id, who)

    const info = monsterInfo.find((m) => m.monster_id === monster.monster_id)
    if (!info) {
      fail('books', `${who} ไม่มีข้อมูลมอนใน monster_info (เปิดเควสต์ได้แต่จะไม่มีเลือด/ตารางรางวัล)`)
      continue
    }

    const dialogIds = new Set((monster.quest_dialogs ?? []).map((d) => d.dialog_id))
    for (const id of monster.dialog_hunting_phase ?? []) {
      if (!dialogIds.has(id)) fail('books', `${who} dialog_hunting_phase อ้าง dialog_id ${id} ที่ไม่มีอยู่`)
    }

    const questIds = new Set()
    for (const quest of monster.quest ?? []) {
      const q = `${who} quest_id ${quest.quest_id}`
      if (questIds.has(quest.quest_id)) fail('books', `${q} ซ้ำกันในมอนตัวเดียวกัน`)
      questIds.add(quest.quest_id)
      if (!QUEST_TYPES.has(quest.quest_type)) fail('books', `${q} ประเภทเควสต์ไม่รู้จัก "${quest.quest_type}"`)
      if (!(quest.difficulty_level >= 1)) fail('books', `${q} difficulty_level ไม่ถูกต้อง (${quest.difficulty_level})`)
      // เควสต์ชี้ไปที่ระดับความยากที่ไม่มีอยู่ = เข้าเควสต์แล้วไม่มีเลือดมอนและไม่มีตารางรางวัล
      if (!(info.difficulty ?? []).some((d) => d.difficulty_id === quest.difficulty_level)) {
        fail('books', `${q} ชี้ไปที่ความยากระดับ ${quest.difficulty_level} ซึ่งไม่มีใน monster_info ของมอนตัวนี้`)
      }
      if (!(quest.starting_point ?? []).length) fail('books', `${q} ไม่มี starting_point`)
      for (const id of quest.starting_point ?? []) {
        if (!dialogIds.has(id)) fail('books', `${q} starting_point อ้าง dialog_id ${id} ที่ไม่มีอยู่`)
      }
      for (const r of quest.dialog_resources ?? []) {
        if (!itemNames.has(itemKey(r.resource_type_id, r.item_id))) {
          fail('books', `${q} แจกของ [${r.resource_type_id},${r.item_id}] ที่ไม่มีใน resource.json`)
        }
      }
    }
  }
}

// ── 4.5 ค่าบนการ์ดพฤติกรรม ──────────────────────────────────
// ทุกใบต้องมีครบ: attack (ค่าโจมตี), part_id (ส่วนที่ใช้โจมตี), move (ระยะเคลื่อนที่)
// element_id 0 = กายภาพ · status_id 0 = ไม่ติดสถานะ · เลขอื่นต้องมีจริงในไฟล์ธาตุ/สถานะ
// part_id ใช้เลขเดียวกับ monster_parts.json — การ์ดโจมตีด้วยส่วนที่ "แตกไม่ได้" ได้ (เช่น Diablos ใช้ Body)
{
  const elementIds = new Set(read(path.join(FILES, 'elemental.json')).map((e) => e.elemental_id))
  const statusIds = new Set(read(path.join(FILES, 'status_effect.json')).map((s) => s.effect_id))
  const partIds = new Set(read(path.join(FILES, 'monster_parts.json')).map((p) => p.part_id))
  for (const info of monsterInfo) {
    for (const card of [...(info.behavior_deck ?? []), ...(info.behavior_special_card ?? [])]) {
      const who = `${info.monster_name} การ์ด "${card.behavior_name}"`
      const a = card.attack
      if (a == null) {
        fail('monster_info', `${who} ยังไม่มี attack`)
      } else {
        for (const key of ['damage', 'range', 'agility']) {
          if (!Number.isInteger(a[key]) || a[key] < 0) fail('monster_info', `${who} ${key} ต้องเป็นจำนวนเต็มไม่ติดลบ (ได้ ${a[key]})`)
        }
        if (a.element_id !== 0 && !elementIds.has(a.element_id)) fail('monster_info', `${who} element_id ${a.element_id} ไม่มีใน elemental.json`)
        if (a.status_id !== 0 && !statusIds.has(a.status_id)) fail('monster_info', `${who} status_id ${a.status_id} ไม่มีใน status_effect.json`)
      }
      if (!partIds.has(card.part_id)) fail('monster_info', `${who} part_id ${card.part_id} ไม่มีใน monster_parts.json`)
      if (!Number.isInteger(card.move) || card.move < 0) fail('monster_info', `${who} move ต้องเป็นจำนวนเต็มไม่ติดลบ (ได้ ${card.move})`)
    }
  }
}

// ── 4.6 ตัวแก้ค่าของกฎ (modifiers) ──────────────────────────
// ข้อความกฎเป็นภาษาไทยไว้ให้คนอ่าน ส่วน modifiers คือตัวเลขที่เครื่องคำนวณใช้ — ต้องไม่หลุดจากกัน
// กฎข้อไหนพูดถึงค่าสถานะ ({atk} ฯลฯ) ต้องมี modifiers คู่กันเสมอ ([] = ตรวจแล้วว่าไม่กระทบการ์ดมอน)
// และทุกค่าที่ modifier แก้ ต้องมี token ของค่านั้นอยู่ในข้อความ จะได้ไม่มีตัวเลขโผล่มาลอย ๆ
{
  const elementIds = new Set(read(path.join(FILES, 'elemental.json')).map((e) => e.elemental_id))
  const statusIds = new Set(read(path.join(FILES, 'status_effect.json')).map((s) => s.effect_id))
  const partIds = new Set(read(path.join(FILES, 'monster_parts.json')).map((p) => p.part_id))
  const TOKEN_OF = {
    damage: 'atk', range: 'range', agility: 'agility',
    activations: 'hturn', attack_cards: 'hcard', move: 'move', armor: 'armor',
  }
  const STAT_TOKENS = [...new Set(Object.values(TOKEN_OF))]
  const hasStatToken = (text) => STAT_TOKENS.some((t) => text.includes(`{${t}}`))

  const checkWhen = (who, when) => {
    if (when == null || typeof when !== 'object') return fail('monster_info', `${who} ขาด when`)
    const keys = Object.keys(when)
    if (keys.length !== 1) return fail('monster_info', `${who} when ต้องมีเงื่อนไขเดียว (ได้ ${keys.join('+') || 'ว่าง'})`)
    const [k] = keys
    const v = when[k]
    if (k === 'always' || k === 'monster_has_broken_part') {
      if (v !== true) fail('monster_info', `${who} when.${k} ต้องเป็น true`)
    } else if (k === 'element_id') {
      if (!elementIds.has(v)) fail('monster_info', `${who} when.element_id ${v} ไม่มีใน elemental.json`)
    } else if (k === 'status_id') {
      if (!statusIds.has(v)) fail('monster_info', `${who} when.status_id ${v} ไม่มีใน status_effect.json`)
    } else if (k === 'part_id') {
      if (!partIds.has(v)) fail('monster_info', `${who} when.part_id ${v} ไม่มีใน monster_parts.json`)
    } else if (k === 'manual') {
      if (typeof v !== 'string' || !v.trim()) fail('monster_info', `${who} when.manual ต้องเป็นข้อความอธิบายเงื่อนไข`)
    } else {
      fail('monster_info', `${who} when.${k} ไม่ใช่เงื่อนไขที่รองรับ`)
    }
  }

  const checkRule = (who, text, mods) => {
    if (!hasStatToken(text)) {
      if (mods !== undefined) fail('monster_info', `${who} มี modifiers ทั้งที่ข้อความไม่ได้พูดถึงค่าไหนเลย`)
      return
    }
    if (mods === undefined) return fail('monster_info', `${who} ข้อความแก้ค่าแต่ยังไม่มี modifiers`)
    if (!Array.isArray(mods)) return fail('monster_info', `${who} modifiers ต้องเป็น array`)
    if (!mods.length) return // [] = ตรวจแล้วว่าไม่กระทบค่าบนการ์ดของมอน (เช่น กฎที่แก้การ์ดของ Hunter)

    const covered = new Set()
    mods.forEach((mod, i) => {
      const whoMod = `${who} modifier #${i + 1}`
      checkWhen(whoMod, mod.when)
      const change = mod.change
      if (change == null || typeof change !== 'object' || !Object.keys(change).length) {
        return fail('monster_info', `${whoMod} ขาด change`)
      }
      for (const [key, val] of Object.entries(change)) {
        if (!(key in TOKEN_OF)) { fail('monster_info', `${whoMod} change.${key} ไม่ใช่ค่าที่รองรับ`); continue }
        if (!Number.isInteger(val) || val === 0) fail('monster_info', `${whoMod} change.${key} ต้องเป็นจำนวนเต็มที่ไม่ใช่ 0 (ได้ ${val})`)
        if (!text.includes(`{${TOKEN_OF[key]}}`)) fail('monster_info', `${whoMod} แก้ ${key} แต่ข้อความไม่มี {${TOKEN_OF[key]}}`)
        covered.add(TOKEN_OF[key])
      }
    })
    for (const t of STAT_TOKENS) {
      if (text.includes(`{${t}}`) && !covered.has(t)) fail('monster_info', `${who} ข้อความมี {${t}} แต่ไม่มี modifier ไหนแก้ค่านั้น`)
    }
  }

  for (const info of monsterInfo) {
    for (const diff of info.difficulty ?? []) {
      const who = `${info.monster_name} ความยาก ${diff.difficulty_id}`
      if (diff.special_rule?.description) {
        checkRule(`${who} special_rule`, diff.special_rule.description, diff.special_rule.modifiers)
      }
      for (const [pos, part] of Object.entries(diff.monster_parts ?? {})) {
        if (!part?.part_break_rule) continue
        checkRule(`${who} ชิ้นส่วน ${pos}`, part.part_break_rule, part.part_break_modifiers)
      }
    }
  }
}

// ── 5. ตารางรางวัล ──────────────────────────────────────────
for (const info of monsterInfo) {
  for (const diff of info.difficulty ?? []) {
    const who = `${info.monster_name} ความยาก ${diff.difficulty_id}`
    const rolls = new Set()
    for (const row of diff.reward_table ?? []) {
      if (rolls.has(row.rolled_number)) fail('monster_info', `${who} เลขทอย ${row.rolled_number} ซ้ำ`)
      rolls.add(row.rolled_number)
      for (const [label, r] of [['reward', row.reward], ['part_break_reward', row.part_break_reward]]) {
        if (r?.resource_type_id == null || r?.item_id == null) continue
        if (!itemNames.has(itemKey(r.resource_type_id, r.item_id))) {
          fail('monster_info', `${who} เลขทอย ${row.rolled_number} ${label} ให้ของ [${r.resource_type_id},${r.item_id}] ที่ไม่มีใน resource.json`)
        }
      }
    }
  }
}

// ── 6. changelog ────────────────────────────────────────────
const TYPES = new Set(['new', 'fix', 'improve'])
const seenIds = new Set()
for (const entry of changelog) {
  const who = `changelog ${entry.id ?? '(ไม่มี id)'}`
  if (!entry.id) fail('changelog.json', 'มีรายการที่ไม่มี id')
  if (seenIds.has(entry.id)) fail('changelog.json', `id ${entry.id} ซ้ำ (ใช้จำว่าผู้เล่นอ่านรายการไหนแล้ว ห้ามซ้ำ)`)
  seenIds.add(entry.id)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date ?? '')) fail('changelog.json', `${who} วันที่ไม่ถูกรูปแบบ YYYY-MM-DD`)
  if (!entry.title) fail('changelog.json', `${who} ไม่มีหัวข้อ`)
  if (!Array.isArray(entry.sections) || !entry.sections.length) fail('changelog.json', `${who} ไม่มีเนื้อหา`)
  for (const section of entry.sections ?? []) {
    if (!TYPES.has(section.type)) fail('changelog.json', `${who} ประเภทไม่รู้จัก "${section.type}"`)
    if (!Array.isArray(section.items) || !section.items.length) fail('changelog.json', `${who} หมวด ${section.type} ไม่มีรายการ`)
    for (const item of section.items ?? []) {
      // เลขเวอร์ชันยังไม่รู้จนกว่าจะ build — เขียนไว้ในข้อความจะผิดเสมอ
      if (/\bv?\d+\.\d+\.\d+\b/.test(item)) fail('changelog.json', `${who} มีเลขเวอร์ชันอยู่ในข้อความ`)
    }
  }
}

// ── 7. รูปที่อ้างถึงต้องมีอยู่จริง ──────────────────────────
const IMAGE_KEY = /(thumbnail|_img|map_image|image)$/
const missingImages = new Set()

/* Windows หาไฟล์แบบไม่สนตัวพิมพ์เล็กใหญ่ แต่ GitHub Pages สน — ชื่อที่พิมพ์ผิดตัวเดียวจะกลายเป็น 404
   เฉพาะบนเว็บจริงเท่านั้น (เคยเกิดกับ barroth_Icon.webp) จึงต้องเทียบชื่อไฟล์แบบตรงตัวพิมพ์เอง
   ไม่ใช้ fs.existsSync ตรง ๆ ไม่งั้นบนเครื่องที่พัฒนาจะผ่านหมดแล้วไปโผล่ตอนขึ้นเว็บ */
const dirCache = new Map()
const entriesOf = (dir) => {
  if (!dirCache.has(dir)) {
    dirCache.set(dir, fs.existsSync(dir) ? new Set(fs.readdirSync(dir)) : new Set())
  }
  return dirCache.get(dir)
}
const existsExact = (relPath) => {
  const parts = relPath.split('/')
  let dir = PUBLIC
  for (let i = 0; i < parts.length; i++) {
    if (!entriesOf(dir).has(parts[i])) return false
    dir = path.join(dir, parts[i])
  }
  return true
}
const walk = (node, source) => {
  if (Array.isArray(node)) return node.forEach((n) => walk(n, source))
  if (!node || typeof node !== 'object') return
  for (const [key, value] of Object.entries(node)) {
    if (typeof value === 'string' && IMAGE_KEY.test(key) && value.startsWith('assets/')) {
      if (!existsExact(value)) missingImages.add(`${source} → ${value}`)
    } else walk(value, source)
  }
}
for (const f of fs.readdirSync(FILES).filter((f) => f.endsWith('.json') && f !== 'asset-manifest.json')) {
  walk(read(path.join(FILES, f)), f)
}
for (const f of fs.readdirSync(ELDER).filter((f) => f.endsWith('.json'))) {
  walk(read(path.join(ELDER, f)), f)
}
for (const m of missingImages) fail('รูปหาย', m)

// ── 8. ทัวร์สอนใช้งาน: ทุก target ต้องมี data-tour อยู่จริงในไฟล์ .vue ────
// ทัวร์ชี้ปุ่มด้วย data-tour ไม่ใช่ชื่อคลาส — เปลี่ยนชื่อหรือลบ data-tour แล้วลืมแก้ tours.js
// ขั้นนั้นจะหาไม่เจอ (ไม่ optional = ทัวร์จบกลางคัน, optional = ถูกข้ามเงียบ ๆ ไม่มีใครรู้)
{
  const SRC = path.join(ROOT, 'src')
  const vueFiles = []
  const walkDir = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) walkDir(p)
      else if (e.name.endsWith('.vue')) vueFiles.push(p)
    }
  }
  walkDir(SRC)
  const staticIds = new Set()
  const literals = new Set()
  for (const f of vueFiles) {
    const text = fs.readFileSync(f, 'utf8')
    for (const m of text.matchAll(/(?:^|[^:\w-])data-tour="([^"]+)"/g)) staticIds.add(m[1])
    // :data-tour="cond ? 'a' : 'b'" หรือ :data-tour="'tab-' + item.menu" — เก็บข้อความในเครื่องหมายคำพูด
    for (const m of text.matchAll(/:data-tour="([^"]+)"/g)) {
      for (const q of m[1].matchAll(/'([^']*)'/g)) literals.add(q[1])
    }
  }
  const toursText = fs.readFileSync(path.join(ROOT, 'src/tours/tours.js'), 'utf8')
  const targets = [...toursText.matchAll(/target:\s*'([^']+)'/g)].map((m) => m[1])
  const prefixes = [...literals].filter((l) => l.endsWith('-'))
  for (const t of new Set(targets)) {
    const ok = staticIds.has(t) || literals.has(t) || prefixes.some((p) => t.startsWith(p))
    if (!ok) fail('tours.js', `target "${t}" ไม่มี data-tour="${t}" ในไฟล์ .vue ไหนเลย`)
  }
}

// ── สรุป ────────────────────────────────────────────────────
const monsterCount = monsterIds.size
console.log(`ตรวจแล้ว: มอน ${monsterCount} ตัว, เล่มเควสต์ ${books.length} เล่ม, วัตถุดิบ ${itemNames.size} ชนิด, changelog ${changelog.length} รายการ`)
for (const w of warnings) console.log('เตือน  ' + w)
if (!errors.length) {
  console.log('ผ่านทั้งหมด')
  process.exit(0)
}
console.log(`\nพบปัญหา ${errors.length} จุด:`)
for (const e of errors) console.log('  ✗ ' + e)
process.exit(1)
