const { TerminalWindow, Tabs, CodeBlock, Button, Badge, RobotMark, Card, Switch } = window.TmckCodeDesignSystem_5140e6;

function TerminalKitApp() {
  const [tab, setTab] = React.useState('pokesay');
  const [colour, setColour] = React.useState(true);
  return (
    <div style={{ maxWidth: 1120, margin: '0 auto', padding: 'var(--space-8) var(--space-6)' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
        <RobotMark size={44} variant="avatar" animated />
        <div style={{ flex: 1 }}>
          <h1 style={{ font: 'var(--type-h2)', margin: 0 }}>In the terminal</h1>
          <p style={{ font: 'var(--type-body-sm)', color: 'var(--text-muted)', margin: '4px 0 0' }}>How the brand renders where it actually lives.</p>
        </div>
        <Switch label="Colour output" checked={colour} onChange={setColour} />
      </header>

      <Card eyebrow="yet-another-statusline" title="Statusline" style={{ marginBottom: 'var(--space-6)' }}
        footer="Powerline segments, moss → steel → amber. The amber segment is always the one that needs attention.">
        <div style={{ filter: colour ? 'none' : 'grayscale(1)', transition: 'filter var(--duration-normal) var(--ease-out)' }}><StatuslineCard /></div>
      </Card>

      <Tabs value={tab} onChange={setTab} style={{ marginBottom: 'var(--space-5)' }}
        items={[{ id: 'pokesay', label: 'pokesay', icon: 'terminal' }, { id: 'help', label: '--help', icon: 'book-open' }, { id: 'install', label: 'install', icon: 'package' }]} />

      <div style={{ filter: colour ? 'none' : 'grayscale(1)' }}>
        {tab === 'pokesay' && <PokesayScreen />}
        {tab === 'help' && <HelpScreen />}
        {tab === 'install' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
            <CodeBlock label="go" code="go install github.com/tmck-code/pokesay@latest" />
            <CodeBlock label="python" code="pip install laser-prynter py-ansi-art-convert" />
            <CodeBlock label="shell" code="git clone https://github.com/tmck-code/dotfiles ~/.dotfiles" />
            <CodeBlock label="try it" code={'git log --oneline -1 | pokesay'} />
          </div>
        )}
      </div>

      <div style={{ marginTop: 'var(--space-8)' }}>
        <div style={{ font: 'var(--type-eyebrow)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-caps)', color: 'var(--text-muted)', marginBottom: 'var(--space-3)' }}>ANSI palette in use</div>
        <TerminalWindow chrome={false}>
          {[['black', 'var(--night-900)'], ['red', 'var(--red-500)'], ['green', 'var(--moss-500)'], ['yellow', 'var(--amber-300)'], ['blue', 'var(--steel-500)'], ['magenta', 'var(--ink-500)'], ['cyan', 'var(--moss-300)'], ['white', 'var(--steel-200)']].map(([n, c]) => (
            <div key={n} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={{ width: 84, color: 'var(--text-muted)' }}>{n}</span>
              <span style={{ color: c, letterSpacing: 2 }}>████████ ░▒▓█</span>
              <span style={{ color: c }}>the quick brown fox</span>
            </div>
          ))}
        </TerminalWindow>
      </div>
    </div>
  );
}
ReactDOM.createRoot(document.getElementById('root')).render(<TerminalKitApp />);
