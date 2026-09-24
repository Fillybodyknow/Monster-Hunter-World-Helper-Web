#!/usr/bin/env node
// ทดสอบการเปลี่ยนสายอาวุธของตัวละครเดิม (src/services/classSwitch.js) — `npm test`
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  switchHunterClass,
  previewClassSwitch,
  weaponCountOfClass,
  playedClassIds,
  starterArmorOf,
} from '../src/services/classSwitch.js'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'))
const DATA = { classes: read('src/assets/files/class_hunter.json'), weapons: read('src/assets/files/weapons.json') }

let failures = 0
let checks = 0
const expect = (cond, msg) => {
  checks++
  if (!cond && failures++ < 20) console.log('  ✗ ' + msg)
}

// คลาสที่ Starting Armor ต่างชุดกันแน่ ๆ — Great Sword (Chainmail) กับ Dual Blades (Leather)
const GS = 1
const DB = 3
const LS = 7 // Longsword — Chainmail เหมือน Great Sword
const armorOf = (classId, slot) => starterArmorOf(DATA, classId, slot)
const piece = (a, extra = {}) => ({ ...a, ...extra })

const makeHunter = (classId = GS) => ({
  hunter_id: 1,
  hunter_name: 'Ann',
  hunter_class_id: classId,
  campaign_day: 3,
  hr_points: 42,
  inventory: [{ resource_type_id: 1, item_id: 1, quantity: 5 }],
  craft_watch: [
    { key: 'armor_5_1', type: 'armor', equip_set_id: 5, equip_id: 1 },
    { key: 'weapon_1_2', type: 'weapon', weapon_type_id: 1, item_id: 2, name: 'Buster Blade' },
  ],
  equipments: {
    weapons: [
      { weapon_type_id: 1, item_id: 1, is_equip: false },
      { weapon_type_id: 1, item_id: 2, is_equip: true },
    ],
    armors: {
      helm: [piece(armorOf(classId, 'helm'), { is_equip: true })],
      mail: [piece(armorOf(classId, 'mail'), { is_equip: true })],
      greaves: [piece(armorOf(classId, 'greaves'), { is_equip: true })],
    },
  },
})

// ── 1. เปลี่ยนคลาสครั้งแรก: ได้อาวุธเริ่มต้นของคลาสใหม่ ──
{
  const before = makeHunter(GS)
  const after = switchHunterClass(DATA, before, DB)
  expect(after.hunter_class_id === DB, 'คลาสเปลี่ยนเป็นคลาสใหม่')
  expect(before.hunter_class_id === GS && before.equipments.weapons.length === 2, 'ของเดิมไม่ถูกแก้ (คืนชุดใหม่เสมอ)')
  expect(after.equipments.weapons.length === 1, 'คลาสที่ไม่เคยเล่น เริ่มจากอาวุธเริ่มต้นชิ้นเดียว')
  expect(after.equipments.weapons[0].is_equip === true, 'อาวุธเริ่มต้นถูกสวมให้เลย')
  expect(after.campaign_day === 3 && after.hr_points === 42 && after.inventory.length === 1, 'Day / แต้ม HR / Inventory ใช้ร่วมกันทุกคลาส')
}

// ── 2. อาวุธของคลาสเก่าถูกเก็บไว้ และได้คืนครบตอนสลับกลับ ──
{
  const gs = makeHunter(GS)
  const db = switchHunterClass(DATA, gs, DB)
  expect(weaponCountOfClass(db, GS) === 2, 'อาวุธคลาสเก่าถูกเก็บไว้ในคลัง')
  const back = switchHunterClass(DATA, db, GS)
  expect(back.equipments.weapons.length === 2, 'สลับกลับได้อาวุธเดิมครบ')
  expect(back.equipments.weapons.find((w) => w.item_id === 2)?.is_equip === true, 'อาวุธที่สวมอยู่ตอนเปลี่ยนไป ยังสวมอยู่ตอนกลับมา')
  expect(weaponCountOfClass(back, DB) === 1, 'อาวุธของคลาสที่เพิ่งออกมา ถูกเก็บไว้แทน')
  expect(playedClassIds(back).sort().join(',') === `${GS},${DB}`, 'จำได้ว่าเคยเล่นคลาสไหนมาบ้าง')
}

// ── 3. Starting Armor เปลี่ยนตามคลาส ทั้งคลัง ──
{
  const gs = makeHunter(GS)
  // เก็บ Starting Armor ของ Great Sword ไว้สองชิ้นในช่อง helm (ชิ้นที่ไม่ได้ใส่ด้วย)
  gs.equipments.armors.helm = [
    piece(armorOf(GS, 'helm'), { is_equip: true }),
    { equip_set_id: 5, equip_id: 1, is_equip: false }, // เกราะ Great Jagras ที่คราฟต์เอง
  ]
  const db = switchHunterClass(DATA, gs, DB)
  const helm = db.equipments.armors.helm
  const want = armorOf(DB, 'helm')
  expect(helm[0].equip_set_id === want.equip_set_id && helm[0].equip_id === want.equip_id, 'Starting Armor กลายเป็นของคลาสใหม่')
  expect(helm[0].is_equip === true, 'ชิ้นที่ใส่อยู่ ยังใส่อยู่หลังเปลี่ยน')
  expect(helm.some((p) => p.equip_set_id === 5), 'เกราะที่คราฟต์เองไม่ถูกแตะ')
  expect(helm.length === 2, 'จำนวนชิ้นในคลังเท่าเดิม')
  for (const slot of ['mail', 'greaves']) {
    const w = armorOf(DB, slot)
    const got = db.equipments.armors[slot][0]
    expect(got.equip_set_id === w.equip_set_id && got.equip_id === w.equip_id, `Starting Armor ช่อง ${slot} เปลี่ยนด้วย`)
  }
}

