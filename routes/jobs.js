const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { recalculateLedger } = require('../database/ledgerHelper');

// Helper to get fiscal year in YYYY-YY format
function getFiscalYear(dateStr) {
  const date = dateStr ? new Date(dateStr) : new Date();
  if (isNaN(date.getTime())) return getFiscalYear(null);
  
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-11
  
  let startYear, endYear;
  if (month >= 3) { // April is month index 3
    startYear = year;
    endYear = year + 1;
  } else {
    startYear = year - 1;
    endYear = year;
  }
  return `${startYear}-${(endYear).toString().slice(-2)}`;
}

// @route   GET /api/jobs/next-number
// @desc    Generate next job sheet number based on date
router.get('/next-number', authenticateToken, async (req, res) => {
  const { date } = req.query;
  const fiscalYear = getFiscalYear(date);
  const prefix = `JS/${fiscalYear}/`;
  
  try {
    const lastJob = await db.get(
      'SELECT job_sheet_no FROM job_sheets WHERE job_sheet_no LIKE ? ORDER BY job_sheet_no DESC LIMIT 1',
      [`${prefix}%`]
    );

    let nextSeq = 1;
    if (lastJob) {
      const parts = lastJob.job_sheet_no.split('/');
      if (parts.length === 3) {
        const lastSeq = parseInt(parts[2], 10);
        if (!isNaN(lastSeq)) {
          nextSeq = lastSeq + 1;
        }
      }
    }

    const nextJobNo = `${prefix}${nextSeq.toString().padStart(4, '0')}`;
    res.json({ job_sheet_no: nextJobNo, fiscal_year: fiscalYear });
  } catch (error) {
    console.error('Error generating job number:', error);
    res.status(500).json({ message: 'Error generating next Job Sheet Number.' });
  }
});

// @route   GET /api/jobs
// @desc    Get all job sheets with search/filters
router.get('/', authenticateToken, async (req, res) => {
  const { search, status, billing_status } = req.query;
  let sql = 'SELECT * FROM job_sheets WHERE 1=1';
  const params = [];

  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }

  if (billing_status) {
    sql += ' AND billing_status = ?';
    params.push(billing_status);
  }

  if (search) {
    sql += ` AND (
      job_sheet_no LIKE ? OR 
      client_name LIKE ? OR 
      product LIKE ? OR 
      EXISTS (
        SELECT 1 FROM job_purchases 
        WHERE job_purchases.job_sheet_no = job_sheets.job_sheet_no AND (
          purchase_party LIKE ? OR
          purchase_product LIKE ? OR
          purchase_po_no LIKE ? OR
          purchase_invoice_no LIKE ?
        )
      ) OR
      EXISTS (
        SELECT 1 FROM job_sales 
        WHERE job_sales.job_sheet_no = job_sheets.job_sheet_no AND (
          sale_party LIKE ? OR
          sale_product LIKE ? OR
          sale_po_no LIKE ? OR
          sale_bill_no LIKE ?
        )
      )
    )`;
    const searchParam = `%${search}%`;
    params.push(
      searchParam, searchParam, searchParam, // job_sheets
      searchParam, searchParam, searchParam, searchParam, // job_purchases
      searchParam, searchParam, searchParam, searchParam  // job_sales
    );
  }

  sql += ' ORDER BY job_date DESC, job_sheet_no DESC';

  try {
    const jobs = await db.query(sql, params);
    res.json(jobs);
  } catch (error) {
    console.error('Error fetching jobs:', error);
    res.status(500).json({ message: 'Error retrieving Job Sheets.' });
  }
});

