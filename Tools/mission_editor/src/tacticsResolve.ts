/** Client-side tactics resolution matching Scripts/build_mission_squads_json.py */

export type ResolveLine = {
  action: number;
  slot?: number;
  if0: number;
  if1: number;
  if0_symbol?: string;
  if1_symbol?: string;
  skill_id?: number;
  skill_symbol?: string;
  skill_name?: string;
  learn_level?: number;
  locked?: boolean;
  from_class_default?: boolean;
  from_item?: boolean;
  from_equipaiset_preset?: boolean;
  ref_kind?: string;
  /** Display only: what a class-slot marker line resolves to. */
  resolved_skill_id?: number;
};

export type ClassLine = ResolveLine & {
  action: number;
  skill_id?: number;
  skill_name?: string;
  skill_symbol?: string;
  learn_level?: number;
};

export type ItemSkill = {
  skill_id: number;
  skill_symbol?: string;
  skill_name?: string;
  if0: number;
  if1: number;
  if0_symbol?: string;
  if1_symbol?: string;
};

export type SkillMeta = {
  id: number;
  symbol?: string;
  name?: string;
};

export type IfMeta = { id: number; symbol?: string };

const MARKER_MIN = 2;
const MARKER_MAX = 10;

export function isClassMarker(skillRef: number): boolean {
  return skillRef >= MARKER_MIN && skillRef <= MARKER_MAX;
}

function ifSym(id: number, ifs: Map<number, string>): string | undefined {
  if (!id) return undefined;
  return ifs.get(id);
}

export function tacticsForClass(
  classLines: ClassLine[],
  unitLevel: number,
  gearItemIds: number[],
  itemSkills: Map<number, ItemSkill>,
  ifs: Map<number, string>
): ResolveLine[] {
  const lvl = unitLevel > 0 ? unitLevel : 1;
  const classRows = classLines.map((line) => {
    // Always label conditions from the IF list: an edited class row may carry only
    // the id (or a stale label from before it was changed).
    const s0 = ifSym(line.if0 || 0, ifs) ?? line.if0_symbol;
    const s1 = ifSym(line.if1 || 0, ifs) ?? line.if1_symbol;
    return {
      ...line,
      if0_symbol: line.if0 ? s0 : undefined,
      if1_symbol: line.if1 ? s1 : undefined,
      locked: (line.learn_level || 1) > lvl,
      from_class_default: true,
    };
  });
  const actives = classRows.filter((r) => (r.action || 0) < 7);
  const passives = classRows.filter((r) => (r.action || 0) >= 7);
  const have = new Set(
    classRows.map((r) => r.skill_id || 0).filter((id) => id > 0)
  );

  const itemActive: ResolveLine[] = [];
  const itemPassive: ResolveLine[] = [];
  for (const iid of gearItemIds) {
    const meta = itemSkills.get(iid);
    if (!meta?.skill_id || have.has(meta.skill_id)) continue;
    have.add(meta.skill_id);
    const ssym = meta.skill_symbol || "";
    const kindPassive = ssym.startsWith("PAS_");
    const entry: ResolveLine = {
      action: kindPassive ? 7 : 3,
      if0: meta.if0 || 0,
      if1: meta.if1 || 0,
      from_item: true,
      learn_level: 1,
      skill_id: meta.skill_id,
      skill_symbol: ssym,
      skill_name: meta.skill_name || ssym,
    };
    const s0 = meta.if0_symbol || ifSym(entry.if0, ifs);
    const s1 = meta.if1_symbol || ifSym(entry.if1, ifs);
    if (s0) entry.if0_symbol = s0;
    if (s1) entry.if1_symbol = s1;
    (kindPassive ? itemPassive : itemActive).push(entry);
  }
  return [...actives, ...itemActive, ...itemPassive, ...passives];
}

