# 20260116 ANSI Art Commission - Fiverr

# ANSI Commission - Design Thoughts

<details><summary>Legal/Licensing/Other</summary>

### 1. License

`pokesay` is licensed under the BSD-3-Clause license, which allows the code to be used in both open-source and proprietary software, provided that the original copyright notice and license terms are included (https://github.com/tmck-code/pokesay?tab=BSD-3-Clause-1-ov-file).

I'm happy to add a separate license for the artwork that does not allow it to be reused in this manner, if you'd like? Let me know your thoughts.

### 2. Monetization

`pokesay` is free, and will remain free forever. It's a passion project for me, and I don't intend to monetize it in any way, so I wouldn't be making any money off of your artwork.

### 3. Attribution

I'm happy to include your artist name/signature in all artworks that you provide, as well as in the README and documentation for the project.

### 4. Distribution

- `pokesay` is distributed via GitHub, aur (arch linux) and homebrew (macOS). These binaries/release files would include your artwork.
- The artwork would also be viewable on the GitHub README page.

Please let me know if you have any concerns or thoughts about this.

</details>

## Technical considerations

The `pokesay` binary runs on Linux, macOS, Windows and Android (via Termux). Predominantly, it's used in linux terminal environments.
It uses ASCII and UTF-8 chars with ANSI escape codes to display the pokemon sprites in the terminal, as well as borders for the speech bubbles and info box.

Ideally, the artwork would need to be in UTF-8 format if possible. I know that many ANSI artists use the CP437 character set which isn't compatible, is it an issue to create the art in UTF-8 instead?

## Design thoughts

I'd love some text that says "pokesay"
- Ideally a width of 70-80 chars, and a height of 12-20
- it can either upper or lower case, whichever you think looks best
- it would be displayed by the `pokesay` program in the terminal when a special arg is provided (e.g. `pokesay --title` or `pokesay --demo`)
- I'd also display a screenshot of this at the top of the GitHub README page, replacing the current one that I just made with figlet
- I like many of the colourful designs that you do. In terms of the palette/font to use, I'd rather avoid any potential legal issues with Nintendo, so 
  - _some_ yellow and blue would be nice, as it would match the original pokemon colours.
  - but it shouldn't be _only_ yellow and blue
  - The font should be different to the original pokemon font

### Examples

I gathered some of my examples of coloured titles that I liked, and demo'd what they'd look like in `pokesay` below. There are installation instructions in the README and you could use it to test out your designs, if that's helpful.

I also have a "faves" list on 16colo.rs https://16colo.rs/list/2xoz/faves

| example 1 | example 2 |
|-----------|-----------|
| ![img1](2026-01-22_23-49.png) | ![img2](2026-01-23_00-08.png) |
| ![img3](2026-01-23_00-15.png) | ![img4](2026-01-23_00-21.png) |
| ![img5](2026-01-23_00-28.png) | ![img6](2026-01-23_00-30.png) |