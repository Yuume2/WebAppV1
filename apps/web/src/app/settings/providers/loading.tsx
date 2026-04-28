export default function ProvidersLoading() {
  return (
    <main style={pageStyle}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', margin: 0 }}>Provider connections</h1>
      </header>
      <section style={sectionStyle}>
        <SkeletonLine width="35%" small />
        <SkeletonLine width="70%" tiny />
        <div style={{ height: 8 }} />
        <SkeletonRow />
        <SkeletonRow />
      </section>
      <span aria-live="polite" style={srOnlyStyle}>
        Loading provider settings…
      </span>
    </main>
  );
}

function SkeletonRow() {
  return (
    <div
      style={{
        height: 36,
        borderRadius: 6,
        background: '#141418',
        opacity: 0.7,
        marginTop: 6,
      }}
    />
  );
}

function SkeletonLine({
  width,
  small,
  tiny,
}: {
  width: string;
  small?: boolean;
  tiny?: boolean;
}) {
  return (
    <div
      style={{
        width,
        height: tiny ? 8 : small ? 12 : 14,
        background: 'linear-gradient(90deg, #1f1f27 0%, #2a2a35 50%, #1f1f27 100%)',
        backgroundSize: '200% 100%',
        animation: 'wav-shimmer 1.4s linear infinite',
        borderRadius: 4,
        marginTop: tiny ? 8 : 0,
      }}
    />
  );
}

const pageStyle: React.CSSProperties = {
  maxWidth: 880,
  margin: '0 auto',
  padding: '2rem 1.5rem',
  color: '#f5f5f5',
  fontFamily: 'inherit',
};

const sectionStyle: React.CSSProperties = {
  background: '#141418',
  border: '1px solid #1d1d22',
  borderRadius: 10,
  padding: '1rem 1.1rem',
};

const srOnlyStyle: React.CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
};
