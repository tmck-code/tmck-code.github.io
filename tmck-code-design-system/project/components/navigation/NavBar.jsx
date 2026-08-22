import React from 'react';
import { RobotMark } from '../brand/RobotMark.jsx';
import { Icon } from '../core/Icon.jsx';

export function NavBar({ title = 'tmck-code', links = [], active, onNavigate, right, style }) {
  return (
    <header style={{
      display: 'flex', alignItems: 'center', gap: 'var(--space-6)', height: 56,
      padding: '0 var(--space-6)', background: 'var(--bg-surface)',
      borderBottom: '1px solid var(--border-subtle)', ...style,
    }}>
      <a href="#" onClick={(e) => { e.preventDefault(); onNavigate && onNavigate(links[0] && (links[0].id || links[0])); }}
        style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', textDecoration: 'none' }}>
        <RobotMark size={28} variant="avatar" />
        <span style={{ font: 'var(--type-code)', fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-primary)' }}>{title}</span>
      </a>
      <nav style={{ display: 'flex', gap: 'var(--space-1)', flex: 1 }}>
        {links.map((l) => {
          const id = l.id || l;
          const on = id === active;
          return (
            <a key={id} href={l.href || '#'} onClick={(e) => { if (!l.href) e.preventDefault(); onNavigate && onNavigate(id); }}
              style={{
                padding: '6px 10px', borderRadius: 'var(--radius-sm)', textDecoration: 'none',
                font: 'var(--type-label)', color: on ? 'var(--accent)' : 'var(--text-secondary)',
                background: on ? 'var(--accent-soft)' : 'transparent', transition: 'var(--transition-control)',
              }}>{l.label || id}</a>
          );
        })}
      </nav>
      {right}
    </header>
  );
}
