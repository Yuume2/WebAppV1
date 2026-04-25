'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { AIProvider, ProviderConnection } from '@webapp/types';
import { Button } from '@/components/Button';
import { useToast } from '@/components/ToastHost';
import {
  listProviderConnections,
  removeProviderConnection,
  testProviderConnection,
  upsertProviderConnection,
  type TestConnectionResult,
} from '@/lib/api/provider-connections';
import type { ApiCallError } from '@/lib/api/client';

const PROVIDER_OPTIONS: Array<{ value: AIProvider; label: string }> = [
  { value: 'openai', label: 'OpenAI' },
];

type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; items: ProviderConnection[] }
  | { status: 'error'; message: string };

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().replace('T', ' ').slice(0, 16);
}

function errorMessage(err: unknown): string {
  const e = err as ApiCallError | undefined;
  return e?.message ?? 'Unknown error';
}

export default function ProviderSettingsPage() {
  const [state, setState] = useState<LoadState>({ status: 'idle' });
  const [pendingDelete, setPendingDelete] = useState<ProviderConnection | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [formProvider, setFormProvider] = useState<AIProvider>('openai');
  const [formApiKey, setFormApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const toast = useToast();

  const load = useCallback(async (signal?: AbortSignal) => {
    setState({ status: 'loading' });
    try {
      const items = await listProviderConnections(signal);
      if (signal?.aborted) return;
      setState({ status: 'ready', items });
    } catch (err) {
      if (signal?.aborted) return;
      setState({ status: 'error', message: errorMessage(err) });
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const onSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const key = formApiKey.trim();
      if (!key) {
        setFormError('API key is required.');
        return;
      }
      setSaving(true);
      setFormError(null);
      try {
        await upsertProviderConnection(formProvider, key);
        setFormApiKey('');
        toast.push('success', `${formProvider} connection saved`);
        await load();
      } catch (err) {
        const e = err as ApiCallError | undefined;
        setFormError(e?.message ?? 'Unable to save connection');
        toast.pushError(err, formProvider);
      } finally {
        setSaving(false);
      }
    },
    [formApiKey, formProvider, toast, load],
  );

  const onTest = useCallback(
    async (connection: ProviderConnection) => {
      setTestingId(connection.id);
      try {
        const result: TestConnectionResult = await testProviderConnection(connection.id);
        if (result.ok) {
          toast.push('success', `${connection.provider}: connection OK`);
        } else {
          const code = result.code ?? 'unknown';
          const message = result.message ?? 'Test failed';
          toast.push('error', `${connection.provider}: ${code} — ${message}`);
        }
      } catch (err) {
        toast.pushError(err, connection.provider);
      } finally {
        setTestingId(null);
      }
    },
    [toast],
  );

  const onConfirmDelete = useCallback(async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await removeProviderConnection(pendingDelete.provider);
      setPendingDelete(null);
      await load();
    } catch (err) {
      setDeleteError(errorMessage(err));
    } finally {
      setDeleting(false);
    }
  }, [pendingDelete, load]);

  return (
    <main style={pageStyle}>
      <header style={headerStyle}>
        <h1 style={{ fontSize: '1.5rem', margin: 0 }}>Provider connections</h1>
        <Button variant="ghost" onClick={() => void load()} disabled={state.status === 'loading'}>
          Refresh
        </Button>
      </header>

      <section aria-labelledby="add-connection-title" style={formSectionStyle}>
        <h2 id="add-connection-title" style={{ margin: 0, fontSize: '1rem' }}>Add connection</h2>
        <p style={mutedStyle}>Your key is sent to the API, then cleared from this page.</p>
        <form onSubmit={onSubmit} autoComplete="off" style={formStyle}>
          <label style={labelStyle}>
            <span>Provider</span>
            <select
              value={formProvider}
              onChange={(e) => setFormProvider(e.target.value as AIProvider)}
              disabled={saving}
              style={selectStyle}
            >
              {PROVIDER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label style={labelStyle}>
            <span>API key</span>
            <input
              type="password"
              name="apiKey"
              autoComplete="off"
              spellCheck={false}
              value={formApiKey}
              onChange={(e) => {
                setFormApiKey(e.target.value);
                if (formError) setFormError(null);
              }}
              disabled={saving}
              placeholder="sk-…"
              aria-invalid={formError ? 'true' : undefined}
              style={inputStyle}
            />
          </label>
          {formError && (
            <div role="alert" style={errorBoxStyle}>
              {formError}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button type="submit" disabled={saving || !formApiKey.trim()}>
              {saving ? 'Saving…' : 'Save connection'}
            </Button>
          </div>
        </form>
      </section>

      {state.status === 'loading' && <p style={mutedStyle}>Loading…</p>}

      {state.status === 'error' && (
        <div role="alert" style={errorBoxStyle}>
          Failed to load connections: {state.message}
        </div>
      )}

      {state.status === 'ready' && state.items.length === 0 && (
        <p style={mutedStyle}>No provider connections yet.</p>
      )}

      {state.status === 'ready' && state.items.length > 0 && (
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Provider</th>
              <th style={thStyle}>Label</th>
              <th style={thStyle}>Created</th>
              <th style={thStyle}>Last used</th>
              <th style={thStyle} aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {state.items.map((c) => (
              <tr key={c.id}>
                <td style={tdStyle}>{c.provider}</td>
                <td style={tdStyle}>—</td>
                <td style={tdStyle}>{formatDate(c.createdAt)}</td>
                <td style={tdStyle}>—</td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>
                  <div style={{ display: 'inline-flex', gap: '0.5rem' }}>
                    <Button
                      variant="ghost"
                      onClick={() => void onTest(c)}
                      disabled={testingId === c.id}
                    >
                      {testingId === c.id ? 'Testing…' : 'Test'}
                    </Button>
                    <Button variant="ghost" onClick={() => setPendingDelete(c)}>
                      Delete
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {pendingDelete && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-delete-title"
          style={backdropStyle}
          onClick={() => {
            if (!deleting) setPendingDelete(null);
          }}
        >
          <div
            style={modalStyle}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="confirm-delete-title" style={{ margin: 0, fontSize: '1.1rem' }}>
              Delete connection?
            </h2>
            <p style={mutedStyle}>
              Provider <strong>{pendingDelete.provider}</strong> will be disconnected. This cannot
              be undone.
            </p>
            {deleteError && (
              <div role="alert" style={errorBoxStyle}>
                {deleteError}
              </div>
            )}
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <Button
                variant="ghost"
                onClick={() => setPendingDelete(null)}
                disabled={deleting}
              >
                Cancel
              </Button>
              <Button onClick={onConfirmDelete} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Delete'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

const pageStyle: React.CSSProperties = {
  maxWidth: 880,
  margin: '0 auto',
  padding: '2rem 1.5rem',
  color: '#f5f5f5',
  fontFamily: 'inherit',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: '1.5rem',
};

const mutedStyle: React.CSSProperties = { color: '#9a9aa5' };

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '0.9rem',
};

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '0.6rem 0.75rem',
  borderBottom: '1px solid #2a2a30',
  fontWeight: 600,
  color: '#c0c0cb',
};

const tdStyle: React.CSSProperties = {
  padding: '0.6rem 0.75rem',
  borderBottom: '1px solid #1d1d22',
};

const errorBoxStyle: React.CSSProperties = {
  background: '#3a1d1d',
  border: '1px solid #6b2a2a',
  color: '#ffd3d3',
  padding: '0.75rem 1rem',
  borderRadius: 8,
  marginBottom: '1rem',
};

const backdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.6)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 50,
};

const modalStyle: React.CSSProperties = {
  background: '#141418',
  border: '1px solid #2a2a30',
  borderRadius: 12,
  padding: '1.5rem',
  minWidth: 360,
  maxWidth: 480,
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
  color: '#f5f5f5',
};

const formSectionStyle: React.CSSProperties = {
  background: '#141418',
  border: '1px solid #24242c',
  borderRadius: 12,
  padding: '1.25rem 1.5rem',
  marginBottom: '1.5rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem',
};

const formStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.75rem',
  marginTop: '0.5rem',
};

const labelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.25rem',
  fontSize: '0.8rem',
  color: '#c0c0cb',
};

const selectStyle: React.CSSProperties = {
  background: '#0f0f13',
  border: '1px solid #2a2a30',
  borderRadius: 8,
  padding: '0.5rem 0.6rem',
  color: '#f5f5f5',
  fontSize: '0.875rem',
  fontFamily: 'inherit',
  outline: 'none',
};

const inputStyle: React.CSSProperties = {
  background: '#0f0f13',
  border: '1px solid #2a2a30',
  borderRadius: 8,
  padding: '0.55rem 0.75rem',
  color: '#f5f5f5',
  fontSize: '0.875rem',
  fontFamily: 'inherit',
  outline: 'none',
};
