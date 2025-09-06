#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import argparse, json, re, sys
from pathlib import Path
from typing import Dict, List, Any, Tuple, Optional

# ---------- helpers ----------

STAT_KEYS = {"hp","atk","def","spa","spd","spe"}

def parse_stat_order(order_str: str) -> List[str]:
    raw = [s.strip().lower() for s in order_str.split(",")]
    alias = {"spatk":"spa","spat":"spa","sp.a":"spa",
             "spdef":"spd","spdf":"spd","sp.d":"spd",
             "speed":"spe"}
    out = [alias.get(k, k) for k in raw]
    if len(out) != 6 or any(k not in STAT_KEYS for k in out):
        raise ValueError("stat-order must be 6 keys from: hp, atk, def, spa, spd, spe")
    return out

def to_list(v) -> List[str]:
    if v is None: return []
    if isinstance(v, list): return [str(x).strip() for x in v if str(x).strip()]
    return [s.strip() for s in str(v).split(",") if s.strip()]

def to_int_list(lst: List[str]) -> List[int]:
    out = []
    for x in lst:
        try: out.append(int(x))
        except: out.append(0)
    return out

def dedupe_keep_order(seq: List[str]) -> List[str]:
    seen=set(); out=[]
    for x in seq:
        if x not in seen:
            seen.add(x); out.append(x)
    return out

def title_from_internal(name: str) -> str:
    return str(name).replace("_"," ").title()

def slug(s: str) -> str:
    return re.sub(r"(^-+|-+$)", "", re.sub(r"[^a-z0-9]+", "-", str(s).lower()))

def parse_kv_line(line: str):
    if "=" not in line: return None, None
    k,v=line.split("=",1); return k.strip(), v.strip()

def parse_section_header(line: str):
    # Allow [1], [INTERNAL], [INTERNAL,NUMBER]
    m = re.match(r"\s*\[([A-Za-z0-9_]+)(?:\s*,\s*(\d+))?\]\s*$", line)
    if m: return m.group(1), (int(m.group(2)) if m.group(2) else None)
    m2 = re.match(r"\s*\[(\d+)\]\s*$", line)
    if m2: return None, int(m2.group(1))
    return None, None

def contains_base(form_name: str, base_disp: str) -> bool:
    return (form_name or "").lower().find((base_disp or "").lower()) >= 0

def is_cosmetic_form(base_internal: str, form_name: str) -> bool:
    # You asked to *include everything* by default; we'll keep this helper and gate it with a flag.
    b = (base_internal or "").upper()
    name = form_name or ""
    if b == "UNOWN": return True
    if b == "PIKACHU" and (re.search(r"\bcap\b", name, re.I) or re.search(r"cosplay", name, re.I)):
        return True
    return False

# ---------- value parsers ----------

def parse_base_stats(v: str, order: List[str]) -> Dict[str,int]:
    nums = [n.strip() for n in (v or "").split(",")]
    if len(nums) != 6:
        return {k:0 for k in order}
    ints = to_int_list(nums)
    return { order[i]: ints[i] for i in range(6) }

def parse_effort_points(v: str) -> Dict[str,int]:
    nums = [n.strip() for n in (v or "").split(",")]
    ints = (nums + ["0"]*6)[:6]
    ints = to_int_list(ints)
    # PBS order is typically HP,Atk,Def,Spd,SpAtk,SpDef or similar; leave as given:
    # We'll map to our canonical keys in common order hp,atk,def,spa,spd,spe if length==6
    # Common PBS order here seems hp,atk,def,spe,spa,spd (like your default)
    keys = ["hp","atk","def","spe","spa","spd"]
    return { keys[i]: ints[i] for i in range(6) }

def parse_moves_csv(v: str) -> List[Dict[str,Any]]:
    # "1,TACKLE,5,HOWL,10,EMBER" -> [{level:1, move:"TACKLE"}, ...]
    toks = [t.strip() for t in (v or "").split(",") if t.strip()]
    out = []
    i = 0
    while i + 1 < len(toks):
        level_str, move = toks[i], toks[i+1]
        try:
            level = int(level_str)
        except:
            # Sometimes odd data; treat non-int levels as 0
            level = 0
        out.append({"level": level, "move": move})
        i += 2
    return out

