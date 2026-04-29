'use client';

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import type { AIProvider } from '@webapp/types';
import type { MockMessage } from '@/lib/data';
import { useToast } from '@/components/ToastHost';

interface ChatWindowProps {
  id: string;
  title: string;
  provider: AIProvider;
  model: string;
  messages: MockMessage[];
  active?: boolean;
  pending?: boolean;
  onClose?: (id: string) => void;
  onFocus?: (id: string) => void;
  onSend?: (id: string, content: string) => void;
  onRename?: (id: string, title: string) => void;
  onDelete?: (id: string) => void;
  onRetry?: (id: string, clientTempId: string) => void;
  onRegenerate?: (id: string, assistantMessageId: string) => void;
  onCancel?: (id: string) => void;
}

const providerColor: Record<AIProvider, string> = {
  openai: '#10a37f',
  anthropic: '#d97757',
  perplexity: '#6b8afd',
};

const providerLabel: Record<AIProvider, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  perplexity: 'Perplexity',
};

export function ChatWindow({
  id,
  title,
  provider,
  model,
  messages,
  active = false,
  pending = false,
  onClose,
  onFocus,
  onSend,
  onRename,
  onDelete,
  onRetry,
  onRegenerate,
  onCancel,
}: ChatWindowProps) {
  const draftStorageKey = `wav.chat.draft.${id}`;
  const [draft, setDraft] = useState<string>(() => readDraft(draftStorageKey));
  const [editing, setEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(title);
  const searchStorageKey = `wav.chat.search.${id}`;
  const [searchOpen, setSearchOpen] = useState<boolean>(() =>
    readSearchQuery(searchStorageKey).length > 0,
  );
  const [searchQuery, setSearchQuery] = useState<string>(() => readSearchQuery(searchStorageKey));
  const [searchIndex, setSearchIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const stickyRef = useRef(true);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const trimmedQuery = searchQuery.trim();
  const lowerQuery = trimmedQuery.toLowerCase();
  const filteredMessages = lowerQuery
    ? messages.filter((m) => m.content.toLowerCase().includes(lowerQuery))
    : messages;
  const matchCount = lowerQuery ? filteredMessages.length : 0;
  const safeIndex = matchCount > 0 ? Math.min(searchIndex, matchCount - 1) : 0;
  const activeMatchId = matchCount > 0 ? filteredMessages[safeIndex]?.id ?? null : null;
  const messagesSignature = messages
    .map((m) => `${m.id}:${m.content.length}:${m.status ?? 'ok'}`)
    .join('|');

  const scrollStorageKey = `wav.chat.scroll.${id}`;
  const restoredScrollRef = useRef(false);
  const lastGAtRef = useRef<number>(0);
  const scrollSaveTimerRef = useRef<number | null>(null);
  const [scrolledAway, setScrolledAway] = useState(false);
  const [exportLabel, setExportLabel] = useState<'idle' | 'copied' | 'failed'>('idle');
  const toast = useToast();
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const pinStorageKey = `wav.chat.pinned.${id}`;
  const [pinned, setPinned] = useState<boolean>(() => readBoolFlag(pinStorageKey));
  const pinInitRef = useRef(false);
  useEffect(() => {
    writeBoolFlag(pinStorageKey, pinned);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('wav:pin-changed', { detail: { id, pinned } }));
    }
    if (!pinInitRef.current) {
      pinInitRef.current = true;
      return;
    }
    toast.push('info', pinned ? `${title} pinned` : `${title} unpinned`);
  }, [pinStorageKey, pinned, id, title, toast]);

  const updateStickiness = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.clientHeight - el.scrollTop;
    const sticky = distanceFromBottom < 64;
    stickyRef.current = sticky;
    setScrolledAway(!sticky);
    if (restoredScrollRef.current) {
      if (scrollSaveTimerRef.current != null) {
        window.clearTimeout(scrollSaveTimerRef.current);
      }
      const top = el.scrollTop;
      scrollSaveTimerRef.current = window.setTimeout(() => {
        writeScrollTop(scrollStorageKey, top);
      }, 200);
    }
  };

  const scrollToBottom = () => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    stickyRef.current = true;
    setScrolledAway(false);
  };

  const exportConversation = async () => {
    if (typeof window === 'undefined') return;
    const md = messages
      .filter((m) => (m.status ?? 'ok') === 'ok' && m.content.trim().length > 0)
      .map((m) => {
        const role = m.role === 'user' ? 'User' : m.role === 'assistant' ? 'Assistant' : m.role;
        const stamp = m.createdAt ?? '';
        const head = stamp ? `**${role}** · ${stamp}` : `**${role}**`;
        return `${head}\n\n${m.content}`;
      })
      .join('\n\n---\n\n');
    const header = `# ${title}\n\n_${provider} · ${model}_\n\n`;
    const text = header + (md || '_(empty)_') + '\n';
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else if (typeof document !== 'undefined') {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setExportLabel('copied');
      toast.push('success', `${title} — conversation copied as Markdown`);
    } catch {
      setExportLabel('failed');
      toast.push('error', `${title} — could not copy conversation`);
    }
    setTimeout(() => setExportLabel('idle'), 1800);
  };

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (!restoredScrollRef.current) {
      const stored = readScrollTop(scrollStorageKey);
      if (stored != null) {
        const max = el.scrollHeight - el.clientHeight;
        el.scrollTop = Math.min(stored, max);
        const distanceFromBottom = el.scrollHeight - el.clientHeight - el.scrollTop;
        stickyRef.current = distanceFromBottom < 64;
      } else if (stickyRef.current) {
        el.scrollTop = el.scrollHeight;
      }
      restoredScrollRef.current = true;
      return;
    }
    if (stickyRef.current) el.scrollTop = el.scrollHeight;
  }, [messagesSignature, scrollStorageKey]);

  useLayoutEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    const next = Math.min(ta.scrollHeight, 160);
    ta.style.height = `${Math.max(36, next)}px`;
  }, [draft]);

  useEffect(() => {
    writeDraft(draftStorageKey, draft);
  }, [draft, draftStorageKey]);

  useEffect(() => {
    if (!lowerQuery || !activeMatchId) return;
    const el = scrollRef.current?.querySelector(`#msg-${cssEscapeId(activeMatchId)}`);
    if (el && 'scrollIntoView' in el) {
      (el as HTMLElement).scrollIntoView({ block: 'start', behavior: 'auto' });
    }
    stickyRef.current = false;
  }, [lowerQuery, activeMatchId]);

  useEffect(() => {
    setSearchIndex(0);
  }, [lowerQuery]);

  useEffect(() => {
    writeSearchQuery(searchStorageKey, searchQuery);
  }, [searchStorageKey, searchQuery]);

  const [flashedMsgId, setFlashedMsgId] = useState<string | null>(null);
  const handleHashJump = () => {
    if (typeof window === 'undefined') return null;
    const hash = window.location.hash;
    if (!hash || !hash.startsWith('#msg-')) return null;
    const targetId = hash.slice(5);
    const exists = messages.some((m) => m.id === targetId);
    if (!exists) return null;
    const el = scrollRef.current?.querySelector(`#msg-${cssEscapeId(targetId)}`);
    if (el && 'scrollIntoView' in el) {
      (el as HTMLElement).scrollIntoView({ block: 'start', behavior: 'auto' });
    }
    stickyRef.current = false;
    setFlashedMsgId(targetId);
    return targetId;
  };
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const targetId = handleHashJump();
    if (!targetId) return;
    const t = setTimeout(() => setFlashedMsgId(null), 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messagesSignature]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onHash = () => {
      const targetId = handleHashJump();
      if (timer) clearTimeout(timer);
      if (targetId) timer = setTimeout(() => setFlashedMsgId(null), 1500);
    };
    window.addEventListener('hashchange', onHash);
    return () => {
      window.removeEventListener('hashchange', onHash);
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messagesSignature]);

  // Jump-to-first-unread: when this window becomes active, find the first
  // assistant message strictly newer than the previous lastSeen and flash it.
  const lastSeenAtRef = useRef<number>(typeof Date !== 'undefined' ? Date.now() : 0);
  const wasActiveRef = useRef<boolean>(active);
  const unreadIdsRef = useRef<string[]>([]);
  const unreadCursorRef = useRef<number>(-1);
  useEffect(() => {
    if (active && !wasActiveRef.current) {
      const seenAt = lastSeenAtRef.current;
      let firstUnread: { id: string; createdAt: string } | null = null;
      const collected: string[] = [];
      for (const m of messages) {
        if (m.role !== 'assistant') continue;
        if ((m.status ?? 'ok') !== 'ok') continue;
        const t = Date.parse(m.createdAt);
        if (Number.isNaN(t)) continue;
        if (t > seenAt) {
          if (!firstUnread) firstUnread = { id: m.id, createdAt: m.createdAt };
          collected.push(m.id);
        }
      }
      unreadIdsRef.current = collected;
      unreadCursorRef.current = collected.length > 0 ? 0 : -1;
      if (firstUnread) {
        const el = scrollRef.current?.querySelector(`#msg-${cssEscapeId(firstUnread.id)}`);
        if (el && 'scrollIntoView' in el) {
          (el as HTMLElement).scrollIntoView({ block: 'start', behavior: 'auto' });
        }
        stickyRef.current = false;
        setFlashedMsgId(firstUnread.id);
        const handle = setTimeout(() => setFlashedMsgId(null), 1500);
        wasActiveRef.current = true;
        lastSeenAtRef.current = Date.now();
        return () => clearTimeout(handle);
      }
    }
    if (active) lastSeenAtRef.current = Date.now();
    wasActiveRef.current = active;
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, messagesSignature]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        setSearchOpen(true);
        requestAnimationFrame(() => {
          searchInputRef.current?.focus();
          searchInputRef.current?.select();
        });
        return;
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'j' || e.key === 'J')) {
        e.preventDefault();
        textareaRef.current?.focus();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'e' || e.key === 'E') && onRename) {
        e.preventDefault();
        setTitleDraft(title);
        setEditing(true);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'w' || e.key === 'W') && onClose) {
        e.preventDefault();
        onClose(id);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 't' || e.key === 'T')) {
        e.preventDefault();
        setTemplatesOpen((v) => !v);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'Backspace') {
        e.preventDefault();
        setDraft('');
        requestAnimationFrame(() => textareaRef.current?.focus());
        return;
      }
      // Vim-style: G jumps to bottom; g g jumps to top. n/N jumps unread.
      if (!e.metaKey && !e.ctrlKey && !e.altKey) {
        const target = e.target;
        const typing = target instanceof HTMLElement
          && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
        if (typing) return;
        if (e.key === 'n' || e.key === 'N') {
          const ids = unreadIdsRef.current;
          if (ids.length === 0) return;
          e.preventDefault();
          const dir = e.key === 'N' ? -1 : 1;
          const cur = unreadCursorRef.current;
          const next = cur < 0 ? 0 : (cur + dir + ids.length) % ids.length;
          unreadCursorRef.current = next;
          const targetId = ids[next];
          if (!targetId) return;
          const el = scrollRef.current?.querySelector(`#msg-${cssEscapeId(targetId)}`);
          if (el && 'scrollIntoView' in el) {
            (el as HTMLElement).scrollIntoView({ block: 'start', behavior: 'smooth' });
          }
          stickyRef.current = false;
          setFlashedMsgId(targetId);
          setTimeout(() => setFlashedMsgId((prev) => (prev === targetId ? null : prev)), 1500);
          return;
        }
        if (e.key === 'G' && e.shiftKey) {
          e.preventDefault();
          scrollToBottom();
          return;
        }
        if (e.key === 'g' && !e.shiftKey) {
          e.preventDefault();
          if (lastGAtRef.current && Date.now() - lastGAtRef.current < 600) {
            const el = scrollRef.current;
            if (el) {
              el.scrollTop = 0;
              stickyRef.current = false;
              setScrolledAway(true);
            }
            lastGAtRef.current = 0;
          } else {
            lastGAtRef.current = Date.now();
          }
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '.' && pending && onCancel) {
        e.preventDefault();
        onCancel(id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, onRename, onClose, onCancel, pending, title, id]);

  const commitRename = () => {
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== title) onRename?.(id, trimmed);
    else setTitleDraft(title);
    setEditing(false);
  };

  const submit = () => {
    if (pending) return;
    const trimmed = draft.trim();
    if (!trimmed) return;
    stickyRef.current = true;
    onSend?.(id, trimmed);
    setDraft('');
    // If a starred-only or search filter is active when the user hits Send,
    // auto-clear it so they actually see the new message land. Otherwise the
    // send is invisible and can feel like the action did nothing.
    if (showOnlyStarred) setShowOnlyStarred(false);
    if (searchOpen && trimmedQuery.length > 0) setSearchQuery('');
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  // Composer history: when the textarea is empty, ↑/↓ recall recent user prompts.
  // Indexed from 0 = newest. We pull the list from the live messages prop so it
  // always reflects what's on screen — no separate persistence needed.
  const userPromptHistory = messages
    .filter((m) => m.role === 'user' && (m.status ?? 'ok') !== 'failed')
    .map((m) => m.content)
    .reverse();
  const historyIdxRef = useRef<number>(-1);
  const [historyIdx, setHistoryIdx] = useState<number>(-1);
  const setHistoryIdxBoth = (n: number) => {
    historyIdxRef.current = n;
    setHistoryIdx(n);
  };

  const onComposerKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
      setHistoryIdxBoth(-1);
      return;
    }
    if (e.key === 'Escape' && draft.length > 0) {
      e.preventDefault();
      setDraft('');
      setHistoryIdxBoth(-1);
      return;
    }
    if (e.key === 'ArrowUp' && userPromptHistory.length > 0) {
      // Only recall when caret is at start AND on the first line — avoids
      // hijacking normal up-arrow navigation inside multi-line drafts.
      const ta = e.currentTarget;
      const beforeCaret = ta.value.slice(0, ta.selectionStart);
      const onFirstLine = !beforeCaret.includes('\n');
      const isAtStart = ta.selectionStart === 0 && ta.selectionEnd === 0;
      // Activate history recall only when the textarea is empty (first ↑) or
      // we're already cycling (historyIdxRef >= 0). This keeps the bar to
      // entry low — pressing ↑ on a typed-but-not-sent draft doesn't
      // clobber the in-progress text.
      const cyclingActive = historyIdxRef.current >= 0;
      if ((draft.length === 0 || cyclingActive) && (isAtStart || onFirstLine)) {
        e.preventDefault();
        const nextIdx = Math.min(historyIdxRef.current + 1, userPromptHistory.length - 1);
        setHistoryIdxBoth(nextIdx);
        setDraft(userPromptHistory[nextIdx] ?? '');
      }
      return;
    }
    if (e.key === 'ArrowDown' && historyIdxRef.current >= 0) {
      e.preventDefault();
      const nextIdx = historyIdxRef.current - 1;
      setHistoryIdxBoth(nextIdx);
      setDraft(nextIdx < 0 ? '' : userPromptHistory[nextIdx] ?? '');
      return;
    }
  };

  const canSend = !pending && draft.trim().length > 0;

  const onQuoteMessage = (content: string) => {
    if (!content) return;
    const quoted = content
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n');
    setDraft((prev) => {
      const trimmed = prev.replace(/\s+$/, '');
      const sep = trimmed.length === 0 ? '' : trimmed.endsWith('\n') ? '\n' : '\n\n';
      return `${trimmed}${sep}${quoted}\n\n`;
    });
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (!ta) return;
      ta.focus();
      ta.selectionStart = ta.selectionEnd = ta.value.length;
    });
    toast.push('info', `Quoted into ${title}`);
  };

  const starredStorageKey = `wav.chat.starred.${id}`;
  const [starredIds, setStarredIds] = useState<Set<string>>(() => readStarred(starredStorageKey));
  useEffect(() => {
    writeStarred(starredStorageKey, starredIds);
  }, [starredStorageKey, starredIds]);
  const toggleStar = (msgId: string) => {
    setStarredIds((prev) => {
      const next = new Set(prev);
      const willStar = !next.has(msgId);
      if (next.has(msgId)) next.delete(msgId);
      else next.add(msgId);
      toast.push('info', willStar ? 'Message starred' : 'Message unstarred');
      return next;
    });
  };

  const showStarredStorageKey = `wav.chat.showStarred.${id}`;
  const [showOnlyStarred, setShowOnlyStarred] = useState<boolean>(() => readBoolFlag(showStarredStorageKey));
  useEffect(() => {
    writeBoolFlag(showStarredStorageKey, showOnlyStarred);
  }, [showStarredStorageKey, showOnlyStarred]);
  // Auto-clear the filter when the underlying star set becomes empty so the
  // user isn't left staring at a permanent empty state with no obvious recovery.
  useEffect(() => {
    if (showOnlyStarred && starredIds.size === 0) setShowOnlyStarred(false);
  }, [showOnlyStarred, starredIds.size]);
  const displayedMessages = showOnlyStarred
    ? filteredMessages.filter((m) => starredIds.has(m.id))
    : filteredMessages;

  return (
    <div
      onClick={() => onFocus?.(id)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 360,
        background: '#131318',
        border: `1px solid ${active ? '#4f6bff' : '#24242c'}`,
        boxShadow: active ? '0 0 0 1px rgba(79,107,255,0.35)' : 'none',
        borderRadius: 12,
        overflow: 'hidden',
        transition: 'border-color 120ms ease, box-shadow 120ms ease',
        cursor: active ? 'default' : 'pointer',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.65rem 0.9rem',
          borderBottom: '1px solid #24242c',
          background: active ? '#1c1c28' : '#181820',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
          {editing ? (
            <input
              autoFocus
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') {
                  setTitleDraft(title);
                  setEditing(false);
                }
              }}
              onClick={(e) => e.stopPropagation()}
              aria-label="Rename window"
              style={{
                background: '#0f0f13',
                border: '1px solid #2a2a30',
                borderRadius: 4,
                padding: '2px 6px',
                color: '#f5f5f5',
                fontSize: '0.9rem',
                fontWeight: 600,
                fontFamily: 'inherit',
                outline: 'none',
                width: '100%',
              }}
            />
          ) : (
            <span
              onDoubleClick={(e) => {
                e.stopPropagation();
                if (!onRename) return;
                setTitleDraft(title);
                setEditing(true);
              }}
              title={onRename ? 'Double-click to rename' : title}
              style={{
                fontSize: '0.9rem',
                fontWeight: 600,
                color: '#f5f5f5',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                cursor: onRename ? 'text' : 'inherit',
              }}
            >
              {title}
            </span>
          )}
          <ProviderBadge provider={provider} model={model} />
          {pending ? (
            <span
              role="status"
              aria-live="polite"
              style={{
                marginTop: 4,
                alignSelf: 'flex-start',
                fontSize: '0.62rem',
                color: '#9aa6ff',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              Generating…
            </span>
          ) : null}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setPinned((v) => !v);
            }}
            aria-label={pinned ? 'Unpin chat window' : 'Pin chat window'}
            aria-pressed={pinned}
            title={pinned ? 'Unpin (kept first in sidebar)' : 'Pin (keep first in sidebar)'}
            style={{
              background: 'transparent',
              border: 'none',
              color: pinned ? '#f0c14b' : '#8a8a95',
              cursor: 'pointer',
              fontSize: '0.7rem',
              fontWeight: 500,
              padding: '0.25rem 0.5rem',
              borderRadius: 6,
              lineHeight: 1,
              fontFamily: 'inherit',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            {pinned ? 'Pinned' : 'Pin'}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              void exportConversation();
            }}
            aria-label="Copy conversation as Markdown"
            title="Copy conversation as Markdown"
            style={{
              background: 'transparent',
              border: 'none',
              color: exportLabel === 'copied' ? '#9aa6ff' : exportLabel === 'failed' ? '#ff8b8b' : '#8a8a95',
              cursor: 'pointer',
              fontSize: '0.7rem',
              fontWeight: 500,
              padding: '0.25rem 0.5rem',
              borderRadius: 6,
              lineHeight: 1,
              fontFamily: 'inherit',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            {exportLabel === 'copied' ? 'Copied' : exportLabel === 'failed' ? 'Failed' : 'Export'}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setSearchOpen((v) => {
                const next = !v;
                if (next) {
                  requestAnimationFrame(() => searchInputRef.current?.focus());
                } else {
                  setSearchQuery('');
                }
                return next;
              });
            }}
            aria-label={searchOpen ? 'Close search' : 'Find in chat'}
            aria-pressed={searchOpen}
            title={searchOpen ? 'Close search' : 'Find in chat (⌘F / Ctrl+F)'}
            style={{
              background: 'transparent',
              border: 'none',
              color: searchOpen ? '#9aa6ff' : '#8a8a95',
              cursor: 'pointer',
              fontSize: '0.7rem',
              fontWeight: 500,
              padding: '0.25rem 0.5rem',
              borderRadius: 6,
              lineHeight: 1,
              fontFamily: 'inherit',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            Find
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowOnlyStarred((prev) => !prev);
            }}
            aria-label={showOnlyStarred ? 'Show all messages' : 'Show only starred messages'}
            aria-pressed={showOnlyStarred}
            title={
              showOnlyStarred
                ? 'Showing only starred — click to clear'
                : `Show only starred (${starredIds.size})`
            }
            disabled={!showOnlyStarred && starredIds.size === 0}
            style={{
              background: 'transparent',
              border: 'none',
              color: showOnlyStarred ? '#f0c14b' : starredIds.size === 0 ? '#4a4a52' : '#8a8a95',
              cursor: !showOnlyStarred && starredIds.size === 0 ? 'not-allowed' : 'pointer',
              fontSize: '0.7rem',
              fontWeight: 500,
              padding: '0.25rem 0.5rem',
              borderRadius: 6,
              lineHeight: 1,
              fontFamily: 'inherit',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            {showOnlyStarred ? '★ Starred' : `☆ Starred${starredIds.size > 0 ? ` (${starredIds.size})` : ''}`}
          </button>
          {onDelete ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (typeof window === 'undefined') {
                  onDelete(id);
                  return;
                }
                const ok = window.confirm(
                  `Delete chat window "${title}"? This removes its messages and cannot be undone.`,
                );
                if (ok) onDelete(id);
              }}
              aria-label="Delete chat window"
              title="Delete chat window"
              style={{
                background: 'transparent',
                border: 'none',
                color: '#8a8a95',
                cursor: 'pointer',
                fontSize: '0.7rem',
                fontWeight: 500,
                padding: '0.25rem 0.5rem',
                borderRadius: 6,
                lineHeight: 1,
                fontFamily: 'inherit',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              Delete
            </button>
          ) : null}
          {onClose ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClose(id);
              }}
              aria-label="Close window"
              title="Close window"
              style={{
                background: 'transparent',
                border: 'none',
                color: '#8a8a95',
                cursor: 'pointer',
                fontSize: '1.1rem',
                padding: '0.25rem 0.5rem',
                borderRadius: 6,
                lineHeight: 1,
              }}
            >
              ×
            </button>
          ) : null}
        </div>
      </div>

      {searchOpen ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '0.45rem 0.75rem',
            borderBottom: '1px solid #24242c',
            background: '#10101a',
          }}
        >
          <div style={{ position: 'relative', flex: 1, display: 'flex' }}>
            <input
              ref={searchInputRef}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setSearchQuery('');
                  setSearchOpen(false);
                  return;
                }
                if (e.key === 'Enter' && matchCount > 0) {
                  e.preventDefault();
                  setSearchIndex((i) => {
                    const n = matchCount;
                    return e.shiftKey ? (i - 1 + n) % n : (i + 1) % n;
                  });
                }
              }}
              onClick={(e) => e.stopPropagation()}
              placeholder="Find in chat…"
              aria-label="Find in chat"
              style={{
                flex: 1,
                background: '#1b1b23',
                border: '1px solid #2a2a30',
                borderRadius: 6,
                padding: '0.35rem 1.6rem 0.35rem 0.55rem',
                color: '#f5f5f5',
                fontSize: '0.8rem',
                fontFamily: 'inherit',
                outline: 'none',
              }}
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSearchQuery('');
                  searchInputRef.current?.focus();
                }}
                aria-label="Clear search"
                style={{
                  position: 'absolute',
                  top: '50%',
                  right: 4,
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
          {trimmedQuery ? (
            <>
              <span style={{ fontSize: '0.7rem', color: '#8a8a95' }} aria-live="polite">
                {matchCount > 0
                  ? `${safeIndex + 1} of ${matchCount}`
                  : '0 matches'}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (matchCount > 0) setSearchIndex((i) => (i - 1 + matchCount) % matchCount);
                }}
                disabled={matchCount === 0}
                aria-label="Previous match"
                title="Previous match (Shift+Enter)"
                style={searchNavButtonStyle}
              >
                ↑
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (matchCount > 0) setSearchIndex((i) => (i + 1) % matchCount);
                }}
                disabled={matchCount === 0}
                aria-label="Next match"
                title="Next match (Enter)"
                style={searchNavButtonStyle}
              >
                ↓
              </button>
            </>
          ) : null}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setSearchQuery('');
              setSearchOpen(false);
            }}
            aria-label="Close search"
            style={{
              background: 'transparent',
              border: '1px solid #2a2a30',
              color: '#cfcfd6',
              borderRadius: 6,
              padding: '2px 8px',
              fontSize: '0.7rem',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Close
          </button>
        </div>
      ) : null}

      <div
        ref={scrollRef}
        onScroll={updateStickiness}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            textareaRef.current?.focus();
          }
        }}
        role="log"
        aria-live="polite"
        aria-relevant="additions text"
        aria-label={`Conversation with ${title}`}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '0.75rem 0.9rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.6rem',
        }}
      >
        {messages.length === 0 ? (
          <div
            style={{
              margin: 'auto',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              color: '#8a8a95',
            }}
          >
            <div style={{ fontSize: '0.95rem', color: '#e8e8ef' }}>Start the conversation</div>
            <div style={{ fontSize: '0.78rem' }}>
              Type below — Enter to send, Shift+Enter for a newline.
            </div>
          </div>
        ) : lowerQuery && filteredMessages.length === 0 ? (
          <div
            style={{
              margin: 'auto',
              textAlign: 'center',
              color: '#8a8a95',
              fontSize: '0.85rem',
            }}
          >
            No messages match &ldquo;{trimmedQuery}&rdquo;.
          </div>
        ) : showOnlyStarred && displayedMessages.length === 0 ? (
          <div
            style={{
              margin: 'auto',
              textAlign: 'center',
              color: '#8a8a95',
              fontSize: '0.85rem',
            }}
          >
            No starred messages yet — use the ☆ on a message bubble to pin it here.
          </div>
        ) : (
          displayedMessages.map((m) => (
            <MessageBubble
              key={m.id}
              message={m}
              highlight={lowerQuery || undefined}
              isActiveMatch={activeMatchId === m.id}
              isFlashing={flashedMsgId === m.id}
              onRetry={
                onRetry && m.clientTempId ? () => onRetry(id, m.clientTempId!) : undefined
              }
              onRegenerate={
                onRegenerate && m.role === 'assistant' && (m.status ?? 'ok') === 'ok'
                  ? () => onRegenerate(id, m.id)
                  : undefined
              }
              onQuote={onQuoteMessage}
              isStarred={starredIds.has(m.id)}
              onToggleStar={() => toggleStar(m.id)}
            />
          ))
        )}
      </div>

      {scrolledAway && !lowerQuery && messages.length > 0 ? (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            padding: '0.25rem 0',
            background: 'transparent',
            pointerEvents: 'none',
            marginTop: -28,
          }}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              scrollToBottom();
            }}
            aria-label="Scroll to latest message"
            title="Scroll to latest message"
            style={{
              pointerEvents: 'auto',
              background: '#1b1b23',
              border: '1px solid #2a2a30',
              color: '#e8e8ef',
              borderRadius: 999,
              padding: '0.3rem 0.7rem',
              fontSize: '0.72rem',
              cursor: 'pointer',
              fontFamily: 'inherit',
              boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            }}
          >
            ↓ Latest
          </button>
        </div>
      ) : null}

      {historyIdx >= 0 && userPromptHistory.length > 0 ? (
        <div
          aria-live="polite"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '4px 0.85rem',
            background: '#15203b',
            borderTop: '1px solid #2a2a30',
            color: '#9aa6ff',
            fontSize: '0.7rem',
          }}
        >
          <span aria-hidden>↑</span>
          <span>
            Recalling prompt {Math.min(historyIdx + 1, userPromptHistory.length)} of {userPromptHistory.length} · ↓ to step back · Esc to clear
          </span>
        </div>
      ) : null}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        onClick={(e) => e.stopPropagation()}
        style={{
          display: 'flex',
          gap: '0.5rem',
          padding: '0.65rem 0.75rem',
          borderTop: '1px solid #24242c',
          background: '#0f0f13',
        }}
      >
        <textarea
          ref={textareaRef}
          value={draft}
          rows={1}
          onChange={(e) => {
            setDraft(e.target.value);
            if (historyIdxRef.current >= 0) setHistoryIdxBoth(-1);
          }}
          onKeyDown={onComposerKeyDown}
          onFocus={() => onFocus?.(id)}
          placeholder={
            pending
              ? 'Waiting for reply…'
              : userPromptHistory.length > 0 && draft.length === 0
                ? 'Send a message…  (Shift+Enter newline · ↑ history)'
                : 'Send a message…  (Shift+Enter for newline)'
          }
          aria-label={`Message ${title}`}
          disabled={pending}
          style={{
            flex: 1,
            background: '#1b1b23',
            border: '1px solid #2a2a30',
            borderRadius: 8,
            padding: '0.55rem 0.75rem',
            color: pending ? '#8a8a95' : '#f5f5f5',
            fontSize: '0.875rem',
            fontFamily: 'inherit',
            outline: 'none',
            resize: 'none',
            minHeight: 36,
            maxHeight: 160,
            lineHeight: 1.4,
          }}
        />
        {!pending ? (
          <TemplateMenu
            open={templatesOpen}
            onToggle={() => setTemplatesOpen((v) => !v)}
            onClose={() => setTemplatesOpen(false)}
            currentDraft={draft}
            onPick={(prefix) => {
              setTemplatesOpen(false);
              setDraft((prev) => {
                const sep = prev.length === 0 || prev.endsWith(' ') || prev.endsWith('\n') ? '' : ' ';
                return `${prev}${sep}${prefix}`;
              });
              requestAnimationFrame(() => {
                const ta = textareaRef.current;
                if (!ta) return;
                ta.focus();
                ta.selectionStart = ta.selectionEnd = ta.value.length;
              });
            }}
          />
        ) : null}
        {pending && onCancel ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onCancel(id);
            }}
            aria-label="Stop generating"
            style={{
              background: '#2a2a30',
              color: '#f5f5f5',
              border: '1px solid #3a3a45',
              borderRadius: 8,
              padding: '0 0.9rem',
              fontSize: '0.85rem',
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: 'inherit',
              alignSelf: 'stretch',
            }}
          >
            Stop generating
          </button>
        ) : (
          <button
            type="submit"
            disabled={!canSend}
            title="Send (Enter)"
            style={{
              background: canSend ? '#f5f5f5' : '#2a2a30',
              color: canSend ? '#0b0b0d' : '#6a6a75',
              border: 'none',
              borderRadius: 8,
              padding: '0 0.9rem',
              fontSize: '0.85rem',
              fontWeight: 500,
              cursor: canSend ? 'pointer' : 'not-allowed',
              fontFamily: 'inherit',
              alignSelf: 'stretch',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            Send
            <span
              aria-hidden
              style={{
                fontSize: '0.7rem',
                opacity: 0.6,
                fontWeight: 400,
              }}
            >
              ↵
            </span>
          </button>
        )}
      </form>
      {draft.length > 2000 ? (
        <div
          aria-live="polite"
          style={{
            padding: '0 0.75rem 0.5rem',
            background: '#0f0f13',
            fontSize: '0.7rem',
            color: draft.length > 8000 ? '#ff8b8b' : '#8a8a95',
            textAlign: 'right',
          }}
        >
          {draft.length.toLocaleString()} chars
        </div>
      ) : null}
    </div>
  );
}

