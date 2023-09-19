# 20230919 Set and List Subtraction in Python

```python
#!/usr/bin/env python3

import sys, time

import faker, memory_profiler

f = faker.Faker()

def random_item(): return f['en_US'].sha1()

@memory_profiler.profile()
def testr_set(n, progress: int = 10_000):
    s = set()
    for i in range(n):
        s.add(random_item())
        if i % progress == 0:
            print(f'{i:,d} ({i*100/n:,.2f}%): {sys.getsizeof(s)/1024/1024:,.2f} {memory_profiler.memory_usage()}', end='\r')
    return s

@memory_profiler.profile()
def testr_list(n, progress: int = 10_000):
    s = list()
    for i in range(n):
        s.append(random_item())
        if i % progress == 0:
            print(f'{i:,d} ({i*100/n:,.2f}%): {sys.getsizeof(s)/1024/1024:,.2f} {memory_profiler.memory_usage()}', end='\r')
    return s

@memory_profiler.profile()
def testr_list_to_set(n, progress: int = 10_000):
    'Build up a list of items, then convert to a set'
    l = []
    for i in range(n):
        l.append(random_item())
        if i % progress == 0:
            print(f'{i:,d} ({i*100/n:,.2f}%): {sys.getsizeof(l)/1024/1024:,.2f} {memory_profiler.memory_usage()}', end='\r')
    return set(l)


@memory_profiler.profile()
def testr_set_to_list(n, progress: int = 10_000):
    'Build up a set of items, then convert to a list'
    s = set()
    for i in range(n):
        s.add(random_item())
        if i % progress == 0:
            print(f'{i:,d} ({i*100/n:,.2f}%): {sys.getsizeof(s)/1024/1024:,.2f} {memory_profiler.memory_usage()}', end='\r')
    return list(s)

import bisect

def index(a, x):
    'Locate the leftmost value exactly equal to x'
    i = bisect.bisect_left(a, x)
    if i != len(a) and a[i] == x:
        return i
    return None

@memory_profiler.profile()
def testr_diff_lists(l1, l2, progress: int = 10_000):
    'subtract all items in l2 from l1'
    l1, l2 = sorted(l1), sorted(l2)

    for i, el in enumerate(l2):
        if i % progress == 0:
            print(f'{i:,d} ({i*100/n:,.2f}%): {sys.getsizeof(l1)/1024/1024:,.2f} {memory_profiler.memory_usage()}', end='\r')

        if index(l1, el) is not None:
            l1.remove(el)
    print(len(l1))
    return l1

@memory_profiler.profile()
def testr_diff_lists_new(l1, l2, progress: int = 10_000):
    'subtract all items in l2 from l1'
    l1, l2, result = sorted(l1), sorted(l2), list()

    for i, el in enumerate(l2):
        if i % progress == 0:
            print(f'{i:,d} ({i*100/n:,.2f}%): {sys.getsizeof(result)/1024/1024:,.2f} {memory_profiler.memory_usage()}', end='\r')

        if index(l1, el) is not None:
            result.append(el)
    print(len(result))
    return result

@memory_profiler.profile()
def testr_diff_list_sets(l1, l2, progress: int = 10_000):
    'subtract all items in l2 from l1'

    return list(set(l1) - set(l2))

if __name__ == '__main__':
    n = int(sys.argv[1])
    progress = 10_000

    print(memory_profiler.memory_usage())

    start = time.time() 
    match mode := sys.argv[2]:
        case 'set_to_list': testr_set_to_list(n, progress)
        case 'list_to_set': testr_list_to_set(n, progress)
        case 'list': testr_list(n)
        case 'set': testr_set(n)
        case 'diff_lists':
            l1 = testr_set_to_list(n, progress)
            l2 = l1[:n//2]
            result = testr_diff_lists(l1, l2, progress)
            print('len', len(result))
        case 'diff_list_sets':
            l1 = testr_list(n)
            l2 = l1[:n//2]
            result = testr_diff_list_sets(l1, l2, progress)
            print('len', len(result))
        case 'diff_lists_new':
            l1 = testr_list(n)
            l2 = l1[:n//2]
            result = testr_diff_lists_new(l1, l2, progress)
            print('len', len(result))

    print(memory_profiler.memory_usage())
    print(f'took {time.time()-start:,.2f} seconds')
```