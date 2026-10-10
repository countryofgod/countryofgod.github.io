// github.io 只是静态镜像，没有后端：那个页面会注入 __API_BASE__ / __DAILY_BASE__，
// 把留言接口和「每日」内容指回本站；本站（Worker）没有这两个变量，就走同源相对路径。
// 设备号在 Cookie 里，跨域请求必须带上凭据才认得出是谁。
const API_BASE = window.__API_BASE__ || '';
const DAILY_BASE = window.__DAILY_BASE__ || 'daily/';

// 屏内视图切换：点 music 是在这块屏幕里换一屏，不跳 URL、不换页面。
// 用 pushState 记一层，MENU 才能靠 history.back() 退回上一个视图；
// 浏览器前进／后退触发 popstate，再把视图同步回来。
// article / poem 不是屏幕里的视图：它们是"右栏显示哪一类当天内容"的开关（见下面 Daily 段）。
const ipodScreen = document.querySelector('.daily-ipod-screen');

/** 切右栏看 article / poem / music；由下面的 Daily 段赋值（页面里没有 Daily 区块时保持空函数） */
let showDailyCategory = () => {};

/** 音乐转盘的三个动作：'prev' | 'next' | 'play'；同样由 Daily 段赋值 */
let musicControl = () => {};

if (ipodScreen) {
  // 刷新（而非他人分享的深链）应回到菜单：music 屏会把 #ipod-music 写进地址栏，
  // 浏览器刷新会保留它，于是刷新后停在 music 而非菜单。这里在初始化前抹掉持久化的
  // #ipod-*，保证刷新一律回菜单视图（代价：别人分享的 #ipod-music 深链刷新后不再停留）
  if (/^#ipod-/.test(location.hash)) {
    history.replaceState(null, '', location.pathname + location.search);
  }

  const ipodViews = Array.from(ipodScreen.querySelectorAll('[data-ipod-view]'));

  const showIpodView = (name) => {
    ipodViews.forEach((view) => {
      const on = view.dataset.ipodView === name;
      view.hidden = !on;
      view.classList.toggle('is-current', on);
    });
  };

  // 当前该显示哪个视图：URL 上没有 #ipod-xxx 就显示菜单
  const currentIpodView = () => {
    const m = location.hash.match(/^#ipod-(.+)$/);
    return m && ipodViews.some((v) => v.dataset.ipodView === m[1]) ? m[1] : 'menu';
  };

  // MENU = 真机上的返回键：只在「我们自己 pushState 压进去的子屏」里才回退。
  // 判据必须是 history.state.ipod（enterIpodView 每次都写），不能用 history.length——
  // 它只说明浏览器有历史（从别的站点点进来同样是 2），在菜单屏按它会一路退出站点。
  // 菜单屏没有上一层可退：真机按 MENU 也不响应，这里就不响应。
  document.querySelectorAll('.daily-ipod-btn[data-ipod="menu"]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (currentIpodView() === 'menu') return;
      if (history.state && history.state.ipod) { history.back(); return; }
      // 深链直接落在子屏（别人分享 #ipod-music 打开的）：没有我们压的那层可退，
      // 就地回菜单并把 hash 抹掉——绝不 back()，那会退到站外
      history.replaceState(null, '', location.pathname + location.search);
      showIpodView('menu');
    });
  });

  // 这是一个循环列表：选中框永远固定在窗口正中（中槽），上下键滚的是列表本身，
  // 不是"选中项上下走"。
  // 做法：轨道里排 3 份相同内容（每份 3 行），滑动只改 translateY、从不改任何 DOM 节点。
  // 走过一个循环（3 行）就把位移整体减掉一个循环——内容每 3 行重复一次，
  // 回退前后每一像素都相同，所以看不到接缝，也不存在"清空一帧再补回来"的过程。
  const ipodMenuEl = ipodScreen.querySelector('[data-ipod-view="menu"]');
  const ipodTrackEl = ipodMenuEl && ipodMenuEl.querySelector('.daily-tags-track');
  const IPOD_ROW = 32;              // 须与 .daily-tag 的 flex-basis 一致
  const IPOD_CYCLE = IPOD_ROW * 3;  // 一个循环 = 3 行；轨道里共 3 份 = 9 行

  // 只有第一份（data-ipod-base）是原项，副本不参与选中判断
  const ipodItems = () => (ipodTrackEl ? Array.from(ipodTrackEl.querySelectorAll('[data-ipod-base]')) : []);

  // 当前选中 = 固定中槽压住的那一行。只按位移推算，不去改任何元素的 class
  const ipodSelected = () => {
    const items = ipodItems();
    if (!items.length) return null;
    // 轨道默认上移一个循环，所以静止时窗口顶行是第 3 行、中槽压的是第 4 行
    const bandRow = items.length + 1 - Math.round(ipodOffset / IPOD_ROW);
    return items[((bandRow % items.length) + items.length) % items.length];
  };

  // 选中项变黑：颜色跟着"中槽此刻压住的那一行"走，选中框本身依旧不动。
  // 只在所在行发生变化时才碰 classList——逐帧写 class 会反复打断 color 过渡，颜色会闪
  let ipodActiveEl = null;
  const syncIpodActive = () => {
    const items = ipodItems();
    if (!ipodTrackEl || !items.length) return;
    // 中槽中心落在第几行：轨道基准上移了一个循环（3 行），中槽自身又在窗口正中（+1.5 行）
    const row = Math.floor(items.length + 1.5 - ipodOffset / IPOD_ROW);
    const el = ipodTrackEl.children[row] || null;
    if (el === ipodActiveEl) return;
    if (ipodActiveEl) ipodActiveEl.classList.remove('is-active');
    if (el) el.classList.add('is-active');
    ipodActiveEl = el;
  };

  const enterIpodView = (target) => {
    if (!target) return;
    // 三个条目都决定"右栏显示什么"：
    //   article / poem → 当天的文章或诗，屏幕不动，只换右栏
    //   music          → 当前这一曲的歌词，同时把屏幕换成播放器
    if (target === 'article' || target === 'poem') { showDailyCategory(target); return; }
    if (target === 'music') showDailyCategory('music');
    if (!ipodViews.some((v) => v.dataset.ipodView === target)) return;
    if (target === currentIpodView()) return;
    history.pushState({ ipod: target }, '', '#ipod-' + target);
    showIpodView(target);
  };

  // 用 requestAnimationFrame 逐帧写位移，不再走 CSS transition。
  // 每帧把"离目标还差多少"吃掉固定比例，天然带缓动、收尾不生硬，也不用猜过渡何时结束。
  let ipodOffset = 0;   // 当前位移
  let ipodTarget = 0;   // 目标位移；连按会累加，所以不会被上一次动画挡住
  let ipodRaf = null;

  // 轨道基准位置上移一个循环（-96px），上下才各有副本可滚
  const applyIpodTransform = () => {
    if (!ipodTrackEl) return;
    ipodTrackEl.style.transform = 'translateY(' + (ipodOffset - IPOD_CYCLE) + 'px)';
  };

  const ipodTick = () => {
    ipodOffset += (ipodTarget - ipodOffset) * 0.22;

    // 走过一个整循环就整体回退一个循环：位移减掉 96px，目标同时减 96px。
    // 内容每 3 行重复一次，回退前后画面逐像素相同，所以看不到跳变；
    // 全程不碰任何 DOM 节点，也就不存在"清空一帧再补回来"的闪烁
    while (ipodOffset <= -IPOD_CYCLE) { ipodOffset += IPOD_CYCLE; ipodTarget += IPOD_CYCLE; }
    while (ipodOffset > IPOD_CYCLE) { ipodOffset -= IPOD_CYCLE; ipodTarget -= IPOD_CYCLE; }

    // 颜色跟着中槽走（选中框本身不动）
    syncIpodActive();

    if (Math.abs(ipodTarget - ipodOffset) < 0.5) {
      ipodOffset = ipodTarget;
      syncIpodActive();
      applyIpodTransform();
      ipodRaf = null;
      return;
    }

    applyIpodTransform();
    ipodRaf = window.requestAnimationFrame(ipodTick);
  };

  const scrollIpodList = (dir) => {
    if (!ipodTrackEl || ipodItems().length < 2) return;
    // 只有停在菜单这一屏时才滚；进了 music 视图再按上下键没有意义
    if (currentIpodView() !== 'menu') return;
    // dir > 0（下一首）：列表向上滚；dir < 0（上一首）：向下滚
    ipodTarget -= dir * IPOD_ROW;
    if (!ipodRaf) ipodRaf = window.requestAnimationFrame(ipodTick);
  };

  // 接管后先写一次 transform 与选中色：值与 CSS／标记里的静态兜底一致，不会闪
  applyIpodTransform();
  syncIpodActive();

  // 左／右两键是"一个键两种身份"：站在 music 屏里切歌，站在菜单屏里滚列表。
  // 这个分叉必须放在这里判——两屏都用同一对物理键，没有第二个入口
  document.querySelectorAll('.daily-ipod-btn[data-ipod="prev"]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (currentIpodView() === 'music') { musicControl('prev'); return; }
      scrollIpodList(-1);
    });
  });
  document.querySelectorAll('.daily-ipod-btn[data-ipod="next"]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (currentIpodView() === 'music') { musicControl('next'); return; }
      scrollIpodList(1);
    });
  });

  // 下键＝播放／暂停。这一键**不看当前在第几屏**：真机的播放键本来就是全局走带键，
  // 而且"按播放键开/关音乐"正是用户要的行为，回菜单就失灵反倒像坏了
  document.querySelectorAll('.daily-ipod-btn[data-ipod="play"]').forEach(btn => {
    btn.addEventListener('click', () => musicControl('play'));
  });

  // 转盘正中那个白圆 = 确认键：进入当前选中项（中间那一行）对应的视图
  document.querySelectorAll('.daily-ipod-btn[data-ipod="center"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const sel = ipodSelected();
      enterIpodView(sel && sel.dataset.ipodGo);
    });
  });

  // 直接点某一项也能进它的视图，等于跳过转盘点选
  ipodScreen.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-ipod-go]');
    if (!btn) return;
    enterIpodView(btn.dataset.ipodGo);
  });

  // 视图同步只此一处：初始化、浏览器前进后退、MENU 的 history.back() 最终都落到这里。
  // 落到 music 屏时右栏要跟着显示歌词——深链（别人分享的 #ipod-music）也走这条路，
  // 只在 enterIpodView 里切右栏的话，直接开深链就会屏幕是音乐、右栏还是文章
  const syncIpodView = () => {
    const name = currentIpodView();
    showIpodView(name);
    if (name === 'music') showDailyCategory('music');
  };
  window.addEventListener('popstate', syncIpodView);
  syncIpodView();
}

