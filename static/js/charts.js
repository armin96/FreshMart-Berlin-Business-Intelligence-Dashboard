/**
 * charts.js
 * ─────────
 * Chart.js factory helpers for the FreshMart Berlin BI Dashboard.
 * All charts use a shared dark-mode theme configuration.
 */

// ── Global Chart.js defaults ─────────────────────────────────────────────────
Chart.defaults.color            = '#94a3b8';
Chart.defaults.borderColor      = 'rgba(255,255,255,0.07)';
Chart.defaults.font.family      = "'Inter', system-ui, sans-serif";
Chart.defaults.font.size        = 12;
Chart.defaults.plugins.legend.labels.boxWidth    = 12;
Chart.defaults.plugins.legend.labels.borderRadius = 3;
Chart.defaults.plugins.legend.labels.padding     = 16;
Chart.defaults.plugins.tooltip.backgroundColor   = '#1e293b';
Chart.defaults.plugins.tooltip.borderColor       = 'rgba(255,255,255,0.12)';
Chart.defaults.plugins.tooltip.borderWidth       = 1;
Chart.defaults.plugins.tooltip.padding           = 10;
Chart.defaults.plugins.tooltip.cornerRadius      = 8;
Chart.defaults.plugins.tooltip.titleColor        = '#e2e8f0';
Chart.defaults.plugins.tooltip.bodyColor         = '#94a3b8';

// ── Colour Palette ────────────────────────────────────────────────────────────
const C = {
  teal:   '#14b8a6',
  coral:  '#f97316',
  violet: '#6366f1',
  pink:   '#ec4899',
  green:  '#22c55e',
  amber:  '#f59e0b',
  red:    '#ef4444',
  blue:   '#3b82f6',
  cyan:   '#06b6d4',
  rose:   '#f43f5e',

  tealA20:  'rgba(20,184,166,0.20)',
  tealA10:  'rgba(20,184,166,0.10)',
  coralA20: 'rgba(249,115,22,0.20)',
  violetA20:'rgba(99,102,241,0.20)',
  greenA20: 'rgba(34,197,94,0.20)',
};

const CAT_COLORS = [C.teal, C.coral, C.violet, C.amber, C.pink, C.blue];

/**
 * Gradient helper — vertical gradient for area/bar fills.
 */
function grad(ctx, colorTop, colorBot) {
  const g = ctx.createLinearGradient(0, 0, 0, ctx.canvas.height);
  g.addColorStop(0, colorTop);
  g.addColorStop(1, colorBot);
  return g;
}

// ── Shared axis config ────────────────────────────────────────────────────────
const xAxis = (label) => ({
  type: 'category',
  grid: { color: 'rgba(255,255,255,0.04)' },
  ticks: { maxTicksLimit: 10, maxRotation: 0 },
  title: label ? { display: true, text: label, color: '#475569', font: { size: 11 } } : {},
});

const yAxis = (label, prefix = '', suffix = '') => ({
  grid: { color: 'rgba(255,255,255,0.06)' },
  ticks: {
    maxTicksLimit: 6,
    callback: (v) => `${prefix}${fmt(v)}${suffix}`,
  },
  title: label ? { display: true, text: label, color: '#475569', font: { size: 11 } } : {},
});

// ── Number formatter ──────────────────────────────────────────────────────────
function fmt(n) {
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (Math.abs(n) >= 1_000)     return (n / 1_000).toFixed(1) + 'k';
  return n.toLocaleString('de-DE', { maximumFractionDigits: 1 });
}

// ── Destroy helper (avoids "canvas already in use" errors) ───────────────────
const _charts = {};

function destroyChart(id) {
  if (_charts[id]) { _charts[id].destroy(); delete _charts[id]; }
}

function register(id, chart) {
  _charts[id] = chart;
  return chart;
}

// ═════════════════════════════════════════════════════════════════════════════
// Chart factory functions
// ═════════════════════════════════════════════════════════════════════════════

/**
 * makeLineChart — revenue / margin trend (line with gradient fill)
 */
