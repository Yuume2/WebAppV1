'use client';

export function HelpButton() {
  return (
    <button
      type="button"
      aria-label="Show keyboard shortcuts"
      title="Keyboard shortcuts (?)"
      onClick={() => {
        if (typeof window === 'undefined') return;
        window.dispatchEvent(new Event('wav:toggle-shortcuts'));
      }}
      style={{
        background: 'transparent',
        border: '1px solid #2a2a30',
        borderRadius: 999,
        width: 26,
        height: 26,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#cfcfd6',
        fontSize: '0.85rem',
        fontFamily: 'inherit',
        cursor: 'pointer',
      }}
    >
      ?
    </button>
  );
}
