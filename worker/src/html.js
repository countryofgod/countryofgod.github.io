/* 自动生成，勿手改。
 * 来源：server/views/*.ejs —— 由 worker/build-templates.mjs 编译。
 * 原因：Cloudflare Workers 禁用 new Function，EJS 无法在运行时编译，
 *       所以在 Node 里先编译成普通函数。改模板请改 EJS 后重跑：
 *         node worker/build-templates.mjs
 */

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** 与 EJS 的 <%= %> 同一套转义：用户输入一律先过这里 */
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);

function monthPost({ post }) {
  let out = '';
  out += `<a href="`;
  out += esc(post.href);
  out += `" class="month-post"><span class="month-post-title">`;
  out += esc(post.title);
  out += `</span><span class="month-post-date">`;
  out += esc(post.date);
  out += `</span></a>`;
  return out;
}

function articleItem({ article }) {
  let out = '';
  out += `      <article class="article-item">
        <span class="article-logo">
          <img class="logo-base" src="/img/logo.webp" alt="上帝之国">
          <img class="logo-inv" src="/img/logo.webp" alt="" aria-hidden="true">
        </span>
        <h3 class="article-title" style="font-size: 25px;">`;
  out += esc(article.title);
  out += `</h3>
        <p class="article-author">— `;
  out += esc(article.author);
  out += `</p>
        <p class="article-meta">`;
  out += esc(article.meta);
  out += `</p>
        <div class="article-content">
          <p class="article-excerpt" style="font-size: 18px;">`;
  out += esc(article.excerpt);
  out += `</p>
          <!-- 展开后的正文字号必须与上方摘要一致：摘要被手动调成了 18px，
               而 .article-full 的 CSS 默认是 15px，展开时正文会「变小」一档。
               这里把同一个 18px 补到全文段落上，展开前后字号不跳变。
               这两处内联字号必须留在 HTML 里：搬进 CSS 会因选择器优先级变化而让字号变回去 -->
          <p class="article-full" style="font-size: 18px;">`;
  out += article.content;
  out += `</p>
        </div>
        <span class="article-toggle">↓</span>
      </article>`;
  return out;
}

function archiveGroup({ group, open }) {
  let out = '';
  out += `      <div class="archive-group`;
  out += esc(open ? ' open' : '');
  out += `">
        <h3 class="archive-year">`;
  out += esc(group.year);
  out += ` <span class="archive-arrow">+</span></h3>
        <div class="archive-items">
          <div class="archive-months">
`;
  group.months.forEach((m) => {
  out += `            <div class="archive-month`;
  out += esc(m.hasPosts ? ' has-posts' : '');
  out += `"><span class="month-num">`;
  out += esc(String(m.month).padStart(2, '0'));
  out += `</span><div class="month-posts">`;
  m.posts.forEach((post) => {
  out += monthPost({ post });
  });
  out += `</div></div>
`;
  });
  out += `          </div>
          <div class="month-posts-panel" data-month="">`;
  group.panelPosts.forEach((post) => {
  out += monthPost({ post });
  });
  out += `</div>
        </div>
      </div>`;
  return out;
}

function guestNote({ note }) {
  let out = '';
  out += `              <div class="guest-note" data-id="`;
  out += esc(note.id);
  out += `">
                <p class="guest-note-head"><span class="guest-note-name">`;
  out += esc(note.name);
  out += `</span><span>`;
  out += esc(note.date);
  out += `</span></p>
`;
  if (note.body) {
  out += `                <p class="guest-note-text">`;
  out += esc(note.body);
  out += `</p>
`;
  }
  if (note.imageUrl) {
  out += `                <!-- 留言照片走图床，体积不可控：至少让它懒加载，别挡住首屏 -->
                <img class="guest-note-img" alt="`;
  out += esc(note.name);
  out += ` 上传的图片" src="`;
  out += esc(note.imageUrl);
  out += `" loading="lazy" decoding="async">
`;
  }
  out += `              </div>`;
  return out;
}

