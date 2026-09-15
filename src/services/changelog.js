// ประวัติอัปเดตฝั่งผู้เล่น (src/assets/files/changelog.json)
// เลขเวอร์ชันมาจากจำนวน commit ตอน build จึงรู้ล่วงหน้าไม่ได้ว่ารายการไหนจะได้เลขอะไร
// และ production นับ merge commit เพิ่มอีก — แต่ละรายการจึงใช้ id + วันที่ ไม่ผูกกับเลขเวอร์ชัน
import { ref } from 'vue'
import CHANGELOG from '@/assets/files/changelog.json'
import { pickWhatsNew } from './changelogLogic'

export { CHANGELOG }
export const LATEST_CHANGELOG_ID = CHANGELOG[0]?.id ?? null

const SEEN_KEY = 'changelogSeen'

// รายการที่หน้าต่าง "มีอะไรใหม่" ต้องแสดง — ว่าง = ไม่ต้องเปิด
export const whatsNew = ref([])

const readSeen = () => {
  try {
    return localStorage.getItem(SEEN_KEY)
  } catch {
    return null
  }
}

const writeSeen = (id) => {
  try {
    if (id) localStorage.setItem(SEEN_KEY, id)
  } catch {
    // localStorage ถูกปิด — หน้าต่างจะขึ้นอีกครั้งตอนเปิดแอปครั้งหน้า ไม่ใช่เรื่องใหญ่
  }
}

// ผู้เล่นเดิม = เครื่องนี้มี Hunter อยู่แล้ว
const isReturningPlayer = () => {
  try {
    const hunters = JSON.parse(localStorage.getItem('hunters') ?? '[]')
    return Array.isArray(hunters) && hunters.length > 0
  } catch {
    return false
  }
}

export const checkWhatsNew = () => {
  const { entries, markSeen } = pickWhatsNew(CHANGELOG, readSeen(), isReturningPlayer())
  if (markSeen) writeSeen(markSeen)
  whatsNew.value = entries
}

export const dismissWhatsNew = () => {
  writeSeen(LATEST_CHANGELOG_ID)
  whatsNew.value = []
}
