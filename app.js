// ===== app.js — Core Application Logic =====

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getAuth, onAuthStateChanged
}
 from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  getFirestore,
  collection, doc, addDoc, updateDoc, deleteDoc,
  getDocs, getDoc, query, where, orderBy, limit,
  serverTimestamp, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ============================================================
// Firebase Config — same as auth.js
// ============================================================
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDPcUiDQP2Tg9u-QZ7iZCfPPjmwpPYrfq4",
  authDomain: "stationery-stats.firebaseapp.com",
  projectId: "stationery-stats",
  storageBucket: "stationery-stats.firebasestorage.app",
  messagingSenderId: "3658223192",
  appId: "1:3658223192:web:f5d3d6424cae6660e4442d",
  measurementId: "G-V66X07MRJ7"
};

let app;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApps()[0];
}
const auth = getAuth(app);
const db = getFirestore(app);

// ============================================================
// App State
// ============================================================
let currentUser = null;
let allInventory = [];
let allSales = [];
let allCredit = [];
let deleteTargetId = null;

// ============================================================
// Auth Guard + Page Init
// ============================================================
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = 'index.html';
    return;
  }
  currentUser = user;

  // Load user display info
  const userDoc = await getDoc(doc(db, 'users', user.uid));
  const userData = userDoc.exists() ? userDoc.data() : {};
  updateSidebarUser(user, userData);

  // Init correct page
  const page = window.location.pathname.split('/').pop();
  if (page === 'dashboard.html') initDashboard();
  else if (page === 'inventory.html') initInventory();
  else if (page === 'sales.html') initSales();
  else if (page === 'credit.html') initCredit();
  else if (page === 'analysis.html') initAnalysis();
});

function updateSidebarUser(user, userData) {
  const nameEl = document.getElementById('user-name');
  const shopEl = document.getElementById('user-shop');
  const avatarEl = document.getElementById('user-avatar');
  if (nameEl) nameEl.textContent = userData?.name || user.displayName || user.email;
  if (shopEl) shopEl.textContent = userData?.shopName || 'My Shop';
  if (avatarEl) avatarEl.textContent = (userData?.name || user.displayName || user.email || 'U')[0].toUpperCase();
}

// ============================================================
// FIRESTORE HELPERS
// ============================================================
function inventoryRef() { return collection(db, 'users', currentUser.uid, 'inventory'); }
function salesRef() { return collection(db, 'users', currentUser.uid, 'sales'); }
function creditRef() { return collection(db, 'users', currentUser.uid, 'credit'); }

async function fetchInventory() {
  const snap = await getDocs(query(inventoryRef(), orderBy('name')));
  allInventory = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return allInventory;
}

async function fetchSales(days = 365) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const snap = await getDocs(query(salesRef(), orderBy('timestamp', 'desc')));
  allSales = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return allSales;
}

async function fetchCredit() {
  const snap = await getDocs(query(creditRef(), orderBy('createdAt', 'desc')));
  allCredit = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return allCredit;
}

// ============================================================
// DASHBOARD
// ============================================================
async function initDashboard() {
  const [inv, sales] = await Promise.all([fetchInventory(), fetchSales(30)]);

  const today = new Date().toDateString();
  const todaySales = sales.filter(s => s.timestamp?.toDate?.()?.toDateString() === today);
  const yesterdaySales = sales.filter(s => {
    const d = new Date(); d.setDate(d.getDate() - 1);
    return s.timestamp?.toDate?.()?.toDateString() === d.toDateString();
  });

  const todayRev = todaySales.reduce((a, s) => a + (s.total || 0), 0);
  const yestRev = yesterdaySales.reduce((a, s) => a + (s.total || 0), 0);
  const lowStock = inv.filter(i => i.stock <= (i.lowThreshold || 5));

  setVal('stat-revenue', `₹${todayRev.toFixed(2)}`);
  setVal('stat-orders', todaySales.length);
  setVal('stat-products', inv.length);
  setVal('stat-lowstock', lowStock.length);

  // Revenue change
  const revChange = yestRev > 0 ? ((todayRev - yestRev) / yestRev * 100).toFixed(1) : 0;
  const revEl = document.getElementById('stat-rev-change');
  if (revEl) {
    revEl.innerHTML = revChange >= 0
      ? `<i class="fas fa-arrow-up"></i> ${revChange}% vs yesterday`
      : `<i class="fas fa-arrow-down"></i> ${Math.abs(revChange)}% vs yesterday`;
    revEl.className = `stat-change ${revChange >= 0 ? 'positive' : 'negative'}`;
  }

  renderRecentSales(todaySales.slice(0, 8));
  renderLowStock(lowStock);

  // Charts
  renderWeeklyChart(sales);
  renderCategoryChart(sales);

  // AI Tip (dashboard quick tip)
  fetchDashboardAITip(inv, sales);
}