function ProviderBadge({ provider, model }: { provider: AIProvider; model: string }) {
  const color = providerColor[provider];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.4rem',
        marginTop: 4,
        padding: '2px 8px',
        background: `${color}1a`,
        border: `1px solid ${color}55`,
        borderRadius: 999,
        fontSize: '0.7rem',
        color: '#e8e8ef',
        alignSelf: 'flex-start',
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: color,
          display: 'inline-block',
        }}
      />
      <span style={{ fontWeight: 600 }}>{providerLabel[provider]}</span>
      <span style={{ color: '#8a8a95' }}>· {model}</span>
    </span>
  );
}

function formatMessageTimestamp(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().replace('T', ' ').slice(0, 16);
}

function Spinner() {
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-block',
        width: 10,
        height: 10,
        borderRadius: '50%',
        border: '2px solid rgba(245,245,245,0.18)',
        borderTopColor: '#f5f5f5',
        animation: 'chat-spin 0.7s linear infinite',
        marginLeft: 6,
        verticalAlign: '-1px',
      }}
    />
  );
}

function StreamingCursor() {
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-block',
        width: 7,
        height: '0.95em',
        marginLeft: 2,
        background: '#f5f5f5',
        verticalAlign: '-2px',
        animation: 'chat-blink 1s steps(2, end) infinite',
      }}
    />
  );
}

