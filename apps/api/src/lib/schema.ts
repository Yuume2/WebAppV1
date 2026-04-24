export interface FieldError {
  path: string;
  message: string;
}

export type SchemaResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: FieldError[] };

export interface Schema<T> {
  parse(raw: unknown, path?: string): SchemaResult<T>;
}

function err(path: string, message: string): { ok: false; errors: FieldError[] } {
  return { ok: false, errors: [{ path, message }] };
}

export const s = {
  string(opts: { min?: number; max?: number; pattern?: RegExp; trim?: boolean } = {}): Schema<string> {
    return {
      parse(raw, path = '') {
        if (typeof raw !== 'string') return err(path, 'must be a string');
        const value = opts.trim ? raw.trim() : raw;
        if (opts.min !== undefined && value.length < opts.min) {
          return err(path, `must be at least ${opts.min} character(s)`);
        }
        if (opts.max !== undefined && value.length > opts.max) {
          return err(path, `must be at most ${opts.max} character(s)`);
        }
        if (opts.pattern && !opts.pattern.test(value)) {
          return err(path, 'has invalid format');
        }
        return { ok: true, value };
      },
    };
  },

  number(opts: { int?: boolean; min?: number; max?: number } = {}): Schema<number> {
    return {
      parse(raw, path = '') {
        if (typeof raw !== 'number' || !Number.isFinite(raw)) {
          return err(path, 'must be a finite number');
        }
        if (opts.int && !Number.isInteger(raw)) return err(path, 'must be an integer');
        if (opts.min !== undefined && raw < opts.min) return err(path, `must be ≥ ${opts.min}`);
        if (opts.max !== undefined && raw > opts.max) return err(path, `must be ≤ ${opts.max}`);
        return { ok: true, value: raw };
      },
    };
  },

  boolean(): Schema<boolean> {
    return {
      parse(raw, path = '') {
        if (typeof raw !== 'boolean') return err(path, 'must be a boolean');
        return { ok: true, value: raw };
      },
    };
  },

  literal<L extends string | number | boolean>(value: L): Schema<L> {
    return {
      parse(raw, path = '') {
        if (raw !== value) return err(path, `must equal ${JSON.stringify(value)}`);
        return { ok: true, value };
      },
    };
  },

  enumOf<L extends string>(values: readonly L[]): Schema<L> {
    return {
      parse(raw, path = '') {
        if (typeof raw !== 'string' || !values.includes(raw as L)) {
          return err(path, `must be one of ${values.map((v) => `"${v}"`).join(', ')}`);
        }
        return { ok: true, value: raw as L };
      },
    };
  },

  optional<T>(inner: Schema<T>): Schema<T | undefined> {
    return {
      parse(raw, path = '') {
        if (raw === undefined) return { ok: true, value: undefined };
        return inner.parse(raw, path);
      },
    };
  },

  nullable<T>(inner: Schema<T>): Schema<T | null> {
    return {
      parse(raw, path = '') {
        if (raw === null) return { ok: true, value: null };
        return inner.parse(raw, path);
      },
    };
  },

  array<T>(inner: Schema<T>, opts: { min?: number; max?: number } = {}): Schema<T[]> {
    return {
      parse(raw, path = '') {
        if (!Array.isArray(raw)) return err(path, 'must be an array');
        if (opts.min !== undefined && raw.length < opts.min) {
          return err(path, `must have at least ${opts.min} item(s)`);
        }
        if (opts.max !== undefined && raw.length > opts.max) {
          return err(path, `must have at most ${opts.max} item(s)`);
        }
        const out: T[] = [];
        const errs: FieldError[] = [];
        raw.forEach((item, i) => {
          const r = inner.parse(item, path === '' ? `[${i}]` : `${path}[${i}]`);
          if (r.ok) out.push(r.value);
          else errs.push(...r.errors);
        });
        return errs.length === 0 ? { ok: true, value: out } : { ok: false, errors: errs };
      },
    };
  },

  object<T extends Record<string, unknown>>(shape: { [K in keyof T]: Schema<T[K]> }): Schema<T> {
    return {
      parse(raw, path = '') {
        if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
          return err(path, 'must be a JSON object');
        }
        const src = raw as Record<string, unknown>;
        const out: Partial<T> = {};
        const errs: FieldError[] = [];
        for (const key of Object.keys(shape) as (keyof T)[]) {
          const childPath = path === '' ? String(key) : `${path}.${String(key)}`;
          const r = shape[key].parse(src[key as string], childPath);
          if (r.ok) {
            if (r.value !== undefined) out[key] = r.value;
          } else {
            errs.push(...r.errors);
          }
        }
        return errs.length === 0 ? { ok: true, value: out as T } : { ok: false, errors: errs };
      },
    };
  },
};
