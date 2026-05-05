'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { captureException } from '@/lib/sentry';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (typeof console !== 'undefined') {
      console.error('[GlobalError]', error);
    }
    captureException(error, error.digest ? { digest: error.digest } : undefined);
  }, [error]);

  return (
    <main style={pageStyle} role="alert">
      <h1 style={{ margin: 0, fontSize: '1.25rem' }}>Something went wrong</h1>
      <p style={{ margin: 0, color: '#c9c9d2', fontSize: '0.9rem' }}>
        {error.message || 'Unknown error'}
      </p>
      {error.digest ? (
        <p style={{ margin: 0, color: '#6a6a75', fontSize: '0.72rem' }}>
          Reference: <code>{error.digest}</code>
        </p>
      ) : null}
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
        <button type="button" onClick={reset} style={primaryButton}>
          Try again
        </button>
        <Link href="/" style={ghostButton}>
          Go home
        </Link>
      </div>
    </main>
  );
}

const pageStyle: React.CSSProperties = {
  maxWidth: 560,
  margin: '4rem auto',
  padding: '1.5rem',
  background: '#1b1b23',
  border: '1px solid #3a1d1d',
  borderRadius: 12,
  display: 'flex',
  flexDirection: 'column',
  gap: '0.75rem',
  color: '#f5f5f5',
  fontFamily: 'inherit',
};

const primaryButton: React.CSSProperties = {
  background: '#f5f5f5',
  color: '#0b0b0d',
  border: 'none',
  borderRadius: 8,
  padding: '0.5rem 0.9rem',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: '0.875rem',
  fontWeight: 500,
};

const ghostButton: React.CSSProperties = {
  background: 'transparent',
  color: '#e8e8ef',
  border: '1px solid #2a2a30',
  borderRadius: 8,
  padding: '0.5rem 0.9rem',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: '0.875rem',
  fontWeight: 500,
  textDecoration: 'none',
  display: 'inline-flex',
  alignItems: 'center',
};
