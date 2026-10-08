# 上帝之国（Einmal ist keinmal）

刊物站点。前端观感与交互与重构前逐像素一致，内容改为由服务端渲染 + SQLite 持久化，并提供一套 REST 接口与管理台。

仓库里有**两套运行时**，共用同一份 `public/` 静态资源与同一套业务校验：

| | 目录 | 用途 |
|---|---|---|
| Node 版 | `server/` | 本机直接跑 / 自托管；Express + `node:sqlite`，数据在 `data/gods-country.db` |
| Workers 版 | `worker/` | 部署到 Cloudflare；D1 存数据、R2 存留言图片 |

两边渲染出的 HTML **逐 token 一致**（`node worker/dev-check.mjs` 会验证这一点）。

## 快速开始（本机）

```bash
npm install
npm start           # → http://localhost:3000
```

首次启动会自动建表，并把重构前硬编码的《创刊号》原样导入数据库。

管理台在 `/admin`。口令有两种给法：

```bash
# 方式一：环境变量
ADMIN_PASSWORD=你的口令 npm start

# 方式二：不管它——服务会在 data/admin.password 生成随机口令，启动时打印文件路径
npm start
```

可选：把 `.env.example` 复制成 `.env` 再改（`npm start` 已带 `--env-file-if-exists`）。

## 目录结构

```
server/
├─ app.js               装配：静态目录、视图引擎、路由、错误处理、优雅退出
├─ config.js            环境变量与默认值集中在这里
├─ db.js                连接、WAL、建表、触发 seed
├─ seed.js / seed-data.js  首启导入的初始内容（从旧页原样导出）
├─ auth.js              口令校验（定长比较）+ HMAC 签名 Cookie
├─ validators.js        系统边界校验规则
├─ queries.js           所有 SQL 都收敛在这里
├─ routes/
│  ├─ pages.js          GET / 、/admin、登录登出
│  ├─ content.js        文章 / 档案馆 读写
│  └─ guestbook.js      留言读写 + 图片流
├─ views/
│  ├─ index.ejs         首页（服务端渲染）—— 两套运行时共用的模板来源
│  ├─ admin.ejs         管理台
│  └─ partials/         文章卡片、年份组、月份条目、留言
（validators.js 在上一行，Workers 版直接复用这一份）

worker/                 Cloudflare Workers 版
├─ src/index.js         路由与全部处理器（fetch 入口）
├─ src/db.js            D1 查询（异步 API）+ 首启建表与 seed
├─ src/schema.js        建表语句（batch 用）
├─ src/auth.js          WebCrypto 版口令校验与签名 Cookie
├─ src/html.js          由 build-templates.mjs 从 EJS 编译而来，勿手改
├─ build-templates.mjs  EJS → 模板字面量（Workers 禁用 new Function）
└─ dev-check.mjs        本机跑 Workers 代码的验收脚本（D1/R2 用模拟实现）

public/                 静态资源，两套运行时 + Workers [assets] 共用
├─ css/site.css         旧 <style> 原文迁出
├─ css/admin.css        管理台样式（复用 site.css 的配色变量与字体族）
├─ js/site.js           旧 <script> 迁出 + 留言板接后端
├─ js/admin.js          管理台交互
├─ img/                 795.jpg / archive.jpg / lamp.webp / logo.png
└─ fonts/               三套被引用的字体

daily/                  每日内容（article / poem 两类），文件名即发布日期 —— 见「每日内容」
tools/font-charset-cn.txt  中文字体子集化的用字集（见「字体子集」）
tools/grayscale.py         图片黑白化脚本（灰度用 BT.709，与 CSS filter 同一套矩阵）
tools/sync-daily.mjs       把 daily/ 的内容同步进 public/（Workers 部署前自动跑，见「每日内容」）
wrangler.jsonc          Workers / D1 / R2 / 静态资源的绑定配置
data/                   Node 版的 SQLite 库、口令与会话密钥（不入库）
index.legacy.html       重构前的单文件页，留作回滚参照
```

## 接口

