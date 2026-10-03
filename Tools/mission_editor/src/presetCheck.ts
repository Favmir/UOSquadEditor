/**
 * Detects tactics presets that reference something the unit does not have.
 * The game freezes when a unit tries to use a skill it does not own, e.g. an
 * EquipAiSet made for White Knight_HG (class slot 5 = Saint's Blade) placed on a
 * regular White Knight, whose class has no slot 5.
 */

export const MARKER_LABELS: Record<number, string> = {
  3: "Active Lv1",
  4: "Active Lv2",
  5: "Active Lv3",
  6: "Active Lv4",
  7: "Passive Lv1",
  8: "Passive Lv2",
  9: "Passive Lv3",
  10: "Passive Lv4",
};

export type PresetProblem = {
  /** error = will reference a skill the unit does not have; unverified = it might come from equipment we have no data for */
  severity: "error" | "unverified";
  /** 1-based position of the line in the preset */
  line: number;
  message: string;
};

type RawLine = {
  skill_id?: number;
  action?: number;
  ref_kind?: string;
  skill_name?: string;
};

export type PresetCheckInput = {
  presetLines: RawLine[];
  /** the unit's class table rows (marker slot = action, skill = skill_id) */
  classLines: { action?: number; skill_id?: number }[];
  className: string;
  /** skills the unit has: class pool + equipment (as far as known) */
  haveSkillIds?: Set<number>;
  /** whether an explicit skill might still be granted by equipment we lack data for */
  mayComeFromGear?: (skillId: number) => boolean;
  skillName?: (skillId: number) => string;
  /** class-slot references are always checked; explicit skills only when enabled */
  checkExplicit?: boolean;
};

export function findPresetProblems(input: PresetCheckInput): PresetProblem[] {
  const out: PresetProblem[] = [];
  const classSlots = new Set(
    input.classLines
      .filter((c) => (c.skill_id || 0) > 0)
      .map((c) => c.action || 0)
  );
  input.presetLines.forEach((ln, i) => {
    const sid = Number(ln.skill_id || 0);
    const isMarker = (n: number) => n >= 2 && n <= 10;
    const kind = ln.ref_kind || (isMarker(sid) ? "class_slot" : sid ? "skill" : "");
    if (kind === "class_slot" || isMarker(sid)) {
      // Older forked lines keep the marker in `action` and the resolved skill in skill_id.
      const marker = isMarker(sid) ? sid : Number(ln.action || 0);
      if (!isMarker(marker) || marker === 2) return; // 2 = normal attack, always present
      if (!classSlots.has(marker)) {
        out.push({
          severity: "error",
          line: i + 1,
          message:
            `Line ${i + 1}: ${MARKER_LABELS[marker]} (class slot ${marker}) — ` +
            `${input.className} has no skill in that slot.`,
        });
      }
      return;
    }
    if (input.checkExplicit === false || sid <= 0 || !input.haveSkillIds) return;
    if (input.haveSkillIds.has(sid)) return;
    const name = input.skillName?.(sid) || ln.skill_name || `Skill ${sid}`;
    const gear = input.mayComeFromGear?.(sid) ?? false;
    out.push({
      severity: gear ? "unverified" : "error",
      line: i + 1,
      message: gear
        ? `Line ${i + 1}: ${name} — not a ${input.className} skill; it works only if equipment grants it (no data for this unit's gear).`
        : `Line ${i + 1}: ${name} — ${input.className} does not have this skill (not a class skill and not granted by its gear).`,
    });
  });
  return out.sort(
    (a, b) =>
      (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1) ||
      a.line - b.line
  );
}

/**
 * Skills that equipment must be granting: an explicit (non-marker) skill in a preset
 * used by a unit whose class does not have it. The base game never freezes, so such
 * skills come from the unit's gear. Used because the item -> skill table is partial.
 */
export function learnGearGrantedSkills(
  entries: { classLines: { skill_id?: number }[]; presetLines: RawLine[] }[]
): Set<number> {
  const out = new Set<number>();
  for (const e of entries) {
    const pool = new Set(e.classLines.map((c) => c.skill_id || 0));
    for (const ln of e.presetLines) {
      const sid = Number(ln.skill_id || 0);
      if (sid <= 10 || ln.ref_kind === "class_slot") continue;
      if (!pool.has(sid)) out.add(sid);
    }
  }
  return out;
}
