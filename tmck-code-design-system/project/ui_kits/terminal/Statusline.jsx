const { Badge } = window.TmckCodeDesignSystem_5140e6;

function Seg({ color, bg, children, arrow = true, next }) {
  return (
    <>
      <span style={{ background: bg, color, padding: '2px 10px', display: 'inline-flex', alignItems: 'center', gap: 6 }}>{children}</span>
      {arrow && <span style={{ color: bg, background: next || 'transparent', fontSize: 15, lineHeight: '22px' }}>▶</span>}
    </>
  );
}

function Statusline() {
  return (
    <div style={{ font: 'var(--type-code)', fontSize: 'var(--text-xs)', display: 'flex', alignItems: 'center', whiteSpace: 'nowrap', overflow: 'hidden', borderRadius: 'var(--radius-xs)' }}>
      <Seg bg="var(--moss-700)" color="var(--paper-50)" next="var(--night-600)">tmck-code</Seg>
      <Seg bg="var(--night-600)" color="var(--steel-200)" next="var(--night-700)">~/src/pokesay</Seg>
      <Seg bg="var(--night-700)" color="var(--moss-400)" next="var(--amber-600)">⎇ main ✓</Seg>
      <Seg bg="var(--amber-600)" color="var(--ink-800)" next="var(--night-800)">◐ 62% ctx</Seg>
      <Seg bg="var(--night-800)" color="var(--steel-300)" arrow={false}>go 1.24 · 09:50</Seg>
    </div>
  );
}

function StatuslineCard() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <Statusline />
      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        <Badge tone="brand" dot>clean</Badge><Badge tone="warning" dot>3 staged</Badge><Badge tone="danger" dot>detached</Badge><Badge tone="accent">62% ctx</Badge>
      </div>
    </div>
  );
}
Object.assign(window, { Statusline, StatuslineCard, Seg });