function MessageBubble({
  message,
  onRetry,
  onRegenerate,
  onQuote,
  highlight,
  isActiveMatch,
  isFlashing,
  isStarred,
  onToggleStar,
}: {
  message: MockMessage;
  onRetry?: () => void;
  onRegenerate?: () => void;
  onQuote?: (content: string) => void;
  highlight?: string;
  isActiveMatch?: boolean;
  isFlashing?: boolean;
  isStarred?: boolean;
  onToggleStar?: () => void;
}) {
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';
  const absoluteStamp = formatMessageTimestamp(message.createdAt);
  const relativeStamp = formatRelativeStamp(message.createdAt);
  const metaParts: string[] = [];
  if (message.provider) metaParts.push(providerLabel[message.provider]);
  if (message.model) metaParts.push(message.model);
  if (typeof message.promptTokens === 'number' || typeof message.completionTokens === 'number') {
    const p = typeof message.promptTokens === 'number' ? message.promptTokens : '?';
    const c = typeof message.completionTokens === 'number' ? message.completionTokens : '?';
    metaParts.push(`${p}+${c} tok`);
  }
  if (typeof message.latencyMs === 'number') {
    metaParts.push(formatLatency(message.latencyMs));
  }
  const showMeta = isAssistant && metaParts.length > 0;
  const status = message.status ?? 'ok';
  const isPending = status === 'pending';
  const isStreaming = status === 'streaming';
  const isFailed = status === 'failed';
  const isCanceled = isFailed && message.errorCode === 'canceled';
  const borderColor = isFailed ? (isCanceled ? '#3a3a45' : '#6b2a2a') : '#24242c';
  const opacity = isPending ? 0.7 : 1;
  const canCopy = !isStreaming && !isPending && message.content.length > 0;

  return (
    <div
      id={`msg-${message.id}`}
      data-role={message.role}
      data-status={status}
      style={{
        alignSelf: isUser ? 'flex-end' : 'flex-start',
        maxWidth: '85%',
        background: isUser ? '#2b2b36' : '#1b1b23',
        border: `1px solid ${isActiveMatch || isFlashing ? '#4f6bff' : borderColor}`,
        boxShadow:
          isFlashing
            ? '0 0 0 3px rgba(79,107,255,0.45)'
            : isActiveMatch
              ? '0 0 0 1px rgba(79,107,255,0.45)'
              : 'none',
        borderRadius: 10,
        padding: '0.55rem 0.75rem',
        fontSize: '0.85rem',
        lineHeight: 1.4,
        color: '#e8e8ef',
        whiteSpace: 'pre-wrap',
        opacity,
        scrollMarginTop: 16,
        transition: 'border-color 120ms ease, box-shadow 120ms ease',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          fontSize: '0.65rem',
          color: '#8a8a95',
          marginBottom: 4,
          textTransform: 'uppercase',
          letterSpacing: '0.03em',
        }}
      >
        <span>{message.role}</span>
        {isPending && <Spinner />}
        {isFailed && (
          <span
            style={{
              color: isCanceled ? '#a0a0aa' : '#ff8b8b',
              marginLeft: 6,
              textTransform: 'none',
              letterSpacing: 0,
            }}
          >
            {isCanceled ? 'canceled' : 'failed'}
          </span>
        )}
      </div>
      {highlight ? renderWithHighlight(message.content, highlight) : message.content}
      {isStreaming && <StreamingCursor />}
      {isFailed && (
        <div
          style={{
            marginTop: 6,
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 8,
            fontSize: '0.7rem',
          }}
        >
          {message.errorMessage && (
            <span style={{ color: isCanceled ? '#a0a0aa' : '#ffd3d3' }}>
              {message.errorCode ?? 'error'} — {message.errorMessage}
            </span>
          )}
          {onRetry && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRetry();
              }}
              style={{
                background: 'transparent',
                color: isCanceled ? '#e8e8ef' : '#ffd3d3',
                border: `1px solid ${isCanceled ? '#3a3a45' : '#6b2a2a'}`,
                borderRadius: 6,
                padding: '2px 8px',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: '0.7rem',
              }}
            >
              Retry
            </button>
          )}
        </div>
      )}
      {showMeta && (
        <div
          data-testid="message-meta"
          style={{
            marginTop: 6,
            fontSize: '0.65rem',
            color: '#6a6a75',
            letterSpacing: '0.02em',
          }}
        >
          {metaParts.join(' · ')}
        </div>
      )}
      <MessageActions
        messageId={message.id}
        content={message.content}
        absoluteStamp={absoluteStamp}
        relativeStamp={relativeStamp}
        canCopy={canCopy}
        onRegenerate={isAssistant && !isStreaming && !isPending ? onRegenerate : undefined}
        onQuote={canCopy && onQuote ? () => onQuote(message.content) : undefined}
        align={isUser ? 'end' : 'start'}
        isStarred={isStarred}
        onToggleStar={onToggleStar}
      />
    </div>
  );
}

