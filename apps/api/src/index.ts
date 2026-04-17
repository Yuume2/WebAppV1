import { createServer } from 'node:http';
import { env } from './config/env.js';

const server = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'ok', service: 'webapp-api' }));
});

server.listen(env.port, () => {
  console.log(`[api] listening on http://localhost:${env.port}`);
});
