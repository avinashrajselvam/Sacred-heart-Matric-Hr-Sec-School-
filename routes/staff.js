'use strict';
const express = require('express');
const router  = express.Router();
const db      = require('../db/schema');
const { requireAuth, requireRole } = require('../middleware/auth');
const { formatDate, formatCurrency, todayStr, logActivity } = require('../utils/helpers');

const guard = [requireAuth, requireRole('staff')];

// ── Staff Dashboard ───────────────────────────────────────────────────────────
router.get('/', ...guard, (req, res) => {
  const staffId   = req.session.user.linked_id;
  const staffInfo = db.prepare(`
    SELECT s.*, c.name as class_name, sec.name as section_name
    FROM staff s
    LEFT JOIN classes c ON c.id=s.assigned_class_id
    LEFT JOIN sections sec ON sec.id=s.assigned_section_id
    WHERE s.id=?
  `).get(staffId);

  const staffObj = staffInfo || {
    id: staffId || 0,
    first_name: req.session.user.displayName || req.session.user.username,
    last_name: '',
    employee_id: req.session.user.username,
    assigned_class_id: null,
    assigned_section_id: null,
    class_name: '—',
    section_name: '—'
  };

  const assignedStudents = staffObj.assigned_class_id ? db.prepare(`
    SELECT COUNT(*) as c FROM students
    WHERE class_id=? AND section_id=? AND is_active=1
  `).get(staffObj.assigned_class_id, staffObj.assigned_section_id).c : 0;

  // Today's attendance for assigned class/section
  const todayAtt = staffObj.assigned_class_id ? db.prepare(`
    SELECT
      SUM(CASE WHEN a.status='present' THEN 1 ELSE 0 END) as present,
      SUM(CASE WHEN a.status='absent'  THEN 1 ELSE 0 END) as absent,
      SUM(CASE WHEN a.status='leave'   THEN 1 ELSE 0 END) as leave
    FROM students s
    LEFT JOIN attendance a ON a.student_id=s.id AND a.date=?
    WHERE s.class_id=? AND s.section_id=? AND s.is_active=1
  `).get(todayStr(), staffObj.assigned_class_id, staffObj.assigned_section_id) : { present:0, absent:0, leave:0 };

  const announcements = db.prepare(`
    SELECT * FROM announcements
    WHERE is_active=1 AND target_audience IN ('all','staff')
    ORDER BY created_at DESC LIMIT 5
  `).all();

  res.render('staff/dashboard', {
    title: 'Staff Dashboard',
    staffInfo: staffObj, assignedStudents, todayAtt, announcements,
    today: todayStr(), formatDate
  });
});

// ── Staff Profile ─────────────────────────────────────────────────────────────
router.get('/profile', ...guard, (req, res) => {
  const staffInfo = db.prepare(`
    SELECT s.*, c.name as class_name, sec.name as section_name
    FROM staff s
    LEFT JOIN classes c ON c.id=s.assigned_class_id
    LEFT JOIN sections sec ON sec.id=s.assigned_section_id
    WHERE s.id=?
  `).get(req.session.user.linked_id);
  res.render('staff/profile', { title: 'My Profile', staffInfo, formatDate });
});

