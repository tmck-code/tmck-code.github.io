# 20250506 Dictionary slice in Python

- [20250506 Dictionary slice in Python](#20250506-dictionary-slice-in-python)
  - [Recreating `slice` in Python](#recreating-slice-in-python)
  - [A better way?](#a-better-way)
  - [Using `operator.itemgetter`](#using-operatoritemgetter)
  - [Benchmarking](#benchmarking)
    - [Results](#results)

---

One of my favourite methods in ruby is [Hash.slice](https://ruby-doc.org/core-3.1.0/Hash.html). It returns a new hash containing only the specified keys from the original hash - very handy!

*It works like this:*

```ruby
h = {a: 1, b: 2, c: 3, d: 4}

h.slice(:a, :b)
# => {a: 1, b: 2}
```

***TL;DR, this is my python equivalent:***

```python
import operator as op

def slice_dict(d: dict, keys: list) -> dict:
    return dict(zip(keys, op.itemgetter(*keys)(d)))
```

---

## Recreating `slice` in Python

We can definitely use a dictionary comprehension to achieve the same result:

```python
def slice_dict(d: dict, keys: list) -> dict:
    return {k: d[k] for k in keys if k in d}
```

```python
d = {'a': 1, 'b': 2, 'c': 3, 'd': 4}

slice_dict(d, ('a', 'b'))
# {'a': 1, 'b': 2}
```

## A better way?

We can use the `dict` constructor to create a new dictionary from a list of tuples, which is a more efficient way to slice a dictionary:

```python
def slice_dict(d: dict, keys: list) -> dict:
    return dict((k, d[k]) for k in keys if k in d)
```

```python
d = {'a': 1, 'b': 2, 'c': 3, 'd': 4}
slice_dict(d, ('a', 'b'))
# {'a': 1, 'b': 2}
```

## Using `operator.itemgetter`

We can use the `[operator.itemgetter](https://docs.python.org/3/library/operator.html#operator.itemgetter)` function to create a callable that retrieves the specified keys from the dictionary.

First, a demonstration of how `itemgetter` works:

```python
import operator as op
d = {'a': 1, 'b': 2, 'c': 3, 'd': 4}

getter = op.itemgetter('a', 'b')

# now we can use the getter to retrieve the values from a dictionary
getter(d)
# (1, 2)
```

We can then create a new dictionary by zipping the returned values with the keys:

```python
keys = getter(d)
# (1, 2)

dict(zip(('a', 'b'), keys))
# {'a': 1, 'b': 2}
```

Combining these two steps, we can create a function that slices a dictionary:

```python
import operator as op

def slice_dict(d: dict, keys: list) -> dict:
    return dict(zip(keys, op.itemgetter(*keys)(d)))
```

```python
d = {'a': 1, 'b': 2, 'c': 3, 'd': 4}

slice_dict(d, ('a', 'b'))
# {'a': 1, 'b': 2}
```

## Benchmarking

Here are some quick benchmarks to compare the three methods:

*I ran this in ipython so that I can use the `%timeit` magic function*

```python
import operator as op

def slice_dict_comp(d: dict, keys: list) -> dict:
    return {k: d[k] for k in keys if k in d}

def slice_dict_gen(d: dict, keys: list) -> dict:
    return dict((k, d[k]) for k in keys if k in d)

def slice_dict_op(d: dict, keys: list) -> dict:
    return dict(zip(keys, op.itemgetter(*keys)(d)))

for fn in [slice_dict_comp, slice_dict_gen, slice_dict_op]:
    print(fn.__name__, fn(d, keys))
    %timeit fn(d, keys)
```

### Results

| function        | time    |
| --------------- | ------- |
| slice_dict_comp | 746 ns  |
| slice_dict_gen  | 1.33 μs |
| slice_dict_op   | 696 ns  |
