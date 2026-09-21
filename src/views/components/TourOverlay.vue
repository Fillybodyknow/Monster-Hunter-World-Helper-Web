<script setup>
// ทัวร์สอนใช้งานแบบ spotlight — หาปุ่มจริงบนจอ วาดฉากมืดเจาะรู และวางป้ายคำอธิบาย
// สถานะว่าอยู่ทัวร์ไหน ขั้นไหน อยู่ใน useTour.js ส่วนเนื้อหาอยู่ใน tours/tours.js
import { ref, computed, watch, onUnmounted, nextTick } from 'vue'
import { activeTour, stepIndex, endTour } from '@/composables/useTour'
import { useSfx } from '@/composables/useSfx'

const sfx = useSfx()
const SFX_UI = 'assets/sounds/ui'

const PAD = 8 // ระยะเผื่อรอบปุ่มที่ชี้
const GUTTER = 16 // ป้ายห้ามชิดขอบจอเกินนี้
const WAIT_MS = 1500 // รอปุ่มโผล่ (หน้าเพิ่งเปลี่ยน / แอนิเมชันเข้า) ก่อนถือว่าไม่มี

const reducedMotion =
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

const step = computed(() => activeTour.value?.steps?.[stepIndex.value] ?? null)
const total = computed(() => activeTour.value?.steps?.length ?? 0)
const isLast = computed(() => stepIndex.value >= total.value - 1)
const isClickStep = computed(() => step.value?.mode === 'click')

const vw = ref(typeof window !== 'undefined' ? window.innerWidth : 0)
const vh = ref(typeof window !== 'undefined' ? window.innerHeight : 0)
const hole = ref(null) // { x, y, w, h } พิกัดบนจอ รวมระยะเผื่อแล้ว
const searching = ref(false)
const popEl = ref(null)
const pop = ref({ top: 0, left: 0 })

let targetEl = null
let raf = 0
let searchTimer = 0
let searchToken = 0
let detachClick = null

const findTarget = (key) => (key ? document.querySelector(`[data-tour="${key}"]`) : null)

const fullyInView = (el) => {
  const r = el.getBoundingClientRect()
  return r.top >= 0 && r.left >= 0 && r.bottom <= window.innerHeight && r.right <= window.innerWidth
}

// scrollIntoView เลื่อนกล่องแม่ทุกชั้น รวมถึงกล่องที่ตั้ง overflow: hidden (เช่นโมดัลการ์ดโจมตี)
// กล่องแบบนั้นผู้เล่นเลื่อนกลับเองไม่ได้ — ปิดทัวร์แล้วเนื้อหาค้างเลยขอบจอ
// จำตำแหน่งเดิมไว้ก่อนเลื่อน แล้วคืนให้ตอนจบทัวร์ (เฉพาะกล่องที่เลื่อนเองไม่ได้ ที่เหลือปล่อยตามที่ผู้เล่นเห็น)
let savedScrolls = []
const rememberScroll = (el) => {
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    if (savedScrolls.some((s) => s.el === p)) continue
    savedScrolls.push({ el: p, top: p.scrollTop, left: p.scrollLeft })
  }
}
const restoreScrolls = () => {
  for (const s of savedScrolls) {
    if (!s.el.isConnected) continue
    const st = getComputedStyle(s.el)
    const locked = ['hidden', 'clip'].includes(st.overflowY) || ['hidden', 'clip'].includes(st.overflowX)
    if (!locked) continue
    s.el.scrollTop = s.top
    s.el.scrollLeft = s.left
  }
  savedScrolls = []
}

const hasBox = (el) => {
  if (!el?.isConnected) return false
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.height > 0
}

// ของที่ติดจอ (แถบเทิร์นลอย) ถูกพับลงไปพ้นขอบ — เลื่อนหน้าไปก็ไม่เจอ ชี้ไปก็มองไม่เห็น
const isFixedOffscreen = (el) => {
  if (getComputedStyle(el).position !== 'fixed') return false
  const r = el.getBoundingClientRect()
  return r.top >= window.innerHeight - 4 || r.bottom <= 4
}

