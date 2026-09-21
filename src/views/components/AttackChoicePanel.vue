<script setup>
// ขั้นตอนของ "ตัวเอง" ตอนมอนโจมตี — สามจังหวะ ไม่เห็นของคนอื่นเลย
//   choice : เลือก รับ / หลบ / นอกระยะ — ไม่มีตัวเลขให้คิด ตัดสินจากหน้าโต๊ะอย่างเดียว
//   calc   : เฉพาะคนที่เลือกรับ — คิดความเสียหาย เกราะจาก Attack Card กดเพิ่มเอง
//   wait   : รอคนอื่นให้ครบ
// เลือกของใครของมัน Host กดแทนไม่ได้
import { computed, ref, watch } from 'vue'
import elementalData from '@/assets/files/elemental.json'

const props = defineProps({
  // 'choice' | 'calc' | 'wait'
  stage: { type: String, default: 'choice' },
  // แถวของตัวเอง — { name, icon, targeted, choice }
  me: { type: Object, default: null },
  // คนอื่น: บอกแค่ว่าจบขั้นตอนของตัวเองหรือยัง ไม่บอกว่าเลือกอะไร
  others: { type: Array, default: () => [] },
  elementId: { type: Number, default: 0 },
  agility: { type: Number, default: 0 },
  // ผลคำนวณของตัวเอง — { base, worn, chefBonus, shield, guardBonus, blast, guard, dmg }
  preview: { type: Object, default: null },
  shield: { type: Number, default: 0 },
  // HP ของตัวเองก่อนโดน — บอกให้เห็นว่ายืนยันแล้วจะเหลือเท่าไหร่
  hp: { type: Number, default: null },
  hpMax: { type: Number, default: 8 },
  // ติด Sleep — หลบหลีกไม่ได้จนกว่าจะจบเทิร์นถัดไปของตัวเอง
  asleep: { type: Boolean, default: false },
})
const emit = defineEmits(['choose', 'reset', 'confirm', 'update:shield'])

const img = (path) => `${import.meta.env.BASE_URL}${path}`
const ICON = {
  hit: 'assets/img/take_damage.webp',
  dodge: 'assets/img/UI/symbol/agility_symbol.webp',
  outrange: 'assets/img/UI/symbol/range_symbol.webp',
  sleep: 'assets/img/status_effect/sleep.webp',
  attack: 'assets/img/UI/symbol/monster_attack_symbol.webp',
  armor: 'assets/img/bonus_armor.webp',
  shield: 'assets/img/defense.webp',
  target: 'assets/img/UI/symbol/target_furthest_symbol.webp',
}
const element = computed(() => elementalData.find((e) => e.elemental_id === props.elementId) ?? null)
const pending = computed(() => props.others.filter((o) => !o.done))
const guardLabel = computed(() => (element.value ? `เกราะ ${element.value.elemental}` : 'เกราะกายภาพ'))
const CHOSEN_LABEL = { hit: 'รับความเสียหาย', dodge: 'หลบหลีก', outrange: 'อยู่นอกระยะ' }
const hpAfter = computed(() => (props.hp == null ? null : Math.max(0, props.hp - (props.preview?.dmg ?? 0))))
const chosen = computed(() => props.me?.choice?.choice ?? null)

// หลบ/นอกระยะ ไม่มีหน้าคิดเลขตามมา กดแล้วล็อกทันที — ถามก่อนกันกดพลาด
// (รับความเสียหายไม่ต้องถาม เพราะยังมีหน้าคิดดาเมจให้ย้อนกลับได้)
const asking = ref(null) // 'dodge' | 'outrange' | null
const ASK = {
  dodge: { title: 'หลบหลีก', icon: ICON.dodge, note: 'ทิ้ง Attack Card บนโต๊ะแล้วใช่ไหม? ยืนยันแล้วเปลี่ยนไม่ได้' },
  outrange: { title: 'นอกระยะ', icon: ICON.outrange, note: 'การโจมตีไม่ถึงตัวจริงใช่ไหม? ยืนยันแล้วเปลี่ยนไม่ได้' },
}
const ask = (choice) => { asking.value = choice }
const confirmAsk = () => {
  const c = asking.value
  asking.value = null
  if (c) emit('choose', c)
}
// ขั้นตอนเปลี่ยน (เช่นการ์ดใบใหม่) ต้องไม่ค้างหน้าถามไว้
watch(() => props.stage, () => { asking.value = null })
</script>

