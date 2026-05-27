<script setup>
import { useRoute } from 'vue-router'
import { computed } from 'vue'
const route = useRoute()

const isHomePage = computed(() => route.path === '/')
const logo = `${import.meta.env.BASE_URL}assets/img/UI/icon.jpg`
</script>

<template>
  <div class="app-wrapper">
    <!-- LOGO + TITLE HEADER -->
    <div class="app-header" :class="{ compact: !isHomePage }">
      <div class="logo-frame">
        <img :src="logo" id="logo" :class="{ small: !isHomePage }" />
      </div>
      <div v-if="isHomePage" class="app-title-block">
        <div class="title-ornament">✦ ✦ ✦</div>
        <h1 class="app-title">Monster Hunter World</h1>
        <p class="app-subtitle">Board Game Companion</p>
        <div class="title-ornament">✦ ✦ ✦</div>
      </div>
    </div>

    <!-- CONTENT -->
    <div class="content-panel">
      <router-view />
    </div>

    <!-- FOOTER -->
    <div class="app-footer">
      <span class="footer-text">Hunter's Guild Board Game Companion</span>
    </div>
  </div>
</template>

<style scoped>
/* ══════════════════════════════════════════
   GLOBAL WRAPPER
══════════════════════════════════════════ */
.app-wrapper {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 24px 12px 16px;
  gap: 0;
  font-family: 'Georgia', 'Times New Roman', serif;
}

/* ══════════════════════════════════════════
   HEADER
══════════════════════════════════════════ */
.app-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
  transition: all 0.3s;
}

.app-header.compact {
  flex-direction: row;
  gap: 14px;
  margin-bottom: 14px;
}

/* LOGO FRAME */
.logo-frame {
  position: relative;
  display: inline-flex;
}

.logo-frame::before {
  content: '';
  position: absolute;
  inset: -4px;
  border-radius: 50%;
  background: conic-gradient(
    #c89b3c 0deg, #ffd27a 60deg, #c89b3c 120deg,
    #7c5a2b 180deg, #c89b3c 240deg, #ffd27a 300deg, #c89b3c 360deg
  );
  opacity: 0.7;
  z-index: 0;
}

#logo {
  position: relative;
  z-index: 1;
  width: 130px;
  height: 130px;
  object-fit: cover;
  border-radius: 50%;
  border: 3px solid #7c5a2b;
  box-shadow:
    0 0 20px rgba(255, 200, 100, 0.5),
    0 0 40px rgba(255, 150, 50, 0.2),
    inset 0 0 10px rgba(255, 200, 100, 0.2);
  transition: all 0.3s;
}

#logo.small {
  width: 56px;
  height: 56px;
}

/* TITLE BLOCK */
.app-title-block {
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.app-title {
  margin: 0;
  font-size: 28px;
  color: #ffd27a;
  letter-spacing: 3px;
  text-transform: uppercase;
  text-shadow:
    0 0 20px rgba(255, 200, 80, 0.6),
    0 2px 6px rgba(0,0,0,0.9);
}

.app-subtitle {
  margin: 0;
  font-size: 12px;
  color: #a88040;
  letter-spacing: 5px;
  text-transform: uppercase;
}

.title-ornament {
  color: #7c5a2b;
  font-size: 10px;
  letter-spacing: 8px;
}

/* ══════════════════════════════════════════
   CONTENT PANEL
══════════════════════════════════════════ */
.content-panel {
  width: min(1200px, 96%);
  padding: 28px;
  border-radius: 16px;
  background: rgba(16, 12, 8, 0.82);
  border: 2px solid #7c5a2b;
  box-shadow:
    0 0 30px rgba(0, 0, 0, 0.9),
    0 0 60px rgba(0, 0, 0, 0.5),
    inset 0 0 20px rgba(255, 200, 100, 0.06);
  backdrop-filter: blur(8px);
  position: relative;
  overflow: hidden;
}

/* Corner ornaments */
.content-panel::before,
.content-panel::after {
  content: '◆';
  position: absolute;
  color: #7c5a2b;
  font-size: 12px;
  opacity: 0.6;
}
.content-panel::before { top: 8px; left: 10px; }
.content-panel::after  { bottom: 8px; right: 10px; }

/* ══════════════════════════════════════════
   FOOTER
══════════════════════════════════════════ */
.app-footer {
  margin-top: 14px;
  padding: 6px;
}

.footer-text {
  font-size: 10px;
  color: #5a3d1f;
  letter-spacing: 2px;
  text-transform: uppercase;
}

/* ══════════════════════════════════════════
   RESPONSIVE
══════════════════════════════════════════ */
@media (max-width: 768px) {
  .app-wrapper {
    padding: 16px 8px 12px;
  }

  .app-header {
    margin-bottom: 14px;
  }

  #logo {
    width: 100px;
    height: 100px;
  }

  #logo.small {
    width: 46px;
    height: 46px;
  }

  .app-title {
    font-size: 20px;
    letter-spacing: 2px;
  }

  .content-panel {
    padding: 18px 14px;
    border-radius: 12px;
    width: 98%;
  }
}

@media (max-width: 480px) {
  .app-wrapper {
    padding: 10px 6px 10px;
  }

  #logo {
    width: 80px;
    height: 80px;
  }

  #logo.small {
    width: 40px;
    height: 40px;
  }

  .app-title {
    font-size: 16px;
    letter-spacing: 1px;
  }

  .app-subtitle {
    font-size: 10px;
    letter-spacing: 3px;
  }

  .content-panel {
    padding: 12px 10px;
    border-radius: 10px;
    width: 100%;
  }
}
</style>