// @route   GET /api/jobs/:id
// @desc    Get job sheet by ID (Job Sheet Number)
router.get('/:id', authenticateToken, async (req, res) => {
  const jobNo = decodeURIComponent(req.params.id);
  try {
    const job = await db.get('SELECT * FROM job_sheets WHERE job_sheet_no = ?', [jobNo]);
    if (!job) {
      return res.status(404).json({ message: 'Job Sheet not found.' });
    }
    
    // Fetch purchases for this job
    const purchases = await db.query(
      'SELECT * FROM job_purchases WHERE job_sheet_no = ? ORDER BY id ASC',
      [jobNo]
    );

    // Fetch sales for this job
    const sales = await db.query(
      'SELECT * FROM job_sales WHERE job_sheet_no = ? ORDER BY id ASC',
      [jobNo]
    );
    
    // Fetch audit trail for this job
    const logs = await db.query(
      'SELECT action, performed_by, timestamp, changes FROM audit_logs WHERE job_sheet_no = ? ORDER BY timestamp DESC',
      [jobNo]
    );
    
    res.json({ job, purchases, sales, audit_trail: logs });
  } catch (error) {
    console.error('Error fetching job details:', error);
    res.status(500).json({ message: 'Error retrieving Job Sheet details.' });
  }
});

