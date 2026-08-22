import React from 'react';
import { Icon } from '../core/Icon.jsx';

export function CodeBlock({ code = '', label, copyable = true, style }) {
  const [copied, setCopied] = React.useState(false);
  const copy = () => {
    if (navigator.clipboard) navigator.clipboard.writeText(code).catch(() => {});
    setCopied(true); setTimeout(() => setCopied(false), 1400);
  };
  return (
    <div style={{
      position: 'relative', background: 'var(--bg-inset)', border: '1px solid var(--border-default)',
      borderRadius: 'var(--radius-sm)', padding: 'var(--space-3) var(--space-4)', ...style,
    }}>
      {label && <div style={{ font: 'var(--type-eyebrow)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-caps)', color: 'var(--text-muted)', marginBottom: 6 }}>{label}</div>}
      <pre style={{ margin: 0, font: 'var(--type-code)', color: 'var(--steel-200)', overflowX: 'auto' }}>{code}</pre>
      {copyable && (
        <button onClick={copy} aria-label="Copy" style={{
          position: 'absolute', top: 8, right: 8, display: 'inline-flex', alignItems: 'center', gap: 4,
          background: 'var(--bg-raised)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-xs)',
          color: copied ? 'var(--accent)' : 'var(--text-muted)', cursor: 'pointer', padding: '3px 7px',
          font: 'var(--type-code)', fontSize: 'var(--text-2xs)', transition: 'var(--transition-control)',
        }}>
          <Icon name={copied ? 'check' : 'copy'} size={12} />{copied ? 'copied' : 'copy'}
        </button>
      )}
    </div>
  );
}
