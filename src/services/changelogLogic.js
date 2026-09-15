// ตัดสินว่าจะแสดงรายการอัปเดตอะไร — ฟังก์ชันล้วน ไม่แตะ localStorage / Vue
// แยกไว้ให้ทดสอบได้โดยไม่ต้องเปิดเบราว์เซอร์
// changelog เรียงใหม่สุดก่อนเสมอ

export const MAX_ENTRIES = 5

// หน้าต่าง "มีอะไรใหม่" ตอนเปิดแอป
//   seenId           — id ล่าสุดที่เครื่องนี้เคยกดรับทราบ (null = ไม่เคย)
//   isReturningPlayer — เคยมี Hunter ในเครื่องนี้แล้ว
// คืน { entries: รายการที่ต้องแสดง, markSeen: id ที่ควรจดทันทีโดยไม่ต้องแสดง }
export const pickWhatsNew = (changelog, seenId, isReturningPlayer) => {
  const list = Array.isArray(changelog) ? changelog.filter((e) => e?.id) : []
  const newest = list[0]?.id ?? null
  if (!newest || seenId === newest) return { entries: [], markSeen: null }

  if (!seenId) {
    // ผู้เล่นใหม่ไม่ต้องอ่านประวัติอัปเดตของแอปที่เพิ่งเปิดครั้งแรก — จดไว้เงียบ ๆ
    if (!isReturningPlayer) return { entries: [], markSeen: newest }
    // ผู้เล่นเดิมที่เพิ่งได้ระบบนี้ครั้งแรก — แสดงแค่อัปเดตล่าสุด ไม่ย้อนทั้งประวัติ
    return { entries: list.slice(0, 1), markSeen: null }
  }

  const idx = list.findIndex((e) => e.id === seenId)
  // id ที่เคยเห็นไม่อยู่ในรายการแล้ว (ถูกตัดออก) — แสดงแค่อันล่าสุด
  if (idx === -1) return { entries: list.slice(0, 1), markSeen: null }
  return { entries: list.slice(0, Math.min(idx, MAX_ENTRIES)), markSeen: null }
}

// แบนเนอร์ของ build เก่า: รายการจาก build ใหม่ที่ build นี้ยังไม่มี
export const entriesNotIn = (remoteChangelog, localIds, max = MAX_ENTRIES) => {
  if (!Array.isArray(remoteChangelog)) return []
  const known = new Set(localIds)
  return remoteChangelog.filter((e) => e?.id && !known.has(e.id)).slice(0, max)
}
