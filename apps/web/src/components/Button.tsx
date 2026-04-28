import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'ghost';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const base: React.CSSProperties = {
  border: '1px solid transparent',
  borderRadius: 8,
  padding: '0.5rem 0.9rem',
  fontSize: '0.875rem',
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
  transition: 'background 120ms ease, border-color 120ms ease',
};

const variants: Record<Variant, React.CSSProperties> = {
  primary: {
    background: '#f5f5f5',
    color: '#0b0b0d',
  },
  ghost: {
    background: 'transparent',
    color: '#f5f5f5',
    borderColor: '#2a2a30',
  },
};

export function Button({ variant = 'primary', className, style, ...rest }: ButtonProps) {
  const merged = ['wav-btn', className].filter(Boolean).join(' ');
  return (
    <button
      {...rest}
      className={merged}
      style={{ ...base, ...variants[variant], ...style }}
    />
  );
}