function MessageActions({
  messageId,
  content,
  absoluteStamp,
  relativeStamp,
  canCopy,
  onRegenerate,
  onQuote,
  align,
  isStarred,
  onToggleStar,
}: {
  messageId: string;
  content: string;
  absoluteStamp: string | null;
  relativeStamp: string | null;
  canCopy: boolean;
  onRegenerate?: () => void;
  onQuote?: () => void;
  align: 'start' | 'end';
  isStarred?: boolean;
  onToggleStar?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [mdCopied, setMdCopied] = useState(false);
  const writeToClipboard = async (value: string): Promise<void> => {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }
    if (typeof document !== 'undefined') {
      const ta = document.createElement('textarea');
      ta.value = value;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
  };
  const onCopy = async (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (!canCopy) return;
    try {
      await writeToClipboard(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore — feedback simply won't show
    }
  };
  const onCopyLink = async (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (typeof window === 'undefined') return;
    try {
      const base = `${window.location.origin}${window.location.pathname}${window.location.search}`;
      const link = `${base}#msg-${messageId}`;
      await writeToClipboard(link);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 1500);
    } catch {
      // ignore
    }
  };
  return (
    <div
      style={{
        marginTop: 6,
        display: 'flex',
        justifyContent: align === 'end' ? 'flex-end' : 'flex-start',
        flexWrap: 'wrap',
        rowGap: 4,
        gap: 8,
        fontSize: '0.65rem',
        color: '#6a6a75',
        alignItems: 'center',
      }}
    >
      {relativeStamp ? (
        <span title={absoluteStamp ?? undefined}>{relativeStamp}</span>
      ) : null}
      {canCopy ? (
        <button
          type="button"
          onClick={onCopy}
          aria-label="Copy message"
          title="Copy message"
          style={messageActionButton}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      ) : null}
      <button
        type="button"
        onClick={onCopyLink}
        aria-label="Copy link to this message"
        title="Copy link to this message"
        style={messageActionButton}
      >
        {linkCopied ? 'Link copied' : 'Copy link'}
      </button>
      {onQuote ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onQuote();
          }}
          aria-label="Quote this message in composer"
          title="Quote in composer"
          style={messageActionButton}
        >
          Quote
        </button>
      ) : null}
      {canCopy ? (
        <button
          type="button"
          onClick={async (e) => {
            e.stopPropagation();
            const md = formatAsMarkdown(content, absoluteStamp);
            try {
              await writeToClipboard(md);
              setMdCopied(true);
              setTimeout(() => setMdCopied(false), 1500);
            } catch {
              // ignore
            }
          }}
          aria-label="Copy as Markdown"
          title="Copy as Markdown (with role + timestamp)"
          style={messageActionButton}
        >
          {mdCopied ? 'MD copied' : 'Copy MD'}
        </button>
      ) : null}
      {onToggleStar ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleStar();
          }}
          aria-label={isStarred ? 'Unstar this message' : 'Star this message'}
          title={isStarred ? 'Unstar' : 'Star'}
          aria-pressed={isStarred ? true : false}
          style={{
            ...messageActionButton,
            color: isStarred ? '#f0c14b' : '#9a9aa3',
            borderColor: isStarred ? '#5a4a1f' : messageActionButton.border?.toString().includes('1px') ? '#2a2a30' : '#2a2a30',
          }}
        >
          {isStarred ? '★' : '☆'}
        </button>
      ) : null}
      {onRegenerate ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRegenerate();
          }}
          aria-label="Regenerate response"
          title="Regenerate (re-sends last user message)"
          style={messageActionButton}
        >
          Regenerate
        </button>
      ) : null}
    </div>
  );
}

