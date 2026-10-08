# PRD — 上帝之国（Einmal ist keinmal）后端化重构

| 项目 | 内容 |
|---|---|
| 文档版本 | v1.1 |
| 日期 | 2026-10-08 |
| 状态 | v1.0 已实现（详见 README.md 的「快速开始」与「接口」两节）；v1.1 增补 §14 每日音乐 |
| 适用范围 | 现有静态单页站点 `index.html` 的重构与后端接口建设；§14 为增量功能 |
| 关联仓库 | `d:\Desktop\Gods Country`（git 已初始化，基线提交 `272cb75`） |

> **v1.1 变更**：新增 §14「每日音乐（Daily · music）」，并在 §12 追加 AD-9～AD-12。
> §1～§13 的正文与验收标准一律不变，本节不与 v1.0 的「视觉零变化」目标冲突——
> 音乐是**新增**能力，不改动既有任何区域的外观与行为。

---

## 1. 背景与问题

当前站点是一个**纯静态单文件**页面 `index.html`（1656 行），CSS、HTML、JS 全部内联，所有内容硬编码：

- 首页文章区只有一篇《创刊号》，正文以 HTML 字符串写死在模板里；
- 档案馆是写死的 2026 年 12 个月份格子，仅 10 月有 1 条条目；
- 留言板**没有存储、没有后端**，代码注释明确写着"提交后把留言插到墙上，刷新即清空"（`index.html:1453-1454`）；
- 图片上传走 `URL.createObjectURL`，离开页面即失效；
- 「投稿」是指向 `#submit` 的占位锚点（`index.html:1324-1326`），无实际功能。

带来的问题：

1. **无法持续运营。** 每发一篇文章都要手改 HTML、手工维护档案馆月份格子的 `has-posts` 类和条目列表，任一处理漏都会导致月份不可展开。
2. **内容会丢。** 留言仅存在于当前页面的 DOM 里，刷新即消失，用户产出零留存。
3. **单文件不可维护。** 1656 行里 CSS 占 1230 行，样式与结构、脚本混在一起，改动容易相互踩踏（`lessons.md` 中已多次记录"CSS 与 DOM 不同步"导致的返工）。
4. **没有管理入口。** 一切内容变更都要经过改代码 + 重新部署。

## 2. 目标与非目标

### 2.1 目标

| 编号 | 目标 | 判定标准 |
|---|---|---|
| G1 | **引入后端服务，把内容与交互从硬编码中解放出来** | 文章的增删改查、档案馆条目的增删改，均可在 `/admin` 完成，无需改代码 |
| G2 | **留言板真正持久化**（含图片） | 提交后刷新浏览器、重启服务、换设备访问，留言与图片仍在 |
| G3 | **前端显示与交互零变化** | 见 §9「视觉等价性验收标准」，须逐条通过 |
| G4 | **项目结构可维护** | 单文件拆为 `index.ejs` + `site.css` + `site.js`，各自职责单一 |

### 2.2 非目标（本期明确不做）

- 不做用户注册 / 登录体系（留言板保持匿名 + 昵称）。
- 不做留言审核、敏感词、限流等运营风控（单机小站，超出当前需要）。
- 不做投稿入库：投稿按决策改为邮件（见 FR-4）。
- 不做评论回复、点赞、分页无限滚动。
- 不引入前端构建工具（Webpack/Vite）、不引入前端框架（React/Vue）。
- 不改动视觉设计：配色、字体、间距、动效一律保持现状。

## 3. 用户角色

| 角色 | 说明 | 主要诉求 |
|---|---|---|
| 访客 | 任何人，无需登录 | 阅读文章、翻阅档案馆、留言 |
| 编辑（站点主人） | 持有管理口令的单一用户 | 发布/编辑/删除文章，维护档案馆，删除不当留言 |

## 4. 功能需求

### FR-1 首页服务端渲染（SSR）

- `GET /` 返回**已包含全部内容**的 HTML，浏览器首屏即为完整页面，不存在"先空白后填充"的加载空窗。
- 页面渲染所需的文章列表、档案馆结构、留言列表首批数据均在服务端查询并注入模板。
- 首页对访客**只读**。

### FR-2 文章

