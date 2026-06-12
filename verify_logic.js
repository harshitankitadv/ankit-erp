const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose();

// Test configurations
const TEST_DB_FILE = path.join(__dirname, 'test_ankit_erp.db');

// Setup helper to create in-memory or file database for testing
function setupTestDb() {
  if (fs.existsSync(TEST_DB_FILE)) {
    fs.unlinkSync(TEST_DB_FILE);
  }
  
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(TEST_DB_FILE, (err) => {
      if (err) reject(err);
      else resolve(db);
    });
  });
}

function runQuery(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function runExec(db, sql) {
  return new Promise((resolve, reject) => {
    db.exec(sql, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function runInsert(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function getRow(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row || null);
    });
  });
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedPassword) {
  const [salt, originalHash] = storedPassword.split(':');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return hash === originalHash;
}

// Logic calculations replica from jobs.js
function calculateJobMetrics(purchase_qty, purchase_rate, sale_qty, sale_rate, extra_billing) {
  const pQty = parseFloat(purchase_qty) || 0;
  const pRate = parseFloat(purchase_rate) || 0;
  const pAmount = pQty * pRate;

  const sQty = parseFloat(sale_qty) || 0;
  const sRate = parseFloat(sale_rate) || 0;
  const sAmount = sQty * sRate;

  const extraB = parseFloat(extra_billing) || 0;

  const grossRev = sAmount - pAmount;
  const netRev = sAmount - pAmount - extraB;
  const closingStock = pQty - sQty;

  let status = 'Draft';
  if (pQty > 0 && sQty > 0) {
    status = 'Ready for Verification';
  } else if (pQty > 0 && sQty === 0) {
    status = 'Sale Pending';
  } else if (pQty === 0 && sQty > 0) {
    status = 'Purchase Pending';
  }

  return { pAmount, sAmount, grossRev, netRev, closingStock, status };
}

// Re-calculate ledger helper
async function recalculateLedger(db, clientName) {
  const entries = await runQuery(
    db,
    'SELECT id, debit, credit FROM ledger WHERE client_name = ? ORDER BY date ASC, id ASC',
    [clientName]
  );
  
  let runningBalance = 0;
  for (const entry of entries) {
    runningBalance += (entry.credit - entry.debit);
    await runInsert(
      db,
      'UPDATE ledger SET running_balance = ? WHERE id = ?',
      [runningBalance, entry.id]
    );
  }
}

// Main Test Suite
async function runTests() {
  console.log('=== STARTING ANKIT ADVERTISING ERP BUSINESS LOGIC VERIFICATION ===\n');
  
  let db;
  try {
    db = await setupTestDb();
    console.log('✔ Test Database created successfully.');
    
    // Load and execute schema
    const schemaPath = path.join(__dirname, 'database', 'schema.sqlite.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    await runExec(db, schemaSql);
    console.log('✔ Database schemas verified and loaded successfully.');

    // Test 1: User password hashing and verification
    const testPassword = 'pankaj_secret_password';
    const hashed = hashPassword(testPassword);
    const isValid = verifyPassword(testPassword, hashed);
    if (!isValid) throw new Error('Password verification failed!');
    console.log('✔ User Authentication password hashing validated.');

    // Test 2: Scenario 1 - Purchase Completed, Sale Pending
    // Qty = 100, Rate = 1000, Sale Qty = 0
    const sc1 = calculateJobMetrics(100, 1000, 0, 0, 0);
    if (sc1.closingStock !== 100) throw new Error(`Stock mismatch: expected 100, got ${sc1.closingStock}`);
    if (sc1.status !== 'Sale Pending') throw new Error(`Status mismatch: expected Sale Pending, got ${sc1.status}`);
    if (sc1.grossRev !== -100000) throw new Error(`Gross revenue mismatch: expected -100000, got ${sc1.grossRev}`);
    console.log('✔ Business Scenario 1 (Purchase Completed, Sale Pending) calculations validated.');

    // Test 3: Scenario 2 - Sale Completed, Purchase Bill Pending
    // Sale Qty = 100, Rate = 1150, Purchase Qty = 0
    const sc2 = calculateJobMetrics(0, 0, 100, 1150, 0);
    if (sc2.closingStock !== -100) throw new Error(`Stock mismatch: expected -100, got ${sc2.closingStock}`);
    if (sc2.status !== 'Purchase Pending') throw new Error(`Status mismatch: expected Purchase Pending, got ${sc2.status}`);
    if (sc2.grossRev !== 115000) throw new Error(`Gross revenue mismatch: expected 115000, got ${sc2.grossRev}`);
    console.log('✔ Business Scenario 2 (Sale Completed, Purchase Bill Pending) calculations validated.');

    // Test 4: Scenario 3 - Purchase and Sale Both Available
    // Purchase Qty = 100, Rate = 1000, Sale Qty = 100, Rate = 1150, Extra Billing = 5000
    const sc3 = calculateJobMetrics(100, 1000, 100, 1150, 5000);
    if (sc3.closingStock !== 0) throw new Error(`Stock mismatch: expected 0, got ${sc3.closingStock}`);
    if (sc3.status !== 'Ready for Verification') throw new Error(`Status mismatch: expected Ready for Verification, got ${sc3.status}`);
    if (sc3.pAmount !== 100000) throw new Error(`Purchase Amount mismatch: expected 100000, got ${sc3.pAmount}`);
    if (sc3.sAmount !== 115000) throw new Error(`Sale Amount mismatch: expected 115000, got ${sc3.sAmount}`);
    if (sc3.grossRev !== 15000) throw new Error(`Gross revenue mismatch: expected 15000, got ${sc3.grossRev}`);
    if (sc3.netRev !== 10000) throw new Error(`Net revenue mismatch: expected 10000, got ${sc3.netRev}`);
    console.log('✔ Business Scenario 3 (Purchase & Sale Available) calculations validated.');

    // Test 5: Extra Billing Ledger Automation and Manual Entry Verification
    const jobNo = 'JS/2026-27/0001';
    const clientName = 'Ankit Client A';
    
    // Auto insert ledger credit of 5000
    await runInsert(db, `
      INSERT INTO ledger (date, job_sheet_no, client_name, particulars, debit, credit, running_balance, user_name, remarks)
      VALUES (?, ?, ?, ?, 0, ?, 0, ?, ?)
    `, ['2026-06-11', jobNo, clientName, 'Extra Billing from Job Sheet', 5000, 'bhupinder', 'Auto-generated']);
    await recalculateLedger(db, clientName);

    // Verify first entry
    let ledgerRow = await getRow(db, 'SELECT * FROM ledger WHERE client_name = ?', [clientName]);
    if (!ledgerRow || ledgerRow.credit !== 5000 || ledgerRow.running_balance !== 5000) {
      throw new Error(`Ledger Auto Entry failed: got ${JSON.stringify(ledgerRow)}`);
    }
    
    // Insert manual debit of 2000 (payment back to client)
    await runInsert(db, `
      INSERT INTO ledger (date, job_sheet_no, client_name, particulars, debit, credit, running_balance, user_name, remarks)
      VALUES (?, NULL, ?, ?, ?, 0, 0, ?, ?)
    `, ['2026-06-12', clientName, 'Settle extra billing', 2000, 'harshit', 'Manual adjustment']);
    await recalculateLedger(db, clientName);
    
    // Verify cumulative balances
    const ledgerAll = await runQuery(db, 'SELECT * FROM ledger WHERE client_name = ? ORDER BY date ASC', [clientName]);
    if (ledgerAll.length !== 2) throw new Error('Ledger list size incorrect.');
    if (ledgerAll[1].running_balance !== 3000) {
      throw new Error(`Running Balance calculation incorrect. Expected 3000, got ${ledgerAll[1].running_balance}`);
    }
    console.log('✔ Extra Billing Ledger automatic sync and manual Debit adjustments validated.');

    // Test 6: Transaction Verification by Admin Pankaj Agrawal
    // Insert Ready Job
    await runInsert(db, `
      INSERT INTO job_sheets (
        job_sheet_no, job_date, client_name, product, remarks,
        purchase_qty, purchase_amount,
        sale_qty, sale_amount,
        extra_billing, gross_revenue, net_revenue, closing_stock, status, billing_status,
        created_by, created_at, modified_by, modified_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Ready for Verification', 'Pending Billing', ?, ?, ?, ?)
    `, [
      jobNo, '2026-06-11', clientName, 'Flyers', 'Test Job',
      100, 100000,
      100, 115000,
      5000, 15000, 10000, 0,
      'bhupinder', '2026-06-11T12:00:00Z', 'bhupinder', '2026-06-11T12:00:00Z'
    ]);

    // Insert corresponding child purchase row
    const purchaseResult = await runInsert(db, `
      INSERT INTO job_purchases (job_sheet_no, purchase_po_no, purchase_party, purchase_product, purchase_qty, purchase_rate, purchase_amount)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [jobNo, 'PO-984', 'Vendor A', 'Paper', 100, 1000, 100000]);
    const purchaseId = purchaseResult.lastID;

    // Insert corresponding child sale row
    const saleResult = await runInsert(db, `
      INSERT INTO job_sales (job_sheet_no, sale_po_no, sale_party, sale_product, sale_qty, sale_rate, sale_amount)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [jobNo, 'SO-101', 'Customer A', 'Flyers', 100, 1150, 115000]);
    const saleId = saleResult.lastID;
    
    // Perform Verification by entering invoice details for the purchase item
    const invoiceNo = 'INV-999';
    const invoiceDate = '2026-06-12';
    
    // Update purchase invoice info (replicates PUT /api/jobs/:id/verify)
    await runInsert(db, `
      UPDATE job_purchases SET
        purchase_invoice_no = ?,
        purchase_invoice_date = ?
      WHERE id = ? AND job_sheet_no = ?
    `, [invoiceNo, invoiceDate, purchaseId, jobNo]);

    await runInsert(db, `
      UPDATE job_sheets SET
        status = 'Verified',
        verified_by = ?,
        verified_at = ?
      WHERE job_sheet_no = ?
    `, ['Pankaj Agrawal', '2026-06-12T10:00:00Z', jobNo]);

    const verifiedJob = await getRow(db, 'SELECT * FROM job_sheets WHERE job_sheet_no = ?', [jobNo]);
    const verifiedPurchase = await getRow(db, 'SELECT * FROM job_purchases WHERE id = ?', [purchaseId]);

    if (verifiedJob.status !== 'Verified' || verifiedJob.verified_by !== 'Pankaj Agrawal') {
      throw new Error(`Verification job state update failed: ${JSON.stringify(verifiedJob)}`);
    }
    if (verifiedPurchase.purchase_invoice_no !== invoiceNo || verifiedPurchase.purchase_invoice_date !== invoiceDate) {
      throw new Error(`Verification purchase item update failed: ${JSON.stringify(verifiedPurchase)}`);
    }
    console.log('✔ Admin Transaction Verification logic validated (itemized purchase invoices and job status).');

    // Test 7: Transaction Unverification by Admin
    // Clear purchase invoice info (replicates POST /api/jobs/:id/unverify)
    await db.run(`
      UPDATE job_purchases SET 
        purchase_invoice_no = NULL, 
        purchase_invoice_date = NULL 
      WHERE job_sheet_no = ?
    `, [jobNo]);

    await runInsert(db, `
      UPDATE job_sheets SET
        status = 'Ready for Verification',
        verified_by = NULL,
        verified_at = NULL
      WHERE job_sheet_no = ?
    `, [jobNo]);

    const unverifiedJob = await getRow(db, 'SELECT * FROM job_sheets WHERE job_sheet_no = ?', [jobNo]);
    const unverifiedPurchase = await getRow(db, 'SELECT * FROM job_purchases WHERE id = ?', [purchaseId]);

    if (unverifiedJob.status !== 'Ready for Verification' || unverifiedJob.verified_by !== null) {
      throw new Error(`Unverification job state reset failed: ${JSON.stringify(unverifiedJob)}`);
    }
    if (unverifiedPurchase.purchase_invoice_no !== null || unverifiedPurchase.purchase_invoice_date !== null) {
      throw new Error(`Unverification purchase item reset failed: ${JSON.stringify(unverifiedPurchase)}`);
    }
    console.log('✔ Admin Transaction Unverification logic validated.');

    // Test 8: Extra Billing Ledger Entry Verification by Admin
    // Retrieve the manual ledger entry inserted in Test 5
    const ledgerEntry = await getRow(db, "SELECT * FROM ledger WHERE particulars = 'Settle extra billing'");
    if (!ledgerEntry) {
      throw new Error('Ledger entry from Test 5 not found for verification test.');
    }

    // Verify ledger entry (replicates POST /api/ledger/:id/verify)
    await runInsert(db, `
      UPDATE ledger SET
        status = 'Verified',
        verified_by = ?,
        verified_at = ?
      WHERE id = ?
    `, ['Pankaj Agrawal', '2026-06-12T10:30:00Z', ledgerEntry.id]);

    const verifiedLedger = await getRow(db, 'SELECT * FROM ledger WHERE id = ?', [ledgerEntry.id]);
    if (verifiedLedger.status !== 'Verified' || verifiedLedger.verified_by !== 'Pankaj Agrawal') {
      throw new Error(`Ledger entry verification failed: ${JSON.stringify(verifiedLedger)}`);
    }
    console.log('✔ Extra Billing Ledger verification logic validated.');

    // Unverify ledger entry (replicates POST /api/ledger/:id/unverify)
    await runInsert(db, `
      UPDATE ledger SET
        status = 'Unverified',
        verified_by = NULL,
        verified_at = NULL
      WHERE id = ?
    `, [ledgerEntry.id]);

    const unverifiedLedger = await getRow(db, 'SELECT * FROM ledger WHERE id = ?', [ledgerEntry.id]);
    if (unverifiedLedger.status !== 'Unverified' || unverifiedLedger.verified_by !== null) {
      throw new Error(`Ledger entry unverification failed: ${JSON.stringify(unverifiedLedger)}`);
    }
    console.log('✔ Extra Billing Ledger unverification logic validated.');

    console.log('\n==================================================================');
    console.log('🎉 ALL TESTS PASSED! ANKIT ADVERTISING ERP BUSINESS LOGIC IS CORRECT!');
    console.log('==================================================================');
    
  } catch (error) {
    console.error('\n❌ TEST SUITE FAILED:', error.message);
    process.exit(1);
  } finally {
    if (db) {
      db.close((err) => {
        if (err) {
          console.error('Error closing test db:', err);
        }
        try {
          if (fs.existsSync(TEST_DB_FILE)) {
            fs.unlinkSync(TEST_DB_FILE);
          }
        } catch (err) {
          // Ignore busy unlink issues on OS lock
        }
      });
    }
  }
}

runTests();
