(async function () {
  User.mountHeader();

  const params = new URLSearchParams(location.search);
  const id = parseInt(params.get('id'), 10);
  const metaCard = document.getElementById('meta-card');

  if (!Number.isInteger(id)) {
    metaCard.innerHTML = `<div class="empty">Missing creation id.</div>`;
    return;
  }

  let creation;
  try {
    creation = await API.get(id, true);
  } catch (err) {
    metaCard.innerHTML = `<div class="empty">Could not load creation: ${UI.escape(err.message)}</div>`;
    return;
  }

  // 3D viewer
  const canvas = document.getElementById('viewer-canvas');
  const v = Viewer.mount(canvas, { withControls: true });
  function resize() {
    const r = canvas.getBoundingClientRect();
    v.resize(r.width, r.height);
  }
  window.addEventListener('resize', resize);
  resize();
  v.load(creation);
  (function loop() {
    v.tick();
    requestAnimationFrame(loop);
  })();

  // Metadata panel
  const user = User.get();
  const isMine = user && user.name === creation.author;
  const likeKey = `brickworks.liked.${creation.id}`;
  const liked = localStorage.getItem(likeKey) === '1';

  metaCard.innerHTML = `
    <h1>${UI.escape(creation.name)}</h1>
    <div class="by">by ${UI.escape(creation.author)}${creation.parent_id ? ` · remixed from <a href="/creation?id=${creation.parent_id}">#${creation.parent_id}</a>` : ''}</div>
    <div class="description">${UI.escape(creation.description || '')}</div>
    <div class="stats-row">
      <span>▣ ${creation.brick_count} bricks</span>
      <span>♥ <span id="like-count">${creation.likes}</span></span>
      <span>👁 ${creation.views}</span>
    </div>
    <div class="actions">
      <button class="btn primary" id="like-btn">${liked ? '♥ Liked' : '♡ Like'}</button>
      <a class="btn" href="/builder?clone=${creation.id}">Clone &amp; Edit</a>
      ${isMine ? `<a class="btn" href="/builder?id=${creation.id}">Edit this creation</a>` : ''}
      <button class="btn" id="download-btn">Download Instructions (PDF)</button>
      <a class="btn ghost" href="/browse">← Back to Browse</a>
      ${isMine ? `<button class="btn danger" id="delete-btn">Delete</button>` : ''}
    </div>
    <div style="font-size:12px;color:var(--text-dim);margin-top:14px;">
      Created ${creation.created_at}
      ${creation.updated_at !== creation.created_at ? `· Updated ${creation.updated_at}` : ''}
    </div>
  `;

  const likeBtn = document.getElementById('like-btn');
  likeBtn.onclick = async () => {
    const currentlyLiked = localStorage.getItem(likeKey) === '1';
    try {
      const r = await API.like(creation.id, currentlyLiked);
      document.getElementById('like-count').textContent = r.likes;
      if (currentlyLiked) {
        localStorage.removeItem(likeKey);
        likeBtn.textContent = '♡ Like';
      } else {
        localStorage.setItem(likeKey, '1');
        likeBtn.textContent = '♥ Liked';
      }
    } catch (err) {
      UI.toast('Could not save like', 'error');
    }
  };

  document.getElementById('download-btn').onclick = async () => {
    UI.toast('Generating instructions…');
    try {
      await Instructions.generatePDF({
        name: creation.name,
        author: creation.author,
        bricks: creation.bricks,
      });
    } catch (err) {
      UI.toast('Failed: ' + err.message, 'error');
    }
  };

  if (isMine) {
    document.getElementById('delete-btn').onclick = async () => {
      if (!confirm('Delete this creation? This cannot be undone.')) return;
      try {
        await API.remove(creation.id, user.name);
        UI.toast('Deleted', 'success');
        setTimeout(() => location.href = '/my-creations', 400);
      } catch (err) {
        UI.toast('Delete failed: ' + err.message, 'error');
      }
    };
  }
})();
