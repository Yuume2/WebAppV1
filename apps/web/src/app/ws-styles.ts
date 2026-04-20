import type { AIProvider } from '@webapp/types';

export const PROVIDER_COLORS: Record<AIProvider, string> = {
  openai:      '#4ade80',
  anthropic:   '#fb923c',
  perplexity:  '#60a5fa',
};

export const s = {
  root:        { display: 'flex', flexDirection: 'column' as const, height: '100vh', overflow: 'hidden', fontFamily: 'system-ui, sans-serif', color: '#d4d4d8' },
  topbar:      { display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0 1rem', height: '48px', background: '#0d0d10', borderBottom: '1px solid #1a1a20', flexShrink: 0 },
  appName:     { fontWeight: 600, fontSize: '0.95rem', color: '#f5f5f5', marginRight: 'auto' },
  topError:    { fontSize: '0.8rem', color: '#f87171' },
  seedBtn:     { fontSize: '0.72rem', padding: '0.25rem 0.6rem', background: 'transparent', border: '1px solid #2a2a30', borderRadius: '4px', color: '#555', cursor: 'pointer' },
  loadingWrap: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  muted:       { fontSize: '0.8rem', color: '#444', margin: '0.25rem 0' },
  columns:     { display: 'flex', flex: 1, overflow: 'hidden' },

  sidebar: { width: '210px', flexShrink: 0, overflowY: 'auto' as const, borderRight: '1px solid #1a1a20', background: '#0d0d10' },
  middle:  { width: '220px', flexShrink: 0, overflowY: 'auto' as const, borderRight: '1px solid #1a1a20', background: '#0d0d10' },
  main:    { flex: 1, display: 'flex', flexDirection: 'column' as const, overflow: 'hidden', background: '#0b0b0d' },

  colSection: { padding: '0.75rem 0.6rem', borderBottom: '1px solid #141418' },
  colLabel:   { fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase' as const, color: '#3f3f46', margin: '0 0 0.5rem' },
  dimLabel:   { fontSize: '0.75rem', color: '#555', margin: '0 0 0.4rem' },

  navItem:       { padding: '0.4rem 0.5rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem', color: '#71717a', lineHeight: 1.4 },
  navItemActive: { background: '#1e1e2e', color: '#a5b4fc' },

  inlineForm: { display: 'flex', gap: '0.3rem', marginTop: '0.5rem' },
  input:      { flex: 1, minWidth: 0, background: '#111116', border: '1px solid #22222a', borderRadius: '4px', padding: '0.35rem 0.5rem', color: '#e4e4e7', fontSize: '0.82rem', outline: 'none' },
  iconBtn:    { flexShrink: 0, width: '26px', height: '26px', background: '#1e1e2e', border: '1px solid #2d2d40', borderRadius: '4px', color: '#a5b4fc', cursor: 'pointer', fontSize: '1rem', lineHeight: 1 },
  btn:        { padding: '0.4rem 0.7rem', background: '#1e1e2e', border: '1px solid #2d2d40', borderRadius: '4px', color: '#a5b4fc', fontSize: '0.82rem', cursor: 'pointer', whiteSpace: 'nowrap' as const },

  cwTitle: { display: 'block', fontSize: '0.85rem', lineHeight: 1.3 },
  cwModel: { display: 'block', fontSize: '0.68rem', color: '#52525b', marginTop: '0.1rem' },

  threadEmpty:  { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  threadHeader: { padding: '0.75rem 1.25rem', borderBottom: '1px solid #1a1a20', flexShrink: 0, display: 'flex', alignItems: 'baseline', gap: '0.75rem' },
  threadTitle:  { fontSize: '0.95rem', fontWeight: 600, color: '#e4e4e7' },
  threadMeta:   { fontSize: '0.78rem', color: '#71717a' },
  thread:       { flex: 1, overflowY: 'auto' as const, padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column' as const, gap: '0.5rem' },

  msg:        { display: 'flex', gap: '0.75rem', padding: '0.55rem 0.75rem', borderRadius: '6px', alignItems: 'flex-start', borderLeft: '3px solid transparent' },
  msgUser:    { background: '#0f1729', borderLeftColor: '#3730a3' },
  msgOther:   { background: '#111116', borderLeftColor: '#1a1a20' },
  msgMeta:    { display: 'flex', flexDirection: 'column' as const, gap: '0.05rem', minWidth: '52px', flexShrink: 0, paddingTop: '0.1rem' },
  msgRole:    { fontSize: '0.72rem', fontWeight: 600, color: '#52525b' },
  msgTime:    { fontSize: '0.65rem', color: '#3f3f46' },
  msgContent: { fontSize: '0.875rem', color: '#d4d4d8', lineHeight: 1.55, wordBreak: 'break-word' as const },

  composer:      { padding: '0.75rem 1.25rem', borderTop: '1px solid #1a1a20', display: 'flex', gap: '0.5rem', flexShrink: 0, alignItems: 'flex-end' },
  composerInput: { flex: 1, minWidth: 0, background: '#111116', border: '1px solid #22222a', borderRadius: '4px', padding: '0.55rem 0.75rem', color: '#e4e4e7', fontSize: '0.9rem', outline: 'none', resize: 'none' as const, lineHeight: 1.5, minHeight: '40px', maxHeight: '160px', overflowY: 'auto' as const, fontFamily: 'system-ui, sans-serif' },
} as const;
