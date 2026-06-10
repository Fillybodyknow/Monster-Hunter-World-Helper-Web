# Monster Hunter World Helper Web

เว็บแอป Companion สำหรับเล่นบอร์ดเกม **Monster Hunter World: The Board Game** สร้างด้วย Vue 3 + Vite รองรับทั้งโหมดเล่นคนเดียว (ข้อมูลเก็บใน `localStorage`) และโหมด **Co-op หลายคนแบบเรียลไทม์** ผ่าน Firebase Realtime Database

## ภาพรวมโปรเจกต์

แอปนี้ช่วยจัดการ Hunter Save Data และดำเนินเกมตามกลไกของบอร์ดเกม MHW ตั้งแต่การเลือกเควส, ช่วง Head Quarter (HQ), Dialog/Story ไปจนถึงช่วง Hunting (ต่อสู้กับมอนสเตอร์) และ Reward — รองรับทั้งแบบเล่นคนเดียวและแบบกลุ่ม (สูงสุด 4 คน) ที่ sync สถานะเกมแบบเรียลไทม์

ฟีเจอร์หลัก:

- จัดการ Hunter (สร้าง / ดู / ลบ / สวมใส่อุปกรณ์)
- ระบบ Quest แบบเต็มกระบวนการ: Book → Monster → Quest → HQ/Dialog → Hunting → Reward
- Co-op แบบเรียลไทม์ผ่าน Firebase: สร้าง/เข้าร่วมห้องด้วย Room Code, โหวต, sync state, reconnect อัตโนมัติ
- Hunting Panel: Behavior Deck, Time Card, Status Effect, Track Token, Part Break, ระบบ HP/Damage พร้อม Animation Overlay
- HQ Phase: Hunter's Lodge (จ้าง Palico), Provisions Stockpile (แลกเปลี่ยนทรัพยากร) และสถานที่อื่น ๆ
- Inventory / Equipment / Crafting / State สำหรับจัดการไอเทมและอุปกรณ์ของ Hunter
- โหมด Minimal / Full สำหรับปรับความละเอียดของ UI ระหว่างต่อสู้

## เทคโนโลยีที่ใช้

