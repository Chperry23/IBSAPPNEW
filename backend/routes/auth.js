const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const path = require('path');
const db = require('../config/database');

// Determine if running as packaged executable (needed for path resolution if used in routes)
const isPackaged = typeof process.pkg !== 'undefined';
const basePath = isPackaged ? path.dirname(process.execPath) : path.resolve(__dirname, '../..');

// Login page - served as static file usually, but here as a route redirection
router.get('/', (req, res) => {
  if (req.session && req.session.userId) {
    res.redirect('/dashboard');
  } else {
    // Assuming frontend files are served statically from frontend/public
    res.sendFile(path.join(basePath, 'frontend/public', 'login.html'));
  }
});

// Login endpoint
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  
  try {
    const user = await db.prepare('SELECT * FROM users WHERE username = ?').get([username]);
    
    if (!user || !user.password_hash) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    req.session.userId = user.id;
    req.session.username = user.username;
    res.json({ success: true, message: 'Login successful' });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Register endpoint
router.post('/register', async (req, res) => {
  const { username, password, email } = req.body;
  
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long' });
  }
  
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    db.run('INSERT INTO users (username, password_hash, email) VALUES (?, ?, ?)', 
      [username, hashedPassword, email], 
      function(err) {
        if (err) {
          if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return res.status(400).json({ error: 'Username already exists' });
          }
          console.error('Registration error:', err);
          return res.status(500).json({ error: 'Server error' });
        }
        
        req.session.userId = this.lastID;
    req.session.username = username;
    res.json({ success: true, message: 'Registration successful' });
      });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Logout endpoint
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Could not log out' });
    }
    res.json({ success: true, message: 'Logout successful' });
  });
});

module.exports = router;