- 首页文章区按 `sort_order` 升序（同序按发布时间倒序）展示全部已发布文章。
- 每篇文章包含：标题、作者行（形如 `— 编辑部`）、元信息行（形如 `2026.10.05 · 发刊词`）、摘要段落、全文段落（含 `<br>` 换行）。
- 交互保持现状：**点击整张卡片**切换 `.expanded`，箭头方向由 CSS 状态控制。折叠时只显示摘要，展开时显示全文。
- 标题与摘要/全文的字号沿用现内联值（标题 `25px`、摘要与全文 `18px`），由模板原样输出。

### FR-3 档案馆

- 结构：`年份组 → 12 个月份格子 → 点击月份格子在下方面板展开该月条目`。
- **恒定渲染 1–12 月全部格子**，某月存在条目时该格子追加 `has-posts` 类；无条目的月份格子点击无响应（现行为）。
- 月份面板（`.month-posts-panel`）初始内容为该年中**最新一个有内容的月份**的条目列表，初始不带 `open`。（此点与现状逐字段对齐；面板初始不可见，不影响观感。）
- **最新的年份组默认展开**：由服务端直接输出 `open` 类，不再依赖前端脚本在解析期补 class。
- 保留现有交互时序：悬停停留 `900ms` 才展开、同一时刻最多展开一年、先收旧再开新（`600ms`）、点击年份行/月份网格/面板以外的区域收回。
- 年份组按年份**倒序**输出（最新在上）。

### FR-4 投稿（改为邮件）

- 「投稿」入口的 `href` 由 `#submit` 改为 `mailto:afterrainnn@outlook.com`。
- 不新增表单、不新增接口、不建投稿表。点击后由操作系统唤起默认邮件客户端。
- 视觉零变化（仍是 `.footer-submit` 那一行文字与箭头）。

### FR-5 留言板

- **读取**：页面加载时由服务端渲染出首批留言（最新在前，默认上限 50 条），使 JS 失效时历史留言依然可见。
- **发布**：提交表单 → `POST /api/guestbook`（multipart）→ 成功后把新留言 **prepend** 到留言墙顶部。
- 单条留言渲染顺序与现有一致：头行（昵称 + `YYYY.MM.DD` 日期）→ 正文段落（有则渲染）→ 图片（有则渲染）。
- 空态：留言墙无数据时显示 `<p class="guest-wall-empty">还没有留言</p>`；有数据则不渲染该节点。
- 昵称留空显示为 `匿名`；正文与图片**至少填一样**才允许提交（现行为）。
- 图片：选择文件后本地即时预览（保持 `URL.createObjectURL`，不改）；提交时随表单一并上传。
- 校验失败时前端给出提示且不清空表单。

### FR-6 管理页 `/admin`

- **登录**：口令登录（`POST /admin/login`），口令取自环境变量 `ADMIN_PASSWORD`。成功后下发 `httpOnly` + `sameSite=lax` + HMAC-SHA256 签名 Cookie。
- 未登录访问 `/admin` 或任何管理接口 → 跳转登录 / 返回 `401`。
- **留言管理**：列表（含缩略图、时间、正文）、单条删除。
- **文章管理**：新建、编辑、删除。字段同 §5 数据模型。
- **档案馆管理**：为指定「年 + 月」添加条目（从已有文章中选择或直接填写标题与日期）、删除条目。
- **设计风格延续**：复用主站的 CSS 变量（配色、字体族）、卡片圆角、悬停反色与 `.jitter-char` 拆字节奏；不引入新的视觉语言。管理页为独立页面，与主站互不干扰。

## 5. 数据模型

数据库：SQLite（文件置于 `data/gods-country.db`），驱动使用 **Node 24 内置 `node:sqlite`**（实测 `Buffer ↔ Uint8Array` 往返正常，无原生编译依赖）。开启 WAL 模式。

