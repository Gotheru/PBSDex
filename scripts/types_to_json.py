#!/usr/bin/env python3
"""
Convert PBS-style types.txt to a JSON mapping keyed by InternalName.

Usage:
  python scripts/types_to_json.py <input_types.txt> <output_types.json>

The JSON shape is:
{
  "NORMAL": {
    "name": "Normal",
    "internalId": "NORMAL",
    "weaknesses": ["FIGHTING"],
    "resistances": [],
    "immunities": ["GHOST"],
    "isSpecialType": false,
    "isPseudoType": false,
    "index": 0
  },
  ...
}
"""
import json, re, sys
from pathlib import Path

LIST_KEYS = {"Weaknesses", "Resistances", "Immunities"}
BOOL_KEYS = {"IsSpecialType", "IsPseudoType"}

def parse_types_txt(text: str) -> dict:
    entries = []
    current = {}
    idx = None

    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        m = re.match(r"\[(\d+)\]\s*$", line)
        if m:
            # flush previous block
            if current:
                current["_index"] = idx if idx is not None else len(entries)
                entries.append(current)
            current = {}
            idx = int(m.group(1))
            continue
        if "=" in line:
            k, v = line.split("=", 1)
            current[k.strip()] = v.strip()

    if current:
        current["_index"] = idx if idx is not None else len(entries)
        entries.append(current)

    def split_list(val: str):
        if not val:
            return []
        return [s.strip() for s in val.split(",") if s.strip()]

    def to_bool(val: str):
        if val is None:
            return False
        s = str(val).strip().lower()
        return s in ("true", "1", "yes", "y", "on")

    out = {}
    for e in entries:
        name = e.get("Name", "")
        internal = e.get("InternalName") or name.upper()
        obj = {
            "name": name,
            "internalId": internal,
            "weaknesses": split_list(e.get("Weaknesses")),
            "resistances": split_list(e.get("Resistances")),
            "immunities": split_list(e.get("Immunities")),
            "isSpecialType": to_bool(e.get("IsSpecialType")),
            "isPseudoType": to_bool(e.get("IsPseudoType")),
            "index": e.get("_index", 0),
        }
        out[internal] = obj
    return out

def main():
    if len(sys.argv) != 3:
        print("Usage: python scripts/types_to_json.py <input_types.txt> <output_types.json>", file=sys.stderr)
        sys.exit(2)

    src = Path(sys.argv[1])
    dst = Path(sys.argv[2])
    if not src.exists():
        print(f"Input not found: {src}", file=sys.stderr)
        sys.exit(1)

    data = parse_types_txt(src.read_text(encoding="utf-8", errors="ignore"))
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {dst} ({len(data)} types)")

if __name__ == "__main__":
    main()
