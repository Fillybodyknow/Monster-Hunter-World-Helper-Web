<script setup>
import { ref, computed } from 'vue'
// import component
import Quest from './components/Quest.vue'
import State from './components/State.vue'
import Inventory from './components/Inventory.vue'
import Equipment from './components/Equipment.vue'
import Crafting from './components/Crafting.vue'
import Setting from './components/Setting.vue'

const menus = [
  {
    menu: 'Quest',
    thumbnail: 'src/assets/img/menu_topbar_icon/quest.png',
  },
  {
    menu: 'State',
    thumbnail: 'src/assets/img/menu_topbar_icon/hunter.png',
  },
  {
    menu: 'Inventory',
    thumbnail: 'src/assets/img/menu_topbar_icon/inv.png',
  },
  {
    menu: 'Equipment',
    thumbnail: 'src/assets/img/menu_topbar_icon/equip.png',
  },
  {
    menu: 'Crafting',
    thumbnail: 'src/assets/img/menu_topbar_icon/craft.png',
  },
  {
    menu: 'Setting',
    thumbnail: 'src/assets/img/menu_topbar_icon/setting.png',
  },
]

const componentMap = {
  Quest,
  State,
  Inventory,
  Equipment,
  Crafting,
  Setting,
}

const currentComponent = computed(() => componentMap[activeMenu.value])

const activeMenu = ref('Quest')

// 🔥 helper
const getImg = (path) => path
</script>

<template>
  <div class="home">
    <!-- 🔥 TOPBAR -->
    <div class="topbar">
      <div
        v-for="item in menus"
        :key="item.menu"
        class="menu-item"
        :class="{ active: activeMenu === item.menu }"
        @click="activeMenu = item.menu"
      >
        <!-- 🔥 IMAGE -->
        <img :src="getImg(item.thumbnail)" />

        <!-- TEXT -->
        <span>{{ item.menu }}</span>
      </div>
    </div>

    <!-- 🔥 CONTENT -->
    <div class="content">
      <transition name="fade" mode="out-in">
        <component :is="currentComponent" />
      </transition>
    </div>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: 0.2s;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(10px);
}

.home {
  width: 100%;
}

/* ===== TOPBAR ===== */
.topbar {
  display: flex;
  justify-content: space-between;
  gap: 10px;

  padding: 10px;
  border-radius: 12px;

  background: rgba(20, 15, 10, 0.9);
  border: 2px solid #7c5a2b;

  box-shadow:
    0 0 10px rgba(0, 0, 0, 0.8),
    inset 0 0 10px rgba(255, 200, 100, 0.1);
}

/* ITEM */
.menu-item {
  flex: 1;

  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;

  padding: 8px;
  border-radius: 8px;

  cursor: pointer;
  color: #f5d7a1;

  transition: 0.2s;
}

/* 🔥 ICON */
.menu-item img {
  width: 30px;
  height: 30px;
  object-fit: contain;

  filter: drop-shadow(0 0 4px rgba(255, 200, 100, 0.5));
}

/* HOVER */
.menu-item:hover {
  background: rgba(255, 200, 100, 0.1);
  transform: translateY(-2px);
}

/* ACTIVE */
.menu-item.active {
  background: linear-gradient(to bottom, #3a2c1a, #1a1208);
  border: 1px solid #7c5a2b;

  box-shadow: 0 0 10px rgba(255, 200, 100, 0.6);
}

/* CONTENT */
.content {
  margin-top: 20px;

  padding: 20px;
  border-radius: 12px;

  background: rgba(20, 15, 10, 0.7);
  border: 1px solid #7c5a2b;

  color: #f5d7a1;
}
</style>
