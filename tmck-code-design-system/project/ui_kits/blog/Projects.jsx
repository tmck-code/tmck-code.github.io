const { RepoCard, Tabs, Input, Tag, CodeBlock } = window.TmckCodeDesignSystem_5140e6;

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
Object.assign(window, { Projects });
