'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { ChatWindow, Workspace } from '@webapp/types';
import type { MockMessage } from '@/lib/data';

interface PaletteWindow {
  window: ChatWindow;
  open: boolean;
}

interface WorkspaceCommandPaletteProps {
  projectId: string;
  workspaces: Workspace[];
  activeWorkspaceId: string;
  visibleWindows: ChatWindow[];
  closedWindows: ChatWindow[];
  activeId: string | null;
  unreadByWindow?: Record<string, boolean>;
  unreadCountByWindow?: Record<string, number>;
  getMessages?: (windowId: string) => MockMessage[];
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
  projectId,
  workspaces,
  activeWorkspaceId,
  visibleWindows,
  closedWindows,
  activeId,
  unreadByWindow,
  unreadCountByWindow,
  getMessages,
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

  const filteredWorkspaces = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return workspaces;
    return workspaces.filter((w) => w.name.toLowerCase().includes(q));
  }, [workspaces, query]);

  const messageMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || q.length < 2 || !getMessages) return [] as Array<{ windowId: string; window: ChatWindow; messageId: string; role: string; snippet: string; createdAt: string }>;
    const allWindows = [...visibleWindows, ...closedWindows];
    const out: Array<{ windowId: string; window: ChatWindow; messageId: string; role: string; snippet: string; createdAt: string }> = [];
    for (const w of allWindows) {
      const list = getMessages(w.id);
      for (const m of list) {
        const content = m.content;
        if (!content) continue;
        const lc = content.toLowerCase();
        const idx = lc.indexOf(q);
        if (idx < 0) continue;
        const start = Math.max(0, idx - 28);
        const end = Math.min(content.length, idx + q.length + 60);
        let snippet = content.slice(start, end);
        if (start > 0) snippet = '…' + snippet;
        if (end < content.length) snippet = snippet + '…';
        out.push({
          windowId: w.id,
          window: w,
          messageId: m.id,
          role: m.role,
          snippet: snippet.replace(/\s+/g, ' ').trim(),
          createdAt: m.createdAt,
        });
        if (out.length >= 24) break;
      }
      if (out.length >= 24) break;
    }
    return out;
  }, [query, getMessages, visibleWindows, closedWindows]);

  type UnifiedItem =
    | { kind: 'workspace'; key: string; workspace: Workspace }
    | { kind: 'window'; key: string; entry: PaletteWindow }
    | { kind: 'message'; key: string; match: typeof messageMatches[number] };

  const unifiedItems: UnifiedItem[] = useMemo(() => {
    const out: UnifiedItem[] = [];
    if (filteredWorkspaces.length > 1) {
      for (const w of filteredWorkspaces) {
        out.push({ kind: 'workspace', key: `ws-${w.id}`, workspace: w });
      }
    }
    for (const it of filtered) {
      out.push({ kind: 'window', key: `w-${it.window.id}`, entry: it });
    }
    for (let i = 0; i < messageMatches.length; i += 1) {
      const m = messageMatches[i];
      if (!m) continue;
      out.push({ kind: 'message', key: `m-${m.windowId}-${m.messageId}-${i}`, match: m });
    }
    return out;
  }, [filteredWorkspaces, filtered, messageMatches]);

  useEffect(() => {
    if (!open) {
      setHover(0);
      return;
    }
    if (query) {
      setHover(0);
      return;
    }
    const idx = unifiedItems.findIndex(
      (it) => it.kind === 'window' && unreadByWindow?.[it.entry.window.id],
    );
    setHover(idx >= 0 ? idx : 0);
  }, [query, open, unifiedItems, unreadByWindow]);

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

  const activate = (item: UnifiedItem) => {
    if (item.kind === 'window') {
      choose(item.entry);
      return;
    }
    if (item.kind === 'workspace') {
      setOpen(false);
      setQuery('');
      if (typeof window !== 'undefined') {
        window.location.assign(`/project/${projectId}?workspace=${item.workspace.id}`);
      }
      return;
    }
    if (item.kind === 'message') {
      const m = item.match;
      const visible = visibleWindows.some((w) => w.id === m.windowId);
      if (!visible) onReopen(m.windowId);
      else onFocus(m.windowId);
      setOpen(false);
      setQuery('');
      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        url.hash = `msg-${m.messageId}`;
        window.history.replaceState(null, '', url.toString());
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      }
    }
  };

  const onInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHover((h) => (unifiedItems.length > 0 ? (h + 1) % unifiedItems.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHover((h) => (unifiedItems.length > 0 ? (h - 1 + unifiedItems.length) % unifiedItems.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = unifiedItems[Math.min(hover, unifiedItems.length - 1)];
      if (target) activate(target);
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
          placeholder="Search windows, workspaces, or messages…"
          aria-label="Filter chat windows or workspaces"
          style={inputStyle}
        />
        {filteredWorkspaces.length > 1 ? (
          <div>
            <div style={sectionLabelStyle}>Workspaces</div>
            <ul role="list" style={listStyle}>
              {filteredWorkspaces.map((w) => {
                const active = w.id === activeWorkspaceId;
                const idx = unifiedItems.findIndex((u) => u.kind === 'workspace' && u.workspace.id === w.id);
                const isHover = idx === Math.min(hover, unifiedItems.length - 1);
                return (
                  <li key={w.id} style={{ listStyle: 'none' }}>
                    <Link
                      href={`/project/${projectId}?workspace=${w.id}`}
                      onMouseEnter={() => idx >= 0 && setHover(idx)}
                      onClick={() => {
                        setOpen(false);
                        setQuery('');
                      }}
                      style={{
                        ...rowStyle,
                        textDecoration: 'none',
                        color: active ? '#9aa6ff' : '#cfcfd6',
                        background: isHover ? '#1c1c28' : active ? '#1c1c28' : 'transparent',
                        border: `1px solid ${isHover ? '#3a3f6b' : 'transparent'}`,
                      }}
                    >
                      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {renderHighlighted(w.name, query)}
                      </span>
                      {active ? <span style={activeBadgeStyle}>active</span> : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
            <div style={sectionLabelStyle}>Chat windows</div>
          </div>
        ) : null}
        <ul role="listbox" aria-label="Chat windows" style={listStyle}>
          {filtered.length === 0 ? (
            <li style={emptyStyle}>No matches.</li>
          ) : (
            filtered.map((it) => {
              const idx = unifiedItems.findIndex((u) => u.kind === 'window' && u.entry.window.id === it.window.id);
              const isHover = idx === Math.min(hover, unifiedItems.length - 1);
              const isActive = it.window.id === activeId;
              return (
                <li
                  key={it.window.id}
                  role="option"
                  aria-selected={isHover}
                  onMouseEnter={() => idx >= 0 && setHover(idx)}
                  onClick={() => choose(it)}
                  style={{
                    ...rowStyle,
                    background: isHover ? '#1c1c28' : 'transparent',
                    border: `1px solid ${isHover ? '#3a3f6b' : 'transparent'}`,
                  }}
                >
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {renderHighlighted(it.window.title, query)}
                  </span>
                  <span style={metaStyle}>
                    {it.window.provider} · {it.window.model}
                  </span>
                  {unreadByWindow?.[it.window.id]
                    ? (
                      <span style={unreadBadgeStyle}>
                        {(unreadCountByWindow?.[it.window.id] ?? 0) > 1
                          ? `+${unreadCountByWindow?.[it.window.id]} unread`
                          : 'unread'}
                      </span>
                    )
                    : null}
                  {pinnedSet.has(it.window.id) ? <span style={pinnedBadgeStyle}>pinned</span> : null}
                  {!it.open ? <span style={badgeStyle}>closed</span> : null}
                  {isActive ? <span style={activeBadgeStyle}>active</span> : null}
                </li>
              );
            })
          )}
        </ul>
        {messageMatches.length > 0 ? (
          <>
            <div style={sectionLabelStyle}>Messages · {messageMatches.length}</div>
            <ul role="list" style={{ ...listStyle, maxHeight: 240 }}>
              {messageMatches.map((m, i) => {
                const idx = unifiedItems.findIndex(
                  (u) => u.kind === 'message' && u.match === m,
                );
                const isHover = idx === Math.min(hover, unifiedItems.length - 1);
                return (
                  <li key={`${m.windowId}-${m.messageId}-${i}`} style={{ listStyle: 'none' }}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isHover}
                      onMouseEnter={() => idx >= 0 && setHover(idx)}
                      onClick={() => {
                        const visible = visibleWindows.some((w) => w.id === m.windowId);
                        if (!visible) onReopen(m.windowId);
                        else onFocus(m.windowId);
                        setOpen(false);
                        setQuery('');
                        if (typeof window !== 'undefined') {
                          // Use hash to trigger ChatWindow's existing #msg-<id> scroll/flash effect
                          const url = new URL(window.location.href);
                          url.hash = `msg-${m.messageId}`;
                          window.history.replaceState(null, '', url.toString());
                          window.dispatchEvent(new HashChangeEvent('hashchange'));
                        }
                      }}
                      style={{
                        ...rowStyle,
                        width: '100%',
                        background: isHover ? '#1c1c28' : 'transparent',
                        border: `1px solid ${isHover ? '#3a3f6b' : 'transparent'}`,
                        textAlign: 'left',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        color: '#cfcfd6',
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                        <div
                          style={{
                            fontSize: '0.78rem',
                            color: '#e8e8ef',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {renderHighlighted(m.snippet, query)}
                        </div>
                        <div style={{ fontSize: '0.65rem', color: '#8a8a95', marginTop: 2 }}>
                          {m.role} · {m.window.title}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        ) : null}
        <div style={footerStyle}>
          <span>↑↓ navigate · Enter to open · Esc to close · type ≥2 chars to search messages</span>
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


const sectionLabelStyle: React.CSSProperties = {
  fontSize: '0.62rem',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: '#6a6a75',
  padding: '0.5rem 0.55rem 0.25rem',
};


const unreadBadgeStyle: React.CSSProperties = {
  ...badgeStyle,
  background: '#15203b',
  border: '1px solid #3a3f6b',
  color: '#9aa6ff',
};

function renderHighlighted(content: string, query: string): React.ReactNode {
  const q = query.trim();
  if (!q) return content;
  const lc = content.toLowerCase();
  const lq = q.toLowerCase();
  const out: React.ReactNode[] = [];
  let cursor = 0;
  let key = 0;
  while (cursor < content.length) {
    const idx = lc.indexOf(lq, cursor);
    if (idx < 0) {
      out.push(content.slice(cursor));
      break;
    }
    if (idx > cursor) out.push(content.slice(cursor, idx));
    out.push(
      <mark
        key={key++}
        style={{
          background: '#4f6bff44',
          color: 'inherit',
          borderRadius: 2,
          padding: '0 1px',
        }}
      >
        {content.slice(idx, idx + q.length)}
      </mark>,
    );
    cursor = idx + q.length;
  }
  return out;
}
