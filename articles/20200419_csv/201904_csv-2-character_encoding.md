# Parsing Dirty CSVs #2: Character encoding

> I'm going to graze the surface here as this is a meaty topic.
> This should serve as a basic summary of the problems around character encoding.

Character encodings are easy to deal with if the entire file is in the same encoding. There are many tools that you can use to convert (e.g. the GNU tool `iconv`), and file `open`/`read` methods in all languages cater for it.

It's a sticky situation, however, if you're faced with multiple encodings in the same file, or if you have to process a file with an unknown encoding.

The only two things you need to know when converting is what the encoding is **of the original data** and what you want to **convert it to**. The most common example of this would be `ISO-8859-1` (the Western-European character set) -> `UTF-8`.

> I love UTF-8 because it encompasses all characters from all sets, so once
> you're there there's no need to ever worry about the encoding again.

---

There are two main issues when parsing data with unexpected encodings:

1. The parser expects characters from a certain set, and if it finds one that is unexpected, throws an error and halts execution.
2. The parser guesses or is informed of the original encoding, and applies transformations to the characters, resulting in potentially incorrect results.

## Some caveats

I will readily admit that I don't process a lot of data with Eastern characters, if this is your situation then feel free to use `UTF-16` or whatever encoding suits you best. The key points of this post will still apply regardless.

I will also admit that I am no expert on this subject matter, and that the subject itself is quite large and complicated. If you require more information, I wish you luck, and recommend that you find an in-depth resource that goes into more detail, as I'm just skimming the surface here.

## Glossary

* byte string - All strings are "byte" strings at their core, sequences of bits (`1`s and `0`s) assembled together to form letters.
* unicode string - An abstract representation of a characters from any language.
* ascii characters - A single byte can hold 256 different values, and ASCII is the original set of 256.
* unicode character - A character represented by _*multiple*_ bytes, containing thousands of characters from many different languages.
* encoding - translate pure bytes to a character object.
* decoding - translating a character into pure bytes.

Due to the binary -> character -> binary conversions that occur, it's essential to know what encoding was used in order to be able to parse text correctly.

---

## Detecting encoding

Let's explore what happens when a character in an unexpected encoding appears.

### Detecting - ruby

Ruby has its own encoding detectors that you are free to try out, but I've found that the best tool on offer is the rchardet library: <https://github.com/jmhodges/rchardet>

Let's test it out with a string that contains special characters, we're going to use `ångström` (a teeny-tiny unit of length).

> This example is only in Ruby, but you can rest assured that every other language will have the same problems shown here.

```ruby
2.5.0 :007 > require 'rchardet'
=> false
2.5.0 :008 > s = 'ångström'
=> "ångström"
2.5.0 :009 > c['encoding']
=> "TIS-620"
2.5.0 :010 > s.encode('UTF-8', c['encoding'])
=> "รฅngstrรถm"
2.5.0 :011 > s.encode('UTF-8', 'UTF-8')
=> "ångström"
```

Oof, what happened there!?

Character encoding detectors are _context-dependent_, and attempt to guess the encoding based on information that it knows about various languages.

Obviously, here, the assumption that it made was incorrect.

> For this reason, if your parser encounters a string that is not in UTF-8
> encoding, throw it away. There is no guarantee that your library of choice
> will detect and convert it correctly, try to get the raw data exported in
> UTF-8 instead.

---

## Converting non-UTF8

No dynamic detection this time, let's examine what happens when we try to decode a string containing invalid UTF-8 characters in Python.
This simulates the case where you assume that a file is in UTF-8 (or another encoding), but the file actually contains exceptions to this rule which means that the encoding operation will either be incorrect, or fail.

We're going to:

1. Create a unicode string
2. Encode it into a byte string using ISO-8859-1
3. Attempt to then use it as a UTF-8 string

### Converting - python

```python
In [1]: 'æb'.encode('ISO-8859-1').decode('UTF-8')

UnicodeDecodeError: 'utf-8' codec can't decode byte 0xe6 in position 0: invalid continuation byte
```

### Converting - ruby

In ruby, you'll have to call a string operation like `split` on the object before the interpreter freaks out.

```ruby
2.5.5 :027 > 'æb'.encode('ISO-8859-1').force_encoding('UTF-8').split
Traceback (most recent call last):
        3: from /Users/freman/.rvm/rubies/ruby-2.5.5/bin/irb:11:in `<main>'
        2: from (irb):27
        1: from (irb):27:in `split'
ArgumentError (invalid byte sequence in UTF-8)
```

---

## How to parse files without halting

Knowing these two main problems, we can construct a set of general guidelines for parsing unknown files.
For each language, I've included the approach listed here, as well as a regular read command for comparison. You should see the correct **ångström** printed as the first line of output, followed by the usual error encountered when reading using the default `UTF-8` encoding.

1. Open the file in `bytes` mode, i.e. don't set an encoding expectation when you read the lines.
2. Read the lines one-by-one, and attempt to **decode** the bytes into a usable string using your specific encoding (`ISO8859-1`/`UTF-8`/`UTF-16` etc.)
3. If it fails, then you can explicitly catch this and continue to read the file. The particular errors that you will have to catch will vary, depending on the language that you use.

### Parsing - ruby

_Notice the `rb` denoting "read bytes" mode._

```ruby
#!/usr/bin/env ruby

foreign_bytes = 'ångström'.encode('ISO-8859-1')

File.open('ruby_test.csv', 'w') do |ostream|
  ostream.puts(foreign_bytes)
end

# This will succeed
File.open('ruby_test.csv', 'rb') do |istream|
  istream.each do |line|
    p line.encode('UTF-8', 'ISO-8859-1').split
  end
end

# This will fail
File.open('ruby_test.csv', 'r') do |istream|
  istream.each do |line|
    p line.split
  end
end
```

```
$ ruby encoding.rb

"ångström\n"
Traceback (most recent call last):
        5: from encoding.rb:17:in `<main>'
        4: from encoding.rb:17:in `open'
        3: from encoding.rb:18:in `block in <main>'
        2: from encoding.rb:18:in `each'
        1: from encoding.rb:19:in `block (2 levels) in <main>'
encoding.rb:19:in `split': invalid byte sequence in UTF-8 (ArgumentError)
```

### Parsing - python

```python
#!/usr/bin/env python3

foreign_bytes = 'ångström'.encode('ISO-8859-1')

with open('python_test.csv', 'wb') as ostream:
    ostream.write(foreign_bytes)

# This will succeed
with open('python_test.csv', 'rb') as istream:
    for line in istream:
        print(line.decode('ISO-8859-1'))

# This will fail
with open('python_test.csv', 'r') as istream:
    for line in istream:
        print(line)
```

```
$ python3 encoding.py

ångström
Traceback (most recent call last):
  File "encoding.py", line 15, in <module>
    for line in istream:
  File "/Library/Frameworks/Python.framework/Versions/3.7/lib/python3.7/codecs.py", line 322, in decode
    (result, consumed) = self._buffer_decode(data, self.errors, final)
UnicodeDecodeError: 'utf-8' codec can't decode byte 0xe5 in position 0: invalid continuation byte
```

---

## Summary

The most important takeaway from this all is that you should always read files in binary mode in whatever language you use, and then attempt to decode each individually.

> Using a simple try/except pattern in your choice will allow you to choose what to do with potentially corrupt or incorrect data, while allowing your parser to continue reading the file.

This doesn't solve how to actually parse a CSV line using this technique, as so far, we've just managed to decode the line into a useable form, and we've covered the basics of CSV parsing in part #1.

Next, we'll tie it all together! Stay tuned for the next installment.