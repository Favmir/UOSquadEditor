/**
 * Which seats use which CharaSet, with pending seat edits applied.
 *
 * A seat only POINTS at a CharaSet; the four gear item ids live in the CharaSet row
 * itself. Editing gear for one unit therefore rewrites the shared row for every unit
 * that uses it, unless the row can be copied to a free CharaSet row (this game has
 * none). Counting must include seats the user swapped in and exclude seats swapped out.
 */

export type SeatRef = { unitset_id: number; slot: number };

type MissionLike = {
  squads?: {
    unitset_id?: number;
    slots?: { slot?: number; charaset_id?: number }[];
  }[];
};

type UnitEditLike = {
  unitset_id?: number;
  slots?: { slot?: number; charaset_id?: number }[];
};

/** CharaSet id -> seats using it (baseline seats, then edits applied on top). */
export function charasetSeats(
  missions: MissionLike[],
  unitEdits: UnitEditLike[]
): Map<number, SeatRef[]> {
  const seatCharaset = new Map<string, { ref: SeatRef; cid: number }>();
  for (const m of missions)
    for (const sq of m.squads ?? [])
      for (const sl of sq.slots ?? []) {
        const cid = Number(sl.charaset_id || 0);
        if (cid <= 0) continue;
        const ref = { unitset_id: Number(sq.unitset_id || 0), slot: Number(sl.slot || 0) };
        seatCharaset.set(`${ref.unitset_id}:${ref.slot}`, { ref, cid });
      }
  for (const ue of unitEdits)
    for (const sl of ue.slots ?? []) {
      const ref = { unitset_id: Number(ue.unitset_id || 0), slot: Number(sl.slot || 0) };
      const cid = Number(sl.charaset_id || 0);
      const key = `${ref.unitset_id}:${ref.slot}`;
      if (cid <= 0) seatCharaset.delete(key);
      else seatCharaset.set(key, { ref, cid });
    }
  const out = new Map<number, SeatRef[]>();
  for (const { ref, cid } of seatCharaset.values()) {
    const list = out.get(cid) ?? [];
    list.push(ref);
    out.set(cid, list);
  }
  return out;
}
