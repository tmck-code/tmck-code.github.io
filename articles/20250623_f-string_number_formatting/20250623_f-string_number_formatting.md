# 20250623 F-String number formatting

> _The official docs (somewhat hard to find!):
> https://docs.python.org/3/library/string.html#format-string-syntax_

When you need to log a number as a string, either when
- writing data to file, or
- formatting a log

doing it via f-strings is the most flexible way, and often the fastest!

- [20250623 F-String number formatting](#20250623-f-string-number-formatting)
  - [Rounding floats](#rounding-floats)
  - [0-padding numbers](#0-padding-numbers)
    - [Decimal padding](#decimal-padding)
    - [Integer padding](#integer-padding)
  - [Decimal formatting](#decimal-formatting)
    - [Separators](#separators)

---

> _For all examples that use benchmarking, I used `ipython` so that I could use the `%timeit` magic command._

## Rounding floats

Usually you might consider using the `round()` function, but it might surprise you to know that using an f-string is faster!   
First, let's take a float with many decimal places, and round them it to two decimal places:

```python
n = 4.255857

str(round(n, 2))
# '4.26'

f"{n:.2f}"
# '4.26'
```

Notice that the f-string has rounded the `.255` to `.26`, rather than just truncating it to `.25` as you might expact.

Now let's benchmark the two methods:

```python
%timeit str(round(n, 2))
# 305 ns ± 1.64 ns per loop (mean ± std. dev. of 7 runs, 1,000,000 loops each)

%timeit f'{n:.2f}'
# 115 ns ± 0.164 ns per loop (mean ± std. dev. of 7 runs, 10,000,000 loops each)
```

The f-string is more than twice as fast as the `round()` function!

## 0-padding numbers

### Decimal padding

Whenever you need to vertically align logs or print output for easier readability, you can use padding zeroes instead of spaces to align your numbers.

With f-strings, you can add padding zeroes to decimal numbers, as well as the integer part of the number. For a list of given floats, we can try to:

- ensure that each float has 2 decimal places
  - add padding zeros if shorter than 2
  - round to 2 decimal places if longer than 2

```python
n = [ 4.0, 44.2, 55.25525]

for i in n:
    print(f'{i:>10} > {i:.02f}')

#       4.0 > 4.00
#      44.2 > 44.20
#  55.25525 > 55.26
```

### Integer padding

You can also use the `0` padding to align the integer part of the number. This is a little unintuitive, as you might expect that you would define the number of digits to the left of the decimal point, e.g. to print a consistent-width percentage like this:

```text
00.00%
08.55%
17.09%
25.64%
34.18%
42.73%
51.27%
59.82%
68.37%
76.91%
85.46%
94.00%
```

Let's give it a try:

```python
 n = list(range(0, 50, 9))
# [0, 9, 18, 27, 36, 45]

for i in n:
    print(f'{i:02.02f}%')

# 0.00%
# 9.00%
# 18.00%
# 27.00%
# 36.00%
# 45.00%
```

That didn't work! This is because the padding needs to be the *total width of the entire number, including the decimal place*. In this case, this number is 5
- 2 characters to the left of the decimal point
- 1 character for the decimal point
- and 2 characters for the decimal places

```python
n = list(range(0, 50, 9))
# [0, 9, 18, 27, 36, 45]

for i in n:
    print(f'{i:05.02f}%')

# 00.00%
# 09.00%
# 18.00%
# 27.00%
# 36.00%
# 45.00%
```

## Decimal formatting

### Separators

You can use a separator like a comma to separate thousands etc, which is a nice way to split up large numbers for readability.

```python
n = list(range(10**8, 10**11, 10**10*2))
#  [100000000, 20100000000, 40100000000, 60100000000, 80100000000]

for i in n:
    print(f'{i:,d}')

# 100,000,000
# 20,100,000,000
# 40,100,000,000
# 60,100,000,000
# 80,100,000,000
```

You can right-align the numbers when using a separator, provided that you know the desired width

```python
for i in n:
    print(f'{i:14,d}')

    10,000,000
10,010,000,000
20,010,000,000
30,010,000,000
40,010,000,000
50,010,000,000
60,010,000,000
70,010,000,000
80,010,000,000
90,010,000,000
```