const db = require('./db');

/**
 * Recalculates the running balances for a specific client.
 * Running Balance = Cumulative Credits - Cumulative Debits
 * Ordered by date ascending, then ID ascending.
 */
async function recalculateLedger(clientName) {
  if (!clientName) return;
  
  try {
    const entries = await db.query(
      'SELECT id, debit, credit FROM ledger WHERE LOWER(client_name) = LOWER(?) ORDER BY date ASC, id ASC',
      [clientName.trim()]
    );
    
    let runningBalance = 0;
    for (const entry of entries) {
      runningBalance += (entry.credit - entry.debit);
      await db.run(
        'UPDATE ledger SET running_balance = ? WHERE id = ?',
        [runningBalance, entry.id]
      );
    }
    console.log(`Recalculated running balance for client: "${clientName.trim()}" across ${entries.length} entries. Final balance: ₹${runningBalance}`);
  } catch (error) {
    console.error(`Error recalculating ledger for client "${clientName}":`, error);
    throw error;
  }
}

module.exports = { recalculateLedger };