const searchNavButtonStyle: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid #2a2a30',
  color: '#cfcfd6',
  borderRadius: 6,
  padding: '2px 6px',
  fontSize: '0.7rem',
  cursor: 'pointer',
  fontFamily: 'inherit',
  minWidth: 26,
};

const messageActionButton: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid #2a2a30',
  color: '#a0a0aa',
  borderRadius: 4,
  padding: '1px 6px',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: '0.65rem',
  letterSpacing: '0.02em',
};

function formatRelativeStamp(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const diff = Date.now() - t;
  if (diff < 0) return 'just now';
  const sec = Math.floor(diff / 1000);
  if (sec < 5) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  const wk = Math.floor(day / 7);
  if (wk < 5) return `${wk}w ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  const yr = Math.floor(day / 365);
  return `${yr}y ago`;
}

function formatLatency(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(s >= 10 ? 0 : 1)}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${Math.round(s - m * 60)}s`;
}

function readDraft(key: string): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

function writeDraft(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try {
    if (value) window.localStorage.setItem(key, value);
    else window.localStorage.removeItem(key);
  } catch {
    // localStorage unavailable / quota exceeded; ignore
  }
}

function readStarred(key: string): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((v): v is string => typeof v === 'string'));
  } catch {
    return new Set();
  }
}

