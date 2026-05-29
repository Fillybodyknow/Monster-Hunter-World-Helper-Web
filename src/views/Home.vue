<script setup>
import { ref, computed } from 'vue'
import Quest from './components/Quest.vue'
import State from './components/State.vue'
import Inventory from './components/Inventory.vue'
import Crafting from './components/Crafting.vue'
import Setting from './components/Setting.vue'
import HeadQuarter from './components/HeadQuarter.vue'

const menus = [
  { menu: 'Quest',       label: 'Quest',     thumbnail: 'assets/img/menu_topbar_icon/quest.png' },
  { menu: 'HeadQuarter', label: 'HQ',        thumbnail: 'assets/img/menu_topbar_icon/head_querter.png', white: true },
  { menu: 'State',       label: 'State',     thumbnail: 'assets/img/menu_topbar_icon/hunter.png' },
  { menu: 'Inventory',   label: 'Inventory', thumbnail: 'assets/img/menu_topbar_icon/inv.png' },
  { menu: 'Crafting',    label: 'Crafting',  thumbnail: 'assets/img/menu_topbar_icon/craft.png' },
  { menu: 'Setting',     label: 'Setting',   thumbnail: 'assets/img/menu_topbar_icon/setting.png' },
]

const componentMap = { Quest, State, Inventory, Crafting, HeadQuarter, Setting }
const currentComponent = computed(() => componentMap[activeMenu.value])
const activeMenu = ref('Quest')

const getImg = (path) => `${import.meta.env.BASE_URL}${path}`
</script>

<template>
  <div class="home">

    <!-- ══════════ TOPBAR / NAV ══════════ -->
    <nav class="topbar" role="navigation">
      <div
        v-for="item in menus"
        :key="item.menu"
        class="nav-item"
        :class="{ active: activeMenu === item.menu }"
        @click="activeMenu = item.menu"
        :aria-label="item.menu"
      >
        <div class="nav-icon-wrap">
          <img
            :src="getImg(item.thumbnail)"
            class="nav-icon"
            :style="item.white ? 'filter: brightness(0) invert(1)' : ''"
          />
        </div>
        <span class="nav-label">{{ item.label ?? item.menu }}</span>
        <div v-if="activeMenu === item.menu" class="nav-underline"></div>
      </div>
    </nav>

    <!-- ══════════ SECTION TITLE BAR ══════════ -->
    <div class="section-title-bar">
      <div class="stb-line"></div>
      <div class="stb-text">
        <span class="stb-ornament">◆</span>
        <span class="stb-label">{{ activeMenu }}</span>
        <span class="stb-ornament">◆</span>
      </div>
      <div class="stb-line"></div>
    </div>

    <!-- ══════════ CONTENT ══════════ -->
    <div class="content">
      <transition name="fade" mode="out-in">
        <keep-alive include="Quest">
          <component :is="currentComponent" />
        </keep-alive>
      </transition>
    </div>
  </div>
</template>

<style scoped>
/* ══════════════════════════════════════════
   BASE
══════════════════════════════════════════ */
.home {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 0;
  font-family: 'Georgia', 'Times New Roman', serif;
}

