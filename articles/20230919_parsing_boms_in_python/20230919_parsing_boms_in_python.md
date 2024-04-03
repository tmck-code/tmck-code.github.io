# 20230919 Parsing BOMs in Python

- [Introduction](#introduction)
- [Show the BOM](#show-the-bom)
- [Create a UTF8 file](#create-a-utf8-file)
  - [Reading the file in Python](#reading-the-file-in-python)
- [UTF-16](#utf-16)
  - [The codecs package](#the-codecs-package)
  - [BOM detection](#bom-detection)
  - [Demo](#demo)

## Introduction

The "byte-order mark" or [BOM](https://en.wikipedia.org/wiki/Byte_order_mark) is a special char that appears at the very beginning of UTF8 and UTF16 files.   
This marker is there to be our friend, however many languages and libraries don't generally deal with this marker by default, and python is no exception

You'll usually encounter these files if you work with data that came from Windows programs, otherwise it's usually rare to see.

## Show the BOM

The UTF-8 BOM character is: `U+FEFF`

In linux, it's possible to easily create a test file so that you can play around.

I like to use `cat -A` to check for non-printing characters, you can pipe anything to cat by using the `-` character, e.g.

```shell
☯ ~ echo -e '\xEF\xBB\xBF' | cat -A -
M-oM-;M-?$

☯ ~ printf '\ufeff\n' | cat -A -
M-oM-;M-?$
```

## Create a UTF8 file

To create a UTF8 file, use the BOM character from above and add some extra text, and save it to a file.

```shell
☯ ~ printf '\ufeffhello world\n' > test.csv

# check the file using the `file` command
 ☯ ~ file test.csv
test.csv: Unicode text, UTF-8 (with BOM) text, with no line terminators

# check the file using cat -A
 ☯ ~ cat -A test.csv
M-oM-;M-?hello world
```

### Reading the file in Python

When opening files, python will not remove the BOM character.

```python
with open('test.csv') as istream:
    s = istream.read()

s
# '\ufeffhello world'
```

However, this can be easily fixed by using the `utf-8-sig` encoding!   
The following info is buried within the [python codec documentation](https://docs.python.org/3/library/codecs.html):

> On encoding the utf-8-sig codec will write 0xef, 0xbb, 0xbf as the first three bytes to the file. On decoding utf-8-sig will skip those three bytes if they appear as the first three bytes in the file. In UTF-8, the use of the BOM is discouraged and should generally be avoided.


```python
with open('test.csv', encoding='utf-8-sig') as istream:
    s = istream.read()

s
# 'hello world'
```

Now, you can see that the BOM character has been removed automatically! The same thing can be done with writing - automatically adding the BOM character by using the `utf-8-sig` encoding.

```python
with open('test.csv', 'w', encoding='utf-8-sig') as ostream:
    print('hello world', file=ostream)
```

## UTF-16

For UTF-16 files, the BOM character comes in 2 flavors, big-endian and little-endian. Python doesn't offer a handy encoding for these, so you'll have to do it manually.

- UTF-16 BE: `U+FEFF`
- UTF-16 LE: `U+FFFE`

To help out - let's write a file with a BOM16 character and some text.

```python
with open('test16.csv', 'wb') as ostream:
    ostream.write(codecs.BOM_UTF16)
    ostream.write(b'hello world\n')
```

```shell
☯ ~ file test16.csv
test16.csv: Unicode text, UTF-16, little-endian text, with no line terminators

☯ ~ cat -A test16.csv
M-^?M-~hello world$
```

### The codecs package

The standard library has a `codecs` package that contains a few handy constants for the BOM characters.

```python
import codecs

codecs.BOM_UTF16_LE
# b'\xff\xfe'
codecs.BOM_UTF16_BE
# b'\xfe\xff'
```

### BOM detection

Using these constants, we can make a function that will detect a BOM character at the start of a file, and return the correct encoding.

```python
import codecs

CODECS = {
    "utf-8-sig": [codecs.BOM_UTF8],
    "utf-16": [
        codecs.BOM_UTF16,
        codecs.BOM_UTF16_BE,
        codecs.BOM_UTF16_LE,
    ]
}

def detect_encoding(fpath: str) -> str:
    # open the file in bytes mode
    with open(fpath, 'rb') as istream:
        # read the first 3 bytes (the UTF-8 BOM is 3 chars, the UTF-16 BOM is 2)
        data = istream.read(3)
        # iterate over the codecs and return the encoding if the BOM is found
        for encoding, boms in CODECS.items():
            if any(data.startswith(bom) for bom in boms):
                return encoding
    return 'utf-8'

detect_encoding('test.csv')
# 'utf-8-sig'
detect_encoding('test16.csv')
# 'utf-16'
```

### Demo

Finally, you could use this encoding detection inline when reading a file! For this test, I used a UTF16 file that I found in this repo: https://github.com/stain/encoding-test-files

```python

with open(fpath, 'r', encoding=detect_encoding(fpath)) as istream:
    s = istream.read()

s
# 'première is first\npremière is slightly different\nКириллица is Cyrillic\n𐐀 am Deseret\n'
```
