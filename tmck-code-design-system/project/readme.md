# tmck-code — Design System

The personal brand system for **Tom McKeesick** (`tmck-code` on GitHub, `nimbus1r` on Discord, `tmck-code` on YouTube). One identity that has to work in two registers: **professional developer** (GitHub profile, blog, open-source READMEs, CLI tools) and **personal / gaming** (Discord, YouTube, game handles). The mark is the same in both; the surrounding surface changes tone, not identity.

---

## 1. Context

### The person
- Developer in Australia (UTC +10:00). Works with Python, Go, Rust, Shell.
- Bio, verbatim: *"I love coding, in all its forms. I code professionally and for fun."*
- Blog: `tmck-code.github.io` · Email: `tmck01@gmail.com` · Org: `@lexerdev`

### The work (the products this system dresses)
The public output is almost entirely **terminal-facing developer tooling** — which is why this system is dark-first and mono-heavy.

| Repo | What it is | Language |
|---|---|---|
| `yet-another-statusline` | A statusline for Claude Code inspired by terminal monitor programs | Python |
| `pokesay` | Print pokemon in the CLI — an adaptation of the classic "cowsay" | Go |
| `py-ansi-art-convert` | ANSI → Unicode converter | Python |
| `laser-prynter` | terminal/cli/python helpers for colour and pretty-printing | Python |
| `dotfiles` | Shell configuration | Shell |
| `tmck-code.github.io` | The blog | HTML |

The through-line: **colour and legibility in the terminal**. Nearly every project is about making a text UI nicer to look at. The design system inherits that brief.

### Sources this system was built from
No codebase, Figma file or font binaries were provided. Everything here derives from four uploaded images, which are stored in `uploads/`:

- `uploads/AVATAR.png` — the 300×300 avatar used across all accounts. **The single source of truth for the brand.** Colours were sampled pixel-by-pixel from this file; see §4.
- `uploads/2026-08-11_09-49.png` — YouTube channel row (`tmck-code`, @tmck-code).
- `uploads/2026-08-11_09-50.png` — GitHub profile (`tmck-code` / Tom McKeesick), pinned repos, bio, contributions.
- `uploads/2026-08-11_09-51.png` — Discord account panel (`nimbus1r`, `.nimbis`).
- `uploads/AVATAR.svg`, `uploads/AVATAR.circle.svg` — **the author's own vector traces of the avatar**, supplied later and now the canonical vector artwork throughout this system (`assets/avatar.svg`, `assets/avatar-circle.svg`, and everything derived from them). There is no single-colour/mono variant, because one cannot be derived from the trace without losing the plating — ask if you need one.

Because there was no source code or Figma inventory, the component set here is an **authored standard set** (see §8), not a recreation of an existing library. The UI kits are original brand surfaces (blog, terminal, social kit) — **not** recreations of GitHub's or Discord's interfaces.

### The mark
A grey riveted robot head — a rounded teardrop dome, one red cyclops eye behind a dark maroon visor, a glowing amber/yellow mouth bar, and a red lamp on a short antenna — set on a moss-green field with a cluster of darker green hexagons.

**The vectors are the author's own SVGs** (`uploads/AVATAR.svg`, `uploads/AVATAR.circle.svg`) — a full-detail trace of the illustration, body, plating, hex backdrop and all, not a simplification. They are the canonical mark at every size. `assets/logo-mark.svg` is the same artwork with the moss field and hex cluster removed, for use on other backgrounds; `assets/avatar-original.png` keeps the raster for platforms that want a PNG.

### On orange
The brief asked whether orange is too intense for a personal brand. It isn't — **orange is already in the logo**: the robot's mouth is `#f6921e` with a `#f8ea31` yellow inner half. So orange is not an imposition on this identity, it's the part of it that glows.

