import type { ChatWindow, AIProvider } from '@webapp/types';
import { s, PROVIDER_COLORS } from '@/app/ws-styles';

const PROVIDERS: AIProvider[] = ['openai', 'anthropic', 'perplexity'];

function ProviderBadge({ provider }: { provider: AIProvider }) {
  const color = PROVIDER_COLORS[provider];
  return (
    <span style={{
      display: 'inline-block', fontSize: '0.65rem', fontWeight: 600,
      color, background: `${color}18`, borderRadius: '3px',
      padding: '0.05rem 0.3rem', marginTop: '0.15rem',
    }}>
      {provider}
    </span>
  );
}

interface Props {
  chatWindows: ChatWindow[];
  workspaceId: string | null;
  chatWindowId: string | null;
  onSelectChatWindow: (id: string) => void;
  newCwTitle: string;
  onNewCwTitle: (v: string) => void;
  newCwProvider: AIProvider;
  onProviderChange: (p: AIProvider) => void;
  newCwModel: string;
  onNewCwModel: (v: string) => void;
  onCreateChatWindow: () => void;
  pending: boolean;
  error: string | null;
}

export function ChatWindowList({
  chatWindows, workspaceId, chatWindowId, onSelectChatWindow,
  newCwTitle, onNewCwTitle, newCwProvider, onProviderChange,
  newCwModel, onNewCwModel, onCreateChatWindow, pending, error,
}: Props) {
  return (
    <div style={s.middle}>
      <div style={s.colSection}>
        <p style={s.colLabel}>Chat Windows</p>
        {!workspaceId && <p style={s.muted}>Select a workspace first.</p>}
        {workspaceId && chatWindows.length === 0 && <p style={s.muted}>No windows yet — create one below.</p>}
        {chatWindows.map(cw => (
          <div
            key={cw.id}
            style={{ ...s.navItem, ...(cw.id === chatWindowId ? s.navItemActive : {}) }}
            onClick={() => onSelectChatWindow(cw.id)}
          >
            <span style={s.cwTitle}>{cw.title}</span>
            <ProviderBadge provider={cw.provider} />
            <span style={s.cwModel}>{cw.model}</span>
          </div>
        ))}

        {workspaceId && (
          <div style={{ ...s.inlineForm, flexDirection: 'column', gap: '0.3rem' }}>
            <input
              style={s.input}
              placeholder="Window title…"
              value={newCwTitle}
              onChange={e => onNewCwTitle(e.target.value)}
              disabled={pending}
            />
            <div style={{ display: 'flex', gap: '0.3rem' }}>
              <select
                style={{ ...s.input, flex: 'none', width: '96px' }}
                value={newCwProvider}
                onChange={e => onProviderChange(e.target.value as AIProvider)}
                disabled={pending}
              >
                {PROVIDERS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <input
                style={s.input}
                placeholder="model"
                value={newCwModel}
                onChange={e => onNewCwModel(e.target.value)}
                disabled={pending}
              />
            </div>
            <button
              style={{ ...s.btn, width: '100%' }}
              onClick={onCreateChatWindow}
              disabled={pending || !newCwTitle.trim() || !newCwModel.trim()}
            >
              {pending ? 'Creating…' : '+ New Window'}
            </button>
            {error && <p style={s.errText}>{error}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