function renderHome({ articles, archive, notes, submitMail }) {
  let out = '';
  out += `<!DOCTYPE html>
<html lang="zh-CN"><head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Einmal ist keinmal — 上帝之国</title>
  <meta name="description" content="上帝之国（Einmal ist keinmal）——一个反抗媚俗的写作刊物。">
  <!-- 外置样式放在 head 里同步阻塞渲染，避免首屏先出无样式内容再跳一次 -->
  <link rel="stylesheet" href="/css/site.css">
</head>
<body>

  <!-- 右侧章节导航：daily / pub / archive / museum / end。
       随滚动高亮当前所在区块（对应项变黑，见 site.js），点任意一项平滑跳到该区块。
       映射：daily→#daily，pub→#latest（即「最新文章」），archive→#archive，
            museum→#museum（新增、尚未策划的板块，仅占位），end→#about（页脚）。
       固定在视口右侧、垂直居中；窄屏（≤1120px）正文会顶到边，导航收起 -->
  <nav class="side-nav" aria-label="章节导航">
    <ul class="side-nav-list">
      <li><a class="side-nav-item" href="#daily">daily</a></li>
      <li><a class="side-nav-item" href="#latest">pub</a></li>
      <li><a class="side-nav-item" href="#archive">archive</a></li>
      <li><a class="side-nav-item" href="#museum">museum</a></li>
      <li><a class="side-nav-item" href="#about">end</a></li>
    </ul>
  </nav>

  <!-- Hero -->
  <section class="hero">
    <div class="hero-crop">
      <img class="hero-image" src="/img/795.webp" alt="墙上装框画作，画中写着 La Vie est ailleurs" decoding="async" fetchpriority="high">
      <div class="hero-blur" aria-hidden="true"></div>
    </div>
    <div class="hero-inner">
      <div class="hero-text">
        <h1 class="hero-title">
          <span class="line">Einmal</span>
          <span class="line"><span class="line-highlight">ist</span> keinmal.</span>
        </h1>
      </div>
      <!-- 刊名里的「之」同时是管理台入口：点它进 /admin 登录。
           之所以选这个字——它是首屏唯一的红字、还带一枚反色取景窗，本来就是"这里不一样"的记号，
           不需要再额外画一个入口；而站在刊名里它又完全不打扰读者
           aria-label 是必需的：链接的可访问名称单看一个"之"字没有意义 -->
      <p class="hero-cn">上帝<a class="hero-cn-hl" href="/admin" aria-label="进入管理台">之</a>國</p>
    </div>
  </section>

  <!-- Daily：每日推荐。夹在「首屏」与「文章」之间——首屏之后的第一块内容。
       左侧是一台 iPod nano 4th gen，屏幕改成白底框 + 三栏标签；
       右侧是巴黎评论式的信息流（封面图 + 衬线标题 + 署名 + 斜体摘要）。
       左侧是一台 iPod nano 4th gen（ipod-clean.jpg），屏幕改成白底框 + 三栏标签，
       转盘上的四个按钮做成可点击热区；右侧是巴黎评论式的信息流。内容后续设计 -->
  <section class="section daily" id="daily">
    <p class="section-label">Daily</p>
    <h2 class="section-title">每日</h2>
    <div class="daily-grid">
      <!-- 折叠视窗：机身与右栏正文都包在里面。裁切（max-height + overflow: hidden）
           必须挂在【这一层】：overflow 会建立 BFC，而 BFC 块盒会整体躲开浮动，
           挂在正文那层的话，正文永远待在机身右侧、展开后也只有半栏。
           正文自己是普通块盒、宽整栏——行盒在机身范围内变窄，机身以下自动整栏宽 -->
      <div class="daily-fold">
      <div class="daily-ipod">
        <!-- ipod-clean.jpg 与 ipod.jpeg 同尺寸，机身左右边界（实测 x 38..917）之外已置纯白 -->
        <!-- ipod-clean.webp：显示宽度 230px 的 2 倍（460×1015），17KB；原 jpg 是 955×2107 / 507KB。
             width/height 写在标签上，浏览器先占好位置，图片到位时不跳版 -->
        <img class="daily-ipod-body" src="/img/ipod-clean.webp" width="460" height="1015"
             decoding="async" alt="iPod nano 4th gen">
        <div class="daily-ipod-screen">
          <!-- 屏内视图：menu 是菜单本身，music 是点 music 后在同一块屏幕里换上来的内容。
               两个视图都带 data-ipod-view，脚本靠它切换；没有对应视图的菜单项点了不响应 -->
          <nav class="daily-tags daily-ipod-view is-current" data-ipod-view="menu" aria-label="每日推荐分类">
            <!-- 循环列表：轨道上排 3 份相同内容（每份 3 行）。滑动只改 translateY、不改 DOM；
                 走过一个循环就把位移减掉一个循环，内容每 3 行重复一次，接缝不可见。
                 只有第一份（data-ipod-base）是"原项"，脚本靠它判断当前选中；后两份是副本，
                 只为让上下都接得上，读屏与 Tab 都跳过。
                 music 进的是屏内视图；article / poem 切的是右栏显示哪一类当天内容（见 site.js）。
                 注：副本里同样带 data-ipod-go，鼠标点到它也有对应行为 -->
            <div class="daily-tags-track">
              <button class="daily-tag" type="button" data-ipod-base data-ipod-go="music">music</button>
              <button class="daily-tag" type="button" data-ipod-base data-ipod-go="article">article</button>
              <button class="daily-tag" type="button" data-ipod-base data-ipod-go="poem">poem</button>
              <button class="daily-tag" type="button" data-ipod-go="music" aria-hidden="true" tabindex="-1">music</button>
              <button class="daily-tag" type="button" data-ipod-go="article" aria-hidden="true" tabindex="-1">article</button>
              <button class="daily-tag" type="button" data-ipod-go="poem" aria-hidden="true" tabindex="-1">poem</button>
              <button class="daily-tag" type="button" data-ipod-go="music" aria-hidden="true" tabindex="-1">music</button>
              <button class="daily-tag" type="button" data-ipod-go="article" aria-hidden="true" tabindex="-1">article</button>
              <button class="daily-tag" type="button" data-ipod-go="poem" aria-hidden="true" tabindex="-1">poem</button>
            </div>
            <!-- 固定选中框：钉在窗口正中，永远不随文字移动 -->
            <div class="daily-menu-band" aria-hidden="true"></div>
          </nav>
          <!-- 屏内播放器：曲名 → 进度时间 → 进度条，自上而下三行，都在脚本里写。
               这里**没有任何可拖动的控件**：进度条是纯 div，宽度按百分比改——
               摆一个看起来能拖、实际拖不动的滑块，比不摆更糟。
               播放器本体（<audio>）不在这里：它挂在屏幕之外，切屏与切栏目都不会把它销毁 -->
          <div class="daily-ipod-view" data-ipod-view="music" hidden>
            <div class="daily-music">
              <p class="daily-music-name"></p>
              <p class="daily-music-time"></p>
              <div class="daily-music-bar"><i class="daily-music-fill"></i></div>
            </div>
          </div>
        </div>
        <!-- 转盘上的四个按钮：按 .daily-ipod-wheel 的实测位置摆四块透明热区，
             图标在底下、热区盖在上面（z-index 高于白底框那层）。
             MENU 回上一屏；左／右在 music 屏切上一首、下一首（在菜单屏仍是滚列表）；
             下=播放／暂停；正中那枚是 center 确认键，与播放键无关（见 /js/site.js） -->
        <div class="daily-ipod-wheel">
          <button class="daily-ipod-btn is-menu" type="button" data-ipod="menu" aria-label="MENU，回到上一页"></button>
          <button class="daily-ipod-btn is-prev" type="button" data-ipod="prev" aria-label="上一首"></button>
          <button class="daily-ipod-btn is-next" type="button" data-ipod="next" aria-label="下一首"></button>
          <button class="daily-ipod-btn is-play" type="button" data-ipod="play" aria-label="播放或暂停"></button>
          <!-- 正中那个白圆是确认键（真机的 center 键），不是播放键。
               放在最后并加 z-index，才不会被上面四个扇形抢走点击 -->
          <button class="daily-ipod-btn is-center" type="button" data-ipod="center" aria-label="确认，进入选中项"></button>
        </div>
      </div>
      <!-- 右栏：当天的 article / poem / music，内容来自仓库里的文本文件，不由服务端渲染——
           daily/article/、daily/poem/、daily/music/ 下的「2026_10_8.txt」这种名字（年_月_日），
           第一行是标题、其余是正文（music 那类是歌单，格式见 README）；
           页面按当天日期取，没有就往前找最近的一篇。
           文件名就是发布日期：push 一个文件，等于发布那一天那一篇。
           iPod 菜单里的三个条目切换看哪一类，默认 article。取数逻辑在 /js/site.js -->
      <div class="daily-content"></div>
      </div><!-- /折叠视窗 .daily-fold：越线的正文在这里被裁住 -->
      <!-- 播放器本体：**故意**放在 .daily-ipod-screen 之外、也不属于任何 [data-ipod-view]。
           换屏只改视图的 hidden、切栏目只改右栏，这个元素从头到尾不被销毁，
           所以"切到 article / poem 音乐照放"是结构决定的，不靠脚本事后补救。
           display:none（见 site.css）不占版面；preload=none：进页面不预下载，
           按下播放键才开始拉数据——访客不点音乐，就不为音乐付流量。 -->
      <audio class="daily-audio" preload="none"></audio>
      <!-- 展开箭头：与文章卡片上那枚同款。默认只露到机身底边那一条线，点它把越线的续文放出来
           （那部分落在浮动之外，自动按整栏宽铺开）。初始隐藏，右栏内容真的超出折叠线时
           由脚本显出来（没超线就没有这个按钮） -->
      <button class="daily-toggle" type="button" data-daily-toggle aria-expanded="false" hidden>↓</button>
    </div>
  </section>

  <!-- Latest Articles -->
  <section class="section" id="latest">
    <div class="article-list">
      <!-- 这里原先有一串内联几何值（width: 704.01px / height: 376.189px / transform: translateY(16.111px)）。
           它们是可视化工具或保存页面时的运行期快照，不是设计意图：height 会把卡片钉死、
           展开长文时盒子长不高；width 写死后窄屏（内容宽 < 704px）会横向溢出。
           已整段移除，尺寸交回 CSS（.article-item 随容器自适应）。它带来的那 16px 下移
           已在 .article-list 上用 padding-top 补回，卡片位置不变 -->
`;
  articles.forEach((article) => {
  out += articleItem({ article });
  });
  out += `
    </div>
  </section>

  <!-- Archive -->
  <section class="section archive" id="archive">
    <div class="archive-head">
      <p class="section-label">Archive</p>
      <h2 class="section-title">档案馆</h2>
      <!-- 唯一的发现入口：不看时间、不看热度，随机翻一篇。
           旧文过了半年就不再摆在架子外面，这里是能碰到它们的门 -->
      <p class="archive-random"><a class="archive-random-link" href="/random">random →</a></p>
    </div>

    <div class="archive-inner">
`;
  archive.forEach((group, i) => {
  out += archiveGroup({ group, open: i === 0 });
  });
  out += `
    </div>
  </section>

  <!-- Museum：新增板块，尚未策划——只放占位标题，内容待定。
       导航里已挂上 #museum，先占个位，策划好了再往里填 -->
  <section class="section museum" id="museum">
    <div class="museum-inner">
      <p class="section-label">Museum</p>
      <h2 class="section-title">美术馆</h2>
      <p class="museum-coming">策划中</p>
    </div>
  </section>

  <!-- Footer -->
  <footer class="footer" id="about">
    <div class="footer-inner">
      <div class="footer-about">
        <div class="footer-links">
          <p class="footer-about-label" style="letter-spacing: 0px;"><span class="jitter-char" style="margin-right: 0.5px;">关</span><span class="jitter-char" style="margin-right: 0.5px;">于</span> <span class="footer-about-arrow" aria-hidden="true">→</span></p>

          <p class="footer-guestbook-label" style="letter-spacing: 0px;"><span class="jitter-char" style="margin-right: 0.5px;">留</span><span class="jitter-char" style="margin-right: 0.5px;">言</span> <span class="footer-guestbook-arrow" aria-hidden="true">→</span></p>

          <a href="mailto:`;
  out += esc(submitMail);
  out += `" class="footer-submit" id="submit">
            <span class="jitter-char">投</span><span class="jitter-char">稿</span> <span class="footer-submit-arrow">→</span>
          </a>
        </div>

        <div class="footer-about-body">
          <!-- 「关于」展开区：4 枚社交标识，横排一行。href 先统一留 "#"，等给真实地址再逐条替换。
               每枚图标是 Simple Icons 的官方品牌字形（单条 path、实心，24×24 viewBox），
               颜色由 .footer-social-item 的 color 经 fill: currentColor 统一控制。
               平台名不画在画面上，改由 <a> 的 aria-label 承担读屏名称。
               SVG 上的 aria-hidden="true" 有两个作用：①图标本身不进读屏树（名称已由 aria-label 给出）；
               ②页脚那段"逐字抖动"脚本遇到带 aria-hidden 的元素就不再往下拆——
               否则它会把 SVG 内部的 <path>/<circle> 逐个包进 <span>，图标会直接散掉 -->
          <ul class="footer-social">
            <li>
              <a class="footer-social-item" href="#" target="_blank" rel="noopener" aria-label="QQ">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.395 15.035a40 40 0 0 0-.803-2.264l-1.079-2.695c.001-.032.014-.562.014-.836C19.526 4.632 17.351 0 12 0S4.474 4.632 4.474 9.241c0 .274.013.804.014.836l-1.08 2.695a39 39 0 0 0-.802 2.264c-1.021 3.283-.69 4.643-.438 4.673.54.065 2.103-2.472 2.103-2.472 0 1.469.756 3.387 2.394 4.771-.612.188-1.363.479-1.845.835-.434.32-.379.646-.301.778.343.578 5.883.369 7.482.189 1.6.18 7.14.389 7.483-.189.078-.132.132-.458-.301-.778-.483-.356-1.233-.646-1.846-.836 1.637-1.384 2.393-3.302 2.393-4.771 0 0 1.563 2.537 2.103 2.472.251-.03.581-1.39-.438-4.673"/></svg>
              </a>
            </li>
            <li>
              <a class="footer-social-item" href="#" target="_blank" rel="noopener" aria-label="小红书">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22.405 9.879c.002.016.01.02.07.019h.725a.797.797 0 0 0 .78-.972.794.794 0 0 0-.884-.618.795.795 0 0 0-.692.794c0 .101-.002.666.001.777zm-11.509 4.808c-.203.001-1.353.004-1.685.003a2.528 2.528 0 0 1-.766-.126.025.025 0 0 0-.03.014L7.7 16.127a.025.025 0 0 0 .01.032c.111.06.336.124.495.124.66.01 1.32.002 1.981 0 .01 0 .02-.006.023-.015l.712-1.545a.025.025 0 0 0-.024-.036zM.477 9.91c-.071 0-.076.002-.076.01a.834.834 0 0 0-.01.08c-.027.397-.038.495-.234 3.06-.012.24-.034.389-.135.607-.026.057-.033.042.003.112.046.092.681 1.523.787 1.74.008.015.011.02.017.02.008 0 .033-.026.047-.044.147-.187.268-.391.371-.606.306-.635.44-1.325.486-1.706.014-.11.021-.22.03-.33l.204-2.616.022-.293c.003-.029 0-.033-.03-.034zm7.203 3.757a1.427 1.427 0 0 1-.135-.607c-.004-.084-.031-.39-.235-3.06a.443.443 0 0 0-.01-.082c-.004-.011-.052-.008-.076-.008h-1.48c-.03.001-.034.005-.03.034l.021.293c.076.982.153 1.964.233 2.946.05.4.186 1.085.487 1.706.103.215.223.419.37.606.015.018.037.051.048.049.02-.003.742-1.642.804-1.765.036-.07.03-.055.003-.112zm3.861-.913h-.872a.126.126 0 0 1-.116-.178l1.178-2.625a.025.025 0 0 0-.023-.035l-1.318-.003a.148.148 0 0 1-.135-.21l.876-1.954a.025.025 0 0 0-.023-.035h-1.56c-.01 0-.02.006-.024.015l-.926 2.068c-.085.169-.314.634-.399.938a.534.534 0 0 0-.02.191.46.46 0 0 0 .23.378.981.981 0 0 0 .46.119h.59c.041 0-.688 1.482-.834 1.972a.53.53 0 0 0-.023.172.465.465 0 0 0 .23.398c.15.092.342.12.475.12l1.66-.001c.01 0 .02-.006.023-.015l.575-1.28a.025.025 0 0 0-.024-.035zm-6.93-4.937H3.1a.032.032 0 0 0-.034.033c0 1.048-.01 2.795-.01 6.829 0 .288-.269.262-.28.262h-.74c-.04.001-.044.004-.04.047.001.037.465 1.064.555 1.263.01.02.03.033.051.033.157.003.767.009.938-.014.153-.02.3-.06.438-.132.3-.156.49-.419.595-.765.052-.172.075-.353.075-.533.002-2.33 0-4.66-.007-6.991a.032.032 0 0 0-.032-.032zm11.784 6.896c0-.014-.01-.021-.024-.022h-1.465c-.048-.001-.049-.002-.05-.049v-4.66c0-.072-.005-.07.07-.07h.863c.08 0 .075.004.075-.074V8.393c0-.082.006-.076-.08-.076h-3.5c-.064 0-.075-.006-.075.073v1.445c0 .083-.006.077.08.077h.854c.075 0 .07-.004.07.07v4.624c0 .095.008.084-.085.084-.37 0-1.11-.002-1.304 0-.048.001-.06.03-.06.03l-.697 1.519s-.014.025-.008.036c.006.01.013.008.058.008 1.748.003 3.495.002 5.243.002.03-.001.034-.006.035-.033v-1.539zm4.177-3.43c0 .013-.007.023-.02.024-.346.006-.692.004-1.037.004-.014-.002-.022-.01-.022-.024-.005-.434-.007-.869-.01-1.303 0-.072-.006-.071.07-.07l.733-.003c.041 0 .081.002.12.015.093.025.16.107.165.204.006.431.002 1.153.001 1.153zm2.67.244a1.953 1.953 0 0 0-.883-.222h-.18c-.04-.001-.04-.003-.042-.04V10.21c0-.132-.007-.263-.025-.394a1.823 1.823 0 0 0-.153-.53 1.533 1.533 0 0 0-.677-.71 2.167 2.167 0 0 0-1-.258c-.153-.003-.567 0-.72 0-.07 0-.068.004-.068-.065V7.76c0-.031-.01-.041-.046-.039H17.93s-.016 0-.023.007c-.006.006-.008.012-.008.023v.546c-.008.036-.057.015-.082.022h-.95c-.022.002-.028.008-.03.032v1.481c0 .09-.004.082.082.082h.913c.082 0 .072.128.072.128V11.19s.003.117-.06.117h-1.482c-.068 0-.06.082-.06.082v1.445s-.01.068.064.068h1.457c.082 0 .076-.006.076.079v3.225c0 .088-.007.081.082.081h1.43c.09 0 .082.007.082-.08v-3.27c0-.029.006-.035.033-.035l2.323-.003c.098 0 .191.02.28.061a.46.46 0 0 1 .274.407c.008.395.003.79.003 1.185 0 .259-.107.367-.33.367h-1.218c-.023.002-.029.008-.028.033.184.437.374.871.57 1.303a.045.045 0 0 0 .04.026c.17.005.34.002.51.003.15-.002.517.004.666-.01a2.03 2.03 0 0 0 .408-.075c.59-.18.975-.698.976-1.313v-1.981c0-.128-.01-.254-.034-.38 0 .078-.029-.641-.724-.998z"/></svg>
              </a>
            </li>
            <li>
              <a class="footer-social-item" href="#" target="_blank" rel="noopener" aria-label="微信">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 0 1 .598.082l1.584.926a.272.272 0 0 0 .14.047c.134 0 .24-.111.24-.247 0-.06-.023-.12-.038-.177l-.327-1.233a.582.582 0 0 1-.023-.156.49.49 0 0 1 .201-.398C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-6.656-6.088V8.89c-.135-.01-.27-.027-.407-.03zm-2.53 3.274c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.97-.982zm4.844 0c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982z"/></svg>
              </a>
            </li>
            <li>
              <a class="footer-social-item" href="#" target="_blank" rel="noopener" aria-label="GitHub">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div class="footer-guestbook">
        <div class="footer-guestbook-body">
          <div class="footer-guestbook-inner">
            <form class="guest-form">
              <input class="guest-field guest-name" type="text" placeholder="名字" autocomplete="off" maxlength="24">

              <label class="guest-upload">
                <input class="guest-file" type="file" accept="image/png,image/jpeg,image/gif,image/webp">
                <span class="guest-upload-text">Upload?</span>
              </label>
              <img class="guest-upload-preview" alt="待上传图片预览">

              <textarea class="guest-field guest-textarea" placeholder="Mus es sein?" maxlength="500"></textarea>

              <button class="guest-submit" type="submit">Es mus sein!</button>
            </form>

            <div class="guest-wall">
`;
  if (notes.length) { notes.forEach((note) => {
  out += guestNote({ note });
  }); } else {
  out += `
              <p class="guest-wall-empty">还没有留言</p>
`;
  }
  out += `
            </div>

            <!-- 照片流：向左缓慢滚动、悬停暂停、两端淡出到黑。
                 每帧的 --aspect 是这张照片的宽高比（宽÷高），用来分配帧宽：
                 同一高度下宽度与比例成正比，于是照片按原始比例铺满、彼此紧挨。
                 加照片：在第一组末尾追加一帧并带上它的 --aspect，
                 再把整组复制一遍（后面那组只作无缝循环的替身） -->
            <div class="guest-film">
              <div class="guest-film-track">
                <!-- 胶片带的图在页脚、默认还是收起的：一律懒加载；width/height 写出来是为了
                     让三帧先按比例占好位，图片到位时轨道与高度都不会跳 -->
                <figure class="guest-film-frame" style="--aspect: 1.3333"><img src="/img/lamp.webp" width="660" height="495" loading="lazy" decoding="async" alt="一盏蒂芙尼台灯"></figure>
                <figure class="guest-film-frame" style="--aspect: 1.3241"><img src="/img/still-1.webp" width="660" height="498" loading="lazy" decoding="async" alt="黑白剧照：咖啡馆对谈"></figure>
                <figure class="guest-film-frame" style="--aspect: 1.25"><img src="/img/still-2.webp" width="660" height="528" loading="lazy" decoding="async" alt="黑白剧照：病房相见"></figure>
                <figure class="guest-film-frame" style="--aspect: 1.3333" aria-hidden="true"><img src="/img/lamp.webp" width="660" height="495" loading="lazy" decoding="async" alt=""></figure>
                <figure class="guest-film-frame" style="--aspect: 1.3241" aria-hidden="true"><img src="/img/still-1.webp" width="660" height="498" loading="lazy" decoding="async" alt=""></figure>
                <figure class="guest-film-frame" style="--aspect: 1.25" aria-hidden="true"><img src="/img/still-2.webp" width="660" height="528" loading="lazy" decoding="async" alt=""></figure>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="footer-bottom">
        <span class="footer-name" style="letter-spacing: 0px;"><span class="jitter-char" style="margin-right: 0.5px;">E</span><span class="jitter-char" style="margin-right: 0.5px;">i</span><span class="jitter-char" style="margin-right: 0.5px;">n</span><span class="jitter-char" style="margin-right: 0.5px;">m</span><span class="jitter-char" style="margin-right: 0.5px;">a</span><span class="jitter-char" style="margin-right: 0.5px;">l</span> <span class="footer-name-ist"><span class="jitter-char" style="margin-right: 0.5px;">i</span><span class="jitter-char" style="margin-right: 0.5px;">s</span><span class="jitter-char" style="margin-right: 0.5px;">t</span></span> <span class="jitter-char" style="margin-right: 0.5px;">k</span><span class="jitter-char" style="margin-right: 0.5px;">e</span><span class="jitter-char" style="margin-right: 0.5px;">i</span><span class="jitter-char" style="margin-right: 0.5px;">n</span><span class="jitter-char" style="margin-right: 0.5px;">m</span><span class="jitter-char" style="margin-right: 0.5px;">a</span><span class="jitter-char" style="margin-right: 0.5px;">l</span><span class="jitter-char" style="margin-right: 0.5px;">.</span></span>
        <!-- 版权行由文字换成反色图片（见 site.css 的 .footer-bottom-img）。
             原字面「© 2026 · 上帝之国」退到 alt：读屏、SEO、归档都还拿得到这句话，
             但页面上不再有可拆字的文本节点。class 里保留 footer-credit，
             是为了与 CSS / JS 里那份抖动选择器清单继续对齐（图片无字，自然不抖）。 -->
        <img class="footer-credit footer-bottom-img" src="/img/bottom-inv.webp" alt="© 2026 上帝之国">
      </div>
    </div>
  </footer>

  <div class="cursor-invert" aria-hidden="true" style="transform: translate3d(792px, 1px, 0px) translate(-50%, -50%);"></div>

  <!-- 同步加载、不加 defer：拆字脚本必须在首屏绘制前跑完，否则字距会跳一次 -->
  <script src="/js/site.js"></script>
</body></html>
`;
  return out;
}

