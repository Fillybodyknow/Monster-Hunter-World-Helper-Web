#!/usr/bin/env node
/* สร้างไอคอนแอป (ติดตั้งเป็นแอปจาก Chrome / เพิ่มไปยังหน้าจอโฮมบน iPhone) — `npm run icons`
 *
 * ต้นฉบับคือหน้า Palico (faint_icon.webp) ซึ่งเป็นรูปแนวนอนพื้นโปร่งใส
 * ไอคอนแอปต้องเป็นสี่เหลี่ยมจัตุรัสพื้นทึบ จึงวางหน้า Palico ลงบนพื้นหนังสีน้ำตาลเข้มโทนเดียวกับแอป
 * รันใหม่เมื่อเปลี่ยนรูปต้นฉบับหรือสีพื้น แล้ว commit ไฟล์ใน public/icons ไปด้วย
 */
const path = require('path')
const fs = require('fs')
const sharp = require('sharp')

const ROOT = path.join(__dirname, '..')
const SOURCE = path.join(ROOT, 'public/assets/img/UI/faint_icon.webp')
const OUT = path.join(ROOT, 'public/icons')

// พื้นหนังสีน้ำตาลเข้ม สว่างตรงกลางนิด ๆ ให้หน้า Palico เด่นขึ้นมา
const background = (size) =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <defs><radialGradient id="g" cx="50%" cy="45%" r="70%">
      <stop offset="0%" stop-color="#4a3220"/><stop offset="100%" stop-color="#1c130b"/>
    </radialGradient></defs>
    <rect width="${size}" height="${size}" fill="url(#g)"/>
  </svg>`)

// widthRatio = ความกว้างของหน้า Palico เทียบกับด้านของไอคอน
const ICONS = [
  { file: 'icon-192.png', size: 192, widthRatio: 0.82 },
  { file: 'icon-512.png', size: 512, widthRatio: 0.82 },
  // maskable: Android ตัดเป็นวงกลม/สี่เหลี่ยมมนได้ตามใจ ส่วนที่ปลอดภัยคือวงกลมเส้นผ่านศูนย์กลาง 80% ของด้าน
  // หน้า Palico สูงราว 0.66 เท่าของความกว้าง มุมทั้งสี่ต้องอยู่ในวงนั้น → กว้างได้ไม่เกินราว 0.67 เผื่อไว้ที่ 0.62
  { file: 'icon-maskable-512.png', size: 512, widthRatio: 0.62 },
  // iPhone ตัดมุมมนเองและเติมพื้นดำให้ส่วนที่โปร่งใส จึงต้องมีพื้นทึบเสมอ
  { file: 'apple-touch-icon.png', size: 180, widthRatio: 0.8 },
]

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const meta = await sharp(SOURCE).metadata()
  for (const { file, size, widthRatio } of ICONS) {
    const width = Math.round(size * widthRatio)
    const face = await sharp(SOURCE).resize({ width }).png().toBuffer()
    const { height } = await sharp(face).metadata()
    await sharp(background(size))
      .composite([{ input: face, left: Math.round((size - width) / 2), top: Math.round((size - height) / 2) }])
      .png({ compressionLevel: 9 })
      .toFile(path.join(OUT, file))
    console.log(`${file}  ${size}x${size}  (Palico ${width}x${height})`)
  }
  console.log(`ต้นฉบับ ${meta.width}x${meta.height} → ${path.relative(ROOT, OUT)}`)
})()
