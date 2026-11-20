# dsh-lk-memory 使用说明

> 插件定位：把 DSH 独立项目记忆（`~/.dsh/memory/projects/<slug>/memory/`）接入 DeepSeek Harness（DSH）——索引自动注入每次会话，并提供全宽管理面板与模型工具。记忆完全由 DSH 管理，只读写 DSH 目录，卸载不会删除记忆文件。

## 一、源码与目录结构

源码位置（本机开发态，pnpm link 进 DSH profile）：插件源码目录（即本仓库这份 `dsh-lk-memory/`）。

```text
dsh-lk-memory/
├── package.json          # 插件清单：dsh.bundle（patch 入口）+ dsh.client（web 平台声明）
├── cordis.patch.yml      # bundle 层补丁：向 Loader 插入插件行（config: {} 为默认配置）
├── icon.svg              # 插件图标（插件管理列表/详情页显示）
├── README.md             # 功能概览（插件管理详情页会渲染这份内容）
├── USAGE.md              # 本文档：完整说明
├── locale/               # 插件管理器显示用的元信息（meta.title/description）
│   ├── zh.json
│   └── en.json
└── lib/
    ├── index.js          # Host 端：记忆定位、索引注入、4 个模型工具、HTTP API、配置读写
    └── client.js         # Web 端：侧边栏入口、全宽管理面板、设置配置页（React + 原生 CSS）
```

### 安装

从本地目录安装：

```bash
git clone https://github.com/lkf777555/dsh-lk-memory.git
```

- **DSH 界面**：插件（Plugins）→ Add plugin → 选择克隆出的 `dsh-lk-memory` 目录
- **命令行**：`dsh plugin --profile desktop add link:<克隆路径>\dsh-lk-memory`

安装后由插件管理器自动登记：

- `<DSH profile>/node_modules/dsh-lk-memory` → link 到源码目录
- profile `package.json` 的 `dependencies` 与 `dsh.profile.bundles`
- 更新插件：拉取最新代码后**重启 DSH** 即可（开发态改 `lib/*.js` 同样重启生效）

## 二、数据流总览

```text
DSH 项目记忆目录                    dsh-lk-memory                    DSH 会话
──────────────────────            ─────────────────────                   ─────────
写记忆(.md + 索引行)  ──实时──▶  读取 MEMORY.md 索引
                                 ├─▶ 注入 system prompt（每轮，静默/缓存友好）
                                 ├─▶ 管理面板（查看/编辑/新建/删除/修复）
                                 └─▶ 模型工具（先问后写）  ◀── 用户确认 ── DSH 代理
写回 .md + 索引行  ◀────────────  write/forget/create
```

## 三、功能与使用

### 1. 自动注入（无需任何操作）

- 在某项目的工作目录下开会话，该项目的 `MEMORY.md` 索引自动进入 system prompt（位于计划策略之前）
- 索引行带文件名 → 模型判断相关时用 `read` 工具按需读全文（DSH 项目记忆机制）
- 超过注入预算（默认 6000 字节）按行边界截断并提示；指向已删除文件的失效行自动过滤
- 无记忆目录的项目完全静默，零打扰

### 2. 记忆管理面板

侧边栏 **「DSH 记忆」** 入口 → 全宽面板：

| 操作 | 说明 |
|---|---|
| 切换项目 | 下拉按最近活跃排序；自动识别当前会话项目（绿色「当前项目」徽标） |
| 搜索/排序 | 按名称、摘要过滤；最近修改 / 文件名排序 |
| 查看 | frontmatter 元数据卡（name/description/originSessionId/modified）+ 正文分离展示 |
| 编辑 | 全文编辑（含 frontmatter），`Ctrl+S` 或「保存」；自动重写 `MEMORY.md` 对应行（标题/摘要取 name/description） |
| 删除 | 模态弹框二次确认；删文件 + 清索引行一步完成 |
| 新建 | 填标识/摘要/正文 → 生成 frontmatter + 文件 + 索引行 |
| 索引维护 | `MEMORY.md` 全文查看与编辑；索引与目录失配时出现警告条，一键修复 |

### 3. 配置中心

**设置 → DSH 记忆**（也可在插件管理详情页）：

| 配置 | 默认 | 说明 |
|---|---|---|
| 自动注入 | 开 | 关闭后不注入任何记忆内容（面板/工具不受影响） |
| 注入预算 | 6000 字节 | 500–60000；快捷档位 6000/10000/15000/20000；超出截断 |
| 注入位置 order | 400 | 数值越小越靠前 |
| 模型工具 | 开 | 注册 dsh_memory_* 四个工具 |

保存即写回插件行（configEditor）并自动重载，**即时生效，无需重启 DSH**。

### 4. 模型工具（对话里直接说）

| 工具 | 触发说法示例 | 行为 |
|---|---|---|
| `dsh_memory_list` | 「我们项目有哪些约定？」 | 返回索引全文 + 文件清单 |
| `dsh_memory_read` | 「详细说说 v5 分支那条」 | 读单条全文 |
| `dsh_memory_write` | 「把这条经验记到记忆里」 | **先弹问题向你确认**（标题/摘要）→ 确认后写文件 + 同步索引行 |
| `dsh_memory_forget` | 「删掉 xxx 那条记忆」 | 删文件 + 清索引行（仅响应明确指令；`MEMORY.md` 本体禁删） |

## 四、常见问题（FAQ）

**Q：直接在资源管理器里删了记忆文件会怎样？**
索引行会残留，但注入时会自动过滤（不污染上下文）；打开管理面板会看到黄色警告条，点「修复索引」物理清理。

**Q：记忆会不会被其他工具改动？**
不会。插件只使用 DSH 自有目录，记忆的读取、写入、删除和索引维护都由 DSH 完成。

**Q：为什么注入的是索引不是全文？**
DSH 每轮注入项目索引，强制规则记忆会优先注入正文；普通记忆按索引发现、按需读取，避免每轮背上全部全文。

**Q：卸载会丢记忆吗？**
不会。卸载只移除插件本体，`~/.dsh` 下的记忆文件原样保留。

## 五、版本

- **v1.5.3** — 稳定版。注入（防幻影/缓存友好）、全宽管理面板、配置中心（在线保存）、索引自愈、先问后写工具、`#0d83fc` 蓝色系 UI。
- 历史：v1.0 基础注入+工具 → v1.2 侧边栏面板/配置中心雏形 → v1.4 中文化/索引自愈 → v1.5 配置在线保存/弹框/主题。
