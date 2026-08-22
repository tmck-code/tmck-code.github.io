import React from 'react';

export function Checkbox({ label, checked, onChange, disabled, id, ...rest }) {
  const cbId = id || React.useId();
  return (
    <label htmlFor={cbId} style={{
      display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)',
      cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.45 : 1,
      font: 'var(--type-body-sm)', color: 'var(--text-secondary)',
    }}>
      <input type="checkbox" id={cbId} checked={checked} disabled={disabled}
        onChange={(e) => onChange && onChange(e.target.checked, e)} {...rest}
        style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} />
      <span aria-hidden style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 18, height: 18, borderRadius: 'var(--radius-xs)',
        background: checked ? 'var(--accent)' : 'var(--bg-inset)',
        border: `1px solid ${checked ? 'var(--accent)' : 'var(--border-strong)'}`,
        color: 'var(--ink-800)', fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)',
        transition: 'var(--transition-control)',
      }}>{checked ? '✓' : ''}</span>
      {label}
    </label>
  );
}
