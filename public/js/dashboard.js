// ==========================================
// ANKIT ADVERTISING ERP - ANALYTICS ENGINE
// ==========================================

window.dashboardCharts = {};

async function loadDashboardData() {
  try {
    const response = await fetch('/api/reports/dashboard', {
      headers: getHeaders()
    });
    
    if (response.ok) {
      const data = await response.json();
      
      // Update KPIs
      updateKPIs(data.kpis);
      
      // Render Charts
      renderMonthlyRevenueChart(data.charts.monthlyRevenue);
      renderVerificationBreakdownChart(data.kpis);
      renderClientRevenueChart(data.charts.clientRevenue);
      renderExtraBillingTrendChart(data.charts.monthlyExtraBilling);
    }
  } catch (error) {
    console.error('Error fetching dashboard analytics data:', error);
  }
}

function updateKPIs(kpis) {
  document.getElementById('kpi-total-jobs').textContent = kpis.totalJobSheets;
  document.getElementById('kpi-total-revenue').textContent = `₹${formatCurrency(kpis.totalRevenue)}`;
  document.getElementById('kpi-total-net-revenue').textContent = `₹${formatCurrency(kpis.totalNetRevenue)}`;
  
  const outstandingBilling = document.getElementById('kpi-extra-billing-outstanding');
  outstandingBilling.textContent = `₹${formatCurrency(kpis.outstandingExtraBilling)}`;
  if (kpis.outstandingExtraBilling > 0) {
    outstandingBilling.className = 'font-red';
  } else {
    outstandingBilling.className = '';
  }
  
  document.getElementById('kpi-stock-qty').textContent = kpis.currentStockQty;
  document.getElementById('kpi-stock-qty').className = kpis.currentStockQty < 0 ? 'negative' : (kpis.currentStockQty > 0 ? 'positive' : '');
  document.getElementById('kpi-stock-value').textContent = `₹${formatCurrency(kpis.currentStockValue)}`;
  
  document.getElementById('kpi-verified-jobs').textContent = kpis.verifiedJobs;
  document.getElementById('kpi-pending-verification').textContent = kpis.pendingVerification;
}

// Helper to destroy existing chart if it exists
function destroyChart(name) {
  if (window.dashboardCharts[name]) {
    window.dashboardCharts[name].destroy();
  }
}

// 1. Monthly Revenue & Net Revenue Trend Chart (Line Chart)
function renderMonthlyRevenueChart(data) {
  destroyChart('monthlyRevenue');
  
  const ctx = document.getElementById('chart-monthly-revenue').getContext('2d');
  
  const labels = data.map(item => formatMonthLabel(item.month));
  const grossRev = data.map(item => item.gross_revenue);
  const netRev = data.map(item => item.net_revenue);
  
  window.dashboardCharts.monthlyRevenue = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Gross Revenue',
          data: grossRev,
          borderColor: '#4f46e5',
          backgroundColor: 'rgba(79, 70, 229, 0.1)',
          fill: true,
          tension: 0.4,
          borderWidth: 3
        },
        {
          label: 'Net Revenue',
          data: netRev,
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59, 130, 246, 0.05)',
          fill: true,
          tension: 0.4,
          borderWidth: 3
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          labels: { font: { family: 'Outfit', size: 12 } }
        }
      },
      scales: {
        y: {
          ticks: {
            font: { family: 'Outfit' },
            callback: value => '₹' + formatShortNumber(value)
          },
          grid: { color: '#f1f5f9' }
        },
        x: {
          ticks: { font: { family: 'Outfit' } },
          grid: { display: false }
        }
      }
    }
  });
}

// 2. Verification Breakdown (Doughnut Chart)
function renderVerificationBreakdownChart(kpis) {
  destroyChart('verificationBreakdown');
  
  const ctx = document.getElementById('chart-verification-breakdown').getContext('2d');
  
  const verified = kpis.verifiedJobs;
  const pending = kpis.pendingVerification;
  const drafts = kpis.totalJobSheets - (verified + pending);
  
  window.dashboardCharts.verificationBreakdown = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Verified', 'Pending Verification', 'Drafts/Other'],
      datasets: [{
        data: [verified, pending, drafts],
        backgroundColor: ['#10b981', '#f59e0b', '#94a3b8'],
        borderWidth: 2,
        borderColor: '#ffffff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { font: { family: 'Outfit', size: 11 } }
        }
      },
      cutout: '65%'
    }
  });
}

// 3. Client-wise Top Revenue (Bar Chart)
function renderClientRevenueChart(data) {
  destroyChart('clientRevenue');
  
  const ctx = document.getElementById('chart-client-revenue').getContext('2d');
  
  // Sort and filter out negative/zero revenue for display
  const validData = data.filter(item => item.revenue > 0);
  const labels = validData.map(item => item.client_name);
  const revenues = validData.map(item => item.revenue);
  
  window.dashboardCharts.clientRevenue = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Gross Profit (₹)',
        data: revenues,
        backgroundColor: 'rgba(16, 185, 129, 0.85)',
        borderColor: '#10b981',
        borderWidth: 1.5,
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y', // Horizontal bars!
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: {
          ticks: {
            font: { family: 'Outfit' },
            callback: value => '₹' + formatShortNumber(value)
          },
          grid: { color: '#f1f5f9' }
        },
        y: {
          ticks: { font: { family: 'Outfit', size: 11 } },
          grid: { display: false }
        }
      }
    }
  });
}

// 4. Monthly Extra Billing Adjustments (Grouped Bar Chart)
function renderExtraBillingTrendChart(data) {
  destroyChart('extraBillingTrend');
  
  const ctx = document.getElementById('chart-extra-billing-trend').getContext('2d');
  
  const labels = data.map(item => formatMonthLabel(item.month));
  const creditVal = data.map(item => item.credit);
  const debitVal = data.map(item => item.debit);
  
  window.dashboardCharts.extraBillingTrend = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Total Extra Billed (Credit)',
          data: creditVal,
          backgroundColor: 'rgba(239, 68, 68, 0.85)',
          borderColor: '#ef4444',
          borderWidth: 1.5,
          borderRadius: 4
        },
        {
          label: 'Total Paid/Adjusted (Debit)',
          data: debitVal,
          backgroundColor: 'rgba(59, 130, 246, 0.85)',
          borderColor: '#3b82f6',
          borderWidth: 1.5,
          borderRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          labels: { font: { family: 'Outfit', size: 12 } }
        }
      },
      scales: {
        y: {
          ticks: {
            font: { family: 'Outfit' },
            callback: value => '₹' + formatShortNumber(value)
          },
          grid: { color: '#f1f5f9' }
        },
        x: {
          ticks: { font: { family: 'Outfit' } },
          grid: { display: false }
        }
      }
    }
  });
}

// Utility Formatting functions for charts
function formatMonthLabel(yearMonthStr) {
  if (!yearMonthStr) return '';
  const [year, month] = yearMonthStr.split('-');
  const date = new Date(year, parseInt(month) - 1, 1);
  return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

function formatShortNumber(num) {
  const n = parseFloat(num);
  if (isNaN(n)) return '0';
  if (n >= 10000000) return (n / 10000000).toFixed(1) + 'Cr';
  if (n >= 100000) return (n / 100000).toFixed(1) + 'L';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return n.toString();
}
