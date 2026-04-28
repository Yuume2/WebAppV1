import { AppShell } from '@/components/AppShell';
import { Panel } from '@/components/Panel';

export default function HomeLoading() {
  return (
    <AppShell subtitle="Projects">
      <section style={{ padding: '1.5rem', maxWidth: 960, width: '100%', margin: '0 auto' }}>
        <h1 style={{ fontSize: '1.5rem', margin: '0 0 1.25rem 0' }}>Your projects</h1>
        <div
          aria-hidden
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: '1rem',
          }}
        >
          {Array.from({ length: 4 }).map((_, i) => (
            <Panel
              key={i}
              style={{
                padding: '1rem',
                height: 96,
                opacity: 0.65,
                background: '#141418',
                borderColor: '#1d1d22',
              }}
            >
              <SkeletonLine width="55%" />
              <SkeletonLine width="80%" small />
              <SkeletonLine width="35%" tiny />
            </Panel>
          ))}
        </div>
        <span aria-live="polite" style={srOnlyStyle}>
          Loading your projects…
        </span>
      </section>
    </AppShell>
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
        height: tiny ? 8 : small ? 10 : 12,
        background: 'linear-gradient(90deg, #1f1f27 0%, #2a2a35 50%, #1f1f27 100%)',
        backgroundSize: '200% 100%',
        animation: 'wav-shimmer 1.4s linear infinite',
        borderRadius: 4,
        marginTop: tiny ? 14 : small ? 8 : 0,
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