### 公开

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/` | 服务端渲染的首页 HTML |
| GET | `/api/articles` | 文章列表（sort_order 升序，同序按发布日期倒序） |
| GET | `/api/articles/:slug` | 单篇；不存在 404 |
| GET | `/api/archive` | `[{year, months:[{month, hasPosts, posts}]}]`，年份倒序 |
| GET | `/api/guestbook` | `?limit=&before=`；`{items:[{id,name,body,date,imageUrl}]}`，最新在前 |
| POST | `/api/guestbook` | multipart：`name` / `body` / `image`；成功 201 |
| GET | `/p/:slug` | 文章永久页。半年内全文；超期只剩「已入档」视图 |
| GET | `/random` | 随便一篇（不分时间），302 到 `/p/<slug>?r=1` |
| GET | `/api/guestbook/mine` | 「我的」：这台设备留过的留言 id + 上次用的名字；`no-store` |
| GET | `/api/echoes?article=:id` | 某篇的回声，按时间正序 |
| GET | `/api/echoes/mine?article=:id` | 这篇我留过吗 |
| POST | `/api/echoes` | `{articleId, name?, body}`；一篇一次，重复返回 409 |
| DELETE | `/api/echoes/:id` | 本人撤回；管理员撤任意一条 |
| GET/PUT/DELETE | `/api/drafts?slot=` | 写到一半的草稿，随设备 |
| GET | `/api/guestbook/:id/image` | 图片流；无图 404；带一年强缓存 |
| DELETE | `/api/guestbook/:id` | 管理员删任意一条；本人只能撤回自己那条（否则 403） |

### 管理（均需登录 Cookie）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/admin/login` | body `{password}`；成功 204/200 + Set-Cookie |
| POST | `/admin/logout` | 清除 Cookie |
| GET | `/admin` | 管理台页面（未登录渲染登录视图） |
| POST | `/api/articles` | 新建文章 |
| PUT | `/api/articles/:id` | 更新文章 |
| DELETE | `/api/articles/:id` | 删除文章（级联删除其档案馆条目） |
| POST | `/api/archive` | 新增档案馆条目 `{year, month, articleId}` |
| DELETE | `/api/archive/:id` | 删除档案馆条目 |
| DELETE | `/api/guestbook/:id` | 删除留言及其图片 |

### 校验边界

| 字段 | 规则 |
|---|---|
| `name` | ≤ 24 字符，可空，空值渲染为「匿名」 |
| `body` | ≤ 500 字符，可空（与 image 至少一项非空） |
| `image` | ≤ 5 MB，MIME 限 png / jpeg / gif / webp |
| 文章 | 标题 ≤ 100，摘要 ≤ 1000，全文 ≤ 20000，日期 `YYYY-MM-DD` |
| 档案馆 | 年份 1900–2999，月份 1–12，同一月份里文章不重复 |

违规统一返回 `400`（图片过大 `413`），响应体 `{ error, field }`。

## 前端等价性

重构的硬门槛是「看不出来」。已做的保证：

- `index.ejs` 由旧 `index.html` 的 `<body>` **逐段迁移**而非重写；
- 两处内联字号（`style="font-size: 25px"` / `18px`）留在 HTML 里，没有搬进 CSS——搬了会因选择器优先级变化而变字号；
- 外置样式表放在 `<head>` 同步阻塞渲染，字体 `font-display: swap` 原样保留；
- `site.js` 仍放在 `</body>` 前同步执行，不加 `defer`，拆字脚本的时机不变；
- 档案馆「最新年份默认展开」的 `open` 类改为服务端直出，首次绘制即带该状态，不会补一次 `max-height` 动画；
- `.hero` 及其子元素没有新增 `filter` / `transform` / `will-change`，`background-attachment: fixed` 的对齐不受影响。

规范化后的 `<body>` 结构比对（忽略注释与空白）与 `index.legacy.html` 仅差三处：资源 URL 前缀（`/img/`、`/js/`）、年份组的 `open` 类、「投稿」的 `href` 改为 `mailto:`。都是预期内的功能变化，不影响任何一帧的画面。

## 部署

### A. Cloudflare Workers（数据库在 D1，图片在 R2）——推荐

Workers 上跑不了 `node:sqlite` / Express / multer / EJS，所以 `worker/` 是同一套功能的第二份实现：
D1（托管版 SQLite）存文章与留言，R2 存留言图片，静态资源走 Workers Assets（`public/`）。

