#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import argparse, json, re, sys
from pathlib import Path
from typing import Dict, Any, List, Optional

HEADER_RE = re.compile(r"^\s*\[(\d+)\]\s*(?:#\s*(.+))?$")
# Standard block header with a rate, e.g. "Water,4" or "LandMorning,10"
BLOCK_RE  = re.compile(r"^\s*([A-Za-z][A-Za-z0-9 _-]*?)\s*,\s*(-?\d+)\s*$")
# Name-only block header (ss2 style), e.g. "OldRod", "GoodRod", "SuperRod", "RockSmash"
BLOCK_NAME_ONLY_RE = re.compile(r"^\s*([A-Za-z][A-Za-z0-9 _-]*?)\s*$")
# Row with min-max levels
ROW_RE_4 = re.compile(r"^\s*(\d+)\s*,\s*([A-Za-z0-9_]+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*$")
# Row with single level (ss2 style)
ROW_RE_3 = re.compile(r"^\s*(\d+)\s*,\s*([A-Za-z0-9_]+)\s*,\s*(-?\d+)\s*$")

def parse_file(path: Path) -> Dict[str, Any]:
    out: Dict[str, Any] = {}

    cur_id: Optional[str] = None
    cur_name: Optional[str] = None
    cur_type: Optional[str] = None

    with path.open("r", encoding="utf-8", errors="ignore") as f:
        for raw in f:
            line = raw.strip()
            if not line or line.startswith("#") and not line.startswith("["):
                # blank or comment (but keep headers like "[003] # Forested Cavern")
                continue

            m = HEADER_RE.match(line)
            if m:
                # flush previous section if needed
                cur_id = m.group(1)
                cur_name = (m.group(2) or "").strip() or None
                out[cur_id] = {
                    "id": cur_id,
                    "name": cur_name or "",
                    "encounters": {}  # type -> [[chance, mon, min, max], ...]
                }
                cur_type = None
                continue

            m = BLOCK_RE.match(line)
            if m and cur_id:
                enc_type = m.group(1).strip()
                # rate = int(m.group(2))  # available if you ever want to store it
                out[cur_id]["encounters"].setdefault(enc_type, [])
                cur_type = enc_type
                continue

            # Support name-only block headers (no rate)
            m = BLOCK_NAME_ONLY_RE.match(line)
            if m and cur_id and m.group(1).strip().lower() not in {"",}:
                enc_type = m.group(1).strip()
                out[cur_id]["encounters"].setdefault(enc_type, [])
                cur_type = enc_type
                continue

            # 4-field row: chance, species, min, max
            m = ROW_RE_4.match(line)
            if m and cur_id and cur_type:
                chance = int(m.group(1))
                mon    = m.group(2)
                lo     = int(m.group(3))
                hi     = int(m.group(4))
                out[cur_id]["encounters"][cur_type].append([chance, mon, lo, hi])
                continue

            # 3-field row (ss2): chance, species, level (min=max)
            m = ROW_RE_3.match(line)
            if m and cur_id and cur_type:
                chance = int(m.group(1))
                mon    = m.group(2)
                lvl    = int(m.group(3))
                out[cur_id]["encounters"][cur_type].append([chance, mon, lvl, lvl])
                continue

            # Non-matching lines are ignored gracefully

    return out

def main():
    ap = argparse.ArgumentParser(description="Convert PBS encounters.txt -> encounters.json (keyed by numeric id).")
    ap.add_argument("src", help="Path to encounters.txt")
    ap.add_argument("dest", help="Path to encounters.json")
    args = ap.parse_args()

    src = Path(args.src)
    dest = Path(args.dest)
    if not src.exists():
        print(f"ERROR: file not found: {src}", file=sys.stderr)
        sys.exit(1)

    data = parse_file(src)
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {len(data)} locations to {dest}")

if __name__ == "__main__":
    main()
