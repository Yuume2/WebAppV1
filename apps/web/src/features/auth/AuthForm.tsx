'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Button } from '@/components/Button';
import { Panel } from '@/components/Panel';
import { login, register } from '@/lib/api/auth';
import type { ApiCallError } from '@/lib/api/client';
import { useSession } from '@/features/auth/SessionContext';

function isSafeNext(value: string | null): value is string {
  if (!value) return false;
  if (!value.startsWith('/')) return false;
  if (value.startsWith('//')) return false;
  return true;
}

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
  const searchParams = useSearchParams();
  const { refresh } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const emailRef = useRef<HTMLInputElement | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    setError(null);
    setPending(true);
    const trimmedEmail = email.trim();
    try {
      if (mode === 'login') {
        await login({ email: trimmedEmail, password });
      } else {
        await register({
          email: trimmedEmail,
          password,
          ...(displayName.trim() ? { displayName: displayName.trim() } : {}),
        });
      }
      const nextParam = searchParams?.get('next') ?? null;
      const target = isSafeNext(nextParam) ? nextParam : '/';
      await refresh();
      router.replace(target);
      router.refresh();
    } catch (err) {
      setError(messageFor(err as ApiCallError, mode));
      setPending(false);
      emailRef.current?.focus();
      emailRef.current?.select();
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
              ref={emailRef}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              autoFocus
              spellCheck={false}
              style={inputStyle}
            />
          </Field>
          <Field label="Password">
            <PasswordInput
              value={password}
              onChange={setPassword}
              minLength={mode === 'register' ? 8 : undefined}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
            {mode === 'register' ? (
              <span style={hintStyle}>At least 8 characters.</span>
            ) : null}
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

          <Button type="submit" disabled={pending} aria-busy={pending || undefined}>
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

function PasswordInput({
  value,
  onChange,
  minLength,
  autoComplete,
}: {
  value: string;
  onChange: (next: string) => void;
  minLength?: number;
  autoComplete?: string;
}) {
  const [show, setShow] = useState(false);
  const [capsOn, setCapsOn] = useState(false);
  const updateCaps = (e: KeyboardEvent<HTMLInputElement>) => {
    setCapsOn(e.getModifierState('CapsLock'));
  };
  return (
    <>
      <div style={{ position: 'relative', display: 'flex' }}>
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={updateCaps}
          onKeyUp={updateCaps}
          onBlur={() => setCapsOn(false)}
          required
          minLength={minLength}
          autoComplete={autoComplete}
          aria-describedby={capsOn ? 'capslock-hint' : undefined}
          style={{ ...inputStyle, flex: 1, paddingRight: '3.5rem' }}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? 'Hide password' : 'Show password'}
          aria-pressed={show}
          style={{
            position: 'absolute',
            top: '50%',
            right: 6,
            transform: 'translateY(-50%)',
            background: 'transparent',
            border: 'none',
            color: '#a0a0aa',
            fontSize: '0.72rem',
            fontWeight: 500,
            padding: '4px 8px',
            borderRadius: 4,
            cursor: 'pointer',
            fontFamily: 'inherit',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          {show ? 'Hide' : 'Show'}
        </button>
      </div>
      {capsOn ? (
        <span id="capslock-hint" style={capsHintStyle} role="status">
          Caps Lock is on
        </span>
      ) : null}
    </>
  );
}

const capsHintStyle: React.CSSProperties = {
  fontSize: '0.72rem',
  color: '#ffd166',
};

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

const hintStyle: React.CSSProperties = {
  fontSize: '0.72rem',
  color: '#8a8a95',
};
