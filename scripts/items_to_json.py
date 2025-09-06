#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import argparse, json, re, sys
from pathlib import Path
from typing import Dict, Any, Optional

def slug(s: str) -> str:
    return re.sub(r"(^-+|-+$)","", re.sub(r"[^a-z0-9]+","-", str(s).lower()))

def parse_bool(v: str) -> Optional[bool]:
    t = (v or "").strip().lower()
    if t in ("true","t","yes","y","1"):  return True
    if t in ("false","f","no","n","0"):  return False
    return None

def parse_int(v: str):
    s = (v or "").strip()
    try: return int(s)
    except: return s if s else None

def to_list_csv(v: str):
    return [x.strip() for x in (v or "").split(",") if x.strip()]

def parse_items_pbs(path: Path) -> Dict[str, Dict[str, Any]]:
    items: Dict[str, Dict[str, Any]] = {}
    cur_id: Optional[str] = None
    cur: Dict[str, Any] = {}

    with path.open("r", encoding="utf-8", errors="ignore") as f:
        for raw in f:
            line = raw.strip()
            if not line or line.startswith("#"): continue

            # New section: [INTERNAL_ID]
            if line.startswith("[") and line.endswith("]"):
                # flush previous
                if cur_id:
                    items[cur_id] = cur
                cur_id = line[1:-1].strip()
                cur = {"internalName": cur_id, "id": slug(cur_id)}
                continue

            if "=" in line and cur_id:
                k, v = [p.strip() for p in line.split("=", 1)]
                lk = k.lower()

                if lk == "name":            cur["name"] = v
                elif lk == "nameplural":    cur["namePlural"] = v
                elif lk == "description":   cur["description"] = v
                elif lk == "pocket":        cur["pocket"] = parse_int(v)
                elif lk == "price":         cur["price"] = parse_int(v)
                elif lk == "sellprice":     cur["sellPrice"] = parse_int(v)
                elif lk == "fielduse":      cur["fieldUse"] = v
                elif lk == "consumable":
                    b = parse_bool(v)
                    if b is not None: cur["consumable"] = b
                elif lk == "flags":
                    cur["flags"] = to_list_csv(v)
                else:
                    # keep any other keys around; don’t lose info
                    cur.setdefault("extra", {})[k] = v

    if cur_id:
        items[cur_id] = cur

    return items

def main():
    ap = argparse.ArgumentParser(description="Convert PBS items.txt → items.json (keyed by internal id).")
    ap.add_argument("src", help="Path to items.txt")
    ap.add_argument("dest", help="Path to items.json")
    args = ap.parse_args()

    src = Path(args.src)
    dest = Path(args.dest)
    if not src.exists():
        print(f"ERROR: file not found: {src}", file=sys.stderr)
        sys.exit(1)

    data = parse_items_pbs(src)
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {len(data)} items to {dest}")

if __name__ == "__main__":
    main()
