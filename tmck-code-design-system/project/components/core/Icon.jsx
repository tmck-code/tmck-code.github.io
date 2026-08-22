import React from 'react';

const CDN = 'https://unpkg.com/lucide-static@0.474.0/icons/';

/** Lucide glyph rendered as a CSS mask so it inherits currentColor. */
export function Icon({ name, size = 20, strokeless, style, ...rest }) {
  const url = `url("${CDN}${name}.svg")`;
  return (
    <span
      role="img"
      aria-hidden={rest['aria-label'] ? undefined : true}
      {...rest}
      style={{
        display: 'inline-block', flex: 'none', width: size, height: size,
        background: 'currentColor', WebkitMask: `${url} center/contain no-repeat`,
        mask: `${url} center/contain no-repeat`, ...style,
      }}
    />
  );
}