def parse_evos_csv(v: str) -> List[Dict[str,Any]]:
    # "TARGET,Method,Param, TARGET2,Method2,Param2, ..."
    toks = [t.strip() for t in (v or "").split(",") if t.strip()]
    out = []
    i = 0
    while i < len(toks):
        to = toks[i] if i < len(toks) else ""
        method = toks[i+1] if i+1 < len(toks) else ""
        param = toks[i+2] if i+2 < len(toks) else ""
        out.append({"to": to, "method": method, "param": param})
        i += 3
    return out

def parse_wild_items(d: Dict[str,str]) -> Dict[str,str]:
    out = {}
    for k in ("WildItemCommon","WildItemUncommon","WildItemRare"):
        if k in d and str(d[k]).strip():
            out[k] = str(d[k]).strip()
    return out
def get_ci(d: Dict[str, str], key: str) -> Optional[str]:
    """Case-insensitive getter for raw PBS dicts."""
    kl = key.lower()
    for k, v in d.items():
        if k.lower() == kl:
            return v
    return None

def extract_types(raw: Dict[str, str]) -> List[str]:
    """
    Prefer explicit Type1/Type2 if present; otherwise parse Types/Type CSV.
    Returns a deduped list of 1–2 types.
    """
    t1 = get_ci(raw, "Type1")
    t2 = get_ci(raw, "Type2")
    if t1 or t2:
        out = []
        if t1: out.append(t1.strip())
        if t2 and t2.strip() and (not out or t2.strip() != out[0]): out.append(t2.strip())
        return [t for t in out if t]
    # Fallback: "Types=A,B" or "Type=A,B"
    csv = get_ci(raw, "Types") or get_ci(raw, "Type")
    ts = to_list(csv)
    if ts:
        a = [ts[0]]
        if len(ts) > 1 and ts[1] and ts[1] != ts[0]:
            a.append(ts[1])
        return a
    return []


# ---------- file parsers ----------

def parse_pokemon_pbs(path: Path, stat_order: List[str]) -> Dict[str, Dict[str, Any]]:
    entries: List[Dict[str, Any]] = []
    cur: Optional[Dict[str, Any]] = None
    cur_raw: Optional[Dict[str, Any]] = None
    header_idx: Optional[int] = None

    with path.open("r", encoding="utf-8", errors="ignore") as f:
        for raw in f:
            line = raw.strip()
            if not line or line.startswith("#"): continue

            if line.startswith("["):
                if cur:
                    # ── finalize previous section ─────────────────────────────
                    cur["types"] = extract_types(cur_raw or {})
                    cur["raw"] = cur_raw
                    entries.append(cur)
                header, idx = parse_section_header(line)
                cur = {"_header": header, "_index": idx}
                cur_raw = {}
                header_idx = idx
                continue

            if cur is None: continue
            k, v = parse_kv_line(line)
            if not k: continue
            cur_raw[k] = v

    if cur:
        # ── finalize last section ────────────────────────────────────────────
        cur["types"] = extract_types(cur_raw or {})
        cur["raw"] = cur_raw
        entries.append(cur)

    # … the rest of parse_pokemon_pbs stays the same …


    result: Dict[str, Dict[str, Any]] = {}
    for e in entries:
        r = e.get("raw", {})
        internal = r.get("InternalName") or e.get("_header")
        if not internal:  # no key to index by
            continue
        name = r.get("Name") or title_from_internal(internal)

        # normalized
        mon: Dict[str, Any] = {
            "id": slug(internal),
            "internalName": internal,
            "name": name,
            "types": e.get("types", []),
            "stats": parse_base_stats(r.get("BaseStats",""), stat_order),
            "effortPoints": parse_effort_points(r.get("EffortPoints","")),
            "genderRate": r.get("GenderRate"),
            "growthRate": r.get("GrowthRate"),
            "baseEXP": int(r.get("BaseEXP","0")) if str(r.get("BaseEXP","0")).isdigit() else r.get("BaseEXP"),
            "catchRate": int(r.get("Rareness","0")) if str(r.get("Rareness","0")).isdigit() else r.get("Rareness"),
            "happiness": int(r.get("Happiness","0")) if str(r.get("Happiness","0")).isdigit() else r.get("Happiness"),
            "abilities": dedupe_keep_order(to_list(r.get("Abilities"))),
            "hiddenAbility": (r.get("HiddenAbility") or r.get("HiddenAbilities") or "").strip() or None,
            "moves": parse_moves_csv(r.get("Moves","")),
            "tutorMoves": to_list(r.get("TutorMoves")),
            "eggMoves": to_list(r.get("EggMoves")),
            "machineMoves": to_list(r.get("MachineMoves") or r.get("TM")),

            "compatibility": to_list(r.get("Compatibility")),
            "stepsToHatch": int(r.get("StepsToHatch","0")) if str(r.get("StepsToHatch","0")).isdigit() else r.get("StepsToHatch"),
            "height": float(r.get("Height","0") or 0) if re.match(r"^-?\d+(\.\d+)?$", r.get("Height","0") or "") else r.get("Height"),
            "weight": float(r.get("Weight","0") or 0) if re.match(r"^-?\d+(\.\d+)?$", r.get("Weight","0") or "") else r.get("Weight"),
            "color": r.get("Color"),
            "shape": r.get("Shape"),
            "habitat": r.get("Habitat"),
            "kind": r.get("Kind"),
            "pokedex": r.get("Pokedex") or r.get("Summary") or r.get("Kind"),
            "generation": r.get("Generation"),
            "evolutions": parse_evos_csv(r.get("Evolutions","")),
            "wildItems": parse_wild_items(r),

            # battler/meta (keep as-is if present)
            "battler": {
                "playerX": r.get("BattlerPlayerX"),
                "playerY": r.get("BattlerPlayerY"),
                "enemyX":  r.get("BattlerEnemyX"),
                "enemyY":  r.get("BattlerEnemyY"),
                "shadowX": r.get("BattlerShadowX"),
                "shadowSize": r.get("BattlerShadowSize"),
            },

            # keep full raw for future reference
            "raw": r,
        }

        # cleanup empties
        if not mon["hiddenAbility"]: mon.pop("hiddenAbility", None)
        result[internal] = mon

    return result

