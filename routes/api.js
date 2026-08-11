'use strict';
const express = require('express');
const router  = express.Router();
const db      = require('../db/schema');
const { requireAuth, requireRole } = require('../middleware/auth');
const { logActivity, todayStr } = require('../utils/helpers');

// ── School Location (Arakkonam) ───────────────────────────────────────────────
const SCHOOL_LAT = 13.083268;
const SCHOOL_LNG = 79.666565;
const MAX_RADIUS_M = 500; // 500 metres radius around Sacred Heart School, Arakkonam

/**
 * Haversine formula — distance between two GPS points in metres
 */
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000; // Earth radius in metres
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Staff Attendance — Login ──────────────────────────────────────────────────
router.post('/staff-attendance/login', requireAuth, requireRole('staff'), (req, res) => {
  const { lat, lng } = req.body;
  if (lat == null || lng == null) {
    return res.status(400).json({ ok: false, error: 'Location coordinates are required.' });
  }
  const parsedLat = parseFloat(lat);
  const parsedLng = parseFloat(lng);
  const dist = haversineDistance(SCHOOL_LAT, SCHOOL_LNG, parsedLat, parsedLng);

  if (dist > MAX_RADIUS_M) {
    return res.status(403).json({
      ok: false,
      error: `You are ${Math.round(dist)} m away from school. Must be within ${MAX_RADIUS_M} m to punch in.`,
      distance: Math.round(dist)
    });
  }

  const staffId  = req.session.user.linked_id;
  const today    = todayStr();
  const nowISO   = new Date().toISOString();

  // Check if already logged in today
  const existing = db.prepare('SELECT * FROM staff_attendance WHERE staff_id=? AND date=?').get(staffId, today);
  if (existing && existing.login_time) {
    return res.status(409).json({ ok: false, error: 'You have already punched in today.', record: existing });
  }

  let record;
  if (existing) {
    db.prepare(`UPDATE staff_attendance SET login_time=?, login_lat=?, login_lng=?, status='present' WHERE staff_id=? AND date=?`)
      .run(nowISO, parsedLat, parsedLng, staffId, today);
    record = db.prepare('SELECT * FROM staff_attendance WHERE staff_id=? AND date=?').get(staffId, today);
  } else {
    db.prepare(`
      INSERT INTO staff_attendance (staff_id, date, login_time, login_lat, login_lng, status)
      VALUES (?,?,?,?,?,'present')
    `).run(staffId, today, nowISO, parsedLat, parsedLng);
    record = db.prepare('SELECT * FROM staff_attendance WHERE staff_id=? AND date=?').get(staffId, today);
  }

  logActivity(db, req.session.user.id, 'STAFF_LOGIN', `Staff ID ${staffId} punched IN at ${nowISO}`, req.ip);
  res.json({ ok: true, message: 'Punch-in recorded successfully!', record, distance: Math.round(dist) });
});

// ── Staff Attendance — Logout ─────────────────────────────────────────────────
router.post('/staff-attendance/logout', requireAuth, requireRole('staff'), (req, res) => {
  const { lat, lng } = req.body;
  if (lat == null || lng == null) {
    return res.status(400).json({ ok: false, error: 'Location coordinates are required.' });
  }
  const parsedLat = parseFloat(lat);
  const parsedLng = parseFloat(lng);
  const dist = haversineDistance(SCHOOL_LAT, SCHOOL_LNG, parsedLat, parsedLng);

  if (dist > MAX_RADIUS_M) {
    return res.status(403).json({
      ok: false,
      error: `You are ${Math.round(dist)} m away from school. Must be within ${MAX_RADIUS_M} m to punch out.`,
      distance: Math.round(dist)
    });
  }

  const staffId = req.session.user.linked_id;
  const today   = todayStr();
  const nowISO  = new Date().toISOString();

  const existing = db.prepare('SELECT * FROM staff_attendance WHERE staff_id=? AND date=?').get(staffId, today);
  if (!existing || !existing.login_time) {
    return res.status(409).json({ ok: false, error: 'You have not punched in today yet.' });
  }
  if (existing.logout_time) {
    return res.status(409).json({ ok: false, error: 'You have already punched out today.', record: existing });
  }

  db.prepare(`UPDATE staff_attendance SET logout_time=?, logout_lat=?, logout_lng=? WHERE staff_id=? AND date=?`)
    .run(nowISO, parsedLat, parsedLng, staffId, today);

  const record = db.prepare('SELECT * FROM staff_attendance WHERE staff_id=? AND date=?').get(staffId, today);
  logActivity(db, req.session.user.id, 'STAFF_LOGOUT', `Staff ID ${staffId} punched OUT at ${nowISO}`, req.ip);
  res.json({ ok: true, message: 'Punch-out recorded successfully!', record, distance: Math.round(dist) });
});

