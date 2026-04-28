export default function ProjectLoading() {
  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <aside style={sidebarStyle}>
        <div style={{ padding: '0.9rem 1rem', borderBottom: '1px solid #24242c' }}>
          <SkeletonLine width="60%" tiny />
          <SkeletonLine width="80%" />
          <div style={{ height: 8 }} />
          <SkeletonLine width="100%" small />
        </div>
        <div style={{ flex: 1, padding: '0.5rem' }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              style={{
                height: 44,
                background: '#141418',
                borderRadius: 8,
                marginBottom: 6,
                opacity: 0.7,
              }}
            />
          ))}
        </div>
      </aside>
      <div
        style={{
          flex: 1,
          padding: '1.25rem',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '1rem',
          alignContent: 'start',
        }}
      >
        {Array.from({ length: 2 }).map((_, i) => (
          <div
            key={i}
            style={{
              minHeight: 360,
              background: '#131318',
              border: '1px solid #1d1d22',
              borderRadius: 12,
              opacity: 0.7,
            }}
          />
        ))}
      </div>
      <span aria-live="polite" style={srOnlyStyle}>
        Loading workspace…
      </span>
    </div>
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
        height: tiny ? 8 : small ? 10 : 14,
        background: 'linear-gradient(90deg, #1f1f27 0%, #2a2a35 50%, #1f1f27 100%)',
        backgroundSize: '200% 100%',
        animation: 'wav-shimmer 1.4s linear infinite',
        borderRadius: 4,
        marginTop: tiny ? 0 : 8,
      }}
    />
  );
}

const sidebarStyle: React.CSSProperties = {
  width: 260,
  flexShrink: 0,
  display: 'flex',
  flexDirection: 'column',
  borderRight: '1px solid #24242c',
  background: '#0f0f13',
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