def parse_forms_pbs(path: Path, stat_order: List[str]) -> List[Dict[str, Any]]:
    """Parse pokemon_forms.txt (forms-only data, not merged)."""
    if not path or not path.exists():
        return []
    forms: List[Dict[str, Any]] = []
    cur: Optional[Dict[str, Any]] = None
    cur_raw: Optional[Dict[str, Any]] = None

    with path.open("r", encoding="utf-8", errors="ignore") as f:
        for raw in f:
            line = raw.strip()
            if not line or line.startswith("#"): continue

            if line.startswith("["):
                if cur:
                    cur["raw"] = cur_raw
                    forms.append(cur)
                base, idx = parse_section_header(line)
                cur = {"baseInternal": base, "formIndex": idx, "overrides": {}}
                cur_raw = {}
                continue

            if cur is None: continue
            k, v = parse_kv_line(line)
            if not k: continue
            cur_raw[k] = v

    if cur:
        cur["raw"] = cur_raw
        forms.append(cur)

    # finalize normalized overrides
    out: List[Dict[str, Any]] = []
    for fobj in forms:
        r = fobj.get("raw", {})
        ov: Dict[str, Any] = {}

        # FormName & general
        if "FormName" in r: ov["formName"] = r.get("FormName")

        # types
        tbuf = {}
        if "Type1" in r: tbuf["Type1"] = r["Type1"]
        if "Type2" in r: tbuf["Type2"] = r["Type2"]
        if "Type" in r or "Types" in r:
            ts = to_list(r.get("Type") or r.get("Types"))
            if ts:
                tbuf["Type1"] = ts[0]
                if len(ts) > 1: tbuf["Type2"] = ts[1]
        types=[]
        if tbuf.get("Type1"): types.append(tbuf["Type1"])
        if tbuf.get("Type2") and (not types or tbuf["Type2"] != types[0]):
            types.append(tbuf["Type2"])
        if types: ov["types"] = types

        # stats & EP
        if "BaseStats" in r: ov["stats"] = parse_base_stats(r["BaseStats"], stat_order)
        if "EffortPoints" in r: ov["effortPoints"] = parse_effort_points(r["EffortPoints"])

        # abilities
        if "Abilities" in r: ov["abilities"] = dedupe_keep_order(to_list(r["Abilities"]))
        if "HiddenAbility" in r:
            hv = (r.get("HiddenAbility") or "").strip()
            if hv and hv.upper() != "NONE": ov["hiddenAbility"] = hv

        # learnsets
        if "Moves" in r: ov["moves"] = parse_moves_csv(r["Moves"])
        if "TutorMoves" in r: ov["tutorMoves"] = to_list(r["TutorMoves"])
        if "EggMoves" in r: ov["eggMoves"] = to_list(r["EggMoves"])
        if "MachineMoves" in r or "TM" in r: ov["machineMoves"] = to_list(r.get("MachineMoves") or r.get("TM"))

        # display/meta
        for key in ("Pokedex","Summary","Kind","Generation","Color","Shape","Habitat",
                    "Height","Weight","MegaStone","WildItemCommon","WildItemUncommon","WildItemRare"):
            if key in r: ov[key] = r[key]

        # evolutions override
        if "Evolutions" in r: ov["evolutions"] = parse_evos_csv(r["Evolutions"])

        fobj["overrides"] = ov
        out.append(fobj)

    return out

