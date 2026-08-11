'use strict';

// ─── Helper Utilities ─────────────────────────────────────────────────────────

/**
 * Format a date string to DD/MM/YYYY (Indian format)
 */
function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString('en-IN', { day:'2-digit', month:'2-digit', year:'numeric' });
}

/**
 * Format a date+time string to DD/MM/YYYY HH:MM
 */
function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleString('en-IN', {
    day:'2-digit', month:'2-digit', year:'numeric',
    hour:'2-digit', minute:'2-digit', hour12:true
  });
}

/**
 * Format a number as Indian Rupee currency
 */
function formatCurrency(amount) {
  if (amount === null || amount === undefined) return '₹0.00';
  return '₹' + Number(amount).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

/**
 * Generate a unique receipt number
 */
function generateReceiptNumber(db) {
  const last = db.prepare(`
    SELECT receipt_number FROM fee_payments
    WHERE receipt_number IS NOT NULL
    ORDER BY id DESC LIMIT 1
  `).get();
  if (!last || !last.receipt_number) return 'RCP000001';
  const num = parseInt(last.receipt_number.replace('RCP','')) + 1;
  return 'RCP' + String(num).padStart(6, '0');
}

/**
 * Generate a unique admission number
 */
function generateAdmissionNumber(db) {
  const last = db.prepare(`
    SELECT admission_no FROM students ORDER BY id DESC LIMIT 1
  `).get();
  if (!last) return 'SH001';
  const num = parseInt(last.admission_no.replace('SH','')) + 1;
  return 'SH' + String(num).padStart(3, '0');
}

/**
 * Generate a unique employee ID
 */
function generateEmployeeId(db) {
  const last = db.prepare(`
    SELECT employee_id FROM staff ORDER BY id DESC LIMIT 1
  `).get();
  if (!last) return 'ST001';
  const num = parseInt(last.employee_id.replace('ST','')) + 1;
  return 'ST' + String(num).padStart(3, '0');
}

/**
 * Paginate an array (or use SQL LIMIT/OFFSET directly for DB queries)
 */
function paginate(items, page = 1, perPage = 20) {
  const total = items.length;
  const totalPages = Math.ceil(total / perPage);
  const start = (page - 1) * perPage;
  const data = items.slice(start, start + perPage);
  return { data, total, totalPages, page, perPage };
}

/**
 * Get current academic year string
 */
function getCurrentAcademicYear() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  if (month >= 6) return `${year}-${String(year + 1).slice(-2)}`;
  return `${year - 1}-${String(year).slice(-2)}`;
}

/**
 * Get today's date as YYYY-MM-DD
 */
function todayStr() {
  return new Date().toISOString().split('T')[0];
}

/**
 * Log an activity to the DB
 */
function logActivity(db, userId, action, details = '', ip = '') {
  try {
    db.prepare(`
      INSERT INTO activity_log (user_id, action, details, ip_address)
      VALUES (?,?,?,?)
    `).run(userId || null, action, details, ip);
  } catch (e) {
    // Non-critical; silently fail
  }
}

module.exports = {
  formatDate,
  formatDateTime,
  formatCurrency,
  generateReceiptNumber,
  generateAdmissionNumber,
  generateEmployeeId,
  paginate,
  getCurrentAcademicYear,
  todayStr,
  logActivity
};
