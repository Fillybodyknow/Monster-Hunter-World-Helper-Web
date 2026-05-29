import { createRouter, createWebHashHistory } from 'vue-router'
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
router.beforeEach((to) => {
  if (to.meta.requiresHunter && !localStorage.getItem('hunterId')) {
    return '/'
  }
})

export default router