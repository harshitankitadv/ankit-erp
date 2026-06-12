const fs = require('fs');
const path = require('path');
const db = require('./db');
const crypto = require('crypto');

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

async function initializeDatabase() {
  try {
    console.log('Initializing database schema...');
    
    // Load schema file based on database type
    let schemaFile = '';
    if (db.type === 'sqlite') {
      schemaFile = path.join(__dirname, 'schema.sqlite.sql');
    } else {
      schemaFile = path.join(__dirname, 'schema.mysql.sql');
    }
    
    const schemaSql = fs.readFileSync(schemaFile, 'utf8');
    await db.exec(schemaSql);
    console.log('Database tables verified/created successfully.');

    // Seed default users if users table is empty
    const usersCount = await db.get('SELECT COUNT(*) as count FROM users');
    if (usersCount && usersCount.count === 0) {
      console.log('Seeding default users...');
      
      const seedUsers = [
        {
          username: 'bhupinder',
          name: 'Bhupinder Sharma',
          role: 'operations',
          password: 'bhupinder123'
        },
        {
          username: 'harshit',
          name: 'Harshit Jain',
          role: 'accounts',
          password: 'harshit123'
        },
        {
          username: 'pankaj',
          name: 'Pankaj Agrawal',
          role: 'admin',
          password: 'pankaj123'
        }
      ];

      for (const u of seedUsers) {
        const passwordHash = hashPassword(u.password);
        await db.run(
          'INSERT INTO users (username, name, role, password_hash) VALUES (?, ?, ?, ?)',
          [u.username, u.name, u.role, passwordHash]
        );
      }
      
      console.log('Seed users created successfully!');
    }
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  }
}

module.exports = { initializeDatabase, hashPassword };
