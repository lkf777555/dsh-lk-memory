# dsh-lk-memory

A DSH-native project memory plugin for DeepSeek Harness. It stores project memories under `~/.dsh/memory`, injects the project index into the system prompt, and provides a management panel plus model tools.

## Features

- Automatic project memory injection into each DSH session.
- Full-width management panel for browsing, searching, editing, creating, deleting, and repairing `MEMORY.md` indexes.
- Optional `enforcement: required` memories shown as explicit rules before the normal index.
- Four model tools: `dsh_memory_list`, `dsh_memory_read`, `dsh_memory_write`, and `dsh_memory_forget`.
- Safe same-directory Markdown file handling with path traversal protection.
- UTF-8 safe injection budget with orphan-index cleanup and prompt-friendly caching.
- DSH-only storage. The plugin does not read or write Claude Code memory directories.

## Install

Install from the DSH Community Market or npm:

```bash
dsh plugin --profile desktop add dsh-lk-memory
```

You can also install it from the DSH Community Market. The package declares a standard `dsh.bundle.patch`, so DSH can discover and activate it through the plugin manager.

## Configuration

All settings are optional:

| Key | Default | Description |
|---|---:|---|
| `dshHome` | `~/.dsh` | DSH data directory |
| `indexName` | `MEMORY.md` | Project memory index file |
| `autoInject` | `true` | Inject the project memory into system prompts |
| `injectBytes` | `6000` | Injection budget, from 500 to 60000 bytes |
| `sectionOrder` | `400` | DSH system-prompt section order |
| `enableTools` | `true` | Register the four memory tools |
| `enableUi` | `true` | Enable the management page and API |

## Memory format

A regular memory file can use a simple frontmatter block:

```yaml
---
name: example-memory
description: A short summary for the index.
metadata:
  enforcement: required
---

The memory body is injected in full when it is marked as required.
```

The plugin only manages DSH project memory. It does not synchronize with, inspect, or delete `~/.claude` data.

## Development

```bash
npm pack --dry-run
node --check lib/index.js
node --check lib/client.js
```

See [USAGE.md](USAGE.md) for the detailed architecture and operational notes. See [CHANGELOG.md](CHANGELOG.md) for release history.

## License

MIT © 2026 lkf777555