function renderRecentSales(sales) {
  const tbody = document.getElementById('recent-sales-body');
  if (!tbody) return;
  if (!sales.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-row">No sales yet today</td></tr>';
    return;
  }
  tbody.innerHTML = sales.map(s => `
    <tr>
      <td>${s.productName || '—'}</td>
      <td>${s.qty}</td>
      <td>₹${(s.total || 0).toFixed(2)}</td>
      <td>${formatTime(s.timestamp)}</td>
    </tr>
  `).join('');
}

function renderLowStock(items) {
  const el = document.getElementById('low-stock-list');
  if (!el) return;
  if (!items.length) {
    el.innerHTML = '<p class="empty-row">All items are well-stocked ✓</p>';
    return;
  }
  el.innerHTML = items.slice(0, 6).map(i => `
    <div class="stock-item">
      <div>
        <p class="stock-item-name">${i.name}</p>
        <p class="stock-item-count">${i.category}</p>
      </div>
      <span class="badge ${i.stock === 0 ? 'badge-red' : 'badge-amber'}">${i.stock} left</span>
    </div>
  `).join('');
}

// ============================================================
// INVENTORY PAGE
// ============================================================
async function initInventory() {
  await fetchInventory();
  renderInventoryTable(allInventory);

  // Add Product modal helpers
  window.openAddProduct = () => {
    document.getElementById('modal-title').textContent = 'Add Product';
    document.getElementById('product-form').reset();
    document.getElementById('p-id').value = '';
    openModal('product-modal');
  };

  window.openEditProduct = (id) => {
    const item = allInventory.find(i => i.id === id);
    if (!item) return;
    document.getElementById('modal-title').textContent = 'Edit Product';
    document.getElementById('p-id').value = id;
    document.getElementById('p-name').value = item.name;
    document.getElementById('p-category').value = item.category;
    document.getElementById('p-buy-price').value = item.buyPrice;
    document.getElementById('p-sell-price').value = item.sellPrice;
    document.getElementById('p-stock').value = item.stock;
    document.getElementById('p-low-threshold').value = item.lowThreshold || 5;
    document.getElementById('p-desc').value = item.description || '';
    openModal('product-modal');
  };

  window.openDeleteProduct = (id) => {
    deleteTargetId = id;
    const item = allInventory.find(i => i.id === id);
    document.getElementById('delete-product-name').textContent = item?.name || 'this product';
    openModal('delete-modal');
  };

  window.saveProduct = async (e) => {
    e.preventDefault();
    const id = document.getElementById('p-id').value;
    const data = {
      name: document.getElementById('p-name').value,
      category: document.getElementById('p-category').value,
      buyPrice: parseFloat(document.getElementById('p-buy-price').value),
      sellPrice: parseFloat(document.getElementById('p-sell-price').value),
      stock: parseInt(document.getElementById('p-stock').value),
      lowThreshold: parseInt(document.getElementById('p-low-threshold').value) || 5,
      description: document.getElementById('p-desc').value,
    };

    if (id) {
      await updateDoc(doc(inventoryRef(), id), data);
    } else {
      await addDoc(inventoryRef(), { ...data, createdAt: serverTimestamp() });
    }
    closeModal('product-modal');
    await fetchInventory();
    renderInventoryTable(allInventory);
  };

  window.confirmDelete = async () => {
    if (!deleteTargetId) return;
    await deleteDoc(doc(inventoryRef(), deleteTargetId));
    deleteTargetId = null;
    closeModal('delete-modal');
    await fetchInventory();
    renderInventoryTable(allInventory);
  };

  window.filterInventory = () => {
    const search = document.getElementById('inv-search')?.value.toLowerCase() || '';
    const cat = document.getElementById('cat-filter')?.value || '';
    const stockF = document.getElementById('stock-filter')?.value || '';
    let filtered = allInventory.filter(i => {
      if (search && !i.name.toLowerCase().includes(search)) return false;
      if (cat && i.category !== cat) return false;
      if (stockF === 'low' && !(i.stock > 0 && i.stock <= (i.lowThreshold || 5))) return false;
      if (stockF === 'out' && i.stock !== 0) return false;
      if (stockF === 'ok' && i.stock <= (i.lowThreshold || 5)) return false;
      return true;
    });
    renderInventoryTable(filtered);
  };
}

