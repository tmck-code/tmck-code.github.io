# UI kit — blog (`tmck-code.github.io`)

The professional register: a personal site that leads with the work. Dark canvas, one full-bleed moss hero band, everything else in a 1080px container.

**Screens** — `index.html` is a click-through of all four:
- **Home** (`Home.jsx`) — moss hero with the animated avatar, post list, sidebar with a `whoami` terminal and two pinned repos.
- **Posts** — the same `PostRow` list, full page.
- **Projects** (`Projects.jsx`) — filterable repo grid with language tabs and install snippets.
- **Post** (`Post.jsx`) — article layout, 820px measure, terminal + code blocks inline, copy-to-clipboard toast.
- **About** (`About.jsx`) — profile facts, live "animate the mark" switch.

**Real content:** repo names, descriptions, bio, location and stats come from the supplied GitHub screenshot and are verbatim. **Placeholder content:** the four blog posts (titles, dates, body copy) are written in the brand voice but invented — the real `tmck-code.github.io` was not supplied.

Composed entirely from the system's components (`NavBar`, `RepoCard`, `TerminalWindow`, `CodeBlock`, `Tabs`, `Tag`, `Toast`, `Button`, `RobotMark`); the only local elements are layout and the post row.
