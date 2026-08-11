/* Sacred Heart School CRM — Frontend JavaScript */
'use strict';

// ── DOM Ready ─────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initSidebar();
  initToasts();
  initSearch();
  initConfirmDelete();
  initTopbarDate();
  initSelectSections();
  initStudentSearch();
  highlightActiveNav();
  animateCounters();
  initAttendanceMark();
  initPrint();
});

// ── Sidebar Toggle ────────────────────────────────────────────────────────────
function initSidebar() {
  const toggle  = document.getElementById('sidebarToggle');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (!toggle || !sidebar) return;

  toggle.addEventListener('click', () => {
    sidebar.classList.toggle('open');
    overlay && overlay.classList.toggle('show');
  });
  overlay && overlay.addEventListener('click', () => {
    sidebar.classList.remove('open');
    overlay.classList.remove('show');
  });
}

// ── Active Nav Highlight ──────────────────────────────────────────────────────
function highlightActiveNav() {
  const path  = window.location.pathname;
  document.querySelectorAll('.nav-link').forEach(link => {
    const href = link.getAttribute('href') || '';
    if (href && href !== '/' && path.startsWith(href)) {
      link.classList.add('active');
    }
  });
}

// ── Topbar Date ───────────────────────────────────────────────────────────────
function initTopbarDate() {
  const el = document.getElementById('topbarDate');
  if (!el) return;
  const d = new Date();
  el.textContent = d.toLocaleDateString('en-IN', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric'
  });
}

// ── Toast Notifications ───────────────────────────────────────────────────────
function initToasts() {
  const flashEl = document.getElementById('flashData');
  if (!flashEl) return;
  const { type, message } = flashEl.dataset;
  if (message) showToast(message, type || 'success');
}

function showToast(message, type = 'success', duration = 4000) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
  toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(60px)';
    toast.style.transition = '0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ── Confirm Delete ────────────────────────────────────────────────────────────
function initConfirmDelete() {
  document.querySelectorAll('[data-confirm]').forEach(btn => {
    btn.addEventListener('click', e => {
      const msg = btn.dataset.confirm || 'Are you sure?';
      if (!confirm(msg)) e.preventDefault();
    });
  });

  document.querySelectorAll('form[data-confirm]').forEach(form => {
    form.addEventListener('submit', e => {
      const msg = form.dataset.confirm || 'Are you sure?';
      if (!confirm(msg)) e.preventDefault();
    });
  });
}

// ── Generic Search Input ──────────────────────────────────────────────────────
function initSearch() {
  document.querySelectorAll('.search-form-input').forEach(input => {
    let timeout;
    input.addEventListener('input', () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        const form = input.closest('form');
        if (form) form.submit();
      }, 600);
    });
  });
}

// ── Dynamic Section Dropdown ──────────────────────────────────────────────────
function initSelectSections() {
  const classSelect   = document.getElementById('class_id');
  const sectionSelect = document.getElementById('section_id');
  if (!classSelect || !sectionSelect) return;

  classSelect.addEventListener('change', async () => {
    const classId = classSelect.value;
    sectionSelect.innerHTML = '<option value="">-- Select Section --</option>';
    if (!classId) return;
    try {
      const res     = await fetch(`/api/sections/${classId}`);
      const { sections } = await res.json();
      sections.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id; opt.textContent = `Section ${s.name}`;
        sectionSelect.appendChild(opt);
      });
    } catch(e) {}
  });
}