// ── View Assigned Students ────────────────────────────────────────────────────
router.get('/students', ...guard, (req, res) => {
  const staffInfo = db.prepare('SELECT * FROM staff WHERE id=?').get(req.session.user.linked_id);
  const { search = '' } = req.query;

  let students;
  const baseWhere = `s.class_id=? AND s.section_id=? AND s.is_active=1`;
  const baseParams = [staffInfo.assigned_class_id, staffInfo.assigned_section_id];

  if (search) {
    students = db.prepare(`
      SELECT s.*, c.name as class_name, sec.name as section_name
      FROM students s
      LEFT JOIN classes c ON c.id=s.class_id
      LEFT JOIN sections sec ON sec.id=s.section_id
      WHERE ${baseWhere} AND (s.first_name LIKE ? OR s.last_name LIKE ? OR s.admission_no LIKE ?)
      ORDER BY s.first_name
    `).all(...baseParams, `%${search}%`, `%${search}%`, `%${search}%`);
  } else {
    students = db.prepare(`
      SELECT s.*, c.name as class_name, sec.name as section_name
      FROM students s
      LEFT JOIN classes c ON c.id=s.class_id
      LEFT JOIN sections sec ON sec.id=s.section_id
      WHERE ${baseWhere} ORDER BY s.first_name
    `).all(...baseParams);
  }

  // Attach today's attendance for each student
  students.forEach(s => {
    const att = db.prepare("SELECT status FROM attendance WHERE student_id=? AND date=?")
      .get(s.id, todayStr());
    s.todayStatus = att ? att.status : null;
  });

  res.render('staff/students', {
    title: 'My Students', students, search, staffInfo, today: todayStr()
  });
});

// ── Student Detail (staff view) ────────────────────────────────────────────────
router.get('/students/:id', ...guard, (req, res) => {
  const staffInfo = db.prepare('SELECT * FROM staff WHERE id=?').get(req.session.user.linked_id);
  const student   = db.prepare(`
    SELECT s.*, c.name as class_name, sec.name as section_name
    FROM students s
    LEFT JOIN classes c ON c.id=s.class_id
    LEFT JOIN sections sec ON sec.id=s.section_id
    WHERE s.id=? AND s.class_id=?
  `).get(req.params.id, staffInfo.assigned_class_id);

  if (!student) return res.redirect('/staff/students');

  const recentAtt = db.prepare(`
    SELECT * FROM attendance WHERE student_id=? ORDER BY date DESC LIMIT 10
  `).all(req.params.id);

  const attSummary = db.prepare(`
    SELECT status, COUNT(*) as count FROM attendance WHERE student_id=? GROUP BY status
  `).all(req.params.id);
  const summary = { present:0, absent:0, leave:0, late:0 };
  attSummary.forEach(r => { summary[r.status] = r.count; });
  const totalDays = Object.values(summary).reduce((a,b)=>a+b,0);
  const percentage = totalDays > 0 ? Math.round((summary.present/totalDays)*100) : 0;

  // Fee summary (if permitted — all staff can view)
  const feeStructures = db.prepare('SELECT * FROM fee_structures WHERE class_id=? AND is_active=1').all(student.class_id);
  const payments = db.prepare('SELECT * FROM fee_payments WHERE student_id=? ORDER BY payment_date DESC').all(student.id);
  const totalFee  = feeStructures.reduce((s,f) => s+f.amount, 0);
  const totalPaid = payments.reduce((s,p) => s+p.amount_paid, 0);

  res.render('staff/student-detail', {
    title: `${student.first_name} ${student.last_name}`,
    student, recentAtt, summary, percentage,
    totalFee, totalPaid, balance: Math.max(0, totalFee - totalPaid),
    formatDate, formatCurrency
  });
});

// ── Mark Attendance ───────────────────────────────────────────────────────────
router.get('/attendance/mark', ...guard, (req, res) => {
  const staffInfo = db.prepare('SELECT * FROM staff WHERE id=?').get(req.session.user.linked_id);
  const { date = todayStr() } = req.query;

  const students = db.prepare(`
    SELECT s.id, s.first_name, s.last_name, s.admission_no,
           a.status as existing_status
    FROM students s
    LEFT JOIN attendance a ON a.student_id=s.id AND a.date=?
    WHERE s.class_id=? AND s.section_id=? AND s.is_active=1
    ORDER BY s.first_name
  `).all(date, staffInfo.assigned_class_id, staffInfo.assigned_section_id);

  res.render('staff/mark-attendance', {
    title: 'Mark Attendance',
    students, staffInfo, date,
    success: req.query.success, formatDate
  });
});

