'use strict';
const express = require('express');
const router  = express.Router();
const db      = require('../db/schema');
const { requireAuth, requireRole } = require('../middleware/auth');
const { formatDate, formatCurrency, todayStr } = require('../utils/helpers');

const guard = [requireAuth, requireRole('student')];

// ── Student Dashboard ─────────────────────────────────────────────────────────
router.get('/', ...guard, (req, res) => {
  const studentId = req.session.user.linked_id;
  const student   = db.prepare(`
    SELECT s.*, c.name as class_name, sec.name as section_name
    FROM students s
    LEFT JOIN classes c ON c.id=s.class_id
    LEFT JOIN sections sec ON sec.id=s.section_id
    WHERE s.id=?
  `).get(studentId);

  if (!student) return res.redirect('/logout');

  // Fee summary
  const feeStructures = db.prepare('SELECT * FROM fee_structures WHERE class_id=? AND is_active=1').all(student.class_id);
  const payments      = db.prepare('SELECT * FROM fee_payments WHERE student_id=?').all(studentId);
  const totalFee  = feeStructures.reduce((s, f) => s + f.amount, 0);
  const totalPaid = payments.reduce((s, p) => s + p.amount_paid, 0);
  const balance   = Math.max(0, totalFee - totalPaid);

  // Attendance summary (current month)
  const month = new Date().toISOString().slice(0, 7);
  const attMonth = db.prepare(`
    SELECT status, COUNT(*) as count FROM attendance
    WHERE student_id=? AND date LIKE ?
    GROUP BY status
  `).all(studentId, `${month}%`);

  const attSummary = { present:0, absent:0, leave:0, late:0 };
  attMonth.forEach(r => { attSummary[r.status] = r.count; });
  const totalDays = attSummary.present + attSummary.absent + attSummary.leave + attSummary.late;
  const percentage = totalDays > 0 ? Math.round((attSummary.present / totalDays) * 100) : 0;

  // Announcements
  const announcements = db.prepare(`
    SELECT * FROM announcements
    WHERE is_active=1 AND target_audience IN ('all','students')
    ORDER BY created_at DESC LIMIT 5
  `).all();

  // Recent payments
  const recentPayments = db.prepare(`
    SELECT fp.*, fs.fee_name FROM fee_payments fp
    LEFT JOIN fee_structures fs ON fs.id=fp.fee_structure_id
    WHERE fp.student_id=? ORDER BY fp.payment_date DESC LIMIT 5
  `).all(studentId);

  res.render('student/dashboard', {
    title: 'My Dashboard',
    student, totalFee, totalPaid, balance,
    attSummary, percentage, announcements, recentPayments,
    formatDate, formatCurrency
  });
});

// ── Student Profile ────────────────────────────────────────────────────────────
router.get('/profile', ...guard, (req, res) => {
  const student = db.prepare(`
    SELECT s.*, c.name as class_name, sec.name as section_name
    FROM students s
    LEFT JOIN classes c ON c.id=s.class_id
    LEFT JOIN sections sec ON sec.id=s.section_id
    WHERE s.id=?
  `).get(req.session.user.linked_id);
  res.render('student/profile', { title: 'My Profile', student, formatDate });
});

// ── Student Fees ───────────────────────────────────────────────────────────────
router.get('/fees', ...guard, (req, res) => {
  const studentId = req.session.user.linked_id;
  const student   = db.prepare(`
    SELECT s.*, c.name as class_name, sec.name as section_name
    FROM students s LEFT JOIN classes c ON c.id=s.class_id
    LEFT JOIN sections sec ON sec.id=s.section_id WHERE s.id=?
  `).get(studentId);

  const feeStructures = db.prepare('SELECT * FROM fee_structures WHERE class_id=? AND is_active=1').all(student.class_id);
  const payments = db.prepare(`
    SELECT fp.*, fs.fee_name FROM fee_payments fp
    LEFT JOIN fee_structures fs ON fs.id=fp.fee_structure_id
    WHERE fp.student_id=? ORDER BY fp.payment_date DESC
  `).all(studentId);

  const totalFee  = feeStructures.reduce((s, f) => s + f.amount, 0);
  const totalPaid = payments.reduce((s, p) => s + p.amount_paid, 0);
  const balance   = Math.max(0, totalFee - totalPaid);

  res.render('student/fees', {
    title: 'My Fees',
    student, feeStructures, payments, totalFee, totalPaid, balance,
    formatDate, formatCurrency
  });
});

// ── Student Attendance ────────────────────────────────────────────────────────
router.get('/attendance', ...guard, (req, res) => {
  const studentId = req.session.user.linked_id;
  const { month = new Date().toISOString().slice(0, 7) } = req.query;

  const attendance = db.prepare(`
    SELECT * FROM attendance WHERE student_id=? AND date LIKE ?
    ORDER BY date
  `).all(studentId, `${month}%`);

  const summary = { present:0, absent:0, leave:0, late:0 };
  attendance.forEach(r => { if (summary[r.status] !== undefined) summary[r.status]++; });
  const totalDays = Object.values(summary).reduce((a,b) => a+b, 0);
  const percentage = totalDays > 0 ? Math.round((summary.present / totalDays) * 100) : 0;

  // Monthly summary for chart (last 6 months)
  const monthlySummary = db.prepare(`
    SELECT strftime('%Y-%m', date) as month,
           SUM(CASE WHEN status='present' THEN 1 ELSE 0 END) as present,
           COUNT(*) as total
    FROM attendance WHERE student_id=?
    GROUP BY month ORDER BY month DESC LIMIT 6
  `).all(studentId).reverse();

  res.render('student/attendance', {
    title: 'My Attendance',
    attendance, summary, percentage, month, monthlySummary, formatDate
  });
});

// ── Student Announcements ─────────────────────────────────────────────────────
router.get('/announcements', ...guard, (req, res) => {
  const announcements = db.prepare(`
    SELECT * FROM announcements
    WHERE is_active=1 AND target_audience IN ('all','students')
    ORDER BY created_at DESC
  `).all();
  res.render('student/announcements', { title: 'Announcements', announcements, formatDate });
});

module.exports = router;
