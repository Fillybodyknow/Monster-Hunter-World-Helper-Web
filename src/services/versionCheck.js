// เช็คว่าเครื่องนี้รัน build เดียวกับที่ deploy อยู่บน production หรือเปล่า
// แอปไม่มี service worker — build เก่าค้างได้จากแท็บที่เปิดทิ้งไว้ข้ามวัน หรือ index.html ที่ browser cache ไว้
// ผู้เล่นที่ค้าง build เก่าจะเจอบั๊กที่แก้ไปแล้ว หรือเล่น Co-op กับเพื่อนที่รันโค้ดคนละชุด
// ทุก build ปล่อย version.json ไว้คู่กัน (vite.config.js) — ดึงมาเทียบ sha กับ build ที่รันอยู่
import { ref } from 'vue'
import { APP_BUILD } from './appVersion'

const CHECK_EVERY_MS = 10 * 60 * 1000
// สลับแอปไปมาถี่ ๆ บนมือถือ ไม่ต้องยิงทุกครั้งที่กลับมา
const MIN_GAP_MS = 60 * 1000

// build บน production ที่ใหม่กว่าเครื่องนี้ — null = ตรงกันแล้ว หรือยังเช็คไม่ได้
export const newerBuild = ref(null)
// กด "ภายหลัง" แล้วซ่อนไว้เฉพาะ build นั้น — deploy ใหม่อีกรอบจะเด้งขึ้นมาอีก
// ไม่เก็บลง localStorage ตั้งใจให้เปิดแอปครั้งหน้าเตือนอีก
export const dismissedSha = ref(null)

let lastCheckAt = 0
let timer = null
let started = false

export const checkForUpdate = async () => {
  lastCheckAt = Date.now()
  try {
    // query กันไม่ให้ CDN/browser ส่งไฟล์เก่ากลับมา — no-store อย่างเดียวคุมได้แค่ฝั่ง browser
    const res = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, {
      cache: 'no-store',
    })
    if (!res.ok) return
    const remote = await res.json()
    if (!remote?.sha || remote.sha === APP_BUILD.sha) {
      newerBuild.value = null
      return
    }
    // หลัง deploy ใหม่ ๆ CDN ของ GitHub Pages อาจยังส่ง version.json ตัวก่อนหน้ามาสักพัก
    // ถ้าที่ได้มาเก่ากว่าที่รันอยู่ ห้ามบอกผู้ใช้ว่า "มีเวอร์ชันใหม่"
    if (remote.at && APP_BUILD.at && Date.parse(remote.at) <= Date.parse(APP_BUILD.at)) return
    newerBuild.value = remote
  } catch {
    // ออฟไลน์ / เน็ตหลุด / JSON เสีย — ไม่ใช่เรื่องที่ต้องรบกวนผู้ใช้
  }
}

const onVisible = () => {
  if (document.visibilityState !== 'visible') return
  if (Date.now() - lastCheckAt < MIN_GAP_MS) return
  checkForUpdate()
}

export const startVersionCheck = () => {
  // dev server ไม่มี version.json และ sha ก็เป็นของ branch ตัวเอง เทียบกับ production ไม่ได้
  // ทดสอบได้ด้วย npm run build แล้ว npm run preview
  if (import.meta.env.DEV || started) return
  started = true
  checkForUpdate()
  // แท็บที่ซ่อนอยู่ไม่ต้องเช็ค — กลับมาเมื่อไรก็เช็คตอนนั้นผ่าน visibilitychange
  timer = setInterval(() => {
    if (document.visibilityState === 'visible') checkForUpdate()
  }, CHECK_EVERY_MS)
  document.addEventListener('visibilitychange', onVisible)
}

export const stopVersionCheck = () => {
  clearInterval(timer)
  timer = null
  document.removeEventListener('visibilitychange', onVisible)
  started = false
}

// reload ธรรมดาอาจได้ index.html จาก cache (GitHub Pages cache ไว้ราว 10 นาที) แล้ววนกลับมาเจอ build เก่า
// ใส่ query ใหม่ทุกครั้งให้ browser มองเป็น URL ใหม่ — router เป็น hash เส้นทางในแอปจึงไม่เปลี่ยน
export const reloadToLatest = () => {
  location.replace(`${location.pathname}?v=${Date.now()}${location.hash}`)
}
