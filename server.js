'use strict';
require('dotenv').config();
const express        = require('express');
const cookieSession  = require('cookie-session');
const methodOverride = require('method-override');
const path           = require('path');
const db             = require('./db/schema');

const app = express();
const PORT = process.env.PORT || 3000;

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

// ── Session (Stateless Signed Cookie Session for Serverless / Vercel Compatibility) ──
app.use(cookieSession({
  name: 'sh_crm_session',
  keys: [process.env.SESSION_SECRET || 'sacred_heart_secret_key_2024_arakkonam'],
  maxAge: 24 * 60 * 60 * 1000, // 24 hours
  sameSite: 'lax',
  httpOnly: true
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
