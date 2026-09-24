// เปลี่ยนสายอาวุธของตัวละครเดิม (1 ID เล่นได้หลายคลาส)
//
// กติกา:
//  - อาวุธผูกกับคลาส (weapons.json แยกตาม hunter_class_id) → ช่อง Weapon เป็นของคลาสที่สวมอยู่เท่านั้น
//    อาวุธที่คราฟต์ไว้ของคลาสอื่นเก็บไว้ใน hunter.weapon_stash กลับไปคลาสเดิมแล้วได้ของเดิมครบ
//  - เกราะไม่ผูกกับคลาส ใช้คลังเดียวกันทุกคลาส ยกเว้น Starting Armor ที่ต่างกันตามคลาส
//    (มีสองชุด: Chainmail = equip_set 1, Leather = equip_set 2)
//    ชิ้นไหนเป็น Starting Armor ของคลาสเก่าจะกลายเป็นของคลาสใหม่ทั้งคลัง ไม่ใช่เฉพาะชิ้นที่ใส่อยู่
//    ไม่งั้นคนที่สลับไปมาจะมีทั้งสองชุดปนกันในคลังทั้งที่ไม่ได้คราฟต์เอง
//  - รายการติดตามคราฟต์: ของเกราะใช้ร่วมกันทุกคลาส ของอาวุธเก็บแยกตามคลาสเหมือนตัวอาวุธ
//    (weapon_type_id + item_id ซ้ำกันข้ามคลาส ถ้าไม่แยกจะกลายเป็นติดตามอาวุธผิดชิ้น)
//  - ของที่ใช้ร่วมกันทุกคลาส: เกราะ, Inventory, Campaign Day, แต้ม HR, ประวัติเควสต์
//
// ไฟล์นี้ตั้งใจไม่ import อะไรเลย — scripts/test-class-switch.mjs จะได้เรียกตรงจาก node ได้
// ผู้เรียกส่ง data = { classes: class_hunter.json, weapons: weapons.json } เข้ามาเอง

export const ARMOR_SLOTS = ['helm', 'mail', 'greaves']

export const classById = (data, classId) =>
  (data?.classes ?? []).find((c) => c.hunter_class_id === classId) ?? null

export const starterWeaponOf = (data, classId) => {
  const w = classById(data, classId)?.starter_set?.weapon
  return w ? { weapon_type_id: w.weapon_type_id, item_id: w.item_id, is_equip: true } : null
}

export const starterArmorOf = (data, classId, slot) => {
  const a = classById(data, classId)?.starter_set?.armors?.[slot]
  return a ? { equip_set_id: a.equip_set_id, equip_id: a.equip_id } : null
}

export const weaponInfo = (data, classId, weaponTypeId, itemId) =>
  (data?.weapons ?? [])
    .find((c) => c.hunter_class_id === classId)
    ?.weapons_list.find((t) => t.weapon_type_id === weaponTypeId)
    ?.items.find((i) => i.item_id === itemId) ?? null

// เซฟเก่าเก็บ key เป็นเลข เซฟที่ผ่าน JSON มาแล้วเป็นสตริง — อ่านให้ได้ทั้งสองแบบ
const stashOf = (hunter) =>
  hunter?.weapon_stash && typeof hunter.weapon_stash === 'object' ? hunter.weapon_stash : {}
const stashEntry = (hunter, classId) => stashOf(hunter)[classId] ?? stashOf(hunter)[String(classId)] ?? null

// จำนวนอาวุธที่ตัวละครมีของคลาสนั้น — ใช้บอกผู้เล่นว่าสลับกลับไปจะได้อะไรคืน
export const weaponCountOfClass = (hunter, classId) => {
  if (hunter?.hunter_class_id === classId) return (hunter?.equipments?.weapons ?? []).length
  const entry = stashEntry(hunter, classId)
  return Array.isArray(entry?.weapons) ? entry.weapons.length : 0
}

export const playedClassIds = (hunter) => {
  const ids = new Set()
  if (hunter?.hunter_class_id != null) ids.add(Number(hunter.hunter_class_id))
  for (const key of Object.keys(stashOf(hunter))) ids.add(Number(key))
  return [...ids].filter((n) => Number.isFinite(n))
}

// อาวุธที่ใช้ได้จริงของคลาสนั้น — กันข้อมูลข้ามคลาส/ของที่ถูกลบออกจากเกม ทำให้ช่อง Weapon เปิดไม่ได้
const cleanWeapons = (data, list, classId) => {
  const out = []
  for (const w of Array.isArray(list) ? list : []) {
    if (!weaponInfo(data, classId, w?.weapon_type_id, w?.item_id)) continue
    if (out.some((o) => o.weapon_type_id === w.weapon_type_id && o.item_id === w.item_id)) continue
    out.push({ ...w })
  }
  if (!out.length) {
    const starter = starterWeaponOf(data, classId)
    if (starter) out.push(starter)
  }
  if (out.length && !out.some((w) => w.is_equip)) out[0].is_equip = true
  return out
}

