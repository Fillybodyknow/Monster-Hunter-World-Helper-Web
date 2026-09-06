import { watch, onUnmounted } from 'vue'
import { soundEnabled, soundVolume } from '@/stores/settings'

const url = (src) => `${import.meta.env.BASE_URL}${src}`

// ── SFX ใช้ Web Audio ไม่ใช่ HTMLAudioElement ──
// iOS Safari บล็อก HTMLAudioElement ที่ไม่ได้ถูกสั่งเล่นจาก user gesture โดยตรง
// SFX ของแอปครึ่งหนึ่งยิงมาจาก watcher / setTimeout / rAF (เสียงเมนู, ฝีเท้า, เต๋าลง,
// คำราม, สับการ์ด, เพื่อนโหวต) ซึ่งหลุดจาก gesture ทั้งหมด → บน iPad เงียบสนิท
// Web Audio ปลดล็อกครั้งเดียวตอนแตะจอครั้งแรก จากนั้นเล่นได้อิสระไม่ว่าเรียกมาจากไหน
//
// เพลงยังใช้ HTMLAudio ต่อไป (ใน Quest.vue) เพราะมันสตรีมทีละส่วน
// ถ้าเอาเข้ามาถอดรหัสเก็บใน RAM แบบนี้จะกินหลายร้อย MB
let _ctx = null
const _buffers = new Map() // src -> AudioBuffer (ถอดรหัสแล้ว พร้อมเล่นทันที)
const _loading = new Map() // src -> Promise กันโหลดซ้ำซ้อนตอนเรียกพร้อมกัน

const _getCtx = () => {
  if (_ctx) return _ctx
  const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)
  if (!AC) return null
  _ctx = new AC()
  return _ctx
}

// context เกิดมาในสถานะ suspended บนมือถือ ต้องปลุกด้วย gesture ก่อนถึงจะมีเสียงออก
const _unlock = () => {
  const ctx = _getCtx()
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {})
}

if (typeof window !== 'undefined') {
  for (const ev of ['pointerdown', 'touchstart', 'keydown']) {
    window.addEventListener(ev, _unlock, { passive: true })
  }
  // iOS พัก context เองตอนสลับแอป/ล็อกจอ กลับมาต้องปลุกใหม่ ไม่งั้นเงียบยาว
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') _unlock()
  })
}

const _load = (src) => {
  if (_buffers.has(src)) return Promise.resolve(_buffers.get(src))
  if (_loading.has(src)) return _loading.get(src)
  const ctx = _getCtx()
  if (!ctx) return Promise.resolve(null)

  const task = fetch(url(src))
    .then((r) => r.arrayBuffer())
    .then((buf) => ctx.decodeAudioData(buf))
    .then((decoded) => {
      _buffers.set(src, decoded)
      _loading.delete(src)
      return decoded
    })
    .catch(() => {
      // โหลด/ถอดรหัสไม่สำเร็จ — ปล่อยเงียบดีกว่าทำหน้าแตก แล้วปล่อยให้ลองใหม่ครั้งหน้า
      _loading.delete(src)
      return null
    })

  _loading.set(src, task)
  return task
}

// โหลด + ถอดรหัสไว้ล่วงหน้า ครั้งแรกที่ใช้จะได้เล่นทันทีไม่ต้องรอ
// _load ใช้กับ SFX สั้น ๆ เท่านั้น — ถอดรหัสเก็บทั้งไฟล์ใน RAM
// เพลงยาว 4-5 นาทีถ้าหลุดมาทางนี้จะกิน RAM ระดับร้อย MB จนระบบเสียงบน iPad พัง
// (เคยเกิดมาแล้วจริง — Quest.vue เรียก preloadSfx กับไฟล์เพลงตอนที่ยังเป็น HTMLAudio)
const _isSfxPath = (src) =>
  src.startsWith('assets/sounds/ui/') || src.startsWith('assets/sounds/crafting/')

// อุ่น HTTP cache ให้ไฟล์ยาว ๆ โดยไม่ถอดรหัส — ใช้กับเพลงที่ยังเล่นผ่าน HTMLAudio
export const preloadMedia = (srcs) => {
  for (const src of [].concat(srcs)) {
    const el = new Audio(url(src))
    el.preload = 'auto'
    try { el.load() } catch { /* iOS อาจไม่ยอมโหลดก่อนมี gesture — ไม่เป็นไร */ }
  }
}

export const preloadSfx = (srcs) => {
  for (const src of [].concat(srcs)) {
    if (!_isSfxPath(src)) {
      console.warn('[useSfx] ข้าม', src, '— preloadSfx ใช้ได้เฉพาะ SFX ใช้ preloadMedia สำหรับเพลง')
      continue
    }
    _load(src)
  }
}

// โฟลเดอร์ที่เก็บหลาย take (1.mp3 .. n.mp3)
export const sfxTakes = (dir, count) =>
  Array.from({ length: count }, (_, i) => `${dir}/${i + 1}.mp3`)

