// Interactive blog demo — single-module build of ui_kits/blog for the template picker.
window.blogData = {
  repos: [
    { name: 'yet-another-statusline', description: 'A statusline for Claude Code inspired by terminal monitor programs', language: 'Python', stars: 239, forks: 24 },
    { name: 'pokesay', description: 'Print pokemon in the CLI! An adaptation of the classic "cowsay"', language: 'Go', stars: 33, forks: 3 },
    { name: 'py-ansi-art-convert', description: 'ANSI > Unicode Converter', language: 'Python', stars: 6 },
    { name: 'dotfiles', description: 'My shell configuration', language: 'Shell', stars: 4 },
    { name: 'tmck-code.github.io', description: 'My blog', language: 'HTML' },
    { name: 'laser-prynter', description: 'terminal/cli/python helpers for colour and pretty-printing', language: 'Python' },
  ],
  posts: [
    { id: 'ansi', title: 'Unicode is a better ANSI', date: '2026-07-28', read: '6 min', tags: ['ansi', 'python'],
      blurb: 'ANSI art is 40 years of escape codes. Half-block characters get you the same picture at twice the vertical resolution, and every terminal already renders them.' },
    { id: 'statusline', title: 'A statusline is just a string', date: '2026-06-11', read: '4 min', tags: ['python', 'cli'],
      blurb: 'I spent a weekend making a statusline and most of it was deciding what not to show. Notes on building yet-another-statusline.' },
    { id: 'pokesay', title: 'Why cowsay needed pokemon', date: '2026-04-02', read: '3 min', tags: ['go', 'fun'],
      blurb: 'There was no reason. That is the reason.' },
    { id: 'colour', title: 'Colour helpers I keep rewriting', date: '2026-02-19', read: '5 min', tags: ['python', 'colour'],
      blurb: 'Every project starts with the same twelve lines of terminal colour code. So I put them in a package and stopped.' },
  ],
};
window.blogPages = window.blogPages || [];
window.blogPages = [
    { name: 'bingo', title: 'Bingo, by the numbers', url: 'https://tmck-code.github.io/pages/bingo/index.html',
      blurb: 'Two ways to read the same room — the cold mathematics of the odds, and a day spent inside the hall watching where the money goes.' },
    { name: 'pikachu-stitch-companion', title: 'Glowing Pikachu · Stitch Companion', url: 'https://tmck-code.github.io/pages/pikachu-stitch-companion/pikachu-stitch-companion.html',
      blurb: 'An interactive cross-stitch pattern companion — colour isolation, carry audits, block-by-block progress across 6,088 stitches.' },
    { name: 'space-planner', title: 'Space Planner', url: 'https://tmck-code.github.io/pages/space-planner/index.html',
      blurb: 'Set your space footprint, add shelving units, then drag them into place. Plan, front, side and 3D views.' },
    { name: 'yas', title: 'YAS! — Yet Another Statusline', url: 'https://tmck-code.github.io/pages/yas.html',
      blurb: 'The official landing page for yet-another-statusline — a statusline for Claude Code inspired by terminal monitor programs.' },
    { name: 'ksf-surf-maps', title: 'KSF Surf Maps: Data Visualisation', url: 'https://tmck-code.github.io/articles/20260415_ksf_surf_maps_data_visualisation/analysis.html',
      blurb: 'Charts and insights for surf maps on KSF servers.', soon: true },
];