```sql
CREATE TABLE articles (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  slug          TEXT    NOT NULL UNIQUE,   -- URL 友好标识
  title         TEXT    NOT NULL,
  author        TEXT    NOT NULL,          -- 不含前缀 "— "，模板负责拼接
  published_at  TEXT    NOT NULL,          -- 'YYYY-MM-DD'
  category      TEXT,                      -- 如 '发刊词'，可为空
  excerpt       TEXT    NOT NULL,          -- 摘要（纯文本）
  content       TEXT    NOT NULL,          -- 全文（HTML，含 <br>）
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT    NOT NULL           -- ISO 8601
);

CREATE TABLE archive_entries (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  year        INTEGER NOT NULL,
  month       INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  article_id  INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  UNIQUE (year, month, article_id)
);

CREATE TABLE guestbook (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT,                       -- 空值渲染为「匿名」
  body         TEXT,
  image        BLOB,                       -- 可空
  image_mime   TEXT,
  image_bytes  INTEGER,
  created_at   TEXT NOT NULL
);
```

**首启 seed**：服务启动时若 `articles` 为空，自动导入现有硬编码内容——《创刊号》全文（含 `<br><br>` 与原摘要）与 2026 年 10 月条目，使重构后页面与现状一字不差。seed 脚本同时说明各字段来源。

## 6. 接口设计

### 6.1 公开接口

| 方法 | 路径 | 请求 | 响应 |
|---|---|---|---|
| GET | `/` | — | SSR HTML（`text/html`） |
| GET | `/api/articles` | — | `[{id, slug, title, author, publishedAt, category, excerpt, content}]` |
| GET | `/api/articles/:slug` | — | 单篇；不存在 `404` |
| GET | `/api/archive` | — | `[{year, months:[{month, hasPosts, posts:[{id, title, date, href}]}]}]`，年份倒序 |
| GET | `/api/guestbook` | `?limit` `?before` | `{items:[{id, name, body, date, imageUrl}]}`，最新在前 |
| POST | `/api/guestbook` | multipart：`name` `body` `image` | `201` + 单条 JSON；校验失败 `400` |
| GET | `/api/guestbook/:id/image` | — | 图片二进制流；无图 `404` |

### 6.2 管理接口（均需登录）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/admin/login` | body：`password`；成功 `204` + `Set-Cookie` |
| POST | `/admin/logout` | 清除 Cookie |
| GET | `/admin` | 管理页 HTML（未登录跳登录视图） |
| DELETE | `/api/guestbook/:id` | 删除留言及其图片（管理页列表复用公开的 `GET /api/guestbook`，通过 `limit` 取更多） |
| POST | `/api/articles` | 新建文章 |
| PUT | `/api/articles/:id` | 更新文章 |
| DELETE | `/api/articles/:id` | 删除文章（级联删除档案馆条目） |
| POST | `/api/archive` | 新增档案馆条目 |
| DELETE | `/api/archive/:id` | 删除档案馆条目 |

### 6.3 校验规则（系统边界）

| 字段 | 规则 | 违规响应 |
|---|---|---|
| `name` | ≤ 24 字符，可空 | `400` |
| `body` | ≤ 500 字符，可空（与 image 至少一项非空） | `400` |
| `image` | ≤ 5 MB；MIME 白名单 `image/png`、`image/jpeg`、`image/gif`、`image/webp` | `400` |
| `text`（文章） | 标题 ≤ 100 字，摘要 ≤ 1000 字，全文 ≤ 20000 字 | `400` |
| `year` / `month` | 1900–2999 / 1–12 | `400` |
| 口令 | 与环境变量等值比较，使用定长比较防时序侧信道 | `401` |

### 6.4 图片响应头

`Content-Type` 取白名单内的 `image_mime`；附 `Cache-Control: public, max-age=31536000, immutable`（id 对应的图片内容不可变）。

## 7. 目录结构

