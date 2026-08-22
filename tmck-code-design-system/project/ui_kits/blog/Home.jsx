const { RobotMark, Button, RepoCard, Tag, Icon, TerminalWindow } = window.TmckCodeDesignSystem_5140e6;

function Hero({ onNavigate }) {
  return (
    <section style={{ position: 'relative', background: 'var(--moss-700)', overflow: 'hidden', borderBottom: '3px solid var(--ink-800)' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'url(../../assets/texture-hex.svg) 56px', opacity: 0.35 }} />
      <div style={{ position: 'relative', maxWidth: 'var(--container-lg)', margin: '0 auto', padding: '56px var(--space-6)', display: 'flex', gap: 'var(--space-10)', alignItems: 'center' }}>
        <RobotMark size={148} variant="avatar" animated framed />
        <div style={{ flex: 1 }}>
          <div style={{ font: 'var(--type-eyebrow)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-caps)', color: 'var(--moss-100)' }}>Tom McKeesick · he/him · Australia</div>
          <h1 style={{ font: 'var(--type-display)', color: 'var(--paper-50)', margin: '10px 0 12px' }}>I love coding,<br />in all its forms.</h1>
          <p style={{ font: 'var(--type-body)', color: 'var(--moss-100)', maxWidth: '52ch', margin: '0 0 20px' }}>I code professionally and for fun. Mostly terminal tooling — statuslines, colour helpers, ANSI converters.</p>
          <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
            <Button variant="primary" sticker icon="package" onClick={() => onNavigate('projects')}>Projects</Button>
            <Button variant="secondary" icon="github" style={{ background: 'transparent', color: 'var(--paper-50)', borderColor: 'var(--ink-800)' }}>github.com/tmck-code</Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function PostRow({ post, onOpen }) {
  const [hover, setHover] = React.useState(false);
  return (
    <article onClick={() => onOpen(post)} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ display: 'flex', gap: 'var(--space-6)', padding: 'var(--space-5) var(--space-4)', cursor: 'pointer',
        borderBottom: '1px solid var(--border-subtle)', background: hover ? 'var(--bg-surface)' : 'transparent',
        boxShadow: hover ? 'inset 3px 0 0 var(--accent)' : 'none', transition: 'var(--transition-control)' }}>
      <div style={{ width: 96, flex: 'none', font: 'var(--type-code)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', paddingTop: 4 }}>{post.date}</div>
      <div style={{ flex: 1 }}>
        <h3 style={{ font: 'var(--type-h3)', fontSize: 'var(--text-lg)', color: hover ? 'var(--accent)' : 'var(--text-primary)', margin: '0 0 6px', transition: 'var(--transition-control)' }}>{post.title}</h3>
        <p style={{ font: 'var(--type-body-sm)', color: 'var(--text-muted)', margin: '0 0 10px', maxWidth: '68ch' }}>{post.blurb}</p>
        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
          {post.tags.map((t) => <Tag key={t}>{t}</Tag>)}
          <span style={{ font: 'var(--type-code)', fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', marginLeft: 4 }}>{post.read}</span>
        </div>
      </div>
      <span style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}><Icon name="chevron-right" size={18} /></span>
    </article>
  );
}

function Home({ onNavigate, onOpenPost }) {
  const { posts, repos } = window.blogData;
  return (
    <div>
      <Hero onNavigate={onNavigate} />
      <div style={{ maxWidth: 'var(--container-lg)', margin: '0 auto', padding: 'var(--space-10) var(--space-6)', display: 'grid', gridTemplateColumns: '1fr 300px', gap: 'var(--space-10)' }}>
        <div>
          <div style={{ font: 'var(--type-eyebrow)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-caps)', color: 'var(--text-muted)', marginBottom: 'var(--space-4)' }}>Recent posts</div>
          {posts.map((p) => <PostRow key={p.id} post={p} onOpen={onOpenPost} />)}
        </div>
        <aside style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          <TerminalWindow title="whoami" chrome lines={[
            { prompt: '$', text: 'whoami' },
            { text: 'tmck-code', color: 'var(--amber-500)' },
            { prompt: '$', text: 'cat now.txt' },
            { text: '→ python framework design' },
            { text: '→ learning rust' },
          ]} />
          <div>
            <div style={{ font: 'var(--type-eyebrow)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-caps)', color: 'var(--text-muted)', marginBottom: 'var(--space-3)' }}>Pinned</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {repos.slice(0, 2).map((r, i) => <RepoCard key={r.name} {...r} featured={i === 0} onClick={() => onNavigate('projects')} />)}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
Object.assign(window, { Home, Hero, PostRow });