The system uses it exactly the way the avatar does: **the mark is 90% steel and moss, and the orange is the small hot bit in the middle.** Amber is the accent — links on hover, primary buttons, focus rings, the active state, one number in a stat block. It is never a page background, never a large fill, never a gradient wash. Green carries the surface identity; amber carries attention. That balance is the whole colour strategy.

---

## 2. Content fundamentals

The voice comes straight from the GitHub profile and repo descriptions — read those before writing anything in this brand.

**Tone: plain, dry, faintly amused. Never corporate, never salesy.**
Repo descriptions are one line, lowercase-ish, and say exactly what the thing does with no adjectives:
- "Print pokemon in the CLI! An adaptation of the classic 'cowsay'"
- "terminal/cli/python helpers for colour and pretty-printing"
- "ANSI > Unicode Converter"
- "My blog"

That last one is the tell. Where a brand would write "A collection of thoughts on software craft", this brand writes **"My blog"**. Match that.

**Casing.** Sentence case everywhere — headings, buttons, labels. Title Case is not used. Product and repo names are always in their real, lowercase, hyphenated form: `pokesay`, `yet-another-statusline`, `tmck-code`. Never "Pokesay" or "Poke Say". Set them in mono when they refer to the repo.

**Person.** First person singular for anything about the author ("I love coding, in all its forms"; "My blog"). Second person for instructions to the reader ("Need to bling up your terminal? Try..."). Never "we" — this is one developer, and pretending otherwise is off-brand.

**Ellipses and asides.** The profile uses trailing `...` before a list ("Currently working on ... python framework design") and parenthetical friendliness ("Or anything in general :)"). Keep that looseness; it's what stops the terseness reading as cold.

**Emoji: yes, but only in the developer-README register, and only as list bullets.** The GitHub README uses 🔭 🌱 👯 📖 👋 in the standard profile-README idiom — one emoji per line, at the head of the line, never mid-sentence and never decorative in a UI. **Do not put emoji in interface chrome, buttons, headings, or marketing copy.** In the gaming/Discord register emoji appear as reactions and status, which is that platform's convention, not the brand's.

**ASCII and terminal typography are the brand's real ornament.** Box-drawing characters (`─ │ ┌ ┐ ╭ ╰`), block glyphs (`█ ▓ ▒ ░ ▄ ▀`), arrows (`→ ←  ▸`), a `$` prompt, and ANSI colour bars do the decorative work that illustration would do in another brand. Use them.

**Punctuation of the callout.** Italic one-liners with a question-then-answer shape: *"Need to bling up your terminal? Try `tmck-code/pokesay`"*. That is the CTA voice — a nudge, not an imperative.

**Example copy, on brand:**
> **Ship colour to your terminal.**
> `laser-prynter` — helpers for colour and pretty-printing. Install it, print things, move on.

**Off brand:**
> **Supercharge Your Terminal Experience! 🚀**
> Our powerful, best-in-class toolkit empowers developers to unlock beautiful CLI output.

---

## 3. Visual foundations

### Colour vibe
Muted, slightly dusty, low-saturation — the avatar's green is a **moss/olive** (`#85ac72`), not a vivid green, and the steel is a genuine warm-neutral grey, not blue-grey. The only saturated colours in the entire system are the two lights on the robot: red `#eb1c24` (eye) and amber `#f6921e` (mouth). Imagery should follow: warm, slightly desaturated, a little grain welcome. No cool blue casts, no neon, no purple.

### Surfaces and backgrounds
Dark-first. The default canvas is `--night-900` `#101410` — a near-black tinted toward the moss green, so it sits under the avatar without clashing. Surfaces step up: canvas → surface → raised. Light theme (`[data-theme="light"]`) exists for print and docs and uses warm paper whites, never pure `#fff` as the page.

Backgrounds are **flat colour or flat colour + a texture**. The one sanctioned texture is the honeycomb from the avatar backdrop (`assets/texture-hex.svg`), tiled at 32–64px, at 6–12% opacity over moss or night. No photographic hero backgrounds. **No gradients as decoration** — the only gradients permitted are functional scrims (`--scrim-top`, `--scrim-bottom`) for text over imagery. Absolutely no bluish-purple gradient meshes.