// รายการ SFX ทั้งหมดที่แอปใช้ — ต้องตรงกับที่เรียกจริงในโค้ด (มีสคริปต์ตรวจตอน build)
// ไม่รวมเพลง เพราะไฟล์ยาว ถอดรหัสเก็บใน RAM ไม่ไหว
const UI = 'assets/sounds/ui'
const CRAFT = 'assets/sounds/crafting'
export const ALL_SFX = [
  ...sfxTakes(`${UI}/menu_change`, 4),
  ...sfxTakes(`${UI}/action_confirm`, 3),
  ...sfxTakes(`${UI}/item_pickup`, 3),
  ...sfxTakes(`${UI}/item_remove`, 3),
  ...sfxTakes(`${UI}/vote_cast`, 3),
  ...sfxTakes(`${UI}/footstep`, 3),
  ...sfxTakes(`${UI}/card_shuffle`, 3),
  ...sfxTakes(`${UI}/draw_card`, 3),
  ...sfxTakes(`${UI}/monster_roar`, 4),
  `${UI}/action_select.mp3`,
  `${UI}/dice_roll.mp3`,
  `${UI}/dice_land.mp3`,
  `${UI}/token_reveal.mp3`,
  ...sfxTakes(`${CRAFT}/hammer_strike`, 4),
  ...sfxTakes(`${CRAFT}/igniting`, 4),
  ...sfxTakes(`${CRAFT}/quenching`, 4),
]

// เรียกตอนแอปว่าง — โหลดตอนนี้จะได้ไม่ไปแย่งแบนด์วิดท์กับการเรนเดอร์หน้าแรก
export const preloadAllSfx = () => {
  const run = () => preloadSfx(ALL_SFX)
  if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 4000 })
  else setTimeout(run, 2000)
}

// เสียง one-shot ที่คล้อยตาม Setting เสียงเสมอ — ปิดเสียงกลางคันต้องเงียบทันที
// เลื่อน volume กลางคันต้องขยับตาม และต้องไม่มีเสียงค้างเล่นหลังออกจากหน้า
export const useSfx = () => {
  const active = new Set()    // { source, gainNode, gain }
  const exclusive = new Map() // key -> entry ที่ดังอยู่ของกลุ่มนั้น

  const _stop = (entry) => {
    try { entry.source.stop() } catch { /* ยังไม่ได้เริ่มหรือหยุดไปแล้ว */ }
    active.delete(entry)
  }

  const stopAll = () => {
    for (const entry of [...active]) _stop(entry)
    active.clear()
    exclusive.clear()
  }

  // gain  ถ่วงเสียงที่ดังกว่าเพื่อนให้เบาลง โดยไม่ต้องไปยุ่งกับ soundVolume รวม
  // key   จับกลุ่มเสียงที่ห้ามดังซ้อนกันเอง เล่นตัวใหม่ = ตัดตัวเก่าทิ้งทันที
  //       จำเป็นกับเสียง UI ที่กดรัวได้ (เมนู) แต่ห้ามใช้กับเสียงค้อนที่ตั้งใจให้ดังซ้อน 3 ที
  const play = (src, { gain = 1, key = null } = {}) => {
    if (!soundEnabled.value) return
    const ctx = _getCtx()
    if (!ctx) return
    _unlock()

    const start = (buffer) => {
      // กว่าจะโหลดเสร็จผู้ใช้อาจปิดเสียงไปแล้ว
      if (!buffer || !soundEnabled.value) return
      if (key && exclusive.has(key)) _stop(exclusive.get(key))

      const source = ctx.createBufferSource()
      source.buffer = buffer
      const gainNode = ctx.createGain()
      gainNode.gain.value = Math.min(1, soundVolume.value * gain)
      source.connect(gainNode).connect(ctx.destination)

      const entry = { source, gainNode, gain }
      source.onended = () => {
        active.delete(entry)
        if (key && exclusive.get(key) === entry) exclusive.delete(key)
      }
      active.add(entry)
      if (key) exclusive.set(key, entry)
      source.start()
    }

    const cached = _buffers.get(src)
    if (cached) start(cached)     // ปกติจะเข้าทางนี้เพราะ preload ไว้แล้ว
    else _load(src).then(start)   // ตัวที่ยังไม่ได้ preload — ครั้งแรกจะช้าหน่อย
  }

  // สุ่มเลือก 1 ไฟล์จาก <dir>/1.mp3 .. <dir>/<count>.mp3 — เสียงเดิมซ้ำ ๆ ฟังแล้วเป็นหุ่นยนต์
  const playRandom = (dir, count, opts) =>
    play(`${dir}/${1 + Math.floor(Math.random() * count)}.mp3`, opts)

  watch(soundEnabled, (enabled) => { if (!enabled) stopAll() })

  watch(soundVolume, (v) => {
    active.forEach((e) => { e.gainNode.gain.value = Math.min(1, v * e.gain) })
  })

  onUnmounted(stopAll)

  return { play, playRandom, stopAll }
}
