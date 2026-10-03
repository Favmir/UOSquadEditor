/** Browser-side Ryujinx .pchtxt export (same addresses as Scripts/export_mission_mod.py). */

const NSOBID = "C841FFE2717FF03A13990480C51DA73F091C04FA";
const UNITSET_BASE = 0x28120b8;
const UNITSET_STRIDE = 0x88;
const CHARASET_BASE = 0x276dd68;
const CHARASET_STRIDE = 0x48;
const CHARASET_COUNT = 1388;
const RESERVED_CHARASETS = new Set([0, 1]);
const GEAR_OFFS = [0x38, 0x3a, 0x3c, 0x3e] as const;
const ENGINE_FIX_NOP_ADDRS = [0xdd138, 0xdd150, 0xdd198, 0xdd1b0, 0xdd1f8, 0xdd210];
const ENGINE_FIX_NOP_WORD = 0xd503201f;
const CLASS_BASE = 0xd2dfc8;
const CLASS_STRIDE = 0x58;
const CLASS_ET_OFF = 0x44;
const EQUIPTYPE_ITEM_BASE = 0xd13e30;
const EQUIPTYPE_ITEM_STRIDE = 0xc;
const N_IFS = 203;
const CLASS_SKILL_BASE = 0xd36d94;
const CLASS_SKILL_STRIDE = 0x8c;
const CLASS_ACTIVE_LEVELS = [0x20, 0x28, 0x30, 0x38];
const CLASS_ACTIVES = [0x24, 0x2c, 0x34, 0x3c];
const CLASS_PASSIVE_LEVELS = [0x50, 0x58, 0x60, 0x68];
const CLASS_PASSIVES = [0x54, 0x5c, 0x64, 0x6c];
const SKILL_DEFAULT_IF0_OFF = 0xac;
const SKILL_DEFAULT_IF1_OFF = 0xb0;
const EQUIPAISET_BASE = 0x2787f28;
const EQUIPAISET_COUNT = 358;
/**
 * The table at EQUIPAISET_BASE is the skill-definition table (row id == skill id)
 * and is larger than the 358 named presets. Skill ids 1..470 have a default-IF row.
 */
export const SKILL_TABLE_COUNT = 471;
const EQUIPAISET_STRIDE = 0x130;
const TACTICS_SLOT_BASE = 0x270af48;
const TACTICS_SLOT_STRIDE = 0x48;
const TACTICS_SLOT_COUNT = 8;

const CLASS_MARKERS: Record<number, string> = {
  3: "class Active 1",
  4: "class Active 2",
  5: "class Active 3",
  6: "class Active 4",
  7: "class Passive 1",
  8: "class Passive 2",
  9: "class Passive 3",
  10: "class Passive 4",
};

export type ExportLine = {
  action?: number;
  slot?: number;
  if0?: number;
  if1?: number;
  skill_id?: number;
  skill_symbol?: string;
  skill_name?: string;
  ref_kind?: string;
  learn_level?: number;
  if0_symbol?: string;
  if1_symbol?: string;
};

export type ExportEdits = {
  unitsets?: {
    unitset_id: number;
    slots?: {
      slot: number;
      charaset_id: number;
      equipaiset_id: number;
      flags?: number;
      use_duplicate?: boolean;
      equipaiset_alloc_key?: string;
    }[];
  }[];
  charasets?: {
    charaset_id: number;
    gear?: {
      item_id?: number;
      rom_item_id?: number;
      item_name?: string;
      item_symbol?: string;
      edited?: boolean;
    }[];
    duplicate_if_shared?: boolean;
  }[];
  equipaiset_lines?: Record<string, ExportLine[]>;
  equipaiset_allocations?: {
    key?: string;
    source_id?: number;
    from_id?: number;
    unitset_id?: number;
    slot?: number;
    new_id?: number;
    lines?: ExportLine[];
  }[];
  equipaiset_creates?: {
    key?: string;
    temp_id?: number;
    source_id?: number;
    new_id?: number;
    symbol?: string;
    lines?: ExportLine[];
  }[];
  class_tactics?: { class_id: number; lines?: ExportLine[] }[];
  /**
   * Opt-in: also treat existing presets as free when EVERY reference to them is in
   * one of these contexts (e.g. "Arena", "OFFLINE", "Overworld"). Their rows are
   * overwritten, so those modes lose the original preset. Default: none.
   */
  reuse_preset_contexts?: string[];
  /**
   * Per-skill default IF0/IF1 (skill table row +0xAC/+0xB0). These are shared by
   * class slots AND equipment-granted skills. Only fields that are present are
   * written, so an unknown vanilla value is never overwritten by accident.
   */
  skill_default_ifs?: { skill_id: number; if0?: number; if1?: number }[];
  equiptype_items?: {
    equiptype_id?: number;
    id?: number;
    equiptype_symbol?: string;
    item_col0_id?: number;
    item_col1_id?: number;
    item_col2_id?: number;
  }[];
  class_equiptypes?: { class_id?: number; slots?: number[] | Record<string, number> }[];
};

