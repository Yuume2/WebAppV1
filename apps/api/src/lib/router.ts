import type { HttpMethod, RouteDefinition, RouteHandler } from './http.js';

export interface RouteMatch {
  handler: RouteHandler;
  params: Record<string, string>;
}

interface CompiledRoute {
  path: string;
  segments: Array<{ kind: 'literal'; value: string } | { kind: 'param'; name: string }>;
  handler: RouteHandler;
}

function compile(path: string): CompiledRoute['segments'] {
  if (path[0] !== '/') throw new Error(`Route path must start with "/": "${path}"`);
  if (path === '/') return [];
  const parts = path.slice(1).split('/');
  return parts.map((part) => {
    if (part.startsWith(':')) {
      const name = part.slice(1);
      if (!name) throw new Error(`Invalid param in route "${path}"`);
      return { kind: 'param', name };
    }
    return { kind: 'literal', value: part };
  });
}

function splitPath(path: string): string[] {
  if (path === '/') return [];
  return path.slice(1).split('/');
}

export class Router {
  private readonly literal = new Map<HttpMethod, Map<string, RouteHandler>>();
  private readonly patterned = new Map<HttpMethod, CompiledRoute[]>();
  private readonly allPaths = new Set<string>();

  register(route: RouteDefinition): void {
    const segments = compile(route.path);
    const hasParam = segments.some((s) => s.kind === 'param');

    if (!hasParam) {
      const table = this.literal.get(route.method) ?? new Map<string, RouteHandler>();
      if (table.has(route.path)) throw new Error(`Duplicate route ${route.method} ${route.path}`);
      table.set(route.path, route.handler);
      this.literal.set(route.method, table);
    } else {
      const list = this.patterned.get(route.method) ?? [];
      if (list.some((r) => r.path === route.path)) {
        throw new Error(`Duplicate route ${route.method} ${route.path}`);
      }
      list.push({ path: route.path, segments, handler: route.handler });
      this.patterned.set(route.method, list);
    }

    this.allPaths.add(route.path);
  }

  registerAll(routes: RouteDefinition[]): void {
    for (const r of routes) this.register(r);
  }

  match(method: HttpMethod, path: string): RouteMatch | null {
    const literalHit = this.literal.get(method)?.get(path);
    if (literalHit) return { handler: literalHit, params: {} };

    const patternList = this.patterned.get(method);
    if (!patternList?.length) return null;

    const requestSegments = splitPath(path);
    for (const route of patternList) {
      if (route.segments.length !== requestSegments.length) continue;
      const params: Record<string, string> = {};
      let matched = true;
      for (let i = 0; i < route.segments.length; i++) {
        const expected = route.segments[i]!;
        const actual = requestSegments[i]!;
        if (expected.kind === 'literal') {
          if (expected.value !== actual) {
            matched = false;
            break;
          }
        } else {
          if (!actual) {
            matched = false;
            break;
          }
          params[expected.name] = decodeURIComponent(actual);
        }
      }
      if (matched) return { handler: route.handler, params };
    }
    return null;
  }

  hasPath(path: string): boolean {
    if (this.allPaths.has(path)) return true;
    const requestSegments = splitPath(path);
    for (const list of this.patterned.values()) {
      for (const route of list) {
        if (route.segments.length !== requestSegments.length) continue;
        let ok = true;
        for (let i = 0; i < route.segments.length; i++) {
          const expected = route.segments[i]!;
          const actual = requestSegments[i]!;
          if (expected.kind === 'literal' && expected.value !== actual) {
            ok = false;
            break;
          }
        }
        if (ok) return true;
      }
    }
    return false;
  }
}
