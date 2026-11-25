import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function openDatabase(dbPath) {
  if (dbPath !== ':memory:') {
    mkdirSync(dirname(dbPath), { recursive: true });
  }
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      engine_hint TEXT NOT NULL DEFAULT 'godot',
      ingest_key TEXT NOT NULL,
      public_listing INTEGER NOT NULL DEFAULT 1,
      description TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      project_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      engine_name TEXT NOT NULL,
      engine_version TEXT NOT NULL,
      app_version TEXT NOT NULL DEFAULT '',
      os_family TEXT NOT NULL DEFAULT 'Unknown',
      gpu_vendor TEXT NOT NULL DEFAULT 'Unknown',
      gpu_tier TEXT NOT NULL DEFAULT 'Unknown',
      ram_gb_bucket TEXT NOT NULL DEFAULT 'Unknown',
      cpu_cores_bucket TEXT NOT NULL DEFAULT 'Unknown',
      display_bucket TEXT NOT NULL DEFAULT 'Unknown',
      locale_lang TEXT NOT NULL DEFAULT 'en',
      public_benchmark INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (project_id, session_id),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS daily_rollups (
      project_id TEXT NOT NULL,
      day TEXT NOT NULL,
      sessions_count INTEGER NOT NULL DEFAULT 0,
      total_duration_ms INTEGER NOT NULL DEFAULT 0,
      perf_samples_count INTEGER NOT NULL DEFAULT 0,
      fps_avg_sum REAL NOT NULL DEFAULT 0,
      fps_p50_sum REAL NOT NULL DEFAULT 0,
      fps_p95_sum REAL NOT NULL DEFAULT 0,
      ram_mb_sum REAL NOT NULL DEFAULT 0,
      load_count INTEGER NOT NULL DEFAULT 0,
      load_ms_sum INTEGER NOT NULL DEFAULT 0,
      error_count INTEGER NOT NULL DEFAULT 0,
      custom_event_count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (project_id, day),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS hardware_rollups (
      project_id TEXT NOT NULL,
      os_family TEXT NOT NULL,
      gpu_vendor TEXT NOT NULL,
      gpu_tier TEXT NOT NULL,
      ram_gb_bucket TEXT NOT NULL,
      cpu_cores_bucket TEXT NOT NULL,
      display_bucket TEXT NOT NULL,
      sessions_count INTEGER NOT NULL DEFAULT 0,
      perf_samples_count INTEGER NOT NULL DEFAULT 0,
      fps_avg_sum REAL NOT NULL DEFAULT 0,
      load_count INTEGER NOT NULL DEFAULT 0,
      load_ms_sum INTEGER NOT NULL DEFAULT 0,
      public_sessions_count INTEGER NOT NULL DEFAULT 0,
      public_perf_samples INTEGER NOT NULL DEFAULT 0,
      public_fps_sum REAL NOT NULL DEFAULT 0,
      public_load_count INTEGER NOT NULL DEFAULT 0,
      public_load_ms_sum INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (project_id, os_family, gpu_vendor, gpu_tier, ram_gb_bucket, cpu_cores_bucket, display_bucket),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS event_rollups (
      project_id TEXT NOT NULL,
      day TEXT NOT NULL,
      event_name TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (project_id, day, event_name),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS error_groups (
      project_id TEXT NOT NULL,
      fingerprint TEXT NOT NULL,
      severity TEXT NOT NULL,
      message TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT '',
      first_seen_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL,
      occurrences INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (project_id, fingerprint),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS recent_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      event_name TEXT NOT NULL DEFAULT '',
      ts INTEGER NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_recent_events_proj ON recent_events(project_id, id DESC);
    CREATE INDEX IF NOT EXISTS idx_sessions_proj_time ON sessions(project_id, last_seen_at DESC);
  `);
  return db;
}

export function seedDemoDataIfEmpty(db) {
  const existing = db.prepare('SELECT COUNT(*) AS count FROM projects').get();
  if (existing.count > 0) return false;

  const now = Math.floor(Date.now() / 1000);
  const projects = [
    {
      id: 'neocrom-demo',
      slug: 'crom-demo-arena',
      name: 'Crom Demo Arena',
      engine_hint: 'godot',
      ingest_key: 'cp_demo_public_ingest_key_2026',
      public_listing: 1,
      description: 'Official Godot 4 reference showcase for Neocrom Pulse telemetry and performance benchmarks.',
    },
    {
      id: 'void-drift',
      slug: 'void-drift',
      name: 'Void Drift',
      engine_hint: 'godot',
      ingest_key: 'cp_void_drift_key_2026',
      public_listing: 1,
      description: 'Minimalist monochrome vector racer distributed on neocrom.pro.',
    },
    {
      id: 'monolith-synth',
      slug: 'monolith-synth',
      name: 'Monolith Synth',
      engine_hint: 'unity',
      ingest_key: 'cp_monolith_synth_key_2026',
      public_listing: 1,
      description: 'Cross-engine rhythmic puzzle sandbox demonstrating Unity & Godot unified telemetry.',
    },
  ];

  const insertProject = db.prepare(`
    INSERT INTO projects (id, slug, name, engine_hint, ingest_key, public_listing, description, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const p of projects) {
    insertProject.run(p.id, p.slug, p.name, p.engine_hint, p.ingest_key, p.public_listing, p.description, now);
  }

  return true;
}
