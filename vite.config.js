import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import vueDevTools from 'vite-plugin-vue-devtools'
import { execSync } from 'node:child_process'

// ตราประทับ build — ใช้ตอบให้ได้ว่าเครื่องผู้ใช้รัน build ไหน
// บั๊กที่โผล่ "ตอน deploy" ถ้าไม่รู้ว่าเขาค้างอยู่ build เก่าหรือใหม่ จะวิเคราะห์ไม่ได้เลย
const gitSha = (() => {
  try { return execSync('git rev-parse --short HEAD').toString().trim() } catch { return 'unknown' }
})()

// https://vite.dev/config/
export default defineConfig({
  base: '/Monster-Hunter-World-Helper-Web/',
  plugins: [
    vue(),
    vueJsx(),
    vueDevTools(),
  ],
  define: {
    __APP_BUILD__: JSON.stringify({ sha: gitSha, at: new Date().toISOString() }),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
})
