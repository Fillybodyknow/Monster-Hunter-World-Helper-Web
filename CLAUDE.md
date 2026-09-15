# MHW Board Game Companion — คู่มือสำหรับ Claude

แอปช่วยเล่น Monster Hunter World: The Board Game ภาษาไทย ทำไว้เล่นกับเพื่อนในกลุ่ม
Vue 3 (`<script setup>`) + Vite + Pinia + hash router, Co-op ใช้ Firebase Realtime Database, deploy ขึ้น GitHub Pages

**ตอบผู้ใช้เป็นภาษาไทยเสมอ** รวมถึงข้อความระหว่างทำงาน (commit message เขียนภาษาอังกฤษ)

## Branch

- `dev` — branch ทำงานประจำ commit ลงที่นี่
- `production` — push แล้ว GitHub Actions (`.github/workflows/deploy.yml`) build และขึ้นเว็บจริงทันที
  https://fillybodyknow.github.io/Monster-Hunter-World-Helper-Web/
- push ในชื่อบัญชี GitHub **Fillybodyknow** เท่านั้น
- **ห้าม squash / rebase / amend / force-push บน `dev` หรือ `production`** — เลขเวอร์ชันมาจากจำนวน commit
  ถ้าประวัติถูกเขียนใหม่ เลขที่ผู้เล่นเคยเห็นจะถอยหลังหรือชี้ไปโค้ดคนละชุด

## ขึ้น Dev / Production

ทำเฉพาะเมื่อผู้ใช้สั่งชัดเจน (เช่น "ขึ้นเลย", "Deploy ขึ้น Dev/Production") แค่ "commit ขึ้น dev" = push `dev` อย่างเดียว

1. เช็ค `git status` ว่าไฟล์ที่เปลี่ยนมีแค่ที่ตั้งใจ
   - `src/assets/files/asset-manifest.json` มักเปลี่ยนเพราะ `npm run dev` / `npm run build` เขียนไฟล์ใหม่
     ถ้า JSON เหมือน HEAD (ต่างแค่ line ending) ให้ `git checkout --` คืน อย่า commit ไปด้วย
2. ถ้าผู้เล่นมองเห็นการเปลี่ยนแปลง เพิ่มรายการไว้บนสุดของ `src/assets/files/changelog.json` ใน commit เดียวกัน (ดูหัวข้อ Changelog)
3. `npx vite build --outDir <โฟลเดอร์ชั่วคราว>` ต้องผ่าน
4. commit ข้อความภาษาอังกฤษ ขึ้นต้นด้วยผลลัพธ์ เช่น `fix: ...` / `feat: ...` แล้วอธิบายเหตุผลใน body
5. `git fetch origin` — ถ้า `dev` หรือ `production` ตามหลัง origin ให้หยุดและบอกผู้ใช้
6. ขึ้น:
   ```sh
   git push origin dev
   git checkout production
   git merge --ff-only origin/production
   git merge --no-ff dev -m "Merge branch 'dev' into production"
   git push origin production
   git checkout dev
   ```
   ใช้ `set -eo pipefail` และห้ามต่อ `| tail` หลัง `git push` (บัง error)
7. ตรวจหลังขึ้น:
   - รอ workflow "Deploy to GitHub Pages" ของ sha นั้นให้ผ่าน (`gh run watch <id> --exit-status`)
   - เปิด `<เว็บจริง>/version.json` ต้องได้ `sha` ตรงกับ `production` และ `changelog[0].id` เป็นรายการล่าสุด
8. รายงานผู้ใช้เป็นภาษาไทย: เวอร์ชันที่ขึ้น, สิ่งที่ตรวจแล้ว, สิ่งที่ยังไม่ได้ตรวจ

## เลขเวอร์ชัน

