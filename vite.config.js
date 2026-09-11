import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import vueDevTools from 'vite-plugin-vue-devtools'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

// ตราประทับ build — ใช้ตอบให้ได้ว่าเครื่องผู้ใช้รัน build ไหน
// บั๊กที่โผล่ "ตอน deploy" ถ้าไม่รู้ว่าเขาค้างอยู่ build เก่าหรือใหม่ จะวิเคราะห์ไม่ได้เลย
const git = (cmd, fallback) => {
  try { return execSync(cmd).toString().trim() } catch { return fallback }
}
const gitSha = git('git rev-parse --short HEAD', 'unknown')

// เลขเวอร์ชัน = major.minor จาก package.json + จำนวน commit เป็นเลขท้าย
// ขึ้นเองทุกครั้งที่มี commit ใหม่ ไม่ต้องมีใครจำไปแก้ — อยากขยับรุ่นใหญ่ก็แก้แค่ package.json
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
const [major, minor] = pkg.version.split('.')
// CI ที่ checkout แบบตื้นจะเห็นแค่ commit เดียว เลขท้ายจะเป็น 1 ทุก build โดยไม่มีใครรู้ตัว
// deploy.yml ตั้ง fetch-depth: 0 ไว้แล้ว — ตรงนี้กันไว้เผื่อใครไปแก้ workflow ทีหลัง
const isShallow = git('git rev-parse --is-shallow-repository', 'false') === 'true'
if (isShallow) console.warn('[version] repo เป็น shallow clone — เลข commit ไม่ถูกต้อง (ตั้ง fetch-depth: 0)')
const commitCount = git('git rev-list --count HEAD', '0')
const appVersion = `${major}.${minor}.${commitCount}${isShallow ? '-shallow' : ''}`

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  base: '/Monster-Hunter-World-Helper-Web/',
  plugins: [
    vue(),
    vueJsx(),
    vueDevTools(),
  ],
  define: {
    __APP_BUILD__: JSON.stringify({
      // เครื่อง dev นับ commit บน branch ตัวเอง ได้เลขคนละชุดกับ production — ติด -dev ไว้กันเทียบผิด
      version: command === 'serve' ? `${appVersion}-dev` : appVersion,
      sha: gitSha,
      at: new Date().toISOString(),
    }),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
}))
