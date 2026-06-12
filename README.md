# Ankit Advertising ERP Platform

Ankit Advertising ERP is a professional, mobile-friendly, web-based platform tailored for advertising office workflow operations, transaction verification, client profitability calculations, and stock control. 

Every purchase, sale, revenue adjustment, stock count, and verification is bound to a single unique **Job Sheet Number** (`JS/YYYY-YY/0001` format) as the master record.

---

## Technical Architecture

- **Backend:** Node.js, Express, `jsonwebtoken`, and database-specific drivers.
- **Database:** Dual-engine architecture supporting both **SQLite** (out-of-the-box local development, file-based database) and **MySQL** (enterprise deployment) selected dynamically via the environment settings.
- **Frontend:** Single Page Application (SPA) utilizing HTML5, modern ES6+ Javascript, and Vanilla CSS with variables, transitions, and print stylesheets. Includes CDN libraries:
  - **Chart.js** for interactive analytics.
  - **SheetJS (XLSX)** for client-side Excel exports.
  - **html2pdf.js** for client-side PDF exports.

---

## Quick Start & Running Locally

### 1. Prerequisites
Make sure [Node.js](https://nodejs.org) is installed on your system.

### 2. Startup Server
Run the following commands inside the project directory:
```powershell
# Run the application (this automatically creates and initializes the sqlite file)
npm run dev
```

The application will start, initialize the database tables, seed the default user accounts, and list the active URL:
👉 **URL:** `http://localhost:3000`

---

## Seeding Default Users & Access Credentials

To allow instant testing, the platform pre-seeds three default users with different roles:

| User Name | Username | Role / Permissions | Default Password |
| :--- | :--- | :--- | :--- |
| **Bhupinder Sharma** | `bhupinder` | **Operations:** Create/Edit jobs, enter purchases/sales, view all ledger records, reports, and dashboards. Cannot verify. | `bhupinder123` |
| **Harshit Jain** | `harshit` | **Accounts:** Create/Edit jobs, enter purchases/sales, view all ledger records, reports, and dashboards. Cannot verify. | `harshit123` |
| **Pankaj Agrawal** | `pankaj` | **Admin / Verifier:** Full system access, User Management panel, enter Purchase Invoice details, Verify/Unverify transactions. | `pankaj123` |

*Passwords can be modified or new users added by Pankaj Agrawal from the **User Management** tab.*

---

## Database Configuration Toggles

By default, the server runs with SQLite using a local file named `ankit_erp.db` inside the project root. To switch to a production **MySQL** server:

1. Open the `.env` file in the root of the project.
2. Edit the configurations:
   ```ini
   DB_TYPE=mysql
   DB_HOST=your_mysql_host       # e.g., localhost
   DB_USER=your_mysql_username   # e.g., root
   DB_PASSWORD=your_password     # e.g., secret
   DB_NAME=ankit_erp             # The database schema name
   ```
3. Restart the Node server. It will automatically detect the driver switch, create the MySQL tables, and seed the default users into the MySQL database.

---

## Verification Test Suite

You can execute the automated test suite to verify the business calculations, status flows, and ledger rules:
```bash
node verify_logic.js
```
This tests all scenarios (Sale Pending, Purchase Pending, Ready for Verification, calculations, ledger entries, and admin verifications) and prints the status results.
