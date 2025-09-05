#!/usr/bin/env python3
import argparse, uuid
from pathlib import Path

def iter_files(root: Path, recurse: bool):
    if recurse:
        yield from (p for p in root.rglob("*") if p.is_file())
    else:
        yield from (p for p in root.iterdir() if p.is_file())

def main():
    ap = argparse.ArgumentParser(description="Rename files to UPPERCASE name + lowercase extension.")
    ap.add_argument("path", nargs="?", default=".", help="Folder to process (default: current)")
    ap.add_argument("-r", "--recurse", action="store_true", help="Recurse into subfolders")
    ap.add_argument("-n", "--dry-run", action="store_true", help="Show what would change")
    args = ap.parse_args()

    root = Path(args.path)
    if not root.exists():
        raise SystemExit(f"Path not found: {root}")

    changed = 0
    for p in iter_files(root, args.recurse):
        stem = p.stem                      # part before last dot
        ext  = p.suffix                    # ".PNG", ".jpg", or "" if none
        target = p.with_name(f"{stem.upper()}{ext.lower()}")

        if target.name == p.name:
            continue
        if target.exists():
            print(f"SKIP (exists): {p.name} -> {target.name}")
            continue

        if args.dry_run:
            print(f"Would rename: {p.name} -> {target.name}")
        else:
            # Two-step rename so Windows applies case-only changes
            tmp = p.with_name(f"{stem}.{uuid.uuid4().hex}.tmpcase")
            p.rename(tmp)
            tmp.rename(target)
            print(f"Renamed: {p.name} -> {target.name}")
        changed += 1

    print(f"Done. {changed} file(s) {'would be ' if args.dry_run else ''}renamed.")

if __name__ == "__main__":
    main()
