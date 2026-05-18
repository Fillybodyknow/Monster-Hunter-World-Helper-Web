# Monster Hunter World Helper Web

เว็บแอปสำหรับช่วยจัดการข้อมูล Hunter Save Data ในธีม Monster Hunter World สร้างด้วย Vue + Vite และเก็บข้อมูลผู้เล่นไว้ใน `localStorage` ของเบราว์เซอร์

## ภาพรวมโปรเจกต์

โปรเจกต์นี้เป็นเครื่องมือช่วยจัดการข้อมูลตัวละคร Hunter โดยมีฟีเจอร์หลักดังนี้

- สร้าง Hunter ใหม่
- ดูรายการ Hunter ที่บันทึกไว้
- ดูรายละเอียด Hunter พร้อมอุปกรณ์ที่สวมใส่
- ลบ Hunter
- เข้าสู่หน้า Home เพื่อใช้งานเมนูต่าง ๆ ของเกม
- จัดการข้อมูลฝั่งผู้ใช้ผ่าน `localStorage`

## เทคโนโลยีที่ใช้

- [Vue](https://vuejs.org/) (beta)
- [Vue Router](https://router.vuejs.org/)
- [Vite](https://vite.dev/)
- [Bootstrap 5](https://getbootstrap.com/)
- [Pinia](https://pinia.vuejs.org/)
- [SweetAlert2](https://sweetalert2.github.io/)

## โครงสร้างการทำงานหลัก

### หน้า `/`

หน้าเริ่มต้นสำหรับจัดการ Hunter Save Data

สิ่งที่ทำได้ในหน้านี้:

- แสดงรายการ Hunter ที่บันทึกไว้
- เปิด modal เพื่อดูรายละเอียด Hunter
- เปิด modal เพื่อสร้าง Hunter ใหม่
- ลบ Hunter
- กด `Enter World` เพื่อเข้าสู่หน้า `/home`

### หน้า `/home`

หน้าเมนูหลักของตัวเกม/ระบบช่วยเหลือ

มีเมนูย่อย:

- Quest
- State
- Inventory
- Equipment
- Crafting
- Setting

> หมายเหตุ: หน้า `/home` จะเข้าถึงได้เมื่อมี `hunterId` อยู่ใน `localStorage` เท่านั้น

## การจัดเก็บข้อมูล

โปรเจกต์นี้ใช้ `localStorage` แทนฐานข้อมูลจริง โดยเก็บข้อมูลสำคัญเช่น:

- `hunters` — รายการ Hunter ทั้งหมด
- `hunterId` — id ของ Hunter ที่กำลังใช้งานอยู่

ไฟล์ service ที่เกี่ยวข้อง:

- `src/services/hunterStorage.js`
- `src/services/hunterService.js`
- `src/services/equipService.js`

## โครงสร้างไฟล์โดยสรุป

```txt
src/
├── App.vue
├── main.js
├── router/
│   └── index.js
├── services/
│   ├── equipService.js
│   ├── hunterService.js
│   └── hunterStorage.js
├── views/
│   ├── Home.vue
│   ├── index.vue
│   └── components/
│       ├── Crafting.vue
│       ├── Equipment.vue
│       ├── Inventory.vue
│       ├── Quest.vue
│       ├── Setting.vue
│       ├── State.vue
│       └── WeaponSelect.vue
└── assets/
    ├── files/
    ├── img/
    └── ...
```

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

## หมายเหตุสำหรับการพัฒนา

- โปรเจกต์นี้อิงข้อมูลจากไฟล์ JSON ภายใน `src/assets/files/`
- รูปภาพและไอคอนต่าง ๆ อยู่ใน `src/assets/img/`
- หน้า Home แยกเป็นหลาย component เพื่อให้ขยายฟีเจอร์ต่อได้ง่าย
- หากล้าง `localStorage` ข้อมูล Hunter ที่สร้างไว้จะหายทั้งหมด

## ข้อกำหนดของระบบ

- Node.js `^20.19.0 || >=22.12.0`
- เบราว์เซอร์ที่รองรับ Vue + Vite และ `localStorage`

## ลิงก์ที่เกี่ยวข้อง

- Vue: https://vuejs.org/
- Vite: https://vite.dev/
- Bootstrap: https://getbootstrap.com/
- SweetAlert2: https://sweetalert2.github.io/

## License

ยังไม่ได้ระบุ license ในโปรเจกต์นี้
