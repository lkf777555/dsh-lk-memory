# Changelog

All notable changes to `dsh-lk-memory` are documented here.

## [1.0.1] - 2026-11-24

### Fixed

- Budget truncation now counts the injection header and truncation notice against the budget; previously the injected text could exceed the configured budget by ~470 bytes.
- Deleting the last memory no longer leaves an empty `MEMORY.md` behind; the index file is removed so the synthesize path takes over.
- Writes without a frontmatter block (or without `metadata.modified`) now always receive a fresh `metadata.modified` stamp.
- `currentProject()` prefers an exact slug match on ties instead of whichever agent was iterated last.

### Added

- `GET /dsh-lk-memory/api/injection` endpoint reporting a project's `fullBytes` (size without a budget), `injectedBytes` (what is actually sent), `budgetBytes`, and `truncated` state.
- Config page now shows the current project's memory size versus the budget, with a warning (and the actually injected size) when truncated.
- Required-rule size guard: a required rule whose body exceeds 4000 bytes is downgraded to `advisory` on write (tool and API), with the reason surfaced in the result; `/toggle-enforcement` rejects oversized bodies with a clear error.
- `/check` reports `requiredPressure` when required-rule bodies exceed 60% of the budget; the manager shows a warning banner.
- `dsh_memory_write` result carries a `warning` field for non-fatal notices.
- `deleteMemory()` rejects non-bare file names (defense in depth for the shared helper).

### Changed

- Injection cache is now a bounded map (32 entries) instead of a single slot, so concurrent sessions across projects stop evicting each other.
- Auto-synthesized index (MEMORY.md missing) now respects the injection budget the same way as the regular path.
- `listMemoryFiles` reads only the first 4 KiB of each file (frontmatter probing) instead of the whole content.
- Delete logic shared between the tool and the HTTP API via `deleteMemory()`.
- Budget presets extended with 30000; hint text documents the 500–60000 valid range and that required rules take the budget first.

## [1.0.0] - 2026-11-20

### Added

- DSH-native project memory storage under `~/.dsh/memory/projects/<slug>/memory/`.
- Automatic `MEMORY.md` index injection into the DSH system prompt.
- Explicit `enforcement: required` memory injection before the normal index.
- Project memory management page with search, editing, creation, deletion, and index repair.
- `dsh_memory_list`, `dsh_memory_read`, `dsh_memory_write`, and `dsh_memory_forget` tools.
- Safe Markdown file validation and orphan-index filtering.
- English and Chinese plugin metadata and documentation.
- Dark GitHub Pages documentation site.

### Changed

- Removed the old Claude-oriented memory type taxonomy. The plugin is centered on DSH memory and enforcement rules.
- Removed all dependency on Claude Code memory directories.
- Distributed as a local-directory plugin, installed through the DSH plugin manager (Plugins → Add plugin).
- Added an MIT license and public package metadata.

[1.0.1]: https://github.com/lkf777555/dsh-lk-memory/releases/tag/v1.0.1
[1.0.0]: https://github.com/lkf777555/dsh-lk-memory/releases/tag/v1.0.0
