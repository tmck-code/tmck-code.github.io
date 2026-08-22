import React from 'react';

export function TerminalWindow({ title = 'zsh', lines = [], children, chrome = true, style }) {
  return (
    <div style={{
      background: 'var(--bg-inset)', border: '1px solid var(--border-strong)',
      borderRadius: 'var(--radius-md)', overflow: 'hidden',
      boxShadow: 'var(--inset-hairline)', ...style,
    }}>
      {chrome && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 'var(--space-2)', height: 32,
          padding: '0 var(--space-3)', background: 'var(--bg-raised)',
          borderBottom: '1px solid var(--border-subtle)',
        }}>
          <span style={{ display: 'flex', gap: 6 }}>
            <i style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--red-600)' }} />
            <i style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--amber-500)' }} />
            <i style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--moss-500)' }} />
          </span>
          <span style={{ font: 'var(--type-code)', fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', marginLeft: 6 }}>{title}</span>
        </div>
      )}
      <div style={{ padding: 'var(--space-4)', font: 'var(--type-code)', color: 'var(--steel-200)', whiteSpace: 'pre-wrap', overflowX: 'auto' }}>
        {lines.map((l, i) => {
          const line = typeof l === 'string' ? { text: l } : l;
          return (
            <div key={i} style={{ color: line.color || 'inherit', minHeight: '1.6em' }}>
              {line.prompt && <span style={{ color: 'var(--moss-400)' }}>{line.prompt} </span>}
              {line.text}
            </div>
          );
        })}
        {children}
      </div>
    </div>
  );
}
