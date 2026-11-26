import { createHmac, timingSafeEqual } from 'node:crypto';
import { gunzipSync } from 'node:zlib';

const MAX_COMPRESSED_BYTES = 256 * 1024;
const MAX_DECOMPRESSED_BYTES = 512 * 1024;
const TIMESTAMP_SKEW_SEC = 900; // 15 minutes

const ALLOWED_ENGINES = new Set(['godot', 'unity', 'unreal', 'custom', 'web']);
const ALLOWED_ENVIRONMENTS = new Set(['dev', 'staging', 'prod']);
const ALLOWED_INPUT_MODES = new Set(['keyboard_mouse', 'gamepad', 'touch', 'xr', 'other']);
const ALLOWED_EVENT_TYPES = new Set([
  'session_start',
  'session_heartbeat',
  'session_end',
  'perf_sample',
  'load_time',
  'error',
  'custom',
]);
const ALLOWED_SEVERITIES = new Set(['warning', 'error', 'fatal']);

// Lightweight in-memory token bucket rate limiter (zero disk footprint, no IP persistence)
const rateBuckets = new Map();

export function checkRateLimit(projectId, maxPerMinute = 240) {
  const now = Date.now();
  let bucket = rateBuckets.get(projectId);
  if (!bucket || now > bucket.resetAt) {
    bucket = { count: 0, resetAt: now + 60_000 };
    rateBuckets.set(projectId, bucket);
  }
  bucket.count += 1;
  return bucket.count <= maxPerMinute;
}

export function scrubPii(text, maxLen = 512) {
  if (typeof text !== 'string') return '';
  let out = text.trim()
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[redacted-email]')
    .replace(/[a-zA-Z]:\\Users\\[^\\\s/]+/gi, 'C:\\Users\\[user]')
    .replace(/(?:\/home\/|\/Users\/)[^/\s]+/g, '/home/[user]')
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[redacted-ip]')
    .replace(/(?:bearer|token|key|secret)[=: ]+[a-zA-Z0-9._-]{10,}/gi, '[redacted-secret]');
  if (out.length > maxLen) {
    out = out.slice(0, maxLen - 3) + '...';
  }
  return out;
}

export function verifySignature(secret, timestampHeader, signatureHeader, rawBodyBuffer) {
  if (!timestampHeader || !signatureHeader) return { ok: false, reason: 'missing_signature' };
  const tsNum = Number(timestampHeader);
  const nowSec = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(tsNum) || Math.abs(nowSec - tsNum) > TIMESTAMP_SKEW_SEC) {
    return { ok: false, reason: 'timestamp_skew' };
  }
  const providedHex = String(signatureHeader).replace(/^sha256=/i, '').trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(providedHex)) {
    return { ok: false, reason: 'malformed_signature' };
  }
  const hmac = createHmac('sha256', secret);
  hmac.update(String(timestampHeader));
  hmac.update('.');
  hmac.update(rawBodyBuffer);
  const expectedHex = hmac.digest('hex');
  const a = Buffer.from(providedHex, 'hex');
  const b = Buffer.from(expectedHex, 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: 'invalid_signature' };
  }
  return { ok: true };
}

