const fs = require('fs')
const path = require('path')

const IMG = 'public/assets/img'
const OUT = 'src/assets/files/asset-manifest.json'

// behavior_deck โหลดตอนรู้แล้วว่าเจอมอนตัวไหน (Quest.vue) — 9MB ถ้าเอามาโหลดหน้าแรกจะรอนาน
// maps ใช้เฉพาะตอนล่า รอโหลดพื้นหลังหลังแอปเปิดแล้วทัน
const DEFER = new Set(['maps'])
const SKIP = new Set(['behavior_deck'])

const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (/\.(webp|png|jpg|jpeg|gif|svg)$/i.test(e.name)) out.push(p)
  }
  return out
}

const entry = (p) => [p.split(path.sep).join('/').replace(/^public\//, ''), fs.statSync(p).size]
const top = (p) => p.split(path.sep).join('/').slice(IMG.length + 1).split('/')[0]

const core = []
const deferred = []
for (const f of walk(IMG)) {
  const g = top(f)
  if (SKIP.has(g)) continue
  ;(DEFER.has(g) ? deferred : core).push(entry(f))
}

const sum = (list) => list.reduce((n, [, s]) => n + s, 0)
fs.writeFileSync(OUT, JSON.stringify({ core, deferred }) + '\n')

const mb = (n) => (n / 1048576).toFixed(2) + ' MB'
console.log(`core     ${String(core.length).padStart(4)} ไฟล์  ${mb(sum(core))}`)
console.log(`deferred ${String(deferred.length).padStart(4)} ไฟล์  ${mb(sum(deferred))}`)
console.log('เขียนแล้ว: ' + OUT)
