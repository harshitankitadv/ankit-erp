CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL,
  password_hash VARCHAR(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS job_sheets (
  job_sheet_no VARCHAR(50) PRIMARY KEY,
  job_date DATE NOT NULL,
  client_name VARCHAR(255) NOT NULL,
  product VARCHAR(255) NOT NULL,
  remarks TEXT,
  
  -- Cached totals from purchases and sales child tables
  purchase_qty DOUBLE DEFAULT 0,
  purchase_amount DOUBLE DEFAULT 0,
  
  sale_qty DOUBLE DEFAULT 0,
  sale_amount DOUBLE DEFAULT 0,
  
  -- Extra Billing
  extra_billing DOUBLE DEFAULT 0,
  
  -- Automatically Calculated Fields
  gross_revenue DOUBLE DEFAULT 0,
  net_revenue DOUBLE DEFAULT 0,
  closing_stock DOUBLE DEFAULT 0,
  status VARCHAR(50) NOT NULL DEFAULT 'Draft',
  billing_status VARCHAR(50) NOT NULL DEFAULT 'Pending Billing',
  
  -- Verification Fields
  verified_by VARCHAR(255),
  verified_at DATETIME,
  
  -- Audit Trail Fields
  created_by VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL,
  modified_by VARCHAR(255) NOT NULL,
  modified_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS job_purchases (
  id INT AUTO_INCREMENT PRIMARY KEY,
  job_sheet_no VARCHAR(50) NOT NULL,
  purchase_po_no VARCHAR(255),
  purchase_party VARCHAR(255),
  purchase_product VARCHAR(255),
  purchase_qty DOUBLE DEFAULT 0,
  purchase_rate DOUBLE DEFAULT 0,
  purchase_amount DOUBLE DEFAULT 0,
  purchase_invoice_no VARCHAR(100),
  purchase_invoice_date DATE,
  FOREIGN KEY (job_sheet_no) REFERENCES job_sheets (job_sheet_no) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS job_sales (
  id INT AUTO_INCREMENT PRIMARY KEY,
  job_sheet_no VARCHAR(50) NOT NULL,
  sale_po_no VARCHAR(255),
  sale_party VARCHAR(255),
  sale_product VARCHAR(255),
  sale_qty DOUBLE DEFAULT 0,
  sale_rate DOUBLE DEFAULT 0,
  sale_amount DOUBLE DEFAULT 0,
  sale_bill_no VARCHAR(100),
  FOREIGN KEY (job_sheet_no) REFERENCES job_sheets (job_sheet_no) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ledger (
  id INT AUTO_INCREMENT PRIMARY KEY,
  date DATE NOT NULL,
  job_sheet_no VARCHAR(50),
  client_name VARCHAR(255) NOT NULL,
  particulars VARCHAR(255) NOT NULL,
  debit DOUBLE DEFAULT 0,
  credit DOUBLE DEFAULT 0,
  running_balance DOUBLE DEFAULT 0,
  user_name VARCHAR(255) NOT NULL,
  remarks TEXT,
  status VARCHAR(50) DEFAULT 'Unverified',
  verified_by VARCHAR(255),
  verified_at DATETIME,
  FOREIGN KEY (job_sheet_no) REFERENCES job_sheets (job_sheet_no) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS audit_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  job_sheet_no VARCHAR(50) NOT NULL,
  action VARCHAR(50) NOT NULL,
  performed_by VARCHAR(255) NOT NULL,
  timestamp DATETIME NOT NULL,
  changes TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
