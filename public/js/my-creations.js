(async function () {
  User.mountHeader();
  const grid = document.getElementById('my-grid');
  const status = document.getElementById('status');
  const user = User.get();
  if (!user) {
    status.innerHTML = 'Pick a username to start saving creations — look in the header.';
    grid.innerHTML = '<div class="empty">No username set yet.</div>';
    return;
  }
  status.textContent = `Signed in as ${user.name}`;
  try {
    const r = await API.mine(user.name);
    UI.renderGrid(grid, r.items, {
      empty: 'You haven’t saved any creations yet. <a href="/builder">Start building →</a>',
    });
  } catch (err) {
    grid.innerHTML = `<div class="empty">Error: ${UI.escape(err.message)}</div>`;
  }
})();
