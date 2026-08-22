import React from 'react';
import { Icon } from '../core/Icon.jsx';

export function Tabs({ items = [], value, onChange, style }) {
  const active = value ?? (items[0] && (items[0].id || items[0]));
  return (
    <div role="tablist" style={{ display: 'flex', gap: 'var(--space-5)', borderBottom: '1px solid var(--border-subtle)', ...style }}>
      {items.map((it) => {
        const id = it.id || it;
        const on = id === active;
        return (
          <button key={id} role="tab" aria-selected={on} onClick={() => onChange && onChange(id)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)',
              background: 'none', border: 0, cursor: 'pointer', padding: '0 0 10px',
              marginBottom: -1, borderBottom: `2px solid ${on ? 'var(--accent)' : 'transparent'}`,
              color: on ? 'var(--text-primary)' : 'var(--text-muted)',
              font: 'var(--type-label)', fontWeight: on ? 'var(--weight-semibold)' : 'var(--weight-medium)',
              transition: 'var(--transition-control)',
            }}>
            {it.icon && <Icon name={it.icon} size={16} />}
            {it.label || id}
            {it.count != null && (
              <span style={{ font: 'var(--type-code)', fontSize: 'var(--text-2xs)', padding: '1px 6px', borderRadius: 'var(--radius-pill)', background: 'var(--night-600)', color: 'var(--text-muted)' }}>{it.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