function writeStarred(key: string, value: Set<string>): void {
  if (typeof window === 'undefined') return;
  try {
    if (value.size === 0) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(Array.from(value)));
  } catch {
    // localStorage unavailable / quota exceeded; ignore
  }
}

function readBoolFlag(key: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeBoolFlag(key: string, value: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    if (value) window.localStorage.setItem(key, '1');
    else window.localStorage.removeItem(key);
  } catch {
    // localStorage unavailable / quota exceeded; ignore
  }
}

function formatAsMarkdown(content: string, absoluteStamp: string | null): string {
  // Useful for paste-into-doc / paste-into-issue: a small header block
  // gives the receiver context (when, who) without needing the full UI.
  const header = absoluteStamp ? `> ${absoluteStamp}` : '';
  return [header, '', content].filter((line, i) => !(i === 0 && line === '')).join('\n');
}

function renderWithHighlight(content: string, query: string): ReactNode {
  if (!query) return content;
  const out: ReactNode[] = [];
  const lowerContent = content.toLowerCase();
  const lowerQuery = query.toLowerCase();
  let cursor = 0;
  let key = 0;
  while (cursor < content.length) {
    const idx = lowerContent.indexOf(lowerQuery, cursor);
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
        {content.slice(idx, idx + query.length)}
      </mark>,
    );
    cursor = idx + query.length;
  }
  return out;
}