/* ══════════════════════════════════════════
   TOPBAR
══════════════════════════════════════════ */
.topbar {
  display: flex;
  align-items: stretch;
  gap: 2px;
  padding: 6px 8px;
  border-radius: 12px 12px 0 0;
  background: linear-gradient(to bottom, #1a1208, #0f0c06);
  border: 2px solid #7c5a2b;
  border-bottom: 1px solid #5a3d1f;
  overflow-x: auto;
  scrollbar-width: none;
}

.topbar::-webkit-scrollbar { display: none; }

/* NAV ITEM */
.nav-item {
  flex: 1;
  min-width: 64px;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 6px 6px;
  border-radius: 8px;
  cursor: pointer;
  color: #7c5a2b;
  transition: all 0.2s;
  white-space: nowrap;
}

.nav-item:hover {
  color: #c89b3c;
  background: rgba(255, 200, 100, 0.06);
}

/* ACTIVE */
.nav-item.active {
  color: #ffd27a;
  background: linear-gradient(to bottom, rgba(60, 40, 15, 0.9), rgba(30, 20, 8, 0.8));
  box-shadow: inset 0 0 12px rgba(255, 200, 100, 0.15);
}

/* ICON */
.nav-icon-wrap {
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  transition: 0.2s;
}

.nav-item.active .nav-icon-wrap {
  background: rgba(255, 200, 100, 0.08);
}

.nav-icon {
  width: 26px;
  height: 26px;
  object-fit: contain;
  filter: drop-shadow(0 0 3px rgba(255, 200, 100, 0.3));
  transition: 0.2s;
}

.nav-item.active .nav-icon {
  filter: drop-shadow(0 0 8px rgba(255, 200, 100, 0.7));
}

.nav-item:hover .nav-icon {
  filter: drop-shadow(0 0 5px rgba(255, 200, 100, 0.5));
}

/* LABEL */
.nav-label {
  font-size: 10px;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  transition: 0.2s;
}

.nav-item.active .nav-label {
  color: #ffd27a;
  text-shadow: 0 0 8px rgba(255, 200, 80, 0.5);
}

/* UNDERLINE indicator */
.nav-underline {
  position: absolute;
  bottom: 0;
  left: 20%;
  right: 20%;
  height: 2px;
  border-radius: 2px;
  background: linear-gradient(to right, transparent, #c89b3c, transparent);
  box-shadow: 0 0 6px rgba(200, 155, 60, 0.8);
}

/* ══════════════════════════════════════════
   SECTION TITLE BAR
══════════════════════════════════════════ */
.section-title-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: linear-gradient(to bottom, #0f0c06, #17120c);
  border-left: 2px solid #7c5a2b;
  border-right: 2px solid #7c5a2b;
}

.stb-line {
  flex: 1;
  height: 1px;
  background: linear-gradient(to right, transparent, #5a3d1f);
}

.stb-line:last-child {
  background: linear-gradient(to left, transparent, #5a3d1f);
}

.stb-text {
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}

.stb-label {
  font-size: 11px;
  letter-spacing: 4px;
  text-transform: uppercase;
  color: #a88040;
}

.stb-ornament {
  font-size: 7px;
  color: #7c5a2b;
}

/* ══════════════════════════════════════════
   CONTENT
══════════════════════════════════════════ */
.content {
  padding: 20px 4px 4px;
  min-height: 200px;
}

/* ══════════════════════════════════════════
   TRANSITIONS
══════════════════════════════════════════ */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.18s, transform 0.18s;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(6px);
}

/* ══════════════════════════════════════════
   RESPONSIVE — iPad (≤768px)
══════════════════════════════════════════ */
@media (max-width: 768px) {
  .topbar {
    padding: 4px 6px;
    gap: 1px;
    border-radius: 10px 10px 0 0;
  }

  .nav-item {
    min-width: 52px;
    padding: 7px 4px 5px;
    gap: 3px;
  }

  .nav-icon {
    width: 22px;
    height: 22px;
  }

  .nav-label {
    font-size: 9px;
    letter-spacing: 0;
  }

  .content {
    padding: 16px 2px 2px;
  }
}

/* ══════════════════════════════════════════
   RESPONSIVE — Phone (≤480px)
══════════════════════════════════════════ */
@media (max-width: 480px) {
  .topbar {
    padding: 4px;
    gap: 0;
  }

  .nav-item {
    flex: 1;
    min-width: 0;
    padding: 6px 2px 4px;
    gap: 3px;
  }

  .nav-icon-wrap {
    width: 28px;
    height: 28px;
  }

  .nav-icon {
    width: 20px;
    height: 20px;
  }

  .nav-label {
    font-size: 8px;
    letter-spacing: 0;
  }

  .section-title-bar {
    padding: 6px 8px;
  }

  .stb-label {
    font-size: 10px;
    letter-spacing: 2px;
  }

  .content {
    padding: 12px 0 0;
  }
}
</style>