Full-bleed is reserved for two things: the moss hero band on the blog, and social banners. Everything else is a max-width container (`--container-lg`, 1080px) with 24px gutters.

### Type
- **Display — Space Grotesk (600/700).** Slightly mechanical, wide-shouldered, a bit of quirk in the letterforms. It matches the mark's chunky geometry. Headings only, tight tracking (`-0.02em`).
- **Body — IBM Plex Sans.** Humanist, made for developer documentation, pairs natively with a mono. 16px base, 1.55 line height, max ~70ch measure.
- **Mono — JetBrains Mono.** Code, repo names, terminal output, eyebrows, metadata, keyboard keys, stat numbers. Mono is used far more than in a typical brand — it's the voice of the work. Eyebrow labels are mono, 11px, uppercase, `0.09em` tracking.

**Substitution flag:** no font binaries were supplied, so all three are Google Fonts picks loaded from the Google CDN (`tokens/fonts.css`). If there are real brand fonts, send them and this file gets swapped for local `@font-face` rules.

### Spacing and layout
4px grid. Component padding runs 8/12/16/24; section rhythm 48/64/96. Controls come in three heights: 30 / 38 / 46px. Fixed elements are rare — one sticky top bar (56px, `--bg-surface` with a hairline bottom border) and nothing else. No sticky sidebars, no floating action buttons.

### Corner radii
Chunky, matching the mark's rounded plating, but never pill-shaped except for tags and status dots. `--radius-sm 6px` for inputs and buttons, `--radius-md 10px` for cards and terminal windows, `--radius-lg 16px` for large panels and modals, `--radius-pill` for tags/badges/avatars. Nothing is sharp-cornered except tables and code lines.

### Borders
Borders are structural and always visible — this system prefers a **1px border + flat fill** over a shadow to separate surfaces. `--border-subtle` for dividers inside a surface, `--border-default` for card edges, `--border-strong` for emphasis. The one place the border gets loud is the **mark treatment**: 3px `--ink-800` outline, borrowed directly from the logo's stroke, used on avatar frames, brand badges and stickers.

### Shadows
Two systems, used for different jobs.
1. **Ambient** (`--shadow-xs` → `--shadow-lg`): soft, black, low opacity. For real elevation only — dropdowns, dialogs, toasts. Cards on a page use a border, not a shadow.
2. **Hard offset** (`--shadow-hard`: `3px 3px 0 var(--ink-800)`): a flat sticker shadow with no blur, echoing the logo outline. Reserved for brand-forward moments — the avatar frame, a featured card on the blog hero, a sticker badge. Never on form controls.

Inner shadows are used once: `--inset-hairline` (a 5% white top line) on raised dark surfaces to give plating a lit edge, same as the highlight streak on the robot's body.

### Glows
Glow is the robot's lights, so it's semantic, not decorative. `--glow-accent` (amber) marks the focused/active/primary thing; `--glow-danger` (red) marks a destructive or error state. Never glow a whole card, never glow text.

### Transparency and blur
Used sparingly and only for overlays: `--bg-overlay` (72% night) behind modals with `--blur-overlay` (8px). Soft colour washes (`--accent-soft`, `--brand-soft`, `--danger-soft` at 14–18% alpha) back tags, badges and inline highlights. **No frosted-glass navigation, no translucent cards over content.**

### Motion
Restrained and quick, with one exception. Interface transitions are 140ms (`--duration-fast`) on `--ease-out`; entrances 220ms; nothing exceeds 400ms. Fades and small translations (2–6px) only — no slide-in-from-offscreen, no scale-in cards.

The exception is **the mark itself**, which is allowed to idle: a 2.4s brightness pulse on the eye and antenna lamp, a 1.6s mouth level-meter flicker, and — on the transparent-background mark only — a 3.2s vertical bob (`assets/avatar-animated.svg`, `assets/logo-animated.svg`). That is the brand's only playful animation, and it belongs to the robot alone. `--ease-spring` exists for it and for toggle knobs; nothing else bounces. All motion respects `prefers-reduced-motion`.

