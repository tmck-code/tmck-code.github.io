# 20240828 Filtering Nones from a Python list

Recently I found myself wondering the best way to strip out `None` items from a python list. As you may be aware, list
comprehension in python is _almost always_ the fastest way to do something, but doesn't look so stylish!

These are various approaches that I came up with that use a "functional" style using the builtin `filter` function

- [20240828 Filtering Nones from a Python list](#20240828-filtering-nones-from-a-python-list)
  - [0. Checking if things are None](#0-checking-if-things-are-none)
  - [1. The list comprehension](#1-the-list-comprehension)
  - [2. lambda](#2-lambda)
  - [3. Partial](#3-partial)
  - [4. Inner function](#4-inner-function)
  - [Benchmarking!](#benchmarking)
  - [Conclusions](#conclusions)

---

## 0. Checking if things are None

I thought of a few ways to do this:

1. `is not` - the "most pythonic"
    ```python
    x is not None
    ```
2. `!=` - comparison
    ```python
    x != None
    ```
3. `isinstance` - comparing types
    ```python
    x not isinstance(None)
    ```

We can benchmark these different approaches in `ipython` to see which comparison is best to use

```python
x = 1

%timeit x is not None
# -> 12.4 ns ± 0.0851 ns per loop (mean ± std. dev. of 7 runs, 100,000,000 loops each)

%timeit x != None
# -> 19.1 ns ± 1.24 ns per loop (mean ± std. dev. of 7 runs, 10,000,000 loops each)

%timeit not isinstance(x, type(None))
# -> 49.3 ns ± 0.0683 ns per loop (mean ± std. dev. of 7 runs, 10,000,000 loops each)

%timeit not isinstance(x, None.__class__)
# -> 48.2 ns ± 0.496 ns per loop (mean ± std. dev. of 7 runs, 10,000,000 loops each)
```

There is a clear winner: `x is not None`.

---

## 1. The list comprehension

```python
def list_comprehension(l):
    return [x for x in l if x is not None]
```

## 2. lambda

Python has 2 filter functions, `filter` and `filterfalse`, which work identically, but for `True`/`False` values
respectively.

```python
from itertools import filterfalse

lambda_is     = lambda x: x is None
lambda_is_not = lambda x: x is not None

def filter_lambda_is(l):
    return list(filterfalse(lambda x: x is None, l))

def filter_lambda_is_not(l):
    return list(filter(lambda x: x is not None, l))

def filterfalse_predef_lambda(l):
    return list(filterfalse(lambda_is, l))

def filter_predef_lambda(l):
    return list(filter(lambda_is_not, l))
```

## 3. Partial

In the same vein as lambda, we can create a partial function using `operator.is_`

```python
import operator

operator.is_(1, None)
# -> False
```


```python
from functools import partial
from itertools import filterfalse

def filter_partial(l):
    return list(filter(partial(operator.is_not, None), l))

def filterfalse_partial(l):
    return list(filterfalse(partial(operator.is_, None), l))

p_is     = partial(operator.is_, None)
p_is_not = partial(operator.is_not, None)

def filter_predef_partial(l):
    return list(filter(p_is_not, l))

def filterfalse_predef_partial(l):
    return list(filterfalse(p_is, l))
```

## 4. Inner function

```python
from functools import partial
from itertools import filterfalse

def filter_inner(l):
    p = partial(operator.is_not, None)
    def inner(x):
        return list(filter(p, x))
    return inner(l)

def filterfalse_inner(l):
    p = partial(operator.is_, None)
    def inner(x):
        return list(filterfalse(p, x))
    return inner(l)
```

## Benchmarking!

We can use the following tests:

For testing, I used the following list, and ran each function **100,000 times**

```python
x = [0,1,2,3,None]*100
```

| function                     | total time | median time | x slower than fastest |
|------------------------------|------------|-------------|-----------------------|
| `filter_predef_partial`      | 664.819 𝑚s |   6.676 𝜇s  | x1.00
| `filter_inner`               | 718.506 𝑚s |   7.153 𝜇s  | ↓ x1.08
| `filterfalse_predef_partial` | 741.668 𝑚s |   7.391 𝜇s  | ↓ x1.12
| `filterfalse_partial`        | 752.076 𝑚s |   7.391 𝜇s  | ↓ x1.13
| `filterfalse_inner`          | 764.408 𝑚s |   7.629 𝜇s  | ↓ x1.15
| `list_comprehension`         | 809.320 𝑚s |   8.106 𝜇s  | ↓ x1.22
| `filterfalse_partial_cached` |   1.301 s  |  12.875 𝜇s  | ↓ x1.96
| `filter_lambda_is_not`       |   1.386 s  |  13.828 𝜇s  | ↓ x2.08
| `filter_lambda_is`           |   1.386 s  |  13.828 𝜇s  | ↓ x2.09
| `filter_predef_lambda`       |   1.413 s  |  14.067 𝜇s  | ↓ x2.13
| `filterfalse_predef_lambda`  |   2.453 s  |  24.557 𝜇s  | ↓ x3.69

---

## Conclusions

- list comprehension is not always the fastest!
- `filter` is faster than `filterfalse`
- `partial`/inner functions, when predefined, are the fastest
  - predefining is faster than defining inline
  - and both are faster than `lambdas`
