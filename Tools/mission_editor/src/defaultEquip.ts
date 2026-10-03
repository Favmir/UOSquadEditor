/**
 * Client-side port of the native CreateDefaultEquip rule (see
 * Scripts/build_mission_squads_json.py: resolve_equip_param / resolve_default_item
 * and Docs/squad_tactics_equipment.md). Pure functions so they can be unit-tested
 * and so previews follow edits made in the "Default gear" tab.
 */

/** EQUIPTYPE id offset added to the class slot type, by PARAMSET tier. */
export const PARAMSET_ET_OFFSET: Record<number, number> = {
  0: 0,
  1: 11,
  2: 22,
  3: 33,
  4: 44,
};

export const TIER_NAMES: Record<number, string> = {
  0: "DEFAULT",
  1: "ZAKO",
  2: "NORMAL",
  3: "POWER",
  4: "BOSS",
};

/** Native 0x123844: level -> item column (or -1 when out of range). */
export function levelColumn(level: number): number {
  if (level < 1) return -1;
  if (level < 15) return 0;
  if (level < 28) return 1;
  if (level < 51) return 2;
  return -1;
}

/** Native 0x123834: keep tiers in [2, 4], anything else -> 0 (DEFAULT band). */
export function clampEquipParam(tier: number): number {
  return tier >= 2 && tier <= 4 ? tier : 0;
}

/** Tier used for an empty slot: PARAMSET, then CharaSet +0x1E, then clamp. */
export function resolveEquipParam(
  exptype: number,
  paramset: number,
  charaOverride: number,
  squadBossOverride = false
): number {
  let tier = paramset === 0 ? (exptype < 5 ? 2 : 0) : paramset;
  if (charaOverride) tier = charaOverride;
  tier = clampEquipParam(tier);
  if (!charaOverride && squadBossOverride && tier === 2) tier = 3;
  return tier;
}

export type EquipTables = {
  /** class_id -> equiptype id of each of the 4 slots */
  classEts: Map<number, number[]>;
  /** equiptype id -> item ids for the 3 level columns */
  etItems: Map<number, [number, number, number]>;
  /** equiptype id -> symbol (for labels) */
  etSymbols: Map<number, string>;
};

export type DefaultItem = {
  itemId: number;
  equiptypeId: number;
  equiptypeSymbol: string;
  column: number;
  tier: number;
};

/** Item the game would put in an empty CharaSet gear slot. itemId 0 = nothing. */
export function resolveDefaultItem(
  tables: EquipTables,
  classId: number,
  slotIndex: number,
  tier: number,
  level: number,
  charasetId: number
): DefaultItem {
  const none = (et: number, col: number): DefaultItem => ({
    itemId: 0,
    equiptypeId: et,
    equiptypeSymbol: tables.etSymbols.get(et) || "",
    column: col,
    tier,
  });
  const bases = tables.classEts.get(classId) || [0, 0, 0, 0];
  if (!(slotIndex >= 0 && slotIndex < 4)) return none(0, -1);
  const col = levelColumn(level);
  if (col < 0) return none(0, -1);
  // Native computes tier*11 + class slot type even when the type is NONE (0).
  const et = (bases[slotIndex] || 0) + (PARAMSET_ET_OFFSET[tier] ?? 0);
  const row = tables.etItems.get(et);
  if (!row) return none(et, col);
  const itemId = row[col] || 0;
  // Native DD290: accessory fills are skipped for CharaSet ids 1..560.
  if (itemId && charasetId >= 1 && charasetId <= 560 && itemId >= 0x30f && itemId < 0x30f + 0xc8) {
    return none(et, col);
  }
  return {
    itemId,
    equiptypeId: et,
    equiptypeSymbol: tables.etSymbols.get(et) || "",
    column: col,
    tier,
  };
}
