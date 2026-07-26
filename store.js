const Store = (() => {
  const API = '/api';
  let state = {
    token: localStorage.getItem('token') || null,
    user: JSON.parse(localStorage.getItem('user') || 'null'),
    categories: [],
    page: 1,
    stripe: null,
    stripeElements: null,
    cardElement: null,
    currentOrder: null,
    currentClientSecret: null,
    demoMode: false
  };

  function authHeaders() {
    return state.token ? { Authorization: `Bearer ${state.token}` } : {};
  }

  async function api(path, opts = {}) {
    const res = await fetch(API + path, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
        ...(opts.headers || {})
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Request failed.');
    return data;
  }

  function toast(msg) {
    document.getElementById('toastBody').textContent = msg;
    new bootstrap.Toast(document.getElementById('mainToast')).show();
  }

  function money(n) { return `$${Number(n).toFixed(2)}`; }

  // ---------- INIT ----------
  async function init() {
    updateAuthUI();
    await loadCategories();
    await loadProducts();
    if (state.token) refreshCartCount();
  }

  function updateAuthUI() {
    const nav = document.getElementById('authNav');
    if (state.user) {
      nav.innerHTML = `<a class="nav-link" href="#" onclick="Store.logout()"><i class="bi bi-box-arrow-right"></i> ${state.user.name.split(' ')[0]} (logout)</a>`;
    } else {
      nav.innerHTML = `<a class="nav-link" href="#" onclick="Store.showAuth()"><i class="bi bi-person"></i> Login</a>`;
    }
  }

  // ---------- CATEGORIES ----------
  async function loadCategories() {
    try {
      state.categories = await api('/categories');
      const sel = document.getElementById('filterCategory');
      sel.innerHTML = '<option value="">All categories</option>' +
        state.categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    } catch (e) { console.error(e); }
  }

  // ---------- PRODUCTS ----------
  async function loadProducts(page = 1) {
    state.page = page;
    const search = document.getElementById('searchInput').value.trim();
    const category = document.getElementById('filterCategory').value;
    const minPrice = document.getElementById('filterMin').value;
    const maxPrice = document.getElementById('filterMax').value;
    const sort = document.getElementById('filterSort').value;

    const params = new URLSearchParams({ page, limit: 9 });
    if (search) params.set('search', search);
    if (category) params.set('category', category);
    if (minPrice) params.set('minPrice', minPrice);
    if (maxPrice) params.set('maxPrice', maxPrice);
    if (sort) params.set('sort', sort);

    try {
      const { products, pagination } = await api(`/products?${params}`);
      renderProducts(products);
      renderPagination(pagination);
    } catch (e) { toast(e.message); }
  }

  function renderProducts(products) {
    const grid = document.getElementById('productGrid');
    if (products.length === 0) {
      grid.innerHTML = '<div class="col-12 text-dim text-center py-5">No products found.</div>';
      return;
    }
    grid.innerHTML = products.map(p => `
      <div class="col-md-4">
        <div class="card card-terminal h-100">
          <img src="${(p.images && p.images[0]) || 'https://via.placeholder.com/300x180?text=No+Image'}" class="product-thumb w-100" onclick="Store.openProduct('${p.id}')" style="cursor:pointer;">
          <div class="card-body">
            <h6 class="mb-1" style="cursor:pointer" onclick="Store.openProduct('${p.id}')">${p.name}</h6>
            <div class="mb-1">
              <span class="price">${money(p.price)}</span>
              ${p.compareAtPrice ? `<span class="price-strike ms-2">${money(p.compareAtPrice)}</span>` : ''}
            </div>
            <div class="small text-dim mb-2">${p.ratingCount ? '★ ' + p.ratingAverage + ' (' + p.ratingCount + ')' : 'No reviews yet'}</div>
            <span class="badge ${p.stock > 5 ? 'badge-stock-ok' : (p.stock > 0 ? 'badge-stock-low' : 'bg-secondary')}">${p.stock > 0 ? p.stock + ' in stock' : 'Out of stock'}</span>
            <div class="d-flex gap-2 mt-2">
              <button class="btn btn-gold btn-sm flex-grow-1" ${p.stock <= 0 ? 'disabled' : ''} onclick="Store.addToCart('${p.id}')"><i class="bi bi-cart-plus"></i></button>
              <button class="btn btn-outline-cyan btn-sm" onclick="Store.addToWishlist('${p.id}')"><i class="bi bi-heart"></i></button>
            </div>
          </div>
        </div>
      </div>
    `).join('');
  }

  function renderPagination(p) {
    const el = document.getElementById('pagination');
    if (p.pages <= 1) { el.innerHTML = ''; return; }
    let html = '';
    for (let i = 1; i <= p.pages; i++) {
      html += `<li class="page-item ${i === p.page ? 'active' : ''}"><a class="page-link" href="#" onclick="Store.loadProducts(${i}); return false;">${i}</a></li>`;
    }
    el.innerHTML = html;
  }

  function onSearch(e) { e.preventDefault(); loadProducts(1); return false; }
  function applyFilters() { loadProducts(1); }

  // ---------- PRODUCT DETAIL ----------
  async function openProduct(id) {
    try {
      const p = await api(`/products/${id}`);
      const reviews = await api(`/reviews/product/${id}`);
      document.getElementById('pmTitle').textContent = p.name;
      document.getElementById('pmBody').innerHTML = `
        <div class="row">
          <div class="col-md-5">
            <img src="${(p.images && p.images[0]) || 'https://via.placeholder.com/400'}" class="w-100 rounded border-terminal">
          </div>
          <div class="col-md-7">
            <p class="text-dim">${p.description || 'No description available.'}</p>
            <div class="mb-2"><span class="price fs-4">${money(p.price)}</span> ${p.compareAtPrice ? `<span class="price-strike ms-2">${money(p.compareAtPrice)}</span>` : ''}</div>
            <div class="mb-2 small text-dim">SKU: ${p.sku}</div>
            <span class="badge ${p.stock > 5 ? 'badge-stock-ok' : (p.stock > 0 ? 'badge-stock-low' : 'bg-secondary')} mb-3">${p.stock > 0 ? p.stock + ' in stock' : 'Out of stock'}</span>
            <div class="d-flex gap-2 mb-3">
              <button class="btn btn-gold" ${p.stock <= 0 ? 'disabled' : ''} onclick="Store.addToCart('${p.id}')">Add to Cart</button>
              <button class="btn btn-outline-cyan" onclick="Store.addToWishlist('${p.id}')">Wishlist</button>
            </div>
          </div>
        </div>
        <hr class="border-terminal">
        <h6 class="text-cyan">Reviews (${reviews.length})</h6>
        <div id="reviewsList">${reviews.map(r => `
          <div class="mb-2 pb-2 border-bottom border-terminal">
            <div class="rating-stars">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</div>
            <div class="small text-dim">${r.userName} &middot; ${new Date(r.createdAt).toLocaleDateString()}</div>
            <div>${r.comment || ''}</div>
          </div>
        `).join('') || '<div class="text-dim small">Be the first to review this product.</div>'}</div>
        ${state.user ? `
        <form onsubmit="return Store.submitReview(event, '${p.id}')" class="mt-3">
          <select id="reviewRating" class="form-select form-select-sm mb-2" style="max-width:150px;">
            <option value="5">★★★★★</option>
            <option value="4">★★★★☆</option>
            <option value="3">★★★☆☆</option>
            <option value="2">★★☆☆☆</option>
            <option value="1">★☆☆☆☆</option>
          </select>
          <textarea id="reviewComment" class="form-control form-control-sm mb-2" placeholder="Write a review..."></textarea>
          <button class="btn btn-outline-cyan btn-sm" type="submit">Submit Review</button>
        </form>` : '<div class="small text-dim mt-2">Log in to leave a review.</div>'}
      `;
      new bootstrap.Modal(document.getElementById('productModal')).show();
    } catch (e) { toast(e.message); }
  }

  async function submitReview(e, productId) {
    e.preventDefault();
    try {
      const rating = parseInt(document.getElementById('reviewRating').value);
      const comment = document.getElementById('reviewComment').value;
      await api('/reviews', { method: 'POST', body: { productId, rating, comment } });
      toast('Review submitted!');
      openProduct(productId);
    } catch (e) { toast(e.message); }
    return false;
  }

  // ---------- CART ----------
  async function refreshCartCount() {
    if (!state.token) { document.getElementById('cartCount').textContent = '0'; return; }
    try {
      const cart = await api('/cart');
      const count = cart.items.reduce((s, i) => s + i.quantity, 0);
      document.getElementById('cartCount').textContent = count;
    } catch (e) { /* ignore */ }
  }

  async function addToCart(productId) {
    if (!state.token) { toast('Please log in first.'); showAuth(); return; }
    try {
      await api('/cart/items', { method: 'POST', body: { productId, quantity: 1 } });
      toast('Added to cart.');
      refreshCartCount();
    } catch (e) { toast(e.message); }
  }

  async function showCart() {
    if (!state.token) { toast('Please log in first.'); showAuth(); return; }
    await renderCart();
    new bootstrap.Offcanvas(document.getElementById('cartPanel')).show();
  }

  async function renderCart() {
    try {
      const cart = await api('/cart');
      const container = document.getElementById('cartItems');
      if (cart.items.length === 0) {
        container.innerHTML = '<div class="text-dim text-center py-4">Your cart is empty.</div>';
      } else {
        container.innerHTML = cart.items.map(i => `
          <div class="cart-item d-flex gap-2">
            <img src="${(i.product.images && i.product.images[0]) || 'https://via.placeholder.com/60'}" style="width:60px;height:60px;object-fit:cover;" class="rounded border-terminal">
            <div class="flex-grow-1">
              <div class="small">${i.product.name}</div>
              <div class="price small">${money(i.product.price)}</div>
              <div class="d-flex align-items-center gap-1 mt-1">
                <button class="btn btn-sm btn-outline-cyan py-0 px-2" onclick="Store.setQty('${i.productId}', ${i.quantity - 1})">-</button>
                <span class="mono px-2">${i.quantity}</span>
                <button class="btn btn-sm btn-outline-cyan py-0 px-2" onclick="Store.setQty('${i.productId}', ${i.quantity + 1})">+</button>
                <button class="btn btn-sm btn-outline-danger py-0 px-2 ms-auto" onclick="Store.removeFromCart('${i.productId}')"><i class="bi bi-trash"></i></button>
              </div>
            </div>
          </div>
        `).join('');
      }
      document.getElementById('cartSubtotal').textContent = money(cart.subtotal);
      document.getElementById('cartTotal').textContent = money(cart.subtotal);
      document.getElementById('cartDiscount').textContent = '-$0.00';
    } catch (e) { toast(e.message); }
  }

  async function setQty(productId, qty) {
    try {
      await api(`/cart/items/${productId}`, { method: 'PUT', body: { quantity: qty } });
      renderCart();
      refreshCartCount();
    } catch (e) { toast(e.message); }
  }

  async function removeFromCart(productId) {
    try {
      await api(`/cart/items/${productId}`, { method: 'DELETE' });
      renderCart();
      refreshCartCount();
    } catch (e) { toast(e.message); }
  }

  let appliedDiscount = 0, appliedCouponCode = null;
  async function applyCoupon() {
    const code = document.getElementById('couponInput').value.trim();
    if (!code) return;
    try {
      const cart = await api('/cart');
      const result = await api('/coupons/validate', { method: 'POST', body: { code, subtotal: cart.subtotal } });
      appliedDiscount = result.discount;
      appliedCouponCode = code;
      document.getElementById('couponMsg').innerHTML = `<span class="text-cyan">Coupon applied: -${money(result.discount)}</span>`;
      document.getElementById('cartDiscount').textContent = `-${money(result.discount)}`;
      document.getElementById('cartTotal').textContent = money(cart.subtotal - result.discount);
    } catch (e) {
      appliedDiscount = 0; appliedCouponCode = null;
      document.getElementById('couponMsg').innerHTML = `<span class="text-danger">${e.message}</span>`;
    }
  }

  // ---------- WISHLIST ----------
  async function addToWishlist(productId) {
    if (!state.token) { toast('Please log in first.'); showAuth(); return; }
    try {
      await api(`/wishlist/${productId}`, { method: 'POST' });
      toast('Added to wishlist.');
    } catch (e) { toast(e.message); }
  }

  async function showWishlist() {
    if (!state.token) { toast('Please log in first.'); showAuth(); return; }
    try {
      const { items } = await api('/wishlist');
      const container = document.getElementById('wishlistItems');
      container.innerHTML = items.length ? items.map(p => `
        <div class="cart-item d-flex gap-2">
          <img src="${(p.images && p.images[0]) || 'https://via.placeholder.com/60'}" style="width:60px;height:60px;object-fit:cover;" class="rounded border-terminal">
          <div class="flex-grow-1">
            <div class="small">${p.name}</div>
            <div class="price small">${money(p.price)}</div>
            <div class="d-flex gap-1 mt-1">
              <button class="btn btn-sm btn-gold py-0 px-2" onclick="Store.addToCart('${p.id}')">Add to cart</button>
              <button class="btn btn-sm btn-outline-danger py-0 px-2" onclick="Store.removeFromWishlist('${p.id}')">Remove</button>
            </div>
          </div>
        </div>
      `).join('') : '<div class="text-dim text-center py-4">Your wishlist is empty.</div>';
      new bootstrap.Offcanvas(document.getElementById('wishlistPanel')).show();
    } catch (e) { toast(e.message); }
  }

  async function removeFromWishlist(productId) {
    try {
      await api(`/wishlist/${productId}`, { method: 'DELETE' });
      showWishlist();
    } catch (e) { toast(e.message); }
  }

  // ---------- ORDERS ----------
  async function showOrders() {
    if (!state.token) { toast('Please log in first.'); showAuth(); return; }
    try {
      const orders = await api('/orders');
      const container = document.getElementById('ordersItems');
      container.innerHTML = orders.length ? orders.map(o => `
        <div class="order-row">
          <div class="d-flex justify-content-between">
            <span class="mono">#${o.id.slice(0, 8).toUpperCase()}</span>
            <span class="badge bg-secondary">${o.status}</span>
          </div>
          <div class="small text-dim">${new Date(o.createdAt).toLocaleString()}</div>
          <div class="price">${money(o.total)}</div>
        </div>
      `).join('') : '<div class="text-dim text-center py-4">No orders yet.</div>';
      new bootstrap.Offcanvas(document.getElementById('ordersPanel')).show();
    } catch (e) { toast(e.message); }
  }

  // ---------- AUTH ----------
  function showAuth() { new bootstrap.Modal(document.getElementById('authModal')).show(); }

  async function login(e) {
    e.preventDefault();
    document.getElementById('loginError').textContent = '';
    try {
      const email = document.getElementById('loginEmail').value;
      const password = document.getElementById('loginPassword').value;
      const { token, user } = await api('/auth/login', { method: 'POST', body: { email, password } });
      state.token = token; state.user = user;
      localStorage.setItem('token', token); localStorage.setItem('user', JSON.stringify(user));
      updateAuthUI(); refreshCartCount();
      bootstrap.Modal.getInstance(document.getElementById('authModal')).hide();
      toast(`Welcome back, ${user.name}!`);
    } catch (e) { document.getElementById('loginError').textContent = e.message; }
    return false;
  }

  async function register(e) {
    e.preventDefault();
    document.getElementById('registerError').textContent = '';
    try {
      const name = document.getElementById('regName').value;
      const email = document.getElementById('regEmail').value;
      const password = document.getElementById('regPassword').value;
      const { token, user } = await api('/auth/register', { method: 'POST', body: { name, email, password } });
      state.token = token; state.user = user;
      localStorage.setItem('token', token); localStorage.setItem('user', JSON.stringify(user));
      updateAuthUI(); refreshCartCount();
      bootstrap.Modal.getInstance(document.getElementById('authModal')).hide();
      toast(`Welcome, ${user.name}!`);
    } catch (e) { document.getElementById('registerError').textContent = e.message; }
    return false;
  }

  function logout() {
    state.token = null; state.user = null;
    localStorage.removeItem('token'); localStorage.removeItem('user');
    updateAuthUI(); refreshCartCount();
    toast('Logged out.');
  }

  // ---------- CHECKOUT ----------
  async function startCheckout() {
    try {
      const cart = await api('/cart');
      if (cart.items.length === 0) { toast('Your cart is empty.'); return; }
      document.getElementById('checkoutSummary').innerHTML = `
        <div class="d-flex justify-content-between"><span>Subtotal</span><span class="mono">${money(cart.subtotal)}</span></div>
        ${appliedDiscount ? `<div class="d-flex justify-content-between text-cyan"><span>Discount (${appliedCouponCode})</span><span class="mono">-${money(appliedDiscount)}</span></div>` : ''}
        <div class="d-flex justify-content-between fw-bold"><span>Total</span><span class="mono price">${money(cart.subtotal - appliedDiscount)}</span></div>
      `;
      bootstrap.Offcanvas.getInstance(document.getElementById('cartPanel'))?.hide();
      new bootstrap.Modal(document.getElementById('checkoutModal')).show();
    } catch (e) { toast(e.message); }
  }

  async function placeOrder() {
    document.getElementById('checkoutError').textContent = '';
    const shippingAddress = {
      line1: document.getElementById('shipLine1').value,
      city: document.getElementById('shipCity').value,
      state: document.getElementById('shipState').value,
      zip: document.getElementById('shipZip').value
    };
    try {
      const result = await api('/payments/create-intent', {
        method: 'POST',
        body: { couponCode: appliedCouponCode, shippingAddress }
      });
      state.currentOrder = result.order;

      if (result.demoMode) {
        // No Stripe configured — confirm the order directly (demo/dev flow)
        await api(`/payments/confirm-demo/${result.order.id}`, { method: 'POST' });
        bootstrap.Modal.getInstance(document.getElementById('checkoutModal')).hide();
        toast('Order placed! (Demo mode — no real payment was processed.)');
        appliedDiscount = 0; appliedCouponCode = null;
        refreshCartCount();
        return;
      }

      // Real Stripe flow
      state.currentClientSecret = result.clientSecret;
      if (!state.stripe) {
        toast('Stripe publishable key not set on the frontend — see README.');
        return;
      }
      document.getElementById('stripeCardWrap').style.display = 'block';
      if (!state.cardElement) {
        state.stripeElements = state.stripe.elements();
        state.cardElement = state.stripeElements.create('card');
        state.cardElement.mount('#card-element');
      }

      const { error, paymentIntent } = await state.stripe.confirmCardPayment(state.currentClientSecret, {
        payment_method: { card: state.cardElement }
      });
      if (error) {
        document.getElementById('checkoutError').textContent = error.message;
        return;
      }
      if (paymentIntent.status === 'succeeded') {
        bootstrap.Modal.getInstance(document.getElementById('checkoutModal')).hide();
        toast('Payment successful! Order confirmed.');
        appliedDiscount = 0; appliedCouponCode = null;
        refreshCartCount();
      }
    } catch (e) {
      document.getElementById('checkoutError').textContent = e.message;
    }
  }

  // Set STRIPE_PUBLISHABLE_KEY below if using real Stripe payments on the frontend
  const STRIPE_PUBLISHABLE_KEY = ''; // e.g. 'pk_test_xxxxx'
  if (STRIPE_PUBLISHABLE_KEY) state.stripe = Stripe(STRIPE_PUBLISHABLE_KEY);

  document.addEventListener('DOMContentLoaded', init);

  return {
    onSearch, applyFilters, loadProducts, openProduct, submitReview,
    addToCart, showCart, setQty, removeFromCart, applyCoupon,
    addToWishlist, showWishlist, removeFromWishlist,
    showOrders, showAuth, login, register, logout,
    startCheckout, placeOrder
  };
})();
