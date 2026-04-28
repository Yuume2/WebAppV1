import Link from 'next/link';

export default function NotFound() {
  return (
    <main style={pageStyle}>
      <h1 style={{ margin: 0, fontSize: '1.25rem' }}>Page not found</h1>
      <p style={{ margin: 0, color: '#c9c9d2', fontSize: '0.9rem' }}>
        The page you tried to reach doesn&apos;t exist or was moved.
      </p>
      <Link href="/" style={primaryButton}>
        Back to projects
      </Link>
    </main>
  );
}

const pageStyle: React.CSSProperties = {
  maxWidth: 480,
  margin: '4rem auto',
  padding: '1.5rem',
  background: '#1b1b23',
  border: '1px solid #2a2a30',
  borderRadius: 12,
  display: 'flex',
  flexDirection: 'column',
  gap: '0.75rem',
  color: '#f5f5f5',
  fontFamily: 'inherit',
};

const primaryButton: React.CSSProperties = {
  alignSelf: 'flex-start',
  background: '#f5f5f5',
  color: '#0b0b0d',
  border: 'none',
  borderRadius: 8,
  padding: '0.5rem 0.9rem',
  fontFamily: 'inherit',
  fontSize: '0.875rem',
  fontWeight: 500,
  textDecoration: 'none',
};
