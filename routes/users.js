const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { hashPassword } = require('../database/init');
const { authenticateToken, requireRole } = require('../middleware/auth');

// Protect all user routes for Admins only
router.use(authenticateToken, requireRole(['admin']));

// @route   GET /api/users
// @desc    Get all users
router.get('/', async (req, res) => {
  try {
    const users = await db.query('SELECT id, username, name, role FROM users ORDER BY id ASC');
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: 'Server error retrieving users.' });
  }
});

// @route   POST /api/users
// @desc    Create a new user
router.post('/', async (req, res) => {
  const { username, name, role, password } = req.body;

  if (!username || !name || !role || !password) {
    return res.status(400).json({ message: 'Please provide all required fields.' });
  }

  try {
    const existing = await db.get('SELECT id FROM users WHERE LOWER(username) = LOWER(?)', [username]);
    if (existing) {
      return res.status(400).json({ message: 'Username already exists.' });
    }

    const passwordHash = hashPassword(password);
    await db.run(
      'INSERT INTO users (username, name, role, password_hash) VALUES (?, ?, ?, ?)',
      [username.trim(), name.trim(), role, passwordHash]
    );

    res.status(201).json({ message: 'User created successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error creating user.' });
  }
});

// @route   PUT /api/users/:id
// @desc    Update a user
router.put('/:id', async (req, res) => {
  const { name, role, password } = req.body;
  const userId = req.params.id;

  if (!name || !role) {
    return res.status(400).json({ message: 'Please provide name and role.' });
  }

  try {
    const user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    if (password && password.trim().length > 0) {
      const passwordHash = hashPassword(password);
      await db.run(
        'UPDATE users SET name = ?, role = ?, password_hash = ? WHERE id = ?',
        [name.trim(), role, passwordHash, userId]
      );
    } else {
      await db.run(
        'UPDATE users SET name = ?, role = ? WHERE id = ?',
        [name.trim(), role, userId]
      );
    }

    res.json({ message: 'User updated successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error updating user.' });
  }
});

// @route   DELETE /api/users/:id
// @desc    Delete a user
router.delete('/:id', async (req, res) => {
  const userId = req.params.id;

  if (parseInt(userId) === req.user.id) {
    return res.status(400).json({ message: 'You cannot delete your own admin account.' });
  }

  try {
    const user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    await db.run('DELETE FROM users WHERE id = ?', [userId]);
    res.json({ message: 'User deleted successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error deleting user.' });
  }
});

module.exports = router;
