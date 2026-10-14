/**
 * Reverting one mission squad (UnitSet) to the original game data.
 *
 * Squad-specific edits live in three places: the seat list (who stands where, leader
 * flags, tactics preset), private tactics copies made for its seats, and the squad's
 * equip tier (PARAMSET). CharaSet gear and CharaSet tier overrides are NOT squad
 * edits: they belong to the CharaSet and apply to every squad that uses it, so they
 * are reverted only when asked for.
 */

export type RevertOptions = {
  /** seat assignments, positions, leader flags, tactics presets and private tactics copies */
  seats: boolean;
  /** the squad's own equip tier (PARAMSET) */
  paramset: boolean;
  /** CharaSets whose gear edits to drop */
  gearIds: number[];
  /** CharaSets whose tier override edits to drop */
  tierIds: number[];
};

type RevertShape = {
  unitsets: { unitset_id: number }[];
  equipaiset_allocations: { unitset_id: number }[];
  squad_paramsets: { unitset_id: number }[];
  charasets: { charaset_id: number }[];
  charaset_tier_overrides: { charaset_id: number }[];
};

export function revertSquadEdits<E extends RevertShape>(
  prev: E,
  unitsetId: number,
  o: RevertOptions
): E {
  const gone = new Set(o.gearIds);
  const goneTier = new Set(o.tierIds);
  return {
    ...prev,
    unitsets: o.seats ? prev.unitsets.filter((u) => u.unitset_id !== unitsetId) : prev.unitsets,
    equipaiset_allocations: o.seats
      ? prev.equipaiset_allocations.filter((a) => a.unitset_id !== unitsetId)
      : prev.equipaiset_allocations,
    squad_paramsets: o.paramset
      ? prev.squad_paramsets.filter((e) => e.unitset_id !== unitsetId)
      : prev.squad_paramsets,
    charasets: gone.size ? prev.charasets.filter((c) => !gone.has(c.charaset_id)) : prev.charasets,
    charaset_tier_overrides: goneTier.size
      ? prev.charaset_tier_overrides.filter((e) => !goneTier.has(e.charaset_id))
      : prev.charaset_tier_overrides,
  };
}

export type SharedCharasetEdit = {
  charasetId: number;
  name: string;
  /** squads other than this one that use the CharaSet */
  otherSquads: number;
};

export type SquadEditSummary = {
  /** edited seats (assignments, positions, flags, presets) */
  seatEdits: number;
  /** private tactics copies */
  tacticsCopies: number;
  paramsetEdited: boolean;
  gear: SharedCharasetEdit[];
  tiers: SharedCharasetEdit[];
  /** created presets used only by this squad: kept after the revert (they cost a row) */
  orphanedCreates: string[];
  /** anything squad-specific to revert? */
  hasSquadEdits: boolean;
};

type SummaryEdits = {
  unitsets: { unitset_id: number; slots: { equipaiset_id: number }[] }[];
  equipaiset_allocations: { unitset_id: number; source_id: number }[];
  equipaiset_creates: { temp_id: number; symbol?: string }[];
  squad_paramsets: { unitset_id: number }[];
  charasets: { charaset_id: number }[];
  charaset_tier_overrides: { charaset_id: number }[];
};

export function summarizeSquadEdits(o: {
  unitsetId: number;
  edits: SummaryEdits;
  /** CharaSets in this squad in the original data and as currently placed */
  charasetIds: number[];
  /** CharaSet id -> seats using it now (all squads) */
  usage: Map<number, { unitset_id: number }[]>;
  charasetName: (id: number) => string;
}): SquadEditSummary {
  const { unitsetId: uid, edits } = o;
  const mine = edits.unitsets.find((u) => u.unitset_id === uid);
  const seatEdits = mine?.slots.length ?? 0;
  const tacticsCopies = edits.equipaiset_allocations.filter((a) => a.unitset_id === uid).length;
  const paramsetEdited = edits.squad_paramsets.some((e) => e.unitset_id === uid);

  const describe = (cid: number): SharedCharasetEdit => ({
    charasetId: cid,
    name: o.charasetName(cid),
    otherSquads: new Set(
      (o.usage.get(cid) ?? []).filter((u) => u.unitset_id !== uid).map((u) => u.unitset_id)
    ).size,
  });
  const ids = [...new Set(o.charasetIds)].sort((a, b) => a - b);
  const gearSet = new Set(edits.charasets.map((c) => c.charaset_id));
  const tierSet = new Set(edits.charaset_tier_overrides.map((c) => c.charaset_id));

  // created presets (negative temp ids) this squad uses, and whether anyone else does
  const usedBy = (predicate: (unitsetId: number) => boolean): Set<number> => {
    const set = new Set<number>();
    for (const u of edits.unitsets)
      if (predicate(u.unitset_id)) for (const s of u.slots) if (s.equipaiset_id < 0) set.add(s.equipaiset_id);
    for (const a of edits.equipaiset_allocations)
      if (predicate(a.unitset_id) && a.source_id < 0) set.add(a.source_id);
    return set;
  };
  const mineIds = usedBy((id) => id === uid);
  const othersIds = usedBy((id) => id !== uid);
  const orphanedCreates = edits.equipaiset_creates
    .filter((c) => mineIds.has(c.temp_id) && !othersIds.has(c.temp_id))
    .map((c) => c.symbol || `created preset ${c.temp_id}`);

  return {
    seatEdits,
    tacticsCopies,
    paramsetEdited,
    gear: ids.filter((c) => gearSet.has(c)).map(describe),
    tiers: ids.filter((c) => tierSet.has(c)).map(describe),
    orphanedCreates,
    hasSquadEdits: seatEdits > 0 || tacticsCopies > 0 || paramsetEdited,
  };
}
