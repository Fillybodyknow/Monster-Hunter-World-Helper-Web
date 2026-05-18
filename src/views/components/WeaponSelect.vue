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

/* 🔥 pagination logic */
const totalPages = computed(() =>
  Math.ceil(classes.value.length / pageSize)
)

const paginatedClasses = computed(() => {
  const start = (currentPage.value - 1) * pageSize
  return classes.value.slice(start, start + pageSize)
})

/* 🔁 เปลี่ยนหน้า */
const nextPage = () => {
  if (currentPage.value < totalPages.value) currentPage.value++
}

const prevPage = () => {
  if (currentPage.value > 1) currentPage.value--
}

const getImg = (path) => `/src/${path}`
</script>

<template>
  <div class="weapon-grid">
    <div
      v-for="item in paginatedClasses"
      :key="item.hunter_class_id"
      class="weapon-card"
      :class="{ active: selected?.hunter_class_id === item.hunter_class_id }"
      @click="selectWeapon(item)"
    >
      <img :src="getImg(item.thumbnail)" />
      <p>{{ item.hunter_class }}</p>
    </div>
  </div>

  <!-- 🔥 PAGINATION -->
  <div class="pagination">
    <button @click="prevPage" :disabled="currentPage === 1">
      ◀
    </button>

    <span>{{ currentPage }} / {{ totalPages }}</span>

    <button @click="nextPage" :disabled="currentPage === totalPages">
      ▶
    </button>
  </div>
</template>

<style scoped>
.pagination {
  margin-top: 15px;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 15px;
}

.pagination button {
  padding: 8px 12px;
  border-radius: 8px;
  border: 2px solid #7c5a2b;

  background: linear-gradient(to bottom, #3a2c1a, #1a1208);
  color: #f5d7a1;

  cursor: pointer;
}

.pagination button:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.weapon-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 15px;
}

/* CARD */
.weapon-card {
  padding: 10px;
  border-radius: 10px;
  cursor: pointer;

  border: 2px solid #5a4321;
  background: rgba(30, 20, 10, 0.8);

  text-align: center;
  transition: all 0.2s;
}

.weapon-card img {
  width: 60px;
  height: 60px;
  object-fit: contain;
}

.weapon-card p {
  margin-top: 8px;
  font-size: 14px;
  color: #f5d7a1;
}

/* HOVER */
.weapon-card:hover {
  transform: scale(1.05);
  box-shadow: 0 0 10px rgba(255, 200, 100, 0.6);
}

/* SELECTED */
.weapon-card.active {
  border-color: gold;
  box-shadow: 0 0 15px rgba(255, 200, 100, 0.9);
}
</style>