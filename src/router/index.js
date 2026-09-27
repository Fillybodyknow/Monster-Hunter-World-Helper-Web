import { createRouter, createWebHashHistory, START_LOCATION } from 'vue-router'
import Home from '../views/Home.vue'
import Index from '../views/index.vue'

const routes = [
  {
    path: '/',
    name: 'index',
    component: Index
  },
  {
    path: '/home',
    name: 'home',
    component: Home,
    meta: { requiresHunter: true } // 🔥 ใส่ flag
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

// 🔥 GUARD
router.beforeEach((to, from) => {
  if (to.meta.requiresHunter && !localStorage.getItem('hunterId')) {
    return '/'
  }
  /* เปิดแอปใหม่ทั้งที่ยังค้างอยู่ในห้อง Co-op → พากลับเข้าเกมเลย ไม่ต้องเลือกตัวละครซ้ำ
     แอปที่ติดตั้งบนมือถือเริ่มที่ start_url เสมอ (ไม่มี #/home) ปัดแอปทิ้งกลางเควสแล้วเปิดใหม่
     จึงตกมาหน้าเลือกตัวละครทุกครั้ง กว่าจะกดเข้าเกมได้ Firebase ก็ต่อติดไปแล้ว
     หน้าหลักเลยไม่เจอจังหวะ "ต่อใหม่" ที่ใช้พากลับเข้าห้อง — ผู้เล่นค้างนอกห้องทั้งที่ยังมีชื่อในตี้
     ทำเฉพาะตอนเปิดแอปครั้งแรก (from = START_LOCATION) ปุ่มออกจากตัวละครลบ hunterId ก่อนอยู่แล้ว
     จึงยังกลับมาหน้าเลือกตัวละครได้ตามปกติ */
  if (
    to.name === 'index' &&
    from === START_LOCATION &&
    localStorage.getItem('hunterId') &&
    localStorage.getItem('lastRoomCode')
  ) {
    return '/home'
  }
})

export default router