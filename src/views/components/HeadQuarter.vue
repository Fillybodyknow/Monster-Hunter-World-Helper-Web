<script setup>
import { ref, computed, onMounted } from 'vue'
import { hunter, loadHunter, saveHunter } from '@/stores/hunter'
import ancientData from '@/assets/files/ancient-quest-book.json'
import wildspireData from '@/assets/files/wildspire_book.json'

const getImg = (path) => `${import.meta.env.BASE_URL}${path}`

const selected = ref(new Set())
const showConfirm = ref(false)

onMounted(loadHunter)

const books = [
  { id: 'ancient',   name: 'Ancient Forest',  data: ancientData },
  { id: 'wildspire', name: 'Wildspire Waste', data: wildspireData },
]

const resettableList = computed(() => {
  if (!hunter.value) return []
  const result = []
  for (const book of books) {
    for (const monster of book.data) {
      for (const quest of monster.quest) {
        if (quest.quest_id === 1) continue
        const attempt = hunter.value.attempted_quest.find(
          (a) => a.monster_id === monster.monster_id && a.quest_id === quest.quest_id,
        )
        if (!attempt || attempt.attempted === 0) continue
        result.push({
          key: `${monster.monster_id}-${quest.quest_id}`,
          bookName: book.name,
          bookId: book.id,
          monster_id: monster.monster_id,
          monster_name: monster.monster_name,
          thumbnail: monster.thumbnail,
          quest_id: quest.quest_id,
          quest_type: quest.quest_type,
          attempted: attempt.attempted,
          total: quest.starting_point.length,
        })
      }
    }
  }
  return result
})

const bookGroups = computed(() => {
  const groups = {}
  for (const entry of resettableList.value) {
    if (!groups[entry.bookId]) {
      groups[entry.bookId] = { name: entry.bookName, entries: [] }
    }
    groups[entry.bookId].entries.push(entry)
  }
  return Object.values(groups)
})

const toggleSelect = (key) => {
  const s = new Set(selected.value)
  s.has(key) ? s.delete(key) : s.add(key)
  selected.value = s
}

const selectAll = () => {
  selected.value = new Set(resettableList.value.map((e) => e.key))
}

const clearAll = () => {
  selected.value = new Set()
}

const questTypeInfo = (type) => {
  if (type === 'Investigation Quest')
    return { label: 'INVESTIGATION', cls: 'stamp-investigation' }
  return { label: 'TEMPERED', cls: 'stamp-tempered' }
}

const confirmReset = () => {
  if (!hunter.value || selected.value.size === 0) return
  hunter.value.attempted_quest = hunter.value.attempted_quest.filter((a) => {
    if (a.quest_id === 1) return true
    return !selected.value.has(`${a.monster_id}-${a.quest_id}`)
  })
  saveHunter(hunter.value)
  selected.value = new Set()
  showConfirm.value = false
}

const addDay = () => {
  if (!hunter.value) return
  hunter.value.campaign_day = (hunter.value.campaign_day ?? 0) + 1
  saveHunter(hunter.value)
}
</script>

