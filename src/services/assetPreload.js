import manifest from '@/assets/files/asset-manifest.json'

const url = (src) => `${import.meta.env.BASE_URL}${src}`

const CONCURRENCY = 8
// กันหน้าโหลดค้างถาวรตอนเน็ตหลุดกลางคัน — ครบเวลาแล้วปล่อยเข้าแอปเลย
// รูปที่ยังไม่มาจะถูกโหลดตอนใช้จริงเหมือนเดิม ไม่ได้พังอะไร
const CORE_TIMEOUT = 20000

const _done = new Set()

const _fetchOne = (src) =>
  new Promise((resolve) => {
    if (_done.has(src)) return resolve()
    const img = new Image()
    // โหลดไม่ขึ้นก็ผ่านไป — ห้ามให้รูปเดียวหยุดทั้งคิว
    img.onload = img.onerror = () => {
      _done.add(src)
      resolve()
    }
    img.src = url(src)
  })

// entries = [[src, bytes], ...] — คิดความคืบหน้าจากขนาดไฟล์ ไม่ใช่จำนวนไฟล์
// ไฟล์ในแอปต่างกัน 4KB ถึง 600KB ถ้านับเป็นใบแถบจะกระตุกเป็นช่วง ๆ
const _runQueue = (entries, onProgress) => {
  const total = entries.reduce((n, [, size]) => n + size, 0) || 1
  let loaded = 0
  let cursor = 0

  const next = async () => {
    while (cursor < entries.length) {
      const [src, size] = entries[cursor++]
      await _fetchOne(src)
      loaded += size
      onProgress?.(loaded / total)
    }
  }

  return Promise.all(Array.from({ length: Math.min(CONCURRENCY, entries.length) }, next))
}

export const preloadCore = (onProgress) =>
  Promise.race([
    _runQueue(manifest.core, onProgress),
    new Promise((resolve) => setTimeout(resolve, CORE_TIMEOUT)),
  ])

export const preloadDeferred = () => {
  const run = () => _runQueue(manifest.deferred)
  if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 5000 })
  else setTimeout(run, 3000)
}

// ใช้กับรูปที่รู้ตอน runtime เท่านั้น (การ์ด behavior ของมอนที่เจอ) — ไม่รู้ขนาดไฟล์ นับเป็นใบพอ
export const preloadImages = (srcs) =>
  _runQueue([].concat(srcs).filter(Boolean).map((s) => [s, 1]))
