'use client';

import { useState } from 'react';
import { useToast } from '@/components/ToastHost';
import { useSession } from '@/features/auth/SessionContext';

export function UserMenu() {
  const { user, logout, loggingOut } = useSession();
  const toast = useToast();
  const [open, setOpen] = useState(false);

  if (!user) return null;

  const display = user.displayName?.trim() || user.email;
  const initial = display.slice(0, 1).toUpperCase();

  const onLogout = async () => {
    setOpen(false);
    try {
      await logout();
    } catch (err) {
      toast.pushError(err, 'logout');
    }
  };

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        title={user.email}
        style={triggerStyle}
      >
        <span style={avatarStyle} aria-hidden>
          {initial}
        </span>
        <span style={nameStyle}>{display}</span>
        <span aria-hidden style={chevronStyle}>
          ▾
        </span>
      </button>

      {open && (
        <>
          <div
            aria-hidden
            onClick={() => setOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 39 }}
          />
          <div role="menu" style={menuStyle}>
            <div style={menuHeaderStyle}>
              <div style={{ fontSize: '0.85rem', fontWeight: 500 }}>{display}</div>
              <div style={{ fontSize: '0.75rem', color: '#8a8a95' }}>{user.email}</div>
            </div>
            <a href="/settings/providers" role="menuitem" style={menuItemStyle}>
              Provider settings
            </a>
            <button
              type="button"
              role="menuitem"
              onClick={onLogout}
              disabled={loggingOut}
              style={{
                ...menuItemStyle,
                ...(loggingOut ? { color: '#8a8a95', cursor: 'wait' } : {}),
              }}
            >
              {loggingOut ? 'Logging out…' : 'Log out'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

const triggerStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.5rem',
  background: 'transparent',
  border: '1px solid #2a2a30',
  borderRadius: 999,
  padding: '0.3rem 0.7rem 0.3rem 0.3rem',
  color: '#f5f5f5',
  fontSize: '0.85rem',
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const avatarStyle: React.CSSProperties = {
  width: 24,
  height: 24,
  borderRadius: '50%',
  background: '#2b2b36',
  color: '#f5f5f5',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '0.75rem',
  fontWeight: 600,
};

const nameStyle: React.CSSProperties = {
  maxWidth: 160,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const chevronStyle: React.CSSProperties = {
  fontSize: '0.65rem',
  color: '#8a8a95',
};

const menuStyle: React.CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 6px)',
  right: 0,
  minWidth: 220,
  background: '#141418',
  border: '1px solid #2a2a30',
  borderRadius: 10,
  padding: '0.4rem',
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
  zIndex: 40,
};

const menuHeaderStyle: React.CSSProperties = {
  padding: '0.5rem 0.6rem 0.6rem',
  borderBottom: '1px solid #1d1d22',
  marginBottom: 4,
  color: '#e8e8ef',
};

const menuItemStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  textAlign: 'left',
  padding: '0.5rem 0.6rem',
  color: '#e8e8ef',
  fontSize: '0.85rem',
  fontFamily: 'inherit',
  cursor: 'pointer',
  borderRadius: 6,
  textDecoration: 'none',
  display: 'block',
};
