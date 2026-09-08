// เติม {token} ลงในข้อความ special_rule / part_break_rule ของ monster_info.json
// รันครั้งเดียว แล้วรันไทม์อ่านจาก JSON ตรง ๆ (แนวเดียวกับ parse-dialog-effects.mjs)
// แผนที่ token -> รูป อยู่ใน src/views/components/RuleText.vue
//
//   node scripts/annotate-rule-symbols.mjs           ดูผลอย่างเดียว
//   node scripts/annotate-rule-symbols.mjs --write   เขียนลงไฟล์
import fs from 'fs'

const FILE = 'src/assets/files/monster_info.json'
const WRITE = process.argv.includes('--write')

const EL = { Fire: 'fire', Water: 'water', Thunder: 'thunder', Ice: 'ice', Dragon: 'dragon' }
const ST = { Poison: 'poison', Paralysis: 'paralysis', Sleep: 'sleep', Stun: 'stun', Blastblight: 'blastblight' }
const PART = { Head: 'head', Body: 'body', Tail: 'tail', Wing: 'wing', Claw: 'claw', Leg: 'leg' }

const kw = (map) => Object.keys(map).join('|')

// ลำดับสำคัญ — คู่ "ระยะโจมตี+ค่าหลบหลีก" ต้องมาก่อนกฎเดี่ยว ไม่งั้นโดนตัดครึ่ง
const RULES = [
  [new RegExp(`ธาตุ (${kw(EL)})`, 'g'), (m, w) => `${m}{${EL[w]}}`],
  [new RegExp(`สถานะ (${kw(ST)})`, 'g'), (m, w) => `${m}{${ST[w]}}`],
  [/^Poison(?= จะทำให้)/g, 'Poison{poison}'],
  [new RegExp('ส่วน [(]?(' + kw(PART) + ')[)]?', 'g'), (m, w) => `${m}{${PART[w]}}`],
  [new RegExp(`ผ่าน (${kw(PART)})`, 'g'), (m, w) => `${m}{${PART[w]}}`],

  [/Break Token/g, 'Break Token{break}'],
  [/Track Token/g, 'Track Token{track}'],
  [/Hunter ที่อยู่ไกลที่สุด/g, 'Hunter ที่อยู่ไกลที่สุด{furthest}'],
  [/Hunter ที่อยู่ไกล้ที่สุด/g, 'Hunter ที่อยู่ไกล้ที่สุด{closest}'],
  [/Hunter เล่นเพิ่มได้อีก \+?\d+ คน/g, (m) => `${m}{hturn}`],
  [/เล่น Attack Card ได้เพิ่มอีก \+?\d+ ใบ/g, (m) => `${m}{hcard}`],

  [/ระยะการโจมตี กับ ค่าหลบหลีก/g, 'ระยะการโจมตี กับ ค่าหลบหลีก{agility}'],
  [/ระยะโจมตีกับค่าหลบหลีก/g, 'ระยะโจมตีกับค่าหลบหลีก{agility}'],
  [/ระยะโจมตีและค่าหลบหลีก/g, 'ระยะโจมตีและค่าหลบหลีก{agility}'],
  [/\(ระยะโจมตี\) และ \(ค่าหลบหลีก\)/g, '(ระยะโจมตี) และ (ค่าหลบหลีก){agility}'],
  [/\(ระยะโจมตี\), \(ค่าหลบหลีก\)/g, '(ระยะโจมตี), (ค่าหลบหลีก){agility}'],

  // เกราะ — ต้องมาก่อนกฎ atk เพราะ (เกราะ) +1 กับ (ค่าความเสียหาย) +1 อยู่ประโยคเดียวกัน
  [/[(]เกราะ[)]/g, '(เกราะ){armor}'],
  [/เกราะ(?= [+-][0-9])/g, 'เกราะ{armor}'],

  [/\(ค่าความเสียหาย\)/g, '(ค่าความเสียหาย){atk}'],
  [/\(ความเสียหาย\)/g, '(ความเสียหาย){atk}'],
  [/ความเสียหาย(?=ของการโจมตีนั้นจะ(เพิ่มขึ้น|ลดลง))/g, 'ความเสียหาย{atk}'],
  [/ความเสียหาย(?=ของการโจมตีจะ(เพิ่มขึ้น|ลดลง))/g, 'ความเสียหาย{atk}'],
  [/ความเสียหาย(?=ของการ์ดนั้นจะ(เพิ่มขึ้น|ลดลง))/g, 'ความเสียหาย{atk}'],
  [/สร้างความเสียหาย(?=ผ่าน)/g, 'สร้างความเสียหาย{atk}'],
  [/สร้างความเสียหาย(?=เพิ่มขึ้น)/g, 'สร้างความเสียหาย{atk}'],
  [/สร้างความเสียหาย (?=เพิ่มเติม)/g, 'สร้างความเสียหาย{atk} '],
  [/ทำความเสียหาย(?=เพิ่มขึ้น|ลดลง)/g, 'ทำความเสียหาย{atk}'],
  [/จะความเสียหาย(?=เพิ่มขึ้น)/g, 'จะความเสียหาย{atk}'],

  [/ระยะการโจมตี(?=ของการ์ดนั้นจะลดลง)/g, 'ระยะการโจมตี{range}'],
  [/ระยะโจมตี(?=ของการ์ดนั้นลดลง)/g, 'ระยะโจมตี{range}'],
  [/\(ระยะโจมตี\)(?!\{)/g, '(ระยะโจมตี){range}'],

  [/\(การเคลื่อนที่\)/g, '(การเคลื่อนที่){move}'],
  [/การเคลื่อนที่(?=ของการ์ดนั้นจะ)/g, 'การเคลื่อนที่{move}'],

  [/ค่าหลบหลีก(?!\{|\))/g, 'ค่าหลบหลีก{agility}'],
]

const annotate = (text) => {
  let out = text
  for (const [re, rep] of RULES) out = out.replace(re, rep)
  // กันซ้อนกรณีกฎสองข้อจับช่วงเดียวกัน
  return out.replace(/(\{[a-z_]+\})\1+/g, '$1')
}

const raw = fs.readFileSync(FILE, 'utf8')
const data = JSON.parse(raw)
const monsters = Array.isArray(data) ? data : (data.monsters ?? Object.values(data)[0])

const changes = new Map()
const collect = (t) => {
  if (!t) return
  const a = annotate(t)
  if (a !== t) changes.set(t, a)
}

for (const m of monsters) {
  for (const df of m.difficulty ?? []) {
    collect(df.special_rule?.description)
    for (const k of Object.keys(df.monster_parts ?? {})) collect(df.monster_parts[k].part_break_rule)
  }
}

let i = 0
for (const [, after] of changes) console.log(`${String(++i).padStart(2)}  ${after}\n`)

const tokens = {}
for (const [, after] of changes) for (const [, t] of after.matchAll(/\{([a-z_]+)\}/g)) tokens[t] = (tokens[t] ?? 0) + 1
console.log('ข้อความที่เปลี่ยน:', changes.size)
console.log('token ที่ใช้:', Object.entries(tokens).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t}×${n}`).join(', '))

if (!WRITE) {
  console.log('\n(ยังไม่เขียน — ใส่ --write ถ้าจะเขียนจริง)')
} else {
  // แทนที่บนข้อความดิบ ไม่ re-stringify ทั้งไฟล์ — JSON.stringify จะจัดรูปแบบใหม่ทั้ง 5 หมื่นบรรทัด
  let out = raw
  // เรียงยาวไปสั้น — กฎ level 2 หลายตัวเป็นส่วนหัวของกฎ level 3/4
  // ถ้าแทนตัวสั้นก่อน ตัวยาวจะโดนแก้ไปครึ่งหนึ่งแล้วหาคีย์ตัวเองไม่เจอ ท่อนท้ายเลยไม่ได้ token
  const ordered = [...changes].sort((a, b) => b[0].length - a[0].length)
  for (const [before, after] of ordered) {
    const a = JSON.stringify(before).slice(1, -1)
    const b = JSON.stringify(after).slice(1, -1)
    out = out.split(a).join(b)
  }
  JSON.parse(out)
  fs.writeFileSync(FILE, out)
  console.log('\nเขียนแล้ว:', FILE)
}
