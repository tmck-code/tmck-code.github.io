#!/usr/bin/env python3

from argparse import ArgumentParser
import datetime
from itertools import repeat
import os, sys

# parse the command line arguments
parser = ArgumentParser()
parser.add_argument('-title', help='the title of the article')
parser.add_argument('-description', help='a short description of the article')
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
heading = f'# {timestamp} {args.title}'
with open(fpath, 'w') as ostream:
    print(heading, file=ostream)

print(f'wrote heading to {fpath}: "{heading}"')

# add a readme entry that links to the article
# - create the markdown for the readme
entry = f'''
### [{timestamp} {args.title}]({fpath})

> _{args.description}_
'''

# - read in the whole readme
with open('README.md', 'r') as istream:
    header, articles = istream.read().split('---\n', 1)

with open('README.md', 'w') as ostream:
    print('---\n'.join([header, entry+articles]), file=ostream, end='')

print(f'\e[93mchecking out to branch: {slug}\e[0m')
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
