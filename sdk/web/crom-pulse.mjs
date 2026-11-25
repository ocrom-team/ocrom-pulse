/**
 * Neocrom Pulse Web / JS SDK (v1 protocol)
 * Lightweight, privacy-first telemetry client for WebGL / HTML5 games on neocrom.pro.
 */
export class CromPulseWeb {
  constructor({ projectId, ingestKey, endpoint = '/api/v1/ingest', appVersion = '0.1.0' }) {
    this.projectId = projectId;
    this.ingestKey = ingestKey;
    this.endpoint = endpoint;
    this.appVersion = appVersion;
    this.sessionId = crypto.randomUUID().replace(/-/g, '');
    this.consent = { decided: false, gameplay: false, performance: false, errors: false, hardware: false, public_benchmark: false };
    this.queue = [];
  }

  setConsent(consent) {
    this.consent = { ...this.consent, ...consent, decided: true };
    if (this.consent.gameplay) {
      this.queue.push({ type: 'session_start', ts: Math.floor(Date.now() / 1000) });
    } else {
      this.queue = [];
    }
  }

  trackEvent(name, props = {}) {
    if (!this.consent.gameplay) return;
    this.queue.push({ type: 'custom', ts: Math.floor(Date.now() / 1000), name: String(name).slice(0, 64), props });
  }

  async flush() {
    if (!this.consent.decided || this.queue.length === 0) return false;
    const events = this.queue.splice(0, 40);
    const body = JSON.stringify({
      schema_version: 1,
      project_id: this.projectId,
      session_id: this.sessionId,
      sent_at: Math.floor(Date.now() / 1000),
      sdk: { name: 'crom-pulse-web', version: '0.1.0' },
      engine: { name: 'web', version: 'es2024', app_version: this.appVersion },
      consent: this.consent,
      events,
    });
    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Crom-Key': this.ingestKey },
      body,
      keepalive: true,
    });
    return res.ok;
  }
}
