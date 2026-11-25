import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { openDatabase, seedDemoDataIfEmpty } from './db.mjs';
import { decodeIngestBody, HttpError, ingestBatch } from './ingest.mjs';
import { createProject, getDashboardOverview, getPublicGamesDatabase, listProjects, listRecentSessions, updateProjectSettings } from './queries.mjs';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readRawBody(req, maxBytes = 256 * 1024) {
  return new Promise((resolveBody, rejectBody) => {
    const chunks = [];
    let total = 0;
    req.on('data', chunk => {
      total += chunk.length;
      if (total > maxBytes) {
        rejectBody(new HttpError(413, 'Request body too large.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolveBody(Buffer.concat(chunks)));
    req.on('error', rejectBody);
  });
}

export function createCromPulseServer({
  dbPath = process.env.CROM_PULSE_DB || resolve(process.cwd(), 'data/crom-pulse.sqlite'),
  dashboardDir = resolve(process.cwd(), 'dashboard'),
  kThreshold = Number(process.env.CROM_PULSE_K_ANONYMITY || 5),
  requireSignature = process.env.CROM_PULSE_REQUIRE_SIGNATURE === '1',
  seedDemo = true,
} = {}) {
  const db = openDatabase(dbPath);
  if (seedDemo) {
    seedDemoDataIfEmpty(db);
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    // Minimal CORS headers for local dev / web SDKs
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Content-Encoding, X-Crom-Key, X-Crom-Timestamp, X-Crom-Signature');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      if (req.method === 'GET' && pathname === '/api/v1/health') {
        sendJson(res, 200, { ok: true, service: 'crom-pulse', version: '0.1.0', k_threshold: kThreshold });
        return;
      }

      if (req.method === 'POST' && pathname === '/api/v1/ingest') {
        const rawBuffer = await readRawBody(req);
        const payload = decodeIngestBody(rawBuffer, req.headers['content-encoding']);
        const result = ingestBatch(db, payload, {
          ingestKey: req.headers['x-crom-key'],
          timestampHeader: req.headers['x-crom-timestamp'],
          signatureHeader: req.headers['x-crom-signature'],
          rawBuffer,
          requireSignature,
        });
        sendJson(res, 202, result);
        return;
      }

      if (req.method === 'GET' && pathname === '/api/v1/projects') {
        sendJson(res, 200, { projects: listProjects(db) });
        return;
      }

      if (req.method === 'POST' && pathname === '/api/v1/projects') {
        const rawBuffer = await readRawBody(req, 32 * 1024);
        const body = JSON.parse(rawBuffer.toString('utf8') || '{}');
        const created = createProject(db, body);
        sendJson(res, 201, { project: created });
        return;
      }

      if (req.method === 'POST' && pathname === '/api/v1/reset-data') {
        db.exec(`
          DELETE FROM sessions;
          DELETE FROM daily_rollups;
          DELETE FROM hardware_rollups;
          DELETE FROM event_rollups;
          DELETE FROM error_groups;
          DELETE FROM recent_events;
        `);
        sendJson(res, 200, { ok: true, message: 'All telemetry data cleared for real-time live test.' });
        return;
      }

      if (req.method === 'GET' && pathname === '/api/v1/dashboard/overview') {
        const projectId = url.searchParams.get('project') || 'neocrom-demo';
        const days = Number(url.searchParams.get('days') || 14);
        const data = getDashboardOverview(db, { projectId, days });
        if (!data) {
          sendJson(res, 404, { error: 'No projects found.' });
          return;
        }
        sendJson(res, 200, data);
        return;
      }

      if (req.method === 'GET' && pathname === '/api/v1/dashboard/sessions') {
        const projectId = url.searchParams.get('project') || 'neocrom-demo';
        const limit = Number(url.searchParams.get('limit') || 20);
        sendJson(res, 200, { sessions: listRecentSessions(db, { projectId, limit }) });
        return;
      }

      if (req.method === 'PATCH' && pathname.startsWith('/api/v1/projects/')) {
        const projectId = decodeURIComponent(pathname.slice('/api/v1/projects/'.length));
        const rawBuffer = await readRawBody(req, 16 * 1024);
        const body = JSON.parse(rawBuffer.toString('utf8') || '{}');
        const updated = updateProjectSettings(db, projectId, body);
        if (!updated) {
          sendJson(res, 404, { error: 'Project not found.' });
          return;
        }
        sendJson(res, 200, { project: updated });
        return;
      }

      if (req.method === 'GET' && pathname === '/api/v1/public/games') {
        const search = url.searchParams.get('q') || '';
        const engine = url.searchParams.get('engine') || '';
        sendJson(res, 200, getPublicGamesDatabase(db, { kThreshold, search, engine }));
        return;
      }

      if (pathname.startsWith('/api/')) {
        sendJson(res, 404, { error: 'Endpoint not found.' });
        return;
      }

      // Serve Neocrom-styled Analytics Dashboard static assets
      const relPath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
      const safePath = normalize(join(dashboardDir, relPath));
      if (!safePath.startsWith(dashboardDir) || !existsSync(safePath) || statSync(safePath).isDirectory()) {
        const fallback = join(dashboardDir, 'index.html');
        if (existsSync(fallback)) {
          const html = readFileSync(fallback);
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(html);
          return;
        }
        res.writeHead(404);
        res.end('Not found');
        return;
      }

      const ext = extname(safePath);
      res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
      res.end(readFileSync(safePath));
    } catch (err) {
      if (err instanceof HttpError) {
        sendJson(res, err.status, { error: err.message });
        return;
      }
      sendJson(res, 400, { error: err?.message || 'Bad request.' });
    }
  });

  return { server, db };
}