```
Gods Country/
├─ package.json                 # type: module；scripts: start / seed
├─ PRD.md                       # 本文档
├─ lessons.md
├─ .gitignore                   # node_modules / data/*.db
├─ data/gods-country.db         # SQLite 数据文件（不入库）
├─ server/
│  ├─ app.js                    # 装配：静态目录、视图引擎、路由、错误处理
│  ├─ db.js                     # 连接、WAL、建表、seed 触发
│  ├─ seed.js                   # 现有硬编码内容导入
│  ├─ auth.js                   # 口令校验 + 签名 Cookie 中间件
│  ├─ validators.js             # §6.3 校验规则集合
│  ├─ routes/
│  │  ├─ pages.js               # GET / 、/admin、登录登出
│  │  ├─ guestbook.js           # 留言读写 + 图片流
│  │  └─ content.js             # 文章 / 档案馆 JSON + CRUD
│  ├─ views/
│  │  ├─ index.ejs              # 由现 index.html 的 <body> 迁入
│  │  ├─ admin.ejs
│  │  └─ partials/
│  └─ public/
│     ├─ css/site.css           # 现 <style> 原文迁出
│     ├─ css/admin.css          # 新增，复用 site.css 的设计变量
│     ├─ js/site.js             # 现 <script> 迁出 + 留言板接后端
│     ├─ js/admin.js
│     ├─ img/795.jpg, logo.png
│     └─ fonts/…                # 4 套字体目录
├─ index.legacy.html            # 旧单文件页（回滚参照，验收后由用户决定去留）
└─ All_Web_Demo.html 等未引用文件保持原位不动
```

## 8. 非功能需求

| 编号 | 需求 | 说明 |
|---|---|---|
| NFR-1 | **视觉零变化** | §9 全部通过 |
| NFR-2 | 依赖最小化 | 直接依赖仅 `express`、`ejs`、`multer`；数据库、加密、静态托管用 Node 内置 |
| NFR-3 | 启动简单 | `npm install && npm start` → `http://localhost:3000`；端口可用 `PORT` 覆盖 |
| NFR-4 | 安全 | 口令不落库不落日志；Cookie 签名；留言渲染走 `textContent`；上传走 MIME + 体积白名单 |
| NFR-5 | 无前端构建 | 脚本以普通 `<script src>` 加载，无打包 / 编译 / 转译步骤 |
| NFR-6 | 抗 JS 失效 | 文章、档案馆、历史留言均由 SSR 输出，禁用 JS 仍可阅读 |

## 9. 视觉等价性验收标准

重构完成的判定条件是**下列证据全部通过**，而不是"看起来差不多"：

### 9.1 截图比对（人工/自动化）

对以下四个状态，重构前后在**相同窗口尺寸**下截图并逐张比对：

1. 首屏（未滚动）
2. 首页文章卡片展开后
3. 档案馆悬停展开 + 点击 10 月格子后面板展开
4. 页脚「留言板」展开（空态）

允许差异：仅留言区内容（因持久化后历史留言可见，属预期功能变化）。

### 9.2 DOM 结构 diff（客观证据）

将 SSR 输出的 `<body>` 与 `index.legacy.html` 的 `<body>`规范化后（去空白、归一化 URL）做结构比对。**仅允许**以下三类差异，出现第 4 类即判定为回归：

| 允许的差异 | 原因 |
|---|---|
| 留言墙节点内容 | 持久化后由数据库驱动 |
| 月份面板 `.month-posts-panel` 初始内容 | 由数据生成，结构与原一致 |
| 字体 / 图片资源 URL 前缀 | 资源迁入 `server/public/` |

### 9.3 逐条技术保证

| 风险 | 对策 |
|---|---|
| 外置 CSS 造成闪白 | `<link rel="stylesheet">` 置于 `<head>`，同步阻塞渲染；`font-display: swap` 原样保留 |
| 内联字号丢失导致展开前后跳变 | 模板照原样输出 `style="font-size: 25px"` / `style="font-size: 18px"`，**不搬进 CSS**，避免优先级变化 |
| 默认展开的年份多出动画 | `open` 类由 SSR 直出，属首次绘制内容，不会触发 `max-height` 过渡；同时删除原 JS 中补 class 的代码块 |
| 拆字脚本执行时机变化 | `site.js` 仍置于 `</body>` 前、同步执行，不加 `defer` |
| `background-attachment: fixed` 对齐被破坏 | `.hero` 及其子元素不得新增 `filter` / `transform` / `will-change`（会创建新的包含块） |

## 10. 里程碑与交付物

| 阶段 | 交付物 | 完成判据 |
|---|---|---|
| M1 基线 | 重构前四态截图 + `index.legacy.html` | 截图存档 |
| M2 服务端骨架 | `db.js` / `seed.js` / `app.js` / `package.json` | `npm start` 起来，`/api/articles` 返回 seed 内容 |
| M3 首页 SSR | `index.ejs` + `site.css` + `site.js` | §9.2 DOM diff 仅三类允许差异 |
| M4 留言板接口化 | `routes/guestbook.js` + 前端对接 | 提交后刷新仍在，图片可访问；空态正确 |
| M5 管理页 | `admin.ejs` + `admin.js` + 认证 | 未登录被挡；三类内容可增删改 |
| M6 验收与存档 | 截图比对报告 + git commit | 用户确认通过后提交 |

