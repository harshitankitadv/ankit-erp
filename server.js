const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const { initializeDatabase } = require('./database/init');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

// Mount API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/jobs', require('./routes/jobs'));
app.use('/api/ledger', require('./routes/ledger'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/users', require('./routes/users'));

// Catch-all route to serve the main HTML file for the Single Page Application
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Database initialization then start server
async function startServer() {
  try {
    await initializeDatabase();
    app.listen(PORT, () => {
      console.log(`========================================================`);
      console.log(` ANKIT ADVERTISING ERP IS RUNNING                       `);
      console.log(` Server URL: http://localhost:${PORT}                   `);
      console.log(` Local Time: ${new Date().toLocaleString()}              `);
      console.log(` Database:   ${process.env.DB_TYPE || 'sqlite'}         `);
      console.log(`========================================================`);
    });
  } catch (error) {
    console.error('Fatal: Failed to initialize database and start server.', error);
    process.exit(1);
  }
}

startServer();
