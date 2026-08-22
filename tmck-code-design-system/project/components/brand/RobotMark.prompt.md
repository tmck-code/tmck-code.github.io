The logo as a component — it owns the minimum-size and clear-space rules, so never hand-place the SVG.

```jsx
<RobotMark size={96} variant="avatar" framed />
<RobotMark size={40} animated />
```

`variant="avatar"` is the circular moss+hex badge used for profile pictures; `variant="mark"` is the transparent mark for headers and footers. Never recolour, rotate, or use it inline at icon size.