function makeLineChart(id, labels, datasets) {
  destroyChart(id);
  const canvas = document.getElementById(id);
  const ctx = canvas.getContext('2d');
  return register(id, new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: datasets.map((ds, i) => ({
        label:           ds.label,
        data:            ds.data,
        borderColor:     ds.color || CAT_COLORS[i],
        backgroundColor: ds.fill
          ? grad(ctx, (ds.color || CAT_COLORS[i]).replace(')', ',0.25)').replace('rgb', 'rgba'), 'transparent')
          : 'transparent',
        fill:            !!ds.fill,
        tension:         0.4,
        pointRadius:     2,
        pointHoverRadius: 5,
        borderWidth:     2.5,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'top' },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.dataset.label}: €${fmt(ctx.parsed.y)}`,
          },
        },
      },
      scales: {
        x: xAxis(),
        y: yAxis('€', '€'),
      },
      animation: { duration: 600, easing: 'easeOutQuart' },
    },
  }));
}

/**
 * makeBarChart — generic vertical bar
 */
function makeBarChart(id, labels, datasets, opts = {}) {
  destroyChart(id);
  const canvas = document.getElementById(id);
  const ctx = canvas.getContext('2d');
  return register(id, new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: datasets.map((ds, i) => ({
        label:           ds.label,
        data:            ds.data,
        backgroundColor: ds.colors || (ds.color || CAT_COLORS[i]),
        borderRadius:    4,
        borderSkipped:   false,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: datasets.length > 1 },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.dataset.label}: ${opts.prefix || '€'}${fmt(ctx.parsed.y)}${opts.suffix || ''}`,
          },
        },
      },
      scales: {
        x: { ...xAxis(), stacked: !!opts.stacked, grid: { display: false } },
        y: { ...yAxis(opts.yLabel, opts.prefix || '€', opts.suffix || ''), stacked: !!opts.stacked },
      },
      animation: { duration: 500 },
    },
  }));
}

/**
 * makeHorizontalBarChart — for branch ranking etc.
 */
function makeHorizontalBarChart(id, labels, data, color = C.teal) {
  destroyChart(id);
  const canvas = document.getElementById(id);
  const ctx = canvas.getContext('2d');
  return register(id, new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Revenue (€)',
        data,
        backgroundColor: labels.map((_, i) =>
          i === 0 ? C.coral : i === 1 ? C.teal : 'rgba(99,102,241,0.7)'
        ),
        borderRadius: 5,
        borderSkipped: false,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: (ctx) => ` €${fmt(ctx.parsed.x)}` },
        },
      },
      scales: {
        x: { ...yAxis('Revenue', '€'), grid: { color: 'rgba(255,255,255,0.05)' } },
        y: { grid: { display: false }, ticks: { font: { size: 12, weight: '500' } } },
      },
      animation: { duration: 600 },
    },
  }));
}

/**
 * makeDonutChart
 */
function makeDonutChart(id, labels, data, colors) {
  destroyChart(id);
  const canvas = document.getElementById(id);
  const ctx = canvas.getContext('2d');
  const palette = colors || CAT_COLORS;
  return register(id, new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: palette.slice(0, labels.length),
        borderColor:     '#0f2040',
        borderWidth:     3,
        hoverOffset:     8,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '65%',
      plugins: {
        legend: { position: 'right', labels: { padding: 14 } },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const pct   = ((ctx.parsed / total) * 100).toFixed(1);
              return ` €${fmt(ctx.parsed)} (${pct}%)`;
            },
          },
        },
      },
      animation: { animateRotate: true, duration: 700 },
    },
  }));
}

/**
 * makeAreaChart — for footfall
 */
function makeAreaChart(id, labels, data, color = C.teal) {
  destroyChart(id);
  const canvas = document.getElementById(id);
  const ctx = canvas.getContext('2d');
  const gradient = grad(ctx, color.replace(')', ',0.3)').replace('#', 'rgba(').replace(/^rgba\(([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/, (_, r, g, b) => `rgba(${parseInt(r,16)},${parseInt(g,16)},${parseInt(b,16)}`), 'rgba(0,0,0,0)');

  // simpler approach: use inline rgba for gradient
  const g2 = ctx.createLinearGradient(0, 0, 0, 320);
  g2.addColorStop(0, 'rgba(20,184,166,0.30)');
  g2.addColorStop(1, 'rgba(20,184,166,0.00)');

  return register(id, new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label:           'Visitors',
        data,
        borderColor:     color,
        backgroundColor: g2,
        fill:            true,
        tension:         0.4,
        pointRadius:     0,
        pointHoverRadius: 5,
        borderWidth:     2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: (ctx) => ` ${fmt(ctx.parsed.y)} visitors` },
        },
      },
      scales: {
        x: xAxis(),
        y: yAxis('Visitors'),
      },
      animation: { duration: 600 },
    },
  }));
}

/**
 * makeRadarChart — branch multi-KPI comparison
 */
