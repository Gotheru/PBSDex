#!/usr/bin/env python3
import json
import re
import sys
from pathlib import Path
from typing import List, Dict

BLOCK_HEADER_RE = re.compile(r'^\s*\[(?P<id>[A-Za-z0-9_]+)\]\s*$')
KV_RE = re.compile(r'^\s*(?P<k>[A-Za-z][A-Za-z0-9 _-]*)\s*=\s*(?P<v>.*)\s*$')

def parse_abilities_text(text: str) -> List[Dict[str, str]]:
    """Parse abilities.txt blocks into a list of {internal_id, name, description} dicts."""
    abilities = []
    current = None

    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue

        m = BLOCK_HEADER_RE.match(line)
        if m:
            if current and current.get("internal_id"):
                current.setdefault("name", "")
                current.setdefault("description", "")
                abilities.append(current)
            current = {"internal_id": m.group("id")}
            continue

        if current is not None:
            mkv = KV_RE.match(line)
            if mkv:
                key = mkv.group("k").strip().lower().replace(" ", "_").replace("-", "_")
                val = mkv.group("v").strip()
                if key == "name":
                    current["name"] = val
                elif key == "description":
                    current["description"] = val
                else:
                    current[key] = val  # keep any extra fields just in case

    if current and current.get("internal_id"):
        current.setdefault("name", "")
        current.setdefault("description", "")
        abilities.append(current)

    return abilities

def main(argv: list) -> int:
    if len(argv) < 3:
        print("Usage: python abilities_to_json.py <abilities.txt> <abilities.json>", file=sys.stderr)
        return 2

    src = Path(argv[1])
    dst = Path(argv[2])

    text = src.read_text(encoding="utf-8", errors="replace")
    abilities = parse_abilities_text(text)

    # turn list into a dict keyed by internal_id
    by_id = {a["internal_id"]: {"name": a.get("name",""), "description": a.get("description","")} for a in abilities}

    dst.write_text(json.dumps(by_id, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {len(by_id)} abilities → {dst}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
