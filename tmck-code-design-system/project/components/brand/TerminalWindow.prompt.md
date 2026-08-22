A terminal frame with traffic lights and a mono body — the house surface for showing CLI output.

```jsx
<TerminalWindow title="zsh" lines={[
  { prompt: '$', text: 'go install github.com/tmck-code/pokesay@latest' },
  { text: 'installed pokesay v2.1.0', color: 'var(--moss-400)' },
]} />
```

Pass `children` instead of `lines` for ANSI art or box-drawing panels. Keep `--font-mono` and box characters; don't substitute icons.