## 11. 风险与对策

| 编号 | 风险 | 影响 | 对策 |
|---|---|---|---|
| R1 | SSR 输出与旧 DOM 存在细微出入（类名、属性顺序、空白文本节点） | 直接违反 G3 | §9.2 的结构 diff 作为硬门槛；模板由旧 HTML 逐段迁移而非重写 |
| R2 | 留言持久化后，刷新不再清空 → 与"现在看到的页面"不同 | 与 G3 字面冲突 | 属**预期功能变化**（G2 的目标即为持久化），在验收标准中显式列为允许差异 |
| R3 | 图片存入 SQLite 后数据库膨胀 | 备份/查询变慢 | 单张 ≤ 5MB 且 `image_bytes` 记录用量；管理页可见总量；后续需要时可迁移到磁盘目录而不改接口 |
| R4 | 管理口令泄露 → 全站内容可删 | 内容损失 | 口令仅存环境变量、定长比较；Cookie 签名；上线建议置于反代后并启用 HTTPS |
| R5 | `node:sqlite` 仍是 Node 的实验性模块，未来 API 可能变动 | 需改少量代码 | 数据库访问收敛在 `db.js` 单文件内，替换驱动不影响路由层 |
| R6 | 文章 `content` 为富 HTML，若口令泄露可注入脚本 | XSS | 该字段仅登录后可写，属信任边界；留言等用户输入一律 `textContent` 渲染，不受影响 |

## 12. 决策记录（ADR）

| 编号 | 决策 | 备选 | 理由 |
|---|---|---|---|
| AD-1 | Node.js + Express | FastAPI / Flask / 原生 http | 与前端同为 JS，无语言切换成本；Express 生态成熟，`multer` 直接解决 multipart |
| AD-2 | SSR（EJS）而非前端 fetch 渲染 | 纯静态 + AJAX | 唯一能同时满足"显示零变化"与"无加载空窗"；且禁用 JS 仍可阅读 |
| AD-3 | SQLite + `node:sqlite` | better-sqlite3 / JSON 文件 / MySQL | 零配置、零原生编译（Windows 友好）；实测 BLOB 往返正常；DAO 收敛便于日后迁移 |
| AD-4 | 图片存 SQLite BLOB | 本地 uploads 目录 | 用户选定；部署只需搬一个 `.db`，但需接受数据库膨胀（见 R3） |
| AD-5 | 投稿改 `mailto:` | 表单 + 投稿接口 | 页面上本无投稿表单，加表单会违反"显示零变化"；邮件方案零 UI 变更且无需审核后台 |
| AD-6 | 管理页口令 + 签名 Cookie | HTTP Basic / 无鉴权 | 单用户场景最省事；Basic 无法登出，无鉴权等于公开删除权限 |
| AD-7 | 现有内容 seed 入库 | 空库启动 | 保证重构后页面与现状一字不差（G3 的前提） |
| AD-8 | 旧单文件页重命名为 `index.legacy.html` | 直接删除 | 保留可回滚参照，验收前不动它 |
| AD-9 | 音乐落在 **iPod 屏内的 `music` 视图** | 页面新增独立音乐区块 / 独立页 | 现场已有「屏内换屏」的机制（`data-ipod-view`），复用即可；新增区块会破坏 Daily 的左右分栏构图 |
| AD-10 | 歌单与歌词由**仓库里的文本文件**承载（`daily/music/`），不入库 | 存数据库、走 `/api` | 与 article / poem 完全同构：push 一个文件即发布，无需管理页与迁移；GitHub Pages 静态副本也能直接取到 |
| AD-11 | mp3 一律**外链**，不落仓库 | 文件进仓库 / 进 R2 | 音乐体积远大于正文，入库或入仓库都会撑爆交付物；外链零成本，且换曲只需改一行文本 |
| AD-12 | `<audio>` 元素挂在 `.daily-ipod-screen` **之外** | 放进 music 视图内 | 视图切换只改 `hidden`、切栏目只改右栏，DOM 不被销毁 → 「切栏目音乐不停止」是结构性保证，不靠脚本兜 |

