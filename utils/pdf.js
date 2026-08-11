'use strict';
const PDFDocument = require('pdfkit');
const { formatDate, formatCurrency } = require('./helpers');

/**
 * Generate a Fee Receipt PDF and pipe it to the response stream.
 */
function generateFeeReceiptPDF(res, data) {
  const { student, payment, feeStructure, school } = data;

  const doc = new PDFDocument({ size: 'A5', margin: 40 });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="Receipt-${payment.receipt_number}.pdf"`);
  doc.pipe(res);

  const primaryColor = '#1e3a5f';
  const accentColor  = '#d4a843';
  const pageWidth    = doc.page.width - 80; // margins

  // ── Header band ──────────────────────────────────────────────────────────
  doc.rect(40, 40, pageWidth, 70).fill(primaryColor);
  doc.fillColor('#ffffff')
     .font('Helvetica-Bold').fontSize(16)
     .text(school.name || 'Sacred Heart Matric Hr Sec School', 50, 52, { width: pageWidth - 20, align: 'center' });
  doc.font('Helvetica').fontSize(8)
     .text(school.address || 'Arakkonam — Phone: 00000 00000', 50, 74, { width: pageWidth - 20, align: 'center' });
  doc.fillColor(accentColor).font('Helvetica-Bold').fontSize(10)
     .text('OFFICIAL FEE RECEIPT', 50, 89, { width: pageWidth - 20, align: 'center' });

  // ── Receipt meta ─────────────────────────────────────────────────────────
  doc.rect(40, 115, pageWidth, 30).fill('#f0f4f8');
  doc.fillColor(primaryColor).font('Helvetica-Bold').fontSize(9)
     .text(`Receipt No: ${payment.receipt_number}`, 50, 123)
     .text(`Date: ${formatDate(payment.payment_date)}`, 200, 123, { align: 'right', width: pageWidth - 160 });

  // ── Student details ───────────────────────────────────────────────────────
  doc.fillColor('#333333').font('Helvetica').fontSize(9);
  const row = (label, value, y) => {
    doc.font('Helvetica-Bold').fillColor('#555').text(label + ':', 50, y)
       .font('Helvetica').fillColor('#111').text(value || '—', 160, y);
  };
  let y = 158;
  row('Student Name',    `${student.first_name} ${student.last_name}`, y);
  row('Admission No.',   student.admission_no, y += 18);
  row('Class / Section', `${student.class_name || ''} — Section ${student.section_name || ''}`, y += 18);
  row('Parent / Guardian', student.parent_name, y += 18);
  row('Contact',         student.parent_phone, y += 18);

  // ── Divider ───────────────────────────────────────────────────────────────
  y += 24;
  doc.moveTo(40, y).lineTo(40 + pageWidth, y).strokeColor(accentColor).lineWidth(1.5).stroke();

  // ── Payment details table ─────────────────────────────────────────────────
  y += 10;
  doc.rect(40, y, pageWidth, 20).fill(primaryColor);
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(9)
     .text('Description', 50, y + 6)
     .text('Method', 200, y + 6)
     .text('Amount', 40 + pageWidth - 80, y + 6);

  y += 20;
  doc.rect(40, y, pageWidth, 20).fill('#f9fafb');
  doc.fillColor('#222').font('Helvetica').fontSize(9)
     .text(feeStructure?.fee_name || 'Fee Payment', 50, y + 6)
     .text(payment.payment_method || 'Cash', 200, y + 6)
     .text(formatCurrency(payment.amount_paid), 40 + pageWidth - 80, y + 6);

  // ── Total row ──────────────────────────────────────────────────────────────
  y += 24;
  doc.moveTo(40, y).lineTo(40 + pageWidth, y).strokeColor('#ccc').lineWidth(0.5).stroke();
  y += 6;
  doc.font('Helvetica-Bold').fontSize(10).fillColor(primaryColor)
     .text('Total Paid', 50, y)
     .fillColor(accentColor)
     .text(formatCurrency(payment.amount_paid), 40 + pageWidth - 80, y);

  if (payment.remarks) {
    y += 22;
    doc.font('Helvetica').fontSize(8).fillColor('#666')
       .text(`Remarks: ${payment.remarks}`, 50, y);
  }

  // ── Footer ─────────────────────────────────────────────────────────────────
  const footerY = doc.page.height - 80;
  doc.moveTo(40, footerY).lineTo(40 + pageWidth, footerY).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
  doc.font('Helvetica').fontSize(7.5).fillColor('#888')
     .text('This is a computer-generated receipt and does not require a physical signature.', 50, footerY + 8, { width: pageWidth - 20, align: 'center' })
     .text(`Collected by: ${payment.collected_by_name || 'Admin'} | Printed: ${formatDate(new Date().toISOString())}`, 50, footerY + 20, { width: pageWidth - 20, align: 'center' });

  doc.rect(40, footerY + 35, pageWidth, 18).fill(primaryColor);
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(7)
     .text('Thank you for your prompt payment!', 50, footerY + 41, { width: pageWidth - 20, align: 'center' });

  doc.end();
}

module.exports = { generateFeeReceiptPDF };