คำนวณตอน build ใน `vite.config.js`: **`major.จำนวนMonster.จำนวนCommit`** (เช่น `1.11.164`)
- `major` จาก `package.json`
- จำนวน Monster = `monster_id` ที่ไม่ซ้ำใน `ancient-quest-book.json`, `wildspire_book.json`, `src/assets/elden_dragon/*_book.json`
- จำนวน Commit = `git rev-list --count HEAD` — ต้อง clone แบบเต็ม (ห้าม `--depth`) ไม่งั้นได้ `-shallow`
- dev server ต่อท้าย `-dev` (เทียบกับเลข production ไม่ได้)
- ทุก build ออก `version.json` (`{version, sha, at, changelog}`) แอปที่เปิดค้างไว้จะเช็คแล้วขึ้นแบนเนอร์ให้โหลดใหม่
- ตามหาบั๊กจากรายงาน: ใช้ `build.sha` ในข้อมูลระบบ ไม่ใช่เลขเวอร์ชัน

## Changelog

`src/assets/files/changelog.json` — ข้อความสำหรับผู้เล่น ภาษาไทย ใหม่สุดอยู่บนสุด แสดงในหน้าต่าง "มีอะไรใหม่" และแบนเนอร์อัปเดต

```json
{ "id": "YYYY-MM-DD-short-slug", "date": "YYYY-MM-DD", "title": "...",
  "sections": [{ "type": "new|fix|improve", "items": ["..."] }] }
```

- `id` ใหม่ทุกครั้ง ห้ามซ้ำ ห้ามแก้ id เดิม (ใช้จำว่าผู้เล่นเห็นรายการไหนแล้ว)
- ห้ามใส่เลขเวอร์ชันในข้อความ (ยังไม่รู้เลขจนกว่าจะ build)
- เขียนแบบผู้เล่นอ่านเข้าใจ ไม่ใช้ศัพท์โค้ด
- เปลี่ยนแค่ของนักพัฒนา (เอกสาร, test, config) ไม่ต้องเพิ่ม

## ข้อควรระวังในโค้ด

- **Firebase (แผน Spark: 100 connection พร้อมกัน, ดาวน์โหลด 10 GB/เดือน)** — Realtime Database เชื่อมต่อเฉพาะตอนเข้า Co-op
  (`authReady()` ใน `src/services/firebase.js`) หรือมี `lastRoomCode` ค้างอยู่
  ห้ามเรียก `db` / `ref(db, …)` ระดับ module ไม่งั้นทุกคนที่เปิดแอปจะกิน connection
  `database.rules.json` ไม่ deploy อัตโนมัติ ต้องไปกดใน Firebase Console
- **Export ในเบราว์เซอร์ในแอป** (Facebook, แอป Google, LINE, Instagram) — ดาวน์โหลดเงียบ ๆ ไม่ทำงาน และผลของ `navigator.share` เชื่อไม่ได้
  หน้าต่างสำรองข้อมูลต้องมีปุ่มคัดลอกให้เห็นเสมอ (`src/services/saveFile.js`, `Setting.vue`) ถ้าเจอแอปใหม่ใน User Agent ให้เพิ่มใน `IN_APP_UA`
- **ปุ่มรายงาน 📮** ส่งไป Cloudflare Worker ใน `workers/report/` แล้วเข้า LINE
  token ของ LINE เก็บเป็น Worker secret เท่านั้น **ห้าม commit secret ใด ๆ** (repo เป็น public)
  ลิมิตความยาวใน `reportService.js` กับ Worker ต้องตรงกัน
- **ข้อมูลเกม** — Barroth ตารางรางวัลช่อง 10 เป็น Tail โดยตั้งใจ (การ์ดพิมพ์เป็น Shell แต่ช่องนั้นคือการตัดหาง) อย่าแก้กลับ
  เวลาหาวัตถุดิบใน recipe ให้ parse JSON ไม่ใช่ grep
- Pinia store ไม่มี HMR — แก้ store แล้วต้องรีโหลดหน้าเต็ม
- ไฟล์ใน repo เป็น CRLF (`core.autocrlf=true`) สคริปต์แก้ไฟล์ต้องไม่ผูกกับ line ending

## ทดสอบในเบราว์เซอร์

- รัน `npx vite` (ไม่ใช่ `npm run dev` ที่เขียน `asset-manifest.json` ใหม่) หรือ `vite preview` หลัง build
- ตั้ง localStorage ก่อนโหลดหน้า: `tourEnabled=false` และ `changelogSeen=<id บนสุดของ changelog.json>`
  ไม่งั้นทัวร์หรือหน้าต่าง "มีอะไรใหม่" จะบังปุ่ม