let _app = null;
function _build() {
  const { RobotMark, Button, RepoCard, Tag, Icon, TerminalWindow, Input, CodeBlock, Toast, Tabs, Badge, Card, Switch, NavBar } = window.TmckCodeDesignSystem_5140e6;
  
  // ---- Home.jsx ----
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
  
  // ---- Posts.jsx ----
  function PostsPage({ onOpenPost }) {
    const { posts } = window.blogData;
    const [q, setQ] = React.useState('');
    const [tag, setTag] = React.useState(null);
    const tags = Array.from(new Set(posts.flatMap((p) => p.tags)));
    const shown = posts.filter((p) => (!tag || p.tags.includes(tag)) && (p.title + p.blurb).toLowerCase().includes(q.toLowerCase()));
    return (
      <div style={{ maxWidth: 'var(--container-lg)', margin: '0 auto', padding: 'var(--space-10) var(--space-6)' }}>
        <h1 style={{ font: 'var(--type-h1)', margin: '0 0 8px' }}>Posts</h1>
        <p style={{ font: 'var(--type-body)', color: 'var(--text-muted)' }}>Notes on terminals, colour, and tools nobody asked for.</p>
        <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'center', margin: 'var(--space-6) 0 var(--space-4)' }}>
          <div style={{ width: 260 }}><Input icon="search" placeholder="Search posts" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            {tags.map((t) => (
              <button key={t} onClick={() => setTag(tag === t ? null : t)} style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', opacity: tag && tag !== t ? 0.45 : 1, transition: 'var(--transition-control)' }}>
                <Tag tone={tag === t ? 'accent' : undefined}>{t}</Tag>
              </button>
            ))}
          </div>
          {(q || tag) && (
            <button onClick={() => { setQ(''); setTag(null); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 0, cursor: 'pointer', font: 'var(--type-code)', fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>
              <Icon name="x" size={12} /> clear
            </button>
          )}
        </div>
        {shown.map((p) => <PostRow key={p.id} post={p} onOpen={onOpenPost} />)}
        {!shown.length && <p style={{ font: 'var(--type-code)', color: 'var(--text-muted)', padding: 'var(--space-6) 0' }}>no matches — try a shorter search</p>}
      </div>
    );
  }
  
  // ---- Palette.jsx ----
  function Palette({ open, onClose, onRun }) {
    const { posts } = window.blogData;
    const [q, setQ] = React.useState('');
    const [sel, setSel] = React.useState(0);
    const inputRef = React.useRef(null);
    const cmds = [
      { id: 'home', icon: 'home', label: 'go: home', run: (r) => r.go('home') },
      { id: 'posts', icon: 'file-text', label: 'go: posts', run: (r) => r.go('posts') },
      { id: 'projects', icon: 'package', label: 'go: projects', run: (r) => r.go('projects') },
      { id: 'about', icon: 'user', label: 'go: about', run: (r) => r.go('about') },
      ...posts.map((p) => ({ id: 'post-' + p.id, icon: 'chevron-right', label: 'open: ' + p.title, run: (r) => r.openPost(p) })),
      { id: 'rss', icon: 'rss', label: 'copy: RSS feed url', run: (r) => r.toast('Copied', 'https://tmck-code.github.io/rss.xml') },
      { id: 'pages-go', icon: 'panels-top-left', label: 'go: pages', run: (r) => r.go('pages') },
      ...(window.blogPages || []).map((p) => ({ id: 'page-' + p.name, icon: 'arrow-up-right', label: 'open: ' + p.name, run: () => window.open(p.url, '_blank', 'noopener') })),
    ];
    const shown = cmds.filter((c) => c.label.toLowerCase().includes(q.toLowerCase()));
    React.useEffect(() => { if (open) { setQ(''); setSel(0); setTimeout(() => inputRef.current && inputRef.current.focus(), 30); } }, [open]);
    React.useEffect(() => { setSel(0); }, [q]);
    if (!open) return null;
    const key = (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, shown.length - 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
      else if (e.key === 'Enter' && shown[sel]) { onRun(shown[sel]); }
      else if (e.key === 'Escape') { onClose(); }
    };
    return (
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(26,29,26,0.55)', zIndex: 100, display: 'flex', justifyContent: 'center', paddingTop: '14vh', animation: 'blogFade 120ms ease-out' }}>
        <div onClick={(e) => e.stopPropagation()} style={{ width: 560, height: 'fit-content', background: 'var(--night-800, var(--ink-800))', border: '1px solid var(--ink-800)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-hard)', overflow: 'hidden', animation: 'blogRise 140ms var(--ease-spring, ease-out)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <span style={{ font: 'var(--type-code)', color: 'var(--moss-400)' }}>$</span>
            <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={key} placeholder="type a command…"
              style={{ flex: 1, background: 'none', border: 0, outline: 0, font: 'var(--type-code)', fontSize: 'var(--text-sm)', color: 'var(--paper-50)' }} />
            <kbd style={{ font: 'var(--type-code)', fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 4, padding: '2px 6px' }}>esc</kbd>
          </div>
          <div style={{ maxHeight: 320, overflowY: 'auto', padding: 6 }}>
            {shown.map((c, i) => (
              <div key={c.id} onClick={() => onRun(c)} onMouseEnter={() => setSel(i)}
                style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: '9px 12px', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                  background: i === sel ? 'var(--moss-700)' : 'transparent', color: i === sel ? 'var(--paper-50)' : 'var(--moss-100, #cfd8cc)', font: 'var(--type-code)', fontSize: 'var(--text-sm)' }}>
                <Icon name={c.icon} size={15} /> {c.label}
                {i === sel && <span style={{ marginLeft: 'auto', font: 'var(--type-code)', fontSize: 'var(--text-2xs)', opacity: 0.7 }}>↵</span>}
              </div>
            ))}
            {!shown.length && <div style={{ padding: '14px 12px', font: 'var(--type-code)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>command not found: {q}</div>}
          </div>
        </div>
      </div>
    );
  }
  
  // ---- Post.jsx ----
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
  
  // ---- Projects.jsx ----
  function Projects({ onNavigate }) {
    const { repos } = window.blogData;
    const [lang, setLang] = React.useState('all');
    const [q, setQ] = React.useState('');
    const langs = ['all', ...Array.from(new Set(repos.map((r) => r.language)))];
    const shown = repos.filter((r) => (lang === 'all' || r.language === lang) && (r.name + r.description).toLowerCase().includes(q.toLowerCase()));
    return (
      <div style={{ maxWidth: 'var(--container-lg)', margin: '0 auto', padding: 'var(--space-10) var(--space-6)' }}>
        <h1 style={{ font: 'var(--type-h1)', margin: '0 0 8px' }}>Projects</h1>
        <p style={{ font: 'var(--type-body)', color: 'var(--text-muted)', maxWidth: '60ch' }}>Everything here is public and installable. Most of it makes a terminal nicer to look at.</p>
        <div style={{ display: 'flex', gap: 'var(--space-6)', alignItems: 'flex-end', margin: 'var(--space-6) 0 var(--space-5)' }}>
          <Tabs style={{ flex: 1 }} value={lang} onChange={setLang} items={langs.map((l) => ({ id: l, label: l }))} />
          <div style={{ width: 240 }}><Input icon="search" placeholder="Filter" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
          {shown.map((r, i) => <RepoCard key={r.name} {...r} featured={i === 0 && lang === 'all' && !q} />)}
        </div>
        {!shown.length && <p style={{ font: 'var(--type-code)', color: 'var(--text-muted)' }}>no matches — try a shorter filter</p>}
        <div style={{ marginTop: 'var(--space-10)' }}>
          <div style={{ font: 'var(--type-eyebrow)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-caps)', color: 'var(--text-muted)', marginBottom: 'var(--space-3)' }}>Get started</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
            <CodeBlock label="go" code="go install github.com/tmck-code/pokesay@latest" />
            <CodeBlock label="python" code="pip install laser-prynter" />
          </div>
        </div>
      </div>
    );
  }
  
  // ---- Pages.jsx ----
  function PagesPage() {
    const pages = window.blogPages || [];
    return (
      <div style={{ maxWidth: 'var(--container-lg)', margin: '0 auto', padding: 'var(--space-10) var(--space-6)' }}>
        <h1 style={{ font: 'var(--type-h1)', margin: '0 0 8px' }}>Pages</h1>
        <p style={{ font: 'var(--type-body)', color: 'var(--text-muted)', maxWidth: '60ch' }}>Interactive things that live in <code style={{ font: 'var(--type-code)', color: 'var(--amber-500)' }}>pages/</code> — not posts, not repos, just things you can open and use.</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)', marginTop: 'var(--space-6)' }}>
          {pages.map((p) => (
            <a key={p.name} href={p.url} target="_blank" rel="noopener" style={{ textDecoration: 'none' }}>
              <Card style={{ height: '100%', cursor: 'pointer', overflow: 'hidden' }} eyebrow={p.name}>
                <div style={{ margin: '0 0 var(--space-3)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', overflow: 'hidden', height: 160 }}>
                  <image-slot id={'page-thumb-' + p.name} shape="rect" placeholder={'Drop a screenshot of ' + p.name}></image-slot>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ font: 'var(--type-h3)', fontSize: 'var(--text-lg)', color: 'var(--text-primary)', margin: '0 0 6px' }}>{p.title}</h3>
                    <p style={{ font: 'var(--type-body-sm)', color: 'var(--text-muted)', margin: 0 }}>{p.blurb}</p>
                    {p.soon && <div style={{ marginTop: 'var(--space-3)' }}><Tag>moving to pages/ soon</Tag></div>}
                  </div>
                  <span style={{ color: 'var(--text-muted)', flex: 'none' }}><Icon name="arrow-up-right" size={16} /></span>
                </div>
              </Card>
            </a>
          ))}
        </div>
        <p style={{ font: 'var(--type-code)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 'var(--space-8)' }}>source: <a href="https://github.com/tmck-code/tmck-code.github.io/tree/main/pages" target="_blank" rel="noopener" style={{ color: 'var(--moss-400)' }}>github.com/tmck-code/tmck-code.github.io/pages</a></p>
      </div>
    );
  }
  
  // ---- About.jsx ----
  function About() {
    // YAS!-style terminal (gradient box frame on true black, Victor Mono)
    const Y = {
      grad: 'linear-gradient(90deg,#28d250 0%,#f0e614 25%,#ff8c14 50%,#dc2832 75%,#aa3cd2 100%)',
      bg: '#000', fg: '#d7d7d7', bright: '#fff', dim: '#808080',
      pwd: '#5fafff', branch: '#87d787', skills: '#ffd787', tok: '#87d7d7',
      cost: '#ff8787', ctx: '#ffaf87', model: '#d7afff', arrow: '#00ff00',
      mono: "'Victor Mono','JetBrains Mono',ui-monospace,monospace",
    };
    const row = { display: 'flex', alignItems: 'baseline', gap: '1ch', padding: '2px 20px', whiteSpace: 'pre', fontFamily: Y.mono, fontSize: 14, lineHeight: 1.55, color: Y.fg };
    const label = (t) => <span style={{ color: Y.dim, width: '12ch', flex: 'none', textAlign: 'right' }}>{t}</span>;
    const sep = (dotted) => (
      <div style={{ height: 2, margin: '6px 0', background: Y.grad, opacity: dotted ? 0.75 : 1,
        WebkitMask: dotted ? 'repeating-linear-gradient(90deg,#000 0 2px,transparent 2px 8px)' : undefined,
        mask: dotted ? 'repeating-linear-gradient(90deg,#000 0 2px,transparent 2px 8px)' : undefined }} />
    );
    const bar = (pct) => { const n = Math.round(pct / 4); return '█'.repeat(n) + '░'.repeat(25 - n); };
    const langs = [['python', 62, Y.branch], ['go', 21, Y.skills], ['shell', 12, Y.tok], ['rust', 5, Y.cost]];
    const facts = [
      ['user', 'tmck-code', Y.pwd], ['name', 'Tom McKeesick', Y.bright], ['location', 'Australia', Y.ctx],
      ['local time', '09:50 (UTC +10:00)', Y.dim], ['org', '@lexerdev', Y.model],
      ['mail', 'tmck01@gmail.com', Y.tok], ['followers', '25 · following 13', Y.dim],
    ];
    const now = [['working on', 'python framework design'], ['learning', 'rust — slowly, happily'], ['always', 'colour & legibility in the terminal']];
    const elsewhere = [
      ['github', 'github.com/tmck-code', 'https://github.com/tmck-code'],
      ['blog', 'tmck-code.github.io', 'https://tmck-code.github.io'],
      ['discord', 'nimbus1r', null],
      ['rss', 'tmck-code.github.io/rss.xml', 'https://tmck-code.github.io/rss.xml'],
    ];
    return (
      <div style={{ maxWidth: 780, margin: '0 auto', padding: 'var(--space-10) var(--space-6)' }}>
        <div style={{ display: 'flex', gap: 'var(--space-6)', alignItems: 'center', marginBottom: 'var(--space-6)' }}>
          <RobotMark size={104} variant="avatar" animated framed />
          <div>
            <div style={{ font: 'var(--type-eyebrow)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-caps)', color: 'var(--accent)', marginBottom: 6 }}>about</div>
            <h1 style={{ font: 'var(--type-h1)', margin: '0 0 6px' }}>Tom McKeesick</h1>
            <div style={{ font: 'var(--type-code)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>tmck-code · he/him · Australia (UTC +10:00)</div>
          </div>
        </div>
        <p style={{ font: 'var(--type-body)', fontSize: 'var(--text-md)', color: 'var(--text-secondary)', maxWidth: '62ch', margin: '0 0 var(--space-2)' }}>I love coding, in all its forms. I code professionally and for fun.</p>
        <p style={{ font: 'var(--type-body)', color: 'var(--text-muted)', maxWidth: '62ch', margin: '0 0 var(--space-8)' }}>Most of what I make is for the terminal — statuslines, colour helpers, ANSI converters. If it prints text, I have opinions about how it should look.</p>
        <div style={{ position: 'relative', padding: 2, borderRadius: 14, background: Y.grad, fontVariantLigatures: 'none' }}>
          <div style={{ position: 'absolute', top: -1, left: 24, transform: 'translateY(-50%)', background: 'var(--bg-canvas)', padding: '0 6px', fontFamily: Y.mono, fontStyle: 'italic', fontSize: 12, color: Y.dim, letterSpacing: '0.02em', whiteSpace: 'nowrap', zIndex: 2, borderRadius: 4 }}>tmck-fetch · session 09:50</div>
          <div style={{ borderRadius: 12, background: Y.bg, padding: '16px 0 12px', overflow: 'hidden' }}>
            {facts.map(([k, v, c]) => (
              <div key={k} style={row}>{label(k)}<span style={{ color: c }}>{v}</span></div>
            ))}
            {sep(true)}
            {now.map(([k, v]) => (
              <div key={k} style={row}>{label(k)}<span style={{ color: Y.arrow }}>→</span><span style={{ color: Y.fg }}>{v}</span></div>
            ))}
            {sep(true)}
            {langs.map(([name, pct, c]) => (
              <div key={name} style={row}>{label(name)}<span style={{ color: c, letterSpacing: '-1px' }}>{bar(pct)}</span><span style={{ color: Y.dim }}>{pct}%</span></div>
            ))}
            {sep(true)}
            {elsewhere.map(([k, v, href]) => (
              <div key={k} style={row}>
                {label(k)}
                {href
                  ? <a href={href} target="_blank" rel="noopener" style={{ color: Y.pwd, textDecoration: 'none', borderBottom: '1px dotted ' + Y.dim }}>{v} <span style={{ color: Y.dim }}>↗</span></a>
                  : <span style={{ color: Y.model }}>{v}</span>}
              </div>
            ))}
            <div style={{ ...row, marginTop: 8 }}>{label('')}<span style={{ fontStyle: 'italic', color: Y.dim }}>Or anything in general :)</span></div>
          </div>
        </div>
      </div>
    );
  }
  
  // ---- App.jsx ----
  const readHash = () => {
    const h = location.hash.replace(/^#\/?/, '');
    if (h.startsWith('post/')) { const p = window.blogData.posts.find((x) => x.id === h.slice(5)); if (p) return { page: 'posts', post: p }; }
    return { page: ['home', 'posts', 'pages', 'projects', 'about'].includes(h) ? h : 'home', post: null };
  };
  
  function App() {
    const [route, setRoute] = React.useState(readHash);
    const [palette, setPalette] = React.useState(false);
    const [toast, setToast] = React.useState(null);
    const { page, post } = route;
    const nav = (r) => { location.hash = r.post ? '#/post/' + r.post.id : '#/' + r.page; };
    const go = (p) => nav({ page: p });
    const openPost = (p) => nav({ page: 'posts', post: p });
    const showToast = (title, message) => { setToast({ title, message }); };
    React.useEffect(() => {
      const onHash = () => { setRoute(readHash()); window.scrollTo(0, 0); };
      const onKey = (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setPalette((v) => !v); }
        if (e.key === 'Escape') setPalette(false);
      };
      window.addEventListener('hashchange', onHash);
      window.addEventListener('keydown', onKey);
      return () => { window.removeEventListener('hashchange', onHash); window.removeEventListener('keydown', onKey); };
    }, []);
    React.useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 2600); return () => clearTimeout(t); } }, [toast]);
    return (
      <div style={{ minHeight: '100%', background: 'var(--bg-canvas)' }}>
        <NavBar title="tmck-code" active={post ? 'posts' : page}
          links={[{ id: 'home', label: 'Home' }, { id: 'posts', label: 'Posts' }, { id: 'pages', label: 'Pages' }, { id: 'projects', label: 'Projects' }, { id: 'about', label: 'About' }]}
          onNavigate={go}
          right={<div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
            <Button variant="ghost" size="sm" onClick={() => setPalette(true)}>⌘K</Button>
            <Button variant="ghost" size="sm" icon="rss" onClick={() => showToast('Subscribed', 'rss.xml copied to clipboard')}>RSS</Button>
          </div>} />
        <div key={post ? 'post-' + post.id : page} style={{ animation: 'blogFade 180ms ease-out' }}>
          {post ? <Post post={post} onBack={() => go('posts')} />
            : page === 'projects' ? <Projects onNavigate={go} />
            : page === 'about' ? <About />
            : page === 'pages' ? <PagesPage />
            : page === 'posts' ? <PostsPage onOpenPost={openPost} />
            : <Home onNavigate={go} onOpenPost={openPost} />}
        </div>
        <footer style={{ borderTop: '1px solid var(--border-subtle)', marginTop: 'var(--space-16)' }}>
          <div style={{ maxWidth: 'var(--container-lg)', margin: '0 auto', padding: 'var(--space-8) var(--space-6)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <RobotMark size={28} />
            <span style={{ font: 'var(--type-code)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>tmck-code.github.io — built in the terminal, mostly</span>
            <span style={{ marginLeft: 'auto', font: 'var(--type-code)', fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>press <kbd style={{ border: '1px solid var(--border-subtle)', borderRadius: 4, padding: '1px 5px' }}>⌘K</kbd> for the command palette</span>
          </div>
        </footer>
        <Palette open={palette} onClose={() => setPalette(false)}
          onRun={(c) => { setPalette(false); c.run({ go, openPost, toast: showToast }); }} />
        {toast && <div style={{ position: 'fixed', right: 24, bottom: 24, zIndex: 110, animation: 'blogRise 160ms ease-out' }}><Toast tone="success" title={toast.title} message={toast.message} onDismiss={() => setToast(null)} /></div>}
      </div>
    );
  }
  
  return App;
}

function BlogApp() {
  const [ready, setReady] = React.useState(!!window.TmckCodeDesignSystem_5140e6);
  React.useEffect(() => {
    if (ready) return;
    const t = setInterval(() => { if (window.TmckCodeDesignSystem_5140e6) { clearInterval(t); setReady(true); } }, 50);
    return () => clearInterval(t);
  }, [ready]);
  if (!ready) return null;
  if (!_app) _app = _build();
  const App = _app;
  return <App />;
}
module.exports = { BlogApp };
