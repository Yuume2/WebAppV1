export default function HomePage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'system-ui, sans-serif',
        padding: '2rem',
      }}
    >
      <h1 style={{ fontSize: '2.5rem', margin: 0 }}>AI Workspace V1</h1>
      <p style={{ opacity: 0.7, marginTop: '0.75rem' }}>Project foundation initialized</p>
    </main>
  );
}
