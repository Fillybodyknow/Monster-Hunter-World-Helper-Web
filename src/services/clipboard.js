// คัดลอกข้อความลง clipboard
// Safari บล็อก clipboard API ถ้าหน้าไม่ใช่ https หรือไม่ได้มาจาก gesture โดยตรง
// ถอยไปใช้วิธีเก่าที่ใช้ได้ทุกที่ ดีกว่าปล่อยให้กดแล้วเงียบ
// คืน true เมื่อคัดลอกสำเร็จ — หน้าจอจะได้ไม่ขึ้น "คัดลอกแล้ว" ทั้งที่คลิปบอร์ดไม่ได้อะไรไป
export const copyText = async (text) => {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    let ok = false
    try { ok = document.execCommand('copy') } catch { ok = false }
    document.body.removeChild(ta)
    return ok
  }
}
