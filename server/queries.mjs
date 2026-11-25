export function listProjects(db) {
  return db.prepare(`
    SELECT
      p.id, p.slug, p.name, p.engine_hint, p.public_listing, p.description, p.created_at,
      COALESCE(SUM(d.sessions_count), 0) AS total_sessions
    FROM projects p
    LEFT JOIN daily_rollups d ON d.project_id = p.id
    GROUP BY p.id
    ORDER BY p.created_at ASC
  `).all();
}

export function createProject(db, { id, name, engine_hint = 'godot', public_listing = true, description = '' }) {
  const cleanId = String(id || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  if (!/^[a-z0-9_-]{3,64}$/.test(cleanId)) {
    throw new Error('Project ID must be 3-64 lowercase alphanumeric/hyphen characters.');
  }
  const cleanName = String(name || '').trim().slice(0, 80);
  if (!cleanName) {
    throw new Error('Project name is required.');
  }
  const key = `cp_${cleanId.replace(/-/g, '_')}_${Math.random().toString(36).slice(2, 12)}`;
  const now = Math.floor(Date.now() / 1000);
  db.prepare(`
    INSERT INTO projects (id, slug, name, engine_hint, ingest_key, public_listing, description, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(cleanId, cleanId, cleanName, String(engine_hint || 'godot').slice(0, 24), key, public_listing ? 1 : 0, String(description || '').slice(0, 280), now);
  return db.prepare('SELECT id, slug, name, engine_hint, ingest_key, public_listing, description, created_at FROM projects WHERE id = ?').get(cleanId);
}

export function getDashboardOverview(db, { projectId = 'neocrom-demo', days = 14 } = {}) {
  const project = db.prepare('SELECT id, slug, name, engine_hint, ingest_key, public_listing, description FROM projects WHERE id = ?').get(projectId)
    || db.prepare('SELECT id, slug, name, engine_hint, ingest_key, public_listing, description FROM projects ORDER BY created_at ASC LIMIT 1').get();

  if (!project) return null;

  const safeDays = Math.max(1, Math.min(90, Number(days) || 14));
  const cutoffDate = new Date(Date.now() - (safeDays - 1) * 86400_000).toISOString().slice(0, 10);

  const series = db.prepare(`
    SELECT
      day,
      sessions_count,
      total_duration_ms,
      perf_samples_count,
      fps_avg_sum,
      fps_p50_sum,
      fps_p95_sum,
      ram_mb_sum,
      load_count,
      load_ms_sum,
      error_count,
      custom_event_count
    FROM daily_rollups
    WHERE project_id = ? AND day >= ?
    ORDER BY day ASC
  `).all(project.id, cutoffDate).map(row => ({
    day: row.day,
    sessions: row.sessions_count,
    avg_duration_sec: row.sessions_count > 0 ? Math.round(row.total_duration_ms / row.sessions_count / 1000) : 0,
    fps_avg: row.perf_samples_count > 0 ? Number((row.fps_avg_sum / row.perf_samples_count).toFixed(1)) : 0,
    fps_p50: row.perf_samples_count > 0 ? Number((row.fps_p50_sum / row.perf_samples_count).toFixed(1)) : 0,
    fps_p95: row.perf_samples_count > 0 ? Number((row.fps_p95_sum / row.perf_samples_count).toFixed(1)) : 0,
    ram_avg_mb: row.perf_samples_count > 0 ? Math.round(row.ram_mb_sum / row.perf_samples_count) : 0,
    avg_load_ms: row.load_count > 0 ? Math.round(row.load_ms_sum / row.load_count) : 0,
    errors: row.error_count,
    custom_events: row.custom_event_count,
  }));

  const totals = series.reduce((acc, r) => {
    acc.sessions += r.sessions;
    acc.errors += r.errors;
    acc.custom_events += r.custom_events;
    if (r.avg_duration_sec > 0) {
      acc.duration_sum += r.avg_duration_sec * r.sessions;
      acc.duration_sessions += r.sessions;
    }
    if (r.fps_avg > 0) {
      acc.fps_sum += r.fps_avg;
      acc.fps_days += 1;
    }
    if (r.fps_p95 > 0) {
      acc.p95_sum += r.fps_p95;
      acc.p95_days += 1;
    }
    if (r.ram_avg_mb > 0) {
      acc.ram_sum += r.ram_avg_mb;
      acc.ram_days += 1;
    }
    if (r.avg_load_ms > 0) {
      acc.load_sum += r.avg_load_ms;
      acc.load_days += 1;
    }
    return acc;
  }, {
    sessions: 0, errors: 0, custom_events: 0,
    duration_sum: 0, duration_sessions: 0,
    fps_sum: 0, fps_days: 0,
    p95_sum: 0, p95_days: 0,
    ram_sum: 0, ram_days: 0,
    load_sum: 0, load_days: 0,
  });

  const osBreakdown = db.prepare(`
    SELECT os_family AS label, SUM(sessions_count) AS count
    FROM hardware_rollups
    WHERE project_id = ?
    GROUP BY os_family
    ORDER BY count DESC
  `).all(project.id);

  const gpuBreakdown = db.prepare(`
    SELECT
      gpu_tier AS label,
      gpu_vendor AS vendor,
      SUM(sessions_count) AS sessions,
      CASE WHEN SUM(perf_samples_count) > 0 THEN ROUND(SUM(fps_avg_sum) / SUM(perf_samples_count), 1) ELSE 0 END AS avg_fps,
      CASE WHEN SUM(load_count) > 0 THEN ROUND(CAST(SUM(load_ms_sum) AS REAL) / SUM(load_count)) ELSE 0 END AS avg_load_ms
    FROM hardware_rollups
    WHERE project_id = ?
    GROUP BY gpu_tier, gpu_vendor
    ORDER BY sessions DESC
    LIMIT 8
  `).all(project.id);

  const ramBreakdown = db.prepare(`
    SELECT ram_gb_bucket AS label, SUM(sessions_count) AS count
    FROM hardware_rollups
    WHERE project_id = ?
    GROUP BY ram_gb_bucket
    ORDER BY count DESC
  `).all(project.id);

  const topEvents = db.prepare(`
    SELECT event_name AS name, SUM(count) AS count
    FROM event_rollups
    WHERE project_id = ? AND day >= ?
    GROUP BY event_name
    ORDER BY count DESC
    LIMIT 10
  `).all(project.id, cutoffDate);

  const errorGroups = db.prepare(`
    SELECT fingerprint, severity, message, source, first_seen_at, last_seen_at, occurrences
    FROM error_groups
    WHERE project_id = ?
    ORDER BY occurrences DESC, last_seen_at DESC
    LIMIT 12
  `).all(project.id);

  const recentEvents = db.prepare(`
    SELECT session_id, event_type, event_name, ts, summary
    FROM recent_events
    WHERE project_id = ?
    ORDER BY id DESC
    LIMIT 25
  `).all(project.id);

  return {
    project,
    window_days: safeDays,
    kpis: {
      total_sessions: totals.sessions,
      avg_session_sec: totals.duration_sessions > 0 ? Math.round(totals.duration_sum / totals.duration_sessions) : 0,
      avg_fps: totals.fps_days > 0 ? Number((totals.fps_sum / totals.fps_days).toFixed(1)) : 0,
      p95_fps: totals.p95_days > 0 ? Number((totals.p95_sum / totals.p95_days).toFixed(1)) : 0,
      avg_ram_mb: totals.ram_days > 0 ? Math.round(totals.ram_sum / totals.ram_days) : 0,
      avg_load_ms: totals.load_days > 0 ? Math.round(totals.load_sum / totals.load_days) : 0,
      total_errors: totals.errors,
      total_custom_events: totals.custom_events,
    },
    series,
    hardware: {
      os: osBreakdown,
      gpus: gpuBreakdown,
      ram: ramBreakdown,
    },
    top_events: topEvents,
    error_groups: errorGroups,
    recent_events: recentEvents,
  };
}

export function getPublicGamesDatabase(db, { kThreshold = 5, search = '', engine = '' } = {}) {
  const safeK = Math.max(1, Number(kThreshold) || 5);
  const rows = db.prepare(`
    SELECT
      p.id, p.slug, p.name, p.engine_hint, p.description,
      COALESCE(SUM(h.public_sessions_count), 0) AS public_sessions,
      COALESCE(SUM(h.public_perf_samples), 0) AS public_perf_samples,
      COALESCE(SUM(h.public_fps_sum), 0) AS public_fps_sum,
      COALESCE(SUM(h.public_load_count), 0) AS public_load_count,
      COALESCE(SUM(h.public_load_ms_sum), 0) AS public_load_ms_sum,
      COALESCE((SELECT SUM(error_count) FROM daily_rollups d WHERE d.project_id = p.id), 0) AS total_errors,
      COALESCE((SELECT SUM(sessions_count) FROM daily_rollups d WHERE d.project_id = p.id), 0) AS all_sessions
    FROM projects p
    LEFT JOIN hardware_rollups h ON h.project_id = p.id
    WHERE p.public_listing = 1
    GROUP BY p.id
    ORDER BY public_sessions DESC, p.name ASC
  `).all();

  const q = String(search || '').trim().toLowerCase();
  const eng = String(engine || '').trim().toLowerCase();

  const games = [];
  for (const row of rows) {
    if (q && !row.name.toLowerCase().includes(q) && !row.description.toLowerCase().includes(q)) continue;
    if (eng && eng !== 'all' && row.engine_hint.toLowerCase() !== eng) continue;

    // Enforce k-anonymity threshold before publishing aggregated benchmarks
    const meetsK = row.public_sessions >= safeK;
    const avgFps = meetsK && row.public_perf_samples > 0 ? Number((row.public_fps_sum / row.public_perf_samples).toFixed(1)) : null;
    const avgLoadMs = meetsK && row.public_load_count > 0 ? Math.round(row.public_load_ms_sum / row.public_load_count) : null;
    const errorRate = row.all_sessions > 0 ? row.total_errors / row.all_sessions : 0;
    const stabilityScore = meetsK ? Math.max(0, Math.min(100, Math.round((1 - Math.min(errorRate, 1)) * 100))) : null;

    const cohorts = meetsK
      ? db.prepare(`
          SELECT
            os_family,
            gpu_tier,
            SUM(public_sessions_count) AS sample_sessions,
            CASE WHEN SUM(public_perf_samples) > 0 THEN ROUND(SUM(public_fps_sum) / SUM(public_perf_samples), 1) ELSE NULL END AS avg_fps,
            CASE WHEN SUM(public_load_count) > 0 THEN ROUND(CAST(SUM(public_load_ms_sum) AS REAL) / SUM(public_load_count)) ELSE NULL END AS avg_load_ms
          FROM hardware_rollups
          WHERE project_id = ?
          GROUP BY os_family, gpu_tier
          HAVING SUM(public_sessions_count) >= ?
          ORDER BY sample_sessions DESC
          LIMIT 6
        `).all(row.id, safeK)
      : [];

    games.push({
      id: row.id,
      slug: row.slug,
      name: row.name,
      engine: row.engine_hint,
      description: row.description,
      k_anonymity_met: meetsK,
      k_threshold: safeK,
      public_sessions: row.public_sessions,
      avg_fps: avgFps,
      avg_load_ms: avgLoadMs,
      stability_score: stabilityScore,
      verified_cohorts: cohorts,
    });
  }

  return {
    k_threshold: safeK,
    total_games: games.length,
    games,
  };
}

export function listRecentSessions(db, { projectId = 'neocrom-demo', limit = 20 } = {}) {
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20));
  return db.prepare(`
    SELECT
      substr(session_id, 1, 10) AS session_short,
      started_at, last_seen_at, duration_ms,
      engine_name, engine_version, app_version,
      os_family, gpu_tier, ram_gb_bucket, display_bucket, locale_lang,
      public_benchmark
    FROM sessions
    WHERE project_id = ?
    ORDER BY last_seen_at DESC
    LIMIT ?
  `).all(projectId, safeLimit);
}

export function updateProjectSettings(db, projectId, { public_listing } = {}) {
  const existing = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
  if (!existing) return null;
  if (typeof public_listing === 'boolean') {
    db.prepare('UPDATE projects SET public_listing = ? WHERE id = ?').run(public_listing ? 1 : 0, projectId);
  }
  return db.prepare('SELECT id, slug, name, engine_hint, ingest_key, public_listing, description, created_at FROM projects WHERE id = ?').get(projectId);
}
