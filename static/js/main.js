/**
 * main.js
 * ───────
 * Dashboard orchestration for FreshMart Berlin BI Dashboard.
 * Handles: navigation, filter state, API calls, chart rendering,
 *          live ticker, and the footfall heatmap.
 */

'use strict';

// ── State ─────────────────────────────────────────────────────────────────────
const state = {
  branch: 'all',
  period: '30d',
  granularity: 'daily',
  section: 'overview',
};

// ── DOM refs ──────────────────────────────────────────────────────────────────
const branchSelect = document.getElementById('branchSelect');
const periodSelect = document.getElementById('periodSelect');
const sectionTitle = document.getElementById('section-title');
const sectionSub = document.getElementById('section-subtitle');
const tickerText = document.getElementById('tickerText');
const updateTime = document.getElementById('updateTime');
const lowStockBody = document.getElementById('lowStockBody');
const lowStockBadge = document.getElementById('lowStockBadge');
const peakHourBadge = document.getElementById('peakHourBadge');

// ── Helper: fetch JSON from API ───────────────────────────────────────────────
async function api(endpoint, params = {}) {
  const base = { branch: state.branch, period: state.period, ...params };
  const qs = new URLSearchParams(base).toString();
  const res = await fetch(`${endpoint}?${qs}`);
  if (!res.ok) throw new Error(`API error ${res.status} on ${endpoint}`);
  return res.json();
}

// ── Helper: format numbers ────────────────────────────────────────────────────
function fmtEuro(n) {
  return '€' + Number(n).toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function fmtNum(n) {
  return Number(n).toLocaleString('de-DE');
}

// ── Navigation ────────────────────────────────────────────────────────────────
function activateSection(id) {
  document.querySelectorAll('.dashboard-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const section = document.getElementById(id);
  const navItem = document.getElementById(`nav-${id}`);
  if (section) section.classList.add('active');
  if (navItem) navItem.classList.add('active');

  state.section = id;
  sectionTitle.textContent = section?.dataset.title || id;
  const branchLabel = state.branch === 'all' ? 'All branches' : state.branch;
  const periodLabel = periodSelect.options[periodSelect.selectedIndex]?.text || '';
  sectionSub.textContent = `${branchLabel} · ${periodLabel}`;

  loadSection(id);
}

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    activateSection(item.dataset.section);
  });
});

// ── Sidebar toggle (mobile) ───────────────────────────────────────────────────
document.getElementById('sidebarToggle').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('open');
});

// ── Filter controls ───────────────────────────────────────────────────────────
branchSelect.addEventListener('change', () => {
  state.branch = branchSelect.value;
  loadSection(state.section);
  updateSubtitle();
});

periodSelect.addEventListener('change', () => {
  state.period = periodSelect.value;
  loadSection(state.section);
  updateSubtitle();
});

function updateSubtitle() {
  const branchLabel = state.branch === 'all' ? 'All branches' : state.branch;
  const periodLabel = periodSelect.options[periodSelect.selectedIndex]?.text || '';
  sectionSub.textContent = `${branchLabel} · ${periodLabel}`;
}

// ── Granularity chips ─────────────────────────────────────────────────────────
document.querySelectorAll('.chip[data-granularity]').forEach(chip => {
  chip.addEventListener('click', () => {
    // Update siblings in same control group
    chip.closest('.chart-controls')?.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    state.granularity = chip.dataset.granularity;
    // Reload the section to re-render the relevant chart
    loadSection(state.section);
  });
});

// ── KPI Summary Cards ─────────────────────────────────────────────────────────
async function loadSummary() {
  try {
    const d = await api('/api/summary');

    document.getElementById('kpiRevenue').textContent = fmtEuro(d.total_revenue);
    const changeEl = document.getElementById('kpiRevenueChange');
    const sign = d.revenue_change >= 0 ? '+' : '';
    changeEl.textContent = `${sign}${d.revenue_change}% vs prev period`;
    changeEl.className = `kpi-change ${d.revenue_change >= 0 ? 'up' : 'down'}`;

    document.getElementById('kpiMargin').textContent = `${d.margin_pct}%`;
    document.getElementById('kpiMarginSub').textContent = 'Gross margin rate';

    document.getElementById('kpiFootfall').textContent = fmtNum(d.total_footfall);
    document.getElementById('kpiFootfallSub').textContent = 'Total visitors';

    document.getElementById('kpiUnits').textContent = fmtNum(d.units_sold);
    document.getElementById('kpiUnitsSub').textContent = 'Items sold';

    document.getElementById('kpiWaste').textContent = `${d.waste_pct}%`;
    document.getElementById('kpiWasteSub').textContent = `€${fmtNum(d.total_waste_val)} wasted`;
  } catch (err) {
    console.error('Summary load failed:', err);
  }
}

