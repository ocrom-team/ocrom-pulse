const main = document.querySelector('main');
const dialog = document.querySelector('#dialog');
const notice = document.querySelector('#notice');
const newProjectBtn = document.querySelector('#new-project-btn');
const liveToggleBtn = document.querySelector('#live-toggle-btn');

const fmtNum = new Intl.NumberFormat('en', { maximumFractionDigits: 1 });
let state = {
  view: 'analytics',
  subtab: 'overview',
  chartMetric: 'sessions',
  projectId: 'neocrom-demo',
  days: 14,
  livePolling: true,
  projects: [],
  publicSearch: '',
  publicEngine: 'all',
};
let noticeTimer;
let liveTimer;

const tooltip = document.createElement('div');
tooltip.className = 'chart-tooltip';
tooltip.hidden = true;
document.body.appendChild(tooltip);

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    node.setAttribute(k, v === true ? '' : String(v));
  }
  node.append(...children.flat().filter(c => c !== null && c !== undefined));
  return node;
}

function toast(msg) {
  notice.hidden = false;
  notice.textContent = msg;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { notice.hidden = true; }, 4200);
}

async function copyText(text, label = 'Copied to clipboard') {
  try {
    await navigator.clipboard.writeText(text);
    toast(label);
  } catch {
    toast(text);
  }
}

