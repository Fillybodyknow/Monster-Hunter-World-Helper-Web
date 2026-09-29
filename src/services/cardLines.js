/* การ์ดที่ต้องเอาออก / ใส่เพิ่มในกองของอาวุธ เก็บเป็นข้อความหลายบรรทัด
   แต่ละบรรทัดเขียนว่า "3 Long Thrust" หรือ "Any 2 Cards"
   แยกเลขนำหน้าออกมาทำเป็นป้ายจำนวน ที่เหลือเป็นชื่อการ์ด — อ่านง่ายกว่าข้อความยาวบรรทัดเดียว
   อยู่ตรงนี้เพราะใช้ทั้งหน้า Crafting (การ์ดอาวุธในต้นไม้คราฟ) และหน้า State (อาวุธที่ถืออยู่)
   ถ้าต่างคนต่างแยกเอง วันหนึ่งข้อมูลเปลี่ยนรูปแบบแล้วจะเพี้ยนคนละทาง */
export const parseCardLine = (text) => {
  const m = String(text).trim().match(/^(\d+)\s+(.+)$/)
  return m ? { count: Number(m[1]), name: m[2] } : { count: null, name: String(text).trim() }
}

export const cardLines = (text) =>
  String(text ?? '')
    .split('\n')
    .map((t) => t.trim())
    .filter(Boolean)
    .map(parseCardLine)