- [Vue 3](https://vuejs.org/) (beta) + Composition API (`<script setup>`)
- [Vue Router](https://router.vuejs.org/) (Hash History)
- [Vite](https://vite.dev/)
- [Pinia](https://pinia.vuejs.org/) — state management (`room`, `hunter`, `settings`, `craftingWhitelist`)
- [Firebase Realtime Database](https://firebase.google.com/products/realtime-database) — sync ข้อมูล Co-op
- [Bootstrap 5](https://getbootstrap.com/)
- [SweetAlert2](https://sweetalert2.github.io/)

## โครงสร้างการทำงานหลัก

### หน้า `/` — Hunter Save Data

- แสดงรายการ Hunter ที่บันทึกไว้ (ใน `localStorage`)
- สร้าง Hunter ใหม่ (ตั้งชื่อ Hunter/Palico, เลือก Class และอาวุธเริ่มต้น)
- เปิด modal ดูรายละเอียด Hunter พร้อมอุปกรณ์ที่สวมใส่ / ลบ Hunter
- กด `Enter World` เพื่อเข้าสู่หน้า `/home`

### หน้า `/home` — เมนูหลัก

> หน้านี้เข้าถึงได้เมื่อมี `hunterId` อยู่ใน `localStorage` เท่านั้น (มี route guard ใน `src/router/index.js`)

มีเมนูย่อย:

| เมนู | คำอธิบาย |
| --- | --- |
| **Quest** | เลือกเควสและดำเนินเกมตามขั้นตอน HQ → Dialog → Hunting → Reward รองรับ Co-op |
| **State** | ดู/แก้ไขสถานะ Hunter และอุปกรณ์ที่สวมใส่ |
| **Inventory** | จัดการไอเทม/ทรัพยากรที่เก็บได้ |
| **Crafting** | คราฟต์อุปกรณ์จากทรัพยากรที่มี |
| **Setting** | ตั้งค่าเสียงและการแสดงผล (มีส่วนที่อยู่ระหว่างพัฒนาเพิ่มเติม) |

จากหน้า Home ยังเข้าถึงระบบ **Co-op Room** (สร้าง/เข้าร่วมห้องด้วย Room Code 6 หลัก ผ่าน `CoopRoom.vue`) ได้ด้วย

### Quest Flow

1. **Book Selection** — เลือกสมุดเควส (Ancient Forest / Wildspire Waste)
2. **Monster Selection** — เลือกมอนสเตอร์เป้าหมาย
3. **Quest Selection / Detail** — เลือกเควส (Assigned / Investigation / Tempered Investigation) ตรวจสอบเควสที่ผ่านแล้วและ Starting Points ที่ใช้ครบ (Exhausted Attempt จะบังคับเข้า HQ ก่อนเสมอ)
4. **HQ Phase** — เยี่ยมชมสถานที่ต่าง ๆ ใน Head Quarter (Hunter's Lodge, Provisions Stockpile ฯลฯ) ก่อนออกเดินทาง มีระบบโหวตว่าจะเข้า HQ หรือลุยเควสเลย พร้อม Host เป็นผู้ตัดสินกรณีคะแนนเสมอ
5. **Dialog Phase** — อ่าน/โหวต Dialog ของเควส
6. **Hunting Phase / Hunting Panel** — ต่อสู้กับมอนสเตอร์: Behavior Deck (การ์ดพฤติกรรมมอนสเตอร์), Time Card (การ์ดเทิร์นนักล่า), Status Effect, Track Token, Part Break พร้อม Animation Overlay
7. **Reward Phase** — สรุปผล, ทอยลูกเต๋ารางวัล, แบ่งไอเทม, เทรดภายในกลุ่ม

### Co-op Multiplayer

- สร้างห้อง/เข้าร่วมห้องด้วย Room Code (สูงสุด 4 คน, 1 Class ต่อ 1 คนต่อห้อง)
- ใช้ Firebase Realtime Database sync: gameState, dialog votes, HQ votes, behavior deck, time cards, hunt state (HP/Part damage/status), trade pool, rewards ฯลฯ
- รองรับ reconnect อัตโนมัติเมื่อหลุดการเชื่อมต่อ (Host/Guest) พร้อม indicator แจ้งสถานะการเชื่อมต่อของสมาชิกแต่ละคน
- โหมด Minimal / Full เพื่อลดความซับซ้อนของ UI ระหว่างต่อสู้สำหรับ Guest

## การจัดเก็บข้อมูล

- **`localStorage`** — ข้อมูล Hunter (`hunters`, `hunterId`), การตั้งค่า, ความคืบหน้าเควส/ไอเทม
- **Firebase Realtime Database** — สถานะห้อง Co-op แบบเรียลไทม์ (ไม่ persist ถาวร ลบห้องอัตโนมัติเมื่อจบเควสหรือ Host ออกจากห้อง)

ไฟล์ service ที่เกี่ยวข้อง:

- `src/services/hunterStorage.js`, `src/services/hunterService.js`, `src/services/equipService.js`
- `src/services/firebase.js` (Firebase init + connection state)
- `src/services/roomService.js` (อ่าน/เขียนข้อมูลห้อง Co-op บน Firebase Realtime Database)

State stores (Pinia):

- `src/stores/room.js` — สถานะห้อง Co-op และการ sync กับ Firebase
- `src/stores/hunter.js` — Hunter ที่กำลังใช้งาน (reactive ใช้ร่วมกันหลาย component)
- `src/stores/settings.js` — การตั้งค่าเสียง/การแสดงผล
- `src/stores/craftingWhitelist.js` — รายการ whitelist การคราฟต์ + การแจ้งเตือน

## โครงสร้างไฟล์โดยสรุป

```txt
src/
├── App.vue                  # Layout หลัก + craft notification overlay
├── main.js
├── router/
│   └── index.js             # Hash router, guard ต้องมี hunterId
├── services/
│   ├── equipService.js
│   ├── firebase.js          # Firebase init + connection state
│   ├── hunterService.js
│   ├── hunterStorage.js
│   └── roomService.js       # Firebase Realtime DB read/write helpers
├── stores/
│   ├── craftingWhitelist.js
│   ├── hunter.js
│   ├── room.js              # Pinia store: Co-op room state
│   └── settings.js
├── composables/
│   └── useCraftLookup.js
├── views/
│   ├── index.vue            # หน้า Hunter Save Data ("/")
│   ├── Home.vue              # หน้าเมนูหลัก ("/home")
│   └── components/
│       ├── Quest.vue          # ระบบ Quest ทั้งหมด (Book → Reward)
│       ├── HQPhase.vue         # ช่วง Head Quarter ระหว่างเควส
│       ├── HeadQuarter.vue     # หน้า Head Quarter หลัก
│       ├── CoopRoom.vue        # สร้าง/เข้าร่วมห้อง Co-op
│       ├── CoopLobbyModal.vue  # Lobby รอ Ready ก่อนเริ่มเควส
│       ├── CraftLookupModal.vue
│       ├── Crafting.vue
│       ├── Equipment.vue
│       ├── Inventory.vue
│       ├── Setting.vue
│       ├── State.vue
│       └── WeaponSelect.vue
└── assets/
    ├── files/                # ข้อมูลเกมแบบ JSON (มอนสเตอร์, เควส, อุปกรณ์, Time Card ฯลฯ)
    ├── img/
    └── ...

public/assets/
├── img/
│   ├── behavior_deck/        # การ์ดพฤติกรรมมอนสเตอร์ (แยกตามมอนสเตอร์)
│   ├── time_cards/            # Time Card (ปกติ/แดง)
│   ├── maps/, equiments/, status_effect/, monster_parts/, ...
└── sounds/hunting_phase/      # เสียงเอฟเฟกต์ช่วงต่อสู้
```

## มอนสเตอร์ที่รองรับ

Great Jagras, Tobi-Kadachi, Anjanath, Rathalos, Azure Rathalos, Barroth, Pukei-Pukei, Jyuratodus, Diablos, Black Diablos

## Hunter Class ที่รองรับ

Great Sword, Bow, Dual Blades, Sword & Shield, Hammer, Charge Blade, Longsword, Lance

## การติดตั้งและรันโปรเจกต์

### 1) ติดตั้ง dependencies

```bash
npm install
```

### 2) รันโหมดพัฒนา

```bash
npm run dev
```

### 3) สร้างไฟล์สำหรับ production

```bash
npm run build
```

### 4) ดูตัวอย่างไฟล์ production

```bash
npm run preview
```

## สคริปต์ใน `package.json`

- `npm run dev` — เปิด Vite dev server
- `npm run build` — build สำหรับ production
- `npm run preview` — preview ไฟล์ที่ build แล้ว
- `npm run format` — format โค้ดด้วย Prettier

## Branch & Deployment

- `dev` — branch พัฒนาหลัก
- `main` — branch อ้างอิง
- `production` — เมื่อ push ขึ้น branch นี้ GitHub Actions (`.github/workflows/deploy.yml`) จะ build และ deploy ขึ้น GitHub Pages โดยอัตโนมัติ

## หมายเหตุสำหรับการพัฒนา

- โปรเจกต์นี้อิงข้อมูลเกมจากไฟล์ JSON ภายใน `src/assets/files/`
- รูปภาพ/ไอคอน/เสียงต่าง ๆ อยู่ใน `public/assets/`
- Co-op ใช้ Firebase Realtime Database — ข้อมูลห้องจะถูกลบอัตโนมัติเมื่อจบเควสหรือ Host ออกจากห้อง
- หากล้าง `localStorage` ข้อมูล Hunter และความคืบหน้าที่สร้างไว้จะหายทั้งหมด

## ข้อกำหนดของระบบ

- Node.js `^20.19.0 || >=22.12.0`
- เบราว์เซอร์ที่รองรับ Vue + Vite, `localStorage` และ Firebase Realtime Database (สำหรับ Co-op)

## ลิงก์ที่เกี่ยวข้อง

- Vue: https://vuejs.org/
- Vite: https://vite.dev/
- Pinia: https://pinia.vuejs.org/
- Firebase: https://firebase.google.com/
- Bootstrap: https://getbootstrap.com/
- SweetAlert2: https://sweetalert2.github.io/

## License

ยังไม่ได้ระบุ license ในโปรเจกต์นี้