export function decodeIngestBody(rawBuffer, contentEncoding = '') {
  if (!Buffer.isBuffer(rawBuffer) || rawBuffer.length === 0) {
    throw new HttpError(400, 'Empty request body.');
  }
  if (rawBuffer.length > MAX_COMPRESSED_BYTES) {
    throw new HttpError(413, 'Payload exceeds maximum size.');
  }

  let jsonBuffer = rawBuffer;
  if (String(contentEncoding).toLowerCase().includes('gzip')) {
    try {
      jsonBuffer = gunzipSync(rawBuffer, { maxOutputLength: MAX_DECOMPRESSED_BYTES });
    } catch {
      throw new HttpError(400, 'Invalid gzip payload.');
    }
  } else if (rawBuffer.length > MAX_DECOMPRESSED_BYTES) {
    throw new HttpError(413, 'Payload exceeds maximum size.');
  }

  try {
    return JSON.parse(jsonBuffer.toString('utf8'));
  } catch {
    throw new HttpError(400, 'Malformed JSON payload.');
  }
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function validateBatch(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new HttpError(400, 'Batch payload must be a JSON object.');
  }
  if (payload.schema_version !== 1) {
    throw new HttpError(400, 'Unsupported schema_version; expected 1.');
  }
  if (typeof payload.project_id !== 'string' || !/^[a-z0-9_-]{3,64}$/.test(payload.project_id)) {
    throw new HttpError(400, 'Invalid project_id.');
  }
  if (typeof payload.session_id !== 'string' || !/^[a-zA-Z0-9_-]{16,64}$/.test(payload.session_id)) {
    throw new HttpError(400, 'Invalid session_id.');
  }
  if (!payload.engine || typeof payload.engine !== 'object' || !ALLOWED_ENGINES.has(payload.engine.name)) {
    throw new HttpError(400, 'Invalid engine metadata.');
  }
  if (payload.engine.environment !== undefined && !ALLOWED_ENVIRONMENTS.has(payload.engine.environment)) {
    throw new HttpError(400, 'Invalid engine.environment.');
  }
  if (payload.hardware && payload.hardware.input_mode !== undefined && !ALLOWED_INPUT_MODES.has(payload.hardware.input_mode)) {
    throw new HttpError(400, 'Invalid hardware.input_mode.');
  }
  if (!Array.isArray(payload.events) || payload.events.length === 0 || payload.events.length > 100) {
    throw new HttpError(400, 'events must be an array of 1 to 100 items.');
  }
  for (const ev of payload.events) {
    if (!ev || typeof ev !== 'object' || !ALLOWED_EVENT_TYPES.has(ev.type)) {
      throw new HttpError(400, 'Invalid event type.');
    }
  }
}