<template>
  <div class="hq-page">

    <!-- HEADER -->
    <div class="hq-header">
      <div class="hq-line"></div>
      <div class="hq-title-wrap">
        <span class="hq-ornament">⚔</span>
        <h2 class="hq-title">Head Quarter</h2>
        <span class="hq-ornament">⚔</span>
      </div>
      <div class="hq-line"></div>
    </div>

    <!-- HUNTER INFO -->
    <div v-if="hunter" class="hq-hunter-bar">
      <div class="hqh-label">นักล่าปัจจุบัน</div>
      <div class="hqh-name">{{ hunter.hunter_name }}</div>
      <div class="hqh-class">{{ hunter.hunter_class }}</div>
    </div>

    <!-- CAMP ACTIONS -->
    <div v-if="hunter" class="hq-camp-actions">
      <div class="hq-camp-label">CAMP LOG</div>
      <div class="hq-camp-row">
        <div class="hq-camp-day">
          <span class="hq-camp-day-num">{{ hunter.campaign_day ?? 1 }}</span>
          <span class="hq-camp-day-text">วันที่</span>
        </div>
        <button class="btn-add-day" @click="addDay">+ เพิ่มวัน</button>
      </div>
    </div>

    <!-- NOTICE -->
    <div class="hq-notice">
      <span class="hq-notice-stamp">VISIT THE HANDLER</span>
      <p class="hq-notice-text">
        เลือก Investigation และ Tempered quests เพื่อล้างบันทึกจำนวนการเล่น
        Assigned Quests เป็นบันทึกถาวรของสมาคมและไม่สามารถรีเซ็ตได้
      </p>
    </div>

    <!-- EMPTY STATE -->
    <div v-if="resettableList.length === 0" class="hq-empty">
      <div class="hq-empty-icon">📋</div>
      <p class="hq-empty-title">ไม่พบบันทึก</p>
      <p class="hq-empty-sub">ยังไม่มีการเล่น Investigation หรือ Tempered quests</p>
    </div>

    <!-- QUEST LIST -->
    <template v-else>

      <!-- ACTION BAR -->
      <div class="hq-action-bar">
        <div class="hq-select-btns">
          <button class="btn-select-all" @click="selectAll">เลือกทั้งหมด</button>
          <button class="btn-clear-sel" @click="clearAll" :disabled="selected.size === 0">ล้างการเลือก</button>
        </div>
        <button
          class="btn-reset"
          :disabled="selected.size === 0"
          @click="showConfirm = true"
        >
          <span class="btn-reset-icon">↺</span>
          รีเซ็ต ({{ selected.size }})
        </button>
      </div>

      <!-- GROUPS -->
      <div class="hq-groups">
        <div v-for="group in bookGroups" :key="group.name" class="hq-group">
          <div class="hq-group-header">
            <div class="hq-group-line"></div>
            <span class="hq-group-name">{{ group.name }}</span>
            <div class="hq-group-line"></div>
          </div>

          <div class="hq-quest-list">
            <div
              v-for="entry in group.entries"
              :key="entry.key"
              class="hq-quest-row"
              :class="{ selected: selected.has(entry.key) }"
              @click="toggleSelect(entry.key)"
            >
              <!-- Checkbox -->
              <div class="hqr-check" :class="{ checked: selected.has(entry.key) }">
                <span v-if="selected.has(entry.key)">✦</span>
              </div>

              <!-- Monster icon -->
              <img :src="getImg(entry.thumbnail)" class="hqr-img" />

              <!-- Info -->
              <div class="hqr-info">
                <div class="hqr-monster">{{ entry.monster_name }}</div>
                <div class="hqr-stamp-row">
                  <span class="hqr-stamp" :class="questTypeInfo(entry.quest_type).cls">
                    {{ questTypeInfo(entry.quest_type).label }}
                  </span>
                </div>
              </div>

              <!-- Attempts -->
              <div class="hqr-attempts">
                <span class="hqr-attempts-used">{{ entry.attempted }}</span>
                <span class="hqr-attempts-sep">/</span>
                <span class="hqr-attempts-total">{{ entry.total }}</span>
                <span class="hqr-attempts-label">ใช้แล้ว</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- CONFIRM MODAL -->
    <teleport to="body">
      <div v-if="showConfirm" class="hq-confirm-overlay">
        <div class="hq-confirm-modal">
          <div class="hq-confirm-stamp">GUILD RESET ORDER</div>
          <p class="hq-confirm-question">รีเซ็ต {{ selected.size }} บันทึกเควส?</p>
          <p class="hq-confirm-desc">
            จำนวนการเล่นจะถูกล้าง และสามารถเล่นเควสใหม่ได้ตั้งแต่ต้น
            การกระทำนี้ไม่สามารถยกเลิกได้
          </p>
          <div class="hq-confirm-btns">
            <button class="hq-btn-confirm" @click="confirmReset">↺ ยืนยันการรีเซ็ต</button>
            <button class="hq-btn-cancel" @click="showConfirm = false">← กลับ</button>
          </div>
        </div>
      </div>
    </teleport>

  </div>
</template>

<style scoped>
/* ══════════════════════════════════════════
   BASE
══════════════════════════════════════════ */
.hq-page {
  display: flex;
  flex-direction: column;
  gap: 18px;
  color: #f0ddb0;
  font-family: 'Georgia', 'Times New Roman', serif;
  max-width: 680px;
  margin: 0 auto;
}

