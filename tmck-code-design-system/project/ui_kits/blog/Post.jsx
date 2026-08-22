const { Tag, CodeBlock, TerminalWindow, Button, Icon, Toast } = window.TmckCodeDesignSystem_5140e6;

function Post({ post, onBack }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <article style={{ maxWidth: 'var(--container-md)', margin: '0 auto', padding: 'var(--space-10) var(--space-6)' }}>
      <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 0, color: 'var(--text-muted)', font: 'var(--type-code)', fontSize: 'var(--text-xs)', cursor: 'pointer', padding: 0, marginBottom: 'var(--space-6)' }}>
        <Icon name="arrow-left" size={14} /> all posts
      </button>
      <div style={{ font: 'var(--type-eyebrow)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-caps)', color: 'var(--accent)' }}>{post.date} · {post.read}</div>
      <h1 style={{ font: 'var(--type-h1)', margin: '10px 0 14px' }}>{post.title}</h1>
      <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-8)' }}>{post.tags.map((t) => <Tag key={t}>{t}</Tag>)}</div>
      <p style={{ font: 'var(--type-body)', fontSize: 'var(--text-md)', color: 'var(--text-secondary)' }}>{post.blurb}</p>
      <p style={{ font: 'var(--type-body)', color: 'var(--text-secondary)' }}>Terminals have rendered block characters since before any of us were writing code, and they cost nothing: no escape sequences, no capability detection, no fallback path when the pager eats your colours. You get two vertical pixels per cell instead of one, and the picture stops looking like a fax.</p>
      <TerminalWindow title="py-ansi-art-convert" style={{ margin: 'var(--space-6) 0' }} lines={[
        { prompt: '$', text: 'ansi-convert --in art.ans --half-block' },
        { text: 'reading 80x25 ansi ... ok' },
        { text: '▀▀▄▄▀▀ ░▒▓█ 40 rows → 20 rows', color: 'var(--moss-400)' },
        { text: 'wrote art.txt', color: 'var(--amber-500)' },
      ]} />
      <h2 style={{ font: 'var(--type-h2)', fontSize: 'var(--text-xl)', margin: 'var(--space-8) 0 var(--space-3)' }}>The whole trick</h2>
      <p style={{ font: 'var(--type-body)', color: 'var(--text-secondary)' }}>Set the foreground to the top pixel, the background to the bottom pixel, print <code style={{ color: 'var(--amber-500)' }}>▀</code>, move on. That is the entire algorithm.</p>
      <CodeBlock label="python" code={'for top, bot in zip(rows[0::2], rows[1::2]):\n    print(fg(top) + bg(bot) + "▀" * width)'} />
      <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-8)', paddingTop: 'var(--space-6)', borderTop: '1px solid var(--border-subtle)' }}>
        <Button variant="primary" icon="copy" onClick={() => { setCopied(true); setTimeout(() => setCopied(false), 2200); }}>Copy install command</Button>
        <Button variant="ghost" iconAfter="arrow-up-right">Discuss on GitHub</Button>
      </div>
      {copied && <div style={{ position: 'fixed', right: 24, bottom: 24 }}><Toast tone="success" title="Copied" message="pip install py-ansi-art-convert" onDismiss={() => setCopied(false)} /></div>}
    </article>
  );
}
Object.assign(window, { Post });
