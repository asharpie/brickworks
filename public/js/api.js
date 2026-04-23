// Thin fetch wrapper over the Brickworks API.
(function (global) {

  async function req(method, path, body) {
    const res = await fetch(path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try { const j = await res.json(); if (j && j.error) msg = j.error; } catch {}
      throw new Error(msg);
    }
    return res.json();
  }

  const API = {
    featured: (limit = 6) => req('GET', `/api/creations/featured?limit=${limit}`),
    recent:   (limit = 8) => req('GET', `/api/creations/recent?limit=${limit}`),
    browse:   ({ sort = 'popular', limit = 24, offset = 0 } = {}) =>
      req('GET', `/api/creations?sort=${sort}&limit=${limit}&offset=${offset}`),
    search:   (q, { limit = 40, offset = 0 } = {}) =>
      req('GET', `/api/creations/search?q=${encodeURIComponent(q)}&limit=${limit}&offset=${offset}`),
    mine:     (author) => req('GET', `/api/creations/mine?author=${encodeURIComponent(author)}`),
    get:      (id, track = false) => req('GET', `/api/creations/${id}${track ? '?track=1' : ''}`),
    create:   (body) => req('POST', '/api/creations', body),
    update:   (id, body) => req('PUT', `/api/creations/${id}`, body),
    remove:   (id, author) => req('DELETE', `/api/creations/${id}?author=${encodeURIComponent(author)}`),
    like:     (id, unlike = false) => req('POST', `/api/creations/${id}/like`, { unlike }),
  };

  global.API = API;
})(window);
