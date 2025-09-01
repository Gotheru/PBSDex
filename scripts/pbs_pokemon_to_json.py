#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import argparse, json, re, sys
from pathlib import Path
from typing import Dict, List, Any, Tuple, Optional

# -------- helpers --------

def parse_stat_order(order_str: str) -> List[str]:
    raw = [s.strip().lower() for s in order_str.split(",")]
    alias = {"spatk":"spa","spat":"spa","sp.a":"spa",
             "spdef":"spd","spdf":"spd","sp.d":"spd",
             "speed":"spe"}
    out = [alias.get(k, k) for k in raw]
    if len(out) != 6 or any(k not in {"hp","atk","def","spa","spd","spe"} for k in out):
        raise ValueError("stat-order must be 6 keys from: hp, atk, def, spa, spd, spe")
    return out

def to_list(v):
    if v is None: return []
    if isinstance(v, list): return [str(x).strip() for x in v if str(x).strip()]
    return [s.strip() for s in str(v).split(",") if s.strip()]

def dedupe_keep_order(seq: List[str]) -> List[str]:
    seen=set(); out=[]
    for x in seq:
        if x not in seen:
            seen.add(x); out.append(x)
    return out

def title_from_internal(name: str) -> str: return str(name).replace("_"," ").title()
def slug(s: str) -> str: return re.sub(r"(^-+|-+$)","", re.sub(r"[^a-z0-9]+","-", s.lower()))
def parse_kv_line(line: str):
    if "=" not in line: return None, None
    k,v=line.split("=",1); return k.strip(), v.strip()

def parse_section_header(line: str):
    # [INTERNAL] or [INTERNAL,NUMBER] or just [1]
    m = re.match(r"\s*\[([A-Za-z0-9_]+)(?:\s*,\s*(\d+))?\]\s*$", line)
    if not m: return None, None
    internal = m.group(1)
    idx = int(m.group(2)) if m.group(2) is not None else None
    return internal, idx

def contains_base(form_name: str, base_disp: str) -> bool:
    return base_disp.lower() in (form_name or "").lower()

def is_cosmetic_form(base_internal: str, form_name: str) -> bool:
    b = (base_internal or "").upper()
    name = form_name or ""
    if b == "UNOWN": return True
    if b == "PIKACHU" and (re.search(r"\bcap\b", name, re.I) or re.search(r"cosplay", name, re.I)):
        return True
    return False

# -------- parsers --------

def parse_pokemon_pbs(path: Path, stat_order: List[str]) -> Dict[str, Dict[str, Any]]:
    """Parse pokemon.txt (bases). Key by true InternalName (not the header)."""
    entries: List[Dict[str, Any]] = []
    cur: Optional[Dict[str, Any]] = None

    with path.open("r", encoding="utf-8", errors="ignore") as f:
        for raw in f:
            line = raw.strip()
            if not line or line.startswith("#"): continue

            if line.startswith("["):
                if cur:
                    # finalize previous section
                    tb = cur.pop("_typebuf", {})
                    types = []
                    t1 = tb.get("Type1"); t2 = tb.get("Type2")
                    if t1: types.append(t1)
                    if t2 and (not types or t2 != types[0]): types.append(t2)
                    cur["types"] = [t for t in types if t]
                    entries.append(cur)
                header, _ = parse_section_header(line)
                cur = {"_header": header}
                continue

            if cur is None: continue
            k, v = parse_kv_line(line)
            if not k: continue
            lk = k.lower()

            if lk == "internalname":
                cur["internalName"] = v
            elif lk == "name":
                cur["name"] = v
            elif lk in ("type","types","type1","type2"):
                cur.setdefault("_typebuf", {})
                if lk in ("type","types"):
                    ts = to_list(v)
                    if ts:
                        cur["_typebuf"]["Type1"] = ts[0]
                        if len(ts) > 1: cur["_typebuf"]["Type2"] = ts[1]
                elif lk == "type1": cur["_typebuf"]["Type1"] = v
                else:               cur["_typebuf"]["Type2"] = v
            elif lk in ("basestats","base_stats"):
                nums = [n.strip() for n in v.split(",")]
                if len(nums) == 6:
                    cur["stats"] = {stat_order[i]: int(nums[i]) if nums[i].isdigit() else 0 for i in range(6)}
            elif lk == "abilities":
                cur["abilities"] = to_list(v)
            elif lk in ("hiddenability","hidden_ability"):
                hv = v.strip()
                if hv and hv.upper() not in {"", "NONE"}: cur["hiddenAbility"] = hv
            elif lk in ("pokedex","summary","kind"):
                cur["summary"] = v

    if cur:
        tb = cur.pop("_typebuf", {})
        types=[]; t1 = tb.get("Type1"); t2 = tb.get("Type2")
        if t1: types.append(t1)
        if t2 and (not types or t2 != types[0]): types.append(t2)
        cur["types"] = [t for t in types if t]
        entries.append(cur)

    # Re-key by true InternalName (fallback to header if missing)
    result: Dict[str, Dict[str, Any]] = {}
    for e in entries:
        internal = e.get("internalName") or e.get("_header")
        if not internal: continue
        e["internalName"] = internal
        if "name" not in e: e["name"] = title_from_internal(internal)
        if "stats" not in e: e["stats"] = {"hp":0,"atk":0,"def":0,"spa":0,"spd":0,"spe":0}
        e["abilities"] = dedupe_keep_order(to_list(e.get("abilities")))
        if e.get("hiddenAbility","").upper() in {"", "NONE"}: e.pop("hiddenAbility", None)
        result[internal] = e

    return result

