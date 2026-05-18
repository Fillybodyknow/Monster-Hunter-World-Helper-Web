import data from '@/assets/files/class_hunter.json'

export const getHunterClasses = async () => {
  return await new Promise((resolve) => {
      resolve(data)
  })
}

export const getHunterClassById = async (id) => {
  return await new Promise((resolve) => {
      resolve(data.find(h => h.hunter_class_id === id))
  })
}