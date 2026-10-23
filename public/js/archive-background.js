(() => {
  const archive = document.querySelector('.pager #archive');
  const page = archive?.closest('.pager-page');
  if (!archive || !page) return;
  const windows = Array.from(archive.querySelectorAll('.archive-year, .archive-months'));
  const source = windows[0] && getComputedStyle(windows[0]).backgroundImage.match(/url\(["']?([^"')]+)["']?\)/);
  if (!source) return;

  const image = new Image();
  const transitions = new Map();
  let frame = 0;

  const update = () => {
    frame = 0;
    if (!image.naturalWidth || !image.naturalHeight) return;
    const viewport = page.getBoundingClientRect();
    const width = page.clientWidth;
    const height = page.clientHeight;
    const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
    const imageWidth = image.naturalWidth * scale;
    const imageHeight = image.naturalHeight * scale;
    const originLeft = (width - imageWidth) / 2;
    const originTop = (height - imageHeight) / 2;
    const positions = [archive, ...windows].map((element) => {
      const rect = element.getBoundingClientRect();
      const insetLeft = element === archive ? archive.clientLeft : 0;
      const insetTop = element === archive ? archive.clientTop : 0;
      return [element, originLeft - (rect.left + insetLeft - viewport.left),
        originTop - (rect.top + insetTop - viewport.top)];
    });
    archive.style.setProperty('--archive-bg-size', imageWidth + 'px ' + imageHeight + 'px');
    positions.forEach(([element, left, top]) => {
      element.style.setProperty('--archive-bg-position', left + 'px ' + top + 'px');
    });
    archive.classList.add('has-aligned-background');
    if (transitions.size) schedule();
  };

  function schedule() {
    if (!frame) frame = requestAnimationFrame(update);
  }

  archive.addEventListener('transitionrun', (event) => {
    if (!['grid-template-rows', 'max-height', 'padding-top', 'padding-bottom'].includes(event.propertyName)) return;
    if (!transitions.has(event.target)) transitions.set(event.target, new Set());
    transitions.get(event.target).add(event.propertyName);
    schedule();
  });
  const finishTransition = (event) => {
    const properties = transitions.get(event.target);
    if (!properties) return;
    properties.delete(event.propertyName);
    if (!properties.size) transitions.delete(event.target);
    schedule();
  };
  archive.addEventListener('transitionend', finishTransition);
  archive.addEventListener('transitioncancel', finishTransition);
  page.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  window.addEventListener('load', schedule);
  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(schedule);
    [page, archive, ...windows].forEach((element) => observer.observe(element));
  }
  if (document.fonts?.ready) document.fonts.ready.then(schedule);
  image.addEventListener('load', schedule);
  image.src = source[1];
  if (image.complete) schedule();
})();
