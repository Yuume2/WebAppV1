import type { HTMLAttributes } from 'react';

export function Panel({ style, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...rest}
      style={{
        background: '#131318',
        border: '1px solid #24242c',
        borderRadius: 12,
        overflow: 'hidden',
        ...style,
      }}
    />
  );
}