router.post('/attendance/mark', ...guard, (req, res) => {
  const { date, statuses } = req.body;
  if (!statuses || !date) return res.redirect('/staff/attendance/mark');

  const staffInfo = db.prepare('SELECT * FROM staff WHERE id=?').get(req.session.user.linked_id);
  const insertOrReplace = db.prepare(`
    INSERT INTO attendance (student_id, class_id, section_id, date, status, marked_by)
    VALUES (?,?,?,?,?,?)
    ON CONFLICT(student_id, date) DO UPDATE SET status=excluded.status, marked_by=excluded.marked_by
  `);

  const markMany = db.transaction((entries) => {
    entries.forEach(({ studentId, status }) => {
      insertOrReplace.run(
        parseInt(studentId),
        staffInfo.assigned_class_id,
        staffInfo.assigned_section_id,
        date, status,
        req.session.user.id
      );
    });
  });

  const entries = Object.entries(statuses).map(([studentId, status]) => ({ studentId, status }));
  markMany(entries);

  logActivity(db, req.session.user.id, 'ATTENDANCE_MARKED',
    `Marked attendance for ${entries.length} students on ${date}`, req.ip);

  res.redirect(`/staff/attendance/mark?date=${date}&success=Attendance+saved+successfully`);
});

// ── View Attendance ───────────────────────────────────────────────────────────
router.get('/attendance/view', ...guard, (req, res) => {
  const staffInfo = db.prepare('SELECT * FROM staff WHERE id=?').get(req.session.user.linked_id);
  const { month = new Date().toISOString().slice(0,7) } = req.query;

  const records = db.prepare(`
    SELECT a.date, a.status, s.first_name, s.last_name, s.admission_no
    FROM attendance a
    JOIN students s ON s.id=a.student_id
    WHERE s.class_id=? AND s.section_id=? AND a.date LIKE ?
    ORDER BY a.date, s.first_name
  `).all(staffInfo.assigned_class_id, staffInfo.assigned_section_id, `${month}%`);

  const students = db.prepare(`
    SELECT id, first_name, last_name, admission_no FROM students
    WHERE class_id=? AND section_id=? AND is_active=1 ORDER BY first_name
  `).all(staffInfo.assigned_class_id, staffInfo.assigned_section_id);

  // Build dates list
  const dates = [...new Set(records.map(r => r.date))].sort();

  // Build pivot table: studentId -> date -> status
  const pivot = {};
  students.forEach(s => { pivot[s.id] = {}; });
  records.forEach(r => {
    const stu = students.find(s => s.admission_no === r.admission_no);
    if (stu) pivot[stu.id][r.date] = r.status;
  });

  res.render('staff/view-attendance', {
    title: 'Attendance Records',
    students, dates, pivot, month, staffInfo, formatDate
  });
});

// ── Staff Announcements ────────────────────────────────────────────────────────
router.get('/announcements', ...guard, (req, res) => {
  const announcements = db.prepare(`
    SELECT * FROM announcements
    WHERE is_active=1 AND target_audience IN ('all','staff')
    ORDER BY created_at DESC
  `).all();
  res.render('staff/announcements', { title: 'Announcements', announcements, formatDate });
});

// ── My Attendance (Punch Card) ────────────────────────────────────────────────
router.get('/my-attendance', ...guard, (req, res) => {
  const staffId = req.session.user.linked_id;
  const today   = require('../utils/helpers').todayStr();

  // Today's record
  const todayRecord = db.prepare(
    'SELECT * FROM staff_attendance WHERE staff_id=? AND date=?'
  ).get(staffId, today);

  // Last 30 days history
  const history = db.prepare(`
    SELECT * FROM staff_attendance
    WHERE staff_id=?
    ORDER BY date DESC
    LIMIT 30
  `).all(staffId);

  const { formatDateTime } = require('../utils/helpers');
  res.render('staff/my-attendance', {
    title: 'My Attendance',
    todayRecord: todayRecord || null,
    history,
    today,
    formatDate,
    formatDateTime
  });
});

module.exports = router;
