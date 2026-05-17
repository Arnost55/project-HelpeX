#!/usr/bin/env python3
"""
build-modular.py — Cargo Workspace + Tauri modular build script.

Compiles all workspace crates and assembles the final output in dist/
so the .exe and .dll files coexist at the same directory level,
bypassing the monolithic WiX/NSIS installer produced by `tauri build`.

Usage:
    python build-modular.py          # debug build
    python build-modular.py --release  # release build (recommended)
"""

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).parent.resolve()
FRONTEND_DIST = ROOT / "dist"           # Vite frontend output
OUTPUT_DIR = ROOT / "dist-modular"       # Final assembled output

# Crates that produce .dll (cdylib) files we want to bundle alongside the .exe
CDYLIB_CRATES = ["jarvis_core", "jarvis_ai_lib"]


def build(args: argparse.Namespace) -> None:
    profile = "release" if args.release else "debug"
    target_dir = ROOT / "target" / profile

    # ---- Step 1: Build frontend ----
    print("=== [1/4] Building frontend (Vite) ===")
    subprocess.run(
        ["npm", "run", "build"],
        check=True,
        cwd=ROOT,
    )

    # ---- Step 2: Build Rust workspace ----
    print(f"\n=== [2/4] Building Rust workspace ({profile}) ===")
    cmd = ["cargo", "build", "--workspace"]
    if args.release:
        cmd.append("--release")
    subprocess.run(cmd, check=True, cwd=ROOT)

    # ---- Step 3: Copy .exe + .dlls into output ----
    print(f"\n=== [3/4] Assembling output into {OUTPUT_DIR} ===")
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Collect all files to copy
    files_to_copy = []

    # The Tauri binary (exe)
    exe_name = "jarvis_ai.exe"
    exe_path = target_dir / exe_name
    if exe_path.exists():
        files_to_copy.append((exe_path, OUTPUT_DIR / exe_name))
        print(f"  [exe]    {exe_path.name}")
    else:
        print(f"  [WARN]  Binary not found: {exe_path}", file=sys.stderr)

    # CDyliB outputs (.dll on Windows)
    for crate in CDYLIB_CRATES:
        dll_name = f"{crate}.dll"
        dll_path = target_dir / dll_name
        if dll_path.exists():
            files_to_copy.append((dll_path, OUTPUT_DIR / dll_name))
            print(f"  [dll]    {dll_path.name}")
        else:
            print(f"  [WARN]  DLL not found: {dll_path}", file=sys.stderr)

    # Copy frontend build output (index.html, assets/*)
    if FRONTEND_DIST.exists():
        for item in FRONTEND_DIST.iterdir():
            dst = OUTPUT_DIR / item.name
            if item.is_dir():
                shutil.copytree(item, dst, dirs_exist_ok=True)
            else:
                shutil.copy2(item, dst)
        print(f"  [front]  {FRONTEND_DIST} → {OUTPUT_DIR}")

    # Perform the copies
    for src, dst in files_to_copy:
        shutil.copy2(src, dst)

    # ---- Step 4: Print summary ----
    print(f"\n=== [4/4] Build complete ===")
    print(f"  Output directory: {OUTPUT_DIR}")
    print(f"  Contents:")
    for p in sorted(OUTPUT_DIR.iterdir()):
        size = p.stat().st_size
        label = "DIR" if p.is_dir() else f"{size / 1024:.1f} KB"
        print(f"    {label}\t{p.name}")

    print(f"\n  Run: {OUTPUT_DIR / exe_name}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Modular JARVIS AI build script")
    parser.add_argument(
        "--release",
        action="store_true",
        default=True,
        help="Build in release mode (default: on). Pass --release=false for debug.",
    )
    args = parser.parse_args()

    # Validate prerequisites
    if not shutil.which("cargo"):
        print("ERROR: `cargo` not found. Install Rust: https://rustup.rs", file=sys.stderr)
        sys.exit(1)
    if not shutil.which("npm"):
        print("ERROR: `npm` not found.", file=sys.stderr)
        sys.exit(1)

    build(args)


if __name__ == "__main__":
    main()
