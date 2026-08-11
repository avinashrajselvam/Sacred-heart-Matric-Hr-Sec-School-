'use strict';
const express = require('express');
const router  = express.Router();
const db      = require('../db/schema');
const { requireAuth, requireRole } = require('../middleware/auth');
const { formatDate, formatCurrency, generateReceiptNumber, todayStr, logActivity } = require('../utils/helpers');
const { generateFeeReceiptPDF } = require('../utils/pdf');

const guard = [requireAuth, requireRole('admin')];

// ── Fee Collection Entry ────────────────────────────────────────────────────
router.get('/collect', ...guard, (req, res) => {
  const { student_id = '' } = req.query;
  const classes  = db.prepare('SELECT * FROM classes ORDER BY display_order').all();
  let student = null, feeStructures = [], payments = [], balance = 0, totalPaid = 0, totalFee = 0;

  if (student_id) {
    student = db.prepare(`
      SELECT s.*, c.name as class_name, sec.name as section_name
      FROM students s
      LEFT JOIN classes c ON c.id=s.class_id
      LEFT JOIN sections sec ON sec.id=s.section_id
      WHERE s.id=?
    `).get(student_id);

    if (student) {
      feeStructures = db.prepare('SELECT * FROM fee_structures WHERE class_id=? AND is_active=1').all(student.class_id);
      payments = db.prepare(`
        SELECT fp.*, fs.fee_name FROM fee_payments fp
        LEFT JOIN fee_structures fs ON fs.id=fp.fee_structure_id
        WHERE fp.student_id=? ORDER BY fp.payment_date DESC
      `).all(student_id);
      totalFee  = feeStructures.reduce((s, f) => s + f.amount, 0);
      totalPaid = payments.reduce((s, p) => s + p.amount_paid, 0);
      balance   = Math.max(0, totalFee - totalPaid);
    }
  }

  res.render('admin/fee-collection', {
    title: 'Fee Collection', classes, student, feeStructures, payments,
    totalFee, totalPaid, balance, student_id,
    today: todayStr(), formatDate, formatCurrency
  });
});

router.post('/collect', ...guard, (req, res) => {
  const { student_id, fee_structure_id, amount_paid, payment_date,
          payment_method, remarks } = req.body;

  if (!student_id || !amount_paid) {
    return res.redirect('/fees/collect?error=Missing+required+fields');
  }

  const receiptNumber = generateReceiptNumber(db);
  db.prepare(`
    INSERT INTO fee_payments
      (student_id,fee_structure_id,amount_paid,payment_date,payment_method,receipt_number,remarks,collected_by)
    VALUES (?,?,?,?,?,?,?,?)
  `).run(
    parseInt(student_id),
    fee_structure_id ? parseInt(fee_structure_id) : null,
    parseFloat(amount_paid),
    payment_date || todayStr(),
    payment_method || 'Cash',
    receiptNumber,
    remarks || null,
    req.session.user.id
  );

  logActivity(db, req.session.user.id, 'FEE_COLLECTED',
    `Collected ₹${amount_paid} from student ID ${student_id} | Receipt: ${receiptNumber}`, req.ip);

  res.redirect(`/fees/receipt/${receiptNumber}?success=1`);
});

// ── Fee Receipt ───────────────────────────────────────────────────────────────
router.get('/receipt/:receiptNo', requireAuth, (req, res) => {
  const payment = db.prepare(`
    SELECT fp.*, u.username as collected_by_name
    FROM fee_payments fp
    LEFT JOIN users u ON u.id=fp.collected_by
    WHERE fp.receipt_number=?
  `).get(req.params.receiptNo);

  if (!payment) return res.redirect('/fees/collect');

  const student = db.prepare(`
    SELECT s.*, c.name as class_name, sec.name as section_name
    FROM students s
    LEFT JOIN classes c ON c.id=s.class_id
    LEFT JOIN sections sec ON sec.id=s.section_id
    WHERE s.id=?
  `).get(payment.student_id);

  const feeStructure = payment.fee_structure_id
    ? db.prepare('SELECT * FROM fee_structures WHERE id=?').get(payment.fee_structure_id)
    : null;

  res.render('fee-receipt', {
    title: `Receipt ${payment.receipt_number}`,
    payment, student, feeStructure,
    success: req.query.success,
    formatDate, formatCurrency,
    layout: false
  });
});

