// 文章永久页：回声 + 写到一半
// 回声与页脚「留言」是两件事：留言是对整本刊物说的，回声是对这一篇说的。
const section = document.querySelector('.echo');
const form = document.querySelector('.echo-form');
const list = document.querySelector('.echo-list');
const hint = document.querySelector('.echo-hint');
const input = document.querySelector('.echo-input');
const textarea = document.querySelector('.echo-textarea');
const submitBtn = document.querySelector('.echo-submit');

const articleId = section && Number(section.dataset.article);
// 草稿槽位：回声按文章分开存，不同文章各自留着半截话
const slot = `echo:${articleId}`;

const json = async (url, options) => {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || '请求失败');
  return data;
};

function setHint(message) {
  if (!hint) return;
  hint.textContent = message || '';
  hint.hidden = !message;
}

/* ---------------- 回声 ---------------- */

function buildEcho(item) {
  const li = document.createElement('li');
  li.className = 'echo-item';
  li.dataset.id = item.id;

  const head = document.createElement('p');
  head.className = 'echo-head';
  const name = document.createElement('span');
  name.className = 'echo-name';
  name.textContent = item.name || '匿名';
  const date = document.createElement('span');
  date.className = 'echo-date';
  date.textContent = item.date;
  head.appendChild(name);
  head.appendChild(date);

  const body = document.createElement('p');
  body.className = 'echo-body';
  // 一律 textContent：用户输入不会被当成 HTML
  body.textContent = item.body;

  li.appendChild(head);
  li.appendChild(body);
  return li;
}

/** 留过了就把表单收起来，只给一个撤回入口 */
function lockToMine(item) {
  if (form) form.hidden = true;
  const empty = list && list.querySelector('.echo-empty');
  if (empty) empty.remove();
  const mine = list && list.querySelector(`.echo-item[data-id="${item.id}"]`);
  if (!mine || mine.querySelector('.echo-mine')) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'echo-mine';
  btn.textContent = '撤回';
  btn.addEventListener('click', async () => {
    if (!confirm('撤回这条回声？撤完可以重留。')) return;
    try {
      await json(`/api/echoes/${item.id}`, { method: 'DELETE' });
      mine.remove();
      if (form) form.hidden = false;
      if (list && !list.querySelector('.echo-item')) {
        const li = document.createElement('li');
        li.className = 'echo-empty';
        li.textContent = '还没有回声';
        list.appendChild(li);
      }
      setHint('');
    } catch (err) {
      setHint(err.message);
    }
  });
  mine.appendChild(btn);
}

if (section && form) {
  // 表单默认就是展开的；只有"这篇我已经留过"才收起来
  json(`/api/echoes/mine?article=${articleId}`)
    .then((data) => {
      if (data.echo) lockToMine(data.echo);
    })
    .catch(() => {
      /* 拿不到就照常留，不当作"已留过" */
    });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    setHint('');
    const body = textarea.value.trim();
    if (!body) return setHint('说点什么再留');
    submitBtn.disabled = true;
    try {
      const echo = await json('/api/echoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articleId, name: input.value, body }),
      });
      const empty = list && list.querySelector('.echo-empty');
      if (empty) empty.remove();
      list.appendChild(buildEcho(echo));
      lockToMine(echo);
      form.reset();
      // 留成了，草稿就没用了
      fetch(`/api/drafts?slot=${encodeURIComponent(slot)}`, { method: 'DELETE' }).catch(() => {});
    } catch (err) {
      setHint(err.message);
    } finally {
      submitBtn.disabled = false;
    }
  });
}

/* ---------------- 写到一半 ---------------- */
// 随打字自动存，绑在这台设备上。下次回到这一页（或刷新），半截话还在。
if (form && textarea) {
  let timer = null;
  const save = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const body = textarea.value;
      const name = input ? input.value : '';
      if (!body.trim() && !name.trim()) return;
      fetch('/api/drafts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slot, name, body }),
      }).catch(() => {});
    }, 800);
  };
  textarea.addEventListener('input', save);
  if (input) input.addEventListener('input', save);

  fetch(`/api/drafts?slot=${encodeURIComponent(slot)}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      const d = data && data.draft;
      if (!d) return;
      // 已经留过回声就不再回填，免得看着像"没发出去"
      if (form.hidden) return;
      if (!textarea.value && d.body) textarea.value = d.body;
      if (input && !input.value && d.name) input.value = d.name;
    })
    .catch(() => {});
}