const stopSearch = () => {
  searchToken++
  clearTimeout(searchTimer)
  searching.value = false
}

const stopClick = () => {
  detachClick?.()
  detachClick = null
}

const finish = (seen) => {
  stopSearch()
  stopClick()
  targetEl = null
  hole.value = null
  endTour({ seen })
}

// ขั้นที่ต้องแตะปุ่มเอง — ฟังแบบ capture ไม่หยุด event ปุ่มจริงยังทำงานตามปกติ
const watchClick = (s) => {
  const onClick = (e) => {
    if (!targetEl || !targetEl.contains(e.target)) return
    stopClick()
    // คลิกนี้มักพาเปลี่ยนหน้า — ขั้นสุดท้ายจบทัวร์ทันที ก่อนหน้าเก่าหายไปจากจอ
    if (s.final || isLast.value) finish(true)
    else setTimeout(() => { if (activeTour.value) goTo(stepIndex.value + 1, 1) }, s.delay ?? 350)
  }
  document.addEventListener('click', onClick, true)
  detachClick = () => document.removeEventListener('click', onClick, true)
}

const goTo = (idx, dir = 1) => {
  stopSearch()
  stopClick()
  const tour = activeTour.value
  if (!tour) return
  if (idx >= tour.steps.length) return finish(true)
  if (idx < 0) return goTo(0, 1)

  stepIndex.value = idx
  targetEl = null
  hole.value = null
  const s = tour.steps[idx]
  if (!s.target) {
    nextTick(place)
    return
  }

  const token = searchToken
  const started = performance.now()
  searching.value = true

  const attempt = () => {
    if (token !== searchToken || activeTour.value !== tour) return
    const el = findTarget(s.target)
    if (el && hasBox(el) && !isFixedOffscreen(el)) {
      searching.value = false
      targetEl = el
      // เลื่อนเฉพาะตอนปุ่มล้นจอจริง — อยู่ในจออยู่แล้วเลื่อนไปก็แค่ทำให้หน้าขยับเปล่า ๆ
      if (getComputedStyle(el).position !== 'fixed' && !fullyInView(el)) {
        rememberScroll(el)
        el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' })
      }
      if (s.mode === 'click') watchClick(s)
      measure()
      return
    }
    if (performance.now() - started >= (s.wait ?? WAIT_MS)) {
      searching.value = false
      if (s.optional) return goTo(idx + dir, dir)
      // ปุ่มหลักของขั้นนี้ไม่อยู่บนจอแล้ว = ผู้เล่นไปหน้าอื่นระหว่างทัวร์ (หรือ Host พาไป)
      // จบเงียบ ๆ — นับว่าดูแล้วเฉพาะคนที่ไปต่อได้อย่างน้อยหนึ่งขั้น ไม่งั้นครั้งหน้าจะขึ้นใหม่
      return finish(idx > 0)
    }
    searchTimer = setTimeout(attempt, 100)
  }
  attempt()
}

// ป้ายคำอธิบาย — ใต้ปุ่มถ้าที่พอ ไม่งั้นเหนือปุ่ม ปุ่มใหญ่จนไม่เหลือที่ทั้งสองทางปักไว้ล่างจอ
const place = () => {
  const el = popEl.value
  if (!el) return
  const pw = el.offsetWidth
  const ph = el.offsetHeight
  const w = vw.value
  const h = vh.value
  const r = hole.value
  let top
  let left
  if (!r) {
    top = (h - ph) / 2
    left = (w - pw) / 2
  } else {
    const below = h - (r.y + r.h)
    if (below >= ph + 14) top = r.y + r.h + 10
    else if (r.y >= ph + 14) top = r.y - ph - 10
    else top = h - ph - GUTTER
    left = r.x + r.w / 2 - pw / 2
  }
  left = Math.min(Math.max(GUTTER, left), Math.max(GUTTER, w - pw - GUTTER))
  top = Math.min(Math.max(GUTTER, top), Math.max(GUTTER, h - ph - GUTTER))
  if (Math.abs(pop.value.top - top) > 0.5 || Math.abs(pop.value.left - left) > 0.5) pop.value = { top, left }
}