## 13. 术语

| 术语 | 含义 |
|---|---|
| SSR | 服务端渲染，服务器把数据填入模板后返回完整 HTML |
| seed | 首启时把现有硬编码内容导入数据库的初始化数据 |
| 等价性 | 重构后页面在结构与观感上与重构前一致，由 §9 的证据判定 |
| 硬门槛 | 未通过即判定重构失败的验收项 |

---

## 14. 增量功能：每日音乐（Daily · music）

> 本节为 v1.1 新增，自成一套验收口径，不影响 §9 的视觉等价性判定。

### 14.1 背景与目标

Daily 区左侧的 iPod 早已在菜单里列出 `music` 一项，但点进去只有一句占位文案。本期把它做成**可以真听歌**的一屏：屏幕里放播放器，右栏放这一曲的歌词。

| 编号 | 目标 | 判定标准 |
|---|---|---|
| M-G1 | 屏内可播放外链 mp3 | 按转盘下键能听到声音，再按暂停 |
| M-G2 | 可切曲 | 左右键切上一首／下一首，屏内曲名与右栏歌词同步更换 |
| M-G3 | 切栏目音乐不断 | 从 music 切到 article / poem，音乐继续播；切回来状态不丢 |
| M-G4 | 不误触、不跳站 | 菜单屏按 MENU 无反应；子屏按 MENU 只回菜单，绝不离开本站 |

### 14.2 范围

**做**：屏内 `music` 视图播放器；外链 mp3 播放；右栏静态歌词；转盘 prev / next / play 三个键的行为；`daily/music/` 文本格式与发布链路。

**不做**：不做进度条拖拽、不做音量控制、不做循环／随机、不做歌词滚动与逐句高亮、不做后台管理界面、不把 mp3 收进仓库。

### 14.3 内容格式（`daily/music/2026_10_8.txt`）

文件名为发布日期（`年_月_日`，月与日**不补前导零**），与 `daily/article/`、`daily/poem/` 同一套命名与查找规则（当天没有就往前逐天找，最多 60 天）。

```text
每日歌单            ← 第 1 行：本期的标题（进右栏前不显示，仅作歌单名）

曲名甲|https://example.com/a.mp3   ← 空行分块；块首行 = 「曲名|mp3直链」
第一行歌词
第二行歌词                          ← 其余行 = 该曲歌词（原样静态显示，不解析时间码）

曲名乙|https://example.com/b.mp3   ← 只有「曲名|直链」、没有后续行 = 该曲无歌词
```

| 规则 | 说明 |
|---|---|
| 分块 | 连续空行视为一个分隔；块内保留原有换行 |
| 块首行分隔符 | 第一个 `|` 之前是曲名，之后到行尾是直链（直链里若含 `|` 不特殊处理，属作者责任） |
| 歌词 | 纯文本，`textContent` 渲染；不解析 `[00:12]` 这类时间码，整段静态显示 |
| 无歌词 | 右栏只显示曲名 |
| 空文件 / 取不到 | 屏内显示提示文字，右栏留空；不报错、不影响其它栏目 |

### 14.4 交互规格

| 控件 | 作用范围 | 行为 |
|---|---|---|
| 转盘 上（MENU） | 子屏 | 回菜单一屏。**菜单屏本身不响应**（真机语义）；判据为 `history.state.ipod`，深链直接落在子屏时用 `replaceState` 就地回菜单，不做 `history.back()` |
| 转盘 左（prev） | music 屏 | 切上一首；到第一首时不动（**不做循环**），菜单屏按它仍是滚菜单列表 |
| 转盘 右（next） | music 屏 | 切下一首；到最后一首时不动，菜单屏同上 |
| 转盘 下（play） | 全屏 | 播放／暂停切换（见下方「作用范围」说明） |
| 转盘 中（center） | music 屏 | **不接**（屏内无二级子项），保持现状 |
| 菜单列表项 | 菜单屏 | 桌面端点条目文本仍等于跳过转盘直接进入（既有行为，不改） |

其它状态约定：