/* ---------- Daily 右栏：当天的 article / poem / music ----------
   内容不在数据库里，是仓库里的纯文本文件：
     daily/article/2026_10_8.txt（article 类）
     daily/poem/2026_10_8.txt   （poem 类）
     daily/music/2026_10_8.txt  （music 类：歌单 + 歌词，格式见下）
   文件名就是发布日期：年_月_日，月、日不补前导零；push 一个文件 = 发布那一天那一篇。
   页面按"今天"取当天的文件，当天没有就往前逐天找最近的一篇（最多往回 60 天）。
   文件第一行是标题，其余行是正文；正文的换行原样保留（.daily-body 是 pre-line）。
   music 那一类第一行是歌单名，其余按空行分块（见 parseMusic）。
   iPod 菜单里的 article / poem / music 决定看哪一类，默认 article。
   文本一律走 textContent：拼 HTML 会把文件里的尖括号当标签执行。 */
/* 这两个纯函数被「首页每日右栏」和「每日单独页」共用，提到模块作用域 */
const splitDaily = (text) => {
  const lines = text.split(/\r?\n/);
  let i = 0;
  while (i < lines.length && !lines[i].trim()) i++;
  return {
    title: (lines[i] || '').trim(),
    body: lines.slice(i + 1).join('\n').replace(/^\n+/, '').replace(/\s+$/, ''),
  };
};

const parseMusic = (text) => {
  const lines = text.split(/\r?\n/);
  let i = 0;
  while (i < lines.length && !lines[i].trim()) i++;
  const blocks = [];
  let cur = null;
  for (i = i + 1; i < lines.length; i++) {
    if (!lines[i].trim()) { cur = null; continue; }
    if (!cur) { cur = []; blocks.push(cur); }
    cur.push(lines[i].replace(/\s+$/, ''));
  }
  return blocks.map((block) => {
    const head = block[0];
    const cut = head.indexOf('|');
    return {
      name: (cut >= 0 ? head.slice(0, cut) : head).trim(),
      src: (cut >= 0 ? head.slice(cut + 1) : '').trim(),
      lyrics: block.slice(1).join('\n').replace(/^\n+|\s+$/g, ''),
    };
  }).filter((track) => track.src);
};

