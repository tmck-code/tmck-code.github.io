import React from 'react';
import { Icon } from './Icon.jsx';

const heights = { sm: 'var(--control-height-sm)', md: 'var(--control-height-md)', lg: 'var(--control-height-lg)' };
const pads = { sm: '0 12px', md: '0 16px', lg: '0 22px' };
const fonts = { sm: 'var(--text-xs)', md: 'var(--text-sm)', lg: 'var(--text-base)' };

const variants = {
  primary: { background: 'var(--accent)', color: 'var(--accent-on)', border: '1px solid var(--accent)' },
  secondary: { background: 'var(--bg-raised)', color: 'var(--text-primary)', border: '1px solid var(--border-strong)' },
  brand: { background: 'var(--brand)', color: 'var(--ink-800)', border: '1px solid var(--brand)' },
  ghost: { background: 'transparent', color: 'var(--text-secondary)', border: '1px solid transparent' },
  danger: { background: 'transparent', color: 'var(--danger)', border: '1px solid var(--danger)' },
};
const hovers = {
  primary: { background: 'var(--accent-hover)', borderColor: 'var(--accent-hover)' },
  secondary: { background: 'var(--night-600)', borderColor: 'var(--steel-500)' },
  brand: { background: 'var(--brand-hover)', borderColor: 'var(--brand-hover)' },
  ghost: { background: 'var(--accent-soft)', color: 'var(--text-primary)' },
  danger: { background: 'var(--danger-soft)', color: 'var(--red-400)' },
};

export function Button({ variant = 'primary', size = 'md', icon, iconAfter, sticker, disabled, children, style, ...rest }) {
  const [hover, setHover] = React.useState(false);
  const [down, setDown] = React.useState(false);
  return (
    <button
      type="button" disabled={disabled}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => { setHover(false); setDown(false); }}
      onMouseDown={() => setDown(true)} onMouseUp={() => setDown(false)}
      {...rest}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)',
        height: heights[size], padding: pads[size], borderRadius: 'var(--radius-sm)',
        font: 'var(--type-label)', fontSize: fonts[size], fontWeight: 'var(--weight-semibold)',
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.45 : 1,
        whiteSpace: 'nowrap', transition: 'var(--transition-control)',
        ...variants[variant],
        ...(hover && !disabled ? hovers[variant] : null),
        ...(sticker ? { boxShadow: down ? '1px 1px 0 var(--ink-800)' : 'var(--shadow-hard)' } : null),
        ...(down && !disabled ? { transform: 'translateY(1px)', filter: 'brightness(.92)' } : null),
        ...style,
      }}
    >
      {icon && <Icon name={icon} size={size === 'lg' ? 18 : 16} />}
      {children}
      {iconAfter && <Icon name={iconAfter} size={size === 'lg' ? 18 : 16} />}
    </button>
  );
}
