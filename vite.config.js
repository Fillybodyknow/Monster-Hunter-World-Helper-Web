import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import vueDevTools from 'vite-plugin-vue-devtools'
import { execSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'

// ตราประทับ build — ใช้ตอบให้ได้ว่าเครื่องผู้ใช้รัน build ไหน
// บั๊กที่โผล่ "ตอน deploy" ถ้าไม่รู้ว่าเขาค้างอยู่ build เก่าหรือใหม่ จะวิเคราะห์ไม่ได้เลย
const git = (cmd, fallback) => {
  try { return execSync(cmd).toString().trim() } catch { return fallback }
}
const gitSha = git('git rev-parse --short HEAD', 'unknown')

// เลขเวอร์ชัน = major . จำนวนมอนสเตอร์ในแอป . จำนวน commit
// - major จาก package.json — อยากขยับรุ่นใหญ่ก็แก้ที่นั่นที่เดียว (เลขที่เหลือใน package.json ไม่ถูกใช้)
// - เลขกลางขึ้นเองเมื่อเพิ่มมอนสเตอร์ใหม่ ถ้าวันหนึ่งลบมอนออก เลขกลางจะลดลง — ตั้งใจ ไม่ใช่บั๊ก
// - เลขท้ายขึ้นเองทุก commit ไม่ต้องมีใครจำไปแก้
const readJson = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8'))
const pkg = readJson('./package.json')
const [major] = pkg.version.split('.')

// นับจากเล่มเควสต์ที่ผู้เล่นเลือกได้ — ชุดเดียวกับ BOOKS ใน src/composables/useMonsterData.js
// vite.config.js import โค้ดแอป (alias @) ไม่ได้ จึงอ่านไฟล์ข้อมูลตรง ๆ
// Elder Dragon แยกไฟล์ละตัว: src/assets/elden_dragon/*_book.json (ไฟล์ละ 1 ตัว ไม่ใช่ array)
const monsterCount = (() => {
  const ids = new Set()
  const add = (m) => { if (m?.monster_id != null) ids.add(m.monster_id) }
  readJson('./src/assets/files/ancient-quest-book.json').forEach(add)
  readJson('./src/assets/files/wildspire_book.json').forEach(add)
  for (const f of readdirSync(new URL('./src/assets/elden_dragon/', import.meta.url))) {
    if (f.endsWith('_book.json')) add(readJson(`./src/assets/elden_dragon/${f}`))
  }
  return ids.size
})()
// CI ที่ checkout แบบตื้นจะเห็นแค่ commit เดียว เลขท้ายจะเป็น 1 ทุก build โดยไม่มีใครรู้ตัว
// deploy.yml ตั้ง fetch-depth: 0 ไว้แล้ว — ตรงนี้กันไว้เผื่อใครไปแก้ workflow ทีหลัง
const isShallow = git('git rev-parse --is-shallow-repository', 'false') === 'true'
if (isShallow) console.warn('[version] repo เป็น shallow clone — เลข commit ไม่ถูกต้อง (ตั้ง fetch-depth: 0)')
const commitCount = git('git rev-list --count HEAD', '0')
const appVersion = `${major}.${monsterCount}.${commitCount}${isShallow ? '-shallow' : ''}`

// ประวัติอัปเดตฝั่งผู้เล่น — ส่งไปกับ version.json ให้แบนเนอร์ของ build เก่าแสดงได้ว่าอัปเดตอะไร
// (build เก่าไม่มีรายการใหม่อยู่ในตัว) ส่งแค่ช่วงล่าสุด ไม่ให้ไฟล์ที่แอปดึงทุก 10 นาทีโตไปเรื่อย ๆ
const changelog = readJson('./src/assets/files/changelog.json').slice(0, 10)

// ปล่อย version.json ไว้คู่กับ build — แอปที่เปิดค้างไว้ดึงไฟล์นี้มาเทียบว่ายังเป็น build ล่าสุดไหม
// (services/versionCheck.js) ต้องเป็นก้อนเดียวกับที่ฝังใน __APP_BUILD__ ไม่งั้น sha/at ไม่ตรงกันแล้วเตือนผิด
const emitVersionJson = (build) => ({
  name: 'emit-version-json',
  apply: 'build',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ ...build, changelog }) })
  },
})

// https://vite.dev/config/
export default defineConfig(({ command }) => {
  const appBuild = {
    // เครื่อง dev นับ commit บน branch ตัวเอง ได้เลขคนละชุดกับ production — ติด -dev ไว้กันเทียบผิด
    version: command === 'serve' ? `${appVersion}-dev` : appVersion,
    sha: gitSha,
    at: new Date().toISOString(),
  }

  return {
    base: '/Monster-Hunter-World-Helper-Web/',
    plugins: [
      vue(),
      vueJsx(),
      vueDevTools(),
      emitVersionJson(appBuild),
    ],
    define: {
      __APP_BUILD__: JSON.stringify(appBuild),
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      },
    },
  }
})
