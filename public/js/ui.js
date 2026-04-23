// Shared UI helpers: toast notifications and card rendering.
(function (global) {
  function toast(msg, kind = '') {
    let el = document.querySelector('.toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.className = `toast show ${kind}`;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { el.className = 'toast'; }, 2200);
  }

  function escape(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

  function cardHTML(c, opts = {}) {
    const href = `/creation?id=${c.id}`;
    const thumb = c.thumbnail
      ? `<a class="thumb" href="${href}" style="background-image:url('${c.thumbnail}')"></a>`
      : `<a class="thumb placeholder" href="${href}" aria-label="No preview"></a>`;
    return `
      <div class="card" data-id="${c.id}">
        ${thumb}
        <div class="card-body">
          <h3><a href="${href}">${escape(c.name || 'Untitled')}</a></h3>
          <div class="meta"><span class="author">by ${escape(c.author || 'anonymous')}</span></div>
          <div class="stats">
            <span title="bricks">▣ ${c.brick_count || 0}</span>
            <span title="likes">♥ ${c.likes || 0}</span>
            <span title="views">👁 ${c.views || 0}</span>
          </div>
          ${opts.actions ? `<div class="stats" style="margin-top:8px">${opts.actions}</div>` : ''}
        </div>
      </div>
    `;
  }

  function renderGrid(container, items, opts) {
    if (!items || items.length === 0) {
      container.innerHTML = `<div class="empty">${opts && opts.empty || 'Nothing here yet.'}</div>`;
      return;
    }
    container.innerHTML = items.map(c => cardHTML(c, opts)).join('');
  }

  global.UI = { toast, escape, cardHTML, renderGrid };
})(window);
