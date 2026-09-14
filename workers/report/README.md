# mhw-report — ปุ่มรายงานปัญหา → LINE

Cloudflare Worker ที่รับรายงานจากปุ่ม **📮 รายงานปัญหา / เสนอไอเดีย** ในแอป แล้วส่งต่อเข้า LINE ของผู้พัฒนา

```
แอป ──POST /report──▶ Worker (เก็บ LINE token เป็น secret) ──▶ LINE Messaging API ──▶ LINE ของคุณ
```

ต้องมี: Node.js, บัญชี LINE, บัญชี Cloudflare (ฟรี)

---

## 1. สร้างบอท LINE

1. เข้า **LINE Official Account Manager** (https://manager.line.biz) → สร้างบัญชี Official Account
2. ในบัญชีนั้น: **ตั้งค่า → Messaging API → เปิดใช้งาน** (เลือกหรือสร้าง Provider)
3. เข้า **LINE Developers Console** (https://developers.line.biz/console) → เลือก channel ของบอท
   - แท็บ **Basic settings** → คัดลอก **Channel secret**
   - แท็บ **Messaging API** → **Channel access token (long-lived)** → กด **Issue** แล้วคัดลอก
4. ใน LINE Official Account Manager → **การตอบกลับ (Response settings)**: เปิด **Webhook** และปิด **ข้อความตอบกลับอัตโนมัติ** ไม่งั้นบอทจะตอบข้อความสำเร็จรูปแทรกเข้ามา
5. ถ้าอยากให้รายงานเข้า **กลุ่ม** แทนแชทส่วนตัว: แท็บ Messaging API → เปิด **Allow bot to join group chats**

> ⚠️ ห้ามส่ง Channel access token / Channel secret ให้ใคร และห้าม commit ลง git

## 2. Deploy Worker

```bash
cd workers/report
npm install
npx wrangler login          # เปิดเบราว์เซอร์ให้ล็อกอิน Cloudflare
npx wrangler deploy
```

จะได้ URL แบบ `https://mhw-report.<ชื่อบัญชี>.workers.dev` — **จด URL นี้ไว้**

## 3. ใส่ค่าลับ

```bash
npx wrangler secret put LINE_CHANNEL_ACCESS_TOKEN   # วาง token จากข้อ 1.3
npx wrangler secret put LINE_CHANNEL_SECRET         # วาง secret จากข้อ 1.3
npx wrangler secret put LINE_TO                     # ตอนนี้ยังไม่มี ID ใส่ pending ไปก่อน
```

## 4. ต่อ Webhook เพื่อหา User ID

1. LINE Developers Console → แท็บ **Messaging API** → **Webhook URL** ใส่ `https://mhw-report.<ชื่อบัญชี>.workers.dev/line-webhook`
2. กด **Verify** ต้องขึ้น Success → เปิด **Use webhook**
3. สแกน QR ในแท็บเดียวกันเพื่อ **แอดบอทเป็นเพื่อน** แล้วพิมพ์อะไรก็ได้ส่งหาบอท
   บอทจะตอบกลับว่า `User ID ของคุณ: U...`
   (ถ้าอยากให้เข้ากลุ่ม: เชิญบอทเข้ากลุ่ม บอทจะตอบ `Group ID ของกลุ่มนี้: C...`)
4. ตั้งค่าปลายทางจริง:
   ```bash
   npx wrangler secret put LINE_TO    # วาง U... หรือ C...
   ```
5. ปิดตัวบอก ID: แก้ `LINE_ID_HELPER = "off"` ใน `wrangler.toml` แล้ว `npx wrangler deploy` อีกครั้ง

## 5. เช็คว่าตั้งค่าครบ

เปิด `https://mhw-report.<ชื่อบัญชี>.workers.dev/health` ในเบราว์เซอร์ ต้องเห็น `true` ครบทั้ง
`LINE_CHANNEL_ACCESS_TOKEN`, `LINE_CHANNEL_SECRET`, `LINE_TO` (หน้านี้บอกแค่ว่ามีค่าหรือไม่ ไม่แสดงค่าจริง)

## 6. เปิดใช้ในแอป

ส่ง URL Worker ให้ผู้พัฒนาแอป เพื่อใส่ใน `PRODUCTION_REPORT_URL` ที่ `src/services/reportService.js` แล้ว deploy แอปใหม่
ก่อนใส่ URL ปุ่มในแอปยังใช้ได้ แต่จะมีแค่ปุ่มคัดลอกรายงาน

---

## ทดสอบในเครื่อง (ไม่บังคับ)

สร้างไฟล์ `workers/report/.dev.vars` (ไฟล์นี้ถูก gitignore ไว้แล้ว):

```
LINE_CHANNEL_ACCESS_TOKEN=...
LINE_CHANNEL_SECRET=...
LINE_TO=U...
```

```bash
npx wrangler dev                                  # Worker อยู่ที่ http://localhost:8787
VITE_REPORT_URL=http://localhost:8787 npx vite    # รันแอปให้ส่งรายงานเข้า Worker ในเครื่อง (อีกหน้าต่าง)
```

## แก้ปัญหา

| อาการ | สาเหตุ / วิธีแก้ |
|---|---|
| deploy แล้ว error เรื่อง `ratelimits` | แพ็กเกจยังไม่รองรับ ลบบล็อก `[[ratelimits]]` ทั้งสองอันใน `wrangler.toml` แล้ว deploy ใหม่ |
| แอปขึ้น "ระบบส่งรายงานยังไม่เปิดใช้" | ยังตั้ง `LINE_CHANNEL_ACCESS_TOKEN` หรือ `LINE_TO` ไม่ครบ ดู `/health` |
| แอปขึ้น "ช่องทางรายงานเต็มชั่วคราว" | โควตาข้อความ push ของ LINE OA เดือนนี้หมด เช็คใน LINE Official Account Manager |
| Verify webhook ไม่ผ่าน | `LINE_CHANNEL_SECRET` ไม่ตรงกับ channel หรือ URL ไม่ได้ลงท้ายด้วย `/line-webhook` |
| ส่งจากแอปแล้วขึ้นส่งไม่สำเร็จทันที | โดเมนของแอปไม่อยู่ใน `ALLOWED_ORIGINS` |

ดู log ของ Worker แบบสด: `npx wrangler tail`
