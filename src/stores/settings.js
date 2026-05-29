import { ref, watch } from 'vue'

const STORAGE_KEY = 'mhw_settings'

const load = () => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}
  } catch {
    return {}
  }
}

const save = (data) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

const stored = load()

export const showQuestEffects = ref(stored.showQuestEffects !== false)
export const showTips = ref(stored.showTips !== false)

watch(showQuestEffects, (val) => {
  save({ ...load(), showQuestEffects: val })
})

watch(showTips, (val) => {
  save({ ...load(), showTips: val })
})
