'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';

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
        <button
          type="button"
          onClick={this.reset}
          style={{
            marginTop: '0.5rem',
            background: '#f5f5f5',
            color: '#0b0b0d',
            border: 'none',
            borderRadius: 8,
            padding: '0.5rem 0.9rem',
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontSize: '0.875rem',
            fontWeight: 500,
            alignSelf: 'flex-start',
          }}
        >
          Try again
        </button>
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
