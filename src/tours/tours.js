// ทัวร์สอนใช้งานของแต่ละหน้า — แก้ข้อความทั้งหมดได้ที่ไฟล์นี้ไฟล์เดียว
//
// target   ค่า data-tour บนปุ่มจริง (ไม่ผูกกับชื่อคลาส เปลี่ยนหน้าตาแล้วทัวร์ไม่พัง) ไม่ใส่ = ป้ายกลางจอ
// mode     'next' อ่านแล้วกดถัดไป (ค่าเริ่มต้น) | 'click' ต้องแตะปุ่มที่ชี้เอง
//          ใช้ 'click' เฉพาะการนำทางในเครื่องตัวเอง ห้ามใช้กับปุ่มที่ต้องรอ Host หรือทั้งห้อง ไม่งั้นค้าง
// optional ปุ่มที่มีเฉพาะบางสถานการณ์ (เล่นเป็นตี้ / เป็น Host) หาไม่เจอก็ข้ามขั้นไป
//          ขั้นที่ไม่ optional หาไม่เจอ = ผู้เล่นออกจากหน้าไปแล้ว ทัวร์จะจบเอง
// final    แตะแล้วจบทัวร์ทันที เพราะคลิกนั้นพาเปลี่ยนหน้า
// priority น้อยกว่าขึ้นก่อนเมื่อหลายหน้าขอพร้อมกัน (เปิดแอปครั้งแรก เมนูหลักต้องมาก่อน Quest Board)
//
// scripts ตรวจ: verify-tours เช็คว่า target ทุกตัวมี data-tour อยู่จริงในไฟล์ .vue
export const TOURS = {
  registry: {
    priority: 0,
    steps: [
      {
        title: 'ยินดีต้อนรับสู่ Hunter Registry',
        body: 'แอปนี้ช่วยจดทุกอย่างของบอร์ดเกม Monster Hunter World — เควสต์ การล่า ของที่เก็บได้ และการคราฟต์\nเราเล่นบนกระดานจริง ส่วนตัวเลขปล่อยให้แอปจำ',
      },
      {
        target: 'registry-new',
        title: 'สร้าง Hunter',
        body: 'ตั้งชื่อ Hunter กับ Palico เลือก Class และอาวุธเริ่มต้น — หนึ่งเซฟต่อหนึ่งตัวละคร',
      },
      {
        target: 'registry-import',
        title: 'นำเข้าเซฟ',
        body: 'ย้ายเครื่องหรือกู้เซฟจากไฟล์ .json ที่เคย Export ไว้ในหน้า Setting',
      },
      {
        title: '⚠ เซฟอยู่ในเบราว์เซอร์นี้เท่านั้น',
        body: 'เปิดแอปใน Chrome หรือ Safari — อย่าเปิดจากในแอป LINE หรือ Facebook เพราะเซฟจะแยกกัน\nและ Export เซฟเก็บไว้หลังเล่นจบทุกครั้ง',
      },
      {
        target: 'registry-list',
        title: 'เข้าสู่โลก',
        body: 'แตะการ์ด Hunter เพื่อเริ่มเล่น — ครั้งแรกให้สร้าง Hunter ก่อน',
      },
    ],
  },

  home: {
    priority: 1,
    steps: [
      {
        title: 'ออกล่ากันเถอะ Hunter!',
        body: 'มาดูเมนูหลักกันก่อน — แต่ละหน้ามีทัวร์สั้น ๆ ของตัวเอง จะขึ้นครั้งแรกที่เข้าไป\nปิดหรือเปิดดูใหม่ได้ในหน้า Setting',
      },
      {
        target: 'tab-Quest',
        title: 'Quest',
        body: 'เลือกเควสต์ เปิดห้อง แล้วเล่นตั้งแต่บทสนทนา การล่า จนรับรางวัล — หน้าที่ใช้บ่อยที่สุด',
      },
      { target: 'tab-State', title: 'State', body: 'ข้อมูลนักล่า อาวุธและชุดเกราะที่สวมอยู่' },
      { target: 'tab-Inventory', title: 'Inventory', body: 'ทรัพยากรและชิ้นส่วนมอนสเตอร์ที่เก็บได้' },
      { target: 'tab-Crafting', title: 'Crafting', body: 'คราฟต์อาวุธและชุดเกราะจากของในกระเป๋า' },
      { target: 'tab-Setting', title: 'Setting', body: 'ปรับเสียง, Export เซฟ และเปิดทัวร์นี้ดูใหม่' },
    ],
  },

  // ปุ่มปาร์ตี้มีเฉพาะตอนอยู่ในห้อง — เดิมเป็นขั้นท้ายของทัวร์เมนูหลัก ซึ่งขึ้นตอนเข้า /home ครั้งแรก
  // ตอนนั้นผู้เล่นแทบไม่เคยอยู่ในห้อง ขั้นนี้เลยถูกข้ามแล้วทัวร์ถูกจำว่าดูแล้ว ไม่มีใครได้เห็นเลย
  // แยกออกมาให้ขึ้นครั้งแรกที่เข้าห้องจริง (Home.vue ขอเมื่อ room.inRoom เป็นจริง)
  // priority 6 = หลังทัวร์ล็อบบี้ (ค่าเริ่มต้น 5) ที่ขึ้นพร้อมกันตอนเข้าห้อง
  partyFab: {
    priority: 6,
    steps: [
      {
        target: 'party-fab',
        title: 'ปุ่มปาร์ตี้',
        body: 'อยู่ในห้อง Co-op จะมีปุ่มนี้ แตะเพื่อเปิดรายชื่อตี้ — ดูว่าใครขาดการเชื่อมต่อ ออกจากตี้\nถ้าเป็น Host จะโอนหัวห้อง เตะสมาชิก หรือยุบตี้ได้จากตรงนี้',
      },
    ],
  },

  questBoard: {
    steps: [
      {
        target: 'quest-calendar',
        title: 'ปฏิทินแคมเปญ',
        body: 'วันในแคมเปญ — เพิ่มขึ้นทุกครั้งที่ลงเควสต์หรือแวะ Downtime',
      },
      {
        target: 'quest-coop',
        title: 'Co-op Room Board',
        body: 'ดูห้องที่เพื่อนเปิดไว้แล้วเข้าร่วม หรือกรอก Room Code ที่เพื่อนส่งมา',
      },
      {
        target: 'quest-books',
        mode: 'click',
        final: true,
        title: 'เลือกกล่องเควสต์',
        body: 'แต่ละกล่องมีมอนสเตอร์และเล่มเควสต์ของตัวเอง — ลองแตะกล่องหนึ่งเพื่อไปต่อ',
      },
    ],
  },

  questList: {
    steps: [
      {
        target: 'quest-list',
        title: 'เลือกเควสต์',
        body: 'Assigned คือเควสต์เนื้อเรื่อง ผ่านแล้วถึงปลดล็อก Investigation และ Tempered ที่ยากขึ้น\n🔒 คือยังลงไม่ได้',
      },
      {
        target: 'quest-list',
        title: 'อ่านป้ายเควสต์',
        body: '⏳ จำนวน Time Card (เวลาในการล่า) · 🔍 Scoutfly Level · 📜 จำนวนครั้งที่ยังลงได้ (Attempt)',
      },
    ],
  },

  questDetail: {
    steps: [
      {
        target: 'detail-stats',
        title: 'รายละเอียดเควสต์',
        body: 'เวลาในการล่า ระดับ Scoutfly และ Attempt ที่เหลือ — Attempt หมดยังลงได้ แต่ต้องแวะ Downtime ก่อน',
      },
      {
        target: 'detail-start',
        optional: true,
        title: 'จุดเริ่มการผจญภัย',
        body: 'บทแรกของเรื่อง เปลี่ยนไปตามจำนวนครั้งที่เคยลงเควสต์นี้',
      },
      {
        target: 'detail-post',
        title: 'Post Quest',
        body: 'ตั้งชื่อห้อง (ใส่รหัสได้) แล้วเปิดล็อบบี้\nเล่นคนเดียวก็เริ่มจากตรงนี้ แล้วกด Ready ในล็อบบี้ได้เลย',
      },
    ],
  },

  roomBoard: {
    steps: [
      {
        target: 'rooms-code',
        title: 'เข้าห้องด้วยรหัส',
        body: 'กรอก Room Code 6 ตัวที่เพื่อนส่งมา หรือกด Reconnect เพื่อกลับห้องล่าสุด',
      },
      {
        target: 'rooms-list',
        title: 'ห้องที่เปิดอยู่',
        body: 'แตะการ์ดห้องเพื่อเข้าร่วม 🔒 คือห้องที่ต้องใส่รหัส\nการ์ดบอกมอนสเตอร์ ระดับ และสิทธิ์ลงเควสต์ของเรา',
      },
      {
        target: 'rooms-back',
        title: 'เปิดห้องเอง',
        body: 'กลับหน้า Quest Board เลือกเควสต์ แล้วกด Post Quest',
      },
    ],
  },

  lobby: {
    steps: [
      { target: 'lobby-code', title: 'Room Code', body: 'แตะเพื่อคัดลอก แล้วส่งให้เพื่อนร่วมตี้' },
      { target: 'lobby-quest', title: 'เควสต์ของห้องนี้', body: 'มอนสเตอร์และระดับที่ตี้จะลง' },
      {
        target: 'lobby-party',
        title: 'สมาชิก',
        body: 'สูงสุด 4 คน และ Class ห้ามซ้ำกัน — คนที่กด Ready แล้วจะขึ้นสถานะพร้อม',
      },
      { target: 'lobby-ready', title: 'Ready', body: 'ทุกคนกด Ready ครบ การล่าจะเริ่มเองอัตโนมัติ' },
      {
        target: 'lobby-host',
        optional: true,
        title: 'โอนหัวห้อง',
        body: 'Host ส่งต่อสิทธิ์ให้สมาชิกคนอื่นได้ — โอนแล้วเอาคืนเองไม่ได้',
      },
      {
        target: 'lobby-leave',
        title: 'ออกจากห้อง',
        body: 'Host กดคือยุบห้องทั้งห้อง สมาชิกกดคือออกคนเดียว',
      },
    ],
  },

  palicoDraft: {
    steps: [
      {
        target: 'draft-cards',
        title: 'เลือก Palico',
        body: 'ตี้ 1–2 คนได้การ์ด Palico สุ่มคนละ 2 ใบ เลือกเก็บ 1 ใบ ติดตัวไปตลอดเควสต์',
      },
      {
        target: 'draft-confirm',
        optional: true,
        title: 'ยืนยัน',
        body: 'แตะการ์ดที่ชอบแล้วกดยืนยัน — วางการ์ดจริงไว้ข้าง Quest Card บนโต๊ะ',
      },
      { target: 'draft-party', optional: true, title: 'ใครเลือกแล้วบ้าง', body: 'ทุกคนเลือกครบถึงจะไปต่อ' },
    ],
  },

  hqVote: {
    steps: [
      {
        target: 'hqvote-choices',
        title: 'แวะ Downtime ไหม?',
        body: 'แวะ Downtime ได้ทำกิจกรรม เช่น ทอยหาทรัพยากร หรือจ้าง Palico แต่วันในแคมเปญจะเพิ่ม\nหรือข้ามไปล่าเลย — ทั้งตี้โหวต',
      },
      {
        target: 'hqvote-palico',
        optional: true,
        title: 'Palico ที่ถืออยู่',
        body: "แตะดูความสามารถ — อยากเปลี่ยนใบให้แวะ Hunter's Lodge",
      },
    ],
  },

  downtime: {
    steps: [
      {
        target: 'dt-steps',
        title: 'จำนวนกิจกรรม',
        body: 'ช่องวงกลมคือกิจกรรมที่ทำได้รอบนี้ ทำแล้วจะมีไอคอนสถานที่ขึ้น',
      },
      {
        target: 'dt-party',
        optional: true,
        title: 'เพื่อนร่วมตี้',
        body: 'ดูว่าแต่ละคนอยู่ที่ไหนและทำไปกี่อย่างแล้ว',
      },
      {
        target: 'dt-locations',
        title: 'สถานที่',
        body: "Resource Center ทอยหาทรัพยากร · Provisions แลกของ · Meowscular Chef รับ Element Token · Hunter's Lodge จ้าง Palico · Poogie เสี่ยงโชค\nแต่ละที่เข้าได้ครั้งเดียว",
      },
      {
        target: 'dt-ready',
        title: 'พร้อมออกล่า',
        body: 'ทำเสร็จแล้วกดพร้อม ทุกคนพร้อมครบจะออกเดินทางทันที',
      },
    ],
  },

  dialog: {
    steps: [
      { target: 'dialog-story', title: 'บทสนทนา', body: 'เรื่องราวของเควสต์ อ่านจบแล้วเลือกทางไปต่อด้านล่าง' },
      {
        target: 'dialog-effects',
        optional: true,
        title: 'ผลของบทนี้',
        body: '⚡ แอปจัดการให้อัตโนมัติ · ✓ ทำแล้ว · ✋ ต้องทำเองบนกระดาน',
      },
      {
        target: 'dialog-choices',
        title: 'เลือกทางไป',
        body: 'เล่นเป็นตี้ทุกคนโหวต ถ้าเสียงเท่ากัน Host เป็นคนตัดสิน',
      },
      {
        target: 'dialog-timecard',
        title: 'Time Card',
        body: 'เวลาที่เหลือของเควสต์ — บางทางเลือกทำให้ต้องทิ้งการ์ด',
      },
      { target: 'dialog-potion', title: 'ยา', body: 'ยาที่ตี้มีอยู่ ถือได้สูงสุด 3 ขวด เอาไปใช้ตอนล่า' },
      {
        target: 'dialog-pack',
        title: 'กระเป๋า',
        body: 'ของที่เก็บได้ระหว่างทาง จะเข้าคลังตอนเข้าสู่การล่า',
      },
    ],
  },

  hunting: {
    steps: [
      {
        target: 'hunt-map',
        title: 'แผนที่',
        body: 'ดูจุดวางมอนสเตอร์และนักล่าตอนเริ่ม และตอนนักล่าล้ม',
      },
      {
        target: 'hunt-hp',
        title: 'HP มอนสเตอร์',
        body: 'กดลด/เพิ่มตามดาเมจที่ทำได้บนกระดาน\nHP หมดแล้วกดจบเทิร์นเพื่อยืนยันว่าล่าสำเร็จ',
      },
      {
        target: 'hunt-parts',
        title: 'ชิ้นส่วน',
        body: 'ใส่ Break Token ถึงเกณฑ์แล้ว Part แตก — ได้รางวัลเพิ่ม และบางชิ้นเปลี่ยนพฤติกรรมมอนสเตอร์',
      },
      {
        target: 'hunt-resist',
        title: 'ธาตุและสถานะ',
        body: 'แตะเพื่อใส่เครื่องหมายเมื่อโจมตีด้วยธาตุหรือสถานะ ครบเกณฑ์ความต้านทานจะติดผล',
      },
      {
        target: 'hunt-behavior',
        optional: true,
        title: 'เทิร์นมอนสเตอร์',
        body: 'การ์ดพฤติกรรมที่ใช้อยู่และใบถัดไป พร้อมจำนวน Hunter Turn ในรอบนี้\nHost กด Monster Turn เมื่อทุกคนเล่นครบ',
      },
      {
        target: 'hunt-timecard',
        optional: true,
        title: 'กอง Time Card',
        body: 'หมดกองคือหมดเวลา เควสต์ล้มเหลว',
      },
      {
        target: 'hunt-endturn',
        optional: true,
        title: 'จบเทิร์น',
        body: 'เล่นเทิร์นของคุณเสร็จแล้วกดที่นี่ ระบบจะจั่ว Time Card ให้',
      },
      {
        target: 'hunt-use',
        optional: true,
        title: 'ใช้ยา / ล้ม',
        body: 'กดใช้ยาหรือบันทึกว่าล้ม — ล้มครบ 3 ครั้งเควสต์ล้มเหลว',
      },
      {
        target: 'hunt-party',
        optional: true,
        title: 'ปาร์ตี้',
        body: 'สถานะจบเทิร์นของเพื่อนแต่ละคน และการ์ด Palico ของทุกคน',
      },
    ],
  },

  rewardRoll: {
    steps: [
      {
        target: 'reward-dice',
        title: 'ทอยเต๋ารางวัล',
        body: 'จำนวนลูกขึ้นกับประเภทเควสต์และจำนวนคนในตี้ แตะเพื่อทอย',
      },
      {
        target: 'reward-adjust',
        optional: true,
        title: 'ปรับจำนวนเต๋า',
        body: 'มีการ์ดหรือความสามารถที่เพิ่ม/ลดเต๋า ปรับได้ตรงนี้ก่อนทอย',
      },
      {
        target: 'reward-peek',
        optional: true,
        title: 'ตาราง Reward',
        body: 'ดูว่าผลรวมที่ทอยได้แลกเป็นอะไรได้บ้าง แตะช่องเพื่อดูสูตรคราฟ',
      },
    ],
  },

  rewardAssign: {
    steps: [
      {
        target: 'reward-chips',
        title: 'รวมค่าเต๋า',
        body: 'แตะเลือกเต๋าที่จะรวมกัน ผลรวมคือช่องรางวัลที่เลือกได้',
      },
      {
        target: 'reward-table',
        title: 'เลือกรางวัล',
        body: 'แตะช่องที่ตรงกับผลรวม — ช่องที่มีไอคอน Part จะได้เพิ่มถ้าชิ้นส่วนนั้นแตก',
      },
    ],
  },

  rewardTrade: {
    steps: [
      {
        target: 'trade-table',
        title: 'Trade Post',
        body: 'แลกของกันในตี้ — วางของของตัวเองขึ้นโต๊ะ แตะของของเพื่อนเพื่อรับ\nปิดเควสต์เมื่อทุกคนพร้อม',
      },
    ],
  },
}
