'use client';

import Link from 'next/link';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { captureException } from '@/lib/sentry';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    if (typeof console !== 'undefined') {
      console.error('[ErrorBoundary]', error, info.componentStack);
    }
    captureException(error, { componentStack: info.componentStack });
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.reset);
    return (
      <div role="alert" style={fallbackStyle}>
        <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Something went wrong</h2>
        <p style={{ margin: 0, color: '#c9c9d2' }}>{error.message || 'Unknown error'}</p>
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
          <button type="button" onClick={this.reset} style={primaryButtonStyle}>
            Try again
          </button>
          <button
            type="button"
            onClick={() => {
              if (typeof window !== 'undefined') window.location.reload();
            }}
            style={ghostButtonStyle}
          >
            Reload page
          </button>
          <Link href="/" style={ghostButtonStyle}>
            Go home
          </Link>
        </div>
      </div>
    );
  }
}

const fallbackStyle: React.CSSProperties = {
  margin: '2rem auto',
  maxWidth: 640,
  padding: '1.25rem 1.5rem',
  background: '#1b1b23',
  border: '1px solid #3a1d1d',
  borderRadius: 12,
  color: '#f5f5f5',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.75rem',
  fontFamily: 'inherit',
};

const primaryButtonStyle: React.CSSProperties = {
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

const ghostButtonStyle: React.CSSProperties = {
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