// ── Section loader — dispatches to the right loader ───────────────────────────
function loadSection(id) {
  const loaders = {
    overview:      loadOverview,
    sales:         loadSales,
    inventory:     loadInventory,
    footfall:      loadFootfall,
    categories:    loadCategories,
    branches:      loadBranches,
    profitability: loadProfitability,
    waste:         loadWaste,
    employees:     loadEmployees,
  };
  if (loaders[id]) loaders[id]();
}

// ── Overview ──────────────────────────────────────────────────────────────────
async function loadOverview() {
  await loadSummary();

  // Sales line
  try {
    const d = await api('/api/sales', { granularity: state.granularity });
    makeLineChart('overviewSalesChart', d.labels, [
      { label: 'Revenue', data: d.revenue, color: C.teal, fill: true },
      { label: 'Margin', data: d.margin, color: C.coral, fill: false },
    ]);
  } catch (e) { console.error(e); }

  // Donut
  try {
    const d = await api('/api/categories');
    makeDonutChart('overviewDonutChart', d.labels, d.revenue);
  } catch (e) { console.error(e); }
}

// ── Sales & Revenue ───────────────────────────────────────────────────────────
async function loadSales() {
  try {
    const d = await api('/api/sales', { granularity: state.granularity });
    makeLineChart('salesLineChart', d.labels, [
      { label: 'Revenue', data: d.revenue, color: C.teal, fill: true },
      { label: 'COGS', data: d.cogs, color: C.coral, fill: false },
      { label: 'Margin', data: d.margin, color: C.green, fill: false },
    ]);
    makeBarChart('salesBarChart', d.labels, [
      { label: 'Revenue', data: d.revenue, color: C.violet },
    ]);
  } catch (e) { console.error(e); }
}

// ── Inventory ─────────────────────────────────────────────────────────────────
async function loadInventory() {
  try {
    const d = await api('/api/inventory');

    // Bar: category average stock
    const cats = Object.keys(d.category_avg);
    const vals = cats.map(c => d.category_avg[c]);
    makeBarChart('invBarChart', cats, [
      { label: 'Avg Stock', data: vals, colors: CAT_COLORS.slice(0, cats.length) },
    ], { prefix: '', suffix: ' units', yLabel: 'Units' });

    // Badge
    if (lowStockBadge) lowStockBadge.textContent = `${d.total_low_stock} alerts`;

    // Table
    if (lowStockBody) {
      lowStockBody.innerHTML = d.low_stock_items.map(row => {
        const stock = parseFloat(row.stock_level);
        const cls = stock < 10 ? 'stock-critical' : stock < 20 ? 'stock-warning' : 'stock-ok';
        const label = stock < 10 ? '🔴 Critical' : stock < 20 ? '🟡 Low' : '🟢 OK';
        return `<tr>
          <td>${row.branch}</td>
          <td>${row.product}</td>
          <td>${row.category}</td>
          <td class="${cls}">${Math.round(stock)}</td>
          <td class="${cls}">${label}</td>
        </tr>`;
      }).join('');
    }
  } catch (e) { console.error(e); }
}

// ── Footfall ──────────────────────────────────────────────────────────────────
async function loadFootfall() {
  try {
    const d = await api('/api/footfall');
    makeAreaChart('footfallAreaChart', d.daily_labels, d.daily_visitors);
    if (peakHourBadge) peakHourBadge.textContent = `⏰ Peak: ${d.peak_hour}:00`;
    buildHeatmap('heatmapContainer', d.heatmap);
  } catch (e) { console.error(e); }
}

// ── Categories ────────────────────────────────────────────────────────────────
async function loadCategories() {
  try {
    const d = await api('/api/categories');
    makeDonutChart('catDonutChart', d.labels, d.revenue);
    makeBarChart('catBarChart', d.labels, [
      { label: 'Units Sold', data: d.units, color: C.teal },
      { label: 'Margin (€)', data: d.margin, color: C.coral },
    ], { prefix: '', yLabel: 'Value' });
  } catch (e) { console.error(e); }
}