<template>
  <div v-if="me" class="ac-panel">
    <header class="ac-head">
      <div class="ac-avatar">
        <img v-if="me.icon" :src="img(me.icon)" alt="" />
      </div>
      <div class="ac-who">
        <span class="ac-name">{{ me.name }}</span>
        <span v-if="me.targeted" class="ac-target">
          <img :src="img(ICON.target)" alt="" />
          โดนเล็ง
        </span>
      </div>
      <div v-if="hp != null" class="ac-hp-pill" :class="{ 'ac-hp-pill-low': hp <= 2 }">
        <span class="ac-hp-pill-label">HP</span>
        <strong>{{ hp }}</strong><small>/{{ hpMax }}</small>
      </div>
    </header>

    <!-- ── เลือก ─────────────────────────────────────────── -->
    <template v-if="stage === 'choice' && asking">
      <div class="ac-ask-box">
        <img :src="img(ASK[asking].icon)" class="ac-ask-icon" alt="" />
        <p class="ac-ask-title">เลือก <strong>{{ ASK[asking].title }}</strong> ใช่ไหม?</p>
        <p v-if="asking === 'dodge' && agility" class="ac-ask-need">
          ต้องทิ้งการ์ดรวม <img :src="img(ICON.dodge)" class="ac-inline-icon" alt="Agility" /> {{ agility }}
        </p>
        <p class="ac-ask-note">{{ ASK[asking].note }}</p>
      </div>
      <div class="ac-btn-row">
        <button class="ac-btn ac-btn-back" @click="asking = null">ย้อนกลับ</button>
        <button class="ac-btn ac-btn-confirm" @click="confirmAsk">ยืนยัน {{ ASK[asking].title }}</button>
      </div>
    </template>

    <template v-else-if="stage === 'choice'">
      <p class="ac-ask">จะเอายังไงกับการโจมตีนี้?</p>

      <button class="ac-opt ac-opt-hit" @click="emit('choose', 'hit')">
        <img :src="img(ICON.hit)" class="ac-opt-icon" alt="" />
        <span class="ac-opt-body">
          <span class="ac-opt-title">รับความเสียหาย</span>
          <span class="ac-opt-sub">แอปหักเกราะให้ แล้วหัก HP หลังเฉลย</span>
        </span>
        <span class="ac-opt-arrow">›</span>
      </button>

      <div class="ac-opt-row">
        <button class="ac-opt ac-opt-tile ac-opt-safe" :disabled="asleep" @click="ask('dodge')">
          <img :src="img(asleep ? ICON.sleep : ICON.dodge)" class="ac-opt-icon" alt="" />
          <span class="ac-opt-title">หลบหลีก</span>
          <span v-if="asleep" class="ac-opt-sub ac-opt-sub-warn">ติด Sleep หลบไม่ได้</span>
          <span v-else-if="agility" class="ac-opt-sub">
            ทิ้งการ์ดรวม <img :src="img(ICON.dodge)" class="ac-inline-icon" alt="Agility" /> {{ agility }}
          </span>
          <span v-else class="ac-opt-sub">ทิ้งการ์ดเพื่อหลบ</span>
        </button>
        <button class="ac-opt ac-opt-tile ac-opt-safe" @click="ask('outrange')">
          <img :src="img(ICON.outrange)" class="ac-opt-icon" alt="" />
          <span class="ac-opt-title">นอกระยะ</span>
          <span class="ac-opt-sub">การโจมตีไม่ถึงตัว</span>
        </button>
      </div>
    </template>

    <!-- ── คำนวณความเสียหาย ──────────────────────────────── -->
    <template v-else-if="stage === 'calc'">
      <div class="ac-eq">
        <div class="ac-eq-cell">
          <div class="ac-badge">
            <img :src="img(ICON.attack)" class="ac-badge-bg" alt="" />
            <span class="ac-badge-num">{{ preview?.base ?? 0 }}</span>
          </div>
          <span class="ac-eq-label">ดาเมจ</span>
        </div>

        <span class="ac-eq-op">−</span>

        <div class="ac-eq-cell">
          <div class="ac-badge">
            <img :src="img(ICON.armor)" class="ac-badge-bg" alt="" />
            <!-- ยังไม่มีรูปเกราะแยกตามธาตุ — เอาไอคอนธาตุทับไปก่อน -->
            <img v-if="element" :src="img(element.thumbnail)" class="ac-badge-el" alt="" />
            <span class="ac-badge-num">{{ preview?.guard ?? 0 }}</span>
          </div>
          <span class="ac-eq-label">{{ guardLabel }}</span>
        </div>

        <span class="ac-eq-op">=</span>

        <div class="ac-eq-cell">
          <div class="ac-badge ac-badge-result">
            <img :src="img(ICON.hit)" class="ac-badge-bg" alt="" />
            <span class="ac-badge-num">{{ preview?.dmg ?? 0 }}</span>
          </div>
          <span class="ac-eq-label ac-eq-label-result">รับจริง</span>
        </div>
      </div>

      <div class="ac-chips">
        <span class="ac-chip">เกราะที่ใส่ {{ preview?.worn ?? 0 }}</span>
        <span v-if="preview?.chefBonus" class="ac-chip ac-chip-good">ข้าวเชฟ +{{ preview.chefBonus }}</span>
        <span v-if="preview?.shield" class="ac-chip ac-chip-good">จากการ์ด +{{ preview.shield }}</span>
        <span v-if="preview?.guardBonus" class="ac-chip ac-chip-good">Guard +{{ preview.guardBonus }}</span>
        <span v-if="preview?.blast" class="ac-chip ac-chip-bad">Blastblight −{{ preview.blast }}</span>
      </div>

      <div v-if="hpAfter != null" class="ac-hpbar" :class="{ 'ac-hpbar-out': hpAfter === 0 }">
        <div class="ac-hpbar-pips">
          <i
            v-for="i in hpMax"
            :key="i"
            :class="{ 'pip-keep': i <= hpAfter, 'pip-lose': i > hpAfter && i <= hp }"
          ></i>
        </div>
        <span class="ac-hpbar-text">
          HP {{ hp }} → <strong>{{ hpAfter }}</strong>
          <template v-if="hpAfter === 0"> · ล้ม</template>
        </span>
      </div>

      <!-- การ์ดอยู่บนมือบนโต๊ะ แอปไม่เห็น ต้องกดเพิ่มเอง -->
      <div class="ac-tune">
        <img :src="img(ICON.shield)" class="ac-tune-icon" alt="" />
        <span class="ac-tune-label">{{ guardLabel }}<br /><small>จากการ์ดที่เล่น</small></span>
        <div class="ac-stepper">
          <button class="ac-step" :disabled="shield <= 0" aria-label="ลด" @click="emit('update:shield', shield - 1)">−</button>
          <span class="ac-step-num">{{ shield }}</span>
          <button class="ac-step" aria-label="เพิ่ม" @click="emit('update:shield', shield + 1)">+</button>
        </div>
      </div>

      <div class="ac-btn-row">
        <button class="ac-btn ac-btn-back" @click="emit('reset')">ย้อนกลับ</button>
        <button class="ac-btn ac-btn-confirm" @click="emit('confirm')">
          ยืนยัน รับ <strong>{{ preview?.dmg ?? 0 }}</strong>
        </button>
      </div>
    </template>

    <!-- ── รอคนอื่น ───────────────────────────────────────── -->
    <template v-else>
      <div class="ac-locked" :class="chosen === 'hit' ? 'ac-locked-hit' : 'ac-locked-safe'">
        <img v-if="chosen" :src="img(ICON[chosen])" class="ac-locked-icon" alt="" />
        <span class="ac-locked-body">
          <span class="ac-locked-label">เลือกแล้ว</span>
          <span class="ac-locked-text">{{ CHOSEN_LABEL[chosen] }}</span>
        </span>
        <span v-if="chosen === 'hit'" class="ac-locked-dmg">−{{ me.choice.dmg }}</span>
      </div>
      <div v-if="pending.length" class="ac-wait">
        <p class="ac-wait-text">รออีก {{ pending.length }} คน</p>
        <div class="ac-wait-dots">
          <img v-for="o in pending" :key="o.id" :src="img(o.icon)" class="ac-wait-icon" :title="o.name" alt="" />
        </div>
      </div>
      <p v-else class="ac-wait-text ac-wait-done">ครบทุกคนแล้ว — กำลังเฉลย…</p>
    </template>
  </div>
