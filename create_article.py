#!/usr/bin/env python3

from argparse import ArgumentParser
import datetime
from itertools import repeat
import json
import os, sys

# parse the command line arguments
parser = ArgumentParser()
parser.add_argument('-title', help='the title of the article')
parser.add_argument('-description', help='a short description of the article (used as the blurb)')
args = parser.parse_args()

print(f'Creating article "{args.title}": {args.description}')

today = datetime.date.today()

timestamp = '{y}{m:02d}{d:02d}'.format(
    y = today.year,
    m = today.month,
    d = today.day,
)
badChars = ('/', '\\', '?', '%', '*', ':', '|', '"', '<', '>', '.')
t = str.maketrans(dict(zip((badChars), repeat(None))))

slug = '{d}_{t}'.format(
    d = timestamp,
    t = args.title.lower().translate(t).replace(' ', '_'),
)

# create the directory
os.makedirs(f'articles/{slug}', exist_ok=True)

fpath = f'articles/{slug}/{slug}.md'

# create the article
# - a JSON string is also a valid YAML double-quoted scalar, so it handles
#   titles/blurbs containing ':', '#', quotes, backticks & emoji for free
heading = f'# {timestamp} {args.title}'
front_matter = '\n'.join([
    '---',
    'title: {t}'.format(t = json.dumps(args.title, ensure_ascii=False)),
    'date: {y}-{m:02d}-{d:02d}'.format(y = today.year, m = today.month, d = today.day),
    'blurb: {b}'.format(b = json.dumps(args.description or '', ensure_ascii=False)),
    'tags: []',
    # set to true to keep the article out of the post list & search palette
    # (it stays reachable by direct URL)
    'unlisted: false',
    '---',
])

with open(fpath, 'w') as ostream:
    print(front_matter, file=ostream)
    print('', file=ostream)
    print(heading, file=ostream)

print(f'wrote front matter + heading to {fpath}: "{heading}"')

# add a readme entry that links to the article
# - create the markdown for the readme
entry = f'''
### [{timestamp} {args.title}]({fpath})

> _{args.description}_
'''

# - read in the whole readme
with open('README.md', 'r') as istream:
    readme = istream.read()

# - the readme may or may not have a '---' separator between a header blurb and
#   the article list. if it doesn't, the new entry just goes at the very top.
if '---\n' in readme:
    header, articles = readme.split('---\n', 1)
    readme = '---\n'.join([header, entry + articles])
else:
    readme = entry.lstrip('\n') + '\n' + readme

with open('README.md', 'w') as ostream:
    print(readme, file=ostream, end='')

print(f'\x1b[93mchecking out to branch: {slug}\x1b[0m')
os.system(f'git checkout -b {slug}')

os.system(f'git add {fpath} README.md')
os.system(f'git diff --cached')
os.system('git status')
choice = input('looks good? [y/n]: ')
if choice == 'y':
    os.system(f'git commit -m "add article: {args.title}"')
    os.system('git push')
else:
    print('aborting')
    sys.exit(1)
