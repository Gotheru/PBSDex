#!/usr/bin/env python3
# scripts/moves_to_json.py
# -*- coding: utf-8 -*-

import re, json
from pathlib import Path
from typing import Dict, Any

CANON = {
    "Name":"name", "Type":"type", "Category":"category",
    "Power":"power", "BasePower":"power",
    "Accuracy":"accuracy", "TotalPP":"pp", "PP":"pp",
    "Target":"target", "FunctionCode":"functionCode",
    "Flags":"flags", "EffectChance":"effectChance",
    "Priority":"priority", "Description":"description",
    "ZMovePower":"zMovePower", "ZMoveEffect":"zMoveEffect",
    "Recoil":"recoil", "Healing":"healing", "CriticalRate":"criticalRate",
}
INT_FIELDS   = {"power","accuracy","pp","effectChance","priority","zMovePower","criticalRate"}
FLOAT_FIELDS = {"healing"}
LIST_FIELDS  = {"flags"}

def clean(line: str) -> str:
    if "#" in line:
        if line.lstrip().startswith("#"):
            return ""
        line = line.split("#", 1)[0]
    return line.strip()

def parse_section_header(line: str):
    m = re.match(r"\s*\[([A-Z0-9_]+)\]\s*$", line, flags=re.I)
    return m.group(1) if m else None

def parse_kv(line: str):
    if "=" not in line: return None, None
    k, v = line.split("=", 1)
    return k.strip(), v.strip()

def to_int(x):
    try: return int(str(x).strip())
    except: return None

def to_float(x):
    try: return float(str(x).strip())
    except: return None

def to_list_csv(x):
    if x is None: return []
    return [s.strip() for s in str(x).split(",") if s.strip()]

def raw_to_obj(internal_id: str, raw: Dict[str, str]) -> Dict[str, Any]:
    norm: Dict[str, Any] = {
        "internalId": internal_id,
        "name": raw.get("Name"),
        "type": raw.get("Type"),
        "category": raw.get("Category"),
        "power": None, "accuracy": None, "pp": None,
        "target": raw.get("Target"),
        "functionCode": raw.get("FunctionCode"),
        "flags": to_list_csv(raw.get("Flags")),
        "effectChance": None,
        "priority": None,
        "description": raw.get("Description"),
        "zMovePower": None,
        "zMoveEffect": raw.get("ZMoveEffect"),
        "recoil": raw.get("Recoil"),
        "healing": None,
        "criticalRate": None,
        "raw": dict(raw),
    }

    for src_key, dst_key in CANON.items():
        if src_key in raw:
            val = raw[src_key]
            if dst_key in LIST_FIELDS:
                norm[dst_key] = to_list_csv(val)
            elif dst_key in INT_FIELDS:
                iv = to_int(val)
                if iv is not None: norm[dst_key] = iv
            elif dst_key in FLOAT_FIELDS:
                fv = to_float(val)
                if fv is not None: norm[dst_key] = fv
            else:
                norm[dst_key] = val

    def has_flag(flag_name: str) -> bool:
        return any(f.strip().lower() == flag_name.lower() for f in norm.get("flags", []))

    norm["makesContact"]   = has_flag("Contact")
    norm["sound"]          = has_flag("Sound")
    norm["punching"]       = has_flag("Punching")
    norm["biting"]         = has_flag("Biting")
    norm["beam"]           = has_flag("Beam")
    norm["dance"]          = has_flag("Dance")
    norm["recoilMove"]     = has_flag("Recoil")
    norm["cannotMetronome"]= has_flag("CannotMetronome")
    norm["twice"]          = has_flag("Twice")
    norm["tramplesMinimize"]=has_flag("TramplesMinimize")

    return norm

def parse_moves_txt(path: Path) -> Dict[str, Any]:
    text = path.read_text(encoding="utf-8", errors="ignore")
    out: Dict[str, Any] = {}
    cur_id = None
    cur_raw: Dict[str, str] = {}

    for raw_line in text.splitlines():
        line = clean(raw_line)
        if not line:
            continue
        sec = parse_section_header(line)
        if sec:
            if cur_id is not None:
                out[cur_id] = raw_to_obj(cur_id, cur_raw)
            cur_id = sec
            cur_raw = {}
            continue
        k, v = parse_kv(line)
        if k is None:
            continue
        cur_raw[k] = v

    if cur_id is not None:
        out[cur_id] = raw_to_obj(cur_id, cur_raw)

    return out

def main():
    import argparse
    ap = argparse.ArgumentParser(description="Convert PBS moves.txt to moves.json (full fidelity).")
    ap.add_argument("src", help="Path to moves.txt")
    ap.add_argument("dest", help="Path to output moves.json")
    args = ap.parse_args()

    src = Path(args.src)
    dest = Path(args.dest)
    if not src.exists():
        raise SystemExit(f"Input not found: {src}")

    data = parse_moves_txt(src)
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {len(data)} moves to {dest}")

if __name__ == "__main__":
    main()
