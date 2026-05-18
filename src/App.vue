<script setup>
import { useRoute } from 'vue-router'
import { computed } from 'vue'
import logo from './assets/img/UI/icon.jpg'

const route = useRoute()

// 🔥 เช็คว่าอยู่หน้า index ("/") หรือไม่
const isHomePage = computed(() => route.path === '/')
</script>

<template>
  <div class="app-wrapper justify-content-start mt-5">
    <!-- LOGO -->
    <div class="logo-wrapper mb-5">
      <img :src="logo" id="logo" :class="{ small: !isHomePage }" />
    </div>

    <!-- CONTENT -->
    <div class="content-panel">
      <router-view />
    </div>
  </div>
</template>

<style scoped>
.app-wrapper {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

/* LOGO */
.logo-wrapper {
  margin-bottom: 10px;
}

#logo {
  width: 150px;
  height: 150px;
  object-fit: cover;
  border-radius: 50%;

  border: 3px solid #7c5a2b;

  box-shadow:
    0 0 15px rgba(255, 200, 100, 0.6),
    inset 0 0 10px rgba(255, 200, 100, 0.3);
}

/* PANEL */
.content-panel {
  padding: 40px;
  border-radius: 16px;

  background: rgba(20, 15, 10, 0.75);
  border: 2px solid #7c5a2b;

  box-shadow:
    0 0 20px rgba(0, 0, 0, 0.8),
    inset 0 0 15px rgba(255, 200, 100, 0.1);

  backdrop-filter: blur(6px);

  width: 90%;
}

#logo {
  width: 150px;
  height: 150px;
  transition: 0.3s;
}

/* 🔥 ตอนอยู่นอก "/" */
#logo.small {
  width: 80px;
  height: 80px;
}
</style>
