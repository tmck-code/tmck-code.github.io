#!/usr/bin/env python3

import os, sys
import datetime
from argparse import ArgumentParser

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
slug = '{d}_{t}'.format(
    d = timestamp,
    t = args.title.lower().replace(" ", "_"),
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
entry = [
    f'### [{timestamp} {args.title}]({fpath})',
    '',
    f'> _{args.description}_',
    '',
]
# - read in the whole readme
with open('README.md', 'r') as istream:
    lines = istream.read().split('\n')

print(lines)
# - find the first existing link - will be the first ### after the ---
new_readme = []
for i, line in enumerate(map(str.strip, lines)):
    if line == '---':
        print('!!!!!!!!!')
        new_readme = lines[:i+2] + entry + lines[i+2:]
        break

print('created readme entry:\n', new_readme)

with open('README.md', 'w') as ostream:
    print('\n'.join(new_readme), file=ostream)

print(f'checking out to branch: {slug}')
os.system(f'git checkout -b {slug}')
