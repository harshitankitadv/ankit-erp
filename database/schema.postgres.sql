CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL,
  password_hash VARCHAR(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS job_sheets (
  job_sheet_no VARCHAR(50) PRIMARY KEY,
  job_date VARCHAR(100) NOT NULL,
  client_name VARCHAR(255) NOT NULL,
  product VARCHAR(255) NOT NULL,
  remarks TEXT,
  
  -- Cached totals from purchases and sales child tables
  purchase_qty DOUBLE PRECISION DEFAULT 0,
  purchase_amount DOUBLE PRECISION DEFAULT 0,
  
  sale_qty DOUBLE PRECISION DEFAULT 0,
  sale_amount DOUBLE PRECISION DEFAULT 0,
  
  -- Extra Billing
  extra_billing DOUBLE PRECISION DEFAULT 0,
  
  -- Automatically Calculated Fields
  gross_revenue DOUBLE PRECISION DEFAULT 0,
  net_revenue DOUBLE PRECISION DEFAULT 0,
  closing_stock DOUBLE PRECISION DEFAULT 0,
  status VARCHAR(50) NOT NULL DEFAULT 'Draft',
  billing_status VARCHAR(50) NOT NULL DEFAULT 'Pending Billing',
  
  -- Verification Fields
  verified_by VARCHAR(255),
  verified_at VARCHAR(100),
  
  -- Audit Trail Fields
  created_by VARCHAR(255) NOT NULL,
  created_at VARCHAR(100) NOT NULL,
  modified_by VARCHAR(255) NOT NULL,
  modified_at VARCHAR(100) NOT NULL
);

CREATE TABLE IF NOT EXISTS job_purchases (
  id SERIAL PRIMARY KEY,
  job_sheet_no VARCHAR(50) NOT NULL REFERENCES job_sheets (job_sheet_no) ON DELETE CASCADE,
  purchase_po_no VARCHAR(255),
  purchase_party VARCHAR(255),
  purchase_product VARCHAR(255),
  purchase_qty DOUBLE PRECISION DEFAULT 0,
  purchase_rate DOUBLE PRECISION DEFAULT 0,
  purchase_amount DOUBLE PRECISION DEFAULT 0,
  purchase_invoice_no VARCHAR(100),
  purchase_invoice_date VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS job_sales (
  id SERIAL PRIMARY KEY,
  job_sheet_no VARCHAR(50) NOT NULL REFERENCES job_sheets (job_sheet_no) ON DELETE CASCADE,
  sale_po_no VARCHAR(255),
  sale_party VARCHAR(255),
  sale_product VARCHAR(255),
  sale_qty DOUBLE PRECISION DEFAULT 0,
  sale_rate DOUBLE PRECISION DEFAULT 0,
  sale_amount DOUBLE PRECISION DEFAULT 0,
  sale_bill_no VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS ledger (
  id SERIAL PRIMARY KEY,
  date VARCHAR(100) NOT NULL,
  job_sheet_no VARCHAR(50) REFERENCES job_sheets (job_sheet_no) ON DELETE SET NULL,
  client_name VARCHAR(255) NOT NULL,
  particulars VARCHAR(255) NOT NULL,
  debit DOUBLE PRECISION DEFAULT 0,
  credit DOUBLE PRECISION DEFAULT 0,
  running_balance DOUBLE PRECISION DEFAULT 0,
  user_name VARCHAR(255) NOT NULL,
  remarks TEXT,
  status VARCHAR(50) DEFAULT 'Unverified',
  verified_by VARCHAR(255),
  verified_at VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  job_sheet_no VARCHAR(50) NOT NULL,
  action VARCHAR(50) NOT NULL,
  performed_by VARCHAR(255) NOT NULL,
  timestamp VARCHAR(100) NOT NULL,
  changes TEXT
);
