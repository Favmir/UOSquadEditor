#!/usr/bin/env python3
"""Normalise skill/IF labels in mission_squads.json to the official catalog.

Some rows were baked from class_default_tactics_lines.csv, whose labels are not
the official names (id 445 "Evasive Impetus" showed as "Evade", id 460 "Evade" as
"Grant Evade", and a dozen rows carried the stub "装備AIアクション判定用").
build_mission_squads_json.py now does this at build time; run this script to
repair an already-built JSON without the Extraction/ CSVs:

    python Scripts/fix_skill_names_in_json.py [path/to/mission_squads.json ...]

With no arguments it patches Tools/mission_editor/public/data/mission_squads.json
(and Extraction/editor/mission_squads.json if present).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULTS = [
    ROOT / "Tools/mission_editor/public/data/mission_squads.json",
    ROOT / "Extraction/editor/mission_squads.json",
]


def is_marker(line: dict) -> bool:
    sid = int(line.get("skill_id") or 0)
    return line.get("ref_kind") == "class_slot" or 2 <= sid <= 10


# Wrong English IF labels, keyed by IF id (NOT by text: id 107 and id 110 share a
# prefix and only 107 is wrong).
#   107 MY_HP_75PER_LOWER   JP "75%以下"  -> "Own HP is <75%"  (shipped as ">75%")
#   110 MY_HP_75PER_HIGHER  JP "75%以上"  -> "Own HP is >75%"  (already correct)
#    95 CHARA_NUM_3_LOWER_ENEMY  JP "敵が3体以下"  -> "3 or Fewer Enemies" (shipped as "2 or ...")
#    94 CHARA_NUM_2_LOWER_ENEMY  already correct ("2 or Fewer Enemies")
IF_LABEL_BY_ID = {
    107: "Own HP is <75%",
    110: "Own HP is >75%",
    95: "3 or Fewer Enemies",
    94: "2 or Fewer Enemies",
}
# Only labels from this set are ever rewritten (by id), so nothing else is touched.
_AFFECTED_TEXT = set(IF_LABEL_BY_ID.values())


def fix_if_text(doc: dict) -> int:
    """Set the label of the affected IF ids everywhere they are baked in."""
    n = 0
    for it in doc.get("equipai_if", []):
        want = IF_LABEL_BY_ID.get(int(it.get("id", -1)))
        if want and it.get("name") != want:
            it["name"] = want
            n += 1

    def walk(node) -> None:
        nonlocal n
        if isinstance(node, dict):
            for k in ("if0", "if1"):
                want = IF_LABEL_BY_ID.get(int(node.get(k) or 0))
                cur = node.get(f"{k}_symbol")
                # Only touch labels that belong to the affected pair.
                if want and cur in _AFFECTED_TEXT and cur != want:
                    node[f"{k}_symbol"] = want
                    n += 1
            for v in node.values():
                walk(v)
        elif isinstance(node, list):
            for v in node:
                walk(v)

    walk(doc)
    return n


# Corrupted class default rows to drop, per class symbol (see the builder's
# CLASS_LINE_REMOVALS). Only class-default lines are removed; equipment- and
# preset-sourced lines for the same skills are never touched.
CLASS_LINE_REMOVALS = {"BLACK_KNIGHT_HG": {145, 332}}


def remove_class_lines(doc: dict) -> int:
    removed = 0

    def keep(line: dict, drop: set[int]) -> bool:
        return not (
            line.get("from_class_default")
            and not line.get("from_item")
            and not line.get("from_equipaiset_preset")
            and int(line.get("skill_id") or 0) in drop
        )

    for c in doc.get("class_tactics", []):
        drop = CLASS_LINE_REMOVALS.get(c.get("class_symbol"))
        if drop:
            before = len(c["lines"])
            c["lines"] = [ln for ln in c["lines"] if keep(ln, drop)]
            removed += before - len(c["lines"])
    for m in doc.get("missions", []):
        for sq in m.get("squads", []):
            for sl in sq.get("slots", []):
                drop = CLASS_LINE_REMOVALS.get(sl.get("class_symbol"))
                if drop and sl.get("tactics_lines"):
                    before = len(sl["tactics_lines"])
                    sl["tactics_lines"] = [
                        ln for ln in sl["tactics_lines"] if keep(ln, drop)
                    ]
                    removed += before - len(sl["tactics_lines"])
    return removed


def fix(doc: dict) -> int:
    names = {int(s["id"]): s.get("name") or "" for s in doc.get("skills", [])}
    changed = 0

    def set_name(obj: dict, key: str, sid: int) -> None:
        nonlocal changed
        good = names.get(sid)
        if good and obj.get(key) != good:
            obj[key] = good
            changed += 1

    def walk_line(line: dict) -> None:
        sid = int(line.get("skill_id") or 0)
        if sid and not is_marker(line) and "skill_name" in line:
            set_name(line, "skill_name", sid)
        rsid = int(line.get("resolved_skill_id") or 0)
        if rsid and "resolved_skill_name" in line:
            set_name(line, "resolved_skill_name", rsid)
        for alt in line.get("resolved_alternatives") or []:
            asid = int(alt.get("skill_id") or 0)
            if asid:
                set_name(alt, "skill_name", asid)

    for c in doc.get("class_tactics", []):
        for ln in c.get("lines", []):
            walk_line(ln)
    for p in doc.get("equipaiset_presets", []):
        for ln in p.get("lines", []):
            walk_line(ln)
        for ref in p.get("references", []):
            for ln in ref.get("resolved_tactics", []) or []:
                walk_line(ln)
    for m in doc.get("missions", []):
        for sq in m.get("squads", []):
            for sl in sq.get("slots", []):
                for ln in sl.get("tactics_lines", []) or []:
                    walk_line(ln)
    changed += fix_if_text(doc)
    changed += remove_class_lines(doc)
    return changed


def main() -> None:
    paths = [Path(a) for a in sys.argv[1:]] or [p for p in DEFAULTS if p.exists()]
    for path in paths:
        doc = json.loads(path.read_text(encoding="utf-8"))
        n = fix(doc)
        # Same serialisation as build_mission_squads_json.py (keeps diffs small).
        path.write_text(json.dumps(doc, indent=2) + "\n", encoding="utf-8")
        print(f"{path}: fixed {n} labels")


if __name__ == "__main__":
    main()