function renderInventoryTable(items) {
  const tbody = document.getElementById('inventory-body');
  if (!tbody) return;
  const count = document.getElementById('item-count-text');
  if (count) count.textContent = `${items.length} item${items.length !== 1 ? 's' : ''}`;

  if (!items.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-row">No products found</td></tr>';
    return;
  }
  tbody.innerHTML = items.map(i => {
    const margin = i.buyPrice > 0 ? (((i.sellPrice - i.buyPrice) / i.buyPrice) * 100).toFixed(0) : 0;
    let statusBadge = '<span class="badge badge-green">In Stock</span>';
    if (i.stock === 0) statusBadge = '<span class="badge badge-red">Out of Stock</span>';
    else if (i.stock <= (i.lowThreshold || 5)) statusBadge = '<span class="badge badge-amber">Low Stock</span>';

    return `
      <tr>
        <td><strong>${i.name}</strong>${i.description ? `<br><small style="color:var(--text-muted)">${i.description}</small>` : ''}</td>
        <td><span class="badge badge-blue">${i.category}</span></td>
        <td>₹${(i.buyPrice || 0).toFixed(2)}</td>
        <td>₹${(i.sellPrice || 0).toFixed(2)} <small style="color:var(--text-muted)">(${margin}% margin)</small></td>
        <td class="stock-num">${i.stock}</td>
        <td>${statusBadge}</td>
        <td>
          <div class="action-btns">
            <button class="action-btn edit" onclick="openEditProduct('${i.id}')"><i class="fas fa-edit"></i></button>
            <button class="action-btn delete" onclick="openDeleteProduct('${i.id}')"><i class="fas fa-trash"></i></button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// ============================================================
// SALES PAGE
// ============================================================
async function initSales() {
  await Promise.all([fetchInventory(), fetchSales()]);
  renderSalesTable(allSales);
  updateSalesStats();

  window.openNewSale = () => {
    const sel = document.getElementById('s-product');
    if (sel) {
      sel.innerHTML = '<option value="">Select product</option>' +
        allInventory.filter(i => i.stock > 0).map(i =>
          `<option value="${i.id}" data-sell="${i.sellPrice}" data-buy="${i.buyPrice}" data-stock="${i.stock}">${i.name} (Stock: ${i.stock})</option>`
        ).join('');
    }
    document.getElementById('sale-form')?.reset();
    document.getElementById('sale-total-val').textContent = '₹0';
    document.getElementById('sale-profit-val').textContent = '₹0';
    openModal('sale-modal');
  };

  window.onProductSelect = () => {
    const sel = document.getElementById('s-product');
    const opt = sel.selectedOptions[0];
    if (opt) {
      document.getElementById('s-price').value = opt.dataset.sell || '';
      calcTotal();
    }
  };

  window.calcTotal = () => {
    const qty = parseFloat(document.getElementById('s-qty')?.value) || 0;
    const price = parseFloat(document.getElementById('s-price')?.value) || 0;
    const sel = document.getElementById('s-product');
    const opt = sel?.selectedOptions[0];
    const buyPrice = parseFloat(opt?.dataset.buy || 0);

    const total = qty * price;
    const profit = qty * (price - buyPrice);
    setVal('sale-total-val', `₹${total.toFixed(2)}`);
    setVal('sale-profit-val', `₹${profit.toFixed(2)}`);
  };

  window.saveSale = async (e) => {
    e.preventDefault();
    const sel = document.getElementById('s-product');
    const productId = sel.value;
    const opt = sel.selectedOptions[0];
    const qty = parseInt(document.getElementById('s-qty').value);
    const price = parseFloat(document.getElementById('s-price').value);
    const note = document.getElementById('s-note').value;
    const buyPrice = parseFloat(opt?.dataset.buy || 0);
    const currentStock = parseInt(opt?.dataset.stock || 0);
    const productName = opt?.textContent.split('(')[0].trim();
    const invItem = allInventory.find(i => i.id === productId);

    if (qty > currentStock) {
      alert(`Only ${currentStock} units available!`); return;
    }

    const saleData = {
      productId,
      productName,
      category: invItem?.category || '',
      qty,
      unitPrice: price,
      buyPrice,
      total: qty * price,
      profit: qty * (price - buyPrice),
      note,
      timestamp: serverTimestamp()
    };

    await addDoc(salesRef(), saleData);
    await updateDoc(doc(inventoryRef(), productId), { stock: currentStock - qty });

    closeModal('sale-modal');
    await Promise.all([fetchInventory(), fetchSales()]);
    renderSalesTable(allSales);
    updateSalesStats();
  };

  window.filterSales = () => {
    const search = document.getElementById('sales-search')?.value.toLowerCase() || '';
    const date = document.getElementById('sales-date-filter')?.value;
    const cat = document.getElementById('sales-cat-filter')?.value;
    let filtered = allSales.filter(s => {
      if (search && !s.productName?.toLowerCase().includes(search)) return false;
      if (date) {
        const sDate = s.timestamp?.toDate?.()?.toISOString().split('T')[0];
        if (sDate !== date) return false;
      }
      if (cat && s.category !== cat) return false;
      return true;
    });
    renderSalesTable(filtered);
  };

  window.clearFilters = () => {
    document.getElementById('sales-search').value = '';
    document.getElementById('sales-date-filter').value = '';
    document.getElementById('sales-cat-filter').value = '';
    renderSalesTable(allSales);
  };
}

function renderSalesTable(sales) {
  const tbody = document.getElementById('sales-body');
  if (!tbody) return;
  if (!sales.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-row">No sales found</td></tr>';
    return;
  }
  tbody.innerHTML = sales.map(s => `
    <tr>
      <td><strong>${s.productName || '—'}</strong></td>
      <td><span class="badge badge-blue">${s.category || '—'}</span></td>
      <td>${s.qty}</td>
      <td>₹${(s.unitPrice || 0).toFixed(2)}</td>
      <td>₹${(s.total || 0).toFixed(2)}</td>
      <td style="color:var(--green)">₹${(s.profit || 0).toFixed(2)}</td>
      <td>${formatDateTime(s.timestamp)}</td>
      <td>
        <button class="action-btn delete" onclick="deleteSaleConfirm('${s.id}')"><i class="fas fa-trash"></i></button>
      </td>
    </tr>
  `).join('');
}

window.deleteSaleConfirm = async (id) => {
  if (!confirm('Delete this sale record?')) return;
  await deleteDoc(doc(salesRef(), id));
  await fetchSales();
  renderSalesTable(allSales);
  updateSalesStats();
};

function updateSalesStats() {
  const today = new Date().toDateString();
  const thisMonth = new Date().toISOString().slice(0, 7);
  const todaySales = allSales.filter(s => s.timestamp?.toDate?.()?.toDateString() === today);
  const monthSales = allSales.filter(s => s.timestamp?.toDate?.()?.toISOString().slice(0, 7) === thisMonth);

  setVal('today-rev', `₹${todaySales.reduce((a, s) => a + s.total, 0).toFixed(2)}`);
  setVal('today-orders', todaySales.length);
  setVal('month-rev', `₹${monthSales.reduce((a, s) => a + s.total, 0).toFixed(2)}`);
  setVal('total-profit', `₹${allSales.reduce((a, s) => a + (s.profit || 0), 0).toFixed(2)}`);
}

// ============================================================
// ANALYSIS PAGE
// ============================================================
async function initAnalysis() {
  const days = parseInt(document.getElementById('period-filter')?.value || 30);
  await loadAnalysisData(days);

  window.changePeriod = async (days) => {
    await loadAnalysisData(parseInt(days));
  };

  window.exportCSV = () => {
    if (!allInventory.length) return;
    const rows = [['Product', 'Category', 'Units Sold', 'Revenue', 'Profit', 'Margin%', 'Stock Left']];
    const perfData = buildPerformanceData();
    perfData.forEach(p => {
      rows.push([p.name, p.category, p.unitsSold, p.revenue.toFixed(2), p.profit.toFixed(2), p.margin, p.stock]);
    });
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'performance.csv'; a.click();
  };
}

async function loadAnalysisData(days) {
  const [inv, sales] = await Promise.all([fetchInventory(), fetchSales(days)]);

  const since = new Date();
  since.setDate(since.getDate() - days);
  const filteredSales = sales.filter(s => {
    const d = s.timestamp?.toDate?.();
    return d && d >= since;
  });

  const totalRev = filteredSales.reduce((a, s) => a + (s.total || 0), 0);
  const totalProfit = filteredSales.reduce((a, s) => a + (s.profit || 0), 0);
  const margin = totalRev > 0 ? ((totalProfit / totalRev) * 100).toFixed(1) : 0;
  const avgOrder = filteredSales.length > 0 ? (totalRev / filteredSales.length).toFixed(2) : 0;

  setVal('an-revenue', `₹${totalRev.toFixed(2)}`);
  setVal('an-profit', `₹${totalProfit.toFixed(2)}`);
  setVal('an-orders', filteredSales.length);
  setVal('an-margin', `Margin: ${margin}%`);
  setVal('an-avg-order', `Avg: ₹${avgOrder}/order`);

  // Best seller
  const productMap = {};
  filteredSales.forEach(s => {
    if (!productMap[s.productName]) productMap[s.productName] = 0;
    productMap[s.productName] += s.qty || 0;
  });
  const best = Object.entries(productMap).sort((a, b) => b[1] - a[1])[0];
  setVal('an-bestseller', best?.[0] || '—');
  setVal('an-best-units', best ? `${best[1]} units sold` : '0 units sold');

  // Charts
  if (window.Chart) {
    renderTrendChart(filteredSales, days);
    renderCatPieChart(filteredSales);
    renderTopProductsChart(filteredSales);
    renderHourlyChart(filteredSales);
  }

  // Performance table
  renderPerformanceTable(inv, filteredSales);

  // AI Tips
  generateAITipsFromData(inv, filteredSales);
}

function buildPerformanceData() {
  const map = {};
  allInventory.forEach(i => {
    map[i.id] = { id: i.id, name: i.name, category: i.category, stock: i.stock, buyPrice: i.buyPrice, sellPrice: i.sellPrice, unitsSold: 0, revenue: 0, profit: 0 };
  });
  allSales.forEach(s => {
    if (map[s.productId]) {
      map[s.productId].unitsSold += s.qty || 0;
      map[s.productId].revenue += s.total || 0;
      map[s.productId].profit += s.profit || 0;
    }
  });
  return Object.values(map).map(p => ({
    ...p,
    margin: p.revenue > 0 ? ((p.profit / p.revenue) * 100).toFixed(1) : 0
  })).sort((a, b) => b.revenue - a.revenue);
}

function renderPerformanceTable(inv, sales) {
  const tbody = document.getElementById('perf-table-body');
  if (!tbody) return;
  const perfData = buildPerformanceData();
  const maxRev = Math.max(...perfData.map(p => p.revenue), 1);

  tbody.innerHTML = perfData.map(p => {
    const barW = Math.round((p.revenue / maxRev) * 100);
    return `
      <tr>
        <td><strong>${p.name}</strong></td>
        <td><span class="badge badge-blue">${p.category}</span></td>
        <td>${p.unitsSold}</td>
        <td>₹${p.revenue.toFixed(2)}</td>
        <td style="color:var(--green)">₹${p.profit.toFixed(2)}</td>
        <td>${p.margin}%</td>
        <td><span class="badge ${p.stock === 0 ? 'badge-red' : p.stock <= 5 ? 'badge-amber' : 'badge-green'}">${p.stock}</span></td>
        <td><div class="perf-bar"><div class="perf-bar-fill" style="width:${barW}%"></div></div></td>
      </tr>
    `;
  }).join('');
}

// ============================================================
// CREDIT PAGE
// ============================================================
async function initCredit() {
  await fetchCredit();
  renderCreditTable(allCredit);
  updateCreditStats();

  window.openNewCredit = () => {
    document.getElementById('credit-modal-title').textContent = 'New Credit Transaction';
    document.getElementById('credit-form').reset();
    document.getElementById('credit-id').value = '';
    openModal('credit-modal');
  };

  window.saveCredit = async (e) => {
    e.preventDefault();
    const id = document.getElementById('credit-id').value;
    const data = {
      customerName: document.getElementById('c-customer').value,
      amount: parseFloat(document.getElementById('c-amount').value),
      dueDate: new Date(document.getElementById('c-due-date').value),
      note: document.getElementById('c-note').value,
      status: 'active',
      outstanding: parseFloat(document.getElementById('c-amount').value),
      createdAt: serverTimestamp()
    };

    if (id) {
      await updateDoc(doc(creditRef(), id), data);
    } else {
      await addDoc(creditRef(), data);
    }
    closeModal('credit-modal');
    await fetchCredit();
    renderCreditTable(allCredit);
    updateCreditStats();
  };

  window.openPayment = (id) => {
    const credit = allCredit.find(c => c.id === id);
    if (!credit) return;
    document.getElementById('payment-credit-id').value = id;
    document.getElementById('payment-customer-name').textContent = credit.customerName;
    document.getElementById('payment-outstanding').textContent = `₹${credit.outstanding.toFixed(2)}`;
    document.getElementById('payment-form').reset();
    openModal('payment-modal');
  };

  window.savePayment = async (e) => {
    e.preventDefault();
    const creditId = document.getElementById('payment-credit-id').value;
    const paymentAmount = parseFloat(document.getElementById('p-amount').value);
    const note = document.getElementById('p-note').value;

    const credit = allCredit.find(c => c.id === creditId);
    if (!credit) return;

    const newOutstanding = credit.outstanding - paymentAmount;
    const status = newOutstanding <= 0 ? 'paid' : 'active';

    // Update credit record
    await updateDoc(doc(creditRef(), creditId), {
      outstanding: Math.max(0, newOutstanding),
      status,
      lastPayment: serverTimestamp(),
      lastPaymentAmount: paymentAmount
    });

    // Add payment record
    await addDoc(collection(db, 'users', currentUser.uid, 'payments'), {
      creditId,
      customerName: credit.customerName,
      amount: paymentAmount,
      note,
      timestamp: serverTimestamp()
    });

    closeModal('payment-modal');
    await fetchCredit();
    renderCreditTable(allCredit);
    updateCreditStats();
  };

  window.filterCredit = () => {
    const search = document.getElementById('credit-search')?.value.toLowerCase() || '';
    const status = document.getElementById('credit-status-filter')?.value || '';
    let filtered = allCredit.filter(c => {
      if (search && !c.customerName?.toLowerCase().includes(search)) return false;
      if (status && c.status !== status) return false;
      return true;
    });
    renderCreditTable(filtered);
  };

  window.clearCreditFilters = () => {
    document.getElementById('credit-search').value = '';
    document.getElementById('credit-status-filter').value = '';
    renderCreditTable(allCredit);
  };
}

function renderCreditTable(credits) {
  const tbody = document.getElementById('credit-body');
  if (!tbody) return;
  if (!credits.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-row">No credit transactions found</td></tr>';
    return;
  }
  tbody.innerHTML = credits.map(c => {
    const dueDate = c.dueDate?.toDate?.() || new Date(c.dueDate);
    const isOverdue = dueDate < new Date() && c.status === 'active';
    let statusBadge = '<span class="badge badge-blue">Active</span>';
    if (c.status === 'paid') statusBadge = '<span class="badge badge-green">Paid</span>';
    else if (isOverdue) statusBadge = '<span class="badge badge-red">Overdue</span>';

    return `
      <tr>
        <td><strong>${c.customerName}</strong></td>
        <td>₹${(c.outstanding || 0).toFixed(2)}</td>
        <td>${statusBadge}</td>
        <td>${dueDate.toLocaleDateString('en-IN')}</td>
        <td>
          <div class="action-btns">
            ${c.status !== 'paid' ? `<button class="action-btn edit" onclick="openPayment('${c.id}')"><i class="fas fa-dollar-sign"></i></button>` : ''}
            <button class="action-btn delete" onclick="deleteCreditConfirm('${c.id}')"><i class="fas fa-trash"></i></button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

window.deleteCreditConfirm = async (id) => {
  if (!confirm('Delete this credit record?')) return;
  await deleteDoc(doc(creditRef(), id));
  await fetchCredit();
  renderCreditTable(allCredit);
  updateCreditStats();
};

function updateCreditStats() {
  const totalOutstanding = allCredit.reduce((a, c) => a + (c.outstanding || 0), 0);
  const activeCustomers = allCredit.filter(c => c.status === 'active').length;
  const thisMonth = new Date().toISOString().slice(0, 7);
  const paidThisMonth = allCredit.filter(c => {
    const lastPayment = c.lastPayment?.toDate?.();
    return lastPayment && lastPayment.toISOString().slice(0, 7) === thisMonth;
  }).reduce((a, c) => a + (c.lastPaymentAmount || 0), 0);
  const overdue = allCredit.filter(c => {
    const dueDate = c.dueDate?.toDate?.() || new Date(c.dueDate);
    return dueDate < new Date() && c.status === 'active';
  }).reduce((a, c) => a + (c.outstanding || 0), 0);

  setVal('total-outstanding', `₹${totalOutstanding.toFixed(2)}`);
  setVal('active-customers', activeCustomers);
  setVal('paid-this-month', `₹${paidThisMonth.toFixed(2)}`);
  setVal('overdue-amount', `₹${overdue.toFixed(2)}`);
}

// ============================================================
// AI TIPS — Dashboard Quick Tip
// ============================================================
async function fetchDashboardAITip(inv, sales) {
  const tipEl = document.getElementById('ai-tip-text');
  if (!tipEl) return;

  const lowStock = inv.filter(i => i.stock <= (i.lowThreshold || 5));
  const todayRev = sales.filter(s => s.timestamp?.toDate?.()?.toDateString() === new Date().toDateString())
    .reduce((a, s) => a + (s.total || 0), 0);

  const prompt = `You are a business advisor for a stationery shop in India. 
Products total: ${inv.length}. Low stock items: ${lowStock.map(i => i.name).join(', ') || 'none'}.
Today's revenue: ₹${todayRev.toFixed(2)}.
Give ONE specific, actionable business tip in 1-2 sentences. Be direct and practical.`;

  try {
    const res = await fetch('http://localhost:3001/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 150,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    const data = await res.json();
    const text = data.content?.[0]?.text;
    if (text) tipEl.textContent = text;
    else tipEl.textContent = 'Add more products to expand your catalog and attract more customers.';
  } catch {
    tipEl.textContent = 'Keep track of your low-stock items and reorder before they run out.';
  }
}

// ============================================================
// AI TIPS — Full Analysis
// ============================================================
window.generateAITips = async function() {
  generateAITipsFromData(allInventory, allSales);
};

async function generateAITipsFromData(inv, sales) {
  const grid = document.getElementById('ai-tips-grid');
  if (!grid) return;

  grid.innerHTML = `<div class="ai-tip-card loading">
    <div class="ai-loading-pulse">
      <div class="ai-loading-icon"><i class="fas fa-robot fa-spin"></i></div>
      <p>Analyzing your shop data with AI...</p>
    </div>
  </div>`;

  const totalRev = sales.reduce((a, s) => a + (s.total || 0), 0);
  const totalProfit = sales.reduce((a, s) => a + (s.profit || 0), 0);
  const lowStock = inv.filter(i => i.stock <= (i.lowThreshold || 5)).map(i => `${i.name} (${i.stock} left)`);

  const topProducts = {};
  sales.forEach(s => { topProducts[s.productName] = (topProducts[s.productName] || 0) + (s.qty || 0); });
  const top5 = Object.entries(topProducts).sort((a,b) => b[1]-a[1]).slice(0,5);

  const catRev = {};
  sales.forEach(s => { catRev[s.category] = (catRev[s.category] || 0) + (s.total || 0); });

  const prompt = `You are an expert business consultant for a stationery shop in India.

Here is the shop data:
- Total products: ${inv.length}
- Revenue (period): ₹${totalRev.toFixed(2)}
- Profit (period): ₹${totalProfit.toFixed(2)}
- Profit margin: ${totalRev > 0 ? ((totalProfit/totalRev)*100).toFixed(1) : 0}%
- Low stock items: ${lowStock.join(', ') || 'none'}
- Top products by units: ${top5.map(([n,q]) => `${n}(${q})`).join(', ') || 'not enough data'}
- Revenue by category: ${Object.entries(catRev).map(([c,r]) => `${c}:₹${r.toFixed(0)}`).join(', ') || 'not enough data'}

Generate exactly 4 business insights in JSON format (no markdown, raw JSON only):
[
  {"type": "opportunity", "icon": "💡", "title": "...", "body": "..."},
  {"type": "warning", "icon": "⚠️", "title": "...", "body": "..."},
  {"type": "insight", "icon": "📊", "title": "...", "body": "..."},
  {"type": "action", "icon": "🚀", "title": "...", "body": "..."}
]
Each body should be 2-3 specific, actionable sentences relevant to a stationery/general shop in India.`;

  try {
    const res = await fetch('http://localhost:3001/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    const data = await res.json();
    const text = data.content?.[0]?.text || '[]';
    const clean = text.replace(/```json|```/g, '').trim();
    const tips = JSON.parse(clean);

    grid.innerHTML = tips.map(t => `
      <div class="ai-tip-card type-${t.type}">
        <div class="ai-tip-card-icon">${t.icon}</div>
        <p class="ai-tip-card-title">${t.title}</p>
        <p class="ai-tip-card-body">${t.body}</p>
      </div>
    `).join('');
  } catch (err) {
    grid.innerHTML = `
      <div class="ai-tip-card type-insight">
        <div class="ai-tip-card-icon">📊</div>
        <p class="ai-tip-card-title">Start Recording Sales</p>
        <p class="ai-tip-card-body">Add products to your inventory and record sales to unlock AI-powered insights and recommendations specific to your shop.</p>
      </div>
    `;
  }
}

// ============================================================
// CHARTS (Dashboard)
// ============================================================
function renderWeeklyChart(sales) {
  const ctx = document.getElementById('weeklyChart');
  if (!ctx || !window.Chart) return;

  const labels = [];
  const revenueData = [];
  const ordersData = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    labels.push(d.toLocaleDateString('en-IN', { weekday: 'short' }));
    const daySales = sales.filter(s => s.timestamp?.toDate?.()?.toDateString() === d.toDateString());
    revenueData.push(daySales.reduce((a, s) => a + (s.total || 0), 0));
    ordersData.push(daySales.length);
  }

  window.weeklyChartData = { revenue: revenueData, orders: ordersData, labels };

  if (window.weeklyChartInstance) window.weeklyChartInstance.destroy();
  window.weeklyChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Revenue (₹)',
        data: revenueData,
        backgroundColor: 'rgba(108,143,255,0.7)',
        borderRadius: 6,
        borderSkipped: false
      }]
    },
    options: chartOptions('Revenue (₹)')
  });
}

