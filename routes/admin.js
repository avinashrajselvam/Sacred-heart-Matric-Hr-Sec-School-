'use strict';
const express  = require('express');
const bcrypt   = require('bcryptjs');
const router   = express.Router();
const db       = require('../db/schema');
const { requireAuth, requireRole } = require('../middleware/auth');
const {
  formatDate, formatCurrency, generateAdmissionNumber,
  generateEmployeeId, todayStr, logActivity, getCurrentAcademicYear
} = require('../utils/helpers');

const guard = [requireAuth, requireRole('admin')];

// ── Dashboard ─────────────────────────────────────────────────────────────────
router.get('/', ...guard, (req, res) => {
  const totalStudents  = db.prepare("SELECT COUNT(*) as c FROM students WHERE is_active=1").get().c;
  const totalStaff     = db.prepare("SELECT COUNT(*) as c FROM staff WHERE is_active=1").get().c;
  const totalClasses   = db.prepare("SELECT COUNT(*) as c FROM classes").get().c;
  const totalFeesCol   = db.prepare("SELECT COALESCE(SUM(amount_paid),0) as c FROM fee_payments").get().c;
  const todayFees      = db.prepare("SELECT COALESCE(SUM(amount_paid),0) as c FROM fee_payments WHERE payment_date=?").get(todayStr()).c;

  // Total fees expected (sum of all fee_structures per student's class)
  const feeExpected    = db.prepare(`
    SELECT COALESCE(SUM(fs.amount),0) as c
    FROM students s
    JOIN fee_structures fs ON fs.class_id = s.class_id
    WHERE s.is_active=1
  `).get().c;
  const pendingFees    = Math.max(0, feeExpected - totalFeesCol);

  // Today's attendance
  const presentToday = db.prepare("SELECT COUNT(*) as c FROM attendance WHERE date=? AND status='present'").get(todayStr()).c;
  const absentToday  = db.prepare("SELECT COUNT(*) as c FROM attendance WHERE date=? AND status='absent'").get(todayStr()).c;

  // Class-wise student count
  const classWise = db.prepare(`
    SELECT c.name, COUNT(s.id) as count
    FROM classes c LEFT JOIN students s ON s.class_id=c.id AND s.is_active=1
    GROUP BY c.id ORDER BY c.display_order
  `).all();

  // Recent activities
  const recentActivity = db.prepare(`
    SELECT al.*, u.username, u.role FROM activity_log al
    LEFT JOIN users u ON u.id=al.user_id
    ORDER BY al.created_at DESC LIMIT 10
  `).all();

  // Monthly fee collection (last 6 months)
  const monthlyFees = db.prepare(`
    SELECT strftime('%Y-%m', payment_date) as month,
           SUM(amount_paid) as total
    FROM fee_payments
    GROUP BY month
    ORDER BY month DESC LIMIT 6
  `).all().reverse();

  // Recent payments
  const recentPayments = db.prepare(`
    SELECT fp.*, s.first_name, s.last_name, s.admission_no, c.name as class_name
    FROM fee_payments fp
    JOIN students s ON s.id=fp.student_id
    LEFT JOIN classes c ON c.id=s.class_id
    ORDER BY fp.created_at DESC LIMIT 5
  `).all();

  res.render('admin/dashboard', {
    title: 'Admin Dashboard',
    totalStudents, totalStaff, totalClasses,
    totalFeesCol, todayFees, pendingFees, feeExpected,
    presentToday, absentToday,
    classWise, recentActivity, monthlyFees, recentPayments,
    formatDate, formatCurrency
  });
});