### Hover, press, focus, disabled
- **Hover** — solid fills go one step *lighter* (amber 500 → 400, the light coming up, not down); ghost/subtle elements gain a `--brand-soft` / `--accent-soft` background; links shift from moss to amber and gain a full-opacity underline. Never opacity-fade a whole element on hover.
- **Press** — one step *darker* (amber 500 → 600) plus `transform: translateY(1px)`. Elements carrying `--shadow-hard` reduce the offset to `1px 1px 0` on press, so the sticker presses into the page. No scale-down.
- **Focus** — always `--ring-focus`: a 2px canvas-coloured gap then a 2px amber ring. Consistent on every interactive element; never removed.
- **Disabled** — 45% opacity, `cursor: not-allowed`, no colour change. Nothing greys out to a different hue.
- **Selected / active** — amber left-edge or underline marker plus `--accent-soft` fill. Note the deliberate exclusion: a rounded card with a coloured left border only is *not* a pattern in this system; the active marker is a 2px underline on tabs or a 3px inset bar on list rows, both flush, never on a floating rounded card.

### Cards
Flat `--bg-surface`, 1px `--border-default`, `--radius-md`, 16–24px padding, no shadow. Hover raises the border to `--border-strong` and nothing else moves. A "featured" card may take `--shadow-hard` and a `--border-accent`. Card headers use mono eyebrows above a display-font title.

---

## 4. Colour, sampled

Every value below was read directly out of `uploads/AVATAR.png`.

| Role | Hex | Where it comes from |
|---|---|---|
| Moss | `#85ac72` | the avatar's field |
| Moss deep | `#5d8c47` | the hexagon cluster |
| Steel | `#a6a8ab` | the head plating |
| Steel shade | `#747577` | the shadowed plating |
| Steel light | `#d3d4d5` | the highlight streak |
| Ink | `#461917` | the mark's outline (a dark maroon, **not** black) |
| Ink deep | `#391211` | the pupil |
| Signal red | `#eb1c24` | the eye |
| Red deep | `#d71921` | the antenna lamp |
| Amber | `#f6921e` | the mouth |
| Yellow | `#f8ea31` | the mouth's inner half |

The one thing to get right: **the outline is maroon-black, not black.** Using `#000` anywhere in this brand makes it look like a different robot.

---

## 5. Iconography

**Icon set: Lucide, at 1.5px stroke weight, 20px default (16px in dense UI, 24px in headers).** No icon system was supplied with the brand assets — this is a **flagged substitution**, chosen because Lucide's even, geometric, open stroke matches the mark's line quality better than Feather (thinner) or Heroicons (rounder, mixed fill). If there's a preferred set, say so and this swaps out.

Lucide is loaded **from CDN as a CSS mask**, so glyphs take `currentColor` and never need a script:

```css
.icon{ -webkit-mask:url("https://unpkg.com/lucide-static@0.474.0/icons/terminal.svg") center/contain no-repeat;
       mask:url("https://unpkg.com/lucide-static@0.474.0/icons/terminal.svg") center/contain no-repeat;
       background:currentColor; width:20px; height:20px; display:inline-block }
```

The `Icon` component in `components/core/` wraps exactly this. Icons are always `--text-secondary` or `--text-muted` at rest and inherit the accent when their control is active. Icons are never multicolour, never filled, never used at display sizes as decoration.

**Working icons for this brand:** `terminal`, `code`, `git-branch`, `git-commit-horizontal`, `github`, `star`, `git-fork`, `package`, `zap`, `palette`, `type`, `sparkles`, `book-open`, `rss`, `gamepad-2`, `headphones`, `mic`, `settings`, `chevron-right`, `arrow-up-right`, `copy`, `check`, `x`, `circle-alert`.