window.updateWeeklyChart = function(type) {
  if (!window.weeklyChartInstance || !window.weeklyChartData) return;
  const data = type === 'revenue' ? window.weeklyChartData.revenue : window.weeklyChartData.orders;
  const label = type === 'revenue' ? 'Revenue (₹)' : 'Orders';
  window.weeklyChartInstance.data.datasets[0].data = data;
  window.weeklyChartInstance.data.datasets[0].label = label;
  window.weeklyChartInstance.update();
};

function renderCategoryChart(sales) {
  const ctx = document.getElementById('categoryChart');
  if (!ctx || !window.Chart) return;

  const catMap = {};
  sales.forEach(s => { catMap[s.category] = (catMap[s.category] || 0) + (s.total || 0); });
  const sorted = Object.entries(catMap).sort((a,b) => b[1]-a[1]).slice(0,5);

  if (window.catChartInstance) window.catChartInstance.destroy();
  window.catChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: sorted.map(([k]) => k),
      datasets: [{ data: sorted.map(([,v]) => v), backgroundColor: ['#6c8fff','#22c55e','#f59e0b','#a855f7','#ef4444'], borderWidth: 0 }]
    },
    options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { color: '#8b93a8', font: { size: 12 } } } } }
  });
}

// ============================================================
// CHARTS (Analysis)
// ============================================================
function renderTrendChart(sales, days) {
  const ctx = document.getElementById('trendChart');
  if (!ctx) return;

  const step = days <= 7 ? 1 : days <= 30 ? 1 : 7;
  const labels = [], revData = [], profitData = [];

  for (let i = days - 1; i >= 0; i -= step) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    labels.push(d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }));
    const daySales = sales.filter(s => {
      const sd = s.timestamp?.toDate?.();
      return sd && sd.toDateString() === d.toDateString();
    });
    revData.push(daySales.reduce((a, s) => a + (s.total || 0), 0));
    profitData.push(daySales.reduce((a, s) => a + (s.profit || 0), 0));
  }

  if (window.trendChartInst) window.trendChartInst.destroy();
  window.trendChartInst = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Revenue', data: revData, borderColor: '#6c8fff', backgroundColor: 'rgba(108,143,255,0.1)', fill: true, tension: 0.4, borderWidth: 2 },
        { label: 'Profit', data: profitData, borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.1)', fill: true, tension: 0.4, borderWidth: 2 }
      ]
    },
    options: { ...chartOptions('₹'), plugins: { legend: { labels: { color: '#8b93a8' } } } }
  });
}

