/* Sacred Heart CRM — Canvas Chart Library */
'use strict';

const SchoolCharts = (() => {
  const COLORS = {
    primary: '#1e3a5f',
    accent:  '#d4a843',
    success: '#22c55e',
    danger:  '#ef4444',
    warning: '#f59e0b',
    info:    '#3b82f6',
    purple:  '#8b5cf6',
    teal:    '#14b8a6',
    muted:   '#94a3b8',
    palette: ['#1e3a5f','#d4a843','#22c55e','#ef4444','#3b82f6','#8b5cf6','#14b8a6','#f59e0b']
  };

  // ── Bar Chart ─────────────────────────────────────────────────────────────
  function drawBarChart(canvasId, labels, datasets, options = {}) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx    = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const padTop = 20, padBottom = 50, padLeft = 60, padRight = 20;
    const chartW = W - padLeft - padRight;
    const chartH = H - padTop - padBottom;

    ctx.clearRect(0, 0, W, H);

    // Determine max value
    const allVals = datasets.flatMap(d => d.data);
    const maxVal  = Math.max(...allVals, 1);
    const yStep   = niceStep(maxVal);
    const yMax    = Math.ceil(maxVal / yStep) * yStep;

    // Y gridlines & labels
    ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 0.8;
    ctx.fillStyle = '#94a3b8'; ctx.font = '11px Inter, sans-serif';
    ctx.textAlign = 'right';
    const ySteps = Math.min(5, Math.ceil(yMax / yStep));
    for (let i = 0; i <= ySteps; i++) {
      const val = (yMax / ySteps) * i;
      const y   = padTop + chartH - (val / yMax) * chartH;
      ctx.beginPath(); ctx.moveTo(padLeft, y); ctx.lineTo(padLeft + chartW, y); ctx.stroke();
      ctx.fillText(formatNum(val), padLeft - 6, y + 4);
    }

    // Bars
    const groupW   = chartW / labels.length;
    const barPad   = groupW * 0.15;
    const barW     = (groupW - barPad * 2) / datasets.length;

    datasets.forEach((ds, di) => {
      ctx.fillStyle = ds.color || COLORS.palette[di % COLORS.palette.length];
      ds.data.forEach((val, i) => {
        const x  = padLeft + barPad + i * groupW + di * barW;
        const bH = (val / yMax) * chartH;
        const y  = padTop + chartH - bH;
        roundRect(ctx, x, y, barW - 2, bH, 4);
        ctx.fill();
      });
    });

    // X labels
    ctx.fillStyle = '#475569'; ctx.textAlign = 'center'; ctx.font = '11px Inter, sans-serif';
    labels.forEach((label, i) => {
      const x = padLeft + i * groupW + groupW / 2;
      ctx.fillText(label, x, padTop + chartH + 20);
    });

    // Legend
    if (datasets.length > 1) {
      let lx = padLeft;
      datasets.forEach((ds, di) => {
        ctx.fillStyle = ds.color || COLORS.palette[di % COLORS.palette.length];
        ctx.fillRect(lx, H - 12, 12, 10);
        ctx.fillStyle = '#475569'; ctx.textAlign = 'left'; ctx.font = '11px Inter';
        ctx.fillText(ds.label || '', lx + 16, H - 3);
        lx += ds.label ? ds.label.length * 7 + 28 : 48;
      });
    }
  }

  // ── Donut Chart ───────────────────────────────────────────────────────────
  function drawDonutChart(canvasId, labels, data, colors, centerLabel = '') {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const cx = W / 2, cy = H / 2;
    const radius = Math.min(cx, cy) * 0.82;
    const innerR = radius * 0.58;

    ctx.clearRect(0, 0, W, H);
    const total = data.reduce((a, b) => a + b, 0);
    if (total === 0) return;

    let startAngle = -Math.PI / 2;
    data.forEach((val, i) => {
      const slice = (val / total) * 2 * Math.PI;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, startAngle, startAngle + slice);
      ctx.closePath();
      ctx.fillStyle = colors[i] || COLORS.palette[i];
      ctx.fill();
      startAngle += slice;
    });

    // Inner circle (donut hole)
    ctx.beginPath();
    ctx.arc(cx, cy, innerR, 0, 2 * Math.PI);
    ctx.fillStyle = '#fff';
    ctx.fill();

    // Center label
    if (centerLabel) {
      const [line1, line2] = centerLabel.split('\n');
      ctx.fillStyle = '#1a2332';
      ctx.font = 'bold 20px Inter, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(line1, cx, cy + 6);
      if (line2) {
        ctx.font = '11px Inter, sans-serif'; ctx.fillStyle = '#94a3b8';
        ctx.fillText(line2, cx, cy + 22);
      }
    }
  }

  // ── Line Chart ────────────────────────────────────────────────────────────
  function drawLineChart(canvasId, labels, datasets, options = {}) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const padTop = 20, padBottom = 50, padLeft = 60, padRight = 20;
    const chartW = W - padLeft - padRight;
    const chartH = H - padTop - padBottom;

    ctx.clearRect(0, 0, W, H);
    const allVals = datasets.flatMap(d => d.data);
    const maxVal  = Math.max(...allVals, 1);
    const yStep   = niceStep(maxVal);
    const yMax    = Math.ceil(maxVal / yStep) * yStep;

    // Grid
    ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 0.8;
    ctx.fillStyle = '#94a3b8'; ctx.font = '11px Inter'; ctx.textAlign = 'right';
    const ySteps = 5;
    for (let i = 0; i <= ySteps; i++) {
      const val = (yMax / ySteps) * i;
      const y   = padTop + chartH - (val / yMax) * chartH;
      ctx.beginPath(); ctx.moveTo(padLeft, y); ctx.lineTo(padLeft + chartW, y); ctx.stroke();
      ctx.fillText(formatNum(val), padLeft - 6, y + 4);
    }

    const stepX = chartW / Math.max(labels.length - 1, 1);

    datasets.forEach((ds, di) => {
      const color = ds.color || COLORS.palette[di % COLORS.palette.length];
      const pts   = ds.data.map((val, i) => ({
        x: padLeft + i * stepX,
        y: padTop + chartH - (val / yMax) * chartH
      }));

      // Gradient fill
      const grad = ctx.createLinearGradient(0, padTop, 0, padTop + chartH);
      grad.addColorStop(0, color + '33');
      grad.addColorStop(1, color + '00');
      ctx.beginPath();
      ctx.moveTo(pts[0].x, padTop + chartH);
      pts.forEach(p => ctx.lineTo(p.x, p.y));
      ctx.lineTo(pts[pts.length-1].x, padTop + chartH);
      ctx.closePath();
      ctx.fillStyle = grad; ctx.fill();

      // Line
      ctx.beginPath();
      pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
      ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.stroke();

      // Dots
      pts.forEach(p => {
        ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, 2 * Math.PI);
        ctx.fillStyle = '#fff'; ctx.fill();
        ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.stroke();
      });
    });

    // X labels
    ctx.fillStyle = '#475569'; ctx.textAlign = 'center'; ctx.font = '11px Inter';
    labels.forEach((label, i) => {
      ctx.fillText(label, padLeft + i * stepX, padTop + chartH + 20);
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function roundRect(ctx, x, y, w, h, r) {
    if (h < 0) return;
    r = Math.min(r, h / 2, w / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function niceStep(maxVal) {
    const rough = maxVal / 5;
    const pow   = Math.pow(10, Math.floor(Math.log10(rough)));
    const nice  = [1, 2, 5, 10];
    let step    = pow;
    nice.forEach(n => { if (rough / pow >= n) step = n * pow; });
    return step || 1;
  }

  function formatNum(n) {
    if (n >= 100000) return (n/100000).toFixed(1) + 'L';
    if (n >= 1000)   return (n/1000).toFixed(1) + 'K';
    return Math.round(n).toString();
  }

  return { drawBarChart, drawDonutChart, drawLineChart, COLORS };
})();

window.SchoolCharts = SchoolCharts;
