const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { recalculateLedger } = require('../database/ledgerHelper');

// @route   GET /api/ledger/clients
// @desc    Get list of unique clients with ledger entries
router.get('/clients', authenticateToken, async (req, res) => {
  try {
    const clients = await db.query(
      'SELECT DISTINCT client_name FROM ledger ORDER BY client_name ASC'
    );
    res.json(clients.map(c => c.client_name));
  } catch (error) {
    console.error('Error fetching ledger clients:', error);
    res.status(500).json({ message: 'Error retrieving ledger clients.' });
  }
});

// @route   GET /api/ledger
// @desc    Get all ledger entries with filters (date range, client)
router.get('/', authenticateToken, async (req, res) => {
  const { client, start_date, end_date } = req.query;
  let sql = 'SELECT * FROM ledger WHERE 1=1';
  const params = [];

  if (client) {
    sql += ' AND LOWER(client_name) = LOWER(?)';
    params.push(client.trim());
  }

  if (start_date) {
    sql += ' AND date >= ?';
    params.push(start_date);
  }

  if (end_date) {
    sql += ' AND date <= ?';
    params.push(end_date);
  }

  // Ordered by client_name first, then date, then id (since running balance is client-wise!)
  sql += ' ORDER BY client_name ASC, date ASC, id ASC';

  try {
    const entries = await db.query(sql, params);
    res.json(entries);
  } catch (error) {
    console.error('Error fetching ledger:', error);
    res.status(500).json({ message: 'Error retrieving Extra Billing Ledger.' });
  }
});

// @route   POST /api/ledger
// @desc    Add a manual debit or credit ledger entry
router.post('/', authenticateToken, async (req, res) => {
  const { date, client_name, particulars, debit, credit, remarks } = req.body;

  if (!date || !client_name || !particulars) {
    return res.status(400).json({ message: 'Date, Client Name, and Particulars are required.' });
  }

  const deb = parseFloat(debit) || 0;
  const cred = parseFloat(credit) || 0;

  if (deb === 0 && cred === 0) {
    return res.status(400).json({ message: 'Either Debit or Credit amount must be greater than 0.' });
  }

  try {
    await db.run(`
      INSERT INTO ledger (date, job_sheet_no, client_name, particulars, debit, credit, user_name, remarks)
      VALUES (?, NULL, ?, ?, ?, ?, ?, ?)
    `, [
      date,
      client_name.trim(),
      particulars.trim(),
      deb,
      cred,
      req.user.name,
      remarks || ''
    ]);

    // Recalculate running balance client-wise
    await recalculateLedger(client_name);

    res.status(201).json({ message: 'Ledger entry added successfully.' });
  } catch (error) {
    console.error('Error adding ledger entry:', error);
    res.status(500).json({ message: 'Server error adding ledger entry.' });
  }
});

// @route   POST /api/ledger/:id/verify
// @desc    Verify a ledger entry (Admin only)
router.post('/:id/verify', authenticateToken, requireRole(['admin']), async (req, res) => {
  const ledgerId = req.params.id;
  const timestamp = new Date().toISOString();
  try {
    const entry = await db.get('SELECT * FROM ledger WHERE id = ?', [ledgerId]);
    if (!entry) {
      return res.status(404).json({ message: 'Ledger entry not found.' });
    }
    await db.run(
      "UPDATE ledger SET status = 'Verified', verified_by = ?, verified_at = ? WHERE id = ?",
      [req.user.name, timestamp, ledgerId]
    );
    res.json({ message: 'Ledger entry verified successfully by Admin.' });
  } catch (error) {
    console.error('Error verifying ledger entry:', error);
    res.status(500).json({ message: 'Server error verifying ledger entry.' });
  }
});

// @route   POST /api/ledger/:id/unverify
// @desc    Unverify a ledger entry (Admin only)
router.post('/:id/unverify', authenticateToken, requireRole(['admin']), async (req, res) => {
  const ledgerId = req.params.id;
  try {
    const entry = await db.get('SELECT * FROM ledger WHERE id = ?', [ledgerId]);
    if (!entry) {
      return res.status(404).json({ message: 'Ledger entry not found.' });
    }
    await db.run(
      "UPDATE ledger SET status = 'Unverified', verified_by = NULL, verified_at = NULL WHERE id = ?",
      [ledgerId]
    );
    res.json({ message: 'Ledger entry unverified successfully.' });
  } catch (error) {
    console.error('Error unverifying ledger entry:', error);
    res.status(500).json({ message: 'Server error unverifying ledger entry.' });
  }
});

module.exports = router;
