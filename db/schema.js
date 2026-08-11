'use strict';
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DB_DIR, 'school.db');

if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS classes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    display_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(class_id, name)
  );

  CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admission_no TEXT NOT NULL UNIQUE,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    date_of_birth TEXT,
    gender TEXT CHECK(gender IN ('Male','Female','Other')),
    class_id INTEGER REFERENCES classes(id),
    section_id INTEGER REFERENCES sections(id),
    parent_name TEXT,
    parent_phone TEXT,
    parent_email TEXT,
    address TEXT,
    blood_group TEXT,
    photo_url TEXT,
    admission_date TEXT DEFAULT (date('now')),
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS staff (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id TEXT NOT NULL UNIQUE,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    designation TEXT,
    department TEXT,
    assigned_class_id INTEGER REFERENCES classes(id),
    assigned_section_id INTEGER REFERENCES sections(id),
    date_of_joining TEXT,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin','staff','student')),
    linked_id INTEGER,
    is_active INTEGER DEFAULT 1,
    last_login DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS fee_structures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    class_id INTEGER REFERENCES classes(id),
    fee_name TEXT NOT NULL,
    amount REAL NOT NULL DEFAULT 0,
    academic_year TEXT NOT NULL DEFAULT '2024-25',
    due_date TEXT,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS fee_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL REFERENCES students(id),
    fee_structure_id INTEGER REFERENCES fee_structures(id),
    amount_paid REAL NOT NULL DEFAULT 0,
    payment_date TEXT DEFAULT (date('now')),
    payment_method TEXT DEFAULT 'Cash' CHECK(payment_method IN ('Cash','Cheque','Online','DD','Card')),
    receipt_number TEXT UNIQUE,
    remarks TEXT,
    collected_by INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL REFERENCES students(id),
    class_id INTEGER REFERENCES classes(id),
    section_id INTEGER REFERENCES sections(id),
    date TEXT NOT NULL DEFAULT (date('now')),
    status TEXT NOT NULL DEFAULT 'present' CHECK(status IN ('present','absent','leave','late')),
    marked_by INTEGER REFERENCES users(id),
    remarks TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(student_id, date)
  );

  CREATE TABLE IF NOT EXISTS announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    target_audience TEXT DEFAULT 'all' CHECK(target_audience IN ('all','students','staff')),
    created_by INTEGER REFERENCES users(id),
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    action TEXT NOT NULL,
    details TEXT,
    ip_address TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS staff_attendance (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    staff_id     INTEGER NOT NULL REFERENCES staff(id),
    date         TEXT NOT NULL DEFAULT (date('now')),
    login_time   TEXT,
    logout_time  TEXT,
    login_lat    REAL,
    login_lng    REAL,
    logout_lat   REAL,
    logout_lng   REAL,
    status       TEXT NOT NULL DEFAULT 'present'
                 CHECK(status IN ('present','absent','half-day')),
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(staff_id, date)
  );

  CREATE INDEX IF NOT EXISTS idx_students_class ON students(class_id);
  CREATE INDEX IF NOT EXISTS idx_students_section ON students(section_id);
  CREATE INDEX IF NOT EXISTS idx_students_active ON students(is_active);
  CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance(student_id);
  CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);
  CREATE INDEX IF NOT EXISTS idx_fee_payments_student ON fee_payments(student_id);
  CREATE INDEX IF NOT EXISTS idx_fee_payments_date ON fee_payments(payment_date);
  CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
`);

module.exports = db;
