# auto/routes.md

Generated: 2026-04-21 from apps/api/src/routes/index.ts

```ts
import { healthController } from '../controllers/health.controller.js';
import { listProjectsController } from '../controllers/projects.controller.js';
import type { RouteDefinition } from '../lib/http.js';

export const routes: RouteDefinition[] = [
  { method: 'GET', path: '/health', handler: healthController },
  { method: 'GET', path: '/v1/health', handler: healthController },
  { method: 'GET', path: '/v1/projects', handler: listProjectsController },
];
```
