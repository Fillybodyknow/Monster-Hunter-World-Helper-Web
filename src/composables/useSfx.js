import { watch, onUnmounted } from 'vue'
import { soundEnabled, soundVolume } from '@/stores/settings'

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
    const audio = new Audio(`${import.meta.env.BASE_URL}${src}`)
    audio.volume = Math.min(1, soundVolume.value * gain)
    audio.play().catch(() => {})
    playing.set(audio, gain)
    if (key) exclusive.set(key, audio)
    audio.addEventListener('ended', () => {
      playing.delete(audio)
      if (key && exclusive.get(key) === audio) exclusive.delete(key)
    }, { once: true })
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