const dailyGrid = document.querySelector('.daily-grid');
if (dailyGrid) {
  // 被裁的是 .daily-fold（视窗），不是正文那层——正文那层必须保持普通块盒，
  // 它一旦 overflow: hidden 就会躲到机身右侧，展开后也只有半栏
  const dailyFold = dailyGrid.querySelector('.daily-fold');
  const dailyToggle = dailyGrid.querySelector('[data-daily-toggle]');
  const dailyIpod = dailyGrid.querySelector('.daily-ipod');
  const dailyRoot = dailyGrid.querySelector('.daily-content');
  // 音乐那几块：播放器本体 + 屏内三行。都在 .daily-grid 里，
  // 播放器本体故意不在屏幕内（见 index.ejs 标记处注释），所以换屏不会把它一起收掉
  const dailyAudio = dailyGrid.querySelector('.daily-audio');
  const dailyMusicEl = dailyGrid.querySelector('.daily-music');
  const dailyMusicName = dailyGrid.querySelector('.daily-music-name');
  const dailyMusicTime = dailyGrid.querySelector('.daily-music-time');
  const dailyMusicFill = dailyGrid.querySelector('.daily-music-fill');

  // 右栏默认只露到机身底边那一条线，点 ↓ 展开。折叠线取机身实测高度：
  // 图片按比例缩放，写死会在窄屏或换图后错位；箭头只在"真的被裁住了"时显示——
  // 否则会留一个点了没反应的 ↓ 挂在那儿
  const syncDailyFold = () => {
    if (!dailyFold || !dailyIpod) return;
    const fold = dailyIpod.getBoundingClientRect().height;
    dailyGrid.style.setProperty('--daily-fold', fold + 'px');
    if (!dailyToggle) return;
    // scrollHeight 是"被裁之前"的完整高度，与当前是否展开无关，
    // 所以展开态下这个判断照样成立，箭头不会自己消失
    const clipped = dailyFold.scrollHeight > fold + 2;
    dailyToggle.hidden = !clipped;
    if (!clipped) dailyGrid.classList.remove('expanded');
  };

  if (dailyToggle) {
    dailyToggle.addEventListener('click', () => {
      const expanded = dailyGrid.classList.toggle('expanded');
      dailyToggle.setAttribute('aria-expanded', String(expanded));
      // 收起时把视口拉回「每日」区块顶部：展开后下滑读过，直接收起会停留在下方内容，
      // 看起来像"没回到每日"。grid 顶部在展开/收起时位置不变，直接滚回去即可
      if (!expanded) {
        const top = dailyGrid.getBoundingClientRect().top + window.scrollY;
        window.scrollTo({ top, behavior: 'smooth' });
      }
    });
  }

  window.addEventListener('resize', syncDailyFold);
  syncDailyFold();

  /* —— 找文件：今天没有就往前逐天找 —— */
  const DAILY_FALLBACK_DAYS = 60; // 最多往回找多少天
  const DAILY_BATCH = 7;          // 一批并发探几个日期：都是小文件，并发比逐个问快
  const dailyCache = {};          // article / poem → { title, body } 或 null（找过了、没有）

  const dailyFileName = (daysAgo) => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return d.getFullYear() + '_' + (d.getMonth() + 1) + '_' + d.getDate() + '.txt';
  };

  /** 当天配图：与 txt 同名、只换扩展名（daily/music/2026_10_9.jpg）。
      图片沿用"文件名即发布日期"那套：push 一张同名的 jpg，等于给那天的歌配图。
      路径与 fetch 一样走相对地址，三种部署（Pages / Node / Workers）都指向同一份文件 */
  const dailyImageName = (daysAgo) => DAILY_BASE + 'music/' + dailyFileName(daysAgo).replace(/\.txt$/, '.jpg');

  /** 某一天的文件；404 回 null（那天没有），网络不通抛错交给调用方 */
  const probeDaily = async (category, daysAgo) => {
    // no-store：push 当天文件后刷新就能看到，不在浏览器里留住旧的 404
    const res = await fetch(DAILY_BASE + category + '/' + dailyFileName(daysAgo), { cache: 'no-store' });
    if (!res.ok) return null;
    const text = (await res.text()).replace(/^\uFEFF/, '');
    return text.trim() ? { daysAgo, text } : null; // 空文件当成没有
  };

  const findDaily = async (category) => {
    for (let start = 0; start < DAILY_FALLBACK_DAYS; start += DAILY_BATCH) {
      const batch = [];
      for (let d = start; d < Math.min(start + DAILY_BATCH, DAILY_FALLBACK_DAYS); d++) {
        batch.push(probeDaily(category, d));
      }
      const hit = (await Promise.all(batch)).filter(Boolean).sort((a, b) => a.daysAgo - b.daysAgo)[0];
      if (hit) return hit;
    }
    return null;
  };

  const renderDaily = (entry, category) => {
    dailyRoot.textContent = '';
    if (entry) {
      const title = document.createElement('h3');
      title.className = 'daily-title';
      title.textContent = entry.title;
      dailyRoot.appendChild(title);
      if (entry.body) {
        const body = document.createElement('div');
        // 诗分两栏（CSS 见 .daily-body.is-poem）：先把正文按空行拆成节，
        // 每节一个 <p>，分栏时整节不跨栏；节内的单换行仍靠 pre-line 保留
        const isPoem = category === 'poem';
        body.className = isPoem ? 'daily-body is-poem' : 'daily-body';
        if (isPoem) {
          // 按空行分段（节），每节一个 <p class="daily-stanza">；节内的换行靠 .daily-body 的
          // pre-line 保留。若整首诗没有空行（单块），则退化成按行拆成多个 <p class="daily-poem-line">——
          // 否则整首诗只有一个 <p>，会被 break-inside:avoid 卡在左栏、右栏空着，看起来就是"没分两列"。
          // 无论哪种拆法，都是多个独立 <p>，才能在两栏之间正常流动。
          const lines = entry.body.split(/\r?\n/);
          const groups = [];
          let cur = [];
          for (const ln of lines) {
            if (!ln.trim()) {
              if (cur.length) { groups.push(cur.join('\n')); cur = []; }
            } else {
              cur.push(ln.replace(/\s+$/, ''));
            }
          }
          if (cur.length) groups.push(cur.join('\n'));
          const lineMode = groups.length <= 1;
          const pieces = lineMode
            ? (groups[0] || '').split(/\r?\n/).map((s) => s.replace(/\s+$/, ''))
            : groups;
          pieces.filter((s) => s.trim()).forEach((piece) => {
            const p = document.createElement('p');
            p.className = lineMode ? 'daily-poem-line' : 'daily-stanza';
            p.textContent = piece;
            body.appendChild(p);
          });
        } else {
          body.textContent = entry.body;
        }
        dailyRoot.appendChild(body);
      }
    }
    // 字数变了：折叠线与展开箭头都要按新高度重量一次
    syncDailyFold();
  };

  const loadDaily = async (category) => {
    if (dailyCache[category] !== undefined) return dailyCache[category];
    let entry = null;
    try {
      const hit = await findDaily(category);
      if (hit) entry = splitDaily(hit.text);
    } catch {
      // 网络不通：当作没有，右栏保持空；刷新页面会重试
    }
    dailyCache[category] = entry;
    return entry;
  };

  /* —— music：屏内播放器 + 右栏歌词 ——
     歌单文件与 article / poem 同一套查找规则（daily/music/<日期>.txt），
     所以"发布"仍然只是 push 一个文本文件，不需要后端、不需要进数据库。
     播放器本体（dailyAudio）在屏幕之外，它只被这里读写，与视图切换完全无关。 */
  let musicTracks = [];
  let musicIndex = -1;   // -1 = 还没选过任何一首
  let musicError = false; // 直链打不开：屏内显示提示，切到下一首即清掉
  let musicFound;         // undefined = 还没找过；找过了则是 { tracks }

  const loadMusic = async () => {
    // musicTracks 在这里就要带上：进 music 屏（showDailyCategory）走的是 loadMusic，
    // 而它只看 musicTracks——不给的话屏内会一直显示"没有歌单"，
    // 直到用户按下播放（那条路经 ensureMusic 才赋值）才突然冒出曲名
    if (musicFound !== undefined) { musicTracks = musicFound.tracks; return musicFound; }
    let tracks = [];
    let image = '';
    try {
      const hit = await findDaily('music');
      // 配图跟着"找到的那一天"走，不是跟着今天：歌单回退到前几天的旧文件时，
      // 出现的也是那天的图，不会出现"昨天的歌配今天的图"
      if (hit) { tracks = parseMusic(hit.text); image = dailyImageName(hit.daysAgo); }
    } catch {
      // 网络不通：当作没有歌单；刷新页面会重试
    }
    musicFound = { tracks, image };
    musicTracks = tracks;
    return musicFound;
  };

  /** 秒 → m:ss；时长还没拿到（preload=none，没按下播放前一无所知）就是 --:-- */
  const clock = (sec) => {
    if (!isFinite(sec) || sec < 0) return '--:--';
    return Math.floor(sec / 60) + ':' + String(Math.floor(sec % 60)).padStart(2, '0');
  };

  /** 把当前曲目写进屏内三行。这是唯一会碰屏内 DOM 的函数，时间／进度都走它 */
  const renderMusic = () => {
    if (!dailyMusicEl) return;
    const track = musicTracks[musicIndex] || null;
    if (musicError || !track) {
      dailyMusicEl.classList.add('is-error');
      dailyMusicName.textContent = musicError ? '无法播放' : '没有歌单';
      dailyMusicTime.textContent = '';
      dailyMusicFill.style.width = '0%';
      return;
    }
    dailyMusicEl.classList.remove('is-error');
    dailyMusicName.textContent = track.name;
    dailyMusicTime.textContent = clock(dailyAudio.currentTime) + ' / ' + clock(dailyAudio.duration);
    const ratio = dailyAudio.duration ? dailyAudio.currentTime / dailyAudio.duration : 0;
    dailyMusicFill.style.width = (Math.min(1, Math.max(0, ratio)) * 100).toFixed(2) + '%';
  };

  /* 配图：挂在歌词下面。元素只建一次、切歌时反复用同一个（换曲不该重新下载同一张图），
     打不开就把自己摘掉并记下失败——不留在那儿占位，也不留一个 404 的破图 */
  let musicImageEl = null;
  let musicImageFailed = false;

  const appendDailyImage = () => {
    if (!musicFound || !musicFound.image || musicImageFailed) return;
    if (!musicImageEl) {
      const img = document.createElement('img');
      img.className = 'daily-figure';
      img.decoding = 'async';
      img.alt = '当日配图';
      // 图片到位／撤掉都会改变右栏高度：折叠线与展开箭头要按新高度重量一次
      img.addEventListener('load', syncDailyFold);
      img.addEventListener('error', () => {
        musicImageFailed = true;
        if (musicImageEl) musicImageEl.remove();
        syncDailyFold();
      });
      img.src = musicFound.image;
      musicImageEl = img;
    }
    dailyRoot.appendChild(musicImageEl);
  };

  /** 右栏换成当前曲目的歌词。用 .daily-title / .daily-body 那套样式，
      与 article、poem 的观感一致，只是标题位放曲名 */
  const renderLyrics = () => {
    dailyRoot.textContent = '';
    const track = musicTracks[musicIndex] || null;
    if (!track) return;
    const name = document.createElement('h3');
    name.className = 'daily-title';
    name.textContent = track.name;
    dailyRoot.appendChild(name);
    if (track.lyrics) {
      const body = document.createElement('div');
      body.className = 'daily-body';
      body.textContent = track.lyrics; // textContent：歌词里的尖括号不会被当标签执行
      dailyRoot.appendChild(body);
    }
    appendDailyImage();
    syncDailyFold();
  };

  /** 切到当前这一首。withLyrics=false 用于"在菜单屏按了播放"——
      那种情况下右栏还停在别的栏目上，不该被歌词抢走 */
  const applyMusicTrack = (withLyrics) => {
    musicError = false;
    const track = musicTracks[musicIndex] || null;
    const src = track ? track.src : '';
    // 同一首不重写 src：给 .src 赋值会重新走一遍加载算法，正在放的那首会被拉回开头
    if (dailyAudio.getAttribute('src') !== src) dailyAudio.setAttribute('src', src);
    renderMusic();
    if (withLyrics) renderLyrics();
  };

  const playMusic = () => {
    // 直链打不开（404 / 跨域 / 编码不支持）都会走到这里；只改标志位，不去动 musicIndex，
    // 用户切下一首就自然恢复
    dailyAudio.play().catch(() => { musicError = true; renderMusic(); });
  };

  /** 曲目没载入时先载入；返回是否真的准备好了 */
  const ensureMusic = async () => {
    if (!musicFound) await loadMusic();
    musicTracks = musicFound.tracks;
    if (!musicTracks.length) return false;
    if (musicIndex < 0 || musicIndex >= musicTracks.length) musicIndex = 0;
    return true;
  };

  const toggleMusic = async () => {
    if (!await ensureMusic()) { renderMusic(); return; }
    const needSrc = dailyAudio.getAttribute('src') !== musicTracks[musicIndex].src;
    if (needSrc || dailyAudio.paused) {
      if (needSrc) applyMusicTrack(false);
      playMusic();
    } else {
      dailyAudio.pause();
    }
  };

  /** 上一首／下一首。到两端就不动——真机也是到端即止，不回头绕一圈。
      autoplay：切之前本来在放就接着放，本来停着就停在暂停态（用户按下播放才算数） */
  const switchMusic = (dir, autoplay) => {
    const next = musicIndex + dir;
    if (next < 0 || next >= musicTracks.length) return;
    musicIndex = next;
    applyMusicTrack(true);
    if (autoplay) playMusic();
  };

  musicControl = (action) => {
    if (action === 'play') { toggleMusic(); return; }
    // 左右键只在 music 屏切歌（菜单屏那头由调用方继续滚列表，不在这里兜）。
    // 歌单还没取到就没有"上一首/下一首"可言，直接不动
    if (!musicTracks.length) return;
    switchMusic(action === 'prev' ? -1 : 1, !dailyAudio.paused);
  };

  if (dailyAudio) {
    // 进度与时长都直接读元素，不另存一份——存一份就要自己管同步，反而容易走偏
    dailyAudio.addEventListener('timeupdate', renderMusic);
    dailyAudio.addEventListener('durationchange', renderMusic);
    dailyAudio.addEventListener('loadedmetadata', renderMusic);
    dailyAudio.addEventListener('play', renderMusic);
    dailyAudio.addEventListener('pause', renderMusic);
    dailyAudio.addEventListener('error', () => { musicError = true; renderMusic(); });
    // 放完自动顺到下一首；已经是最后一首就停在末尾，不循环（PRD §14.2 不做循环）
    dailyAudio.addEventListener('ended', () => {
      if (musicIndex + 1 < musicTracks.length) switchMusic(1, true);
      else renderMusic();
    });
  }

  let dailySeq = 0;
  showDailyCategory = (category) => {
    const seq = ++dailySeq;
    if (category === 'music') {
      loadMusic().then(() => {
        if (seq !== dailySeq) return; // 期间又切了分类：这次结果作废
        if (musicTracks.length) {
          if (musicIndex < 0 || musicIndex >= musicTracks.length) musicIndex = 0;
          applyMusicTrack(true);
        } else {
          musicIndex = -1;
          renderMusic();
          renderLyrics();
        }
      });
      return;
    }
    loadDaily(category).then((entry) => {
      if (seq !== dailySeq) return; // 期间又切了分类：这次结果作废
      renderDaily(entry, category);
    });
  };

  // 默认显示 article
  showDailyCategory('article');
}

