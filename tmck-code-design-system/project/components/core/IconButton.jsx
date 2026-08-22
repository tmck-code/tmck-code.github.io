import React from 'react';
import { Icon } from './Icon.jsx';

const sizes = { sm: 30, md: 38, lg: 46 };

export function IconButton({ icon, size = 'md', variant = 'ghost', active, disabled, label, style, ...rest }) {
  const [hover, setHover] = React.useState(false);
  const box = sizes[size];
  const base = variant === 'solid'
    ? { background: 'var(--bg-raised)', border: '1px solid var(--border-strong)' }
    : { background: 'transparent', border: '1px solid transparent' };
  return (
    <button
      type="button" aria-label={label} title={label} disabled={disabled}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      {...rest}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: box, height: box, borderRadius: 'var(--radius-sm)', cursor: disabled ? 'not-allowed' : 'pointer',
        color: active ? 'var(--accent)' : 'var(--text-secondary)', opacity: disabled ? 0.45 : 1,
        transition: 'var(--transition-control)', ...base,
        ...(active ? { background: 'var(--accent-soft)' } : null),
        ...(hover && !disabled ? { background: active ? 'var(--accent-soft)' : 'var(--night-600)', color: active ? 'var(--accent)' : 'var(--text-primary)' } : null),
        ...style,
      }}
    >
      <Icon name={icon} size={size === 'sm' ? 16 : 20} />
    </button>
  );
}
