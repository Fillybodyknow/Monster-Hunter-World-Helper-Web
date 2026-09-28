import { ref, computed } from 'vue'

/* ช่องทางประกาศกลางของหน้าล่า — ให้แอนิเมชันที่ "เด้งเอง" เล่นทีละใบ
 *
 * ปัญหาเดิม: ใช้ยา / สวนกลับ / ระบบหัก HP ต่างคนต่างมี timer ของตัวเอง
 * พอเกิดพร้อมกัน (เช่นสวนกลับจบพอดีกับพิษเข้า) การ์ดจะซ้อนกันจนอ่านไม่ทัน
 * และถ้ามีหน้าต่างที่ต้องกด (เลือกรับ/หลบ, ยืนยันใช้ยา, เปิดการ์ด Time Card)
 * ประกาศจะไปทับจนกดไม่ถูก
 *
 * กติกา:
 *   - เล่นทีละใบตามลำดับที่เข้ามา ใบถัดไปเริ่มนับเวลาเมื่อใบก่อนหน้าจบ
 *   - ระหว่างมีหน้าต่างที่ต้องกดค้างอยู่ (blocked) ประกาศจะหยุดรอ ไม่ซ้อนทับ
 *     พอปิดหน้าต่างนั้นแล้วค่อยเล่นต่อจากใบที่ค้างไว้
 *   - คิวยาวเกิน max จะทิ้งใบเก่าสุด กันกรณีเด้งรัวจนต้องนั่งดูเป็นนาที
 */
export const createAnnounceLane = ({ max = 6 } = {}) => {
  const queue = ref([])
  const blocked = ref(false)
  let timer = null
  let seq = 0

  const current = computed(() => (blocked.value ? null : (queue.value[0] ?? null)))
  const pending = computed(() => Math.max(0, queue.value.length - 1))

  const _stop = () => {
    clearTimeout(timer)
    timer = null
  }

  // เริ่มจับเวลาใบแรกในคิว (ถ้ายังไม่ได้เริ่ม) — ใบเดิมที่เคยเริ่มแล้วจะไม่เรียก onStart ซ้ำ
  const _tick = () => {
    _stop()
    const item = queue.value[0]
    if (!item || blocked.value) return
    if (!item.started) {
      item.started = true
      item.onStart?.(item)
    }
    timer = setTimeout(() => {
      queue.value = queue.value.slice(1)
      _tick()
    }, item.ms ?? 2000)
  }

  const push = (item) => {
    const entry = { id: ++seq, ms: 2000, ...item, started: false }
    const next = [...queue.value, entry]
    // ล้นคิว — ทิ้งใบที่ยังไม่ได้เล่นตัวเก่าสุด (ใบแรกกำลังเล่นอยู่ ไม่ทิ้ง)
    while (next.length > max) next.splice(1, 1)
    queue.value = next
    if (queue.value.length === 1) _tick()
    return entry.id
  }

  // ผู้ใช้แตะข้าม — ไปใบถัดไปทันที
  const skip = () => {
    if (!queue.value.length) return
    queue.value = queue.value.slice(1)
    _tick()
  }

  const setBlocked = (value) => {
    const next = !!value
    if (blocked.value === next) return
    blocked.value = next
    if (next) {
      // หยุดรอ และให้ใบที่ค้างเริ่มนับเวลาใหม่ตอนกลับมา จะได้ไม่หายไปตอนที่ไม่มีใครเห็น
      _stop()
      if (queue.value[0]) queue.value[0].started = false
    } else {
      _tick()
    }
  }

  const clear = () => {
    _stop()
    queue.value = []
  }

  return { queue, current, pending, blocked, push, skip, setBlocked, clear }
}
