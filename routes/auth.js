const express = require('express');
const router = express.Router();
const db = require('../database/db');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { authenticateToken } = require('../middleware/auth');

const JWT_SECRET = process.env.JWT_SECRET || 'ankit_advertising_super_secret_key_2026';

function verifyPassword(password, storedPassword) {
  try {
    const [salt, originalHash] = storedPassword.split(':');
    const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
    return hash === originalHash;
  } catch (err) {
    return false;
  }
}

// @route   POST /api/auth/login
// @desc    Authenticate user and get token
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Please enter username and password.' });
  }

  try {
    // Case-insensitive username check
    const user = await db.get('SELECT * FROM users WHERE LOWER(username) = LOWER(?)', [username]);

    if (!user) {
      return res.status(400).json({ message: 'Invalid username or password.' });
    }

    const isMatch = verifyPassword(password, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid username or password.' });
    }

    // Sign JWT Token
    const payload = {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role
    };

    jwt.sign(
      payload,
      JWT_SECRET,
      { expiresIn: '8h' }, // Token valid for 8 hours
      (err, token) => {
        if (err) throw err;
        res.json({
          token,
          user: {
            id: user.id,
            username: user.username,
            name: user.name,
            role: user.role
          }
        });
      }
    );
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during authentication.' });
  }
});

// @route   GET /api/auth/me
// @desc    Get current user profile from token
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await db.get('SELECT id, username, name, role FROM users WHERE id = ?', [req.user.id]);
    if (!user) {
      return res.status(404).json({ message: 'User profile not found.' });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Server error retrieving profile.' });
  }
});

module.exports = router;