/* ---------- 每日单独页：/d/YYYY-MM-DD/<category> ----------
   内容仍是仓库扁平文件：按 URL 里的日期、分类，前端拉 daily/<分类>/<文件名>.txt 渲染。
   文件名不补前导零（2026_10_9.txt），从 ISO 日期用 Number() 拆零还原。 */
const dailyPageEl = document.getElementById('daily-page');
if (dailyPageEl) {
  const m = location.pathname.match(/^\/d\/(\d{4}-\d{2}-\d{2})\/(article|poem|music)\/?$/);
  const body = dailyPageEl.querySelector('.daily-page-body');
  if (!m || !body) {
    if (body) body.innerHTML = '<p class="daily-page-err">地址不对。</p>';
  } else {
    const iso = m[1];
    const category = m[2];
    const [Y, Mo, D] = iso.split('-');
    const file = Y + '_' + Number(Mo) + '_' + Number(D) + '.txt';
    (async () => {
      try {
        const res = await fetch(DAILY_BASE + category + '/' + file, { cache: 'no-store' });
        if (!res.ok) { body.innerHTML = '<p class="daily-page-err">这一天还没有内容。</p>'; return; }
        const text = (await res.text()).replace(/^\uFEFF/, '');
        if (category === 'music') renderDailyMusicPage(body, text);
        else renderDailyTextPage(body, text, category);
      } catch {
        body.innerHTML = '<p class="daily-page-err">读取失败，刷新重试。</p>';
      }
    })();
  }
}

/** 文/诗单独页：标题 + 正文；诗按空行分节，复用首页的 stanza / line 拆法 */
function renderDailyTextPage(container, text, category) {
  container.textContent = '';
  const { title, body: bodyText } = splitDaily(text);
  const h = document.createElement('h1');
  h.className = 'sheet-title';
  h.textContent = title;
  container.appendChild(h);
  if (bodyText) {
    const isPoem = category === 'poem';
    const b = document.createElement('div');
    b.className = isPoem ? 'sheet-body is-poem' : 'sheet-body';
    if (isPoem) {
      const lines = bodyText.split(/\r?\n/);
      const groups = [];
      let cur = [];
      for (const ln of lines) {
        if (!ln.trim()) { if (cur.length) { groups.push(cur.join('\n')); cur = []; } }
        else cur.push(ln.replace(/\s+$/, ''));
      }
      if (cur.length) groups.push(cur.join('\n'));
      const lineMode = groups.length <= 1;
      const pieces = lineMode ? (groups[0] || '').split(/\r?\n/).map((s) => s.replace(/\s+$/, '')) : groups;
      pieces.filter((s) => s.trim()).forEach((piece) => {
        const p = document.createElement('p');
        p.className = lineMode ? 'daily-poem-line' : 'daily-stanza';
        p.textContent = piece;
        b.appendChild(p);
      });
    } else {
      b.textContent = bodyText;
    }
    container.appendChild(b);
  }
  if (title) document.title = title + ' · 上帝之国';
}