export type ExportCatalog = {
  missions?: {
    stage_name?: string;
    quest_symbol?: string;
    squads?: {
      unitset_id?: number;
      slots?: {
        slot?: number;
        charaset_id?: number;
        chara_name?: string;
        charaset_symbol?: string;
      }[];
    }[];
  }[];
  skills?: { id: number; name?: string; symbol?: string }[];
  equipai_if?: { id: number; name?: string; symbol?: string }[];
  items?: { id: number; name?: string; symbol?: string }[];
  class_tactics?: { class_id: number; class_symbol?: string }[];
  equipaiset_presets?: {
    id: number;
    symbol?: string;
    usage?: number;
    references?: { context?: string; quest_symbol?: string }[];
  }[];
};

function pchtxtWord(va: number, value: number): string {
  const v = value >>> 0;
  const hex = [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff]
    .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
    .join("");
  return `${va.toString(16).toUpperCase().padStart(8, "0")} ${hex}`;
}

function pchtxtHalf(va: number, value: number): string {
  const v = value & 0xffff;
  const hex = [v & 0xff, (v >>> 8) & 0xff]
    .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
    .join("");
  return `${va.toString(16).toUpperCase().padStart(8, "0")} ${hex}`;
}

function normalizeLines(lines: ExportLine[] | undefined): ExportLine[] {
  return (lines || []).map((ln, index) => ({
    slot: index,
    action: Number(ln.action || 3),
    if0: Number(ln.if0 || 0),
    if1: Number(ln.if1 || 0),
    skill_id: ln.skill_id != null ? Number(ln.skill_id) : undefined,
    skill_symbol: ln.skill_symbol,
    skill_name: ln.skill_name,
    ref_kind: ln.ref_kind,
    learn_level: ln.learn_level != null ? Number(ln.learn_level) : undefined,
    if0_symbol: ln.if0_symbol,
    if1_symbol: ln.if1_symbol,
  }));
}

function applyLines(row: Uint8Array, lines: ExportLine[]) {
  row.fill(0);
  const dv = new DataView(row.buffer, row.byteOffset, row.byteLength);
  for (const [index, line] of lines.slice(0, TACTICS_SLOT_COUNT).entries()) {
    const slot = line.slot ?? index;
    if (slot < 0 || slot >= TACTICS_SLOT_COUNT) continue;
    let if0 = Number(line.if0 || 0);
    let if1 = Number(line.if1 || 0);
    if (if0 < 0 || if0 >= N_IFS) if0 = 0;
    if (if1 < 0 || if1 >= N_IFS) if1 = 0;
    let skillRef = Number(line.skill_id || 0);
    if (!skillRef) {
      const action = Number(line.action || 0);
      if (action >= 3 && action <= 10) skillRef = action;
    }
    if (!skillRef) continue;
    const off = slot * 8;
    dv.setUint16(off, if0, true);
    dv.setUint16(off + 2, if1, true);
    dv.setUint32(off + 4, skillRef >>> 0, true);
  }
}

function writeTacticsRow(
  patches: string[],
  id: number,
  lines: ExportLine[],
  notes?: string[]
) {
  if (notes) {
    if (lines.length > TACTICS_SLOT_COUNT) {
      notes.push(
        `WARNING: EquipAiSet ${id} has ${lines.length} tactics lines but the game ` +
          `only reads ${TACTICS_SLOT_COUNT}; the last ${lines.length - TACTICS_SLOT_COUNT} ` +
          `line(s) are dropped (passives at the end go first).`
      );
    }
    if (!lines.some((l) => Number(l.skill_id || 0) || Number(l.action || 0) >= 3)) {
      notes.push(
        `WARNING: EquipAiSet ${id} is written with no usable tactics; any unit ` +
          `pointing at it will have NO tactics in battle.`
      );
    }
  }
  const row = new Uint8Array(TACTICS_SLOT_STRIDE);
  applyLines(row, lines);
  const dv = new DataView(row.buffer);
  const dst = TACTICS_SLOT_BASE + id * TACTICS_SLOT_STRIDE;
  for (let off = 0; off < TACTICS_SLOT_STRIDE; off += 4) {
    patches.push(pchtxtWord(dst + off, dv.getUint32(off, true)));
  }
}

