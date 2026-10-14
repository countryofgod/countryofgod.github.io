# 上帝之国 · 桌面 App（Electron 在线壳）

把线上站点包成一个可双击打开的桌面窗口。**窗口里加载的就是线上域名**，所以
页面内容与网页端永远同步——发文章、改華彩段、发每日内容，App 这边无需任何更新。

本目录是**独立子项目**：它不引用、也不修改仓库里 `server/`、`worker/`、`index.html`
任何一处；删掉 `desktop/` 目录，网页项目不受任何影响。

## 三个已定决策

| 项 | 取值 | 说明 |
|---|---|---|
| 平台/壳 | **Electron（桌面）** | 用自带 Chromium 渲染，不受系统 WebView 版本影响，最稳 |
| 内容来源 | **在线壳** | 窗口加载线上域名，内容随时同步，App 不随内容发版 |
| 更新方式 | **手动** | 改完代码本地重新打包、自己替换；不接自动更新 |

## 命令

```bash
cd desktop
npm install          # 首次，装 electron 与 electron-builder
npm start            # 开发运行：直接弹出窗口加载线上站点
npm run dist         # 打包成 Windows 安装包（输出在 desktop/dist/）
npm run dist:dir     # 只产出免安装目录（调试打包配置用，更快）
```

`npm run dist` 产物：
- `dist/<version>/<productName> Setup <version>.exe` —— NSIS 安装包（可选安装目录、建桌面与开始菜单快捷方式）

## 怎么"手动更新"

App 只管壳，不管内容。分两种情况：

1. **只改网页内容**（文章、華彩段、每日内容……）→ 什么都不用做，重新打开 App 即是最新。
2. **要改 App 壳本身**（加菜单、改窗口尺寸、换站点地址……）→ 改本目录代码 →
   `npm run dist` → 把新 `.exe` 发出去 / 自己重装一遍即可。

> 版本号在 `package.json` 的 `version`。安装包文件名会带上它，方便区分新旧。

## 前端显示为什么"完全不变"

窗口用**系统原生边框**，Electron 的窗口装饰在网页之外，不侵占页面；主进程
（`main.js`）不注入任何 CSS / JS、不设 `zoomFactor`、不覆盖 User-Agent。所以窗口内的
网页与在普通浏览器里打开是同一套 Chromium、同一份 HTML/CSS/JS，逐像素一致。

唯一两处**必要**的拦截，都不改页面本身，只决定"点站外链接时去哪"：

- 页脚「投稿」是 `mailto:` 链接 → 交给系统邮件客户端（否则窗口会卡在跳转）。
- `target="_blank"` 的社交占位链接 → 交给系统默认程序新开（等价于浏览器开新标签）。

## 换站点地址

`main.js` 顶部一行：

```js
const SITE_URL = 'https://gods-country.lyw2373314970.workers.dev';
```

日后绑定自定义域名，改这一行 → `npm run dist` 即可。

## 已知取舍

- **断网即白屏**：在线壳的必然代价，由 Chromium 自己的错误页接管（未做离线兜底）。
- **未签名**：Windows 首次运行会被 SmartScreen 提示"未知发布者"，点"仍要运行"即可。
  要给他人使用且不想看到该提示，需购买代码签名证书。
- **图标**取自仓库根目录 `logo.png`（`build.win.icon`）。若该 PNG 小于 256×256，
  `npm run dist` 会报图标尺寸错误——换一张 ≥256×256 的 PNG/ICO 或先删掉这一行即可。
- 目前只配了 **Windows** 目标。要 macOS / Linux，在 `build` 里补 `mac` / `linux` 段
  （macOS 需在 macOS 上打包并完成签名与公证）。