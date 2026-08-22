import React from 'react';
import { Icon } from '../core/Icon.jsx';

export function Select({ label, options = [], style, id, ...rest }) {
  const [focus, setFocus] = React.useState(false);
  const selId = id || React.useId();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      {label && <label htmlFor={selId} style={{ font: 'var(--type-label)', color: 'var(--text-secondary)' }}>{label}</label>}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <select id={selId} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)} {...rest}
          style={{
            appearance: 'none', width: '100%', height: 'var(--control-height-md)', padding: '0 34px 0 12px',
            background: 'var(--bg-inset)', color: 'var(--text-primary)', borderRadius: 'var(--radius-sm)',
            border: `1px solid ${focus ? 'var(--accent)' : 'var(--border-default)'}`,
            boxShadow: focus ? 'var(--ring-focus)' : 'none', outline: 'none',
            fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', cursor: 'pointer',
            transition: 'var(--transition-control)', ...style,
          }}>
          {options.map((o) => {
            const v = typeof o === 'string' ? o : o.value;
            return <option key={v} value={v}>{typeof o === 'string' ? o : o.label}</option>;
          })}
        </select>
        <span style={{ position: 'absolute', right: 10, color: 'var(--text-muted)', pointerEvents: 'none', display: 'flex' }}>
          <Icon name="chevron-down" size={16} />
        </span>
      </div>
    </div>
  );
}
