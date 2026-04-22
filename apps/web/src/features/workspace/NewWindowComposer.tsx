'use client';

import { useState } from 'react';
import type { AIProvider } from '@webapp/types';
import { WINDOW_PRESETS, type WindowPreset } from '@/lib/data';
import { Button } from '@/components/Button';

interface NewWindowComposerProps {
  onCreate: (preset: WindowPreset, title?: string) => void;
}

const providerColor: Record<AIProvider, string> = {
  openai: '#10a37f',
  anthropic: '#d97757',
  perplexity: '#6b8afd',
};

export function NewWindowComposer({ onCreate }: NewWindowComposerProps) {
  const [open, setOpen] = useState(false);
  const [presetId, setPresetId] = useState<string>(WINDOW_PRESETS[0]!.id);
  const [title, setTitle] = useState('');

  const preset = WINDOW_PRESETS.find((p) => p.id === presetId) ?? WINDOW_PRESETS[0]!;

  const submit = () => {
    onCreate(preset, title);
    setTitle('');
    setOpen(false);
  };

  return (
    <div style={{ position: 'relative', flex: 1 }}>
      <Button
        variant="ghost"
        onClick={() => setOpen((v) => !v)}
        style={{ width: '100%', fontSize: '0.78rem' }}
      >
        + New window
      </Button>
      {open ? (
        <>
          <button
            aria-label="Close composer"
            onClick={() => setOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'transparent',
              border: 'none',
              cursor: 'default',
              zIndex: 20,
            }}
          />
          <div
            role="dialog"
            aria-label="Create new window"
            style={{
              position: 'absolute',
              bottom: 'calc(100% + 8px)',
              left: 0,
              right: 0,
              background: '#161620',
              border: '1px solid #2a2a30',
              borderRadius: 10,
              padding: 10,
              zIndex: 30,
              boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ fontSize: '0.72rem', color: '#8a8a95' }}>Preset</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {WINDOW_PRESETS.map((p) => {
                const active = p.id === presetId;
                return (
                  <button
                    key={p.id}
                    onClick={() => {
                      setPresetId(p.id);
                      if (!title.trim()) setTitle('');
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '0.4rem 0.5rem',
                      borderRadius: 6,
                      background: active ? '#1c1c28' : 'transparent',
                      border: `1px solid ${active ? '#3a3f6b' : 'transparent'}`,
                      color: '#e8e8ef',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      fontSize: '0.78rem',
                      textAlign: 'left',
                    }}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: providerColor[p.provider],
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {p.defaultTitle}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: '#8a8a95' }}>
                        {p.provider} · {p.model}
                      </div>
                    </span>
                  </button>
                );
              })}
            </div>

            <div style={{ fontSize: '0.72rem', color: '#8a8a95', marginTop: 4 }}>
              Title (optional)
            </div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit();
                if (e.key === 'Escape') setOpen(false);
              }}
              placeholder={preset.defaultTitle}
              style={{
                background: '#0f0f13',
                border: '1px solid #2a2a30',
                borderRadius: 6,
                padding: '0.4rem 0.55rem',
                color: '#f5f5f5',
                fontSize: '0.8rem',
                fontFamily: 'inherit',
                outline: 'none',
              }}
            />
            <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
              <Button variant="ghost" onClick={() => setOpen(false)} style={{ flex: 1, fontSize: '0.78rem' }}>
                Cancel
              </Button>
              <Button onClick={submit} style={{ flex: 1, fontSize: '0.78rem' }}>
                Create
              </Button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
