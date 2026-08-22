import React from 'react';
import { Icon } from '../core/Icon.jsx';

const tones = {
  info: ['var(--info)', 'circle-alert'],
  success: ['var(--success)', 'check'],
  warning: ['var(--warning)', 'triangle-alert'],
  danger: ['var(--danger)', 'circle-x'],
};

export function Toast({ tone = 'info', title, message, onDismiss, style }) {
  const [color, icon] = tones[tone];
  return (
    <div role="status" style={{
      display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)',
      minWidth: 280, maxWidth: 420, padding: 'var(--space-3) var(--space-4)',
      background: 'var(--bg-raised)', border: '1px solid var(--border-strong)',
      borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)', ...style,
    }}>
      <span style={{ color, display: 'flex', marginTop: 1 }}><Icon name={icon} size={18} /></span>
      <div style={{ flex: 1 }}>
        {title && <div style={{ font: 'var(--type-label)', color: 'var(--text-primary)' }}>{title}</div>}
        {message && <div style={{ font: 'var(--type-code)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 2 }}>{message}</div>}
      </div>
      {onDismiss && (
        <button onClick={onDismiss} aria-label="Dismiss" style={{ background: 'none', border: 0, color: 'var(--text-muted)', cursor: 'pointer', padding: 0, display: 'flex' }}>
          <Icon name="x" size={16} />
        </button>
      )}
    </div>
  );
}
