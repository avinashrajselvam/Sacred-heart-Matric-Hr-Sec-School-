'use strict';
require('dotenv').config();
const express        = require('express');
const session        = require('express-session');
const methodOverride = require('method-override');
const path           = require('path');
const db             = require('./db/schema');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Custom SQLite Session Store using better-sqlite3 ──────────────────────────
class SQLiteSessionStore extends session.Store {
  constructor(database) {
    super();
    this.db = database;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        sid TEXT PRIMARY KEY,
        sess TEXT NOT NULL,
        expired INTEGER NOT NULL
      )
    `);
  }
  get(sid, cb) {
    try {
      const now = Date.now();
      const row = this.db.prepare("SELECT sess FROM sessions WHERE sid=? AND expired > ?").get(sid, now);
      cb(null, row ? JSON.parse(row.sess) : null);
    } catch (e) { cb(e); }
  }
  set(sid, sess, cb) {
    try {
      const maxAge = (sess.cookie && sess.cookie.maxAge) || 8 * 3600 * 1000;
      const expired = Date.now() + maxAge;
      this.db.prepare(`
        INSERT INTO sessions (sid, sess, expired) VALUES (?, ?, ?)
        ON CONFLICT(sid) DO UPDATE SET sess=excluded.sess, expired=excluded.expired
      `).run(sid, JSON.stringify(sess), expired);
      if (cb) cb(null);
    } catch (e) { if (cb) cb(e); }
  }
  touch(sid, sess, cb) {
    try {
      const maxAge = (sess.cookie && sess.cookie.maxAge) || 8 * 3600 * 1000;
      const expired = Date.now() + maxAge;
      this.db.prepare("UPDATE sessions SET expired=? WHERE sid=?").run(expired, sid);
      if (cb) cb(null);
    } catch (e) { if (cb) cb(e); }
  }
  destroy(sid, cb) {
    try {
      this.db.prepare("DELETE FROM sessions WHERE sid=?").run(sid);
      if (cb) cb(null);
    } catch (e) { if (cb) cb(e); }
  }
}

// ── View Engine ───────────────────────────────────────────────────────────────
const ejsLayouts = require('express-ejs-layouts');
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(ejsLayouts);
app.set('layout', 'layout');
app.set('layout extractScripts', true);
app.set('layout extractStyles', true);

// ── Static Files ──────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── Body Parsing ──────────────────────────────────────────────────────────────
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.json({ limit: '10mb' }));
app.use(methodOverride('_method'));

// ── Session ───────────────────────────────────────────────────────────────────
app.use(session({
  store: new SQLiteSessionStore(db),
  secret: process.env.SESSION_SECRET || 'sacred_heart_secret_2024',
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    maxAge: 8 * 60 * 60 * 1000,  // 8 hours
    httpOnly: true,
    sameSite: 'lax'
  }
}));

// ── Global Middleware ─────────────────────────────────────────────────────────
const { injectUser } = require('./middleware/auth');
app.use(injectUser);

// Flash message helper (simple, no separate package)
app.use((req, res, next) => {
  res.locals.flash = req.query.success
    ? { type: 'success', message: req.query.success }
    : req.query.error
      ? { type: 'error', message: req.query.error }
      : null;
  res.locals.schoolName = 'Sacred Heart Matric Hr Sec School';
  next();
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/',         require('./routes/auth'));
app.use('/admin',    require('./routes/admin'));
app.use('/student',  require('./routes/student'));
app.use('/staff',    require('./routes/staff'));
app.use('/fees',     require('./routes/fees'));
app.use('/api',      require('./routes/api'));

// Root redirect
app.get('/', (req, res) => {
  if (req.session && req.session.user) {
    return res.redirect('/' + req.session.user.role);
  }
  res.redirect('/login');
});

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).render('404', { title: 'Page Not Found' });
});

// ── Error Handler ─────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Server Error:', err.stack);
  res.status(500).render('error', {
    title: 'Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'An unexpected error occurred.',
    user: req.session ? req.session.user : null
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║   Sacred Heart Matric Hr Sec School — CRM System     ║');
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log(`║   Server running at: http://localhost:${PORT}           ║`);
  console.log('║   Admin login:  admin / admin123                      ║');
  console.log('║   Staff login:  mary.joseph / staff123                ║');
  console.log('║   Student login: sh001 / student123                   ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');
});

module.exports = app;