// ── Student Autocomplete Search ───────────────────────────────────────────────
function initStudentSearch() {
  const input       = document.getElementById('studentSearchInput');
  const results     = document.getElementById('studentSearchResults');
  const hiddenId    = document.getElementById('student_id');
  if (!input || !results) return;

  let timeout;
  input.addEventListener('input', () => {
    clearTimeout(timeout);
    const q = input.value.trim();
    if (q.length < 2) { results.innerHTML = ''; results.style.display = 'none'; return; }
    timeout = setTimeout(async () => {
      try {
        const res  = await fetch(`/api/students/search?q=${encodeURIComponent(q)}&limit=8`);
        const data = await res.json();
        if (!data.students.length) {
          results.innerHTML = '<div class="search-result-item" style="color:#94a3b8">No results found</div>';
        } else {
          results.innerHTML = data.students.map(s => `
            <div class="search-result-item" data-id="${s.id}" data-name="${s.first_name} ${s.last_name}"
                 style="padding:10px 14px;cursor:pointer;border-bottom:1px solid #f1f5f9;font-size:13px;display:flex;gap:10px;align-items:center">
              <div>
                <strong>${s.first_name} ${s.last_name}</strong>
                <span style="color:#94a3b8;font-size:11px;margin-left:8px">${s.admission_no}</span>
                <div style="font-size:11.5px;color:#64748b">${s.class_name || ''} — ${s.parent_phone || ''}</div>
              </div>
            </div>
          `).join('');
        }
        results.style.cssText = 'display:block;position:absolute;z-index:999;background:#fff;border:1.5px solid #e2e8f0;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,0.12);max-height:300px;overflow-y:auto;width:100%;top:100%;left:0;margin-top:4px';

        results.querySelectorAll('.search-result-item[data-id]').forEach(item => {
          item.addEventListener('mouseenter', () => item.style.background = '#f8fafc');
          item.addEventListener('mouseleave', () => item.style.background = '#fff');
          item.addEventListener('click', () => {
            input.value = item.dataset.name;
            if (hiddenId) hiddenId.value = item.dataset.id;
            results.style.display = 'none';
            // Trigger fee load
            loadStudentFees(item.dataset.id);
            // Auto-submit fee collect form
            const form = input.closest('form');
            if (form && form.id === 'studentQuickSearch') {
              window.location.href = `/fees/collect?student_id=${item.dataset.id}`;
            }
          });
        });
      } catch(e) {}
    }, 300);
  });

  document.addEventListener('click', e => {
    if (!input.contains(e.target) && !results.contains(e.target)) {
      results.style.display = 'none';
    }
  });
}

async function loadStudentFees(studentId) {
  const wrap = document.getElementById('feeDetailsWrap');
  if (!wrap) return;
  try {
    const res  = await fetch(`/api/students/${studentId}/fees`);
    const data = await res.json();
    document.getElementById('feeTotal')   && (document.getElementById('feeTotal').textContent   = '₹' + data.totalFee.toLocaleString('en-IN'));
    document.getElementById('feePaid')    && (document.getElementById('feePaid').textContent     = '₹' + data.totalPaid.toLocaleString('en-IN'));
    document.getElementById('feeBalance') && (document.getElementById('feeBalance').textContent  = '₹' + data.balance.toLocaleString('en-IN'));
  } catch(e) {}
}

// ── Animate counters ──────────────────────────────────────────────────────────
function animateCounters() {
  document.querySelectorAll('[data-counter]').forEach(el => {
    const target = parseInt(el.textContent.replace(/[^0-9]/g, ''));
    if (isNaN(target)) return;
    let current = 0;
    const step     = Math.ceil(target / 50);
    const interval = setInterval(() => {
      current = Math.min(current + step, target);
      el.textContent = current.toLocaleString('en-IN');
      if (current >= target) clearInterval(interval);
    }, 18);
  });
}

// ── Attendance Mark UI ────────────────────────────────────────────────────────
function initAttendanceMark() {
  const markAll = document.getElementById('markAllPresent');
  if (!markAll) return;
  markAll.addEventListener('click', () => {
    document.querySelectorAll('.att-radio-label.p input').forEach(r => {
      r.checked = true; r.dispatchEvent(new Event('change'));
    });
  });

  // Keyboard shortcut: P=present, A=absent, L=leave
  document.addEventListener('keydown', e => {
    if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'SELECT' && e.target.tagName !== 'TEXTAREA') {
      if (e.key === 'p') document.getElementById('markAllPresent')?.click();
    }
  });
}

// ── Print ─────────────────────────────────────────────────────────────────────
function initPrint() {
  document.querySelectorAll('[data-print]').forEach(btn => {
    btn.addEventListener('click', () => window.print());
  });
}

// ── Expose globally ───────────────────────────────────────────────────────────
window.showToast = showToast;
