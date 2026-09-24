import { ref } from 'vue'

// กำลังอยู่ในเควสหรือเปล่า — หน้าอื่นใช้กันไม่ให้แก้ของกลางคัน (เช่น เปลี่ยนสายอาวุธในหน้า State)
// Quest.vue เก็บ phase ไว้ในตัวเองและถูก keep-alive อยู่ หน้าอื่นจึงอ่านตรงไม่ได้ ต้องให้มันบอกผ่านที่นี่
export const questInProgress = ref(false)
