import React from 'react';
import { Icon } from '../core/Icon.jsx';
import { Badge } from '../core/Badge.jsx';

const langColors = {
  Python: 'var(--moss-400)', Go: 'var(--steel-300)', Rust: 'var(--amber-600)',
  Shell: 'var(--amber-300)', HTML: 'var(--red-500)', JavaScript: 'var(--amber-400)',
};

export function RepoCard({ name, description, language, stars, forks, visibility = 'Public', featured, onClick, style }) {
  const [hover, setHover] = React.useState(false);
  return (
    <div onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)',
        border: `1px solid ${featured ? 'var(--border-accent)' : hover ? 'var(--border-strong)' : 'var(--border-default)'}`,
        boxShadow: featured ? 'var(--shadow-hard)' : 'none',
        cursor: onClick ? 'pointer' : 'default', transition: 'var(--transition-control)', ...style,
      }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
        <span style={{ color: 'var(--text-muted)', display: 'flex' }}><Icon name="book-marked" size={16} /></span>
        <span style={{ font: 'var(--type-code)', fontSize: 'var(--text-sm)', fontWeight: 700, color: hover ? 'var(--accent)' : 'var(--text-link)', transition: 'var(--transition-control)' }}>{name}</span>
        <Badge>{visibility.toLowerCase()}</Badge>
      </div>
      <p style={{ font: 'var(--type-body-sm)', color: 'var(--text-muted)', margin: 0, minHeight: 40 }}>{description}</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', marginTop: 'var(--space-3)', font: 'var(--type-code)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
        {language && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <i style={{ width: 9, height: 9, borderRadius: '50%', background: langColors[language] || 'var(--steel-400)' }} />{language}
          </span>
        )}
        {stars != null && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Icon name="star" size={13} />{stars}</span>}
        {forks != null && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Icon name="git-fork" size={13} />{forks}</span>}
      </div>
    </div>
  );
}
