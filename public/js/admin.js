// 管理台：所有写操作都走 §6.2 的管理接口，Cookie 由浏览器自动带上（httpOnly + sameSite=lax）
const $ = (sel, root = document) => root.querySelector(sel);

async function api(method, url, body) {
  const isForm = body instanceof FormData;
  const res = await fetch(url, {
    method,
    headers: body && !isForm ? { 'Content-Type': 'application/json' } : undefined,
    body: isForm ? body : body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `请求失败（${res.status}）`);
  return data;
}

function showHint(el, message) {
  if (!el) return;
  el.textContent = message || '';
  el.hidden = !message;
}

/** 统一入口：跑一次写操作，成功后刷新页面让服务端重新渲染列表 */
async function mutate(fn) {
  try {
    await fn();
    location.reload();
  } catch (err) {
    alert(err.message || '操作失败');
  }
}

/* ---------------- 文章 ---------------- */

const articleForm = $('#article-form');
if (articleForm) {
  const idField = $('#article-id');
  const submitBtn = $('#article-submit');
  const cancelBtn = $('#article-cancel');
  const hint = $('#article-hint');

  const resetForm = () => {
    articleForm.reset();
    idField.value = '';
    submitBtn.textContent = '新建文章';
    cancelBtn.hidden = true;
    showHint(hint, '');
  };

  cancelBtn.addEventListener('click', resetForm);

  articleForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(articleForm).entries());
    data.sortOrder = Number(data.sortOrder) || 0;
    const id = idField.value;
    mutate(async () => {
      if (id) await api('PUT', `/api/articles/${id}`, data);
      else await api('POST', '/api/articles', data);
    });
  });

  // 编辑：从公开接口取当前值填回表单（listArticles 不带 content 之外的敏感字段，够用）
  document.querySelectorAll('[data-edit-article]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.editArticle;
      try {
        const list = await api('GET', '/api/articles');
        const a = list.find((x) => String(x.id) === String(id));
        if (!a) throw new Error('文章不存在');
        idField.value = a.id;
        articleForm.title.value = a.title;
        articleForm.author.value = a.author || '';
        articleForm.publishedAt.value = a.publishedAt;
        articleForm.category.value = a.category || '';
        articleForm.slug.value = a.slug;
        articleForm.sortOrder.value = a.sortOrder ?? 0;
        articleForm.excerpt.value = a.excerpt;
        articleForm.content.value = a.content;
        submitBtn.textContent = '保存修改';
        cancelBtn.hidden = false;
        showHint(hint, '正在编辑：' + a.title);
        hint.style.color = '';
      } catch (err) {
        showHint(hint, err.message);
      }
    });
  });

  document.querySelectorAll('[data-del-article]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!confirm(`删除《${btn.dataset.name}》？它在档案馆里的条目会一并删掉。`)) return;
      mutate(() => api('DELETE', `/api/articles/${btn.dataset.delArticle}`));
    });
  });
}

/* ---------------- 档案馆 ---------------- */

const archiveForm = $('#archive-form');
if (archiveForm) {
  archiveForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(archiveForm).entries());
    data.year = Number(data.year);
    data.month = Number(data.month);
    data.articleId = Number(data.articleId);
    mutate(() => api('POST', '/api/archive', data));
  });

  document.querySelectorAll('[data-del-archive]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!confirm('把这条从档案馆里删掉？')) return;
      mutate(() => api('DELETE', `/api/archive/${btn.dataset.delArchive}`));
    });
  });
}

/* ---------------- 本日 Daily ---------------- */

// 一天一条：提交上去是覆盖式更新（同一天再提交就改掉那天的）。成功后整页刷新，
// 表单里带回来的是服务端渲染的新值
const dailyForm = $('#daily-form');
if (dailyForm) {
  dailyForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(dailyForm).entries());
    mutate(() => api('POST', '/api/daily', data));
  });
}

/* ---------------- 留言 ---------------- */

document.querySelectorAll('[data-del-guest]').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (!confirm('删除这条留言？图片会一起删掉。')) return;
    mutate(() => api('DELETE', `/api/guestbook/${btn.dataset.delGuest}`));
  });
});
