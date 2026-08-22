import React from 'react';

export function Switch({ label, checked, onChange, disabled, id }) {
  const swId = id || React.useId();
  return (
    <label htmlFor={swId} style={{
      display: 'inline-flex', alignItems: 'center', gap: 'var(--space-3)',
      cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.45 : 1,
      font: 'var(--type-body-sm)', color: 'var(--text-secondary)',
    }}>
      <input type="checkbox" role="switch" id={swId} checked={!!checked} disabled={disabled}
        onChange={(e) => onChange && onChange(e.target.checked)}
        style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} />
      <span aria-hidden style={{
        position: 'relative', width: 38, height: 22, borderRadius: 'var(--radius-pill)',
        background: checked ? 'var(--accent)' : 'var(--night-600)',
        border: `1px solid ${checked ? 'var(--accent)' : 'var(--border-strong)'}`,
        transition: 'background-color var(--duration-fast) var(--ease-out)', flex: 'none',
      }}>
        <span style={{
          position: 'absolute', top: 2, left: checked ? 18 : 2, width: 16, height: 16,
          borderRadius: '50%', background: checked ? 'var(--ink-800)' : 'var(--steel-300)',
          transition: 'left var(--duration-normal) var(--ease-spring)',
        }} />
      </span>
      {label}
    </label>
  );
}
