/**
 * dsh-lk-memory — Host half.
 *
 * Owns DSH project memories under `~/.dsh/memory/projects/<slug>/memory/`,
 * injects the index into every conversation, registers model tools to
 * list/read/write/forget memories, and serves the management API.
 *
 * The plugin only reads and writes its DSH-owned directory.
 */
import { defineTool } from "@deepseek-ai/dsh-tools";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, statSync, writeFileSync, unlinkSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { homedir } from "node:os";

export const name = "dsh-lk-memory";

export const inject = ["workingDirectory", "systemPrompt", "webServer", "tools", "connection"];

/* ------------------------------------------------------------------ *
 * Constants and helpers
 * ------------------------------------------------------------------ */

const DEFAULTS = Object.freeze({
  dshHome: "~/.dsh",
  indexName: "MEMORY.md",
  autoInject: true,
  injectBytes: 6000,
  sectionOrder: 400,
  enableTools: true,
  enableUi: true,
});

const API_PREFIX = "/dsh-lk-memory/api";
const SECTION_NAME = "dsh-memory:index";
const MAX_BODY_BYTES = 512 * 1024;
/** A single required rule may not exceed this body size: required rules are
 * injected in full every turn, so one oversized rule would crowd out the
 * whole index. Such writes fall back to `advisory` (index row only). */
const MAX_REQUIRED_BODY_BYTES = 4000;
/** Memory file names: same-directory `*.md` only, no traversal. */
const FILE_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,150}\.md$/;
/** Project slug: one path segment under the DSH memory projects root. */
const SLUG_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,180}$/;

function expandHome(p) {
  if (typeof p !== "string" || p === "") return p;
  if (p === "~") return homedir();
  if (p.startsWith("~/") || p.startsWith("~\\")) return join(homedir(), p.slice(2));
  return p;
}

/** Read at most `bytes` bytes of a file as UTF-8 (trailing partial sequences
 * are decoded as replacement chars, which is fine for frontmatter probing). */
function readFileSyncHead(full, bytes) {
  const fd = openSync(full, "r");
  try {
    const buf = Buffer.alloc(bytes);
    const n = readSync(fd, buf, 0, bytes, 0);
    return buf.subarray(0, n).toString("utf8");
  } finally {
    closeSync(fd);
  }
}

function normalizeConfig(raw) {
  const cfg = { ...DEFAULTS };
  const src = raw && typeof raw === "object" ? raw : {};
  const rawDshHome = typeof src.dshHome === "string" && src.dshHome.trim() !== ""
    ? src.dshHome.trim()
    : DEFAULTS.dshHome;
  cfg.dshHome = expandHome(rawDshHome);
  if (typeof src.indexName === "string" && src.indexName.trim() !== "" && FILE_NAME_RE.test(src.indexName.trim())) {
    cfg.indexName = src.indexName.trim();
  }
  if (typeof src.autoInject === "boolean") cfg.autoInject = src.autoInject;
  if (Number.isFinite(src.injectBytes)) cfg.injectBytes = Math.min(60000, Math.max(500, Math.round(src.injectBytes)));
  if (Number.isFinite(src.sectionOrder)) cfg.sectionOrder = src.sectionOrder;
  if (typeof src.enableTools === "boolean") cfg.enableTools = src.enableTools;
  if (typeof src.enableUi === "boolean") cfg.enableUi = src.enableUi;
  return cfg;
}

/* ------------------------------------------------------------------ *
 * Slug resolution (FR1 + §3.4 of the requirement doc)
 * ------------------------------------------------------------------ */

/** DSH project slug: `:` → `-`, each run of `\` or `/` → one `-`. */
function dshSlug(p) {
  return String(p).replace(/:/g, "-").replace(/[\\/]+/g, "-");
}

/**
 * Loose slug: fold EVERY separator kind into one `-`, including the `-`
 * produced by DSH itself (`C--Users-pc` double dash), then lowercase.
 */
function looseSlug(s) {
  return String(s).toLowerCase().replace(/[\\/:.-]+/g, "-");
}

function normalizeCwd(cwd) {
  if (typeof cwd !== "string" || cwd.trim() === "") return "";
  return resolve(cwd.trim()).replace(/[\\/]+$/, "");
}

/**
 * Resolve the memory directory for a working directory.
 * 1. exact slug; 2. loose equality over `projects/*`; 3. longest loose
 * prefix (session cwd may sit in a subdirectory of the project root).
 * Returns `{ slug, dir }` or `null` (silent, never throws).
 */
function resolveMemoryDir(projectsRoot, cwd) {
  const normalized = normalizeCwd(cwd);
  if (normalized === "") return null;
  let entries;
  try {
    entries = readdirSync(projectsRoot, { withFileTypes: true });
  } catch {
    return null;
  }
  const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  const exact = dshSlug(normalized);
  const needle = looseSlug(exact);
  let slug = dirs.find((d) => d === exact);
  if (!slug) slug = dirs.find((d) => looseSlug(d) === needle) ?? null;
  if (!slug) {
    let best = null;
    let bestLen = -1;
    for (const d of dirs) {
      const dl = looseSlug(d);
      if (dl.length === 0 || dl.length > needle.length) continue;
      if (!needle.startsWith(dl)) continue;
      // Boundary: the match must end at a separator inside the needle.
      if (needle.length !== dl.length && needle[dl.length] !== "-") continue;
      if (dl.length > bestLen) {
        best = d;
        bestLen = dl.length;
      }
    }
    slug = best;
  }
  if (!slug) return null;
  const dir = join(projectsRoot, slug, "memory");
  try {
    if (!statSync(dir).isDirectory()) return null;
  } catch {
    return null;
  }
  return { slug, dir };
}

/** Best-effort display path decoded from a slug (ambiguous for `-` in names).
 * Accepts both `C--...` and the lowercase `c--...` form DSH itself produces. */
function slugToPath(slug) {
  const m = /^([A-Za-z])--(.+)$/.exec(slug);
  if (!m) return slug;
  return `${m[1].toUpperCase()}:\\${m[2].replace(/-/g, "\\")}`;
}

/* ------------------------------------------------------------------ *
 * Frontmatter / index-row editing
 * ------------------------------------------------------------------ */

function stripQuotes(v) {
  const s = String(v ?? "").trim();
  if (s.length >= 2 && ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))) {
    return s.slice(1, -1);
  }
  return s;
}