/** 音乐单独页：歌单名 + 逐曲（点开即播、歌词原样），不依赖首页 iPod 播放器 */
function renderDailyMusicPage(container, text) {
  container.textContent = '';
  const tracks = parseMusic(text);
  const title = tracks.map((t) => t.name).join('、');
  if (title) {
    const h = document.createElement('h1');
    h.className = 'sheet-title';
    h.textContent = title;
    container.appendChild(h);
  }
  if (!tracks.length) {
    const p = document.createElement('p');
    p.className = 'daily-page-err';
    p.textContent = '歌单为空。';
    container.appendChild(p);
    return;
  }
  const list = document.createElement('ol');
  list.className = 'daily-tracklist';
  tracks.forEach((t, idx) => {
    const li = document.createElement('li');
    li.className = 'daily-track';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'daily-track-play';
    btn.textContent = (idx + 1) + '. ' + t.name;
    const audio = document.createElement('audio');
    audio.src = t.src;
    audio.preload = 'none';
    const lyrics = document.createElement('div');
    lyrics.className = 'daily-track-lyrics';
    if (t.lyrics) lyrics.textContent = t.lyrics;
    btn.addEventListener('click', () => {
      document.querySelectorAll('.daily-track audio').forEach((a) => { if (a !== audio) a.pause(); });
      audio.play().catch(() => {});
    });
    li.append(btn, audio, lyrics);
    list.appendChild(li);
  });
  container.appendChild(list);
  document.title = (title || '每日歌单') + ' · 上帝之国';
}

/* ---------- 右侧章节导航：滚动高亮当前区块 ---------- */
/* 点一项是锚点平滑跳转（html 已 smooth），这里只负责"滚到哪一段、哪一项反色"：
   取视口中线已经越过的最后一个区块，它就是当前正在看的。
   停在首屏（首图 / 留言那一段）时，中线还在第一个导航区块之上，循环一个都没命中，
   于是 activeId 保持 null、哪一项都不选中——首图部分各列留白、不抢戏。
   用 getBoundingClientRect 算绝对位置，避开 offsetTop 在定位祖先下的偏差。
   scroll 走 rAF 节流：滚动一帧最多算一次，不卡 */
const sideNav = document.querySelector('.side-nav');
if (sideNav) {
  const navLinks = Array.from(sideNav.querySelectorAll('a.side-nav-item'));
  const navTargets = navLinks
    .map((a) => ({ link: a, id: a.getAttribute('href').slice(1) }))
    .map((t) => ({ ...t, el: document.getElementById(t.id) }))
    .filter((t) => t.el);

  let navTick = false;
  const syncSideNav = () => {
    navTick = false;
    const line = window.scrollY + window.innerHeight / 2;
    // 默认 null：首图部分（还没滚过任何导航区块）不选中任何一项
    let activeId = null;
    for (const t of navTargets) {
      if (t.el.getBoundingClientRect().top + window.scrollY <= line) activeId = t.id;
    }
    navLinks.forEach((a) => {
      a.classList.toggle('is-active', a.getAttribute('href').slice(1) === activeId);
    });
  };
  const onNavScroll = () => {
    if (navTick) return;
    navTick = true;
    window.requestAnimationFrame(syncSideNav);
  };
  window.addEventListener('scroll', onNavScroll, { passive: true });
  window.addEventListener('resize', onNavScroll);
  syncSideNav();
}

// 跟随鼠标的反色圆：移动只改 transform，避免逐帧触发布局；
// 只在首屏（首页那张画）与页脚出现，其余内容区不打扰阅读；鼠标离开窗口也隐去
const cursorInvert = document.querySelector('.cursor-invert');
const INVERT_SHOW = '.hero, .footer';
// 只把留言板的表单与留言墙排除在外：输入框要看清、要光标，让一个硕大的反色圆
// 在光标旁把白底黑字反复翻转，是干扰而不是效果。底部的照片流则保留反色圆——
// 在那块区域让光标变成反色圆、反相底色，刚好贴合"照片从黑里流出来"的感觉
const INVERT_MUTE = '.guest-form, .guest-wall';
// 触屏设备没有鼠标可跟：手指点一下会合成一次 mousemove，若照旧监听，
// 反色圆会突然出现在手指位置，并且因为再也收不到"离开"事件而一直挂在屏幕上。
// 所以整套跟随逻辑只在"能悬停且指针精确"的设备上注册（CSS 里 .cursor-invert
// 也已在 (hover: none) 下 display: none，两层都收掉才不留下空转的滤镜层）
const HOVER_CAPABLE = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
if (HOVER_CAPABLE) {
  document.addEventListener('mousemove', (e) => {
    const dx = e.clientX;
    const dy = e.clientY;
    cursorInvert.style.transform = 'translate3d(' + dx + 'px,' + dy + 'px,0) translate(-50%,-50%)';
    const t = e.target;
    const overShow = !!(t && t.closest && t.closest(INVERT_SHOW) && !t.closest(INVERT_MUTE));
    cursorInvert.classList.toggle('on', overShow);
    // 系统光标与反色圆同进同退：同一个布尔值控制两者，不会出现"有圆无光标"或反之
    document.body.classList.toggle('cursor-hidden', overShow);
  });
  document.addEventListener('mouseleave', () => {
    cursorInvert.classList.remove('on');
    document.body.classList.remove('cursor-hidden');
  });
}

// 页脚「关于」与「留言板」：两块互斥——展开其中一块时把另一块收起。
// 收起就是删掉 .expanded，走的是同一条 max-height 过渡，所以"关掉"天然带 0.6s 动效
const footerAbout = document.querySelector('.footer-about');
const footerGuestbook = document.querySelector('.footer-guestbook');

// 「留言板」的标签在入口行里，展开区在行外，是两个元素，
// 所以展开态要同时挂到两者上：一个管展开区高度，一个管箭头方向
const guestbookLabel = document.querySelector('.footer-guestbook-label');

if (footerAbout) {
  footerAbout.addEventListener('click', (e) => {
    // 入口行也包在这一块里，点「投稿」链接和「留言板」标签都要放行给它们自己。
    // .footer-social-item：社交链接在展开区里面，点击会冒泡上来被当成"再点一次关于"而收起面板——
    // 链接必须放行，否则点完图标面板就自己关了
    if (e.target.closest && (e.target.closest('.footer-submit') ||
        e.target.closest('.footer-guestbook-label') ||
        e.target.closest('.footer-social-item'))) return;
    const expanding = !footerAbout.classList.contains('expanded');
    footerAbout.classList.toggle('expanded');
    if (expanding && footerGuestbook) {
      footerGuestbook.classList.remove('expanded');
      if (guestbookLabel) guestbookLabel.classList.remove('expanded');
    }
  });
}

if (guestbookLabel && footerGuestbook) {
  guestbookLabel.addEventListener('click', () => {
    const expanding = !footerGuestbook.classList.contains('expanded');
    footerGuestbook.classList.toggle('expanded', expanding);
    guestbookLabel.classList.toggle('expanded', expanding);
    if (expanding && footerAbout) footerAbout.classList.remove('expanded');
  });
}

