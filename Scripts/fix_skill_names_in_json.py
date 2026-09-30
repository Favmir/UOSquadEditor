#!/usr/bin/env python3
"""Normalise skill labels in mission_squads.json to the official skill catalog.

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
