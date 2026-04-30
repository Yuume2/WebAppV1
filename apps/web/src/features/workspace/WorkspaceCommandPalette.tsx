'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { ChatWindow, Project, Workspace } from '@webapp/types';
import type { MockMessage } from '@/lib/data';
import { fetchProjects } from '@/lib/api/projects';
import { getApiBaseUrl } from '@/lib/api/env';
import { listProjects as listMockProjects } from '@/lib/data';

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
  const [pinnedOrder, setPinnedOrder] = useState<string[]>(() => readPinnedOrder());
  const [starredTick, setStarredTick] = useState(0);
  const [recentIds, setRecentIds] = useState<string[]>(() => readRecents(activeWorkspaceId));
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [scopeActiveOnly, setScopeActiveOnly] = useState(false);
  const [hover, setHover] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Other-projects switcher: load lazily on first open and cache for the
  // life of the palette mount. We don't refetch on subsequent opens
  // because the palette is mounted once per workspace page; reopening
  // doesn't justify another network round-trip.
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const projectsLoadedRef = useRef(false);
  useEffect(() => {
    if (!open) return;
    if (projectsLoadedRef.current) return;
    projectsLoadedRef.current = true;
    if (!getApiBaseUrl()) {
      setAllProjects(listMockProjects());
      return;
    }
    let cancelled = false;
    fetchProjects()
      .then((rows) => { if (!cancelled) setAllProjects(rows); })
      .catch(() => { /* swallow — palette stays usable without project switcher */ });
    return () => { cancelled = true; };
  }, [open]);

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

  // Other projects (cross-project switcher). The currently-open project is
  // always excluded — the workspace section above already covers in-project
  // navigation. With no query we cap at 6 to keep the palette readable.
  // Sort by name (case-insensitive) for predictable ordering across opens —
  // server order isn't a stable contract from the palette's POV.
  const PROJECT_SECTION_CAP = 6;
  const filteredOtherProjects = useMemo(() => {
    const q = query.trim().toLowerCase();
    const others = allProjects
      .filter((p) => p.id !== projectId)
      .slice()
      .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
    if (!q) return others.slice(0, PROJECT_SECTION_CAP);
    return others.filter((p) => p.name.toLowerCase().includes(q));
  }, [allProjects, projectId, query]);

  const messageMatches = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    if (!q || q.length < 2 || !getMessages) return [] as Array<{ windowId: string; window: ChatWindow; messageId: string; role: string; snippet: string; createdAt: string }>;
    const allWindows = scopeActiveOnly && activeId
      ? [...visibleWindows, ...closedWindows].filter((w) => w.id === activeId)
      : [...visibleWindows, ...closedWindows];
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
  }, [debouncedQuery, getMessages, visibleWindows, closedWindows, scopeActiveOnly, activeId]);

  type UnifiedItem =
    | { kind: 'workspace'; key: string; workspace: Workspace }
    | { kind: 'window'; key: string; entry: PaletteWindow }
    | { kind: 'message'; key: string; match: typeof messageMatches[number] }
    | { kind: 'starred'; key: string; star: { windowId: string; window: ChatWindow; messageId: string; role: string; snippet: string; fullContent: string } }
    | { kind: 'project'; key: string; project: Project };

  const recentEntries: PaletteWindow[] = useMemo(() => {
    if (query.trim()) return [];
    const all = [
      ...visibleWindows.map((w) => ({ window: w, open: true })),
      ...closedWindows.map((w) => ({ window: w, open: false })),
    ];
    const byId = new Map(all.map((it) => [it.window.id, it]));
    const out: PaletteWindow[] = [];
    for (const id of recentIds) {
      if (id === activeId) continue; // skip the currently focused one
      const it = byId.get(id);
      if (!it) continue;
      out.push(it);
      if (out.length >= 5) break;
    }
    return out;
  }, [query, recentIds, activeId, visibleWindows, closedWindows]);

  const pinnedEntries: PaletteWindow[] = useMemo(() => {
    if (query.trim()) return [];
    if (pinnedSet.size === 0) return [];
    const recentIdSet = new Set(recentEntries.map((r) => r.window.id));
    const all = [
      ...visibleWindows.map((w) => ({ window: w, open: true })),
      ...closedWindows.map((w) => ({ window: w, open: false })),
    ];
    const orderIdx = (id: string) => {
      const i = pinnedOrder.indexOf(id);
      return i < 0 ? Number.MAX_SAFE_INTEGER : i;
    };
    return all
      .filter((it) => pinnedSet.has(it.window.id) && it.window.id !== activeId && !recentIdSet.has(it.window.id))
      .slice()
      .sort((a, b) => orderIdx(a.window.id) - orderIdx(b.window.id))
      .slice(0, 6);
  }, [query, pinnedSet, pinnedOrder, recentEntries, activeId, visibleWindows, closedWindows]);

  const STARRED_COLLAPSED_LIMIT = 6;
  const STARRED_HARD_LIMIT = 60;
  const starredAll = useMemo(() => {
    if (query.trim()) return [] as Array<{ key: string; windowId: string; window: ChatWindow; messageId: string; role: string; snippet: string; fullContent: string }>;
    if (!getMessages) return [];
    const out: Array<{ key: string; windowId: string; window: ChatWindow; messageId: string; role: string; snippet: string; fullContent: string }> = [];
    const allWindows = [...visibleWindows, ...closedWindows];
    for (const w of allWindows) {
      const ids = readStarredIdsForWindow(w.id);
      if (ids.length === 0) continue;
      const idSet = new Set(ids);
      const list = getMessages(w.id);
      for (const m of list) {
        if (!idSet.has(m.id)) continue;
        const content = (m.content ?? '').replace(/\s+/g, ' ').trim();
        const snippet = content.length > 90 ? `${content.slice(0, 90)}…` : content;
        out.push({ key: `${w.id}-${m.id}`, windowId: w.id, window: w, messageId: m.id, role: m.role, snippet, fullContent: m.content ?? '' });
        if (out.length >= STARRED_HARD_LIMIT) break;
      }
      if (out.length >= STARRED_HARD_LIMIT) break;
    }
    return out;
    // starredTick is intentionally a dep so listener-driven refresh re-runs the memo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, getMessages, visibleWindows, closedWindows, starredTick]);
  const [showAllStarred, setShowAllStarred] = useState(false);
  useEffect(() => {
    if (!open) setShowAllStarred(false);
  }, [open]);
  useEffect(() => {
    if (query.trim()) setShowAllStarred(false);
  }, [query]);
  const starredEntries = useMemo(() => {
    if (showAllStarred) return starredAll;
    return starredAll.slice(0, STARRED_COLLAPSED_LIMIT);
  }, [starredAll, showAllStarred]);

  const starredByWindow = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const w of [...visibleWindows, ...closedWindows]) {
      const ids = readStarredIdsForWindow(w.id);
      if (ids.length > 0) map.set(w.id, new Set(ids));
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleWindows, closedWindows, starredTick]);

  type MessageMatch = typeof messageMatches[number];
  const messageGroups = useMemo(() => {
    const order: string[] = [];
    const map = new Map<string, { windowId: string; window: ChatWindow; items: MessageMatch[] }>();
    for (const m of messageMatches) {
      const existing = map.get(m.windowId);
      if (existing) {
        existing.items.push(m);
      } else {
        order.push(m.windowId);
        map.set(m.windowId, { windowId: m.windowId, window: m.window, items: [m] });
      }
    }
    const perWindowLimit = order.length === 1 ? 6 : 3;
    return order.map((id) => {
      const g = map.get(id)!;
      const visible = g.items.slice(0, perWindowLimit);
      const hidden = Math.max(0, g.items.length - visible.length);
      return { windowId: g.windowId, window: g.window, items: visible, total: g.items.length, hiddenCount: hidden };
    });
  }, [messageMatches]);
  const visibleMessageItems: MessageMatch[] = useMemo(() => {
    const out: MessageMatch[] = [];
    for (const g of messageGroups) for (const m of g.items) out.push(m);
    return out;
  }, [messageGroups]);

  const unifiedItems: UnifiedItem[] = useMemo(() => {
    const out: UnifiedItem[] = [];
    for (const it of recentEntries) {
      out.push({ kind: 'window', key: `recent-${it.window.id}`, entry: it });
    }
    for (const it of pinnedEntries) {
      out.push({ kind: 'window', key: `pinned-${it.window.id}`, entry: it });
    }
    for (const s of starredEntries) {
      out.push({ kind: 'starred', key: `star-${s.key}`, star: s });
    }
    if (filteredWorkspaces.length > 1) {
      for (const w of filteredWorkspaces) {
        out.push({ kind: 'workspace', key: `ws-${w.id}`, workspace: w });
      }
    }
    for (const it of filtered) {
      if (recentEntries.some((r) => r.window.id === it.window.id)) continue;
      if (pinnedEntries.some((r) => r.window.id === it.window.id)) continue;
      out.push({ kind: 'window', key: `w-${it.window.id}`, entry: it });
    }
    for (let i = 0; i < visibleMessageItems.length; i += 1) {
      const m = visibleMessageItems[i];
      if (!m) continue;
      out.push({ kind: 'message', key: `m-${m.windowId}-${m.messageId}-${i}`, match: m });
    }
    // Other projects last in the unified order — within-project navigation
    // is far more frequent, so cross-project switching shouldn't shadow
    // window/message items in arrow-key sequencing.
    for (const p of filteredOtherProjects) {
      out.push({ kind: 'project', key: `p-${p.id}`, project: p });
    }
    return out;
  }, [recentEntries, pinnedEntries, starredEntries, filteredWorkspaces, filtered, visibleMessageItems, filteredOtherProjects]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 200);
    return () => clearTimeout(t);
  }, [query]);

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
    setPinnedOrder(readPinnedOrder());
    setRecentIds(readRecents(activeWorkspaceId));
    const onChange = () => {
      setPinnedSet(readPinned());
      setPinnedOrder(readPinnedOrder());
    };
    const onRecents = () => setRecentIds(readRecents(activeWorkspaceId));
    const onStarred = () => setStarredTick((n) => n + 1);
    window.addEventListener('wav:pin-changed', onChange);
    window.addEventListener('wav:recents-changed', onRecents);
    window.addEventListener('wav:starred-changed', onStarred);
    return () => {
      window.removeEventListener('wav:pin-changed', onChange);
      window.removeEventListener('wav:recents-changed', onRecents);
      window.removeEventListener('wav:starred-changed', onStarred);
    };
  }, [open, activeWorkspaceId]);

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
            const restored = readLastQuery(activeWorkspaceId);
            if (restored) setQuery(restored);
            requestAnimationFrame(() => {
              inputRef.current?.focus();
              inputRef.current?.select();
            });
          } else {
            setQuery('');
          }
          return next;
        });
        return;
      }
      if (open && e.key === 'Escape') {
        e.preventDefault();
        if (query.length > 0) {
          setQuery('');
        } else if (showAllStarred) {
          setShowAllStarred(false);
        } else {
          setOpen(false);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, query, activeWorkspaceId, showAllStarred]);

  useEffect(() => {
    if (!open) return;
    writeLastQuery(activeWorkspaceId, query);
  }, [open, query, activeWorkspaceId]);

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
      return;
    }
    if (item.kind === 'starred') {
      const s = item.star;
      const visible = visibleWindows.some((w) => w.id === s.windowId);
      if (!visible) onReopen(s.windowId);
      else onFocus(s.windowId);
      setOpen(false);
      setQuery('');
      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        url.hash = `msg-${s.messageId}`;
        window.history.replaceState(null, '', url.toString());
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      }
      return;
    }
    if (item.kind === 'project') {
      setOpen(false);
      setQuery('');
      if (typeof window !== 'undefined') {
        window.location.assign(`/project/${item.project.id}`);
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
        <div style={{ position: 'relative' }}>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder="Search windows, workspaces, or messages…"
            aria-label="Filter chat windows or workspaces"
            style={{ ...inputStyle, paddingRight: query.length > 0 ? 28 : undefined }}
          />
          {query.length > 0 ? (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              aria-label="Clear search"
              title="Clear search"
              style={{
                position: 'absolute',
                right: 6,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'transparent',
                border: 'none',
                color: '#8a8a95',
                cursor: 'pointer',
                fontSize: '0.95rem',
                lineHeight: 1,
                padding: '2px 6px',
                borderRadius: 4,
                fontFamily: 'inherit',
              }}
            >
              ×
            </button>
          ) : null}
        </div>
        {query.trim().length >= 2 && activeId ? (
          <div style={{ display: 'flex', gap: 6, padding: '0 0.1rem' }}>
            <button
              type="button"
              onClick={() => setScopeActiveOnly(false)}
              aria-pressed={!scopeActiveOnly}
              style={{
                ...scopeChipStyle,
                background: !scopeActiveOnly ? '#1c1c28' : 'transparent',
                color: !scopeActiveOnly ? '#9aa6ff' : '#8a8a95',
                borderColor: !scopeActiveOnly ? '#3a3f6b' : '#24242c',
              }}
            >
              All windows
            </button>
            <button
              type="button"
              onClick={() => setScopeActiveOnly(true)}
              aria-pressed={scopeActiveOnly}
              style={{
                ...scopeChipStyle,
                background: scopeActiveOnly ? '#1c1c28' : 'transparent',
                color: scopeActiveOnly ? '#9aa6ff' : '#8a8a95',
                borderColor: scopeActiveOnly ? '#3a3f6b' : '#24242c',
              }}
            >
              Active window only
            </button>
          </div>
        ) : null}
        {recentEntries.length > 0 ? (
          <div>
            <div style={sectionLabelStyle}>Recent</div>
            <ul role="list" style={listStyle}>
              {recentEntries.map((it) => {
                const idx = unifiedItems.findIndex(
                  (u) => u.kind === 'window' && u.key === `recent-${it.window.id}`,
                );
                const isHover = idx === Math.min(hover, unifiedItems.length - 1);
                return (
                  <li key={`recent-${it.window.id}`} role="option" aria-selected={isHover}
                    onMouseEnter={() => idx >= 0 && setHover(idx)}
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
                    <span style={metaStyle}>{it.window.provider} · {it.window.model}</span>
                    {!it.open ? <span style={badgeStyle}>closed</span> : null}
                    {pinnedSet.has(it.window.id) ? <span style={pinnedBadgeStyle}>pinned</span> : null}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
        {pinnedEntries.length > 0 ? (
          <div>
            <div style={sectionLabelStyle}>Pinned</div>
            <ul role="list" style={listStyle}>
              {pinnedEntries.map((it) => {
                const idx = unifiedItems.findIndex(
                  (u) => u.kind === 'window' && u.key === `pinned-${it.window.id}`,
                );
                const isHover = idx === Math.min(hover, unifiedItems.length - 1);
                return (
                  <li key={`pinned-${it.window.id}`} role="option" aria-selected={isHover}
                    onMouseEnter={() => idx >= 0 && setHover(idx)}
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
                    <span style={metaStyle}>{it.window.provider} · {it.window.model}</span>
                    {!it.open ? <span style={badgeStyle}>closed</span> : null}
                    <span style={pinnedBadgeStyle}>pinned</span>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
        {starredAll.length > 0 ? (
          <div>
            <div style={{ ...sectionLabelStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span>
                Starred messages · {starredEntries.length}
                {starredAll.length > starredEntries.length ? ` of ${starredAll.length}` : ''}
                {starredAll.length >= STARRED_HARD_LIMIT ? '+' : ''}
              </span>
              <span style={{ display: 'inline-flex', gap: 6 }}>
                {starredAll.length > STARRED_COLLAPSED_LIMIT ? (
                  <button
                    type="button"
                    onClick={() => setShowAllStarred((v) => !v)}
                    aria-pressed={showAllStarred}
                    aria-label={showAllStarred ? 'Show fewer starred messages' : `Show all ${starredAll.length} starred messages`}
                    title={showAllStarred ? 'Collapse to top 6' : `Show all ${starredAll.length}`}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#9aa6ff',
                      cursor: 'pointer',
                      fontSize: '0.62rem',
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      fontFamily: 'inherit',
                      padding: '0 0.25rem',
                    }}
                  >
                    {showAllStarred ? 'Show less' : `Show all (${starredAll.length})`}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    if (typeof window === 'undefined') return;
                    const wins = new Set(starredAll.map((s) => s.windowId));
                    for (const wid of wins) {
                      try { window.localStorage.removeItem(`wav.chat.starred.${wid}`); } catch { /* ignore */ }
                    }
                    window.dispatchEvent(new CustomEvent('wav:starred-changed', { detail: { bulk: true } }));
                  }}
                  aria-label={`Unstar all ${starredAll.length} starred messages`}
                  title={`Unstar all ${starredAll.length} starred messages across all windows`}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#9aa6ff',
                    cursor: 'pointer',
                    fontSize: '0.62rem',
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    fontFamily: 'inherit',
                    padding: '0 0.25rem',
                  }}
                >
                  Unstar all
                </button>
              </span>
            </div>
            <ul role="list" style={showAllStarred ? { ...listStyle, maxHeight: 280, overflowY: 'auto' } : listStyle}>
              {starredEntries.map((s) => {
                const idx = unifiedItems.findIndex(
                  (u) => u.kind === 'starred' && u.key === `star-${s.key}`,
                );
                const isHover = idx === Math.min(hover, unifiedItems.length - 1);
                return (
                  <li key={`starred-${s.key}`} style={{ listStyle: 'none' }}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isHover}
                      onMouseEnter={() => idx >= 0 && setHover(idx)}
                      onClick={() => {
                        const visible = visibleWindows.some((w) => w.id === s.windowId);
                        if (!visible) onReopen(s.windowId);
                        else onFocus(s.windowId);
                        setOpen(false);
                        setQuery('');
                        if (typeof window !== 'undefined') {
                          const url = new URL(window.location.href);
                          url.hash = `msg-${s.messageId}`;
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
                      <span aria-hidden style={{ color: '#f0c14b', flexShrink: 0 }}>★</span>
                      <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                        <div
                          title={s.fullContent}
                          style={{
                            fontSize: '0.78rem',
                            color: '#e8e8ef',
                            overflow: 'hidden',
                            display: '-webkit-box',
                            WebkitLineClamp: isHover ? 4 : 1,
                            WebkitBoxOrient: 'vertical',
                            whiteSpace: 'normal',
                            wordBreak: 'break-word',
                          }}
                        >
                          {(isHover ? (s.fullContent || s.snippet) : s.snippet) || '(empty)'}
                        </div>
                        <div style={{ fontSize: '0.65rem', color: '#8a8a95', marginTop: 2 }}>
                          {s.role} · {s.window.title}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
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
          {filtered.length === 0 && messageMatches.length === 0 && filteredWorkspaces.length <= 1 && recentEntries.length === 0 && pinnedEntries.length === 0 && filteredOtherProjects.length === 0 ? (
            <li style={emptyStyle}>
              {query.trim().length === 0
                ? 'No chat windows yet.'
                : query.trim().length < 2
                  ? `No window titled “${query}”. Type 2+ chars to also search messages.`
                  : `No matches for “${query}” in titles or messages.`}
            </li>
          ) : (
            filtered.filter((it) => !recentEntries.some((r) => r.window.id === it.window.id) && !pinnedEntries.some((p) => p.window.id === it.window.id)).map((it) => {
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
        {messageGroups.length > 0 ? (
          <>
            <div style={sectionLabelStyle}>
              Messages · {messageMatches.length} match{messageMatches.length === 1 ? '' : 'es'} in {messageGroups.length} window{messageGroups.length === 1 ? '' : 's'}
            </div>
            <ul role="list" style={{ ...listStyle, maxHeight: 280 }}>
              {messageGroups.map((g) => (
                <li key={`grp-${g.windowId}`} style={{ listStyle: 'none', marginBottom: 4 }}>
                  <div style={{ fontSize: '0.62rem', color: '#6a6a75', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '4px 6px 2px', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>{g.window.title} · {g.total} match{g.total === 1 ? '' : 'es'}</span>
                    {g.windowId === activeId ? (
                      <span style={{ color: '#9aa6ff', textTransform: 'none', letterSpacing: 0, fontSize: '0.6rem' }}>
                        (active)
                      </span>
                    ) : null}
                  </div>
                  {g.items.map((m, i) => {
                    const idx = unifiedItems.findIndex(
                      (u) => u.kind === 'message' && u.match === m,
                    );
                    const isHover = idx === Math.min(hover, unifiedItems.length - 1);
                    return (
                      <button
                        key={`${m.windowId}-${m.messageId}-${i}`}
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
                              display: 'flex',
                              gap: 6,
                              alignItems: 'center',
                            }}
                          >
                            {starredByWindow.get(m.windowId)?.has(m.messageId) ? (
                              <span aria-label="starred" title="Starred message" style={{ color: '#f0c14b', flexShrink: 0 }}>★</span>
                            ) : null}
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {renderHighlighted(m.snippet, query)}
                            </span>
                          </div>
                          <div style={{ fontSize: '0.65rem', color: '#8a8a95', marginTop: 2 }}>
                            {m.role}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                  {g.hiddenCount > 0 ? (
                    <button
                      type="button"
                      onClick={() => {
                        const visible = visibleWindows.some((w) => w.id === g.windowId);
                        if (!visible) onReopen(g.windowId);
                        else onFocus(g.windowId);
                        setOpen(false);
                        setQuery('');
                      }}
                      aria-label={`Open ${g.window.title} to see ${g.hiddenCount} more matches`}
                      style={{
                        ...rowStyle,
                        width: '100%',
                        background: 'transparent',
                        border: '1px dashed #2a2a30',
                        textAlign: 'left',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        color: '#9aa6ff',
                        fontSize: '0.72rem',
                      }}
                    >
                      + {g.hiddenCount} more match{g.hiddenCount === 1 ? '' : 'es'} in this window — open
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        ) : null}
        {filteredOtherProjects.length > 0 ? (
          <div>
            <div style={sectionLabelStyle}>Other projects</div>
            <ul role="list" style={listStyle}>
              {filteredOtherProjects.map((p) => {
                const idx = unifiedItems.findIndex((u) => u.kind === 'project' && u.project.id === p.id);
                const isHover = idx === Math.min(hover, unifiedItems.length - 1);
                return (
                  <li key={p.id} style={{ listStyle: 'none' }}>
                    <Link
                      href={`/project/${p.id}`}
                      onMouseEnter={() => idx >= 0 && setHover(idx)}
                      onClick={() => {
                        setOpen(false);
                        setQuery('');
                      }}
                      style={{
                        ...rowStyle,
                        textDecoration: 'none',
                        color: '#cfcfd6',
                        background: isHover ? '#1c1c28' : 'transparent',
                        border: `1px solid ${isHover ? '#3a3f6b' : 'transparent'}`,
                      }}
                    >
                      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {renderHighlighted(p.name, query)}
                      </span>
                      <span style={badgeStyle} aria-label="project">project</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
        <div
          aria-live="polite"
          aria-atomic="true"
          style={{
            position: 'absolute',
            width: 1,
            height: 1,
            padding: 0,
            margin: -1,
            overflow: 'hidden',
            clip: 'rect(0,0,0,0)',
            whiteSpace: 'nowrap',
            border: 0,
          }}
        >
          {(() => {
            const total = unifiedItems.length;
            if (total === 0) return query.trim() ? `No matches for ${query}` : 'No items';
            return query.trim() ? `${total} result${total === 1 ? '' : 's'} for ${query}` : `${total} item${total === 1 ? '' : 's'}`;
          })()}
        </div>
        <div style={footerStyle}>
          <span>
            {(() => {
              const sel = unifiedItems[Math.min(hover, unifiedItems.length - 1)];
              const enterAction =
                sel?.kind === 'workspace'
                  ? 'Enter to switch workspace'
                  : sel?.kind === 'project'
                    ? 'Enter to switch project'
                    : sel?.kind === 'message'
                      ? 'Enter to jump to message'
                      : sel?.kind === 'starred'
                        ? 'Enter to jump to starred message'
                        : 'Enter to open';
              if (query.trim().length > 0) return `↑↓ navigate · ${enterAction} · Esc clears query, again to close`;
              return `↑↓ navigate · ${enterAction} · Esc to close · type ≥2 chars to search messages`;
            })()}
          </span>
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

function readPinnedOrder(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.sessionStorage.getItem('wav.chat.pinned.order');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === 'string');
  } catch {
    return [];
  }
}

function readStarredIdsForWindow(windowId: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(`wav.chat.starred.${windowId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === 'string');
  } catch {
    return [];
  }
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

function readRecents(workspaceId: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.sessionStorage.getItem(`wav.workspace.recents.${workspaceId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === 'string').slice(0, 8);
  } catch {
    return [];
  }
}

function readLastQuery(workspaceId: string): string {
  if (typeof window === 'undefined') return '';
  try {
    const raw = window.sessionStorage.getItem(`wav.palette.lastQuery.${workspaceId}`);
    return typeof raw === 'string' ? raw.slice(0, 200) : '';
  } catch {
    return '';
  }
}

function writeLastQuery(workspaceId: string, q: string): void {
  if (typeof window === 'undefined') return;
  try {
    if (q) window.sessionStorage.setItem(`wav.palette.lastQuery.${workspaceId}`, q.slice(0, 200));
    else window.sessionStorage.removeItem(`wav.palette.lastQuery.${workspaceId}`);
  } catch {
    // ignore
  }
}


const scopeChipStyle: React.CSSProperties = {
  fontSize: '0.66rem',
  padding: '2px 8px',
  borderRadius: 999,
  border: '1px solid #24242c',
  cursor: 'pointer',
  fontFamily: 'inherit',
  letterSpacing: '0.02em',
};
