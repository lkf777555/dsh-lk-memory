# Changelog

All notable changes to `dsh-lk-memory` are documented here.

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
- Added an MIT license and public package metadata.

[1.0.0]: https://github.com/lkf777555/dsh-lk-memory/releases/tag/v1.0.0
