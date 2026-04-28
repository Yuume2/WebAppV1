'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { ChatWindow } from '@webapp/types';

interface PaletteWindow {
  window: ChatWindow;
  open: boolean;
}

interface WorkspaceCommandPaletteProps {
  visibleWindows: ChatWindow[];
  closedWindows: ChatWindow[];
  activeId: string | null;
  onFocus: (id: string) => void;
  onReopen: (id: string) => void;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return false;
}

export function WorkspaceCommandPalette({
  visibleWindows,
  closedWindows,
  activeId,
  onFocus,
  onReopen,
}: WorkspaceCommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const [pinnedSet, setPinnedSet] = useState<Set<string>>(() => readPinned());
  const [query, setQuery] = useState('');
  const [hover, setHover] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const items: PaletteWindow[] = useMemo(() => {
    const open = visibleWindows.map((w) => ({ window: w, open: true }));
    const closed = closedWindows.map((w) => ({ window: w, open: false }));
    return [...open, ...closed];
  }, [visibleWindows, closedWindows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => {
      const t = it.window.title.toLowerCase();
      return t.includes(q) || it.window.model.toLowerCase().includes(q);
    });
  }, [items, query]);

  useEffect(() => {
    setHover(0);
  }, [query, open]);

  useEffect(() => {
    if (!open) return;
    setPinnedSet(readPinned());
    const onChange = () => setPinnedSet(readPinned());
    window.addEventListener('wav:pin-changed', onChange);
    return () => window.removeEventListener('wav:pin-changed', onChange);
  }, [open]);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        if (isTypingTarget(e.target) && !open) {
          // still allow opening from inside an input
        }
        setOpen((v) => {
          const next = !v;
          if (next) {
            requestAnimationFrame(() => inputRef.current?.focus());
          } else {
            setQuery('');
          }
          return next;
        });
        return;
      }
      if (open && e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        setQuery('');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const choose = (it: PaletteWindow) => {
    if (it.open) onFocus(it.window.id);
    else onReopen(it.window.id);
    setOpen(false);
    setQuery('');
  };

  const onInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHover((h) => (filtered.length > 0 ? (h + 1) % filtered.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHover((h) => (filtered.length > 0 ? (h - 1 + filtered.length) % filtered.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = filtered[Math.min(hover, filtered.length - 1)];
      if (target) choose(target);
    }
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cmdk-title"
      onClick={() => {
        setOpen(false);
        setQuery('');
      }}
      style={backdropStyle}
    >
      <div onClick={(e) => e.stopPropagation()} style={modalStyle}>
        <h2 id="cmdk-title" style={titleStyle}>
          Switch chat window
        </h2>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onInputKeyDown}
          placeholder="Type a window title or model…"
          aria-label="Filter chat windows"
          style={inputStyle}
        />
        <ul role="listbox" aria-label="Chat windows" style={listStyle}>
          {filtered.length === 0 ? (
            <li style={emptyStyle}>No matches.</li>
          ) : (
            filtered.map((it, i) => {
              const isHover = i === Math.min(hover, filtered.length - 1);
              const isActive = it.window.id === activeId;
              return (
                <li
                  key={it.window.id}
                  role="option"
                  aria-selected={isHover}
                  onMouseEnter={() => setHover(i)}
                  onClick={() => choose(it)}
                  style={{
                    ...rowStyle,
                    background: isHover ? '#1c1c28' : 'transparent',
                    border: `1px solid ${isHover ? '#3a3f6b' : 'transparent'}`,
                  }}
                >
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {it.window.title}
                  </span>
                  <span style={metaStyle}>
                    {it.window.provider} · {it.window.model}
                  </span>
                  {pinnedSet.has(it.window.id) ? <span style={pinnedBadgeStyle}>pinned</span> : null}
                  {!it.open ? <span style={badgeStyle}>closed</span> : null}
                  {isActive ? <span style={activeBadgeStyle}>active</span> : null}
                </li>
              );
            })
          )}
        </ul>
        <div style={footerStyle}>
          <span>↑↓ navigate · Enter to switch · Esc to close</span>
        </div>
      </div>
    </div>
  );
}

const backdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.55)',
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'center',
  paddingTop: '12vh',
  zIndex: 65,
};

const modalStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 520,
  background: '#141418',
  border: '1px solid #2a2a30',
  borderRadius: 12,
  padding: '0.9rem 0.9rem 0.7rem',
  color: '#f5f5f5',
  fontFamily: 'inherit',
  boxShadow: '0 18px 48px rgba(0,0,0,0.5)',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '0.78rem',
  color: '#8a8a95',
  fontWeight: 500,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: '#0f0f13',
  border: '1px solid #2a2a30',
  borderRadius: 8,
  padding: '0.55rem 0.7rem',
  color: '#f5f5f5',
  fontSize: '0.9rem',
  fontFamily: 'inherit',
  outline: 'none',
};

const listStyle: React.CSSProperties = {
  listStyle: 'none',
  padding: 0,
  margin: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  maxHeight: 320,
  overflowY: 'auto',
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '0.5rem 0.6rem',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: '0.85rem',
  transition: 'background 80ms ease',
};

const metaStyle: React.CSSProperties = {
  fontSize: '0.7rem',
  color: '#8a8a95',
  flexShrink: 0,
};

const badgeStyle: React.CSSProperties = {
  fontSize: '0.62rem',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  padding: '1px 6px',
  borderRadius: 4,
  background: '#1b1b23',
  border: '1px solid #2a2a30',
  color: '#9a9aa5',
};

const activeBadgeStyle: React.CSSProperties = {
  ...badgeStyle,
  background: '#1c1c28',
  border: '1px solid #3a3f6b',
  color: '#9aa6ff',
};

const emptyStyle: React.CSSProperties = {
  padding: '0.6rem 0.6rem',
  color: '#8a8a95',
  fontSize: '0.85rem',
};

const footerStyle: React.CSSProperties = {
  fontSize: '0.7rem',
  color: '#6a6a75',
  display: 'flex',
  justifyContent: 'space-between',
  paddingTop: 4,
  borderTop: '1px solid #1d1d22',
  marginTop: 4,
};


function readPinned(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  const out = new Set<string>();
  try {
    for (let i = 0; i < window.sessionStorage.length; i += 1) {
      const key = window.sessionStorage.key(i);
      if (!key || !key.startsWith('wav.chat.pinned.')) continue;
      const v = window.sessionStorage.getItem(key);
      if (v === '1' || v === 'true') {
        out.add(key.slice('wav.chat.pinned.'.length));
      }
    }
  } catch {
    // ignore
  }
  return out;
}

const pinnedBadgeStyle: React.CSSProperties = {
  ...badgeStyle,
  background: '#1c1f12',
  border: '1px solid #6b5a2a',
  color: '#f0c14b',
};