// ── PDF Download ────────────────────────────────────────────────────────────
router.get('/receipt/:receiptNo/pdf', requireAuth, (req, res) => {
  const payment = db.prepare(`
    SELECT fp.*, u.username as collected_by_name
    FROM fee_payments fp
    LEFT JOIN users u ON u.id=fp.collected_by
    WHERE fp.receipt_number=?
  `).get(req.params.receiptNo);

  if (!payment) return res.status(404).send('Receipt not found');

  const student = db.prepare(`
    SELECT s.*, c.name as class_name, sec.name as section_name
    FROM students s
    LEFT JOIN classes c ON c.id=s.class_id
    LEFT JOIN sections sec ON sec.id=s.section_id
    WHERE s.id=?
  `).get(payment.student_id);

  const feeStructure = payment.fee_structure_id
    ? db.prepare('SELECT * FROM fee_structures WHERE id=?').get(payment.fee_structure_id)
    : null;

  generateFeeReceiptPDF(res, {
    student, payment, feeStructure,
    school: {
      name: 'Sacred Heart Matric Hr Sec School',
      address: 'Arakkonam — Phone: 00000 00000'
    }
  });
});

// ── Pending Fees List ─────────────────────────────────────────────────────────
router.get('/pending', ...guard, (req, res) => {
  const { class_id = '' } = req.query;
  const classes = db.prepare('SELECT * FROM classes ORDER BY display_order').all();

  let whereClass = class_id ? 'AND s.class_id=?' : '';
  let params     = class_id ? [class_id] : [];

  const students = db.prepare(`
    SELECT s.id, s.admission_no, s.first_name, s.last_name,
           s.parent_phone, c.name as class_name, sec.name as section_name,
           COALESCE(SUM(fs.amount),0) as total_fee,
           COALESCE((SELECT SUM(fp2.amount_paid) FROM fee_payments fp2 WHERE fp2.student_id=s.id),0) as total_paid
    FROM students s
    LEFT JOIN classes c ON c.id=s.class_id
    LEFT JOIN sections sec ON sec.id=s.section_id
    LEFT JOIN fee_structures fs ON fs.class_id=s.class_id AND fs.is_active=1
    WHERE s.is_active=1 ${whereClass}
    GROUP BY s.id
    HAVING total_fee > total_paid
    ORDER BY (total_fee - total_paid) DESC
  `).all(...params);

  students.forEach(s => { s.balance = s.total_fee - s.total_paid; });

  res.render('admin/pending-fees', {
    title: 'Pending Fees', students, classes, class_id, formatCurrency
  });
});

// ── Payment History (all) ─────────────────────────────────────────────────────
router.get('/history', ...guard, (req, res) => {
  const { search = '', from = '', to = '', page = 1 } = req.query;
  const perPage = 25, offset = (parseInt(page)-1)*perPage;

  let where = ['1=1'], params = [];
  if (search) {
    where.push(`(s.first_name LIKE ? OR s.last_name LIKE ? OR s.admission_no LIKE ? OR fp.receipt_number LIKE ?)`);
    params.push(`%${search}%`,`%${search}%`,`%${search}%`,`%${search}%`);
  }
  if (from) { where.push('fp.payment_date >= ?'); params.push(from); }
  if (to)   { where.push('fp.payment_date <= ?'); params.push(to); }

  const whereStr = 'WHERE ' + where.join(' AND ');
  const total = db.prepare(`
    SELECT COUNT(*) as c FROM fee_payments fp
    JOIN students s ON s.id=fp.student_id ${whereStr}
  `).get(...params).c;

  const payments = db.prepare(`
    SELECT fp.*, s.first_name, s.last_name, s.admission_no,
           c.name as class_name, fs.fee_name
    FROM fee_payments fp
    JOIN students s ON s.id=fp.student_id
    LEFT JOIN classes c ON c.id=s.class_id
    LEFT JOIN fee_structures fs ON fs.id=fp.fee_structure_id
    ${whereStr} ORDER BY fp.payment_date DESC, fp.id DESC
    LIMIT ? OFFSET ?
  `).all(...params, perPage, offset);

  const grandTotal = db.prepare(`
    SELECT COALESCE(SUM(fp.amount_paid),0) as t FROM fee_payments fp
    JOIN students s ON s.id=fp.student_id ${whereStr}
  `).get(...params).t;

  res.render('admin/fee-history', {
    title: 'Payment History', payments, search, from, to,
    total, grandTotal, page: parseInt(page), perPage,
    totalPages: Math.ceil(total/perPage),
    formatDate, formatCurrency
  });
});

module.exports = router;