**1. 装依赖并登录**

```bash
npm install
npx wrangler login
```

**2. 建 D1 数据库和 R2 桶**

```bash
npm run d1:create     # 输出里有一行 database_id，复制它
npm run r2:create
```

把 `database_id` 填回 `wrangler.jsonc` 里的 `d1_databases[0].database_id`
（替换 `REPLACE_WITH_YOUR_D1_DATABASE_ID`）。

**3. 设管理口令（密钥，不进代码）**

```bash
npx wrangler secret put ADMIN_PASSWORD     # 按提示输入你自己设定的口令（不要写进仓库）
npx wrangler secret put SESSION_SECRET     # 任意长随机串；不设则回退用 ADMIN_PASSWORD 派生
```

**4. 构建模板并部署**

```bash
npm run deploy
```

`npm run deploy` 实际是四步（第一步由 npm 的 `predeploy` 自动触发），任何一步失败都会停住：

```
npm run predeploy   # 把 daily/ 的内容同步进 public/（Workers 的静态目录只有 public/）
npm run preflight   # 自检：D1 id 是否填了、模板有没有过期、引用的资源在不在
npm run templates   # EJS → worker/src/html.js（Workers 禁用 new Function，必须预编译）
wrangler deploy
```

**模板必须预编译**，这一步最容易忘：忘了就会上线一份旧页面，而且不会报错。
`preflight` 就是专门挡这个的——它重新编译一遍跟磁盘上的比对，不一致直接退出。
想跳过自检（不推荐）用 `npm run deploy:skip-check`。

**5. 验证**

```bash
curl https://<你的域名>/healthz     # → {"ok":true,"articles":1}
```

`/healthz` 会连一次库，库挂了返回 503，可以拿去做外部探活。

首次访问会自动建表并导入《创刊号》（`worker/src/db.js` 的 `bootstrap`），不需要手工跑 SQL。
部署完成后 `*.workers.dev` 域名即可访问，`/admin` 用上面的口令登录。

当前线上：

- 地址：https://gods-country.lyw2373314970.workers.dev
- D1：`gods-country` / `dfedac7b-6c48-43a7-9881-c7bcc5258961`
- 密钥：`ADMIN_PASSWORD`、`SESSION_SECRET` 已通过 `wrangler secret put` 写入

**图片的落点按优先级自动选，不用改代码：**

| 优先级 | 条件 | 存到哪 | 库里存什么 |
|---|---|---|---|
| 1 | 有 `IMAGES` 绑定（R2 已开通） | 你自己的 R2 桶 | `image_key`，走 `/api/guestbook/:id/image` |
| 2 | 有 `IMGBB_API_KEY` | ImgBB 图床 | `image_url`，页面直接用外链 |
| 3 | 都没有 | — | 带图留言返回 503，文字留言照常 |

**当前跑的是第 2 档（ImgBB）**，因为账号还没启用 R2（API 报 10042），而 `wrangler deploy`
又会校验桶存在（10085），所以 `wrangler.jsonc` 里的 `r2_buckets` 暂时注释着。

想切回自己存：面板 → R2 → 启用 → 解开 `wrangler.jsonc` 里那段注释 → `npm run deploy`。
第 1 档优先级更高，一开通就自动切过去。

> **图床的代价，说清楚**：图片托管在 `i.ibb.co`，不在自己手里。图床哪天关停或改策略，
> 历史图片会失效——对一个以"被收好"为立意的档案馆来说，这是个真实的妥协。
> 所以这只是**过渡方案**，R2 开通后应当切回去。
> 另外：留言被删时，图床上的图不会跟着删（`delete_url` 没有入库）。

在 Windows 上设密钥请用 `npm run secret -- ADMIN_PASSWORD 你的口令`——
直接 `echo xxx | wrangler secret put` 会被 PowerShell 的编码弄坏，登录一直失败还查不出原因。

**5. 连 GitHub 自动部署**

