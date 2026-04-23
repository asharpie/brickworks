(function () {
  User.mountHeader();

  const grid = document.getElementById('browse-grid');
  const meta = document.getElementById('result-meta');
  const searchInput = document.getElementById('search-input');
  const sortSelect = document.getElementById('sort-select');

  // Prefill from URL
  const params = new URLSearchParams(location.search);
  if (params.get('q')) searchInput.value = params.get('q');
  if (params.get('sort')) sortSelect.value = params.get('sort');

  async function refresh() {
    const q = searchInput.value.trim();
    const sort = sortSelect.value;

    // Update URL without reloading
    const newParams = new URLSearchParams();
    if (q) newParams.set('q', q);
    if (sort !== 'popular') newParams.set('sort', sort);
    const newUrl = '/browse' + (newParams.toString() ? '?' + newParams.toString() : '');
    history.replaceState({}, '', newUrl);

    grid.innerHTML = '<div class="loading">Loading…</div>';
    try {
      let items, total;
      if (q) {
        const r = await API.search(q, { limit: 60 });
        items = r.items;
        meta.textContent = `${items.length} result${items.length === 1 ? '' : 's'} for “${q}”`;
      } else {
        const r = await API.browse({ sort, limit: 60 });
        items = r.items;
        total = r.total;
        meta.textContent = `${total} creation${total === 1 ? '' : 's'}`;
      }
      UI.renderGrid(grid, items, {
        empty: q
          ? `No matches for “${UI.escape(q)}”. Try a different search, or <a href="/builder">build it yourself →</a>`
          : 'No creations yet. <a href="/builder">Start building →</a>',
      });
    } catch (err) {
      grid.innerHTML = `<div class="empty">Error: ${UI.escape(err.message)}</div>`;
    }
  }

  let debounce;
  searchInput.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(refresh, 240);
  });
  sortSelect.addEventListener('change', refresh);

  refresh();
})();
