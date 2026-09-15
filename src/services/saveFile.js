// บันทึกไฟล์ออกจากแอป (ตอนนี้ใช้กับ Export Hunter)
//
// เบราว์เซอร์ที่ฝังอยู่ในแอปอื่น (แอป Google, Facebook, LINE, Instagram) ไม่รองรับ <a download> กับไฟล์ที่สร้างในหน้าเว็บ
// กดแล้วเงียบ ไม่มี error ให้จับ — เจอจริงบน iPad ในแอป Google (v1.0.160)
// เมนูแชร์ก็เชื่อผลไม่ได้: Android + Facebook (v1.11.162) มี navigator.share แต่กดแล้วไม่ขึ้นอะไรเลย
// หน้าที่เรียกจึงต้องแสดงทางเลือก "คัดลอก" ไว้ให้เห็นเสมอในเบราว์เซอร์แบบนี้ ส่วนแชร์เป็นแค่ทางเสริม
import { recordError } from './diagnostics'

// token ใน User Agent ของเบราว์เซอร์ในแอป — "Line/" ต้องมี / ไม่งั้นไปชนคำอื่น
const IN_APP_UA = /\bGSA\/|\bFBAN\/|\bFBAV\/|\bFB_IAB\/|\bInstagram\b|\bLine\/|\bKAKAOTALK\b|\bMicroMessenger\//i

export const isInAppBrowser = () =>
  typeof navigator !== 'undefined' && IN_APP_UA.test(navigator.userAgent ?? '')

// ไฟล์ที่เบราว์เซอร์บอกว่าแชร์ได้ — null = แชร์ไม่ได้
// Chrome รับแชร์เฉพาะไฟล์บางชนิด (application/json ไม่อยู่ในรายการ) — ลอง text/plain เป็นทางสำรอง
// นามสกุล .json ยังอยู่ในชื่อไฟล์ ตอน Import เปิดได้เหมือนเดิม
export const shareableFile = (filename, text) => {
  if (typeof navigator === 'undefined' || !navigator.canShare || !navigator.share) return null
  for (const type of ['application/json', 'text/plain']) {
    const file = new File([text], filename, { type })
    try {
      if (navigator.canShare({ files: [file] })) return file
    } catch {
      // บางเบราว์เซอร์โยน error แทนตอบ false
    }
  }
  return null
}

// เบราว์เซอร์ปกติ (Safari, Chrome, คอม) — ดาวน์โหลดตรง
export const downloadJsonFile = (filename, text) => {
  const blob = new Blob([text], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// เปิดเมนูแชร์ของระบบ — คืน 'shared' | 'cancelled' | 'failed'
// ผลที่ได้บอกไม่ได้ว่าเมนูแชร์ขึ้นจริงไหม ห้ามใช้ผลนี้ตัดสินว่าจะซ่อนทางเลือกคัดลอก
// จดผลลง log ของแอปทุกครั้ง (แนบไปกับปุ่มรายงาน) — ดูได้ว่ามือถือแต่ละรุ่นตอบกลับแบบไหนจริง
// ต้องเรียกจากการกดปุ่มโดยตรง และห้ามมี await ก่อนถึง navigator.share ไม่งั้นเบราว์เซอร์บล็อกเมนูแชร์
export const shareJsonFile = async (filename, text) => {
  const file = shareableFile(filename, text)
  if (!file) {
    recordError('export-share', new Error('share unavailable'))
    return 'failed'
  }
  const started = Date.now()
  try {
    await navigator.share({ files: [file], title: filename })
    recordError('export-share', new Error(`resolved after ${Date.now() - started}ms`))
    return 'shared'
  } catch (err) {
    recordError('export-share', new Error(`${err?.name ?? 'Error'} after ${Date.now() - started}ms`))
    return err?.name === 'AbortError' ? 'cancelled' : 'failed'
  }
}
