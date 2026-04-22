import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApiServer } from '../lib/server.js';

export interface Harness {
  baseUrl: string;
  close: () => Promise<void>;
}

export async function startTestServer(): Promise<Harness> {
  const server: Server = createApiServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  return {
    baseUrl,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