// @route   POST /api/jobs
// @desc    Create a new Job Sheet
router.post('/', authenticateToken, async (req, res) => {
  if (req.user.role !== 'operations') {
    return res.status(403).json({ message: 'Only Operations user (Bhupinder Sharma) can create Job Sheets.' });
  }

  const {
    job_sheet_no, job_date, client_name, product, remarks,
    purchases, sales, extra_billing
  } = req.body;

  if (!job_sheet_no || !job_sheet_no.trim()) {
    return res.status(400).json({ message: 'Job Sheet Number is required.' });
  }

  if (!job_date || !client_name || !product) {
    return res.status(400).json({ message: 'Job Date, Client Name, and Product are required.' });
  }

  const jobNo = job_sheet_no.trim();

  try {
    const existing = await db.get('SELECT job_sheet_no FROM job_sheets WHERE job_sheet_no = ?', [jobNo]);
    if (existing) {
      return res.status(400).json({ message: 'Job Sheet Number already exists. Please enter a unique number.' });
    }

    // Process Purchases dynamic list
    const purchaseList = purchases || [];
    let totalPurchaseQty = 0;
    let totalPurchaseAmount = 0;

    for (const p of purchaseList) {
      const qty = parseFloat(p.purchase_qty) || 0;
      const rate = parseFloat(p.purchase_rate) || 0;
      const amount = qty * rate;
      p.purchase_amount = amount;
      
      totalPurchaseQty += qty;
      totalPurchaseAmount += amount;
    }

    // Process Sales dynamic list
    const saleList = sales || [];
    let totalSaleQty = 0;
    let totalSaleAmount = 0;

    for (const s of saleList) {
      const qty = parseFloat(s.sale_qty) || 0;
      const rate = parseFloat(s.sale_rate) || 0;
      const amount = qty * rate;
      s.sale_amount = amount;
      
      totalSaleQty += qty;
      totalSaleAmount += amount;
    }

    const extraB = parseFloat(extra_billing) || 0;
    const grossRev = totalSaleAmount - totalPurchaseAmount;
    const netRev = totalSaleAmount - totalPurchaseAmount - extraB;
    const closingStock = totalPurchaseQty - totalSaleQty;

    // Status Engine
    let status = 'Draft';
    if (totalPurchaseQty > 0 && totalSaleQty > 0) {
      status = 'Ready for Verification';
    } else if (totalPurchaseQty > 0 && totalSaleQty === 0) {
      status = 'Sale Pending';
    } else if (totalPurchaseQty === 0 && totalSaleQty > 0) {
      status = 'Purchase Pending';
    }

    // Billing Status Engine
    const isAllBilled = saleList.length > 0 && saleList.every(s => s.sale_bill_no && s.sale_bill_no.trim());
    const billingStatus = isAllBilled ? 'Billing Done' : 'Pending Billing';

    const timestamp = new Date().toISOString();

    await db.run(`
      INSERT INTO job_sheets (
        job_sheet_no, job_date, client_name, product, remarks,
        purchase_qty, purchase_amount,
        sale_qty, sale_amount,
        extra_billing, gross_revenue, net_revenue, closing_stock, status, billing_status,
        created_by, created_at, modified_by, modified_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      jobNo, job_date, client_name.trim(), product.trim(), remarks || '',
      totalPurchaseQty, totalPurchaseAmount,
      totalSaleQty, totalSaleAmount,
      extraB, grossRev, netRev, closingStock, status, billingStatus,
      req.user.name, timestamp, req.user.name, timestamp
    ]);

    // Insert itemized child purchases
    for (const p of purchaseList) {
      await db.run(`
        INSERT INTO job_purchases (
          job_sheet_no, purchase_po_no, purchase_party, purchase_product, 
          purchase_qty, purchase_rate, purchase_amount, purchase_invoice_no, purchase_invoice_date
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL)
      `, [
        jobNo,
        p.purchase_po_no ? p.purchase_po_no.trim() : null,
        (p.purchase_party || '').trim(),
        (p.purchase_product || '').trim(),
        parseFloat(p.purchase_qty) || 0,
        parseFloat(p.purchase_rate) || 0,
        p.purchase_amount
      ]);
    }

    // Insert itemized child sales
    for (const s of saleList) {
      await db.run(`
        INSERT INTO job_sales (
          job_sheet_no, sale_po_no, sale_party, sale_product, 
          sale_qty, sale_rate, sale_amount, sale_bill_no
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        jobNo,
        s.sale_po_no ? s.sale_po_no.trim() : null,
        (s.sale_party || '').trim(),
        (s.sale_product || '').trim(),
        parseFloat(s.sale_qty) || 0,
        parseFloat(s.sale_rate) || 0,
        s.sale_amount,
        s.sale_bill_no ? s.sale_bill_no.trim() : null
      ]);
    }

    // Handle Extra Billing Ledger entry automatically
    if (extraB > 0) {
      await db.run(`
        INSERT INTO ledger (date, job_sheet_no, client_name, particulars, debit, credit, user_name, remarks)
        VALUES (?, ?, ?, ?, 0, ?, ?, ?)
      `, [
        job_date, jobNo, client_name.trim(), 'Extra Billing from Job Sheet', extraB, req.user.name, 'Auto-generated from Job Sheet'
      ]);
      await recalculateLedger(client_name);
    }

    // Write Audit Log
    await db.run(`
      INSERT INTO audit_logs (job_sheet_no, action, performed_by, timestamp, changes)
      VALUES (?, 'CREATE', ?, ?, ?)
    `, [jobNo, req.user.name, timestamp, JSON.stringify({ new_record: req.body })]);

    res.status(201).json({ message: 'Job Sheet created successfully.', job_sheet_no: jobNo });
  } catch (error) {
    console.error('Error creating Job Sheet:', error);
    res.status(500).json({ message: 'Server error creating Job Sheet.' });
  }
});

