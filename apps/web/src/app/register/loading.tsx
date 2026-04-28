export default function RegisterLoading() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
      }}
    >
      <div
        aria-hidden
        style={{
          width: '100%',
          maxWidth: 380,
          padding: '2rem',
          background: '#141418',
          border: '1px solid #1d1d22',
          borderRadius: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          opacity: 0.85,
        }}
      >
        <SkeletonLine width="40%" />
        <SkeletonField />
        <SkeletonField />
        <SkeletonLine width="100%" tall />
      </div>
      <span aria-live="polite" style={srOnlyStyle}>
        Loading…
      </span>
    </div>
  );
}

function SkeletonField() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <SkeletonLine width="25%" tiny />
      <div
        style={{
          height: 36,
          borderRadius: 6,
          background: '#0f0f13',
          border: '1px solid #2a2a30',
        }}
      />
    </div>
  );
}

function SkeletonLine({
  width,
  tall,
  tiny,
}: {
  width: string;
  tall?: boolean;
  tiny?: boolean;
}) {
  return (
    <div
      style={{
        width,
        height: tall ? 36 : tiny ? 9 : 14,
        background: 'linear-gradient(90deg, #1f1f27 0%, #2a2a35 50%, #1f1f27 100%)',
        backgroundSize: '200% 100%',
        animation: 'wav-shimmer 1.4s linear infinite',
        borderRadius: tall ? 8 : 4,
      }}
    />
  );
}

const srOnlyStyle: React.CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
};
