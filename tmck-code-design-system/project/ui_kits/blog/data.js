window.blogData = {
  repos: [
    { name: 'yet-another-statusline', description: 'A statusline for Claude Code inspired by terminal monitor programs', language: 'Python', stars: 239, forks: 24 },
    { name: 'pokesay', description: 'Print pokemon in the CLI! An adaptation of the classic "cowsay"', language: 'Go', stars: 33, forks: 3 },
    { name: 'py-ansi-art-convert', description: 'ANSI > Unicode Converter', language: 'Python', stars: 6 },
    { name: 'dotfiles', description: 'My shell configuration', language: 'Shell', stars: 4 },
    { name: 'tmck-code.github.io', description: 'My blog', language: 'HTML' },
    { name: 'laser-prynter', description: 'terminal/cli/python helpers for colour and pretty-printing', language: 'Python' },
  ],
  posts: [
    { id: 'ansi', title: 'Unicode is a better ANSI', date: '2026-07-28', read: '6 min', tags: ['ansi', 'python'],
      blurb: 'ANSI art is 40 years of escape codes. Half-block characters get you the same picture at twice the vertical resolution, and every terminal already renders them.' },
    { id: 'statusline', title: 'A statusline is just a string', date: '2026-06-11', read: '4 min', tags: ['python', 'cli'],
      blurb: 'I spent a weekend making a statusline and most of it was deciding what not to show. Notes on building yet-another-statusline.' },
    { id: 'pokesay', title: 'Why cowsay needed pokemon', date: '2026-04-02', read: '3 min', tags: ['go', 'fun'],
      blurb: 'There was no reason. That is the reason.' },
    { id: 'colour', title: 'Colour helpers I keep rewriting', date: '2026-02-19', read: '5 min', tags: ['python', 'colour'],
      blurb: 'Every project starts with the same twelve lines of terminal colour code. So I put them in a package and stopped.' },
  ],
};