// @route   PUT /api/jobs/:id
// @desc    Update an existing Job Sheet (Operations Bhupinder only)
router.put('/:id', authenticateToken, async (req, res) => {
  const jobNo = decodeURIComponent(req.params.id);
  
  // Role Lock: Only Bhupinder Sharma (operations) can modify job details
  if (req.user.role !== 'operations') {
    return res.status(403).json({
      message: 'Only Operations user (Bhupinder Sharma) can edit Job Sheet details.'
    });
  }

  const {
    job_date, client_name, product, remarks,
    purchases, sales, extra_billing
  } = req.body;

  if (!job_date || !client_name || !product) {
    return res.status(400).json({ message: 'Job Date, Client Name, and Product are required.' });
  }

  try {
    const existingJob = await db.get('SELECT * FROM job_sheets WHERE job_sheet_no = ?', [jobNo]);
    if (!existingJob) {
      return res.status(404).json({ message: 'Job Sheet not found.' });
    }

    // Lock check: If verified, locked
    if (existingJob.status === 'Verified') {
      return res.status(403).json({
        message: 'This Job Sheet is VERIFIED and locked. Only Pankaj Agrawal can unverify it before editing.'
      });
    }

    // Process Purchases dynamic list
    const purchaseList = purchases || [];
    let totalPurchaseQty = 0;
    let totalPurchaseAmount = 0;

    for (const p of purchaseList) {
      const qty = parseFloat(p.purchase_qty) || 0;
      const rate = parseFloat(p.purchase_rate) || 0;
      const amount = qty * rate;
      p.purchase_amount = amount;
      
      totalPurchaseQty += qty;
      totalPurchaseAmount += amount;
    }

    // Process Sales dynamic list
    const saleList = sales || [];
    let totalSaleQty = 0;
    let totalSaleAmount = 0;

    for (const s of saleList) {
      const qty = parseFloat(s.sale_qty) || 0;
      const rate = parseFloat(s.sale_rate) || 0;
      const amount = qty * rate;
      s.sale_amount = amount;
      
      totalSaleQty += qty;
      totalSaleAmount += amount;
    }

    const extraB = parseFloat(extra_billing) || 0;
    const grossRev = totalSaleAmount - totalPurchaseAmount;
    const netRev = totalSaleAmount - totalPurchaseAmount - extraB;
    const closingStock = totalPurchaseQty - totalSaleQty;

    // Status Engine
    let status = 'Draft';
    if (totalPurchaseQty > 0 && totalSaleQty > 0) {
      status = 'Ready for Verification';
    } else if (totalPurchaseQty > 0 && totalSaleQty === 0) {
      status = 'Sale Pending';
    } else if (totalPurchaseQty === 0 && totalSaleQty > 0) {
      status = 'Purchase Pending';
    }

    // Billing Status Engine
    const isAllBilled = saleList.length > 0 && saleList.every(s => s.sale_bill_no && s.sale_bill_no.trim());
    const billingStatus = isAllBilled ? 'Billing Done' : 'Pending Billing';

    const timestamp = new Date().toISOString();

    // Log the diff
    const diff = {};
    for (const key of Object.keys(req.body)) {
      if (key !== 'purchases' && key !== 'sales' && existingJob[key] !== req.body[key]) {
        diff[key] = { from: existingJob[key], to: req.body[key] };
      }
    }

    await db.run(`
      UPDATE job_sheets SET
        job_date = ?, client_name = ?, product = ?, remarks = ?,
        purchase_qty = ?, purchase_amount = ?,
        sale_qty = ?, sale_amount = ?,
        extra_billing = ?, gross_revenue = ?, net_revenue = ?, closing_stock = ?, status = ?, billing_status = ?,
        modified_by = ?, modified_at = ?
      WHERE job_sheet_no = ?
    `, [
      job_date, client_name.trim(), product.trim(), remarks || '',
      totalPurchaseQty, totalPurchaseAmount,
      totalSaleQty, totalSaleAmount,
      extraB, grossRev, netRev, closingStock, status, billingStatus,
      req.user.name, timestamp, jobNo
    ]);

    // Recreate child purchases
    await db.run('DELETE FROM job_purchases WHERE job_sheet_no = ?', [jobNo]);
    for (const p of purchaseList) {
      await db.run(`
        INSERT INTO job_purchases (
          job_sheet_no, purchase_po_no, purchase_party, purchase_product, 
          purchase_qty, purchase_rate, purchase_amount, purchase_invoice_no, purchase_invoice_date
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        jobNo,
        p.purchase_po_no ? p.purchase_po_no.trim() : null,
        (p.purchase_party || '').trim(),
        (p.purchase_product || '').trim(),
        parseFloat(p.purchase_qty) || 0,
        parseFloat(p.purchase_rate) || 0,
        p.purchase_amount,
        p.purchase_invoice_no || null,
        p.purchase_invoice_date || null
      ]);
    }

    // Recreate child sales
    await db.run('DELETE FROM job_sales WHERE job_sheet_no = ?', [jobNo]);
    for (const s of saleList) {
      await db.run(`
        INSERT INTO job_sales (
          job_sheet_no, sale_po_no, sale_party, sale_product, 
          sale_qty, sale_rate, sale_amount, sale_bill_no
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        jobNo,
        s.sale_po_no ? s.sale_po_no.trim() : null,
        (s.sale_party || '').trim(),
        (s.sale_product || '').trim(),
        parseFloat(s.sale_qty) || 0,
        parseFloat(s.sale_rate) || 0,
        s.sale_amount,
        s.sale_bill_no ? s.sale_bill_no.trim() : null
      ]);
    }

    // Handle Extra Billing Ledger entry sync
    const autoLedger = await db.get(
      'SELECT id FROM ledger WHERE job_sheet_no = ? AND particulars = ?',
      [jobNo, 'Extra Billing from Job Sheet']
    );

    if (extraB > 0) {
      if (autoLedger) {
        await db.run(`
          UPDATE ledger SET date = ?, client_name = ?, credit = ?, user_name = ?
          WHERE id = ?
        `, [job_date, client_name.trim(), extraB, req.user.name, autoLedger.id]);
      } else {
        await db.run(`
          INSERT INTO ledger (date, job_sheet_no, client_name, particulars, debit, credit, user_name, remarks)
          VALUES (?, ?, ?, ?, 0, ?, ?, ?)
        `, [
          job_date, jobNo, client_name.trim(), 'Extra Billing from Job Sheet', extraB, req.user.name, 'Auto-generated from Job Sheet'
        ]);
      }
    } else {
      if (autoLedger) {
        await db.run('DELETE FROM ledger WHERE id = ?', [autoLedger.id]);
      }
    }

    // Recalculate Ledger for old and new client if client name changed
    if (existingJob.client_name.trim().toLowerCase() !== client_name.trim().toLowerCase()) {
      await recalculateLedger(existingJob.client_name);
    }
    await recalculateLedger(client_name);

    // Write Audit Log
    await db.run(`
      INSERT INTO audit_logs (job_sheet_no, action, performed_by, timestamp, changes)
      VALUES (?, 'UPDATE', ?, ?, ?)
    `, [jobNo, req.user.name, timestamp, JSON.stringify(diff)]);

    res.json({ message: 'Job Sheet updated successfully.' });
  } catch (error) {
    console.error('Error updating Job Sheet:', error);
    res.status(500).json({ message: 'Server error updating Job Sheet.' });
  }
});

