import React from 'react';
import { Icon } from '../core/Icon.jsx';

export function Input({ label, hint, error, icon, prefix, mono, style, id, ...rest }) {
  const [focus, setFocus] = React.useState(false);
  const inputId = id || React.useId();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      {label && <label htmlFor={inputId} style={{ font: 'var(--type-label)', color: 'var(--text-secondary)' }}>{label}</label>}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
        height: 'var(--control-height-md)', padding: '0 12px',
        background: 'var(--bg-inset)', borderRadius: 'var(--radius-sm)',
        border: `1px solid ${error ? 'var(--danger)' : focus ? 'var(--accent)' : 'var(--border-default)'}`,
        boxShadow: focus ? 'var(--ring-focus)' : 'none', transition: 'var(--transition-control)',
      }}>
        {icon && <span style={{ color: 'var(--text-muted)', display: 'flex' }}><Icon name={icon} size={16} /></span>}
        {prefix && <span style={{ font: 'var(--type-code)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>{prefix}</span>}
        <input id={inputId} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)} {...rest}
          style={{
            flex: 1, minWidth: 0, background: 'none', border: 0, outline: 'none', color: 'var(--text-primary)',
            fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)', fontSize: 'var(--text-sm)', ...style,
          }} />
      </div>
      {(hint || error) && <span style={{ font: 'var(--type-body-sm)', fontSize: 'var(--text-xs)', color: error ? 'var(--danger)' : 'var(--text-muted)' }}>{error || hint}</span>}
    </div>
  );
}