- **进入 music 屏不自动播放**，等用户按下键；这样不会在用户只是想看看时突然出声。
- 切曲时若本来在播放，则**续播新曲**；本来暂停，则停在暂停态。
- 一首**播放到结尾自动顺到下一首**；已在最后一首则停在末尾（不回到第一首，见 §14.2「不做循环」）。
- 切曲后右栏歌词立即换；媒体若加载失败，屏内给出「无法播放」提示，切到下一首即恢复。
- 播放／暂停键的作用范围是**全屏**，不只 music 屏：真机上它就是全局走带键，且用户要求「按播放键开／关音乐」。
  在菜单屏按它不会抢走右栏——歌词只在「进入 music 屏」或「在 music 屏切歌」时才接管右栏。

### 14.5 结构与视觉

- **播放器在屏内**：`music` 视图内自上而下为「曲名 → 进度时间 → 进度条」。屏内可用面积约 184.5 × 227.4 CSS px，所有字号沿用屏内既有量级（15px 级），不引入新字体。
- **歌词在右栏**：复用现有 `.daily-content` 与 `.daily-title` / `.daily-body` 的字号与行距（25px / 18px, 行高 1.9），与 article、poem 同一套观感，只多一枚居中的小字「曲名」标签。
- **`<audio>` 放在 `.daily-ipod-screen` 之外**（挂 `.daily-grid` 下），不属于任何 `[data-ipod-view]`：视图切换只改 `hidden`、切栏目只改右栏，播放状态因此天然存活（见 AD-12）。
- 屏内进度条为静态宽度百分比（`<div>` 宽度按 `currentTime / duration` 写），不引入 `<input type="range">`（不可拖动，避免出现"看起来能拖其实不能"的控件）。

### 14.6 发布链路

| 位置 | 改动 |
|---|---|
| `tools/sync-daily.mjs` | 无需改动（整目录同步，`music/` 自动带上） |
| `tools/publish-daily.mjs` | 文件名白名单正则由 `article\|poem` 扩为 `article\|poem\|music`；提示文案同步 |
| `README.md` | 「每日内容」一节补 `daily/music/` 的格式说明 |

### 14.7 验收清单（M 系列）

1. 菜单屏按 MENU：**页面不跳转**，无任何反应。
2. 进 music 屏（点条目或转盘 center）：不自动出声。
3. 按下键：出声，屏内进度在走。
4. 按左／右键：曲名与右栏歌词同步更换，播放不中断。
5. 切到 article / poem：音乐继续；切回 music：曲名、进度、播放态都还在。
6. 子屏按 MENU：回到菜单屏；地址栏 hash 清掉；前后退键（浏览器）行为与之一致。
7. 断网改 `daily/music/*.txt` 里的直链为无效值：屏内显示「无法播放」，切下一首恢复正常，控制台无未捕获异常。

---

## 待用户确认的开放项

1. 管理页口令的具体值（由用户设置环境变量 `ADMIN_PASSWORD`，PRD 不记录口令本身）。
2. 服务端口默认 `3000` 是否可接受（可用 `PORT` 覆盖）。
3. 上线部署方式（本机 / 内网 / 公网反代）本期不在范围内，未定。

---

## 实现备注（与本文的出入）

- **multer 用 2.x**：1.x 已被 npm 标记弃用并有安全公告，2.x 的 API 在本项目用到的范围内不变。
- **口令多一层兜底**：`ADMIN_PASSWORD` 未设置时，不再直接拒绝启动，而是在 `data/admin.password`
  生成随机口令并在启动时打印文件路径；`SESSION_SECRET` 同理。二者仍不入库、不进日志。
- **结构比对结果**：规范化 `<body>` 后与 `index.legacy.html` 公共 392 token，差异仅 9 处——
  资源 URL 前缀（`/img/`、`/js/`）、年份组多出的 `open` 类、「投稿」改 `mailto:`，
  以及表单上三个不影响画面的属性（`maxlength`、`accept`）。全部落在 §9.2 允许范围内。
- **目录结构微调**：新增 `config.js`（环境变量集中）与 `queries.js`（SQL 收敛），
  §7 里的 `views/partials/` 已落地为文章卡片 / 年份组 / 月份条目 / 留言四个片段。