// @route   PUT /api/jobs/:id/sale-bill
// @desc    Enter/Update Sale Bill Numbers for sale items (Accounts Harshit only)
router.put('/:id/sale-bill', authenticateToken, requireRole(['accounts', 'admin']), async (req, res) => {
  const jobNo = decodeURIComponent(req.params.id);
  const { bills } = req.body; // Array of { id, sale_bill_no }

  if (!bills || !Array.isArray(bills)) {
    return res.status(400).json({ message: 'Bills array is required.' });
  }

  try {
    const job = await db.get('SELECT * FROM job_sheets WHERE job_sheet_no = ?', [jobNo]);
    if (!job) {
      return res.status(404).json({ message: 'Job Sheet not found.' });
    }

    // Lock check: If verified, locked
    if (job.status === 'Verified') {
      return res.status(403).json({
        message: 'This Job Sheet is VERIFIED and locked. Only Pankaj Agrawal can unverify it before editing.'
      });
    }

    const timestamp = new Date().toISOString();

    for (const b of bills) {
      await db.run(
        'UPDATE job_sales SET sale_bill_no = ? WHERE id = ? AND job_sheet_no = ?',
        [b.sale_bill_no ? b.sale_bill_no.trim() : null, b.id, jobNo]
      );
    }

    // Recheck billing status for job sheet
    const allSales = await db.query('SELECT sale_bill_no FROM job_sales WHERE job_sheet_no = ?', [jobNo]);
    const isAllBilled = allSales.length > 0 && allSales.every(s => s.sale_bill_no && s.sale_bill_no.trim());
    const billingStatus = isAllBilled ? 'Billing Done' : 'Pending Billing';

    await db.run(
      'UPDATE job_sheets SET billing_status = ?, modified_by = ?, modified_at = ? WHERE job_sheet_no = ?',
      [billingStatus, req.user.name, timestamp, jobNo]
    );

    // Write Audit Log
    await db.run(`
      INSERT INTO audit_logs (job_sheet_no, action, performed_by, timestamp, changes)
      VALUES (?, 'UPDATE_SALE_BILL', ?, ?, ?)
    `, [
      jobNo,
      req.user.name,
      timestamp,
      JSON.stringify({ bills })
    ]);

    res.json({ message: 'Sale Bill Numbers updated successfully.', billing_status: billingStatus });
  } catch (error) {
    console.error('Error updating Sale Bill Numbers:', error);
    res.status(500).json({ message: 'Server error updating Sale Bill Numbers.' });
  }
});