**Unicode is a first-class icon system here**, not a fallback. Box-drawing and block characters set in JetBrains Mono are the correct choice for anything terminal-flavoured — statuslines, ASCII panels, progress bars, tree views. Prefer `▸ ─ │ ╭ ╰ █ ▓ ░ → ✓ ✗ ●` over an SVG icon when the surrounding context is monospaced.

**Emoji as icons: no.** Emoji belong to README bullets and Discord, not to interface chrome (see §2).

**The robot mark is not an icon.** Never use it inline in a list, never at 16px in a button. Minimum size 32px — the trace carries a lot of detail, so it needs the room. Below 96px use the SVG, never the raster illustration.

---

## 6. Assets

| File | Use |
|---|---|
| `assets/avatar-original.png` | The canonical 300×300 raster illustration. The account avatar. Use at ≥96px where the full robot (body, arms, background) should read. |
| `assets/avatar.svg` | **The author's vector avatar** — full artwork on the moss + hex field, square. The default for favicons, OG images, print, any size. |
| `assets/avatar-circle.svg` | Same artwork, pre-clipped to a circle. For places that don't round the image themselves. |
| `assets/avatar-animated.svg` | Animated avatar (eye + lamp pulse, mouth flicker). Loop, ~2.4s. For the site header, loading states, video intros. |
| `assets/logo-mark.svg` | The robot alone, transparent background (field + hexes removed). Use on moss, night or paper. |
| `assets/logo-animated.svg` | The robot alone, animated, with the idle bob. |
| `assets/texture-hex.svg` | Honeycomb tile (derived, not from the author's SVG). Tile at 32–64px from the avatar backdrop. Tile at 32–64px, 6–12% opacity. |

**Clear space:** at least 25% of the mark's height on all sides. **Don't:** recolour the robot, put it on a busy photo, rotate it, add a drop shadow other than `--shadow-hard`, or crop the antenna.

---

## 7. Files

```
styles.css              ← the one file consumers link
tokens/                 fonts · colors · typography · spacing · effects · motion · base
assets/                 logo, avatar, animated variants, hex texture
guidelines/             foundation specimen cards (Design System tab)
components/             core · forms · navigation · feedback · brand
ui_kits/                blog · terminal · social
SKILL.md                Agent Skill entry point
```

---

## 8. Components

No source library defined an inventory, so this is an authored standard set sized to the brand's real surfaces (a blog, CLI tooling docs, and social profiles).

- **`components/core/`** — `Button`, `IconButton`, `Icon`, `Card`, `Badge`, `Tag`
- **`components/forms/`** — `Input`, `Select`, `Checkbox`, `Switch`
- **`components/navigation/`** — `Tabs`, `NavBar`
- **`components/feedback/`** — `Dialog`, `Toast`, `Tooltip`
- **`components/brand/`** — `RobotMark`, `TerminalWindow`, `CodeBlock`, `RepoCard`

**Intentional additions** (things a generic set wouldn't include, justified by this brand):
- `Icon` — a wrapper for the Lucide CSS-mask technique, so the substitution lives in one place.
- `RobotMark` — the logo as a component, with size/variant/animated props, so nobody re-implements clear-space and minimum-size rules.
- `TerminalWindow` / `CodeBlock` — the brand's most-used surface. Every project is a CLI tool; a terminal frame is a primitive here, not a novelty.
- `RepoCard` — repo listings are the primary content type on both the profile and the blog.

## 9. UI kits

- **`ui_kits/blog/`** — `tmck-code.github.io`: home, post, and projects index. The professional register.
- **`ui_kits/terminal/`** — how the brand renders inside a terminal: prompt theme, statusline, `pokesay` output, tool help screen. This is where the ANSI palette is pinned down.
- **`ui_kits/social/`** — profile assets kit: avatar sizes, YouTube channel banner, OG/social card, Discord banner. Original layouts in the brand — not recreations of any platform's UI.
