'use strict';
const bcrypt = require('bcryptjs');
const db = require('./schema');

console.log('🌱 Resetting Sacred Heart Matric Hr Sec School CRM (Clean Manual Mode)...');

// Clear existing records
db.pragma('foreign_keys = OFF');
db.exec(`
  DELETE FROM attendance;
  DELETE FROM fee_payments;
  DELETE FROM fee_structures;
  DELETE FROM activity_log;
  DELETE FROM users;
  DELETE FROM students;
  DELETE FROM staff;
  DELETE FROM sections;
  DELETE FROM classes;
  DELETE FROM announcements;
  DELETE FROM sqlite_sequence;
`);
db.pragma('foreign_keys = ON');

// ─── Classes ─────────────────────────────────────────────────────────────────
const classNames = [
  'LKG','UKG',
  'Class 1','Class 2','Class 3','Class 4','Class 5',
  'Class 6','Class 7','Class 8','Class 9','Class 10',
  'Class 11','Class 12'
];
const insertClass = db.prepare('INSERT INTO classes (name, display_order) VALUES (?, ?)');
classNames.forEach((name, i) => insertClass.run(name, i + 1));
console.log('✅ 14 Classes initialized');

// ─── Sections ─────────────────────────────────────────────────────────────────
const classes = db.prepare('SELECT id, name FROM classes ORDER BY display_order').all();
const insertSection = db.prepare('INSERT INTO sections (class_id, name) VALUES (?, ?)');
const sectionNames = ['A', 'B', 'C'];
classes.forEach(cls => {
  sectionNames.forEach(sec => insertSection.run(cls.id, sec));
});
console.log('✅ 42 Sections initialized (A, B, C per class)');

// ─── Admin User ───────────────────────────────────────────────────────────────
const adminHash = bcrypt.hashSync('admin123', 10);
db.prepare(`
  INSERT INTO users (username, password_hash, role, linked_id)
  VALUES ('admin', ?, 'admin', 0)
`).run(adminHash);
console.log('✅ Admin user created (username: admin | password: admin123)');

// ─── Default Demo Staff (Optional sample staff for testing staff portal) ──────
const staffHash = bcrypt.hashSync('staff123', 10);
const cls6 = classes.find(c => c.name === 'Class 6');
const sec6A = db.prepare('SELECT id FROM sections WHERE class_id=? AND name=?').get(cls6?.id, 'A');

const resStaff = db.prepare(`
  INSERT INTO staff (employee_id,first_name,last_name,phone,email,designation,department,assigned_class_id,assigned_section_id,date_of_joining)
  VALUES (?,?,?,?,?,?,?,?,?,?)
`).run('ST001', 'Mary', 'Joseph', '9840123456', 'mary@sacredheart.edu', 'Class Teacher', 'Primary', cls6?.id, sec6A?.id, '2020-06-01');

db.prepare(`
  INSERT INTO users (username, password_hash, role, linked_id)
  VALUES ('mary.joseph', ?, 'staff', ?)
`).run(staffHash, resStaff.lastInsertRowid);
console.log('✅ Demo staff user created (username: mary.joseph | password: staff123)');

// ─── Default Demo Student ─────────────────────────────────────────────────────
const studentHash = bcrypt.hashSync('student123', 10);
const resStudent = db.prepare(`
  INSERT INTO students (admission_no, first_name, last_name, date_of_birth, gender, class_id, section_id, parent_name, parent_phone, parent_email, address, blood_group)
  VALUES ('SH001', 'Rahul', 'Sharma', '2012-05-15', 'Male', ?, ?, 'Suresh Sharma', '9876543210', 'suresh@gmail.com', 'Arakkonam, Tamil Nadu', 'O+')
`).run(cls6?.id, sec6A?.id);

db.prepare(`
  INSERT INTO users (username, password_hash, role, linked_id)
  VALUES ('sh001', ?, 'student', ?)
`).run(studentHash, resStudent.lastInsertRowid);
console.log('✅ Demo student user created (username: sh001 | password: student123)');

// ─── Standard Fee Structures ──────────────────────────────────────────────────
const insertFee = db.prepare(`
  INSERT INTO fee_structures (class_id, fee_name, amount, academic_year, due_date)
  VALUES (?, ?, ?, ?, ?)
`);
classes.forEach(cls => {
  let baseAmt = 10000;
  if (['LKG','UKG'].includes(cls.name)) baseAmt = 8000;
  else if (parseInt(cls.name.replace('Class ','')) <= 5) baseAmt = 12000;
  else if (parseInt(cls.name.replace('Class ','')) <= 8) baseAmt = 15000;
  else if (parseInt(cls.name.replace('Class ','')) <= 10) baseAmt = 18000;
  else baseAmt = 22000;

  insertFee.run(cls.id, 'Tuition Fee',  baseAmt, '2024-25', '2024-06-30');
  insertFee.run(cls.id, 'Exam Fee',     800,     '2024-25', '2024-09-30');
  insertFee.run(cls.id, 'Activity Fee', 500,     '2024-25', '2024-07-31');
  insertFee.run(cls.id, 'Library Fee',  300,     '2024-25', '2024-06-30');
});
console.log('✅ Fee structures configured for all classes');

console.log('\n🎉 Clean Database Reset Complete!');
console.log('─'.repeat(60));
console.log('Ready for manual data entry:');
console.log('  Classes    : 14 (LKG to Class 12)');
console.log('  Sections   : 42 (A, B, C per class)');
console.log('  Students   : 0 (Ready for manual addition)');
console.log('  Staff      : 1 Demo Teacher (Mary Joseph)');
console.log('Credentials:');
console.log('  Admin → username: admin       | password: admin123');
console.log('  Staff → username: mary.joseph | password: staff123');
console.log('─'.repeat(60));