// 留言板：历史留言由服务端渲染进 HTML（脚本失效也能看到），这里只负责提交新增那一条。
// 提交走 POST /api/guestbook（multipart，图片随表单一起上传）
const guestForm = document.querySelector('.guest-form');
const guestWall = document.querySelector('.guest-wall');
const guestFile = document.querySelector('.guest-file');
const guestPreview = document.querySelector('.guest-upload-preview');

if (guestFile && guestPreview) {
  guestFile.addEventListener('change', () => {
    const file = guestFile.files && guestFile.files[0];
    if (!file) {
      guestPreview.classList.remove('on');
      guestPreview.removeAttribute('src');
      return;
    }
    guestPreview.src = URL.createObjectURL(file);
    guestPreview.classList.add('on');
  });
}

// 服务端返回的一条留言 → 墙上那块 DOM。
// 昵称、正文一律走 textContent：用户输入不会被当成 HTML 解析
function renderNote(item) {
  const note = document.createElement('div');
  note.className = 'guest-note';
  note.dataset.id = item.id;

  const head = document.createElement('p');
  head.className = 'guest-note-head';
  const nameEl = document.createElement('span');
  nameEl.className = 'guest-note-name';
  nameEl.textContent = item.name || '匿名';
  const dateEl = document.createElement('span');
  dateEl.textContent = item.date;
  head.appendChild(nameEl);
  head.appendChild(dateEl);
  note.appendChild(head);

  if (item.body) {
    const textEl = document.createElement('p');
    textEl.className = 'guest-note-text';
    textEl.textContent = item.body;
    note.appendChild(textEl);
  }

  if (item.imageUrl) {
    const img = document.createElement('img');
    img.className = 'guest-note-img';
    img.alt = (item.name || '匿名') + ' 上传的图片';
    // 留言照片走图床，体积不可控：懒加载 + 异步解码，别拖住首屏
    img.loading = 'lazy';
    img.decoding = 'async';
    img.src = item.imageUrl;
    note.appendChild(img);
  }
  return note;
}

// 出错提示：节点只在出错时才由脚本创建，常态不存在，不影响既有排版
function showGuestHint(message) {
  const old = guestForm && guestForm.querySelector('.guest-form-hint');
  if (old) old.remove();
  if (!guestForm || !message) return;
  const hint = document.createElement('p');
  hint.className = 'guest-form-hint';
  hint.textContent = message;
  guestForm.appendChild(hint);
}

if (guestForm && guestWall) {
  const guestSubmit = guestForm.querySelector('.guest-submit');

  guestForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    showGuestHint('');
    const name = guestForm.querySelector('.guest-name').value.trim();
    const text = guestForm.querySelector('.guest-textarea').value.trim();
    const file = guestFile && guestFile.files ? guestFile.files[0] : null;
    if (!text && !file) {
      showGuestHint('写点什么，或者选一张图片。');
      return;
    }

    const payload = new FormData();
    payload.append('name', name);
    payload.append('body', text);
    if (file) payload.append('image', file);

    if (guestSubmit) guestSubmit.disabled = true;
    try {
      const res = await fetch(API_BASE + '/api/guestbook', { method: 'POST', body: payload, credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '留言没有发出去');

      const emptyHint = guestWall.querySelector('.guest-wall-empty');
      if (emptyHint) emptyHint.remove();
      guestWall.prepend(renderNote(data));
      // 刚留的这条立刻变成"我的"，可以撤回
      markMyNotes([data.id]);

      guestForm.reset();
      if (guestPreview) {
        guestPreview.classList.remove('on');
        guestPreview.removeAttribute('src');
      }
      // 留成了，草稿没用了
      fetch(API_BASE + '/api/drafts?slot=guestbook', { method: 'DELETE', credentials: 'include' }).catch(() => {});
    } catch (err) {
      // 失败时保留已填内容，只给出提示
      showGuestHint(err.message || '留言没有发出去，请稍后再试。');
    } finally {
      if (guestSubmit) guestSubmit.disabled = false;
    }
  });
}

// ---- 设备即账号 ----
// 没有注册登录：服务端给每台设备发一个签名 Cookie 当身份。这里问一次「哪些是我留的」，
// 把自己的留言标出来并给一个撤回入口。走独立接口而不是写进 SSR，
// 是为了让首页与设备无关 —— 页面可缓存，也不会把一个人的名字串给另一个人看
function markMyNotes(ids) {
  const mine = new Set((ids || []).map(String));
  guestWall.querySelectorAll('.guest-note').forEach((note) => {
    if (!mine.has(note.dataset.id)) return;
    if (note.querySelector('.guest-note-mine')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'guest-note-mine';
    btn.textContent = '撤回';
    btn.addEventListener('click', async () => {
      if (!confirm('撤回这条留言？')) return;
      const res = await fetch(API_BASE + '/api/guestbook/' + note.dataset.id, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) return;
      note.remove();
      if (!guestWall.querySelector('.guest-note')) {
        const empty = document.createElement('p');
        empty.className = 'guest-wall-empty';
        empty.textContent = '还没有留言';
        guestWall.appendChild(empty);
      }
    });
    note.appendChild(btn);
  });
}

if (guestWall) {
  fetch(API_BASE + '/api/guestbook/mine', { credentials: 'include' })
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      if (!data) return;
      const nameInput = guestForm && guestForm.querySelector('.guest-name');
      if (data.nickname && nameInput && !nameInput.value) nameInput.value = data.nickname;
      markMyNotes(data.ids);
    })
    .catch(() => {
      /* 拿不到就当游客，不打扰 */
    });
}

// ---- 写到一半 ----
// 留言也是"表达"，同样会被打断。随打字自动存一份在这台设备上，
// 刷新或改天回来，半截话还在。留言成功后草稿清掉。
if (guestForm) {
  const gName = guestForm.querySelector('.guest-name');
  const gText = guestForm.querySelector('.guest-textarea');
  let draftTimer = null;
  const saveDraft = () => {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => {
      const body = gText ? gText.value : '';
      const name = gName ? gName.value : '';
      if (!body.trim() && !name.trim()) return;
      fetch(API_BASE + '/api/drafts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slot: 'guestbook', name, body }),
        credentials: 'include',
      }).catch(() => {});
    }, 800);
  };
  if (gText) gText.addEventListener('input', saveDraft);
  if (gName) gName.addEventListener('input', saveDraft);

  fetch(API_BASE + '/api/drafts?slot=guestbook', { credentials: 'include' })
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      const d = data && data.draft;
      if (!d) return;
      if (gText && !gText.value && d.body) gText.value = d.body;
      if (gName && !gName.value && d.name) gName.value = d.name;
    })
    .catch(() => {});
}

// 文章展开/收起：箭头方向由 CSS 的 .expanded 状态控制，此处只切换状态
const articleItems = document.querySelectorAll('.article-item');
articleItems.forEach((item) => {
  item.addEventListener('click', () => {
    item.classList.toggle('expanded');
  });
});

