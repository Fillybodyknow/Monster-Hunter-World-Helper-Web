<script setup>
import { craftLookupItem, craftLookupResults, closeCraftLookup } from '@/composables/useCraftLookup'
import resourceData from '@/assets/files/resource.json'
import hunterClassData from '@/assets/files/class_hunter.json'

const getImg = (path) => `${import.meta.env.BASE_URL}${path}`

const getResourceItem = (type_id, item_id) => {
  const type = resourceData.find((t) => t.resource_type_id === type_id)
  return type?.resources.find((r) => r.item_id === item_id) ?? null
}

const getHunterClass = (id) => hunterClassData.find((c) => c.hunter_class_id === id)
</script>

<template>
  <Teleport to="body">
    <Transition name="slain-fade">
      <div v-if="craftLookupItem" class="cl-overlay" @click.self="closeCraftLookup">
        <div class="cl-modal">
          <div class="cl-header">
            <span class="cl-title">🔨 คราฟจาก: {{ craftLookupItem.name }}</span>
            <button class="cl-close" @click="closeCraftLookup">✕</button>
          </div>

          <div v-if="craftLookupResults.length" class="cl-list">
            <div v-for="(r, i) in craftLookupResults" :key="i" class="cl-item">
              <img v-if="r.thumbnail" :src="getImg(r.thumbnail)" class="cl-item-img" />
              <div class="cl-item-info">
                <span class="cl-item-name">{{ r.name }}</span>
                <div class="cl-item-meta">
                  <span class="cl-item-set">{{ r.set }} · {{ r.type === 'armor' ? 'Armor' : 'Weapon' }}</span>
                  <span v-if="r.type === 'weapon' && getHunterClass(r.hunter_class_id)" class="cl-item-class">
                    <img
                      :src="getImg(getHunterClass(r.hunter_class_id).thumbnail)"
                      class="cl-class-icon"
                    />
                    {{ getHunterClass(r.hunter_class_id).hunter_class }}
                  </span>
                </div>
                <!-- Weapon damage cards (same as Crafting page) -->
                <div v-if="r.type === 'weapon' && r.damage_cards" class="cl-dmg-row">
                  <template v-for="(val, key) in r.damage_cards" :key="key">
                    <div v-if="val > 0" class="cl-dmg-stat">
                      <div class="cl-icon-wrap">
                        <img :src="getImg('assets/img/take_damage.png')" />
                        <span class="cl-tier">{{ key.split('_')[1] }}</span>
                      </div>
                      <p class="cl-dmg-count">x{{ val }}</p>
                    </div>
                  </template>
                </div>

                <!-- Armor stats (same as Crafting page) -->
                <div v-if="r.type === 'armor'" class="cl-defense-row">
                  <div v-if="r.physical_armor > 0" class="cl-armor-element-card">
                    <img :src="getImg('assets/img/bonus_armor.png')" class="cl-armor-base" />
                    <span class="cl-element-value">{{ r.physical_armor }}</span>
                  </div>
                  <div v-if="r.elemental_armor?.elemental_id > 0 && r.elemental_armor?.protection > 0" class="cl-armor-element-card">
                    <img :src="getImg('assets/img/bonus_armor.png')" class="cl-armor-base" />
                    <img :src="getImg(r.elemental_thumbnail)" class="cl-element-icon" />
                    <span class="cl-element-value">{{ r.elemental_armor.protection }}</span>
                  </div>
                </div>

                <!-- Materials -->
                <div class="cl-materials">
                  <div
                    v-for="(mat, j) in r.materials"
                    :key="j"
                    class="cl-mat"
                    :class="{ 'cl-mat-highlight': mat.material[0] === craftLookupItem.resource_type_id && mat.material[1] === craftLookupItem.item_id }"
                  >
                    <img
                      v-if="getResourceItem(mat.material[0], mat.material[1])"
                      :src="getImg(getResourceItem(mat.material[0], mat.material[1]).thumbnail)"
                      class="cl-mat-img"
                    />
                    <span class="cl-mat-name">{{ getResourceItem(mat.material[0], mat.material[1])?.item }}</span>
                    <span class="cl-mat-qty">×{{ mat.amount }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <p v-else class="cl-empty">ไม่พบสูตรคราฟที่ใช้ Item นี้</p>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.cl-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.7);
  backdrop-filter: blur(6px);
  z-index: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.cl-modal {
  background: linear-gradient(160deg, #1c1508, #13100a, #1c1508);
  border: 2px solid #7c5a2b;
  border-radius: 14px;
  width: min(440px, 100%);
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 0 40px rgba(0,0,0,0.8);
}
.cl-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(124,90,43,0.4);
  background: rgba(200,155,60,0.06);
  flex-shrink: 0;
}
.cl-title { font-size: 13px; font-weight: bold; color: #ffd27a; letter-spacing: 1px; }
.cl-close {
  background: none; border: none; color: #7c5a2b;
  font-size: 16px; cursor: pointer; transition: color 0.15s;
}
.cl-close:hover { color: #ffd27a; }

.cl-list {
  overflow-y: auto;
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.cl-item {
  display: flex;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(200,155,60,0.05);
  border: 1px solid rgba(124,90,43,0.3);
}
.cl-item-img {
  width: 40px;
  height: 40px;
  object-fit: contain;
  flex-shrink: 0;
}
.cl-item-info {
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex: 1;
  min-width: 0;
}
.cl-item-name { font-size: 13px; font-weight: bold; color: #ffd27a; }
.cl-item-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.cl-item-set { font-size: 10px; color: #a88040; letter-spacing: 1px; }
.cl-item-class {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  color: #7ab3ff;
  background: rgba(60,100,200,0.1);
  border: 1px solid rgba(60,100,200,0.3);
  border-radius: 4px;
  padding: 1px 6px;
}
.cl-class-icon { width: 14px; height: 14px; object-fit: contain; }

/* Damage cards — same pattern as Crafting.vue */
.cl-dmg-row { display: flex; gap: 6px; flex-wrap: wrap; margin: 4px 0; }
.cl-dmg-stat { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.cl-icon-wrap {
  position: relative;
  width: 36px;
  height: 36px;
  flex-shrink: 0;
}
.cl-icon-wrap img { width: 100%; height: 100%; object-fit: contain; }
.cl-tier {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: bold;
  color: #fff;
  text-shadow: 0 0 5px rgba(0,0,0,0.9), 0 0 3px #000;
}
.cl-dmg-count { margin: 0; font-size: 11px; font-weight: bold; color: #c89b3c; }

/* Armor stats — same pattern as Crafting.vue */
.cl-defense-row { display: flex; gap: 6px; flex-wrap: wrap; margin: 4px 0; }
.cl-armor-element-card { position: relative; width: 36px; height: 36px; }
.cl-armor-base { width: 100%; height: 100%; object-fit: contain; }
.cl-element-icon {
  position: absolute;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  width: 26px; height: 26px;
  object-fit: contain;
  z-index: 2;
}
.cl-element-value {
  position: absolute;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  font-size: 14px;
  font-weight: bold;
  color: #fff;
  text-shadow: 0 0 4px black;
  z-index: 3;
  -webkit-text-stroke: 0.5px black;
}

.cl-materials {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}
.cl-mat {
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(0,0,0,0.3);
  border: 1px solid rgba(124,90,43,0.2);
}
.cl-mat-highlight {
  border-color: rgba(200,155,60,0.6);
  background: rgba(200,155,60,0.1);
}
.cl-mat-img { width: 16px; height: 16px; object-fit: contain; }
.cl-mat-name { font-size: 10px; color: #d4c090; }
.cl-mat-qty { font-size: 10px; color: #a88040; }

.cl-empty {
  text-align: center;
  font-size: 12px;
  color: rgba(124,90,43,0.5);
  padding: 24px 0;
  margin: 0;
}
</style>
