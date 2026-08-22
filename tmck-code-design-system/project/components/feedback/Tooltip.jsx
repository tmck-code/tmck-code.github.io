import React from 'react';

export function Tooltip({ label, placement = 'top', children }) {
  const [open, setOpen] = React.useState(false);
  const pos = {
    top: { bottom: '100%', left: '50%', transform: 'translate(-50%,-8px)' },
    bottom: { top: '100%', left: '50%', transform: 'translate(-50%,8px)' },
    left: { right: '100%', top: '50%', transform: 'translate(-8px,-50%)' },
    right: { left: '100%', top: '50%', transform: 'translate(8px,-50%)' },
  }[placement];
  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}>
      {children}
      <span role="tooltip" style={{
        position: 'absolute', ...pos, zIndex: 40, pointerEvents: 'none', whiteSpace: 'nowrap',
        opacity: open ? 1 : 0, transition: 'opacity var(--duration-fast) var(--ease-out)',
        background: 'var(--night-600)', color: 'var(--text-primary)',
        border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-sm)',
        padding: '4px 8px', font: 'var(--type-code)', fontSize: 'var(--text-2xs)',
        boxShadow: 'var(--shadow-sm)',
      }}>{label}</span>
    </span>
  );
}
