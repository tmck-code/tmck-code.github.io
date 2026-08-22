Modal over a blurred night scrim — one of the only places blur is allowed.

```jsx
<Dialog open={open} title="Delete this post?" description="This can't be undone." onClose={close}
  footer={<><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="danger">Delete</Button></>} />
```
