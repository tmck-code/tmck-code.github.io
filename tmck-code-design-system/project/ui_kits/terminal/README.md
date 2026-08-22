# UI kit — terminal

The brand's native surface. Every published project is a CLI tool, so "how it looks in a terminal" is a product view, not a novelty.

**Screens** (`index.html`, tabbed):
- **Statusline** (`Statusline.jsx`) — powerline segments for `yet-another-statusline`: moss for identity, steel for path, amber for the one thing that needs attention. Segment separators are the Unicode ▶, not an icon.
- **pokesay output** (`Screens.jsx`) — speech bubble in box-drawing characters, sprite in block glyphs, amber body on a night background.
- **--help screen** — the flags table, showing how mono type carries hierarchy without any UI chrome.
- **ANSI palette** — the eight terminal colours mapped to brand tokens. Note there is no true blue: ANSI blue is `--steel-500`.

The "Colour output" switch greys everything, which is the honest test — the layouts have to survive `--no-colour`.

**Placeholder content:** the pokemon sprite is a generic block-glyph stand-in, and the flag list is representative, not copied from the real `--help`. Send the real output and it can be pasted in verbatim.