function cssEscapeId(id: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(id);
  }
  return id.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`);
}

function readSearchQuery(key: string): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.sessionStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

function writeSearchQuery(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try {
    if (value) window.sessionStorage.setItem(key, value);
    else window.sessionStorage.removeItem(key);
  } catch {
    // sessionStorage unavailable / quota; ignore
  }
}

function readScrollTop(key: string): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : null;
  } catch {
    return null;
  }
}

function writeScrollTop(key: string, value: number): void {
  if (typeof window === 'undefined') return;
  try {
    if (value > 0) window.sessionStorage.setItem(key, String(Math.round(value)));
    else window.sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
}


interface TemplateMenuProps {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onPick: (prefix: string) => void;
  currentDraft: string;
}

type TemplateKey = string;

const RECENT_TEMPLATES_KEY = 'wav.templates.recent';
const RECENT_TEMPLATES_MAX = 3;

function readRecentTemplates(): TemplateKey[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(RECENT_TEMPLATES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === 'string').slice(0, RECENT_TEMPLATES_MAX);
  } catch {
    return [];
  }
}

function writeRecentTemplates(items: TemplateKey[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(RECENT_TEMPLATES_KEY, JSON.stringify(items.slice(0, RECENT_TEMPLATES_MAX)));
    window.dispatchEvent(new Event('wav:templates-changed'));
  } catch {
    // ignore quota
  }
}

function pushRecentTemplate(key: TemplateKey): void {
  const current = readRecentTemplates();
  const next = [key, ...current.filter((k) => k !== key)].slice(0, RECENT_TEMPLATES_MAX);
  writeRecentTemplates(next);
}

const TEMPLATES: Array<{ label: string; prefix: string }> = [
  { label: 'Summarize', prefix: 'Summarize the following:\n' },
  { label: 'Critique', prefix: 'Critique this and point out the weakest assumptions:\n' },
  { label: 'Translate', prefix: 'Translate to French:\n' },
  { label: 'Explain like 5', prefix: 'Explain like I am five:\n' },
  { label: 'Code review', prefix: 'Code review — list bugs, smells, missing edge cases:\n' },
  { label: 'Continue', prefix: 'Continue from where you left off.' },
];

interface UserTemplate {
  id: string;
  label: string;
  prefix: string;
}

const USER_TEMPLATES_KEY = 'wav.templates';

function readUserTemplates(): UserTemplate[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(USER_TEMPLATES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (t): t is UserTemplate =>
          t && typeof t.id === 'string' && typeof t.label === 'string' && typeof t.prefix === 'string',
      )
      .slice(0, 50);
  } catch {
    return [];
  }
}

function writeUserTemplates(items: UserTemplate[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(USER_TEMPLATES_KEY, JSON.stringify(items));
    window.dispatchEvent(new Event('wav:templates-changed'));
  } catch {
    // ignore quota
  }
}

function TemplateMenu({ open, onToggle, onClose, onPick, currentDraft }: TemplateMenuProps) {
  const [userTemplates, setUserTemplates] = useState<UserTemplate[]>(() => readUserTemplates());
  const [recents, setRecents] = useState<TemplateKey[]>(() => readRecentTemplates());
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState('');
  const [newPrefix, setNewPrefix] = useState('');
  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onChange = () => {
      setUserTemplates(readUserTemplates());
      setRecents(readRecentTemplates());
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('wav:templates-changed', onChange);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('wav:templates-changed', onChange);
    };
  }, [open, onClose]);
  const handlePick = (key: TemplateKey, prefix: string) => {
    pushRecentTemplate(key);
    onPick(prefix);
  };
  const onSaveNew = () => {
    const label = newLabel.trim();
    const prefix = newPrefix.trim();
    if (!label || !prefix) return;
    if (editingId) {
      const updated = userTemplates.map((t) => (t.id === editingId ? { ...t, label, prefix } : t));
      setUserTemplates(updated);
      writeUserTemplates(updated);
    } else {
      const next: UserTemplate = {
        id: `t-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
        label,
        prefix,
      };
      const updated = [next, ...userTemplates].slice(0, 50);
      setUserTemplates(updated);
      writeUserTemplates(updated);
    }
    setNewLabel('');
    setNewPrefix('');
    setAdding(false);
    setEditingId(null);
  };
  const onDelete = (id: string) => {
    const updated = userTemplates.filter((t) => t.id !== id);
    setUserTemplates(updated);
    writeUserTemplates(updated);
    if (editingId === id) {
      setEditingId(null);
      setAdding(false);
      setNewLabel('');
      setNewPrefix('');
    }
  };
  const onEdit = (t: UserTemplate) => {
    setEditingId(t.id);
    setAdding(true);
    setNewLabel(t.label);
    setNewPrefix(t.prefix);
  };
  const onSaveDraft = () => {
    setEditingId(null);
    setAdding(true);
    setNewLabel('');
    setNewPrefix(currentDraft);
  };
  const cancelForm = () => {
    setAdding(false);
    setEditingId(null);
    setNewLabel('');
    setNewPrefix('');
  };
  const builtinByLabel = new Map(TEMPLATES.map((t) => [t.label, t]));
  const userById = new Map(userTemplates.map((t) => [t.id, t]));
  const recentEntries = recents
    .map((key) => {
      if (key.startsWith('user:')) {
        const t = userById.get(key.slice(5));
        return t ? { key, label: t.label, prefix: t.prefix } : null;
      }
      if (key.startsWith('builtin:')) {
        const t = builtinByLabel.get(key.slice(8));
        return t ? { key, label: t.label, prefix: t.prefix } : null;
      }
      return null;
    })
    .filter((x): x is { key: string; label: string; prefix: string } => x !== null);
  const draftHasContent = currentDraft.trim().length > 0;
  return (
    <div style={{ position: 'relative', alignSelf: 'stretch' }} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={onToggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Insert template"
        title="Insert prompt template"
        style={{
          background: 'transparent',
          color: '#cfcfd6',
          border: '1px solid #2a2a30',
          borderRadius: 8,
          padding: '0 0.7rem',
          fontSize: '0.8rem',
          cursor: 'pointer',
          fontFamily: 'inherit',
          height: '100%',
        }}
      >
        T
      </button>
      {open ? (
        <>
          <button
            aria-label="Close templates"
            onClick={onClose}
            style={{ position: 'fixed', inset: 0, background: 'transparent', border: 'none', cursor: 'default', zIndex: 20 }}
          />
          <div
            role="menu"
            style={{
              position: 'absolute',
              bottom: 'calc(100% + 6px)',
              right: 0,
              minWidth: 260,
              maxWidth: 320,
              background: '#161620',
              border: '1px solid #2a2a30',
              borderRadius: 8,
              padding: 4,
              zIndex: 30,
              boxShadow: '0 10px 28px rgba(0,0,0,0.45)',
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
            }}
          >
            {recentEntries.length > 0 ? (
              <>
                <div style={tplSectionStyle}>Recent</div>
                {recentEntries.map((r) => (
                  <button
                    key={`recent-${r.key}`}
                    role="menuitem"
                    type="button"
                    onClick={() => handlePick(r.key, r.prefix)}
                    title={r.prefix}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      textAlign: 'left',
                      padding: '0.4rem 0.55rem',
                      borderRadius: 4,
                      color: '#e8e8ef',
                      fontSize: '0.82rem',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {r.label}
                  </button>
                ))}
              </>
            ) : null}
            {userTemplates.length > 0 ? (
              <>
                <div style={tplSectionStyle}>Yours</div>
                {userTemplates.map((t) => (
                  <div
                    key={t.id}
                    style={{ display: 'flex', alignItems: 'center', gap: 2 }}
                  >
                    <button
                      role="menuitem"
                      type="button"
                      onClick={() => handlePick(`user:${t.id}`, t.prefix)}
                      title={t.prefix}
                      style={{
                        flex: 1,
                        background: 'transparent',
                        border: 'none',
                        textAlign: 'left',
                        padding: '0.4rem 0.55rem',
                        borderRadius: 4,
                        color: '#e8e8ef',
                        fontSize: '0.82rem',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {t.label}
                    </button>
                    <button
                      type="button"
                      onClick={() => onEdit(t)}
                      aria-label={`Edit template ${t.label}`}
                      title={`Edit template ${t.label}`}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#8a8a95',
                        cursor: 'pointer',
                        fontSize: '0.75rem',
                        padding: '0 6px',
                        borderRadius: 4,
                        fontFamily: 'inherit',
                      }}
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(t.id)}
                      aria-label={`Delete template ${t.label}`}
                      title={`Delete template ${t.label}`}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#8a8a95',
                        cursor: 'pointer',
                        fontSize: '0.85rem',
                        padding: '0 6px',
                        borderRadius: 4,
                        fontFamily: 'inherit',
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </>
            ) : null}
            <div style={tplSectionStyle}>Built-in</div>
            {TEMPLATES.map((t) => (
              <button
                key={t.label}
                role="menuitem"
                type="button"
                onClick={() => handlePick(`builtin:${t.label}`, t.prefix)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  textAlign: 'left',
                  padding: '0.4rem 0.55rem',
                  borderRadius: 4,
                  color: '#e8e8ef',
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {t.label}
              </button>
            ))}
            <div style={{ height: 1, background: '#1d1d22', margin: '4px 0' }} />
            {adding ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '0.3rem 0.5rem 0.5rem' }}>
                <div style={{ fontSize: '0.65rem', color: '#8a8a95', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {editingId ? 'Edit template' : 'New template'}
                </div>
                <input
                  autoFocus
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="Label"
                  aria-label={editingId ? 'Edit template label' : 'New template label'}
                  style={tplInputStyle}
                />
                <textarea
                  value={newPrefix}
                  onChange={(e) => setNewPrefix(e.target.value)}
                  placeholder="Prefix to insert at the end of the draft"
                  aria-label={editingId ? 'Edit template prefix' : 'New template prefix'}
                  rows={3}
                  style={{ ...tplInputStyle, resize: 'vertical', minHeight: 60, lineHeight: 1.4 }}
                />
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  <button type="button" onClick={cancelForm} style={tplGhostBtnStyle}>
                    Cancel
                  </button>
                  <button type="button" onClick={onSaveNew} disabled={!newLabel.trim() || !newPrefix.trim()} style={tplPrimaryBtnStyle}>
                    {editingId ? 'Update' : 'Save'}
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <button
                  type="button"
                  onClick={() => { setEditingId(null); setAdding(true); }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    textAlign: 'left',
                    padding: '0.4rem 0.55rem',
                    borderRadius: 4,
                    color: '#9aa6ff',
                    fontSize: '0.78rem',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  + New template
                </button>
                {draftHasContent ? (
                  <button
                    type="button"
                    onClick={onSaveDraft}
                    aria-label="Save current draft as a new template"
                    title="Pre-fill the form with your current draft"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      textAlign: 'left',
                      padding: '0.4rem 0.55rem',
                      borderRadius: 4,
                      color: '#9aa6ff',
                      fontSize: '0.78rem',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    + Save current draft as template
                  </button>
                ) : null}
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}

const tplSectionStyle: React.CSSProperties = {
  fontSize: '0.62rem',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: '#6a6a75',
  padding: '0.4rem 0.55rem 0.2rem',
};

const tplInputStyle: React.CSSProperties = {
  width: '100%',
  background: '#0f0f13',
  border: '1px solid #2a2a30',
  borderRadius: 4,
  padding: '0.35rem 0.5rem',
  color: '#f5f5f5',
  fontSize: '0.78rem',
  fontFamily: 'inherit',
  outline: 'none',
};

const tplGhostBtnStyle: React.CSSProperties = {
  background: 'transparent',
  color: '#cfcfd6',
  border: '1px solid #2a2a30',
  borderRadius: 4,
  padding: '2px 8px',
  fontSize: '0.72rem',
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const tplPrimaryBtnStyle: React.CSSProperties = {
  background: '#f5f5f5',
  color: '#0b0b0d',
  border: 'none',
  borderRadius: 4,
  padding: '2px 10px',
  fontSize: '0.72rem',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontWeight: 600,
};
