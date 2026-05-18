const STORAGE_KEY = 'hunters'

/* ================= GET ALL ================= */
export const getHunters = () => {
  try {
    const data = localStorage.getItem(STORAGE_KEY)
    const parsed = data ? JSON.parse(data) : []

    return Array.isArray(parsed) ? parsed : []
  } catch (e) {
    console.error('getHunters error:', e)
    return []
  }
}

/* ================= SAVE ALL ================= */
export const saveHunters = (hunters) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(hunters))
}

// services/hunterStorage.js
export const saveHunter = (hunter) => {
  const hunters = JSON.parse(localStorage.getItem('hunters')) || []

  const index = hunters.findIndex((h) => h.hunter_id === hunter.hunter_id)

  if (index !== -1) {
    hunters[index] = hunter
  } else {
    hunters.push(hunter)
  }

  localStorage.setItem('hunters', JSON.stringify(hunters))
}

/* ================= CREATE ================= */
export const createHunter = (hunter) => {
  const hunters = getHunters()

  const newHunter = {
    ...hunter,
    hunter_id: Date.now(), // unique id
  }

  hunters.push(newHunter) // ✅ ตอนนี้ push ได้แน่นอน

  saveHunters(hunters)

  return newHunter
}

/* ================= GET BY ID ================= */
export const getHunterById = (id) => {
  const hunters = getHunters()
  return hunters.find(h => h.hunter_id === id)
}

/* ================= DELETE ================= */
export const deleteHunter = (id) => {
  const hunters = getHunters()
  const filtered = hunters.filter((h) => h.hunter_id !== id)

  saveHunters(filtered)
}