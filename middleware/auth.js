'use strict';

// ─── Auth Middleware ──────────────────────────────────────────────────────────

/**
 * Require authenticated session; redirect to login if not authenticated.
 */
function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) {
    if (req.session) req.session.returnTo = req.originalUrl;
    return res.redirect('/login');
  }
  next();
}

/**
 * Require a specific role (or array of roles).
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session || !req.session.user) {
      return res.redirect('/login');
    }
    if (!roles.includes(req.session.user.role)) {
      return res.status(403).render('error', {
        title: 'Access Denied',
        message: 'You do not have permission to access this page.',
        user: req.session.user
      });
    }
    next();
  };
}

/**
 * Inject user into all views via res.locals.
 */
function injectUser(req, res, next) {
  res.locals.user = req.session ? req.session.user : null;
  res.locals.currentPath = req.path;
  next();
}

module.exports = { requireAuth, requireRole, injectUser };
