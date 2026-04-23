(async function () {
  User.mountHeader();
  try {
    const [featured, recent] = await Promise.all([API.featured(6), API.recent(8)]);
    UI.renderGrid(document.getElementById('featured-grid'), featured.items, {
      empty: 'No featured creations yet — be the first! <a href="/builder">Start building →</a>',
    });
    UI.renderGrid(document.getElementById('recent-grid'), recent.items, {
      empty: 'No creations yet. <a href="/builder">Start building →</a>',
    });
  } catch (err) {
    document.getElementById('featured-grid').innerHTML =
      `<div class="empty">Could not load creations: ${UI.escape(err.message)}</div>`;
  }
})();
