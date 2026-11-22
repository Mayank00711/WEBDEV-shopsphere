/* ShopSphere demo UI: a small hash-routed SPA that talks only to the REST API and Socket.IO. */
(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const app = $('#app');
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  const inrShort = (n) => (n >= 1e5 ? '₹' + (n / 1e5).toFixed(2) + 'L' : n >= 1e3 ? '₹' + (n / 1e3).toFixed(1) + 'k' : inr(n));
  const fmtDate = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const ago = (d) => {
    const s = (Date.now() - new Date(d)) / 1000;
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    return Math.floor(s / 86400) + 'd ago';
  };

  /* ---------- State and storage ---------- */
  const store = {
    get(k, d) { try { return JSON.parse(localStorage.getItem('ss.' + k)) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem('ss.' + k, JSON.stringify(v)); } catch { /* ignore */ } },
    del(k) { try { localStorage.removeItem('ss.' + k); } catch { /* ignore */ } },
  };
  const state = {
    user: store.get('user', null),
    access: store.get('access', null),
    refresh: store.get('refresh', null),
    cartCount: 0,
    notifications: [],
    unread: 0,
    socket: null,
    categories: [],
  };

  /* ---------- API client with automatic token refresh ---------- */
  let refreshing = null;
  async function refreshTokens() {
    if (!state.refresh) throw new Error('no refresh token');
    refreshing = refreshing || fetch('/api/auth/refresh', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: state.refresh }),
    }).then(async (r) => {
      const b = await r.json();
      if (!r.ok) throw new Error(b.message);
      setTokens(b.data.accessToken, b.data.refreshToken);
    }).finally(() => { refreshing = null; });
    return refreshing;
  }

  async function api(path, { method = 'GET', body, auth = true, retry = true } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (auth && state.access) headers.Authorization = 'Bearer ' + state.access;
    const res = await fetch('/api' + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    if (res.status === 401 && auth && retry && state.refresh) {
      try { await refreshTokens(); return api(path, { method, body, auth, retry: false }); } catch { logout(true); }
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.message || 'Request failed');
      err.status = res.status; err.errors = data.errors;
      throw err;
    }
    return data;
  }

  function setTokens(access, refresh) {
    state.access = access; state.refresh = refresh;
    store.set('access', access); store.set('refresh', refresh);
  }

  /* ---------- Toasts ---------- */
  function toast(title, msg = '', type = 'info', ic = 'bell') {
    const el = document.createElement('div');
    el.className = 'toast' + (type === 'error' ? ' error' : '');
    el.innerHTML = `<div class="ic">${icon(type === 'error' ? 'alert' : ic)}</div><div><b>${esc(title)}</b><span>${esc(msg)}</span></div>`;
    $('#toasts').appendChild(el);
    setTimeout(() => { el.style.transition = 'opacity .3s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 4200);
  }
  const fail = (e) => toast(e.status === 403 ? 'Not allowed' : 'Something went wrong', e.errors ? e.errors.map((x) => x.message || x.issue).filter(Boolean).join(', ') || e.message : e.message, 'error');

  /* ---------- Theme ---------- */
  function applyTheme(t) { document.documentElement.dataset.theme = t; store.set('theme', t); }
  applyTheme(store.get('theme', window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));

  /* ---------- Socket.IO ---------- */
  function connectSocket() {
    if (!state.access || !window.io) return;
    if (state.socket) state.socket.disconnect();
    const s = window.io({ auth: { token: state.access }, transports: ['websocket', 'polling'] });
    state.socket = s;
    s.on('connect_error', async (err) => {
      if (/UNAUTHORIZED/.test(err.message) && state.refresh) {
        try { await refreshTokens(); s.auth.token = state.access; s.connect(); } catch { /* ignore */ }
      }
    });
    s.on('notification', (n) => {
      state.notifications.unshift(n); state.unread += 1; renderHeader();
    });
    s.on('order:new', (o) => toast('New order received', `${o.orderNumber} · ${inr(o.total)}`, 'info', 'box'));
    s.on('order:status', (o) => {
      toast(`Order ${o.to}`, `${o.orderNumber} moved from ${o.from} to ${o.to}`, 'info', 'truck');
      if (location.hash.includes(o.orderId) || location.hash === '#/orders') route();
    });
    s.on('stock:low', (p) => toast('Low stock alert', `${p.name}: only ${p.stock} left`, 'info', 'alert'));
    s.on('product:stock', ({ productId, stock }) => {
      const el = document.querySelector(`[data-live-stock="${productId}"]`);
      if (el) { el.dataset.stock = stock; el.innerHTML = stockPill({ stock, lowStockThreshold: Number(el.dataset.threshold) }, true); }
    });
  }

  /* ---------- Auth helpers ---------- */
  function setSession(user, access, refresh) {
    state.user = user; store.set('user', user); setTokens(access, refresh);
    connectSocket(); loadBadges();
  }
  async function logout(silent) {
    try { if (!silent && state.refresh) await api('/auth/logout', { method: 'POST', body: { refreshToken: state.refresh }, retry: false }); } catch { /* ignore */ }
    state.user = null; state.access = null; state.refresh = null; state.cartCount = 0; state.notifications = []; state.unread = 0;
    ['user', 'access', 'refresh'].forEach(store.del);
    if (state.socket) state.socket.disconnect();
    renderHeader();
    if (!silent) toast('Signed out', 'Your session has been ended on the server.');
    location.hash = '#/';
  }
  const role = () => state.user && state.user.role;

  async function loadBadges() {
    if (!state.user) return renderHeader();
    try {
      const [n, c] = await Promise.all([
        api('/notifications?limit=15'),
        role() === 'customer' ? api('/cart') : Promise.resolve(null),
      ]);
      state.notifications = n.data; state.unread = n.meta.unread;
      if (c) state.cartCount = c.data.itemCount;
    } catch { /* ignore */ }
    renderHeader();
  }

  /* ---------- Header ---------- */
  function renderHeader() {
    $('.brand-mark').innerHTML = icon('bag');
    const r = role();
    const links = [['#/', 'Shop']];
    if (r === 'customer') links.push(['#/orders', 'My orders']);
    if (r === 'seller' || r === 'admin') links.push(['#/dashboard', 'Dashboard'], ['#/orders', 'Orders']);
    if (r === 'admin') links.push(['#/admin', 'Admin']);
    const cur = location.hash || '#/';
    $('#nav').innerHTML = links.map(([h, t]) => `<a href="${h}" class="${(h === '#/' ? cur === '#/' || cur.startsWith('#/product') : cur.startsWith(h)) ? 'active' : ''}">${t}</a>`).join('');

    const theme = document.documentElement.dataset.theme;
    let html = `<button class="icon-btn" id="themeBtn" title="Toggle theme">${icon(theme === 'dark' ? 'sun' : 'moon')}</button>`;
    if (state.user) {
      html += `<div style="position:relative"><button class="icon-btn" id="bellBtn" title="Notifications">${icon('bell')}${state.unread ? `<span class="badge">${state.unread > 9 ? '9+' : state.unread}</span>` : ''}</button><div id="dd"></div></div>`;
      if (r === 'customer') html += `<a class="icon-btn" href="#/cart" title="Cart">${icon('cart')}${state.cartCount ? `<span class="badge">${state.cartCount}</span>` : ''}</a>`;
      const initials = state.user.name.split(' ').map((x) => x[0]).slice(0, 2).join('').toUpperCase();
      html += `<div class="user-chip"><span class="avatar">${esc(initials)}</span><div><b>${esc(state.user.name.split(' ')[0])}</b><small>${esc(r)}</small></div></div>`;
      html += `<button class="icon-btn" id="logoutBtn" title="Sign out">${icon('logout')}</button>`;
    } else {
      html += `<a class="btn btn-primary" href="#/login">Sign in</a>`;
    }
    $('#actions').innerHTML = html;
    $('#themeBtn').onclick = () => { applyTheme(theme === 'dark' ? 'light' : 'dark'); renderHeader(); };
    if ($('#logoutBtn')) $('#logoutBtn').onclick = () => logout();
    if ($('#bellBtn')) $('#bellBtn').onclick = toggleNotifications;
  }

  function toggleNotifications(e) {
    e.stopPropagation();
    const dd = $('#dd');
    if (dd.innerHTML) { dd.innerHTML = ''; return; }
    const icFor = { 'order.placed': 'box', 'order.status_changed': 'truck', 'stock.low': 'alert' };
    dd.innerHTML = `<div class="dropdown"><div class="dh"><b>Notifications</b><button class="btn btn-ghost btn-sm" id="readAll">Mark all read</button></div>
      ${state.notifications.length ? state.notifications.map((n) => `<div class="notif ${n.read ? '' : 'unread'}"><div class="ic">${icon(icFor[n.type] || 'bell')}</div><div><b>${esc(n.title)}</b><p>${esc(n.message)}</p><time>${ago(n.createdAt)}</time></div></div>`).join('') : '<div class="empty" style="padding:30px">No notifications yet</div>'}</div>`;
    $('.dropdown', dd).onclick = (ev) => ev.stopPropagation();
    $('#readAll').onclick = async () => {
      await api('/notifications/read-all', { method: 'PATCH' });
      state.notifications.forEach((n) => { n.read = true; }); state.unread = 0; renderHeader();
    };
  }
  document.addEventListener('click', () => { const dd = $('#dd'); if (dd) dd.innerHTML = ''; });

  /* ---------- Shared pieces ---------- */
  const art = (p, tag = true) => {
    let t = '';
    if (tag) {
      if (p.stock === 0) t = '<span class="tag out">Sold out</span>';
      else if (p.stock <= p.lowStockThreshold) t = `<span class="tag low">Only ${p.stock} left</span>`;
    }
    return `<div class="art" style="background:${productGradient(p)}">${t}${icon(productIcon(p))}</div>`;
  };
  function stockPill(p, live) {
    const cls = p.stock === 0 ? 'out' : p.stock <= p.lowStockThreshold ? 'low' : '';
    const txt = p.stock === 0 ? 'Out of stock' : p.stock <= p.lowStockThreshold ? `Hurry, only ${p.stock} left` : `${p.stock} in stock`;
    return `<span class="stock-pill ${cls}"><span class="dot ${live ? 'live' : ''}"></span>${txt}${live ? ' · live' : ''}</span>`;
  }
  const statusBadge = (s) => `<span class="status s-${s}">${s}</span>`;
  const empty = (ic, title, text, cta = '') => `<div class="empty"><div class="ic">${icon(ic)}</div><h3>${title}</h3><p>${text}</p>${cta}</div>`;
  const requireRole = (...roles) => {
    if (!state.user) { location.hash = '#/login?next=' + encodeURIComponent(location.hash); return false; }
    if (roles.length && !roles.includes(role())) { app.innerHTML = `<div class="container">${empty('shield', 'Access denied', 'Your role cannot open this page. The API enforces the same rule.')}</div>`; return false; }
    return true;
  };

  /* ---------- Pages ---------- */
  const shopState = { page: 1, category: '', search: '', sort: '-createdAt' };

  async function pageShop() {
    if (!state.categories.length) state.categories = (await api('/categories', { auth: false })).data;
    const totalProducts = state.categories.reduce((s, c) => s + c.productCount, 0);
    app.innerHTML = `<div class="container">
      <section class="hero">
        <div class="hero-inner">
          <span class="eyebrow">${icon('sparkle')} Festive drop · up to 10% off with WELCOME10</span>
          <h1>Everything you love, delivered with care.</h1>
          <p>Curated electronics, fashion, home and fitness from independent sellers, with live stock and real-time order tracking.</p>
          <a href="#catalogue" class="btn btn-primary" id="shopNow">Shop the collection ${icon('arrow')}</a>
          <div class="hero-stats"><div><b>${totalProducts}+</b><span>Products</span></div><div><b>${state.categories.length}</b><span>Categories</span></div><div><b>Live</b><span>Order updates</span></div></div>
        </div>
        <div class="hero-art"><div class="tile">${icon('headphones')}</div><div class="tile">${icon('watch')}</div><div class="tile">${icon('shoe')}</div><div class="tile">${icon('laptop')}</div></div>
      </section>
      <div class="section-head" id="catalogue"><div><h2>Explore the catalogue</h2><p>Search, filter and sort are handled by the API with MongoDB indexes.</p></div></div>
      <div class="chips" id="cats" style="margin-bottom:16px"></div>
      <div class="toolbar">
        <div class="search">${icon('search')}<input class="input" id="q" placeholder="Search products, e.g. headphones, shirt, book" value="${esc(shopState.search)}"></div>
        <select class="select" id="sort">
          ${[['-createdAt', 'Newest'], ['price', 'Price: low to high'], ['-price', 'Price: high to low'], ['name', 'Name A–Z']].map(([v, t]) => `<option value="${v}" ${shopState.sort === v ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
      </div>
      <div class="grid" id="grid">${Array.from({ length: 8 }, () => '<div class="skeleton" style="height:320px"></div>').join('')}</div>
      <div class="pager" id="pager"></div>
    </div>`;
    $('#shopNow').onclick = (e) => { e.preventDefault(); $('#catalogue').scrollIntoView({ behavior: 'smooth' }); };
    const renderCats = () => {
      $('#cats').innerHTML = [`<button class="chip ${!shopState.category ? 'active' : ''}" data-c="">All <span>${totalProducts}</span></button>`]
        .concat(state.categories.map((c) => `<button class="chip ${shopState.category === c._id ? 'active' : ''}" data-c="${c._id}">${esc(c.name)} <span>${c.productCount}</span></button>`)).join('');
      document.querySelectorAll('#cats .chip').forEach((b) => { b.onclick = () => { shopState.category = b.dataset.c; shopState.page = 1; renderCats(); load(); }; });
    };
    let t;
    $('#q').oninput = (e) => { clearTimeout(t); t = setTimeout(() => { shopState.search = e.target.value.trim(); shopState.page = 1; load(); }, 300); };
    $('#sort').onchange = (e) => { shopState.sort = e.target.value; shopState.page = 1; load(); };
    renderCats();

    async function load() {
      const qs = new URLSearchParams({ page: shopState.page, limit: 12, sort: shopState.sort });
      if (shopState.category) qs.set('category', shopState.category);
      if (shopState.search) qs.set('search', shopState.search);
      const res = await api('/products?' + qs, { auth: false });
      $('#grid').innerHTML = res.data.length ? res.data.map((p) => `
        <a class="card" href="#/product/${p._id}">
          ${art(p)}
          <div class="card-body">
            <div class="meta"><span>${esc(p.category?.name)}</span><span>${esc(p.seller?.storeName || p.seller?.name)}</span></div>
            <h3>${esc(p.name)}</h3>
            <div class="price-row"><span class="price">${inr(p.price)}</span>${role() === 'customer' && p.stock > 0 ? `<button class="btn btn-ghost btn-sm" data-add="${p._id}">${icon('plus')} Add</button>` : ''}</div>
          </div>
        </a>`).join('') : `<div style="grid-column:1/-1">${empty('search', 'No products found', 'Try a different search or category.')}</div>`;
      document.querySelectorAll('[data-add]').forEach((b) => {
        b.onclick = async (e) => { e.preventDefault(); e.stopPropagation(); await addToCart(b.dataset.add, 1); };
      });
      const pages = res.meta.totalPages;
      $('#pager').innerHTML = pages > 1 ? Array.from({ length: pages }, (_, i) => `<button class="${i + 1 === shopState.page ? 'active' : ''}" data-p="${i + 1}">${i + 1}</button>`).join('') : '';
      document.querySelectorAll('#pager button').forEach((b) => { b.onclick = () => { shopState.page = Number(b.dataset.p); load(); $('#catalogue').scrollIntoView({ behavior: 'smooth' }); }; });
    }
    await load();
  }

  async function addToCart(productId, quantity) {
    if (!state.user) { location.hash = '#/login'; return; }
    try {
      const res = await api('/cart/items', { method: 'POST', body: { productId, quantity } });
      state.cartCount = res.data.itemCount; renderHeader();
      toast('Added to cart', `${res.data.itemCount} item(s) · ${inr(res.data.total)}`, 'info', 'cart');
    } catch (e) { fail(e); }
  }

  let watching = null;
  async function pageProduct(id) {
    const { data: p } = await api('/products/' + id, { auth: false }).catch((e) => ({ data: null, e }));
    if (!p) { app.innerHTML = `<div class="container">${empty('box', 'Product not found', 'It may have been removed by the seller.', '<a class="btn btn-primary" href="#/">Back to shop</a>')}</div>`; return; }
    if (state.socket) { if (watching) state.socket.emit('product:unwatch', watching); state.socket.emit('product:watch', p._id); watching = p._id; }
    let qty = 1;
    app.innerHTML = `<div class="container"><div class="detail">
      ${art(p, false)}
      <div>
        <div class="crumbs"><a href="#/">Shop</a> / <span>${esc(p.category?.name)}</span></div>
        <h1>${esc(p.name)}</h1>
        <div style="display:flex;gap:12px;align-items:center;margin-bottom:18px"><span class="price">${inr(p.price)}</span><span class="muted">incl. of all taxes</span></div>
        <div data-live-stock="${p._id}" data-threshold="${p.lowStockThreshold}" style="margin-bottom:18px">${stockPill(p, !!state.socket)}</div>
        <p class="desc">${esc(p.description)}</p>
        <p class="muted" style="font-size:13px">Sold by <b style="color:var(--text)">${esc(p.seller?.storeName || p.seller?.name)}</b> · SKU <span class="mono">${esc(p.sku || '—')}</span></p>
        ${role() === 'customer' ? `<div style="display:flex;gap:12px;margin-top:24px">
          <div class="qty"><button id="dec">${icon('minus')}</button><span id="qv">1</span><button id="inc">${icon('plus')}</button></div>
          <button class="btn btn-accent" id="addBtn" style="flex:1" ${p.stock === 0 ? 'disabled' : ''}>${icon('cart')} Add to cart</button></div>`
        : !state.user ? `<a class="btn btn-primary" style="margin-top:24px" href="#/login">Sign in as a customer to buy</a>` : `<p class="note">${icon('shield')} Only customers can buy. You are signed in as ${esc(role())}.</p>`}
        <div class="perks">
          <div class="perk">${icon('truck')}<b>Free delivery</b>On orders above ₹999</div>
          <div class="perk">${icon('refresh')}<b>Easy cancel</b>Before it ships</div>
          <div class="perk">${icon('shield')}<b>Secure checkout</b>Payment is simulated</div>
        </div>
      </div></div></div>`;
    if ($('#addBtn')) {
      $('#inc').onclick = () => { qty = Math.min(qty + 1, 100); $('#qv').textContent = qty; };
      $('#dec').onclick = () => { qty = Math.max(qty - 1, 1); $('#qv').textContent = qty; };
      $('#addBtn').onclick = () => addToCart(p._id, qty);
    }
  }

  async function pageCart() {
    if (!requireRole('customer')) return;
    const { data: c } = await api('/cart');
    state.cartCount = c.itemCount; renderHeader();
    if (!c.items.length) { app.innerHTML = `<div class="container">${empty('cart', 'Your cart is empty', 'Add something you love from the catalogue.', '<a class="btn btn-primary" href="#/">Start shopping</a>')}</div>`; return; }
    const addr = state.user.address || {};
    let discount = 0; let coupon = '';
    app.innerHTML = `<div class="container"><div class="dash-head"><div><h1>Checkout</h1><p class="muted" style="margin:4px 0 0">Prices and totals are recalculated by the server.</p></div></div>
      <div class="layout-2">
        <div style="display:flex;flex-direction:column;gap:20px">
          <div class="panel"><h3>Cart · ${c.itemCount} item(s)</h3>
            ${c.issues.length ? c.issues.map((i) => `<div class="alert-row">${icon('alert')}<span>${esc(i.issue)}</span></div>`).join('') : ''}
            ${c.items.map((it) => `<div class="line-item">
              ${art(it.product, false)}
              <div><b>${esc(it.product.name)}</b><div class="muted" style="font-size:13px">${inr(it.unitPrice)} · ${esc(it.product.seller?.storeName || '')}</div>
                <div style="display:flex;gap:10px;margin-top:8px;align-items:center"><div class="qty" style="height:34px"><button data-q="${it.product._id}" data-d="-1">${icon('minus')}</button><span>${it.quantity}</span><button data-q="${it.product._id}" data-d="1">${icon('plus')}</button></div>
                <button class="btn btn-sm btn-danger" data-rm="${it.product._id}">${icon('trash')}</button></div></div>
              <b>${inr(it.lineTotal)}</b></div>`).join('')}
          </div>
          <div class="panel"><h3>Delivery address</h3>
            <form id="addr" class="grid-2">
              <div class="field"><label>Full name</label><input class="input" name="fullName" value="${esc(state.user.name)}" required></div>
              <div class="field"><label>Phone</label><input class="input" name="phone" value="${esc(state.user.phone || '')}" required></div>
              <div class="field" style="grid-column:1/-1"><label>Address</label><input class="input" name="line1" value="${esc(addr.line1 || '')}" required></div>
              <div class="field"><label>City</label><input class="input" name="city" value="${esc(addr.city || '')}" required></div>
              <div class="field"><label>State</label><input class="input" name="state" value="${esc(addr.state || '')}" required></div>
              <div class="field"><label>PIN code</label><input class="input" name="postalCode" value="${esc(addr.postalCode || '')}" required></div>
            </form>
          </div>
          <div class="panel"><h3>Payment <span class="sim-banner" style="margin-left:8px">${icon('shield')} Simulated</span></h3>
            <div class="pay-opts">
              <label class="pay-opt"><input type="radio" name="pm" value="SIMULATED_CARD" checked><div><b>Card</b><small>Simulated gateway, approved instantly</small></div></label>
              <label class="pay-opt"><input type="radio" name="pm" value="SIMULATED_UPI"><div><b>UPI</b><small>Simulated UPI collect request</small></div></label>
              <label class="pay-opt"><input type="radio" name="pm" value="COD"><div><b>Cash on delivery</b><small>Marked paid when delivered</small></div></label>
            </div>
          </div>
        </div>
        <div class="panel sticky"><h3>Order summary</h3>
          <div style="display:flex;gap:8px;margin-bottom:14px"><input class="input" id="code" placeholder="Coupon code (try WELCOME10)"><button class="btn btn-ghost" id="applyBtn">Apply</button></div>
          <div class="sum-row"><span>Subtotal</span><b>${inr(c.subtotal)}</b></div>
          <div class="sum-row" id="discRow" style="display:none"><span>Discount</span><b style="color:var(--success)" id="disc"></b></div>
          <div class="sum-row"><span>Shipping</span><b>${c.shippingFee ? inr(c.shippingFee) : 'Free'}</b></div>
          <div class="sum-total"><span>Total</span><span id="tot">${inr(c.total)}</span></div>
          <button class="btn btn-accent btn-block" id="placeBtn" style="margin-top:18px;height:50px" ${c.issues.length ? 'disabled' : ''}>Place order</button>
          <p class="note">${icon('shield')} Stock is reserved atomically when you place the order.</p>
        </div>
      </div></div>`;
    document.querySelectorAll('[data-q]').forEach((b) => {
      b.onclick = async () => {
        const it = c.items.find((x) => x.product._id === b.dataset.q);
        const q = it.quantity + Number(b.dataset.d);
        try { if (q < 1) await api('/cart/items/' + b.dataset.q, { method: 'DELETE' }); else await api('/cart/items/' + b.dataset.q, { method: 'PATCH', body: { quantity: q } }); pageCart(); } catch (e) { fail(e); }
      };
    });
    document.querySelectorAll('[data-rm]').forEach((b) => { b.onclick = async () => { await api('/cart/items/' + b.dataset.rm, { method: 'DELETE' }); pageCart(); }; });
    $('#applyBtn').onclick = async () => {
      const code = $('#code').value.trim();
      if (!code) return;
      try {
        const r = await api('/coupons/apply', { method: 'POST', body: { code } });
        discount = r.data.discount; coupon = r.data.code;
        $('#discRow').style.display = ''; $('#disc').textContent = '−' + inr(discount); $('#tot').textContent = inr(r.data.totalAfterDiscount);
        toast('Coupon applied', `${coupon} saves you ${inr(discount)}`, 'info', 'tag');
      } catch (e) { coupon = ''; $('#discRow').style.display = 'none'; $('#tot').textContent = inr(c.total); fail(e); }
    };
    $('#placeBtn').onclick = async () => {
      const f = $('#addr');
      if (!f.reportValidity()) return;
      const shippingAddress = Object.fromEntries(new FormData(f));
      const paymentMethod = document.querySelector('input[name=pm]:checked').value;
      $('#placeBtn').disabled = true; $('#placeBtn').textContent = 'Placing order…';
      try {
        const r = await api('/orders', { method: 'POST', body: { shippingAddress, paymentMethod, ...(coupon && { couponCode: coupon }) } });
        state.cartCount = 0; renderHeader();
        toast('Order placed', `${r.data.orderNumber} · ${inr(r.data.total)}`, 'info', 'check');
        location.hash = '#/orders/' + r.data._id;
      } catch (e) { fail(e); $('#placeBtn').disabled = false; $('#placeBtn').textContent = 'Place order'; }
    };
  }

  async function pageOrders() {
    if (!requireRole()) return;
    const filter = store.get('orderFilter', '');
    const res = await api('/orders?limit=50' + (filter ? '&status=' + filter : ''));
    const title = role() === 'customer' ? 'My orders' : role() === 'seller' ? 'Orders for your store' : 'All orders';
    app.innerHTML = `<div class="container"><div class="dash-head"><div><h1>${title}</h1><p class="muted" style="margin:4px 0 0">${res.meta.total} order(s). Status changes arrive in real time.</p></div>
      <div class="tabs" id="of">${['', 'pending', 'confirmed', 'shipped', 'delivered', 'cancelled'].map((s) => `<button class="${filter === s ? 'active' : ''}" data-s="${s}">${s || 'All'}</button>`).join('')}</div></div>
      <div class="panel table-scroll">${res.data.length ? `<table class="tbl"><thead><tr><th>Order</th><th>Date</th>${role() !== 'customer' ? '<th>Customer</th>' : ''}<th>Items</th><th>Status</th><th>Payment</th><th class="right">Total</th></tr></thead><tbody>
        ${res.data.map((o) => `<tr class="clickable" data-o="${o._id}"><td class="mono">${esc(o.orderNumber)}</td><td class="muted">${fmtDate(o.createdAt)}</td>${role() !== 'customer' ? `<td>${esc(o.customer?.name)}</td>` : ''}<td>${o.items.reduce((s, i) => s + i.quantity, 0)}</td><td>${statusBadge(o.status)}</td><td class="muted" style="font-size:13px">${esc(o.payment.method.replace('SIMULATED_', ''))} · ${esc(o.payment.status)}</td><td class="right"><b>${inr(o.total)}</b></td></tr>`).join('')}
      </tbody></table>` : empty('box', 'No orders yet', 'Orders will appear here once placed.')}</div></div>`;
    document.querySelectorAll('[data-o]').forEach((r) => { r.onclick = () => { location.hash = '#/orders/' + r.dataset.o; }; });
    document.querySelectorAll('#of button').forEach((b) => { b.onclick = () => { store.set('orderFilter', b.dataset.s); pageOrders(); }; });
  }

  const FLOW = ['pending', 'confirmed', 'shipped', 'delivered'];
  const NEXT = { pending: ['confirmed', 'cancelled'], confirmed: ['shipped', 'cancelled'], shipped: ['delivered'], delivered: [], cancelled: [] };

  async function pageOrder(id) {
    if (!requireRole()) return;
    let o;
    try { o = (await api('/orders/' + id)).data; } catch (e) { app.innerHTML = `<div class="container">${empty('box', 'Order not found', e.message)}</div>`; return; }
    const idx = FLOW.indexOf(o.status);
    let actions = NEXT[o.status];
    if (role() === 'customer') actions = actions.filter((a) => a === 'cancelled');
    app.innerHTML = `<div class="container"><div class="dash-head"><div><a href="#/orders" class="muted" style="display:inline-flex;gap:6px;align-items:center;font-size:13px">${icon('back')} All orders</a>
        <h1 style="margin-top:8px">Order <span class="mono" style="font-size:22px">${esc(o.orderNumber)}</span></h1><p class="muted" style="margin:4px 0 0">Placed ${fmtDate(o.createdAt)} · ${statusBadge(o.status)}</p></div>
        <div style="display:flex;gap:8px">${actions.map((a) => `<button class="btn ${a === 'cancelled' ? 'btn-danger' : 'btn-primary'}" data-st="${a}">${a === 'cancelled' ? 'Cancel order' : 'Mark ' + a}</button>`).join('')}</div></div>
      <div class="layout-2" style="margin-top:0">
        <div style="display:flex;flex-direction:column;gap:20px">
          <div class="panel"><h3>Progress</h3>
            ${o.status === 'cancelled' ? `<div class="alert-row out">${icon('x')}<span>This order was cancelled. Stock was returned to inventory${o.payment.status === 'refunded' ? ' and the simulated payment refunded' : ''}.</span></div>` :
              `<div class="timeline">${FLOW.map((s, i) => `<div class="step ${i <= idx ? 'done' : ''}"><div class="c">${i <= idx ? icon('check') : i + 1}</div>${s}</div>`).join('')}</div>`}
            <div style="margin-top:18px">${o.statusHistory.slice().reverse().map((h) => `<div class="sum-row" style="font-size:13px"><span>${statusBadge(h.status)} ${esc(h.note || '')}</span><span>${new Date(h.at).toLocaleString('en-IN')}</span></div>`).join('')}</div>
          </div>
          <div class="panel"><h3>Items</h3>${o.items.map((it) => `<div class="line-item">${art({ ...it, _id: it.product?._id || it.product, name: it.name }, false)}<div><b>${esc(it.name)}</b><div class="muted" style="font-size:13px">${inr(it.unitPrice)} × ${it.quantity} (price at time of order)</div></div><b>${inr(it.lineTotal)}</b></div>`).join('')}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:20px">
          <div class="panel"><h3>Summary</h3>
            <div class="sum-row"><span>Subtotal</span><b>${inr(o.subtotal)}</b></div>
            ${o.discount ? `<div class="sum-row"><span>Discount (${esc(o.couponCode)})</span><b style="color:var(--success)">−${inr(o.discount)}</b></div>` : ''}
            <div class="sum-row"><span>Shipping</span><b>${o.shippingFee ? inr(o.shippingFee) : 'Free'}</b></div>
            <div class="sum-total"><span>Total</span><span>${inr(o.total)}</span></div>
          </div>
          <div class="panel"><h3>Payment <span class="sim-banner" style="margin-left:6px">Simulated</span></h3>
            <div class="sum-row"><span>Method</span><b>${esc(o.payment.method.replace('SIMULATED_', ''))}</b></div>
            <div class="sum-row"><span>Status</span><b style="text-transform:capitalize">${esc(o.payment.status)}</b></div>
            ${o.payment.transactionId ? `<div class="sum-row"><span>Txn</span><b class="mono">${esc(o.payment.transactionId)}</b></div>` : ''}
          </div>
          <div class="panel"><h3>Deliver to</h3><p style="margin:0">${esc(o.shippingAddress.fullName)}<br><span class="muted">${esc(o.shippingAddress.line1)}, ${esc(o.shippingAddress.city)}, ${esc(o.shippingAddress.state)} ${esc(o.shippingAddress.postalCode)}<br>${esc(o.shippingAddress.phone)}</span></p></div>
        </div>
      </div></div>`;
    document.querySelectorAll('[data-st]').forEach((b) => {
      b.onclick = async () => {
        if (b.dataset.st === 'cancelled' && !confirm('Cancel this order? Stock will be returned.')) return;
        try { await api(`/orders/${o._id}/status`, { method: 'PATCH', body: { status: b.dataset.st } }); toast('Order updated', `Now ${b.dataset.st}`, 'info', 'check'); pageOrder(id); } catch (e) { fail(e); }
      };
    });
  }

  function barChart(periods) {
    if (!periods.length) return empty('chart', 'No sales yet', 'Sales will appear here.');
    const W = 640; const H = 260; const pad = { l: 48, r: 8, t: 12, b: 28 };
    const max = Math.max(...periods.map((p) => p.revenue)) * 1.1;
    const bw = (W - pad.l - pad.r) / periods.length;
    const y = (v) => H - pad.b - (v / max) * (H - pad.t - pad.b);
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => max * f);
    const every = Math.ceil(periods.length / 10);
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><defs><linearGradient id="barGrad" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--accent-2)"/><stop offset="1" stop-color="var(--accent)"/></linearGradient></defs>
      ${ticks.map((t) => `<line class="gl" x1="${pad.l}" x2="${W - pad.r}" y1="${y(t)}" y2="${y(t)}"/><text x="${pad.l - 8}" y="${y(t) + 4}" text-anchor="end">${inrShort(t)}</text>`).join('')}
      ${periods.map((p, i) => `<rect class="bar" x="${pad.l + i * bw + bw * 0.18}" y="${y(p.revenue)}" width="${bw * 0.64}" height="${H - pad.b - y(p.revenue)}" rx="${Math.min(6, bw * 0.2)}"><title>${p.period}: ${inr(p.revenue)} · ${p.orders} orders</title></rect>
        ${i % every === 0 ? `<text x="${pad.l + i * bw + bw / 2}" y="${H - 8}" text-anchor="middle">${p.period.slice(5)}</text>` : ''}`).join('')}
    </svg>`;
  }

  async function pageDashboard() {
    if (!requireRole('seller', 'admin')) return;
    const group = store.get('dashGroup', 'day');
    const tab = store.get('dashTab', 'overview');
    app.innerHTML = `<div class="container"><div class="dash-head"><div><h1>${role() === 'admin' ? 'Platform dashboard' : esc(state.user.storeName || 'Seller') + ' dashboard'}</h1>
      <p class="muted" style="margin:4px 0 0">Every number here comes from a MongoDB aggregation pipeline${role() === 'seller' ? ', scoped to your products' : ''}.</p></div>
      <div class="tabs" id="dt"><button data-t="overview" class="${tab === 'overview' ? 'active' : ''}">Overview</button><button data-t="inventory" class="${tab === 'inventory' ? 'active' : ''}">Inventory</button></div></div>
      <div id="dbody"><div class="kpis">${'<div class="skeleton" style="height:120px"></div>'.repeat(4)}</div></div></div>`;
    document.querySelectorAll('#dt button').forEach((b) => { b.onclick = () => { store.set('dashTab', b.dataset.t); pageDashboard(); }; });
    if (tab === 'inventory') return dashInventory();

    const [sales, top, cats, inv, low] = await Promise.all([
      api('/reports/sales?groupBy=' + group), api('/reports/top-products?limit=5'), api('/reports/category-sales'),
      api('/reports/inventory'), api('/reports/low-stock?limit=6'),
    ]);
    const t = sales.data.totals; const it = inv.data.totals;
    const maxCat = Math.max(1, ...cats.data.map((c) => c.revenue));
    const maxTop = Math.max(1, ...top.data.map((p) => p.unitsSold));
    $('#dbody').innerHTML = `
      <div class="kpis">
        <div class="kpi"><div class="lbl"><span class="ic">${icon('rupee')}</span>Revenue</div><div class="val">${inrShort(t.revenue)}</div><div class="sub">Excludes cancelled orders</div></div>
        <div class="kpi"><div class="lbl"><span class="ic">${icon('box')}</span>Orders</div><div class="val">${t.orders}</div><div class="sub">${t.units} units sold</div></div>
        <div class="kpi"><div class="lbl"><span class="ic">${icon('chart')}</span>Avg. order value</div><div class="val">${inrShort(t.avgOrderValue)}</div><div class="sub">Revenue ÷ orders</div></div>
        <div class="kpi"><div class="lbl"><span class="ic">${icon('alert')}</span>Stock alerts</div><div class="val">${it.lowStock}</div><div class="sub">${it.outOfStock} out of stock · ${inrShort(it.stockValue)} in stock</div></div>
      </div>
      <div class="dash-grid">
        <div class="panel"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><h3 style="margin:0">Revenue by ${group}</h3>
          <div class="tabs" id="grp"><button data-g="day" class="${group === 'day' ? 'active' : ''}">Daily</button><button data-g="month" class="${group === 'month' ? 'active' : ''}">Monthly</button></div></div>
          ${barChart(sales.data.periods)}</div>
        <div class="panel"><h3>Best sellers</h3>${top.data.length ? top.data.map((p, i) => `<div class="rank"><span class="n">${i + 1}</span><div class="grow"><b>${esc(p.name)}</b><div class="meter"><i style="width:${(p.unitsSold / maxTop) * 100}%"></i></div></div><div class="right"><b>${p.unitsSold}</b><div class="muted" style="font-size:12px">${inrShort(p.revenue)}</div></div></div>`).join('') : empty('chart', 'No sales yet', '')}</div>
      </div>
      <div class="dash-grid" style="grid-template-columns:1fr 1fr">
        <div class="panel"><h3>Sales by category</h3>${cats.data.map((c) => `<div class="rank"><div class="grow"><b>${esc(c.category)}</b><div class="meter"><i style="width:${(c.revenue / maxCat) * 100}%"></i></div></div><div class="right"><b>${inrShort(c.revenue)}</b><div class="muted" style="font-size:12px">${c.units} units</div></div></div>`).join('') || empty('chart', 'No data', '')}</div>
        <div class="panel"><h3>Low-stock watchlist</h3>${low.data.length ? low.data.map((p) => `<div class="alert-row ${p.stock === 0 ? 'out' : ''}">${icon('alert')}<div style="flex:1"><b>${esc(p.name)}</b><div class="muted" style="font-size:12px">${esc(p.storeName || p.seller)} · threshold ${p.lowStockThreshold}</div></div><b>${p.stock} left</b></div>`).join('') : empty('check', 'All good', 'No products below threshold.')}</div>
      </div>`;
    document.querySelectorAll('#grp button').forEach((b) => { b.onclick = () => { store.set('dashGroup', b.dataset.g); pageDashboard(); }; });
  }

  async function dashInventory() {
    const [res, inv] = await Promise.all([api('/products/mine?limit=100&sort=stock'), api('/reports/inventory')]);
    if (!state.categories.length) state.categories = (await api('/categories', { auth: false })).data;
    $('#dbody').innerHTML = `
      <div class="kpis">${inv.data.byCategory.slice(0, 4).map((c) => `<div class="kpi"><div class="lbl"><span class="ic">${icon('tag')}</span>${esc(c.category)}</div><div class="val">${c.unitsInStock}</div><div class="sub">${c.products} products · ${inrShort(c.stockValue)}</div></div>`).join('')}</div>
      <div class="panel table-scroll"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><h3 style="margin:0">Products (${res.meta.total})</h3><button class="btn btn-accent btn-sm" id="newP">${icon('plus')} New product</button></div>
      <table class="tbl"><thead><tr><th>Product</th><th>SKU</th>${role() === 'admin' ? '<th>Seller</th>' : ''}<th class="right">Price</th><th>Stock</th><th class="right">Actions</th></tr></thead><tbody>
      ${res.data.map((p) => `<tr><td><div style="display:flex;gap:12px;align-items:center"><div style="width:40px;height:40px;border-radius:10px;display:grid;place-items:center;color:#fff;background:${productGradient(p)}">${icon(productIcon(p))}</div><div><b>${esc(p.name)}</b><div class="muted" style="font-size:12px">${esc(p.category?.name)}${p.isActive ? '' : ' · hidden'}</div></div></div></td>
        <td class="mono muted">${esc(p.sku || '—')}</td>${role() === 'admin' ? `<td>${esc(p.seller?.storeName)}</td>` : ''}<td class="right">${inr(p.price)}</td><td>${stockPill(p)}</td>
        <td class="right"><div style="display:inline-flex;gap:6px"><button class="btn btn-ghost btn-sm" data-rs="${p._id}">${icon('plus')} Restock</button><button class="btn btn-ghost btn-sm" data-ed="${p._id}">Edit</button><button class="btn btn-danger btn-sm" data-del="${p._id}">${icon('trash')}</button></div></td></tr>`).join('')}
      </tbody></table></div>`;
    const byId = Object.fromEntries(res.data.map((p) => [p._id, p]));
    document.querySelectorAll('[data-rs]').forEach((b) => {
      b.onclick = async () => {
        const n = Number(prompt('Units to add (use a negative number to remove):', '10'));
        if (!n) return;
        try { await api(`/products/${b.dataset.rs}/stock`, { method: 'PATCH', body: { change: n, reason: n > 0 ? 'restock' : 'adjustment' } }); toast('Stock updated', `${byId[b.dataset.rs].name}: ${n > 0 ? '+' : ''}${n}`, 'info', 'box'); dashInventory(); } catch (e) { fail(e); }
      };
    });
    document.querySelectorAll('[data-del]').forEach((b) => {
      b.onclick = async () => { if (!confirm('Delete this product?')) return; try { await api('/products/' + b.dataset.del, { method: 'DELETE' }); dashInventory(); } catch (e) { fail(e); } };
    });
    document.querySelectorAll('[data-ed]').forEach((b) => { b.onclick = () => productModal(byId[b.dataset.ed]); });
    $('#newP').onclick = () => productModal(null);
  }

  function productModal(p) {
    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    bg.innerHTML = `<form class="modal" id="pf"><div style="display:flex;justify-content:space-between;align-items:center"><h2 style="font-size:22px">${p ? 'Edit product' : 'New product'}</h2><button type="button" class="icon-btn" id="mx">${icon('x')}</button></div>
      <div class="field"><label>Name</label><input class="input" name="name" value="${esc(p?.name || '')}" required minlength="2"></div>
      <div class="field"><label>Description</label><textarea class="input" name="description" rows="3">${esc(p?.description || '')}</textarea></div>
      <div class="grid-2">
        <div class="field"><label>Price (₹)</label><input class="input" name="price" type="number" min="0" step="0.01" value="${p?.price ?? ''}" required></div>
        <div class="field"><label>Category</label><select class="select input" name="category">${state.categories.map((c) => `<option value="${c._id}" ${p?.category?._id === c._id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
        ${p ? '' : '<div class="field"><label>Opening stock</label><input class="input" name="stock" type="number" min="0" step="1" value="10" required></div>'}
        <div class="field"><label>Low-stock threshold</label><input class="input" name="lowStockThreshold" type="number" min="0" value="${p?.lowStockThreshold ?? 5}"></div>
      </div>
      <div class="field err" id="perr"></div>
      <button class="btn btn-accent" type="submit">${p ? 'Save changes' : 'Create product'}</button></form>`;
    document.body.appendChild(bg);
    const close = () => bg.remove();
    $('#mx', bg).onclick = close;
    bg.onclick = (e) => { if (e.target === bg) close(); };
    $('#pf', bg).onsubmit = async (e) => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.target));
      ['price', 'stock', 'lowStockThreshold'].forEach((k) => { if (d[k] !== undefined) d[k] = Number(d[k]); });
      try {
        if (p) await api('/products/' + p._id, { method: 'PATCH', body: d });
        else await api('/products', { method: 'POST', body: d });
        close(); toast(p ? 'Product updated' : 'Product created', d.name, 'info', 'check'); dashInventory();
      } catch (err) { $('#perr', bg).textContent = err.errors ? err.errors.map((x) => `${x.field}: ${x.message}`).join(' · ') : err.message; }
    };
  }

  async function pageAdmin() {
    if (!requireRole('admin')) return;
    const roleF = store.get('adminRole', '');
    const [users, coupons, cats] = await Promise.all([api('/users?limit=50' + (roleF ? '&role=' + roleF : '')), api('/coupons'), api('/categories', { auth: false })]);
    app.innerHTML = `<div class="container"><div class="dash-head"><div><h1>Administration</h1><p class="muted" style="margin:4px 0 0">User management, categories and coupons (admin role only).</p></div></div>
      <div class="dash-grid">
        <div class="panel table-scroll"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><h3 style="margin:0">Users (${users.meta.total})</h3>
          <div class="tabs" id="rf">${['', 'customer', 'seller', 'admin'].map((r) => `<button data-r="${r}" class="${roleF === r ? 'active' : ''}">${r || 'All'}</button>`).join('')}</div></div>
          <table class="tbl"><thead><tr><th>Name</th><th>Role</th><th>Joined</th><th class="right">Status</th></tr></thead><tbody>
          ${users.data.map((u) => `<tr><td><b>${esc(u.name)}</b><div class="muted" style="font-size:12px">${esc(u.email)}</div></td><td style="text-transform:capitalize">${esc(u.role)}${u.storeName ? `<div class="muted" style="font-size:12px">${esc(u.storeName)}</div>` : ''}</td><td class="muted">${fmtDate(u.createdAt)}</td>
            <td class="right">${u._id === state.user._id ? '<span class="muted">You</span>' : `<button class="btn btn-sm ${u.isActive ? 'btn-ghost' : 'btn-danger'}" data-u="${u._id}" data-a="${u.isActive}">${u.isActive ? 'Active' : 'Deactivated'}</button>`}</td></tr>`).join('')}
          </tbody></table></div>
        <div style="display:flex;flex-direction:column;gap:20px">
          <div class="panel"><h3>Categories</h3>${cats.data.map((c) => `<div class="rank"><span class="n">${icon('tag')}</span><div class="grow"><b>${esc(c.name)}</b><span class="muted" style="font-size:12px">${esc(c.description || '')}</span></div><b>${c.productCount}</b></div>`).join('')}
            <form id="cf" style="display:flex;gap:8px;margin-top:12px"><input class="input" name="name" placeholder="New category" required minlength="2"><button class="btn btn-primary">Add</button></form></div>
          <div class="panel"><h3>Coupons</h3>${coupons.data.map((c) => `<div class="rank"><span class="n">${icon('tag')}</span><div class="grow"><b class="mono">${esc(c.code)}</b><span class="muted" style="font-size:12px">${c.type === 'percent' ? c.value + '% off' : inr(c.value) + ' off'}${c.minOrderValue ? ' · min ' + inr(c.minOrderValue) : ''} · used ${c.usedCount}${c.usageLimit ? '/' + c.usageLimit : ''}</span></div>${new Date(c.expiresAt) < new Date() ? '<span class="status s-cancelled">expired</span>' : '<span class="status s-delivered">active</span>'}</div>`).join('')}</div>
        </div>
      </div></div>`;
    document.querySelectorAll('#rf button').forEach((b) => { b.onclick = () => { store.set('adminRole', b.dataset.r); pageAdmin(); }; });
    document.querySelectorAll('[data-u]').forEach((b) => {
      b.onclick = async () => {
        const active = b.dataset.a === 'true';
        if (!confirm(active ? 'Deactivate this user? Their tokens stop working immediately.' : 'Reactivate this user?')) return;
        try { await api('/users/' + b.dataset.u, { method: 'PATCH', body: { isActive: !active } }); pageAdmin(); } catch (e) { fail(e); }
      };
    });
    $('#cf').onsubmit = async (e) => {
      e.preventDefault();
      try { await api('/categories', { method: 'POST', body: { name: e.target.name.value } }); state.categories = []; toast('Category created', e.target.name.value, 'info', 'tag'); pageAdmin(); } catch (err) { fail(err); }
    };
  }

  function pageLogin(params) {
    if (state.user) { location.hash = '#/'; return; }
    let mode = params.get('mode') === 'register' ? 'register' : 'login';
    const demo = [['customer', 'aarav@shopsphere.dev', 'Aarav'], ['seller', 'seller.tech@shopsphere.dev', 'TechNova'], ['admin', 'admin@shopsphere.dev', 'Platform']];
    const render = () => {
      app.innerHTML = `<div class="auth-wrap"><div class="auth-side">
          <div class="brand" style="color:#fff"><span class="brand-mark">${icon('bag')}</span>ShopSphere</div>
          <div><h2>Shop, sell and manage inventory in one place.</h2><p>JWT access and refresh tokens, bcrypt-hashed passwords and role-based access for customers, sellers and admins.</p></div>
          <div class="hero-stats"><div><b>3</b><span style="color:rgba(255,255,255,.65)">Roles</span></div><div><b>40+</b><span style="color:rgba(255,255,255,.65)">API endpoints</span></div><div><b>Live</b><span style="color:rgba(255,255,255,.65)">Socket.IO</span></div></div>
        </div>
        <div class="auth-form"><form class="auth-card" id="af">
          <div class="seg"><button type="button" data-m="login" class="${mode === 'login' ? 'active' : ''}">Sign in</button><button type="button" data-m="register" class="${mode === 'register' ? 'active' : ''}">Create account</button></div>
          <div><h1>${mode === 'login' ? 'Welcome back' : 'Create your account'}</h1><p class="muted" style="margin:6px 0 0">${mode === 'login' ? 'Sign in to continue.' : 'Join as a customer or open a store as a seller.'}</p></div>
          ${mode === 'register' ? `<div class="field"><label>Full name</label><input class="input" name="name" required minlength="2"></div>
            <div class="seg" id="rr"><button type="button" class="active" data-r="customer">I want to shop</button><button type="button" data-r="seller">I want to sell</button></div>
            <div class="field" id="storeF" style="display:none"><label>Store name</label><input class="input" name="storeName"></div>` : ''}
          <div class="field"><label>Email</label><input class="input" name="email" type="email" required autocomplete="username"></div>
          <div class="field"><label>Password</label><input class="input" name="password" type="password" required autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}" ${mode === 'register' ? 'minlength="8"' : ''}>${mode === 'register' ? '<span class="muted" style="font-size:12px">At least 8 characters with a letter and a number.</span>' : ''}</div>
          <div class="err" id="aerr" style="color:var(--danger);font-size:13px"></div>
          <button class="btn btn-primary btn-block" style="height:48px">${mode === 'login' ? 'Sign in' : 'Create account'}</button>
          ${mode === 'login' ? `<div class="divider">Demo accounts · password Password@123</div><div class="demo-accounts">${demo.map(([r, e, n]) => `<button type="button" data-e="${e}"><b>${r}</b><span class="muted">${n}</span></button>`).join('')}</div>` : ''}
        </form></div></div>`;
      document.querySelectorAll('[data-m]').forEach((b) => { b.onclick = () => { mode = b.dataset.m; render(); }; });
      let regRole = 'customer';
      document.querySelectorAll('#rr button').forEach((b) => {
        b.onclick = () => { regRole = b.dataset.r; document.querySelectorAll('#rr button').forEach((x) => x.classList.toggle('active', x === b)); $('#storeF').style.display = regRole === 'seller' ? '' : 'none'; };
      });
      document.querySelectorAll('[data-e]').forEach((b) => { b.onclick = () => { $('#af').email.value = b.dataset.e; $('#af').password.value = 'Password@123'; $('#af').requestSubmit(); }; });
      $('#af').onsubmit = async (e) => {
        e.preventDefault();
        const d = Object.fromEntries(new FormData(e.target));
        $('#aerr').textContent = '';
        try {
          let res;
          if (mode === 'login') res = await api('/auth/login', { method: 'POST', body: { email: d.email, password: d.password }, auth: false });
          else res = await api('/auth/register', { method: 'POST', auth: false, body: { name: d.name, email: d.email, password: d.password, role: regRole, ...(regRole === 'seller' && { storeName: d.storeName }) } });
          setSession(res.data.user, res.data.accessToken, res.data.refreshToken);
          toast(`Hi ${res.data.user.name.split(' ')[0]}!`, `Signed in as ${res.data.user.role}`, 'info', 'user');
          const next = params.get('next');
          location.hash = next || (res.data.user.role === 'customer' ? '#/' : '#/dashboard');
        } catch (err) { $('#aerr').textContent = err.errors ? err.errors.map((x) => x.message).join(' · ') : err.message; }
      };
    };
    render();
  }

  /* ---------- Router ---------- */
  async function route() {
    const hash = location.hash || '#/';
    if (hash === '#catalogue') return;
    const [path, query] = hash.slice(1).split('?');
    const params = new URLSearchParams(query);
    const parts = path.split('/').filter(Boolean);
    renderHeader();
    window.scrollTo({ top: 0 });
    try {
      if (!parts.length) await pageShop();
      else if (parts[0] === 'product') await pageProduct(parts[1]);
      else if (parts[0] === 'cart') await pageCart();
      else if (parts[0] === 'orders' && parts[1]) await pageOrder(parts[1]);
      else if (parts[0] === 'orders') await pageOrders();
      else if (parts[0] === 'dashboard') await pageDashboard();
      else if (parts[0] === 'admin') await pageAdmin();
      else if (parts[0] === 'login') pageLogin(params);
      else app.innerHTML = `<div class="container">${empty('search', 'Page not found', '', '<a class="btn btn-primary" href="#/">Go home</a>')}</div>`;
    } catch (e) { fail(e); }
  }
  window.addEventListener('hashchange', route);

  // Boot
  if (state.user) { connectSocket(); loadBadges(); }
  route();
})();