def merge_forms(base_by_internal: Dict[str, Dict[str, Any]],
                forms: List[Dict[str, Any]],
                include_cosmetics: bool) -> List[Dict[str, Any]]:

    out: List[Dict[str, Any]] = []

    # base species as entries
    for internal, sp in base_by_internal.items():
        base = dict(sp)  # shallow copy
        base["isForm"] = False
        out.append(base)

    # forms as separate entries
    for f in forms:
        base = base_by_internal.get(f["baseInternal"])
        if not base:
            continue
        ov = f.get("overrides", {})
        form_name = ov.get("formName") or f"Form {f.get('formIndex', 0)}"

        if not include_cosmetics and is_cosmetic_form(base["internalName"], form_name):
            continue

        base_disp = base.get("name", title_from_internal(base["internalName"]))
        display = form_name if contains_base(form_name, base_disp) else f"{base_disp} ({form_name})"

        base_internal = base["internalName"]
        idx = f.get("formIndex")
        internal_form = f"{base_internal}_{idx}" if idx is not None else f"{base_internal}_{slug(form_name) or 'form'}"

        # start from base, apply overrides (replace if present)
        merged = {
            **base,
            "id": slug(internal_form),
            "internalName": internal_form,
            "name": display,
            "isForm": True,
            "baseInternal": base_internal,
            "formIndex": idx,
            "formName": form_name,
        }

        def apply(key, default=None):
            if key in ov:
                merged[key] = ov[key]
            elif default is not None and key not in merged:
                merged[key] = default

        # key fields
        apply("types")
        apply("stats")
        apply("effortPoints")
        apply("abilities")
        apply("hiddenAbility")

        # learnsets (replace if override exists; otherwise inherit base)
        apply("moves")
        apply("tutorMoves")
        apply("eggMoves")
        apply("machineMoves")

        # display/meta
        for k in ("pokedex","Summary","Kind","Generation","Color","Shape","Habitat","Height","Weight","MegaStone"):
            if k in ov:
                # normalize Pokedex/Summary -> pokedex
                if k in ("Pokedex","Summary"):
                    merged["pokedex"] = ov[k]
                else:
                    merged[k[0].lower()+k[1:]] = ov[k]

        # evolutions override
        apply("evolutions")

        # keep raw chunk for the form too
        merged["rawFormOverrides"] = f.get("raw", {})

        out.append(merged)

    return out

# ---------- main ----------

def main():
    ap = argparse.ArgumentParser(description="Convert PBS pokemon + forms to a single JSON for PBSDex (full data).")
    ap.add_argument("src", help="Path to pokemon.txt")
    ap.add_argument("dest", help="Path to output pokemon.json")
    ap.add_argument("--forms", help="Path to pokemon_forms.txt", default=None)
    ap.add_argument("--stat-order", default="hp,atk,def,spe,spa,spd",
                    help="Order of BaseStats (default: hp,atk,def,spe,spa,spd)")
    ap.add_argument("--include-cosmetics", action="store_true",
                    help="Include cosmetic forms like Unown and Cosplay Pikachu (default: on).")
    ap.add_argument("--exclude-cosmetics", action="store_true",
                    help="Exclude cosmetic forms.")
    args = ap.parse_args()

    src = Path(args.src)
    forms_path = Path(args.forms) if args.forms else None
    dest = Path(args.dest)
    if not src.exists():
        print(f"ERROR: Input file not found: {src}", file=sys.stderr)
        sys.exit(1)

    stat_order = parse_stat_order(args.stat_order)
    base = parse_pokemon_pbs(src, stat_order)
    form_objs = parse_forms_pbs(forms_path, stat_order) if (forms_path and forms_path.exists()) else []

    include_cosmetics = not args.exclude_cosmetics

    combined = merge_forms(base, form_objs, include_cosmetics)

    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(combined, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {len(combined)} entries to {dest}")

if __name__ == "__main__":
    main()
