import { watch, onUnmounted } from 'vue'
import { soundEnabled, soundVolume } from '@/stores/settings'

const url = (src) => `${import.meta.env.BASE_URL}${src}`

// ── คลัง Audio ที่ใช้ซ้ำ (แชร์กันทุก component) ──
// เดิมสร้าง new Audio() ใหม่ทุกครั้งที่เล่น ทำให้เบราว์เซอร์ต้องไปหาไฟล์ + ถอดรหัส MP3 ใหม่ทุกครั้ง
// บนเครื่อง dev แทบไม่รู้สึก แต่ผ่านเน็ตจริง (GitHub Pages) หน่วงชัดเจนโดยเฉพาะครั้งแรกของแต่ละเสียง
const _pools = new Map() // src -> Audio[]
const POOL_SIZE = 3      // เผื่อเสียงเดียวกันดังซ้อนกัน เช่น ค้อน 3 ที / เพื่อนโหวตพร้อมกัน

const _makeAudio = (src) => {
  const audio = new Audio(url(src))
  audio.preload = 'auto'
  return audio
}

// คืนตัวที่ว่างอยู่ ถ้าไม่มีก็สร้างเพิ่มจนเต็ม pool แล้วค่อยแย่งตัวที่เก่าสุดมาใช้
const _acquire = (src) => {
  let pool = _pools.get(src)
  if (!pool) { pool = []; _pools.set(src, pool) }

  const free = pool.find((a) => a.paused || a.ended)
  if (free) return free

  if (pool.length < POOL_SIZE) {
    const audio = _makeAudio(src)
    pool.push(audio)
    return audio
  }
  const oldest = pool.shift()
  pool.push(oldest)
  return oldest
}

// โหลดไฟล์ไว้ล่วงหน้า ไม่ให้ครั้งแรกที่ใช้ต้องรอดาวน์โหลด
export const preloadSfx = (srcs) => {
  for (const src of [].concat(srcs)) {
    if (_pools.has(src)) continue
    const audio = _makeAudio(src)
    _pools.set(src, [audio])
    try { audio.load() } catch { /* เบราว์เซอร์บางตัวหวงตอนยังไม่มี user gesture — ปล่อยผ่าน */ }
  }
}

// โฟลเดอร์ที่เก็บหลาย take (1.mp3 .. n.mp3)
export const sfxTakes = (dir, count) =>
  Array.from({ length: count }, (_, i) => `${dir}/${i + 1}.mp3`)

// รายการ SFX ทั้งหมดที่แอปใช้ — ต้องตรงกับที่เรียกจริงในโค้ด (มีสคริปต์ตรวจใน repo)
// ไม่รวมเพลง เพราะไฟล์ใหญ่ ควร preload ตามจังหวะที่จะได้ใช้แทนที่จะโหลดหมดตั้งแต่เปิดแอป
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

// เสียง one-shot (ไม่ loop) ที่คล้อยตาม Setting เสียงเสมอ — ปิดเสียงกลางคันต้องเงียบทันที
// เลื่อน volume กลางคันต้องขยับตาม และต้องไม่มีเสียงค้างเล่นหลังออกจากหน้า
//
// แยกจาก BGM ใน Quest.vue เพราะคนละพฤติกรรมกัน (นั่น loop + ผูกกับ phase, อันนี้เล่นจบแล้วจบเลย)
export const useSfx = () => {
  const playing = new Map() // Audio -> gain (ระดับสัมพัทธ์ของเสียงนั้น เทียบกับ soundVolume)
  const exclusive = new Map() // key -> Audio ที่ดังอยู่ของกลุ่มนั้น

  const _stop = (audio) => {
    audio.pause()
    playing.delete(audio)
  }

  const stopAll = () => {
    playing.forEach((_gain, audio) => audio.pause())
    playing.clear()
    exclusive.clear()
  }

  // gain  ถ่วงเสียงที่ดังกว่าเพื่อนให้เบาลง โดยไม่ต้องไปยุ่งกับ soundVolume รวม
  // key   จับกลุ่มเสียงที่ห้ามดังซ้อนกันเอง เล่นตัวใหม่ = ตัดตัวเก่าทิ้งทันที
  //       จำเป็นกับเสียง UI ที่กดรัวได้ (เมนู) แต่ห้ามใช้กับเสียงค้อนที่ตั้งใจให้ดังซ้อน 3 ที
  const play = (src, { gain = 1, key = null } = {}) => {
    if (!soundEnabled.value) return null
    if (key && exclusive.has(key)) _stop(exclusive.get(key))

    const audio = _acquire(src)
    audio.volume = Math.min(1, soundVolume.value * gain)
    // ใช้ซ้ำจากตัวที่เคยเล่นจบแล้ว ต้องกรอกลับเองไม่งั้นจะเล่นต่อจากจุดเดิม
    try { audio.currentTime = 0 } catch { /* ยังโหลดไม่เสร็จ กรอไม่ได้ — ไม่เป็นไร */ }
    audio.play().catch(() => {})

    playing.set(audio, gain)
    if (key) exclusive.set(key, audio)
    // assign ไม่ใช่ addEventListener — Audio ถูกใช้ซ้ำ ถ้า add ทุกครั้ง listener จะพอกขึ้นเรื่อย ๆ
    audio.onended = () => {
      playing.delete(audio)
      if (key && exclusive.get(key) === audio) exclusive.delete(key)
    }
    return audio
  }

  // สุ่มเลือก 1 ไฟล์จาก <dir>/1.mp3 .. <dir>/<count>.mp3 — เสียงเดิมซ้ำ ๆ ฟังแล้วเป็นหุ่นยนต์
  const playRandom = (dir, count, opts) =>
    play(`${dir}/${1 + Math.floor(Math.random() * count)}.mp3`, opts)

  watch(soundEnabled, (enabled) => { if (!enabled) stopAll() })

  watch(soundVolume, (v) => {
    playing.forEach((gain, audio) => { audio.volume = Math.min(1, v * gain) })
  })

  onUnmounted(stopAll)

  return { play, playRandom, stopAll }
}
