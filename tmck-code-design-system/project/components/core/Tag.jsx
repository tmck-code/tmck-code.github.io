import React from 'react';

export function Tag({ children, onRemove, active, style, ...rest }) {
  const [hover, setHover] = React.useState(false);
  return (
    <span
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      {...rest}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px',
        borderRadius: 'var(--radius-pill)', font: 'var(--type-code)', fontSize: 'var(--text-xs)',
        background: active ? 'var(--accent-soft)' : hover ? 'var(--night-600)' : 'transparent',
        color: active ? 'var(--accent)' : 'var(--text-secondary)',
        border: `1px solid ${active ? 'var(--accent)' : 'var(--border-default)'}`,
        transition: 'var(--transition-control)', cursor: rest.onClick ? 'pointer' : 'default', ...style,
      }}
    >
      {children}
      {onRemove && (
        <button onClick={(e) => { e.stopPropagation(); onRemove(); }} aria-label="Remove"
          style={{ background: 'none', border: 0, color: 'inherit', cursor: 'pointer', padding: 0, lineHeight: 1, fontSize: 13 }}>×</button>
      )}
    </span>
  );
}
