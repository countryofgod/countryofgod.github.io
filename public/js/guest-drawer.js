(() => {
  const drawer = document.querySelector('.guest-drawer');
  const form = document.querySelector('.guest-form');
  const film = document.querySelector('.guest-film');
  const area = document.querySelector('.footer-guestbook');
  if (!drawer || !form || !film || !area) return;
  const handle = drawer.querySelector('.guest-drawer-handle');
  const panel = drawer.querySelector('.guest-drawer-panel');
  const wall = drawer.querySelector('.guest-wall');
  const navigation = drawer.querySelector('.guest-drawer-pages');
  const name = form.querySelector('.guest-name');
  const pageElement = form.closest('.pager-page');
  const paged = document.body.classList.contains('has-pager');
  if (!handle || !panel || !wall || !navigation || !name) return;
  document.body.appendChild(drawer);

  const pageSize = 5;
  let currentPage = 1;
  let generation = 0;
  const controllers = [];
  let positionedFrame = 0;

  const position = () => {
    positionedFrame = 0;
    if (paged && document.body.dataset.pagerActive !== 'about') {
      controllers.forEach((controller) => controller.close());
      return;
    }
    const formRect = form.getBoundingClientRect();
    const nameRect = name.getBoundingClientRect();
    const filmRect = film.getBoundingClientRect();
    const areaRect = area.getBoundingClientRect();
    const pageLeft = pageElement ? pageElement.getBoundingClientRect().left : 0;
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight;
    const rootStyle = getComputedStyle(document.documentElement);
    const railWidth = parseFloat(rootStyle.getPropertyValue('--cadenza-rail-width')) || 56;
    const railHandle = parseFloat(rootStyle.getPropertyValue('--cadenza-handle-width')) || 32;
    const right = viewportWidth - railWidth - railHandle - 16;
    const formRight = formRect.right - pageLeft;
    const naturalLeft = formRight + 56;
    const left = right - naturalLeft >= 180 ? naturalLeft : Math.max(24, right - 320);
    const top = Math.max(16, nameRect.top, areaRect.top);
    const bottom = Math.min(viewportHeight - 24, filmRect.bottom, areaRect.bottom);
    const triggerLeft = formRight + 12;
    drawer.style.setProperty('--guest-drawer-left', left + 'px');
    drawer.style.setProperty('--guest-drawer-top', top + 'px');
    drawer.style.setProperty('--guest-drawer-width', Math.max(0, right - left) + 'px');
    drawer.style.setProperty('--guest-drawer-height', Math.max(0, bottom - top) + 'px');
    drawer.style.setProperty('--guest-drawer-trigger', triggerLeft - left + 'px');
    drawer.classList.add('is-positioned');
  };

  const queuePosition = () => {
    if (!positionedFrame) positionedFrame = window.requestAnimationFrame(position);
  };

  const renderPagination = (pages, selected) => {
    const hadPageFocus = navigation.contains(document.activeElement);
    navigation.replaceChildren();
    for (let page = 1; page <= pages; page += 1) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'guest-drawer-page';
      button.textContent = String(page);
      button.setAttribute('aria-label', '第' + page + '页');
      if (page === selected) button.setAttribute('aria-current', 'page');
      button.addEventListener('click', () => refresh(page));
      navigation.appendChild(button);
      if (hadPageFocus && page === selected) button.focus({ preventScroll: true });
    }
  };

  async function refresh(page = currentPage) {
    const request = ++generation;
    try {
      const response = await fetch(API_BASE + '/api/guestbook?limit=' + pageSize + '&page=' + page, {
        credentials: 'include', cache: 'no-store',
      });
      if (!response.ok) return;
      const data = await response.json();
      if (request !== generation || !Array.isArray(data.items)) return;
      currentPage = data.page;
      wall.replaceChildren(...data.items.map(renderNote));
      wall.scrollTop = 0;
      markMyNotes([]);
      renderPagination(data.pages, currentPage);
    } catch {}
  }

  function bindDrawer(element, onOpen = () => {}) {
    const trigger = element.querySelector('.guest-drawer-handle');
    const content = element.querySelector('.guest-drawer-panel');
    let pinned = false;
    const setOpen = (open) => {
      const visible = open && (!paged || document.body.dataset.pagerActive === 'about');
      element.classList.toggle('is-open', visible);
      trigger.setAttribute('aria-expanded', String(visible));
      content.inert = !visible;
    };
    const close = () => {
      pinned = false;
      setOpen(false);
    };
    trigger.addEventListener('click', () => {
      pinned = !pinned;
      position();
      setOpen(pinned);
      if (pinned) onOpen();
    });
    element.addEventListener('mouseenter', () => {
      if (!window.matchMedia('(hover: hover)').matches) return;
      position();
      setOpen(true);
      onOpen();
    });
    element.addEventListener('mouseleave', () => {
      if (!pinned && !element.contains(document.activeElement)) setOpen(false);
    });
    element.addEventListener('focusin', () => setOpen(true));
    element.addEventListener('focusout', (event) => {
      if (!pinned && !element.contains(event.relatedTarget)) setOpen(false);
    });
    element.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      pinned = false;
      trigger.focus({ preventScroll: true });
      setOpen(false);
    });
    document.addEventListener('click', (event) => {
      if (!element.contains(event.target)) close();
    });
    close();
    return { close };
  }
  controllers.push(bindDrawer(drawer, () => refresh()));
  window.addEventListener('resize', queuePosition);
  window.addEventListener('load', queuePosition);
  area.addEventListener('scroll', queuePosition, { passive: true });
  if (!paged) window.addEventListener('scroll', queuePosition, { passive: true });
  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(queuePosition);
    [form, film, area].forEach((element) => observer.observe(element));
  }
  if ('MutationObserver' in window) {
    new MutationObserver(queuePosition).observe(document.body, {
      attributes: true, attributeFilter: ['data-pager-active'],
    });
  }
  if (document.fonts?.ready) document.fonts.ready.then(queuePosition);
  Array.from(wall.children).slice(pageSize).forEach((element) => element.remove());
  window.__guestDrawer = { refresh };
  position();
  refresh(1);
})();