function renderCatPieChart(sales) {
  const ctx = document.getElementById('catPieChart');
  if (!ctx) return;
  const catMap = {};
  sales.forEach(s => { catMap[s.category] = (catMap[s.category] || 0) + (s.total || 0); });
  const sorted = Object.entries(catMap).sort((a,b) => b[1]-a[1]);
  if (window.catPieInst) window.catPieInst.destroy();
  window.catPieInst = new Chart(ctx, {
    type: 'pie',
    data: {
      labels: sorted.map(([k]) => k),
      datasets: [{ data: sorted.map(([,v]) => v), backgroundColor: ['#6c8fff','#22c55e','#f59e0b','#a855f7','#ef4444','#06b6d4'], borderWidth: 0 }]
    },
    options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { color: '#8b93a8', font: { size: 12 } } } } }
  });
}

function renderTopProductsChart(sales) {
  const ctx = document.getElementById('topProductsChart');
  if (!ctx) return;
  const pm = {};
  sales.forEach(s => { pm[s.productName] = (pm[s.productName] || 0) + (s.total || 0); });
  const top = Object.entries(pm).sort((a,b) => b[1]-a[1]).slice(0,5);
  if (window.topProdInst) window.topProdInst.destroy();
  window.topProdInst = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: top.map(([k]) => k.length > 15 ? k.slice(0,12)+'...' : k),
      datasets: [{ label: 'Revenue (₹)', data: top.map(([,v]) => v), backgroundColor: '#a855f7', borderRadius: 4, borderSkipped: false }]
    },
    options: { ...chartOptions('₹'), indexAxis: 'y', plugins: { legend: { display: false } } }
  });
}

