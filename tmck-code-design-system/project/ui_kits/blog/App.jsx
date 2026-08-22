const { NavBar, Button, RobotMark } = window.TmckCodeDesignSystem_5140e6;

function App() {
  const [page, setPage] = React.useState('home');
  const [post, setPost] = React.useState(null);
  const go = (p) => { setPost(null); setPage(p); };
  return (
    <div style={{ minHeight: '100%', background: 'var(--bg-canvas)' }}>
      <NavBar title="tmck-code" active={post ? 'posts' : page}
        links={[{ id: 'home', label: 'Home' }, { id: 'posts', label: 'Posts' }, { id: 'projects', label: 'Projects' }, { id: 'about', label: 'About' }]}
        onNavigate={go}
        right={<Button variant="ghost" size="sm" icon="rss">RSS</Button>} />
      {post ? <Post post={post} onBack={() => setPost(null)} />
        : page === 'projects' ? <Projects onNavigate={go} />
        : page === 'about' ? <About />
        : page === 'posts' ? (
          <div style={{ maxWidth: 'var(--container-lg)', margin: '0 auto', padding: 'var(--space-10) var(--space-6)' }}>
            <h1 style={{ font: 'var(--type-h1)', margin: '0 0 var(--space-6)' }}>Posts</h1>
            {window.blogData.posts.map((p) => <PostRow key={p.id} post={p} onOpen={setPost} />)}
          </div>
        ) : <Home onNavigate={go} onOpenPost={setPost} />}
      <footer style={{ borderTop: '1px solid var(--border-subtle)', marginTop: 'var(--space-16)' }}>
        <div style={{ maxWidth: 'var(--container-lg)', margin: '0 auto', padding: 'var(--space-8) var(--space-6)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <RobotMark size={28} />
          <span style={{ font: 'var(--type-code)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>tmck-code.github.io — built in the terminal, mostly</span>
        </div>
      </footer>
    </div>
  );
}
ReactDOM.createRoot(document.getElementById('root')).render(<App />);