// ── Staff Attendance Status (AJAX) ────────────────────────────────────────────
router.get('/staff-attendance/today', requireAuth, requireRole('staff'), (req, res) => {
  const staffId = req.session.user.linked_id;
  const record  = db.prepare('SELECT * FROM staff_attendance WHERE staff_id=? AND date=?').get(staffId, todayStr());
  res.json({ ok: true, record: record || null });
});

// ── Student Search (AJAX) ─────────────────────────────────────────────────────
router.get('/students/search', requireAuth, (req, res) => {
  const { q = '', limit = 10 } = req.query;
  const students = db.prepare(`
    SELECT s.id, s.admission_no, s.first_name, s.last_name,
           s.parent_phone, c.name as class_name, sec.name as section_name
    FROM students s
    LEFT JOIN classes c ON c.id=s.class_id
    LEFT JOIN sections sec ON sec.id=s.section_id
    WHERE s.is_active=1 AND (
      s.first_name LIKE ? OR s.last_name LIKE ? OR
      s.admission_no LIKE ? OR s.parent_phone LIKE ?
    )
    LIMIT ?
  `).all(`%${q}%`,`%${q}%`,`%${q}%`,`%${q}%`, parseInt(limit));
  res.json({ students });
});

// ── Sections for a Class (AJAX) ───────────────────────────────────────────────
router.get('/sections/:classId', requireAuth, (req, res) => {
  const sections = db.prepare('SELECT * FROM sections WHERE class_id=? ORDER BY name')
    .all(req.params.classId);
  res.json({ sections });
});

// ── Dashboard Stats (AJAX) ────────────────────────────────────────────────────
router.get('/stats', requireAuth, (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  res.json({
    totalStudents:  db.prepare("SELECT COUNT(*) as c FROM students WHERE is_active=1").get().c,
    totalStaff:     db.prepare("SELECT COUNT(*) as c FROM staff WHERE is_active=1").get().c,
    presentToday:   db.prepare("SELECT COUNT(*) as c FROM attendance WHERE date=? AND status='present'").get(today).c,
    absentToday:    db.prepare("SELECT COUNT(*) as c FROM attendance WHERE date=? AND status='absent'").get(today).c,
    todayFees:      db.prepare("SELECT COALESCE(SUM(amount_paid),0) as c FROM fee_payments WHERE payment_date=?").get(today).c,
    totalFeesCol:   db.prepare("SELECT COALESCE(SUM(amount_paid),0) as c FROM fee_payments").get().c,
  });
});

// ── Student Fee Summary (AJAX) ─────────────────────────────────────────────────
router.get('/students/:id/fees', requireAuth, (req, res) => {
  const student = db.prepare('SELECT id, class_id FROM students WHERE id=?').get(req.params.id);
  if (!student) return res.status(404).json({ error: 'Not found' });

  const feeStructures = db.prepare('SELECT * FROM fee_structures WHERE class_id=? AND is_active=1').all(student.class_id);
  const payments = db.prepare('SELECT * FROM fee_payments WHERE student_id=?').all(student.id);
  const totalFee  = feeStructures.reduce((s,f) => s+f.amount, 0);
  const totalPaid = payments.reduce((s,p) => s+p.amount_paid, 0);

  res.json({ totalFee, totalPaid, balance: Math.max(0, totalFee - totalPaid), feeStructures, recentPayments: payments.slice(0,5) });
});

// ── Attendance Chart Data (AJAX) ──────────────────────────────────────────────
router.get('/attendance/chart', requireAuth, (req, res) => {
  const data = db.prepare(`
    SELECT strftime('%Y-%m', date) as month,
           SUM(CASE WHEN status='present' THEN 1 ELSE 0 END) as present,
           SUM(CASE WHEN status='absent' THEN 1 ELSE 0 END) as absent,
           SUM(CASE WHEN status='leave' THEN 1 ELSE 0 END) as leave,
           COUNT(*) as total
    FROM attendance
    GROUP BY month ORDER BY month DESC LIMIT 6
  `).all().reverse();
  res.json({ data });
});

module.exports = router;