// ── 4. คลาสที่ Starting Armor ชุดเดียวกัน ไม่ต้องเปลี่ยนเกราะ ──
{
  const gs = makeHunter(GS)
  const ls = switchHunterClass(DATA, gs, LS)
  const same = armorOf(GS, 'helm')
  expect(ls.equipments.armors.helm[0].equip_set_id === same.equip_set_id, 'คลาสที่ใช้ Starting Armor ชุดเดียวกัน เกราะคงเดิม')
  expect(previewClassSwitch(DATA, gs, LS).armorChanges.length === 0, 'หน้ายืนยันบอกว่าไม่มีเกราะต้องเปลี่ยน')
  expect(previewClassSwitch(DATA, gs, DB).armorChanges.length === 3, 'เปลี่ยนไปคลาสคนละชุด บอกว่าเกราะเปลี่ยน 3 ช่อง')
}

// ── 5. มีทั้งสองชุดอยู่แล้ว → ยุบเป็นชิ้นเดียว ไม่ซ้ำ ──
{
  const gs = makeHunter(GS)
  gs.equipments.armors.helm = [
    piece(armorOf(GS, 'helm'), { is_equip: true }),
    piece(armorOf(DB, 'helm'), { is_equip: false }), // ชุดของคลาสปลายทาง มีอยู่แล้วจากการสลับครั้งก่อน
  ]
  const db = switchHunterClass(DATA, gs, DB)
  expect(db.equipments.armors.helm.length === 1, 'ชิ้นที่ซ้ำกันหลังแปลงยุบเหลือชิ้นเดียว')
  expect(db.equipments.armors.helm[0].is_equip === true, 'ชิ้นที่ยุบแล้วยังถือว่าใส่อยู่')
}

// ── 6. รายการติดตามคราฟต์: เกราะอยู่ต่อ อาวุธแยกตามคลาส ──
{
  const gs = makeHunter(GS)
  const db = switchHunterClass(DATA, gs, DB)
  expect(db.craft_watch.length === 1 && db.craft_watch[0].type === 'armor', 'ติดตามเกราะอยู่ต่อ ติดตามอาวุธของคลาสเก่าถูกพักไว้')
  const back = switchHunterClass(DATA, db, GS)
  expect(back.craft_watch.some((i) => i.type === 'weapon' && i.item_id === 2), 'กลับคลาสเดิมได้รายการติดตามอาวุธคืน')
  expect(back.craft_watch.filter((i) => i.type === 'armor').length === 1, 'ติดตามเกราะไม่ซ้ำหลังสลับไปกลับ')
}

// ── 7. ข้อมูลพัง / คลาสไม่มีจริง ต้องไม่ทำให้ตัวละครเสีย ──
{
  expect(switchHunterClass(DATA, makeHunter(GS), 999) === null, 'คลาสที่ไม่มีอยู่จริง = ไม่เปลี่ยน')
  expect(switchHunterClass(DATA, makeHunter(GS), GS) === null, 'คลาสเดิม = ไม่เปลี่ยน')
  expect(switchHunterClass(DATA, null, DB) === null, 'ไม่มีตัวละคร = ไม่เปลี่ยน')
  const broken = makeHunter(GS)
  broken.equipments.armors.helm = []
  broken.equipments.weapons = []
  const fixed = switchHunterClass(DATA, broken, DB)
  expect(fixed.equipments.armors.helm.length === 1 && fixed.equipments.armors.helm[0].is_equip, 'ช่องเกราะว่าง ได้ของเริ่มต้นของคลาสใหม่')
  expect(fixed.equipments.weapons.length === 1 && fixed.equipments.weapons[0].is_equip, 'ไม่มีอาวุธเลย ได้อาวุธเริ่มต้นและสวมให้')
}

// ── 8. อาวุธข้ามคลาสที่ไม่มีอยู่จริงในคลาสใหม่ ต้องไม่หลุดเข้าไป ──
{
  const gs = makeHunter(GS)
  const db = switchHunterClass(DATA, gs, DB)
  db.weapon_stash[GS].weapons.push({ weapon_type_id: 99, item_id: 99, is_equip: false })
  const back = switchHunterClass(DATA, db, GS)
  expect(!back.equipments.weapons.some((w) => w.item_id === 99), 'อาวุธที่ไม่มีในข้อมูลเกมถูกคัดทิ้ง')
}

// ── 9. ทุกคลาสในไฟล์ข้อมูลสลับไปได้จริง ──
{
  for (const c of DATA.classes) {
    if (c.hunter_class_id === GS) continue
    const after = switchHunterClass(DATA, makeHunter(GS), c.hunter_class_id)
    const w = after?.equipments.weapons[0]
    expect(!!after && !!w, `สลับไป ${c.hunter_class} ได้`)
    for (const slot of ['helm', 'mail', 'greaves']) {
      const want = armorOf(c.hunter_class_id, slot)
      const got = after.equipments.armors[slot].find((p) => p.is_equip)
      expect(got.equip_set_id === want.equip_set_id && got.equip_id === want.equip_id, `${c.hunter_class}: เกราะช่อง ${slot} เป็นของคลาสใหม่`)
    }
  }
}

console.log(failures ? `\n✗ ไม่ผ่าน ${failures} จาก ${checks} ข้อ` : `✓ ผ่านทั้งหมด ${checks} ข้อ`)
process.exit(failures ? 1 : 0)