// @route   POST /api/jobs/:id/verify
// @desc    Verify Job Sheet by verifying each purchase item (Admin only)
router.post('/:id/verify', authenticateToken, requireRole(['admin']), async (req, res) => {
  const jobNo = decodeURIComponent(req.params.id);
  const { purchases } = req.body; // Array of { id, purchase_invoice_no, purchase_invoice_date }

  if (!purchases || !Array.isArray(purchases)) {
    return res.status(400).json({ message: 'Purchases verification array is required.' });
  }

  // Validate that invoice details are filled
  for (const p of purchases) {
    if (!p.purchase_invoice_no || !p.purchase_invoice_date) {
      return res.status(400).json({ message: 'Invoice Number and Date are required for all purchase rows.' });
    }
  }

  try {
    const job = await db.get('SELECT * FROM job_sheets WHERE job_sheet_no = ?', [jobNo]);
    if (!job) {
      return res.status(404).json({ message: 'Job Sheet not found.' });
    }

    if (job.status === 'Verified') {
      return res.status(400).json({ message: 'Job Sheet is already verified.' });
    }

    if (job.purchase_qty === 0 || job.sale_qty === 0) {
      return res.status(400).json({
        message: 'Job Sheet must be in Ready for Verification state (both purchase and sale available) before verifying.'
      });
    }

    const timestamp = new Date().toISOString();

    // Update each purchase item
    for (const p of purchases) {
      await db.run(`
        UPDATE job_purchases SET
          purchase_invoice_no = ?,
          purchase_invoice_date = ?
        WHERE id = ? AND job_sheet_no = ?
      `, [p.purchase_invoice_no.trim(), p.purchase_invoice_date, p.id, jobNo]);
    }

    await db.run(`
      UPDATE job_sheets SET
        status = 'Verified',
        verified_by = ?,
        verified_at = ?,
        modified_by = ?,
        modified_at = ?
      WHERE job_sheet_no = ?
    `, [
      req.user.name,
      timestamp,
      req.user.name,
      timestamp,
      jobNo
    ]);

    // Write Audit Log
    await db.run(`
      INSERT INTO audit_logs (job_sheet_no, action, performed_by, timestamp, changes)
      VALUES (?, 'VERIFY', ?, ?, ?)
    `, [
      jobNo,
      req.user.name,
      timestamp,
      JSON.stringify({ purchases })
    ]);

    res.json({ message: 'Job Sheet verified successfully by Pankaj Agrawal.' });
  } catch (error) {
    console.error('Error verifying job sheet:', error);
    res.status(500).json({ message: 'Server error during verification.' });
  }
});

