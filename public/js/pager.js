// 翻页模式（Pager）驱动脚本。
//
// 整站是「一屏一页横着翻」：六个版块（首屏 / daily / latest / archive / museum /
// footer）在 index.ejs 里被包进 .pager-page、横向排开，这里负责唯一的位移——
//   translateX(-第几页 × 100%)
// 以及全部翻页入口：
//   · 右下角 nav（.side-nav）点任意一项 → 平移到对应一页
// 版块内部滚动用每页自己的 scrollTop，翻页不清位——回到一页时停在原来读到的地方。
//
// 必须排在 site.js 之后加载：高亮导航用的 __sideNavSetActive 由它挂出来。
// 所有行为都以 [data-pager] 存在为前提： article / admin 等普通页面加载本文件也安全。
(() => {
  const pager = document.querySelector('[data-pager]');
  if (!pager) return;

  const track = pager.querySelector('[data-pager-track]');
  if (!track) return;
  const pages = Array.from(track.children);
  if (pages.length === 0) return;

  const nav = document.querySelector('.side-nav');
  const pubToc = document.querySelector('#latest .pub-toc');
  const pubNext = document.querySelector('#latest .pub-next');
  const footerBottom = document.querySelector('#about .footer-bottom');
  let index = 0;

  // ---- 页与导航的对应 ----
  // 每页带 data-pager-page（首屏是 "top"，没有对应导航项）；
  // 导航链接按 href 的锚点 id 命中同一张表
  const idToIndex = {};
  pages.forEach((p, i) => {
    const id = p.dataset.pagerPage || p.id;
    if (id) idToIndex[id] = i;
  });

  if (footerBottom && 'about' in idToIndex) {
    pages[idToIndex.about].appendChild(footerBottom);
  }

  if ('latest' in idToIndex && (pubToc || pubNext)) {
    const pubControls = document.createElement('div');
    pubControls.className = 'pager-pub-controls';
    pubControls.style.left = (idToIndex.latest * 100) + '%';
    if (pubToc) pubControls.appendChild(pubToc);
    if (pubNext) pubControls.appendChild(pubNext);
    track.appendChild(pubControls);
  }

  const activeIdOf = (i) => pages[i].dataset.pagerPage || pages[i].id || '';

  const setNavActive = () => {
    const id = activeIdOf(index);
    document.body.dataset.pagerActive = id;
    // 首屏也有自己的导航项（thème → #top），照常点亮
    if (window.__sideNavSetActive) window.__sideNavSetActive(id);
  };

  const apply = (animate) => {
    track.style.transition = animate ? '' : 'none';
    track.style.transform = 'translateX(' + (-index * 100) + '%)';
    if (!animate) {
      // 强制一帧后再把过渡还回去，跳页（初始锚点 / resize）才不会闪一段补间
      void track.offsetWidth;
      track.style.transition = '';
    }
    setNavActive();
  };

  const goTo = (i, animate = true) => {
    const next = Math.max(0, Math.min(pages.length - 1, i));
    if (next === index) { apply(animate); return; }
    index = next;
    apply(animate);
  };

  let touchStart = null;
  pager.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'touch' || !event.isPrimary) return;
    if (event.target.closest('a, button, input, textarea, select, [contenteditable="true"], .guest-drawer, .museum-viewport')) return;
    touchStart = { x: event.clientX, y: event.clientY };
  });
  pager.addEventListener('pointerup', (event) => {
    if (!touchStart || !event.isPrimary) return;
    const deltaX = event.clientX - touchStart.x;
    const deltaY = event.clientY - touchStart.y;
    touchStart = null;
    if (Math.abs(deltaX) < 48 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.25) return;
    const nextIndex = Math.max(0, Math.min(pages.length - 1, index + (deltaX < 0 ? 1 : -1)));
    if (nextIndex === index) return;
    const targetId = activeIdOf(nextIndex);
    if (location.hash !== '#' + targetId) history.pushState(null, '', '#' + targetId);
    goTo(nextIndex);
  });
  pager.addEventListener('pointercancel', () => { touchStart = null; });

  // ---- 右下角 nav 跳页 ----
  // 捕获阶段拦下锚点默认行为：文档不再滚动，跳页就是平移
  if (nav) {
    nav.addEventListener('click', (e) => {
      const a = e.target.closest('a.side-nav-item');
      if (!a) return;
      const id = (a.getAttribute('href') || '').slice(1);
      if (id in idToIndex) {
        e.preventDefault();
        if (location.hash !== '#' + id) {
          history.pushState(null, '', '#' + id);
        }
        goTo(idToIndex[id]);
      }
    });
  }

  // ---- 锚点 / hash ----
  // 初始带上 #latest 这类锚打开时，直接落到对应一页；
  // 之后 hash 变了（外部跳转）也跟着翻
  const followHash = (animate) => {
    const id = (location.hash || '#top').slice(1);
    if (id in idToIndex) goTo(idToIndex[id], animate);
    else if (id.startsWith('ipod-') && 'daily' in idToIndex) goTo(idToIndex.daily, animate);
  };
  window.addEventListener('hashchange', () => followHash(true));
  window.addEventListener('popstate', () => followHash(true));

  // 初始定位：无动画落到锚点页（或停在第一页）
  apply(false);
  followHash(false);

  // 保险：浏览器做初始锚点定位时可能横向滚过某个滚动容器（.pager-page），
  // 统一拉回 0——页的横向位置只由 track 的 transform 决定
  const clampPages = () => {
    pages.forEach((p) => { if (p.scrollLeft !== 0) p.scrollLeft = 0; });
    apply(false);
  };
  window.addEventListener('load', clampPages);
  window.addEventListener('resize', clampPages);

  // 供 site.js 等外部脚本把"文档滚动"翻译成"页内滚动"用
  window.__pagerScrollPageOf = (el, behavior) => {
    const page = el.closest && el.closest('.pager-page');
    if (!page) return false;
    const top = el.getBoundingClientRect().top
      - page.getBoundingClientRect().top + page.scrollTop;
    page.scrollTo({ top, behavior: behavior || 'smooth' });
    return true;
  };
})();
