import Link from 'next/link';
import type { ReactNode } from 'react';

interface AppShellProps {
  title?: string;
  subtitle?: string;
  right?: ReactNode;
  children: ReactNode;
}

export function AppShell({ title = 'AI Workspace V1', subtitle, right, children }: AppShellProps) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.9rem 1.5rem',
          borderBottom: '1px solid #24242c',
          background: '#0f0f13',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem' }}>
          <Link
            href="/"
            style={{
              fontSize: '1rem',
              fontWeight: 600,
              color: '#f5f5f5',
              textDecoration: 'none',
            }}
          >
            {title}
          </Link>
          {subtitle ? (
            <span style={{ fontSize: '0.875rem', color: '#8a8a95' }}>{subtitle}</span>
          ) : null}
        </div>
        <div>{right}</div>
      </header>
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>{children}</main>
    </div>
  );
}