- 方式一（最省事）：Cloudflare 面板 → Workers & Pages → Create → 选 "Import from GitHub"，
  授权 `countryofgod` 组织，选中本仓库，构建命令填 `npm run templates && npm run deploy`，
  之后推 `main` 就自动上线。
  **不要只填 `npx wrangler deploy`**：`daily/` 内容靠 `npm run deploy` 里的 `predeploy` 同步进
  `public/`，跳过它线上 `/daily/…` 会 404（见「每日内容」）。
- 方式二：用仓库里已备好的 `.github/workflows/deploy.yml`，
  在 GitHub 仓库 Settings → Secrets 里加 `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`、`ADMIN_PASSWORD`。

**绑定自定义域名**：Workers 的 Settings → Domains & Routes → Add custom domain。

> 本机 `npm run dev`（`wrangler dev`）需要 workerd 能启动。Windows 上若报
> "access violation / overflowed its stack"，多半是 Microsoft Visual C++ Redistributable 太旧，
> 装最新版即可；实在起不来也可以 `node worker/dev-check.mjs`——它用 node:sqlite 模拟 D1、用 Map 模拟 R2，
> 直接在 Node 里把 Workers 代码整条链路跑一遍（含结构等价性比对）。

### B. Node 版自托管

- 只需要 Node ≥ 22.9（用到内置 `node:sqlite` 与 `--env-file-if-exists`），无原生编译依赖。
- `data/` 目录是唯一有状态的东西，备份/迁移只需搬这一个目录（含 `.db` 与口令文件）。
- 公网部署请置于 HTTPS 反向代理之后，并把 `COOKIE_SECURE=1`。
- 进程会以 SIGINT / SIGTERM 优雅退出并关闭数据库。

## 每日内容（daily/）

首页「每日」右栏的 article / poem 两类内容**不在数据库里，而是仓库里的纯文本文件**：

```
daily/article/2026_10_8.txt     # 文章
daily/poem/2026_10_8.txt        # 诗
```

- **文件名就是发布日期**：`年_月_日`，月、日不补前导零（`2026_10_8`，不是 `2026_10_08`）。
  push 一个文件 = 发布那一天的那一篇；要改内容就改原文件。
- **格式**：第一行是标题（占右栏的标题位），其余行是正文，换行原样保留。
- **取哪一篇**：页面按「今天」取当天的文件；当天没有就**往前逐天找最近的一篇**（最多往回 60 天）。
  60 天以内一篇都没有时，右栏空着。
- **切换**：iPod 菜单里的 `article` / `poem` 决定看哪一类，默认 `article`。

### 发布

写好今天的 txt 之后，一条命令发布（校验 → 提交 → push → 部署）：

```bash
npm run daily                  # 提交 + push + 本地部署
npm run daily -- --dry-run     # 只看"将要做什么"，什么都不动
npm run daily -- --no-deploy   # 提交 + push，不本地部署（等 CI）
```

脚本会先校验再提交：文件名必须是 `年_月_日` 且月、日**不补前导零**、第一行必须有标题——
这两种写法前端都是"静默取不到"，所以在提交前就挡下来。未来日期的文件会提示
"到那天才会出现在首页"。`git push` 完成后 GitHub Pages 随即更新，随后本地
`npm run deploy` 把 Workers 也部署一遍（CI 还会再部署一次，无妨）。

三种部署读到的是同一份文件，路径都是 `/daily/<分类>/<文件名>`：

| 部署 | 怎么读到的 |
|---|---|
| GitHub Pages | 文件就在仓库根，前端按相对路径直接取到 |
| Node 版 | `server/app.js` 把 `/daily` 映射回仓库根的 `daily/`（只做静态托管） |
| Workers | 部署前 `tools/sync-daily.mjs` 把 `daily/` 复制进 `public/`（`npm run deploy` / `npm run dev` 会自动跑） |

> 推送到 GitHub 时务必走 npm 脚本（`npm run deploy`），别直接 `npx wrangler deploy`——
> 后者跳过同步，线上 `/daily/…` 会 404。`public/daily/` 是生成物，不入库。

与 `/admin` 的「本日 Daily」面板是两回事：那套（`daily_entries` 表 + `GET /api/daily`）保留着，
但首页右栏已经不再读它。

## 五种核心机制

