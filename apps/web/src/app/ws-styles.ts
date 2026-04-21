import type { AIProvider } from '@webapp/types';

export const PROVIDER_COLORS: Record<AIProvider, string> = {
  openai:      '#4ade80',
  anthropic:   '#fb923c',
  perplexity:  '#60a5fa',
};

export const s = {
  root:        { display: 'flex', flexDirection: 'column' as const, height: '100vh', overflow: 'hidden', fontFamily: 'system-ui, sans-serif', color: '#d4d4d8' },
  topbar:      { display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0 1.25rem', height: '52px', background: '#0a0a0d', borderBottom: '1px solid #1a1a22', flexShrink: 0 },
  appName:     { fontWeight: 700, fontSize: '0.92rem', color: '#f4f4f5', letterSpacing: '-0.01em', marginRight: 'auto' },
  topError:    { fontSize: '0.78rem', color: '#f87171' },
  devBar:      { display: 'flex', alignItems: 'center', gap: '0.4rem', paddingLeft: '0.75rem', borderLeft: '1px solid #1a1a22' },
  devLabel:    { fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase' as const, color: '#3a3a48' },
  devBtn:      { fontSize: '0.7rem', padding: '0.2rem 0.55rem', background: 'transparent', border: '1px solid #252530', borderRadius: '4px', color: '#4a4a58', cursor: 'pointer' },
  loadingWrap: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  muted:       { fontSize: '0.8rem', color: '#52525b', margin: '0.25rem 0' },
  columns:     { display: 'flex', flex: 1, overflow: 'hidden' },

  sidebar: { width: '220px', minWidth: '175px', flexShrink: 1, overflowY: 'auto' as const, borderRight: '1px solid #1a1a22', background: '#0a0a0d' },
  middle:  { width: '230px', minWidth: '185px', flexShrink: 1, overflowY: 'auto' as const, borderRight: '1px solid #1a1a22', background: '#0a0a0d' },
  main:    { flex: 1, minWidth: '320px', display: 'flex', flexDirection: 'column' as const, overflow: 'hidden', background: '#09090c' },

  colSection: { padding: '0.85rem 0.75rem', borderBottom: '1px solid #141418' },
  colLabel:   { fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: '#55555f', margin: '0 0 0.6rem' },
  dimLabel:   { fontSize: '0.75rem', color: '#52525b', margin: '0 0 0.5rem' },

  navItem:       { padding: '0.42rem 0.5rem', borderRadius: '5px', cursor: 'pointer', fontSize: '0.85rem', color: '#6b6b7c', lineHeight: 1.4, borderLeft: '2px solid transparent' },
  navItemActive: { background: '#1c1c2e', color: '#a5b4fc', borderLeft: '2px solid #4f46e5' },

  inlineForm: { display: 'flex', gap: '0.3rem', marginTop: '0.6rem' },
  input:      { flex: 1, minWidth: 0, background: '#0f0f14', border: '1px solid #1e1e26', borderRadius: '5px', padding: '0.38rem 0.55rem', color: '#e4e4e7', fontSize: '0.82rem', outline: 'none' },
  iconBtn:    { flexShrink: 0, width: '27px', height: '27px', background: '#1c1c2e', border: '1px solid #2a2a40', borderRadius: '5px', color: '#a5b4fc', cursor: 'pointer', fontSize: '1rem', lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  btn:        { padding: '0.42rem 0.75rem', background: '#1c1c2e', border: '1px solid #2a2a40', borderRadius: '5px', color: '#a5b4fc', fontSize: '0.82rem', cursor: 'pointer', whiteSpace: 'nowrap' as const },

  cwTitle: { display: 'block', fontSize: '0.85rem', lineHeight: 1.3 },
  cwModel: { display: 'block', fontSize: '0.67rem', color: '#4a4a58', marginTop: '0.15rem' },

  threadEmpty:  { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  threadHeader: { padding: '0.9rem 1.5rem', borderBottom: '1px solid #1a1a22', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '0.75rem' },
  threadTitle:  { fontSize: '1rem', fontWeight: 600, color: '#e4e4e7' },
  threadMeta:   { fontSize: '0.78rem', color: '#6b6b7c' },
  thread:       { flex: 1, overflowY: 'auto' as const, padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column' as const, gap: '0.75rem' },

  msg:        { display: 'flex', gap: '0.85rem', padding: '0.65rem 0.9rem', borderRadius: '8px', alignItems: 'flex-start', borderLeft: '3px solid transparent' },
  msgUser:    { background: '#0e1628', borderLeftColor: '#3730a3' },
  msgOther:   { background: '#101016', borderLeftColor: '#1e1e28' },
  msgMeta:    { display: 'flex', flexDirection: 'column' as const, gap: '0.08rem', minWidth: '54px', flexShrink: 0, paddingTop: '0.1rem' },
  msgRole:    { fontSize: '0.71rem', fontWeight: 600, color: '#52525b', textTransform: 'capitalize' as const },
  msgTime:    { fontSize: '0.64rem', color: '#4a4a58' },
  msgContent: { fontSize: '0.875rem', color: '#d4d4d8', lineHeight: 1.6, wordBreak: 'break-word' as const },

  composer:      { padding: '0.9rem 1.5rem', borderTop: '1px solid #1a1a22', display: 'flex', gap: '0.6rem', flexShrink: 0, alignItems: 'flex-end' },
  composerInput: { flex: 1, minWidth: 0, background: '#0f0f14', border: '1px solid #1e1e26', borderRadius: '6px', padding: '0.6rem 0.85rem', color: '#e4e4e7', fontSize: '0.9rem', outline: 'none', resize: 'none' as const, lineHeight: 1.55, minHeight: '42px', maxHeight: '160px', overflowY: 'auto' as const, fontFamily: 'system-ui, sans-serif' },

  errText: { fontSize: '0.72rem', color: '#f87171', margin: '0.25rem 0 0', lineHeight: 1.4 },
} as const;
