const path = require('path');
const fs = require('fs');
require('dotenv').config();

let dbInstance = null;
const dbType = process.env.DB_TYPE || 'sqlite';

if (dbType === 'sqlite') {
  const sqlite3 = require('sqlite3').verbose();
  const dbFile = path.resolve(__dirname, '..', process.env.DB_FILE || 'ankit_erp.db');
  
  // Ensure database directory exists
  const dbDir = path.dirname(dbFile);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const sqliteDb = new sqlite3.Database(dbFile, (err) => {
    if (err) {
      console.error('Error opening SQLite database:', err.message);
    } else {
      console.log(`Connected to SQLite database at ${dbFile}`);
    }
  });

  // Enable foreign keys
  sqliteDb.run('PRAGMA foreign_keys = ON');

  dbInstance = {
    type: 'sqlite',
    sqliteDb,
    query(sql, params = []) {
      return new Promise((resolve, reject) => {
        sqliteDb.all(sql, params, (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
    },
    get(sql, params = []) {
      return new Promise((resolve, reject) => {
        sqliteDb.get(sql, params, (err, row) => {
          if (err) reject(err);
          else resolve(row || null);
        });
      });
    },
    run(sql, params = []) {
      return new Promise((resolve, reject) => {
        sqliteDb.run(sql, params, function(err) {
          if (err) reject(err);
          else resolve({ lastID: this.lastID, changes: this.changes });
        });
      });
    },
    // Run multiple queries sequentially (useful for migrations/seeds)
    async exec(sql) {
      return new Promise((resolve, reject) => {
        sqliteDb.exec(sql, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
  };
} else if (dbType === 'postgres') {
  const { Pool } = require('pg');
  const connectionString = process.env.DATABASE_URL;

  const pool = new Pool({
    connectionString,
    ssl: {
      rejectUnauthorized: false
    }
  });

  console.log('Connected to PostgreSQL database');

  function convertSql(sql) {
    let index = 1;
    return sql.replace(/\?/g, () => `$${index++}`);
  }

  dbInstance = {
    type: 'postgres',
    pool,
    async query(sql, params = []) {
      const pgSql = convertSql(sql);
      const { rows } = await pool.query(pgSql, params);
      return rows;
    },
    async get(sql, params = []) {
      const pgSql = convertSql(sql);
      const { rows } = await pool.query(pgSql, params);
      return rows.length > 0 ? rows[0] : null;
    },
    async run(sql, params = []) {
      const pgSql = convertSql(sql);
      const result = await pool.query(pgSql, params);
      return {
        lastID: null,
        changes: result.rowCount
      };
    },
    async exec(sql) {
      const statements = sql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0);
      
      for (const statement of statements) {
        const pgSql = convertSql(statement);
        await pool.query(pgSql);
      }
    }
  };
} else if (dbType === 'mysql') {
  const mysql = require('mysql2/promise');
  
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'ankit_erp',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });

  console.log(`Initializing MySQL Connection Pool for database: ${process.env.DB_NAME}`);

  dbInstance = {
    type: 'mysql',
    pool,
    async query(sql, params = []) {
      const [rows] = await pool.execute(sql, params);
      return rows;
    },
    async get(sql, params = []) {
      const [rows] = await pool.execute(sql, params);
      return rows.length > 0 ? rows[0] : null;
    },
    async run(sql, params = []) {
      const [result] = await pool.execute(sql, params);
      return {
        lastID: result.insertId,
        changes: result.affectedRows
      };
    },
    async exec(sql) {
      // Execute multi-statement scripts for MySQL
      // Since prepared statements in execute() don't support multi-statements,
      // we split by semicolon and run them one by one.
      const statements = sql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0);
      
      for (const statement of statements) {
        await pool.query(statement);
      }
    }
  };
} else {
  throw new Error(`Unsupported database type: ${dbType}`);
}

module.exports = dbInstance;
