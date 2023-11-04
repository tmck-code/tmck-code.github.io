#!/usr/bin/env python3

import sys, time, copy
import bisect
from dataclasses import dataclass
from typing import ClassVar

import faker, memory_profiler

f = faker.Faker()

def random_item():
    'generate a random fake item'
    return f['en_US'].sha1()


@memory_profiler.profile()
def load_lists_for_test() -> tuple[list, list]:
    'load fake data from files to save on 🕑'

    with open('l1.lst') as l1f, open('l2.lst') as l2f:
        return set(l1f.readlines()), set(l2f.readlines())


def index(lst: list[str], el: str):
    'Locate the leftmost value exactly equal to el'

    idx = bisect.bisect_left(lst, el)
    if idx != len(lst) and lst[idx] == el:
        return idx
    return None


def print_progress(idx, total):
    print(f'{idx:,d} ({idx*100/total:,.2f}%): {memory_profiler.memory_usage()[0]:.2f}', end='\r', flush=True)


def enumerate_with_progress(l, len, progress):
    for i, el in enumerate(l):
        if i % progress == 0:
            print_progress(i, len)
        yield el


@dataclass
class Candidates:
    progress: ClassVar[int] = 10_000

    @memory_profiler.profile()
    def diff_lists(l1, l2):
        'subtract all items in l2 from l1'

        l1, l2 = sorted(l1), sorted(l2)

        for el in enumerate_with_progress(l2, len(l2), Candidates.progress):
            if index(l1, el) is not None:
                l1.remove(el)
        return l1

    @memory_profiler.profile()
    def diff_sets(s1, s2):
        'subtract all items in s2 from s1'

        for el in enumerate_with_progress(s2, len(s2), Candidates.progress):
            if el in s1:
                s1.remove(el)
        return s1

    @memory_profiler.profile()
    def diff_lists_new(l1, l2):
        'subtract all items in l2 from l1'

        l1, l2, result = sorted(l1), sorted(l2), list()

        for el in enumerate_with_progress(l2, len(l2), Candidates.progress):
            if index(l1, el) is not None:
                result.append(el)
        return result

    @memory_profiler.profile()
    def diff_sets_new(s1, s2):
        'subtract all items in s2 from s1'

        result = list()

        for el in enumerate_with_progress(s2, len(s2), Candidates.progress):
            if el in s1:
                result.append(el)
        print(len(result), flush=True)
        return result

    @memory_profiler.profile()
    def diff_list_sets(l1, l2):
        'subtract all items in l2 from l1'

        return list(set(l1) - set(l2))


if __name__ == '__main__':
    n, mode = int(sys.argv[1]), sys.argv[2]
    Candidates.progress = 100_000

    print(memory_profiler.memory_usage())
    l1, l2 = load_lists_for_test()

    try:
        f = getattr(Candidates, mode)
    except AttributeError as e:
        print('invalid mode', mode)
        sys.exit(1)

    start = time.time()
    result = f(l1, l2)
    print('len', len(result))

    print(memory_profiler.memory_usage())
    print(f'mode {mode} finished in {time.time()-start:,.2f} seconds', flush=True)