export function tacticsForPreset(
  classLines: ClassLine[],
  unitLevel: number,
  presetLines: ResolveLine[],
  skills: Map<number, SkillMeta>,
  ifs: Map<number, string>
): ResolveLine[] {
  const lvl = unitLevel > 0 ? unitLevel : 1;
  const byAction = new Map<number, ClassLine>();
  for (const line of classLines) {
    byAction.set(line.action || 0, line);
  }
  if (!presetLines.length) {
    return tacticsForClass(classLines, unitLevel, [], new Map(), ifs);
  }

  const out: ResolveLine[] = [];
  for (const ln of presetLines) {
    const sid = ln.skill_id || 0;
    const refKind =
      ln.ref_kind || (isClassMarker(sid) ? "class_slot" : sid ? "skill" : "");
    const if0 = ln.if0 || 0;
    const if1 = ln.if1 || 0;
    const entry: ResolveLine = {
      action: 0,
      slot: ln.slot ?? 0,
      if0,
      if1,
      from_equipaiset_preset: true,
      ref_kind: refKind,
    };
    const s0 = ln.if0_symbol || ifSym(if0, ifs);
    const s1 = ln.if1_symbol || ifSym(if1, ifs);
    if (s0) entry.if0_symbol = s0;
    if (s1) entry.if1_symbol = s1;

    if (refKind === "class_slot" || isClassMarker(sid)) {
      // Older forked lines keep the marker in `action` and the resolved skill in skill_id.
      const markerRef = isClassMarker(sid) ? sid : ln.action || 0;
      const base = byAction.get(markerRef);
      if (!base) continue;
      entry.action = base.action || sid;
      entry.skill_id = base.skill_id || 0;
      entry.skill_symbol = base.skill_symbol || "";
      // Prefer the official catalog name over whatever was baked into the class row.
      entry.skill_name =
        skills.get(base.skill_id || 0)?.name || base.skill_name || "";
      entry.learn_level = base.learn_level || 1;
      entry.locked = (base.learn_level || 1) > lvl;
      entry.from_class_default = true;
    } else if (sid) {
      const meta = skills.get(sid);
      entry.action = ln.action || 3;
      entry.skill_id = sid;
      entry.skill_symbol = ln.skill_symbol || meta?.symbol || "";
      entry.skill_name = ln.skill_name || meta?.name || entry.skill_symbol;
      entry.learn_level = 1;
      entry.locked = false;
      entry.from_item = true;
    } else {
      continue;
    }
    out.push(entry);
  }
  return out;
}

export function resolveMarkerHint(
  skillRef: number,
  classLines: ClassLine[],
  skills?: Map<number, SkillMeta>
): { skill_id: number; skill_name: string; skill_symbol: string } | null {
  if (!isClassMarker(skillRef)) return null;
  const base = classLines.find((l) => (l.action || 0) === skillRef);
  if (!base?.skill_id) return null;
  return {
    skill_id: base.skill_id,
    skill_name: skills?.get(base.skill_id)?.name || base.skill_name || "",
    skill_symbol: base.skill_symbol || "",
  };
}

/**
 * Turn resolved ("final") tactics back into editable preset lines WITHOUT losing
 * what each line means in the game:
 *  - lines that come from the class table are stored as class-slot MARKERS
 *    (skill_id = marker 3..10), exactly like vanilla presets, so they keep
 *    following the unit's class defaults;
 *  - everything else (item / explicit skills) stays a concrete skill id.
 * Writing the resolved skill id for class lines (what the baked unit lines hold)
 * would silently turn them into fixed skills.
 */
export function toEditableLines(final: ResolveLine[]): ResolveLine[] {
  return final.map((ln, i) => {
    const marker = ln.action || 0;
    const isClassLine =
      (ln.ref_kind === "class_slot" || ln.from_class_default) &&
      !ln.from_item &&
      isClassMarker(marker);
    if (!isClassLine) {
      return { ...ln, slot: i };
    }
    return {
      ...ln,
      slot: i,
      skill_id: marker,
      ref_kind: "class_slot",
      // keep what it resolves to for display only
      resolved_skill_id: ln.skill_id || 0,
    } as ResolveLine;
  });
}

export type SkillIfEdit = { skill_id: number; if0?: number; if1?: number };

/** Apply per-skill default-IF edits to one line (only the fields that are set). */
export function withSkillIfEdit<T extends { skill_id?: number; if0?: number; if1?: number; if0_symbol?: string; if1_symbol?: string }>(
  line: T,
  edits: Map<number, SkillIfEdit>,
  ifLabel: (id: number) => string | undefined
): T {
  const e = edits.get(Number(line.skill_id || 0));
  if (!e) return line;
  const next = { ...line };
  if (e.if0 !== undefined) {
    next.if0 = e.if0;
    next.if0_symbol = e.if0 ? ifLabel(e.if0) : undefined;
  }
  if (e.if1 !== undefined) {
    next.if1 = e.if1;
    next.if1_symbol = e.if1 ? ifLabel(e.if1) : undefined;
  }
  return next;
}

/**
 * Class default tactics as they will be AFTER the pending edits: class-slot edits
 * replace a class's list, then per-skill default-IF edits apply on top (same
 * precedence as the exporter).
 */
export function overlayClassEdits<L extends ResolveLine, E extends { class_id: number; lines: L[] }>(
  base: E[],
  classEdits: { class_id: number; lines: L[] }[],
  skillIfEdits: SkillIfEdit[],
  ifLabel: (id: number) => string | undefined
): E[] {
  if (!classEdits.length && !skillIfEdits.length) return base;
  const byClass = new Map<number, L[]>(classEdits.map((c): [number, L[]] => [c.class_id, c.lines]));
  const ifEdits = new Map<number, SkillIfEdit>(skillIfEdits.map((e): [number, SkillIfEdit] => [e.skill_id, e]));
  return base.map((entry) => {
    let lines = byClass.get(entry.class_id) ?? entry.lines;
    if (ifEdits.size) lines = lines.map((ln) => withSkillIfEdit(ln, ifEdits, ifLabel));
    return lines === entry.lines ? entry : { ...entry, lines };
  });
}
