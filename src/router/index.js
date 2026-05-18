import { createRouter, createWebHistory } from 'vue-router'
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
  history: createWebHistory(),
  routes
})

// 🔥 GUARD
router.beforeEach((to, from, next) => {
  if (to.meta.requiresHunter) {
    const hunterId = localStorage.getItem('hunterId')

    if (!hunterId) {
      return next('/') // เด้งกลับ
    }
  }

  next()
})

export default router