function describeLine(
  line: ExportLine,
  skills: Map<number, string>,
  ifs: Map<number, string>
): string {
  const sid = Number(line.skill_id || line.action || 0);
  const refKind = String(line.ref_kind || "");
  let skill: string;
  if (refKind === "class_slot" || CLASS_MARKERS[sid]) {
    skill = CLASS_MARKERS[sid] || `class marker ${sid}`;
  } else {
    skill =
      skills.get(sid) ||
      String(line.skill_name || line.skill_symbol || "") ||
      `skill ${sid}`;
  }
  const if0 = Number(line.if0 || 0);
  const if1 = Number(line.if1 || 0);
  const slot = Number(line.slot || 0) + 1;
  return `slot ${slot}: ${skill}; IF0=${line.if0_symbol || ifs.get(if0) || "none"} (${if0}); IF1=${line.if1_symbol || ifs.get(if1) || "none"} (${if1})`;
}

function findFreeEquipaisets(
  need: number,
  reserved: Set<number>,
  used: Map<number, number>
): number[] {
  const out: number[] = [];
  for (let i = EQUIPAISET_COUNT - 1; i > 0 && out.length < need; i--) {
    if (reserved.has(i) || (used.get(i) || 0) > 0) continue;
    out.push(i);
  }
  return out;
}

function assertNoReservedWrites(patches: string[]) {
  for (const line of patches) {
    if (!line || line.startsWith("//")) continue;
    const va = Number.parseInt(line.split(/\s+/)[0] || "", 16);
    if (!Number.isFinite(va)) continue;
    for (const cid of RESERVED_CHARASETS) {
      const start = CHARASET_BASE + cid * CHARASET_STRIDE;
      if (va >= start && va < start + CHARASET_STRIDE) {
        throw new Error(
          `Refusing to export: patch writes reserved CharaSet ${cid}.`
        );
      }
    }
  }
}