function renderArticle({ article, archived, readable, echoes }) {
  let out = '';
  out += `<!DOCTYPE html>
<html lang="zh-CN"><head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>`;
  out += esc(article.title);
  out += ` · 上帝之国</title>
  <meta name="description" content="`;
  out += esc(article.excerpt);
  out += `">
  <!-- 先挂主站样式：配色变量与字体族沿用同一套，文章页不另起视觉语言 -->
  <link rel="stylesheet" href="/css/site.css">
  <link rel="stylesheet" href="/css/article.css">
</head>
<body class="page-article">
`;
  const arch = new Date(article.publishedAt + 'T00:00:00Z'); arch.setUTCMonth(arch.getUTCMonth() + 6);
  out += `

  <main class="sheet">
    <p class="sheet-top">
      <a class="sheet-home" href="/">上帝之国</a>
      <a class="sheet-random" href="/random">next →</a>
    </p>

    <h1 class="sheet-title">`;
  out += esc(article.title);
  out += `</h1>
    <p class="sheet-author">— `;
  out += esc(article.author);
  out += `</p>
    <p class="sheet-meta">`;
  out += esc(article.meta);
  out += `</p>

`;
  if (readable) {
  out += `
    <div class="sheet-body">`;
  out += article.content;
  out += `</div>
`;
  } else {
  out += `
    <p class="sheet-excerpt">`;
  out += esc(article.excerpt);
  out += `</p>
    <div class="sheet-archived">
      <p class="sheet-archived-line">这篇已于 `;
  out += esc(arch.toISOString().slice(0, 7).replace('-', '.'));
  out += ` 沉入档案馆。</p>
      <p class="sheet-archived-note">过刊不摆在架子外面。想读它，只能等随机翻到。</p>
      <a class="sheet-archived-btn" href="/random">next</a>
    </div>
`;
  }
  out += `

    <section class="echo" data-article="`;
  out += esc(article.id);
  out += `">
      <h2 class="echo-title">回声</h2>

      <ul class="echo-list">
`;
  echoes.forEach((e) => {
  out += `        <li class="echo-item" data-id="`;
  out += esc(e.id);
  out += `">
          <p class="echo-head"><span class="echo-name">`;
  out += esc(e.name);
  out += `</span><span class="echo-date">`;
  out += esc(e.date);
  out += `</span></p>
          <p class="echo-body">`;
  out += esc(e.body);
  out += `</p>
        </li>
`;
  });
  if (!echoes.length) {
  out += `        <li class="echo-empty">还没有回声</li>
`;
  }
  out += `      </ul>

      <!-- 表单默认可见：脚本失效时也能留回声（脚本只负责"留过了就收起来"） -->
      <form class="echo-form">
        <input class="echo-input" type="text" placeholder="名字" maxlength="24" autocomplete="off">
        <textarea class="echo-textarea" placeholder="我也这样想过……" maxlength="500"></textarea>
        <button class="echo-submit" type="submit">留下回声</button>
        <p class="echo-hint" hidden></p>
      </form>
    </section>
  </main>

  <script src="/js/article.js"></script>
</body></html>
`;
  return out;
}