async function api(path, { method = 'GET', data } = {}) {
  const headers = data ? { 'Content-Type': 'application/json' } : {};
  const res = await fetch(`/api/v1${path}`, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Request failed');
  return json;
}

function formatDuration(sec) {
  if (!sec) return '0s';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function formatTimeAgo(ts) {
  const diff = Math.max(0, Math.floor(Date.now() / 1000) - ts);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function exportOverviewCsv(overview) {
  const headers = ['day', 'sessions', 'avg_duration_sec', 'fps_avg', 'fps_p95', 'ram_avg_mb', 'avg_load_ms', 'errors', 'custom_events'];
  const rows = overview.series.map(r => headers.map(h => r[h] ?? 0).join(','));
  const csv = [headers.join(','), ...rows].join('\n');
  downloadFile(`${overview.project.id}-analytics-${overview.window_days}d.csv`, csv, 'text/csv;charset=utf-8');
  toast('Exported CSV report');
}

function svgSparkChart(series, valueKey, { unit = '', secondaryKey = null, height = 175 } = {}) {
  if (!series || series.length === 0) {
    return el('p', { class: 'muted', style: 'margin-top: .75rem;' }, 'No samples recorded in this window yet.');
  }
  const w = 520;
  const h = height;
  const padX = 34;
  const padY = 18;
  const vals = series.map(d => Number(d[valueKey] || 0));
  const secVals = secondaryKey ? series.map(d => Number(d[secondaryKey] || 0)) : [];
  const maxVal = Math.max(1, ...vals, ...secVals);

  const toPoints = arr => arr.map((v, idx) => {
    const x = padX + (arr.length === 1 ? (w - padX * 2) / 2 : (idx / (arr.length - 1)) * (w - padX * 2));
    const y = h - padY - (v / (maxVal || 1)) * (h - padY * 2);
    return [x, y];
  });

  const pts = toPoints(vals);
  const pathD = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const areaD = `${pathD} L ${pts[pts.length - 1][0].toFixed(1)} ${(h - padY).toFixed(1)} L ${pts[0][0].toFixed(1)} ${(h - padY).toFixed(1)} Z`;

  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('class', 'chart-svg');

  for (let i = 0; i <= 2; i++) {
    const gy = padY + (i / 2) * (h - padY * 2);
    const line = document.createElementNS(svgNS, 'line');
    line.setAttribute('x1', String(padX));
    line.setAttribute('x2', String(w - padX));
    line.setAttribute('y1', gy.toFixed(1));
    line.setAttribute('y2', gy.toFixed(1));
    line.setAttribute('stroke', '#222');
    line.setAttribute('stroke-dasharray', '3 3');
    svg.appendChild(line);

    const label = document.createElementNS(svgNS, 'text');
    label.setAttribute('x', '0');
    label.setAttribute('y', (gy + 4).toFixed(1));
    label.setAttribute('fill', '#888');
    label.setAttribute('font-size', '10');
    label.textContent = `${fmtNum.format(maxVal * (1 - i / 2))}${unit}`;
    svg.appendChild(label);
  }

  const area = document.createElementNS(svgNS, 'path');
  area.setAttribute('d', areaD);
  area.setAttribute('fill', 'rgba(255,255,255,0.08)');
  svg.appendChild(area);

  if (secondaryKey && secVals.length > 0) {
    const secPts = toPoints(secVals);
    const secPath = document.createElementNS(svgNS, 'path');
    secPath.setAttribute('d', secPts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' '));
    secPath.setAttribute('fill', 'none');
    secPath.setAttribute('stroke', '#7a7a7a');
    secPath.setAttribute('stroke-width', '1.5');
    secPath.setAttribute('stroke-dasharray', '4 3');
    svg.appendChild(secPath);
  }

  const line = document.createElementNS(svgNS, 'path');
  line.setAttribute('d', pathD);
  line.setAttribute('fill', 'none');
  line.setAttribute('stroke', '#fff');
  line.setAttribute('stroke-width', '2');
  svg.appendChild(line);

  for (let i = 0; i < pts.length; i++) {
    const [x, y] = pts[i];
    const dot = document.createElementNS(svgNS, 'circle');
    dot.setAttribute('cx', x.toFixed(1));
    dot.setAttribute('cy', y.toFixed(1));
    dot.setAttribute('r', '4');
    dot.setAttribute('fill', '#fff');
    dot.style.cursor = 'crosshair';
    const tipText = secondaryKey
      ? `${series[i].day}: ${vals[i]}${unit} (P95: ${secVals[i]}${unit})`
      : `${series[i].day}: ${vals[i]}${unit}`;
    dot.addEventListener('mouseenter', e => {
      tooltip.textContent = tipText;
      tooltip.hidden = false;
      tooltip.style.left = `${e.clientX + 10}px`;
      tooltip.style.top = `${e.clientY - 28}px`;
    });
    dot.addEventListener('mousemove', e => {
      tooltip.style.left = `${e.clientX + 10}px`;
      tooltip.style.top = `${e.clientY - 28}px`;
    });
    dot.addEventListener('mouseleave', () => { tooltip.hidden = true; });
    svg.appendChild(dot);
  }

  const firstLbl = document.createElementNS(svgNS, 'text');
  firstLbl.setAttribute('x', String(padX));
  firstLbl.setAttribute('y', String(h - 2));
  firstLbl.setAttribute('fill', '#888');
  firstLbl.setAttribute('font-size', '10');
  firstLbl.textContent = series[0].day.slice(5);
  svg.appendChild(firstLbl);

  const lastLbl = document.createElementNS(svgNS, 'text');
  lastLbl.setAttribute('x', String(w - padX));
  lastLbl.setAttribute('y', String(h - 2));
  lastLbl.setAttribute('text-anchor', 'end');
  lastLbl.setAttribute('fill', '#888');
  lastLbl.setAttribute('font-size', '10');
  lastLbl.textContent = series[series.length - 1].day.slice(5);
  svg.appendChild(lastLbl);

  return el('div', { class: 'chart-wrap' }, svg);
}

function barDistribution(items, unit = '') {
  if (!items || items.length === 0) {
    return el('p', { class: 'muted', style: 'margin-top: .75rem;' }, 'No samples recorded yet.');
  }
  const total = items.reduce((s, x) => s + Number(x.count || 0), 0) || 1;
  return el('div', { class: 'bar-list' }, items.map(item => {
    const pct = Math.round((Number(item.count || 0) / total) * 100);
    return el('div', { class: 'bar-row' },
      el('div', { class: 'bar-meta' },
        el('span', {}, item.label),
        el('span', { class: 'muted' }, `${item.count}${unit} (${pct}%)`)
      ),
      el('div', { class: 'bar-track' }, el('div', { class: 'bar-fill', style: `width: ${pct}%` }))
    );
  }));
}

function openSimulatorDialog(project) {
  const closeBtn = el('button', { type: 'button', class: 'button small close', 'aria-label': 'Close' }, '×');
  closeBtn.addEventListener('click', () => dialog.close());

  const form = el('form', { class: 'stack' },
    el('label', {}, 'Batch Preset',
      el('select', { name: 'preset' },
        el('option', { value: 'full' }, 'Full Godot Session (Start + Load + Perf + Custom + End)'),
        el('option', { value: 'perf' }, 'Performance Spike (Low FPS + High Load Time)'),
        el('option', { value: 'error' }, 'Error Report with PII (verifies server scrubbing)')
      )
    ),
    el('label', {}, 'Custom Event Name', el('input', { name: 'event_name', value: 'arena_wave_cleared' })),
    el('label', {}, 'OS / GPU Cohort',
      el('select', { name: 'cohort' },
        el('option', { value: 'win_rtx40' }, 'Windows · NVIDIA RTX 40-Series (1440p)'),
        el('option', { value: 'linux_rx7000' }, 'Linux · AMD Radeon RX 7000 (1440p)'),
        el('option', { value: 'mac_m3' }, 'macOS · Apple M3 Series (1440p)')
      )
    ),
    el('label', { style: 'display:flex;align-items:center;gap:.5rem;' },
      el('input', { type: 'checkbox', name: 'public_benchmark', checked: true, style: 'width:auto;margin:0;' }),
      'Include opt-in Public Benchmark flag'
    ),
    el('div', { class: 'actions' }, el('button', { type: 'submit', class: 'button primary' }, 'Send Test Batch'))
  );

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(form);
    const preset = fd.get('preset');
    const eventName = String(fd.get('event_name') || 'custom_test').trim();
    const cohort = fd.get('cohort');
    const pub = fd.get('public_benchmark') === 'on';
    const nowSec = Math.floor(Date.now() / 1000);
    const sessionId = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');

    const hwMap = {
      win_rtx40: { os_family: 'Windows', arch: 'x86_64', cpu_cores_bucket: '9-16', ram_gb_bucket: '32', gpu_vendor: 'NVIDIA', gpu_tier: 'NVIDIA RTX 40-Series', display_bucket: '1440p', locale_lang: 'de' },
      linux_rx7000: { os_family: 'Linux', arch: 'x86_64', cpu_cores_bucket: '9-16', ram_gb_bucket: '32', gpu_vendor: 'AMD', gpu_tier: 'AMD Radeon RX 7000', display_bucket: '1440p', locale_lang: 'en' },
      mac_m3: { os_family: 'macOS', arch: 'arm64', cpu_cores_bucket: '9-16', ram_gb_bucket: '16', gpu_vendor: 'Apple', gpu_tier: 'Apple M3 Series', display_bucket: '1440p', locale_lang: 'en' },
    };

    let events = [];
    if (preset === 'error') {
      events = [
        { type: 'session_start', ts: nowSec },
        { type: 'error', ts: nowSec, error: { severity: 'error', fingerprint: 'sim_pii_err', message: 'Save failed at C:\\Users\\testplayer\\save.dat for test@neocrom.pro (192.168.1.15)', source: '/home/testplayer/game/save.gd:42' } },
      ];
    } else if (preset === 'perf') {
      events = [
        { type: 'session_start', ts: nowSec },
        { type: 'load_time', ts: nowSec, name: 'heavy_citadel', duration_ms: 1420 },
        { type: 'perf_sample', ts: nowSec, metrics: { fps_avg: 52.4, fps_p50: 54.0, fps_p95: 38.2, ram_static_mb: 1140.0 } },
      ];
    } else {
      events = [
        { type: 'session_start', ts: nowSec },
        { type: 'load_time', ts: nowSec, name: 'sector_01', duration_ms: 395 },
        { type: 'perf_sample', ts: nowSec, metrics: { fps_avg: 138.2, fps_p50: 135.0, fps_p95: 121.0, ram_static_mb: 448.0 } },
        { type: 'custom', ts: nowSec, name: eventName, props: { wave: 4, difficulty: 'hard' } },
        { type: 'session_end', ts: nowSec, duration_ms: 420000 },
      ];
    }

    const res = await fetch('/api/v1/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Neocrom-Key': project.ingest_key },
      body: JSON.stringify({
        schema_version: 1,
        project_id: project.id,
        session_id: sessionId,
        sent_at: nowSec,
        sdk: { name: 'neocrom-pulse-dashboard-sim', version: '0.1.0' },
        engine: { name: project.engine_hint || 'godot', version: '4.7.2', app_version: '0.1.0' },
        consent: { gameplay: true, performance: true, errors: true, hardware: true, public_benchmark: pub },
        hardware: hwMap[cohort],
        events,
      }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Ingest failed');
    dialog.close();
    toast(`Ingested ${json.accepted} event(s) into ${project.name}`);
    await render();
  });

  dialog.replaceChildren(
    el('div', { class: 'row-between dialog-head' }, el('h2', { id: 'dialog-title' }, `Test Ingest // ${project.name}`), closeBtn),
    form
  );
  dialog.showModal();
}

async function renderAnalytics() {
  const [projRes, overview, sessRes] = await Promise.all([
    api('/projects'),
    api(`/dashboard/overview?project=${encodeURIComponent(state.projectId)}&days=${state.days}`),
    api(`/dashboard/sessions?project=${encodeURIComponent(state.projectId)}&limit=15`),
  ]);
  state.projects = projRes.projects;
  const p = overview.project;
  const k = overview.kpis;

  const projectSelect = el('select', { class: 'inline-select', 'aria-label': 'Select game project' },
    state.projects.map(item => el('option', { value: item.id, selected: item.id === p.id }, `${item.name} (${item.engine_hint})`))
  );
  projectSelect.addEventListener('change', () => {
    state.projectId = projectSelect.value;
    render();
  });

  const dayChips = [7, 14, 30].map(d => {
    const btn = el('button', { type: 'button', class: 'chip', 'aria-pressed': state.days === d }, `${d}d`);
    btn.addEventListener('click', () => { state.days = d; render(); });
    return btn;
  });

  const simBtn = el('button', { type: 'button', class: 'button primary' }, 'Simulate Telemetry');
  simBtn.addEventListener('click', () => openSimulatorDialog(p));

  const exportBtn = el('button', { type: 'button', class: 'button' }, 'Export CSV');
  exportBtn.addEventListener('click', () => exportOverviewCsv(overview));

  const resetBtn = el('button', { type: 'button', class: 'button', title: 'Clear all data to test from zero' }, 'Clear Data');
  resetBtn.addEventListener('click', async () => {
    if (confirm('Clear all telemetry records to start from zero with real Godot data?')) {
      await api('/reset-data', { method: 'POST' });
      toast('All telemetry reset! Waiting for live Godot events.');
      await render();
    }
  });

  const publicToggleBtn = el('button', { type: 'button', class: 'chip', 'aria-pressed': Boolean(p.public_listing) },
    p.public_listing ? 'Public DB: Enabled' : 'Public DB: Private'
  );
  publicToggleBtn.addEventListener('click', async () => {
    await api(`/projects/${encodeURIComponent(p.id)}`, { method: 'PATCH', data: { public_listing: !p.public_listing } });
    toast(p.public_listing ? 'Project hidden from Public Game DB' : 'Project listed in Public Game DB');
    render();
  });

  const hero = el('section', { class: 'hero' },
    el('div', { class: 'hero-copy' },
      el('h1', {}, p.name),
      el('p', {}, p.description || 'Lightweight diagnostics, performance profiling, and anonymized hardware metrics for the Neocrom ecosystem.'),
      el('div', { class: 'actions' }, simBtn, exportBtn, resetBtn, publicToggleBtn)
    ),
    el('div', { class: 'graphic', 'aria-hidden': 'true' },
      el('div', { class: 'orbits' }, el('i'), el('i'), el('i'), el('i'), el('i'))
    )
  );

  const keyPill = el('button', { type: 'button', class: 'copy-pill', title: 'Click to copy Ingest Key' }, `Key: ${p.ingest_key}`);
  keyPill.addEventListener('click', () => copyText(p.ingest_key, 'Ingest key copied'));
  const urlPill = el('button', { type: 'button', class: 'copy-pill', title: 'Click to copy Endpoint URL' }, `${location.origin}/api/v1/ingest`);
  urlPill.addEventListener('click', () => copyText(`${location.origin}/api/v1/ingest`, 'Endpoint URL copied'));

  const controls = el('section', { class: 'catalog-tools' },
    el('div', { class: 'catalog-filters' },
      el('div', { class: 'actions' },
        el('span', { class: 'muted' }, 'Project:'),
        projectSelect,
        el('span', { class: 'tag' }, p.engine_hint.toUpperCase())
      ),
      el('div', { class: 'filters' }, dayChips)
    ),
    el('div', { class: 'row-between' }, keyPill, urlPill)
  );

  const kpis = el('section', { class: 'kpi-grid' },
    el('div', { class: 'kpi-card' },
      el('span', { class: 'kpi-label' }, 'Sessions'),
      el('span', { class: 'kpi-value' }, fmtNum.format(k.total_sessions)),
      el('span', { class: 'kpi-sub' }, `Last ${overview.window_days} days`)
    ),
    el('div', { class: 'kpi-card' },
      el('span', { class: 'kpi-label' }, 'Avg Session'),
      el('span', { class: 'kpi-value' }, formatDuration(k.avg_session_sec)),
      el('span', { class: 'kpi-sub' }, 'Active play time')
    ),
    el('div', { class: 'kpi-card' },
      el('span', { class: 'kpi-label' }, 'Avg / P95 FPS'),
      el('span', { class: 'kpi-value' }, `${k.avg_fps}`),
      el('span', { class: 'kpi-sub' }, `P95 floor: ${k.p95_fps} FPS`)
    ),
    el('div', { class: 'kpi-card' },
      el('span', { class: 'kpi-label' }, 'Memory (RAM)'),
      el('span', { class: 'kpi-value' }, `${k.avg_ram_mb} MiB`),
      el('span', { class: 'kpi-sub' }, 'Static footprint')
    ),
    el('div', { class: 'kpi-card' },
      el('span', { class: 'kpi-label' }, 'Load Time'),
      el('span', { class: 'kpi-value' }, `${k.avg_load_ms} ms`),
      el('span', { class: 'kpi-sub' }, 'Scene transitions')
    ),
    el('div', { class: 'kpi-card' },
      el('span', { class: 'kpi-label' }, 'Errors / Events'),
      el('span', { class: 'kpi-value' }, fmtNum.format(k.total_errors)),
      el('span', { class: 'kpi-sub' }, `${fmtNum.format(k.total_custom_events)} gameplay events`)
    )
  );

  const subtabDefs = [
    ['overview', 'Overview'],
    ['hardware', 'Hardware & Perf'],
    ['events', 'Events & Errors'],
    ['stream', `Live Stream (${overview.recent_events.length})`],
  ];
  const subtabs = el('div', { class: 'subtabs', role: 'tablist' },
    subtabDefs.map(([id, label]) => {
      const btn = el('button', { type: 'button', class: 'chip', role: 'tab', 'aria-pressed': state.subtab === id }, label);
      btn.addEventListener('click', () => { state.subtab = id; render(); });
      return btn;
    })
  );

  let bodyNodes = [];

  if (state.subtab === 'overview') {
    const metricDefs = {
      sessions: { label: 'Sessions', unit: '', sec: null },
      fps_avg: { label: 'FPS (Avg & P95)', unit: ' FPS', sec: 'fps_p95' },
      avg_load_ms: { label: 'Load Time', unit: ' ms', sec: null },
      ram_avg_mb: { label: 'Memory (MiB)', unit: ' MiB', sec: null },
      errors: { label: 'Errors', unit: '', sec: null },
    };
    const metricChips = Object.entries(metricDefs).map(([key, def]) => {
      const btn = el('button', { type: 'button', class: 'chip', 'aria-pressed': state.chartMetric === key }, def.label);
      btn.addEventListener('click', () => { state.chartMetric = key; render(); });
      return btn;
    });
    const activeMetric = metricDefs[state.chartMetric] || metricDefs.sessions;

    bodyNodes = [
      el('section', { class: 'section panel' },
        el('div', { class: 'row-between' },
          el('h3', {}, `${activeMetric.label} Trend`),
          el('div', { class: 'filters' }, metricChips)
        ),
        svgSparkChart(overview.series, state.chartMetric, { unit: activeMetric.unit, secondaryKey: activeMetric.sec, height: 210 })
      ),
      el('section', { class: 'section grid-2' },
        el('div', { class: 'panel' },
          el('div', { class: 'row-between' }, el('h3', {}, 'Top Gameplay Events'), el('span', { class: 'tag' }, 'PII Scrubbed')),
          barDistribution(overview.top_events.map(e => ({ label: e.name, count: e.count })))
        ),
        el('div', { class: 'panel' },
          el('div', { class: 'row-between' }, el('h3', {}, 'OS Distribution'), el('span', { class: 'tag' }, 'Anonymized')),
          barDistribution(overview.hardware.os)
        )
      ),
    ];
  } else if (state.subtab === 'hardware') {
    bodyNodes = [
      el('section', { class: 'section grid-2' },
        el('div', { class: 'panel' },
          el('div', { class: 'row-between' }, el('h3', {}, 'OS & RAM Buckets'), el('span', { class: 'tag' }, 'Coarsened')),
          barDistribution(overview.hardware.os),
          el('h3', { style: 'margin-top: 1.4rem;' }, 'System Memory'),
          barDistribution(overview.hardware.ram.map(r => ({ label: `${r.label} GB`, count: r.count })))
        ),
        el('div', { class: 'panel' },
          el('div', { class: 'row-between' }, el('h3', {}, 'GPU Tier Benchmarks'), el('span', { class: 'tag' }, 'Perf by Class')),
          overview.hardware.gpus.length === 0
            ? el('p', { class: 'muted', style: 'margin-top:.75rem' }, 'No GPU benchmark cohorts yet.')
            : el('div', { class: 'table-wrap' },
                el('table', {},
                  el('thead', {}, el('tr', {}, el('th', {}, 'GPU Class'), el('th', {}, 'Sessions'), el('th', {}, 'Avg FPS'), el('th', {}, 'Load'))),
                  el('tbody', {}, overview.hardware.gpus.map(g => el('tr', {},
                    el('td', {}, g.label),
                    el('td', {}, g.sessions),
                    el('td', {}, `${g.avg_fps}`),
                    el('td', {}, `${g.avg_load_ms} ms`)
                  )))
                )
              )
        )
      ),
    ];
  } else if (state.subtab === 'events') {
    bodyNodes = [
      el('section', { class: 'section grid-2' },
        el('div', { class: 'panel' },
          el('div', { class: 'row-between' }, el('h3', {}, 'Custom Gameplay Events'), el('span', { class: 'tag' }, 'Top 10')),
          barDistribution(overview.top_events.map(e => ({ label: e.name, count: e.count })))
        ),
        el('div', { class: 'panel' },
          el('div', { class: 'row-between' }, el('h3', {}, 'Error & Crash Groups'), el('span', { class: 'tag' }, 'Deduplicated')),
          overview.error_groups.length === 0
            ? el('p', { class: 'muted', style: 'margin-top:.75rem' }, 'Zero errors recorded.')
            : el('div', { class: 'table-wrap' },
                el('table', {},
                  el('thead', {}, el('tr', {}, el('th', {}, 'Severity'), el('th', {}, 'Message & Source'), el('th', {}, 'Hits'))),
                  el('tbody', {}, overview.error_groups.map(er => el('tr', {},
                    el('td', {}, el('span', { class: 'tag' }, er.severity)),
                    el('td', {}, el('div', {}, er.message), el('small', { class: 'muted' }, `${er.source || 'runtime'} · ${er.fingerprint.slice(0, 10)}`)),
                    el('td', {}, `${er.occurrences}×`)
                  )))
                )
              )
        )
      ),
    ];
  } else {
    bodyNodes = [
      el('section', { class: 'section grid-2' },
        el('div', { class: 'panel' },
          el('div', { class: 'row-between' }, el('h3', {}, 'Recent Ephemeral Sessions'), el('span', { class: 'tag' }, 'No Fingerprinting')),
          sessRes.sessions.length === 0
            ? el('p', { class: 'muted', style: 'margin-top:.75rem;' }, 'No live sessions ingested yet. Run the Godot demo or click Simulate Telemetry.')
            : el('div', { class: 'table-wrap' },
                el('table', {},
                  el('thead', {}, el('tr', {}, el('th', {}, 'Session'), el('th', {}, 'Platform'), el('th', {}, 'Duration'), el('th', {}, 'Seen'))),
                  el('tbody', {}, sessRes.sessions.map(s => el('tr', {},
                    el('td', {}, el('code', {}, s.session_short)),
                    el('td', {}, `${s.os_family} · ${s.gpu_tier}`),
                    el('td', {}, formatDuration(Math.round(s.duration_ms / 1000))),
                    el('td', { class: 'muted' }, formatTimeAgo(s.last_seen_at))
                  )))
                )
              )
        ),
        el('div', { class: 'panel' },
          el('div', { class: 'row-between' }, el('h3', {}, 'Recent Ingest Events'), el('span', { class: 'tag' }, 'Rolling Buffer')),
          overview.recent_events.length === 0
            ? el('p', { class: 'muted', style: 'margin-top:.75rem' }, 'No live events yet.')
            : el('div', { class: 'table-wrap' },
                el('table', {},
                  el('thead', {}, el('tr', {}, el('th', {}, 'Time'), el('th', {}, 'Type'), el('th', {}, 'Summary'))),
                  el('tbody', {}, overview.recent_events.map(ev => el('tr', {},
                    el('td', { class: 'muted' }, formatTimeAgo(ev.ts)),
                    el('td', {}, el('span', { class: 'tag' }, ev.event_type)),
                    el('td', {}, ev.event_name ? `${ev.event_name} · ${ev.summary}` : ev.summary)
                  )))
                )
              )
        )
      ),
    ];
  }

  main.replaceChildren(hero, controls, kpis, subtabs, ...bodyNodes);
}

function openGameDetailDialog(game) {
  const closeBtn = el('button', { type: 'button', class: 'button small close', 'aria-label': 'Close' }, '×');
  closeBtn.addEventListener('click', () => dialog.close());

  const content = el('div', { class: 'stack' },
    el('p', { class: 'muted' }, game.description),
    el('div', { class: 'row-between' }, el('span', { class: 'muted' }, 'Public Opt-In Sessions'), el('strong', {}, fmtNum.format(game.public_sessions))),
    el('div', { class: 'row-between' }, el('span', { class: 'muted' }, 'Avg Performance'), el('strong', {}, game.avg_fps !== null ? `${game.avg_fps} FPS` : 'Hidden (< k)')),
    el('div', { class: 'row-between' }, el('span', { class: 'muted' }, 'Avg Load Time'), el('strong', {}, game.avg_load_ms !== null ? `${game.avg_load_ms} ms` : 'Hidden (< k)')),
    game.verified_cohorts.length > 0
      ? el('div', { class: 'table-wrap' },
          el('table', {},
            el('thead', {}, el('tr', {}, el('th', {}, 'OS'), el('th', {}, 'GPU Tier'), el('th', {}, 'Samples'), el('th', {}, 'FPS'), el('th', {}, 'Load'))),
            el('tbody', {}, game.verified_cohorts.map(c => el('tr', {},
              el('td', {}, c.os_family),
              el('td', {}, c.gpu_tier),
              el('td', {}, c.sample_sessions),
              el('td', {}, c.avg_fps ?? '—'),
              el('td', {}, c.avg_load_ms !== null ? `${c.avg_load_ms} ms` : '—')
            )))
          )
        )
      : el('p', { class: 'muted' }, `Minimum cohort size k=${game.k_threshold} not yet reached.`),
    el('pre', { class: 'code-block' }, JSON.stringify(game, null, 2))
  );

  dialog.replaceChildren(
    el('div', { class: 'row-between dialog-head' }, el('h2', { id: 'dialog-title' }, `${game.name} (${game.engine.toUpperCase()})`), closeBtn),
    content
  );
  dialog.showModal();
}

async function renderPublicDb() {
  const data = await api(`/public/games?q=${encodeURIComponent(state.publicSearch)}&engine=${encodeURIComponent(state.publicEngine)}`);

  const head = el('section', { class: 'page-head' },
    el('h1', {}, 'Neocrom Public Game Database'),
    el('p', {}, `Voluntarily contributed, k-anonymized telemetry benchmarks (minimum k = ${data.k_threshold} opted-in sessions per hardware cohort). Ready for direct integration into neocrom.pro listings.`)
  );

  const searchInput = el('input', { type: 'search', placeholder: 'Search games in public database…', value: state.publicSearch });
  searchInput.addEventListener('input', () => {
    state.publicSearch = searchInput.value;
    clearTimeout(searchInput._t);
    searchInput._t = setTimeout(() => render(), 200);
  });

  const engineChips = ['all', 'godot', 'unity', 'unreal'].map(eng => {
    const btn = el('button', { type: 'button', class: 'chip', 'aria-pressed': state.publicEngine === eng }, eng === 'all' ? 'All Engines' : eng.toUpperCase());
    btn.addEventListener('click', () => { state.publicEngine = eng; render(); });
    return btn;
  });

  const tools = el('section', { class: 'catalog-tools' },
    searchInput,
    el('div', { class: 'catalog-filters' },
      el('div', { class: 'filters' }, engineChips),
      el('small', { class: 'muted' }, `${data.total_games} public listings`)
    )
  );

  const cards = el('section', { class: 'cards' },
    data.games.map(g => {
      const inspectBtn = el('button', { type: 'button', class: 'button small' }, 'Inspect Cohorts & JSON');
      inspectBtn.addEventListener('click', () => openGameDetailDialog(g));
      return el('article', { class: 'card' },
        el('div', { class: 'row-between' },
          el('h3', {}, g.name),
          el('span', { class: 'tag strong' }, g.engine.toUpperCase())
        ),
        el('p', { class: 'muted' }, g.description || 'Community game in the Neocrom ecosystem.'),
        g.k_anonymity_met
          ? el('div', { class: 'stack' },
              el('div', { class: 'row-between' }, el('span', { class: 'muted' }, 'Opt-in Sessions'), el('strong', {}, fmtNum.format(g.public_sessions))),
              el('div', { class: 'row-between' }, el('span', { class: 'muted' }, 'Avg Performance'), el('strong', {}, g.avg_fps !== null ? `${g.avg_fps} FPS` : '—')),
              el('div', { class: 'row-between' }, el('span', { class: 'muted' }, 'Avg Load Time'), el('strong', {}, g.avg_load_ms !== null ? `${g.avg_load_ms} ms` : '—')),
              el('div', { class: 'row-between' }, el('span', { class: 'muted' }, 'Stability Score'), el('strong', {}, g.stability_score !== null ? `${g.stability_score}%` : '—'))
            )
          : el('div', { class: 'panel' },
              el('p', { class: 'muted' }, `Hidden until at least ${g.k_threshold} opt-in sessions are reached (current: ${g.public_sessions}).`)
            ),
        el('div', { class: 'actions', style: 'margin-top: auto;' }, inspectBtn)
      );
    })
  );

  main.replaceChildren(head, tools, cards);
}

function renderSdkGuide() {
  const head = el('section', { class: 'page-head' },
    el('h1', {}, 'Open Source SDK & Privacy'),
    el('p', {}, 'Integrate Neocrom Pulse into Godot 4, Unity, Unreal Engine, or Web games in minutes. MIT licensed, modular, and built around strict data minimization.')
  );

  const cards = el('section', { class: 'section grid-2' },
    el('div', { class: 'panel' },
      el('div', { class: 'row-between' }, el('h3', {}, 'Godot 4 Plugin (GDScript)'), el('span', { class: 'tag strong' }, 'addons/neocrom_pulse')),
      el('p', { class: 'muted', style: 'margin-top:.5rem' }, 'Drop addons/neocrom_pulse into your project, enable it in Project Settings → Plugins, and use the NeocromPulse autoload:'),
      el('pre', { class: 'code-block' }, `if not NeocromPulse.has_decided_consent():
    NeocromPulse.show_consent_dialog(self)

NeocromPulse.begin_load("level_01")
# ... load scene ...
NeocromPulse.end_load("level_01")

NeocromPulse.track_event("boss_defeated", {"boss": "warden", "attempts": 2})
NeocromPulse.report_error("Missing audio bus", "warning", "audio.gd:42")`)
    ),
    el('div', { class: 'panel' },
      el('div', { class: 'row-between' }, el('h3', {}, 'Cross-Engine Wire Protocol v1'), el('span', { class: 'tag' }, 'Unity · Unreal · Web')),
      el('p', { class: 'muted', style: 'margin-top:.5rem' }, 'All engines share the identical GZIP + HMAC-SHA256 JSON batch envelope (spec/telemetry-v1.schema.json):'),
      el('pre', { class: 'code-block' }, `// Unity (sdk/unity/NeocromPulseClient.cs)
NeocromPulseClient.Instance.TrackEvent("match_start", new { mode = "coop" });

// Unreal Engine (sdk/unreal/NeocromPulseSubsystem.h)
GetGameInstance()->GetSubsystem<UNeocromPulseSubsystem>()->TrackEvent(TEXT("match_start"));

// Web / JS (sdk/web/neocrom-pulse.mjs)
pulse.trackEvent("match_start", { mode: "coop" });`)
    )
  );

  const privacy = el('section', { class: 'section panel' },
    el('h3', {}, 'Privacy & Cost Architecture'),
    el('div', { class: 'cards', style: 'margin-top: 1rem;' },
      el('div', { class: 'card' },
        el('h3', {}, 'Zero Fingerprinting'),
        el('p', { class: 'muted' }, 'Ephemeral 128-bit random session IDs per launch. IP addresses are never stored on disk. Hardware is coarsened into broad RAM/CPU/GPU/display tiers.')
      ),
      el('div', { class: 'card' },
        el('h3', {}, 'Granular Consent'),
        el('p', { class: 'muted' }, 'Gameplay, Performance, Error Reports, Hardware, and Public Benchmarks are independently toggled. Zero bytes leave the client until the player decides.')
      ),
      el('div', { class: 'card' },
        el('h3', {}, 'Minimal Hosting Cost'),
        el('p', { class: 'muted' }, 'GZIP batches cut egress by ~75%. Server-side SQLite WAL rollups keep storage O(days) instead of O(events), running comfortably on minimal compute.')
      )
    )
  );

  main.replaceChildren(head, cards, privacy);
}

function openNewProjectDialog() {
  const closeBtn = el('button', { type: 'button', class: 'button small close', 'aria-label': 'Close' }, '×');
  closeBtn.addEventListener('click', () => dialog.close());

  const errEl = el('p', { class: 'error', hidden: true });
  const form = el('form', { class: 'stack' },
    el('label', {}, 'Project ID (slug)', el('input', { name: 'id', required: true, placeholder: 'my-godot-game', pattern: '[a-z0-9_-]{3,64}' })),
    el('label', {}, 'Display Name', el('input', { name: 'name', required: true, placeholder: 'My Godot Game' })),
    el('label', {}, 'Primary Engine',
      el('select', { name: 'engine_hint' },
        el('option', { value: 'godot' }, 'Godot 4'),
        el('option', { value: 'unity' }, 'Unity'),
        el('option', { value: 'unreal' }, 'Unreal Engine'),
        el('option', { value: 'web' }, 'Web / JS'),
        el('option', { value: 'custom' }, 'Custom Engine')
      )
    ),
    el('label', {}, 'Description', el('textarea', { name: 'description', placeholder: 'Short description for Neocrom Game DB…' })),
    el('label', { style: 'display:flex;align-items:center;gap:.5rem;' },
      el('input', { type: 'checkbox', name: 'public_listing', checked: true, style: 'width:auto;margin:0;' }),
      'Allow opt-in k-anonymized stats in Neocrom Public Game DB'
    ),
    errEl,
    el('div', { class: 'actions' }, el('button', { type: 'submit', class: 'button primary' }, 'Create Project'))
  );

  form.addEventListener('submit', async e => {
    e.preventDefault();
    errEl.hidden = true;
    const fd = new FormData(form);
    try {
      const res = await api('/projects', {
        method: 'POST',
        data: {
          id: fd.get('id'),
          name: fd.get('name'),
          engine_hint: fd.get('engine_hint'),
          description: fd.get('description'),
          public_listing: fd.get('public_listing') === 'on',
        },
      });
      state.projectId = res.project.id;
      dialog.close();
      toast(`Created ${res.project.name} (Ingest Key: ${res.project.ingest_key})`);
      state.view = 'analytics';
      location.hash = '#analytics';
      await render();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.hidden = false;
    }
  });

  dialog.replaceChildren(
    el('div', { class: 'row-between dialog-head' }, el('h2', { id: 'dialog-title' }, 'Register Game Project'), closeBtn),
    form
  );
  dialog.showModal();
}

newProjectBtn.addEventListener('click', openNewProjectDialog);

liveToggleBtn.addEventListener('click', () => {
  state.livePolling = !state.livePolling;
  liveToggleBtn.setAttribute('aria-pressed', String(state.livePolling));
  scheduleLivePolling();
});

function scheduleLivePolling() {
  clearInterval(liveTimer);
  if (state.livePolling) {
    liveTimer = setInterval(() => {
      if (!dialog.open && state.view === 'analytics' && document.visibilityState === 'visible') {
        render();
      }
    }, 5000);
  }
}

function syncNav() {
  const hash = (location.hash || '#analytics').replace('#', '');
  state.view = ['analytics', 'public-db', 'sdk'].includes(hash) ? hash : 'analytics';
  for (const a of document.querySelectorAll('nav a')) {
    if (a.dataset.view === state.view) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
}

async function render() {
  syncNav();
  try {
    if (state.view === 'public-db') await renderPublicDb();
    else if (state.view === 'sdk') renderSdkGuide();
    else await renderAnalytics();
  } catch (err) {
    main.replaceChildren(el('div', { class: 'panel', style: 'margin-top:2rem;' },
      el('h2', {}, 'Unable to load Neocrom Pulse data'),
      el('p', { class: 'muted', style: 'margin-top:.5rem;' }, err.message)
    ));
  }
}

window.addEventListener('hashchange', render);
scheduleLivePolling();
render();