// อ่านตำแหน่งทุกเฟรม — ปุ่มขยับได้ตลอด (เลื่อนหน้า, แอนิเมชัน, แถบลอยพับ/กาง, หมุนจอ)
const measure = () => {
  const w = window.innerWidth
  const h = window.innerHeight
  if (vw.value !== w) vw.value = w
  if (vh.value !== h) vh.value = h

  const s = step.value
  if (s?.target && !searching.value) {
    if (!targetEl?.isConnected) {
      // ปุ่มถูกวาดใหม่ (เช่นการ์ดบทสนทนาเปลี่ยนบท) — หาตัวใหม่ด้วย key เดิมโดยไม่เปลี่ยนขั้น
      const again = findTarget(s.target)
      if (again && hasBox(again)) {
        targetEl = again
      } else {
        goTo(stepIndex.value, 1)
        return
      }
    }
    const b = targetEl.getBoundingClientRect()
    const x = Math.max(4, b.left - PAD)
    const y = Math.max(4, b.top - PAD)
    const nw = Math.max(0, Math.min(w - 4, b.right + PAD) - x)
    const nh = Math.max(0, Math.min(h - 4, b.bottom + PAD) - y)
    const p = hole.value
    if (!p || Math.abs(p.x - x) > 0.5 || Math.abs(p.y - y) > 0.5 || Math.abs(p.w - nw) > 0.5 || Math.abs(p.h - nh) > 0.5) {
      hole.value = { x, y, w: nw, h: nh }
    }
  }
  place()
}

const loop = () => {
  measure()
  raf = requestAnimationFrame(loop)
}

const next = () => {
  sfx.playRandom(`${SFX_UI}/menu_change`, 4, { key: 'tour', gain: 0.7 })
  if (isLast.value) finish(true)
  else goTo(stepIndex.value + 1, 1)
}
const prev = () => {
  if (stepIndex.value === 0) return
  sfx.playRandom(`${SFX_UI}/menu_change`, 4, { key: 'tour', gain: 0.7 })
  goTo(stepIndex.value - 1, -1)
}
const skipStep = () => goTo(stepIndex.value + 1, 1)
// ข้ามทั้งทัวร์ = ถือว่าดูแล้ว ไม่ต้องเด้งมาอีก (ดูใหม่ได้จากหน้า Setting)
const skip = () => finish(true)

const onKey = (e) => {
  if (!activeTour.value) return
  if (e.key === 'Escape') {
    e.preventDefault()
    skip()
  } else if ((e.key === 'ArrowRight' || e.key === 'Enter') && !isClickStep.value) {
    e.preventDefault()
    next()
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault()
    prev()
  }
}

// ขั้นอ่านอย่างเดียว บังทั้งจอกันกดพลาดไปหน้าอื่น — ขั้นที่ต้องแตะเอง เปิดช่องให้กดได้เฉพาะในรู
const blockers = computed(() => {
  const r = hole.value
  const w = vw.value
  const h = vh.value
  if (!r || !isClickStep.value) return [{ top: 0, left: 0, width: w, height: h }]
  return [
    { top: 0, left: 0, width: w, height: r.y },
    { top: r.y + r.h, left: 0, width: w, height: Math.max(0, h - r.y - r.h) },
    { top: r.y, left: 0, width: r.x, height: r.h },
    { top: r.y, left: r.x + r.w, width: Math.max(0, w - r.x - r.w), height: r.h },
  ]
})