function makeRadarChart(id, labels, datasets) {
  destroyChart(id);
  const canvas = document.getElementById(id);
  const ctx = canvas.getContext('2d');
  return register(id, new Chart(ctx, {
    type: 'radar',
    data: {
      labels,
      datasets: datasets.map((ds, i) => ({
        label:                ds.label,
        data:                 ds.data,
        borderColor:          CAT_COLORS[i % CAT_COLORS.length],
        backgroundColor:      CAT_COLORS[i % CAT_COLORS.length].replace(')', ',0.12)').replace('#', 'rgba('),
        pointBackgroundColor: CAT_COLORS[i % CAT_COLORS.length],
        pointRadius:          4,
        borderWidth:          2,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        r: {
          min: 0, max: 100,
          ticks: { stepSize: 25, backdropColor: 'transparent' },
          grid: { color: 'rgba(255,255,255,0.08)' },
          angleLines: { color: 'rgba(255,255,255,0.08)' },
          pointLabels: { color: '#94a3b8', font: { size: 11 } },
        },
      },
      plugins: { legend: { position: 'top' } },
      animation: { duration: 700 },
    },
  }));
}

/**
 * makeStackedBarChart — revenue / COGS / margin per branch
 */
function makeStackedBarChart(id, labels, datasets) {
  destroyChart(id);
  const canvas = document.getElementById(id);
  const ctx = canvas.getContext('2d');
  const palette = [C.teal, C.coral, C.violet];
  return register(id, new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: datasets.map((ds, i) => ({
        label:           ds.label,
        data:            ds.data,
        backgroundColor: palette[i] || CAT_COLORS[i],
        borderRadius:    i === datasets.length - 1 ? 4 : 0,
        borderSkipped:   false,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'top' },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.dataset.label}: €${fmt(ctx.parsed.y)}`,
          },
        },
      },
      scales: {
        x: { grid: { display: false }, stacked: true },
        y: { ...yAxis('€', '€'), stacked: true },
      },
      animation: { duration: 600 },
    },
  }));
}

/**
 * makeWasteHorizontalBar — waste by branch (horizontal)
 */
function makeWasteBranchChart(id, labels, data) {
  destroyChart(id);
  const canvas = document.getElementById(id);
  const ctx = canvas.getContext('2d');
  return register(id, new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Waste Value (€)',
        data,
        backgroundColor: data.map((_, i) =>
          i < 3 ? C.red : i < 6 ? C.amber : C.green
        ),
        borderRadius: 4,
        borderSkipped: false,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (c) => ` €${fmt(c.parsed.x)}` } },
      },
      scales: {
        x: { ...yAxis('Waste (€)', '€'), grid: { color: 'rgba(255,255,255,0.05)' } },
        y: { grid: { display: false } },
      },
      animation: { duration: 600 },
    },
  }));
}

/**
 * buildHeatmap — custom DOM heatmap for footfall (hour × day-of-week)
 */
function buildHeatmap(containerId, heatmapData) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const DAYS  = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const HOURS = Array.from({ length: 15 }, (_, i) => `${i + 7}:00`);

  // Build lookup
  const lookup = {};
  let maxVal = 0;
  heatmapData.forEach(({ hour, dow, value }) => {
    lookup[`${hour}_${dow}`] = value;
    if (value > maxVal) maxVal = value;
  });

  // Build grid: rows = hours, columns = days (+ label col)
  const COLS = DAYS.length + 1;
  const ROWS = HOURS.length + 1;

  const grid = document.createElement('div');
  grid.className = 'heatmap-grid';
  grid.style.gridTemplateColumns = `44px repeat(${DAYS.length}, 1fr)`;
  grid.style.gridTemplateRows    = `24px repeat(${HOURS.length}, 28px)`;

  // Header row: empty corner + day labels
  const corner = document.createElement('div');
  grid.appendChild(corner);
  DAYS.forEach(d => {
    const el = document.createElement('div');
    el.className = 'heatmap-col-label';
    el.textContent = d;
    grid.appendChild(el);
  });

  // Data rows
  HOURS.forEach((h, hi) => {
    // Hour label
    const label = document.createElement('div');
    label.className = 'heatmap-label';
    label.textContent = h;
    grid.appendChild(label);

    // Day cells
    DAYS.forEach((_, di) => {
      const realDow = di; // 0 = Mon
      const val     = lookup[`${hi + 7}_${realDow}`] || 0;
      const pct     = maxVal > 0 ? val / maxVal : 0;

      const cell = document.createElement('div');
      cell.className = 'heatmap-cell';

      // Colour: teal gradient
      const alpha = 0.08 + pct * 0.85;
      const light = Math.round(pct * 180);
      cell.style.background = `rgba(${20 + light * 0.3}, ${184 - light * 0.2}, ${166 - light * 0.4}, ${alpha.toFixed(2)})`;
      cell.setAttribute('data-tooltip', `${h} ${DAYS[di]}: ${val} visitors`);

      grid.appendChild(cell);
    });
  });

  container.innerHTML = '';
  container.appendChild(grid);
}
