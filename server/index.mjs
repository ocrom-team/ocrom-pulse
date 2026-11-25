import { createCromPulseServer } from './app.mjs';

const port = Number(process.env.PORT || process.env.CROM_PULSE_PORT || 4318);
const host = process.env.HOST || '127.0.0.1';

const { server } = createCromPulseServer();

server.listen(port, host, () => {
  console.log(`[crom-pulse] Neocrom telemetry API & dashboard listening at http://${host}:${port}`);
});
