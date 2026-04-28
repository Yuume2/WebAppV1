'use client';

import { useEffect, useState } from 'react';

interface Shortcut {
  keys: string[];
  description: string;
}

const SHORTCUTS: Shortcut[] = [
  { keys: ['?'], description: 'Show this help' },
  { keys: ['Esc'], description: 'Close menus, modals, search bar, this help' },
  { keys: ['⌘', 'F'], description: 'Find inside the active chat window (Ctrl+F on Linux/Win)' },
  { keys: ['⌘', 'J'], description: 'Focus the composer of the active chat window (Ctrl+J on Linux/Win)' },
  { keys: ['Enter'], description: 'In Find: jump to next match' },
  { keys: ['Shift', 'Enter'], description: 'In Find: jump to previous match  ·  In composer: newline' },
  { keys: ['Enter'], description: 'In composer: send message' },
];

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return false;
}

export function KeyboardShortcutsOverlay() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (isTypingTarget(e.target)) return;
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (e.key === 'Escape' && open) {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="kbd-shortcuts-title"
      onClick={() => setOpen(false)}
      style={backdropStyle}
    >
      <div onClick={(e) => e.stopPropagation()} style={modalStyle}>
        <div style={headerRow}>
          <h2 id="kbd-shortcuts-title" style={{ margin: 0, fontSize: '1.05rem' }}>
            Keyboard shortcuts
          </h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close keyboard shortcuts"
            style={closeButtonStyle}
          >
            ×
          </button>
        </div>
        <ul style={listStyle}>
          {SHORTCUTS.map((s, i) => (
            <li key={i} style={rowStyle}>
              <span style={keysCellStyle}>
                {s.keys.map((k, j) => (
                  <kbd key={j} style={kbdStyle}>{k}</kbd>
                ))}
              </span>
              <span style={descStyle}>{s.description}</span>
            </li>
          ))}
        </ul>
        <div style={footnoteStyle}>
          Press <kbd style={kbdStyle}>?</kbd> to toggle this list.
        </div>
      </div>
    </div>
  );
}

const backdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.6)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 60,
};

const modalStyle: React.CSSProperties = {
  background: '#141418',
  border: '1px solid #2a2a30',
  borderRadius: 12,
  padding: '1.25rem 1.4rem',
  width: '100%',
  maxWidth: 480,
  color: '#f5f5f5',
  fontFamily: 'inherit',
  boxShadow: '0 18px 48px rgba(0,0,0,0.5)',
};

const headerRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: '0.75rem',
};

const closeButtonStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#a0a0aa',
  cursor: 'pointer',
  fontSize: '1.1rem',
  lineHeight: 1,
  padding: '0 6px',
  borderRadius: 4,
  fontFamily: 'inherit',
};

const listStyle: React.CSSProperties = {
  listStyle: 'none',
  padding: 0,
  margin: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};

const rowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '170px 1fr',
  gap: 12,
  alignItems: 'center',
  fontSize: '0.85rem',
};

const keysCellStyle: React.CSSProperties = {
  display: 'inline-flex',
  gap: 4,
  alignItems: 'center',
};

const descStyle: React.CSSProperties = {
  color: '#cfcfd6',
};

const kbdStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '1px 6px',
  background: '#1b1b23',
  border: '1px solid #2a2a30',
  borderBottom: '2px solid #2a2a30',
  borderRadius: 4,
  fontFamily: 'inherit',
  fontSize: '0.75rem',
  color: '#e8e8ef',
};

const footnoteStyle: React.CSSProperties = {
  marginTop: 12,
  fontSize: '0.72rem',
  color: '#8a8a95',
};