function renderAdmin({ authed, loginError, adminPath, articles, archiveEntries, notes, stats, daily }) {
  let out = '';
  out += `<!DOCTYPE html>
<html lang="zh-CN"><head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>管理 · 上帝之国</title>
  <!-- 先挂主站样式：配色变量、字体族、基础重置全部沿用，管理页不再另起一套视觉语言 -->
  <link rel="stylesheet" href="/css/site.css">
  <link rel="stylesheet" href="/css/admin.css">
</head>
<body class="admin-body">

`;
  if (!authed) {
  out += `
  <main class="admin-login">
    <h1 class="admin-login-title">上帝之国</h1>
    <p class="admin-login-sub">管理台</p>
    <form class="admin-form" method="post" action="`;
  out += esc(adminPath);
  out += `/login">
      <input class="admin-input" type="password" name="password" placeholder="管理口令" autocomplete="current-password" autofocus>
      <button class="admin-btn" type="submit">进入</button>
`;
  if (loginError) {
  out += `      <p class="admin-hint">口令不正确</p>
`;
  }
  out += `    </form>
  </main>
`;
  } else {
  out += `
  <header class="admin-head">
    <div class="admin-head-inner">
      <h1 class="admin-title">上帝之国 · 管理台</h1>
      <form method="post" action="`;
  out += esc(adminPath);
  out += `/logout">
        <button class="admin-btn admin-btn-ghost" type="submit">退出</button>
      </form>
    </div>
  </header>

  <main class="admin">

    <!-- ---------- 文章 ---------- -->
    <section class="admin-section">
      <h2 class="admin-section-title">文章</h2>

      <form class="admin-form admin-article-form" id="article-form">
        <input type="hidden" name="id" id="article-id">
        <div class="admin-grid">
          <label class="admin-field">
            <span>标题</span>
            <input class="admin-input" name="title" required maxlength="100" placeholder="标题">
          </label>
          <label class="admin-field">
            <span>作者</span>
            <input class="admin-input" name="author" maxlength="40" placeholder="编辑部">
          </label>
          <label class="admin-field">
            <span>发布日期</span>
            <input class="admin-input" type="date" name="publishedAt" required>
          </label>
          <label class="admin-field">
            <span>栏目</span>
            <input class="admin-input" name="category" maxlength="30" placeholder="发刊词">
          </label>
          <label class="admin-field">
            <span>标识 slug</span>
            <input class="admin-input" name="slug" maxlength="120" placeholder="留空自动生成">
          </label>
          <label class="admin-field">
            <span>排序</span>
            <input class="admin-input" type="number" name="sortOrder" value="0" step="1">
          </label>
        </div>
        <label class="admin-field">
          <span>摘要</span>
          <textarea class="admin-input admin-textarea" name="excerpt" rows="3" required maxlength="1000"></textarea>
        </label>
        <label class="admin-field">
          <span>全文（可用 &lt;br&gt; 换行）</span>
          <textarea class="admin-input admin-textarea admin-textarea-tall" name="content" rows="12" required maxlength="20000"></textarea>
        </label>
        <div class="admin-actions">
          <button class="admin-btn" type="submit" id="article-submit">新建文章</button>
          <button class="admin-btn admin-btn-ghost" type="button" id="article-cancel" hidden>取消编辑</button>
        </div>
        <p class="admin-hint" id="article-hint" hidden></p>
      </form>

      <ul class="admin-list" id="article-list">
`;
  articles.forEach((a) => {
  out += `        <li class="admin-row">
          <div class="admin-row-main">
            <p class="admin-row-title">`;
  out += esc(a.title);
  out += `</p>
            <p class="admin-row-meta">`;
  out += esc(a.meta);
  if (a.category) {
  out += ` · `;
  out += esc(a.author);
  }
  out += `</p>
          </div>
          <div class="admin-row-actions">
            <button class="admin-btn admin-btn-ghost" type="button"
                    data-edit-article="`;
  out += esc(a.id);
  out += `">编辑</button>
            <button class="admin-btn admin-btn-ghost" type="button"
                    data-del-article="`;
  out += esc(a.id);
  out += `" data-name="`;
  out += esc(a.title);
  out += `">删除</button>
          </div>
        </li>
`;
  });
  out += `      </ul>
    </section>

    <!-- ---------- 档案馆 ---------- -->
    <section class="admin-section">
      <h2 class="admin-section-title">档案馆</h2>

      <form class="admin-form admin-archive-form" id="archive-form">
        <div class="admin-grid">
          <label class="admin-field">
            <span>年份</span>
            <input class="admin-input" type="number" name="year" min="1900" max="2999" value="`;
  out += esc(new Date().getFullYear());
  out += `" required>
          </label>
          <label class="admin-field">
            <span>月份</span>
            <input class="admin-input" type="number" name="month" min="1" max="12" value="`;
  out += esc(new Date().getMonth() + 1);
  out += `" required>
          </label>
          <label class="admin-field admin-field-wide">
            <span>文章</span>
            <select class="admin-input" name="articleId" required>
`;
  articles.forEach((a) => {
  out += `              <option value="`;
  out += esc(a.id);
  out += `">`;
  out += esc(a.title);
  out += `（`;
  out += esc(a.publishedAt);
  out += `）</option>
`;
  });
  out += `            </select>
          </label>
        </div>
        <div class="admin-actions">
          <button class="admin-btn" type="submit">加入档案馆</button>
        </div>
        <p class="admin-hint" id="archive-hint" hidden></p>
      </form>

      <ul class="admin-list" id="archive-list">
`;
  archiveEntries.forEach((e) => {
  out += `        <li class="admin-row">
          <div class="admin-row-main">
            <p class="admin-row-title">`;
  out += esc(e.year);
  out += `.`;
  out += esc(String(e.month).padStart(2, '0'));
  out += `</p>
            <p class="admin-row-meta">`;
  out += esc(e.title);
  out += `</p>
          </div>
          <div class="admin-row-actions">
            <button class="admin-btn admin-btn-ghost" type="button"
                    data-del-archive="`;
  out += esc(e.id);
  out += `">删除</button>
          </div>
        </li>
`;
  });
  out += `      </ul>
    </section>

    <!-- ---------- 本日 Daily ---------- -->
    <section class="admin-section">
      <h2 class="admin-section-title">本日 Daily</h2>
      <p class="admin-row-meta">首页「每日」右栏显示的就是这一条。一天一条，按日期覆盖：改了日期就是改那一天的。</p>

      <form class="admin-form" id="daily-form">
        <div class="admin-grid">
          <label class="admin-field">
            <span>日期</span>
            <input class="admin-input" type="date" name="date" value="`;
  out += esc(daily.date);
  out += `" required>
          </label>
          <label class="admin-field">
            <span>分类</span>
            <select class="admin-input" name="category" required>
              <option value="music"`;
  if (daily.category === 'music') {
  out += ` selected`;
  }
  out += `>music</option>
              <option value="article"`;
  if (daily.category === 'article') {
  out += ` selected`;
  }
  out += `>article</option>
              <option value="poem"`;
  if (daily.category === 'poem') {
  out += ` selected`;
  }
  out += `>poem</option>
            </select>
          </label>
        </div>
        <label class="admin-field">
          <span>标题</span>
          <input class="admin-input" type="text" name="title" maxlength="100" value="`;
  out += esc(daily.title);
  out += `" required>
        </label>
        <label class="admin-field">
          <span>正文</span>
          <textarea class="admin-input" name="body" rows="12">`;
  out += esc(daily.body);
  out += `</textarea>
        </label>
        <div class="admin-actions">
          <button class="admin-btn" type="submit">保存本日 Daily</button>
        </div>
        <p class="admin-hint" id="daily-hint" hidden></p>
      </form>
    </section>

    <!-- ---------- 留言 ---------- -->
    <section class="admin-section">
      <h2 class="admin-section-title">留言`;
  if (stats) {
  out += `（`;
  out += esc(stats.count);
  out += ` 条 · 图片 `;
  out += esc((stats.imageBytes / 1024 / 1024).toFixed(2));
  out += ` MB）`;
  }
  out += `</h2>

      <ul class="admin-list" id="guest-list">
`;
  notes.forEach((n) => {
  out += `        <li class="admin-row">
          <div class="admin-row-main">
            <p class="admin-row-title">`;
  out += esc(n.name);
  out += ` <span class="admin-row-meta">`;
  out += esc(n.date);
  out += `</span></p>
`;
  if (n.body) {
  out += `            <p class="admin-row-body">`;
  out += esc(n.body);
  out += `</p>
`;
  }
  if (n.imageUrl) {
  out += `            <img class="admin-row-thumb" src="`;
  out += esc(n.imageUrl);
  out += `" alt="`;
  out += esc(n.name);
  out += ` 上传的图片">
`;
  }
  out += `          </div>
          <div class="admin-row-actions">
            <button class="admin-btn admin-btn-ghost" type="button"
                    data-del-guest="`;
  out += esc(n.id);
  out += `">删除</button>
          </div>
        </li>
`;
  });
  if (!notes.length) {
  out += `        <li class="admin-empty">还没有留言</li>
`;
  }
  out += `      </ul>
    </section>

  </main>
`;
  }
  out += `

  <script src="/js/admin.js"></script>
</body></html>
`;
  return out;
}

export { renderHome, renderArticle, renderAdmin, esc };
