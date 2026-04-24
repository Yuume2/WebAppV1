'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/Button';
import { Panel } from '@/components/Panel';
import { login, register } from '@/lib/api/auth';
import type { ApiCallError } from '@/lib/api/client';

type Mode = 'login' | 'register';

interface AuthFormProps {
  mode: Mode;
}

const copy: Record<Mode, { title: string; cta: string; switchTo: string; switchHref: string; switchLabel: string }> = {
  login: {
    title: 'Log in',
    cta: 'Log in',
    switchTo: 'No account yet?',
    switchHref: '/register',
    switchLabel: 'Create one',
  },
  register: {
    title: 'Create your account',
    cta: 'Sign up',
    switchTo: 'Already have an account?',
    switchHref: '/login',
    switchLabel: 'Log in',
  },
};

function messageFor(err: ApiCallError, mode: Mode): string {
  switch (err.code) {
    case 'unauthenticated':
      return 'Wrong email or password.';
    case 'conflict':
      return 'An account with that email already exists.';
    case 'validation_error':
      return err.message || 'Invalid input.';
    case 'rate_limited':
      return 'Too many attempts. Try again in a few minutes.';
    case 'no_api_url':
      return 'API URL not configured. Set NEXT_PUBLIC_API_URL.';
    case 'network_error':
    case 'timeout':
      return 'Could not reach the API.';
    default:
      return mode === 'login' ? 'Login failed.' : 'Sign-up failed.';
  }
}

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      if (mode === 'login') {
        await login({ email, password });
      } else {
        await register({
          email,
          password,
          ...(displayName.trim() ? { displayName: displayName.trim() } : {}),
        });
      }
      router.push('/');
      router.refresh();
    } catch (err) {
      setError(messageFor(err as ApiCallError, mode));
      setPending(false);
    }
  }

  const c = copy[mode];

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <Panel style={{ padding: '2rem', width: '100%', maxWidth: 380 }}>
        <h1 style={{ fontSize: '1.25rem', margin: '0 0 1.25rem 0', color: '#f5f5f5' }}>{c.title}</h1>
        <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
          {mode === 'register' ? (
            <Field label="Display name (optional)">
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                autoComplete="name"
                style={inputStyle}
              />
            </Field>
          ) : null}
          <Field label="Email">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              style={inputStyle}
            />
          </Field>
          <Field label="Password">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={mode === 'register' ? 8 : undefined}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              style={inputStyle}
            />
          </Field>

          {error ? (
            <div
              role="alert"
              style={{
                color: '#ffb4b4',
                fontSize: '0.82rem',
                padding: '0.5rem 0.7rem',
                background: '#6b2a2a1a',
                border: '1px solid #6b2a2a55',
                borderRadius: 6,
              }}
            >
              {error}
            </div>
          ) : null}

          <Button type="submit" disabled={pending}>
            {pending ? 'Please wait…' : c.cta}
          </Button>
        </form>
        <div style={{ marginTop: '1.1rem', fontSize: '0.82rem', color: '#8a8a95' }}>
          {c.switchTo}{' '}
          <Link href={c.switchHref} style={{ color: '#e8e8ef' }}>
            {c.switchLabel}
          </Link>
        </div>
      </Panel>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: '0.78rem', color: '#8a8a95' }}>{label}</span>
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '0.55rem 0.7rem',
  borderRadius: 6,
  border: '1px solid #2a2a30',
  background: '#0f0f13',
  color: '#f5f5f5',
  fontSize: '0.9rem',
  fontFamily: 'inherit',
  outline: 'none',
};
