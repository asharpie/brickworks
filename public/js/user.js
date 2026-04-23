// Simple localStorage-based "user" identity.
// Not real auth — this just lets us tag creations with an author and
// filter "my creations" without standing up a login flow.

(function (global) {
  const KEY = 'brickworks.user';

  function get() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return null;
  }

  function set(name) {
    name = (name || '').trim().slice(0, 60);
    if (!name) return null;
    const u = { name, since: Date.now() };
    localStorage.setItem(KEY, JSON.stringify(u));
    return u;
  }

  function ensure() {
    let u = get();
    if (u) return u;
    const name = promptForName();
    return set(name);
  }

  function promptForName() {
    let n = prompt(
      "Pick a username for Brickworks\n(This is how your creations will be credited.)",
      suggest()
    );
    if (!n) n = suggest();
    return n;
  }

  function suggest() {
    const adj = ['Brickly', 'Stud', 'Snap', 'Plate', 'Clutch', 'Pip', 'Tile', 'Slope'];
    const noun = ['Bandit', 'Wizard', 'Architect', 'Pilot', 'Captain', 'Engineer', 'Fan'];
    return adj[Math.floor(Math.random() * adj.length)]
         + noun[Math.floor(Math.random() * noun.length)]
         + Math.floor(Math.random() * 900 + 100);
  }

  function signOut() {
    localStorage.removeItem(KEY);
  }

  // Render the user chip in the header.
  function mountHeader() {
    const el = document.getElementById('user-chip');
    if (!el) return;
    const u = get();
    if (u) {
      el.innerHTML = `Signed in as <b>${escape(u.name)}</b> <button id="signout-btn">sign out</button>`;
      document.getElementById('signout-btn').onclick = () => {
        signOut();
        location.reload();
      };
    } else {
      el.innerHTML = `<button id="signin-btn">Pick a username</button>`;
      document.getElementById('signin-btn').onclick = () => {
        ensure();
        location.reload();
      };
    }
  }

  function escape(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

  global.User = { get, set, ensure, signOut, mountHeader };
})(window);