function renderHourlyChart(sales) {
  const ctx = document.getElementById('hourlyChart');
  if (!ctx) return;
  const hours = Array(24).fill(0);
  sales.forEach(s => {
    const h = s.timestamp?.toDate?.()?.getHours();
    if (h !== undefined) hours[h] += s.total || 0;
  });
  const labels = hours.map((_, i) => `${i}:00`);
  if (window.hourlyInst) window.hourlyInst.destroy();
  window.hourlyInst = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{ data: hours, backgroundColor: hours.map(v => v > 0 ? 'rgba(108,143,255,0.7)' : 'rgba(108,143,255,0.15)'), borderRadius: 4, borderSkipped: false }]
    },
    options: { ...chartOptions('₹'), plugins: { legend: { display: false } } }
  });
}

function chartOptions(yLabel) {
  return {
    responsive: true,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { color: 'rgba(42,50,69,0.8)' }, ticks: { color: '#8b93a8', font: { size: 11 } } },
      y: { grid: { color: 'rgba(42,50,69,0.8)' }, ticks: { color: '#8b93a8', font: { size: 11 } } }
    }
  };
}

// ============================================================
// UTILS
// ============================================================
function setVal(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function formatTime(ts) {
  if (!ts?.toDate) return '—';
  return ts.toDate().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function formatDateTime(ts) {
  if (!ts?.toDate) return '—';
  return ts.toDate().toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function openModal(id) { document.getElementById(id)?.classList.remove('hidden'); }
window.closeModal = function(id) { document.getElementById(id)?.classList.add('hidden'); };

// Close modal on overlay click
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.add('hidden');
  }
});

window.logoutUser = async function() {
  const { getAuth, signOut } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js");
  await signOut(getAuth());
  window.location.href = 'index.html';
};