// @route   POST /api/jobs/:id/unverify
// @desc    Unverify Job Sheet (Admin only)
router.post('/:id/unverify', authenticateToken, requireRole(['admin']), async (req, res) => {
  const jobNo = decodeURIComponent(req.params.id);

  try {
    const job = await db.get('SELECT * FROM job_sheets WHERE job_sheet_no = ?', [jobNo]);
    if (!job) {
      return res.status(404).json({ message: 'Job Sheet not found.' });
    }

    if (job.status !== 'Verified') {
      return res.status(400).json({ message: 'Job Sheet is not in verified state.' });
    }

    // Clear verification invoices from purchases
    await db.run(`
      UPDATE job_purchases SET 
        purchase_invoice_no = NULL, 
        purchase_invoice_date = NULL 
      WHERE job_sheet_no = ?
    `, [jobNo]);

    // Determine the original state (based on purchase and sale qty)
    let originalStatus = 'Draft';
    if (job.purchase_qty > 0 && job.sale_qty > 0) {
      originalStatus = 'Ready for Verification';
    } else if (job.purchase_qty > 0 && job.sale_qty === 0) {
      originalStatus = 'Sale Pending';
    } else if (job.purchase_qty === 0 && job.sale_qty > 0) {
      originalStatus = 'Purchase Pending';
    }

    const timestamp = new Date().toISOString();

    await db.run(`
      UPDATE job_sheets SET
        status = ?,
        verified_by = NULL,
        verified_at = NULL,
        modified_by = ?,
        modified_at = ?
      WHERE job_sheet_no = ?
    `, [originalStatus, req.user.name, timestamp, jobNo]);

    // Write Audit Log
    await db.run(`
      INSERT INTO audit_logs (job_sheet_no, action, performed_by, timestamp, changes)
      VALUES (?, 'UNVERIFY', ?, ?, NULL)
    `, [jobNo, req.user.name, timestamp]);

    res.json({ message: 'Job Sheet unverification successful.' });
  } catch (error) {
    console.error('Error unverifying job sheet:', error);
    res.status(500).json({ message: 'Server error during unverification.' });
  }
});

// @route   DELETE /api/jobs/:id
// @desc    Delete a Job Sheet (Operations Bhupinder or Admin only)
router.delete('/:id', authenticateToken, requireRole(['operations', 'admin']), async (req, res) => {
  const jobNo = decodeURIComponent(req.params.id);

  try {
    const job = await db.get('SELECT * FROM job_sheets WHERE job_sheet_no = ?', [jobNo]);
    if (!job) {
      return res.status(404).json({ message: 'Job Sheet not found.' });
    }

    // Lock check: Verified jobs can only be deleted by admin (Pankaj)
    if (job.status === 'Verified' && req.user.role !== 'admin') {
      return res.status(403).json({
        message: 'This Job Sheet is VERIFIED and locked. Only Admin (Pankaj Agrawal) can delete a verified Job Sheet.'
      });
    }

    // Delete automatically generated ledger entry for extra billing
    await db.run('DELETE FROM ledger WHERE job_sheet_no = ? AND particulars = ?', [jobNo, 'Extra Billing from Job Sheet']);
    await recalculateLedger(job.client_name);

    // Delete job sheet (child tables job_purchases and job_sales will delete via cascade)
    await db.run('DELETE FROM job_sheets WHERE job_sheet_no = ?', [jobNo]);

    // Write Audit Log
    const timestamp = new Date().toISOString();
    await db.run(`
      INSERT INTO audit_logs (job_sheet_no, action, performed_by, timestamp, changes)
      VALUES (?, 'DELETE', ?, ?, ?)
    `, [jobNo, req.user.name, timestamp, JSON.stringify(job)]);

    res.json({ message: 'Job Sheet deleted successfully.' });
  } catch (error) {
    console.error('Error deleting job sheet:', error);
    res.status(500).json({ message: 'Server error deleting Job Sheet.' });
  }
});

module.exports = router;