这五条不是功能清单，是从《创刊号》那句「哪怕抛却凝视也要表达的冲动」推出来的取舍。

### 文章永久页 `/p/<slug>` —— 只保留最近半年

每篇收录的文章都有一个永久地址。但**主动打开这个地址，只在发布后半年内可读全文**。
半年之后这篇沉入档案馆，页面只剩标题、署名、日期、摘要和一句说明——正文不展开。

要读它，只能等**随机**翻到。这是刻意的：过刊不摆在架子外面。

### 随便一篇 `/random` —— 唯一的发现入口

服务端随机取一篇，**不分时间**，任何一年的都可能被翻出来。

没有算法、没有权重、没有"猜你喜欢"。算法排序隐含"这篇比那篇好"，随机不含这个判断。
它同时保证旧文不会被埋掉——2020 年的文章和本月的有同样的机会被碰到。

入口在档案馆标题下方，以及每篇永久页的顶行。

### 回声 —— 一台设备对一篇只留一次

回声是**对某一篇**说的；页脚的「留言」是**对整本刊物**说的。两件事分开。

- 一台设备对一篇文章只能留一条，重复提交返回 `409`，先撤回才能重留
- 按时间正序，**不显示条数、不按热度排序、不能回复盖楼**
- 输入框的提示语是「我也这样想过……」，引导共鸣而不是评价
- 本人可撤回自己的那条；管理员可撤任意一条

### 写到一半 —— 草稿随设备

留言框与回声框里的内容随打字自动存（800ms 防抖），绑在设备号上，按 `slot`
分开存（`guestbook` / `echo:<文章id>`）。刷新、改天回来，半截话还在。
留言或回声一旦留成，草稿自动清掉。

### 收录后不改

文章一旦进档案馆（`POST /api/archive`）即置 `locked_at`，此后 `PUT /api/articles/:id`
一律返回 `409`。**要改就另发一篇**，旧文留着。

理由：那一刻的想法就是那一刻的。改过的记忆不算数，档案馆该有刊物的诚实。

## 设备即账号（不做登录）

没有注册、没有登录、没有邮箱手机号密码。第一次访问时服务端发一串随机号，`HMAC` 签名后写进
`gc_dev` 这个 httpOnly Cookie —— 这串号就是「这台设备在这里的身份」。

它只做三件事：

1. **认领**：`/api/guestbook/mine` 返回这台设备留过的留言 id，前端给它们挂上「撤回」
2. **记住名字**：设备上一次填的昵称会被记住，下次自动填进输入框
3. **撤回**：本人可以删自己那条；删别人的一律 403，管理员除外

刻意不做的事：换设备就是新身份，不做跨设备同步、不做找回。**不为留存去换隐私。**

`mine` 走独立接口而不写进 SSR，是为了让首页与设备无关 —— 页面可缓存，也不会把一个人的
昵称串给另一个人看。

## 字体子集

三套字体的分工：`LoveLetter`（101 字形 / 17.8 KB）承担西文；`KeBenSong` 与 `ShanHaiJi` 是两个中文字体，分别给标题与正文，**原始字形数 7544 / 7205，未子集化时合计 4.69 MB**。
这正是「英文看着对、中文看着不对」的原因——`font-display: swap` 的语义是「先用兜底字体画、字体到了再换」，西文 17.8 KB 瞬间到位，汉字要等整个文件下完，期间显示系统宋体。

两个中文字体现在按用字集子集化：

| 字体 | 子集前 | 子集后 |
|---|---|---|
| KeBenSong（标题） | 3,120,076 B | 1,502,956 B |
| ShanHaiJi（正文） | 1,565,528 B | 789,084 B |

用字集是 `tools/font-charset-cn.txt`，共 3629 字 = **《现代汉语常用字表》3500 常用字**（开头与 gov.cn 官方《通用规范汉字表》一级字表交叉核对过）∪ **站点现有全部用字**（`國`、`「」`、箭头等繁体与符号）。
留出法实测（拿 `lessons.md` 当「还没写出来的新文章」）：不同字覆盖 99.45%，按字数加权 99.92%。

改动用字集后重新生成（两条命令各跑一遍；Windows 下用 PowerShell 请写成一行）：

