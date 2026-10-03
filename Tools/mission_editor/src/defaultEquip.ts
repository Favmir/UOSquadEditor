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

// ---------------------------------------------------------------------------
// Shared per-seat helpers (used by the unit panel, the formation grid and the
// squad list so they all agree).
// ---------------------------------------------------------------------------

export type SeatForTier = {
  slot: number;
  charaset_id: number;
  chara_param_override?: number;
};

/**
 * Tier a seat's empty gear slots are filled with. `bakedTier` is exact when the
 * seat is unchanged (it includes the squad-boss quirk); it is undefined after the
 * CharaSet was swapped, in which case the tier is recomputed from the squad.
 */
export function resolveSeatTier(o: {
  bakedTier?: number;
  slot: number;
  charasetId: number;
  seats: SeatForTier[];
  exptype?: number | string;
  paramset?: number;
  overrideById: Map<number, number>;
}): number {
  if (o.bakedTier !== undefined) return o.bakedTier;
  const ove = o.overrideById.get(o.charasetId) ?? 0;
  const bossOverride = o.seats.some(
    (s) =>
      s.charaset_id > 0 &&
      (s.slot === o.slot
        ? ove
        : (o.overrideById.get(s.charaset_id) ?? s.chara_param_override ?? 0)) >= 4
  );
  return resolveEquipParam(
    Number(o.exptype) || 0,
    Number(o.paramset) || 0,
    ove,
    bossOverride
  );
}

export type GearLike = {
  item_id?: number;
  rom_item_id?: number;
  source?: string;
  edited?: boolean;
};

export type SeatGearSlot = {
  /** item the CharaSet (or the user) names explicitly; 0 = runtime fill */
  explicit: number;
  fill: DefaultItem | null;
  finalId: number;
};

/** For each of the 4 gear slots: the explicit item, else what the game fills in. */
export function previewSeatGear(
  gear: GearLike[],
  tables: EquipTables,
  classId: number,
  tier: number,
  level: number,
  charasetId: number
): SeatGearSlot[] {
  return gear.map((g, i) => {
    // An item the CharaSet (or the user) names explicitly always wins.
    const rom = g.rom_item_id ?? (g.source === "charaset" ? g.item_id : 0);
    const explicit = g.edited ? g.item_id || 0 : rom || 0;
    const fill = explicit
      ? null
      : resolveDefaultItem(tables, classId, i, tier, level, charasetId);
    return { explicit, fill, finalId: explicit || fill?.itemId || 0 };
  });
}

/**
 * How a seat is equipped, for color coding.
 *  - custom: at least one slot holds an item that is NOT default equipment (named in
 *    the CharaSet or placed by hand). Mixed units count too: they are "important".
 *  - default / normal / power / boss: every equipped slot comes from that default band.
 *  - none: nothing equipped at all.
 */
export type GearKind = "default" | "normal" | "power" | "boss" | "custom" | "none";

export const GEAR_KIND_LABEL: Record<GearKind, string> = {
  default: "Default",
  normal: "Normal",
  power: "Power",
  boss: "Boss",
  custom: "Custom",
  none: "No gear",
};

export type GearBand = "default" | "normal" | "power" | "boss";

export function bandOfTier(tier: number): GearBand {
  return tier === 4 ? "boss" : tier === 3 ? "power" : tier === 2 ? "normal" : "default";
}

export type GearInfo = {
  kind: GearKind;
  /** the default band empty slots are filled from (meaningful when defaultCount > 0) */
  band: GearBand;
  /** slots holding an item that is not default equipment */
  explicitCount: number;
  /** slots filled from the default band */
  defaultCount: number;
};

export function gearInfoOf(slots: SeatGearSlot[], tier: number): GearInfo {
  const explicitCount = slots.filter((s) => s.explicit > 0).length;
  const defaultCount = slots.filter((s) => !s.explicit && (s.fill?.itemId ?? 0) > 0).length;
  const band = bandOfTier(tier);
  const kind: GearKind =
    explicitCount > 0 ? "custom" : defaultCount > 0 ? band : "none";
  return { kind, band, explicitCount, defaultCount };
}

const KIND_RANK: Record<GearKind, number> = {
  none: 0,
  default: 1,
  normal: 2,
  power: 3,
  boss: 4,
  custom: 5,
};

/** Most notable kind in a squad (custom > boss > power > normal > default > none). */
export function topGearKind(kinds: GearKind[]): GearKind | null {
  let best: GearKind | null = null;
  for (const k of kinds) if (best === null || KIND_RANK[k] > KIND_RANK[best]) best = k;
  return best;
}