// Starting Armor ของคลาสเก่า → ของคลาสใหม่ ทั้งคลัง · ชิ้นที่ซ้ำกันหลังแปลงยุบเป็นชิ้นเดียว
const migrateArmorSlot = (data, list, fromClassId, toClassId, slot) => {
  const from = starterArmorOf(data, fromClassId, slot)
  const to = starterArmorOf(data, toClassId, slot)
  const out = []
  for (const piece of Array.isArray(list) ? list : []) {
    if (!piece) continue
    const isStarter =
      from && to && piece.equip_set_id === from.equip_set_id && piece.equip_id === from.equip_id
    const next = isStarter ? { ...piece, equip_set_id: to.equip_set_id, equip_id: to.equip_id } : { ...piece }
    const dup = out.find((p) => p.equip_set_id === next.equip_set_id && p.equip_id === next.equip_id)
    if (dup) dup.is_equip = !!dup.is_equip || !!next.is_equip
    else out.push(next)
  }
  // ช่องว่างเปล่าเปิดตัวละครไม่ได้ (State อ่านค่าจากชิ้นที่สวมอยู่) — ใส่ของเริ่มต้นให้
  if (!out.length && to) out.push({ ...to, is_equip: true })
  if (out.length && !out.some((p) => p.is_equip)) out[0].is_equip = true
  return out
}

/** สิ่งที่จะเกิดขึ้นถ้าเปลี่ยนไปคลาสนี้ — ใช้โชว์ในหน้ายืนยันก่อนกดจริง */
export const previewClassSwitch = (data, hunter, toClassId) => {
  const fromClassId = hunter?.hunter_class_id
  const kept = stashEntry(hunter, toClassId)
  const weapons = cleanWeapons(data, kept?.weapons, toClassId)
  const equipped = weapons.find((w) => w.is_equip) ?? weapons[0] ?? null
  const armorChanges = ARMOR_SLOTS.map((slot) => {
    const from = starterArmorOf(data, fromClassId, slot)
    const to = starterArmorOf(data, toClassId, slot)
    if (!from || !to) return null
    if (from.equip_set_id === to.equip_set_id && from.equip_id === to.equip_id) return null
    const owned = (hunter?.equipments?.armors?.[slot] ?? []).filter(
      (p) => p?.equip_set_id === from.equip_set_id && p?.equip_id === from.equip_id,
    )
    if (!owned.length) return null
    return { slot, from, to, worn: owned.some((p) => p.is_equip) }
  }).filter(Boolean)
  return {
    weaponCount: weapons.length,
    equipped: equipped
      ? { ...equipped, info: weaponInfo(data, toClassId, equipped.weapon_type_id, equipped.item_id) }
      : null,
    returning: !!kept, // เคยเล่นคลาสนี้มาก่อน = ได้ของเดิมคืน ไม่ใช่เริ่มจากอาวุธเริ่มต้น
    armorChanges,
  }
}

/**
 * เปลี่ยนคลาสของตัวละคร — คืนตัวละครชุดใหม่ (ไม่แก้ของเดิม) หรือ null ถ้าเปลี่ยนไม่ได้
 * @param {{classes: object[], weapons: object[]}} data ข้อมูลคลาสและอาวุธจากไฟล์ JSON
 */
export const switchHunterClass = (data, hunter, toClassId) => {
  if (!hunter || !classById(data, toClassId)) return null
  const fromClassId = hunter.hunter_class_id
  if (fromClassId === toClassId) return null

  const stash = { ...stashOf(hunter) }
  const watch = Array.isArray(hunter.craft_watch) ? hunter.craft_watch : []
  const kept = stashEntry(hunter, toClassId)

  stash[fromClassId] = {
    weapons: (hunter.equipments?.weapons ?? []).map((w) => ({ ...w })),
    craft_watch: watch.filter((i) => i?.type === 'weapon'),
  }
  delete stash[toClassId]
  delete stash[String(toClassId)]

  const armors = { ...(hunter.equipments?.armors ?? {}) }
  for (const slot of ARMOR_SLOTS) {
    armors[slot] = migrateArmorSlot(data, hunter.equipments?.armors?.[slot], fromClassId, toClassId, slot)
  }

  return {
    ...hunter,
    hunter_class_id: toClassId,
    equipments: { ...hunter.equipments, weapons: cleanWeapons(data, kept?.weapons, toClassId), armors },
    weapon_stash: stash,
    craft_watch: [
      ...watch.filter((i) => i?.type !== 'weapon'),
      ...(Array.isArray(kept?.craft_watch) ? kept.craft_watch : []),
    ],
  }
}