```bash
python -m fontTools.subset AaGuDianKeBenSongYouMoBan/AaGuDianKeBenSongYouMoBan-2.ttf --text-file=tools/font-charset-cn.txt --flavor=woff2 --layout-features='*' --output-file=AaGuDianKeBenSongYouMoBan/AaGuDianKeBenSongYouMoBan-2.woff2
python -m fontTools.subset ShanHaiJiGuSongKe-JianFan/ShanHaiJiGuSongKe-JianFan-2.ttf --text-file=tools/font-charset-cn.txt --flavor=woff2 --layout-features='*' --output-file=ShanHaiJiGuSongKe-JianFan/ShanHaiJiGuSongKe-JianFan-2.woff2
```

生成后把两个文件各复制一份到 `public/fonts/` 下的同名目录：仓库根目录那两份供 GitHub Pages 的相对路径引用，`public/fonts/` 那两份供 Node / Workers 版的 `/fonts/…` 引用。

**什么时候要重跑**：新写的文章或留言里出现用字集之外的字时，那个字会显示成系统宋体（同句其余字仍是古宋）。把那个字追加进 `tools/font-charset-cn.txt` 重跑即可。原始 `.ttf` 一直留在仓库里，随时能从全量重新子集。

### 标题字体再收窄一层（只作用于 GitHub Pages 静态副本）

上面的 3629 字用字集是按「以后可能写出什么字」准备的，对**正文**是对的。但**标题**不是——标题的字是固定的、当场就能数清。实测 1,502,956 B 的 KeBenSong 在首页只服务于 26 个不同的字（「上帝之國」「创刊号」「档案馆」「河的第三条岸」这类），为了几个字形下 1.5 MB。

所以根目录这份自包含的 `index.html` 里，标题字体拆成两档：

| 档位 | 文件 | 字形数 | 体积 | `font-display` | 何时被下载 |
|---|---|---|---|---|---|
| ① 首屏标题级 | `AaGuDianKeBenSong-WebTitles.woff2` | 60 | **16,496 B** | `block` | 首屏就下（`<link rel="preload">` 提前发起） |
| ② 兜底级 | `AaGuDianKeBenSongYouMoBan/…-2.woff2` | 3625 | 1,502,956 B | `swap` | 只有标题里出现 ① 覆盖不到的字才下；本页今天为 **0 字节** |

字体栈因此是 `--font-title: 'LoveLetter', 'KeBenSong', 'KeBenSongFull', serif`。

- ① 用 `block` 而非 `swap`：**宁可让标题多等零点几秒，也不要先闪一遍系统宋体再换字**。它有 `preload` 且只有 16 KB，正常情况下与 HTML 并行到位，不会真的空窗。
- ② 是「不退化成系统宋体」的保险：它排在①后面，只按需触发，语义是「其他的先兜底、慢慢加载」。

**用字集**：`tools/charset-title.txt`，60 字 = 首页**实际渲染**出来的标题用字（按 `--font-title` 的 13 个选择器分桶采集，含伪元素 `content`、`placeholder`、`value`）∪ 0-9 与标题常用标点。中间产物 `tools/charset-rendered.json` 是这次采集的原始结果。

**再生成**（改完页面内容后如需重跑，Windows 下写成一行）：

```bash
python -m fontTools.subset AaGuDianKeBenSongYouMoBan/AaGuDianKeBenSongYouMoBan-2.ttf --text-file=tools/charset-title.txt --flavor=woff2 --layout-features='*' --output-file=AaGuDianKeBenSong-WebTitles.woff2
```

**什么时候要重跑**：静态副本里新增/改写了标题，且新标题出现了字表外的字。此时①不含该字 → 自动落到②，那个标题会「先用系统宋体、等 1.5 MB 到齐再换」。想让新标题也立刻用上目标字体，把新字追加进 `tools/charset-title.txt` 重跑上面这条命令即可（60 字 → 70 字只多几百字节）。

**验收口径**（盯「丢了什么」，不是「省了多少」）：`tools/charset-title.txt` 里每个字的码位都必须在新 woff2 的 cmap 里，缺字数为 0；浏览器侧则要求 `document.fonts` 里 `KeBenSong` 为 `loaded` 而 `KeBenSongFull` 保持 `unloaded`。

