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
export const soundEnabled = ref(stored.soundEnabled !== false)
export const soundVolume = ref(stored.soundVolume ?? 0.1)

watch(showQuestEffects, (val) => { save({ ...load(), showQuestEffects: val }) })
watch(soundEnabled, (val) => { save({ ...load(), soundEnabled: val }) })
watch(soundVolume, (val) => { save({ ...load(), soundVolume: val }) })
