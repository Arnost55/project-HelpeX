# CLAUDE.md

**Package manager: This project uses `npm` only.** Do not use `bun`, `pnpm`, or `yarn` for any commands.

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

## Build System

### Modular Build (preserves .dll files)

Use the custom build script instead of `npm run tauri build` when you need the
`.exe` and `.dll` files to coexist in a flat output directory:

```bash
python build-modular.py --release
```

This compiles all workspace crates (`jarvis-core`, `src-tauri`) and
assembles the output into `dist-modular/`:

```
dist-modular/
├── jarvis_ai.exe          # Tauri application binary
├── jarvis_core.dll         # jarvis-core (cdylib)
├── jarvis_ai_lib.dll       # src-tauri lib (cdylib)
├── index.html              # Frontend assets
└── assets/                 # Vite build output
```

### Traditional installer

If you need a WiX/NSIS installer (monolithic, no external .dlls):

```bash
npm run tauri build
```

### How `bundle.active` works

`tauri.conf.json` has `"bundle": { "active": false }`. This disables Tauri's
bundler (`tauri build` skips the installer step when active is false). The
`build-modular.py` script uses plain `cargo build --workspace` instead, which
keeps all crate outputs in `target/release/` together.

Set `"active": true` if you want to generate installers again.

### Why cdylib?

`jarvis-core` specifies `crate-type = ["cdylib", "rlib"]`.
The `cdylib` target produces a `*.dll` that can be loaded via FFI or inspected
independently. The `rlib` target satisfies normal Rust dependency linking.

This dual-output setup means the .dll files are available for:
- Dynamic loading (plugin system via `libloading`)
- External scripts that want to call into the core logic
- Debugging / profiling the core libraries in isolation

## 5. Commit & Push After Every Change

**After completing any code change, always commit and push immediately.**

1. Stage only the files YOU changed (check `git status`)
2. Write a **conventional commit** message describing exactly what was done
3. Push to the remote

```bash
git add <files>
git commit -m "<type>: <description>"
git push
```

**Types:** `feat:` (new feature), `fix:` (bug fix), `refactor:`, `chore:`, `docs:`, `style:`, `perf:`, `test:`

Do NOT batch multiple changes into one commit — each task gets its own commit.
