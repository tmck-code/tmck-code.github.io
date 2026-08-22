import React from 'react';

const tones = {
  neutral: ['var(--info-soft)', 'var(--text-secondary)'],
  accent: ['var(--accent-soft)', 'var(--accent)'],
  brand: ['var(--brand-soft)', 'var(--moss-300)'],
  success: ['var(--success-soft)', 'var(--success)'],
  warning: ['var(--warning-soft)', 'var(--warning)'],
  danger: ['var(--danger-soft)', 'var(--red-400)'],
};

export function Badge({ tone = 'neutral', dot, children, style, ...rest }) {
  const [bg, fg] = tones[tone];
  return (
    <span {...rest} style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, padding: '2px 8px',
      borderRadius: 'var(--radius-pill)', background: bg, color: fg,
      font: 'var(--type-eyebrow)', fontSize: 'var(--text-2xs)', letterSpacing: 'var(--tracking-wide)',
      border: '1px solid transparent', ...style,
    }}>
      {dot && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />}
      {children}
    </span>
  );
}