// ── Students ──────────────────────────────────────────────────────────────────
router.get('/students', ...guard, (req, res) => {
  const { search = '', class_id = '', section_id = '', status = '1', page = 1 } = req.query;
  const perPage = 20;
  const offset  = (parseInt(page) - 1) * perPage;

  let where = ['s.is_active = ?'];
  let params = [status === '' ? 1 : parseInt(status)];

  if (search) {
    where.push(`(s.first_name LIKE ? OR s.last_name LIKE ? OR s.admission_no LIKE ? OR s.parent_phone LIKE ?)`);
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (class_id) { where.push('s.class_id=?'); params.push(class_id); }
  if (section_id) { where.push('s.section_id=?'); params.push(section_id); }

  const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const total = db.prepare(`SELECT COUNT(*) as c FROM students s ${whereClause}`).get(...params).c;

  const students = db.prepare(`
    SELECT s.*, c.name as class_name, sec.name as section_name
    FROM students s
    LEFT JOIN classes c ON c.id=s.class_id
    LEFT JOIN sections sec ON sec.id=s.section_id
    ${whereClause}
    ORDER BY s.admission_no
    LIMIT ? OFFSET ?
  `).all(...params, perPage, offset);

  const classes  = db.prepare('SELECT * FROM classes ORDER BY display_order').all();
  const sections = class_id
    ? db.prepare('SELECT * FROM sections WHERE class_id=?').all(class_id)
    : db.prepare('SELECT * FROM sections').all();

  res.render('admin/students', {
    title: 'Students',
    students, classes, sections,
    search, class_id, section_id, status,
    total, page: parseInt(page), perPage,
    totalPages: Math.ceil(total / perPage),
    formatDate
  });
});

router.get('/students/new', ...guard, (req, res) => {
  const classes  = db.prepare('SELECT * FROM classes ORDER BY display_order').all();
  const sections = db.prepare('SELECT * FROM sections').all();
  const nextAdmission = generateAdmissionNumber(db);
  res.render('admin/student-form', {
    title: 'Add Student', student: null, classes, sections,
    nextAdmission, error: null
  });
});

router.post('/students', ...guard, (req, res) => {
  const { admission_no, first_name, last_name, date_of_birth, gender,
          class_id, section_id, parent_name, parent_phone, parent_email,
          address, blood_group, admission_date } = req.body;

  if (!first_name || !last_name || !admission_no) {
    const classes  = db.prepare('SELECT * FROM classes ORDER BY display_order').all();
    const sections = db.prepare('SELECT * FROM sections').all();
    return res.render('admin/student-form', {
      title: 'Add Student', student: req.body, classes, sections,
      nextAdmission: admission_no, error: 'First name, last name and admission number are required.'
    });
  }

  try {
    const result = db.prepare(`
      INSERT INTO students (admission_no,first_name,last_name,date_of_birth,gender,
        class_id,section_id,parent_name,parent_phone,parent_email,address,blood_group,admission_date)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(admission_no, first_name, last_name, date_of_birth||null,
           gender||null, class_id||null, section_id||null,
           parent_name||null, parent_phone||null, parent_email||null,
           address||null, blood_group||null, admission_date||todayStr());

    // Create login account
    const hash = bcrypt.hashSync('student123', 10);
    db.prepare(`INSERT OR IGNORE INTO users (username,password_hash,role,linked_id) VALUES (?,?,?,?)`)
      .run(admission_no.toLowerCase(), hash, 'student', result.lastInsertRowid);

    logActivity(db, req.session.user.id, 'STUDENT_ADDED', `Added student ${first_name} ${last_name} (${admission_no})`, req.ip);
    res.redirect('/admin/students?success=Student+added+successfully');
  } catch (e) {
    const classes  = db.prepare('SELECT * FROM classes ORDER BY display_order').all();
    const sections = db.prepare('SELECT * FROM sections').all();
    res.render('admin/student-form', {
      title: 'Add Student', student: req.body, classes, sections,
      nextAdmission: admission_no, error: 'Admission number already exists or invalid data.'
    });
  }
});

router.get('/students/:id/edit', ...guard, (req, res) => {
  const student = db.prepare('SELECT * FROM students WHERE id=?').get(req.params.id);
  if (!student) return res.redirect('/admin/students');
  const classes  = db.prepare('SELECT * FROM classes ORDER BY display_order').all();
  const sections = db.prepare('SELECT * FROM sections WHERE class_id=?').all(student.class_id);
  res.render('admin/student-form', {
    title: 'Edit Student', student, classes, sections,
    nextAdmission: student.admission_no, error: null
  });
});

router.post('/students/:id/edit', ...guard, (req, res) => {
  const { first_name, last_name, date_of_birth, gender, class_id, section_id,
          parent_name, parent_phone, parent_email, address, blood_group, is_active } = req.body;
  db.prepare(`
    UPDATE students SET first_name=?,last_name=?,date_of_birth=?,gender=?,
      class_id=?,section_id=?,parent_name=?,parent_phone=?,parent_email=?,
      address=?,blood_group=?,is_active=?,updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(first_name, last_name, date_of_birth||null, gender||null,
         class_id||null, section_id||null, parent_name||null,
         parent_phone||null, parent_email||null, address||null,
         blood_group||null, is_active === '1' ? 1 : 0, req.params.id);
  logActivity(db, req.session.user.id, 'STUDENT_UPDATED', `Updated student ID ${req.params.id}`, req.ip);
  res.redirect('/admin/students?success=Student+updated+successfully');
});

router.post('/students/:id/delete', ...guard, (req, res) => {
  db.prepare('UPDATE students SET is_active=0 WHERE id=?').run(req.params.id);
  logActivity(db, req.session.user.id, 'STUDENT_DELETED', `Deactivated student ID ${req.params.id}`, req.ip);
  res.redirect('/admin/students?success=Student+deactivated');
});

// ── Staff ─────────────────────────────────────────────────────────────────────
router.get('/staff', ...guard, (req, res) => {
  const { search = '' } = req.query;
  let staff;
  if (search) {
    staff = db.prepare(`
      SELECT s.*, c.name as class_name, sec.name as section_name
      FROM staff s
      LEFT JOIN classes c ON c.id=s.assigned_class_id
      LEFT JOIN sections sec ON sec.id=s.assigned_section_id
      WHERE s.is_active=1 AND (s.first_name LIKE ? OR s.last_name LIKE ? OR s.employee_id LIKE ? OR s.designation LIKE ?)
      ORDER BY s.employee_id
    `).all(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  } else {
    staff = db.prepare(`
      SELECT s.*, c.name as class_name, sec.name as section_name
      FROM staff s
      LEFT JOIN classes c ON c.id=s.assigned_class_id
      LEFT JOIN sections sec ON sec.id=s.assigned_section_id
      WHERE s.is_active=1 ORDER BY s.employee_id
    `).all();
  }
  res.render('admin/staff', { title: 'Staff', staff, search, formatDate });
});

router.get('/staff/new', ...guard, (req, res) => {
  const classes  = db.prepare('SELECT * FROM classes ORDER BY display_order').all();
  const sections = db.prepare('SELECT * FROM sections').all();
  const nextId   = generateEmployeeId(db);
  res.render('admin/staff-form', {
    title: 'Add Staff', staffMember: null, classes, sections, nextId, error: null
  });
});

router.post('/staff', ...guard, (req, res) => {
  const { employee_id, first_name, last_name, phone, email, designation,
          department, assigned_class_id, assigned_section_id, date_of_joining } = req.body;
  try {
    const result = db.prepare(`
      INSERT INTO staff (employee_id,first_name,last_name,phone,email,designation,
        department,assigned_class_id,assigned_section_id,date_of_joining)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `).run(employee_id, first_name, last_name, phone||null, email||null,
           designation||null, department||null, assigned_class_id||null,
           assigned_section_id||null, date_of_joining||null);

    const hash     = bcrypt.hashSync('staff123', 10);
    const username = `${first_name.toLowerCase()}.${last_name.toLowerCase()}`;
    db.prepare(`INSERT OR IGNORE INTO users (username,password_hash,role,linked_id) VALUES (?,?,?,?)`)
      .run(username, hash, 'staff', result.lastInsertRowid);

    logActivity(db, req.session.user.id, 'STAFF_ADDED', `Added staff ${first_name} ${last_name}`, req.ip);
    res.redirect('/admin/staff?success=Staff+added+successfully');
  } catch (e) {
    const classes  = db.prepare('SELECT * FROM classes ORDER BY display_order').all();
    const sections = db.prepare('SELECT * FROM sections').all();
    res.render('admin/staff-form', {
      title: 'Add Staff', staffMember: req.body, classes, sections,
      nextId: employee_id, error: 'Employee ID already exists or invalid data.'
    });
  }
});

router.get('/staff/:id/edit', ...guard, (req, res) => {
  const staffMember = db.prepare('SELECT * FROM staff WHERE id=?').get(req.params.id);
  if (!staffMember) return res.redirect('/admin/staff');
  const classes  = db.prepare('SELECT * FROM classes ORDER BY display_order').all();
  const sections = db.prepare('SELECT * FROM sections').all();
  res.render('admin/staff-form', {
    title: 'Edit Staff', staffMember, classes, sections,
    nextId: staffMember.employee_id, error: null
  });
});

router.post('/staff/:id/edit', ...guard, (req, res) => {
  const { first_name, last_name, phone, email, designation, department,
          assigned_class_id, assigned_section_id, date_of_joining, is_active } = req.body;
  db.prepare(`
    UPDATE staff SET first_name=?,last_name=?,phone=?,email=?,designation=?,
      department=?,assigned_class_id=?,assigned_section_id=?,date_of_joining=?,
      is_active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?
  `).run(first_name, last_name, phone||null, email||null, designation||null,
         department||null, assigned_class_id||null, assigned_section_id||null,
         date_of_joining||null, is_active === '1' ? 1 : 0, req.params.id);
  logActivity(db, req.session.user.id, 'STAFF_UPDATED', `Updated staff ID ${req.params.id}`, req.ip);
  res.redirect('/admin/staff?success=Staff+updated+successfully');
});

router.post('/staff/:id/delete', ...guard, (req, res) => {
  db.prepare('UPDATE staff SET is_active=0 WHERE id=?').run(req.params.id);
  res.redirect('/admin/staff?success=Staff+deactivated');
});

// ── Classes & Sections ────────────────────────────────────────────────────────
router.get('/classes', ...guard, (req, res) => {
  const classes = db.prepare(`
    SELECT c.*, COUNT(s.id) as student_count
    FROM classes c
    LEFT JOIN students s ON s.class_id=c.id AND s.is_active=1
    GROUP BY c.id ORDER BY c.display_order
  `).all();
  const sections = db.prepare('SELECT sec.*, c.name as class_name FROM sections sec JOIN classes c ON c.id=sec.class_id ORDER BY c.display_order, sec.name').all();
  res.render('admin/classes', { title: 'Classes & Sections', classes, sections });
});

router.post('/classes', ...guard, (req, res) => {
  const { name, display_order } = req.body;
  try {
    db.prepare('INSERT INTO classes (name, display_order) VALUES (?,?)').run(name, display_order || 0);
    logActivity(db, req.session.user.id, 'CLASS_ADDED', `Added class: ${name}`, req.ip);
  } catch(e) {}
  res.redirect('/admin/classes?success=Class+added');
});

router.post('/classes/:id/delete', ...guard, (req, res) => {
  db.prepare('DELETE FROM classes WHERE id=?').run(req.params.id);
  res.redirect('/admin/classes');
});

router.post('/sections', ...guard, (req, res) => {
  const { class_id, name } = req.body;
  try {
    db.prepare('INSERT INTO sections (class_id, name) VALUES (?,?)').run(class_id, name);
  } catch(e) {}
  res.redirect('/admin/classes?success=Section+added');
});

router.post('/sections/:id/delete', ...guard, (req, res) => {
  db.prepare('DELETE FROM sections WHERE id=?').run(req.params.id);
  res.redirect('/admin/classes');
});

// ── Announcements ─────────────────────────────────────────────────────────────
router.get('/announcements', ...guard, (req, res) => {
  const announcements = db.prepare(`
    SELECT a.*, u.username as created_by_name FROM announcements a
    LEFT JOIN users u ON u.id=a.created_by
    ORDER BY a.created_at DESC
  `).all();
  res.render('admin/announcements', { title: 'Announcements', announcements, formatDate });
});

router.post('/announcements', ...guard, (req, res) => {
  const { title, content, target_audience } = req.body;
  db.prepare('INSERT INTO announcements (title,content,target_audience,created_by) VALUES (?,?,?,?)')
    .run(title, content, target_audience || 'all', req.session.user.id);
  res.redirect('/admin/announcements?success=Announcement+posted');
});

router.post('/announcements/:id/delete', ...guard, (req, res) => {
  db.prepare('UPDATE announcements SET is_active=0 WHERE id=?').run(req.params.id);
  res.redirect('/admin/announcements');
});

// ── Reports ───────────────────────────────────────────────────────────────────
router.get('/reports', ...guard, (req, res) => {
  const classes  = db.prepare('SELECT * FROM classes ORDER BY display_order').all();
  const { from = '', to = '', class_id = '' } = req.query;
  let payments = [];
  if (from && to) {
    let q = `
      SELECT fp.*, s.first_name, s.last_name, s.admission_no, c.name as class_name, fs.fee_name
      FROM fee_payments fp
      JOIN students s ON s.id=fp.student_id
      LEFT JOIN classes c ON c.id=s.class_id
      LEFT JOIN fee_structures fs ON fs.id=fp.fee_structure_id
      WHERE fp.payment_date BETWEEN ? AND ?
    `;
    const params = [from, to];
    if (class_id) { q += ' AND s.class_id=?'; params.push(class_id); }
    q += ' ORDER BY fp.payment_date DESC';
    payments = db.prepare(q).all(...params);
  }
  const total = payments.reduce((s, p) => s + p.amount_paid, 0);
  res.render('admin/reports', {
    title: 'Reports', classes, payments, total,
    from, to, class_id, formatDate, formatCurrency
  });
});

// ── Attendance Overview ────────────────────────────────────────────────────────
router.get('/attendance', ...guard, (req, res) => {
  const { date = todayStr(), class_id = '' } = req.query;
  const classes = db.prepare('SELECT * FROM classes ORDER BY display_order').all();

  let records;
  if (class_id) {
    records = db.prepare(`
      SELECT s.id, s.first_name, s.last_name, s.admission_no,
             sec.name as section_name,
             a.status, a.date
      FROM students s
      LEFT JOIN sections sec ON sec.id=s.section_id
      LEFT JOIN attendance a ON a.student_id=s.id AND a.date=?
      WHERE s.class_id=? AND s.is_active=1
      ORDER BY s.first_name
    `).all(date, class_id);
  } else {
    records = db.prepare(`
      SELECT s.id, s.first_name, s.last_name, s.admission_no, c.name as class_name,
             sec.name as section_name, a.status, a.date
      FROM students s
      LEFT JOIN classes c ON c.id=s.class_id
      LEFT JOIN sections sec ON sec.id=s.section_id
      LEFT JOIN attendance a ON a.student_id=s.id AND a.date=?
      WHERE s.is_active=1 ORDER BY c.display_order, s.first_name
    `).all(date);
  }

  const summary = {
    present: records.filter(r => r.status === 'present').length,
    absent:  records.filter(r => r.status === 'absent').length,
    leave:   records.filter(r => r.status === 'leave').length,
    notMarked: records.filter(r => !r.status).length,
  };

  res.render('admin/attendance', {
    title: 'Attendance Overview', classes, records, summary,
    date, class_id, formatDate
  });
});

// ── Fee Structure management ───────────────────────────────────────────────────
router.get('/fee-structure', ...guard, (req, res) => {
  const classes  = db.prepare('SELECT * FROM classes ORDER BY display_order').all();
  const feeStructures = db.prepare(`
    SELECT fs.*, c.name as class_name FROM fee_structures fs
    JOIN classes c ON c.id=fs.class_id
    WHERE fs.is_active=1 ORDER BY c.display_order, fs.fee_name
  `).all();
  res.render('admin/fees', {
    title: 'Fee Structure', classes, feeStructures,
    formatCurrency, formatDate, academicYear: getCurrentAcademicYear()
  });
});

router.post('/fee-structure', ...guard, (req, res) => {
  const { class_id, fee_name, amount, academic_year, due_date } = req.body;
  db.prepare('INSERT INTO fee_structures (class_id,fee_name,amount,academic_year,due_date) VALUES (?,?,?,?,?)')
    .run(class_id, fee_name, parseFloat(amount)||0, academic_year || getCurrentAcademicYear(), due_date||null);
  res.redirect('/admin/fee-structure?success=Fee+structure+added');
});

router.post('/fee-structure/:id/delete', ...guard, (req, res) => {
  db.prepare('UPDATE fee_structures SET is_active=0 WHERE id=?').run(req.params.id);
  res.redirect('/admin/fee-structure');
});

// ── Student Attendance Overview ───────────────────────────────────────────────
router.get('/attendance', ...guard, (req, res) => {
  const { date = todayStr(), class_id = '' } = req.query;
  const classes = db.prepare('SELECT * FROM classes ORDER BY display_order').all();

  let whereClass = class_id ? 'AND s.class_id=?' : '';
  let params = class_id ? [date, class_id] : [date];

  const records = db.prepare(`
    SELECT s.id, s.admission_no, s.first_name, s.last_name,
           c.name as class_name, sec.name as section_name,
           a.status, a.remarks
    FROM students s
    LEFT JOIN classes c ON c.id=s.class_id
    LEFT JOIN sections sec ON sec.id=s.section_id
    LEFT JOIN attendance a ON a.student_id=s.id AND a.date=?
    WHERE s.is_active=1 ${whereClass}
    ORDER BY c.display_order, s.first_name
  `).all(...params);

  const summary = {
    present:   records.filter(r => r.status === 'present').length,
    absent:    records.filter(r => r.status === 'absent').length,
    leave:     records.filter(r => r.status === 'leave').length,
    notMarked: records.filter(r => !r.status).length
  };

  res.render('admin/attendance', {
    title: 'Attendance Overview',
    records, summary, classes, date, class_id, formatDate
  });
});

// ── Staff Attendance Overview ──────────────────────────────────────────────────
router.get('/staff-attendance', ...guard, (req, res) => {
  const { date = todayStr() } = req.query;

  // All active staff with their attendance record for the selected date
  const records = db.prepare(`
    SELECT
      s.id as staff_id,
      s.employee_id,
      s.first_name,
      s.last_name,
      s.designation,
      s.department,
      sa.id       as att_id,
      sa.login_time,
      sa.logout_time,
      sa.login_lat,
      sa.login_lng,
      sa.status
    FROM staff s
    LEFT JOIN staff_attendance sa ON sa.staff_id = s.id AND sa.date = ?
    WHERE s.is_active = 1
    ORDER BY s.first_name
  `).all(date);

  const summary = {
    present:   records.filter(r => r.login_time && r.status === 'present').length,
    absent:    records.filter(r => !r.login_time).length,
    loggedOut: records.filter(r => r.login_time && r.logout_time).length,
    total:     records.length
  };

  const { formatDateTime } = require('../utils/helpers');
  res.render('admin/staff-attendance', {
    title: 'Staff Attendance',
    records, summary, date, formatDate, formatDateTime
  });
});

module.exports = router;