/* ══════════════════════════════════════════
   HEADER
══════════════════════════════════════════ */
.hq-header {
  display: flex;
  align-items: center;
  gap: 12px;
}
.hq-line {
  flex: 1;
  height: 1px;
  background: linear-gradient(to right, transparent, #7c5a2b);
}
.hq-line:last-child {
  background: linear-gradient(to left, transparent, #7c5a2b);
}
.hq-title-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
  white-space: nowrap;
}
.hq-title {
  margin: 0;
  font-size: 18px;
  color: #ffd27a;
  letter-spacing: 4px;
  text-transform: uppercase;
  text-shadow: 0 0 12px rgba(255, 200, 80, 0.4);
}
.hq-ornament { font-size: 13px; color: #7c5a2b; }

/* ══════════════════════════════════════════
   HUNTER BAR
══════════════════════════════════════════ */
.hq-hunter-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-radius: 8px;
  background: linear-gradient(to right, rgba(40, 28, 14, 0.9), rgba(20, 15, 8, 0.9));
  border: 1px solid rgba(124, 90, 43, 0.5);
  border-left: 3px solid #c89b3c;
}
.hqh-label {
  font-size: 9px;
  letter-spacing: 3px;
  text-transform: uppercase;
  color: #7c5a2b;
}
.hqh-name {
  font-size: 15px;
  color: #ffd27a;
  font-weight: bold;
  flex: 1;
}
.hqh-class {
  font-size: 11px;
  color: #a88040;
  letter-spacing: 1px;
}

/* ══════════════════════════════════════════
   NOTICE
══════════════════════════════════════════ */
.hq-notice {
  padding: 12px 16px;
  border-radius: 8px;
  background: rgba(10, 8, 4, 0.6);
  border: 1px solid rgba(124, 90, 43, 0.3);
  border-left: 3px solid #7c5a2b;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.hq-notice-stamp {
  font-size: 9px;
  letter-spacing: 4px;
  text-transform: uppercase;
  color: #7c5a2b;
}
.hq-notice-text {
  margin: 0;
  font-size: 12px;
  color: #7c5a2b;
  line-height: 1.6;
  font-style: italic;
}

/* ══════════════════════════════════════════
   EMPTY STATE
══════════════════════════════════════════ */
.hq-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 40px 20px;
  border-radius: 10px;
  border: 1px dashed rgba(124, 90, 43, 0.3);
  text-align: center;
}
.hq-empty-icon { font-size: 36px; opacity: 0.4; }
.hq-empty-title { margin: 0; font-size: 14px; color: #7c5a2b; letter-spacing: 2px; }
.hq-empty-sub { margin: 0; font-size: 12px; color: #4a3520; font-style: italic; }

/* ══════════════════════════════════════════
   ACTION BAR
══════════════════════════════════════════ */
.hq-action-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.hq-select-btns {
  display: flex;
  gap: 8px;
}
.btn-select-all,
.btn-clear-sel {
  padding: 7px 14px;
  border-radius: 6px;
  border: 1px solid rgba(124, 90, 43, 0.5);
  background: rgba(10, 8, 4, 0.7);
  color: #a88040;
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
  transition: 0.2s;
  min-height: 36px;
}
.btn-select-all:hover { border-color: #c89b3c; color: #c89b3c; }
.btn-clear-sel:hover:not(:disabled) { border-color: #c89b3c; color: #c89b3c; }
.btn-clear-sel:disabled { opacity: 0.35; cursor: default; }

.btn-reset {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 18px;
  border-radius: 6px;
  border: 1px solid #8c3a3a;
  background: linear-gradient(to bottom, #3a1a1a, #1a0d0d);
  color: #ff6b6b;
  font-family: inherit;
  font-size: 13px;
  font-weight: bold;
  cursor: pointer;
  transition: 0.2s;
  min-height: 36px;
}
.btn-reset:hover:not(:disabled) {
  box-shadow: 0 0 14px rgba(255, 80, 80, 0.35);
  border-color: #cc4444;
}
.btn-reset:disabled { opacity: 0.35; cursor: default; }
.btn-reset-icon { font-size: 16px; }

/* ══════════════════════════════════════════
   GROUPS
══════════════════════════════════════════ */
.hq-groups { display: flex; flex-direction: column; gap: 16px; }

.hq-group-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}
.hq-group-line {
  flex: 1;
  height: 1px;
  background: linear-gradient(to right, transparent, rgba(124, 90, 43, 0.4));
}
.hq-group-line:last-child {
  background: linear-gradient(to left, transparent, rgba(124, 90, 43, 0.4));
}
.hq-group-name {
  font-size: 10px;
  letter-spacing: 3px;
  text-transform: uppercase;
  color: #7c5a2b;
  white-space: nowrap;
}

/* ══════════════════════════════════════════
   QUEST ROWS
══════════════════════════════════════════ */
.hq-quest-list { display: flex; flex-direction: column; gap: 6px; }

.hq-quest-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-radius: 8px;
  border: 1px solid rgba(124, 90, 43, 0.35);
  background: linear-gradient(to right, rgba(28, 20, 10, 0.9), rgba(15, 11, 7, 0.9));
  cursor: pointer;
  transition: 0.18s;
  user-select: none;
}
.hq-quest-row:hover {
  border-color: rgba(200, 155, 60, 0.5);
  background: linear-gradient(to right, rgba(40, 28, 14, 0.95), rgba(22, 16, 9, 0.95));
}
.hq-quest-row.selected {
  border-color: #8c3a3a;
  background: linear-gradient(to right, rgba(50, 18, 18, 0.95), rgba(20, 8, 8, 0.95));
  box-shadow: inset 0 0 16px rgba(200, 50, 50, 0.08);
}

/* Checkbox */
.hqr-check {
  width: 22px;
  height: 22px;
  border-radius: 4px;
  border: 1px solid rgba(124, 90, 43, 0.5);
  background: rgba(5, 4, 2, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: 0.15s;
  font-size: 11px;
  color: #ff6b6b;
}
.hqr-check.checked {
  border-color: #8c3a3a;
  background: rgba(140, 58, 58, 0.2);
}

/* Monster icon */
.hqr-img {
  width: 44px;
  height: 44px;
  object-fit: contain;
  flex-shrink: 0;
  filter: drop-shadow(0 0 4px rgba(0, 0, 0, 0.6));
}

/* Info */
.hqr-info { flex: 1; min-width: 0; }
.hqr-monster {
  font-size: 14px;
  color: #e0c88a;
  font-weight: bold;
  line-height: 1.3;
}
.hqr-stamp-row { margin-top: 4px; }
.hqr-stamp {
  display: inline-block;
  font-size: 8px;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  font-family: 'Arial Narrow', 'Arial', sans-serif;
  font-weight: bold;
  padding: 2px 8px;
  border-radius: 3px;
}
.stamp-investigation {
  border: 1px solid #4499ff;
  color: #4499ff;
  background: rgba(68, 153, 255, 0.08);
}
.stamp-tempered {
  border: 1px solid #cc77ff;
  color: #cc77ff;
  background: rgba(200, 120, 255, 0.08);
}

/* Attempts counter */
.hqr-attempts {
  display: flex;
  align-items: baseline;
  gap: 2px;
  flex-shrink: 0;
  text-align: right;
}
.hqr-attempts-used { font-size: 20px; font-weight: bold; color: #ff6b6b; line-height: 1; }
.hqr-attempts-sep  { font-size: 14px; color: #5a3d1f; }
.hqr-attempts-total { font-size: 14px; color: #7c5a2b; }
.hqr-attempts-label {
  font-size: 9px;
  color: #5a3d1f;
  letter-spacing: 1px;
  text-transform: uppercase;
  margin-left: 2px;
}

/* ══════════════════════════════════════════
   CONFIRM MODAL
══════════════════════════════════════════ */
.hq-confirm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(5, 4, 2, 0.8);
  backdrop-filter: blur(10px) brightness(0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 300;
  padding: 16px;
}
.hq-confirm-modal {
  width: min(420px, 100%);
  padding: 24px;
  border-radius: 12px;
  background: linear-gradient(160deg, #1c1508, #13100a, #1c1508);
  border: 2px solid #8c3a3a;
  box-shadow: 0 0 40px rgba(0, 0, 0, 0.9), 0 0 20px rgba(200, 60, 60, 0.12);
  display: flex;
  flex-direction: column;
  gap: 14px;
  animation: hqModalIn 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
  font-family: 'Georgia', serif;
}
@keyframes hqModalIn {
  from { transform: scale(0.85); opacity: 0; }
  to   { transform: scale(1);    opacity: 1; }
}
.hq-confirm-stamp {
  text-align: center;
  font-size: 9px;
  letter-spacing: 5px;
  text-transform: uppercase;
  color: #ff6b6b;
  border: 1px solid rgba(200, 60, 60, 0.35);
  border-radius: 4px;
  padding: 4px 14px;
  width: fit-content;
  margin: 0 auto;
  background: rgba(200, 60, 60, 0.07);
}
.hq-confirm-question {
  margin: 0;
  font-size: 17px;
  color: #ffd27a;
  text-align: center;
}
.hq-confirm-desc {
  margin: 0;
  font-size: 12px;
  color: #7c5a2b;
  text-align: center;
  font-style: italic;
  line-height: 1.6;
}
.hq-confirm-btns { display: flex; gap: 10px; }
.hq-btn-confirm {
  flex: 1;
  padding: 13px;
  border-radius: 8px;
  border: 2px solid #8c3a3a;
  background: linear-gradient(to bottom, #3a1a1a, #1a0d0d);
  color: #ff6b6b;
  font-family: 'Georgia', serif;
  font-size: 14px;
  font-weight: bold;
  letter-spacing: 1px;
  cursor: pointer;
  transition: 0.2s;
  min-height: 48px;
}
.hq-btn-confirm:hover {
  box-shadow: 0 0 16px rgba(255, 80, 80, 0.4);
  border-color: #cc4444;
}
.hq-btn-cancel {
  padding: 13px 16px;
  border-radius: 8px;
  border: 1px solid rgba(124, 90, 43, 0.4);
  background: rgba(10, 8, 4, 0.6);
  color: #7c5a2b;
  font-family: 'Georgia', serif;
  font-size: 13px;
  cursor: pointer;
  transition: 0.2s;
  min-height: 48px;
}
.hq-btn-cancel:hover { color: #a88040; }

/* ══════════════════════════════════════════
   CAMP ACTIONS
══════════════════════════════════════════ */
.hq-camp-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 16px;
  border-radius: 8px;
  background: linear-gradient(to right, rgba(40, 28, 14, 0.9), rgba(20, 15, 8, 0.9));
  border: 1px solid rgba(124, 90, 43, 0.5);
  border-left: 3px solid #c89b3c;
}

.hq-camp-label {
  font-size: 9px;
  letter-spacing: 4px;
  text-transform: uppercase;
  color: #7c5a2b;
}

.hq-camp-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.hq-camp-day {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.hq-camp-day-num {
  font-size: 32px;
  font-weight: bold;
  color: #ffd27a;
  line-height: 1;
  text-shadow: 0 0 12px rgba(255, 210, 100, 0.4);
}

.hq-camp-day-text {
  font-size: 11px;
  color: #a88040;
  letter-spacing: 2px;
}

.btn-add-day {
  padding: 8px 18px;
  border-radius: 6px;
  border: 1px solid #c89b3c;
  background: linear-gradient(to bottom, #2a1f0a, #1a1208);
  color: #ffd27a;
  font-family: inherit;
  font-size: 13px;
  font-weight: bold;
  letter-spacing: 1px;
  cursor: pointer;
  transition: 0.2s;
  min-height: 38px;
}

.btn-add-day:hover {
  background: linear-gradient(to bottom, #3a2d10, #221908);
  box-shadow: 0 0 12px rgba(200, 155, 60, 0.3);
}

/* ══════════════════════════════════════════
   RESPONSIVE
══════════════════════════════════════════ */
@media (max-width: 480px) {
  .hq-title { font-size: 14px; letter-spacing: 2px; }
  .hq-quest-row { padding: 8px 10px; gap: 8px; }
  .hqr-img { width: 36px; height: 36px; }
  .hqr-monster { font-size: 13px; }
  .hqr-attempts-used { font-size: 17px; }
  .hq-confirm-modal { padding: 18px 16px; }
  .hq-confirm-btns { flex-direction: column; }
  .hq-action-bar { flex-direction: column; align-items: flex-start; }
  .btn-reset { width: 100%; justify-content: center; }
}
</style>
