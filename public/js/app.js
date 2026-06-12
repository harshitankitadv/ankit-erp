// ==========================================
// ANKIT ADVERTISING ERP - APPLICATION ENGINE
// ==========================================

const API_BASE = window.location.origin;

// Application State
const state = {
  token: localStorage.getItem('token') || null,
  user: null,
  activeView: 'dashboard',
  jobs: [],
  selectedJob: null,
  selectedPurchases: [],
  selectedSales: [],
  ledgerClients: [],
  activeReport: 'revenue'
};

// Global Headers Helper
function getHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${state.token}`
  };
}

// ==========================================
// STARTUP AND INITIALIZATION
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  setupFormCalculations();
  
  if (state.token) {
    const success = await fetchUserProfile();
    if (success) {
      showAppScreen();
    } else {
      showLoginScreen();
    }
  } else {
    showLoginScreen();
  }
});

// Fetch user profile to validate token on startup
async function fetchUserProfile() {
  try {
    const response = await fetch(`${API_BASE}/api/auth/me`, {
      headers: getHeaders()
    });
    
    if (response.ok) {
      state.user = await response.json();
      updateUserInterfaceForRole();
      return true;
    } else {
      logout();
      return false;
    }
  } catch (error) {
    console.error('Error fetching profile on startup:', error);
    return false;
  }
}

// Show/Hide Screens
function showLoginScreen() {
  document.getElementById('auth-container').classList.remove('hidden');
  document.getElementById('app-container').classList.add('hidden');
}

// Adjust interface based on user role
function updateUserInterfaceForRole() {
  if (!state.user) return;
  const usersNav = document.getElementById('nav-users-li');
  const createJobBtn = document.getElementById('create-job-btn');
  const manualLedgerBtn = document.getElementById('manual-ledger-btn');
  
  // Show user management link to admin only
  if (state.user.role === 'admin') {
    usersNav.classList.remove('hidden');
  } else {
    usersNav.classList.add('hidden');
  }

  // Create job is for Operations only
  if (state.user.role === 'operations') {
    createJobBtn.classList.remove('hidden');
  } else {
    createJobBtn.classList.add('hidden');
  }

  // Toggle filter tabs for accounts/admin vs operations
  const statusFilters = document.querySelectorAll('#jobs-filter-tabs .status-filter');
  const billingFilters = document.querySelectorAll('#jobs-filter-tabs .billing-filter');
  
  if (state.user.role === 'accounts') {
    statusFilters.forEach(f => f.classList.add('hidden'));
    billingFilters.forEach(f => f.classList.remove('hidden'));
    
    // Set Pending Billing active by default
    document.querySelectorAll('#jobs-filter-tabs .filter-tab').forEach(t => t.classList.remove('active'));
    const pendingTab = document.querySelector('[data-billing="Pending Billing"]');
    if (pendingTab) pendingTab.classList.add('active');
  } else {
    statusFilters.forEach(f => f.classList.remove('hidden'));
    billingFilters.forEach(f => f.classList.add('hidden'));
  }
}

function showAppScreen() {
  document.getElementById('auth-container').classList.add('hidden');
  document.getElementById('app-container').classList.remove('hidden');
  
  // Set user initials and role badge
  const initials = state.user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  document.getElementById('user-initials').textContent = initials;
  document.getElementById('user-display-name').textContent = state.user.name;
  
  // Display detailed role name
  let roleTitle = 'Operations';
  if (state.user.role === 'accounts') roleTitle = 'Accounts';
  if (state.user.role === 'admin') roleTitle = 'Verifier / Admin';
  document.getElementById('user-display-role').textContent = roleTitle;
  
  const headerBadge = document.getElementById('header-role-badge');
  headerBadge.textContent = roleTitle;
  headerBadge.className = `badge ${state.user.role}`;

  updateUserInterfaceForRole();

  // Load view
  navigateToView(state.activeView);
}

// ==========================================
// AUTHENTICATION FLOW
// ==========================================
const loginForm = document.getElementById('login-form');
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  const errorAlert = document.getElementById('login-error');
  
  errorAlert.classList.add('hidden');
  
  try {
    const response = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    
    const data = await response.json();
    
    if (response.ok) {
      state.token = data.token;
      state.user = data.user;
      localStorage.setItem('token', data.token);
      
      showAppScreen();
      loginForm.reset();
    } else {
      errorAlert.querySelector('.message').textContent = data.message || 'Login failed.';
      errorAlert.classList.remove('hidden');
    }
  } catch (error) {
    console.error('Login error:', error);
    errorAlert.querySelector('.message').textContent = 'Server error connecting to ERP.';
    errorAlert.classList.remove('hidden');
  }
});

function logout() {
  state.token = null;
  state.user = null;
  localStorage.removeItem('token');
  
  // Reset navigation tabs
  document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
  document.querySelector('[data-view="dashboard"]').classList.add('active');
  state.activeView = 'dashboard';
  
  // Destroy dashboard charts to prevent canvas reuse errors
  if (window.dashboardCharts) {
    Object.values(window.dashboardCharts).forEach(chart => {
      if (chart && typeof chart.destroy === 'function') chart.destroy();
    });
    window.dashboardCharts = null;
  }
  
  showLoginScreen();
}

// ==========================================
// SPA VIEW ROUTING
// ==========================================
function navigateToView(viewName) {
  state.activeView = viewName;
  
  // Update document title
  document.title = `Ankit Advertising ERP - ${viewName.charAt(0).toUpperCase() + viewName.slice(1)}`;
  
  // Update Sidebar Links
  document.querySelectorAll('.nav-link').forEach(link => {
    if (link.getAttribute('data-view') === viewName) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });
  
  // Show / Hide Sub Views
  document.querySelectorAll('.sub-view').forEach(view => {
    if (view.id === `view-${viewName}`) {
      view.classList.remove('hidden');
    } else {
      view.classList.add('hidden');
    }
  });
  
  // Set View Title
  const viewTitle = document.getElementById('view-title');
  if (viewName === 'jobs') viewTitle.textContent = 'Job Sheet Management';
  else if (viewName === 'ledger') viewTitle.textContent = 'Extra Billing Adjustment Ledger';
  else if (viewName === 'reports') viewTitle.textContent = 'ERP Financial Reports';
  else if (viewName === 'users') viewTitle.textContent = 'System User Accounts';
  else viewTitle.textContent = 'Dashboard Overview';
  
  // Trigger loaders
  if (viewName === 'dashboard') loadDashboardData();
  if (viewName === 'jobs') {
    const activeTab = document.querySelector('#jobs-filter-tabs .filter-tab.active');
    const status = activeTab ? activeTab.getAttribute('data-status') : '';
    const billing = activeTab ? activeTab.getAttribute('data-billing') : '';
    loadJobSheets(status || '', billing || '');
  }
  if (viewName === 'ledger') loadLedgerData();
  if (viewName === 'reports') loadReportData();
  if (viewName === 'users') loadUsersList();
}

// ==========================================
// JOB SHEET MODULE (CRUD & LOGIC)
// ==========================================
async function loadJobSheets(statusFilter = '', billingFilter = '') {
  try {
    let url = `${API_BASE}/api/jobs?1=1`;
    if (statusFilter) url += `&status=${encodeURIComponent(statusFilter)}`;
    if (billingFilter) url += `&billing_status=${encodeURIComponent(billingFilter)}`;
    
    const response = await fetch(url, { headers: getHeaders() });
    if (response.ok) {
      state.jobs = await response.json();
      renderJobsTable(state.jobs);
    }
  } catch (error) {
    console.error('Error fetching job sheets:', error);
  }
}

function renderJobsTable(jobsList) {
  const tbody = document.getElementById('jobs-list');
  tbody.innerHTML = '';
  
  if (jobsList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding: 30px; color: var(--text-muted);">
      <i class="fa-solid fa-folder-open" style="font-size: 32px; margin-bottom: 10px; display:block;"></i>
      No Job Sheets matching current filters.
    </td></tr>`;
    return;
  }
  
  jobsList.forEach(job => {
    const tr = document.createElement('tr');
    
    const statusClass = job.status.toLowerCase().replace(/\s+/g, '-');
    const displayStock = parseFloat(job.closing_stock) || 0;
    
    tr.innerHTML = `
      <td><strong>${job.job_sheet_no}</strong></td>
      <td>${formatDate(job.job_date)}</td>
      <td>${job.client_name}</td>
      <td>${job.product}</td>
      <td>
        <span class="stock-qty-badge ${displayStock < 0 ? 'negative' : (displayStock > 0 ? 'positive' : 'zero')}">
          ${displayStock}
        </span>
      </td>
      <td>₹${formatCurrency(job.gross_revenue)}</td>
      <td>₹${formatCurrency(job.net_revenue)}</td>
      <td><span class="status-badge ${statusClass}"><i class="fa-solid fa-circle"></i> ${job.status}</span></td>
      <td>
        <div style="display:flex; gap:6px;">
          <button class="btn-icon detail-btn" title="View Specifications" data-id="${encodeURIComponent(job.job_sheet_no)}">
            <i class="fa-solid fa-eye"></i>
          </button>
          <button class="btn-icon edit-btn ${job.status === 'Verified' && state.user.role !== 'admin' ? 'hidden' : ''}" title="Edit/Verify Job Sheet" data-id="${encodeURIComponent(job.job_sheet_no)}">
            <i class="fa-solid fa-edit"></i>
          </button>
          ${(job.status !== 'Verified' && (state.user.role === 'operations' || state.user.role === 'admin')) ? `
            <button class="btn-icon delete-job-btn" title="Delete Job Sheet" data-id="${encodeURIComponent(job.job_sheet_no)}" style="color: #ef4444;">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          ` : ''}
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
  
  // Attach Row Actions
  tbody.querySelectorAll('.detail-btn').forEach(btn => {
    btn.addEventListener('click', () => openJobDetailModal(btn.getAttribute('data-id')));
  });
  tbody.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      if (state.user.role === 'admin' || state.user.role === 'accounts') {
        openJobDetailModal(id); // Harshit and Pankaj review specs inside Details Modal
      } else {
        openEditJobModal(id);
      }
    });
  });
  tbody.querySelectorAll('.delete-job-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteJobSheet(btn.getAttribute('data-id')));
  });
}

// Add purchase row in dynamic form list
function addPurchaseRow(poNo = '', party = '', product = '', qty = 0, rate = 0, isLocked = false) {
  const tbody = document.getElementById('form-purchases-list');
  const tr = document.createElement('tr');
  
  const amount = qty * rate;
  
  tr.innerHTML = `
    <td><input type="text" class="row-po-no" value="${escapeHtml(poNo)}" placeholder="PO No." ${isLocked ? 'disabled' : ''}></td>
    <td><input type="text" class="row-party" value="${escapeHtml(party)}" placeholder="Vendor Name" required ${isLocked ? 'disabled' : ''}></td>
    <td><input type="text" class="row-product" value="${escapeHtml(product)}" placeholder="e.g. Paper" required ${isLocked ? 'disabled' : ''}></td>
    <td><input type="number" class="row-qty" value="${qty}" min="0" step="any" required ${isLocked ? 'disabled' : ''}></td>
    <td><input type="number" class="row-rate" value="${rate}" min="0" step="any" required ${isLocked ? 'disabled' : ''}></td>
    <td class="row-amount-td" style="padding: 16px 20px; font-weight:600; font-size:14px;">₹${formatCurrency(amount)}</td>
    <td>
      ${isLocked ? '-' : `
        <button type="button" class="btn-icon delete row-delete-btn" title="Delete Row">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      `}
    </td>
  `;
  
  // Attach change listeners to update calculations dynamically
  if (!isLocked) {
    const qtyInput = tr.querySelector('.row-qty');
    const rateInput = tr.querySelector('.row-rate');
    const deleteBtn = tr.querySelector('.row-delete-btn');
    
    const recalculateRow = () => {
      const q = parseFloat(qtyInput.value) || 0;
      const r = parseFloat(rateInput.value) || 0;
      tr.querySelector('.row-amount-td').textContent = `₹${formatCurrency(q * r)}`;
      runLiveFormCalculations();
    };
    
    qtyInput.addEventListener('input', recalculateRow);
    rateInput.addEventListener('input', recalculateRow);
    
    deleteBtn.addEventListener('click', () => {
      tr.remove();
      runLiveFormCalculations();
    });
  }
  
  tbody.appendChild(tr);
}

// Add sale row in dynamic form list
function addSaleRow(id = '', poNo = '', party = '', product = '', qty = 0, rate = 0, billNo = '', isLocked = false, isBillOnly = false) {
  const tbody = document.getElementById('form-sales-list');
  const tr = document.createElement('tr');
  if (id) {
    tr.dataset.id = id;
  }
  
  const amount = qty * rate;
  
  tr.innerHTML = `
    <td><input type="text" class="row-sale-po-no" value="${escapeHtml(poNo)}" placeholder="PO No." ${isLocked ? 'disabled' : ''}></td>
    <td><input type="text" class="row-sale-party" value="${escapeHtml(party)}" placeholder="Customer Name" required ${isLocked ? 'disabled' : ''}></td>
    <td><input type="text" class="row-sale-product" value="${escapeHtml(product)}" placeholder="Finished Product" required ${isLocked ? 'disabled' : ''}></td>
    <td><input type="number" class="row-sale-qty" value="${qty}" min="0" step="any" required ${isLocked ? 'disabled' : ''}></td>
    <td><input type="number" class="row-sale-rate" value="${rate}" min="0" step="any" required ${isLocked ? 'disabled' : ''}></td>
    <td class="row-sale-amount-td" style="padding: 16px 20px; font-weight:600; font-size:14px;">₹${formatCurrency(amount)}</td>
    <td><input type="text" class="row-sale-bill-no" value="${escapeHtml(billNo)}" placeholder="e.g. SB-0021" ${(!isBillOnly) ? 'disabled' : ''}></td>
    <td>
      ${isLocked ? '-' : `
        <button type="button" class="btn-icon delete row-sale-delete-btn" title="Delete Row">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      `}
    </td>
  `;
  
  if (!isLocked) {
    const qtyInput = tr.querySelector('.row-sale-qty');
    const rateInput = tr.querySelector('.row-sale-rate');
    const deleteBtn = tr.querySelector('.row-sale-delete-btn');
    
    const recalculateRow = () => {
      const q = parseFloat(qtyInput.value) || 0;
      const r = parseFloat(rateInput.value) || 0;
      tr.querySelector('.row-sale-amount-td').textContent = `₹${formatCurrency(q * r)}`;
      runLiveFormCalculations();
    };
    
    qtyInput.addEventListener('input', recalculateRow);
    rateInput.addEventListener('input', recalculateRow);
    
    deleteBtn.addEventListener('click', () => {
      tr.remove();
      runLiveFormCalculations();
    });
  }
  
  tbody.appendChild(tr);
}

// Helper to escape HTML to prevent XSS
function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getFormPurchasesData() {
  const rows = document.querySelectorAll('#form-purchases-list tr');
  const list = [];
  rows.forEach(row => {
    const poInput = row.querySelector('.row-po-no');
    const partyInput = row.querySelector('.row-party');
    const productInput = row.querySelector('.row-product');
    const qtyInput = row.querySelector('.row-qty');
    const rateInput = row.querySelector('.row-rate');
    
    const poNo = (poInput ? poInput.value : '').trim();
    const party = (partyInput ? partyInput.value : '').trim();
    const product = (productInput ? productInput.value : '').trim();
    const qty = parseFloat(qtyInput ? qtyInput.value : 0) || 0;
    const rate = parseFloat(rateInput ? rateInput.value : 0) || 0;
    
    if (poNo || party || product || qty || rate) {
      list.push({ purchase_po_no: poNo, purchase_party: party, purchase_product: product, purchase_qty: qty, purchase_rate: rate });
    }
  });
  return list;
}

function getFormSalesData() {
  const rows = document.querySelectorAll('#form-sales-list tr');
  const list = [];
  rows.forEach(row => {
    const id = row.dataset.id || '';
    const poInput = row.querySelector('.row-sale-po-no');
    const partyInput = row.querySelector('.row-sale-party');
    const productInput = row.querySelector('.row-sale-product');
    const qtyInput = row.querySelector('.row-sale-qty');
    const rateInput = row.querySelector('.row-sale-rate');
    const billInput = row.querySelector('.row-sale-bill-no');
    
    const poNo = (poInput ? poInput.value : '').trim();
    const party = (partyInput ? partyInput.value : '').trim();
    const product = (productInput ? productInput.value : '').trim();
    const qty = parseFloat(qtyInput ? qtyInput.value : 0) || 0;
    const rate = parseFloat(rateInput ? rateInput.value : 0) || 0;
    const billNo = (billInput ? billInput.value : '').trim();
    
    if (poNo || party || product || qty || rate || billNo) {
      const item = { sale_po_no: poNo, sale_party: party, sale_product: product, sale_qty: qty, sale_rate: rate, sale_bill_no: billNo };
      if (id) item.id = parseInt(id);
      list.push(item);
    }
  });
  return list;
}

// Live Calculations on Form
function setupFormCalculations() {
  // Bind inputs that are outside the dynamic tables
  document.getElementById('extra_billing').addEventListener('input', runLiveFormCalculations);
  
  // Add row buttons
  document.getElementById('form-add-purchase-row-btn').addEventListener('click', () => {
    addPurchaseRow('', '', '', 0, 0, false);
    runLiveFormCalculations();
  });
  
  document.getElementById('form-add-sale-row-btn').addEventListener('click', () => {
    addSaleRow('', '', '', '', 0, 0, '', false, false);
    runLiveFormCalculations();
  });
}

function runLiveFormCalculations() {
  // 1. Calculate Purchases totals from dynamic list rows
  let totalPurchaseQty = 0;
  let totalPurchaseAmount = 0;
  
  const rows = document.querySelectorAll('#form-purchases-list tr');
  rows.forEach(row => {
    const qtyInput = row.querySelector('.row-qty');
    const rateInput = row.querySelector('.row-rate');
    const q = parseFloat(qtyInput ? qtyInput.value : 0) || 0;
    const r = parseFloat(rateInput ? rateInput.value : 0) || 0;
    totalPurchaseQty += q;
    totalPurchaseAmount += (q * r);
  });
  
  // Update purchase summary fields
  document.getElementById('purchase_qty_total').value = totalPurchaseQty;
  document.getElementById('purchase_amount_calc').value = `₹${formatCurrency(totalPurchaseAmount)}`;

  // 2. Calculate Sales totals from dynamic list rows
  let totalSaleQty = 0;
  let totalSaleAmount = 0;
  
  const saleRows = document.querySelectorAll('#form-sales-list tr');
  saleRows.forEach(row => {
    const qtyInput = row.querySelector('.row-sale-qty');
    const rateInput = row.querySelector('.row-sale-rate');
    const q = parseFloat(qtyInput ? qtyInput.value : 0) || 0;
    const r = parseFloat(rateInput ? rateInput.value : 0) || 0;
    totalSaleQty += q;
    totalSaleAmount += (q * r);
  });
  
  document.getElementById('sale_qty_total').value = totalSaleQty;
  document.getElementById('sale_amount_calc').value = `₹${formatCurrency(totalSaleAmount)}`;

  // 3. Profitability margin
  const extraB = parseFloat(document.getElementById('extra_billing').value) || 0;
  const grossRev = totalSaleAmount - totalPurchaseAmount;
  const netRev = totalSaleAmount - totalPurchaseAmount - extraB;
  const closingStock = totalPurchaseQty - totalSaleQty;
  
  document.getElementById('gross_revenue_calc').value = `₹${formatCurrency(grossRev)}`;
  document.getElementById('net_revenue_calc').value = `₹${formatCurrency(netRev)}`;
  document.getElementById('closing_stock_calc').value = closingStock;
}

// Helper to apply field access control based on user role and mode
function applyModalAccessControl(mode, role) {
  const isCreate = mode === 'create';
  
  const jobNoInput = document.getElementById('job_sheet_no');
  const jobDateInput = document.getElementById('job_date');
  const clientNameInput = document.getElementById('client_name');
  const productInput = document.getElementById('product');
  const remarksInput = document.getElementById('remarks');
  const extraBillingInput = document.getElementById('extra_billing');
  
  const addPurchaseRowBtn = document.getElementById('form-add-purchase-row-btn');
  const addSaleRowBtn = document.getElementById('form-add-sale-row-btn');
  const saveBtn = document.getElementById('job-save-btn');
  const saveBillBtn = document.getElementById('job-save-bill-btn');
  
  const allInputs = [
    jobNoInput, jobDateInput, clientNameInput, productInput, remarksInput, extraBillingInput
  ];
  
  allInputs.forEach(input => {
    input.disabled = false;
    input.readOnly = false;
    input.classList.remove('readonly');
  });
  
  addPurchaseRowBtn.classList.remove('hidden');
  addSaleRowBtn.classList.remove('hidden');
  saveBtn.classList.remove('hidden');
  saveBillBtn.classList.add('hidden');

  if (role === 'operations') {
    if (!isCreate) {
      jobNoInput.readOnly = true;
      jobNoInput.classList.add('readonly');
    }
    // Accounts columns of form-sales-table are handled row-wise during population
  } else if (role === 'accounts') {
    allInputs.forEach(input => {
      input.disabled = true;
      input.classList.add('readonly');
    });
    jobNoInput.readOnly = true;
    jobNoInput.classList.add('readonly');
    
    addPurchaseRowBtn.classList.add('hidden');
    addSaleRowBtn.classList.add('hidden');
    saveBtn.classList.add('hidden');
    saveBillBtn.classList.remove('hidden');
  } else if (role === 'admin') {
    allInputs.forEach(input => {
      input.disabled = true;
      input.classList.add('readonly');
    });
    addPurchaseRowBtn.classList.add('hidden');
    addSaleRowBtn.classList.add('hidden');
    saveBtn.classList.add('hidden');
    saveBillBtn.classList.add('hidden');
  }
}

// Create Job Sheet Form Modal Trigger
document.getElementById('create-job-btn').addEventListener('click', async () => {
  const modal = document.getElementById('job-modal');
  const form = document.getElementById('job-form');
  form.reset();
  
  document.getElementById('job-modal-title').textContent = 'Create Job Sheet';
  
  const jobNoInput = document.getElementById('job_sheet_no');
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('job_date').value = today;
  
  // Clear and seed lists
  document.getElementById('form-purchases-list').innerHTML = '';
  addPurchaseRow('', '', '', 0, 0, false);
  
  document.getElementById('form-sales-list').innerHTML = '';
  addSaleRow('', '', '', '', 0, 0, '', false, false);
  
  // Set up access locks
  applyModalAccessControl('create', state.user.role);
  
  // Pre-fill with recommendations as a helpful starting point
  try {
    const response = await fetch(`${API_BASE}/api/jobs/next-number?date=${today}`, { headers: getHeaders() });
    if (response.ok) {
      const data = await response.json();
      jobNoInput.value = data.job_sheet_no;
    }
  } catch (error) {
    console.error('Error fetching recommended job number:', error);
  }
  
  runLiveFormCalculations();
  
  modal.classList.remove('hidden');
});

// Open Job Edit Modal
async function openEditJobModal(jobNo) {
  try {
    const response = await fetch(`${API_BASE}/api/jobs/${jobNo}`, { headers: getHeaders() });
    if (response.ok) {
      const data = await response.json();
      const job = data.job;
      
      if (job.status === 'Verified') {
        alert('This Job Sheet is verified. Only Pankaj Agrawal can unverify it before editing.');
        return;
      }
      
      const form = document.getElementById('job-form');
      form.reset();
      
      document.getElementById('job-modal-title').textContent = `Edit Job Sheet - ${job.job_sheet_no}`;
      const jobNoInput = document.getElementById('job_sheet_no');
      jobNoInput.value = job.job_sheet_no;
      
      document.getElementById('job_date').value = job.job_date;
      document.getElementById('client_name').value = job.client_name;
      document.getElementById('product').value = job.product;
      document.getElementById('remarks').value = job.remarks;
      
      // Populate purchases dynamic grid
      const purchasesList = document.getElementById('form-purchases-list');
      purchasesList.innerHTML = '';
      
      const isPurchaseLocked = (state.user.role !== 'operations');
      
      if (data.purchases && data.purchases.length > 0) {
        data.purchases.forEach(p => {
          addPurchaseRow(p.purchase_po_no || '', p.purchase_party, p.purchase_product, p.purchase_qty, p.purchase_rate, isPurchaseLocked);
        });
      } else {
        if (!isPurchaseLocked) {
          addPurchaseRow('', '', '', 0, 0, false);
        }
      }

      // Populate sales dynamic grid
      const salesList = document.getElementById('form-sales-list');
      salesList.innerHTML = '';
      
      const isSaleLocked = (state.user.role !== 'operations');
      const isBillOnly = (state.user.role === 'accounts');
      
      if (data.sales && data.sales.length > 0) {
        data.sales.forEach(s => {
          addSaleRow(s.id, s.sale_po_no || '', s.sale_party, s.sale_product, s.sale_qty, s.sale_rate, s.sale_bill_no || '', isSaleLocked, isBillOnly);
        });
      } else {
        if (!isSaleLocked) {
          addSaleRow('', '', '', '', 0, 0, '', false, false);
        }
      }
      
      document.getElementById('extra_billing').value = job.extra_billing || 0;
      
      // Set up access locks
      applyModalAccessControl('edit', state.user.role);
      
      runLiveFormCalculations();
      
      // Close detail modal if open
      document.getElementById('job-detail-modal').classList.add('hidden');
      document.getElementById('job-modal').classList.remove('hidden');
    }
  } catch (error) {
    console.error('Error fetching job details for edit:', error);
  }
}

// Job Sheet Form Submit Handler
document.getElementById('job-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  if (state.user.role !== 'operations') {
    if (state.user.role === 'accounts') {
      document.getElementById('job-save-bill-btn').click();
    }
    return;
  }
  
  const jobNo = document.getElementById('job_sheet_no').value.trim();
  const isEdit = document.getElementById('job_sheet_no').readOnly;
  
  const payload = {
    job_sheet_no: jobNo,
    job_date: document.getElementById('job_date').value,
    client_name: document.getElementById('client_name').value.trim(),
    product: document.getElementById('product').value.trim(),
    remarks: document.getElementById('remarks').value.trim(),
    
    purchases: getFormPurchasesData(),
    sales: getFormSalesData(),
    
    extra_billing: parseFloat(document.getElementById('extra_billing').value) || 0
  };
  
  const url = isEdit ? `${API_BASE}/api/jobs/${encodeURIComponent(jobNo)}` : `${API_BASE}/api/jobs`;
  const method = isEdit ? 'PUT' : 'POST';
  
  try {
    const response = await fetch(url, {
      method,
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });
    
    const data = await response.json();
    
    if (response.ok) {
      document.getElementById('job-modal').classList.add('hidden');
      reloadJobsListCurrentTab();
    } else {
      alert(data.message || 'Error saving Job Sheet.');
    }
  } catch (error) {
    console.error('Error saving job sheet:', error);
  }
});

// Event listener for accounts to save sale bill only
document.getElementById('job-save-bill-btn').addEventListener('click', async () => {
  const jobNo = document.getElementById('job_sheet_no').value.trim();
  const bills = [];
  document.querySelectorAll('#form-sales-list tr').forEach(row => {
    const id = row.dataset.id;
    const billInput = row.querySelector('.row-sale-bill-no');
    if (id && billInput) {
      bills.push({ id: parseInt(id), sale_bill_no: billInput.value.trim() });
    }
  });
  
  try {
    const response = await fetch(`${API_BASE}/api/jobs/${encodeURIComponent(jobNo)}/sale-bill`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({ bills })
    });
    
    const data = await response.json();
    if (response.ok) {
      document.getElementById('job-modal').classList.add('hidden');
      reloadJobsListCurrentTab();
    } else {
      alert(data.message || 'Error saving Sale Bills.');
    }
  } catch (error) {
    console.error('Error saving sale bills:', error);
  }
});

// Delete Job Sheet function
async function deleteJobSheet(jobNo) {
  if (!confirm(`Are you sure you want to delete Job Sheet ${decodeURIComponent(jobNo)}? This action cannot be undone.`)) {
    return;
  }
  try {
    const response = await fetch(`${API_BASE}/api/jobs/${jobNo}`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    const data = await response.json();
    if (response.ok) {
      reloadJobsListCurrentTab();
    } else {
      alert(data.message || 'Error deleting Job Sheet.');
    }
  } catch (error) {
    console.error('Error deleting job sheet:', error);
  }
}

// View Job Details Modal
async function openJobDetailModal(jobNo) {
  try {
    const response = await fetch(`${API_BASE}/api/jobs/${jobNo}`, { headers: getHeaders() });
    if (response.ok) {
      const data = await response.json();
      const job = data.job;
      
      state.selectedJob = job;
      state.selectedPurchases = data.purchases || [];
      state.selectedSales = data.sales || [];
      
      // Update basic fields
      document.getElementById('det-job-no').textContent = job.job_sheet_no;
      document.getElementById('det-job-date').textContent = formatDate(job.job_date);
      document.getElementById('det-client-name').textContent = job.client_name;
      document.getElementById('det-product').textContent = job.product;
      document.getElementById('det-remarks').textContent = job.remarks || 'No remarks.';
      
      // Render dynamic child purchases
      const purchasesContainer = document.getElementById('det-purchases-container');
      purchasesContainer.innerHTML = '';
      if (state.selectedPurchases.length > 0) {
        state.selectedPurchases.forEach(p => {
          const div = document.createElement('div');
          div.className = 'spec-item';
          div.style.borderBottom = '1px dashed var(--border-color)';
          div.style.paddingBottom = '4px';
          div.style.marginBottom = '4px';
          
          let invoiceHtml = '';
          if (p.purchase_invoice_no) {
            invoiceHtml = `<br><span class="badge verified" style="font-size:10px; display:inline-block; margin-top:4px;">Invoice: ${escapeHtml(p.purchase_invoice_no)} (${formatDate(p.purchase_invoice_date)})</span>`;
          }
          
          div.innerHTML = `
            <strong>PO Number:</strong> ${escapeHtml(p.purchase_po_no) || 'N/A'}<br>
            <strong>Vendor:</strong> ${escapeHtml(p.purchase_party)}<br>
            <strong>Product:</strong> ${escapeHtml(p.purchase_product)}<br>
            <strong>Qty:</strong> ${p.purchase_qty} | <strong>Rate:</strong> ₹${formatCurrency(p.purchase_rate)} | <strong>Amt:</strong> ₹${formatCurrency(p.purchase_amount)}
            ${invoiceHtml}
          `;
          purchasesContainer.appendChild(div);
        });
      } else {
        purchasesContainer.innerHTML = '<div style="color:var(--text-muted); font-size:12px;">No purchases recorded.</div>';
      }
      
      document.getElementById('det-purchase-qty').textContent = job.purchase_qty;
      document.getElementById('det-purchase-amount').textContent = `₹${formatCurrency(job.purchase_amount)}`;
      
      // Render dynamic child sales
      const salesContainer = document.getElementById('det-sales-container');
      salesContainer.innerHTML = '';
      if (state.selectedSales.length > 0) {
        state.selectedSales.forEach(s => {
          const div = document.createElement('div');
          div.className = 'spec-item';
          div.style.borderBottom = '1px dashed var(--border-color)';
          div.style.paddingBottom = '4px';
          div.style.marginBottom = '4px';
          div.innerHTML = `
            <strong>PO Number:</strong> ${escapeHtml(s.sale_po_no) || 'N/A'}<br>
            <strong>Customer:</strong> ${escapeHtml(s.sale_party)}<br>
            <strong>Product:</strong> ${escapeHtml(s.sale_product)}<br>
            <strong>Qty:</strong> ${s.sale_qty} | <strong>Rate:</strong> ₹${formatCurrency(s.sale_rate)} | <strong>Amt:</strong> ₹${formatCurrency(s.sale_amount)}<br>
            <strong>Bill Number:</strong> <span style="font-weight: 700; color: var(--primary);">${escapeHtml(s.sale_bill_no) || 'Pending'}</span>
          `;
          salesContainer.appendChild(div);
        });
      } else {
        salesContainer.innerHTML = '<div style="color:var(--text-muted); font-size:12px;">No sales recorded.</div>';
      }
      
      document.getElementById('det-sale-qty').textContent = job.sale_qty;
      document.getElementById('det-sale-amount').textContent = `₹${formatCurrency(job.sale_amount)}`;
      
      // Calculations
      document.getElementById('det-closing-stock').textContent = job.closing_stock;
      document.getElementById('det-closing-stock').className = `val ${job.closing_stock < 0 ? 'negative' : (job.closing_stock > 0 ? 'positive' : '')}`;
      document.getElementById('det-extra-billing').textContent = `₹${formatCurrency(job.extra_billing)}`;
      document.getElementById('det-gross-revenue').textContent = `₹${formatCurrency(job.gross_revenue)}`;
      document.getElementById('det-net-revenue').textContent = `₹${formatCurrency(job.net_revenue)}`;
      
      // Status badge
      const statusBadge = document.getElementById('det-status-badge');
      statusBadge.textContent = job.status;
      statusBadge.className = `badge ${job.status.toLowerCase().replace(/\s+/g, '-')}`;
      
      // Verification stamp
      const stamp = document.getElementById('verified-stamp-banner');
      if (job.status === 'Verified') {
        stamp.classList.remove('hidden');
        document.getElementById('det-verified-by').textContent = job.verified_by;
        document.getElementById('det-verified-at').textContent = new Date(job.verified_at).toLocaleString();
      } else {
        stamp.classList.add('hidden');
      }
      
      // Created and Metadata
      document.getElementById('det-created-by').textContent = job.created_by;
      document.getElementById('det-created-at').textContent = new Date(job.created_at).toLocaleDateString();
      
      // Buttons Toggle based on role and status
      const unverifyBtn = document.getElementById('det-unverify-btn');
      const verifyTriggerBtn = document.getElementById('det-verify-trigger-btn');
      const editBtn = document.getElementById('det-edit-btn');
      const printBtn = document.getElementById('det-print-btn');
      
      // Defaults
      unverifyBtn.classList.add('hidden');
      verifyTriggerBtn.classList.add('hidden');
      editBtn.classList.remove('hidden');
      printBtn.classList.remove('hidden');
      
      if (job.status === 'Verified') {
        editBtn.classList.add('hidden'); // Cannot edit verified job
        if (state.user.role === 'admin') {
          unverifyBtn.classList.remove('hidden'); // Admin can unverify
        }
      } else {
        // Edit is for operations Bhupinder, or billing update is for Harshit (redirected to edit form modal)
        if (state.user.role !== 'operations' && state.user.role !== 'accounts') {
          editBtn.classList.add('hidden');
        }
        if (state.user.role === 'admin' && job.status === 'Ready for Verification') {
          verifyTriggerBtn.classList.remove('hidden'); // Admin can verify
        }
      }
      
      document.getElementById('job-detail-modal').classList.remove('hidden');
    }
  } catch (error) {
    console.error('Error opening details modal:', error);
  }
}

// Verification Actions (Pankaj)
document.getElementById('det-verify-trigger-btn').addEventListener('click', () => {
  const modal = document.getElementById('verify-modal');
  document.getElementById('verify-form').reset();
  document.getElementById('verify-error').classList.add('hidden');
  
  // Render purchases invoices entry grid
  const tbody = document.getElementById('verify-purchases-list');
  tbody.innerHTML = '';
  
  if (state.selectedPurchases.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:10px; color:var(--text-muted);">No purchases to verify.</td></tr>';
  } else {
    state.selectedPurchases.forEach(p => {
      const tr = document.createElement('tr');
      tr.dataset.id = p.id;
      tr.innerHTML = `
        <td style="padding:10px 12px; font-size:12px;"><strong>${escapeHtml(p.purchase_po_no) || 'N/A'}</strong></td>
        <td style="padding:10px 12px; font-size:12px;">${escapeHtml(p.purchase_party)} (${escapeHtml(p.purchase_product)})</td>
        <td style="padding:6px 10px;"><input type="text" class="ver-row-invoice-no" required placeholder="e.g. INV-984" style="width:100%; padding:6px 10px; font-size:12px; border: 1px solid var(--border-color); border-radius:4px;"></td>
        <td style="padding:6px 10px;"><input type="date" class="ver-row-invoice-date" required style="width:100%; padding:6px 10px; font-size:12px; border: 1px solid var(--border-color); border-radius:4px;" value="${new Date().toISOString().split('T')[0]}"></td>
      `;
      tbody.appendChild(tr);
    });
  }
  
  modal.classList.remove('hidden');
});

document.getElementById('verify-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const jobNo = state.selectedJob.job_sheet_no;
  const purchases = [];
  
  document.querySelectorAll('#verify-purchases-list tr').forEach(row => {
    const id = row.dataset.id;
    const invNoInput = row.querySelector('.ver-row-invoice-no');
    const invDateInput = row.querySelector('.ver-row-invoice-date');
    if (id && invNoInput && invDateInput) {
      purchases.push({
        id: parseInt(id),
        purchase_invoice_no: invNoInput.value.trim(),
        purchase_invoice_date: invDateInput.value
      });
    }
  });
  
  try {
    const response = await fetch(`${API_BASE}/api/jobs/${encodeURIComponent(jobNo)}/verify`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ purchases })
    });
    
    const data = await response.json();
    if (response.ok) {
      document.getElementById('verify-modal').classList.add('hidden');
      document.getElementById('job-detail-modal').classList.add('hidden');
      reloadJobsListCurrentTab();
    } else {
      const errorDiv = document.getElementById('verify-error');
      errorDiv.textContent = data.message || 'Verification failed.';
      errorDiv.classList.remove('hidden');
    }
  } catch (error) {
    console.error('Error verifying job:', error);
  }
});

// Unverification
document.getElementById('det-unverify-btn').addEventListener('click', async () => {
  if (!confirm('Are you sure you want to UNVERIFY this transaction? This will unlock the Job Sheet and reset its status.')) {
    return;
  }
  
  const jobNo = state.selectedJob.job_sheet_no;
  
  try {
    const response = await fetch(`${API_BASE}/api/jobs/${encodeURIComponent(jobNo)}/unverify`, {
      method: 'POST',
      headers: getHeaders()
    });
    
    if (response.ok) {
      document.getElementById('job-detail-modal').classList.add('hidden');
      reloadJobsListCurrentTab();
    } else {
      const data = await response.json();
      alert(data.message || 'Error unverifying job.');
    }
  } catch (error) {
    console.error('Error unverifying job:', error);
  }
});

// Bind edit button inside details modal (Operations opens Form Modal, Accounts opens billing editor in Form Modal)
document.getElementById('det-edit-btn').addEventListener('click', () => {
  if (state.selectedJob) {
    openEditJobModal(state.selectedJob.job_sheet_no);
  }
});

// Helper to reload active list tab
function reloadJobsListCurrentTab() {
  const activeTab = document.querySelector('#jobs-filter-tabs .filter-tab.active');
  const status = activeTab ? activeTab.getAttribute('data-status') : '';
  const billing = activeTab ? activeTab.getAttribute('data-billing') : '';
  loadJobSheets(status || '', billing || '');
}

// Beautiful print page routine for Bhupinder (Operations)
document.getElementById('det-print-btn').addEventListener('click', () => {
  const job = state.selectedJob;
  const purchases = state.selectedPurchases || [];
  const sales = state.selectedSales || [];
  
  const printWindow = window.open('', '_blank', 'width=800,height=900');
  
  let purchasesHtml = '';
  purchases.forEach(p => {
    purchasesHtml += `
      <tr>
        <td>${escapeHtml(p.purchase_po_no) || '-'}</td>
        <td>${escapeHtml(p.purchase_party)}</td>
        <td>${escapeHtml(p.purchase_product)}</td>
        <td>${p.purchase_qty}</td>
        <td>₹${formatCurrency(p.purchase_rate)}</td>
        <td>₹${formatCurrency(p.purchase_amount)}</td>
        <td>${escapeHtml(p.purchase_invoice_no) || 'Pending'}</td>
      </tr>
    `;
  });
  
  let salesHtml = '';
  sales.forEach(s => {
    salesHtml += `
      <tr>
        <td>${escapeHtml(s.sale_po_no) || '-'}</td>
        <td>${escapeHtml(s.sale_party)}</td>
        <td>${escapeHtml(s.sale_product)}</td>
        <td>${s.sale_qty}</td>
        <td>₹${formatCurrency(s.sale_rate)}</td>
        <td>₹${formatCurrency(s.sale_amount)}</td>
        <td>${escapeHtml(s.sale_bill_no) || 'Pending'}</td>
      </tr>
    `;
  });
  
  printWindow.document.write(`
    <html>
    <head>
      <title>Job Sheet - ${job.job_sheet_no}</title>
      <style>
        body { font-family: system-ui, -apple-system, sans-serif; padding: 40px; color: #1e293b; background: #fff; }
        .header { display: flex; justify-content: space-between; border-bottom: 3px solid #6366f1; padding-bottom: 20px; margin-bottom: 25px; }
        .header h1 { margin: 0; color: #4f46e5; font-size: 26px; letter-spacing: -0.5px; }
        .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 30px; }
        .meta-item { font-size: 14px; line-height: 1.5; }
        .meta-item strong { color: #475569; }
        h3 { color: #4f46e5; border-bottom: 1px solid #cbd5e1; padding-bottom: 6px; font-size: 16px; margin-top: 30px; letter-spacing: -0.3px; }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 12px; }
        th, td { border: 1px solid #e2e8f0; padding: 10px 12px; text-align: left; }
        th { background-color: #f8fafc; font-weight: 600; color: #334155; }
        .totals-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; background: #f1f5f9; padding: 20px; border-radius: 8px; margin-top: 35px; }
        .total-card { text-align: center; }
        .total-card span { font-size: 11px; color: #64748b; display: block; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px; }
        .total-card strong { font-size: 16px; color: #0f172a; }
        .footer { margin-top: 60px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 20px; }
        @media print {
          body { padding: 0; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <h1>ANKIT ADVERTISING</h1>
          <p style="margin: 4px 0 0 0; font-size:12px; color:#64748b; font-weight:500;">ERP Job Specification Sheet</p>
        </div>
        <div style="text-align: right;">
          <h2 style="margin:0; font-size:20px; color:#0f172a;">${job.job_sheet_no}</h2>
          <p style="margin:4px 0 0 0; font-size:12px; color:#64748b;">Job Date: ${formatDate(job.job_date)}</p>
        </div>
      </div>
      
      <div class="meta-grid">
        <div class="meta-item"><strong>Client Name:</strong> ${escapeHtml(job.client_name)}</div>
        <div class="meta-item"><strong>Job Product Requirement:</strong> ${escapeHtml(job.product)}</div>
        <div class="meta-item"><strong>Overall Status:</strong> ${job.status}</div>
        <div class="meta-item"><strong>Billing Status:</strong> ${job.billing_status}</div>
        <div class="meta-item" style="grid-column: span 2; margin-top:10px;"><strong>Remarks / General Instructions:</strong> ${escapeHtml(job.remarks) || '-'}</div>
      </div>
      
      <h3>Purchase Specifications</h3>
      <table>
        <thead>
          <tr>
            <th>PO No</th>
            <th>Vendor</th>
            <th>Product</th>
            <th>Qty</th>
            <th>Rate</th>
            <th>Amount</th>
            <th>Invoice No</th>
          </tr>
        </thead>
        <tbody>
          ${purchasesHtml}
        </tbody>
      </table>
      
      <h3>Sale Specifications</h3>
      <table>
        <thead>
          <tr>
            <th>PO No</th>
            <th>Customer</th>
            <th>Product</th>
            <th>Qty</th>
            <th>Rate</th>
            <th>Amount</th>
            <th>Bill No</th>
          </tr>
        </thead>
        <tbody>
          ${salesHtml}
        </tbody>
      </table>
      
      <div class="totals-grid">
        <div class="total-card">
          <span>Closing Stock Qty</span>
          <strong>${job.closing_stock}</strong>
        </div>
        <div class="total-card">
          <span>Extra Billing</span>
          <strong>₹${formatCurrency(job.extra_billing)}</strong>
        </div>
        <div class="total-card">
          <span>Gross Margin</span>
          <strong>₹${formatCurrency(job.gross_revenue)}</strong>
        </div>
        <div class="total-card">
          <span>Net Profit</span>
          <strong>₹${formatCurrency(job.net_revenue)}</strong>
        </div>
      </div>
      
      <div class="footer">
        <p>Generated by Operations User: ${state.user.name} on ${new Date().toLocaleString()}</p>
        <p>Ankit Advertising ERP Platform • Fiscal Year 2026-27</p>
      </div>
      
      <script>
        window.onload = function() {
          window.print();
          setTimeout(function() { window.close(); }, 500);
        };
      </script>
    </body>
    </html>
  `);
  printWindow.document.close();
});

// ==========================================
// EXTRA BILLING LEDGER MODULE
// ==========================================
async function loadLedgerData() {
  await loadLedgerClients();
  await filterLedger();
}

async function loadLedgerClients() {
  try {
    const response = await fetch(`${API_BASE}/api/ledger/clients`, { headers: getHeaders() });
    if (response.ok) {
      state.ledgerClients = await response.json();
      
      const select = document.getElementById('ledger-client-select');
      const currentVal = select.value;
      
      select.innerHTML = '<option value="">-- All Clients --</option>';
      state.ledgerClients.forEach(client => {
        const option = document.createElement('option');
        option.value = client;
        option.textContent = client;
        select.appendChild(option);
      });
      
      select.value = currentVal;
    }
  } catch (error) {
    console.error('Error loading ledger clients:', error);
  }
}

async function filterLedger() {
  const client = document.getElementById('ledger-client-select').value;
  const startDate = document.getElementById('ledger-start-date').value;
  const endDate = document.getElementById('ledger-end-date').value;
  
  let url = `${API_BASE}/api/ledger?1=1`;
  if (client) url += `&client=${encodeURIComponent(client)}`;
  if (startDate) url += `&start_date=${startDate}`;
  if (endDate) url += `&end_date=${endDate}`;
  
  try {
    const response = await fetch(url, { headers: getHeaders() });
    if (response.ok) {
      const ledgerEntries = await response.json();
      renderLedgerTable(ledgerEntries, !!client);
    }
  } catch (error) {
    console.error('Error filtering ledger:', error);
  }
}

function renderLedgerTable(entries, isClientFiltered) {
  const tbody = document.getElementById('ledger-list');
  tbody.innerHTML = '';
  
  const summaryBanner = document.getElementById('ledger-summary');
  
  if (entries.length === 0) {
    tbody.innerHTML = `<tr><td colspan="11" style="text-align:center; padding:30px; color:var(--text-muted);">
      <i class="fa-solid fa-receipt" style="font-size:32px; margin-bottom:10px; display:block;"></i>
      No ledger entries found for selected filters.
    </td></tr>`;
    summaryBanner.classList.add('hidden');
    return;
  }
  
  let totalDebit = 0;
  let totalCredit = 0;

  // Toggle Action column header in index.html based on role
  if (state.user.role === 'admin') {
    document.querySelectorAll('.ledger-action-header').forEach(el => el.classList.remove('hidden'));
  } else {
    document.querySelectorAll('.ledger-action-header').forEach(el => el.classList.add('hidden'));
  }
  
  entries.forEach(entry => {
    totalDebit += entry.debit;
    totalCredit += entry.credit;
    
    const tr = document.createElement('tr');
    
    const isVerified = entry.status === 'Verified';
    const statusBadge = `<span class="badge ${isVerified ? 'verified' : 'draft'}">${entry.status || 'Unverified'}</span>`;
    
    let actionHtml = '-';
    if (state.user.role === 'admin') {
      if (isVerified) {
        actionHtml = `<button class="btn-icon delete ledger-unverify-btn" data-id="${entry.id}" title="Unverify Entry"><i class="fa-solid fa-unlock"></i></button>`;
      } else {
        actionHtml = `<button class="btn-icon ledger-verify-btn" data-id="${entry.id}" title="Verify Entry" style="color:var(--color-verified);"><i class="fa-solid fa-signature"></i></button>`;
      }
    }
    
    tr.innerHTML = `
      <td>${formatDate(entry.date)}</td>
      <td>${entry.job_sheet_no ? `<strong>${entry.job_sheet_no}</strong>` : '<em class="text-muted">Manual Entry</em>'}</td>
      <td>${entry.client_name}</td>
      <td>${entry.particulars}</td>
      <td class="text-right">${entry.debit > 0 ? `₹${formatCurrency(entry.debit)}` : '-'}</td>
      <td class="text-right">${entry.credit > 0 ? `₹${formatCurrency(entry.credit)}` : '-'}</td>
      <td class="text-right"><strong>₹${formatCurrency(entry.running_balance)}</strong></td>
      <td>${entry.user_name}</td>
      <td>${statusBadge}</td>
      <td><span class="remarks-box">${entry.remarks || '-'}</span></td>
      <td class="ledger-action-cell ${state.user.role === 'admin' ? '' : 'hidden'}">${actionHtml}</td>
    `;
    tbody.appendChild(tr);
  });
  
  // Attach ledger verification actions
  tbody.querySelectorAll('.ledger-verify-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      if (confirm('Verify this extra billing ledger entry? This will audit and lock the transaction.')) {
        try {
          const res = await fetch(`${API_BASE}/api/ledger/${id}/verify`, { method: 'POST', headers: getHeaders() });
          if (res.ok) {
            filterLedger();
          } else {
            const errData = await res.json();
            alert(errData.message || 'Failed to verify ledger entry.');
          }
        } catch (err) {
          console.error(err);
        }
      }
    });
  });

  tbody.querySelectorAll('.ledger-unverify-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      if (confirm('Are you sure you want to UNVERIFY this ledger entry?')) {
        try {
          const res = await fetch(`${API_BASE}/api/ledger/${id}/unverify`, { method: 'POST', headers: getHeaders() });
          if (res.ok) {
            filterLedger();
          } else {
            const errData = await res.json();
            alert(errData.message || 'Failed to unverify ledger entry.');
          }
        } catch (err) {
          console.error(err);
        }
      }
    });
  });

  // Show Client outstanding balance banner if a client is selected
  if (isClientFiltered) {
    document.getElementById('ledger-total-credit').textContent = `₹${formatCurrency(totalCredit)}`;
    document.getElementById('ledger-total-debit').textContent = `₹${formatCurrency(totalDebit)}`;
    document.getElementById('ledger-outstanding-balance').textContent = `₹${formatCurrency(totalCredit - totalDebit)}`;
    summaryBanner.classList.remove('hidden');
  } else {
    summaryBanner.classList.add('hidden');
  }
}

// Add manual ledger entry modal triggers
document.getElementById('manual-ledger-btn').addEventListener('click', () => {
  const modal = document.getElementById('ledger-modal');
  document.getElementById('ledger-form').reset();
  document.getElementById('led_date').value = new Date().toISOString().split('T')[0];
  document.getElementById('ledger-error').classList.add('hidden');
  modal.classList.remove('hidden');
});

document.getElementById('ledger-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const payload = {
    date: document.getElementById('led_date').value,
    client_name: document.getElementById('led_client_name').value.trim(),
    particulars: document.getElementById('led_particulars').value.trim(),
    debit: parseFloat(document.getElementById('led_debit').value) || 0,
    credit: parseFloat(document.getElementById('led_credit').value) || 0,
    remarks: document.getElementById('led_remarks').value.trim()
  };
  
  if (payload.debit === 0 && payload.credit === 0) {
    const err = document.getElementById('ledger-error');
    err.textContent = 'Either Debit or Credit must be greater than 0.';
    err.classList.remove('hidden');
    return;
  }
  
  try {
    const response = await fetch(`${API_BASE}/api/ledger`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });
    
    const data = await response.json();
    if (response.ok) {
      document.getElementById('ledger-modal').classList.add('hidden');
      loadLedgerData();
    } else {
      const err = document.getElementById('ledger-error');
      err.textContent = data.message;
      err.classList.remove('hidden');
    }
  } catch (error) {
    console.error('Error adding manual ledger entry:', error);
  }
});

// ==========================================
// REPORTS MODULE (VIEWS & EXPORTS)
// ==========================================
async function loadReportData() {
  const rType = state.activeReport;
  
  // Toggle filter visibility
  const stockFilters = document.getElementById('report-filters-stock');
  if (rType === 'stock') {
    stockFilters.classList.remove('hidden');
  } else {
    stockFilters.classList.add('hidden');
  }
  
  // Render based on active sub-report
  if (rType === 'revenue') loadJobRevenueReport();
  if (rType === 'stock') loadStockReport();
  if (rType === 'verification-pending') loadPendingVerificationReport();
  if (rType === 'verification-verified') loadVerifiedTransactionsReport();
}

async function loadJobRevenueReport() {
  try {
    const response = await fetch(`${API_BASE}/api/reports/job-revenue`, { headers: getHeaders() });
    if (response.ok) {
      const data = await response.json();
      
      const head = document.getElementById('reports-table-head');
      head.innerHTML = `
        <tr>
          <th>Job Sheet Number</th>
          <th>Date</th>
          <th>Client Name</th>
          <th>Purchase Amt</th>
          <th>Sale Amt</th>
          <th>Extra Billing</th>
          <th>Gross Revenue</th>
          <th>Net Revenue</th>
          <th>Status</th>
          <th>Verification</th>
        </tr>
      `;
      
      const body = document.getElementById('reports-table-body');
      body.innerHTML = '';
      
      if (data.length === 0) {
        body.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:30px; color:var(--text-muted);">No data.</td></tr>`;
        return;
      }
      
      data.forEach(row => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong>${row.job_sheet_no}</strong></td>
          <td>${formatDate(row.job_date)}</td>
          <td>${row.client_name}</td>
          <td>₹${formatCurrency(row.purchase_amount)}</td>
          <td>₹${formatCurrency(row.sale_amount)}</td>
          <td>₹${formatCurrency(row.extra_billing)}</td>
          <td><strong>₹${formatCurrency(row.gross_revenue)}</strong></td>
          <td><strong>₹${formatCurrency(row.net_revenue)}</strong></td>
          <td><span class="badge ${row.status.toLowerCase().replace(/\s+/g, '-')}">${row.status}</span></td>
          <td><span class="badge ${row.verification_status.toLowerCase()}">${row.verification_status}</span></td>
        `;
        body.appendChild(tr);
      });
    }
  } catch (error) {
    console.error('Error loading job revenue report:', error);
  }
}

async function loadStockReport() {
  const start = document.getElementById('rep-stock-start').value;
  const end = document.getElementById('rep-stock-end').value;
  const client = document.getElementById('rep-stock-client').value.trim();
  const product = document.getElementById('rep-stock-product').value.trim();
  const jobNo = document.getElementById('rep-stock-jobno').value.trim();
  
  let url = `${API_BASE}/api/reports/stock?1=1`;
  if (start) url += `&start_date=${start}`;
  if (end) url += `&end_date=${end}`;
  if (client) url += `&client=${encodeURIComponent(client)}`;
  if (product) url += `&product=${encodeURIComponent(product)}`;
  if (jobNo) url += `&job_sheet_no=${encodeURIComponent(jobNo)}`;
  
  try {
    const response = await fetch(url, { headers: getHeaders() });
    if (response.ok) {
      const data = await response.json();
      
      const head = document.getElementById('reports-table-head');
      head.innerHTML = `
        <tr>
          <th>Job Sheet Number</th>
          <th>Product Name</th>
          <th>Purchase Qty</th>
          <th>Sale Qty</th>
          <th>Balance Qty (Stock)</th>
          <th>Purchase Value</th>
          <th>Stock Status</th>
        </tr>
      `;
      
      const body = document.getElementById('reports-table-body');
      body.innerHTML = '';
      
      if (data.length === 0) {
        body.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:30px; color:var(--text-muted);">No stock data matches criteria.</td></tr>`;
        return;
      }
      
      data.forEach(row => {
        const bal = parseFloat(row.balance_qty) || 0;
        const statusClass = bal < 0 ? 'negative' : (bal > 0 ? 'positive' : 'zero');
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong>${row.job_sheet_no}</strong></td>
          <td>${row.product_name || 'N/A'}</td>
          <td>${row.purchase_qty}</td>
          <td>${row.sale_qty}</td>
          <td><span class="stock-qty-badge ${statusClass}">${bal}</span></td>
          <td>₹${formatCurrency(row.purchase_value)}</td>
          <td><span class="badge ${row.stock_status.toLowerCase().replace(/\s+/g, '-')}">${row.stock_status}</span></td>
        `;
        body.appendChild(tr);
      });
    }
  } catch (error) {
    console.error('Error loading stock report:', error);
  }
}

async function loadPendingVerificationReport() {
  try {
    const response = await fetch(`${API_BASE}/api/reports/pending-verification`, { headers: getHeaders() });
    if (response.ok) {
      const data = await response.json();
      
      const head = document.getElementById('reports-table-head');
      head.innerHTML = `
        <tr>
          <th>Job Sheet Number</th>
          <th>Job Date</th>
          <th>Client Name</th>
          <th>Product</th>
          <th>Purchase Qty</th>
          <th>Sale Qty</th>
          <th>Gross Margin</th>
        </tr>
      `;
      
      const body = document.getElementById('reports-table-body');
      body.innerHTML = '';
      
      if (data.length === 0) {
        body.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:30px; color:var(--text-muted);"><i class="fa-solid fa-check-circle" style="color:var(--color-verified);"></i> All job sheets verified! No pending transactions.</td></tr>`;
        return;
      }
      
      data.forEach(row => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong>${row.job_sheet_no}</strong></td>
          <td>${formatDate(row.job_date)}</td>
          <td>${row.client_name}</td>
          <td>${row.product}</td>
          <td>${row.purchase_qty}</td>
          <td>${row.sale_qty}</td>
          <td><strong>₹${formatCurrency(row.gross_revenue)}</strong></td>
        `;
        body.appendChild(tr);
      });
    }
  } catch (error) {
    console.error('Error loading pending verifications:', error);
  }
}

async function loadVerifiedTransactionsReport() {
  try {
    const response = await fetch(`${API_BASE}/api/reports/verified`, { headers: getHeaders() });
    if (response.ok) {
      const data = await response.json();
      
      const head = document.getElementById('reports-table-head');
      head.innerHTML = `
        <tr>
          <th>Job Sheet Number</th>
          <th>Client Name</th>
          <th>Purchase Cost</th>
          <th>Sale Value</th>
          <th>Net Revenue</th>
          <th>Verified By</th>
          <th>Verified Time</th>
        </tr>
      `;
      
      const body = document.getElementById('reports-table-body');
      body.innerHTML = '';
      
      if (data.length === 0) {
        body.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:30px; color:var(--text-muted);">No verified transactions yet.</td></tr>`;
        return;
      }
      
      data.forEach(row => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong>${row.job_sheet_no}</strong></td>
          <td>${row.client_name}</td>
          <td>₹${formatCurrency(row.purchase_amount)}</td>
          <td>₹${formatCurrency(row.sale_amount)}</td>
          <td><strong>₹${formatCurrency(row.net_revenue)}</strong></td>
          <td>${row.verified_by}</td>
          <td>${new Date(row.verified_at).toLocaleString()}</td>
        `;
        body.appendChild(tr);
      });
    }
  } catch (error) {
    console.error('Error loading verified jobs report:', error);
  }
}

// Reports Sub-Tabs Handler
document.querySelectorAll('.report-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.report-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    state.activeReport = tab.getAttribute('data-report');
    loadReportData();
  });
});

// Excel and PDF Export Utilities
function exportTableToExcel(tableId, filename) {
  const table = document.getElementById(tableId);
  const wb = XLSX.utils.table_to_book(table, { sheet: "ERP Report" });
  XLSX.writeFile(wb, filename);
}

function exportToPDF(elementId, filename) {
  const element = document.getElementById(elementId);
  const opt = {
    margin:       10,
    filename:     filename,
    image:        { type: 'jpeg', quality: 0.98 },
    html2canvas:  { scale: 2, useCORS: true },
    jsPDF:        { unit: 'mm', format: 'a4', orientation: 'landscape' }
  };
  html2pdf().set(opt).from(element).save();
}

// Report Exports Bindings
document.getElementById('export-report-excel').addEventListener('click', () => {
  exportTableToExcel('reports-table', `Ankit_ERP_${state.activeReport}_Report.xlsx`);
});

document.getElementById('export-report-pdf').addEventListener('click', () => {
  exportToPDF('report-render-area', `Ankit_ERP_${state.activeReport}_Report.pdf`);
});

document.getElementById('export-ledger-excel').addEventListener('click', () => {
  exportTableToExcel('ledger-table', 'Ankit_ERP_Extra_Billing_Ledger.xlsx');
});

document.getElementById('export-ledger-pdf').addEventListener('click', () => {
  exportToPDF('ledger-report-area', 'Ankit_ERP_Extra_Billing_Ledger.pdf');
});

// ==========================================
// USER MANAGEMENT MODULE (ADMIN ONLY)
// ==========================================
async function loadUsersList() {
  if (state.user.role !== 'admin') return;
  
  try {
    const response = await fetch(`${API_BASE}/api/users`, { headers: getHeaders() });
    if (response.ok) {
      const users = await response.json();
      renderUsersTable(users);
    }
  } catch (error) {
    console.error('Error loading users:', error);
  }
}

function renderUsersTable(usersList) {
  const tbody = document.getElementById('users-list');
  tbody.innerHTML = '';
  
  usersList.forEach(u => {
    const tr = document.createElement('tr');
    
    // Prevent delete button on current logged-in admin user
    const isSelf = u.id === state.user.id;
    const actionsHtml = `
      <div style="display:flex; gap:6px;">
        <button class="btn-icon edit-user-btn" title="Edit Password/Details" data-id="${u.id}" data-username="${u.username}" data-name="${u.name}" data-role="${u.role}">
          <i class="fa-solid fa-user-pen"></i>
        </button>
        ${!isSelf ? `
          <button class="btn-icon delete delete-user-btn" title="Delete User Account" data-id="${u.id}">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        ` : '<span class="badge verified" style="font-size:10px;">Current Self</span>'}
      </div>
    `;
    
    tr.innerHTML = `
      <td><strong>${u.username}</strong></td>
      <td>${u.name}</td>
      <td><span class="badge ${u.role}">${u.role === 'admin' ? 'Verifier / Admin' : u.role}</span></td>
      <td>${actionsHtml}</td>
    `;
    tbody.appendChild(tr);
  });
  
  // Action Handlers
  tbody.querySelectorAll('.edit-user-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      openUserFormModal(true, {
        id: btn.getAttribute('data-id'),
        username: btn.getAttribute('data-username'),
        name: btn.getAttribute('data-name'),
        role: btn.getAttribute('data-role')
      });
    });
  });
  
  tbody.querySelectorAll('.delete-user-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteUserAccount(btn.getAttribute('data-id')));
  });
}

function openUserFormModal(isEdit, userData = null) {
  const modal = document.getElementById('user-modal');
  const form = document.getElementById('user-form');
  form.reset();
  
  document.getElementById('user-error').classList.add('hidden');
  
  const passwordInput = document.getElementById('usr_password');
  const usernameInput = document.getElementById('usr_username');
  
  if (isEdit) {
    document.getElementById('user-modal-title').textContent = 'Modify User Account';
    document.getElementById('user_id').value = userData.id;
    
    usernameInput.value = userData.username;
    usernameInput.readOnly = true;
    usernameInput.className = 'readonly';
    
    document.getElementById('usr_name').value = userData.name;
    document.getElementById('usr_role').value = userData.role;
    
    // In edit mode, password is optional
    passwordInput.required = false;
    document.getElementById('usr_password_label').innerHTML = 'New Password <span style="font-weight:400; color:var(--text-muted)">(Leave empty to keep current)</span>';
    document.getElementById('usr_password_help').textContent = 'Enter new password only if changing.';
  } else {
    document.getElementById('user-modal-title').textContent = 'Create User Account';
    document.getElementById('user_id').value = '';
    
    usernameInput.value = '';
    usernameInput.readOnly = false;
    usernameInput.className = '';
    
    passwordInput.required = true;
    document.getElementById('usr_password_label').innerHTML = 'Password <span class="required">*</span>';
    document.getElementById('usr_password_help').textContent = 'Enter at least 6 characters.';
  }
  
  modal.classList.remove('hidden');
}

document.getElementById('add-user-btn').addEventListener('click', () => openUserFormModal(false));

document.getElementById('user-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const userId = document.getElementById('user_id').value;
  const isEdit = !!userId;
  
  const payload = {
    username: document.getElementById('usr_username').value.trim(),
    name: document.getElementById('usr_name').value.trim(),
    role: document.getElementById('usr_role').value,
    password: document.getElementById('usr_password').value
  };
  
  const url = isEdit ? `${API_BASE}/api/users/${userId}` : `${API_BASE}/api/users`;
  const method = isEdit ? 'PUT' : 'POST';
  
  try {
    const response = await fetch(url, {
      method,
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });
    
    const data = await response.json();
    if (response.ok) {
      document.getElementById('user-modal').classList.add('hidden');
      loadUsersList();
    } else {
      const err = document.getElementById('user-error');
      err.textContent = data.message;
      err.classList.remove('hidden');
    }
  } catch (error) {
    console.error('Error saving user:', error);
  }
});

async function deleteUserAccount(id) {
  if (!confirm('Are you sure you want to permanently delete this user account? This cannot be undone.')) {
    return;
  }
  
  try {
    const response = await fetch(`${API_BASE}/api/users/${id}`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    
    if (response.ok) {
      loadUsersList();
    } else {
      const data = await response.json();
      alert(data.message || 'Error deleting user.');
    }
  } catch (error) {
    console.error('Error deleting user:', error);
  }
}

// ==========================================
// GLOBAL SEARCH ENGINE
// ==========================================
const globalSearchInput = document.getElementById('global-search');
const searchDropdown = document.getElementById('search-dropdown');

globalSearchInput.addEventListener('input', async () => {
  const query = globalSearchInput.value.trim();
  if (query.length < 2) {
    searchDropdown.classList.add('hidden');
    return;
  }
  
  try {
    const response = await fetch(`${API_BASE}/api/jobs?search=${encodeURIComponent(query)}`, {
      headers: getHeaders()
    });
    
    if (response.ok) {
      const results = await response.json();
      renderSearchResults(results);
    }
  } catch (error) {
    console.error('Error searching jobs:', error);
  }
});

function renderSearchResults(results) {
  searchDropdown.innerHTML = '';
  
  if (results.length === 0) {
    searchDropdown.innerHTML = '<div style="padding:16px; text-align:center; color:var(--text-muted); font-size:14px;">No matching Job Sheets found.</div>';
    searchDropdown.classList.remove('hidden');
    return;
  }
  
  results.forEach(job => {
    const div = document.createElement('div');
    div.className = 'search-result-item';
    div.innerHTML = `
      <div class="item-title">
        <span>${job.job_sheet_no}</span>
        <span class="badge ${job.status.toLowerCase().replace(/\s+/g, '-')}">${job.status}</span>
      </div>
      <div class="item-desc">Client: <strong>${job.client_name}</strong> • Product: ${job.product}</div>
    `;
    div.addEventListener('click', () => {
      searchDropdown.classList.add('hidden');
      globalSearchInput.value = '';
      openJobDetailModal(job.job_sheet_no);
    });
    searchDropdown.appendChild(div);
  });
  
  searchDropdown.classList.remove('hidden');
}

// Close search dropdown on click outside
document.addEventListener('click', (e) => {
  if (!globalSearchInput.contains(e.target) && !searchDropdown.contains(e.target)) {
    searchDropdown.classList.add('hidden');
  }
});

// ==========================================
// GENERAL EVENT LISTENERS & MODAL CLOSE BINDINGS
// ==========================================
function setupEventListeners() {
  // Navigation Links
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      navigateToView(link.getAttribute('data-view'));
    });
  });
  
  // Logout Trigger
  document.getElementById('logout-btn').addEventListener('click', logout);
  
  // Sidebar Toggle Hamburger Menu
  const sidebar = document.querySelector('.app-sidebar');
  document.getElementById('sidebar-toggle-btn').addEventListener('click', () => {
    sidebar.classList.add('active');
  });
  document.getElementById('sidebar-close-btn').addEventListener('click', () => {
    sidebar.classList.remove('active');
  });
  
  // Job sheet status/billing tabs filters
  document.querySelectorAll('#jobs-filter-tabs .filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('#jobs-filter-tabs .filter-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      const status = tab.getAttribute('data-status');
      const billing = tab.getAttribute('data-billing');
      loadJobSheets(status || '', billing || '');
    });
  });
  
  // Ledger Filters buttons
  document.getElementById('ledger-filter-btn').addEventListener('click', filterLedger);
  document.getElementById('ledger-clear-btn').addEventListener('click', () => {
    document.getElementById('ledger-client-select').value = '';
    document.getElementById('ledger-start-date').value = '';
    document.getElementById('ledger-end-date').value = '';
    filterLedger();
  });
  
  // Stock report search button
  document.getElementById('rep-stock-filter-btn').addEventListener('click', loadStockReport);
  document.getElementById('rep-stock-reset-btn').addEventListener('click', () => {
    document.getElementById('rep-stock-start').value = '';
    document.getElementById('rep-stock-end').value = '';
    document.getElementById('rep-stock-client').value = '';
    document.getElementById('rep-stock-product').value = '';
    document.getElementById('rep-stock-jobno').value = '';
    loadStockReport();
  });
  
  // Modal close trigger bindings
  document.querySelectorAll('[data-modal]').forEach(btn => {
    btn.addEventListener('click', () => {
      const modalId = btn.getAttribute('data-modal');
      document.getElementById(modalId).classList.add('hidden');
    });
  });
  
  // Specifications Detail Subtabs View Handler
  document.querySelectorAll('.detail-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.detail-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      const subview = tab.getAttribute('data-subview');
      document.querySelectorAll('.detail-subview').forEach(view => {
        if (view.id === subview) view.classList.remove('hidden');
        else view.classList.add('hidden');
      });
    });
  });
}

// Formatting helpers
function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatCurrency(num) {
  const n = parseFloat(num);
  if (isNaN(n)) return '0.00';
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
