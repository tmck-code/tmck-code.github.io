# Parsing Dirty CSVs #2: Writing

So far our journey has been pretty grim, with pitfalls in every direction. This journey does not have to have a bleak end however; you can ensure that you write every internal or exported CSV in such a way that ensures incredible benefits for both speed _and_ reliability.

---

## Another specification

These rules are based around two aims. With our new CSV format, after our file has been written, we should be able to

* Parse the document as **_easily_** as possible
* Parse the document as **_quickly_** as possible

### The rules

1. Everything must be UTF-8.
2. The header line is mandatory.
    * Every field name in the header should be as long and as humanly-readable as possible.
3. All records end with a newline `\n`.
4. All fields are separated by an appropriate character (e.g. the pipe character `|`).
    * If a delimiter (e.g. `|`) appears naturally in text, it should be handled:
        * translated to another character (best)
        * escaped (good)
        * the entire field should be wrapped in double quotes (last resort)

> Note: The "long and humanly-readable" rule may seem unnecessary, but the
> header only appears once per file, and it's the one chance to give meaningful
> labels to the data. If you ever come across a dataset you need to make sense
> of containing labels like "w" or "DKPRST22", it can make your job that little
> bit more difficult.

The good news here is that this system very closely matches the existing CSV standard, however it differs in two key areas:

1. Better delimiters (e.g. `|`) are recommended. This standard does not insist on one particular delimiter being used.
2. Flat lines i.e. No newlines inside fields == No quoted fields. This means easier and faster parsing overall.

---

#### One Delimiter to Rule Them All

You may cry out "this still isn't good enough!". Never fear, I have one more trick to show you.

The main problem with CSVs is the **C**, the commas that are used as a delimiter are extremely common in all kinds of text. The pipe delimiter helps us out by ensuring that we can write safely in _most_ circumstances, however field quoting is still occasionally needed.

_This problem has already been solved thanks to ASCII! It's worth bearing in mind that this was published in **1963**._

This is the ASCII Record Separator:

| integer code | hex code | cat -A |
|--------------|--------- |--------|
|      30      |    1E    |   ^^   |

This is what it looks like when manipulated in Python. The easiest way of defining this character is probably to use the integer value `30` with `chr(30)` to get the char.

```python
In [1]: f'a{chr(30)}b'
Out[1]: 'a\x1eb'
```

---

### Code!

If a theory falls in the woods without an implementation, does it exist? Probably not in any sort of useful fashion

```python
DELIMITER = chr(30)
with open('output.csv', 'w') as ostream:
    ostream.write(DELIMITER.join(header) + '\n')
    for row in data:
        ostream.write(DELIMITER.join(row) + '\n')

with open('output.csv', 'r') as istream:
    for line in istream:
        print(line.strip().split(DELIMITER))

>>>
['Full Name', 'Left or Right handed', 'Age', 'Gender', 'Date of Birth']
['Dustin Lewis', 'l', '45', 'M', '02-04-1995']
['Anthony Mason', '^', '64', 'M', '19-12-1974']
['ångström', 'c', '73', 'F', '03-01-2013']
['Kimberly Romero', 'D', '33', 'M', '22-07-1989']
```

---

### Speed tests

#### Writing

```python
import csv
import faker

FIELDS = [
    'uuid4', 'name', 'job', 'safe_email', 'date_time', 'city',
    'ipv4_private', 'military_ship', 'file_path'
]

def generate_data(n_rows=10_000):
    factory = faker.Factory.create('en')
    factory.seed(100)
    for _ in range(0, n_rows):
        data.append([str(getattr(factory, f)()) for f in FIELDS])

def write_psv(fpath, data):
    # Write pipe-delimited file
    with open(fpath, 'w') as ostream:
        for row in data:
            ostream.write('|'.join(row) + '\n')

def write_csv(fpath, data):
    # Write regular csv
    with open(fpath, 'w') as ostream:
        writer = csv.writer(ostream, quoting=csv.QUOTE_ALL)
        for row in data:
            writer.writerow(row)
```

|   method    |     result       |
|-------------|------------------|
| `write_csv` | 43.6 ms ± 527 µs |
| `write_psv` | 9.65 ms ± 116 µs |

#### Reading

That's a difference of 7x faster now! This gap only continues to widen with larger data.

* No worrying about non utf-8 characters
* No worrying about quoted fields or fields with newlines
* String split is _much_ faster than any CSV parser, and this holds true for every language I've tried.

---

## Conclusion

Compared to the challenge of _reading_ unknown or dirty CSVs, writing is a walk in the park! A good understanding of the data that you work with, and a well-defined format, mean that you eliminate many of the problems with the original format.

Next post (the final in this series!), we will discuss how to piece together the strategies we've covered so far. 
