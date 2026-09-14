// คัดลอกข้อความลง clipboard
// Safari บล็อก clipboard API ถ้าหน้าไม่ใช่ https หรือไม่ได้มาจาก gesture โดยตรง
// ถอยไปใช้วิธีเก่าที่ใช้ได้ทุกที่ ดีกว่าปล่อยให้กดแล้วเงียบ
export const copyText = async (text) => {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    try { document.execCommand('copy') } catch { /* คัดลอกไม่ได้จริง ๆ — ยังลากเลือกข้อความเองได้ */ }
    document.body.removeChild(ta)
  }
}
