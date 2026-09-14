import { initializeApp } from 'firebase/app'
import { getDatabase, ref, onValue } from 'firebase/database'
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth'
import { ref as vRef } from 'vue'

export const isFirebaseConnected = vRef(true)

const firebaseConfig = {
  apiKey: 'AIzaSyAwDjWUYl-_NGLX07jkv3B9StKk0ng720M',
  authDomain: 'mhw-coop.firebaseapp.com',
  databaseURL: 'https://mhw-coop-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'mhw-coop',
  storageBucket: 'mhw-coop.firebasestorage.app',
  messagingSenderId: '453220635356',
  appId: '1:453220635356:web:09fed996d07ab3347cda19',
}

const app = initializeApp(firebaseConfig)
export const db = getDatabase(app)
export const auth = getAuth(app)

// ── การเชื่อมต่อ Realtime Database ──────────────────────────
// แพ็กเกจ Spark รับได้ 100 connection พร้อมกัน ทุกแท็บที่แตะ db นับ 1
// เดิมเปิดตั้งแต่โหลดไฟล์นี้ — router import Home.vue ตั้งแต่เริ่มแอป คนที่เล่นคนเดียวเปิดแอปค้างไว้จึงกินโควตาคนเล่น Co-op ไปด้วย
// ตอนนี้เปิดเมื่อจำเป็น: การอ้าง ref(db, ...) ครั้งแรกคือจุดที่ SDK เปิด socket — ห้ามแตะ db ที่ระดับไฟล์อีก
// isFirebaseConnected ตั้งต้นเป็น true ("ยังไม่รู้ว่าหลุด") — UI เตือนหลุดทุกจุดเช็ค inRoom ควบคู่อยู่แล้ว
let realtimeStarted = false
const startRealtime = () => {
  if (realtimeStarted) return
  realtimeStarted = true
  onValue(ref(db, '.info/connected'), (snap) => {
    isFirebaseConnected.value = snap.val() === true
  })
}

// Anonymous auth — Security Rules require auth != null, so every room read/write
// must wait for this to resolve before touching `db`. Callable more than once:
// if sign-in previously failed (e.g. Anonymous provider not enabled yet), each
// call retries instead of hanging on an already-rejected promise forever.
const AUTH_TIMEOUT_MS = 8000

const waitForSignIn = () => {
  if (auth.currentUser) return Promise.resolve(auth.currentUser)

  signInAnonymously(auth).catch((err) => {
    console.error('Firebase anonymous sign-in failed:', err)
  })

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsub()
      reject(new Error('เชื่อมต่อ Firebase ไม่สำเร็จ (ยืนยันตัวตนไม่ได้) กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่'))
    }, AUTH_TIMEOUT_MS)
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        clearTimeout(timer)
        unsub()
        resolve(user)
      }
    })
  })
}

// ทุกทางเข้า Co-op (สร้างห้อง / join / บอร์ด Lobby) เรียกตัวนี้ก่อนแตะ db — จึงเป็นจุดเปิดการเชื่อมต่อไปด้วย
// ฟังก์ชันใน roomService ที่ไม่ได้เรียกตัวนี้ล้วนต้องมีห้องก่อน ซึ่งได้มาจาก create/join อีกที
export const authReady = () => {
  startRealtime()
  return waitForSignIn()
}

// Warm up sign-in at app boot so the Co-op flow opens fast.
// Auth ไม่ใช่ Realtime Database — sign-in ล่วงหน้าไม่กิน connection
waitForSignIn().catch(() => {})

// เคยอยู่ในห้องแล้วหลุดหรือรีโหลด — ต่อทันทีเหมือนเดิม ให้การกลับเข้าห้องอัตโนมัติทำงานได้
try {
  if (localStorage.getItem('lastRoomCode')) startRealtime()
} catch {
  // localStorage ถูกปิด — รอผู้เล่นเปิด Co-op ค่อยต่อ
}
