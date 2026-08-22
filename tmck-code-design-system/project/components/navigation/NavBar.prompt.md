The one fixed element in the system — a 56px top bar. The wordmark is set in mono, always the real handle.

```jsx
<NavBar links={['posts','projects','about']} active="posts" onNavigate={setPage}
  right={<Button variant="ghost" size="sm" icon="rss">RSS</Button>} />
```
