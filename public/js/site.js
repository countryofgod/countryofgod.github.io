// iPod 转盘：MENU 回到上一页（真机就是返回键）。
// 已经在菜单那一屏时没有上一屏可退，这时回站点首页。
// 上一首／下一首／播放暂停三个键已定位并可点，具体行为待定，先不接。
document.querySelectorAll('.daily-ipod-btn[data-ipod="menu"]').forEach(btn => {
  btn.addEventListener('click', () => {
    if (history.length > 1) history.back();
    else location.href = '/';
  });
});

// 屏内视图切换：点 music 是在这块屏幕里换一屏，不跳 URL、不换页面。
// 用 pushState 记一层，MENU 才能靠 history.back() 退回上一个视图；
// 浏览器前进／后退触发 popstate，再把视图同步回来。
// article / poem 不是屏幕里的视图：它们是"右栏显示哪一类当天内容"的开关（见下面 Daily 段）。
const ipodScreen = document.querySelector('.daily-ipod-screen');

/** 切右栏看 article 还是 poem；由下面的 Daily 段赋值（页面里没有 Daily 区块时保持空函数） */
let showDailyCategory = () => {};

if (ipodScreen) {
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
    // article / poem 不进屏幕视图：切的是右栏显示哪一类的当天内容
    if (target === 'article' || target === 'poem') {
      showDailyCategory(target);
      return;
    }
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

  document.querySelectorAll('.daily-ipod-btn[data-ipod="prev"]').forEach(btn => {
    btn.addEventListener('click', () => scrollIpodList(-1));
  });
  document.querySelectorAll('.daily-ipod-btn[data-ipod="next"]').forEach(btn => {
    btn.addEventListener('click', () => scrollIpodList(1));
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

  window.addEventListener('popstate', () => showIpodView(currentIpodView()));
  showIpodView(currentIpodView());
}

/* ---------- Daily 右栏：当天的 article / poem ----------
   内容不在数据库里，是仓库里的纯文本文件：
     daily/article/2026_10_8.txt（article 类）
     daily/poem/2026_10_8.txt   （poem 类）
   文件名就是发布日期：年_月_日，月、日不补前导零；push 一个文件 = 发布那一天那一篇。
   页面按"今天"取当天的文件，当天没有就往前逐天找最近的一篇（最多往回 60 天）。
   文件第一行是标题，其余行是正文；正文的换行原样保留（.daily-body 是 pre-line）。
   iPod 菜单里的 article / poem 决定看哪一类，默认 article。
   文本一律走 textContent：拼 HTML 会把文件里的尖括号当标签执行。 */
const dailyGrid = document.querySelector('.daily-grid');
if (dailyGrid) {
  // 被裁的是 .daily-fold（视窗），不是正文那层——正文那层必须保持普通块盒，
  // 它一旦 overflow: hidden 就会躲到机身右侧，展开后也只有半栏
  const dailyFold = dailyGrid.querySelector('.daily-fold');
  const dailyToggle = dailyGrid.querySelector('[data-daily-toggle]');
  const dailyIpod = dailyGrid.querySelector('.daily-ipod');
  const dailyRoot = dailyGrid.querySelector('.daily-content');

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

  /** 某一天的文件；404 回 null（那天没有），网络不通抛错交给调用方 */
  const probeDaily = async (category, daysAgo) => {
    // no-store：push 当天文件后刷新就能看到，不在浏览器里留住旧的 404
    const res = await fetch('daily/' + category + '/' + dailyFileName(daysAgo), { cache: 'no-store' });
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

  /** 第一行是标题（跳过开头的空行），其余是正文 */
  const splitDaily = (text) => {
    const lines = text.split(/\r?\n/);
    let i = 0;
    while (i < lines.length && !lines[i].trim()) i++;
    return {
      title: (lines[i] || '').trim(),
      body: lines.slice(i + 1).join('\n').replace(/^\n+/, '').replace(/\s+$/, ''),
    };
  };

  const renderDaily = (entry) => {
    dailyRoot.textContent = '';
    if (entry) {
      const title = document.createElement('h3');
      title.className = 'daily-title';
      title.textContent = entry.title;
      dailyRoot.appendChild(title);
      if (entry.body) {
        const body = document.createElement('div');
        body.className = 'daily-body';
        body.textContent = entry.body;
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

  let dailySeq = 0;
  showDailyCategory = (category) => {
    const seq = ++dailySeq;
    loadDaily(category).then((entry) => {
      if (seq !== dailySeq) return; // 期间又切了分类：这次结果作废
      renderDaily(entry);
    });
  };

  // 默认显示 article
  showDailyCategory('article');
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
      const res = await fetch('/api/guestbook', { method: 'POST', body: payload });
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
      fetch('/api/drafts?slot=guestbook', { method: 'DELETE' }).catch(() => {});
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
      const res = await fetch('/api/guestbook/' + note.dataset.id, { method: 'DELETE' });
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
  fetch('/api/guestbook/mine')
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
      fetch('/api/drafts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slot: 'guestbook', name, body }),
      }).catch(() => {});
    }, 800);
  };
  if (gText) gText.addEventListener('input', saveDraft);
  if (gName) gName.addEventListener('input', saveDraft);

  fetch('/api/drafts?slot=guestbook')
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
document.querySelectorAll('a:not(.month-post):not(.hero-cn-hl), .footer-about-label, .footer-guestbook-label, .footer-name, .footer-credit').forEach((el) => {
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