// 把可点击文字拆成单字 span，供悬停时逐字错相位抖动（见 CSS 的 .jitter-char）。
// 字符变 inline-block 后 letter-spacing 不再作用于字符之间，所以先把父元素的原字距读出来，
// 改写成每个 span 的 margin-right（末字也留一份，才能与原样逐像素对齐），再把父元素字距清零。
// 空白字符保持为文本节点——包进 inline-block 会被折叠掉宽度，字与箭头之间的空隙就没了。
// 箭头等装饰元素（aria-hidden）不拆，免得它们跟着抖。
// a:not(.month-post)：档案馆月份面板里的文章行是 display:flex 的"标题—日期"两端对齐，
// 一旦把标题拆成多个 inline-block 的 span，每个 span 都会变成独立的 flex 项，
// 被 justify-content: space-between 摊到整行上——标题散架、也不再像卡片里的标题。
// 用户要求这一处"不要抖动、标题与前面的文章标题保持一致且左对齐"，故整体排除，不做拆字。
// a:not(.hero-cn-hl)：刊名里的「之」是管理台入口（一个 <a>），用户明确要求它不抖。
// 抖动动画的选择器是 :is(a,…):hover .jitter-char——只要不把它拆成 .jitter-char，就抖不起来；
// 而且它身上那枚反色取景窗是它的 ::before，拆字后视觉重心也会跟着变，索性整体放过。
document.querySelectorAll('a:not(.month-post):not(.hero-cn-hl):not(.side-nav-item):not(.archive-random-link), .footer-about-label, .footer-guestbook-label, .footer-name, .footer-credit').forEach((el) => {
  const ls = parseFloat(getComputedStyle(el).letterSpacing) || 0;
  if (ls) el.style.letterSpacing = '0px';

  const split = (node) => {
    Array.from(node.childNodes).forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        const frag = document.createDocumentFragment();
        Array.from(child.textContent).forEach((ch) => {
          if (ch.trim() === '') {
            frag.appendChild(document.createTextNode(ch));
            return;
          }
          const span = document.createElement('span');
          span.className = 'jitter-char';
          span.textContent = ch;
          if (ls) span.style.marginRight = ls + 'px';
          frag.appendChild(span);
        });
        child.replaceWith(frag);
      } else if (child.nodeType === Node.ELEMENT_NODE &&
                 !child.hasAttribute('aria-hidden') &&
                 !child.classList.contains('footer-submit-arrow')) {
        split(child);
      }
    });
  };
  split(el);
});

// 档案馆年份组：悬停停留一小会才展开（鼠标提前离开则取消，这才是真正的悬停意图）；
// 展开后不因鼠标离开而收起；同一时刻最多展开一年，且先收旧再开新，两者前后进行不重叠
const ARCHIVE_HOVER_INTENT = 900; // 悬停停留多久才算想展开
const ARCHIVE_COLLAPSE_MS = 600;  // 收起动画时长，须与 .archive-items 的 max-height 过渡一致

// 收回一个年份：收起月份区，并清空该年里点开的月份选择
// 面板 DOM 内容留着无妨：它是隐藏的，下一次点月份会被整体覆盖，避免清空与重开之间的竞态
function closeArchiveGroup(group) {
  group.classList.remove('open');
  const panel = group.querySelector('.month-posts-panel');
  if (!panel) return;
  panel.classList.remove('open');
  panel.dataset.month = '';
}

document.querySelectorAll('.archive-group').forEach(group => {
  let intentTimer = null;
  let openTimer = null;

  if (HOVER_CAPABLE) {
    group.addEventListener('mouseenter', () => {
      clearTimeout(intentTimer);
      clearTimeout(openTimer);
      intentTimer = setTimeout(() => {
        const others = Array.from(document.querySelectorAll('.archive-group.open')).filter(g => g !== group);
        if (others.length === 0) {
          group.classList.add('open');
          return;
        }
        // 先让上一个年份收完，再展开本年——错开进行，避免两者同帧动画互相掩盖
        others.forEach(closeArchiveGroup);
        openTimer = setTimeout(() => group.classList.add('open'), ARCHIVE_COLLAPSE_MS);
      }, ARCHIVE_HOVER_INTENT);
    });

    // 只取消"还没下定决心"的悬停；一旦过了意图时长就视为已确认，让整套收起→展开走完
    group.addEventListener('mouseleave', () => {
      clearTimeout(intentTimer);
    });
  } else {
    // 触屏没有"悬停停留"这回事，改成点一下年份行立刻展开 / 收起。
    // 若照旧走 mouseenter + 900ms 计时器，点一下要等将近一秒才有反应；
    // 而且点第二下时，document 上那个"点外部收起"的守卫会把 .archive-year 放行掉，
    // 等于点年份行关不掉——只剩点空白处才收得回去
    const yearRow = group.querySelector('.archive-year');
    if (yearRow) {
      yearRow.addEventListener('click', () => {
        const opening = !group.classList.contains('open');
        // "同时最多展开一年"这条约束在触屏上照旧保留；
        // 但不必等旧的收完再开新的——手指点按是明确指令，等 600ms 只会显得卡顿
        document.querySelectorAll('.archive-group.open').forEach(g => {
          if (g !== group) closeArchiveGroup(g);
        });
        if (opening) group.classList.add('open');
        else closeArchiveGroup(group);
      });
    }
  }
});

// 「最近的一年」默认展开：open 类由服务端直接渲染在 HTML 里，这里是首屏绘制内容的一部分，
// 不会触发 max-height 过渡。不再由脚本在解析期补 class——那样在脚本失效时会漏掉默认展开状态。

// 点击「年份行 / 月份框（含展开的文章列表）」以外的任何位置都收回——
// 包括档案馆内部的其他区域（标题、留白）和板块之外的地方
document.addEventListener('click', (e) => {
  const t = e.target;
  if (!t.closest) return;
  if (t.closest('.archive-year') || t.closest('.archive-months') || t.closest('.month-posts-panel')) return;
  document.querySelectorAll('.archive-group.open').forEach(closeArchiveGroup);
});

// 月份方块：点一下把该月文章列表搬进下方面板展开，再点一下收起
document.querySelectorAll('.archive-month').forEach(month => {
  const list = month.querySelector('.month-posts');
  if (!list || list.children.length === 0) return;
  month.addEventListener('click', () => {
    const panel = month.closest('.archive-items').querySelector('.month-posts-panel');
    const key = month.querySelector('.month-num').textContent;
    if (panel.classList.contains('open') && panel.dataset.month === key) {
      panel.classList.remove('open');
      panel.dataset.month = '';
      return;
    }
    panel.innerHTML = list.innerHTML;
    panel.dataset.month = key;
    panel.classList.add('open');
  });
});