/** Minimal YAML frontmatter reader: top-level keys + `metadata.*` nesting. */
function parseFrontmatter(raw) {
  const text = String(raw ?? "");
  const m = /^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/.exec(text);
  if (!m) return { meta: {}, body: text };
  const meta = {};
  let section = null;
  for (const line of m[1].split(/\r?\n/)) {
    if (/^\s/.test(line)) {
      const nested = /^\s+([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
      if (nested && section) meta[`${section}.${nested[1]}`] = stripQuotes(nested[2]);
      continue;
    }
    const top = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (top) {
      section = top[1];
      meta[section] = stripQuotes(top[2]);
    }
  }
  return { meta, body: text.slice(m[0].length) };
}

/** Ensure the frontmatter carries a fresh `metadata.modified`. Creates the
 * frontmatter block when absent so every memory has a modified stamp. */
function touchFrontmatterModified(content, iso) {
  const text = String(content ?? "");
  const m = /^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/.exec(text);
  if (!m) {
    const body = text.replace(/^\s+/, "");
    return `---\nmetadata:\n  modified: ${iso}\n---\n\n${body}`;
  }
  let block = m[1];
  if (/^\s+modified:\s*.*$/m.test(block)) {
    block = block.replace(/^\s+modified:\s*.*$/m, `  modified: ${iso}`);
  } else if (/^metadata:\s*$/m.test(block)) {
    block = block.replace(/^metadata:\s*$/m, `metadata:\n  modified: ${iso}`);
  } else {
    block += `\nmetadata:\n  modified: ${iso}`;
  }
  return `---\n${block}\n---${m[2]}${text.slice(m[0].length)}`;
}

/** Guard the injection budget: a required rule whose body exceeds
 * MAX_REQUIRED_BODY_BYTES is downgraded to `advisory` (index row only),
 * since its full text would otherwise be injected on every turn. Returns
 * the (possibly rewritten) content and whether a downgrade happened. */
function guardRequiredSize(content) {
  const parsed = parseFrontmatter(content);
  if (!isForcedMemory(parsed.meta)) return { content, downgraded: false };
  if (Buffer.byteLength(parsed.body.trim(), "utf8") <= MAX_REQUIRED_BODY_BYTES) return { content, downgraded: false };
  return { content: setEnforcement(content, "advisory"), downgraded: true };
}

/** Rewrite the `enforcement` frontmatter field, creating the block if absent. */
function setEnforcement(content, value) {
  const text = String(content ?? "");
  const fm = /^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/.exec(text);
  if (!fm) return `---\nmetadata:\n  enforcement: ${value}\n---\n\n${text}`;
  let block = fm[1];
  if (/^\s+enforcement:\s*.*$/m.test(block)) {
    block = block.replace(/^\s+enforcement:\s*.*$/m, `  enforcement: ${value}`);
  } else if (/^metadata:\s*$/m.test(block)) {
    block = block.replace(/^metadata:\s*$/m, `metadata:\n  enforcement: ${value}`);
  } else {
    block += `\nmetadata:\n  enforcement: ${value}`;
  }
  return `---\n${block}\n---${fm[2]}${text.slice(fm[0].length)}`;
}

function indexRowRegex(file) {
  const esc = String(file).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^[ \\t]*[-*][ \\t]*\\[[^\\]]*\\]\\((?:\\./)?${esc}\\)[^\\n]*$`, "im");
}

function memoryTitle(file, meta) {
  const fromMeta = String(meta.name ?? "").trim();
  if (fromMeta !== "") return fromMeta;
  return String(file).replace(/\.md$/i, "");
}

function memorySummary(meta) {
  return String(meta.description ?? "").trim();
}

/** A forced memory is a user-declared instruction that must be surfaced in
 * every prompt. Accept both boolean metadata.enforce and the readable
 * metadata.enforcement: required form so existing files remain easy to edit. */
function isForcedMemory(meta) {
  const enforce = String(meta["metadata.enforce"] ?? meta.enforce ?? "").trim().toLowerCase();
  const enforcement = String(meta["metadata.enforcement"] ?? meta.enforcement ?? "").trim().toLowerCase();
  return enforce === "true" || enforce === "1" || enforce === "yes" || enforcement === "required" || enforcement === "mandatory";
}

function upsertIndexRow(indexText, file, title, summary) {
  const row = `- [${title}](${file})${summary ? ` — ${summary}` : ""}`;
  const re = indexRowRegex(file);
  if (re.test(indexText)) return indexText.replace(re, () => row);
  const trimmed = indexText.replace(/\s+$/, "");
  return `${trimmed ? trimmed + "\n" : ""}${row}\n`;
}

function removeIndexRow(indexText, file) {
  const re = indexRowRegex(file);
  return indexText.split(/\r?\n/).filter((line) => !re.test(line)).join("\n");
}

/** Parse `- [title](file.md) …` index rows; tolerant of `./` prefixes. */
const INDEX_ROW_PARSE = /^[ \t]*[-*][ \t]*\[([^\]]*)\]\(([^)\s]+\.md)\)/i;

function parseIndexRows(indexText) {
  const rows = [];
  for (const line of String(indexText ?? "").split(/\r?\n/)) {
    const m = INDEX_ROW_PARSE.exec(line);
    if (m) {
      const file = m[2].replace(/^\.\//, "");
      if (FILE_NAME_RE.test(file)) rows.push({ line, file, title: stripQuotes(m[1]) });
    }
  }
  return rows;
}

/** Drop index rows whose target file no longer exists; collapse blank runs. */
function pruneOrphanRows(indexText, dir) {
  const kept = [];
  for (const line of String(indexText ?? "").split(/\r?\n/)) {
    const m = INDEX_ROW_PARSE.exec(line);
    if (m) {
      const file = m[2].replace(/^\.\//, "");
      if (FILE_NAME_RE.test(file) && !existsSync(join(dir, file))) continue;
    }
    kept.push(line);
  }
  const out = [];
  let blanks = 0;
  for (const line of kept) {
    if (line.trim() === "") {
      blanks += 1;
      if (blanks > 1) continue;
    } else {
      blanks = 0;
    }
    out.push(line);
  }
  return out.join("\n");
}

/** Cheap directory fingerprint for cache keys: directory mtime (covers file
 * add/remove/rename) plus mtime+size of each memory file (covers in-place
 * edits). Still O(n) stats, but avoids reading any file content. */
function dirSignature(dir) {
  try {
    const sig = [`${statSync(dir).mtimeMs}`];
    for (const n of readdirSync(dir).filter((n) => FILE_NAME_RE.test(n)).sort()) {
      try {
        const st = statSync(join(dir, n));
        sig.push(`${n}:${st.mtimeMs}:${st.size}`);
      } catch {
        sig.push(`${n}:err`);
      }
    }
    return sig.join("|");
  } catch {
    return "err";
  }
}

/* ------------------------------------------------------------------ *
 * Memory directory operations (shared by tools and the HTTP API)
 * ------------------------------------------------------------------ */

function assertSafeFileName(cfg, file, { allowIndex = true } = {}) {
  if (typeof file !== "string" || !FILE_NAME_RE.test(file) || basename(file) !== file) {
    throw Object.assign(new Error(`非法的文件名：「${String(file)}」，只允许记忆目录同层级的 *.md 文件`), { code: "bad-file" });
  }
  if (!allowIndex && file === cfg.indexName) {
    throw Object.assign(new Error(`索引文件 ${cfg.indexName} 不允许删除`), { code: "index-protected" });
  }
}

function assertSafeDir(projectsRoot, slug) {
  // SLUG_RE forbids separators and `..`-style traversal, so `join` stays inside projectsRoot.
  if (typeof slug !== "string" || !SLUG_RE.test(slug) || slug.includes("..")) {
    throw Object.assign(new Error("非法的项目 slug"), { code: "bad-slug" });
  }
  const resolved = resolve(join(projectsRoot, slug, "memory"));
  try {
    if (!statSync(resolved).isDirectory()) throw new Error("not a directory");
  } catch {
    throw Object.assign(new Error(`项目「${slug}」没有记忆目录`), { code: "no-memory-dir" });
  }
  return resolved;
}

function listMemoryFiles(cfg, dir) {
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  const files = [];
  for (const name of names) {
    if (!FILE_NAME_RE.test(name)) continue;
    const full = join(dir, name);
    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    if (!stat.isFile()) continue;
    // Only the frontmatter is needed here: read just the head, not the whole file.
    let raw = "";
    try {
      raw = stat.size <= 4096 ? readFileSync(full, "utf8") : readFileSyncHead(full, 4096);
    } catch {
      /* unreadable file: still listed with empty meta */
    }
    const { meta } = parseFrontmatter(raw);
    files.push({
      name,
      forced: isForcedMemory(meta),
      title: memoryTitle(name, meta),
      description: memorySummary(meta),
      bytes: stat.size,
      modified: stat.mtime.toISOString(),
      isIndex: name === cfg.indexName,
    });
  }
  files.sort((a, b) => (a.name === cfg.indexName ? -1 : b.name === cfg.indexName ? 1 : b.modified.localeCompare(a.modified)));
  return files;
}

function readIndexText(cfg, dir) {
  try {
    return readFileSync(join(dir, cfg.indexName), "utf8");
  } catch {
    return "";
  }
}

function syncIndexOnWrite(cfg, dir, file, content) {
  if (file === cfg.indexName) return false;
  const { meta } = parseFrontmatter(content);
  const indexText = readIndexText(cfg, dir);
  const next = upsertIndexRow(indexText, file, memoryTitle(file, meta), memorySummary(meta));
  if (next === indexText) return false;
  writeFileSync(join(dir, cfg.indexName), next, "utf8");
  return true;
}

/** Delete a memory file and drop its index row. When the row removal
 * leaves the index with no memory rows at all, the index file is removed
 * so the next injection goes through the synthesize path (and a stale
 * empty index never shadows it). Returns `{ deleted, indexUpdated }`. */
function deleteMemory(cfg, dir, file) {
  // Defense in depth: callers validate, but the shared helper must never escape `dir`.
  if (basename(file) !== file) {
    throw Object.assign(new Error("路径越界"), { code: "bad-file" });
  }
  const full = join(dir, file);
  let deleted = false;
  try {
    unlinkSync(full);
    deleted = true;
  } catch {
    deleted = false;
  }
  if (!deleted) return { deleted: false, indexUpdated: false };
  const indexText = readIndexText(cfg, dir);
  const next = removeIndexRow(indexText, file);
  if (next === indexText) return { deleted: true, indexUpdated: false };
  // No rows left: drop the index file instead of writing an empty one.
  if (parseIndexRows(next).length === 0 && listMemoryFiles(cfg, dir).filter((f) => !f.isIndex).length === 0) {
    try {
      unlinkSync(join(dir, cfg.indexName));
    } catch {
      /* index already gone */
    }
    return { deleted: true, indexUpdated: true };
  }
  writeFileSync(join(dir, cfg.indexName), next, "utf8");
  return { deleted: true, indexUpdated: true };
}

/* ------------------------------------------------------------------ *
 * Injection text (FR2 + NFR1)
 * ------------------------------------------------------------------ */

const INJECTION_HEADER = [
  "## DSH 项目记忆",
  "",
  "下面的索引来自 DSH 为本项目维护的记忆（当前会话工作目录所属项目）。",
  "相关记忆必须遵守；需要细节时用 read 工具读取对应 `.md` 文件。",
  "标记为「强制规则」的记忆属于用户明确指定的硬约束：每轮都要执行，除非当前用户明确覆盖且不违反更高优先级指令。",
  "",
].join("\n");

const FORCED_HEADER = [
  "## 强制规则（用户明确指定）",
  "",
  "以下规则必须逐条执行，并在最终答复前自检。不要把它们当成普通偏好。",
  "",
].join("\n");

const TRUNCATION_NOTICE =
  "\n\n[索引超出注入预算已被截断；截断条目的完整内容可用 read 工具按索引行括号中的文件名读取。]";
const INJECTION_HEADER_BYTES = Buffer.byteLength(INJECTION_HEADER, "utf8");
const TRUNCATION_NOTICE_BYTES = Buffer.byteLength(TRUNCATION_NOTICE, "utf8");

function utf8ByteSliceAtLineBoundary(text, budget) {
  const buf = Buffer.from(text, "utf8");
  if (buf.length <= budget) return text;
  let end = budget;
  // Do not split a UTF-8 multi-byte sequence.
  while (end > 0 && (buf[end] & 0xc0) === 0x80) end -= 1;
  let slice = buf.subarray(0, end).toString("utf8");
  const nl = slice.lastIndexOf("\n");
  if (nl > 0) slice = slice.slice(0, nl);
  return slice.trimEnd();
}

function synthesizeIndex(cfg, dir, files) {
  const rows = files
    .filter((f) => !f.isIndex)
    .map((f) => `- [${f.title}](${f.name})${f.description ? ` — ${f.description}` : ""}`);
  if (rows.length === 0) return "";
  return `${rows.join("\n")}\n\n[注：未找到 ${cfg.indexName}，以上索引由记忆目录内容自动生成。]\n`;
}

/* ------------------------------------------------------------------ *
 * Plugin entry
 * ------------------------------------------------------------------ */

/** Validate a client-supplied config patch; returns the whitelisted updates. */
function normalizeConfigPatch(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const updates = {};
  if (typeof src.autoInject === "boolean") updates.autoInject = src.autoInject;
  if (src.injectBytes !== undefined) {
    const n = Math.round(Number(src.injectBytes));
    if (!Number.isFinite(n)) throw Object.assign(new Error("injectBytes 必须是数字"), { code: "bad-config" });
    updates.injectBytes = Math.min(60000, Math.max(500, n));
  }
  if (src.sectionOrder !== undefined) {
    const n = Number(src.sectionOrder);
    if (!Number.isFinite(n)) throw Object.assign(new Error("sectionOrder 必须是数字"), { code: "bad-config" });
    updates.sectionOrder = n;
  }
  if (typeof src.enableTools === "boolean") updates.enableTools = src.enableTools;
  return updates;
}

export function apply(ctx, config) {
  const cfg = normalizeConfig(config);
  const projectsRoot = join(cfg.dshHome, "memory", "projects");
  const entry = ctx.fiber?.entry;
  const configEditor = ctx.get("configEditor");
  const configWritable = Boolean(entry && configEditor && typeof configEditor.edit === "function");

  const log = (...args) => {
    try {
      if (typeof ctx?.logger?.info === "function") ctx.logger.info(`[dsh-lk-memory] ${args.join(" ")}`);
    } catch {
      /* logging must never break the plugin */
    }
  };

  /* Positive resolution cache keyed by cwd (negatives are never cached so a
   * newly created memory directory is picked up on the next assembly). */
  const dirCache = new Map();
  function memoryDirFor(cwd) {
    const key = normalizeCwd(cwd);
    if (key === "") return null;
    const cached = dirCache.get(key);
    if (cached !== undefined) return cached;
    let found = resolveMemoryDir(projectsRoot, key);
    if (found === null) {
      // DSH owns the store: initialize this project on first use.
      const slug = dshSlug(key);
      if (SLUG_RE.test(slug)) {
        const dir = join(projectsRoot, slug, "memory");
        try {
          mkdirSync(dir, { recursive: true });
          found = { slug, dir };
        } catch {
          found = null;
        }
      }
    }
    if (found !== null) dirCache.set(key, found);
    return found;
  }

  /** Resolve the memory directory of the agent executing a tool / request. */
  function memoryDirOfAgent(agent, projectSlug) {
    if (typeof projectSlug === "string" && projectSlug.trim() !== "") {
      const dir = assertSafeDir(projectsRoot, projectSlug.trim());
      return { dir, slug: projectSlug.trim() };
    }
    let cwd = "";
    try {
      const session = agent?.session;
      cwd = session ? ctx.workingDirectory.get(session) : ctx.workingDirectory.defaultDirectory;
    } catch {
      cwd = "";
    }
    const found = memoryDirFor(cwd);
    if (!found) {
      throw Object.assign(
        new Error(`当前工作目录「${cwd || "(未知)"}」没有匹配到 DSH 记忆目录（~/.dsh/memory/projects/<slug>/memory）`),
        { code: "no-memory-dir" },
      );
    }
    return found;
  }

  /* ---------------- FR2: automatic injection ---------------- */

  /* Bounded cache of injection texts (keyed by dir|index|stat|budget|signature,
   * so entries stay valid until the underlying files or config change). */
  const injectionCache = new Map();

  /** Budget truncation + truncation notice + header. The header and the
   * truncation notice are part of the injected text, so they count against
   * the budget: the slice is `budget - header - notice` bytes.
   * `fullBytes` is the size the content would have without a budget (what
   * the user needs to know to size the budget); `injectedBytes` is what is
   * actually sent. */
  function withBudget(body) {
    const fullBytes = Buffer.byteLength(body, "utf8") + INJECTION_HEADER_BYTES;
    if (fullBytes <= cfg.injectBytes) return { text: INJECTION_HEADER + body, fullBytes, injectedBytes: fullBytes, truncated: false };
    const room = Math.max(1, cfg.injectBytes - INJECTION_HEADER_BYTES - TRUNCATION_NOTICE_BYTES);
    const text = INJECTION_HEADER + utf8ByteSliceAtLineBoundary(body, room) + TRUNCATION_NOTICE;
    return { text, fullBytes, injectedBytes: Buffer.byteLength(text, "utf8"), truncated: true };
  }

  /** Injection text plus stats; `null` when the project has no memories. */
  function buildInjectionParts(dir) {
    const indexFile = join(dir, cfg.indexName);
    let stat;
    try {
      stat = statSync(indexFile);
    } catch {
      stat = null;
    }
    if (stat === null || !stat.isFile()) {
      // Index missing but memory files may exist: synthesize (cheap, uncached by stat).
      const files = listMemoryFiles(cfg, dir);
      if (files.length === 0) return null;
      return withBudget(synthesizeIndex(cfg, dir, files));
    }
    // Directory signature covers manual file deletions that leave orphan index rows.
    const key = `${dir}|${cfg.indexName}|${stat.mtimeMs}|${stat.size}|${cfg.injectBytes}|${dirSignature(dir)}`;
    const cached = injectionCache.get(key);
    if (cached) return cached;
    let body = "";
    try {
      body = pruneOrphanRows(readFileSync(indexFile, "utf8"), dir).trimEnd() + "\n";
    } catch {
      return null;
    }
    if (body.trim() === "") {
      body = synthesizeIndex(cfg, dir, listMemoryFiles(cfg, dir));
    }
    const forced = listMemoryFiles(cfg, dir).filter((f) => !f.isIndex && f.forced);
    let forcedText = "";
    for (const file of forced) {
      try {
        const raw = readFileSync(join(dir, file.name), "utf8");
        const parsed = parseFrontmatter(raw);
        forcedText += `### 强制规则：${file.title}\n\n${parsed.body.trim()}\n\n`;
      } catch {
        /* A deleted or unreadable forced file is skipped safely. */
      }
    }
    if (forcedText) forcedText = FORCED_HEADER + forcedText;
    const parts = withBudget(forcedText + body);
    injectionCache.set(key, parts);
    if (injectionCache.size > 32) injectionCache.delete(injectionCache.keys().next().value);
    return parts;
  }

  function buildInjection(dir) {
    return buildInjectionParts(dir)?.text ?? "";
  }

  ctx.effect(
    () =>
      ctx.systemPrompt.section({
        name: SECTION_NAME,
        order: cfg.sectionOrder,
        interpolate: false,
        text: (assembly) => {
          if (!cfg.autoInject) return "";
          try {
            const session = assembly?.agent?.session;
            if (!session) return "";
            const cwd = ctx.workingDirectory.get(session);
            if (!cwd) return "";
            const found = memoryDirFor(cwd);
            if (!found) return "";
            return buildInjection(found.dir);
          } catch {
            // Never fail a session because of memory injection (NFR4).
            return "";
          }
        },
      }),
    "dsh-lk-memory: prompt section",
  );

  /* ---------------- FR4: model tools ---------------- */

  const jsonOutput = (_args, value) => [{ type: "text", text: JSON.stringify(value) }];

  const listSchema = {
    type: "object",
    additionalProperties: false,
    properties: {
      ok: { type: "boolean", description: "是否成功" },
      project: { type: "string", description: "项目 slug" },
      index: { type: "string", description: "MEMORY.md 索引全文" },
      files: {
        type: "array",
        description: "记忆文件清单",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            name: { type: "string" },
            title: { type: "string" },
            bytes: { type: "integer" },
            modified: { type: "string" },
          },
        },
      },
      error: { type: "string", description: "失败原因（成功时为空字符串）" },
    },
  };

  const readSchema = {
    type: "object",
    additionalProperties: false,
    properties: {
      ok: { type: "boolean" },
      project: { type: "string" },
      file: { type: "string" },
      content: { type: "string", description: "记忆文件全文（含 frontmatter）" },
      title: { type: "string", description: "frontmatter name" },
      description: { type: "string", description: "frontmatter description" },
      bytes: { type: "integer" },
      modified: { type: "string" },
      error: { type: "string" },
    },
  };

  const writeSchema = {
    type: "object",
    additionalProperties: false,
    properties: {
      ok: { type: "boolean" },
      project: { type: "string" },
      file: { type: "string" },
      bytes: { type: "integer" },
      indexUpdated: { type: "boolean", description: "MEMORY.md 索引行是否被同步更新" },
      warning: { type: "string", description: "非致命提醒（如强制规则因正文过长被降为普通记忆）；无则为空字符串" },
      error: { type: "string" },
    },
  };

  const forgetSchema = {
    type: "object",
    additionalProperties: false,
    properties: {
      ok: { type: "boolean" },
      project: { type: "string" },
      file: { type: "string" },
      deleted: { type: "boolean" },
      indexUpdated: { type: "boolean" },
      error: { type: "string" },
    },
  };

  function toolResult(fn) {
    try {
      return fn();
    } catch (error) {
      return { ok: false, error: error?.message ?? String(error) };
    }
  }

  if (cfg.enableTools) {
    ctx.effect(
      () =>
        ctx.tools.register(
          defineTool({
            name: "dsh_memory_list",
            description:
              "列出当前项目（按会话工作目录定位）的 DSH 记忆：返回 MEMORY.md 索引全文与记忆文件清单（名称/标题/字节/修改时间）。在做需要项目背景约定的任务前可调用。",
            parameters: {},
            output: { schema: listSchema, render: jsonOutput },
            async execute(_args, exec) {
              return toolResult(() => {
                const { dir, slug } = memoryDirOfAgent(exec?.agent);
                const files = listMemoryFiles(cfg, dir).map((f) => ({
                  name: f.name,
                  title: f.title,
                  bytes: f.bytes,
                  modified: f.modified,
                }));
                return { ok: true, project: slug, index: readIndexText(cfg, dir), files, error: "" };
              });
            },
          }),
        ),
      "dsh-lk-memory: tool dsh_memory_list",
    );

    ctx.effect(
      () =>
        ctx.tools.register(
          defineTool({
            name: "dsh_memory_read",
            description:
              "读取当前项目的一条 DSH 记忆的完整内容（含 YAML frontmatter）。file 为索引行括号中给出的文件名，例如 prefer-div-over-semantic-tags.md。",
            parameters: {
              file: { type: "string", required: true, description: "记忆文件名（记忆目录同层级的 *.md，如 v5-production-branch.md）" },
            },
            output: { schema: readSchema, render: jsonOutput },
            async execute(args, exec) {
              return toolResult(() => {
                assertSafeFileName(cfg, args.file);
                const { dir, slug } = memoryDirOfAgent(exec?.agent);
                const full = join(dir, args.file);
                if (!existsSync(full)) {
                  return { ok: false, project: slug, file: args.file, content: "", error: `记忆文件不存在：${args.file}` };
                }
                const stat = statSync(full);
                const content = readFileSync(full, "utf8");
                const { meta } = parseFrontmatter(content);
                return {
                  ok: true,
                  project: slug,
                  file: args.file,
                  content,
                  title: memoryTitle(args.file, meta),
                  description: memorySummary(meta),
                  bytes: stat.size,
                  modified: stat.mtime.toISOString(),
                  error: "",
                };
              });
            },
          }),
        ),
      "dsh-lk-memory: tool dsh_memory_read",
    );

    ctx.effect(
      () =>
        ctx.tools.register(
          defineTool({
            name: "dsh_memory_write",
            description:
              "写入/更新当前项目的一条 DSH 记忆（完整 Markdown 文件内容，含 frontmatter）。保存后自动同步 MEMORY.md 索引中对应行（标题/摘要按 frontmatter 的 name/description 重写）。写入纪律（必须遵守）：当本会话出现值得跨会话记住的信息（完成重要功能、重要技术决策、重要问题结论、用户重要反馈或否决、项目事实变化）时，先用 ask_user_question 向用户展示拟写入的标题/摘要并请求确认；仅在用户明确同意后才调用本工具，未经确认不得写入。不要就琐碎细节或一次性任务状态发起写入提议。",
            parameters: {
              file: { type: "string", required: true, description: "记忆文件名（记忆目录同层级的 *.md）" },
              content: { type: "string", required: true, description: "记忆文件完整内容（Markdown，建议含 YAML frontmatter：name/description，可选 metadata.enforcement）" },
            },
            output: { schema: writeSchema, render: jsonOutput },
            async execute(args, exec) {
              return toolResult(() => {
                assertSafeFileName(cfg, args.file);
                if (typeof args.content !== "string" || args.content.trim() === "") {
                  throw Object.assign(new Error("content 不能为空"), { code: "bad-content" });
                }
                const { dir, slug } = memoryDirOfAgent(exec?.agent);
                const isIndex = args.file === cfg.indexName;
                const { content, downgraded } = isIndex
                  ? { content: args.content, downgraded: false }
                  : guardRequiredSize(touchFrontmatterModified(args.content, new Date().toISOString()));
                writeFileSync(join(dir, args.file), content, "utf8");
                const indexUpdated = syncIndexOnWrite(cfg, dir, args.file, content);
                log(`wrote ${args.file} (${slug}), indexUpdated=${indexUpdated}${downgraded ? ", downgraded=required-size" : ""}`);
                return {
                  ok: true,
                  project: slug,
                  file: args.file,
                  bytes: Buffer.byteLength(content, "utf8"),
                  indexUpdated,
                  // Surface the downgrade so the model knows the rule is now index-only.
                  warning: downgraded
                    ? `正文超过强制规则上限 ${MAX_REQUIRED_BODY_BYTES} 字节，已自动降为普通记忆（仅索引行注入）。如需强制，请精简正文后重新设为强制规则。`
                    : "",
                  error: "",
                };
              });
            },
          }),
        ),
      "dsh-lk-memory: tool dsh_memory_write",
    );

    ctx.effect(
      () =>
        ctx.tools.register(
          defineTool({
            name: "dsh_memory_forget",
            description:
              "删除当前项目的一条 DSH 记忆文件，并同步清理 MEMORY.md 索引中的对应行。索引文件 MEMORY.md 本体不可删除。仅在用户明确要求删除某条记忆时使用。",
            parameters: {
              file: { type: "string", required: true, description: "要删除的记忆文件名（不能是 MEMORY.md）" },
            },
            output: { schema: forgetSchema, render: jsonOutput },
            async execute(args, exec) {
              return toolResult(() => {
                assertSafeFileName(cfg, args.file, { allowIndex: false });
                const { dir, slug } = memoryDirOfAgent(exec?.agent);
                const { deleted, indexUpdated } = deleteMemory(cfg, dir, args.file);
                log(`forgot ${args.file} (${slug}), deleted=${deleted}, indexUpdated=${indexUpdated}`);
                return { ok: true, project: slug, file: args.file, deleted, indexUpdated, error: "" };
              });
            },
          }),
        ),
      "dsh-lk-memory: tool dsh_memory_forget",
    );
  }

  /* ---------------- FR3: HTTP API for the management page ---------------- */

  const readBody = async (req) => {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      const bytes = Buffer.from(chunk);
      size += bytes.length;
      if (size > MAX_BODY_BYTES) {
        throw Object.assign(new Error("请求体超过 512 KiB"), { code: "body-too-large" });
      }
      chunks.push(bytes);
    }
    return Buffer.concat(chunks).toString("utf8");
  };

  const send = (res, code, obj) => {
    try {
      res.writeHead(code, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(obj));
    } catch {
      /* socket already gone */
    }
  };

  function authorize(req) {
    try {
      const connection = ctx.get("connection");
      if (!connection || typeof connection.admit !== "function") {
        return { ok: false, status: 503, error: "DSH 认证服务未就绪，已拒绝请求" };
      }
      const admission = connection.admit(req);
      const peer = admission?.peer;
      if (!peer || typeof peer !== "object") {
        return { ok: false, status: 401, error: "未授权：缺少有效凭证" };
      }
      if (peer.principal?.kind !== "owner") {
        return { ok: false, status: 403, error: "禁止访问：记忆管理需要 owner 权限" };
      }
      return { ok: true };
    } catch {
      return { ok: false, status: 403, error: "认证检查失败" };
    }
  }

  function listProjects() {
    // Make the current DSH project visible even before the first model turn.
    try {
      memoryDirFor(ctx.workingDirectory.defaultDirectory);
    } catch {
      /* A missing default directory should not break the manager. */
    }
    let entries;
    try {
      entries = readdirSync(projectsRoot, { withFileTypes: true });
    } catch {
      return [];
    }
    const projects = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const dir = join(projectsRoot, entry.name, "memory");
      try {
        if (!statSync(dir).isDirectory()) continue;
      } catch {
        continue;
      }
      const files = listMemoryFiles(cfg, dir);
      projects.push({
        slug: entry.name,
        path: slugToPath(entry.name),
        dir,
        count: files.filter((f) => !f.isIndex).length,
        indexBytes: files.find((f) => f.isIndex)?.bytes ?? 0,
        lastModified: files.reduce((m, f) => (f.modified > m ? f.modified : m), ""),
      });
    }
    projects.sort(
      (a, b) => (b.lastModified || "").localeCompare(a.lastModified || "") || a.slug.localeCompare(b.slug),
    );
    return projects;
  }

  /** Best-effort "the project the user is working on": the most specific
   * memory-dir match across live agents' working directories. */
  function currentProject() {
    let agents = [];
    try {
      const svc = ctx.get("agents");
      if (typeof svc?.list === "function") agents = svc.list();
    } catch {
      agents = [];
    }
    let best = null;
    for (const agent of agents) {
      let cwd = "";
      try {
        cwd = ctx.workingDirectory.get(agent?.session);
      } catch {
        continue;
      }
      const found = memoryDirFor(cwd);
      if (!found) continue;
      const needle = looseSlug(dshSlug(normalizeCwd(cwd)));
      const hit = looseSlug(found.slug);
      const score = needle === hit ? 2 : 1;
      // Prefer exact matches; among equals keep the first (stable, deterministic).
      if (best === null || score > best.score) best = { slug: found.slug, dir: found.dir, cwd, score };
    }
    return best;
  }

  function handleList(query) {
    const slug = String(query.get("project") ?? "").trim();
    const dir = assertSafeDir(projectsRoot, slug);
    const files = listMemoryFiles(cfg, dir);
    return { ok: true, project: slug, path: slugToPath(slug), dir, index: readIndexText(cfg, dir), files, error: "" };
  }

  function handleRead(query) {
    const slug = String(query.get("project") ?? "").trim();
    const file = String(query.get("file") ?? "").trim();
    assertSafeFileName(cfg, file);
    const dir = assertSafeDir(projectsRoot, slug);
    const full = join(dir, file);
    if (!existsSync(full)) {
      return { ok: false, project: slug, file, content: "", error: `记忆文件不存在：${file}` };
    }
    const stat = statSync(full);
    const content = readFileSync(full, "utf8");
    const { meta, body } = parseFrontmatter(content);
    return {
      ok: true,
      project: slug,
      file,
      content,
      body,
      meta,
      title: memoryTitle(file, meta),
      description: memorySummary(meta),
      bytes: stat.size,
      modified: stat.mtime.toISOString(),
      error: "",
    };
  }

  function handleCheck(query) {
    const slug = String(query.get("project") ?? "").trim();
    const dir = assertSafeDir(projectsRoot, slug);
    const files = listMemoryFiles(cfg, dir);
    const present = new Map(files.filter((f) => !f.isIndex).map((f) => [f.name, f]));
    const seen = new Set();
    const missingFiles = [];
    for (const row of parseIndexRows(readIndexText(cfg, dir))) {
      if (seen.has(row.file)) continue;
      seen.add(row.file);
      if (!present.has(row.file)) missingFiles.push({ file: row.file, title: row.title });
    }
    const missingRows = files
      .filter((f) => !f.isIndex && !seen.has(f.name))
      .map((f) => ({ name: f.name, title: f.title, description: f.description }));
    // Required rules are injected in full every turn; warn once they eat
    // most of the budget and start crowding out the index.
    const requiredFiles = files.filter((f) => !f.isIndex && f.forced);
    const requiredBytes = requiredFiles.reduce((sum, f) => sum + f.bytes, 0);
    const requiredPressure = requiredBytes > cfg.injectBytes * 0.6;
    return {
      ok: true,
      project: slug,
      missingFiles,
      missingRows,
      requiredPressure,
      requiredBytes,
      requiredFiles: requiredFiles.map((f) => f.name),
      error: "",
    };
  }

  function handleRepair(query) {
    const slug = String(query.get("project") ?? "").trim();
    const dir = assertSafeDir(projectsRoot, slug);
    const files = listMemoryFiles(cfg, dir);
    const present = new Set(files.filter((f) => !f.isIndex).map((f) => f.name));
    const indexText = readIndexText(cfg, dir);
    const seen = new Set();
    const kept = [];
    let removed = 0;
    for (const line of indexText.split(/\r?\n/)) {
      const m = INDEX_ROW_PARSE.exec(line);
      if (m) {
        const file = m[2].replace(/^\.\//, "");
        if (FILE_NAME_RE.test(file)) {
          if (!present.has(file)) {
            removed += 1;
            continue;
          }
          seen.add(file);
          kept.push(line);
          continue;
        }
      }
      kept.push(line);
    }
    const cleaned = [];
    let blanks = 0;
    for (const line of kept) {
      if (line.trim() === "") {
        blanks += 1;
        if (blanks > 1) continue;
      } else {
        blanks = 0;
      }
      cleaned.push(line);
    }
    let next = cleaned.join("\n").replace(/\s+$/, "");
    let added = 0;
    const addRows = files
      .filter((f) => !f.isIndex && !seen.has(f.name))
      .sort((a, b) => b.modified.localeCompare(a.modified));
    for (const f of addRows) {
      next += `\n- [${f.title}](${f.name})${f.description ? ` — ${f.description}` : ""}`;
      added += 1;
    }
    if (removed > 0 || added > 0) {
      writeFileSync(join(dir, cfg.indexName), `${next}\n`, "utf8");
      log(`repaired index (${slug}): removed=${removed}, added=${added}`);
    }
    return { ok: true, project: slug, removed, added, error: "" };
  }

  async function handleApi(req, res) {
    const auth = authorize(req);
    if (!auth.ok) return send(res, auth.status, { ok: false, error: auth.error });
    let url;
    try {
      url = new URL(req.url ?? "/", "http://localhost");
    } catch {
      return send(res, 400, { ok: false, error: "非法 URL" });
    }
    const path = url.pathname.startsWith(API_PREFIX) ? url.pathname.slice(API_PREFIX.length) || "/" : "/";
    try {
      if (req.method === "GET" && path === "/projects") {
        return send(res, 200, { ok: true, projects: listProjects() });
      }
      if (req.method === "GET" && path === "/current") {
        const best = currentProject();
        return send(res, 200, { ok: true, project: best?.slug ?? null });
      }
      if (req.method === "GET" && path === "/injection") {
        const slugParam = String(url.searchParams.get("project") ?? "").trim();
        const target = slugParam !== ""
          ? { slug: slugParam, dir: assertSafeDir(projectsRoot, slugParam) }
          : currentProject();
        const parts = target ? buildInjectionParts(target.dir) : null;
        return send(res, 200, {
          ok: true,
          injection: target && parts
            ? { project: target.slug, budgetBytes: cfg.injectBytes, fullBytes: parts.fullBytes, injectedBytes: parts.injectedBytes, truncated: parts.truncated }
            : null,
          error: "",
        });
      }
      if (req.method === "GET" && path === "/list") {
        return send(res, 200, handleList(url.searchParams));
      }
      if (req.method === "GET" && path === "/check") {
        return send(res, 200, handleCheck(url.searchParams));
      }
      if (req.method === "GET" && path === "/config") {
        return send(res, 200, {
          ok: true,
          writable: configWritable,
          config: {
            autoInject: cfg.autoInject,
            injectBytes: cfg.injectBytes,
            sectionOrder: cfg.sectionOrder,
            enableTools: cfg.enableTools,
            enableUi: cfg.enableUi,
            dshHome: cfg.dshHome,
            indexName: cfg.indexName,
          },
          error: "",
        });
      }
      if (req.method === "POST" && path === "/repair") {
        return send(res, 200, handleRepair(url.searchParams));
      }
      if (req.method === "GET" && path === "/read") {
        return send(res, 200, handleRead(url.searchParams));
      }
      let body = {};
      if (req.method === "POST") {
        const raw = await readBody(req);
        if (raw.trim() !== "") {
          try {
            body = JSON.parse(raw);
          } catch {
            return send(res, 400, { ok: false, error: "请求体不是合法 JSON" });
          }
        }
      }
      if (body === null || typeof body !== "object" || Array.isArray(body)) {
        return send(res, 400, { ok: false, error: "请求体必须是 JSON 对象" });
      }
      const project = String(body.project ?? "").trim();

      if (req.method === "POST" && path === "/config") {
        if (!configWritable) {
          return send(res, 503, { ok: false, error: "当前环境不支持在线保存配置（缺少 configEditor 或插件行）" });
        }
        let updates;
        try {
          updates = normalizeConfigPatch(body);
        } catch (e) {
          return send(res, 400, { ok: false, error: e?.message ?? String(e) });
        }
        if (Object.keys(updates).length === 0) {
          return send(res, 400, { ok: false, error: "没有可保存的配置项" });
        }
        await configEditor.edit(entry, (current) => ({ ...(current ?? {}), ...updates }));
        log(`config updated: ${JSON.stringify(updates)}; plugin reloads automatically`);
        return send(res, 200, { ok: true, applied: updates, error: "" });
      }

      if (req.method === "POST" && path === "/toggle-enforcement") {
        const file = String(body.file ?? "");
        assertSafeFileName(cfg, file, { allowIndex: false });
        const dir = assertSafeDir(projectsRoot, project);
        const full = join(dir, file);
        if (!existsSync(full)) return send(res, 404, { ok: false, error: `记忆文件不存在：${file}` });
        const enabled = body.enabled === true;
        if (enabled) {
          const bodyBytes = Buffer.byteLength(parseFrontmatter(readFileSync(full, "utf8")).body.trim(), "utf8");
          if (bodyBytes > MAX_REQUIRED_BODY_BYTES) {
            return send(res, 400, {
              ok: false,
              error: `正文 ${bodyBytes} 字节超过强制规则上限 ${MAX_REQUIRED_BODY_BYTES} 字节：强制规则每轮全文注入，请精简正文或保持为普通记忆`,
            });
          }
        }
        const prepared = touchFrontmatterModified(setEnforcement(readFileSync(full, "utf8"), enabled ? "required" : "advisory"), new Date().toISOString());
        writeFileSync(full, prepared, "utf8");
        const indexUpdated = syncIndexOnWrite(cfg, dir, file, prepared);
        log(`api enforcement ${file} (${project}), enabled=${enabled}`);
        return send(res, 200, { ok: true, project, file, enabled, indexUpdated, error: "" });
      }

      if (req.method === "POST" && path === "/write") {
        const file = String(body.file ?? "");
        const content = typeof body.content === "string" ? body.content : null;
        assertSafeFileName(cfg, file);
        if (content === null || content.trim() === "") {
          return send(res, 400, { ok: false, error: "content 不能为空" });
        }
        const dir = assertSafeDir(projectsRoot, project);
        const { content: prepared, downgraded } = file === cfg.indexName
          ? { content, downgraded: false }
          : guardRequiredSize(touchFrontmatterModified(content, new Date().toISOString()));
        writeFileSync(join(dir, file), prepared, "utf8");
        const indexUpdated = syncIndexOnWrite(cfg, dir, file, prepared);
        log(`api write ${file} (${project}), indexUpdated=${indexUpdated}${downgraded ? ", downgraded=required-size" : ""}`);
        return send(res, 200, {
          ok: true,
          project,
          file,
          bytes: Buffer.byteLength(prepared, "utf8"),
          indexUpdated,
          warning: downgraded
            ? `正文超过强制规则上限 ${MAX_REQUIRED_BODY_BYTES} 字节，已自动降为普通记忆（仅索引行注入）`
            : "",
          error: "",
        });
      }

      if (req.method === "POST" && path === "/delete") {
        const file = String(body.file ?? "");
        assertSafeFileName(cfg, file, { allowIndex: false });
        const dir = assertSafeDir(projectsRoot, project);
        const { deleted, indexUpdated } = deleteMemory(cfg, dir, file);
        log(`api delete ${file} (${project}), deleted=${deleted}, indexUpdated=${indexUpdated}`);
        return send(res, 200, { ok: deleted, project, file, deleted, indexUpdated, error: deleted ? "" : "文件不存在或已被删除" });
      }

      if (req.method === "POST" && path === "/create") {
        const name = String(body.name ?? "").trim();
        const description = String(body.description ?? "").trim();
        const enforce = body.enforce === true;
        const content = String(body.content ?? "").replace(/\s+$/, "");
        if (!name) return send(res, 400, { ok: false, error: "name 不能为空" });
        const base = name
          .toLowerCase()
          .replace(/[\\/:*?"<>|\s]+/g, "-")
          .replace(/[^\w-]+/g, "")
          .replace(/-+/g, "-")
          .replace(/^-|-$/g, "");
        if (base === "") return send(res, 400, { ok: false, error: "name 无法转换为合法文件名" });
        const dir = assertSafeDir(projectsRoot, project);
        let file = `${base}.md`;
        for (let i = 2; existsSync(join(dir, file)); i += 1) file = `${base}-${i}.md`;
        const now = new Date().toISOString();
        const doc = [
          "---",
          `name: ${base}`,
          `description: "${description.replace(/"/g, "'")}"`,
          "metadata:",
          "  node_type: memory",
          `  enforcement: ${enforce ? "required" : "advisory"}`,
          `  modified: ${now}`,
          "---",
          "",
          content,
          "",
        ].join("\n");
        writeFileSync(join(dir, file), doc, "utf8");
        const indexUpdated = syncIndexOnWrite(cfg, dir, file, doc);
        log(`api create ${file} (${project}), indexUpdated=${indexUpdated}`);
        return send(res, 200, { ok: true, project, file, bytes: Buffer.byteLength(doc, "utf8"), indexUpdated, error: "" });
      }

      return send(res, 404, { ok: false, error: `未知接口：${req.method} ${path}` });
    } catch (error) {
      const code = typeof error?.code === "string" ? error.code : "error";
      const status = code === "bad-file" || code === "bad-slug" || code === "index-protected" ? 400 : 500;
      return send(res, status, { ok: false, error: error?.message ?? String(error) });
    }
  }

  if (cfg.enableUi) {
    ctx.effect(
      () =>
        ctx.webServer.register({
          kind: "prefix",
          path: API_PREFIX,
          handler: (req, res) => handleApi(req, res),
        }),
      "dsh-lk-memory: http api",
    );
  }

  log(
    `ready (dshHome=${cfg.dshHome}, autoInject=${cfg.autoInject}, injectBytes=${cfg.injectBytes}, tools=${cfg.enableTools}, ui=${cfg.enableUi})`,
  );
}
