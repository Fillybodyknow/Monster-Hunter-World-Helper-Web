// ทัวร์สอนใช้งานแบบ spotlight — สถานะกลางที่ทุกหน้าใช้ร่วมกัน
// หน้าไหนเพิ่งขึ้นจอให้เรียก requestTour(id) ทัวร์จะเริ่มเองถ้ายังไม่เคยดู
// ตัววาดบนจออยู่ใน TourOverlay.vue (วางไว้ใน App.vue ครั้งเดียว)
import { ref } from 'vue'
import { TOURS } from '@/tours/tours'

const SEEN_KEY = 'tourSeen'
const ENABLED_KEY = 'tourEnabled'

const _load = (key, fallback) => {
  try {
    const v = JSON.parse(localStorage.getItem(key))
    return v ?? fallback
  } catch {
    return fallback
  }
}
const _save = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // localStorage เต็ม/ถูกปิด — ทัวร์จะขึ้นซ้ำครั้งหน้า ไม่ใช่เรื่องใหญ่ ห้ามทำแอปพัง
  }
}

export const tourSeen = ref(_load(SEEN_KEY, {}))
export const tourEnabled = ref(_load(ENABLED_KEY, true) !== false)

// { id, ...TOURS[id] } | null
export const activeTour = ref(null)
export const stepIndex = ref(0)

const _queue = []
let _ready = false
let _pumpTimer = null

// รอสักครู่ก่อนเริ่ม — ให้หน้าที่เพิ่งเปลี่ยนเล่นแอนิเมชันเข้าจบ (phase-in 0.3 วินาที)
// และให้หลายหน้าที่ขอพร้อมกันเข้าคิวครบก่อน จะได้เลือกตามลำดับความสำคัญได้ถูก
const START_DELAY_MS = 450

const _schedule = (delay = START_DELAY_MS) => {
  clearTimeout(_pumpTimer)
  _pumpTimer = setTimeout(_pump, delay)
}

const _pump = () => {
  if (!_ready || activeTour.value || !_queue.length) return
  _queue.sort((a, b) => (TOURS[a]?.priority ?? 5) - (TOURS[b]?.priority ?? 5))
  const id = _queue.shift()
  if (!TOURS[id] || tourSeen.value[id]) return _schedule(0)
  stepIndex.value = 0
  activeTour.value = { id, ...TOURS[id] }
}

// App.vue เรียกตอน BootLoader ปิด — ระหว่างโหลดปุ่มที่จะชี้ยังไม่อยู่บนจอ
export const setTourReady = (ready) => {
  _ready = ready
  if (ready) _schedule()
}

export const requestTour = (id) => {
  if (!TOURS[id] || !tourEnabled.value || tourSeen.value[id]) return
  if (activeTour.value?.id === id || _queue.includes(id)) return
  _queue.push(id)
  _schedule()
}

// ออกจากหน้าไปก่อนทัวร์ได้เริ่ม — ไม่ต้องขึ้นแล้ว
export const cancelTourRequest = (id) => {
  const i = _queue.indexOf(id)
  if (i >= 0) _queue.splice(i, 1)
}

export const markTourSeen = (id) => {
  tourSeen.value = { ...tourSeen.value, [id]: true }
  _save(SEEN_KEY, tourSeen.value)
}

// seen = false เมื่อทัวร์ถูกขัดก่อนผู้เล่นได้ดูจริง (ปุ่มหายไปเพราะเปลี่ยนหน้า) ครั้งหน้าจะขึ้นใหม่
export const endTour = ({ seen = true } = {}) => {
  const tour = activeTour.value
  if (!tour) return
  if (seen) markTourSeen(tour.id)
  activeTour.value = null
  stepIndex.value = 0
  _schedule()
}

// จากหน้า Setting — เริ่มทันทีแม้เคยดูแล้ว หรือแม้ปิดทัวร์อัตโนมัติไว้
export const startTour = (id) => {
  if (!TOURS[id]) return
  cancelTourRequest(id)
  stepIndex.value = 0
  activeTour.value = { id, ...TOURS[id] }
}

export const resetTours = () => {
  tourSeen.value = {}
  _save(SEEN_KEY, {})
}

export const setTourEnabled = (enabled) => {
  tourEnabled.value = enabled
  _save(ENABLED_KEY, enabled)
  if (!enabled) {
    _queue.length = 0
    endTour({ seen: false })
  }
}
