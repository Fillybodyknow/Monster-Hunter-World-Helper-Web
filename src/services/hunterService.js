import data from '@/assets/files/class_hunter.json'

export const getHunterClasses = async () => {
  return await new Promise((resolve) => {
    resolve(data)
  })
}

export const getHunterClassById = (id) => {
  return data.find(h => h.hunter_class_id === id);
}