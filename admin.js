const Admin = (() => {
  const API = '/api';
  let token = localStorage.getItem('adminToken') || null;
  let user = JSON.parse(localStorage.getItem('adminUser') || 'null');
  let categories = [];
  let salesChart = null;

  function authHeaders() { return token ? { Authorization: `Bearer ${token}` } : {}; }

  async function api(path, opts = {}) {
    const isForm = opts.body instanceof FormData;
    const res = await fetch(API + path, {
      ...opts,
      headers: {
        ...(isForm ? {} : { 'Content-Type': 'application/json' }),
        ...authHeaders(),
        ...(opts.headers || {})
      },
      body: isForm ? opts.body : (opts.body ? JSON.stringify(opts.body) : undefined)
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

  function init() {
    if (token && user && user.role === 'admin') {
      document.getElementById('loginGate').style.display = 'none';
      document.getElementById('adminApp').style.display = 'block';
      show('dashboard');
    }
  }

  async function login() {
    document.getElementById('adminLoginError').textContent = '';
    try {
      const email = document.getElementById('adminEmail').value;
      const password = document.getElementById('adminPassword').value;
      const result = await api('/auth/login', { method: 'POST', body: { email, password } });
      if (result.user.role !== 'admin') {
        document.getElementById('adminLoginError').textContent = 'This account is not an admin. Use the promote form below if this is your first admin account.';
        return;
      }
      token = result.token; user = result.user;
      localStorage.setItem('adminToken', token); localStorage.setItem('adminUser', JSON.stringify(user));
      document.getElementById('loginGate').style.display = 'none';
      document.getElementById('adminApp').style.display = 'block';
      show('dashboard');
    } catch (e) { document.getElementById('adminLoginError').textContent = e.message; }
  }

  async function bootstrap() {
    const adminKey = document.getElementById('bootstrapKey').value;
    const email = document.getElementById('bootstrapEmail').value;
    try {
      const result = await api('/admin/bootstrap', { method: 'POST', body: { adminKey, email } });
      document.getElementById('bootstrapMsg').innerHTML = `<span class="text-cyan">${result.message} You can now log in above.</span>`;
    } catch (e) {
      document.getElementById('bootstrapMsg').innerHTML = `<span class="text-danger">${e.message}</span>`;
    }
  }

  function show(panel) {
    document.querySelectorAll('.admin-panel').forEach(p => p.style.display = 'none');
    document.getElementById(`panel-${panel}`).style.display = 'block';
    const loaders = { dashboard: loadDashboard, products: loadProducts, categories: loadCategories, coupons: loadCoupons, orders: loadOrders, reviews: loadReviews, analytics: loadAnalytics };
    loaders[panel] && loaders[panel]();
  }

  // ---------- DASHBOARD ----------
  async function loadDashboard() {
    try {
      const d = await api('/admin/dashboard');
      document.getElementById('panel-dashboard').innerHTML = `
        <h4 class="mono text-gold mb-3">Dashboard</h4>
        <div class="row g-3 mb-4">
          ${statCard('Total Revenue', money(d.totalRevenue), 'bi-currency-dollar')}
          ${statCard('Total Orders', d.totalOrders, 'bi-receipt')}
          ${statCard('Paid Orders', d.paidOrders, 'bi-check-circle')}
          ${statCard('Pending Orders', d.pendingOrders, 'bi-hourglass-split')}
          ${statCard('Products', d.totalProducts, 'bi-box-seam')}
          ${statCard('Customers', d.totalCustomers, 'bi-people')}
        </div>
        <div class="bg-elevated border-terminal rounded p-3">
          <h6 class="text-cyan mono">LOW STOCK ALERTS</h6>
          ${d.lowStockAlerts.length ? `
            <table class="table table-dark table-sm mono mb-0">
              <thead><tr><th>Product</th><th>Stock</th></tr></thead>
              <tbody>${d.lowStockAlerts.map(p => `<tr><td>${p.name}</td><td class="text-danger">${p.stock}</td></tr>`).join('')}</tbody>
            </table>` : '<div class="text-dim small">All products are well stocked.</div>'}
        </div>
      `;
    } catch (e) { toast(e.message); }
  }

  function statCard(label, value, icon) {
    return `<div class="col-md-4 col-lg-2">
      <div class="bg-elevated border-terminal rounded p-3 text-center">
        <i class="bi ${icon} text-gold fs-4"></i>
        <div class="fs-5 mono">${value}</div>
        <div class="small text-dim">${label}</div>
      </div>
    </div>`;
  }

  // ---------- PRODUCTS ----------
  async function loadProducts() {
    try {
      categories = await api('/categories');
      const sel = document.getElementById('pf_category');
      sel.innerHTML = '<option value="">No category</option>' + categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');

      const { products } = await api('/products?limit=200');
      document.getElementById('panel-products').innerHTML = `
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h4 class="mono text-gold mb-0">Products</h4>
          <button class="btn btn-gold btn-sm" onclick="Admin.openProductForm()"><i class="bi bi-plus"></i> New Product</button>
        </div>
        <div class="table-responsive bg-elevated border-terminal rounded p-2">
          <table class="table table-dark table-hover mono align-middle mb-0">
            <thead><tr><th>Image</th><th>Name</th><th>Category</th><th>Price</th><th>Stock</th><th>Active</th><th></th></tr></thead>
            <tbody>${products.map(p => `
              <tr>
                <td><img src="${(p.images && p.images[0]) || 'https://via.placeholder.com/40'}" style="width:40px;height:40px;object-fit:cover;" class="rounded"></td>
                <td>${p.name}</td>
                <td>${(categories.find(c => c.id === p.categoryId) || {}).name || '-'}</td>
                <td>${money(p.price)}</td>
                <td><input type="number" value="${p.stock}" class="form-control form-control-sm bg-dark text-white" style="width:80px;" onchange="Admin.adjustStock('${p.id}', this.value)"></td>
                <td>${p.active ? '✅' : '⛔'}</td>
                <td>
                  <button class="btn btn-sm btn-outline-cyan" onclick='Admin.openProductForm(${JSON.stringify(p).replace(/'/g, "&#39;")})'><i class="bi bi-pencil"></i></button>
                  <button class="btn btn-sm btn-outline-danger" onclick="Admin.deleteProduct('${p.id}')"><i class="bi bi-trash"></i></button>
                </td>
              </tr>
            `).join('')}</tbody>
          </table>
        </div>
      `;
    } catch (e) { toast(e.message); }
  }

  function openProductForm(p) {
    document.getElementById('pf_error').textContent = '';
    document.getElementById('pf_id').value = p ? p.id : '';
    document.getElementById('pf_name').value = p ? p.name : '';
    document.getElementById('pf_category').value = p ? (p.categoryId || '') : '';
    document.getElementById('pf_description').value = p ? p.description : '';
    document.getElementById('pf_price').value = p ? p.price : '';
    document.getElementById('pf_compareAt').value = p && p.compareAtPrice ? p.compareAtPrice : '';
    document.getElementById('pf_stock').value = p ? p.stock : 0;
    document.getElementById('pf_sku').value = p ? p.sku : '';
    document.getElementById('pf_imageUrl').value = p && p.images && p.images[0] ? p.images[0] : '';
    document.getElementById('pf_imageFile').value = '';
    new bootstrap.Modal(document.getElementById('productFormModal')).show();
  }

  async function saveProduct() {
    const errorEl = document.getElementById('pf_error');
    errorEl.textContent = '';
    try {
      const id = document.getElementById('pf_id').value;
      let imageUrl = document.getElementById('pf_imageUrl').value;
      const file = document.getElementById('pf_imageFile').files[0];

      if (file) {
        const fd = new FormData();
        fd.append('image', file);
        const uploadResult = await api('/products/upload-image', { method: 'POST', body: fd });
        imageUrl = uploadResult.url;
      }

      const payload = {
        name: document.getElementById('pf_name').value,
        categoryId: document.getElementById('pf_category').value || null,
        description: document.getElementById('pf_description').value,
        price: parseFloat(document.getElementById('pf_price').value),
        compareAtPrice: document.getElementById('pf_compareAt').value ? parseFloat(document.getElementById('pf_compareAt').value) : null,
        stock: parseInt(document.getElementById('pf_stock').value || 0),
        sku: document.getElementById('pf_sku').value,
        images: imageUrl ? [imageUrl] : []
      };

      if (id) await api(`/products/${id}`, { method: 'PUT', body: payload });
      else await api('/products', { method: 'POST', body: payload });

      bootstrap.Modal.getInstance(document.getElementById('productFormModal')).hide();
      toast('Product saved.');
      loadProducts();
    } catch (e) { errorEl.textContent = e.message; }
  }

  async function adjustStock(id, stock) {
    try {
      await api(`/products/${id}/inventory`, { method: 'PATCH', body: { stock: parseInt(stock) } });
      toast('Stock updated.');
    } catch (e) { toast(e.message); }
  }

  async function deleteProduct(id) {
    if (!confirm('Delete this product?')) return;
    try {
      await api(`/products/${id}`, { method: 'DELETE' });
      toast('Product deleted.');
      loadProducts();
    } catch (e) { toast(e.message); }
  }

  // ---------- CATEGORIES ----------
  async function loadCategories() {
    try {
      const cats = await api('/categories');
      document.getElementById('panel-categories').innerHTML = `
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h4 class="mono text-gold mb-0">Categories</h4>
          <button class="btn btn-gold btn-sm" onclick="Admin.openCategoryForm()"><i class="bi bi-plus"></i> New Category</button>
        </div>
        <div class="table-responsive bg-elevated border-terminal rounded p-2">
          <table class="table table-dark table-hover mono mb-0">
            <thead><tr><th>Name</th><th>Slug</th><th>Description</th><th></th></tr></thead>
            <tbody>${cats.map(c => `
              <tr>
                <td>${c.name}</td><td>${c.slug}</td><td class="text-dim">${c.description || ''}</td>
                <td>
                  <button class="btn btn-sm btn-outline-cyan" onclick='Admin.openCategoryForm(${JSON.stringify(c).replace(/'/g, "&#39;")})'><i class="bi bi-pencil"></i></button>
                  <button class="btn btn-sm btn-outline-danger" onclick="Admin.deleteCategory('${c.id}')"><i class="bi bi-trash"></i></button>
                </td>
              </tr>
            `).join('')}</tbody>
          </table>
        </div>
      `;
    } catch (e) { toast(e.message); }
  }

  function openCategoryForm(c) {
    document.getElementById('cf_error').textContent = '';
    document.getElementById('cf_id').value = c ? c.id : '';
    document.getElementById('cf_name').value = c ? c.name : '';
    document.getElementById('cf_description').value = c ? c.description : '';
    new bootstrap.Modal(document.getElementById('categoryFormModal')).show();
  }

  async function saveCategory() {
    const errorEl = document.getElementById('cf_error');
    try {
      const id = document.getElementById('cf_id').value;
      const payload = { name: document.getElementById('cf_name').value, description: document.getElementById('cf_description').value };
      if (id) await api(`/categories/${id}`, { method: 'PUT', body: payload });
      else await api('/categories', { method: 'POST', body: payload });
      bootstrap.Modal.getInstance(document.getElementById('categoryFormModal')).hide();
      toast('Category saved.');
      loadCategories();
    } catch (e) { errorEl.textContent = e.message; }
  }

  async function deleteCategory(id) {
    if (!confirm('Delete this category?')) return;
    try {
      await api(`/categories/${id}`, { method: 'DELETE' });
      toast('Category deleted.');
      loadCategories();
    } catch (e) { toast(e.message); }
  }

  // ---------- COUPONS ----------
  async function loadCoupons() {
    try {
      const coupons = await api('/coupons');
      document.getElementById('panel-coupons').innerHTML = `
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h4 class="mono text-gold mb-0">Coupons</h4>
          <button class="btn btn-gold btn-sm" onclick="Admin.openCouponForm()"><i class="bi bi-plus"></i> New Coupon</button>
        </div>
        <div class="table-responsive bg-elevated border-terminal rounded p-2">
          <table class="table table-dark table-hover mono mb-0">
            <thead><tr><th>Code</th><th>Type</th><th>Value</th><th>Used</th><th>Limit</th><th>Expires</th><th>Active</th><th></th></tr></thead>
            <tbody>${coupons.map(c => `
              <tr>
                <td>${c.code}</td><td>${c.type}</td><td>${c.type === 'percent' ? c.value + '%' : money(c.value)}</td>
                <td>${c.timesUsed}</td><td>${c.usageLimit || '∞'}</td>
                <td>${c.expiresAt ? new Date(c.expiresAt).toLocaleDateString() : '-'}</td>
                <td>${c.active ? '✅' : '⛔'}</td>
                <td>
                  <button class="btn btn-sm btn-outline-cyan" onclick="Admin.toggleCoupon('${c.id}', ${!c.active})">${c.active ? 'Disable' : 'Enable'}</button>
                  <button class="btn btn-sm btn-outline-danger" onclick="Admin.deleteCoupon('${c.id}')"><i class="bi bi-trash"></i></button>
                </td>
              </tr>
            `).join('')}</tbody>
          </table>
        </div>
      `;
    } catch (e) { toast(e.message); }
  }

  function openCouponForm() {
    document.getElementById('cpf_error').textContent = '';
    ['cpf_code', 'cpf_value', 'cpf_minSubtotal', 'cpf_usageLimit', 'cpf_expiresAt'].forEach(id => document.getElementById(id).value = '');
    new bootstrap.Modal(document.getElementById('couponFormModal')).show();
  }

  async function saveCoupon() {
    const errorEl = document.getElementById('cpf_error');
    try {
      const payload = {
        code: document.getElementById('cpf_code').value,
        type: document.getElementById('cpf_type').value,
        value: parseFloat(document.getElementById('cpf_value').value),
        minSubtotal: document.getElementById('cpf_minSubtotal').value ? parseFloat(document.getElementById('cpf_minSubtotal').value) : 0,
        usageLimit: document.getElementById('cpf_usageLimit').value ? parseInt(document.getElementById('cpf_usageLimit').value) : null,
        expiresAt: document.getElementById('cpf_expiresAt').value || null
      };
      await api('/coupons', { method: 'POST', body: payload });
      bootstrap.Modal.getInstance(document.getElementById('couponFormModal')).hide();
      toast('Coupon created.');
      loadCoupons();
    } catch (e) { errorEl.textContent = e.message; }
  }

  async function toggleCoupon(id, active) {
    try {
      await api(`/coupons/${id}`, { method: 'PUT', body: { active } });
      loadCoupons();
    } catch (e) { toast(e.message); }
  }

  async function deleteCoupon(id) {
    if (!confirm('Delete this coupon?')) return;
    try {
      await api(`/coupons/${id}`, { method: 'DELETE' });
      loadCoupons();
    } catch (e) { toast(e.message); }
  }

  // ---------- ORDERS ----------
  async function loadOrders() {
    try {
      const orders = await api('/orders/admin/all');
      const statuses = ['pending_payment', 'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'];
      document.getElementById('panel-orders').innerHTML = `
        <h4 class="mono text-gold mb-3">Orders</h4>
        <div class="table-responsive bg-elevated border-terminal rounded p-2">
          <table class="table table-dark table-hover mono align-middle mb-0">
            <thead><tr><th>Order</th><th>Date</th><th>Items</th><th>Total</th><th>Status</th></tr></thead>
            <tbody>${orders.map(o => `
              <tr>
                <td>#${o.id.slice(0, 8).toUpperCase()}</td>
                <td>${new Date(o.createdAt).toLocaleString()}</td>
                <td>${o.items.reduce((s, i) => s + i.quantity, 0)}</td>
                <td>${money(o.total)}</td>
                <td>
                  <select class="form-select form-select-sm bg-dark text-white" style="width:150px;" onchange="Admin.updateOrderStatus('${o.id}', this.value)">
                    ${statuses.map(s => `<option value="${s}" ${s === o.status ? 'selected' : ''}>${s}</option>`).join('')}
                  </select>
                </td>
              </tr>
            `).join('')}</tbody>
          </table>
        </div>
      `;
    } catch (e) { toast(e.message); }
  }

  async function updateOrderStatus(id, status) {
    try {
      await api(`/orders/${id}/status`, { method: 'PATCH', body: { status } });
      toast('Order status updated.');
    } catch (e) { toast(e.message); }
  }

  // ---------- REVIEWS ----------
  async function loadReviews() {
    try {
      const reviews = await api('/reviews');
      document.getElementById('panel-reviews').innerHTML = `
        <h4 class="mono text-gold mb-3">Review Moderation</h4>
        <div class="table-responsive bg-elevated border-terminal rounded p-2">
          <table class="table table-dark table-hover mono mb-0">
            <thead><tr><th>User</th><th>Rating</th><th>Comment</th><th>Approved</th><th></th></tr></thead>
            <tbody>${reviews.map(r => `
              <tr>
                <td>${r.userName}</td>
                <td>${'★'.repeat(r.rating)}</td>
                <td class="text-dim">${r.comment || ''}</td>
                <td>${r.approved ? '✅' : '⛔'}</td>
                <td>
                  <button class="btn btn-sm btn-outline-cyan" onclick="Admin.toggleReview('${r.id}', ${!r.approved})">${r.approved ? 'Hide' : 'Approve'}</button>
                  <button class="btn btn-sm btn-outline-danger" onclick="Admin.deleteReview('${r.id}')"><i class="bi bi-trash"></i></button>
                </td>
              </tr>
            `).join('')}</tbody>
          </table>
        </div>
      `;
    } catch (e) { toast(e.message); }
  }

  async function toggleReview(id, approved) {
    try {
      await api(`/reviews/${id}/approve`, { method: 'PATCH', body: { approved } });
      loadReviews();
    } catch (e) { toast(e.message); }
  }

  async function deleteReview(id) {
    if (!confirm('Delete this review?')) return;
    try {
      await api(`/reviews/${id}`, { method: 'DELETE' });
      loadReviews();
    } catch (e) { toast(e.message); }
  }

  // ---------- ANALYTICS ----------
  async function loadAnalytics() {
    try {
      const sales = await api('/analytics/sales?days=30');
      const topProducts = await api('/analytics/top-products?limit=5');
      const topCustomers = await api('/analytics/customers');

      document.getElementById('panel-analytics').innerHTML = `
        <h4 class="mono text-gold mb-3">Sales Analytics (last 30 days)</h4>
        <div class="row g-3 mb-4">
          ${statCard('Revenue (30d)', money(sales.totalRevenue), 'bi-graph-up')}
          ${statCard('Orders (30d)', sales.totalOrders, 'bi-bag-check')}
          ${statCard('Avg Order Value', money(sales.averageOrderValue), 'bi-calculator')}
        </div>
        <div class="bg-elevated border-terminal rounded p-3 mb-4">
          <canvas id="salesChart" height="90"></canvas>
        </div>
        <div class="row g-3">
          <div class="col-md-6">
            <div class="bg-elevated border-terminal rounded p-3">
              <h6 class="text-cyan mono">TOP PRODUCTS</h6>
              <table class="table table-dark table-sm mono mb-0">
                <thead><tr><th>Product</th><th>Units</th><th>Revenue</th></tr></thead>
                <tbody>${topProducts.map(p => `<tr><td>${p.name}</td><td>${p.unitsSold}</td><td>${money(p.revenue)}</td></tr>`).join('') || '<tr><td colspan="3" class="text-dim">No sales yet.</td></tr>'}</tbody>
              </table>
            </div>
          </div>
          <div class="col-md-6">
            <div class="bg-elevated border-terminal rounded p-3">
              <h6 class="text-cyan mono">TOP CUSTOMERS</h6>
              <table class="table table-dark table-sm mono mb-0">
                <thead><tr><th>Customer</th><th>Orders</th><th>Spent</th></tr></thead>
                <tbody>${topCustomers.slice(0, 5).map(c => `<tr><td>${c.name}</td><td>${c.orders}</td><td>${money(c.totalSpent)}</td></tr>`).join('') || '<tr><td colspan="3" class="text-dim">No sales yet.</td></tr>'}</tbody>
              </table>
            </div>
          </div>
        </div>
      `;

      const ctx = document.getElementById('salesChart');
      if (salesChart) salesChart.destroy();
      salesChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: sales.series.map(s => s.date.slice(5)),
          datasets: [{
            label: 'Revenue ($)',
            data: sales.series.map(s => s.revenue),
            borderColor: '#d4af37',
            backgroundColor: 'rgba(212,175,55,0.15)',
            tension: 0.3,
            fill: true
          }]
        },
        options: {
          scales: {
            x: { ticks: { color: '#8a99a8' }, grid: { color: '#1e2830' } },
            y: { ticks: { color: '#8a99a8' }, grid: { color: '#1e2830' } }
          },
          plugins: { legend: { labels: { color: '#e6edf3' } } }
        }
      });
    } catch (e) { toast(e.message); }
  }

  document.addEventListener('DOMContentLoaded', init);

  return {
    login, bootstrap, show,
    openProductForm, saveProduct, adjustStock, deleteProduct,
    openCategoryForm, saveCategory, deleteCategory,
    openCouponForm, saveCoupon, toggleCoupon, deleteCoupon,
    updateOrderStatus,
    toggleReview, deleteReview
  };
})();