// 美术馆横滑胶片：全宽铺开，卡片宽度一致、高度高低交替，切到尽头会绕回开头。
// 索引按"第几张"记账而不是按像素——窗口变窄变宽后一张卡的宽度会变，
// 记死的像素值立刻失效；所以每次尺寸变化都重新用 offsetLeft 量一遍落点。
// 箭头 / 圆点 / 拖拽 / ←→ 四个入口改的都是同一个虚拟索引 v，再各自渲染。
// 位移走 translateX、视口 overflow:hidden 切掉溢出，与浦东美术馆官网的做法一致。
document.querySelectorAll('[data-museum-strip]').forEach((strip) => {
  const viewport = strip.querySelector('[data-museum-viewport]');
  const track = strip.querySelector('[data-museum-track]');
  // 离散翻页的位移写在 .museum-shift 这层（轨道那份 transform 归自动漂移的 CSS 动画）。
  // 模板没给这层时退回 track：此时漂移动画会与脚本打架，但至少不会直接报错
  const shift = strip.querySelector('[data-museum-shift]') || track;
  const dotsBox = strip.querySelector('[data-museum-dots]');
  const prevBtn = strip.querySelector('[data-museum-prev]');
  const nextBtn = strip.querySelector('[data-museum-next]');
  if (!viewport || !track || !dotsBox || track.children.length === 0) return;

  const DRIFT_SPEED = 20; // 自动漂移速度，px/秒（"缓慢"：一张卡约 12 秒走过去）

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const originals = Array.from(track.children);
  const SET = originals.length; // 一套作品有几张

  // 循环列表：两端各克隆一整套作品，于是任意一张都能继续往两边滑，永远不到头。
  // 克隆体标 aria-hidden，键盘与读屏只认中间那套原件。
  // 克隆不会打乱 :nth-child 的高低交替：SET 是偶数，前置一套之后原件的奇偶性不变
  const makeClones = () =>
    originals.map((card) => {
      const clone = card.cloneNode(true);
      clone.classList.add('museum-card--clone');
      clone.setAttribute('aria-hidden', 'true');
      return clone;
    });
  makeClones().forEach((c) => track.insertBefore(c, originals[0])); // 前置一套
  makeClones().forEach((c) => track.appendChild(c)); // 后置一套
  // 此刻轨道上共 3 套：[0,SET) 前置 | [SET,2SET) 原件 | [2SET,3SET) 后置
  const cards = Array.from(track.children);

  // v 是"虚拟索引"，指向 3 套里的某一张。平时被收敛在中间那套（v ∈ [SET, 2*SET)），
  // 一旦滑出这个范围就整体挪回一个循环（见 normalize）——
  // 两端内容逐张相同，所以这一挪画面完全不变，看不出接缝。
  // 归位必须跟"写目标位移"发生在同一时刻，绝不能挂在 transitionend 上：
  // 快速连点时上一段过渡会被下一次 render 直接打断，transitionend 根本不会来，
  // 而 v 早已越过轨道末尾（pos[v] 变 undefined → translateX(NaNpx) 是非法值被忽略），
  // 画面就永久卡死在原地——这正是"快速点下一页会卡"的根因。
  // 所以这里改成：每次 render 先归一化索引（并把动画途中的位移一起补掉），再写目标。
  let pos = [];
  let cycle = 0; // 一套作品的像素宽（= pos[SET] - pos[0]）；内容每 cycle 像素完全重复
  let v = SET; // 起始 = 原件里的第 0 张

  // 每张卡的落点 = 它的 offsetLeft。有两侧克隆垫着，中间那套的任意一张都能被拉到左边缘，
  // 所以不需要再夹到"最后一屏"，也不会拉出右侧空白
  const measure = () => {
    pos = cards.map((card) => card.offsetLeft);
    if (pos.length <= SET) return;
    // cycle 用 getBoundingClientRect 的差值来算：所有卡都在同几个 transform 容器里，
    // 祖先的位移相减时抵消，剩下的是精确到亚像素的一整套作品宽度。
    // offsetLeft 会被取整，用它算 cycle 会让动画每次循环回到起点时错开一两像素（看得见接缝）
    const r0 = cards[0].getBoundingClientRect().left;
    const c = cards[SET].getBoundingClientRect().left - r0;
    // 值没变就别碰 CSS 变量：measure 每次翻页都会跑，反复重写这两个变量
    // 会让浏览器重新解析关键帧、把漂移动画的相位抖一下
    if (c === cycle) return;
    cycle = c;
    // 把漂移的一个循环宽度与时长写到 .museum-strip（时长 = 距离 ÷ 速度，
    // 于是速度恒定 px/秒，窗口变宽变窄都不影响观感）
    strip.style.setProperty('--drift-dist', cycle + 'px');
    strip.style.setProperty('--drift-dur', cycle / DRIFT_SPEED + 's');
  };

  // 读"此刻动画到哪了"：过渡进行中读到的是中间值，静止时就是当前落点。
  // 必须读 .museum-shift 而不是轨道——轨道的 transform 正被漂移动画占着。
  // 还是 none（一次都没写过）时返回 null，调用方跳过平移即可
  const currentShift = () => {
    const t = getComputedStyle(shift).transform;
    if (!t || t === 'none') return null;
    try { return new DOMMatrixReadOnly(t).m41; } catch (_) { return null; }
  };

  // 把"当前动画中的位置"整体平移 delta 像素。内容每 cycle 像素重复一次，
  // 平移整数个 cycle 画面逐像素相同；不补这一下，光改索引就会让目标跳一个循环，
  // 而位移起点还停在原处，浏览器会把这段差值也补间出来（看起来是突然甩一下）
  const wrapBy = (delta) => {
    const cur = currentShift();
    if (cur === null) return;
    const keep = shift.style.transition;
    shift.style.transition = 'none';
    shift.style.transform = `translateX(${cur + delta}px)`;
    void track.offsetWidth; // 强制回流：先把"无过渡的这一帧"提交下去，交回过渡时才不会把平移也补间
    shift.style.transition = keep;
  };

  // 收敛虚拟索引：越左界 +SET、越右界 -SET，同步把位移补回一个循环，画面不动
  const normalize = () => {
    if (!cycle) return;
    while (v >= 2 * SET) { v -= SET; wrapBy(cycle); }
    while (v < SET) { v += SET; wrapBy(-cycle); }
  };

  const render = () => {
    // 每次渲染前重量一遍：窗口宽度变化会让每张卡的落点整体移位，
    // 缓存下来的像素值会失准（这也是不把像素值记死的原因）
    measure();
    if (!pos.length) return;
    // 先归位再写目标：两步在同一次同步执行里完成，中间不给浏览器插帧的机会
    normalize();
    shift.style.transform = `translateX(${-pos[v]}px)`;

    // 圆点 = 一套作品一张。只在"个数变了"时重建：
    // 否则悬停让落点个数一有变化就会销毁重建按钮，指针底下那个会闪
    if (dotsBox.children.length !== SET) {
      dotsBox.innerHTML = '';
      originals.forEach((_, i) => {
        const dot = document.createElement('button');
        dot.type = 'button';
        dot.className = 'museum-dot';
        dot.setAttribute('aria-label', `第 ${i + 1} 张`);
        dot.addEventListener('click', () => { v = SET + i; render(); });
        dotsBox.appendChild(dot);
      });
    }
    // v 落在第几张：虚拟索引对一套取模即可
    const active = ((v % SET) + SET) % SET;
    Array.from(dotsBox.children).forEach((dot, i) => {
      if (i === active) dot.setAttribute('aria-current', 'true');
      else dot.removeAttribute('aria-current');
    });
  };

  const step = (delta) => { v += delta; render(); };

  if (prevBtn) prevBtn.addEventListener('click', () => step(-1));
  if (nextBtn) nextBtn.addEventListener('click', () => step(1));

  // 键盘：聚焦胶片后 ←→ 翻页
  strip.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { step(-1); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { step(1); e.preventDefault(); }
  });

  // 拖拽换页。拖拽中关掉 CSS 过渡让轨道跟手，松手再交还给 CSS 做缓动。
  let startX = 0;
  let baseShift = 0;
  let dragging = false;
  let moved = 0;

  viewport.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return; // 只认左键 / 触摸 / 笔尖；右键菜单不参与横滑
    dragging = true;
    // 拖拽期间冻住悬停外扩：指针这时必然压在某张卡上，不冻住就会一边跟手一边鼓起来
    strip.classList.add('is-dragging');
    startX = e.clientX;
    baseShift = pos[v] || 0;
    moved = 0;
    shift.style.transition = 'none';
    if (viewport.setPointerCapture) viewport.setPointerCapture(e.pointerId);
  });

  viewport.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    // 跟手位移夹在 ±2 张以内：拖得再远也只走一步，又不至于把两侧克隆拉穿、露出空白
    const span = (pos[v + 1] || pos[v]) - pos[v];
    const raw = e.clientX - startX;
    moved = Math.max(-2 * span, Math.min(2 * span, raw));
    shift.style.transform = `translateX(${-baseShift + moved}px)`;
  });

  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    strip.classList.remove('is-dragging');
    // 置空 = 交回 CSS 里那条过渡（系统开了"减少动态效果"时它本身也是 none）
    shift.style.transition = prefersReduced ? 'none' : '';
    // 40px 阈值：太灵敏会把轻触当翻页，太钝则拖了半屏还不换
    if (moved <= -40) v += 1;
    else if (moved >= 40) v -= 1;
    render();
  };

  viewport.addEventListener('pointerup', endDrag);
  viewport.addEventListener('pointercancel', endDrag);
  // 指针滑出视口时 pointerup 可能落在别处，靠这个事件兜底，否则会卡在"跟手"状态
  viewport.addEventListener('lostpointercapture', endDrag);

  window.addEventListener('resize', render);

  render();
});