watch(activeTour, (tour, prevTour) => {
  if (tour && tour !== prevTour) {
    window.addEventListener('keydown', onKey)
    cancelAnimationFrame(raf)
    raf = requestAnimationFrame(loop)
    goTo(0, 1)
  } else if (!tour) {
    stopSearch()
    stopClick()
    restoreScrolls()
    targetEl = null
    hole.value = null
    cancelAnimationFrame(raf)
    raf = 0
    window.removeEventListener('keydown', onKey)
  }
})

onUnmounted(() => {
  stopSearch()
  stopClick()
  cancelAnimationFrame(raf)
  window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <Teleport to="body">
    <div v-if="activeTour" class="tour-root">
      <div
        v-for="(b, i) in blockers"
        :key="i"
        class="tour-block"
        :style="{ top: b.top + 'px', left: b.left + 'px', width: b.width + 'px', height: b.height + 'px' }"
      ></div>

      <svg v-show="!searching" class="tour-shade" :width="vw" :height="vh" aria-hidden="true">
        <defs>
          <mask id="tour-hole-mask">
            <rect x="0" y="0" :width="vw" :height="vh" fill="white" />
            <rect v-if="hole" :x="hole.x" :y="hole.y" :width="hole.w" :height="hole.h" rx="10" ry="10" fill="black" />
          </mask>
        </defs>
        <rect x="0" y="0" :width="vw" :height="vh" class="tour-shade-fill" mask="url(#tour-hole-mask)" />
      </svg>

      <div
        v-if="hole && !searching"
        class="tour-ring"
        :class="{ 'tour-ring-click': isClickStep, 'tour-still': reducedMotion }"
        :style="{ top: hole.y + 'px', left: hole.x + 'px', width: hole.w + 'px', height: hole.h + 'px' }"
        aria-hidden="true"
      ></div>

      <div
        v-show="!searching && step"
        ref="popEl"
        class="tour-pop"
        role="dialog"
        aria-live="polite"
        :aria-label="step?.title"
        :style="{ top: pop.top + 'px', left: pop.left + 'px' }"
      >
        <div :key="`${activeTour.id}-${stepIndex}`" class="tour-pop-inner" :class="{ 'tour-still': reducedMotion }">
          <div class="tour-pop-head">
            <span class="tour-pop-count">{{ stepIndex + 1 }} / {{ total }}</span>
            <button type="button" class="tour-pop-skip" @click="skip">ข้ามทัวร์ ✕</button>
          </div>
          <p class="tour-pop-title">{{ step?.title }}</p>
          <p class="tour-pop-body">{{ step?.body }}</p>
          <p v-if="isClickStep" class="tour-pop-hint">👆 แตะที่กรอบเรืองแสงเพื่อไปต่อ</p>
          <div class="tour-pop-btns">
            <button type="button" class="tour-btn tour-btn-ghost" :disabled="stepIndex === 0" @click="prev">‹ ย้อน</button>
            <button
              v-if="isClickStep"
              type="button"
              class="tour-btn tour-btn-ghost"
              @click="isLast ? skip() : skipStep()"
            >{{ isLast ? 'จบทัวร์' : 'ข้ามขั้นนี้ ›' }}</button>
            <button v-else type="button" class="tour-btn tour-btn-main" @click="next">
              {{ isLast ? 'เข้าใจแล้ว ✓' : 'ถัดไป ›' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* เหนือ modal ทุกตัวในแอป (สูงสุด 10000) แต่ต่ำกว่า BootLoader — ทัวร์เริ่มหลังโหลดเสร็จอยู่แล้ว */
.tour-root {
  position: fixed;
  inset: 0;
  z-index: 11000;
  pointer-events: none;
}

.tour-block {
  position: fixed;
  pointer-events: auto;
  background: transparent;
}

.tour-shade {
  position: fixed;
  inset: 0;
  pointer-events: none;
}
.tour-shade-fill {
  fill: rgba(6, 4, 2, 0.72);
}

.tour-ring {
  position: fixed;
  box-sizing: border-box;
  border-radius: 10px;
  border: 2px solid #ffd27a;
  pointer-events: none;
  animation: tourPulse 1.8s ease-in-out infinite;
}
/* ขั้นที่ต้องแตะเอง — สีเขียวบอกว่ากดได้ ต่างจากขั้นอ่านอย่างเดียว */
.tour-ring-click {
  border-color: #90d890;
  animation-name: tourPulseClick;
}
@keyframes tourPulse {
  0%, 100% { box-shadow: 0 0 0 3px rgba(255, 210, 122, 0.18), 0 0 18px rgba(255, 190, 90, 0.45); }
  50% { box-shadow: 0 0 0 6px rgba(255, 210, 122, 0.28), 0 0 30px rgba(255, 190, 90, 0.7); }
}
@keyframes tourPulseClick {
  0%, 100% { box-shadow: 0 0 0 3px rgba(144, 216, 144, 0.2), 0 0 18px rgba(120, 220, 120, 0.45); }
  50% { box-shadow: 0 0 0 6px rgba(144, 216, 144, 0.32), 0 0 30px rgba(120, 220, 120, 0.7); }
}

.tour-pop {
  position: fixed;
  width: min(340px, calc(100vw - 32px));
  box-sizing: border-box;
  pointer-events: auto;
  padding: 12px 14px 12px;
  border-radius: 3px;
  border: 3px solid #2e2113;
  background:
    repeating-linear-gradient(100deg, rgba(0, 0, 0, 0.14) 0px, rgba(0, 0, 0, 0.14) 1px, transparent 1px, transparent 5px),
    linear-gradient(170deg, #2b1f13, #1c1409 55%, #241a0e);
  box-shadow: inset 0 1px 0 rgba(255, 220, 160, 0.07), 0 10px 34px rgba(0, 0, 0, 0.85);
  color: #e8d6ae;
  font-family: 'Georgia', 'Times New Roman', serif;
}
.tour-pop-inner {
  animation: tourPopIn 0.22s ease-out;
}
@keyframes tourPopIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: none; }
}

.tour-pop-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}
.tour-pop-count {
  font-size: 10px;
  letter-spacing: 2px;
  color: #a88040;
  font-variant-numeric: tabular-nums;
}
.tour-pop-skip {
  padding: 2px 6px;
  border: none;
  background: transparent;
  color: #7c5a2b;
  font-family: inherit;
  font-size: 11px;
  cursor: pointer;
}
.tour-pop-skip:hover {
  color: #c89b3c;
}
.tour-pop-title {
  margin: 0 0 4px;
  font-size: 15px;
  font-weight: bold;
  color: #ffd27a;
  letter-spacing: 0.5px;
}
.tour-pop-body {
  margin: 0;
  font-size: 13px;
  line-height: 1.65;
  white-space: pre-line;
}
.tour-pop-hint {
  margin: 8px 0 0;
  font-size: 12px;
  color: #90d890;
}
.tour-pop-btns {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}
.tour-btn {
  padding: 8px 14px;
  border-radius: 3px;
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.tour-btn:disabled {
  opacity: 0.35;
  cursor: default;
}
.tour-btn-ghost {
  border: 1px solid rgba(124, 90, 43, 0.5);
  background: rgba(0, 0, 0, 0.3);
  color: #a88040;
}
.tour-btn-ghost:not(:disabled):hover {
  border-color: #c89b3c;
  color: #ffd27a;
}
.tour-btn-main {
  border: 1px solid #c89b3c;
  background: linear-gradient(to bottom, #ffd27a, #c89b3c);
  color: #1c1409;
  font-weight: bold;
}
.tour-btn-main:hover {
  box-shadow: 0 0 12px rgba(255, 210, 122, 0.45);
}

.tour-still {
  animation: none;
}
@media (prefers-reduced-motion: reduce) {
  .tour-ring,
  .tour-pop-inner {
    animation: none;
  }
}
</style>
