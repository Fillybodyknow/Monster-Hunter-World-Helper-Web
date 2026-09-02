import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BOOKS = ['src/assets/files/ancient-quest-book.json', 'src/assets/files/wildspire_book.json']

const WRITE = process.argv.includes('--write')

const readJson = (p) => JSON.parse(readFileSync(resolve(root, p), 'utf8'))

// ── ตารางอ้างอิงชื่อจริงในโปรเจค — normalize ชื่อที่ parse ได้ให้ตรง ──
const norm = (s) =>
  s
    .toLowerCase()
    .replace(/^the\s+/, '')
    .replace(/\s+card$/, '')
    .replace(/[\s'’-]+/g, '')

const RESOURCE_LOOKUP = new Map()
for (const group of readJson('src/assets/files/resource.json')) {
  for (const r of group.resources) {
    RESOURCE_LOOKUP.set(norm(r.item), { name: r.item, type_id: group.resource_type_id, item_id: r.item_id })
  }
}

// ชื่อใน dialog ที่สะกดต่างจาก resource.json — map โดยไม่แก้ข้อความต้นฉบับ
const RESOURCE_ALIAS = {
  'Firecell ore': 'Firecell Stone',
  'Dragonite Crystal': 'Dragonvein Crystal',
  'Tobi-Kadachi Electrode': 'Tobi-Kadahi Electrode', // resource.json สะกดตกตัว c
  'Azure Rathalos Shell': 'Azure Rathalos Carapace',
  'Azure Rathalos webbing': 'Azure Rathalos Wing',
}
for (const [from, to] of Object.entries(RESOURCE_ALIAS)) {
  const hit = RESOURCE_LOOKUP.get(norm(to))
  if (hit) RESOURCE_LOOKUP.set(norm(from), hit)
  else console.warn(`⚠ alias ชี้ไปยังชื่อที่ไม่มีจริง: ${from} → ${to}`)
}

const TIMECARD_LOOKUP = new Map()
{
  const tc = readJson('src/assets/files/time_card_management.json')
  for (const c of [...(tc.time_cards ?? []), ...(tc.red_time_cards ?? [])]) {
    TIMECARD_LOOKUP.set(norm(c.card_name), { name: c.card_name, time_card_id: c.time_card_id })
  }
}

const unknownResources = new Set()
const unknownCards = new Set()

const THAI_NUM = { หนึ่ง: 1, สอง: 2, สาม: 3, สี่: 4, ห้า: 5, หก: 6, เจ็ด: 7, แปด: 8 }
const num = (s) => (s == null ? null : THAI_NUM[s] ?? parseInt(s, 10))

// ป้องกันไม่ให้ auto-run: มีทางเลือก / ตัวเลือกเสริม / เงื่อนไข
// "หาก" ใน "หากทอยได้ 1-2" เป็นแถวตาราง ไม่ใช่เงื่อนไข — ตัดออกก่อนเช็ค
const BLOCKERS = [/หรือ/, /สามารถ/, /ถ้า|หาก|กรณี/, /ตามจำนวน/]

// แถวตารางทอยเต๋า: "1-2 ได้รับ X" / "หากทอยได้ 3-4 ได้ X" / "ทอยได้ 5-6: รับ X"
const DICE_ROW_RE = /^\s*(?:หาก\s*)?(?:ทอยได้\s*)?([1-6])\s*[-–]\s*([1-6])\s*[:：]?\s*(.+?)\s*$/
const DICE_HINT_RE = /ทอย(?:ลูก)?เต๋า|ทำการทอย/
// ประโยคสั่งทอยที่ไม่มีตารางผล — ผู้เล่นทอยเองแล้วเลือก choice ตามเลขที่ได้
const DICE_PHRASE_RE = /(?:ทำการ)?\s*ทอย(?:ลูก)?เต๋า\s*(?:\([^)]*\))?\s*(?:ตามนี้|ตามตาราง[^\s:：]*)?\s*[:：]?/gi
// ทอยครั้งเดียวใช้ผลร่วมกัน vs ต่างคนต่างทอย
const DICE_ONCE_RE = /ทอยครั้งเดียว|เต๋าเดียว/
const DICE_EACH_RE = /นักล่าทุกคน|แต่ละนักล่า|นักล่าแต่ละคน/
// "ลดค่าเลือดของ X ตามจำนวนที่ทอยได้"
const DICE_MONSTER_DMG_RE = /ลดค่า\s*(?:เลือด|hp)\s*(?:ของ)?\s*(.+?)\s*ตามจำนวนที่ทอยได้/i

const RULES = [
  {
    type: 'discardTimeCard',
    re: /ทิ้ง\s*(?:การ์ดเวลา|time\s*cards?)\s*(\d+|หนึ่ง|สอง|สาม|สี่|ห้า|หก|เจ็ด|แปด)\s*(?:ใบ)?|ทิ้ง\s*(\d+)\s*time\s*cards?/gi,
    n: (m) => num(m[1] ?? m[2]),
  },
  {
    type: 'discardTrackToken',
    re: /ทิ้ง\s*(?:track\s*token|token\s*รอยติดตาม)\s*(ทั้งหมด|\d+)\s*(?:อัน|ชิ้น)?/gi,
    n: (m) => (m[1] === 'ทั้งหมด' ? 'all' : num(m[1])),
  },
  {
    type: 'revealTrackToken',
    re: /เปิดเผย\s*track\s*tokens?\s*(?:จากกลุ่ม)?\s*(?:ได้\s*)?(?:สูงสุด\s*)?(ทั้งหมด|\d+)\s*(?:อัน|ชิ้น)?/gi,
    n: (m) => (m[1] === 'ทั้งหมด' ? 'all' : num(m[1])),
  },
  {
    type: 'gainTrackToken',
    re: /(?:ได้รับ|ได้|รับ)\s*(?:และเปิดเผย\s*)?(?:track\s*tokens?|token\s*รอยติดตาม)\s*(?:เพิ่ม\s*)?(\d+)\s*(?:อัน|ชิ้น)?|(?:ได้รับ|ได้|รับ)(?:และเปิดเผย)?\s*(\d+)\s*track\s*tokens?/gi,
    n: (m) => num(m[1] ?? m[2]),
  },
  {
    type: 'gainPotion',
    re: /(?:ได้รับ|รับ|เพิ่ม)\s*(?:ยา(?:รักษา)?|potions?)\s*(\d+|หนึ่ง|สอง|สาม)\s*ขวด|เพิ่ม\s*ยา(\d+|หนึ่ง|สอง|สาม)?\s*ขวด|(?:ได้รับ|ได้|รับ)\s*(\d+)\s*potions?\b/gi,
    n: (m) => num(m[1] ?? m[2] ?? m[3] ?? '1'),
  },
  {
    type: 'discardPotion',
    re: /ทิ้ง\s*(?:ยา(?:รักษา)?|potions?)\s*(\d+)\s*ขวด|ทิ้ง\s*(\d+)\s*potions?/gi,
    n: (m) => num(m[1] ?? m[2]),
  },
  {
    type: 'damage',
    re: /(?:ได้รับ|ต้องรับ|รับ)\s*ความเสียหาย\s*(\d+)\s*(?:หน่วย|แต้ม)/gi,
    n: (m) => num(m[1]),
  },
  {
    type: 'heal',
    re: /ฟื้นฟู\s*(?:พลังชีวิต\s*)?(\d+)\s*(?:หน่วย|แต้ม|health|พลังชีวิต)?/gi,
    n: (m) => num(m[1]),
  },
  {
    type: 'shuffleTimeCard',
    re: /สับ(?:การ์ด|ไพ่)?\s*(.+?)\s*(?:\((?:.*?)\)\s*)?(?:กลับ)?\s*(?:ลงใน|ลงยัง|เข้าใน|เข้าไปยัง|เข้าไปใน|เข้า)\s*(?:กอง|สำรับ)?(?:การ์ด)?\s*(?:time\s*card|time\s*deck|การ์ดเวลา)/gi,
    card: (m) => m[1].trim(),
  },
  {
    type: 'drawTimeCardAside',
    re: /จั่ว\s*time\s*cards?\s*(\d+)\s*ใบ\s*และ\s*วาง(?:แยก)?ไว้ข้าง(?:กอง)?/gi,
    n: (m) => num(m[1]),
  },
  {
    type: 'healFull',
    re: /(?:รักษาเต็มที่|ฟื้นคืนเต็มที่)/gi,
  },
  {
    type: 'startHunting',
    re: /เริ่มต้น\s*hunting\s*phase/gi,
  },
  {
    type: 'checkScoutfly',
    re: /ตรวจสอบ\s*scoutfly\s*level/gi,
  },
]

// รันหลัง RULES — หา resource จากข้อความที่ยังไม่ถูกจับ (ชื่อ resource เป็นอังกฤษทั้งหมด)
const RESOURCE_RULES = [
  { re: /(?:ได้รับ|ได้|รับ)\s*(\d+)\s*([A-Za-z][A-Za-z' -]*[A-Za-z])/gi, n: 1, name: 2 },
  { re: /([A-Za-z][A-Za-z' -]*[A-Za-z])\s*(?:คนละ\s*)?(\d+)\s*(?:ชิ้น|อัน|เส้น|ก้อน|ใบ)/gi, n: 2, name: 1 },
  { re: /(?:และ|,)\s*(\d+)\s*([A-Za-z][A-Za-z' -]*[A-Za-z])/gi, n: 1, name: 2 },
]

// คำที่มี effect rule ของตัวเองแล้ว — กันไม่ให้ถูกจับซ้ำเป็น resource
const NOT_RESOURCE = /^(track\s*tokens?|time\s*cards?|potions?|health|scoutfly|hunting\s*phase|palico)$/i

// resource ที่ไม่ระบุจำนวน — ใช้เป็น fallback เท่านั้น
const BARE_RESOURCE_RE = /(?:ได้รับ|ได้|รับ)\s+([A-Za-z][A-Za-z' -]*[A-Za-z])/gi

const cleanName = (s) =>
  s
    .replace(/\b(และ|หรือ|ลงในกลุ่ม|คนละ)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()

// จับ effect จากข้อความบรรทัดเดียว — ใช้ทั้งกับข้อความหลักและแต่ละแถวของตารางทอยเต๋า
const parseSimple = (text) => {
  const effects = []
  const covered = []

  for (const rule of RULES) {
    rule.re.lastIndex = 0
    let m
    while ((m = rule.re.exec(text))) {
      const e = { type: rule.type }
      if (rule.n) {
        const v = rule.n(m)
        if (v == null || Number.isNaN(v)) continue
        e.n = v
      }
      if (rule.card) {
        const raw = rule.card(m).replace(/^(the)\s+/i, '').replace(/\s+card$/i, '')
        const hit = TIMECARD_LOOKUP.get(norm(raw))
        if (hit) {
          e.card = hit.name
          e.time_card_id = hit.time_card_id
        } else {
          e.card = raw
          unknownCards.add(raw)
        }
      }
      effects.push(e)
      covered.push([m.index, m.index + m[0].length])
    }
  }

  // mask ส่วนที่จับแล้วออก แล้วค่อยหา resource จากที่เหลือ
  const masked = text.split('')
  for (const [s, e] of covered) for (let i = s; i < e; i++) masked[i] = ' '
  const rest = masked.join('')

  const seen = new Set()
  for (const rule of RESOURCE_RULES) {
    rule.re.lastIndex = 0
    let m
    while ((m = rule.re.exec(rest))) {
      const name = cleanName(m[rule.name])
      const n = num(m[rule.n])
      if (!name || name.length < 3 || n == null || Number.isNaN(n)) continue
      if (NOT_RESOURCE.test(name)) continue
      const key = `${norm(name)}|${n}`
      if (seen.has(key)) continue
      seen.add(key)

      const hit = RESOURCE_LOOKUP.get(norm(name))
      if (hit) {
        effects.push({ type: 'gainResource', n, name: hit.name, type_id: hit.type_id, item_id: hit.item_id })
      } else {
        effects.push({ type: 'gainResource', n, name })
        unknownResources.add(name)
      }
      covered.push([m.index, m.index + m[0].length])
    }
  }

  // "ได้ Quality Bone" — ไม่ระบุจำนวน นับเป็น 1
  // รับเฉพาะชื่อที่มีจริงในข้อมูล ไม่งั้นจะกินคำอังกฤษอื่นในประโยค
  if (!effects.some((e) => e.type === 'gainResource')) {
    BARE_RESOURCE_RE.lastIndex = 0
    let m
    while ((m = BARE_RESOURCE_RE.exec(rest))) {
      const hit = RESOURCE_LOOKUP.get(norm(cleanName(m[1])))
      if (!hit) continue
      if (effects.some((e) => e.type === 'gainResource' && e.name === hit.name)) continue
      effects.push({ type: 'gainResource', n: 1, name: hit.name, type_id: hit.type_id, item_id: hit.item_id })
      covered.push([m.index, m.index + m[0].length])
    }
  }

  return { effects, covered }
}

// ตารางทอยเต๋า: แยกแถว "1-2 …" ออกมา parse ทีละแถว ที่เหลือเป็น effect ปกติรอบตาราง
const parseDiceTable = (text) => {
  const lines = text.split('\n')
  const rows = []
  const restLines = []

  for (const line of lines) {
    const m = line.match(DICE_ROW_RE)
    if (m) rows.push({ min: Number(m[1]), max: Number(m[2]), text: m[3].trim() })
    else restLines.push(line)
  }

  if (rows.length < 2) return null

  const rest = restLines.join('\n')
  if (!DICE_HINT_RE.test(rest)) return null

  // แถวที่มีทางเลือก/เงื่อนไขในตัวเอง = ทำอัตโนมัติไม่ได้ ทิ้งทั้งตาราง
  if (rows.some((r) => BLOCKERS.some((re) => re.test(r.text)))) return null

  const table = rows.map((r) => {
    const { effects } = parseSimple(r.text)
    return { min: r.min, max: r.max, text: r.text, effects }
  })

  const scope = DICE_ONCE_RE.test(rest) ? 'once' : DICE_EACH_RE.test(rest) ? 'each' : 'once'
  return { dice: { type: 'diceRoll', scope, table }, rest }
}

const parse = (text) => {
  if (!text?.trim()) return { effects: [], covered: [], blocked: false }

  const diceTable = parseDiceTable(text)

  // ข้อความรอบตารางเท่านั้นที่ต้องเช็ค blocker — "หากทอยได้ 1-2" ในแถวไม่ใช่เงื่อนไข
  const scanText = diceTable ? diceTable.rest : text
  const monsterDmg = DICE_MONSTER_DMG_RE.exec(text)

  if (monsterDmg) {
    return {
      effects: [{ type: 'diceMonsterDamage', monster: monsterDmg[1].trim() }],
      covered: [[0, text.length]],
      blocked: false,
    }
  }

  const blocked = BLOCKERS.some((re) => re.test(scanText))

  const { effects, covered } = parseSimple(diceTable ? diceTable.rest : text)

  if (diceTable) {
    effects.push(diceTable.dice)
    // ทั้งข้อความถือว่าอธิบายครบแล้ว — ตารางกินพื้นที่ส่วนใหญ่อยู่แล้ว
    covered.push([0, text.length])
  } else if (DICE_HINT_RE.test(text)) {
    // สั่งทอยแต่ไม่มีตารางผล — ผลไปอยู่ที่ปุ่ม choice แทน
    // ยังเก็บ effect รอบ ๆ (ทิ้งการ์ด/ดาเมจ) ไว้ ไม่ทิ้งทั้งก้อนเหมือนเดิม
    effects.push({ type: 'diceRollManual' })
    DICE_PHRASE_RE.lastIndex = 0
    let dm
    while ((dm = DICE_PHRASE_RE.exec(text))) covered.push([dm.index, dm.index + dm[0].length])
  }

  return { effects, covered, blocked }
}

// คำเชื่อม/สรรพนามที่ไม่ใช่ effect — ไม่นับตอนวัด coverage
const FILLER =
  /นักล่าทุกคน|ผู้ล่าทุกคน|แต่ละนักล่า|นักล่าแต่ละคน|นักล่า|ผู้เล่น|ทุกคน|กลุ่ม|จะได้รับ|ได้รับและ|ได้รับ|ต้องรับ|รับ|เพิ่ม|หลังจาก|หลักจาก|จากนั้น|เมื่อ|ครบ|แล้ว|และ|หรือ|จาก|ลงใน|ลง|ใน|ที่|เป็น|ให้|ไป|มา|ของ|ด้วย|ทั้งหมด|หน่วย|แต้ม|ใบ|อัน|ชิ้น|เส้น|ก้อน|ขวด|เพื่อ|ตาม|นี้|นั้น/g

// สัดส่วนตัวอักษรที่ rule จับได้ (ไม่นับช่องว่าง/เครื่องหมาย/คำเชื่อม)
const coverageRatio = (text, covered) => {
  const marks = new Array(text.length).fill(false)
  for (const [s, e] of covered) for (let i = s; i < e; i++) marks[i] = true

  FILLER.lastIndex = 0
  let f
  while ((f = FILLER.exec(text))) {
    for (let i = f.index; i < f.index + f[0].length; i++) marks[i] = true
  }

  let total = 0
  let hit = 0
  for (let i = 0; i < text.length; i++) {
    if (/[\s.,ๆ]/.test(text[i])) continue
    total++
    if (marks[i]) hit++
  }
  return total ? hit / total : 0
}

const stats = { dialogs: 0, actions: 0, withText: 0, full: 0, partial: 0, none: 0, blocked: 0 }
const byType = {}
const unmatched = []
const partials = []
const autos = []

for (const file of BOOKS) {
  const path = resolve(root, file)
  const book = JSON.parse(readFileSync(path, 'utf8'))

  for (const monster of Object.values(book)) {
    for (const d of monster.quest_dialogs ?? []) {
      const targets = [
        { obj: d, kind: 'dialog', id: d.dialog_id },
        ...(d.actions ?? []).map((a) => ({ obj: a, kind: 'action', id: `${d.dialog_id}.${a.action_id}` })),
      ]

      for (const t of targets) {
        if (t.kind === 'dialog') stats.dialogs++
        else stats.actions++

        const text = t.obj.consequences
        if (!text?.trim()) continue
        stats.withText++

        const { effects, covered, blocked } = parse(text)
        effects.forEach((e) => (byType[e.type] = (byType[e.type] ?? 0) + 1))

        const ratio = coverageRatio(text, covered)

        if (blocked || !effects.length) {
          if (blocked) stats.blocked++
          else stats.none++
          unmatched.push({ id: t.id, text })
          if (WRITE) delete t.obj.effects
          continue
        }

        if (ratio >= 0.85) {
          stats.full++
          autos.push({ id: t.id, text, effects })
          if (WRITE) t.obj.effects = effects
        } else {
          stats.partial++
          partials.push({ id: t.id, text, effects, ratio })
          if (WRITE) delete t.obj.effects
        }
      }
    }
  }

  if (WRITE) writeFileSync(path, JSON.stringify(book, null, 2) + '\n', 'utf8')
}

const pct = (n) => `${((n / stats.withText) * 100).toFixed(1)}%`

console.log(`\n─── COVERAGE ───`)
console.log(`dialogs ${stats.dialogs} | actions ${stats.actions} | with consequences ${stats.withText}\n`)
console.log(`  auto  (ratio ≥85%)   ${String(stats.full).padStart(3)}  ${pct(stats.full)}`)
console.log(`  partial (parsed, low) ${String(stats.partial).padStart(3)}  ${pct(stats.partial)}`)
console.log(`  blocked (หรือ/ถ้า/ทอย) ${String(stats.blocked).padStart(3)}  ${pct(stats.blocked)}`)
console.log(`  no match             ${String(stats.none).padStart(3)}  ${pct(stats.none)}`)

console.log(`\n─── EFFECTS FOUND ───`)
Object.entries(byType)
  .sort((a, b) => b[1] - a[1])
  .forEach(([k, v]) => console.log(`  ${k.padEnd(20)} ${v}`))

if (process.argv.includes('--partials')) {
  console.log(`\n─── PARTIAL (${partials.length}) ───`)
  partials.slice(0, 40).forEach((p) =>
    console.log(`  [${(p.ratio * 100).toFixed(0)}%] ${p.text.slice(0, 100)}\n        → ${JSON.stringify(p.effects)}`),
  )
}

if (unknownResources.size || unknownCards.size) {
  console.log(`\n─── ⚠ ไม่พบในข้อมูลอ้างอิง ───`)
  if (unknownResources.size) console.log(`  resource: ${[...unknownResources].join(', ')}`)
  if (unknownCards.size) console.log(`  time card: ${[...unknownCards].join(', ')}`)
} else {
  console.log(`\n✓ resource / time card ทุกตัวตรงกับข้อมูลในโปรเจค`)
}

if (process.argv.includes('--auto')) {
  const uniq = [...new Map(autos.map((a) => [a.text, a])).values()]
  console.log(`\n─── AUTO — unique ${uniq.length} of ${autos.length} ───`)
  uniq.forEach((a) => {
    const s = a.effects
      .map((e) => `${e.type}${e.n != null ? `:${e.n}` : ''}${e.name ? `(${e.name})` : ''}${e.card ? `(${e.card})` : ''}`)
      .join(' + ')
    console.log(`  ${a.text.replace(/\n/g, ' ⏎ ').slice(0, 95)}\n    → ${s}`)
  })
}

if (process.argv.includes('--unmatched')) {
  console.log(`\n─── UNMATCHED (${unmatched.length}) ───`)
  unmatched.slice(0, 60).forEach((u) => console.log(`  • ${u.text.replace(/\n/g, ' ⏎ ').slice(0, 110)}`))
}

if (WRITE) console.log(`\n✅ wrote effects into ${BOOKS.length} book files\n`)
else console.log(`\n(dry run — ใช้ --write เพื่อเขียนลงไฟล์, --partials / --unmatched เพื่อดูรายละเอียด)\n`)
