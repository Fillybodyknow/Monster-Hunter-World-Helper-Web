import { ref } from 'vue'
import { getHunterById, saveHunter as persistHunter } from '@/services/hunterStorage'

export const hunter = ref(null)

export const loadHunter = () => {
  const id = parseInt(localStorage.getItem('hunterId'))
  if (!isNaN(id)) hunter.value = getHunterById(id)
}

export const saveHunter = (data) => {
  persistHunter(data)
  hunter.value = { ...data }
}
