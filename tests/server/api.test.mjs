import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { createNeocromPulseServer } from '../../server/app.mjs';

async function startTestServer(opts = {}) {
  const { server, db } = createNeocromPulseServer({
    dbPath: ':memory:',
    seedDemo: false,
    kThreshold: opts.kThreshold ?? 5,
    requireSignature: opts.requireSignature ?? false,
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  const baseUrl = `http://127.0.0.1:${addr.port}`;
  return { server, db, baseUrl };
}

function signPayload(secret, ts, bodyBuf) {
  return 'sha256=' + createHmac('sha256', secret).update(String(ts)).update('.').update(bodyBuf).digest('hex');
}

test('ingest gzipped HMAC-signed batch, scrub PII, and aggregate overview', async () => {
  const { server, db, baseUrl } = await startTestServer({ requireSignature: true, kThreshold: 2 });
  try {
    const createRes = await fetch(`${baseUrl}/api/v1/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'pulse-test', name: 'Pulse Test Game', engine_hint: 'godot', public_listing: true }),
    });
    assert.equal(createRes.status, 201);
    const { project } = await createRes.json();

    const nowSec = Math.floor(Date.now() / 1000);
    const envelope = {
      schema_version: 1,
      project_id: project.id,
      session_id: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
      sent_at: nowSec,
      engine: { name: 'godot', version: '4.7.2', app_version: '0.1.0' },
      consent: { gameplay: true, performance: true, errors: true, hardware: true, public_benchmark: true },
      hardware: {
        os_family: 'Linux',
        arch: 'x86_64',
        cpu_cores_bucket: '9-16',
        ram_gb_bucket: '32',
        gpu_vendor: 'AMD',
        gpu_tier: 'AMD Radeon RX 7000',
        display_bucket: '1440p',
        locale_lang: 'de',
      },
      events: [
        { type: 'session_start', ts: nowSec },
        { type: 'load_time', ts: nowSec, name: 'level_01', duration_ms: 350 },
        { type: 'perf_sample', ts: nowSec, metrics: { fps_avg: 120.5, fps_p50: 119.0, fps_p95: 105.0, ram_static_mb: 512.0 } },
        { type: 'custom', ts: nowSec, name: 'quest_complete', props: { quest: 'intro' } },
        {
          type: 'error',
          ts: nowSec,
          error: {
            severity: 'error',
            fingerprint: 'fp_pii_test',
            message: 'Failed saving C:\\Users\\secretuser\\save.dat for user@example.com from 10.20.30.40',
            source: '/home/secretuser/src/save.gd:12',
          },
        },
        { type: 'session_end', ts: nowSec, duration_ms: 120000 },
      ],
    };

    const gz = gzipSync(Buffer.from(JSON.stringify(envelope), 'utf8'));
    const ts = String(nowSec);

    // Reject tampered signature
    const badRes = await fetch(`${baseUrl}/api/v1/ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Encoding': 'gzip',
        'X-Neocrom-Key': project.ingest_key,
        'X-Neocrom-Timestamp': ts,
        'X-Neocrom-Signature': 'sha256=' + '0'.repeat(64),
      },
      body: gz,
    });
    assert.equal(badRes.status, 401);

    // Accept valid gzipped + HMAC-signed batch
    const okRes = await fetch(`${baseUrl}/api/v1/ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Encoding': 'gzip',
        'X-Neocrom-Key': project.ingest_key,
        'X-Neocrom-Timestamp': ts,
        'X-Neocrom-Signature': signPayload(project.ingest_key, ts, gz),
      },
      body: gz,
    });
    assert.equal(okRes.status, 202);
    const okJson = await okRes.json();
    assert.equal(okJson.accepted, 6);

    // Verify dashboard overview & PII scrubbing
    const ovRes = await fetch(`${baseUrl}/api/v1/dashboard/overview?project=${project.id}&days=7`);
    assert.equal(ovRes.status, 200);
    const ov = await ovRes.json();
    assert.equal(ov.kpis.total_sessions, 1);
    assert.equal(ov.kpis.avg_fps, 120.5);
    assert.equal(ov.kpis.avg_load_ms, 350);
    assert.equal(ov.error_groups.length, 1);
    assert.ok(!ov.error_groups[0].message.includes('secretuser'));
    assert.ok(!ov.error_groups[0].message.includes('user@example.com'));
    assert.ok(!ov.error_groups[0].message.includes('10.20.30.40'));
    assert.ok(!ov.error_groups[0].source.includes('secretuser'));

    // Verify k-anonymity hides benchmarks when public_sessions < kThreshold (1 < 2)
    const pub1 = await (await fetch(`${baseUrl}/api/v1/public/games`)).json();
    assert.equal(pub1.games[0].k_anonymity_met, false);
    assert.equal(pub1.games[0].avg_fps, null);

    // Second opted-in session meets kThreshold (2 >= 2)
    const env2 = { ...envelope, session_id: 'f1e2d3c4b5a6f7e8d9c0b1a2f3e4d5c6' };
    const buf2 = Buffer.from(JSON.stringify(env2), 'utf8');
    const res2 = await fetch(`${baseUrl}/api/v1/ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Neocrom-Key': project.ingest_key,
        'X-Neocrom-Timestamp': ts,
        'X-Neocrom-Signature': signPayload(project.ingest_key, ts, buf2),
      },
      body: buf2,
    });
    assert.equal(res2.status, 202);

    const pub2 = await (await fetch(`${baseUrl}/api/v1/public/games`)).json();
    assert.equal(pub2.games[0].k_anonymity_met, true);
    assert.equal(pub2.games[0].avg_fps, 120.5);
    assert.equal(pub2.games[0].verified_cohorts.length, 1);
  } finally {
    db.close();
    await new Promise(resolve => server.close(resolve));
  }
});

test('server enforces consent flags by dropping non-consented event categories', async () => {
  const { server, db, baseUrl } = await startTestServer();
  try {
    const createRes = await fetch(`${baseUrl}/api/v1/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'consent-test', name: 'Consent Test' }),
    });
    const { project } = await createRes.json();

    const nowSec = Math.floor(Date.now() / 1000);
    const res = await fetch(`${baseUrl}/api/v1/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Neocrom-Key': project.ingest_key },
      body: JSON.stringify({
        schema_version: 1,
        project_id: project.id,
        session_id: '11112222333344445555666677778888',
        sent_at: nowSec,
        engine: { name: 'godot', version: '4.7.2' },
        consent: { gameplay: true, performance: false, errors: false, hardware: false, public_benchmark: false },
        events: [
          { type: 'session_start', ts: nowSec },
          { type: 'perf_sample', ts: nowSec, metrics: { fps_avg: 60 } },
          { type: 'error', ts: nowSec, error: { severity: 'error', message: 'should be dropped' } },
        ],
      }),
    });
    assert.equal(res.status, 202);
    const body = await res.json();
    assert.equal(body.accepted, 1);
    assert.equal(body.dropped_by_consent, 2);
  } finally {
    db.close();
    await new Promise(resolve => server.close(resolve));
  }
});
