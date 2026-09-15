<script setup>
// รายการอัปเดต — ใช้ทั้งในหน้าต่าง "มีอะไรใหม่" (พื้นกระดาษ) และแบนเนอร์เวอร์ชันใหม่ (พื้นหนังเข้ม)
defineProps({
  entries: { type: Array, required: true },
  tone: { type: String, default: 'parchment' }, // parchment | dark
})

const SECTIONS = {
  new: { icon: '✨', label: 'ของใหม่' },
  fix: { icon: '🛠', label: 'แก้ไข' },
  improve: { icon: '⚙️', label: 'ปรับปรุง' },
}

const formatDate = (date) => {
  try {
    return new Date(`${date}T00:00:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch {
    return date
  }
}
</script>

<template>
  <div class="cl" :class="`cl-${tone}`">
    <article v-for="entry in entries" :key="entry.id" class="cl-entry">
      <header class="cl-head">
        <h4 class="cl-title">{{ entry.title }}</h4>
        <span class="cl-date">{{ formatDate(entry.date) }}</span>
      </header>
      <section v-for="section in entry.sections" :key="section.type" class="cl-section">
        <p class="cl-section-label">
          {{ SECTIONS[section.type]?.icon }} {{ SECTIONS[section.type]?.label ?? section.type }}
        </p>
        <ul class="cl-items">
          <li v-for="(item, i) in section.items" :key="i">{{ item }}</li>
        </ul>
      </section>
    </article>
  </div>
</template>

<style scoped>
.cl {
  display: flex;
  flex-direction: column;
  gap: 14px;
  text-align: left;
  font-family: 'Georgia', 'Times New Roman', serif;
}
.cl-entry + .cl-entry {
  padding-top: 12px;
  border-top: 1px dashed rgba(124, 90, 43, 0.45);
}
.cl-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 2px 10px;
}
.cl-title { margin: 0; font-size: 15px; line-height: 1.4; }
.cl-date { font-size: 11px; font-variant-numeric: tabular-nums; }
.cl-section { margin-top: 8px; }
.cl-section-label { margin: 0 0 3px; font-size: 12px; font-weight: bold; letter-spacing: 0.5px; }
.cl-items { margin: 0; padding-left: 18px; font-size: 13px; line-height: 1.6; }
.cl-items li + li { margin-top: 2px; }

/* พื้นกระดาษ — หมึกเข้ม */
.cl-parchment .cl-title { color: #3b2a14; }
.cl-parchment .cl-date { color: #8a6a3a; }
.cl-parchment .cl-section-label { color: #7a2414; }
.cl-parchment .cl-items { color: #2a1d0c; }

/* พื้นหนังเข้ม — ตัวอักษรสว่าง ขนาดเล็กลงให้พอดีแบนเนอร์ */
.cl-dark { gap: 12px; }
.cl-dark .cl-title { color: #ffd27a; font-size: 13px; }
.cl-dark .cl-date { color: rgba(168, 128, 64, 0.85); }
.cl-dark .cl-section-label { color: #e0b862; font-size: 11px; }
.cl-dark .cl-items { color: #e8d5a8; font-size: 12px; line-height: 1.55; }
</style>