def parse_forms_pbs(path: Path, stat_order: List[str]) -> List[Dict[str, Any]]:
    """Parse pokemon_forms.txt (forms)."""
    forms: List[Dict[str, Any]] = []
    cur: Optional[Dict[str, Any]] = None

    with path.open("r", encoding="utf-8", errors="ignore") as f:
        for raw in f:
            line = raw.strip()
            if not line or line.startswith("#"): continue

            if line.startswith("[" ):
                if cur: forms.append(cur)
                base, idx = parse_section_header(line)
                cur = {"baseInternal": base, "formIndex": idx, "overrides": {}}
                continue

            if cur is None: continue
            k, v = parse_kv_line(line)
            if not k: continue
            lk = k.lower(); ov = cur["overrides"]

            if lk == "formname":
                ov["formName"] = v
            elif lk in ("type","types","type1","type2"):
                ov.setdefault("_typebuf", {})
                if lk in ("types","type"):
                    ts = to_list(v)
                    if ts:
                        ov["_typebuf"]["Type1"] = ts[0]
                        if len(ts) > 1: ov["_typebuf"]["Type2"] = ts[1]
                elif lk == "type1": ov["_typebuf"]["Type1"] = v
                else:               ov["_typebuf"]["Type2"] = v
            elif lk in ("basestats","base_stats"):
                nums = [n.strip() for n in v.split(",")]
                if len(nums) == 6:
                    ov["stats"] = {stat_order[i]: int(nums[i]) if nums[i].isdigit() else 0 for i in range(6)}
            elif lk == "abilities":
                ov["abilities"] = dedupe_keep_order(to_list(v))
            elif lk in ("hiddenability","hidden_ability"):
                hv = v.strip()
                if hv and hv.upper() not in {"", "NONE"}: ov["hiddenAbility"] = hv
            elif lk in ("pokedex","summary","kind"):
                ov["summary"] = v

    if cur: forms.append(cur)

    # finalize types for overrides
    for fobj in forms:
        ov = fobj["overrides"]
        tb = ov.pop("_typebuf", {})
        types=[]; t1 = tb.get("Type1"); t2 = tb.get("Type2")
        if t1: types.append(t1)
        if t2 and (not types or t2 != types[0]): types.append(t2)
        if types: ov["types"] = [t for t in types if t]

    return forms

def merge_forms(base_by_internal: Dict[str, Dict[str, Any]], forms: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []

    # base species
    for internal, sp in base_by_internal.items():
        mon = {
            "id": slug(internal),
            "internalName": internal,
            "name": sp.get("name", title_from_internal(internal)),
            "types": sp.get("types", []),
            "stats": sp.get("stats", {"hp":0,"atk":0,"def":0,"spa":0,"spd":0,"spe":0}),
            "abilities": dedupe_keep_order(to_list(sp.get("abilities"))),
        }
        if sp.get("hiddenAbility"): mon["hiddenAbility"] = sp["hiddenAbility"]
        if sp.get("summary"): mon["summary"] = sp["summary"]
        out.append(mon)

    # forms
    for f in forms:
        base = base_by_internal.get(f["baseInternal"])
        if not base:
            continue  # unknown base -> skip gracefully

        ov = f["overrides"]
        form_name = ov.get("formName") or f"Form {f.get('formIndex', 0)}"

        # skip cosmetics
        if is_cosmetic_form(base["internalName"], form_name):
            continue

        base_disp = base.get("name", title_from_internal(base["internalName"]))
        display = form_name if contains_base(form_name, base_disp) else f"{base_disp} ({form_name})"

        base_internal = base["internalName"]
        idx = f.get("formIndex")
        internal_form = f"{base_internal}_{idx}" if idx is not None else f"{base_internal}_{slug(form_name) or 'form'}"

        mon = {
            "id": slug(internal_form),
            "internalName": internal_form,                # BASENAME_NUMBER
            "name": display,                              # display rule
            "types": ov.get("types", base.get("types", [])),
            "stats": ov.get("stats", base.get("stats", {"hp":0,"atk":0,"def":0,"spa":0,"spd":0,"spe":0})),
            "abilities": dedupe_keep_order(ov.get("abilities", base.get("abilities", []))),
        }
        ha = ov.get("hiddenAbility", base.get("hiddenAbility"))
        if ha: mon["hiddenAbility"] = ha
        summ = ov.get("summary", base.get("summary"))
        if summ: mon["summary"] = summ

        out.append(mon)

    return out

# -------- main --------

def main():
    ap = argparse.ArgumentParser(description="Convert PBS pokemon + forms to a single JSON for PBSDex.")
    ap.add_argument("src", help="Path to pokemon.txt")
    ap.add_argument("dest", help="Path to output pokemon.json")
    ap.add_argument("--forms", help="Path to pokemon_forms.txt", default=None)
    ap.add_argument("--stat-order", default="hp,atk,def,spe,spd,spa",
                    help="Order of BaseStats (default: hp,atk,def,spe,spd,spa)")
    args = ap.parse_args()

    src = Path(args.src)
    forms_path = Path(args.forms) if args.forms else None
    dest = Path(args.dest)
    if not src.exists():
        print(f"ERROR: Input file not found: {src}", file=sys.stderr)
        sys.exit(1)

    stat_order = parse_stat_order(args.stat_order)

    base = parse_pokemon_pbs(src, stat_order)
    forms = parse_forms_pbs(forms_path, stat_order) if (forms_path and forms_path.exists()) else []
    combined = merge_forms(base, forms)

    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(combined, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {len(combined)} entries to {dest}")

if __name__ == "__main__":
    main()
