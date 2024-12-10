# 20241128 Comparing Lists or Matrices

Recently I needed to compare matrices (or "lists of lists"), counting the number of different items. I challenged myself to
use the standard library instead of numpy.

---

These matrices have 2 differing values:

```python
m1 = [(0,0),
      (0,1),]

m2 = [(0,1),
      (0,0),]
```

Firstly, it would be easiest (for me) if I somehow transformed each matrix into a single sneuence of numbers.
This can be done using `chain` from the `itertools` standard library tools, which is one of my favourite and probably overused hacks.

```python
from itertools import chain

list(chain.from_iterable(m1))
# [0, 0, 0, 1]

list(chain.from_iterable(m2))
# [0, 1, 0, 0]
```

Using `zip`, we can iterate through both lists and compare each pair of elements:

```python
list(zip(
    chain.from_iterable(m1),
    chain.from_iterable(m2)
))
# [(0, 0), (0, 1), (0, 0), (1, 0)]
```

Next, we need to compare each pair of elements, and I thought of using the `operator` functions, as there is `ne` which could be used to compare elements.

The documentation for `ne` is:

> `ne(a, b, /)` *Same as a != b.*

I want to avoid using a lambda as it is both icky and slow, e.g.

```python
list(map(
    lambda x: x[0]==x[1],
    zip(
        chain.from_iterable(m1),
        chain.from_iterable(m2)
    )
))
# [True, False, True, False]
```

I can use `starmap` to take each pair, and pass it to `operator.eq` as `*args` (hence the name "starmap"! very cool 😎)

```python
from itertools import starmap

list(starmap(
    operator.ne,
    zip(
        chain.from_iterable(m1),
        chain.from_iterable(m2)
    )
))
# [True, False, True, False]
```

And finally, `sum` can be used to count the number of `True`/truthy results

```python
sum(starmap(
    operator.ne,
    zip(
        chain.from_iterable(m1),
        chain.from_iterable(m2)
    )
))
# 2
```

> *Note: counting identical elements could be done easily by using `operator.eq` instead of `operator.ne`*
