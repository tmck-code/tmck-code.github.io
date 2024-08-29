#!/usr/bin/env python3

import sys, time
import bisect
import json

import faker, memory_profiler


f = faker.Faker()

def random_item(): return f['en_US'].sha1()

def print_progress(idx: int, total: int, progress: int):
    if idx % progress == 0:
        print(f'{idx:,d} ({idx*100/total:,.2f}%): {memory_profiler.memory_usage()}', end='\r')


def iter_with_progress(iterable, progress: int = 10_000):
    for i, el in enumerate(iterable):
        print_progress(i, len(iterable), progress)
        yield el


def index(a, x):
    'Locate the leftmost value exactly equal to x'
    i = bisect.bisect_left(a, x)
    if i != len(a) and a[i] == x:
        return i
    return None


class Experiments:
    @memory_profiler.profile()
    def testr_diff_lists(l1, l2, progress: int = 10_000):
        'subtract all items in l2 from l1'
        l1, l2 = sorted(l1), sorted(l2)

        for i in iter_with_progress(range(len(l2)), progress):
            if index(l1, l2[i]) is not None:
                l1.remove(l2[i])
        return l1

    @memory_profiler.profile()
    def testr_diff_lists_new(l1, l2, progress: int = 10_000):
        'subtract all items in l2 from l1'
        l1, l2, result = sorted(l1), sorted(l2), list()

        for i in iter_with_progress(range(len(l2)), progress):
            if index(l1, l2[i]) is not None:
                result.append(l2[i])
        return result

    @memory_profiler.profile()
    def testr_diff_list_sets(l1, l2, progress: int = 10_000):
        'subtract all items in l2 from l1'

        return list(set(l1) - set(l2))

def main(n=1000, mode='diff_lists'):
    print(memory_profiler.memory_usage())

    l1 = list(range(n))
    l2 = l1[:n//2]

    print(f'{len(l1)=}, {len(l2)=}')

    start = time.time()
    match mode:
        case 'diff_lists':     result = Experiments.testr_diff_lists(l1, l2, n)
        case 'diff_list_sets': result = Experiments.testr_diff_list_sets(l1, l2, n)
        case 'diff_lists_new': result = Experiments.testr_diff_lists_new(l1, l2, n)

    print(
        json.dumps({
            'mode': mode,
            'n':    n,
            'time': time.time()-start,
            'len_': len(result),
            'mem':  memory_profiler.memory_usage(),
        }),
        file=sys.stderr,
        flush=True,
    )

if __name__ == '__main__':
    main(int(sys.argv[1]), sys.argv[2])
