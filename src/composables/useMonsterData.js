import monsterInfoBase from '@/assets/files/monster_info.json'
import ancientData from '@/assets/files/ancient-quest-book.json'
import wildspireData from '@/assets/files/wildspire_book.json'
import kushalaInfo from '@/assets/elden_dragon/kushala_daora_info.json'
import kushalaBook from '@/assets/elden_dragon/kushala_daora_book.json'

// Elder Dragon แต่ละตัวแยกไฟล์ของตัวเอง (ทั้งข้อมูลมอนและเล่มเควสต์) แทนที่จะยัดรวมในไฟล์เดิม
// รวมที่นี่ที่เดียว — ทุกหน้าที่ต้องหาข้อมูลมอน (Quest, Downtime) จะได้เห็นครบเท่ากัน
// ถ้าต่างคนต่าง import เอง วันหนึ่งเพิ่มมอนตัวใหม่แล้วลืมอีกหน้า จะเปิดเควสต์ได้แต่แลกของไม่ได้
export const MONSTER_INFO = [...monsterInfoBase, kushalaInfo]

// กล่องบนหน้า Quest — ลำดับนี้คือลำดับที่แสดง
export const BOOKS = [
  {
    id: 'ancient',
    name: 'Ancient Forest',
    data: ancientData,
    img: 'assets/img/ancient_forest.webp',
    color: '#2d5a1b',
    accent: '#5aab2e',
  },
  {
    id: 'wildspire',
    name: 'Wildspire Waste',
    data: wildspireData,
    img: 'assets/img/wildspire_waste.webp',
    color: '#7a5a1b',
    accent: '#d4a017',
  },
  {
    id: 'kushala',
    name: 'Kushala Daora',
    data: [kushalaBook],
    img: 'assets/img/kushala_daora_box.webp',
    // ป้ายคาดมุมกล่อง — ตอนนี้มีแค่ Assigned Quest ยังไม่ครบทั้งกล่อง
    badge: 'Demo',
    // เหล็กกล้าเย็นเฉียบ — Kushala คือมังกรเกล็ดเหล็กแห่งพายุหิมะ
    color: '#26323d',
    accent: '#8fb6cc',
  },
]

export const ALL_MONSTERS = BOOKS.flatMap((b) => b.data)

// กล่องที่มอนตัวนี้อยู่ — ใช้ตอนกู้สถานะจากห้อง co-op ที่รู้แค่ monster_id
export const bookOfMonster = (monster) => BOOKS.find((b) => b.data.includes(monster)) ?? BOOKS[0]
