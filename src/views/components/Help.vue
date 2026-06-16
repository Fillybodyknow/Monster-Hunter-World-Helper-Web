<script setup>
import { ref } from 'vue'

const opened = ref([true, false, false, false, false, false, false])
const toggle = (i) => { opened.value[i] = !opened.value[i] }

const sections = [
  {
    title: '📖 เริ่มต้นใช้งาน',
    content: [
      { h: 'สร้าง Hunter', p: 'เปิดแอปครั้งแรกจะเข้าสู่หน้า Hunter Save Data\nกด "สร้าง Hunter ใหม่" → ตั้งชื่อ Hunter / Palico → เลือก Class และอาวุธเริ่มต้น → กด "สร้าง"\nจากนั้นกด "Enter World" เพื่อเข้าสู่เกม' },
      { h: 'เปลี่ยน Hunter', p: 'กดปุ่ม Logout ในหน้า Setting เพื่อกลับไปหน้าเลือก Hunter\nข้อมูลทุกอย่างยังคงอยู่ใน localStorage ของเบราว์เซอร์ ไม่หาย' },
    ],
  },
  {
    title: '⚔ โหมด Solo',
    content: [
      { h: 'เริ่มเควส', p: 'เข้าเมนู Quest → เลือกสมุด (Ancient Forest / Wildspire Waste) → เลือกมอนสเตอร์ → เลือกเควส\nระบบจะแสดง HP มอนสเตอร์, อาวุธที่ใช้ได้, Starting Points และ Difficulty' },
      { h: 'Starting Points หมด (Exhausted Attempt)', p: 'เมื่อจำนวนครั้งที่ลงเควสนั้นถูกใช้ครบแล้ว แอปจะแจ้งเตือน\nยังเล่นได้ แต่จะบังคับเข้าช่วง HQ ก่อนออกล่า (2 กิจกรรม)' },
    ],
  },
  {
    title: '🤝 โหมด Co-op',
    content: [
      { h: 'สร้างห้อง (Host)', p: 'กดปุ่ม ⚔ Co-op ที่มุมบนขวา → "สร้าง Room"\nจะได้ Room Code 6 หลัก — แชร์ให้เพื่อนร่วมตี้' },
      { h: 'เข้าร่วมห้อง (Guest)', p: 'กดปุ่ม ⚔ Co-op → "เข้าร่วม Room" → กรอก Room Code ของ Host\nแต่ละห้องรับ Hunter ได้สูงสุด 4 คน และแต่ละ Class เข้าร่วมได้ 1 คน' },
      { h: 'Lobby', p: 'หลังเข้าห้องแล้ว Host เลือกเควสก่อน จากนั้นทุกคนกด Ready\nเมื่อทุกคน Ready แล้ว Host จะเริ่มเกมอัตโนมัติ\nCountdown จะแสดงก่อนเริ่ม' },
      { h: 'การ sync และ reconnect', p: 'สถานะเกมทั้งหมด (HP มอนสเตอร์, Time Card, Behavior Deck, ฯลฯ) sync แบบเรียลไทม์ผ่าน Firebase\nหากหลุดการเชื่อมต่อ แอปจะ reconnect อัตโนมัติเมื่อสัญญาณกลับมา' },
    ],
  },
  {
    title: '🗺 ขั้นตอนเกม (Quest Flow)',
    content: [
      { h: '1. เลือก Book → Monster → Quest', p: 'เลือกสมุดเควส, มอนสเตอร์, และเควสที่ต้องการ\nกด "เริ่มเควส" เพื่อดำเนินต่อ' },
      { h: '2. HQ Vote (Co-op)', p: 'ทุกคนโหวตว่าจะ "เข้า HQ" หรือ "ลุยเลย"\nหาก Host เป็นฝ่ายเสียง Host เป็นผู้ตัดสิน' },
      { h: '3. HQ Phase', p: 'เยี่ยมชมสถานที่ต่าง ๆ ใน Head Quarter ตามจำนวนกิจกรรมที่กำหนด\nเช่น Hunter\'s Lodge (จ้าง Palico), Provisions Stockpile (แลกทรัพยากร)' },
      { h: '4. Dialog Phase', p: 'อ่าน Story ของเควส — ใน Co-op ทุกคนโหวตว่าจะดำเนินต่อหรือไม่' },
      { h: '5. Hunting Phase', p: 'ช่วงต่อสู้กับมอนสเตอร์ ดูรายละเอียดในหัวข้อ "Hunting Panel" ด้านล่าง' },
      { h: '6. Reward Phase', p: 'เมื่อมอนสเตอร์ตายหรือเควสจบ — ทอยลูกเต๋ารางวัล, เลือกไอเทม, เทรดกันในตี้ได้' },
    ],
  },
  {
    title: '🎴 Hunting Panel',
    content: [
      { h: 'Time Card (การ์ดเทิร์นนักล่า)', p: 'ดึงการ์ดเพื่อดำเนินเทิร์นของนักล่า\nการ์ดสีแดงมีผลพิเศษ เช่น เพิ่ม/ลด Time Remaining\nเมื่อการ์ดหมด Deck ระบบจะสับการ์ดทิ้งกลับมาใช้ใหม่อัตโนมัติ' },
      { h: 'Monster Turn / Behavior Card', p: 'กด "Monster Turn" เพื่อให้มอนสเตอร์โจมตี\nระบบจะสุ่มดึง Behavior Card ของมอนสเตอร์ และแสดง Overlay ผลการโจมตี\nหาก Status Effect ถูก resolve ก่อน จะแสดงรายการ Status ที่หายไปพร้อมกับ Monster Attack Overlay' },
      { h: 'HP มอนสเตอร์', p: 'กดที่ HP บนหน้าจอเพื่อลด/เพิ่ม HP ตามดาเมจที่ทำได้\nเมื่อ HP ถึง 0 เกมจะเข้าสู่ Reward Phase อัตโนมัติ' },
      { h: 'Part Break', p: 'เมื่อดาเมจสะสมส่วนต่าง ๆ ของมอนสเตอร์ถึงเกณฑ์ จะแสดง Animation แจ้งว่า Part ไหน Break\nการ Break Part ให้โบนัสรางวัลเพิ่มเติมในช่วง Reward' },
      { h: 'Status Effect', p: 'บางสถานะมีผลต่อมอนสเตอร์โดยอัตโนมัติเมื่อถึง Monster Turn\nเช่น Poison ทำให้มอนสเตอร์เสีย HP, Defense Down ทำให้เกราะคืนค่า\nระบบจะแสดงสถานะที่ถูก resolve ใน Monster Attack Overlay' },
      { h: 'Track Token', p: 'ใช้ติดตามสถานะพิเศษต่าง ๆ ระหว่างต่อสู้ กด Token บนหน้าจอเพื่อเพิ่ม/ลด' },
    ],
  },
  {
    title: '🎒 เมนูอื่น ๆ',
    content: [
      { h: 'State', p: 'ดูและแก้ไขสถานะปัจจุบันของ Hunter เช่น HP, Stamina และอุปกรณ์ที่สวมใส่' },
      { h: 'Inventory', p: 'จัดการไอเทมและทรัพยากรที่เก็บมาได้ระหว่างเควส' },
      { h: 'Crafting', p: 'คราฟต์อาวุธและชุดเกราะจากทรัพยากรที่มี ตรวจสอบ recipe ได้จากในหน้านี้' },
      { h: 'Setting', p: 'ตั้งค่าเสียงและการแสดงผล, Export ข้อมูล Hunter เป็น JSON, หรือ Logout เปลี่ยน Hunter' },
    ],
  },
  {
    title: '💡 Tips',
    content: [
      { h: 'ข้อมูล Hunter เก็บใน Browser', p: 'ข้อมูลทั้งหมดเก็บใน localStorage ของเบราว์เซอร์นั้น ๆ\nหากเปิดในเบราว์เซอร์อื่นหรือ Incognito ข้อมูลจะไม่ปรากฏ\nแนะนำ Export Hunter ก่อนเปลี่ยนอุปกรณ์' },
      { h: 'Co-op ห้องจะหายเมื่อ Host ออก', p: 'ข้อมูลห้องไม่ได้เก็บถาวร — เมื่อ Host ออกจากห้องหรือเควสจบ ห้องจะถูกลบทันที\nผู้เล่นคนอื่นจะได้รับแจ้งและออกจากห้องอัตโนมัติ' },
      { h: 'หากหน้าจอค้างหรือ Overlay ไม่ปิด', p: 'ลองแตะ/คลิกที่ Overlay เพื่อปิด\nหรือ Reload หน้า — สถานะเกมจะ reload จาก localStorage (Solo) หรือ Firebase (Co-op)' },
    ],
  },
]
</script>

