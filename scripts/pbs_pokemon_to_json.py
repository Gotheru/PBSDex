#!/usr/bin/env python3
import argparse, json, re, sys
from pathlib import Path
from typing import List, Dict, Any

# ---------- helpers ----------
def parse_list_csv(s: str) -> List[str]:
    return [x.strip() for x in s.split(",") if x.strip()]

def parse_moves(s: str) -> List[Dict[str, Any]]:
    items = parse_list_csv(s)
    out = []
    i = 0
    while i < len(items):
        try:
            lvl = int(items[i])
            move = items[i+1] if i+1 < len(items) else None
            if move:
                out.append({"level": lvl, "move": move})
            i += 2
        except ValueError:
            out.append({"level": 0, "move": items[i]})
            i += 1
    return out

def parse_evolutions(s: str) -> List[Dict[str, Any]]:
    items = parse_list_csv(s)
    out = []
    for i in range(0, len(items), 3):
        chunk = items[i:i+3]
        if len(chunk) == 3:
            to, method, param = chunk
            try:
                param_val = int(param)
            except ValueError:
                param_val = param
            out.append({"to": to, "method": method, "param": param_val})
    return out

def map_stats(nums: List[int], order: str) -> Dict[str, int]:
    keys = [k.strip().lower() for k in order.split(",")]
    if len(nums) != 6 or len(keys) != 6:
        return {}
    return dict(zip(keys, nums))

def parse_stats(s: str, order: str) -> Dict[str, int]:
    nums = [int(x.strip()) for x in s.split(",") if x.strip()]
    return map_stats(nums, order)

def parse_evs(s: str, order: str) -> Dict[str, int]:
    nums = [int(x.strip()) for x in s.split(",") if x.strip()]
    return map_stats(nums, order)

def slugify(s: str) -> str:
    s = s.lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s or "unknown"

def norm_empty(x: str) -> str:
    return x.strip()

def is_blank_or_none(x: str | None) -> bool:
    return not x or x.upper() in {"", "NONE", "NULL"}

def finalize_entry(cur: Dict[str, Any]) -> Dict[str, Any]:
    # Build types from _type1/_type2
    t1 = cur.pop("_type1", None)
    t2 = cur.pop("_type2", None)
    types = []
    if not is_blank_or_none(t1):
        types.append(t1)
    if not is_blank_or_none(t2) and (not types or t2 != types[0]):
        types.append(t2)
    if types:
        cur["types"] = types

    # Ensure id
    internal = cur.get("internalName") or cur.get("InternalName")
    name = cur.get("name")
    if internal:
        cur["id"] = slugify(internal)
    elif name:
        cur["id"] = slugify(name)
    else:
        cur["id"] = f"pokemon-{cur.get('index','unknown')}"

    return cur

# ---------- main parser ----------
def parse_pbs(src: Path, stat_order: str) -> Dict[str, Any]:
    entries: List[Dict[str, Any]] = []
    current: Dict[str, Any] = {}
    idx = None

    with src.open("r", encoding="utf-8", errors="ignore") as f:
        for raw in f:
            line = raw.strip()
            if not line or line.startswith("#"):
                continue

            m = re.match(r"^\[(\d+)\]$", line)
            if m:
                if current:
                    entries.append(finalize_entry(current))
                    current = {}
                idx = int(m.group(1))
                current["index"] = idx
                continue

            if "=" not in line:
                continue

            key, val = line.split("=", 1)
            key = key.strip()
            val = re.sub(r"\s*,\s*", ",", val.strip())
            k = key.lower()

            if k == "name":
                current["name"] = val
            elif k == "internalname":
                current["internalName"] = val
            elif k in ("type1", "type"):
                # some packs use "Type" or "Types"
                parts = parse_list_csv(val) if k == "type" else [val]
                current["_type1"] = parts[0] if parts else val
                if len(parts) > 1:
                    current["_type2"] = parts[1]
            elif k == "type2":
                current["_type2"] = val
            elif k == "basestats":
                current["stats"] = parse_stats(val, stat_order)
            elif k == "effortpoints":
                current["evYield"] = parse_evs(val, stat_order)
            elif k == "abilities":
                current["abilities"] = parse_list_csv(val)
            elif k == "hiddenability":
                current["hiddenAbility"] = val
            elif k == "moves":
                current["moves"] = parse_moves(val)
            elif k == "tutormoves":
                seen = set(); lst = []
                for mv in parse_list_csv(val):
                    if mv not in seen:
                        seen.add(mv); lst.append(mv)
                current["tutorMoves"] = lst
            elif k == "eggmoves":
                current["eggMoves"] = parse_list_csv(val)
            elif k == "compatibility":
                current["compatibility"] = parse_list_csv(val)
            elif k == "stepstohatch":
                current["stepsToHatch"] = int(val) if val.isdigit() else val
            elif k == "height":
                try: current["height"] = float(val)
                except: current["height"] = val
            elif k == "weight":
                try: current["weight"] = float(val)
                except: current["weight"] = val
            elif k == "color":
                current["color"] = val
            elif k == "shape":
                current["shape"] = val
            elif k == "habitat":
                current["habitat"] = val
            elif k == "kind":
                current["kind"] = val
            elif k == "pokedex":
                current["pokedex"] = val
            elif k == "generation":
                try: current["generation"] = int(val)
                except: current["generation"] = val
            elif k == "evolutions":
                current["evolutions"] = parse_evolutions(val)
            elif k == "basexp":
                current["baseExp"] = int(val) if val.isdigit() else val
            elif k == "rareness":
                current["rareness"] = int(val) if val.isdigit() else val
            elif k == "happiness":
                current["happiness"] = int(val) if val.isdigit() else val
            elif k == "growthrate":
                current["growthRate"] = val
            elif k == "genderrate":
                current["genderRate"] = val
            else:
                current.setdefault("extra", {})[key] = val

    if current:
        entries.append(finalize_entry(current))

    # Clean out any accidental empties in types
    for e in entries:
        if "types" in e:
            e["types"] = [t for t in e["types"] if not is_blank_or_none(t)]

    return {"pokemon": entries}

def main():
    ap = argparse.ArgumentParser(description="Convert Pokémon PBS (pokemon.txt) to JSON for the site.")
    ap.add_argument("src", type=Path, help="Path to PBS file (pokemon.txt)")
    ap.add_argument("out", type=Path, help="Output JSON path (e.g., public/data/pokemon.json)")
    ap.add_argument("--stat-order", default="hp,atk,def,spe,spd,spa",
                    help="Order for BaseStats/EffortPoints (default: hp,atk,def,spe,spd,spa)")
    args = ap.parse_args()

    if not args.src.exists():
        print(f"ERROR: Input file not found: {args.src}\n"
              f"Tip: put the PBS at data/pokemon.txt or pass the full path.", file=sys.stderr)
        sys.exit(1)

    result = parse_pbs(args.src, args.stat_order)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"✔ Wrote {args.out} with {len(result.get('pokemon', []))} entries")

if __name__ == "__main__":
    main()
