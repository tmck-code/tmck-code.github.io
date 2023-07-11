# Simplify with islice

I was recently asked if I could help to make a bit of python code that would generate a range of column names for Google Sheet, given the number of columns.

e.g.

```python
In [2]: column_names(10)
Out[2]: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']

In [3]: column_names(30)
Out[3]: ['A', 'B', ... 'Y', 'Z', 'AA', 'AB', 'AC', 'AD']
```

and so on! Every time the end of the sequence is reached, the pattern starts again with one more letter (e.g. `ZY, ZZ, AAA`)

In practice, we solved this by just generating a large list of column names so that we are very unlikely to request one that is out of range.

Thanks to good ol' Stack Overflow, I realised that the `itertools.product` method was perfect for this problem
> https://docs.python.org/3/library/itertools.html#itertools.product

```python

In [4]: from itertools import product

In [4]: list(product(('-', 'O', 'X'), repeat=2))
Out[4]:
[('-', '-'),
 ('-', 'O'),
 ('-', 'X'),
 ('O', '-'),
 ('O', 'O'),
 ('O', 'X'),
 ('X', '-'),
 ('X', 'O'),
 ('X', 'X')]
```

## The initial solution

This method creates the "cartesian product" of the input set, which you can research if you are unfamiliar, but is essentially all the combinations of the input items, in order.
By using the `repeat` function argument, we can control the length of the string that we'd like to create  

The last standard-lib function that we can take advantage of is `string.ascii_uppercase`, which gives us the alphabet as uppercase characters

```python
In [5]: import string

In [6]: def column_names(n):
   ...:     names = list(string.ascii_uppercase) + [''.join(el) for el in product(string.ascii_uppercase, repeat=2)]
   ...:     return names[:n]

In [7]: column_names(10)
Out[7]: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']

In [8]: column_names(30)[24:]
Out[8]: ['Y', 'Z', 'AA', 'AB', 'AC', 'AD']
```

This function works fine for our use-case as it can provide up to `702` column names which is far more than we need, however I started thinking about how I'd make the function better.

---

## Using a generator function

The solution has a few issues with it, namely
- We can only generate a max of `702` column names
- The `702` column names are _always_ generated, most times only needing to return a small subset of that

In order to combine the first single-char alphabet, and keep expanding the width when we reach the end of a set (e.g. `ZZ -> AAA`), we can ust the `count` method from itertools, which creates an unbounded loop, giving the current index each iteration
> https://docs.python.org/3/library/itertools.html#itertools.count

First, let's make a function that will generate a list of the requested size
```python

In [20]: def column_names(n):
    ...:     names = []
    ...:     i = 0
    ...:     for j in count(1):
    ...:         for el in product(string.ascii_uppercase, repeat=j):
    ...:             names.append(''.join(el))
    ...:             i += 1
    ...:             if i >= n:
    ...:                 return names
    
In [21]: column_names(10)
Out[21]: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']

In [22]: column_names(30)[24:]
Out[22]: ['Y', 'Z', 'AA', 'AB', 'AC', 'AD']
```

This attempt works pretty well - it only creates the array of the correct size. However, this can be refactored to eliminate the need for the `i` variable to check if the sequence is finished.

Firstly, let's convert the function to `yield` items instead of appending to a list. (This does require, _for now_, that we wrap our method call in a `list` constructor so that the list is actually materialised).

```python
In [23]: def column_names(n):
    ...:     i = 0
    ...:     for j in count(1):
    ...:         for el in product(string.ascii_uppercase, repeat=j):
    ...:             yield ''.join(el)
    ...:             i += 1
    ...:             if i == n:
    ...:                 return
    ...:

In [24]: list(column_names(10))
Out[24]: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']

In [25]: list(column_names(30))[24:]
Out[25]: ['Y', 'Z', 'AA', 'AB', 'AC', 'AD']
```

Now that we are yielding items, we can take advantage of a 3rd (and one of the best) `itertools` method, `islice`.
`islice` takes an iterable, and a "stop" index number, meaning that it will iterate the number of times requested, then end the function.   
This means that we can just write a function that infinitely generates new column names, and remove all references to the `i` variable!

```python
In [26]: def column_names():
    ...:     for j in count(1):
    ...:         for el in product(string.ascii_uppercase, repeat=j):
    ...:             yield ''.join(el)
    ...:

In [27]: list(islice(column_names(), 10))
Out[27]: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']

In [28]: list(islice(column_names(), 30))[24:]
Out[28]: ['Y', 'Z', 'AA', 'AB', 'AC', 'AD']
```
Our algorithm has now been simplified _considerably_ thanks to using `islice`, as we can distill the function down to its purest form.   
If you like, you can go one step further in shortening the code (just because it's python!). You can use a `map` function to apply the `''.join` to each element, meaning that the method becomes only 2 LOC!)

```python
In [38]: def column_names():
    ...:     for j in count(1):
    ...:         yield from map(''.join, product(string.ascii_uppercase, repeat=j)
    ...: )
    ...:

In [39]: list(islice(column_names(), 10))
Out[39]: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']

In [40]: list(islice(column_names(), 30))[24:]
Out[40]: ['Y', 'Z', 'AA', 'AB', 'AC', 'AD']
```

Now, as the final step, we can pack the `list/islice` method calls into our method, making it a nicer for our users to call :)

```python
In [41]: def column_names(n):
    ...:     def _column_names():
    ...:         for j in count(1):
    ...:             yield from map(''.join, product(string.ascii_uppercase, repeat=j)
    ...:     return list(islice(_column_names(), n))
    ...:

In [42]: column_names(10)
Out[42]: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']

In [43]: column_names(30)[24:]
Out[43]: ['Y', 'Z', 'AA', 'AB', 'AC', 'AD']
```