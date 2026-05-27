<script setup>
import { ref, onMounted, computed } from 'vue'
import { getHunterClasses } from '@/services/hunterService'

const classes = ref([])
const selected = ref(null)

const currentPage = ref(1)
const pageSize = 3

onMounted(async () => {
  classes.value = await getHunterClasses()
})

const emit = defineEmits(['select'])

const selectWeapon = (item) => {
  selected.value = item
  emit('select', item)
}

const totalPages = computed(() =>
  Math.ceil(classes.value.length / pageSize)
)

const paginatedClasses = computed(() => {
  const start = (currentPage.value - 1) * pageSize
  return classes.value.slice(start, start + pageSize)
})

const nextPage = () => {
  if (currentPage.value < totalPages.value) currentPage.value++
}

const prevPage = () => {
  if (currentPage.value > 1) currentPage.value--
}

const getImg = (path) => `${import.meta.env.BASE_URL}${path}`
</script>

<template>
  <div class="weapon-select">
    <div class="weapon-grid">
      <div
        v-for="item in paginatedClasses"
        :key="item.hunter_class_id"
        class="weapon-card"
        :class="{ active: selected?.hunter_class_id === item.hunter_class_id }"
        @click="selectWeapon(item)"
      >
        <div class="wc-img-wrap">
          <img :src="getImg(item.thumbnail)" class="wc-img" />
        </div>
        <p class="wc-name">{{ item.hunter_class }}</p>
        <div v-if="selected?.hunter_class_id === item.hunter_class_id" class="wc-check">✦</div>
      </div>
    </div>

    <!-- PAGINATION -->
    <div class="pagination">
      <button class="pg-btn" @click="prevPage" :disabled="currentPage === 1">◄</button>
      <span class="pg-info">{{ currentPage }} / {{ totalPages }}</span>
      <button class="pg-btn" @click="nextPage" :disabled="currentPage === totalPages">►</button>
    </div>
  </div>
</template>

<style scoped>
/* ══════════════════════════════════════════
   BASE
══════════════════════════════════════════ */
.weapon-select {
  display: flex;
  flex-direction: column;
  gap: 12px;
  font-family: 'Georgia', 'Times New Roman', serif;
}

/* ══════════════════════════════════════════
   WEAPON GRID
══════════════════════════════════════════ */
.weapon-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

/* ══════════════════════════════════════════
   WEAPON CARD
══════════════════════════════════════════ */
.weapon-card {
  position: relative;
  padding: 12px 8px 10px;
  border-radius: 10px;
  cursor: pointer;
  border: 1px solid rgba(124, 90, 43, 0.5);
  background: linear-gradient(160deg, rgba(28, 20, 10, 0.9), rgba(16, 12, 6, 0.95));
  text-align: center;
  transition: all 0.18s;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.weapon-card:hover {
  border-color: #a88040;
  transform: translateY(-2px);
  box-shadow: 0 4px 14px rgba(0,0,0,0.5), 0 0 8px rgba(200, 155, 60, 0.15);
}

.weapon-card.active {
  border: 2px solid #c89b3c;
  box-shadow:
    0 0 16px rgba(200, 155, 60, 0.45),
    inset 0 0 10px rgba(200, 155, 60, 0.08);
  background: linear-gradient(160deg, rgba(40, 28, 12, 0.95), rgba(20, 14, 6, 0.98));
}

/* IMAGE */
.wc-img-wrap {
  width: 56px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.wc-img {
  width: 56px;
  height: 56px;
  object-fit: contain;
  filter: drop-shadow(0 0 5px rgba(255, 200, 100, 0.35));
  transition: 0.18s;
}

.weapon-card.active .wc-img {
  filter: drop-shadow(0 0 10px rgba(255, 200, 100, 0.6));
}

/* NAME */
.wc-name {
  margin: 0;
  font-size: 10px;
  color: #a88040;
  letter-spacing: 0.5px;
  line-height: 1.3;
  transition: 0.18s;
}

.weapon-card.active .wc-name {
  color: #ffd27a;
  text-shadow: 0 0 6px rgba(255, 200, 80, 0.4);
}

/* CHECK MARK */
.wc-check {
  position: absolute;
  top: 5px;
  right: 7px;
  font-size: 8px;
  color: #c89b3c;
  text-shadow: 0 0 6px rgba(200, 155, 60, 0.6);
}

/* ══════════════════════════════════════════
   PAGINATION
══════════════════════════════════════════ */
.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 16px;
}

.pg-btn {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  border: 1px solid #5a3d1f;
  background: linear-gradient(to bottom, #2a1e10, #17120c);
  color: #c89b3c;
  font-size: 11px;
  cursor: pointer;
  transition: 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.pg-btn:hover:not(:disabled) {
  border-color: #c89b3c;
  box-shadow: 0 0 8px rgba(200, 155, 60, 0.3);
  color: #ffd27a;
}

.pg-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.pg-info {
  font-size: 12px;
  color: #7c5a2b;
  letter-spacing: 2px;
  min-width: 40px;
  text-align: center;
}

/* ══════════════════════════════════════════
   RESPONSIVE
══════════════════════════════════════════ */
@media (max-width: 480px) {
  .wc-img-wrap, .wc-img { width: 46px; height: 46px; }
  .wc-name { font-size: 9px; }
  .weapon-grid { gap: 6px; }
}
</style>
