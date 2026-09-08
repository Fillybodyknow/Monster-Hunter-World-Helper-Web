const fs = require('fs')
const path = require('path')
const sharp = require('sharp')

const ROOT = 'public/assets/img'
const DRY = process.argv.includes('--dry')
const QUALITY = 82

const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (/\.(png|jpg|jpeg)$/i.test(e.name)) out.push(p)
  }
  return out
}

const files = walk(ROOT)
console.log('ไฟล์ที่จะแปลง: ' + files.length)

let before = 0
let after = 0
let failed = []
let done = 0

const run = async () => {
  for (const f of files) {
    const target = f.replace(/\.(png|jpg|jpeg)$/i, '.webp')
    const origSize = fs.statSync(f).size
    before += origSize

    try {
      const buf = await sharp(f).webp({ quality: QUALITY }).toBuffer()
      after += buf.length
      if (!DRY) {
        fs.writeFileSync(target, buf)
        fs.unlinkSync(f)
      }
    } catch (e) {
      failed.push(f + ' — ' + e.message)
      after += origSize
    }

    if (++done % 100 === 0) console.log('  ' + done + '/' + files.length)
  }

  const mb = (n) => (n / 1048576).toFixed(1) + ' MB'
  console.log('')
  console.log('ก่อน : ' + mb(before))
  console.log('หลัง : ' + mb(after))
  console.log('ลดลง : ' + (100 - (after / before) * 100).toFixed(1) + '%')
  if (failed.length) {
    console.log('')
    console.log('แปลงไม่สำเร็จ ' + failed.length + ' ไฟล์:')
    failed.forEach((f) => console.log('  ' + f))
  }
  if (DRY) console.log('\n(dry run — ยังไม่ได้เขียนไฟล์)')
}

run()