<template>
<div class="help-page">

  <div class="help-header">
    <div class="hh-line"></div>
    <div class="hh-title-wrap">
      <span class="hh-ornament">?</span>
      <h2 class="hh-title">คู่มือการใช้งาน</h2>
      <span class="hh-ornament">?</span>
    </div>
    <div class="hh-line"></div>
  </div>

  <div class="help-intro">
    <p>MHW Board Game Companion — ใช้แอปนี้เพื่อดำเนินเกมบอร์ดเกม Monster Hunter World ทั้งโหมด Solo และ Co-op สูงสุด 4 คน</p>
  </div>

  <div class="help-sections">
    <div
      v-for="(sec, i) in sections"
      :key="i"
      class="help-sec"
    >
      <button class="help-sec-header" @click="toggle(i)">
        <span class="help-sec-title">{{ sec.title }}</span>
        <span class="help-sec-arrow" :class="{ open: opened[i] }">▸</span>
      </button>

      <div v-if="opened[i]" class="help-sec-body">
        <div v-for="(item, j) in sec.content" :key="j" class="help-item">
          <div class="help-item-title">{{ item.h }}</div>
          <div class="help-item-desc" v-for="(line, k) in item.p.split('\n')" :key="k">{{ line }}</div>
        </div>
      </div>
    </div>
  </div>

  <div class="help-footer">
    <span>Monster Hunter World: The Board Game — Companion App</span>
  </div>

