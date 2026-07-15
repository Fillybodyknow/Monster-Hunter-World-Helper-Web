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

// Track Firebase connection state
onValue(ref(db, '.info/connected'), (snap) => {
  isFirebaseConnected.value = snap.val() === true
})

// Anonymous auth — Security Rules require auth != null, so every room read/write
// must wait for this to resolve before touching `db`. Callable more than once:
// if sign-in previously failed (e.g. Anonymous provider not enabled yet), each
// call retries instead of hanging on an already-rejected promise forever.
const AUTH_TIMEOUT_MS = 8000

export const authReady = () => {
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

// Warm up sign-in immediately at app boot so it's likely already done
// by the time the user opens the Co-op flow.
authReady().catch(() => {})
