import React from 'react';

export function Card({ eyebrow, title, footer, featured, interactive, children, style, ...rest }) {
  const [hover, setHover] = React.useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      {...rest}
      style={{
        background: 'var(--bg-surface)',
        border: `1px solid ${featured ? 'var(--border-accent)' : hover && interactive ? 'var(--border-strong)' : 'var(--border-default)'}`,
        borderRadius: 'var(--radius-md)', padding: 'var(--space-5)',
        boxShadow: featured ? 'var(--shadow-hard)' : 'none',
        cursor: interactive ? 'pointer' : 'default',
        transition: 'var(--transition-control)', ...style,
      }}
    >
      {eyebrow && <div style={{ font: 'var(--type-eyebrow)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-caps)', color: 'var(--text-muted)', marginBottom: 'var(--space-2)' }}>{eyebrow}</div>}
      {title && <h3 style={{ font: 'var(--type-h3)', fontSize: 'var(--text-md)', color: 'var(--text-primary)', margin: '0 0 var(--space-2)' }}>{title}</h3>}
      {children}
      {footer && <div style={{ marginTop: 'var(--space-4)', paddingTop: 'var(--space-3)', borderTop: '1px solid var(--border-subtle)', font: 'var(--type-code)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{footer}</div>}
    </div>
  );
}
