/**
 * dsh-lk-memory — Client half.
 *
 * Management page for DSH memories: project switcher (sorted by
 * recent activity), searchable/sortable memory list, metadata-aware viewer
 * (frontmatter separated from body), editor with Ctrl+S, two-step delete,
 * create dialog. Plain React + `--dsw-alias-*` theme tokens; talks to the
 * Host HTTP API at `/dsh-lk-memory/api`.
 */
window.__ModuleLoader__.load({
  id: "dsh-lk-memory",
  factory(require) {
    const React = require("react");
    const { useState, useEffect, useCallback, useMemo, useRef } = React;
    const h = React.createElement;

    const NS = "dsh-lk-memory";
    const API = "/dsh-lk-memory/api";
    const INDEX_VIEW = "__index__";

    /* ---------------- locale ---------------- */

    const zh = {
      "meta.title": "DSH 记忆",
      "nav.title": "DSH 记忆",
      "page.title": "DSH 记忆管理",
      "page.desc": "记忆唯一真源是 DSH 自己的记忆目录，这里的修改实时生效。",
      "project.label": "项目",
      "project.active": "当前项目",
      "project.lastActive": "最近活跃",
      "project.empty": "本机还没有任何 DSH 记忆目录",
      "project.emptyHint": "在 DSH 中对项目开启 auto-memory 后，完成重要功能或收到重要反馈时会自动写入 ~/.dsh/memory/projects/<slug>/memory/。",
      "list.memories": "记忆",
      "list.index": "索引",
      "list.indexFile": "MEMORY.md（索引全文）",
      "list.search": "搜索名称或摘要…",
      "list.sort": "排序",
      "sort.recent": "最近修改",
      "sort.name": "文件名",
      "list.modified": "修改于",
      "list.empty": "没有匹配的记忆",
      "list.emptyProject": "当前项目还没有记忆。在 DSH 中完成重要功能或得到重要反馈后会自动写入。",
      "action.refresh": "刷新",
      "action.create": "新建记忆",
      "action.repair": "修复索引",
      "check.mismatch": "索引与记忆目录不一致：{missing} 行指向已不存在的文件，{extra} 个记忆缺少索引行。",
      "check.requiredPressure": "强制规则正文合计 {bytes}，已超过注入预算的 60%：每轮全文注入会挤占索引，建议精简正文或把部分规则改为普通记忆。",
      "state.repaired": "索引已修复：清理 {removed} 行失效条目，补写 {added} 行缺失条目",
      "action.edit": "编辑",
      "action.save": "保存",
      "action.saveHint": "Ctrl+S",
      "action.cancel": "取消",
      "action.delete": "删除",
      "action.confirmDelete": "确认删除",
      "action.forceOn": "设为强制规则",
      "action.forceOff": "取消强制规则",
      "state.enforcementOn": "已设为强制规则",
      "state.enforcementOff": "已取消强制规则",
      "view.bytes": "字节",
      "view.path": "记忆目录",
      "view.fmTitle": "Frontmatter 元数据",
      "editor.hint": "保存后会同步重写 MEMORY.md 中本条对应行（标题/摘要取自 frontmatter 的 name/description）。",
      "create.title": "新建记忆",
      "create.name": "标识（用于生成文件名）",
      "create.desc": "摘要（写入索引行）",
      "create.content": "正文",
      "create.submit": "创建",
      "confirm.text": "确定删除「{file}」？文件会被删除，MEMORY.md 对应行同步清理，DSH 下次会话不再读到。",
      "state.loading": "加载中…",
      "state.saving": "保存中…",
      "state.saved": "已保存，索引行已同步",
      "state.deleted": "已删除，索引行已清理",
      "state.created": "已创建 {file}",
      "error.http": "请求失败：{message}",
      "cfg.title": "插件配置",
      "cfg.injectSection": "注入",
      "cfg.autoInject": "自动注入记忆索引",
      "cfg.autoInjectHint": "关闭后不再向会话注入任何记忆内容（管理面板与工具不受影响）",
      "cfg.injectBytes": "注入预算（字节）",
      "cfg.injectBytesHint": "有效范围 500–60000；强制规则全文优先占预算，超出则索引尾部按行截断；调大增加每轮 token 占用（大部分由提示词缓存吸收）",
      "cfg.injectUsage": "当前项目记忆共 {full} / 预算 {budget} 字节",
      "cfg.injectFit": "未截断，完整注入",
      "cfg.injectTruncated": "已超预算截断，实际注入 {injected}：建议调大预算，或精简强制规则正文",
      "cfg.sectionOrder": "注入位置（order）",
      "cfg.sectionOrderHint": "数值越小越靠前；默认 400，位于计划策略之前",
      "cfg.toolsSection": "模型工具",
      "cfg.enableTools": "启用记忆工具",
      "cfg.enableToolsHint": "dsh_memory_list / read / write / forget；写入遵循「先问后写」纪律",
      "cfg.infoSection": "只读信息",
      "cfg.save": "保存配置",
      "cfg.saved": "已保存，插件自动重载，新配置即刻生效",
      "cfg.notWritable": "当前环境不支持在线保存配置（缺少 configEditor 或插件行）",
      "cfg.invalidNumber": "注入预算与注入位置请输入有效数字",
    };

    const en = {
      "meta.title": "DSH memory",
      "nav.title": "DSH memory",
      "page.title": "DSH memory manager",
      "page.desc": "DSH's memory directory is the single source of truth; edits here apply instantly.",
      "project.label": "Project",
      "project.active": "current",
      "project.lastActive": "last activity",
      "project.empty": "No DSH memory directory exists on this machine yet",
      "project.emptyHint": "Enable auto-memory in DSH; important features and feedback are written to ~/.dsh/memory/projects/<slug>/memory/.",
      "list.memories": "Memories",
      "list.index": "Index",
      "list.indexFile": "MEMORY.md (index)",
      "list.search": "Search name or summary…",
      "list.sort": "Sort",
      "sort.recent": "Recently modified",
      "sort.name": "File name",
      "list.modified": "modified",
      "list.empty": "No matching memories",
      "list.emptyProject": "No memories for this project yet. DSH writes one when an important feature or feedback lands.",
      "action.refresh": "Refresh",
      "action.create": "New memory",
      "action.repair": "Repair index",
      "check.mismatch": "Index and memory directory disagree: {missing} rows point to deleted files, {extra} memories lack an index row.",
      "check.requiredPressure": "Required-rule bodies total {bytes}, over 60% of the injection budget: full-text injection every turn crowds out the index. Shorten them or demote some rules to ordinary memories.",
      "state.repaired": "Index repaired: removed {removed} stale rows, added {added} missing rows",
      "action.edit": "Edit",
      "action.save": "Save",
      "action.saveHint": "Ctrl+S",
      "action.cancel": "Cancel",
      "action.delete": "Delete",
      "action.confirmDelete": "Confirm delete",
      "action.forceOn": "Mark as required rule",
      "action.forceOff": "Remove required rule",
      "state.enforcementOn": "Marked as a required rule",
      "state.enforcementOff": "Required rule removed",
      "view.bytes": "bytes",
      "view.path": "memory dir",
      "view.fmTitle": "Frontmatter metadata",
      "editor.hint": "Saving also rewrites this entry's MEMORY.md row (title/summary come from frontmatter name/description).",
      "create.title": "New memory",
      "create.name": "Identifier (becomes the file name)",
      "create.desc": "Summary (goes into the index row)",
      "create.content": "Body",
      "create.submit": "Create",
      "confirm.text": "Delete \"{file}\"? The file is removed and its MEMORY.md row cleaned, so DSH stops reading it.",
      "state.loading": "Loading…",
      "state.saving": "Saving…",
      "state.saved": "Saved, index row synced",
      "state.deleted": "Deleted, index row cleaned",
      "state.created": "Created {file}",
      "error.http": "Request failed: {message}",
      "cfg.title": "Plugin settings",
      "cfg.injectSection": "Injection",
      "cfg.autoInject": "Auto-inject memory index",
      "cfg.autoInjectHint": "When off, no memory content is injected into conversations (panel and tools keep working)",
      "cfg.injectBytes": "Injection budget (bytes)",
      "cfg.injectBytesHint": "Valid range 500–60000; required rules take the budget first, the index tail is truncated beyond it; larger budgets cost more tokens per turn (mostly absorbed by prompt caching)",
      "cfg.injectUsage": "Current project memories total {full} / budget {budget} bytes",
      "cfg.injectFit": "Fits the budget, injected in full",
      "cfg.injectTruncated": "Over budget and truncated, {injected} actually injected: raise the budget or shorten required-rule bodies",
      "cfg.sectionOrder": "Injection position (order)",
      "cfg.sectionOrderHint": "Lower = earlier in the prompt; default 400, before the plan policy",
      "cfg.toolsSection": "Model tools",
      "cfg.enableTools": "Enable memory tools",
      "cfg.enableToolsHint": "dsh_memory_list / read / write / forget; writes follow confirm-first discipline",
      "cfg.infoSection": "Read-only info",
      "cfg.save": "Save settings",
      "cfg.saved": "Saved. The plugin reloads automatically and the new settings apply immediately",
      "cfg.notWritable": "This environment cannot save settings online (missing configEditor or plugin row)",
      "cfg.invalidNumber": "Injection budget and position must be valid numbers",
    };

    let activeLang = "zh";
    const fill = (tpl, vars) => String(tpl).replace(/\{(\w+)\}/g, (_, k) => String(vars?.[k] ?? ""));
    const tr = (key, vars) => {
      const dict = (activeLang === "en" ? en[key] : zh[key]) ?? zh[key] ?? en[key] ?? key;
      return fill(dict, vars);
    };
    const makeT = (props) => (typeof props?.t === "function" ? props.t : tr);
    /* ---------------- API ---------------- */

    async function apiGet(path) {
      const res = await fetch(API + path);
      const data = await res.json().catch(() => ({ ok: false, error: "invalid response" }));
      if (!res.ok || data?.ok !== true) throw new Error(data?.error || `HTTP ${res.status}`);
      return data;
    }

    async function apiPost(path, payload) {
      const res = await fetch(API + path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload || {}),
      });
      const data = await res.json().catch(() => ({ ok: false, error: "invalid response" }));
      if (!res.ok || data?.ok !== true) throw new Error(data?.error || `HTTP ${res.status}`);
      return data;
    }

    const fmtBytes = (n) => {
      if (!Number.isFinite(n) || n === undefined || n === null) return "—";
      if (n < 1024) return `${n} B`;
      return `${(n / 1024).toFixed(1)} KB`;
    };
    const fmtTime = (iso) => {
      if (!iso) return "—";
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return "—";
      return d.toLocaleString();
    };

    /* ---------------- styles ---------------- */

    const CSS = `
.dcm-page,.dcm-fullpage{--dcm-accent:#0d83fc;}
@keyframes dcm-fade-up{from{opacity:0;transform:translateY(6px);}to{opacity:1;transform:none;}}
.dcm-page{display:flex;flex-direction:column;gap:12px;min-height:480px;height:100%;color:var(--dsw-alias-label-primary);font-size:13px;animation:dcm-fade-up .22s ease;}
.dcm-fullpage{height:100%;overflow:auto;}
.dcm-fullpage .dcm-page{padding:18px 22px;}
.dcm-fullpage .dcm-side{width:340px;}
.dcm-fullpage .dcm-textarea{min-height:420px;}
.dcm-fullpage .dcm-pre{font-size:12.5px;}
.dcm-titlebar{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;}
.dcm-title{font-size:16px;font-weight:700;margin:0;}
.dcm-sub{color:var(--dsw-alias-label-secondary);font-size:12px;}
.dcm-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
.dcm-spacer{flex:1;}
.dcm-select,.dcm-input,.dcm-textarea{box-sizing:border-box;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l1);border-radius:6px;padding:5px 9px;font-size:12px;outline:none;transition:border-color .15s ease,box-shadow .15s ease;}
.dcm-select:focus,.dcm-input:focus,.dcm-textarea:focus{border-color:var(--dcm-accent);box-shadow:0 0 0 2px rgba(13,131,252,.15);}
.dcm-btn{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l1);border-radius:6px;padding:5px 11px;font-size:12px;cursor:pointer;transition:background .12s ease,border-color .12s ease,transform .08s ease;}
.dcm-btn:hover{background:var(--dsw-alias-bg-layer-2);}
.dcm-btn:focus-visible{outline:2px solid var(--dcm-accent);outline-offset:1px;}
.dcm-btn:active{transform:translateY(1px);}
.dcm-btn:disabled{opacity:.45;cursor:default;}
.dcm-btn-primary{background:var(--dcm-accent);border-color:var(--dcm-accent);color:#fff;}
.dcm-btn-primary:hover{background:var(--dcm-accent);opacity:.88;}
.dcm-btn-danger{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary);}
.dcm-banner{border:1px solid var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary);border-radius:6px;padding:6px 10px;font-size:12px;white-space:pre-wrap;animation:dcm-fade-up .18s ease;}
.dcm-banner-ok{border-color:var(--dsw-alias-state-success-primary);color:var(--dsw-alias-state-success-primary);}
.dcm-banner-warn{border-color:var(--dsw-alias-state-warn-primary);color:var(--dsw-alias-state-warn-primary);display:flex;gap:10px;align-items:center;flex-wrap:wrap;}
.dcm-banner-warn .dcm-btn-danger{border-color:currentColor;color:inherit;}
.dcm-body{display:flex;gap:12px;flex:1;min-height:340px;}
@media (max-width:900px){.dcm-body{flex-direction:column;}.dcm-side{width:100%;max-height:250px;}}
.dcm-side{width:300px;flex:none;display:flex;flex-direction:column;gap:6px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);padding:8px;animation:dcm-fade-up .22s ease;}
.dcm-side-head{display:flex;flex-direction:column;gap:6px;}
.dcm-side-tools{display:flex;gap:6px;align-items:center;}
.dcm-side-tools .dcm-input,.dcm-side-tools .dcm-select{flex:1;min-width:0;}
.dcm-list{overflow:auto;display:flex;flex-direction:column;gap:2px;flex:1;min-height:0;}
.dcm-group{font-size:11px;color:var(--dsw-alias-label-secondary);padding:6px 6px 2px;font-weight:600;letter-spacing:.04em;}
.dcm-row{position:relative;display:flex;flex-direction:column;gap:3px;padding:7px 9px;border-radius:6px;cursor:pointer;border:1px solid transparent;border-left:2px solid transparent;transition:background .12s ease,border-color .12s ease;animation:dcm-fade-up .2s ease;}
.dcm-row:hover{background:var(--dsw-alias-bg-layer-2);}
.dcm-row-active{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l2);border-left-color:var(--dcm-accent);}
.dcm-row-name{padding-right:45px;font-weight:600;font-size:12px;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;word-break:break-all;}
.dcm-row-meta{color:var(--dsw-alias-label-secondary);font-size:11px;display:flex;gap:6px;flex-wrap:wrap;align-items:center;}
.dcm-row-desc{color:var(--dsw-alias-label-secondary);font-size:11px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}
.dcm-badge{border:1px solid var(--dsw-alias-border-l2);border-radius:4px;padding:0 5px;font-size:10px;color:var(--dsw-alias-label-secondary);}
.dcm-badge-active{border-color:var(--dsw-alias-state-success-primary);color:var(--dsw-alias-state-success-primary);}
.dcm-badge-force{position:absolute;top:7px;right:8px;border-color:var(--dcm-accent);color:var(--dcm-accent);font-weight:600;}
.dcm-main{flex:1;min-width:0;overflow:auto;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);padding:14px;display:flex;flex-direction:column;gap:10px;animation:dcm-fade-up .22s ease;}
.dcm-detail-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
.dcm-detail-name{font-weight:700;font-size:13px;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;word-break:break-all;}
.dcm-kv{display:grid;grid-template-columns:auto 1fr;gap:3px 12px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);border-radius:6px;padding:9px 11px;font-size:12px;align-items:baseline;}
.dcm-kv-k{color:var(--dsw-alias-label-secondary);white-space:nowrap;}
.dcm-kv-v{word-break:break-word;}
.dcm-pre{margin:0;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);border-radius:6px;padding:11px;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12px;line-height:1.6;white-space:pre-wrap;word-break:break-word;color:var(--dsw-alias-label-primary);}
.dcm-textarea{width:100%;min-height:320px;resize:vertical;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12px;line-height:1.55;}
.dcm-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;}
.dcm-kbd{border:1px solid var(--dsw-alias-border-l2);border-bottom-width:2px;border-radius:4px;padding:0 5px;font-size:10px;color:var(--dsw-alias-label-secondary);font-family:ui-monospace,SFMono-Regular,Consolas,monospace;}
.dcm-empty{flex:1;display:flex;flex-direction:column;gap:8px;align-items:center;justify-content:center;color:var(--dsw-alias-label-secondary);text-align:center;padding:28px;}
.dcm-form{display:flex;flex-direction:column;gap:9px;}
.dcm-form label{display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--dsw-alias-label-secondary);}
.dcm-form label.dcm-check{flex-direction:row;align-items:center;gap:8px;cursor:pointer;}
.dcm-form label.dcm-check input{margin:0;accent-color:var(--dcm-accent);}
.dcm-overlay{position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:1100;overflow:hidden;animation:dcm-fade-up .15s ease;}
.dcm-dialog{box-sizing:border-box;width:min(600px,92vw);max-width:calc(100vw - 24px);max-height:86vh;overflow-x:hidden;overflow-y:auto;background:var(--dsw-alias-bg-overlay);border:1px solid var(--dsw-alias-border-l2);border-radius:10px;padding:18px;display:flex;flex-direction:column;gap:10px;box-shadow:0 12px 40px rgba(0,0,0,.25);}
.dcm-dialog-title{font-size:14px;font-weight:700;}
.dcm-card{border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);padding:14px;display:flex;flex-direction:column;gap:12px;animation:dcm-fade-up .22s ease;}
.dcm-card-title{font-size:13px;font-weight:700;}
.dcm-fieldrow{display:flex;align-items:center;gap:12px;flex-wrap:wrap;}
.dcm-fieldrow-main{flex:1;min-width:220px;display:flex;flex-direction:column;gap:3px;}
.dcm-switchlabel{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary);}
.dcm-switch{position:relative;width:40px;height:22px;border-radius:999px;border:none;background:var(--dsw-alias-bg-layer-2);cursor:pointer;padding:0;flex:none;transition:background .18s ease;}
.dcm-switch:hover{filter:brightness(.97);}
.dcm-switch:focus-visible{outline:2px solid var(--dcm-accent);outline-offset:2px;}
.dcm-switch-knob{position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:var(--dsw-alias-label-secondary);transition:transform .18s ease,background .18s ease;box-shadow:0 1px 2px rgba(0,0,0,.18);}
.dcm-switch-on{background:var(--dsw-alias-label-primary);}
.dcm-switch-on .dcm-switch-knob{background:#fff;transform:translateX(18px);}
.dcm-presets{display:flex;gap:6px;flex-wrap:wrap;}
.dcm-preset{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);border-radius:999px;padding:2px 10px;font-size:11px;cursor:pointer;color:var(--dsw-alias-label-secondary);transition:all .12s ease;}
.dcm-preset:hover{color:var(--dsw-alias-label-primary);}
.dcm-preset-on{border-color:var(--dcm-accent);color:var(--dcm-accent);background:rgba(13,131,252,.08);}
`;

    /* ---------------- small components ---------------- */

    /** Modal confirm dialog (same overlay pattern as CreateDialog). */
    function ConfirmDialog({ t, file, busy, onConfirm, onClose }) {
      return h(
        "div",
        {
          className: "dcm-overlay",
          onMouseDown: (e) => {
            if (e.target === e.currentTarget) onClose();
          },
          onKeyDown: (e) => {
            if (e.key === "Escape") onClose();
          },
        },
        h(
          "div",
          { className: "dcm-dialog", role: "alertdialog", "aria-modal": true, style: { width: "min(460px,92vw)" } },
          h("div", { className: "dcm-dialog-title" }, t("action.delete")),
          h("div", { className: "dcm-sub", style: { whiteSpace: "pre-wrap", lineHeight: 1.6 } }, t("confirm.text", { file })),
          h(
            "div",
            { className: "dcm-actions" },
            h("button", { className: "dcm-btn dcm-btn-danger", disabled: busy, onClick: onConfirm }, t("action.confirmDelete")),
            h("button", { className: "dcm-btn", onClick: onClose }, t("action.cancel")),
          ),
        ),
      );
    }

    /** Sidebar panel icon (currentColor so it follows active/inactive nav state). */
    function PanelIcon(props) {
      const size = typeof props?.size === "number" ? props.size : 20;
      return h(
        "svg",
        { viewBox: "0 0 64 64", width: size, height: size, "aria-hidden": true, style: { display: "block" } },
        h("path", {
          d: "M32 16c-4.4-3.2-10.2-4.2-16-3v28c5.8-1.2 11.6-.2 16 3 4.4-3.2 10.2-4.2 16-3V13c-5.8-1.2-11.6-.2-16 3z",
          fill: "none",
          stroke: "currentColor",
          strokeWidth: 3.4,
          strokeLinejoin: "round",
        }),
        h("path", { d: "M32 16v28", stroke: "currentColor", strokeWidth: 2.8, strokeLinecap: "round" }),
        h("circle", { cx: 32, cy: 30, r: 3.6, fill: "currentColor" }),
        h("path", {
          d: "M32 22v3M32 35v3M25.4 30h3M35.6 30h3",
          stroke: "currentColor",
          strokeWidth: 2.4,
          strokeLinecap: "round",
        }),
      );
    }

    function FileRow({ file, active, onSelect }) {
      return h(
        "div",
        {
          className: "dcm-row" + (active ? " dcm-row-active" : ""),
          onClick: () => onSelect(file.name),
          role: "button",
          tabIndex: 0,
          onKeyDown: (e) => {
            if (e.key === "Enter" || e.key === " ") onSelect(file.name);
          },
        },
        h("span", { className: "dcm-row-name" }, file.name),
        h(
          "span",
          { className: "dcm-row-meta" },
          h("span", null, fmtBytes(file.bytes)),
          h("span", null, fmtTime(file.modified)),
           file.forced ? h("span", { className: "dcm-badge dcm-badge-force" }, "强制") : null,
        ),
        file.description ? h("span", { className: "dcm-row-desc" }, file.description) : null,
      );
    }

    function CreateDialog({ t, projectRef, onClose, onCreated }) {
      const [name, setName] = useState("");
      const [enforce, setEnforce] = useState(false);
      const [description, setDescription] = useState("");
      const [content, setContent] = useState("");
      const [busy, setBusy] = useState(false);
      const [error, setError] = useState("");
      const nameRef = useRef(null);
      useEffect(() => {
        try {
          if (nameRef.current) nameRef.current.focus();
        } catch {}
      }, []);

      const submit = async () => {
        if (busy || !name.trim()) return;
        setBusy(true);
        setError("");
        try {
          const data = await apiPost("/create", { project: projectRef?.current ?? "", name, enforce, description, content });
          onCreated(data.file);
        } catch (e) {
          setError(e?.message ?? String(e));
          setBusy(false);
        }
      };

      return h(
        "div",
        {
          className: "dcm-overlay",
          onMouseDown: (e) => {
            if (e.target === e.currentTarget) onClose();
          },
          onKeyDown: (e) => {
            if (e.key === "Escape") onClose();
          },
        },
        h(
          "div",
          { className: "dcm-dialog", role: "dialog", "aria-modal": true },
          h("div", { className: "dcm-dialog-title" }, t("create.title")),
          error ? h("div", { className: "dcm-banner" }, error) : null,
          h(
            "div",
            { className: "dcm-form" },
            h("label", null, t("create.name"), h("input", {
              ref: nameRef,
              className: "dcm-input",
              value: name,
              onChange: (e) => setName(e.target.value),
              placeholder: "prefer-div-over-semantic-tags",
              onKeyDown: (e) => {
                if (e.key === "Enter") submit();
              },
            })),
            h("label", { className: "dcm-check" },
              h("input", { type: "checkbox", checked: enforce, onChange: (e) => setEnforce(e.target.checked) }),
              h("span", null, "强制规则：每轮必须遵守并在最终答复前自检"),
            ),
            h("label", null, t("create.desc"), h("input", {
              className: "dcm-input",
              value: description,
              onChange: (e) => setDescription(e.target.value),
            })),
            h("label", null, t("create.content"), h("textarea", {
              className: "dcm-textarea",
              value: content,
              onChange: (e) => setContent(e.target.value),
              style: { minHeight: 160 },
              placeholder: "结论 / 约定 / Why / How to apply…",
              spellCheck: false,
            })),
          ),
          h(
            "div",
            { className: "dcm-actions" },
            h("button", { className: "dcm-btn dcm-btn-primary", disabled: busy || !name.trim(), onClick: submit }, busy ? t("state.saving") : t("create.submit")),
            h("button", { className: "dcm-btn", onClick: onClose }, t("action.cancel")),
          ),
        ),
      );
    }

    /* ---------------- main page ---------------- */

    function MemoryManager(props) {
      const t = makeT(props);
      const [projects, setProjects] = useState([]);
      const [detected, setDetected] = useState(""); // auto-detected project from live sessions
      const [project, setProject] = useState("");
      const [list, setList] = useState(null);
      const [selected, setSelected] = useState(null); // INDEX_VIEW | file name | null
      const [file, setFile] = useState(null); // enriched read result
      const [mode, setMode] = useState("view"); // view | edit
      const [draft, setDraft] = useState("");
      const [busy, setBusy] = useState(false);
      const [notice, setNotice] = useState("");
      const [error, setError] = useState("");
      const [confirming, setConfirming] = useState(false);
      const [creating, setCreating] = useState(false);
      const [query, setQuery] = useState("");
      const [sortBy, setSortBy] = useState("recent");
      const [check, setCheck] = useState(null);
      const slugRef = useRef("");

      const showError = useCallback((e) => {
        setError(e?.message ?? String(e));
        setNotice("");
      }, []);

      // Auto-dismiss success notices.
      useEffect(() => {
        if (!notice) return undefined;
        const timer = setTimeout(() => setNotice(""), 4000);
        return () => clearTimeout(timer);
      }, [notice]);

      const loadProjects = useCallback(async () => {
        try {
          const [projData, curData] = await Promise.all([
            apiGet("/projects"),
            apiGet("/current").catch(() => ({ project: null })),
          ]);
          const rows = projData.projects || [];
          setProjects(rows);
          setDetected(curData.project && rows.some((p) => p.slug === curData.project) ? curData.project : "");
          setProject((prev) => (prev && rows.some((p) => p.slug === prev) ? prev : (curData.project && rows.some((p) => p.slug === curData.project) ? curData.project : rows[0]?.slug ?? "")));
        } catch (e) {
          showError(e);
        }
      }, [showError]);

      const loadList = useCallback(async (slug) => {
        if (!slug) {
          setList(null);
          setCheck(null);
          return;
        }
        setBusy(true);
        setError("");
        try {
          const [data, chk] = await Promise.all([
            apiGet(`/list?project=${encodeURIComponent(slug)}`),
            apiGet(`/check?project=${encodeURIComponent(slug)}`).catch(() => null),
          ]);
          setList(data);
          const mismatch = (chk?.missingFiles?.length ?? 0) > 0 || (chk?.missingRows?.length ?? 0) > 0;
          setCheck(chk && (mismatch || chk.requiredPressure === true) ? { ...chk, mismatch } : null);
        } catch (e) {
          showError(e);
        } finally {
          setBusy(false);
        }
      }, [showError]);

      const repairIndex = useCallback(async () => {
        if (!slugRef.current) return;
        setBusy(true);
        setError("");
        try {
          const r = await apiPost(`/repair?project=${encodeURIComponent(slugRef.current)}`, {});
          setNotice(t("state.repaired", { removed: r.removed ?? 0, added: r.added ?? 0 }));
          await loadList(slugRef.current);
        } catch (e) {
          showError(e);
        } finally {
          setBusy(false);
        }
      }, [loadList, showError, t]);

      useEffect(() => {
        void loadProjects();
      }, [loadProjects]);

      useEffect(() => {
        slugRef.current = project;
        setSelected(null);
        setFile(null);
        setMode("view");
        setConfirming(false);
        setQuery("");
        void loadList(project);
      }, [project, loadList]);

      const openFile = useCallback(async (name) => {
        setSelected(name);
        setMode("view");
        setConfirming(false);
        setBusy(true);
        setError("");
        try {
          const data = await apiGet(`/read?project=${encodeURIComponent(slugRef.current)}&file=${encodeURIComponent(name)}`);
          setFile(data);
          setDraft(data.content);
        } catch (e) {
          showError(e);
          setFile(null);
        } finally {
          setBusy(false);
        }
      }, [showError]);

      const openIndex = useCallback(() => {
        if (!list) return;
        setSelected(INDEX_VIEW);
        setMode("view");
        setConfirming(false);
        setFile({
          ok: true,
          project: list.project,
          file: "MEMORY.md",
          content: list.index,
          body: list.index,
          meta: null,
          bytes: (list.files || []).find((f) => f.isIndex)?.bytes,
          modified: (list.files || []).find((f) => f.isIndex)?.modified,
          error: "",
        });
        setDraft(list.index);
      }, [list]);

      const saveDraft = useCallback(async () => {
        const name = selected === INDEX_VIEW ? "MEMORY.md" : selected;
        if (!name || !slugRef.current) return;
        setBusy(true);
        setError("");
        try {
          const r = await apiPost("/write", { project: slugRef.current, file: name, content: draft });
          const data = await apiGet(`/list?project=${encodeURIComponent(slugRef.current)}`);
          setList(data);
          setMode("view");
          setNotice(r.warning ? `${t("state.saved")}。${r.warning}` : t("state.saved"));
          if (selected === INDEX_VIEW) {
            setFile((prev) => ({ ...prev, content: data.index, body: data.index }));
            setDraft(data.index);
          } else {
            await openFile(name);
          }
        } catch (e) {
          showError(e);
        } finally {
          setBusy(false);
        }
      }, [draft, selected, openFile, showError, t]);

      const toggleEnforcement = useCallback(async () => {
        if (!selected || selected === INDEX_VIEW || !file || busy) return;
        const enabled = !String(file.meta?.["metadata.enforcement"] ?? file.meta?.enforcement ?? "").toLowerCase().match(/required|mandatory/);
        setBusy(true);
        setError("");
        try {
          await apiPost("/toggle-enforcement", { project: slugRef.current, file: selected, enabled });
          setNotice(t(enabled ? "state.enforcementOn" : "state.enforcementOff"));
          await loadList(slugRef.current);
          await openFile(selected);
        } catch (e) {
          showError(e);
        } finally {
          setBusy(false);
        }
      }, [selected, file, busy, loadList, openFile, showError, t]);

      const doDelete = useCallback(async () => {
        if (!selected || selected === INDEX_VIEW) return;
        setBusy(true);
        setError("");
        try {
          await apiPost("/delete", { project: slugRef.current, file: selected });
          setSelected(null);
          setFile(null);
          setMode("view");
          setConfirming(false);
          setNotice(t("state.deleted"));
          await loadList(slugRef.current);
        } catch (e) {
          showError(e);
        } finally {
          setBusy(false);
        }
      }, [selected, loadList, showError, t]);

      const refreshAll = useCallback(() => {
        void loadProjects().then(() => loadList(slugRef.current));
      }, [loadProjects, loadList]);

      const projectMeta = useMemo(() => projects.find((p) => p.slug === project) ?? null, [projects, project]);
      const isDetected = project !== "" && project === detected;
      const ordinaryFiles = useMemo(() => (list?.files ?? []).filter((f) => !f.isIndex), [list]);
      const hasIndex = (list?.files ?? []).some((f) => f.isIndex);

      const visibleFiles = useMemo(() => {
        const q = query.trim().toLowerCase();
        const filtered = q
          ? ordinaryFiles.filter(
              (f) =>
                f.name.toLowerCase().includes(q) ||
                String(f.title || "").toLowerCase().includes(q) ||
                String(f.description || "").toLowerCase().includes(q),
            )
          : ordinaryFiles;
        const rows = [...filtered];
        rows.sort(sortBy === "name" ? (a, b) => a.name.localeCompare(b.name) : (a, b) => String(b.modified || "").localeCompare(String(a.modified || "")));
        return rows;
      }, [ordinaryFiles, query, sortBy]);

      const metaEntries = useMemo(() => {
        const meta = file?.meta;
        if (!meta || typeof meta !== "object") return [];
        const rows = [];
        for (const key of ["name", "description", "originSessionId", "modified"]) {
          const value = meta[key] ?? (key === "modified" ? meta["metadata.modified"] : undefined);
          if (value !== undefined && String(value).trim() !== "") rows.push([key, String(value)]);
        }
        return rows;
      }, [file]);

      return h(
        "div",
        { className: "dcm-page" },
        h(
          "div",
          { className: "dcm-titlebar" },
          h("h3", { className: "dcm-title" }, t("page.title")),
          h("span", { className: "dcm-sub" }, t("page.desc")),
        ),
        h(
          "div",
          { className: "dcm-toolbar" },
          h("label", { className: "dcm-sub", htmlFor: "dcm-project-select" }, t("project.label")),
          h(
            "select",
            {
              id: "dcm-project-select",
              className: "dcm-select",
              value: project,
              onChange: (e) => setProject(e.target.value),
              style: { maxWidth: 460 },
            },
            projects.length === 0 ? h("option", { value: "" }, t("project.empty")) : null,
            projects.map((p) => h("option", { key: p.slug, value: p.slug }, `${p.path}（${p.count} 条）`)),
          ),
          isDetected ? h("span", { className: "dcm-badge dcm-badge-active" }, t("project.active")) : null,
          h("span", { className: "dcm-spacer" }),
          h("button", { className: "dcm-btn", onClick: refreshAll, title: t("action.refresh") }, t("action.refresh")),
          h("button", { className: "dcm-btn dcm-btn-primary", disabled: !project, onClick: () => setCreating(true) }, t("action.create")),
        ),
        projectMeta
          ? h(
              "div",
              { className: "dcm-toolbar" },
              h("span", { className: "dcm-sub" }, `${t("view.path")}: ${projectMeta.dir}`),
              projectMeta.lastModified
                ? h("span", { className: "dcm-sub" }, `· ${t("project.lastActive")}: ${fmtTime(projectMeta.lastModified)}`)
                : null,
            )
          : null,
        error ? h("div", { className: "dcm-banner" }, t("error.http", { message: error })) : null,
        notice ? h("div", { className: "dcm-banner dcm-banner-ok" }, notice) : null,
        check?.mismatch
          ? h(
              "div",
              { className: "dcm-banner dcm-banner-warn" },
              h("span", null, t("check.mismatch", { missing: check.missingFiles?.length ?? 0, extra: check.missingRows?.length ?? 0 })),
              h("button", { className: "dcm-btn dcm-btn-danger", disabled: busy, onClick: () => void repairIndex() }, t("action.repair")),
            )
          : null,
        check?.requiredPressure
          ? h("div", { className: "dcm-banner dcm-banner-warn" }, t("check.requiredPressure", { bytes: fmtBytes(check.requiredBytes ?? 0) }))
          : null,
        !project
          ? h(
              "div",
              { className: "dcm-empty" },
              h("div", null, t("project.empty")),
              h("div", { className: "dcm-sub", style: { maxWidth: 460 } }, t("project.emptyHint")),
            )
          : h(
              "div",
              { className: "dcm-body" },
              h(
                "div",
                { className: "dcm-side" },
                h(
                  "div",
                  { className: "dcm-side-head" },
                  h(
                    "div",
                    { className: "dcm-side-tools" },
                    h("input", {
                      className: "dcm-input",
                      value: query,
                      onChange: (e) => setQuery(e.target.value),
                      placeholder: t("list.search"),
                      "aria-label": t("list.search"),
                    }),
                    h(
                      "select",
                      { className: "dcm-select", value: sortBy, onChange: (e) => setSortBy(e.target.value), title: t("list.sort") },
                      h("option", { value: "recent" }, t("sort.recent")),
                      h("option", { value: "name" }, t("sort.name")),
                    ),
                  ),
                ),
                h(
                  "div",
                  { className: "dcm-list" },
                  hasIndex
                    ? h(
                        React.Fragment,
                        null,
                        h("div", { className: "dcm-group" }, t("list.index")),
                        h(
                          "div",
                          {
                            className: "dcm-row" + (selected === INDEX_VIEW ? " dcm-row-active" : ""),
                            onClick: openIndex,
                            role: "button",
                            tabIndex: 0,
                            onKeyDown: (e) => {
                              if (e.key === "Enter" || e.key === " ") openIndex();
                            },
                          },
                          h("span", { className: "dcm-row-name" }, "MEMORY.md"),
                          h("span", { className: "dcm-row-meta" }, t("list.indexFile")),
                        ),
                      )
                    : null,
                  h("div", { className: "dcm-group" }, `${t("list.memories")} · ${visibleFiles.length}`),
                  visibleFiles.length === 0 && ordinaryFiles.length > 0
                    ? h("div", { className: "dcm-sub", style: { padding: "4px 6px" } }, t("list.empty"))
                    : null,
                  visibleFiles.length === 0 && ordinaryFiles.length === 0 && !hasIndex
                    ? h("div", { className: "dcm-sub", style: { padding: "4px 6px" } }, t("list.emptyProject"))
                    : null,
                  visibleFiles.map((f) => h(FileRow, { key: f.name, file: f, active: selected === f.name, onSelect: openFile })),
                ),
              ),
              h(
                "div",
                { className: "dcm-main" },
                !selected
                  ? h(
                      "div",
                      { className: "dcm-empty" },
                      h("div", { className: "dcm-sub" }, projectMeta ? projectMeta.path : ""),
                      h("div", { className: "dcm-sub" }, ordinaryFiles.length > 0 ? t("list.memories") + " · " + ordinaryFiles.length : t("list.emptyProject")),
                    )
                  : mode === "edit"
                    ? h(
                        React.Fragment,
                        null,
                        h("div", { className: "dcm-detail-head" },
                          h("span", { className: "dcm-detail-name" }, selected === INDEX_VIEW ? "MEMORY.md" : selected),
                          h("span", { className: "dcm-sub" }, t("action.edit")),
                        ),
                        h("textarea", {
                          className: "dcm-textarea",
                          value: draft,
                          onChange: (e) => setDraft(e.target.value),
                          spellCheck: false,
                          onKeyDown: (e) => {
                            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
                              e.preventDefault();
                              void saveDraft();
                            }
                          },
                        }),
                        h("div", { className: "dcm-sub" }, t("editor.hint")),
                        h(
                          "div",
                          { className: "dcm-actions" },
                          h("button", { className: "dcm-btn dcm-btn-primary", disabled: busy, onClick: () => void saveDraft() }, busy ? t("state.saving") : t("action.save")),
                          h("span", { className: "dcm-kbd" }, t("action.saveHint")),
                          h("button", {
                            className: "dcm-btn",
                            onClick: () => {
                              setMode("view");
                              setDraft(file?.content ?? "");
                            },
                          }, t("action.cancel")),
                        ),
                      )
                    : h(
                        React.Fragment,
                        null,
                        h(
                          "div",
                          { className: "dcm-detail-head" },
                          h("span", { className: "dcm-detail-name" }, file?.file ?? selected),
                          file ? h("span", { className: "dcm-sub" }, `${fmtBytes(file.bytes)} · ${t("list.modified")} ${fmtTime(file.modified)}`) : null,
                          h("span", { className: "dcm-spacer" }),
                          h("button", { className: "dcm-btn", onClick: () => setMode("edit") }, t("action.edit")),
                          selected === INDEX_VIEW
                            ? null
                            : h("button", { className: "dcm-btn", disabled: busy, onClick: () => void toggleEnforcement() },
                               String(file?.meta?.["metadata.enforcement"] ?? file?.meta?.enforcement ?? "").toLowerCase().match(/required|mandatory/)
                                 ? t("action.forceOff")
                                 : t("action.forceOn")),
                           selected === INDEX_VIEW
                             ? null
                             : h("button", { className: "dcm-btn dcm-btn-danger", onClick: () => setConfirming(true) }, t("action.delete")),
                        ),
                        metaEntries.length > 0
                          ? h(
                              "div",
                              { className: "dcm-kv" },
                              metaEntries.flatMap(([k, v]) => [
                                h("span", { className: "dcm-kv-k", key: `k-${k}` }, k),
                                h("span", { className: "dcm-kv-v", key: `v-${k}` }, v),
                              ]),
                            )
                          : null,
                        h("pre", { className: "dcm-pre" }, file?.body !== undefined && file?.body !== null && file?.body !== "" ? file.body : (file?.content ?? "")),
                      ),
              ),
            ),
        confirming && selected && selected !== INDEX_VIEW
          ? h(ConfirmDialog, { t, file: selected, busy, onConfirm: () => void doDelete(), onClose: () => setConfirming(false) })
          : null,
        creating
          ? h(CreateDialog, {
              t,
              projectRef: slugRef,
              onClose: () => setCreating(false),
              onCreated: async (createdFile) => {
                setCreating(false);
                setNotice(t("state.created", { file: createdFile }));
                await loadList(slugRef.current);
                await openFile(createdFile);
              },
            })
          : null,
      );
    }

    /* ---------------- settings page (config) ---------------- */

    /** DSH-style settings row: label block on the left, switch on the right. */
    function SwitchRow({ checked, onChange, label, hint }) {
      return h(
        "div",
        { className: "dcm-fieldrow" },
        h(
          "div",
          { className: "dcm-fieldrow-main" },
          h("div", { className: "dcm-switchlabel" }, label),
          hint ? h("span", { className: "dcm-sub" }, hint) : null,
        ),
        h("button", {
          type: "button",
          className: "dcm-switch" + (checked ? " dcm-switch-on" : ""),
          role: "switch",
          "aria-checked": checked,
          "aria-label": label,
          onClick: () => onChange(!checked),
          onKeyDown: (e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onChange(!checked);
            }
          },
        }, h("span", { className: "dcm-switch-knob" })),
      );
    }

    function ConfigPage(props) {
      const t = makeT(props);
      const [cfgState, setCfgState] = useState(null); // effective config from host
      const [injection, setInjection] = useState(null); // live injection stats for the detected project
      const [writable, setWritable] = useState(false);
      const [draft, setDraft] = useState(null); // { autoInject, injectBytes, sectionOrder, enableTools }
      const [busy, setBusy] = useState(false);
      const [error, setError] = useState("");
      const [notice, setNotice] = useState("");

      const showError = useCallback((e) => {
        setError(e?.message ?? String(e));
        setNotice("");
      }, []);

      useEffect(() => {
        if (!notice) return undefined;
        const timer = setTimeout(() => setNotice(""), 4000);
        return () => clearTimeout(timer);
      }, [notice]);

      const loadConfig = useCallback(async () => {
        setError("");
        try {
          const [data, inj] = await Promise.all([
            apiGet("/config"),
            apiGet("/injection").catch(() => ({ injection: null })),
          ]);
          setCfgState(data.config);
          setWritable(data.writable === true);
          setInjection(inj.injection ?? null);
          setDraft({
            autoInject: data.config.autoInject === true,
            injectBytes: Number(data.config.injectBytes) || 6000,
            sectionOrder: Number(data.config.sectionOrder) || 400,
            enableTools: data.config.enableTools === true,
          });
        } catch (e) {
          showError(e);
        }
      }, [showError]);

      useEffect(() => {
        void loadConfig();
      }, [loadConfig]);

      const dirty = useMemo(() => {
        if (!cfgState || !draft) return false;
        return draft.autoInject !== (cfgState.autoInject === true)
          || Number(draft.injectBytes) !== Number(cfgState.injectBytes)
          || Number(draft.sectionOrder) !== Number(cfgState.sectionOrder)
          || draft.enableTools !== (cfgState.enableTools === true);
      }, [cfgState, draft]);

      const save = useCallback(async () => {
        if (busy || !draft) return;
        const bytes = Number(draft.injectBytes);
        const order = Number(draft.sectionOrder);
        if (!Number.isFinite(bytes) || bytes <= 0) {
          setError(t("cfg.invalidNumber"));
          return;
        }
        if (!Number.isFinite(order)) {
          setError(t("cfg.invalidNumber"));
          return;
        }
        setBusy(true);
        setError("");
        try {
          await apiPost("/config", {
            autoInject: draft.autoInject,
            injectBytes: bytes,
            sectionOrder: order,
            enableTools: draft.enableTools,
          });
          setNotice(t("cfg.saved"));
          // The plugin restarts on config change; re-read the effective values.
          setTimeout(() => void loadConfig(), 900);
        } catch (e) {
          showError(e);
        } finally {
          setBusy(false);
        }
      }, [busy, draft, loadConfig, showError, t]);

      if (!draft) {
        return h("div", { className: "dcm-page" }, h("div", { className: "dcm-sub" }, error || t("state.loading")));
      }

      const presets = [6000, 10000, 15000, 20000, 30000];

      return h(
        "div",
        { className: "dcm-page" },
        h(
          "div",
          { className: "dcm-titlebar" },
          h("h3", { className: "dcm-title" }, t("cfg.title")),
          h("span", { className: "dcm-sub" }, t("page.desc")),
        ),
        error ? h("div", { className: "dcm-banner" }, t("error.http", { message: error })) : null,
        notice ? h("div", { className: "dcm-banner dcm-banner-ok" }, notice) : null,
        !writable ? h("div", { className: "dcm-banner dcm-banner-warn" }, t("cfg.notWritable")) : null,
        h(
          "div",
          { className: "dcm-card" },
          h("div", { className: "dcm-card-title" }, t("cfg.injectSection")),
            h(SwitchRow, { checked: draft.autoInject, onChange: (v) => setDraft((d) => ({ ...d, autoInject: v })), label: t("cfg.autoInject"), hint: t("cfg.autoInjectHint") }),
          h(
            "div",
            { className: "dcm-fieldrow" },
            h(
              "div",
              { className: "dcm-fieldrow-main" },
              h("span", { className: "dcm-sub" }, t("cfg.injectBytes")),
              h("input", {
                className: "dcm-input",
                type: "number",
                min: 500,
                max: 60000,
                step: 500,
                value: draft.injectBytes,
                onChange: (e) => setDraft((d) => ({ ...d, injectBytes: e.target.value })),
                style: { maxWidth: 160 },
                disabled: !draft.autoInject,
                "aria-label": t("cfg.injectBytes"),
              }),
              h(
                "div",
                { className: "dcm-presets" },
                presets.map((p) =>
                  h("button", {
                    key: p,
                    type: "button",
                    className: "dcm-preset" + (Number(draft.injectBytes) === p ? " dcm-preset-on" : ""),
                    disabled: !draft.autoInject,
                    onClick: () => setDraft((d) => ({ ...d, injectBytes: p })),
                  }, `${p}`),
                ),
              ),
              h("span", { className: "dcm-sub" }, t("cfg.injectBytesHint")),
            ),
          ),
          draft.autoInject && injection
            ? h(
                "div",
                { className: "dcm-fieldrow" },
                h(
                  "div",
                  { className: "dcm-fieldrow-main" },
                  h("span", { className: "dcm-sub" }, t("cfg.injectUsage", { full: fmtBytes(injection.fullBytes), budget: String(injection.budgetBytes) })),
                  injection.truncated
                    ? h("span", { className: "dcm-sub", style: { color: "var(--dsw-alias-state-warn-primary)" } }, t("cfg.injectTruncated", { injected: fmtBytes(injection.injectedBytes) }))
                    : h("span", { className: "dcm-sub" }, t("cfg.injectFit")),
                ),
              )
            : null,
          h(
            "div",
            { className: "dcm-fieldrow" },
            h(
              "div",
              { className: "dcm-fieldrow-main" },
              h("span", { className: "dcm-sub" }, t("cfg.sectionOrder")),
              h("input", {
                className: "dcm-input",
                type: "number",
                step: 50,
                value: draft.sectionOrder,
                onChange: (e) => setDraft((d) => ({ ...d, sectionOrder: e.target.value })),
                style: { maxWidth: 160 },
                "aria-label": t("cfg.sectionOrder"),
              }),
              h("span", { className: "dcm-sub" }, t("cfg.sectionOrderHint")),
            ),
          ),
        ),
        h(
          "div",
          { className: "dcm-card" },
          h("div", { className: "dcm-card-title" }, t("cfg.toolsSection")),
          h(SwitchRow, { checked: draft.enableTools, onChange: (v) => setDraft((d) => ({ ...d, enableTools: v })), label: t("cfg.enableTools"), hint: t("cfg.enableToolsHint") }),
        ),
        cfgState
          ? h(
              "div",
              { className: "dcm-card" },
              h("div", { className: "dcm-card-title" }, t("cfg.infoSection")),
              h("div", { className: "dcm-kv" },
                h("span", { className: "dcm-kv-k" }, "dshHome"),
                h("span", { className: "dcm-kv-v" }, cfgState.dshHome),
                h("span", { className: "dcm-kv-k" }, "indexName"),
                h("span", { className: "dcm-kv-v" }, cfgState.indexName),
              ),
            )
          : null,
        h(
          "div",
          { className: "dcm-actions" },
          h("button", { className: "dcm-btn dcm-btn-primary", disabled: !writable || busy || !dirty, onClick: () => void save() }, busy ? t("state.saving") : t("cfg.save")),
          dirty ? h("span", { className: "dcm-sub" }, "●") : null,
        ),
      );
    }

    /* ---------------- plugin registration ---------------- */

    function apply(ctx) {
      try {
        const cur = ctx?.locale?.current ?? ctx?.locale?.locale ?? ctx?.locale?.language;
        if (typeof cur === "string" && !cur.toLowerCase().startsWith("zh")) activeLang = "en";
      } catch {
        activeLang = "zh";
      }

      ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dsh-lk-memory: dictionaries");

      ctx.effect(() => {
        const tag = document.createElement("style");
        tag.dataset.plugin = "dsh-lk-memory";
        tag.dataset.pluginCss = "dsh-lk-memory/page";
        tag.textContent = CSS;
        document.head.appendChild(tag);
        return () => {
          tag.remove();
        };
      }, "dsh-lk-memory: stylesheet");

      const bundleConfigCard = (ownerProps = {}) =>
        ownerProps?.view === "summary" ? null : h(ConfigPage, ownerProps);

      ctx.slots.inject("plugins.bundle.config", () =>
        ctx.slots.register({
          name: "plugins.bundle.config",
          id: "dsh-lk-memory-config",
          key: "dsh-lk-memory",
          locale: NS,
        }, bundleConfigCard),
      );

      // Sidebar entry + full-width central panel (same pattern as dsh-context):
      // the panellist icon's id must equal the main slot's key; the shell
      // switches the central panel by that id when the icon is clicked.
      ctx.slots.inject("sidebar.panellist", () =>
        ctx.slots.register({
          name: "sidebar.panellist",
          id: "dsh-lk-memory",
          order: 25,
          label: () => tr("nav.title"),
          locale: NS,
        }, PanelIcon),
      );

      ctx.slots.inject("main", () =>
        ctx.slots.register({
          name: "main",
          key: "dsh-lk-memory",
          locale: NS,
        }, (ownerProps = {}) => h("div", { className: "dcm-fullpage" }, h(MemoryManager, ownerProps))),
      );

      ctx.slots.inject("settings.section", () =>
        ctx.slots.register({
          name: "settings.section",
          id: "dsh-lk-memory",
          order: 900,
          label: () => tr("nav.title"),
          locale: NS,
        }, ConfigPage),
      );
    }

    return { inject: ["slots", "locale"], apply };
  },
});
