const { RobotMark, Badge, Card, Switch, Button } = window.TmckCodeDesignSystem_5140e6;

function About() {
  const [anim, setAnim] = React.useState(true);
  const facts = [['Location', 'Australia'], ['Local time', '09:50 (UTC +10:00)'], ['Email', 'tmck01@gmail.com'], ['Org', '@lexerdev'], ['Followers', '25'], ['Following', '13']];
  return (
    <div style={{ maxWidth: 'var(--container-md)', margin: '0 auto', padding: 'var(--space-10) var(--space-6)' }}>
      <div style={{ display: 'flex', gap: 'var(--space-8)', alignItems: 'flex-start' }}>
        <RobotMark size={132} variant="avatar" animated={anim} framed />
        <div style={{ flex: 1 }}>
          <h1 style={{ font: 'var(--type-h1)', margin: '0 0 4px' }}>Tom McKeesick</h1>
          <div style={{ font: 'var(--type-code)', color: 'var(--text-muted)', marginBottom: 'var(--space-4)' }}>tmck-code · he/him</div>
          <p style={{ font: 'var(--type-body)', color: 'var(--text-secondary)', maxWidth: '54ch' }}>I love coding, in all its forms. I code professionally and for fun.</p>
          <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-5)' }}>
            <Badge tone="brand">python</Badge><Badge tone="brand">go</Badge><Badge tone="brand">rust</Badge><Badge tone="brand">shell</Badge>
          </div>
          <Switch label="Animate the mark" checked={anim} onChange={setAnim} />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-3)', marginTop: 'var(--space-8)' }}>
        {facts.map(([k, v]) => (
          <Card key={k} eyebrow={k} style={{ padding: 'var(--space-4)' }}>
            <div style={{ font: 'var(--type-code)', fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>{v}</div>
          </Card>
        ))}
      </div>
      <div style={{ marginTop: 'var(--space-8)', display: 'flex', gap: 'var(--space-3)' }}>
        <Button variant="secondary" icon="github">github.com/tmck-code</Button>
        <Button variant="ghost" icon="rss">RSS</Button>
      </div>
    </div>
  );
}
Object.assign(window, { About });
