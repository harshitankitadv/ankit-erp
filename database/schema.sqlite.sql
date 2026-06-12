CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  password_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS job_sheets (
  job_sheet_no TEXT PRIMARY KEY,
  job_date TEXT NOT NULL,
  client_name TEXT NOT NULL,
  product TEXT NOT NULL,
  remarks TEXT,
  
  -- Cached totals from purchases and sales child tables
  purchase_qty REAL DEFAULT 0,
  purchase_amount REAL DEFAULT 0,
  
  sale_qty REAL DEFAULT 0,
  sale_amount REAL DEFAULT 0,
  
  -- Extra Billing
  extra_billing REAL DEFAULT 0,
  
  -- Automatically Calculated Fields
  gross_revenue REAL DEFAULT 0,
  net_revenue REAL DEFAULT 0,
  closing_stock REAL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Draft',
  billing_status TEXT NOT NULL DEFAULT 'Pending Billing',
  
  -- Verification Fields
  verified_by TEXT,
  verified_at TEXT,
  
  -- Audit Trail Fields
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  modified_by TEXT NOT NULL,
  modified_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS job_purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_sheet_no TEXT NOT NULL,
  purchase_po_no TEXT,
  purchase_party TEXT,
  purchase_product TEXT,
  purchase_qty REAL DEFAULT 0,
  purchase_rate REAL DEFAULT 0,
  purchase_amount REAL DEFAULT 0,
  purchase_invoice_no TEXT,
  purchase_invoice_date TEXT,
  FOREIGN KEY (job_sheet_no) REFERENCES job_sheets (job_sheet_no) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS job_sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_sheet_no TEXT NOT NULL,
  sale_po_no TEXT,
  sale_party TEXT,
  sale_product TEXT,
  sale_qty REAL DEFAULT 0,
  sale_rate REAL DEFAULT 0,
  sale_amount REAL DEFAULT 0,
  sale_bill_no TEXT,
  FOREIGN KEY (job_sheet_no) REFERENCES job_sheets (job_sheet_no) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  job_sheet_no TEXT,
  client_name TEXT NOT NULL,
  particulars TEXT NOT NULL,
  debit REAL DEFAULT 0,
  credit REAL DEFAULT 0,
  running_balance REAL DEFAULT 0,
  user_name TEXT NOT NULL,
  remarks TEXT,
  status TEXT DEFAULT 'Unverified',
  verified_by TEXT,
  verified_at TEXT,
  FOREIGN KEY (job_sheet_no) REFERENCES job_sheets (job_sheet_no) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_sheet_no TEXT NOT NULL,
  action TEXT NOT NULL,
  performed_by TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  changes TEXT
);
