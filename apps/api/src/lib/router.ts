import type { HttpMethod, RouteDefinition, RouteHandler } from './http.js';

export interface MatchResult {
  handler: RouteHandler;
  params: Record<string, string>;
}

interface PatternEntry {
  pattern: RegExp;
  paramNames: string[];
  handler: RouteHandler;
}

export class Router {
  private readonly exactByMethod = new Map<HttpMethod, Map<string, RouteHandler>>();
  private readonly patternByMethod = new Map<HttpMethod, PatternEntry[]>();

  register(route: RouteDefinition): void {
    if (route.path.includes(':')) {
      const paramNames: string[] = [];
      const regexStr = route.path.replace(/:([^/]+)/g, (_, name: string) => {
        paramNames.push(name);
        return '([^/]+)';
      });
      const pattern = new RegExp(`^${regexStr}$`);
      const entries = this.patternByMethod.get(route.method) ?? [];
      entries.push({ pattern, paramNames, handler: route.handler });
      this.patternByMethod.set(route.method, entries);
    } else {
      const table = this.exactByMethod.get(route.method) ?? new Map<string, RouteHandler>();
      if (table.has(route.path)) {
        throw new Error(`Duplicate route ${route.method} ${route.path}`);
      }
      table.set(route.path, route.handler);
      this.exactByMethod.set(route.method, table);
    }
  }

  registerAll(routes: RouteDefinition[]): void {
    for (const r of routes) this.register(r);
  }

  match(method: HttpMethod, path: string): MatchResult | null {
    const exact = this.exactByMethod.get(method)?.get(path);
    if (exact) return { handler: exact, params: {} };

    for (const entry of this.patternByMethod.get(method) ?? []) {
      const m = path.match(entry.pattern);
      if (m) {
        const params: Record<string, string> = {};
        entry.paramNames.forEach((name, i) => { params[name] = decodeURIComponent(m[i + 1] ?? ''); });
        return { handler: entry.handler, params };
      }
    }
    return null;
  }

  hasPath(path: string): boolean {
    for (const table of this.exactByMethod.values()) {
      if (table.has(path)) return true;
    }
    for (const entries of this.patternByMethod.values()) {
      for (const entry of entries) {
        if (entry.pattern.test(path)) return true;
      }
    }
    return false;
  }
}
