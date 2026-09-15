// บันทึกไฟล์ออกจากแอป (ตอนนี้ใช้กับ Export Hunter)
//
// เบราว์เซอร์ที่ฝังอยู่ในแอปอื่น (แอป Google, Facebook, LINE, Instagram) ไม่รองรับ <a download> กับไฟล์ที่สร้างในหน้าเว็บ
// กดแล้วเงียบ ไม่มี error ให้จับ — เจอจริงบน iPad ในแอป Google (v1.0.160) ส่วน Safari เครื่องเดียวกันใช้ได้
// คนที่มาจากโพสต์ในกลุ่ม Facebook / LINE จะเปิดแอปในเบราว์เซอร์แบบนี้เป็นส่วนใหญ่
// ในเบราว์เซอร์แบบนี้จึงใช้เมนูแชร์ของระบบแทน (บน iOS มี "บันทึกไปยังไฟล์")

// token ใน User Agent ของเบราว์เซอร์ในแอป — "Line/" ต้องมี / ไม่งั้นไปชนคำอื่น
const IN_APP_UA = /\bGSA\/|\bFBAN\/|\bFBAV\/|\bFB_IAB\/|\bInstagram\b|\bLine\/|\bKAKAOTALK\b|\bMicroMessenger\//i

export const isInAppBrowser = () =>
  typeof navigator !== 'undefined' && IN_APP_UA.test(navigator.userAgent ?? '')

// Chrome รับแชร์เฉพาะไฟล์บางชนิด (application/json ไม่อยู่ในรายการ) — ลอง text/plain เป็นทางสำรอง
// นามสกุล .json ยังอยู่ในชื่อไฟล์ ตอน Import เปิดได้เหมือนเดิม
const shareableFile = (filename, text) => {
  if (typeof navigator === 'undefined' || !navigator.canShare) return null
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

const download = (filename, text) => {
  const blob = new Blob([text], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// คืนผลให้หน้าจอตัดสินใจต่อ:
//   'downloaded' — เบราว์เซอร์ปกติ สั่งดาวน์โหลดแล้ว
//   'shared'     — เปิดเมนูแชร์แล้ว ผู้ใช้เลือกปลายทางเสร็จ
//   'cancelled'  — ผู้ใช้ปิดเมนูแชร์เอง ไม่ต้องแจ้งอะไร
//   'blocked'    — เบราว์เซอร์ในแอปที่แชร์ไฟล์ไม่ได้ ต้องบอกผู้ใช้ทางอื่น
// ต้องเรียกจาก handler ของการกดโดยตรง และห้ามมี await ก่อนถึง navigator.share
// ไม่งั้นเบราว์เซอร์จะถือว่าไม่ได้มาจากการกดแล้วบล็อกเมนูแชร์
export const saveJsonFile = async (filename, text) => {
  if (!isInAppBrowser()) {
    download(filename, text)
    return 'downloaded'
  }
  const file = shareableFile(filename, text)
  if (!file) return 'blocked'
  try {
    await navigator.share({ files: [file], title: filename })
    return 'shared'
  } catch (err) {
    if (err?.name === 'AbortError') return 'cancelled'
    return 'blocked'
  }
}
