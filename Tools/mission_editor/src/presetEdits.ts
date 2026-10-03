/**
 * Pure helpers for removing created EquipAiSets / per-unit private copies from the
 * editor's edit state, restoring every affected seat to its original preset.
 * Kept free of React so it can be unit-tested.
 */

export type SeatEdit = {
  slot: number;
  charaset_id: number;
  equipaiset_id: number;
  flags: number;
  use_duplicate?: boolean;
  equipaiset_alloc_key?: string;
};

export type PresetEditsShape = {
  unitsets: { unitset_id: number; slots: SeatEdit[] }[];
  equipaiset_allocations: {
    key: string;
    source_id: number;
    unitset_id: number;
    slot: number;
  }[];
  equipaiset_creates: { key: string; temp_id: number }[];
  equipaiset_lines: Record<string, unknown>;
};

export type OriginalSeat = {
  charaset_id: number;
  equipaiset_id: number;
  flags?: number;
};

export function dropPresetsFromEdits<E extends PresetEditsShape>(
  prev: E,
  tempIds: Set<number>,
  allocKeys: Set<string>,
  originalSeat: (unitsetId: number, slot: number) => OriginalSeat | undefined
): E {
  const goneCreateKeys = new Set(
    prev.equipaiset_creates.filter((c) => tempIds.has(c.temp_id)).map((c) => c.key)
  );
  const restoreSource = (a: { source_id: number; unitset_id: number; slot: number }) => {
    if (a.source_id >= 0 && !tempIds.has(a.source_id)) return a.source_id;
    return originalSeat(a.unitset_id, a.slot)?.equipaiset_id ?? 0;
  };
  const allocations = prev.equipaiset_allocations
    .filter((a) => !allocKeys.has(a.key))
    .map((a) => ({ ...a, source_id: restoreSource(a) }));
  const surviving = new Map(allocations.map((a) => [a.key, a] as const));

  const unitsets = prev.unitsets
    .map((ue) => {
      const slots = ue.slots
        .map((sl): SeatEdit => {
          const key = sl.equipaiset_alloc_key;
          const orig = originalSeat(ue.unitset_id, sl.slot);
          const survivor = key ? surviving.get(key) : undefined;
          // Seat keeps a private copy whose source may have been a deleted preset.
          if (survivor) return { ...sl, equipaiset_id: survivor.source_id };
          const hit =
            tempIds.has(sl.equipaiset_id) ||
            (!!key && (goneCreateKeys.has(key) || allocKeys.has(key)));
          if (!hit) return sl;
          const rest: SeatEdit = { ...sl };
          delete rest.equipaiset_alloc_key;
          // Removed private copy -> keep its (real) source preset. Removed created
          // preset -> whatever the seat originally used.
          const keepSource = !!key && allocKeys.has(key) && sl.equipaiset_id >= 0;
          return {
            ...rest,
            equipaiset_id: keepSource ? sl.equipaiset_id : (orig?.equipaiset_id ?? 0),
          };
        })
        .filter((sl) => {
          if (sl.equipaiset_alloc_key) return true;
          const orig = originalSeat(ue.unitset_id, sl.slot);
          return !(
            orig &&
            orig.charaset_id === sl.charaset_id &&
            orig.equipaiset_id === sl.equipaiset_id &&
            (orig.flags ?? 0) === (sl.flags ?? 0)
          );
        });
      return { ...ue, slots };
    })
    .filter((ue) => ue.slots.length > 0);

  const equipaiset_lines = { ...prev.equipaiset_lines };
  for (const id of tempIds) delete equipaiset_lines[String(id)];

  return {
    ...prev,
    unitsets,
    equipaiset_allocations: allocations,
    equipaiset_creates: prev.equipaiset_creates.filter((c) => !tempIds.has(c.temp_id)),
    equipaiset_lines,
  };
}
