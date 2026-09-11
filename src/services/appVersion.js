// ค่าที่ vite.config.js ฝังไว้ตอน build — ที่เดียวที่อ่านค่านี้ ทุกหน้าที่ต้องแสดงเวอร์ชันมาเอาจากนี่
// ถ้ารันนอก vite (เช่น script ทดสอบ) ตัวแปรนี้จะไม่มี ต้องมีค่าสำรองไม่งั้นพังทั้งแอป
export const APP_BUILD =
  typeof __APP_BUILD__ !== 'undefined' ? __APP_BUILD__ : { version: 'dev', sha: 'dev', at: null }

export const APP_VERSION = APP_BUILD.version
