import React from 'react';
import { IconButton } from '../core/IconButton.jsx';

export function Dialog({ open, title, description, footer, onClose, children, width = 460 }) {
  if (!open) return null;
  return (
    <div role="presentation" onClick={onClose} style={{
      position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', zIndex: 50,
      background: 'var(--bg-overlay)', backdropFilter: 'var(--blur-overlay)', WebkitBackdropFilter: 'var(--blur-overlay)',
    }}>
      <div role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()} style={{
        width, maxWidth: 'calc(100% - 32px)', background: 'var(--bg-surface)',
        border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-lg)', padding: 'var(--space-6)',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-4)', marginBottom: 'var(--space-3)' }}>
          <div style={{ flex: 1 }}>
            <h3 style={{ font: 'var(--type-h3)', fontSize: 'var(--text-lg)', margin: 0, color: 'var(--text-primary)' }}>{title}</h3>
            {description && <p style={{ font: 'var(--type-body-sm)', color: 'var(--text-muted)', margin: '6px 0 0' }}>{description}</p>}
          </div>
          <IconButton icon="x" label="Close" size="sm" onClick={onClose} />
        </div>
        {children}
        {footer && <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-6)' }}>{footer}</div>}
      </div>
    </div>
  );
}