</div>
</template>

<style scoped>
.help-page {
  padding: 0 0 80px;
  max-width: 600px;
  margin: 0 auto;
}

/* Header */
.help-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px 16px 16px;
}
.hh-line {
  flex: 1;
  height: 1px;
  background: linear-gradient(to right, transparent, rgba(200,155,60,0.4));
}
.hh-line:last-child {
  background: linear-gradient(to left, transparent, rgba(200,155,60,0.4));
}
.hh-title-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}
.hh-ornament {
  font-size: 14px;
  color: #7c5a2b;
  font-weight: bold;
}
.hh-title {
  font-size: 16px;
  font-weight: bold;
  color: #ffd27a;
  letter-spacing: 3px;
  margin: 0;
  text-transform: uppercase;
}

/* Intro */
.help-intro {
  margin: 0 16px 20px;
  padding: 12px 16px;
  background: rgba(200,155,60,0.06);
  border: 1px solid rgba(200,155,60,0.2);
  border-radius: 8px;
}
.help-intro p {
  margin: 0;
  font-size: 12px;
  color: #a88040;
  line-height: 1.7;
  letter-spacing: 0.5px;
}

/* Accordion */
.help-sections {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0 16px;
}

.help-sec {
  border: 1px solid rgba(124,90,43,0.35);
  border-radius: 10px;
  overflow: hidden;
  background: rgba(0,0,0,0.2);
}

.help-sec-header {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 13px 16px;
  background: rgba(200,155,60,0.06);
  border: none;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.15s;
}
.help-sec-header:hover {
  background: rgba(200,155,60,0.1);
}

.help-sec-title {
  font-size: 13px;
  font-weight: bold;
  color: #ffd27a;
  letter-spacing: 1px;
  text-align: left;
}

.help-sec-arrow {
  font-size: 14px;
  color: #7c5a2b;
  transition: transform 0.2s;
  flex-shrink: 0;
}
.help-sec-arrow.open {
  transform: rotate(90deg);
  color: #c89b3c;
}

.help-sec-body {
  display: flex;
  flex-direction: column;
  gap: 1px;
  border-top: 1px solid rgba(124,90,43,0.2);
}

.help-item {
  padding: 12px 16px;
  border-bottom: 1px solid rgba(124,90,43,0.1);
}
.help-item:last-child {
  border-bottom: none;
}

.help-item-title {
  font-size: 12px;
  font-weight: bold;
  color: #c89b3c;
  letter-spacing: 1px;
  margin-bottom: 6px;
}

.help-item-desc {
  font-size: 12px;
  color: #a88040;
  line-height: 1.7;
  letter-spacing: 0.3px;
}

/* Footer */
.help-footer {
  text-align: center;
  padding: 24px 16px 8px;
  font-size: 10px;
  color: rgba(124,90,43,0.4);
  letter-spacing: 2px;
}
</style>
