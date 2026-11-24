# dsh-lk-memory

DSH 插件：管理 DSH 自己的项目记忆（`~/.dsh/memory/projects/<slug>/memory/`）并注入每次会话上下文，附带侧边栏全宽管理面板。记忆完全由 DSH 管理，只读写 DSH 自有目录。

官网：[dsh-lk-memory](https://lkf777555.github.io/dsh-lk-memory/) · 仓库：[GitHub](https://github.com/lkf777555/dsh-lk-memory)

## 安装

从本地目录安装：

```bash
git clone https://github.com/lkf777555/dsh-lk-memory.git
```

克隆后二选一：

- **DSH 界面**：插件（Plugins）→ Add plugin → 选择克隆出的 `dsh-lk-memory` 目录
- **命令行**：`dsh plugin --profile desktop add link:<克隆路径>\dsh-lk-memory`

更新插件：拉取最新代码后重启 DSH 即可。

## 功能

### 自动注入（FR2）
- 按会话工作目录定位 DSH 项目记忆目录，把 `MEMORY.md` 索引注入 system prompt；记忆由 DSH 工具和管理面板维护
- 注入头包含记忆使用约定；带 `metadata.enforcement: required` 的记忆会作为「强制规则」单独注入，并优先显示完整正文
- 管理面板新建记忆时可勾选「强制规则」；也可直接在 Markdown frontmatter 中设置 `enforcement: required`
- 注入预算默认 6000 字节（可配置 500–60000），超限按行边界 + UTF-8 安全截断并提示；注入头与截断提示计入预算
- **强制规则体积保护**：单条强制规则正文超过 4000 字节时，写入自动降为普通记忆（仅索引行注入）并告知原因；面板「设为强制规则」对超限正文直接拒绝并提示
- 按 `mtimeMs+size+目录签名` 缓存：轮与轮字节稳定（prompt 缓存友好）；DSH 写入新记忆后下一轮即时生效
- 无记忆目录 → 静默不注入，绝不影响会话
- **防幻影**：构建注入时自动过滤指向已删除文件的失效索引行

### 记忆定位（FR1）
- 三级匹配：精确 slug → 宽松相等（`[\\/:.-]+` 折叠，兼容 `C--Users-pc` 双连字符）→ 最长宽松前缀（会话位于项目子目录）

### 管理面板（FR3）
- **侧边栏一级入口「DSH 记忆」→ 全宽主面板**（与 dsh-context 同交互模式）：项目切换（按最近活跃排序，自动识别当前项目）、记忆列表（搜索 / 排序）、单条查看（元数据卡 + 正文分离）、编辑（Ctrl+S）、删除（二次确认）、新建、`MEMORY.md` 索引查看与编辑
- **索引自愈**：检测「索引行指向已删除文件 / 记忆缺索引行」，警告条 + 一键修复；强制规则正文合计超过预算 60% 时提示精简
- **设置 → DSH 记忆 = 配置中心**：自动注入开关、注入预算（含快捷档位、当前项目实时注入量与截断状态）、注入位置、模型工具开关；保存即写回插件行并自动重载生效
- `#0d83fc` 蓝色系视觉 + 轻量过渡动画

### 模型工具（FR4）
- `dsh_memory_list / read / write / forget`，文件名白名单 `*.md` 且限同层级（防路径穿越；`MEMORY.md` 禁删）
- **写入纪律：先问后写**——代理发现值得沉淀的信息时，先用 `ask_user_question` 展示拟写入的标题/摘要，用户确认后才落盘；删除仅响应用户明确指令

## 配置（bundle 行 config，均可省略）

| 键 | 默认 | 说明 |
|---|---|---|
| `dshHome` | `~/.dsh` | DSH 数据主目录；记忆实际存放在 `~/.dsh/memory/projects/` |
| `indexName` | `MEMORY.md` | 索引文件名 |
| `autoInject` | `true` | 自动注入开关 |
| `injectBytes` | `6000` | 索引注入预算（500–60000 字节） |
| `sectionOrder` | `400` | 注入排序（数值越小越靠前） |
| `enableTools` | `true` | 是否注册模型工具 |
| `enableUi` | `true` | 是否启用管理面板与 HTTP API |

### 强制规则记忆

在任意记忆文件的 YAML frontmatter 中加入：

```yaml
metadata:
  enforcement: required
```

插件会在每轮 system prompt 中优先注入这条记忆的完整正文，并明确要求模型执行和自检。它提高了指令优先级和可见性，但仍受系统指令、当前用户明确要求以及模型能力约束；如果需要绝对的输出格式校验，还应增加最终响应拦截器。

用户补丁层（`cordis.patch.yml`）按 id 覆盖即可，例如：

```yaml
- id: dsh-lk-memory
  config:
    injectBytes: 12000
```

## 安全与卸载

- 所有读写删除严格限制在所定位记忆目录内的 `*.md`；HTTP API 走 DSH owner 鉴权
- 卸载无残留：记忆文件原样保留，插件本体由插件管理器自动清理
