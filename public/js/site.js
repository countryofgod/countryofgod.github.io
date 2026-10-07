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
