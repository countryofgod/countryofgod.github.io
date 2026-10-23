(() => {
  if (window.__androidShell) return;
  const ids = ['top', 'daily', 'latest', 'archive', 'museum', 'about'];
  const nav = document.querySelector('.side-nav');
  const list = nav?.querySelector('.side-nav-list');
  const pages = ids.map(id => document.querySelector(`[data-pager-page="${id}"]`));
  if (!nav || !list || pages.some(page => !page)) return;

  document.documentElement.classList.add('android-app');
  const resize = () => document.documentElement.style.setProperty('--vp-h', window.innerHeight + 'px');
  resize();
  window.addEventListener('resize', resize);
  const toggle = document.createElement('button');
  toggle.className = 'android-nav-toggle';
  toggle.type = 'button';
  toggle.setAttribute('aria-label', '章节导航');
  toggle.setAttribute('aria-expanded', 'false');
  list.id = 'android-chapters';
  toggle.setAttribute('aria-controls', list.id);
  toggle.appendChild(document.createElement('span'));
  nav.appendChild(toggle);
  const backdrop = document.createElement('div');
  backdrop.className = 'android-nav-backdrop';
  backdrop.hidden = true;
  document.body.appendChild(backdrop);
  const content = [document.querySelector('[data-pager]'),
    document.querySelector('.cadenza-rail'), document.querySelector('.guest-drawer')].filter(Boolean);
  let open = false;
  let previousFocus;

  function syncPages() {
    const active = document.body.dataset.pagerActive || 'top';
    pages.forEach(page => {
      const inactive = page.dataset.pagerPage !== active;
      page.inert = inactive;
      page.setAttribute('aria-hidden', String(inactive));
    });
    nav.querySelectorAll('.side-nav-item').forEach(link => {
      if (link.hash === '#' + active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
  }

  function setOpen(next, restoreFocus = true) {
    if (open === next) return;
    open = next;
    if (open) previousFocus = document.activeElement;
    document.body.classList.toggle('android-nav-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? '关闭导航' : '章节导航');
    list.inert = !open;
    list.setAttribute('aria-hidden', String(!open));
    backdrop.hidden = !open;
    content.forEach(element => { element.inert = open; });
    if (open) {
      (list.querySelector('[aria-current="page"]') || list.querySelector('a')).focus({ preventScroll: true });
    } else if (restoreFocus) {
      (previousFocus?.isConnected ? previousFocus : toggle).focus({ preventScroll: true });
    }
  }

  toggle.addEventListener('click', () => setOpen(!open));
  backdrop.addEventListener('click', () => setOpen(false));
  backdrop.addEventListener('touchmove', event => event.preventDefault(), { passive: false });
  nav.addEventListener('click', event => {
    if (event.target.closest('.side-nav-item')) {
      setOpen(false, false);
      toggle.focus({ preventScroll: true });
    }
  });
  document.addEventListener('keydown', event => {
    if (!open) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
    } else if (event.key === 'Tab') {
      const controls = [...list.querySelectorAll('a'), toggle];
      const position = controls.indexOf(document.activeElement);
      event.preventDefault();
      controls[(position + (event.shiftKey ? controls.length - 1 : 1)) % controls.length].focus();
    }
  });
  new MutationObserver(() => {
    setOpen(false, false);
    syncPages();
    const toc = document.querySelector('.pub-toc');
    if (toc && document.body.dataset.pagerActive !== 'latest') {
      toc.classList.remove('is-open');
      toc.querySelector('button')?.setAttribute('aria-expanded', 'false');
    }
  }).observe(document.body, { attributes: true, attributeFilter: ['data-pager-active'] });

  function closeDrawer(selector, handleSelector) {
    const drawer = document.querySelector(selector);
    if (!drawer?.classList.contains('is-open')) return false;
    drawer.querySelector(handleSelector)?.click();
    return true;
  }

  window.__androidShell = {
    back() {
      if (open) { setOpen(false); return true; }
      if (closeDrawer('.guest-drawer', '.guest-drawer-handle')) return true;
      if (closeDrawer('.pub-toc', '.pub-toc-handle')) return true;
      return false;
    },
    canRefresh(x, y) {
      if (open || document.querySelector('.guest-drawer.is-open, .pub-toc.is-open')) return false;
      let element = document.elementFromPoint(x, y);
      if (!element || element.closest('.daily-ipod, .museum-strip, input, textarea, button, nav')) return false;
      while (element && element !== document.body) {
        if (element.scrollTop > 0) return false;
        element = element.parentElement;
      }
      return true;
    }
  };
  list.inert = true;
  list.setAttribute('aria-hidden', 'true');
  syncPages();
  window.dispatchEvent(new Event('resize'));
})();
