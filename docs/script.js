(() => {
  // 每次进入页面（含刷新）都从顶部开始，不用浏览器记住的滚动位置。
  try { if ("scrollRestoration" in history) history.scrollRestoration = "manual"; } catch {}
  window.scrollTo(0, 0);

  const dict = {
    en: {
      "nav.features": "Features", "nav.flow": "How it works", "nav.changelog": "Changelog",
      "hero.eyebrow": "A memory plugin for DeepSeek Harness", "hero.title": "Your project's memory,<br><em>stored in DSH.</em>",
      "hero.text": "dsh-lk-memory saves each project's conventions, decisions, and lessons to the local DSH memory directory, and injects the relevant part into every session.",
      "hero.github": "View source", "hero.install": "Install",
      "memory.one": "Code style: clear, concise, maintainable", "memory.two": "Source and git layout", "memory.three": "Keep all four language packs in sync", "memory.status": "3 memories loaded · 2.4 KB injected",
      "features.eyebrow": "Features", "features.title": "Turn project knowledge<br><em>into session context.</em>",
      "feature.one.title": "Automatic injection", "feature.one.text": "At session start, the project memory index goes into the system prompt. Memories marked as required are placed first, in full.",
      "feature.two.title": "Visual management", "feature.two.text": "Search, edit, create, and delete memories in the DSH panel. Repair a mismatched index with one click.",
      "feature.three.title": "Safe by default", "feature.three.text": "Only Markdown files inside the memory directory can be touched. Stale index rows are filtered, and writes need confirmation.",
      "feature.four.title": "DSH only", "feature.four.text": "All data lives under <code>~/.dsh/memory</code>. The plugin reads and writes nothing outside DSH.",
      "flow.eyebrow": "How it works", "flow.title": "Three steps:<br><em>write, resolve, inject.</em>",
      "flow.one.title": "Write", "flow.one.text": "Save a convention or decision as a Markdown memory. Mark it <code>enforcement: required</code> if it must always apply.",
      "flow.two.title": "Resolve", "flow.two.text": "DSH finds the project memory directory from the session working directory.",
      "flow.three.title": "Inject", "flow.three.text": "The index and required rules become part of the system prompt for the next turn.",
      "install.eyebrow": "Install", "install.title": "One command.", "install.cli": "Once published, install it with the DSH plugin manager or from the Community Market.", "install.source": "Or clone the source and pack it locally for development.",
      "cta.eyebrow": "Changelog", "cta.title": "It keeps improving —<br><em>every change is logged.</em>", "cta.button": "Read the changelog",
      "log.eyebrow": "Changelog", "log.title": "Every change,<br><em>on the record.</em>", "log.intro": "What changed in dsh-lk-memory, and why.", "log.release.title": "First public release", "log.release.intro": "Memory injection, a management panel, and four DSH memory tools.", "log.added": "Added", "log.changed": "Changed", "log.item.one": "Project memory index injection into the system prompt.", "log.item.two": "Management panel: search, edit, create, delete, repair index.", "log.item.three": "Four tools: dsh_memory_list / read / write / forget.", "log.item.four": "Removed the old type taxonomy; only enforcement rules remain.", "log.item.five": "Reads and writes the DSH memory directory only.", "log.item.six": "Added bilingual docs and this website.", "log.next.eyebrow": "Next", "log.next.title": "Have an idea?<br><em>Open an issue.</em>", "log.next.button": "Suggest one"
    },
    zh: {
      "nav.features": "功能", "nav.flow": "工作方式", "nav.changelog": "更新日志",
      "hero.eyebrow": "DeepSeek Harness 记忆插件", "hero.title": "项目的约定和决策，<br><em>都记在 DSH 里。</em>",
      "hero.text": "dsh-lk-memory 把每个项目的约定、决策和经验保存到本地 DSH 记忆目录，并在每次会话自动注入相关内容。",
      "hero.github": "查看源码", "hero.install": "安装方式",
      "memory.one": "代码风格：清晰、简洁、可维护", "memory.two": "源码与 Git 目录结构", "memory.three": "四种语言包必须同步维护", "memory.status": "已加载 3 条记忆 · 注入 2.4 KB",
      "features.eyebrow": "功能", "features.title": "把项目知识<br><em>变成会话上下文。</em>",
      "feature.one.title": "自动注入", "feature.one.text": "会话开始时，项目记忆索引自动进入 system prompt；标记为强制规则的记忆整段置顶。",
      "feature.two.title": "可视化管理", "feature.two.text": "在 DSH 记忆面板里搜索、编辑、新建、删除记忆，索引不一致时一键修复。",
      "feature.three.title": "默认安全", "feature.three.text": "只允许读写记忆目录内的 Markdown 文件，失效索引行自动过滤，写入前需要确认。",
      "feature.four.title": "只用 DSH", "feature.four.text": "所有数据都在 <code>~/.dsh/memory</code> 下，不读写 DSH 之外的任何目录。",
      "flow.eyebrow": "工作方式", "flow.title": "三步：<br><em>写入、定位、注入。</em>",
      "flow.one.title": "写入", "flow.one.text": "把约定和决策保存成 Markdown 记忆，必须始终生效的可以标记 <code>enforcement: required</code>。",
      "flow.two.title": "定位", "flow.two.text": "DSH 根据会话工作目录找到对应项目的记忆目录。",
      "flow.three.title": "注入", "flow.three.text": "索引和强制规则成为 system prompt 的一部分，下一轮会话即可使用。",
      "install.eyebrow": "安装", "install.title": "一条命令。", "install.cli": "发布到 npm 后，用 DSH 插件管理器或 Community Market 安装。", "install.source": "也可以克隆源码本地打包，适合开发调试。",
      "cta.eyebrow": "更新日志", "cta.title": "功能持续更新，<br><em>变化都记在日志里。</em>", "cta.button": "查看更新日志",
      "log.eyebrow": "更新记录", "log.title": "每次改动，<br><em>都有记录。</em>", "log.intro": "dsh-lk-memory 的版本变化，以及变化的原因。", "log.release.title": "首个公开版本", "log.release.intro": "包含记忆注入、管理面板和四个 DSH 记忆工具。", "log.added": "新增", "log.changed": "调整", "log.item.one": "项目记忆索引注入 system prompt。", "log.item.two": "管理面板：搜索、编辑、新建、删除、修复索引。", "log.item.three": "四个工具：dsh_memory_list / read / write / forget。", "log.item.four": "移除旧的类型分类，只保留强制规则。", "log.item.five": "只读写 DSH 记忆目录。", "log.item.six": "新增中英文文档和官网。", "log.next.eyebrow": "下一步", "log.next.title": "有想法？<br><em>欢迎提 issue。</em>", "log.next.button": "去提个建议"
    }
  };

  const root = document.documentElement;
  const applyLang = (lang) => {
    const active = lang === "en" ? "en" : "zh";
    root.lang = active === "zh" ? "zh-CN" : "en";
    document.querySelectorAll("[data-i18n]").forEach((node) => {
      const value = dict[active][node.dataset.i18n];
      if (value) node.innerHTML = value;
    });
    const toggle = document.querySelector(".lang-switch");
    if (toggle) { toggle.textContent = active === "zh" ? "EN" : "中文"; toggle.dataset.lang = active === "zh" ? "en" : "zh"; }
    localStorage.setItem("dsh-lk-memory-lang", active);
  };
  document.querySelector(".lang-switch")?.addEventListener("click", (event) => applyLang(event.currentTarget.dataset.lang));
  applyLang(localStorage.getItem("dsh-lk-memory-lang") || "zh");

  const menu = document.querySelector(".menu-button");
  const links = document.querySelector(".nav-links");
  menu?.addEventListener("click", () => { const open = links.classList.toggle("open"); menu.setAttribute("aria-expanded", String(open)); });
  links?.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => { links.classList.remove("open"); menu?.setAttribute("aria-expanded", "false"); }));

  const observer = new IntersectionObserver((entries) => entries.forEach((entry) => { if (entry.isIntersecting) observer.unobserve(entry.target); entry.target.classList.toggle("visible", entry.isIntersecting); }), { threshold: .12 });
  document.querySelectorAll(".reveal").forEach((node) => observer.observe(node));

  const glow = document.querySelector(".cursor-glow");
  window.addEventListener("pointermove", (event) => { if (glow) { glow.style.left = `${event.clientX}px`; glow.style.top = `${event.clientY}px`; } });
  document.querySelectorAll(".tilt").forEach((card) => {
    card.addEventListener("pointermove", (event) => { const r = card.getBoundingClientRect(); const x = (event.clientX - r.left) / r.width - .5; const y = (event.clientY - r.top) / r.height - .5; card.style.transform = `perspective(900px) rotateY(${x * 8 - 5}deg) rotateX(${-y * 6 + 2}deg)`; });
    card.addEventListener("pointerleave", () => { card.style.transform = "perspective(900px) rotateY(-5deg) rotateX(2deg)"; });
  });

  const memories = [...document.querySelectorAll(".memory-item")];
  let selected = 0;
  if (memories.length > 1) window.setInterval(() => { memories[selected]?.classList.remove("selected"); selected = (selected + 1) % memories.length; memories[selected]?.classList.add("selected"); }, 2200);
  const progress = document.querySelector(".progress");
  if (progress) window.addEventListener("scroll", () => { const max = document.documentElement.scrollHeight - window.innerHeight; progress.style.width = `${max ? (window.scrollY / max) * 100 : 0}%`; }, { passive: true });
})();
