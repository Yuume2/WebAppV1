import Link from 'next/link';
import type { ReactNode } from 'react';
import { HelpButton } from '@/components/HelpButton';
import { UserMenu } from '@/features/auth/UserMenu';

interface AppShellProps {
  title?: string;
  subtitle?: string;
  right?: ReactNode;
  children: ReactNode;
}

export function AppShell({ title = 'AI Workspace V1', subtitle, right, children }: AppShellProps) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <a href="#app-main" className="skip-link">
        Skip to main content
      </a>
      <header
        role="banner"
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
            prefetch={false}
            aria-label="Home — projects"
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {right}
          <HelpButton />
          <UserMenu />
        </div>
      </header>
      <main id="app-main" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {children}
      </main>
    </div>
  );
}