// ── Branches ──────────────────────────────────────────────────────────────────
async function loadBranches() {
  try {
    const d = await api('/api/branches');

    // Radar: top 5 branches for readability
    const top5 = d.slice(0, 5);
    makeRadarChart('branchRadarChart',
      ['Revenue', 'Margin', 'Footfall', 'Low Waste'],
      top5.map(b => ({
        label: b.branch,
        data: [b.revenue_norm, b.margin_norm, b.footfall_norm, b.waste_norm],
      }))
    );

    // Horizontal bar: all branches by revenue
    const sorted = [...d].sort((a, b) => b.revenue - a.revenue);
    makeHorizontalBarChart(
      'branchBarChart',
      sorted.map(b => b.branch),
      sorted.map(b => b.revenue)
    );
  } catch (e) { console.error(e); }
}

// ── Profitability ─────────────────────────────────────────────────────────────
async function loadProfitability() {
  try {
    const d = await api('/api/profitability');
    makeStackedBarChart('profitStackedChart', d.labels, [
      { label: 'COGS', data: d.cogs },
      { label: 'Margin', data: d.margin },
    ]);
    makeBarChart('profitMarginChart', d.labels, [
      { label: 'Margin %', data: d.margin_pct, color: C.green },
    ], { prefix: '', suffix: '%', yLabel: 'Margin %' });
  } catch (e) { console.error(e); }
}

// ── Waste ─────────────────────────────────────────────────────────────────────
async function loadWaste() {
  try {
    const d = await api('/api/waste');
    makeLineChart('wasteTrendChart', d.daily_labels, [
      { label: 'Waste (€)', data: d.daily_waste, color: C.red, fill: true },
    ]);
    makeBarChart('wasteCatChart',
      d.category_pct.map(r => r.category),
      [{ label: 'Waste %', data: d.category_pct.map(r => r.waste_pct), colors: CAT_COLORS }],
      { prefix: '', suffix: '%', yLabel: 'Waste %' }
    );
    makeWasteBranchChart(
      'wasteBranchChart',
      d.branch_waste.map(r => r.branch),
      d.branch_waste.map(r => r.waste_value)
    );
  } catch (e) { console.error(e); }
}

// ── Employees ─────────────────────────────────────────────────────────────────
async function loadEmployees() {
  try {
    const d = await api('/api/employees');

    // KPI cards (2 only)
    document.getElementById('empAvgStaff').textContent   = fmtNum(d.avg_daily_staff);
    document.getElementById('empTotalHours').textContent = fmtNum(d.total_hours) + ' h';

    // Daily staff trend (area chart)
    makeAreaChart('empStaffTrendChart', d.daily_labels, d.daily_staff, C.violet);

    // Revenue per employee by branch (horizontal bar)
    makeHorizontalBarChart('empRevPerStaffChart', d.branch_labels, d.revenue_per_staff);

    // Revenue per staff hour (horizontal bar)
    const hourSorted = d.branch_labels
      .map((b, i) => ({ b, v: d.revenue_per_hour[i] }))
      .sort((a, z) => z.v - a.v);
    destroyChart('empRevPerHourChart');
    const ctx = document.getElementById('empRevPerHourChart').getContext('2d');
    register('empRevPerHourChart', new Chart(ctx, {
      type: 'bar',
      data: {
        labels: hourSorted.map(x => x.b),
        datasets: [{
          label: '€ / Staff Hour',
          data: hourSorted.map(x => x.v),
          backgroundColor: hourSorted.map((_, i) =>
            i === 0 ? C.teal : i < 3 ? C.coral : C.violet
          ),
          borderRadius: 5,
          borderSkipped: false,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: c => ` €${c.parsed.y}/hr` } },
        },
        scales: {
          x: { grid: { display: false } },
          y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { maxTicksLimit: 6, callback: v => `€${v}` } },
        },
        animation: { duration: 600 },
      },
    }));
  } catch (e) { console.error('Employees load error:', e); }
}

// ── Live Ticker ───────────────────────────────────────────────────────────────
async function updateLiveTicker() {
  try {
    const d = await api('/api/live');
    updateTime.textContent = d.timestamp;
    tickerText.textContent =
      `⚡ Live — ${d.active_branch}: ${d.active_units} × ${d.active_product}  |  ` +
      `Today's revenue: €${Number(d.current_revenue).toLocaleString('de-DE', { maximumFractionDigits: 0 })}  |  ` +
      `Transactions today: ${d.transactions_today.toLocaleString('de-DE')}`;
  } catch {
    tickerText.textContent = 'Live feed temporarily unavailable…';
  }
}

// ── Initialise ────────────────────────────────────────────────────────────────
(function init() {
  // Initial section
  activateSection('overview');

  // Start live ticker — poll every 5 seconds
  updateLiveTicker();
  setInterval(updateLiveTicker, 5_000);
})();