export function ingestBatch(db, payload, { ingestKey, timestampHeader, signatureHeader, rawBuffer, requireSignature = false }) {
  validateBatch(payload);

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(payload.project_id);
  if (!project) {
    throw new HttpError(404, 'Unknown project_id.');
  }
  if (!ingestKey || ingestKey !== project.ingest_key) {
    throw new HttpError(401, 'Invalid ingest key.');
  }
  if (signatureHeader || requireSignature) {
    const sigCheck = verifySignature(project.ingest_key, timestampHeader, signatureHeader, rawBuffer);
    if (!sigCheck.ok) {
      throw new HttpError(401, `Signature check failed: ${sigCheck.reason}`);
    }
  }
  if (!checkRateLimit(project.id)) {
    throw new HttpError(429, 'Project ingest rate limit exceeded.');
  }

  const consent = {
    gameplay: Boolean(payload.consent?.gameplay ?? true),
    performance: Boolean(payload.consent?.performance ?? true),
    errors: Boolean(payload.consent?.errors ?? true),
    hardware: Boolean(payload.consent?.hardware ?? false),
    public_benchmark: Boolean(payload.consent?.public_benchmark ?? false),
  };

  const hw = consent.hardware && payload.hardware && typeof payload.hardware === 'object'
    ? {
        os_family: String(payload.hardware.os_family || 'Other').slice(0, 24),
        gpu_vendor: String(payload.hardware.gpu_vendor || 'Other').slice(0, 24),
        gpu_tier: String(payload.hardware.gpu_tier || 'Unknown GPU').slice(0, 64),
        ram_gb_bucket: String(payload.hardware.ram_gb_bucket || 'Unknown').slice(0, 16),
        cpu_cores_bucket: String(payload.hardware.cpu_cores_bucket || 'Unknown').slice(0, 16),
        display_bucket: String(payload.hardware.display_bucket || 'Unknown').slice(0, 16),
        locale_lang: String(payload.hardware.locale_lang || 'en').slice(0, 8),
      }
    : {
        os_family: 'Redacted',
        gpu_vendor: 'Redacted',
        gpu_tier: 'Redacted',
        ram_gb_bucket: 'Redacted',
        cpu_cores_bucket: 'Redacted',
        display_bucket: 'Redacted',
        locale_lang: 'en',
      };

  const nowSec = Math.floor(Date.now() / 1000);
  const existingSession = db.prepare('SELECT duration_ms FROM sessions WHERE project_id = ? AND session_id = ?').get(project.id, payload.session_id);
  const isNewSession = !existingSession;

  let maxDurationDelta = 0;
  let maxSessionDuration = existingSession ? Number(existingSession.duration_ms) : 0;
  let acceptedEvents = 0;
  let droppedByConsent = 0;

  db.exec('BEGIN');
  try {
    if (isNewSession) {
      db.prepare(`
        INSERT INTO sessions (
          project_id, session_id, started_at, last_seen_at, duration_ms,
          engine_name, engine_version, app_version,
          os_family, gpu_vendor, gpu_tier, ram_gb_bucket, cpu_cores_bucket, display_bucket, locale_lang,
          public_benchmark
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        project.id,
        payload.session_id,
        nowSec,
        nowSec,
        0,
        String(payload.engine.name),
        String(payload.engine.version || '').slice(0, 32),
        String(payload.engine.app_version || '').slice(0, 32),
        hw.os_family,
        hw.gpu_vendor,
        hw.gpu_tier,
        hw.ram_gb_bucket,
        hw.cpu_cores_bucket,
        hw.display_bucket,
        hw.locale_lang,
        consent.public_benchmark ? 1 : 0
      );

      if (consent.hardware) {
        db.prepare(`
          INSERT INTO hardware_rollups (
            project_id, os_family, gpu_vendor, gpu_tier, ram_gb_bucket, cpu_cores_bucket, display_bucket,
            sessions_count, public_sessions_count
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
          ON CONFLICT(project_id, os_family, gpu_vendor, gpu_tier, ram_gb_bucket, cpu_cores_bucket, display_bucket)
          DO UPDATE SET
            sessions_count = sessions_count + 1,
            public_sessions_count = public_sessions_count + excluded.public_sessions_count
        `).run(
          project.id, hw.os_family, hw.gpu_vendor, hw.gpu_tier, hw.ram_gb_bucket, hw.cpu_cores_bucket, hw.display_bucket,
          consent.public_benchmark ? 1 : 0
        );
      }

      const today = new Date(nowSec * 1000).toISOString().slice(0, 10);
      db.prepare(`
        INSERT INTO daily_rollups (project_id, day, sessions_count) VALUES (?, ?, 1)
        ON CONFLICT(project_id, day) DO UPDATE SET sessions_count = sessions_count + 1
      `).run(project.id, today);
    }

    const upsertDailyPerf = db.prepare(`
      INSERT INTO daily_rollups (project_id, day, perf_samples_count, fps_avg_sum, fps_p50_sum, fps_p95_sum, ram_mb_sum)
      VALUES (?, ?, 1, ?, ?, ?, ?)
      ON CONFLICT(project_id, day) DO UPDATE SET
        perf_samples_count = perf_samples_count + 1,
        fps_avg_sum = fps_avg_sum + excluded.fps_avg_sum,
        fps_p50_sum = fps_p50_sum + excluded.fps_p50_sum,
        fps_p95_sum = fps_p95_sum + excluded.fps_p95_sum,
        ram_mb_sum = ram_mb_sum + excluded.ram_mb_sum
    `);

    const upsertDailyLoad = db.prepare(`
      INSERT INTO daily_rollups (project_id, day, load_count, load_ms_sum)
      VALUES (?, ?, 1, ?)
      ON CONFLICT(project_id, day) DO UPDATE SET
        load_count = load_count + 1,
        load_ms_sum = load_ms_sum + excluded.load_ms_sum
    `);

    const upsertDailyCustom = db.prepare(`
      INSERT INTO daily_rollups (project_id, day, custom_event_count) VALUES (?, ?, 1)
      ON CONFLICT(project_id, day) DO UPDATE SET custom_event_count = custom_event_count + 1
    `);

    const upsertDailyError = db.prepare(`
      INSERT INTO daily_rollups (project_id, day, error_count) VALUES (?, ?, 1)
      ON CONFLICT(project_id, day) DO UPDATE SET error_count = error_count + 1
    `);

    const upsertEventName = db.prepare(`
      INSERT INTO event_rollups (project_id, day, event_name, count) VALUES (?, ?, ?, 1)
      ON CONFLICT(project_id, day, event_name) DO UPDATE SET count = count + 1
    `);

    const upsertErrorGroup = db.prepare(`
      INSERT INTO error_groups (project_id, fingerprint, severity, message, source, first_seen_at, last_seen_at, occurrences)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
      ON CONFLICT(project_id, fingerprint) DO UPDATE SET
        last_seen_at = MAX(last_seen_at, excluded.last_seen_at),
        occurrences = occurrences + 1
    `);

    const insertRecent = db.prepare(`
      INSERT INTO recent_events (project_id, session_id, event_type, event_name, ts, summary)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (const ev of payload.events) {
      const ts = Number.isFinite(ev.ts) ? Math.min(Math.max(Math.floor(ev.ts), 1700000000), nowSec + 300) : nowSec;
      const day = new Date(ts * 1000).toISOString().slice(0, 10);

      if (ev.type === 'session_start' || ev.type === 'session_heartbeat' || ev.type === 'session_end' || ev.type === 'custom') {
        if (!consent.gameplay) {
          droppedByConsent += 1;
          continue;
        }
        acceptedEvents += 1;
        if (ev.type === 'session_heartbeat' || ev.type === 'session_end') {
          const dur = Math.max(0, Math.min(Number(ev.duration_ms || 0), 86_400_000));
          if (dur > maxSessionDuration) {
            maxDurationDelta += dur - maxSessionDuration;
            maxSessionDuration = dur;
          }
        }
        if (ev.type === 'custom') {
          const evName = scrubPii(String(ev.name || 'unnamed_event'), 64) || 'unnamed_event';
          upsertDailyCustom.run(project.id, day);
          upsertEventName.run(project.id, day, evName);
          insertRecent.run(project.id, payload.session_id.slice(0, 8), 'custom', evName, ts, JSON.stringify(ev.props || {}).slice(0, 140));
        } else {
          insertRecent.run(project.id, payload.session_id.slice(0, 8), ev.type, '', ts, ev.duration_ms ? `${Math.round(ev.duration_ms / 1000)}s` : 'session');
        }
      } else if (ev.type === 'perf_sample') {
        if (!consent.performance) {
          droppedByConsent += 1;
          continue;
        }
        acceptedEvents += 1;
        const m = ev.metrics || {};
        const fpsAvg = Math.max(0, Math.min(Number(m.fps_avg || 0), 1000));
        const fpsP50 = Math.max(0, Math.min(Number(m.fps_p50 || fpsAvg), 1000));
        const fpsP95 = Math.max(0, Math.min(Number(m.fps_p95 || fpsAvg), 1000));
        const ramMb = Math.max(0, Math.min(Number(m.ram_static_mb || 0), 524288));
        upsertDailyPerf.run(project.id, day, fpsAvg, fpsP50, fpsP95, ramMb);

        if (consent.hardware) {
          db.prepare(`
            UPDATE hardware_rollups SET
              perf_samples_count = perf_samples_count + 1,
              fps_avg_sum = fps_avg_sum + ?,
              public_perf_samples = public_perf_samples + ?,
              public_fps_sum = public_fps_sum + ?
            WHERE project_id = ? AND os_family = ? AND gpu_vendor = ? AND gpu_tier = ?
              AND ram_gb_bucket = ? AND cpu_cores_bucket = ? AND display_bucket = ?
          `).run(
            fpsAvg,
            consent.public_benchmark ? 1 : 0,
            consent.public_benchmark ? fpsAvg : 0,
            project.id, hw.os_family, hw.gpu_vendor, hw.gpu_tier, hw.ram_gb_bucket, hw.cpu_cores_bucket, hw.display_bucket
          );
        }
        insertRecent.run(project.id, payload.session_id.slice(0, 8), 'perf_sample', '', ts, `${fpsAvg.toFixed(1)} FPS · ${ramMb.toFixed(0)} MiB`);
      } else if (ev.type === 'load_time') {
        if (!consent.performance) {
          droppedByConsent += 1;
          continue;
        }
        acceptedEvents += 1;
        const loadMs = Math.max(0, Math.min(Math.round(Number(ev.duration_ms || 0)), 600_000));
        const zone = scrubPii(String(ev.name || 'scene'), 64);
        upsertDailyLoad.run(project.id, day, loadMs);
        if (consent.hardware) {
          db.prepare(`
            UPDATE hardware_rollups SET
              load_count = load_count + 1,
              load_ms_sum = load_ms_sum + ?,
              public_load_count = public_load_count + ?,
              public_load_ms_sum = public_load_ms_sum + ?
            WHERE project_id = ? AND os_family = ? AND gpu_vendor = ? AND gpu_tier = ?
              AND ram_gb_bucket = ? AND cpu_cores_bucket = ? AND display_bucket = ?
          `).run(
            loadMs,
            consent.public_benchmark ? 1 : 0,
            consent.public_benchmark ? loadMs : 0,
            project.id, hw.os_family, hw.gpu_vendor, hw.gpu_tier, hw.ram_gb_bucket, hw.cpu_cores_bucket, hw.display_bucket
          );
        }
        insertRecent.run(project.id, payload.session_id.slice(0, 8), 'load_time', zone, ts, `${loadMs} ms`);
      } else if (ev.type === 'error') {
        if (!consent.errors) {
          droppedByConsent += 1;
          continue;
        }
        acceptedEvents += 1;
        const err = ev.error || {};
        const sev = ALLOWED_SEVERITIES.has(err.severity) ? err.severity : 'error';
        const msg = scrubPii(String(err.message || 'Unknown error'), 512) || 'Unknown error';
        const src = scrubPii(String(err.source || ''), 160);
        const fp = String(err.fingerprint || `${sev}:${msg.slice(0, 48)}`).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || 'err_default';
        upsertDailyError.run(project.id, day);
        upsertErrorGroup.run(project.id, fp, sev, msg, src, ts, ts);
        insertRecent.run(project.id, payload.session_id.slice(0, 8), 'error', sev, ts, msg.slice(0, 100));
      }
    }

    if (maxDurationDelta > 0) {
      const today = new Date(nowSec * 1000).toISOString().slice(0, 10);
      db.prepare(`
        INSERT INTO daily_rollups (project_id, day, total_duration_ms) VALUES (?, ?, ?)
        ON CONFLICT(project_id, day) DO UPDATE SET total_duration_ms = total_duration_ms + excluded.total_duration_ms
      `).run(project.id, today, maxDurationDelta);
    }

    db.prepare(`
      UPDATE sessions SET last_seen_at = ?, duration_ms = MAX(duration_ms, ?)
      WHERE project_id = ? AND session_id = ?
    `).run(nowSec, maxSessionDuration, project.id, payload.session_id);

    // Keep recent_events bounded per project (low storage cost)
    db.prepare(`
      DELETE FROM recent_events
      WHERE project_id = ? AND id NOT IN (
        SELECT id FROM recent_events WHERE project_id = ? ORDER BY id DESC LIMIT 120
      )
    `).run(project.id, project.id);

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return {
    accepted: acceptedEvents,
    dropped_by_consent: droppedByConsent,
    session_id: payload.session_id,
  };
}
