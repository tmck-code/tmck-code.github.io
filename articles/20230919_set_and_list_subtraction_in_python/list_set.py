#!/usr/bin/env python3

import bisect
from dataclasses import dataclass, field
import json
import os
import sys
import time
from typing import ClassVar, Iterable

import faker, memory_profiler


f = faker.Faker()

def random_item(): return f['en_US'].sha1()

def iter_with_progress(iterable: Iterable, total: int, progress: int = 10_000):
    for idx, el in enumerate(iterable):
        yield el
        if idx % progress == 0:
            print(
                f'{idx:,d} ({idx*100/total:,.2f}%): {sys.getsizeof(iterable)/1024/1024:,.2f} {memory_profiler.memory_usage()}',
                end='\r',
                flush=True,
            )

def write_fake_data(n, progress, l1_fname, l2_fname):
    with open(l1_fname, 'w') as ostream1, open(l2_fname, 'w') as ostream2:
        for i in iter_with_progress(range(n), n, progress):
            item = random_item()
            print(item, file=ostream1)
            if i <= n//2:
                print(item, file=ostream2)

def bootstrap(n, progress):
    if not os.path.exists(f'l1_{n}.txt'):
        write_fake_data(n, progress, f'l1_{n}.txt', f'l2_{n}.txt')

    coll1 = list(map(str.strip, open(f'l1_{n}.txt', encoding='utf8').readlines()))
    coll2 = list(map(str.strip, open(f'l2_{n}.txt', encoding='utf8').readlines()))

    print('finished bootstrapping for n:', n)
    return coll1, coll2

def index(lst, el):
    'Locate the leftmost value exactly equal to el'
    i = bisect.bisect_left(lst, el)
    if i != len(lst) and lst[i] == el:
        return i
    return None

@dataclass
class Experiments:
    n: int
    coll1: Iterable
    coll2: Iterable
    progress: int = 10_000

    @memory_profiler.profile()
    def testr_diff_lists_new(self):
        'subtract all items in coll2 from coll1'
        self.coll1, self.coll2, result = sorted(self.coll1), sorted(self.coll2), list()

        for i in iter_with_progress(range(len(self.coll2)), len(self.coll2), self.progress):
            if index(self.coll1, self.coll2[i]) is not None:
                result.append(self.coll2[i])
        return result

    @memory_profiler.profile()
    def testr_diff_list_sets(self):
        'subtract all items in coll2 from coll1'
        return list(set(self.coll1) - set(self.coll2))
    

    @memory_profiler.profile()
    def testr_diff_sets_remove(self):
        for el in iter_with_progress(self.coll2, len(self.coll2), self.progress):
            try:
                self.coll1.remove(el)
            except ValueError:
                pass


def run(n: int, mode: str, progress: int = 10_000):
    print(memory_profiler.memory_usage())

    coll1, coll2 = bootstrap(n, progress)
    experiments = Experiments(n, coll1, coll2, progress=progress)

    start = time.time()
    match mode:
        case 'diff_list_sets': experiments.testr_diff_list_sets()
        case 'diff_lists_new': experiments.testr_diff_lists_new()
        case 'diff_sets_remove': experiments.testr_diff_sets_remove()

    print(
        json.dumps({
            'mode': mode,
            'n':    n,
            'time': time.time()-start,
            'mem':  round(memory_profiler.memory_usage()[0], 4),
        }),
        file=sys.stderr,
        flush=True,
    )


if __name__ == '__main__':
    run(
        n=int(sys.argv[1]),
        mode=sys.argv[2],
        progress=10_000,
    )