export function buildMissionMod(
  edits: ExportEdits,
  catalog: ExportCatalog,
  modName: string
): { files: { path: string; text: string }[]; patchCount: number; notes: string[] } {
  const charasetUsers = new Map<number, number>();
  const unitLabels = new Map<string, string>();
  const charasetLabels = new Map<number, string[]>();
  for (const m of catalog.missions || []) {
    for (const sq of m.squads || []) {
      for (const sl of sq.slots || []) {
        const cid = Number(sl.charaset_id || 0);
        charasetUsers.set(cid, (charasetUsers.get(cid) || 0) + 1);
        const unitName =
          sl.chara_name || sl.charaset_symbol || `CharaSet ${cid}`;
        const stage = m.stage_name || m.quest_symbol || "unknown mission";
        const label = `${unitName} in ${stage}`;
        unitLabels.set(`${Number(sq.unitset_id || 0)}:${Number(sl.slot || 0)}`, label);
        const labels = charasetLabels.get(cid) || [];
        if (!labels.includes(label)) labels.push(label);
        charasetLabels.set(cid, labels);
      }
    }
  }
  const skills = new Map(
    (catalog.skills || []).map((x) => [x.id, String(x.name || x.symbol || "")])
  );
  const ifs = new Map(
    (catalog.equipai_if || []).map((x) => [x.id, String(x.name || x.symbol || "")])
  );
  const items = new Map(
    (catalog.items || []).map((x) => [x.id, String(x.name || x.symbol || "")])
  );
  const classLabels = new Map(
    (catalog.class_tactics || []).map((x) => [
      x.class_id,
      String(x.class_symbol || ""),
    ])
  );
  const presetLabels = new Map(
    (catalog.equipaiset_presets || []).map((x) => [
      x.id,
      String(x.symbol || ""),
    ])
  );
  const eaUsed = new Map<number, number>();
  for (const p of catalog.equipaiset_presets || []) {
    if (p.id && p.usage) eaUsed.set(p.id, p.usage);
  }

  const patches: string[] = [];
  const notes: string[] = [];
  const changes: string[] = [];
  const reservedEa = new Set<number>();
  const allocatedIds = new Set<number>();
  const eaMap = new Map<string, number>();
  const dupMap = new Map<number, number>();

  const unitEdits = edits.unitsets || [];
  const charaEdits = edits.charasets || [];
  const tacticsOverrides: Record<string, ExportLine[]> = {
    ...(edits.equipaiset_lines || {}),
  };
  const allocations = edits.equipaiset_allocations || [];
  const creates = edits.equipaiset_creates || [];
  const classEdits = edits.class_tactics || [];
  const equiptypeItemEdits = edits.equiptype_items || [];
  const classEtEdits = edits.class_equiptypes || [];

  // Rows that are normally "in use" but only by contexts the user opted to give up.
  const reuseContexts = new Set(
    (edits.reuse_preset_contexts || []).map((c) => String(c).toLowerCase())
  );
  const pinned = new Set<number>();
  for (const k of Object.keys(tacticsOverrides)) pinned.add(Number(k));
  for (const c of creates) if (Number(c.source_id) > 0) pinned.add(Number(c.source_id));
  for (const a of allocations) {
    const sid = Number(a.source_id || a.from_id || 0);
    if (sid > 0) pinned.add(sid);
  }
  for (const ue of unitEdits)
    for (const sl of ue.slots || []) {
      const e = Number(sl.equipaiset_id || 0);
      if (e > 0) pinned.add(e);
    }
  const reclaimable: number[] = [];
  if (reuseContexts.size) {
    for (const p of catalog.equipaiset_presets || []) {
      const refs = p.references || [];
      if (!p.id || !p.usage || !refs.length || pinned.has(p.id)) continue;
      if (refs.every((r) => reuseContexts.has(String(r.context || "").toLowerCase()))) {
        reclaimable.push(p.id);
      }
    }
    reclaimable.sort((a, b) => b - a);
  }
  const failedCreates: string[] = [];
  const failedAllocs: string[] = [];
  let reusedCount = 0;

  const takeId = (want: unknown, key: string): number | null => {
    if (want != null && String(want).match(/^\d+$/) && Number(want) > 0) {
      return Number(want);
    }
    const frees = findFreeEquipaisets(1, reservedEa, eaUsed);
    if (frees.length) return frees[0];
    const reuse = reclaimable.find((id) => !reservedEa.has(id));
    if (reuse != null) {
      reusedCount++;
      const was = presetLabels.get(reuse) || `EquipAiSet ${reuse}`;
      const refs = (catalog.equipaiset_presets || []).find((x) => x.id === reuse)?.references || [];
      const where = [...new Set(refs.map((r) => String(r.context || "?")))].join("/");
      const msg = `Reused EquipAiSet ${reuse} (${was}, normally used only by ${where}) for ${key}; that original preset is overwritten.`;
      notes.push(msg);
      changes.push(msg);
      return reuse;
    }
    return null;
  };

  for (const create of creates) {
    const key = String(create.key || "");
    if (!key) {
      notes.push("WARNING: equipaiset_create missing key");
      continue;
    }
    const src = Number(create.source_id || 0);
    const lines = normalizeLines(create.lines);
    const newId = takeId(create.new_id, `create ${key}`);
    if (newId == null || newId === 0) {
      failedCreates.push(String(create.symbol || key));
      continue;
    }
    reservedEa.add(newId);
    allocatedIds.add(newId);
    eaUsed.set(newId, (eaUsed.get(newId) || 0) + 1);
    const symbol = String(create.symbol || key);
    writeTacticsRow(patches, newId, lines, notes);
    tacticsOverrides[String(newId)] = lines;
    eaMap.set(key, newId);
    if (create.temp_id != null) eaMap.set(String(create.temp_id), newId);
    const change = `Created preset ${symbol} as EquipAiSet ${newId} (source ${src}, ${lines.length} tactics slots)`;
    notes.push(change);
    changes.push(change);
    changes.push(...lines.map((line) => `  - ${describeLine(line, skills, ifs)}`));
  }

  for (const alloc of allocations) {
    const src = Number(alloc.source_id || alloc.from_id || 0);
    const lines = normalizeLines(alloc.lines);
    const unitLabel =
      unitLabels.get(`${Number(alloc.unitset_id || 0)}:${Number(alloc.slot || 0)}`) ||
      `UnitSet ${alloc.unitset_id ?? "?"} slot ${alloc.slot ?? "?"}`;
    const newId = takeId(alloc.new_id, `alloc from ${src}`);
    if (newId == null || newId === 0) {
      failedAllocs.push(unitLabel);
      continue;
    }
    reservedEa.add(newId);
    allocatedIds.add(newId);
    writeTacticsRow(patches, newId, lines, notes);
    tacticsOverrides[String(newId)] = lines;
    const change = `Allocated private EquipAiSet ${src} -> ${newId} for ${unitLabel} (${lines.length} tactics slots)`;
    notes.push(change);
    changes.push(change);
    changes.push(...lines.map((line) => `  - ${describeLine(line, skills, ifs)}`));
    if (alloc.key) eaMap.set(String(alloc.key), newId);
    if (src) eaMap.set(String(src), newId);
    if (alloc.unitset_id != null && alloc.slot != null) {
      eaMap.set(`${alloc.unitset_id}:${alloc.slot}`, newId);
    }
  }

  if (failedCreates.length || failedAllocs.length) {
    const freeNow = (catalog.equipaiset_presets || []).filter(
      (p) => p.id > 0 && !p.usage
    ).length;
    const lines = [
      `WARNING: EquipAiSet LIMIT REACHED. The game has only ${EQUIPAISET_COUNT - 1} preset rows ` +
        `(ids 1-${EQUIPAISET_COUNT - 1}) and the table cannot be extended. ` +
        `Only ${freeNow} are unreferenced in the base game` +
        (reusedCount ? ` (+${reusedCount} reused from opted-in modes)` : "") +
        `. ${failedCreates.length + failedAllocs.length} requested row(s) could NOT be created.`,
    ];
    if (failedCreates.length) {
      lines.push(
        `WARNING: Not created (${failedCreates.length}): ${failedCreates.join(", ")}. ` +
          `Units assigned to these were exported with preset 0 (class defaults).`
      );
    }
    if (failedAllocs.length) {
      lines.push(
        `WARNING: Per-unit tactics NOT applied (${failedAllocs.length}): ${failedAllocs.join("; ")}. ` +
          `These units keep their original preset.`
      );
    }
    lines.push(
      `WARNING: To fix: delete created presets you do not need, share one preset between ` +
        `units, or enable "Reuse presets used only by Arena/OFFLINE/Overworld" in the Presets tab.`
    );
    notes.unshift(...lines);
    changes.unshift(...lines, "");
  }

  for (const ce of charaEdits) {
    const cid = Number(ce.charaset_id);
    const gear = ce.gear || [];
    if (!gear.some((g) => g.edited)) continue;
    const shared =
      (charasetUsers.get(cid) || 0) > 1 && ce.duplicate_if_shared !== false;
    if (shared) {
      const sharedNames =
        (charasetLabels.get(cid) || []).slice(0, 3).join(", ") ||
        `CharaSet ${cid}`;
      const warn =
        `WARNING: CharaSet ${cid} is shared by ${charasetUsers.get(cid) || 0} ` +
        `units and there are no free CharaSet rows to duplicate into. ` +
        `Editing it in place changes gear for ALL of them (${sharedNames}).`;
      notes.push(warn);
      changes.push(warn);
    }
    if (cid < 2 || cid >= CHARASET_COUNT) {
      throw new Error(`Refusing to export: CharaSet ${cid} is reserved or invalid.`);
    }
    const base = CHARASET_BASE + cid * CHARASET_STRIDE;
    const affected =
      (charasetLabels.get(cid) || []).slice(0, 3).join(", ") || `CharaSet ${cid}`;
    const writeId = (g: (typeof gear)[number]) =>
      g.edited ? Number(g.item_id || 0) : Number(g.rom_item_id ?? g.item_id ?? 0);
    for (let gi = 0; gi < 4; gi++) {
      const g = gear[gi] || {};
      patches.push(pchtxtHalf(base + GEAR_OFFS[gi], writeId(g)));
    }
    const change =
      `Changed gear for ${affected}: ` +
      [0, 1, 2, 3]
        .map((gi) => {
          const g = gear[gi] || {};
          const iid = writeId(g);
          return g.item_name || g.item_symbol || items.get(iid) || "empty";
        })
        .join(", ");
    notes.push(change);
    changes.push(change);
  }

  const skillIfWrites = new Map<number, { if0?: number; if1?: number }>();

  for (const classEdit of classEdits) {
    const classId = Number(classEdit.class_id);
    const classBase = CLASS_SKILL_BASE + classId * CLASS_SKILL_STRIDE;
    const lines = normalizeLines(classEdit.lines);
    const className = classLabels.get(classId) || `class ${classId}`;
    const classWords: Record<number, number> = {};
    for (const [levelOff, skillOff] of CLASS_ACTIVE_LEVELS.map(
      (l, i) => [l, CLASS_ACTIVES[i]] as const
    )) {
      classWords[levelOff] = 0;
      classWords[skillOff] = 0;
    }
    for (const [levelOff, skillOff] of CLASS_PASSIVE_LEVELS.map(
      (l, i) => [l, CLASS_PASSIVES[i]] as const
    )) {
      classWords[levelOff] = 0;
      classWords[skillOff] = 0;
    }
    for (const line of lines) {
      const action = Number(line.action || 0);
      const skillId = Number(line.skill_id || 0);
      const learnLevel = Math.max(1, Number(line.learn_level || 1));
      let levelOff = 0;
      let skillOff = 0;
      if (action >= 3 && action <= 6) {
        levelOff = CLASS_ACTIVE_LEVELS[action - 3];
        skillOff = CLASS_ACTIVES[action - 3];
      } else if (action >= 7 && action <= 10) {
        levelOff = CLASS_PASSIVE_LEVELS[action - 7];
        skillOff = CLASS_PASSIVES[action - 7];
      } else {
        notes.push(`WARNING: class ${classId} skips unsupported action ${action}`);
        continue;
      }
      classWords[levelOff] = learnLevel;
      classWords[skillOff] = skillId;
      if (skillId > 0 && skillId < SKILL_TABLE_COUNT) {
        // Collected and emitted once below so explicit skill-default edits can win.
        skillIfWrites.set(skillId, {
          if0: Number(line.if0 || 0),
          if1: Number(line.if1 || 0),
        });
      }
    }
    for (const off of Object.keys(classWords)
      .map(Number)
      .sort((a, b) => a - b)) {
      patches.push(pchtxtWord(classBase + off, classWords[off]));
    }
    const change = `Patched global class tactics for ${className} (${classId}): ${lines.length} skill slots/default IF pairs`;
    notes.push(change);
    changes.push(change);
    changes.push(...lines.map((line) => `  - ${describeLine(line, skills, ifs)}`));
  }

  // Explicit per-skill default conditions (also what equipment-granted skills use).
  for (const se of edits.skill_default_ifs || []) {
    const sid = Number(se.skill_id || 0);
    if (!(sid > 0 && sid < SKILL_TABLE_COUNT)) {
      notes.push(`WARNING: skill default IF edit skips invalid skill id ${sid}`);
      continue;
    }
    const cur = skillIfWrites.get(sid) || {};
    const clampIf = (v: unknown): number | undefined => {
      if (v == null) return undefined;
      const n = Number(v);
      return Number.isInteger(n) && n >= 0 && n < N_IFS ? n : 0;
    };
    const i0 = clampIf(se.if0);
    const i1 = clampIf(se.if1);
    skillIfWrites.set(sid, {
      if0: i0 !== undefined ? i0 : cur.if0,
      if1: i1 !== undefined ? i1 : cur.if1,
    });
    const label = skills.get(sid) || `skill ${sid}`;
    const parts: string[] = [];
    const ifName = (v: number) => (v === 0 ? "none" : ifs.get(v) || "?");
    if (i0 !== undefined) parts.push(`IF0=${ifName(i0)} (${i0})`);
    if (i1 !== undefined) parts.push(`IF1=${ifName(i1)} (${i1})`);
    const change = `Changed default condition of ${label} (${sid}): ${parts.join("; ")}`;
    notes.push(change);
    changes.push(change);
  }
  for (const sid of [...skillIfWrites.keys()].sort((a, b) => a - b)) {
    const w = skillIfWrites.get(sid)!;
    const skillRow = EQUIPAISET_BASE + sid * EQUIPAISET_STRIDE;
    if (w.if0 !== undefined)
      patches.push(pchtxtWord(skillRow + SKILL_DEFAULT_IF0_OFF, w.if0));
    if (w.if1 !== undefined)
      patches.push(pchtxtWord(skillRow + SKILL_DEFAULT_IF1_OFF, w.if1));
  }

  for (const etEdit of equiptypeItemEdits) {
    const eid = Number(etEdit.equiptype_id ?? etEdit.id ?? 0);
    if (eid < 0) continue;
    const cols = [
      Number(etEdit.item_col0_id || 0),
      Number(etEdit.item_col1_id || 0),
      Number(etEdit.item_col2_id || 0),
    ];
    const base = EQUIPTYPE_ITEM_BASE + eid * EQUIPTYPE_ITEM_STRIDE;
    for (let col = 0; col < 3; col++) {
      patches.push(pchtxtHalf(base + col * 2, cols[col]));
    }
    const sym = etEdit.equiptype_symbol || `EQUIPTYPE_${eid}`;
    const change =
      `Changed default gear band ${sym} (${eid}): ` +
      cols.map((iid) => items.get(iid) || String(iid)).join(", ");
    notes.push(change);
    changes.push(change);
  }

  for (const cet of classEtEdits) {
    const classId = Number(cet.class_id || 0);
    let slotIds: number[];
    if (cet.slots && !Array.isArray(cet.slots)) {
      slotIds = [0, 1, 2, 3].map((s) =>
        Number(
          (cet.slots as Record<string, number>)[s] ??
            (cet.slots as Record<string, number>)[String(s)] ??
            0
        )
      );
    } else {
      slotIds = [...((cet.slots as number[]) || [])].slice(0, 4);
      while (slotIds.length < 4) slotIds.push(0);
    }
    const row = CLASS_BASE + classId * CLASS_STRIDE + CLASS_ET_OFF;
    for (let s = 0; s < 4; s++) {
      patches.push(pchtxtHalf(row + s * 2, slotIds[s] & 0xffff));
    }
    const className = classLabels.get(classId) || `class ${classId}`;
    const change = `Changed class equiptype bases for ${className} (${classId}): ${slotIds.slice(0, 4)}`;
    notes.push(change);
    changes.push(change);
  }

  for (const ue of unitEdits) {
    const uid = Number(ue.unitset_id);
    const uoff = UNITSET_BASE + uid * UNITSET_STRIDE;
    for (const sl of ue.slots || []) {
      const si = Number(sl.slot);
      const slotOff = uoff + 0x3c + si * 0xc;
      let cid = Number(sl.charaset_id);
      if (dupMap.has(cid) && sl.use_duplicate !== false) cid = dupMap.get(cid)!;
      let eid = Number(sl.equipaiset_id || 0);
      const allocKey = sl.equipaiset_alloc_key;
      if (allocKey && eaMap.has(allocKey)) eid = eaMap.get(allocKey)!;
      else if (eaMap.has(`${uid}:${si}`)) eid = eaMap.get(`${uid}:${si}`)!;
      else if (eaMap.has(String(eid))) eid = eaMap.get(String(eid))!;
      if (eid < 0) {
        notes.push(
          `WARNING: unitset ${uid} slot ${si} unresolved temp EquipAiSet id ${eid}; writing CharaSet/flags with preset 0`
        );
        eid = 0;
      }
      const flags = Number(sl.flags || 0);
      patches.push(pchtxtWord(slotOff + 0x0, cid));
      patches.push(pchtxtWord(slotOff + 0x4, eid));
      patches.push(pchtxtWord(slotOff + 0x8, flags));
      const unitLabel = unitLabels.get(`${uid}:${si}`) || `UnitSet ${uid} slot ${si}`;
      const row = si < 3 ? "Front" : "Back";
      const col = (["Right", "Middle", "Left"] as const)[si % 3];
      const pos = `${row} ${col}`;
      const presetName = presetLabels.get(eid) || "EquipAiSet";
      const change =
        cid === 0
          ? `Cleared ${unitLabel} at ${pos} (slot ${si})`
          : `Changed ${unitLabel} at ${pos} (slot ${si}): CharaSet ${cid}, preset ${presetName} (${eid}), flags 0x${flags.toString(16).toUpperCase()}`;
      notes.push(change);
      changes.push(change);
    }
  }

  for (const [k, rawLines] of Object.entries(tacticsOverrides)) {
    const eid = Number(k);
    if (!Number.isFinite(eid)) {
      notes.push(`WARNING: skip non-numeric EquipAiSet key ${k}`);
      continue;
    }
    if (eid === 0) {
      notes.push("WARNING: refusing to patch EquipAiSet id 0; use allocation");
      continue;
    }
    if (!(eid > 0 && eid < EQUIPAISET_COUNT)) {
      notes.push(`WARNING: EquipAiSet id out of range: ${eid}`);
      continue;
    }
    if (allocatedIds.has(eid)) continue;
    const normalized = normalizeLines(rawLines);
    writeTacticsRow(patches, eid, normalized, notes);
    const presetName = presetLabels.get(eid) || "EquipAiSet";
    {
      // A preset only matters where a UnitSet points at it. Many vanilla presets
      // (e.g. CH_ELFFENCER_AT) are only used by Overworld / Arena / OFFLINE sets, so
      // editing them has no visible effect in story missions.
      const refs = (catalog.equipaiset_presets || []).find((p) => p.id === eid)
        ?.references;
      const nonMission = new Set(["Overworld", "Arena", "OFFLINE", "Test"]);
      if (
        refs &&
        refs.length > 0 &&
        refs.every((r) => !r.quest_symbol || nonMission.has(String(r.context || "")))
      ) {
        const where = [...new Set(refs.map((r) => String(r.context || "?")))].join(", ");
        notes.push(
          `NOTE: preset ${presetName} (${eid}) is only referenced by ${where} UnitSets; ` +
            `no story-mission unit uses it. Assign it to a mission unit to see it in battle.`
        );
      }
    }
    const change = `Patched preset ${presetName} (${eid}): ${normalized.length} tactics slots`;
    notes.push(change);
    changes.push(change);
    changes.push(
      ...normalized.map((line) => `  - ${describeLine(line, skills, ifs)}`)
    );
  }

  for (const addr of ENGINE_FIX_NOP_ADDRS) {
    patches.push(pchtxtWord(addr, ENGINE_FIX_NOP_WORD));
  }

  const seen = new Set<string>();
  const uniq: string[] = [];
  for (const p of patches) {
    if (!p || p.startsWith("//")) continue;
    if (seen.has(p)) continue;
    seen.add(p);
    uniq.push(p);
  }
  assertNoReservedWrites(uniq);
  const patchCount = uniq.length;

  const pchtxt = [
    `@nsobid-${NSOBID}`,
    "@flag offset_shift 0x100",
    "@enabled",
    `// ${modName}`,
    ...uniq,
    "",
  ].join("\n");

  const generated = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";
  const warnings = notes.filter((n) => n.startsWith("WARNING:"));
  const changelog = [
    `${modName} - Changelog`,
    `Generated: ${generated}`,
    "Game: Unicorn Overlord US v1.0.5",
    "",
    "Changes",
    "-------",
    ...(changes.length ? changes : ["No gameplay edits recorded."]),
    ...(warnings.length
      ? ["", "Warnings / export notes", "-----------------------", ...warnings]
      : []),
    "",
    `Binary patch lines: ${patchCount}`,
    "",
  ].join("\n");

  const readme = [
    `# ${modName}`,
    "",
    "Ryujinx ExeFS mod for Unicorn Overlord US v1.0.5.",
    "",
    "Install: in Ryujinx, right-click Unicorn Overlord → Open Mods Directory,",
    `then copy the \`${modName}\` folder there (the one that contains \`exefs/\`).`,
    "Enable it under Manage Mods. Fully quit Ryujinx, then boot.",
    "",
    "## Notes",
    ...(notes.length ? notes.map((n) => `- ${n}`) : ["- (none)"]),
    "",
    "See `CHANGELOG.txt` for a human-readable list of edits.",
    "Use `mission_editor_edits.json` with **Import editor mod…** to continue editing.",
    `Patches: ${patchCount}`,
    "",
  ].join("\n");

  const files = [
    { path: `${modName}/exefs/main.pchtxt`, text: pchtxt },
    {
      path: `${modName}/mission_editor_edits.json`,
      text: JSON.stringify(edits, null, 2) + "\n",
    },
    { path: `${modName}/CHANGELOG.txt`, text: changelog },
    { path: `${modName}/README.md`, text: readme },
  ];
  if (Object.keys(tacticsOverrides).length) {
    files.push({
      path: `${modName}/equipaiset_line_overrides.json`,
      text: JSON.stringify(tacticsOverrides, null, 2) + "\n",
    });
  }

  return { files, patchCount, notes };
}
