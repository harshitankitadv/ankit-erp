const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { authenticateToken } = require('../middleware/auth');

// @route   GET /api/reports/dashboard
// @desc    Get dashboard KPIs and Chart Analytics
router.get('/dashboard', authenticateToken, async (req, res) => {
  try {
    // 1. KPI Calculations
    const jobStats = await db.get(`
      SELECT 
        COUNT(*) as total_jobs,
        SUM(purchase_amount) as total_purchase,
        SUM(sale_amount) as total_sale,
        SUM(gross_revenue) as total_revenue,
        SUM(net_revenue) as total_net_revenue,
        SUM(closing_stock) as total_stock_qty,
        SUM(closing_stock * (CASE WHEN purchase_qty > 0 THEN purchase_amount / purchase_qty ELSE 0 END)) as total_stock_value
      FROM job_sheets
    `);

    const verifiedStats = await db.get(`
      SELECT 
        COUNT(CASE WHEN status = 'Verified' THEN 1 END) as verified_jobs,
        COUNT(CASE WHEN status = 'Ready for Verification' THEN 1 END) as pending_verification
      FROM job_sheets
    `);

    const ledgerStats = await db.get(`
      SELECT (SUM(credit) - SUM(debit)) as outstanding_billing FROM ledger
    `);

    const kpis = {
      totalJobSheets: jobStats.total_jobs || 0,
      totalPurchaseValue: jobStats.total_purchase || 0,
      totalSaleValue: jobStats.total_sale || 0,
      totalRevenue: jobStats.total_revenue || 0,
      totalNetRevenue: jobStats.total_net_revenue || 0,
      currentStockQty: jobStats.total_stock_qty || 0,
      currentStockValue: jobStats.total_stock_value || 0,
      verifiedJobs: verifiedStats.verified_jobs || 0,
      pendingVerification: verifiedStats.pending_verification || 0,
      outstandingExtraBilling: ledgerStats.outstanding_billing || 0
    };

    // 2. Chart Queries
    // Use SUBSTR(job_date, 1, 7) for SQLite/MySQL cross-compatibility (returns YYYY-MM)
    const monthlyRevTrend = await db.query(`
      SELECT 
        SUBSTR(job_date, 1, 7) as month,
        SUM(gross_revenue) as gross_revenue,
        SUM(net_revenue) as net_revenue
      FROM job_sheets
      GROUP BY month
      ORDER BY month ASC
      LIMIT 12
    `);

    const clientRevenue = await db.query(`
      SELECT 
        client_name,
        SUM(gross_revenue) as revenue
      FROM job_sheets
      GROUP BY client_name
      ORDER BY revenue DESC
      LIMIT 6
    `);

    const monthlyLedgerTrend = await db.query(`
      SELECT 
        SUBSTR(date, 1, 7) as month,
        SUM(credit) as credit,
        SUM(debit) as debit
      FROM ledger
      GROUP BY month
      ORDER BY month ASC
      LIMIT 12
    `);

    res.json({
      kpis,
      charts: {
        monthlyRevenue: monthlyRevTrend,
        clientRevenue: clientRevenue,
        monthlyExtraBilling: monthlyLedgerTrend
      }
    });
  } catch (error) {
    console.error('Error calculating dashboard analytics:', error);
    res.status(500).json({ message: 'Error retrieving dashboard metrics.' });
  }
});

// @route   GET /api/reports/job-revenue
// @desc    Get job-wise revenue report
router.get('/job-revenue', authenticateToken, async (req, res) => {
  try {
    const report = await db.query(`
      SELECT 
        job_sheet_no,
        job_date,
        client_name,
        purchase_amount,
        sale_amount,
        extra_billing,
        gross_revenue,
        net_revenue,
        status,
        (CASE WHEN status = 'Verified' THEN 'Verified' ELSE 'Unverified' END) as verification_status
      FROM job_sheets
      ORDER BY job_date DESC, job_sheet_no DESC
    `);
    res.json(report);
  } catch (error) {
    res.status(500).json({ message: 'Error generating Job Revenue Report.' });
  }
});

// @route   GET /api/reports/stock
// @desc    Get stock reports with filters
router.get('/stock', authenticateToken, async (req, res) => {
  const { start_date, end_date, client, product, job_sheet_no } = req.query;
  
  let sql = `
    SELECT 
      job_sheet_no,
      (SELECT GROUP_CONCAT(purchase_product, ', ') FROM job_purchases WHERE job_purchases.job_sheet_no = job_sheets.job_sheet_no) as product_name,
      purchase_qty,
      sale_qty,
      closing_stock as balance_qty,
      purchase_amount as purchase_value,
      (CASE 
        WHEN closing_stock > 0 THEN 'In Stock'
        WHEN closing_stock = 0 THEN 'Out of Stock'
        ELSE 'Over-allocated' 
      END) as stock_status
    FROM job_sheets
    WHERE 1=1
  `;
  const params = [];

  if (start_date) {
    sql += ' AND job_date >= ?';
    params.push(start_date);
  }
  if (end_date) {
    sql += ' AND job_date <= ?';
    params.push(end_date);
  }
  if (client) {
    sql += ' AND LOWER(client_name) = LOWER(?)';
    params.push(client.trim());
  }
  if (product) {
    sql += ` AND (
      LOWER(product) LIKE ? OR 
      EXISTS (SELECT 1 FROM job_purchases WHERE job_purchases.job_sheet_no = job_sheets.job_sheet_no AND LOWER(purchase_product) LIKE ?) OR
      EXISTS (SELECT 1 FROM job_sales WHERE job_sales.job_sheet_no = job_sheets.job_sheet_no AND LOWER(sale_product) LIKE ?)
    )`;
    const prodParam = `%${product.toLowerCase().trim()}%`;
    params.push(prodParam, prodParam, prodParam);
  }
  if (job_sheet_no) {
    sql += ' AND job_sheet_no LIKE ?';
    params.push(`%${job_sheet_no.trim()}%`);
  }

  sql += ' ORDER BY job_date DESC, job_sheet_no DESC';

  try {
    const stockReport = await db.query(sql, params);
    res.json(stockReport);
  } catch (error) {
    console.error('Error generating stock report:', error);
    res.status(500).json({ message: 'Error generating Stock Report.' });
  }
});

// @route   GET /api/reports/pending-verification
// @desc    Get all jobs ready for verification but not verified
router.get('/pending-verification', authenticateToken, async (req, res) => {
  try {
    const pending = await db.query(
      "SELECT * FROM job_sheets WHERE status = 'Ready for Verification' ORDER BY job_date ASC"
    );
    res.json(pending);
  } catch (error) {
    res.status(500).json({ message: 'Error retrieving pending verifications.' });
  }
});

// @route   GET /api/reports/verified
// @desc    Get all verified jobs
router.get('/verified', authenticateToken, async (req, res) => {
  try {
    const verified = await db.query(
      "SELECT * FROM job_sheets WHERE status = 'Verified' ORDER BY verified_at DESC"
    );
    res.json(verified);
  } catch (error) {
    res.status(500).json({ message: 'Error retrieving verified transactions.' });
  }
});

module.exports = router;
