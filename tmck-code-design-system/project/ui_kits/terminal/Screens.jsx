const { TerminalWindow, Tabs, CodeBlock, Button, Badge, Tag } = window.TmckCodeDesignSystem_5140e6;

const POKE = [
  '  ╭────────────────────────────────────────╮',
  '  │ colour is the point                    │',
  '  ╰────────────────────────────────────────╯',
  '        ╲',
  '         ▄▄▀▀▀▀▄▄        ',
  '       ▄▀  ▀▄▄▀  ▀▄      ',
  '      █   ●    ●   █     ',
  '      █      ▀      █    ',
  '       ▀▄▄▄▄▄▄▄▄▄▄▀      ',
  '        ▐█▌      ▐█▌     ',
  '   charmander · gen1',
];

function PokesayScreen() {
  return (
    <TerminalWindow title="pokesay" lines={[
      { prompt: '$', text: 'echo "colour is the point" | pokesay --category gen1' },
      ...POKE.map((t, i) => ({ text: t, color: i < 3 ? 'var(--steel-200)' : i === 10 ? 'var(--text-muted)' : 'var(--amber-500)' })),
      { prompt: '$', text: '' },
    ]} />
  );
}

function HelpScreen() {
  const rows = [
    ['-c, --category', 'pokemon category (gen1 … gen9, all)'],
    ['-n, --name', 'pick by name'],
    ['-w, --width', 'wrap the speech bubble at N columns'],
    ['--no-colour', 'strip ANSI, print plain text'],
    ['-l, --list', 'list every available pokemon'],
  ];
  return (
    <TerminalWindow title="pokesay --help">
      <div style={{ color: 'var(--amber-500)' }}>pokesay</div>
      <div style={{ color: 'var(--text-muted)', marginBottom: 10 }}>Print pokemon in the CLI! An adaptation of the classic "cowsay"</div>
      <div style={{ color: 'var(--moss-400)' }}>USAGE</div>
      <div style={{ marginBottom: 10 }}>  pokesay [flags] [message]</div>
      <div style={{ color: 'var(--moss-400)' }}>FLAGS</div>
      {rows.map(([flag, desc]) => (
        <div key={flag} style={{ display: 'flex' }}>
          <span style={{ width: 190, color: 'var(--steel-100)' }}>  {flag}</span>
          <span style={{ color: 'var(--text-muted)' }}>{desc}</span>
        </div>
      ))}
    </TerminalWindow>
  );
}
Object.assign(window, { PokesayScreen, HelpScreen });
