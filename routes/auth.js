'use strict';
const express = require('express');
const bcrypt  = require('bcryptjs');
const router  = express.Router();
const db      = require('../db/schema');
const { logActivity } = require('../utils/helpers');

// GET /login
router.get('/login', (req, res) => {
  if (req.session && req.session.user) {
    return res.redirect('/' + req.session.user.role);
  }
  res.render('auth/login', { title: 'Login', error: null, layout: false });
});

// POST /login
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.render('auth/login', { title: 'Login', error: 'Please enter username and password.', layout: false });
  }

  const user = db.prepare('SELECT * FROM users WHERE username=? AND is_active=1').get(username.trim().toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.render('auth/login', { title: 'Login', error: 'Invalid username or password.', layout: false });
  }

  // Fetch linked profile name
  let displayName = username;
  let profileData = {};
  if (user.role === 'student') {
    const s = db.prepare('SELECT first_name, last_name, class_id, section_id FROM students WHERE id=?').get(user.linked_id);
    if (s) { displayName = `${s.first_name} ${s.last_name}`; profileData = s; }
  } else if (user.role === 'staff') {
    const s = db.prepare('SELECT first_name, last_name FROM staff WHERE id=?').get(user.linked_id);
    if (s) { displayName = `${s.first_name} ${s.last_name}`; profileData = s; }
  } else {
    displayName = 'Administrator';
  }

  req.session.user = {
    id: user.id,
    username: user.username,
    role: user.role,
    linked_id: user.linked_id,
    displayName,
    ...profileData
  };

  // Update last login
  db.prepare('UPDATE users SET last_login=CURRENT_TIMESTAMP WHERE id=?').run(user.id);
  logActivity(db, user.id, 'LOGIN', `User logged in as ${user.role}`, req.ip);

  const returnTo = req.session.returnTo || '/' + user.role;
  delete req.session.returnTo;
  res.redirect(returnTo);
});

// GET /logout
router.get('/logout', (req, res) => {
  if (req.session && req.session.user) {
    logActivity(db, req.session.user.id, 'LOGOUT', 'User logged out', req.ip);
  }
  req.session.destroy(() => res.redirect('/login'));
});

module.exports = router;