> Node / Workers 版**没动**，仍用 `public/fonts/` 下的整包 KeBenSong。那两版渲染的是数据库里的任意文章标题，不适合按页面用字裁剪；要提速得走另一条路（按 `unicode-range` 把整包切成分片，浏览器只下有字的那些片）。

### 正文用字再收窄一层（同前，只作用于 GitHub Pages 静态副本）

标题之外还有一头更大的：正文那 789 KB 的 `ShanHaiJi`——正文里每一个汉字都要问它，
于是**每次访问都要下完 789 KB**，而这份静态副本里会渲染出来的字其实只有 765 个。
同一套两档办法照搬：

| 档位 | 文件 | 字形数 | 体积 | `font-display` | 何时被下载 |
|---|---|---|---|---|---|
| ① 首屏正文级 | `ShanHaiJi-WebBody.woff2` | 765 | **150,868 B** | `swap` | 首次渲染正文时 |
| ② 兜底级 | `ShanHaiJiGuSongKe-JianFan/…-2.woff2` | 3629 | 789,084 B | `swap` | 正文出现 ① 覆盖不到的字才下；本页今天为 **0 字节** |

字体栈因此是 `--font-body: 'LoveLetter', 'ShanHaiJi', 'ShanHaiJiFull', serif`。
① 刻意**不 preload**：150 KB 去抢带宽会把 70 KB 的首图（LCP）往后挤；而 `swap` 语义下
正文在字体到达之前就已经用系统宋体画出来了，本来就没有空窗可抢。

**用字集**：`tools/charset-body-page.txt`，765 字 = 去掉 `<style>`（CSS 里的汉字全在注释里，
不渲染）与 HTML 注释之后的标签文本 ∪ `<script>` 里的界面文案，再与原始 cmap 求交，
另补一份 ASCII。

**再生成**（Windows 下写成一行）：

```bash
python -m fontTools.subset ShanHaiJiGuSongKe-JianFan/ShanHaiJiGuSongKe-JianFan-2.ttf --text-file=tools/charset-body-page.txt --flavor=woff2 --layout-features='*' --output-file=ShanHaiJi-WebBody.woff2
```

**什么时候要重跑**：静态副本里新增/改写了页面文案或界面提示，且新字不在 ① 里时——那个字会落到 ②（先用系统宋体，等 789 KB 到齐再换）。把新字追加进 `tools/charset-body-page.txt` 重跑即可（765 → 800 字只多几 KB）。

**验收口径**：`tools/charset-body-page.txt` 里每个字的码位都必须在新 woff2 的 cmap 里，缺字数为 0（本次实测 0）；浏览器侧则要求 `document.fonts` 里 `ShanHaiJi`（①）为 `loaded`。

> Node / Workers 版同样**没动**：`public/fonts/` 下的 ShanHaiJi 仍是整包。那两版渲染的是数据库里的任意文章正文，按页面用字裁剪会让新文章掉进系统宋体。


## 已知取舍

- Node 版把留言图片以 BLOB 存进 SQLite，部署只需搬一个文件；Workers 版改存 R2，避免把 5 MB 的二进制塞进 D1 的行里。两边单张都封顶 5 MB，管理台可见图片占用总量。
- 想把 Node 版已有的数据搬到 D1：

  ```bash
  npm run dump        # data/gods-country.db → data/dump-<日期>.sql
  npx wrangler d1 execute gods-country --remote --file=data/dump-<日期>.sql
  ```

  有一处不兼容：Node 版把留言图片存成 BLOB，D1 版改存 R2 的 key，
  所以导出的 `guestbook` 不带图片，需要另外上传进 R2。这是有意的——D1 不适合塞 5MB 的二进制。
- Cookie 的 `Secure` 跟着请求协议走，不写死：Workers 上（`*.workers.dev` 或自定义域名）自动带上，
  `wrangler dev` 的 http 下不带，否则本地登录不进去。
- 文章正文是富 HTML，只有登录后才能写，属信任边界；留言等用户输入一律经 `textContent` 渲染。
- 不做注册登录、留言审核与限流——单机小站，超出当前需要。