</template>

<style scoped>
/* แอปไม่มี reset ทั้งแอป — ไม่ใส่แล้ว width 100% + padding ล้นกรอบ */
.ac-panel, .ac-panel * { box-sizing: border-box; }
.ac-panel {
  --gold: #c89b3c;
  --bone: #e8dcc0;
  --muted: #8c7a5c;
  --line: #4a3c22;
  position: relative;
  width: 100%;
  padding: 12px 14px 14px;
  border: 1px solid #6b552f;
  border-top: 2px solid var(--gold);
  border-radius: 12px;
  background:
    radial-gradient(120% 60% at 50% 0%, rgba(200, 155, 60, 0.12), transparent 70%),
    linear-gradient(180deg, rgba(30, 23, 13, 0.97), rgba(13, 10, 6, 0.97));
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 220, 160, 0.06);
}

/* ── หัวแผง ── */
.ac-head { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.ac-avatar {
  flex: none;
  width: 38px; height: 38px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 50%;
  border: 2px solid rgba(200, 155, 60, 0.55);
  background: radial-gradient(circle, rgba(60, 44, 20, 0.9), rgba(16, 12, 6, 0.95));
}
.ac-avatar img { width: 24px; height: 24px; object-fit: contain; }
.ac-who { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: flex-start; gap: 3px; }
.ac-name {
  max-width: 100%;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-size: 15px; font-weight: bold; color: var(--bone); letter-spacing: 0.5px;
}
.ac-target {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 1px 8px 1px 4px; border-radius: 10px;
  background: rgba(150, 35, 25, 0.5); border: 1px solid #c0392b;
  font-size: 10px; color: #ffb0a0;
}
.ac-target img { width: 13px; height: 13px; object-fit: contain; }
.ac-hp-pill {
  flex: none;
  display: flex; align-items: baseline; gap: 2px;
  padding: 4px 10px;
  border-radius: 8px;
  border: 1px solid rgba(180, 60, 20, 0.5);
  background: rgba(90, 20, 10, 0.35);
  color: #ffb4a4;
}
.ac-hp-pill-label { margin-right: 3px; font-size: 9px; letter-spacing: 2px; color: #a88040; }
.ac-hp-pill strong { font-size: 17px; line-height: 1; }
.ac-hp-pill small { font-size: 10px; color: var(--muted); }
.ac-hp-pill-low { border-color: #ff4f3a; box-shadow: 0 0 10px rgba(255, 79, 58, 0.35); }

.ac-ask { margin: 0 0 9px; text-align: center; font-size: 12px; color: #a89878; }

/* ── ตัวเลือก ── */
.ac-opt {
  display: flex; align-items: center; gap: 12px;
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #6b552f;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.35);
  color: var(--bone);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  transition: transform 0.12s ease, background 0.15s, border-color 0.15s, box-shadow 0.15s;
}
.ac-opt:not(:disabled):active { transform: scale(0.97); }
.ac-opt:disabled { opacity: 0.45; cursor: not-allowed; filter: grayscale(0.4); }
.ac-opt-icon { flex: none; width: 40px; height: 40px; object-fit: contain; filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.6)); }
.ac-opt-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.ac-opt-title { font-size: 14px; font-weight: bold; }
.ac-opt-sub { display: inline-flex; align-items: center; gap: 3px; font-size: 10.5px; color: var(--muted); }
.ac-opt-sub-warn { color: #c9a0ff; }
.ac-inline-icon { width: 14px; height: 14px; object-fit: contain; border-radius: 3px; }
.ac-opt-arrow { flex: none; font-size: 22px; color: #ff9c86; line-height: 1; }

.ac-opt-hit {
  border-color: #a6392b;
  background: linear-gradient(100deg, rgba(140, 34, 20, 0.55), rgba(60, 16, 10, 0.4));
  box-shadow: inset 0 0 18px rgba(200, 60, 40, 0.15);
}
.ac-opt-hit:not(:disabled):hover { border-color: #e0533c; box-shadow: inset 0 0 18px rgba(200, 60, 40, 0.25), 0 0 12px rgba(224, 83, 60, 0.25); }

.ac-opt-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px; }
.ac-opt-tile { flex-direction: column; justify-content: center; gap: 4px; padding: 12px 8px 10px; text-align: center; }
.ac-opt-tile .ac-opt-icon { width: 34px; height: 34px; border-radius: 6px; }
.ac-opt-tile .ac-opt-sub { justify-content: center; }
.ac-opt-safe { border-color: #3c6a48; background: linear-gradient(180deg, rgba(24, 64, 36, 0.4), rgba(10, 26, 14, 0.4)); }
.ac-opt-safe:not(:disabled):hover { border-color: #5aa56c; box-shadow: 0 0 12px rgba(90, 165, 108, 0.25); }

/* ── หน้าคำนวณ ── */
.ac-eq { display: flex; align-items: flex-start; justify-content: center; gap: 6px; margin-bottom: 8px; }
.ac-eq-cell { display: flex; flex-direction: column; align-items: center; gap: 4px; min-width: 60px; }
.ac-eq-op { font-size: 20px; color: var(--muted); line-height: 58px; }
.ac-eq-label { max-width: 76px; font-size: 10px; color: var(--muted); text-align: center; line-height: 1.3; }
.ac-eq-label-result { color: #ff9c86; font-weight: bold; }

/* เลขทับไอคอน — จัดกลางทั้งแนวตั้งแนวนอน */
.ac-badge { position: relative; width: 58px; height: 58px; }
.ac-badge-bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }
.ac-badge-el { position: absolute; left: 50%; top: 50%; width: 46%; height: 46%; object-fit: contain; transform: translate(-50%, -50%); opacity: 0.75; }
.ac-badge-num {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  font-size: 22px; font-weight: bold; color: #fff;
  text-shadow: 0 2px 4px #000, 0 0 8px #000;
}
.ac-badge-result { width: 64px; height: 64px; margin-top: -3px; animation: ac-throb 1.6s ease-in-out infinite; }
.ac-badge-result .ac-badge-num { font-size: 26px; }

.ac-chips { display: flex; flex-wrap: wrap; justify-content: center; gap: 4px; margin-bottom: 10px; }
.ac-chip {
  padding: 2px 8px; border-radius: 10px;
  border: 1px solid var(--line); background: rgba(0, 0, 0, 0.3);
  font-size: 10px; color: #a89878;
}
.ac-chip-good { border-color: #3c6a48; color: #8fe0a0; }
.ac-chip-bad { border-color: #a6392b; color: #ff9c86; }

.ac-hpbar {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 10px; margin-bottom: 8px;
  border-radius: 9px; border: 1px solid var(--line); background: rgba(0, 0, 0, 0.3);
}
.ac-hpbar-pips { flex: 1; min-width: 0; display: flex; gap: 3px; }
.ac-hpbar-pips i {
  flex: 1; height: 10px; border-radius: 2px;
  background: rgba(0, 0, 0, 0.45);
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.6);
}
.ac-hpbar-pips i.pip-keep { background: linear-gradient(to bottom, #e0533c, #9c2418); }
.ac-hpbar-pips i.pip-lose {
  background: repeating-linear-gradient(135deg, rgba(255, 90, 68, 0.55) 0 3px, rgba(120, 20, 10, 0.55) 3px 6px);
  animation: ac-lose 1s ease-in-out infinite;
}
.ac-hpbar-text { flex: none; font-size: 12px; color: #c8b998; }
.ac-hpbar-text strong { font-size: 15px; color: #ffb4a4; }
.ac-hpbar-out { border-color: #a6392b; }
.ac-hpbar-out .ac-hpbar-text, .ac-hpbar-out .ac-hpbar-text strong { color: #ff5a44; }

.ac-tune {
  display: flex; align-items: center; gap: 9px;
  padding: 7px 10px; margin-bottom: 10px;
  border-radius: 9px; border: 1px solid var(--line); background: rgba(0, 0, 0, 0.3);
}
.ac-tune-icon { flex: none; width: 28px; height: 28px; object-fit: contain; }
.ac-tune-label { flex: 1; min-width: 0; font-size: 12px; line-height: 1.25; color: #c8b998; }
.ac-tune-label small { font-size: 10px; color: var(--muted); }
.ac-stepper { flex: none; display: flex; align-items: center; gap: 6px; }
.ac-step-num { min-width: 1.4em; text-align: center; font-size: 17px; font-weight: bold; color: var(--bone); }
.ac-step {
  width: 32px; height: 32px; line-height: 1; cursor: pointer;
  border: 1px solid #6b552f; border-radius: 8px;
  background: rgba(0, 0, 0, 0.4); color: var(--bone); font-size: 17px; font-family: inherit;
}
.ac-step:disabled { opacity: 0.35; cursor: not-allowed; }
.ac-step:not(:disabled):active { background: rgba(200, 155, 60, 0.25); }

/* ── ถามยืนยัน หลบ / นอกระยะ ── */
.ac-ask-box {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  margin: 4px 0 10px; padding: 14px 12px;
  border: 1px solid #3c7a4a; border-radius: 10px;
  background: rgba(20, 70, 36, 0.3); text-align: center;
}
.ac-ask-icon { width: 40px; height: 40px; object-fit: contain; }
.ac-ask-title { margin: 2px 0 0; font-size: 14px; color: var(--bone); }
.ac-ask-title strong { color: #8fe0a0; font-size: 16px; }
.ac-ask-need { margin: 0; font-size: 12px; color: var(--bone); }
.ac-ask-note { margin: 0; font-size: 11px; color: var(--muted); }

.ac-btn-row { display: grid; grid-template-columns: 1fr 2fr; gap: 8px; }
.ac-btn {
  padding: 11px 8px; border-radius: 10px; cursor: pointer;
  font-family: inherit; font-size: 13px;
  transition: transform 0.12s ease;
}
.ac-btn:active { transform: scale(0.97); }
.ac-btn-back { border: 1px solid var(--line); background: rgba(0, 0, 0, 0.35); color: var(--muted); }
.ac-btn-confirm {
  border: 1px solid #ffd27a;
  background: linear-gradient(to bottom, #ffd27a, var(--gold));
  color: #1a1206; font-weight: bold;
  box-shadow: 0 2px 10px rgba(200, 155, 60, 0.35);
}
.ac-btn-confirm strong { font-size: 16px; }

/* ── รอ ── */
.ac-locked {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 12px;
  border-radius: 10px; border: 1px solid;
}
.ac-locked-hit { border-color: #a6392b; background: rgba(110, 26, 18, 0.35); }
.ac-locked-safe { border-color: #3c6a48; background: rgba(20, 60, 32, 0.35); }
.ac-locked-icon { flex: none; width: 36px; height: 36px; object-fit: contain; border-radius: 6px; }
.ac-locked-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.ac-locked-label { font-size: 10px; letter-spacing: 1px; color: #8fe0a0; }
.ac-locked-label::before { content: '✓ '; }
.ac-locked-text { font-size: 14px; font-weight: bold; color: var(--bone); }
.ac-locked-dmg { flex: none; font-size: 22px; font-weight: bold; color: #ff9c86; text-shadow: 0 0 10px rgba(220, 70, 45, 0.5); }

.ac-wait { margin-top: 10px; padding-top: 9px; border-top: 1px solid rgba(107, 85, 47, 0.5); }
.ac-wait-text { margin: 0; text-align: center; font-size: 11px; color: var(--muted); }
.ac-wait-done { margin-top: 10px; color: var(--gold); }
.ac-wait-dots { display: flex; justify-content: center; gap: 8px; margin-top: 6px; }
.ac-wait-icon { width: 26px; height: 26px; object-fit: contain; opacity: 0.4; animation: ac-pulse 1.4s ease-in-out infinite; }

@keyframes ac-pulse { 0%, 100% { opacity: 0.25; } 50% { opacity: 0.7; } }
@keyframes ac-throb { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.06); } }
@keyframes ac-lose { 0%, 100% { opacity: 0.55; } 50% { opacity: 1; } }

@media (prefers-reduced-motion: reduce) {
  .ac-wait-icon { animation: none; opacity: 0.45; }
  .ac-badge-result, .ac-hpbar-pips i.pip-lose { animation: none; }
  .ac-opt, .ac-btn { transition: none; }
}
</style>
