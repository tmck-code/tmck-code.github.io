# 20220321 Iter Tricks

## Sorting!

What if you need to sort a list and get the first item after the sorting is complete?

> Using the `sorted` method **without** converting back into a list is faster, as python does the minimum amount of sort operations to get your answer, and can also skip the creatino of a whole new list for the results

```python
In [4]: t = list(range(1_000_000))

In [5]: %timeit sorted(t)[0]
6.07 ms ± 116 µs per loop (mean ± std. dev. of 7 runs, 100 loops each)

In [6]: %timeit list(sorted(t))[0]
7.93 ms ± 38.4 µs per loop (mean ± std. dev. of 7 runs, 100 loops each)
```

## Incrementing a loop counter

Often, you'll need to make a loop that does something like counting retries, e.g.

```python
max_retries = 5
while max_retries:
    result = blah()
    if is_bad(result):
        max_retries += 1
```

## Read an entire file

```
result = list(map(str.strip, open("f.txt")))
```

## Do something differe with the first line of a file

```python
import csv

with open("my.csv") as istream:
    header = next(istream)

    for line in istream:
        pass
```