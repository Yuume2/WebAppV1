import type { HttpMethod, RouteDefinition, RouteHandler } from './http.js';

export class Router {
  private readonly byMethod = new Map<HttpMethod, Map<string, RouteHandler>>();

  register(route: RouteDefinition): void {
    const methodTable = this.byMethod.get(route.method) ?? new Map<string, RouteHandler>();
    if (methodTable.has(route.path)) {
      throw new Error(`Duplicate route ${route.method} ${route.path}`);
    }
    methodTable.set(route.path, route.handler);
    this.byMethod.set(route.method, methodTable);
  }

  registerAll(routes: RouteDefinition[]): void {
    for (const r of routes) this.register(r);
  }

  match(method: HttpMethod, path: string): RouteHandler | null {
    return this.byMethod.get(method)?.get(path) ?? null;
  }

  hasPath(path: string): boolean {
    for (const table of this.byMethod.values()) {
      if (table.has(path)) return true;
    }
    return false;
  }
}
